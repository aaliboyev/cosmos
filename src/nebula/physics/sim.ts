/* Collapse of a rotating, turbulent 1 M☉ core into a protostar and disk.
   Gas: SPH with a barotropic equation of state (isothermal when cold, adiabatic
   once opaque) and Monaghan artificial viscosity, the only dissipation. Gravity:
   Barnes-Hut octree with quadrupoles, Plummer-softened. Stars: sink particles
   that form where gas is dense, converging and at a potential minimum, then
   accrete bound gas, conserving mass, momentum and angular momentum (orbital +
   spin). Leapfrog kick-drift-kick on power-of-two block timesteps: only
   particles whose step ends are recomputed, so the dense core's short steps
   don't stall the envelope. A neighbour more than 4× slower is woken early
   (Saitoh & Makino 2009) so infalling gas can't overshoot a shock. Sinks are
   few and kicked every substep, keeping their exchange with the gas symmetric. */
import { kernelDW, kernelW } from './kernel';
import { createOctree } from './octree';
import { EPS_GAS, EPS_SINK, RHO0, RHO_SINK, R_ACC, compressionEnergy, gammaAt, pOverRho } from './units';

export interface CloudParams {
  n: number;
  /** Rotational energy / |gravitational energy| (β). */
  rotation: number;
  /** Turbulent kinetic energy / |gravitational energy|. */
  turbulence: number;
  seed: number;
}

export interface Sink {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  ax: number; ay: number; az: number;
  m: number;
  lx: number; ly: number; lz: number;    // spin angular momentum of what it swallowed
  mdot: number;                           // smoothed accretion rate
  gained: number;                         // mass accreted since the last rate update
}

export interface CloudStats {
  w: number;
  t: number;
  steps: number;
  gas: number;
  sinks: number;
  starFraction: number;
  mdot: number;
  maxRho: number;
  flatness: number;
  diskRadius: number;
  diskMass: number;
  energyDrift: number;
  angMomDrift: number;
  momentum: number;
  virial: number;
  activeFraction: number;
}

const NGB = 32;
const THETA = 0.7;
const CFL = 0.35;
const ALPHA_VISC = 1, BETA_VISC = 2;
const DT_MAX = 0.008;
const MAX_LEVEL = 24;
const TICK = DT_MAX / 2 ** MAX_LEVEL;
const MAX_SINKS = 16;
const stepTicks = (lvl: number) => 2 ** (MAX_LEVEL - lvl);

/** Deterministic PRNG so a seed reproduces a cloud. */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = a + 0x6d2b79f5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function createCloud(params: CloudParams) {
  const N = params.n;
  const x = new Float64Array(N), y = new Float64Array(N), z = new Float64Array(N);
  const vx = new Float64Array(N), vy = new Float64Array(N), vz = new Float64Array(N);     // half-step velocities
  const px_ = new Float64Array(N), py_ = new Float64Array(N), pz_ = new Float64Array(N);  // predicted at `now`
  const ax = new Float64Array(N), ay = new Float64Array(N), az = new Float64Array(N);
  const m = new Float64Array(N), h = new Float64Array(N), rho = new Float64Array(N);
  const pr = new Float64Array(N), cs = new Float64Array(N), phi = new Float64Array(N);
  const vsig = new Float64Array(N), viscRate = new Float64Array(N);
  const lvl = new Int8Array(N), t0 = new Float64Array(N);
  const alive = new Uint8Array(N), active = new Uint8Array(N);
  const ids = new Int32Array(N), act = new Int32Array(N);
  let nAlive = 0, nAct = 0;
  const nbS = new Int32Array(N), nbE = new Int32Array(N);
  let nbList = new Int32Array(N * 48);
  let nbFill = 0;
  const qIdx = new Int32Array(N), qR2 = new Float64Array(N);
  const tree = createOctree(N);
  const sinks: Sink[] = [];
  const g4 = new Float64Array(4);

  let now = 0, steps = 0;
  let energyLost = 0, energy0 = 0, wScale = 1;
  let lx0 = 0, ly0 = 0, lz0 = 0, lScale = 1;
  let actSum = 0, actCount = 0;

  // ---------- initial conditions
  function seed() {
    const rnd = mulberry32(params.seed);
    for (let i = 0; i < N; i++) {
      let qx, qy, qz;
      do { qx = rnd() * 2 - 1; qy = rnd() * 2 - 1; qz = rnd() * 2 - 1; } while (qx * qx + qy * qy + qz * qz > 1);
      x[i] = qx; y[i] = qy; z[i] = qz;
      m[i] = 1 / N; alive[i] = 1;
      h[i] = 0.5 * Math.cbrt(NGB / N);
      vx[i] = vy[i] = vz[i] = 0;
    }
    // turbulence: random solenoidal Fourier modes, P(k) ∝ k⁻⁴ (Larson-like)
    for (let k = 0; k < 64; k++) {
      const kmag = Math.PI * (1 + rnd() * 7);
      let kx = rnd() * 2 - 1, ky = rnd() * 2 - 1, kz = rnd() * 2 - 1;
      const kl = Math.hypot(kx, ky, kz) || 1; kx *= kmag / kl; ky *= kmag / kl; kz *= kmag / kl;
      let ex = rnd() * 2 - 1, ey = rnd() * 2 - 1, ez = rnd() * 2 - 1;
      // amplitude ⟂ k keeps the mode divergence-free
      const d = (ex * kx + ey * ky + ez * kz) / (kmag * kmag);
      ex -= d * kx; ey -= d * ky; ez -= d * kz;
      const amp = Math.pow(kmag, -2) / (Math.hypot(ex, ey, ez) || 1);
      const ph = rnd() * 2 * Math.PI;
      for (let i = 0; i < N; i++) {
        const c = Math.cos(kx * x[i] + ky * y[i] + kz * z[i] + ph) * amp;
        vx[i] += ex * c; vy[i] += ey * c; vz[i] += ez * c;
      }
    }
    const W = 0.6;   // |W| of a uniform unit sphere, G = M = R = 1
    removeMean();
    let k = 0;
    for (let i = 0; i < N; i++) k += 0.5 * m[i] * (vx[i] ** 2 + vy[i] ** 2 + vz[i] ** 2);
    const s = k > 0 ? Math.sqrt(params.turbulence * W / k) : 0;
    for (let i = 0; i < N; i++) { vx[i] *= s; vy[i] *= s; vz[i] *= s; }
    // solid-body spin about +y: E_rot = Ω² I / 2, I = 0.4 M R²
    const omega = Math.sqrt(2 * params.rotation * W / 0.4);
    for (let i = 0; i < N; i++) { vx[i] += omega * z[i]; vz[i] -= omega * x[i]; }
    removeMean();

    sinks.length = 0;
    now = 0; steps = 0; energyLost = 0; actSum = 0; actCount = 0;
    collectAlive();
    nAct = 0;
    for (let a = 0; a < nAlive; a++) {
      const i = ids[a];
      active[i] = 1; act[nAct++] = i; t0[i] = 0;
      px_[i] = vx[i]; py_[i] = vy[i]; pz_[i] = vz[i];
    }
    // two density passes settle h from the uniform guess before the first forces
    buildTree();
    for (let a = 0; a < nAct; a++) density(act[a]);
    buildTree();
    forces();
    for (let a = 0; a < nAct; a++) {
      const i = act[a];
      lvl[i] = fitLevel(criterion(i));
      const hd = stepTicks(lvl[i]) * TICK / 2;
      vx[i] += ax[i] * hd; vy[i] += ay[i] * hd; vz[i] += az[i] * hd;
      active[i] = 0;
    }
    const e = energies();
    energy0 = e.total; wScale = Math.abs(e.w) || 1;
    const L = angularMomentum();
    lx0 = L[0]; ly0 = L[1]; lz0 = L[2];
    lScale = Math.max(Math.hypot(L[0], L[1], L[2]), 1e-3 * Math.sqrt(W));
  }

  function removeMean() {
    let qx = 0, qy = 0, qz = 0, cxm = 0, cym = 0, czm = 0, mt = 0;
    for (let i = 0; i < N; i++) {
      qx += m[i] * vx[i]; qy += m[i] * vy[i]; qz += m[i] * vz[i];
      cxm += m[i] * x[i]; cym += m[i] * y[i]; czm += m[i] * z[i]; mt += m[i];
    }
    for (let i = 0; i < N; i++) {
      vx[i] -= qx / mt; vy[i] -= qy / mt; vz[i] -= qz / mt;
      x[i] -= cxm / mt; y[i] -= cym / mt; z[i] -= czm / mt;
    }
  }

  function collectAlive() {
    nAlive = 0;
    for (let i = 0; i < N; i++) if (alive[i]) ids[nAlive++] = i;
  }

  function buildTree() { tree.build(x, y, z, m, ids, nAlive, h); }

  // ---------- forces on the active set
  function density(i: number) {
    let hi = h[i], n = 0;
    for (let it = 0; it < 5; it++) {
      n = tree.neighbours(x[i], y[i], z[i], 2 * hi, qIdx, qR2);
      if ((n >= NGB * 0.8 && n <= NGB * 1.25) || it === 4) break;
      hi *= Math.min(1.4, Math.max(0.7, Math.cbrt(NGB / Math.max(n, 1))));
    }
    h[i] = hi;
    let r = 0;
    for (let c = 0; c < n; c++) r += m[qIdx[c]] * kernelW(Math.sqrt(qR2[c]), hi);
    rho[i] = r;
    const po = pOverRho(r);
    pr[i] = po / r;
    cs[i] = Math.sqrt(gammaAt(r) * po);
  }

  /** Pressure + viscosity from gather (h_i) and scatter (h_j) neighbours; records the list for the
      limiter and sink checks. Returns the kinetic-energy loss rate booked on this particle. */
  function hydro(i: number): number {
    const n = tree.neighboursSym(x[i], y[i], z[i], h[i], qIdx, qR2);
    if (nbFill + n > nbList.length) { const g = new Int32Array((nbFill + n) * 2); g.set(nbList); nbList = g; }
    nbS[i] = nbFill;
    const hi = h[i], pi = pr[i];
    let fx = 0, fy = 0, fz = 0, sig = cs[i], loss = 0;
    for (let c = 0; c < n; c++) {
      const j = qIdx[c];
      if (j === i) continue;
      nbList[nbFill++] = j;
      const r2 = qR2[c];
      if (r2 === 0) continue;
      const r = Math.sqrt(r2);
      const dwi = kernelDW(r, hi), dwj = kernelDW(r, h[j]);
      const rx = x[i] - x[j], ry = y[i] - y[j], rz = z[i] - z[j];
      const vr = (px_[i] - px_[j]) * rx + (py_[i] - py_[j]) * ry + (pz_[i] - pz_[j]) * rz;
      let visc = 0;
      if (vr < 0) {
        const hij = 0.5 * (hi + h[j]);
        const mu = hij * vr / (r2 + 0.01 * hij * hij);
        visc = (-ALPHA_VISC * 0.5 * (cs[i] + cs[j]) * mu + BETA_VISC * mu * mu) / (0.5 * (rho[i] + rho[j]));
        const sg = cs[i] + cs[j] - 3 * vr / r;
        if (sg > sig) sig = sg;
        // half of the pair's kinetic-energy loss is booked on each side
        loss -= 0.5 * m[i] * m[j] * visc * 0.5 * (dwi + dwj) / r * vr;
      }
      const k = (pi * dwi + pr[j] * dwj + visc * 0.5 * (dwi + dwj)) / r * m[j];
      fx -= k * rx; fy -= k * ry; fz -= k * rz;
    }
    nbE[i] = nbFill;
    ax[i] = fx; ay[i] = fy; az[i] = fz;
    vsig[i] = sig;
    return loss;
  }

  function sinkPull(i: number) {
    const es2 = EPS_SINK * EPS_SINK;
    for (const s of sinks) {
      const dx = x[i] - s.x, dy = y[i] - s.y, dz = z[i] - s.z;
      const d2 = dx * dx + dy * dy + dz * dz + es2, inv = 1 / Math.sqrt(d2), f = s.m * inv * inv * inv;
      ax[i] -= f * dx; ay[i] -= f * dy; az[i] -= f * dz; phi[i] -= s.m * inv;
    }
  }

  function forces() {
    nbFill = 0;
    for (let a = 0; a < nAct; a++) density(act[a]);
    for (let a = 0; a < nAct; a++) viscRate[act[a]] = hydro(act[a]);
    const eps2 = EPS_GAS * EPS_GAS;
    if (nAct > 0.3 * nAlive) {
      for (let a = 0; a < nAct; a++) phi[act[a]] = 0;
      const G = tree.groups();
      for (let l = 0; l < G.n; l++) tree.gravityGroup(l, THETA, eps2, ax, ay, az, phi, active);
    } else {
      for (let a = 0; a < nAct; a++) {
        const i = act[a];
        tree.gravity(x[i], y[i], z[i], i, THETA, eps2, g4);
        ax[i] += g4[0]; ay[i] += g4[1]; az[i] += g4[2]; phi[i] = g4[3];
      }
    }
    for (let a = 0; a < nAct; a++) sinkPull(act[a]);
  }

  function sinkForces(s: Sink) {
    const es2 = EPS_SINK * EPS_SINK;
    let fx = 0, fy = 0, fz = 0;
    for (let a = 0; a < nAlive; a++) {
      const i = ids[a];
      const dx = x[i] - s.x, dy = y[i] - s.y, dz = z[i] - s.z;
      const d2 = dx * dx + dy * dy + dz * dz + es2, inv = 1 / Math.sqrt(d2), f = m[i] * inv * inv * inv;
      fx += f * dx; fy += f * dy; fz += f * dz;
    }
    for (const o of sinks) {
      if (o === s) continue;
      const dx = o.x - s.x, dy = o.y - s.y, dz = o.z - s.z;
      const d2 = dx * dx + dy * dy + dz * dz + es2, inv = 1 / Math.sqrt(d2), f = o.m * inv * inv * inv;
      fx += f * dx; fy += f * dy; fz += f * dz;
    }
    s.ax = fx; s.ay = fy; s.az = fz;
  }

  // ---------- time levels
  function criterion(i: number): number {
    let d = CFL * h[i] / vsig[i];
    const acc = Math.hypot(ax[i], ay[i], az[i]);
    if (acc > 0) d = Math.min(d, 0.25 * Math.sqrt(Math.min(h[i], EPS_GAS) / acc));
    return d;
  }
  const fitLevel = (dt: number) => Math.max(0, Math.min(MAX_LEVEL, Math.ceil(Math.log2(DT_MAX / dt))));
  /** Level whose step fits `dt`; a longer step only one level at a time and when `at` is aligned to it. */
  function levelFor(dt: number, cur: number, at: number): number {
    let want = fitLevel(dt);
    if (want < cur) {
      want = cur - 1;
      if (at % stepTicks(want) !== 0) want = cur;
    }
    return want;
  }

  // ---------- sinks
  function absorb(s: Sink, i: number) {
    const mi = m[i], mt = s.m + mi;
    const [svx, svy, svz] = sinkVel(s);
    const dx = x[i] - s.x, dy = y[i] - s.y, dz = z[i] - s.z;
    const dvx = px_[i] - svx, dvy = py_[i] - svy, dvz = pz_[i] - svz;
    const mu = s.m * mi / mt;
    // relative orbital angular momentum becomes the sink's spin
    s.lx += mu * (dy * dvz - dz * dvy); s.ly += mu * (dz * dvx - dx * dvz); s.lz += mu * (dx * dvy - dy * dvx);
    // energy leaving the resolved system: relative KE + compression energy − pair binding
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz + EPS_SINK * EPS_SINK);
    energyLost += 0.5 * mu * (dvx * dvx + dvy * dvy + dvz * dvz) + mi * compressionEnergy(rho[i]) - s.m * mi / r;
    s.x = (s.x * s.m + x[i] * mi) / mt; s.y = (s.y * s.m + y[i] * mi) / mt; s.z = (s.z * s.m + z[i] * mi) / mt;
    s.vx = (svx * s.m + px_[i] * mi) / mt; s.vy = (svy * s.m + py_[i] * mi) / mt; s.vz = (svz * s.m + pz_[i] * mi) / mt;
    s.m = mt; s.gained += mi;
    alive[i] = 0; active[i] = 0;
  }

  function accrete() {
    if (!sinks.length) return;
    const r2acc = R_ACC * R_ACC;
    for (let a = 0; a < nAlive; a++) {
      const i = ids[a];
      let best: Sink | null = null, bestD = r2acc;
      for (const s of sinks) {
        const dx = x[i] - s.x, dy = y[i] - s.y, dz = z[i] - s.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < bestD) { bestD = d2; best = s; }
      }
      if (!best) continue;
      const [svx, svy, svz] = sinkVel(best);
      const dvx = px_[i] - svx, dvy = py_[i] - svy, dvz = pz_[i] - svz;
      if (0.5 * (dvx * dvx + dvy * dvy + dvz * dvz) < best.m / Math.sqrt(bestD + EPS_SINK * EPS_SINK)) absorb(best, i);
    }
    // sinks closer than the accretion radius merge
    for (let p = 0; p < sinks.length; p++) for (let q = sinks.length - 1; q > p; q--) {
      const s = sinks[p], o = sinks[q];
      const dx = o.x - s.x, dy = o.y - s.y, dz = o.z - s.z;
      if (dx * dx + dy * dy + dz * dz > r2acc) continue;
      const vs = sinkVel(s), vo = sinkVel(o);
      const mt = s.m + o.m, mu = s.m * o.m / mt;
      const dvx = vo[0] - vs[0], dvy = vo[1] - vs[1], dvz = vo[2] - vs[2];
      s.lx += o.lx + mu * (dy * dvz - dz * dvy); s.ly += o.ly + mu * (dz * dvx - dx * dvz); s.lz += o.lz + mu * (dx * dvy - dy * dvx);
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz + EPS_SINK * EPS_SINK);
      energyLost += 0.5 * mu * (dvx * dvx + dvy * dvy + dvz * dvz) - s.m * o.m / r;
      s.x = (s.x * s.m + o.x * o.m) / mt; s.y = (s.y * s.m + o.y * o.m) / mt; s.z = (s.z * s.m + o.z * o.m) / mt;
      s.vx = (vs[0] * s.m + vo[0] * o.m) / mt; s.vy = (vs[1] * s.m + vo[1] * o.m) / mt; s.vz = (vs[2] * s.m + vo[2] * o.m) / mt;
      s.m = mt; s.gained += o.gained; s.mdot += o.mdot;
      sinks.splice(q, 1);
    }
  }

  /** New sinks where active gas is past the threshold, converging and at a local potential minimum. */
  function formSinks() {
    if (sinks.length >= MAX_SINKS) return;
    const dense: number[] = [];
    for (let a = 0; a < nAct; a++) { const i = act[a]; if (alive[i] && rho[i] > RHO_SINK) dense.push(i); }
    if (!dense.length) return;
    dense.sort((p, q) => rho[q] - rho[p]);
    for (const i of dense) {
      if (!alive[i]) continue;
      let near = false;
      for (const s of sinks) {
        const dx = x[i] - s.x, dy = y[i] - s.y, dz = z[i] - s.z;
        if (dx * dx + dy * dy + dz * dz < 4 * R_ACC * R_ACC) { near = true; break; }
      }
      if (near) continue;
      let minPhi = true, div = 0;
      for (let k = nbS[i], e = nbE[i]; k < e; k++) {
        const j = nbList[k];
        if (!alive[j]) continue;
        if (phi[j] < phi[i]) { minPhi = false; break; }
        div += (px_[j] - px_[i]) * (x[j] - x[i]) + (py_[j] - py_[i]) * (y[j] - y[i]) + (pz_[j] - pz_[i]) * (z[j] - z[i]);
      }
      if (!minPhi || div >= 0) continue;
      // the seed particle becomes the sink at the start of a fresh step
      const s: Sink = { x: x[i], y: y[i], z: z[i], vx: px_[i], vy: py_[i], vz: pz_[i], ax: 0, ay: 0, az: 0,
        m: m[i], lx: 0, ly: 0, lz: 0, mdot: 0, gained: 0 };
      energyLost += m[i] * compressionEnergy(rho[i]);
      alive[i] = 0; active[i] = 0;
      for (let k = nbS[i], e = nbE[i]; k < e; k++) {
        const j = nbList[k];
        if (!alive[j]) continue;
        const dx = x[j] - s.x, dy = y[j] - s.y, dz = z[j] - s.z;
        if (dx * dx + dy * dy + dz * dz <= R_ACC * R_ACC) absorb(s, j);
      }
      s.gained = 0;
      sinks.push(s);
      collectAlive();
      sinkForces(s);
      if (sinks.length >= MAX_SINKS) return;
    }
  }

  // ---------- one block substep: advance to the next step boundary
  function step() {
    let next = Infinity;
    for (let a = 0; a < nAlive; a++) { const i = ids[a]; const e = t0[i] + stepTicks(lvl[i]); if (e < next) next = e; }
    if (!isFinite(next)) return;
    const dtime = (next - now) * TICK;
    for (let a = 0; a < nAlive; a++) { const i = ids[a]; x[i] += vx[i] * dtime; y[i] += vy[i] * dtime; z[i] += vz[i] * dtime; }
    for (const s of sinks) {
      s.vx += s.ax * dtime / 2; s.vy += s.ay * dtime / 2; s.vz += s.az * dtime / 2;
      s.x += s.vx * dtime; s.y += s.vy * dtime; s.z += s.vz * dtime;
    }
    now = next;

    // predicted velocities at `now`: v½ + a·(now − step midpoint)
    for (let a = 0; a < nAlive; a++) {
      const i = ids[a], k = (now - (t0[i] + stepTicks(lvl[i]) / 2)) * TICK;
      px_[i] = vx[i] + ax[i] * k; py_[i] = vy[i] + ay[i] * k; pz_[i] = vz[i] + az[i] * k;
    }

    nAct = 0;
    for (let a = 0; a < nAlive; a++) {
      const i = ids[a];
      if (t0[i] + stepTicks(lvl[i]) === now) { active[i] = 1; act[nAct++] = i; }
    }
    // wake neighbours more than 4× slower than an active particle
    const n0 = nAct;
    for (let a = 0; a < n0; a++) {
      const i = act[a];
      for (let k = nbS[i], e = nbE[i]; k < e; k++) {
        const j = nbList[k];
        if (!alive[j] || active[j] || lvl[j] >= lvl[i] - 2) continue;
        // cut j's step at `now`: take back the unused part of its opening kick
        const unused = (t0[j] + stepTicks(lvl[j]) - now) * TICK / 2;
        vx[j] -= ax[j] * unused; vy[j] -= ay[j] * unused; vz[j] -= az[j] * unused;
        active[j] = 1; act[nAct++] = j;
      }
    }

    accrete();
    let w = 0;
    for (let a = 0; a < nAct; a++) if (alive[act[a]]) act[w++] = act[a];
    nAct = w;
    collectAlive();
    buildTree();
    forces();

    for (let a = 0; a < nAct; a++) {
      const i = act[a];
      const elapsed = (now - t0[i]) * TICK;
      vx[i] += ax[i] * elapsed / 2; vy[i] += ay[i] * elapsed / 2; vz[i] += az[i] * elapsed / 2;
      energyLost -= viscRate[i] * elapsed;
      lvl[i] = levelFor(criterion(i), lvl[i], now);
      const ho = stepTicks(lvl[i]) * TICK / 2;
      vx[i] += ax[i] * ho; vy[i] += ay[i] * ho; vz[i] += az[i] * ho;
      t0[i] = now;
    }
    for (const s of sinks) {
      sinkForces(s);
      s.vx += s.ax * dtime / 2; s.vy += s.ay * dtime / 2; s.vz += s.az * dtime / 2;
      // accretion rate smoothed over ~0.01 time units
      s.mdot += (s.gained / Math.max(dtime, 1e-12) - s.mdot) * Math.min(1, dtime / 0.01);
      s.gained = 0;
    }
    formSinks();
    actSum += nAct / Math.max(nAlive, 1); actCount++;
    for (let a = 0; a < nAct; a++) active[act[a]] = 0;
    steps++;
  }

  /** Substeps until `ms` of wall time have passed (at least one). */
  function advance(ms: number) {
    const tEnd = performance.now() + ms;
    do step(); while (performance.now() < tEnd);
  }

  // ---------- diagnostics (a full gravity pass: a few times a second, not per step)
  const sinkVel = (s: Sink): [number, number, number] => [s.vx, s.vy, s.vz];

  function energies() {
    let k = 0, u = 0, w = 0;
    const eps2 = EPS_GAS * EPS_GAS, es2 = EPS_SINK * EPS_SINK;
    for (let a = 0; a < nAlive; a++) {
      const i = ids[a];
      k += 0.5 * m[i] * (px_[i] ** 2 + py_[i] ** 2 + pz_[i] ** 2);
      u += m[i] * compressionEnergy(rho[i]);
      tree.gravity(x[i], y[i], z[i], i, THETA, eps2, g4);
      w += 0.5 * m[i] * g4[3];
    }
    for (const s of sinks) {
      k += 0.5 * s.m * (s.vx ** 2 + s.vy ** 2 + s.vz ** 2);
      for (let a = 0; a < nAlive; a++) {
        const i = ids[a];
        w -= s.m * m[i] / Math.sqrt((x[i] - s.x) ** 2 + (y[i] - s.y) ** 2 + (z[i] - s.z) ** 2 + es2);
      }
    }
    for (let p = 0; p < sinks.length; p++) for (let q = p + 1; q < sinks.length; q++) {
      const s = sinks[p], o = sinks[q];
      w -= s.m * o.m / Math.sqrt((o.x - s.x) ** 2 + (o.y - s.y) ** 2 + (o.z - s.z) ** 2 + es2);
    }
    return { k, u, w, total: k + u + w };
  }

  function angularMomentum(): [number, number, number] {
    let lx = 0, ly = 0, lz = 0;
    for (let a = 0; a < nAlive; a++) {
      const i = ids[a];
      lx += m[i] * (y[i] * pz_[i] - z[i] * py_[i]);
      ly += m[i] * (z[i] * px_[i] - x[i] * pz_[i]);
      lz += m[i] * (x[i] * py_[i] - y[i] * px_[i]);
    }
    for (const s of sinks) {
      const [svx, svy, svz] = sinkVel(s);
      lx += s.m * (s.y * svz - s.z * svy) + s.lx;
      ly += s.m * (s.z * svx - s.x * svz) + s.ly;
      lz += s.m * (s.x * svy - s.y * svx) + s.lz;
    }
    return [lx, ly, lz];
  }

  function mainSink(): Sink | null {
    return sinks.reduce<Sink | null>((b, s) => (!b || s.m > b.m ? s : b), null);
  }

  function stats(): CloudStats {
    const e = energies();
    const L = angularMomentum();
    let qx = 0, qy = 0, qz = 0, mGas = 0, maxRho = 0;
    for (let a = 0; a < nAlive; a++) {
      const i = ids[a];
      qx += m[i] * px_[i]; qy += m[i] * py_[i]; qz += m[i] * pz_[i]; mGas += m[i];
      if (rho[i] > maxRho) maxRho = rho[i];
    }
    let mStar = 0, mdot = 0;
    for (const s of sinks) { const v = sinkVel(s); qx += s.m * v[0]; qy += s.m * v[1]; qz += s.m * v[2]; mStar += s.m; mdot += s.mdot; }

    // flattening about the angular-momentum axis, of the collapsed gas (or all of it early on)
    const ll = Math.hypot(L[0], L[1], L[2]) || 1;
    const nx = L[0] / ll, ny = L[1] / ll, nz = L[2] / ll;
    const main = mainSink();
    const ox = main ? main.x : 0, oy = main ? main.y : 0, oz = main ? main.z : 0;
    let h2 = 0, r2 = 0, cnt = 0;
    for (let pass = 0; pass < 2 && cnt < 200; pass++) {
      h2 = 0; r2 = 0; cnt = 0;
      for (let a = 0; a < nAlive; a++) {
        const i = ids[a];
        if (pass === 0 && rho[i] < 30 * RHO0) continue;
        const dx = x[i] - ox, dy = y[i] - oy, dz = z[i] - oz;
        const hz = dx * nx + dy * ny + dz * nz;
        h2 += hz * hz; r2 += dx * dx + dy * dy + dz * dz - hz * hz; cnt++;
      }
    }
    const flatness = cnt ? Math.sqrt(h2 / cnt) / Math.sqrt(r2 / (2 * cnt) || 1e-12) : 1;

    // disk: gas near the star's equator orbiting at ≥ 70% of the circular speed of the enclosed mass
    let diskMass = 0, diskRadius = 0;
    if (main) {
      const sl = Math.hypot(main.lx, main.ly, main.lz);
      const spin = sl > 1e-3 * ll;
      const ux = spin ? main.lx / sl : nx, uy = spin ? main.ly / sl : ny, uz = spin ? main.lz / sl : nz;
      const [svx, svy, svz] = sinkVel(main);
      const order: { r: number; i: number }[] = [];
      for (let a = 0; a < nAlive; a++) {
        const i = ids[a];
        const r = Math.hypot(x[i] - main.x, y[i] - main.y, z[i] - main.z);
        if (r < 0.5) order.push({ r, i });
      }
      order.sort((p, q) => p.r - q.r);
      let enclosed = main.m;
      const radii: number[] = [];
      for (const { r, i } of order) {
        enclosed += m[i];
        const dx = x[i] - main.x, dy = y[i] - main.y, dz = z[i] - main.z;
        const hz = dx * ux + dy * uy + dz * uz;
        const Rx = dx - hz * ux, Ry = dy - hz * uy, Rz = dz - hz * uz;
        const R = Math.hypot(Rx, Ry, Rz);
        if (R < 1e-6 || Math.abs(hz) > 0.3 * R) continue;
        const vphi = ((px_[i] - svx) * (uy * Rz - uz * Ry) + (py_[i] - svy) * (uz * Rx - ux * Rz) + (pz_[i] - svz) * (ux * Ry - uy * Rx)) / R;
        if (vphi > 0.7 * Math.sqrt(enclosed / r)) { diskMass += m[i]; radii.push(R); }
      }
      radii.sort((p, q) => p - q);
      diskRadius = radii.length > 20 ? radii[Math.floor(radii.length * 0.8)] : 0;
    }

    // virial ratio of the gas: 2(K + E_th) / |W| < 1 collapses
    let kin = 0, th = 0;
    for (let a = 0; a < nAlive; a++) {
      const i = ids[a];
      kin += 0.5 * m[i] * (px_[i] ** 2 + py_[i] ** 2 + pz_[i] ** 2);
      th += 1.5 * m[i] * pOverRho(rho[i]);
    }
    const activeFraction = actCount ? actSum / actCount : 1;
    actSum = 0; actCount = 0;
    return {
      w: e.w,
      t: now * TICK, steps, gas: nAlive, sinks: sinks.length,
      starFraction: mStar / (mGas + mStar),
      mdot,
      maxRho: maxRho / RHO0,
      flatness, diskRadius, diskMass,
      // against the current binding energy: collapse deepens |W| many times over
      energyDrift: (e.total + energyLost - energy0) / Math.max(wScale, -e.w),
      angMomDrift: Math.hypot(L[0] - lx0, L[1] - ly0, L[2] - lz0) / lScale,
      momentum: Math.hypot(qx, qy, qz) / Math.sqrt(wScale),
      virial: e.w < 0 ? 2 * (kin + th) / -e.w : 0,
      activeFraction,
    };
  }

  seed();

  return {
    params,
    x, y, z, h, rho, alive, sinks,
    get t() { return now * TICK; },
    step,
    advance,
    stats,
    mainSink,
    sinkVel,
  };
}

export type Cloud = ReturnType<typeof createCloud>;

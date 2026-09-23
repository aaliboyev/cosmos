/* Planetesimal disk around the young Sun, in AU, years and solar masses (G = 4π²).
   Gravity: the star pulls on every body, and the K most massive bodies ("embryos")
   interact with every body in both directions, so momentum is conserved. Mutual
   gravity between the remaining planetesimals is neglected, as in standard
   super-particle codes. Leapfrog kick-drift-kick in barycentric coordinates.
   Radii are inflated by F so growth fits in minutes; the gas disk (drag, dissipation,
   accretion onto giant cores) runs on its own clock, `gasClock` gas years per orbital
   year, so it keeps pace with the sped-up growth. */

export const G = 4 * Math.PI * Math.PI;
export const M_EARTH = 3.0035e-6;            // M☉
export const R_EARTH_AU = 4.2635e-5;
export const SNOW_LINE = 2.7;                // AU (Hayashi 1981)
export const ICE_BOOST = 4.2;                // solid surface density jump beyond the snow line
const SIGMA_ROCK_1AU = 7.99e-7;              // 7.1 g/cm² in M☉/AU²
const RHO_EARTH = 5.51, RHO_ROCK = 3.0, RHO_ICE = 1.0;   // g/cm³
const SOFT2 = 1e-10;                         // AU², keeps the potential finite inside a merger

export interface DiskParams {
  n: number;
  rIn: number;
  rOut: number;
  /** Solid mass relative to the Minimum Mass Solar Nebula. */
  massFactor: number;
  /** Rayleigh σ of initial eccentricity; inclination uses half of it (radians). */
  heat: number;
  /** Radius inflation factor. */
  inflate: number;
  embryos: number;
  seed: number;
  /** Gas-disk e-folding time, years of gas-disk age. */
  gasTau: number;
  /** Gas-disk age per orbital year. Inflating radii by F speeds growth by ~F when
      gravitational focusing dominates and ~F² when it doesn't; gas processes run
      at this rate in between so they keep pace with growth. */
  gasClock: number;
  /** Core mass at which runaway gas accretion starts, M☉. */
  coreMass: number;
}

export const DEFAULT_PARAMS: DiskParams = {
  n: 4000, rIn: 0.5, rOut: 40, massFactor: 8, heat: 0.01, inflate: 100, embryos: 40, seed: 1,
  gasTau: 3e6, gasClock: 1000, coreMass: 10 * M_EARTH,
};

/** Solid surface density, M☉/AU². */
export const sigmaSolid = (r: number, massFactor = 1): number =>
  massFactor * SIGMA_ROCK_1AU * Math.pow(r, -1.5) * (r > SNOW_LINE ? ICE_BOOST : 1);

/** Ice mass fraction of solids condensing at r. */
export const iceFractionAt = (r: number): number => (r > SNOW_LINE ? 1 - 1 / ICE_BOOST : 0);

/** Physical radius, AU, for mass m (M☉) and ice mass fraction f. */
export function physicalRadius(m: number, ice: number): number {
  const rho = 1 / ((1 - ice) / RHO_ROCK + ice / RHO_ICE);
  return R_EARTH_AU * Math.cbrt((m / M_EARTH) * (RHO_EARTH / rho));
}

/** Collision radius for a pair. Planetesimal pairs get analytic gravitational focusing,
    because their mutual gravity is not integrated; for pairs with an embryo the
    integrated gravity already bends the paths. Capped at the mutual Hill radius. */
export function captureRadius(
  rSum: number, mSum: number, vRel2: number, resolved: boolean, hill: number,
): number {
  if (resolved) return rSum;
  const vEsc2 = 2 * G * mSum / rSum;
  return Math.min(rSum * Math.sqrt(1 + vEsc2 / Math.max(vRel2, 1e-12)), Math.max(rSum, hill));
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CollisionEvent { x: number; y: number; z: number; mass: number; fragments: number }

export interface Elements { a: number; e: number; i: number; node: number; peri: number }

/** Heliocentric elements for relative position r and velocity v, μ = G(M★ + m). */
export function elementsOf(rx: number, ry: number, rz: number, vx: number, vy: number, vz: number, mu: number): Elements {
  const r = Math.hypot(rx, ry, rz), v2 = vx * vx + vy * vy + vz * vz;
  const hx = ry * vz - rz * vy, hy = rz * vx - rx * vz, hz = rx * vy - ry * vx;
  const h = Math.hypot(hx, hy, hz);
  const rv = rx * vx + ry * vy + rz * vz;
  const ex = (v2 - mu / r) * rx / mu - rv * vx / mu;
  const ey = (v2 - mu / r) * ry / mu - rv * vy / mu;
  const ez = (v2 - mu / r) * rz / mu - rv * vz / mu;
  const e = Math.hypot(ex, ey, ez);
  const a = 1 / (2 / r - v2 / mu);
  const i = Math.acos(Math.max(-1, Math.min(1, hz / h)));
  const nx = -hy, ny = hx, nn = Math.hypot(nx, ny);
  const node = nn > 1e-12 ? Math.atan2(ny, nx) : 0;
  let peri = 0;
  if (e > 1e-9) {
    const ux = nn > 1e-12 ? nx / nn : 1, uy = nn > 1e-12 ? ny / nn : 0;
    // argument of pericentre: angle from node to e-vector in the orbit plane
    const cosw = (ux * ex + uy * ey) / e;
    const sinw = ((hx * (uy * ez) - hy * (ux * ez) + hz * (ux * ey - uy * ex)) / h) / e;
    peri = Math.atan2(sinw, cosw);
  }
  return { a, e, i, node, peri };
}

export type Disk = ReturnType<typeof createDisk>;

export function createDisk(params: Partial<DiskParams> = {}) {
  const p: DiskParams = { ...DEFAULT_PARAMS, ...params };
  const cap = p.n + 3000;
  const x = new Float64Array(cap), y = new Float64Array(cap), z = new Float64Array(cap);
  const vx = new Float64Array(cap), vy = new Float64Array(cap), vz = new Float64Array(cap);
  const ax = new Float64Array(cap), ay = new Float64Array(cap), az = new Float64Array(cap);
  const m = new Float64Array(cap), ice = new Float64Array(cap), gas = new Float64Array(cap);
  const rad = new Float64Array(cap);           // inflated radius, AU
  const id = new Int32Array(cap);
  const emb = new Uint8Array(cap);              // 1 while in the embryo set
  const rank = new Int32Array(cap);             // position in embList, read only when emb = 1
  const dead = new Uint8Array(cap);
  const reach = new Float64Array(cap);

  const star = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ax: 0, ay: 0, az: 0, m: 1 };
  const s = {
    n: 0, t: 0, dt: 0, step: 0, nextId: 0,
    gasFrac: 1,
    // non-Hamiltonian changes (drag, collisions, gas, removals, embryo reselection)
    eKnown: 0, pKnown: [0, 0, 0], lKnown: [0, 0, 0],
    e0: 0, p0: [0, 0, 0], l0: [0, 0, 0],
    events: [] as CollisionEvent[],
    rand: mulberry32(p.seed),
  };
  let embList: number[] = [];
  const syncRanks = () => { for (let k = 0; k < embList.length; k++) rank[embList[k]] = k; };

  const setRadius = (i: number) => { rad[i] = p.inflate * physicalRadius(m[i], ice[i]); };

  // ---------- setup
  function addBody(px: number, py: number, pz: number, qx: number, qy: number, qz: number, mass: number, iceFrac: number): number {
    const i = s.n++;
    x[i] = px; y[i] = py; z[i] = pz; vx[i] = qx; vy[i] = qy; vz[i] = qz;
    m[i] = mass; ice[i] = iceFrac; gas[i] = 0; id[i] = s.nextId++; emb[i] = 0; dead[i] = 0;
    setRadius(i);
    return i;
  }

  function rayleigh(sigma: number): number {
    return sigma * Math.sqrt(-2 * Math.log(1 - s.rand() * 0.999999));
  }

  /** Position and velocity on an orbit around a unit-mass star, relative to it. */
  function kepler(a: number, e: number, inc: number, node: number, peri: number, M: number, mu: number) {
    let E = M;
    for (let k = 0; k < 12; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    const cE = Math.cos(E), sE = Math.sin(E), b = Math.sqrt(1 - e * e);
    const px = a * (cE - e), py = a * b * sE;
    const n = Math.sqrt(mu / (a * a * a)), rr = a * (1 - e * cE);
    const qx = -a * n * sE / rr * a, qy = a * n * b * cE / rr * a;
    const cw = Math.cos(peri), sw = Math.sin(peri), cO = Math.cos(node), sO = Math.sin(node), ci = Math.cos(inc), si = Math.sin(inc);
    const r11 = cO * cw - sO * sw * ci, r12 = -cO * sw - sO * cw * ci;
    const r21 = sO * cw + cO * sw * ci, r22 = -sO * sw + cO * cw * ci;
    const r31 = sw * si, r32 = cw * si;
    // ecliptic (x, y, z) → scene-style (x, z_up, -y): the disk lies in the y = 0 plane
    const ex = r11 * px + r12 * py, ey = r21 * px + r22 * py, ez = r31 * px + r32 * py;
    const fx = r11 * qx + r12 * qy, fy = r21 * qx + r22 * qy, fz = r31 * qx + r32 * qy;
    return [ex, ez, -ey, fx, fz, -fy];
  }

  function seed() {
    s.n = 0; s.t = 0; s.step = 0; s.nextId = 0; s.gasFrac = 1; s.events.length = 0;
    s.eKnown = 0; s.pKnown = [0, 0, 0]; s.lKnown = [0, 0, 0];
    s.rand = mulberry32(p.seed);
    Object.assign(star, { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, m: 1 });
    const lnSpan = Math.log(p.rOut / p.rIn);
    for (let k = 0; k < p.n; k++) {
      // number density uniform in log r; masses carry the surface density
      const a = p.rIn * Math.exp(s.rand() * lnSpan);
      const mass = sigmaSolid(a, p.massFactor) * 2 * Math.PI * a * a * lnSpan / p.n;
      const e = Math.min(rayleigh(p.heat), 0.3), inc = Math.min(rayleigh(p.heat / 2), 0.3);
      const [px, py, pz, qx, qy, qz] = kepler(a, e, inc, s.rand() * 2 * Math.PI, s.rand() * 2 * Math.PI, s.rand() * 2 * Math.PI, G * (1 + mass));
      addBody(px, py, pz, qx, qy, qz, mass, iceFractionAt(a));
    }
    // barycentric frame: zero total momentum, centre of mass at the origin
    let mt = star.m, cx = 0, cy = 0, cz = 0, px = 0, py = 0, pz = 0;
    for (let i = 0; i < s.n; i++) {
      mt += m[i]; cx += m[i] * x[i]; cy += m[i] * y[i]; cz += m[i] * z[i];
      px += m[i] * vx[i]; py += m[i] * vy[i]; pz += m[i] * vz[i];
    }
    const sx = -cx / mt, sy = -cy / mt, sz = -cz / mt, ux = -px / mt, uy = -py / mt, uz = -pz / mt;
    star.x = sx; star.y = sy; star.z = sz; star.vx = ux; star.vy = uy; star.vz = uz;
    for (let i = 0; i < s.n; i++) { x[i] += sx; y[i] += sy; z[i] += sz; vx[i] += ux; vy[i] += uy; vz[i] += uz; }
    const innermost = Math.pow(p.rIn * 0.9, 1.5);
    s.dt = innermost / 40;
    reselect(false);
    computeAcc();
    s.e0 = energy();
    s.p0 = momentum();
    s.l0 = angularMomentum();
  }

  // ---------- embryos
  const order: number[] = [];
  function reselect(account = true) {
    const before = account ? energy() : 0;
    for (const i of embList) emb[i] = 0;
    order.length = 0;
    for (let i = 0; i < s.n; i++) order.push(i);
    order.sort((a, b) => m[b] - m[a]);
    embList = order.slice(0, Math.min(p.embryos, s.n));
    for (const i of embList) emb[i] = 1;
    syncRanks();
    if (account) s.eKnown += energy() - before;
  }

  // ---------- forces
  function computeAcc() {
    const n = s.n;
    let sax = 0, say = 0, saz = 0;
    for (let i = 0; i < n; i++) {
      const dx = star.x - x[i], dy = star.y - y[i], dz = star.z - z[i];
      const r2 = dx * dx + dy * dy + dz * dz + SOFT2;
      const inv3 = 1 / (r2 * Math.sqrt(r2));
      ax[i] = G * star.m * dx * inv3; ay[i] = G * star.m * dy * inv3; az[i] = G * star.m * dz * inv3;
      sax -= G * m[i] * dx * inv3; say -= G * m[i] * dy * inv3; saz -= G * m[i] * dz * inv3;
    }
    star.ax = sax; star.ay = say; star.az = saz;
    for (let k = 0; k < embList.length; k++) {
      const e = embList[k];
      const me = m[e], ex = x[e], ey = y[e], ez = z[e];
      let eax = 0, eay = 0, eaz = 0;
      for (let i = 0; i < n; i++) {
        if (i === e) continue;
        // embryo pairs once: only against embryos later in the list
        if (emb[i] && rank[i] <= k) continue;
        const dx = x[i] - ex, dy = y[i] - ey, dz = z[i] - ez;
        const r2 = dx * dx + dy * dy + dz * dz + SOFT2;
        const inv3 = 1 / (r2 * Math.sqrt(r2));
        const fi = G * me * inv3, fe = G * m[i] * inv3;
        ax[i] -= fi * dx; ay[i] -= fi * dy; az[i] -= fi * dz;
        eax += fe * dx; eay += fe * dy; eaz += fe * dz;
      }
      ax[e] += eax; ay[e] += eay; az[e] += eaz;
    }
  }

  // ---------- conserved quantities under the force model
  /** Potential of body i with the star and every body it interacts with. */
  function potentialOf(i: number): number {
    const dx = star.x - x[i], dy = star.y - y[i], dz = star.z - z[i];
    let u = -G * star.m * m[i] / Math.sqrt(dx * dx + dy * dy + dz * dz + SOFT2);
    if (emb[i]) {
      for (let j = 0; j < s.n; j++) {
        if (j === i || dead[j]) continue;
        const ex = x[j] - x[i], ey = y[j] - y[i], ez = z[j] - z[i];
        u -= G * m[i] * m[j] / Math.sqrt(ex * ex + ey * ey + ez * ez + SOFT2);
      }
    } else {
      for (const j of embList) {
        if (j === i || dead[j]) continue;
        const ex = x[j] - x[i], ey = y[j] - y[i], ez = z[j] - z[i];
        u -= G * m[i] * m[j] / Math.sqrt(ex * ex + ey * ey + ez * ez + SOFT2);
      }
    }
    return u;
  }
  const kinetic = (i: number) => 0.5 * m[i] * (vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i]);
  function pairPotential(i: number, j: number): number {
    if (!emb[i] && !emb[j]) return 0;
    const dx = x[j] - x[i], dy = y[j] - y[i], dz = z[j] - z[i];
    return -G * m[i] * m[j] / Math.sqrt(dx * dx + dy * dy + dz * dz + SOFT2);
  }

  function energy(): number {
    let e = 0.5 * star.m * (star.vx * star.vx + star.vy * star.vy + star.vz * star.vz);
    for (let i = 0; i < s.n; i++) {
      e += kinetic(i);
      const dx = star.x - x[i], dy = star.y - y[i], dz = star.z - z[i];
      e -= G * star.m * m[i] / Math.sqrt(dx * dx + dy * dy + dz * dz + SOFT2);
    }
    for (let k = 0; k < embList.length; k++) {
      const a = embList[k];
      for (let i = 0; i < s.n; i++) {
        if (i === a) continue;
        if (emb[i] && rank[i] <= k) continue;
        const dx = x[i] - x[a], dy = y[i] - y[a], dz = z[i] - z[a];
        e -= G * m[a] * m[i] / Math.sqrt(dx * dx + dy * dy + dz * dz + SOFT2);
      }
    }
    return e;
  }
  function momentum(): number[] {
    let px = star.m * star.vx, py = star.m * star.vy, pz = star.m * star.vz;
    for (let i = 0; i < s.n; i++) { px += m[i] * vx[i]; py += m[i] * vy[i]; pz += m[i] * vz[i]; }
    return [px, py, pz];
  }
  function angularMomentum(): number[] {
    let lx = star.m * (star.y * star.vz - star.z * star.vy);
    let ly = star.m * (star.z * star.vx - star.x * star.vz);
    let lz = star.m * (star.x * star.vy - star.y * star.vx);
    for (let i = 0; i < s.n; i++) {
      lx += m[i] * (y[i] * vz[i] - z[i] * vy[i]);
      ly += m[i] * (z[i] * vx[i] - x[i] * vz[i]);
      lz += m[i] * (x[i] * vy[i] - y[i] * vx[i]);
    }
    return [lx, ly, lz];
  }
  function bodyL(i: number): number[] {
    return [m[i] * (y[i] * vz[i] - z[i] * vy[i]), m[i] * (z[i] * vx[i] - x[i] * vz[i]), m[i] * (x[i] * vy[i] - y[i] * vx[i])];
  }
  const addTo = (acc: number[], v: number[], k = 1) => { acc[0] += v[0] * k; acc[1] += v[1] * k; acc[2] += v[2] * k; };

  // ---------- collisions
  // Cells in (ln r, azimuth, height / r): a cell spans ~CELL·r, like the reach of bodies there
  const CELL = 0.04;
  const AZ = Math.ceil(2 * Math.PI / CELL);
  const TABLE = 32768;
  const cellCount = new Int32Array(TABLE), cellStart = new Int32Array(TABLE), sorted = new Int32Array(cap), bucketOf = new Int32Array(cap);
  const cellR = new Int32Array(cap), cellA = new Int32Array(cap), cellH = new Int32Array(cap);
  const bucket = (ir: number, ia: number, ih: number) =>
    ((Math.imul(ir, 73856093) ^ Math.imul(ia, 19349663) ^ Math.imul(ih, 83492791)) >>> 0) & (TABLE - 1);

  function hillOf(i: number, mass: number): number {
    const dx = x[i] - star.x, dy = y[i] - star.y, dz = z[i] - star.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) * Math.cbrt(mass / 3);
  }

  /** Relative speed of i to the local circular orbit: bounds how far pairs move apart in a step. */
  function deviation(i: number): number {
    const dx = x[i] - star.x, dy = y[i] - star.y, dz = z[i] - star.z;
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const vc = Math.sqrt(G * star.m / r);
    const ux = vx[i] - star.vx, uy = vy[i] - star.vy, uz = vz[i] - star.vz;
    const v = Math.sqrt(ux * ux + uy * uy + uz * uz);
    return Math.abs(v - vc) + v * 0.02;
  }

  /** Closest approach of i and j over the last drift, and the collision test. */
  function testPair(i: number, j: number): boolean {
    const dx = x[j] - x[i], dy = y[j] - y[i], dz = z[j] - z[i];
    const d2 = dx * dx + dy * dy + dz * dz;
    // reaches bound the capture radius plus the step's relative travel
    const rr = reach[i] + reach[j];
    if (d2 > rr * rr) return false;
    const ux = vx[j] - vx[i], uy = vy[j] - vy[i], uz = vz[j] - vz[i];
    const u2 = ux * ux + uy * uy + uz * uz;
    const rSum = rad[i] + rad[j];
    const resolved = emb[i] === 1 || emb[j] === 1;
    const hill = resolved ? 0 : hillOf(m[i] > m[j] ? i : j, m[i] + m[j]);
    const rc = captureRadius(rSum, m[i] + m[j], u2, resolved, hill);
    const lim = rc + Math.sqrt(u2) * s.dt;
    if (d2 > lim * lim) return false;
    // relative path over the step, looking back from now
    const tau = u2 > 0 ? Math.min(Math.max((dx * ux + dy * uy + dz * uz) / u2, 0), s.dt) : 0;
    const cx = dx - ux * tau, cy = dy - uy * tau, cz = dz - uz * tau;
    return cx * cx + cy * cy + cz * cz < rc * rc;
  }

  function collide() {
    const n = s.n;
    const big: number[] = [];
    cellCount.fill(0);
    for (let i = 0; i < n; i++) {
      const dx = x[i] - star.x, dy = y[i] - star.y, dz = z[i] - star.z;
      const rc = Math.max(Math.hypot(dx, dz), 1e-6);
      reach[i] = rad[i] + (emb[i] ? 0 : hillOf(i, 2 * m[i])) + deviation(i) * s.dt;
      // pairs are found through neighbouring cells only if both reaches fit inside one cell
      if (reach[i] > 0.4 * CELL * rc) { big.push(i); bucketOf[i] = -1; continue; }
      cellR[i] = Math.floor(Math.log(rc) / CELL);
      cellA[i] = Math.min(AZ - 1, Math.floor((Math.atan2(dz, dx) + Math.PI) / CELL));
      cellH[i] = Math.floor(dy / (CELL * rc));
      const b = bucket(cellR[i], cellA[i], cellH[i]);
      bucketOf[i] = b; cellCount[b]++;
    }
    let acc = 0;
    for (let b = 0; b < TABLE; b++) { cellStart[b] = acc; acc += cellCount[b]; cellCount[b] = 0; }
    for (let i = 0; i < n; i++) {
      const b = bucketOf[i];
      if (b < 0) continue;
      sorted[cellStart[b] + cellCount[b]++] = i;
    }
    // a bucket shared by two neighbouring cells is scanned twice; retesting a pair changes nothing
    for (let i = 0; i < n; i++) {
      if (dead[i] || bucketOf[i] < 0) continue;
      const ir = cellR[i], ia = cellA[i], ih = cellH[i];
      // half stencil: the own cell (pairs j > i) and the 13 cells "after" it
      outer:
      for (let orr = 0; orr <= 1; orr++) {
        const hr = Math.imul(ir + orr, 73856093);
        for (let oa = -1; oa <= 1; oa++) {
          if (orr === 0 && oa < 0) continue;
          let a = ia + oa;
          if (a < 0) a += AZ; else if (a >= AZ) a -= AZ;
          const ha = hr ^ Math.imul(a, 19349663);
          for (let oh = -1; oh <= 1; oh++) {
            if (orr === 0 && oa === 0 && oh < 0) continue;
            const self = orr === 0 && oa === 0 && oh === 0;
            const b = ((ha ^ Math.imul(ih + oh, 83492791)) >>> 0) & (TABLE - 1);
            const cnt = cellCount[b];
            if (cnt === 0) continue;
            const start = cellStart[b], end = start + cnt;
            for (let q = start; q < end; q++) {
              const j = sorted[q];
              if (j === i || dead[j] || (self && j < i)) continue;
              if (testPair(i, j)) { resolve(i, j); if (dead[i]) break outer; }
            }
          }
        }
      }
    }
    // reach beyond a cell: against everything
    for (const b of big) {
      if (dead[b]) continue;
      for (let j = 0; j < n; j++) {
        if (j === b || dead[j] || dead[b]) continue;
        if (bucketOf[j] < 0 && j < b) continue;
        if (testPair(b, j)) resolve(b, j);
      }
    }
  }

  function localState(ids: number[]): { e: number; p: number[]; l: number[] } {
    let e = 0;
    const pp = [0, 0, 0], ll = [0, 0, 0];
    for (let k = 0; k < ids.length; k++) {
      const i = ids[k];
      e += kinetic(i) + potentialOf(i);
      for (let q = 0; q < k; q++) e -= pairPotential(ids[q], i);   // counted by both
      addTo(pp, [m[i] * vx[i], m[i] * vy[i], m[i] * vz[i]]);
      addTo(ll, bodyL(i));
    }
    return { e, p: pp, l: ll };
  }

  function resolve(i: number, j: number) {
    const [w, l] = m[i] >= m[j] ? [i, j] : [j, i];
    const before = localState([w, l]);
    const mt = m[w] + m[l];
    const cmx = (m[w] * x[w] + m[l] * x[l]) / mt, cmy = (m[w] * y[w] + m[l] * y[l]) / mt, cmz = (m[w] * z[w] + m[l] * z[l]) / mt;
    const cvx = (m[w] * vx[w] + m[l] * vx[l]) / mt, cvy = (m[w] * vy[w] + m[l] * vy[l]) / mt, cvz = (m[w] * vz[w] + m[l] * vz[l]) / mt;
    // impact speed from physical (uninflated) radii: inflation must not make bodies fragile
    const ux = vx[w] - vx[l], uy = vy[w] - vy[l], uz = vz[w] - vz[l];
    const rPhys = (rad[w] + rad[l]) / p.inflate;
    const vEsc2 = 2 * G * mt / rPhys;
    const vImp = Math.sqrt(ux * ux + uy * uy + uz * uz + vEsc2), vEsc = Math.sqrt(vEsc2);
    const iceMix = (m[w] * ice[w] + m[l] * ice[l]) / mt, gasMix = gas[w] + gas[l];

    const ratio = vImp / vEsc;
    let lr = 1;
    if (ratio > 2) lr = Math.max(0.4, 1 - 0.25 * (ratio - 2));
    const debris = mt * (1 - lr);
    const pieces = debris > 4 * minMass() ? 4 : debris > 2 * minMass() ? 2 : 0;
    const wasEmb = emb[w] || emb[l];

    dead[l] = 1;
    if (emb[l]) { emb[l] = 0; embList = embList.filter(k => k !== l); syncRanks(); }
    x[w] = cmx; y[w] = cmy; z[w] = cmz; vx[w] = cvx; vy[w] = cvy; vz[w] = cvz;
    ice[w] = iceMix; gas[w] = gasMix;
    if (wasEmb && !emb[w]) { emb[w] = 1; embList.push(w); syncRanks(); }
    const created: number[] = [];
    if (pieces && s.n + pieces <= cap) {
      m[w] = mt - debris;
      setRadius(w);
      // symmetric pairs: centre of mass and momentum stay exactly where they were
      const fm = debris / pieces;
      const vej = 1.1 * Math.sqrt(2 * G * m[w] / (rad[w] * 2));
      for (let k = 0; k < pieces / 2; k++) {
        let dxn = s.rand() - 0.5, dyn = (s.rand() - 0.5) * 0.3, dzn = s.rand() - 0.5;
        const dn = Math.hypot(dxn, dyn, dzn) || 1;
        dxn /= dn; dyn /= dn; dzn /= dn;
        for (const sgn of [1, -1]) {
          const f = addBody(0, 0, 0, 0, 0, 0, fm, iceMix);
          const off = (rad[w] + rad[f]) * 2;
          x[f] = cmx + sgn * dxn * off; y[f] = cmy + sgn * dyn * off; z[f] = cmz + sgn * dzn * off;
          vx[f] = cvx + sgn * dxn * vej; vy[f] = cvy + sgn * dyn * vej; vz[f] = cvz + sgn * dzn * vej;
          reach[f] = 0; bucketOf[f] = -1;
          created.push(f);
        }
      }
    } else {
      m[w] = mt;
      setRadius(w);
    }
    const after = localState([w, ...created]);
    s.eKnown += after.e - before.e;
    addTo(s.pKnown, after.p); addTo(s.pKnown, before.p, -1);
    addTo(s.lKnown, after.l); addTo(s.lKnown, before.l, -1);
    s.events.push({ x: cmx - star.x, y: cmy - star.y, z: cmz - star.z, mass: mt, fragments: created.length });
  }

  let minMassCache = 0;
  const minMass = () => minMassCache;

  /** Bodies that fall into the star join it; bodies flung far away leave the system. */
  function removeLost() {
    for (let i = 0; i < s.n; i++) {
      if (dead[i]) continue;
      const dx = x[i] - star.x, dy = y[i] - star.y, dz = z[i] - star.z;
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 < 0.15 * 0.15) {
        const before = localState([i]);
        const ks0 = 0.5 * star.m * (star.vx ** 2 + star.vy ** 2 + star.vz ** 2);
        const ls0 = starL();
        const mt = star.m + m[i];
        star.vx = (star.m * star.vx + m[i] * vx[i]) / mt;
        star.vy = (star.m * star.vy + m[i] * vy[i]) / mt;
        star.vz = (star.m * star.vz + m[i] * vz[i]) / mt;
        star.m = mt;
        dead[i] = 1;
        if (emb[i]) { emb[i] = 0; embList = embList.filter(k => k !== i); syncRanks(); }
        // the star's potential with everyone else grows by the swallowed mass
        const ks1 = 0.5 * star.m * (star.vx ** 2 + star.vy ** 2 + star.vz ** 2);
        s.eKnown += ks1 - ks0 - before.e + starPotentialDelta(m[i]);
        // momentum is conserved; the body's orbital L becomes stellar spin
        const ls1 = starL();
        addTo(s.lKnown, [ls1[0] - ls0[0] - before.l[0], ls1[1] - ls0[1] - before.l[1], ls1[2] - ls0[2] - before.l[2]]);
      } else if (r2 > 150 * 150) {
        const before = localState([i]);
        s.eKnown -= before.e;
        addTo(s.pKnown, before.p, -1);
        addTo(s.lKnown, before.l, -1);
        dead[i] = 1;
        if (emb[i]) { emb[i] = 0; embList = embList.filter(k => k !== i); syncRanks(); }
      }
    }
  }
  const starL = () => [star.m * (star.y * star.vz - star.z * star.vy), star.m * (star.z * star.vx - star.x * star.vz), star.m * (star.x * star.vy - star.y * star.vx)];
  function starPotentialDelta(dm: number): number {
    let u = 0;
    for (let j = 0; j < s.n; j++) {
      if (dead[j]) continue;
      const dx = star.x - x[j], dy = star.y - y[j], dz = star.z - z[j];
      u -= G * dm * m[j] / Math.sqrt(dx * dx + dy * dy + dz * dz + SOFT2);
    }
    return u;
  }

  function compact() {
    let w = 0;
    const remap = new Int32Array(s.n).fill(-1);
    for (let i = 0; i < s.n; i++) {
      if (dead[i]) continue;
      if (w !== i) {
        x[w] = x[i]; y[w] = y[i]; z[w] = z[i]; vx[w] = vx[i]; vy[w] = vy[i]; vz[w] = vz[i];
        ax[w] = ax[i]; ay[w] = ay[i]; az[w] = az[i];
        m[w] = m[i]; ice[w] = ice[i]; gas[w] = gas[i]; rad[w] = rad[i]; id[w] = id[i]; emb[w] = emb[i];
      }
      dead[w] = 0;
      remap[i] = w++;
    }
    embList = embList.map(i => remap[i]).filter(i => i >= 0);
    syncRanks();
    s.n = w;
  }

  // ---------- gas
  /** Gas damping of each body's deviation from the local circular orbit, and runaway
      gas accretion onto cores past `coreMass` beyond the snow line. Both are
      parametrised models, with rates in gas-disk years. */
  function gasEffects(dt: number): boolean {
    const speed = p.gasClock;
    const tEq = s.t * speed;
    s.gasFrac = Math.exp(-tEq / p.gasTau);
    if (s.gasFrac < 1e-3) return false;
    let accreted = false;
    const mRef = 0.01 * M_EARTH;
    for (let i = 0; i < s.n; i++) {
      const dx = x[i] - star.x, dy = y[i] - star.y, dz = z[i] - star.z;
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
      // gas co-rotates on circular orbits in the midplane
      const vc = Math.sqrt(G * star.m / r), rh = Math.hypot(dx, dz);
      const gx = star.vx + (rh > 0 ? dz / rh * vc : 0), gy = star.vy, gz = star.vz + (rh > 0 ? -dx / rh * vc : 0);
      const period = Math.pow(r, 1.5);
      const tau = 1e5 * Math.cbrt(m[i] / mRef) * period / s.gasFrac / speed;
      const k = 1 - Math.exp(-dt / tau);
      const ddx = (gx - vx[i]) * k, ddy = (gy - vy[i]) * k, ddz = (gz - vz[i]) * k;
      const ke0 = kinetic(i);
      vx[i] += ddx; vy[i] += ddy; vz[i] += ddz;
      s.eKnown += kinetic(i) - ke0;
      addTo(s.pKnown, [m[i] * ddx, m[i] * ddy, m[i] * ddz]);
      addTo(s.lKnown, [m[i] * (y[i] * ddz - z[i] * ddy), m[i] * (z[i] * ddx - x[i] * ddz), m[i] * (x[i] * ddy - y[i] * ddx)]);

      if (m[i] >= p.coreMass && r > SNOW_LINE) {
        // Kelvin–Helmholtz-limited contraction, faster for bigger cores; capped supply
        const tKH = 1e5 * Math.pow(p.coreMass / m[i], 2);
        const rate = Math.min(m[i] / tKH, 3e-3 * M_EARTH) * s.gasFrac * speed;
        const dm = rate * dt;
        const u0 = potentialOf(i), ke = kinetic(i), l0 = bodyL(i);
        const mom = [vx[i] * dm, vy[i] * dm, vz[i] * dm];
        m[i] += dm; gas[i] += dm;
        setRadius(i);
        s.eKnown += kinetic(i) - ke + potentialOf(i) - u0;
        addTo(s.pKnown, mom);
        const l1 = bodyL(i);
        addTo(s.lKnown, [l1[0] - l0[0], l1[1] - l0[1], l1[2] - l0[2]]);
        accreted = true;
      }
    }
    return accreted;
  }

  // ---------- step
  function kick(h: number) {
    star.vx += star.ax * h; star.vy += star.ay * h; star.vz += star.az * h;
    for (let i = 0; i < s.n; i++) { vx[i] += ax[i] * h; vy[i] += ay[i] * h; vz[i] += az[i] * h; }
  }
  function drift(h: number) {
    star.x += star.vx * h; star.y += star.vy * h; star.z += star.vz * h;
    for (let i = 0; i < s.n; i++) { x[i] += vx[i] * h; y[i] += vy[i] * h; z[i] += vz[i] * h; }
  }

  function step() {
    const dt = s.dt;
    kick(dt / 2);
    drift(dt);
    collide();
    removeLost();
    compact();
    if (++s.step % 20 === 0) reselect();
    computeAcc();
    kick(dt / 2);
    // gas acts at the synchronised point, where kinetic energy is well defined; a mass
    // change needs fresh forces, or the next half-kick would not be equal and opposite
    if (gasEffects(dt)) computeAcc();
    s.t += dt;
  }

  function conservation() {
    const e = energy(), pp = momentum(), ll = angularMomentum();
    let pScale = star.m * Math.hypot(star.vx, star.vy, star.vz);
    for (let i = 0; i < s.n; i++) pScale += m[i] * Math.hypot(vx[i], vy[i], vz[i]);
    const dE = (e - s.e0 - s.eKnown) / Math.abs(s.e0);
    const dP = Math.hypot(pp[0] - s.p0[0] - s.pKnown[0], pp[1] - s.p0[1] - s.pKnown[1], pp[2] - s.p0[2] - s.pKnown[2]) / pScale;
    const l0 = Math.hypot(...s.l0);
    const dL = Math.hypot(ll[0] - s.l0[0] - s.lKnown[0], ll[1] - s.l0[1] - s.lKnown[1], ll[2] - s.l0[2] - s.lKnown[2]) / l0;
    return { dE, dP, dL };
  }

  seed();
  minMassCache = Math.min(...Array.from(m.subarray(0, s.n))) * 0.25;

  return {
    params: p,
    state: s,
    star,
    arrays: { x, y, z, vx, vy, vz, m, ice, gas, rad, id, emb },
    get n() { return s.n; },
    seed() { seed(); minMassCache = Math.min(...Array.from(m.subarray(0, s.n))) * 0.25; },
    step,
    conservation,
    energy,
    momentum,
    angularMomentum,
    /** Test hooks: place bodies directly (heliocentric = barycentric here; star fixed at origin). */
    reset(bodies: { x: number; y: number; z: number; vx: number; vy: number; vz: number; m: number; ice?: number }[]) {
      s.n = 0; s.t = 0; s.step = 0; s.events.length = 0; s.gasFrac = 1;
      s.eKnown = 0; s.pKnown = [0, 0, 0]; s.lKnown = [0, 0, 0];
      Object.assign(star, { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, m: 1 });
      for (const b of bodies) addBody(b.x, b.y, b.z, b.vx, b.vy, b.vz, b.m, b.ice ?? 0);
      minMassCache = Math.min(...bodies.map(b => b.m)) * 0.25;
      reselect(false);
      computeAcc();
      s.e0 = energy(); s.p0 = momentum(); s.l0 = angularMomentum();
    },
    collide() { collide(); compact(); },
    resolve(i: number, j: number) { resolve(i, j); compact(); },
    setGasOff() { p.gasTau = 1e-9; },
  };
}

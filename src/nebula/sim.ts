/* The disk is not drawn — it emerges. Three ingredients only:
   1. gravity toward the enclosed mass (softened, from a radial histogram)
   2. inelastic gas collisions (particles in the same grid cell mix velocity —
      opposing motions cancel, shared rotation survives; this is the ONLY
      place energy is lost)
   3. a small random net spin the cloud starts with, by statistical accident
   Everything the viewer sees — collapse, spin-up, flattening, the ignition —
   is a consequence, not a script. */

export const N = 7000;
export const R0 = 100;          // initial cloud radius
const GM = 18000;               // gravity strength (total mass = 1) — tuned so
                                // the fall takes ~half a minute, not a blink
const SOFT2 = 120;              // softening² so the core doesn't explode
const CELL = 6;                 // collision cell size — must stay smaller than
                                // the disk, or mixing cancels rotation itself
export const DT = 1 / 60;
const BINS = 100, BIN_R = 220;  // enclosed-mass histogram

export interface NebulaParams { spin0: number; visc: number }
export interface NebulaStats { flat: number; core: number }

interface Cell { n: number; vx: number; vy: number; vz: number; ids: number[] }

export interface NebulaSim {
  pos: Float32Array;
  colors: Float32Array;
  params: NebulaParams;
  readonly elapsed: number;
  seed(): void;
  /** One physics step plus recoloring; `refresh` recomputes the enclosed mass first. */
  tick(refresh: boolean): void;
  stats(): NebulaStats;
}

export function createNebulaSim(params: NebulaParams): NebulaSim {
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  let elapsed = 0;

  function seedCloud() {
    elapsed = 0;
    let mx = 0, my = 0, mz = 0;
    for (let i = 0; i < N; i++) {
      // uniform-ish sphere with ragged edge
      const r = R0 * Math.cbrt(Math.random()) * (0.75 + Math.random() * 0.35);
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const x = r * Math.sin(ph) * Math.cos(th);
      const y = r * Math.cos(ph);
      const z = r * Math.sin(ph) * Math.sin(th);
      pos.set([x, y, z], i * 3);
      // random drift + the accidental net spin around Y
      const vx = (Math.random() - .5) * 5 + -z * params.spin0;
      const vy = (Math.random() - .5) * 5;
      const vz = (Math.random() - .5) * 5 + x * params.spin0;
      vel.set([vx, vy, vz], i * 3);
      mx += vx; my += vy; mz += vz;
    }
    // remove net linear momentum so the cloud doesn't wander off
    mx /= N; my /= N; mz /= N;
    for (let i = 0; i < N; i++) { vel[i * 3] -= mx; vel[i * 3 + 1] -= my; vel[i * 3 + 2] -= mz; }
  }

  // ---------- enclosed mass: M(<r) from a radial histogram, refreshed cheaply
  const massEnc = new Float32Array(BINS);
  function refreshMass() {
    massEnc.fill(0);
    for (let i = 0; i < N; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const b = Math.min(BINS - 1, (Math.sqrt(x * x + y * y + z * z) / BIN_R * BINS) | 0);
      massEnc[b]++;
    }
    let acc = 0;
    for (let b = 0; b < BINS; b++) { acc += massEnc[b]; massEnc[b] = acc / N; }
  }

  // ---------- collisions: velocity mixing inside grid cells
  const cellMap = new Map<number, Cell>();
  function collide() {
    cellMap.clear();
    for (let i = 0; i < N; i++) {
      const k = ((pos[i * 3] / CELL) | 0) * 73856093 ^ ((pos[i * 3 + 1] / CELL) | 0) * 19349663 ^ ((pos[i * 3 + 2] / CELL) | 0) * 83492791;
      let c = cellMap.get(k);
      if (!c) { c = { n: 0, vx: 0, vy: 0, vz: 0, ids: [] }; cellMap.set(k, c); }
      c.n++; c.vx += vel[i * 3]; c.vy += vel[i * 3 + 1]; c.vz += vel[i * 3 + 2];
      c.ids.push(i);
    }
    for (const c of cellMap.values()) {
      if (c.n < 2) continue;
      const vx = c.vx / c.n, vy = c.vy / c.n, vz = c.vz / c.n;
      // denser cell → more collisions → stronger mixing (capped gently);
      // too high and viscosity drains angular momentum in seconds — the disk
      // accretes away before anyone sees it
      const k = Math.min(0.12, params.visc * (1 + c.n / 120));
      for (const i of c.ids) {
        vel[i * 3] += (vx - vel[i * 3]) * k;
        vel[i * 3 + 1] += (vy - vel[i * 3 + 1]) * k;
        vel[i * 3 + 2] += (vz - vel[i * 3 + 2]) * k;
      }
    }
  }

  // ---------- physics step
  function step() {
    for (let i = 0; i < N; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const r2 = x * x + y * y + z * z;
      const r = Math.sqrt(r2) + 1e-6;
      const b = Math.min(BINS - 1, (r / BIN_R * BINS) | 0);
      const a = -GM * massEnc[b] / (r2 + SOFT2);
      const ax = a * x / r, ay = a * y / r, az = a * z / r;
      vel[i * 3] += ax * DT; vel[i * 3 + 1] += ay * DT; vel[i * 3 + 2] += az * DT;
      pos[i * 3] += vel[i * 3] * DT;
      pos[i * 3 + 1] += vel[i * 3 + 1] * DT;
      pos[i * 3 + 2] += vel[i * 3 + 2] * DT;
    }
  }

  // color by local crowding (reuses collision cells): lonely = cold blue, dense = hot
  function paint() {
    for (const c of cellMap.values()) {
      const heat = Math.min(1, c.n / 60);
      const r = 0.35 + heat * 0.65, g = 0.45 + heat * 0.42, b = 0.85 - heat * 0.25;
      for (const i of c.ids) {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        // swallowed by the star: the glow represents them now — dim, or the
        // additive core outshines the disk that survived
        const d = (x * x + y * y + z * z < 36) ? 0.06 : 1;
        colors[i * 3] = r * d; colors[i * 3 + 1] = g * d; colors[i * 3 + 2] = b * d;
      }
    }
  }

  // flatness = rms height / rms cylindrical radius; core = fraction inside r < 8
  function stats(): NebulaStats {
    let h2 = 0, rc2 = 0, core = 0;
    for (let i = 0; i < N; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      h2 += y * y; rc2 += x * x + z * z;
      if (x * x + y * y + z * z < 64) core++;
    }
    return { flat: Math.sqrt(h2 / N) / Math.sqrt(rc2 / (2 * N)), core: core / N };
  }

  return {
    pos, colors, params,
    get elapsed() { return elapsed; },
    seed() { seedCloud(); refreshMass(); },
    tick(refresh) {
      if (refresh) refreshMass();
      step();
      collide();   // fills cellMap
      paint();     // reuses it
      elapsed += DT;
    },
    stats,
  };
}

export function stageOf(flat: number, core: number, elapsed: number): string {
  if (core > 0.6) return 'SCENE 5 · THE STAR TAKES ITS 99% — THE LEFTOVERS ARE THE PLANETS';
  if (core > 0.05 && flat < 0.25) return 'SCENE 4 · DISK + PROTOSTAR — A SOLAR SYSTEM IS BORN';
  if (flat < 0.35) return 'SCENE 4 · FLATTENING — UP AND DOWN ARE CANCELLING';
  if (core > 0.02) return 'SCENE 3 · COLLAPSE — THE SKATER PULLS HER ARMS IN';
  if (elapsed > 2) return 'SCENE 2 · THE FALL BEGINS';
  return 'SCENE 1 · COLD FOG, HANGING';
}

/* Planetesimals on Keplerian orbits in a flat disk. Collisions merge (mass and
   momentum conserved) and gravitational focusing inflates big bodies' capture
   cross-section, so the big eat faster: runaway growth. Only the heaviest
   K_OLIG bodies pull on the others (O(K·N)), enough for lane-clearing. */

export const N0 = 2600;
const GM = 40000;                 // star gravity
const GB = 0.9;                   // body-body gravity scale (oligarchs only)
const R_IN = 70, R_OUT = 270;     // disk annulus
export const DT = 1 / 60;
const K_OLIG = 12;                // only the heaviest K pull on everyone (O(K·N))

export interface AccretionSim {
  X: Float32Array; Y: Float32Array; M: Float32Array; R: Float32Array;
  readonly n: number;
  readonly elapsed: number;
  readonly oligarchs: readonly number[];
  /** Initial velocity noise (disk temperature), read at seed time. */
  heat: number;
  seed(): void;
  step(): void;
  findOligarchs(): void;
}

export function createAccretionSim(heat0: number): AccretionSim {
  let heat = heat0;
  let elapsed = 0;

  // ---------- bodies (struct of arrays; alive-compacted)
  let n = 0;
  const X = new Float32Array(N0), Y = new Float32Array(N0);
  const VX = new Float32Array(N0), VY = new Float32Array(N0);
  const M = new Float32Array(N0), R = new Float32Array(N0);

  function radiusOf(m: number) { return Math.cbrt(m) * 1.1; }

  function seed() {
    n = N0; elapsed = 0;
    for (let i = 0; i < N0; i++) {
      const a = R_IN + (R_OUT - R_IN) * Math.sqrt(Math.random());
      const th = Math.random() * Math.PI * 2;
      X[i] = Math.cos(th) * a; Y[i] = Math.sin(th) * a;
      const v = Math.sqrt(GM / a);
      // circular orbit + heat noise; everyone counterclockwise (the disk's inheritance)
      VX[i] = -Math.sin(th) * v * (1 + (Math.random() - .5) * heat * 2)
            + (Math.random() - .5) * v * heat;
      VY[i] = Math.cos(th) * v * (1 + (Math.random() - .5) * heat * 2)
            + (Math.random() - .5) * v * heat;
      M[i] = 0.6 + Math.random() * 1.6;
      R[i] = radiusOf(M[i]);
    }
  }

  function kill(i: number) { // swap-remove
    n--;
    X[i] = X[n]; Y[i] = Y[n]; VX[i] = VX[n]; VY[i] = VY[n]; M[i] = M[n]; R[i] = R[n];
  }

  // ---------- oligarchs: indices of the K most massive
  let oligarchs: number[] = [];
  function findOligarchs() {
    const idx: number[] = [];
    for (let i = 0; i < n; i++) idx.push(i);
    idx.sort((a, b) => M[b] - M[a]);
    oligarchs = idx.slice(0, Math.min(K_OLIG, n));
  }

  // ---------- physics
  function step() {
    // star gravity on everyone + oligarch gravity (gap-clearing, scattering)
    for (let i = 0; i < n; i++) {
      const r2 = X[i] * X[i] + Y[i] * Y[i];
      const r = Math.sqrt(r2) + 1e-6;
      const a = -GM / (r2 + 40);
      let ax = a * X[i] / r, ay = a * Y[i] / r;
      for (const j of oligarchs) {
        if (j === i || j >= n) continue;
        const dx = X[j] - X[i], dy = Y[j] - Y[i];
        const d2 = dx * dx + dy * dy + 30;
        const d = Math.sqrt(d2);
        const g = GB * M[j] / d2;
        ax += g * dx / d; ay += g * dy / d;
      }
      VX[i] += ax * DT; VY[i] += ay * DT;
      X[i] += VX[i] * DT; Y[i] += VY[i] * DT;
    }
    // star swallows what falls too close; the void keeps what escapes too far
    for (let i = n - 1; i >= 0; i--) {
      const r2 = X[i] * X[i] + Y[i] * Y[i];
      if (r2 < 20 * 20 || r2 > 1200 * 1200) kill(i);
    }
    collide();
  }

  // spatial hash collisions with gravitational focusing
  const grid = new Map<number, number[]>();
  function collide() {
    const CS = 14;
    grid.clear();
    for (let i = 0; i < n; i++) {
      const k = ((X[i] / CS) | 0) * 100003 + ((Y[i] / CS) | 0);
      let c = grid.get(k);
      if (!c) { c = []; grid.set(k, c); }
      c.push(i);
    }
    const dead = new Set<number>();
    for (const [key, cell] of grid) {
      // gather this cell + right/down neighbors (avoid double checks)
      for (const nk of [key, key + 1, key + 100003, key + 100004, key + 100002]) {
        const other = nk === key ? cell : grid.get(nk);
        if (!other) continue;
        for (let a = 0; a < cell.length; a++) {
          const i = cell[a];
          if (dead.has(i)) continue;
          const bStart = nk === key ? a + 1 : 0;
          for (let b = bStart; b < other.length; b++) {
            const j = other[b];
            if (i === j || dead.has(j) || dead.has(i)) continue;
            const dx = X[j] - X[i], dy = Y[j] - Y[i];
            const d2 = dx * dx + dy * dy;
            const sum = R[i] + R[j];
            // gravitational focusing: fat bodies pull food into their mouth —
            // effective cross-section grows with escape velocity vs relative speed
            const dvx = VX[j] - VX[i], dvy = VY[j] - VY[i];
            const vrel2 = dvx * dvx + dvy * dvy + 1;
            const focus2 = 1 + (2 * GB * (M[i] + M[j]) / sum) / vrel2;
            if (d2 < sum * sum * focus2) {
              // merge: momentum + mass conserved, winner takes the name
              const [w, l] = M[i] >= M[j] ? [i, j] : [j, i];
              const mt = M[w] + M[l];
              VX[w] = (VX[w] * M[w] + VX[l] * M[l]) / mt;
              VY[w] = (VY[w] * M[w] + VY[l] * M[l]) / mt;
              X[w] = (X[w] * M[w] + X[l] * M[l]) / mt;
              Y[w] = (Y[w] * M[w] + Y[l] * M[l]) / mt;
              M[w] = mt; R[w] = radiusOf(mt);
              dead.add(l);
            }
          }
        }
      }
    }
    // compact (indices shift, so re-find oligarchs after)
    const list = [...dead].sort((a, b) => b - a);
    for (const i of list) kill(i);
  }

  return {
    X, Y, M, R,
    get n() { return n; },
    get elapsed() { return elapsed; },
    get oligarchs() { return oligarchs; },
    get heat() { return heat; },
    set heat(v) { heat = v; },
    seed,
    step() { step(); elapsed += DT; },
    findOligarchs,
  };
}

export function stageOf(n: number): string {
  if (n > 2000) return 'DUST SWARM · EVERYONE IS FOOD';
  if (n > 800) return 'PEBBLES STICKING · TWO BY TWO, YOUR INTUITION EXACTLY';
  if (n > 200) return 'PLANETESIMALS · THE LOBBY IS THINNING';
  if (n > 40) return 'RUNAWAY GROWTH · THE BIG EAT FASTER — THE FISH-GAME LAW';
  if (n > 12) return 'OLIGARCHS · CLEARING THEIR LANES';
  return 'A PLANETARY SYSTEM · LANES CLEARED, GAME OVER';
}

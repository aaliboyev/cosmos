/* Synthetic small-body populations as Keplerian elements at J2000. Distributions follow the
   observed shapes (Kirkwood gaps, Hungarias, Hildas, Trojans, Kuiper belt, plutinos); resonant
   groups are phase-locked to Jupiter/Neptune by giving them the planet's exact mean-motion
   ratio — libration is not simulated. Deterministic for a given seed. */
import { ELEMENTS } from './ephemeris';
import { DEG } from './time';

export const GAUSS_K = 0.01720209895;          // rad/day for a = 1 AU
export const meanMotion = (aAU: number): number => GAUSS_K / Math.pow(aAU, 1.5);

export const Group = { Main: 0, Hungaria: 1, Hilda: 2, Trojan: 3, Kuiper: 4 } as const;
export type Group = typeof Group[keyof typeof Group];

export interface Population {
  count: number;
  /** per body: a (AU), e, i (rad) */
  aei: Float32Array;
  /** per body: Ω, ω (rad), M at J2000 (rad), mean motion (rad/day) */
  angles: Float32Array;
  size: Float32Array;
  group: Uint8Array;
}

/** Kirkwood gaps: [a AU, depth, half-width AU] — resonances 3:1, 5:2, 7:3, 2:1 with Jupiter. */
export const KIRKWOOD: readonly [number, number, number][] = [
  [2.502, 0.95, 0.012], [2.825, 0.9, 0.010], [2.958, 0.85, 0.008], [3.279, 0.98, 0.020],
];

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Relative number density of main-belt semi-major axes (inner edge at the 4:1/ν6, Cybeles beyond 2:1). */
export function mainBeltDensity(a: number): number {
  let w = smooth(2.06, 2.16, a) * (0.55 + 0.45 * Math.exp(-(((a - 2.75) / 0.35) ** 2)));
  if (a > 3.28) w = 0.1 * (1 - smooth(3.6, 3.75, a));
  for (const [g, depth, hw] of KIRKWOOD) w *= 1 - depth * Math.exp(-(((a - g) / hw) ** 2));
  return w;
}

export interface Counts { main: number; hungaria: number; hilda: number; trojan: number; kuiper: number; plutino: number; scattered: number }
export const DEFAULT_COUNTS: Counts = { main: 30000, hungaria: 800, hilda: 1500, trojan: 3000, kuiper: 5800, plutino: 1500, scattered: 400 };

const J = ELEMENTS.Jupiter, N = ELEMENTS.Neptune;
const DAYS_PER_CENTURY = 36525;
export const JUPITER = { a: J.e0[0], e: J.e0[1], varpi: J.e0[4] * DEG, lambda0: J.e0[3] * DEG, n: (J.rate[3] / DAYS_PER_CENTURY) * DEG };
export const NEPTUNE = { a: N.e0[0], lambda0: N.e0[3] * DEG, n: (N.rate[3] / DAYS_PER_CENTURY) * DEG };

export function generatePopulation(seed = 20260923, counts: Counts = DEFAULT_COUNTS): Population {
  const rnd = mulberry32(seed);
  const count = Object.values(counts).reduce((s, n) => s + n, 0);
  const aei = new Float32Array(count * 3), angles = new Float32Array(count * 4);
  const size = new Float32Array(count), group = new Uint8Array(count);
  const TAU = Math.PI * 2;

  const uni = (lo: number, hi: number) => lo + (hi - lo) * rnd();
  const rayleigh = (sigma: number, cap: number) => Math.min(cap, sigma * Math.sqrt(-2 * Math.log(1 - rnd())));
  const gauss = (sigma: number) => sigma * Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(TAU * rnd());
  // size-frequency: steep power law, many small, few large
  const bodySize = () => Math.min(3, 0.6 * Math.pow(1 - rnd(), -1 / 2.5));

  let k = 0;
  /** `varpi` is the longitude of perihelion; ω = ϖ − Ω. */
  const push = (g: Group, a: number, e: number, i: number, node: number, varpi: number, M0: number, n: number) => {
    aei.set([a, e, i], k * 3);
    angles.set([node, varpi - node, M0 % TAU, n], k * 4);
    size[k] = bodySize();
    group[k] = g;
    k++;
  };
  const free = (g: Group, a: number, e: number, i: number) =>
    push(g, a, e, i, uni(0, TAU), uni(0, TAU), uni(0, TAU), meanMotion(a));

  for (let c = 0; c < counts.main; c++) {
    let a: number;
    do a = uni(2.06, 3.75); while (rnd() > mainBeltDensity(a));
    free(Group.Main, a, rayleigh(0.1, 0.3), rayleigh(8 * DEG, 30 * DEG));
  }
  for (let c = 0; c < counts.hungaria; c++)
    free(Group.Hungaria, uni(1.78, 2.0), rayleigh(0.05, 0.18), Math.max(10 * DEG, 22 * DEG + gauss(5 * DEG)));

  // Hildas (3:2 with Jupiter): aphelia sit opposite Jupiter and at L4/L5, tracing a triangle
  // in Jupiter's rotating frame. Each is seeded at aphelion opposite Jupiter at a random time τ
  // (aphelion longitude ϖ+π = λ_J+π ⇒ ϖ = λ_J).
  const nHilda = 1.5 * JUPITER.n;
  for (let c = 0; c < counts.hilda; c++) {
    const tau = uni(0, 2 * TAU / JUPITER.n);
    const lambdaJ = JUPITER.lambda0 + JUPITER.n * tau;
    const varpi = lambdaJ + gauss(10 * DEG);
    push(Group.Hilda, 3.97 + gauss(0.03), Math.min(0.3, 0.08 + rayleigh(0.06, 0.22)), rayleigh(5 * DEG, 20 * DEG),
      uni(0, TAU), varpi, Math.PI - nHilda * tau, nHilda);
  }

  // Trojans: 1:1 with Jupiter, leading (L4, +60°) and trailing (L5, −60°) clouds. Their
  // eccentricity vector is Jupiter's (forced) plus a free part, so they share its orbit's wobble.
  for (let c = 0; c < counts.trojan; c++) {
    const lead = c < counts.trojan * 0.6;
    const lambda0 = JUPITER.lambda0 + (lead ? 60 : -60) * DEG + Math.max(-35 * DEG, Math.min(35 * DEG, gauss(12 * DEG)));
    const ef = rayleigh(0.05, 0.12), pf = uni(0, TAU);
    const ex = JUPITER.e * Math.cos(JUPITER.varpi) + ef * Math.cos(pf);
    const ey = JUPITER.e * Math.sin(JUPITER.varpi) + ef * Math.sin(pf);
    const varpi = Math.atan2(ey, ex);
    push(Group.Trojan, JUPITER.a * (1 + gauss(0.012)), Math.hypot(ex, ey), rayleigh(12 * DEG, 35 * DEG),
      uni(0, TAU), varpi, lambda0 - varpi, JUPITER.n);
  }

  // classical Kuiper belt: cold (thin, circular) + hot (thick) components
  for (let c = 0; c < counts.kuiper; c++) {
    const cold = rnd() < 0.55;
    const a = cold ? uni(42, 47.5) : uni(36, 48);
    free(Group.Kuiper, a, cold ? rayleigh(0.04, 0.12) : rayleigh(0.08, 0.25), cold ? rayleigh(2 * DEG, 8 * DEG) : rayleigh(12 * DEG, 40 * DEG));
  }

  // plutinos (3:2 with Neptune): perihelion ~90° away from Neptune, so they never meet it
  const nPlutino = (2 / 3) * NEPTUNE.n;
  for (let c = 0; c < counts.plutino; c++) {
    const tau = uni(0, 3 * TAU / NEPTUNE.n);
    const lambdaN = NEPTUNE.lambda0 + NEPTUNE.n * tau;
    const varpi = lambdaN + (rnd() < 0.5 ? 90 : -90) * DEG + gauss(15 * DEG);
    push(Group.Kuiper, 39.4 + gauss(0.2), uni(0.1, 0.3), rayleigh(10 * DEG, 35 * DEG), uni(0, TAU), varpi, -nPlutino * tau, nPlutino);
  }

  // scattered disk: perihelia near Neptune, aphelia far out
  for (let c = 0; c < counts.scattered; c++) {
    const a = Math.exp(uni(Math.log(50), Math.log(110)));
    const q = uni(30, 40);
    free(Group.Kuiper, a, 1 - q / a, rayleigh(15 * DEG, 45 * DEG));
  }

  return { count, aei, angles, size, group };
}

/** Heliocentric ecliptic position (AU) of body `k` at `days` since J2000 — the CPU twin of the belt shader. */
export function positionAt(p: Population, k: number, days: number): [number, number, number] {
  const a = p.aei[k * 3], e = p.aei[k * 3 + 1], i = p.aei[k * 3 + 2];
  const node = p.angles[k * 4], w = p.angles[k * 4 + 1], M = p.angles[k * 4 + 2] + p.angles[k * 4 + 3] * days;
  let E = M;
  for (let it = 0; it < 6; it++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xo = a * (Math.cos(E) - e), yo = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(node), sO = Math.sin(node), ci = Math.cos(i), si = Math.sin(i);
  return [
    (cw * cO - sw * sO * ci) * xo + (-sw * cO - cw * sO * ci) * yo,
    (cw * sO + sw * cO * ci) * xo + (-sw * sO + cw * cO * ci) * yo,
    (sw * si) * xo + (cw * si) * yo,
  ];
}

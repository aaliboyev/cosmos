/* Keplerian elements per body: [a AU, e, I°, L°, ϖ°, Ω°] at J2000 plus
   per-century rates — the standard low-precision ephemeris formulation. */
import { DEG, normDeg } from './time';

export const AU_KM = 149.6e6;

type Six = [number, number, number, number, number, number];

export const ELEMENTS: Record<string, { e0: Six; rate: Six }> = {
  Mercury: { e0: [0.38710, 0.20563, 7.005, 252.251, 77.457, 48.331], rate: [0.0000037, 0.0000191, -0.0059, 149472.674, 0.160, -0.125] },
  Venus:   { e0: [0.72333, 0.00677, 3.395, 181.980, 131.602, 76.680], rate: [0.0000039, -0.0000041, -0.0008, 58517.816, 0.268, -0.278] },
  Earth:   { e0: [1.00000, 0.01671, -0.00002, 100.464, 102.937, 0.0], rate: [0.0000056, -0.0000044, -0.0134, 35999.372, 0.323, 0.0] },
  Mars:    { e0: [1.52371, 0.09339, 1.850, -4.553, -23.943, 49.560], rate: [0.0000184, 0.0000079, -0.0081, 19140.303, 0.446, -0.292] },
  Jupiter: { e0: [5.20289, 0.04839, 1.304, 34.397, 14.728, 100.474], rate: [-0.0000116, -0.0000133, -0.0018, 3034.746, 0.213, 0.205] },
  Saturn:  { e0: [9.53668, 0.05386, 2.486, 49.954, 92.599, 113.662], rate: [-0.0001251, -0.0000510, 0.0019, 1222.494, -0.419, -0.289] },
  Uranus:  { e0: [19.18916, 0.04726, 0.773, 313.238, 170.954, 74.017], rate: [-0.0001960, -0.0000437, -0.0024, 428.482, 0.405, 0.043] },
  Neptune: { e0: [30.06992, 0.00859, 1.770, -55.120, 44.965, 131.784], rate: [0.0000263, 0.0000051, 0.0004, 218.459, -0.323, -0.006] },
  Pluto:   { e0: [39.48211, 0.24883, 17.140, 238.929, 224.069, 110.303], rate: [-0.0000318, 0.0000052, 0.0000, 145.208, -0.041, -0.010] },
};

export interface Elements {
  a: number;    // AU
  ecc: number;
  i: number;    // rad
  L: number;    // mean longitude, deg
  w: number;    // longitude of perihelion ϖ, deg
  O: number;    // longitude of ascending node Ω, deg
}

export interface Vec3 { x: number; y: number; z: number }

export function elementsAt(name: string, T: number): Elements {
  const { e0, rate } = ELEMENTS[name];
  return {
    a: e0[0] + rate[0] * T,
    ecc: e0[1] + rate[1] * T,
    i: (e0[2] + rate[2] * T) * DEG,
    L: normDeg(e0[3] + rate[3] * T),
    w: e0[4] + rate[4] * T,
    O: e0[5] + rate[5] * T,
  };
}

export function solveKepler(M: number, e: number): number {
  let E = M;
  for (let k = 0; k < 7; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}

/** Heliocentric ecliptic position (AU) at mean anomaly `Mdeg` under `el`. */
export function keplerPos(el: Elements, Mdeg: number): Vec3 {
  const e = el.ecc;
  const E = solveKepler(normDeg(Mdeg) * DEG, e);
  const xo = el.a * (Math.cos(E) - e);
  const yo = el.a * Math.sqrt(1 - e * e) * Math.sin(E);
  const w = (el.w - el.O) * DEG, O = el.O * DEG, i = el.i;
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i);
  return {
    x: (cw * cO - sw * sO * ci) * xo + (-sw * cO - cw * sO * ci) * yo,
    y: (cw * sO + sw * cO * ci) * xo + (-sw * sO + cw * cO * ci) * yo,
    z: (sw * si) * xo + (cw * si) * yo,
  };
}

export function bodyPosAU(name: string, T: number): Vec3 {
  const el = elementsAt(name, T);
  return keplerPos(el, el.L - el.w);
}

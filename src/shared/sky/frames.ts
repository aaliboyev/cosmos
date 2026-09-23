/* Celestial frame rotations as row-major 3×3 matrices (no three dependency, testable).
   Scene frame is ecliptic J2000 with Y = ecliptic north: scene = (x_ecl, z_ecl, −y_ecl). */
import { DEG } from '../../physics/time';

export type Mat3 = [number, number, number, number, number, number, number, number, number];
export type V3 = [number, number, number];

export const OBLIQUITY_J2000 = 23.4392911 * DEG;

/** ICRS (J2000 equatorial) → galactic, Hipparcos convention. */
export const EQ_TO_GAL: Mat3 = [
  -0.0548755604, -0.8734370902, -0.4838350155,
  0.4941094279, -0.4448296300, 0.7469822445,
  -0.8676661490, -0.1980763734, 0.4559837762,
];

const c = Math.cos(OBLIQUITY_J2000), s = Math.sin(OBLIQUITY_J2000);
export const EQ_TO_ECL: Mat3 = [1, 0, 0, 0, c, s, 0, -s, c];
export const ECL_TO_SCENE: Mat3 = [1, 0, 0, 0, 0, 1, 0, -1, 0];

export const mul = (a: Mat3, b: Mat3): Mat3 => {
  const r = new Array(9).fill(0) as Mat3;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return r;
};
export const transpose = (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
export const apply = (m: Mat3, v: V3): V3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

export const EQ_TO_SCENE = mul(ECL_TO_SCENE, EQ_TO_ECL);
export const SCENE_TO_GAL = mul(EQ_TO_GAL, transpose(EQ_TO_SCENE));

/** Unit vector for spherical coordinates (lon/RA, lat/Dec) in degrees. */
export const unit = (lonDeg: number, latDeg: number): V3 => {
  const l = lonDeg * DEG, b = latDeg * DEG;
  return [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
};

/** Inverse of `unit`: [lon 0..360, lat] in degrees. */
export const spherical = (v: V3): [number, number] => {
  const lon = Math.atan2(v[1], v[0]) / DEG;
  return [(lon + 360) % 360, Math.asin(Math.max(-1, Math.min(1, v[2]))) / DEG];
};

const rotZ = (a: number): Mat3 => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
const rotY = (a: number): Mat3 => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
const rotX = (a: number): Mat3 => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];

/** The ESO panorama is not exactly galactic-registered: this maps true galactic directions to
    where the image shows them. Fitted by maximizing overlap of ~1500 BSC stars with the image's
    point sources (4× the unrotated score). */
export const PANORAMA_FIX: Mat3 = mul(rotZ(-3.2 * DEG), mul(rotY(-1.7 * DEG), rotX(-1.0 * DEG)));
export const SCENE_TO_PANORAMA = mul(PANORAMA_FIX, SCENE_TO_GAL);

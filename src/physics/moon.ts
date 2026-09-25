/* The Moon's geocentric position from the leading terms of Meeus ch. 47
   (tables 47.A/B): good to about 0.01°, so eclipse contacts land within a few
   minutes. Rotated back to the J2000 ecliptic the planets' elements use. */
import type { Vec3 } from './ephemeris';
import { DEG } from './time';

export interface MoonGeo {
  lon: number;     // ecliptic longitude, J2000, rad
  lat: number;     // ecliptic latitude, rad
  distKm: number;
}

// [D, M, M', F, Σl (1e-6°), Σr (m)]
const LON_DIST: [number, number, number, number, number, number][] = [
  [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968],
  [0, 0, 2, 0, 213618, -569925], [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138], [2, 0, 1, 0, 53322, -170733],
  [2, -1, 0, 0, 45758, -204586], [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0],
  [0, 0, 1, -2, 10980, 79661], [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208], [2, 1, 0, 0, -6766, 30824],
  [1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650], [2, 0, -3, 0, 3665, 14403],
  [0, 1, -2, 0, -2689, -7003], [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884],
];

// [D, M, M', F, Σb (1e-6°)]
const LAT: [number, number, number, number, number][] = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463], [2, -1, 0, 1, 2211],
  [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870], [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794],
  [0, 0, 0, 3, -1749], [0, 1, -1, 1, -1565], [1, 0, 0, 1, -1491], [0, 1, 1, 1, -1475],
  [0, 1, 1, -1, -1410], [0, 1, 0, -1, -1344], [1, 0, 0, -1, -1335], [0, 0, 3, 1, 1107],
  [4, 0, 0, -1, 1021], [4, 0, -1, 1, 833],
];

// general precession in longitude, degrees per Julian century
const PRECESSION = 1.3969713;

export function moonGeocentric(T: number): MoonGeo {
  const Lp = (218.3164477 + 481267.88123421 * T) * DEG;
  const D = (297.8501921 + 445267.1114034 * T) * DEG;
  const M = (357.5291092 + 35999.0502909 * T) * DEG;
  const Mp = (134.9633964 + 477198.8675055 * T) * DEG;
  const F = (93.2720950 + 483202.0175233 * T) * DEG;
  const A1 = (119.75 + 131.849 * T) * DEG, A2 = (53.09 + 479264.29 * T) * DEG, A3 = (313.45 + 481266.484 * T) * DEG;
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;   // Earth's shrinking eccentricity scales terms in M

  let sl = 3958 * Math.sin(A1) + 1962 * Math.sin(Lp - F) + 318 * Math.sin(A2);
  let sr = 0;
  for (const [d, m, mp, f, l, r] of LON_DIST) {
    const arg = d * D + m * M + mp * Mp + f * F, e = E ** Math.abs(m);
    sl += l * e * Math.sin(arg);
    sr += r * e * Math.cos(arg);
  }
  let sb = -2235 * Math.sin(Lp) + 382 * Math.sin(A3) + 175 * Math.sin(A1 - F) + 175 * Math.sin(A1 + F)
    + 127 * Math.sin(Lp - Mp) - 115 * Math.sin(Lp + Mp);
  for (const [d, m, mp, f, b] of LAT) sb += b * E ** Math.abs(m) * Math.sin(d * D + m * M + mp * Mp + f * F);

  return {
    lon: Lp + (sl * 1e-6 - PRECESSION * T) * DEG,
    lat: sb * 1e-6 * DEG,
    distKm: 385000.56 + sr / 1000,
  };
}

/** Geocentric ecliptic position (J2000), km. */
export function lunarPosKm(T: number): Vec3 {
  const { lon, lat, distKm } = moonGeocentric(T);
  return { x: distKm * Math.cos(lat) * Math.cos(lon), y: distKm * Math.cos(lat) * Math.sin(lon), z: distKm * Math.sin(lat) };
}

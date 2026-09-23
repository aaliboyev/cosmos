/* The Moon's geocentric position from the largest terms of Meeus ch. 47:
   good to a few tenths of a degree, enough to place eclipses on the right day. */
import type { Vec3 } from './ephemeris';
import { DEG } from './time';

export interface MoonGeo {
  lon: number;     // ecliptic longitude, rad
  lat: number;     // ecliptic latitude, rad
  distKm: number;
}

export function moonGeocentric(T: number): MoonGeo {
  const Lp = (218.3165 + 481267.8813 * T) * DEG;
  const D = (297.8502 + 445267.1115 * T) * DEG;
  const M = (357.5291 + 35999.0503 * T) * DEG;
  const Mp = (134.9634 + 477198.8676 * T) * DEG;
  const F = (93.2721 + 483202.0175 * T) * DEG;
  const lon = Lp + (6.289 * Math.sin(Mp) + 1.274 * Math.sin(2 * D - Mp) + 0.658 * Math.sin(2 * D)
    + 0.214 * Math.sin(2 * Mp) - 0.186 * Math.sin(M) - 0.114 * Math.sin(2 * F)) * DEG;
  const lat = (5.128 * Math.sin(F) + 0.281 * Math.sin(Mp + F) + 0.278 * Math.sin(Mp - F)) * DEG;
  const distKm = 385000.56 - 20905.36 * Math.cos(Mp) - 3699.11 * Math.cos(2 * D - Mp) - 2955.97 * Math.cos(2 * D);
  return { lon, lat, distKm };
}

/** Geocentric ecliptic position, km. */
export function lunarPosKm(T: number): Vec3 {
  const { lon, lat, distKm } = moonGeocentric(T);
  return { x: distKm * Math.cos(lat) * Math.cos(lon), y: distKm * Math.cos(lat) * Math.sin(lon), z: distKm * Math.sin(lat) };
}

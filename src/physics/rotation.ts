/* Body orientation from the IAU WGCCRE 2015 model: pole (α0, δ0) drifting per
   century and prime meridian W advancing per day, all in ICRF (J2000 equatorial).
   Periodic terms are omitted; they move poles by < 1° and W by a few degrees.
   Mars uses the IAU 2009 values: the 2015 base pole relies on large periodic terms. */
import poles from '../data/poles.json';
import type { Vec3 } from './ephemeris';
import { DEG } from './time';

export const OBLIQUITY = 23.4392911 * DEG;
const cosE = Math.cos(OBLIQUITY), sinE = Math.sin(OBLIQUITY);

type PoleRow = [number, number, number, number, number, number];
const POLES = poles.bodies as unknown as Record<string, PoleRow>;

export const hasOrientation = (name: string): boolean => name in POLES;

/** ICRF equatorial → J2000 ecliptic */
export function equatorialToEcliptic(v: Vec3): Vec3 {
  return { x: v.x, y: v.y * cosE + v.z * sinE, z: -v.y * sinE + v.z * cosE };
}

export function eclipticToEquatorial(v: Vec3): Vec3 {
  return { x: v.x, y: v.y * cosE - v.z * sinE, z: v.y * sinE + v.z * cosE };
}

/** Unit vector toward (ra, dec), radians. */
export function radec(ra: number, dec: number): Vec3 {
  return { x: Math.cos(dec) * Math.cos(ra), y: Math.cos(dec) * Math.sin(ra), z: Math.sin(dec) };
}

export interface PlaneBasis {
  /** ascending node of the plane on the ICRF equator */
  node: Vec3;
  /** 90° east of node, in the plane */
  q: Vec3;
  pole: Vec3;
}

/** Basis of a plane given its pole's (ra, dec) in radians, all ICRF. */
export function planeBasis(ra: number, dec: number): PlaneBasis {
  const sa = Math.sin(ra), ca = Math.cos(ra), sd = Math.sin(dec), cd = Math.cos(dec);
  return {
    node: { x: -sa, y: ca, z: 0 },
    q: { x: -sd * ca, y: -sd * sa, z: cd },
    pole: { x: cd * ca, y: cd * sa, z: sd },
  };
}

export interface Orientation extends PlaneBasis {
  /** prime meridian angle from the node, radians, eastward about the pole */
  W: number;
  /** sidereal rate in rad/day; negative = retrograde about the IAU pole */
  Wdot: number;
}

/** Orientation at `d` days (TDB ≈ UTC here) since J2000. */
export function orientation(name: string, d: number): Orientation {
  const [ra0, raT, dec0, decT, W0, Wd] = POLES[name];
  const T = d / 36525;
  const basis = planeBasis((ra0 + raT * T) * DEG, (dec0 + decT * T) * DEG);
  const W = ((W0 + Wd * d) % 360) * DEG;
  return { ...basis, W, Wdot: Wd * DEG };
}

/** Body-fixed direction for (east longitude, latitude) in radians → ICRF. */
export function bodyFixedToICRF(o: Orientation, lon: number, lat: number): Vec3 {
  const a = o.W + lon, c = Math.cos(lat);
  const cx = Math.cos(a) * c, cy = Math.sin(a) * c, cz = Math.sin(lat);
  return {
    x: o.node.x * cx + o.q.x * cy + o.pole.x * cz,
    y: o.node.y * cx + o.q.y * cy + o.pole.y * cz,
    z: o.node.z * cx + o.q.z * cy + o.pole.z * cz,
  };
}

/** ICRF direction → body-fixed (east longitude, latitude), radians. */
export function icrfToBodyFixed(o: Orientation, v: Vec3): { lon: number; lat: number } {
  const n = Math.hypot(v.x, v.y, v.z);
  const x = (v.x * o.node.x + v.y * o.node.y + v.z * o.node.z) / n;
  const y = (v.x * o.q.x + v.y * o.q.y + v.z * o.q.z) / n;
  const z = (v.x * o.pole.x + v.y * o.pole.y + v.z * o.pole.z) / n;
  let lon = Math.atan2(y, x) - o.W;
  lon = Math.atan2(Math.sin(lon), Math.cos(lon));
  return { lon, lat: Math.asin(Math.max(-1, Math.min(1, z))) };
}

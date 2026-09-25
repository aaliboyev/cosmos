/* Solar and lunar eclipses from the same geometry the orrery draws: syzygies
   found from the Moon's elongation, then the Sun–Moon–Earth shadow cones at
   closest approach. Times are UTC, good to a few minutes. */
import { AU_KM, bodyPosAU, type Vec3 } from './ephemeris';
import { lunarPosKm } from './moon';
import { centuries } from './time';

export type EclipseKind = 'total' | 'annular' | 'partial' | 'penumbral';

export interface Eclipse {
  body: 'Sun' | 'Moon';   // what is eclipsed
  kind: EclipseKind;
  time: number;           // greatest eclipse, ms UTC
  /** solar: unit vector Earth centre → greatest-eclipse point (or nearest point), ecliptic J2000 */
  point?: Vec3;
}

const R_SUN = 696000, R_EARTH = 6378.14, R_MOON = 1737.4;
// Earth's shadow is enlarged ~2% by its atmosphere (Danjon)
const SHADOW_GROWTH = 1.02;
const HOUR = 3600000, DAY = 86400000;

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: Vec3) => Math.sqrt(dot(a, a));
const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/** Geocentric Sun and Moon, km, ecliptic J2000. */
function sunMoon(ms: number): { sun: Vec3; moon: Vec3 } {
  const T = centuries(ms);
  return { sun: scale(bodyPosAU('Earth', T), -AU_KM), moon: lunarPosKm(T) };
}

/** Moon − Sun ecliptic longitude, radians. */
function elongation(ms: number): number {
  const { sun, moon } = sunMoon(ms);
  return Math.atan2(moon.y, moon.x) - Math.atan2(sun.y, sun.x);
}

function goldenMin(f: (t: number) => number, a: number, b: number, tol: number): number {
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d);
  while (b - a > tol) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
  }
  return (a + b) / 2;
}

/** Earth centre's distance from the Sun→Moon line, km. */
function solarGap(ms: number): number {
  const { sun, moon } = sunMoon(ms);
  const u = sub(moon, sun);
  return len(cross(moon, u)) / len(u);
}

/** Moon centre's distance from the axis of Earth's shadow, km. */
function lunarGap(ms: number): number {
  const { sun, moon } = sunMoon(ms);
  return len(cross(moon, sun)) / len(sun);
}

function solar(t: number): Eclipse | null {
  const time = goldenMin(solarGap, t - 8 * HOUR, t + 8 * HOUR, 20000);
  const { sun, moon } = sunMoon(time);
  const axisLen = len(sub(moon, sun));
  const u = scale(sub(moon, sun), 1 / axisLen);
  const gap = len(cross(moon, u));
  const along = -dot(moon, u);   // Moon → Earth centre, along the axis
  if (gap > R_EARTH + R_MOON + along * (R_SUN + R_MOON) / axisLen) return null;

  // closest point of the axis to Earth's centre; the eclipse point lies under it
  const foot = { x: moon.x + u.x * along, y: moon.y + u.y * along, z: moon.z + u.z * along };
  const central = gap < R_EARTH;
  const toSurface = central ? along - Math.sqrt(R_EARTH * R_EARTH - gap * gap) : along;
  const umbra = R_MOON - toSurface * (R_SUN - R_MOON) / axisLen;   // < 0: antumbra
  const kind: EclipseKind = !central ? 'partial' : umbra > 0 ? 'total' : 'annular';
  const point = central
    ? sub(foot, scale(u, Math.sqrt(R_EARTH * R_EARTH - gap * gap)))
    : foot;
  return { body: 'Sun', kind, time, point: scale(point, 1 / len(point)) };
}

function lunar(t: number): Eclipse | null {
  const time = goldenMin(lunarGap, t - 8 * HOUR, t + 8 * HOUR, 20000);
  const { sun, moon } = sunMoon(time);
  const dSun = len(sun), along = -dot(moon, sun) / dSun;
  const gap = lunarGap(time);
  const umbra = SHADOW_GROWTH * (R_EARTH - along * (R_SUN - R_EARTH) / dSun);
  const penumbra = SHADOW_GROWTH * (R_EARTH + along * (R_SUN + R_EARTH) / dSun);
  const kind: EclipseKind | null = gap + R_MOON < umbra ? 'total'
    : gap - R_MOON < umbra ? 'partial'
    : gap - R_MOON < penumbra ? 'penumbral' : null;
  return kind ? { body: 'Moon', kind, time } : null;
}

/** Every eclipse with greatest eclipse in [from, to), ms UTC, in time order. */
export function findEclipses(from: number, to: number): Eclipse[] {
  const out: Eclipse[] = [];
  // sin(elongation) changes sign at each new (cos > 0) and full (cos < 0) moon
  let t0 = from - DAY, s0 = Math.sin(elongation(t0));
  for (let t1 = t0 + DAY; t1 <= to + DAY; t0 = t1, t1 += DAY) {
    const s1 = Math.sin(elongation(t1));
    if (s0 !== 0 && Math.sign(s0) === Math.sign(s1)) { s0 = s1; continue; }
    let a = t0, b = t1, sa = s0;
    while (b - a > 60000) {
      const m = (a + b) / 2, sm = Math.sin(elongation(m));
      if (Math.sign(sm) === Math.sign(sa)) { a = m; sa = sm; } else b = m;
    }
    const t = (a + b) / 2;
    const e = Math.cos(elongation(t)) > 0 ? solar(t) : lunar(t);
    if (e && e.time >= from && e.time < to) out.push(e);
    s0 = s1;
  }
  return out;
}

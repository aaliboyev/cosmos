/* Planetary satellites from JPL SSD mean elements: closed-form Kepler from each
   moon's epoch, so any date is placed directly. Mean elements only — nodal and
   apsidal precession is ignored, which drifts fast inner moons over decades. */
import moonData from '../data/moons.json';
import { solveKepler, type Vec3 } from './ephemeris';
import { equatorialToEcliptic, orientation, planeBasis, type PlaneBasis } from './rotation';
import { DEG } from './time';

export const FRAME_ECLIPTIC = 0, FRAME_EQUATOR = 1, FRAME_LAPLACE = 2;

export interface MoonElements {
  name: string;
  parent: string;
  aKm: number;
  e: number;
  peri: number;       // argument of periapsis ω, rad
  M0: number;         // mean anomaly at epoch, rad
  inc: number;        // rad, relative to the reference plane
  node: number;       // rad
  periodDays: number;
  epochJD: number;
  frame: number;
  /** reference plane basis in ICRF; null = J2000 ecliptic */
  plane: PlaneBasis | null;
  radiusKm: number | null;
  retrograde: boolean;
}

type Row = [string, string, number, number, number, number, number, number, number, number, number, number | null, number | null, number | null];

export const MOON_ELEMENTS: MoonElements[] = (moonData.moons as Row[]).map(r => {
  const [name, parent, aKm, e, peri, M0, inc, node, periodDays, epochJD, frame, poleRa, poleDec, radiusKm] = r;
  let plane: PlaneBasis | null = null;
  if (frame === FRAME_LAPLACE) plane = planeBasis(poleRa! * DEG, poleDec! * DEG);
  else if (frame === FRAME_EQUATOR) {
    // equator frame pole follows the spin (right-hand rule), so Uranus's moons
    // circle the way Uranus turns even though its IAU pole points the other way
    const o = orientation(parent, 0);
    plane = o.Wdot < 0 ? planeBasis(Math.atan2(-o.pole.y, -o.pole.x), Math.asin(-o.pole.z)) : o;
  }
  return {
    name, parent, aKm, e, peri: peri * DEG, M0: M0 * DEG, inc: inc * DEG, node: node * DEG,
    periodDays, epochJD, frame, plane, radiusKm, retrograde: inc > 90,
  };
});

export const moonsOf = (parent: string): MoonElements[] => MOON_ELEMENTS.filter(m => m.parent === parent);

/** Position relative to the parent, km, J2000 ecliptic; `out` is reused. */
export function moonPosKm(m: MoonElements, jd: number, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  const M = (m.M0 + (2 * Math.PI / m.periodDays) * (jd - m.epochJD)) % (2 * Math.PI);
  return orbitPointKm(m, M, true, out);
}

/** Point on the orbit at anomaly `angle` — mean anomaly if `isMean`, else eccentric. */
export function orbitPointKm(m: MoonElements, angle: number, isMean: boolean, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  const E = isMean ? solveKepler(angle, m.e) : angle;
  const xo = m.aKm * (Math.cos(E) - m.e);
  const yo = m.aKm * Math.sqrt(1 - m.e * m.e) * Math.sin(E);
  const cw = Math.cos(m.peri), sw = Math.sin(m.peri), cO = Math.cos(m.node), sO = Math.sin(m.node);
  const ci = Math.cos(m.inc), si = Math.sin(m.inc);
  // position in the reference plane frame (x toward its node origin, z along its pole)
  const x = (cw * cO - sw * sO * ci) * xo + (-sw * cO - cw * sO * ci) * yo;
  const y = (cw * sO + sw * cO * ci) * xo + (-sw * sO + cw * cO * ci) * yo;
  const z = (sw * si) * xo + (cw * si) * yo;
  if (!m.plane) { out.x = x; out.y = y; out.z = z; return out; }
  const { node, q, pole } = m.plane;
  const eq = {
    x: node.x * x + q.x * y + pole.x * z,
    y: node.y * x + q.y * y + pole.y * z,
    z: node.z * x + q.z * y + pole.z * z,
  };
  const ecl = equatorialToEcliptic(eq);
  out.x = ecl.x; out.y = ecl.y; out.z = ecl.z;
  return out;
}

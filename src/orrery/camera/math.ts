/* Pure camera math: local-axis rotation, attitude readout, adaptive speed, unit conversion. */
import { Matrix4, Quaternion, Vector3 } from 'three';
import { AU_KM } from '../../physics/ephemeris';

const DEG = 180 / Math.PI;
const WORLD_UP = new Vector3(0, 1, 0);
const BACK = new Vector3(0, 0, -1);
const dq = new Quaternion(), axis = new Vector3();
const f = new Vector3(), camUp = new Vector3(), refUp = new Vector3(), refRight = new Vector3();
const lookM = new Matrix4(), lookDir = new Vector3();

/** Rotate `q` about its own local axes by the rotation vector (x = pitch, y = yaw, z = roll), radians. */
export function rotateLocal(q: Quaternion, x: number, y: number, z: number): Quaternion {
  const angle = Math.hypot(x, y, z);
  if (angle < 1e-12) return q;
  dq.setFromAxisAngle(axis.set(x / angle, y / angle, z / angle), angle);
  return q.multiply(dq).normalize();
}

export interface Attitude { headingDeg: number; pitchDeg: number; rollDeg: number }

/** Heading = ecliptic longitude of the view direction; pitch above the ecliptic; roll right-positive. */
export function attitude(q: Quaternion): Attitude {
  f.set(0, 0, -1).applyQuaternion(q);
  const up = camUp.set(0, 1, 0).applyQuaternion(q);
  // scene (x, y, z) = ecliptic (x, z, −y)
  const headingDeg = ((Math.atan2(-f.z, f.x) * DEG) % 360 + 360) % 360;
  const pitchDeg = Math.asin(Math.max(-1, Math.min(1, f.y))) * DEG;
  refUp.copy(WORLD_UP).addScaledVector(f, -f.y);
  if (refUp.lengthSq() < 1e-8) return { headingDeg, pitchDeg, rollDeg: 0 };
  refUp.normalize();
  refRight.crossVectors(f, refUp);
  const rollDeg = Math.atan2(up.dot(refRight), up.dot(refUp)) * DEG;
  return { headingDeg, pitchDeg, rollDeg };
}

/** Camera orientation looking from `eye` at `target`, keeping `up` as close as possible. */
export function lookQuaternion(eye: Vector3, target: Vector3, up: Vector3, out = new Quaternion()): Quaternion {
  const dir = lookDir.subVectors(target, eye).normalize();
  let u = up;
  if (Math.abs(dir.dot(up)) > 0.999) u = Math.abs(dir.y) < 0.9 ? WORLD_UP : BACK;
  lookM.lookAt(eye, target, u);
  return out.setFromRotationMatrix(lookM);
}

/** Fraction of the surface distance covered per second: 0.25 at mid throttle, 1/64..4 over the range. */
export const throttleFactor = (throttle: number): number => 0.25 * Math.pow(16, 2 * throttle - 1);

/** Scene units/s: proportional to the distance to the nearest surface, so approach is gentle and leaving is quick. */
export function flySpeed(surfaceDist: number, throttle: number, boost: boolean): number {
  const base = Math.max(surfaceDist, 1e-5);
  return Math.min(base * throttleFactor(throttle) * (boost ? 5 : 1), 50000);
}

/** Frame-rate independent smoothing weight for rate `k` (1/s). */
export const damp = (k: number, dt: number): number => 1 - Math.exp(-k * dt);

export const easeInOutCubic = (t: number): number => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Heliocentric scene distance → AU, inverting the display mapping. */
export function sceneToAU(sceneDist: number, trueScale: boolean, auScene: number, distPow: number): number {
  return trueScale ? sceneDist / auScene : Math.pow(sceneDist / auScene, 1 / distPow);
}

/** km per scene unit at heliocentric scene distance `sceneDist`; in compressed mode, the local radial derivative. */
export function kmPerUnit(sceneDist: number, trueScale: boolean, auScene: number, distPow: number): number {
  if (trueScale) return AU_KM / auScene;
  const au = Math.max(sceneToAU(sceneDist, false, auScene, distPow), 1e-3);
  return AU_KM / (auScene * distPow * Math.pow(au, distPow - 1));
}

/** 0 within 6 displayed radii of a body (its own km scale applies), 1 beyond 30 (the heliocentric mapping applies). */
export function farWeight(dScene: number, rScene: number): number {
  const x = Math.log(Math.max(dScene, 1e-12) / Math.max(rScene, 1e-12));
  return Math.min(1, Math.max(0, (x - Math.log(6)) / (Math.log(30) - Math.log(6))));
}

const logLerp = (a: number, b: number, t: number): number =>
  a > 0 && b > 0 ? Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t) : a + (b - a) * t;

/**
 * km per scene unit near a body: its displayed radius stands for its real radius
 * (radii are exaggerated in compressed mode), blending out to `helioKmPerUnit` far away.
 */
export function kmPerUnitNear(dScene: number, rScene: number, radiusKm: number, helioKmPerUnit: number): number {
  return logLerp(radiusKm / Math.max(rScene, 1e-12), helioKmPerUnit, farWeight(dScene, rScene));
}

/** True center distance (km): body-scaled when close, `farKm` (heliocentric inverse) far away. */
export function trueDistanceKm(dScene: number, rScene: number, radiusKm: number, farKm: number): number {
  const nearKm = dScene * radiusKm / Math.max(rScene, 1e-12);
  return logLerp(nearKm, farKm, farWeight(dScene, rScene));
}

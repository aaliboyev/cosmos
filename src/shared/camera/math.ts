/* Pure camera math: local-axis rotation, attitude readout, adaptive speed. */
import { Matrix4, Quaternion, Vector3 } from 'three';

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

/** Fraction of the surface distance covered per second: 0.35 at mid throttle, ×1/16..×16 of that over the range. */
export const throttleFactor = (throttle: number): number => 0.35 * Math.pow(16, 2 * throttle - 1);

/** Scene units/s: proportional to the distance to the nearest surface, so approach is gentle and leaving is quick. */
export function flySpeed(surfaceDist: number, throttle: number, boost: boolean): number {
  const base = Math.max(surfaceDist, 1e-5);
  return Math.min(base * throttleFactor(throttle) * (boost ? 5 : 1), 50000);
}

/** Frame-rate independent smoothing weight for rate `k` (1/s). */
export const damp = (k: number, dt: number): number => 1 - Math.exp(-k * dt);

export const easeInOutCubic = (t: number): number => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

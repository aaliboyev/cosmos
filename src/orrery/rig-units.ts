/* Flight-readout units for the orrery: compressed mode exaggerates radii and
   squeezes distances, so near a body its own radius sets the km scale and far
   away the inverse of the heliocentric mapping does, with a log blend between. */
import type { Vector3 } from 'three';
import { AU_KM } from '../physics/ephemeris';
import type { RigBody, RigUnits } from '../shared/camera';
import { AU_SCENE, DIST_POW, isTrueScale } from './scale';

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

/** Units in km, relative to the Sun (`sun`): distance for the nearest-body readout, km per scene unit for speed. */
export function orreryUnits(sun: RigBody): RigUnits {
  const auOf = (v: Vector3, trueScale: boolean): [number, number, number] => {
    const x = v.x - sun.position.x, y = v.y - sun.position.y, z = v.z - sun.position.z;
    const d = Math.hypot(x, y, z);
    const k = d > 0 ? sceneToAU(d, trueScale, AU_SCENE, DIST_POW) / d : 0;
    return [x * k, y * k, z * k];
  };
  return {
    distance(cam, b) {
      const trueScale = isTrueScale();
      const [cx, cy, cz] = auOf(cam, trueScale), [bx, by, bz] = auOf(b.position, trueScale);
      const farKm = Math.hypot(cx - bx, cy - by, cz - bz) * AU_KM;
      return trueDistanceKm(cam.distanceTo(b.position), b.radius(), b.radiusKm, farKm);
    },
    perSceneUnit(cam, nearest) {
      const helioKm = kmPerUnit(cam.distanceTo(sun.position), isTrueScale(), AU_SCENE, DIST_POW);
      return kmPerUnitNear(cam.distanceTo(nearest.position), nearest.radius(), nearest.radiusKm, helioKm);
    },
  };
}

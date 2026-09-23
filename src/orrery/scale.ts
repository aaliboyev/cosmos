/* Compressed mode (AU^0.62, exaggerated radii) keeps the system walkable;
   true scale is linear AU with real radii. */
import { Vector3 } from 'three';
import { AU_KM, type Vec3 } from '../physics/ephemeris';
import { toggles } from './state';

export const AU_SCENE = 38;   // 1 AU in scene units
export const DIST_POW = 0.62;

export const isTrueScale = (): boolean => toggles.get().trueScale;

export const distScene = (au: number): number =>
  isTrueScale() ? au * AU_SCENE : Math.pow(au, DIST_POW) * AU_SCENE;

export const trueRadius = (radiusKm: number): number => (radiusKm / AU_KM) * AU_SCENE;

/** Ecliptic (x, y, z) → scene (x, z, −y): scene Y is ecliptic north. */
export const eclipticToScene = (v: Vec3, out = new Vector3()): Vector3 => out.set(v.x, v.z, -v.y);

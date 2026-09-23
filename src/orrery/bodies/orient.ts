import { Matrix4, Vector3 } from 'three';
import type { PlaneBasis } from '../../physics/rotation';
import { equatorialToEcliptic } from '../../physics/rotation';
import { eclipticToScene } from '../scale';

const x = new Vector3(), y = new Vector3(), z = new Vector3();

/** Rotation taking mesh-local axes to the body frame at W = 0: local +x → node,
    +y → pole, −z → 90° east (three's sphere UVs put east longitude toward −z). */
export function basisToScene(b: PlaneBasis, out: Matrix4): Matrix4 {
  eclipticToScene(equatorialToEcliptic(b.node), x);
  eclipticToScene(equatorialToEcliptic(b.pole), y);
  eclipticToScene(equatorialToEcliptic(b.q), z).negate();
  return out.makeBasis(x, y, z);
}

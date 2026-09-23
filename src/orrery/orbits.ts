/* Orbit lines, shaped from current-epoch elements; rebuilt on scale toggle. */
import { BufferGeometry, Group, Line, LineBasicMaterial, Vector3, type Scene } from 'three';
import { BODIES } from '../data/bodies';
import { elementsAt, keplerPos } from '../physics/ephemeris';
import { distScene, eclipticToScene } from './scale';

export interface Orbits { group: Group; rebuild(T: number): void }

export function createOrbits(scene: Scene): Orbits {
  const group = new Group();
  scene.add(group);
  return {
    group,
    rebuild(T) {
      group.children.forEach(c => (c as Line).geometry.dispose());
      group.clear();
      for (const b of BODIES) {
        const el = elementsAt(b.name, T);
        const pts: Vector3[] = [];
        for (let k = 0; k <= 256; k++) {
          const p = keplerPos(el, (k / 256) * 360);
          pts.push(eclipticToScene(p).normalize().multiplyScalar(distScene(Math.hypot(p.x, p.y, p.z))));
        }
        group.add(new Line(new BufferGeometry().setFromPoints(pts), new LineBasicMaterial({
          color: b.name === 'Pluto' ? 0x5a5478 : 0x39415e, transparent: true, opacity: .55 })));
      }
    },
  };
}

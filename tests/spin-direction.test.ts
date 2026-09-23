import { describe, expect, it } from 'vitest';
import { Matrix4, Object3D, Vector3 } from 'three';
import { orientation } from '../src/physics/rotation';
import { basisToScene } from '../src/orrery/bodies/orient';

/** Spin axis of the rendered mesh, in scene coordinates (scene +y = ecliptic north). */
function renderedSpinAxis(name: string): Vector3 {
  const tilt = new Object3D(), mesh = new Object3D();
  tilt.add(mesh);
  const d = 9000;
  const at = (days: number) => {
    const o = orientation(name, days);
    tilt.quaternion.setFromRotationMatrix(basisToScene(o, new Matrix4()));
    mesh.rotation.y = o.W;
    tilt.updateMatrixWorld(true);
    return mesh.localToWorld(new Vector3(1, 0, 0));
  };
  // a quarter-ish turn in a small step: rotation axis from successive equator points
  const o = orientation(name, d);
  const step = (Math.PI / 8) / Math.abs(o.Wdot);
  const a = at(d), b = at(d + step);
  return a.cross(b).normalize();
}

describe('rendered spin direction', () => {
  it.each(['Mercury', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Neptune'])('%s spins prograde', name => {
    expect(renderedSpinAxis(name).y).toBeGreaterThan(0.8);
  });
  it('Venus spins retrograde, nearly upside down', () => {
    expect(renderedSpinAxis('Venus').y).toBeLessThan(-0.99);
  });
  it('Uranus spins on its side, just past retrograde', () => {
    const y = renderedSpinAxis('Uranus').y;
    expect(y).toBeLessThan(0);
    expect(y).toBeGreaterThan(-0.3);
  });
  it('Pluto spins retrograde', () => {
    expect(renderedSpinAxis('Pluto').y).toBeLessThan(0);
  });
});

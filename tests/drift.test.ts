import { describe, expect, it } from 'vitest';
import { createDrift } from '../src/orrery/drift';

describe('galactic drift', () => {
  it('heads toward galactic longitude 90°: ecliptic latitude ≈ +59.6°, longitude ≈ 347°', () => {
    const d = createDrift().advance(1).clone().normalize();
    // scene = (x_ecl, z_ecl, −y_ecl)
    expect(Math.asin(d.y) * 180 / Math.PI).toBeCloseTo(59.6, 0);
    expect(((Math.atan2(-d.z, d.x) * 180 / Math.PI) + 360) % 360).toBeCloseTo(347.3, 0);
  });
});

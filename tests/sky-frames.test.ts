import { describe, expect, it } from 'vitest';
import { EQ_TO_GAL, EQ_TO_SCENE, SCENE_TO_GAL, apply, spherical, transpose, unit } from '../src/orrery/sky/frames';

const angle = (a: number[], b: number[]) =>
  Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * 180 / Math.PI;

describe('celestial frames', () => {
  it('puts the galactic center at RA 266.405°, Dec −28.936°', () => {
    const [ra, dec] = spherical(apply(transpose(EQ_TO_GAL), [1, 0, 0]));
    expect(ra).toBeCloseTo(266.405, 2);
    expect(dec).toBeCloseTo(-28.936, 2);
  });

  it('puts the north galactic pole at RA 192.86°, Dec +27.13°', () => {
    const [ra, dec] = spherical(apply(transpose(EQ_TO_GAL), [0, 0, 1]));
    expect(ra).toBeCloseTo(192.859, 2);
    expect(dec).toBeCloseTo(27.128, 2);
  });

  it('maps the ecliptic north pole (RA 270°, Dec 66.56°) to scene +Y', () => {
    const v = apply(EQ_TO_SCENE, unit(270, 90 - 23.4392911));
    expect(angle(v, [0, 1, 0])).toBeLessThan(1e-6);
  });

  it('maps the vernal equinox to scene +X and ecliptic λ=90° to scene −Z', () => {
    expect(angle(apply(EQ_TO_SCENE, unit(0, 0)), [1, 0, 0])).toBeLessThan(1e-6);
    // λ=90°, β=0 is RA 90°, Dec +ε
    expect(angle(apply(EQ_TO_SCENE, unit(90, 23.4392911)), [0, 0, -1])).toBeLessThan(1e-6);
  });

  it('round-trips Sirius from scene to galactic l=227.23°, b=−8.89°', () => {
    const scene = apply(EQ_TO_SCENE, unit(101.287, -16.716));
    const [l, b] = spherical(apply(SCENE_TO_GAL, scene));
    expect(l).toBeCloseTo(227.23, 1);
    expect(b).toBeCloseTo(-8.89, 1);
  });
});

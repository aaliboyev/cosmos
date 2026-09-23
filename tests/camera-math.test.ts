import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { attitude, farWeight, flySpeed, kmPerUnit, kmPerUnitNear, lookQuaternion, rotateLocal, sceneToAU, throttleFactor, trueDistanceKm } from '../src/orrery/camera/math';
import { AU_KM } from '../src/physics/ephemeris';

const fwdOf = (q: Quaternion) => new Vector3(0, 0, -1).applyQuaternion(q);

describe('rotateLocal', () => {
  it('pitches continuously over the pole without flipping or NaN', () => {
    const q = new Quaternion();
    let prev = fwdOf(q);
    const step = (200 / 400) * Math.PI / 180;
    for (let i = 0; i < 400; i++) {
      rotateLocal(q, step, 0, 0);
      const f = fwdOf(q);
      expect(Number.isFinite(f.x + f.y + f.z)).toBe(true);
      // each step moves the view by exactly the step angle: no sudden flip at the pole
      expect(f.angleTo(prev)).toBeCloseTo(step, 6);
      prev = f;
    }
    expect(q.length()).toBeCloseTo(1, 9);
    // 200° of pitch from level: past the zenith, looking back and 20° below the horizon
    const a = attitude(q);
    expect(a.pitchDeg).toBeCloseTo(-20, 4);
  });

  it('rolls about the view axis without moving it', () => {
    const q = new Quaternion();
    rotateLocal(q, 0, 0, Math.PI / 3);
    expect(fwdOf(q).distanceTo(new Vector3(0, 0, -1))).toBeLessThan(1e-9);
    expect(attitude(q).rollDeg).toBeCloseTo(-60, 6);   // +z roll tilts up to the left
  });
});

describe('attitude', () => {
  it('reads heading as ecliptic longitude and pitch as elevation', () => {
    const q = new Quaternion();
    // scene −z is ecliptic +y: longitude 90°
    expect(attitude(q).headingDeg).toBeCloseTo(90, 6);
    lookQuaternion(new Vector3(), new Vector3(1, 1, 0), new Vector3(0, 1, 0), q);
    const a = attitude(q);
    expect(a.headingDeg).toBeCloseTo(0, 6);
    expect(a.pitchDeg).toBeCloseTo(45, 6);
    expect(a.rollDeg).toBeCloseTo(0, 6);
  });
});

describe('flySpeed', () => {
  it('scales with distance to the surface and throttle', () => {
    expect(flySpeed(10, 0.5, false)).toBeCloseTo(2.5);
    expect(flySpeed(0.001, 0.5, false)).toBeCloseTo(0.00025);
    expect(flySpeed(10, 0.5, true)).toBeCloseTo(12.5);
    expect(throttleFactor(1)).toBeCloseTo(4);
    expect(throttleFactor(0)).toBeCloseTo(1 / 64);
    expect(flySpeed(0, 0.5, false)).toBeGreaterThan(0);
    expect(flySpeed(1e9, 1, true)).toBe(50000);
  });
});

describe('unit conversion', () => {
  it('inverts the display mapping', () => {
    expect(sceneToAU(38 * 5.2, true, 38, 0.62)).toBeCloseTo(5.2);
    expect(sceneToAU(38 * Math.pow(5.2, 0.62), false, 38, 0.62)).toBeCloseTo(5.2);
    expect(kmPerUnit(100, true, 38, 0.62)).toBeCloseTo(AU_KM / 38);
    // compressed at 1 AU: d(scene)/d(AU) = 38 · 0.62
    expect(kmPerUnit(38, false, 38, 0.62)).toBeCloseTo(AU_KM / (38 * 0.62));
  });
});

describe('readouts near a body (compressed mode)', () => {
  // Saturn: 58,232 km shown as 4.7 scene units, at 9.5 AU
  const r = 4.7, rKm = 58232, helioKm = kmPerUnit(38 * Math.pow(9.5, 0.62), false, 38, 0.62);

  it('uses the body scale close in and the heliocentric scale far out', () => {
    expect(farWeight(3 * r, r)).toBe(0);
    expect(farWeight(100 * r, r)).toBe(1);
    expect(kmPerUnitNear(3 * r, r, rKm, helioKm)).toBeCloseTo(rKm / r, 6);
    expect(kmPerUnitNear(100 * r, r, rKm, helioKm)).toBeCloseTo(helioKm, 0);
    // moving one displayed radius per second at 3 radii reads as one real radius per second
    expect(1 * r * kmPerUnitNear(3 * r, r, rKm, helioKm)).toBeCloseTo(rKm, 3);
  });

  it('reports true distance in real radii when close', () => {
    const farKm = 0.5 * AU_KM;   // what the heliocentric inverse would say
    expect(trueDistanceKm(3 * r, r, rKm, farKm)).toBeCloseTo(3 * rKm, 3);
    expect(trueDistanceKm(100 * r, r, rKm, farKm)).toBeCloseTo(farKm, 0);
    // blend is monotonic between the two regimes
    let prev = 0;
    for (let k = 6; k <= 30; k += 1) {
      const d = trueDistanceKm(k * r, r, rKm, farKm);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });

  it('crossing 16 AU in 2 s reads thousands of c (the fly-to from the overview is that fast)', () => {
    const units = 38 * (Math.pow(20, 0.62) - Math.pow(5.2, 0.62));
    const avgKmPerUnit = 16 * AU_KM / units;
    const c = (units / 2) * avgKmPerUnit / 299792.458;
    expect(c).toBeGreaterThan(3000);
    expect(c).toBeLessThan(5000);
  });
});

import { describe, expect, it } from 'vitest';
import { bodyPosAU, elementsAt, keplerPos, solveKepler } from '../src/physics/ephemeris';
import { centuries } from '../src/physics/time';

const lonDeg = (p: { x: number; y: number }) => ((Math.atan2(p.y, p.x) * 180) / Math.PI + 360) % 360;
const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('solveKepler', () => {
  it('satisfies Kepler’s equation at high eccentricity', () => {
    for (const e of [0.2, 0.6, 0.9]) {
      for (let M = 0.1; M < 2 * Math.PI; M += 0.7) {
        const E = solveKepler(M, e);
        expect(E - e * Math.sin(E)).toBeCloseTo(M, 9);
      }
    }
  });
});

describe('ephemeris', () => {
  it('keeps Earth between perihelion and aphelion', () => {
    const start = Date.UTC(2026, 0, 1);
    for (let d = 0; d < 366; d += 5) {
      const p = bodyPosAU('Earth', centuries(start + d * 86400000));
      const r = Math.hypot(p.x, p.y, p.z);
      expect(r).toBeGreaterThan(0.9832);
      expect(r).toBeLessThan(1.0168);
    }
  });

  it('traces an orbit whose extremes match a(1±e)', () => {
    const el = elementsAt('Mars', 0);
    const peri = keplerPos(el, 0), apo = keplerPos(el, 180);
    expect(Math.hypot(peri.x, peri.y, peri.z)).toBeCloseTo(el.a * (1 - el.ecc), 6);
    expect(Math.hypot(apo.x, apo.y, apo.z)).toBeCloseTo(el.a * (1 + el.ecc), 6);
  });

  // JPL Horizons, heliocentric ecliptic J2000 vectors, 2026-01-01 00:00 TDB
  const HORIZONS = {
    Mars: { x: 0.3405796768622151, y: -1.387002015945254, z: -0.03741722678770108 },
    Jupiter: { x: -1.694003692586729, y: 4.928882358715955, z: 0.01742622062607817 },
  };

  it.each(Object.entries(HORIZONS))('%s longitude within 1° and distance within 1%% of Horizons', (name, ref) => {
    const p = bodyPosAU(name, centuries(Date.UTC(2026, 0, 1) - 69184));   // TDB − UTC ≈ 69.2 s
    expect(angleDiff(lonDeg(p), lonDeg(ref))).toBeLessThan(1);
    const r = Math.hypot(p.x, p.y, p.z), rRef = Math.hypot(ref.x, ref.y, ref.z);
    expect(Math.abs(r - rRef) / rRef).toBeLessThan(0.01);
  });
});

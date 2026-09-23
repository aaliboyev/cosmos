import { describe, expect, it } from 'vitest';
import { bodyPosAU, elementsAt, type Vec3 } from '../src/physics/ephemeris';
import { lunarPosKm } from '../src/physics/moon';
import { moonPosKm, moonsOf } from '../src/physics/moons';
import { eclipticToEquatorial, equatorialToEcliptic, icrfToBodyFixed, orientation } from '../src/physics/rotation';
import { centuries, julianDate } from '../src/physics/time';

const R2D = 180 / Math.PI;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const daysAt = (ms: number) => (ms - J2000_MS) / 86400000;
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a: Vec3) => { const n = Math.hypot(a.x, a.y, a.z); return { x: a.x / n, y: a.y / n, z: a.z / n }; };
const cross = (a: Vec3, b: Vec3) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const angle = (a: Vec3, b: Vec3) => Math.acos(Math.max(-1, Math.min(1, dot(norm(a), norm(b))))) * R2D;

/** Spin axis (right-hand rule) in the ecliptic frame. */
function spinPole(name: string): Vec3 {
  const o = orientation(name, 0);
  const s = o.Wdot < 0 ? -1 : 1;
  return equatorialToEcliptic({ x: o.pole.x * s, y: o.pole.y * s, z: o.pole.z * s });
}

describe('IAU orientation', () => {
  it.each([
    ['Mercury', 0.03], ['Venus', 177.4], ['Earth', 23.44], ['Mars', 25.19], ['Jupiter', 3.13],
    ['Saturn', 26.73], ['Uranus', 97.77], ['Neptune', 28.32], ['Pluto', 119.6],
  ])('%s obliquity to its orbit is %f°', (name, expected) => {
    const el = elementsAt(name, 0);
    const O = el.O / R2D;
    const orbitNormal = { x: Math.sin(el.i) * Math.sin(O), y: -Math.sin(el.i) * Math.cos(O), z: Math.cos(el.i) };
    expect(Math.abs(angle(spinPole(name), orbitNormal) - expected)).toBeLessThan(1);
  });

  it('puts the Sun over Greenwich at noon on the March equinox (± equation of time)', () => {
    const ms = Date.UTC(2026, 2, 20, 12);
    const earth = bodyPosAU('Earth', centuries(ms));
    const sunDir = eclipticToEquatorial({ x: -earth.x, y: -earth.y, z: -earth.z });
    const { lon, lat } = icrfToBodyFixed(orientation('Earth', daysAt(ms)), sunDir);
    // equation of time ≈ −7.5 min on 20 March → Sun still 1.9° east of Greenwich
    expect(Math.abs(lon * R2D - 1.9)).toBeLessThan(1.5);
    expect(Math.abs(lat * R2D)).toBeLessThan(0.5);
  });

  it('puts the subsolar point on the Tropic of Cancer at the June solstice', () => {
    const ms = Date.UTC(2026, 5, 21, 8, 24);
    const earth = bodyPosAU('Earth', centuries(ms));
    const { lat } = icrfToBodyFixed(orientation('Earth', daysAt(ms)), eclipticToEquatorial({ x: -earth.x, y: -earth.y, z: -earth.z }));
    expect(Math.abs(lat * R2D - 23.44)).toBeLessThan(0.3);
  });
});

describe('the Moon', () => {
  it('sits opposite the Sun, near the node, at the 3 March 2026 total lunar eclipse', () => {
    const T = centuries(Date.UTC(2026, 2, 3, 11, 33));
    const earth = bodyPosAU('Earth', T);
    const moon = lunarPosKm(T);
    expect(angle(moon, earth)).toBeLessThan(1.5);   // anti-solar direction from Earth is +earth
    expect(Math.abs(Math.asin(moon.z / Math.hypot(moon.x, moon.y, moon.z)) * R2D)).toBeLessThan(0.6);
  });
});

describe('satellites', () => {
  const jd = julianDate(Date.UTC(2026, 8, 23));
  const angMom = (name: string, parent: string) => {
    const m = moonsOf(parent).find(x => x.name === name)!;
    const p = moonPosKm(m, jd), q = moonPosKm(m, jd + m.periodDays / 50);
    return { m, h: cross(p, { x: q.x - p.x, y: q.y - p.y, z: q.z - p.z }), r: Math.hypot(p.x, p.y, p.z) };
  };

  it('keeps the Galilean moons in Jupiter’s equator, orbiting with its spin', () => {
    for (const name of ['Io', 'Europa', 'Ganymede', 'Callisto']) {
      expect(angle(angMom(name, 'Jupiter').h, spinPole('Jupiter'))).toBeLessThan(1);
    }
  });

  it('has Uranus’s moons circle the way Uranus spins', () => {
    for (const name of ['Miranda', 'Ariel', 'Titania', 'Oberon']) {
      expect(angle(angMom(name, 'Uranus').h, spinPole('Uranus'))).toBeLessThan(5);
    }
  });

  it('has Triton orbit retrograde', () => {
    const { m, h } = angMom('Triton', 'Neptune');
    expect(m.retrograde).toBe(true);
    expect(angle(h, spinPole('Neptune'))).toBeGreaterThan(150);
  });

  it('keeps near-circular moons at their semi-major axis and closes each orbit', () => {
    const { m, r } = angMom('Titan', 'Saturn');
    expect(Math.abs(r - m.aKm) / m.aKm).toBeLessThan(m.e + 1e-3);
    const a = moonPosKm(m, jd), b = moonPosKm(m, jd + m.periodDays);
    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(1);
  });

  it('counts the known moons per planet', () => {
    expect(moonsOf('Mars').length).toBe(2);
    expect(moonsOf('Neptune').length).toBe(16);
  });
});

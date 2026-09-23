import { describe, expect, it } from 'vitest';
import { DEFAULT_COUNTS, Group, JUPITER, generatePopulation, positionAt } from '../src/physics/belt';
import { bodyPosAU } from '../src/physics/ephemeris';
import { centuries, julianDate } from '../src/physics/time';

const pop = generatePopulation();
const DAYS_2026 = julianDate(Date.UTC(2026, 8, 23)) - 2451545;
const rel = (lon: number, ref: number) => ((((lon - ref) * 180) / Math.PI + 540) % 360) - 180;
const lonOf = (v: number[]) => Math.atan2(v[1], v[0]);
const indices = (g: Group) => [...pop.group.keys()].filter(k => pop.group[k] === g);

describe('small-body populations', () => {
  it('is deterministic and sized as requested', () => {
    expect(pop.count).toBe(Object.values(DEFAULT_COUNTS).reduce((s, n) => s + n, 0));
    expect(generatePopulation().aei.slice(0, 30)).toEqual(pop.aei.slice(0, 30));
  });

  it('carves the 3:1 Kirkwood gap at 2.50 AU', () => {
    const main = indices(Group.Main).map(k => pop.aei[k * 3]);
    const inBand = (lo: number, hi: number) => main.filter(a => a >= lo && a < hi).length;
    expect(inBand(2.495, 2.51)).toBeLessThan(inBand(2.45, 2.465) * 0.25);
  });

  it('keeps Trojans ±60° from Jupiter in 2026', () => {
    const jup = bodyPosAU('Jupiter', centuries(Date.UTC(2026, 8, 23)));
    const lj = Math.atan2(jup.y, jup.x);
    const offsets = indices(Group.Trojan).map(k => rel(lonOf(positionAt(pop, k, DAYS_2026)), lj));
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean(offsets.filter(o => o > 0))).toBeCloseTo(60, -1);
    expect(mean(offsets.filter(o => o < 0))).toBeCloseTo(-60, -1);
  });

  it('puts Hilda aphelia at L3/L4/L5 relative to Jupiter', () => {
    // bodies currently far from the Sun (near aphelion) cluster at 180°, +60°, −60°
    const lj = JUPITER.lambda0 + JUPITER.n * DAYS_2026;
    const far = indices(Group.Hilda).map(k => positionAt(pop, k, DAYS_2026)).filter(v => Math.hypot(v[0], v[1]) > 4.3);
    const nearCorner = far.filter(v => {
      const o = rel(lonOf(v), lj);
      return [180, 60, -60].some(c => Math.abs(((o - c + 540) % 360) - 180) < 30);
    });
    expect(far.length).toBeGreaterThan(50);
    expect(nearCorner.length / far.length).toBeGreaterThan(0.8);
  });

  it('moves bodies with the date (no accumulated state)', () => {
    const k = indices(Group.Main)[0];
    const a = positionAt(pop, k, 0), b = positionAt(pop, k, 365);
    expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeGreaterThan(0.1);
    expect(positionAt(pop, k, 365)).toEqual(b);
  });
});

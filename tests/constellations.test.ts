import { describe, expect, it } from 'vitest';
import data from '../src/assets/sky/constellations.json';
import stars from '../src/assets/sky/stars.json';

const catalog = stars as [number, number, number, number][];
const sep = (ra1: number, dec1: number, ra2: number, dec2: number) => {
  const d = Math.PI / 180;
  const c = Math.sin(dec1 * d) * Math.sin(dec2 * d) + Math.cos(dec1 * d) * Math.cos(dec2 * d) * Math.cos((ra1 - ra2) * d);
  return Math.acos(Math.min(1, c)) / d;
};
const byId = (id: string) => data.constellations.find(c => c.id === id)!;
const near = (i: number, ra: number, dec: number) => sep(catalog[i][0], catalog[i][1], ra, dec) < 0.2;

describe('constellations', () => {
  it('has all 88 IAU constellations', () => {
    expect(data.constellations).toHaveLength(88);
  });

  it('joins only catalog stars', () => {
    for (const c of data.constellations) for (const i of c.segs) expect(catalog[i]).toBeDefined();
    for (const a of data.asterisms) for (const i of a.path) expect(catalog[i]).toBeDefined();
  });

  it('ends the Little Dipper handle at Polaris', () => {
    const umi = byId('UMi').segs;
    const counts = new Map<number, number>();
    umi.forEach(i => counts.set(i, (counts.get(i) ?? 0) + 1));
    const polaris = umi.find(i => near(i, 37.95, 89.26));
    expect(polaris).toBeDefined();
    expect(counts.get(polaris!)).toBe(1);   // a handle end has one segment
  });

  it('includes all seven Big Dipper stars in Ursa Major', () => {
    const dipper = [[165.93, 61.75], [165.46, 56.38], [178.46, 53.69], [183.86, 57.03], [193.51, 55.96], [200.98, 54.93], [206.89, 49.31]];
    const uma = new Set(byId('UMa').segs);
    for (const [ra, dec] of dipper) expect([...uma].some(i => near(i, ra, dec))).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { EVENTS } from '../src/data/events';
import { findEclipses } from '../src/physics/eclipses';

const MIN = 60000;

// NASA Five Millennium Canon, greatest eclipse (TD ≈ UTC + 69 s); 2023-04-20 is hybrid, mostly total
const CATALOG: [string, 'Sun' | 'Moon', string][] = [
  ['2023-04-20T04:17', 'Sun', 'total'], ['2023-05-05T17:24', 'Moon', 'penumbral'],
  ['2023-10-14T18:00', 'Sun', 'annular'], ['2023-10-28T20:14', 'Moon', 'partial'],
  ['2024-03-25T07:13', 'Moon', 'penumbral'], ['2024-04-08T18:18', 'Sun', 'total'],
  ['2024-09-18T02:44', 'Moon', 'partial'], ['2024-10-02T18:45', 'Sun', 'annular'],
  ['2025-03-14T06:59', 'Moon', 'total'], ['2025-03-29T10:48', 'Sun', 'partial'],
  ['2025-09-07T18:12', 'Moon', 'total'], ['2025-09-21T19:42', 'Sun', 'partial'],
  ['2026-02-17T12:13', 'Sun', 'annular'], ['2026-03-03T11:34', 'Moon', 'total'],
  ['2026-08-12T17:47', 'Sun', 'total'], ['2026-08-28T04:13', 'Moon', 'partial'],
  ['2027-02-06T16:00', 'Sun', 'annular'], ['2027-02-20T23:13', 'Moon', 'penumbral'],
  ['2027-07-18T16:03', 'Moon', 'penumbral'], ['2027-08-02T10:07', 'Sun', 'total'],
  ['2027-08-17T07:14', 'Moon', 'penumbral'],
];

describe('eclipses', () => {
  it('finds every eclipse of 2023–2027 with its type, within a few minutes', () => {
    const found = findEclipses(Date.UTC(2023, 0, 1), Date.UTC(2028, 0, 1));
    expect(found.map(e => [e.body, e.kind])).toEqual(CATALOG.map(([, body, kind]) => [body, kind]));
    found.forEach((e, i) => expect(Math.abs(e.time - Date.parse(CATALOG[i][0] + 'Z'))).toBeLessThan(5 * MIN));
  });

  it('puts the 2027-08-02 shadow centre near Luxor', () => {
    const [e] = findEclipses(Date.UTC(2027, 7, 1), Date.UTC(2027, 7, 3));
    const { x, y, z } = e.point!;
    const eps = 23.4393 * Math.PI / 180;   // ecliptic → equatorial, then Earth-fixed by sidereal time
    const ye = y * Math.cos(eps) - z * Math.sin(eps), ze = y * Math.sin(eps) + z * Math.cos(eps);
    const gmst = 280.46061837 + 360.98564736629 * (e.time / 86400000 + 2440587.5 - 2451545);
    const lon = ((Math.atan2(ye, x) * 180 / Math.PI - gmst) % 360 + 540) % 360 - 180;
    const lat = Math.asin(ze) * 180 / Math.PI;
    expect(Math.abs(lat - 25.5)).toBeLessThan(1.5);
    expect(Math.abs(lon - 33.2)).toBeLessThan(1.5);
  });

  it('lands each curated eclipse event on an eclipse in the app’s own physics', () => {
    for (const ev of EVENTS.filter(e => /eclipse/i.test(e.kind))) {
      const t = Date.parse(ev.time);
      const hit = findEclipses(t - 86400000, t + 86400000);
      expect(hit, ev.id).toHaveLength(1);
      expect(Math.abs(hit[0].time - t), ev.id).toBeLessThan(10 * MIN);
      expect(ev.kind.toLowerCase(), ev.id).toContain(hit[0].kind);
    }
  });
});

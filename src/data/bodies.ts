export interface BodyInfo {
  name: string;
  radiusKm: number;
  visR: number;      // display radius in compressed mode (scene units)
  kind: string;
  year: string;
  day: string;
  note: string;
  isSun?: boolean;
  /** set for moons */
  parent?: string;
  /** known satellites, for planets */
  moons?: { known: number; retrograde: number };
}

export interface PlanetInfo extends BodyInfo {
  flattening: number; // (equatorial − polar) / equatorial
}

export const BODIES: PlanetInfo[] = [
  { name: 'Mercury', radiusKm: 2440, visR: 1.35, flattening: 0, kind: 'Rocky planet', year: '88 days', day: '59 days', note: 'Iron heart, no atmosphere, 600°C swing between noon and midnight.' },
  { name: 'Venus', radiusKm: 6052, visR: 2.05, flattening: 0, kind: 'Rocky planet', year: '225 days', day: '243 days · retrograde', note: 'Spins backwards, and its day outlasts its year. Commitment.' },
  { name: 'Earth', radiusKm: 6371, visR: 2.15, flattening: 0.00335, kind: 'Rocky planet · home', year: '365.25 days', day: '23.9 hours', note: 'You are here. Statistically speaking, everyone is.' },
  { name: 'Mars', radiusKm: 3390, visR: 1.7, flattening: 0.00589, kind: 'Rocky planet', year: '687 days', day: '24.6 hours', note: 'Rust, two potato moons, and every robot humanity ever loved.' },
  { name: 'Jupiter', radiusKm: 69911, visR: 5.4, flattening: 0.06487, kind: 'Gas giant', year: '11.9 years', day: '9.9 hours', note: '2.5× the mass of every other planet combined. The bouncer of the inner system.' },
  { name: 'Saturn', radiusKm: 58232, visR: 4.7, flattening: 0.09796, kind: 'Gas giant', year: '29.5 years', day: '10.7 hours', note: 'The rings span 280,000 km and are about 10 meters thick. Ten.' },
  { name: 'Uranus', radiusKm: 25362, visR: 3.2, flattening: 0.0229, kind: 'Ice giant', year: '84 years', day: '17.2 hours · retrograde', note: 'Rolls around the Sun on its side. Nobody knows the whole story of the collision.' },
  { name: 'Neptune', radiusKm: 24622, visR: 3.1, flattening: 0.0171, kind: 'Ice giant', year: '165 years', day: '16.1 hours', note: 'Farthest true planet; winds hit 2,100 km/h with almost no sunlight to power them.' },
  { name: 'Pluto', radiusKm: 1188, visR: 0.95, flattening: 0, kind: 'Dwarf planet', year: '248 years', day: '6.4 days', note: 'Reclassified, not forgotten. Still counts in this house.' },
];

export const SUN: BodyInfo = { name: 'Sun', radiusKm: 696000, visR: 8.0, kind: 'G2V star', year: '—', day: '25–35 days (differential)', note: '99.86% of the system’s mass. Everything else is rounding error with feelings.', isSun: true };

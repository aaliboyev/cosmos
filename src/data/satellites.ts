/* Display data for moons: which ones are drawn as spheres, their info cards,
   and known-moon counts per planet (JPL SSD list, Earth's Moon added). */
import moonData from './moons.json';
import type { BodyInfo } from './bodies';

const COL = Object.fromEntries(moonData.columns.map((c, i) => [c, i])) as Record<string, number>;
type Row = (string | number | null)[];
const ROWS = moonData.moons as Row[];

/** Moons below this radius are drawn as dots unless listed in NOTES. */
export const SPHERE_MIN_KM = 100;

/** Small moons with a known shape but no radius in the table. */
const RADIUS_FALLBACK_KM: Record<string, number> = { Daphnis: 3.8 };

const NOTES: Record<string, [color: string, note: string, day?: string]> = {
  Moon: ['#c9c5be', 'Drifts 3.8 cm farther from Earth every year; the tides are paying for it.'],
  Phobos: ['#8a7a6c', 'Spiraling inward; in tens of millions of years Mars’s tides will pull it into a ring.'],
  Deimos: ['#a39584', 'About 12 km across. Seen from Mars it looks like a bright star.'],
  Io: ['#e0cf72', 'The most volcanic body known; Jupiter’s tides knead it from inside.'],
  Europa: ['#d9cdb6', 'A salty ocean under the ice, with more water than all of Earth’s oceans.'],
  Ganymede: ['#a89a88', 'Largest moon in the Solar System, bigger than Mercury, with its own magnetic field.'],
  Callisto: ['#7d7268', 'One of the most heavily cratered surfaces known, barely changed in four billion years.'],
  Pan: ['#c7bca8', 'Sweeps the Encke Gap clean. Shaped like a walnut.'],
  Daphnis: ['#c7bca8', 'Holds the Keeler Gap open and raises waves along its edges.'],
  Mimas: ['#bdbab4', 'One crater, Herschel, spans a third of its width.'],
  Enceladus: ['#f2f4f6', 'Geysers at its south pole feed Saturn’s E ring.'],
  Tethys: ['#dcdcd8', 'Almost pure water ice, with a canyon running three-quarters of the way around.'],
  Dione: ['#cfcac2', 'Bright ice cliffs streak its trailing side.'],
  Rhea: ['#c4c0b8', 'Saturn’s second-largest moon: cold, cratered ice and rock.'],
  Titan: ['#d8a24a', 'Thicker air than Earth’s, with rain, rivers and seas of methane.'],
  Hyperion: ['#b0a08a', 'Sponge-like, and tumbles chaotically — it has no steady day.', 'chaotic'],
  Iapetus: ['#9c8b74', 'One hemisphere coal-dark, the other snow-bright, with a ridge around its equator.'],
  Phoebe: ['#5c5650', 'Captured, orbits backwards, and sheds dust into Saturn’s largest ring.', '9.3 hours'],
  Miranda: ['#b9b6b0', 'Cliffs up to 20 km tall, among the highest known.'],
  Ariel: ['#c8c4bc', 'The brightest, and possibly youngest, surface among Uranus’s moons.'],
  Umbriel: ['#7e7a74', 'The darkest of Uranus’s five large moons.'],
  Titania: ['#b3aa9e', 'Uranus’s largest moon, split by canyons hundreds of km long.'],
  Oberon: ['#a39a90', 'Outermost of Uranus’s five large moons; old and cratered.'],
  Triton: ['#d6c9c0', 'Orbits backwards — a captured Kuiper Belt world with nitrogen geysers.'],
  Proteus: ['#77716a', 'About as large as a body can get without its gravity pulling it round.'],
  Nereid: ['#9a948c', 'One of the most eccentric orbits of any moon.', '11.6 hours'],
  Charon: ['#a59d96', 'Half Pluto’s size; the two keep the same faces turned to each other.'],
};

const fmtPeriod = (d: number) => d < 2 ? (d * 24).toFixed(1) + ' hours' : d < 700 ? d.toFixed(d < 20 ? 2 : 1) + ' days' : (d / 365.25).toFixed(1) + ' years';

export interface SphereMoon extends BodyInfo {
  parent: string;
  color: string;
  locked: boolean;
  /** surface hidden under haze: drawn as a plain disk, no cratered map */
  hazy: boolean;
}

function sphereMoon(name: string, parent: string, radiusKm: number, periodDays: number, retro: boolean): SphereMoon {
  const [color, note, day] = NOTES[name] ?? ['#a8a29a', ''];
  return {
    name, parent, radiusKm, visR: 0, color, note, locked: !day, hazy: name === 'Titan',
    kind: `Moon of ${parent}${retro ? ' · retrograde' : ''}`,
    year: fmtPeriod(periodDays) + ' orbit',
    day: day ?? 'tidally locked',
  };
}

export const SPHERE_MOONS: SphereMoon[] = [
  sphereMoon('Moon', 'Earth', 1737.4, 27.3217, false),
  ...ROWS.flatMap(r => {
    const name = r[COL.name] as string;
    const radius = (r[COL.radius_km] as number | null) ?? RADIUS_FALLBACK_KM[name] ?? null;
    if (radius === null || (radius < SPHERE_MIN_KM && !(name in NOTES))) return [];
    return [sphereMoon(name, r[COL.parent] as string, radius, r[COL.period_days] as number, (r[COL.i_deg] as number) > 90)];
  }),
];

export const MOON_COUNTS: Record<string, { known: number; retrograde: number }> = { Earth: { known: 1, retrograde: 0 } };
for (const r of ROWS) {
  const c = MOON_COUNTS[r[COL.parent] as string] ??= { known: 0, retrograde: 0 };
  c.known++;
  if ((r[COL.i_deg] as number) > 90) c.retrograde++;
}

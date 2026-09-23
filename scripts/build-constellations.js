// Converts d3-celestial constellation data into src/assets/sky/constellations.json, with every
// line endpoint replaced by the index of the matching star in stars.json, so lines join
// rendered stars exactly.
// Usage: node scripts/build-constellations.js <constellations.lines.json> <constellations.json>
import { readFileSync, writeFileSync } from 'node:fs';

const [linesPath, namesPath] = process.argv.slice(2);
const stars = JSON.parse(readFileSync('src/assets/sky/stars.json', 'utf8'));
const lines = JSON.parse(readFileSync(linesPath, 'utf8'));
const names = JSON.parse(readFileSync(namesPath, 'utf8'));

const D = Math.PI / 180;
const vec = (ra, dec) => [Math.cos(dec * D) * Math.cos(ra * D), Math.cos(dec * D) * Math.sin(ra * D), Math.sin(dec * D)];
const starVecs = stars.map(([ra, dec]) => vec(ra, dec));
const MAX_SEP = 0.2 * D;

function nearestStar(ra, dec) {
  const v = vec(ra, dec);
  let best = -1, bestDot = Math.cos(MAX_SEP);
  starVecs.forEach((s, i) => {
    const d = s[0] * v[0] + s[1] * v[1] + s[2] * v[2];
    if (d > bestDot) { bestDot = d; best = i; }
  });
  return best;
}

const ASTERISMS = {
  'Big Dipper': [[165.93, 61.75], [165.46, 56.38], [178.46, 53.69], [183.86, 57.03], [193.51, 55.96], [200.98, 54.93], [206.89, 49.31]],
  'Little Dipper': [[37.95, 89.26], [263.05, 86.59], [251.49, 82.04], [236.01, 77.79], [244.38, 75.76], [230.18, 71.83], [222.68, 74.16], [236.01, 77.79]],
  "Orion's Belt": [[85.19, -1.94], [84.05, -1.20], [83.00, -0.30]],
};

let missed = 0;
const out = { constellations: [], asterisms: [] };
for (const f of lines.features) {
  const segs = [];
  for (const path of f.geometry.coordinates) {
    const ids = path.map(([ra, dec]) => nearestStar((ra + 360) % 360, dec));
    for (let i = 1; i < ids.length; i++) {
      if (ids[i - 1] < 0 || ids[i] < 0) { missed++; continue; }
      if (ids[i - 1] !== ids[i]) segs.push(ids[i - 1], ids[i]);
    }
  }
  // Serpens comes as two features (Caput, Cauda) under one id
  const existing = out.constellations.find(c => c.id === f.id);
  if (existing) { existing.segs.push(...segs); continue; }
  const meta = names.features.find(n => n.id === f.id);
  const [lra, ldec] = meta.geometry.coordinates;
  out.constellations.push({ id: f.id, name: meta.properties.name, label: [+((lra + 360) % 360).toFixed(2), ldec], segs });
}
for (const [name, pts] of Object.entries(ASTERISMS)) {
  const ids = pts.map(([ra, dec]) => nearestStar(ra, dec));
  if (ids.includes(-1)) throw new Error(`asterism star not in catalog: ${name}`);
  out.asterisms.push({ name, path: ids });
}

writeFileSync('src/assets/sky/constellations.json', JSON.stringify(out));
console.log(`${out.constellations.length} constellations, ${out.constellations.reduce((n, c) => n + c.segs.length / 2, 0)} segments, ${missed} unmatched`);

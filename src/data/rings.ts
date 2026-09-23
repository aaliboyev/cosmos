/* Ring radial profiles, km from the planet's center. Saturn: Cassini-era ring
   and gap boundaries; normal optical depth τ and relative albedo are a piecewise
   approximation of published occultation profiles, not a measured table. */

export interface RingBand { from: number; to: number; tau: number; albedo: number }
export interface RingSystem { planetRadiusKm: number; inner: number; outer: number; bands: RingBand[]; gaps: { center: number; width: number }[] }

export const SATURN_RINGS: RingSystem = {
  planetRadiusKm: 60268,
  inner: 66900,
  outer: 140600,
  bands: [
    { from: 66900, to: 74658, tau: 0.001, albedo: 0.15 },      // D
    { from: 74658, to: 84500, tau: 0.07, albedo: 0.2 },        // C
    { from: 84500, to: 90600, tau: 0.12, albedo: 0.22 },
    { from: 90600, to: 92000, tau: 0.2, albedo: 0.28 },        // C ring ramp
    { from: 92000, to: 99000, tau: 1.0, albedo: 0.5 },         // B
    { from: 99000, to: 104500, tau: 2.0, albedo: 0.55 },
    { from: 104500, to: 110000, tau: 4.0, albedo: 0.6 },       // B core, opaque
    { from: 110000, to: 117580, tau: 2.5, albedo: 0.55 },
    { from: 117580, to: 120000, tau: 0.1, albedo: 0.25 },      // Cassini Division
    { from: 120000, to: 122170, tau: 0.3, albedo: 0.3 },
    { from: 122170, to: 126000, tau: 0.8, albedo: 0.45 },      // A
    { from: 126000, to: 133000, tau: 0.6, albedo: 0.45 },
    { from: 133000, to: 136775, tau: 0.5, albedo: 0.42 },
    { from: 136775, to: 139380, tau: 0.001, albedo: 0.2 },     // Roche Division
    { from: 139930, to: 140430, tau: 0.1, albedo: 0.35 },      // F
    { from: 140155, to: 140205, tau: 0.5, albedo: 0.4 },       // F core
  ],
  gaps: [
    { center: 77870, width: 150 },    // Colombo
    { center: 87491, width: 270 },    // Maxwell
    { center: 117680, width: 340 },   // Huygens
    { center: 133589, width: 325 },   // Encke
    { center: 136505, width: 35 },    // Keeler
  ],
};

// narrow, coal-dark rings; mostly visible backlit
export const URANUS_RINGS: RingSystem = {
  planetRadiusKm: 25559,
  inner: 41000,
  outer: 51300,
  bands: [
    [41837, 2, 0.3], [42234, 2, 0.5], [42571, 2, 0.3], [44718, 7, 0.4], [45661, 8, 0.3],
    [47176, 2, 0.4], [47627, 3, 1.0], [48300, 5, 0.4], [50023, 2, 0.1], [51149, 58, 1.5],
  ].map(([r, w, tau]) => ({ from: r - w / 2, to: r + w / 2, tau, albedo: 0.03 })),
  gaps: [],
};

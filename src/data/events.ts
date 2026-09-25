/* Notable sky events the orrery can jump to. Times are UTC at the event's
   peak (greatest eclipse, closest approach, mid-transit). */

export interface SkyEvent {
  id: string;
  title: string;
  kind: string;
  time: string;
  /** body the camera flies to */
  focus: string;
  /** hours either side of `time` the write-up stays open */
  spanHours: number;
  /** arrive facing the Moon's shadow on Earth */
  eclipseView?: boolean;
  facts: [label: string, value: string][];
  text: string[];
  /** what to try once there */
  tip?: string;
}

export const EVENTS: SkyEvent[] = [
  {
    id: 'mars-2003',
    title: 'Mars at its closest',
    kind: 'Close approach',
    time: '2003-08-27T09:51:00Z',
    focus: 'Mars',
    spanHours: 720,
    facts: [['Distance', '55.76 million km'], ['Closer than any time in', '~60,000 years'], ['Next as close', '2287']],
    text: [
      'Mars passed opposition within days of its perihelion, so Earth caught it at the near point of an eccentric orbit.',
      'Oppositions come every 26 months; one near Mars’s aphelion leaves it about 100 million km away.',
    ],
    tip: 'Turn on orbits: Earth sits just inside Mars at the spot where the two orbits come closest.',
  },
  {
    id: 'venus-transit-2012',
    title: 'Transit of Venus',
    kind: 'Transit',
    time: '2012-06-06T01:29:00Z',
    focus: 'Venus',
    spanHours: 6,
    facts: [['Duration', '6 h 40 min'], ['Previous', 'June 2004'], ['Next', 'December 2117']],
    text: [
      'Venus crossed the face of the Sun as a small black disk. Its orbit is tilted 3.4° to Earth’s, so it usually passes above or below the Sun.',
      'Transits come in pairs eight years apart, with more than a century between pairs. In the 18th century they were timed from across the globe to measure the distance to the Sun.',
    ],
    tip: 'Venus is lined up between Earth and the Sun. Zoom out to see all three.',
  },
  {
    id: 'mercury-transit-2019',
    title: 'Transit of Mercury',
    kind: 'Transit',
    time: '2019-11-11T15:20:00Z',
    focus: 'Mercury',
    spanHours: 6,
    facts: [['Duration', '5 h 28 min'], ['Next', 'November 2032']],
    text: [
      'Mercury crossed the Sun as a dot too small to see without a telescope, about 1/194 of the Sun’s width.',
      'Mercury transits happen about 13 times a century, always in May or November, when Earth passes the line where Mercury’s orbit crosses its own.',
    ],
  },
  {
    id: 'ring-of-fire-2023',
    title: 'Ring of fire',
    kind: 'Annular solar eclipse',
    time: '2023-10-14T17:59:00Z',
    focus: 'Earth',
    spanHours: 4,
    eclipseView: true,
    facts: [['Longest annularity', '5 min 17 s'], ['Path', 'Oregon → Texas → Yucatán → Brazil']],
    text: [
      'The Moon was too far from Earth to cover the Sun, so a thin ring of sunlight stayed around it.',
      'The Moon’s full shadow ends before reaching Earth; what sweeps the ground is the antumbra, from which the ring is seen.',
    ],
    tip: 'The dark spot sits over Central America. Play at hr/s to watch it cross from the US to Brazil.',
  },
  {
    id: 'north-america-2024',
    title: 'Great North American Eclipse',
    kind: 'Total solar eclipse',
    time: '2024-04-08T18:17:00Z',
    focus: 'Earth',
    spanHours: 4,
    eclipseView: true,
    facts: [['Longest totality', '4 min 28 s'], ['Greatest eclipse', 'Nazas, Durango, Mexico'], ['Path', 'Mexico → USA → Canada']],
    text: [
      'The Moon’s umbra, about 200 km wide, crossed North America from the Pacific coast of Mexico to Newfoundland in under two hours.',
      'Tens of millions of people lived inside the path. The Moon was near perigee, which made its shadow wide and totality long.',
    ],
    tip: 'Play at hr/s to follow the shadow up through Texas and out across the Atlantic.',
  },
  {
    id: 'saturn-equinox-2025',
    title: 'Saturn’s rings go dark',
    kind: 'Saturn equinox',
    time: '2025-05-06T12:00:00Z',
    focus: 'Saturn',
    spanHours: 2160,
    facts: [['Happens every', '~14.7 years'], ['Previous', 'August 2009']],
    text: [
      'Saturn is tilted 26.7°, and at its equinox the Sun lies exactly in the ring plane. Sunlight grazes the rings edge-on and they go almost dark.',
      'Around equinox the rings’ shadow on the planet shrinks to a thin line, and moons cast long shadows across the ring plane.',
    ],
    tip: 'Compare with a date a few years either side: the rings brighten and their shadow widens on the planet.',
  },
  {
    id: 'blood-moon-2025',
    title: 'Blood Moon',
    kind: 'Total lunar eclipse',
    time: '2025-09-07T18:11:00Z',
    focus: 'Moon',
    spanHours: 4,
    facts: [['Totality', '82 min'], ['Seen from', 'Asia, Australia, Europe, Africa']],
    text: [
      'The Moon passed through the middle of Earth’s shadow. It does not go black: Earth’s atmosphere bends sunlight into the shadow and filters out the blue, the same light as every sunrise and sunset on Earth at once.',
      'Lunar eclipses happen only at full moon, and only when the full moon falls near a crossing of the Moon’s tilted orbit with Earth’s.',
    ],
    tip: 'Step back an hour to see the partial phase: the red umbra takes a curved bite out of the Moon.',
  },
  {
    id: 'europe-2026',
    title: 'Eclipse over Iceland and Spain',
    kind: 'Total solar eclipse',
    time: '2026-08-12T17:46:00Z',
    focus: 'Earth',
    spanHours: 4,
    eclipseView: true,
    facts: [['Longest totality', '2 min 18 s'], ['Path', 'Greenland → Iceland → Spain']],
    text: [
      'The first total solar eclipse in mainland Europe since 1999, and Spain’s first since 1905.',
      'The shadow lands near the Arctic and ends at sunset over the Mediterranean, so in Spain the Sun is low in the west during totality.',
    ],
  },
  {
    id: 'penumbral-2027',
    title: 'A barely-there eclipse',
    kind: 'Penumbral lunar eclipse',
    time: '2027-02-20T23:13:00Z',
    focus: 'Moon',
    spanHours: 4,
    facts: [['Seen from', 'Europe, Africa, western Asia, the Americas']],
    text: [
      'The Moon slips through Earth’s outer shadow and just misses the dark core. Only its northern edge dims, and many people will not notice.',
      'From the penumbra, part of the Sun is still visible, so the light fades gradually rather than going dark.',
    ],
  },
  {
    id: 'luxor-2027',
    title: 'Eclipse of the century',
    kind: 'Total solar eclipse',
    time: '2027-08-02T10:07:00Z',
    focus: 'Earth',
    spanHours: 4,
    eclipseView: true,
    facts: [['Longest totality', '6 min 23 s'], ['Greatest eclipse', 'near Luxor, Egypt'], ['Path', 'Spain → North Africa → Arabia']],
    text: [
      'One of the longest total eclipses of the century over land: the Moon is near perigee and Earth near aphelion, so the Moon looks as large as it can against a Sun that looks as small as it can.',
      'The shadow runs from the Strait of Gibraltar along North Africa, over Luxor, and across Arabia to the Indian Ocean.',
    ],
    tip: 'Play at hr/s from 08:30 to watch the shadow run from Gibraltar to Somalia.',
  },
];

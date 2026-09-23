/* Accretion page state: camera stores, sim controls and the readout the scene fills. */
import { createCameraState } from '../shared/camera';
import { store } from '../shared/store';
import type { Leader } from './worker';

/** Orbital years per real second. */
export const SPEEDS = [
  { value: 0.25, label: '¼ yr/s' },
  { value: 1, label: '1 yr/s' },
  { value: 4, label: '4 yr/s' },
  { value: 16, label: 'max' },
] as const;

export const camera = createCameraState('orbit', 'Sun');
export const { mode: cameraMode, flight } = camera;

export const heat = store(0.01);
/** Solid mass relative to the Minimum Mass Solar Nebula. */
export const diskMass = store(8);
export const speed = store<number>(4);
export const paused = store(matchMedia('(prefers-reduced-motion: reduce)').matches);
export const toggles = store({ snowLine: true, orbits: true });
export const readout = store({
  time: '0 yr', equiv: '0.00 Myr', count: 0, biggest: '—', gas: 100, inflate: 100,
  dE: 0, dP: 0, dL: 0, rate: 0, stage: 'PLANETESIMALS · A SWARM OF MOON-SIZED BODIES',
  leaders: [] as Leader[],
});
/** Increments on each restart request. */
export const restarts = store(0);
/** Body id to fly to, set from the leaderboard. */
export const focusRequest = store<{ id: number; n: number }>({ id: -1, n: 0 });

export const actions = {
  togglePause: () => paused.update(p => !p),
  restart: () => restarts.update(n => n + 1),
  overview: () => camera.requestCamera('overview'),
  toggle: (key: 'snowLine' | 'orbits') => toggles.update(t => ({ ...t, [key]: !t[key] })),
  focusBody: (id: number) => focusRequest.update(r => ({ id, n: r.n + 1 })),
};

/** One line for the caption, from what the disk is doing. */
export function stageOf(count: number, start: number, biggest: number, gasGiant: boolean, gasFrac: number): string {
  if (gasGiant && gasFrac < 0.05) return 'GAS GONE · WHAT FORMED IS WHAT STAYS';
  if (gasGiant) return 'GAS GIANT · A CORE PAST 10 M⊕ PULLS IN THE NEBULA';
  if (biggest > 1) return 'OLIGARCHS · EACH CLEARS ITS OWN LANE';
  if (count < start * 0.85) return 'RUNAWAY GROWTH · THE BIG EAT FASTER';
  return 'PLANETESIMALS · A SWARM OF MOON-SIZED BODIES';
}

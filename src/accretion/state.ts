/* Accretion page state: sim controls and the throttled readout. */
import { store } from '../shared/store';

export const SPEEDS = [1, 4, 16] as const;

export interface Leader { massEarth: number; r: number }

export const heat = store(0.06);
export const speed = store<number>(4);
export const paused = store(matchMedia('(prefers-reduced-motion: reduce)').matches);
export const readout = store({ time: '0.0 Myr', count: 0, biggest: '—', stage: 'DUST SWARM · EVERYONE IS FOOD', leaders: [] as Leader[] });
/** Increments on each restart request. */
export const restarts = store(0);

export const actions = {
  togglePause: () => paused.update(p => !p),
  restart: () => restarts.update(n => n + 1),
};

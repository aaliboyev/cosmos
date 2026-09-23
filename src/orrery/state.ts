/* App state shared by the scene and the HUD. Stores follow the Svelte store
   contract, so components read them as `$store`; writes go through `actions`. */
import { BODIES, SUN, type BodyInfo } from '../data/bodies';
import { MOON_COUNTS, SPHERE_MOONS } from '../data/satellites';

export interface Store<T> {
  subscribe(fn: (value: T) => void): () => void;
  get(): T;
  set(value: T): void;
  update(fn: (value: T) => T): void;
}

export function store<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    subscribe(fn) {
      listeners.add(fn);
      fn(value);
      return () => listeners.delete(fn);
    },
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      listeners.forEach(fn => fn(value));
    },
    update(fn) { this.set(fn(value)); },
  };
}

export const SPEEDS: readonly { label: string; mult: number }[] = [
  { label: '◀ day/s', mult: -86400 },
  { label: '◀ hr/s', mult: -3600 },
  { label: 'paused', mult: 0 },
  { label: 'real', mult: 1 },
  { label: '1 hr/s', mult: 3600 },
  { label: '1 day/s', mult: 86400 },
  { label: '1 week/s', mult: 604800 },
  { label: '1 month/s', mult: 2629800 },
  { label: '1 yr/s', mult: 31557600 },
];
export const PAUSED_IDX = 2;

export interface Toggles { orbits: boolean; labels: boolean; trueScale: boolean; drift: boolean; belts: boolean; constellations: boolean }
export type CameraMode = 'free' | 'orbit';

export const sim = store({ time: Date.now(), speedIdx: 6 });
export const toggles = store<Toggles>({ orbits: true, labels: true, trueScale: false, drift: false, belts: true, constellations: false });
export const selected = store<BodyInfo | null>(null);
export const selectedDistance = store('—');
export const cameraMode = store<CameraMode>('orbit');

/** Written by the camera rig (throttled), read by the HUD. */
export interface Flight {
  speedKmS: number;       // camera speed in real km/s at the current scale
  throttle: number;       // 0..1 fly-speed setting
  headingDeg: number;     // ecliptic longitude of view direction
  pitchDeg: number;       // elevation above the ecliptic plane
  rollDeg: number;
  nearest: string;        // nearest body name
  nearestAU: number;      // distance to it in AU (true, not scene)
}
export const flight = store<Flight>({ speedKmS: 0, throttle: 0.5, headingDeg: 0, pitchDeg: 0, rollDeg: 0, nearest: 'Sun', nearestAU: 0 });

/** One-shot camera commands; `n` increments so repeated requests still notify. */
export const cameraRequest = store<{ kind: 'none' | 'focus' | 'overview'; n: number }>({ kind: 'none', n: 0 });
const requestCamera = (kind: 'focus' | 'overview') => cameraRequest.set({ kind, n: cameraRequest.get().n + 1 });

const BODY_BY_NAME: Record<string, BodyInfo> = Object.fromEntries(
  [SUN, ...BODIES.map(b => ({ ...b, moons: MOON_COUNTS[b.name] })), ...SPHERE_MOONS].map(b => [b.name, b]));

export const actions = {
  select(name: string | null) {
    selected.set(name ? BODY_BY_NAME[name] ?? null : null);
  },
  /** Select the body and fly to it — again, if it is already selected. */
  focus(name: string) {
    if (selected.get()?.name === name) requestCamera('focus');
    else actions.select(name);
  },
  setSpeed(idx: number) {
    // "real" snaps sim time to now: window mode
    const time = SPEEDS[idx].mult === 1 ? Date.now() : sim.get().time;
    sim.set({ time, speedIdx: idx });
  },
  toggle(key: keyof Toggles) {
    toggles.update(t => ({ ...t, [key]: !t[key] }));
  },
  setCameraMode(mode: CameraMode) {
    cameraMode.set(mode);
  },
  setThrottle(v: number) {
    flight.update(f => ({ ...f, throttle: Math.max(0, Math.min(1, v)) }));
  },
  release() {
    actions.select(null);
  },
  /** Release any body and fly back to the initial wide view. */
  overview() {
    actions.select(null);
    requestCamera('overview');
  },
};

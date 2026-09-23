/* App state shared by the scene and the HUD. Stores follow the Svelte store
   contract, so components read them as `$store`; writes go through `actions`. */
import { BODIES, SUN, type BodyInfo } from '../data/bodies';
import { MOON_COUNTS, SPHERE_MOONS } from '../data/satellites';
import { createCameraState, type CameraMode } from '../shared/camera';
import { store } from '../shared/store';

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
export type { CameraMode } from '../shared/camera';

export const sim = store({ time: Date.now(), speedIdx: 6 });
export const toggles = store<Toggles>({ orbits: true, labels: true, trueScale: false, drift: false, belts: true, constellations: false });
export const selected = store<BodyInfo | null>(null);
export const selectedDistance = store('—');
export const camera = createCameraState('orbit', 'Sun');
export const { mode: cameraMode, flight, request: cameraRequest } = camera;

const BODY_BY_NAME: Record<string, BodyInfo> = Object.fromEntries(
  [SUN, ...BODIES.map(b => ({ ...b, moons: MOON_COUNTS[b.name] })), ...SPHERE_MOONS].map(b => [b.name, b]));

export const actions = {
  select(name: string | null) {
    selected.set(name ? BODY_BY_NAME[name] ?? null : null);
  },
  /** Select the body and fly to it — again, if it is already selected. */
  focus(name: string) {
    if (selected.get()?.name === name) camera.requestCamera('focus');
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
    camera.setMode(mode);
  },
  setThrottle(v: number) {
    camera.setThrottle(v);
  },
  release() {
    actions.select(null);
  },
  /** Release any body and fly back to the initial wide view. */
  overview() {
    actions.select(null);
    camera.requestCamera('overview');
  },
};

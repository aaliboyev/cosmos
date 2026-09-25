/* App state shared by the scene and the HUD. Stores follow the Svelte store
   contract, so components read them as `$store`; writes go through `actions`. */
import { BODIES, SUN, type BodyInfo } from '../data/bodies';
import type { SkyEvent } from '../data/events';
import { MOON_COUNTS, SPHERE_MOONS } from '../data/satellites';
import { findEclipses } from '../physics/eclipses';
import type { Vec3 } from '../physics/ephemeris';
import { createCameraState, type CameraMode } from '../shared/camera';
import { store } from '../shared/store';

export const SPEEDS: readonly { label: string; mult: number }[] = [
  { label: '◀ day/s', mult: -86400 },
  { label: '◀ hr/s', mult: -3600 },
  { label: 'paused', mult: 0 },
  { label: 'real', mult: 1 },
  { label: '10m/s', mult: 600 },
  { label: '30m/s', mult: 1800 },
  { label: '1 hr/s', mult: 3600 },
  { label: '1 day/s', mult: 86400 },
  { label: '1 week/s', mult: 604800 },
  { label: '1 month/s', mult: 2629800 },
  { label: '1 yr/s', mult: 31557600 },
];
export const PAUSED_IDX = 2;
export const REAL_IDX = 3;

export interface Toggles { orbits: boolean; labels: boolean; trueScale: boolean; drift: boolean; belts: boolean; constellations: boolean; shadows: boolean }
export type { CameraMode } from '../shared/camera';

export const sim = store({ time: Date.now(), speedIdx: REAL_IDX });
export const toggles = store<Toggles>({ orbits: true, labels: true, trueScale: false, drift: false, belts: true, constellations: false, shadows: false });
export const selected = store<BodyInfo | null>(null);
export const selectedDistance = store('—');
export const activeEvent = store<SkyEvent | null>(null);
/** Arrival direction for the next focus (body → camera, ecliptic); consumed by it. */
export const focusView = store<Vec3 | null>(null);
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
    sim.update(s => ({ ...s, speedIdx: idx }));
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
  /** Paused at the event's peak, flying to its body; solar eclipses arrive over the shadow. */
  showEvent(ev: SkyEvent) {
    const time = Date.parse(ev.time);
    sim.set({ time, speedIdx: PAUSED_IDX });
    const day = 86400000;
    const shadow = ev.eclipseView ? findEclipses(time - day, time + day).find(e => e.body === 'Sun') : undefined;
    focusView.set(shadow?.point ?? null);
    actions.select(null);
    actions.select(ev.focus);
    activeEvent.set(ev);
  },
};

// the write-up belongs to its moment and its body: leaving either closes it
selected.subscribe(body => {
  const ev = activeEvent.get();
  if (ev && body?.name !== ev.focus) activeEvent.set(null);
});
sim.subscribe(s => {
  const ev = activeEvent.get();
  if (ev && Math.abs(s.time - Date.parse(ev.time)) > ev.spanHours * 3600000) activeEvent.set(null);
});

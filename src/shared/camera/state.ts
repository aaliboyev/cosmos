/* Per-page camera stores: the rig writes the flight readout and follows `mode`
   and `request`; the HUD reads them. Each page creates its own. */
import { store, type Store } from '../store';

export type CameraMode = 'free' | 'orbit';

export interface Flight {
  speed: number;          // camera speed, page units per second (km/s in the orrery)
  throttle: number;       // 0..1 fly-speed setting
  headingDeg: number;     // longitude of the view direction in the scene's horizontal plane
  pitchDeg: number;       // elevation above that plane
  rollDeg: number;
  nearest: string;        // nearest body name
  nearestDist: number;    // distance to it, page units (km in the orrery)
}

/** One-shot commands; `n` increments so repeated requests still notify. */
export interface CameraRequest { kind: 'none' | 'focus' | 'overview'; n: number }

export interface CameraState {
  mode: Store<CameraMode>;
  flight: Store<Flight>;
  request: Store<CameraRequest>;
  setMode(mode: CameraMode): void;
  setThrottle(v: number): void;
  requestCamera(kind: 'focus' | 'overview'): void;
}

export function createCameraState(mode: CameraMode = 'orbit', nearest = ''): CameraState {
  const s: CameraState = {
    mode: store<CameraMode>(mode),
    flight: store<Flight>({ speed: 0, throttle: 0.5, headingDeg: 0, pitchDeg: 0, rollDeg: 0, nearest, nearestDist: 0 }),
    request: store<CameraRequest>({ kind: 'none', n: 0 }),
    setMode: m => s.mode.set(m),
    setThrottle: v => s.flight.update(f => ({ ...f, throttle: Math.max(0, Math.min(1, v)) })),
    requestCamera: kind => s.request.set({ kind, n: s.request.get().n + 1 }),
  };
  return s;
}

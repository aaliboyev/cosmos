/* Nebula page state: camera stores, initial-condition parameters and the
   throttled physics readout. */
import { createCameraState } from '../shared/camera';
import { store } from '../shared/store';
import type { CloudStats } from './physics/sim';

export const camera = createCameraState('orbit', 'Cloud centre');
export const { mode: cameraMode, flight } = camera;

/** Rotational and turbulent energy as fractions of |W|; typical cores: β ≈ 0.02, 1e-4–0.07. */
export const params = store({ rotation: 0.04, turbulence: 0.08 });
export const paused = store(matchMedia('(prefers-reduced-motion: reduce)').matches);
export const stats = store<CloudStats | null>(null);
export const hasStar = store(false);
/** Increments on each restart request. */
export const restarts = store(0);

export const actions = {
  setRotation: (v: number) => params.update(p => ({ ...p, rotation: v })),
  setTurbulence: (v: number) => params.update(p => ({ ...p, turbulence: v })),
  togglePause: () => paused.update(p => !p),
  restart: () => restarts.update(n => n + 1),
  overview: () => camera.requestCamera('overview'),
};

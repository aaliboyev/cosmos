/* Nebula page state: camera stores, sim parameters and the throttled readout. */
import { createCameraState } from '../shared/camera';
import { store } from '../shared/store';

export const camera = createCameraState('orbit', 'Protostar');
export const { mode: cameraMode, flight } = camera;

export const params = store({ spin0: 0.5, visc: 0.05 });
export const paused = store(matchMedia('(prefers-reduced-motion: reduce)').matches);
export const readout = store({ time: '0,000 yr', flat: 1, core: 0, stage: 'SCENE 1 · COLD FOG, HANGING' });
/** Increments on each restart request. */
export const restarts = store(0);

export const actions = {
  setSpin: (v: number) => params.update(p => ({ ...p, spin0: v })),
  setVisc: (v: number) => params.update(p => ({ ...p, visc: v })),
  togglePause: () => paused.update(p => !p),
  restart: () => restarts.update(n => n + 1),
  overview: () => camera.requestCamera('overview'),
};

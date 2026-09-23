import type { PerspectiveCamera, Vector3 } from 'three';
import type { CameraState } from './state';

export interface RigBody {
  name: string;
  /** Live scene position; read every frame. */
  position: Vector3;
  /** Displayed radius in scene units. */
  radius(): number;
  radiusKm: number;
  /** Extent a fly-to should fit on screen (rings, moon system); defaults to radius(). */
  frameRadius?(): number;
  /** Spin axis in world space; fly-to arrives above its equator on the lit side. */
  pole?(out: Vector3): Vector3;
  /** Arrival azimuth off the body→center line, degrees (larger shows more terminator). */
  phaseDeg?: number;
}

/** How the flight readout turns scene units into the page's units (default: scene units). */
export interface RigUnits {
  /** Distance camera → body in page units; ranks the nearest-body readout. */
  distance(cam: Vector3, body: RigBody): number;
  /** Page units per scene unit at the camera, given the nearest body; converts speed. */
  perSceneUnit(cam: Vector3, nearest: RigBody): number;
}

export interface CameraRig {
  camera: PerspectiveCamera;
  /** Per frame, after body positions are updated. `centerDelta` is the center body's displacement this frame. */
  update(dt: number, centerDelta: Vector3): void;
  /** Fly to the body and orbit it; the camera rides along with it until released. */
  focus(target: RigBody): void;
  release(): void;
  /** Reframe the focused body on the next frame (after its displayed size changed). */
  refocus(): void;
  /** Move camera and pivot rigidly by `delta` (drift reset, float rebase). */
  translate(delta: Vector3): void;
  dispose(): void;
}

export interface CameraRigOptions {
  /** bodies[0] is the center: the orbit pivot with nothing selected and the overview anchor.
      All are used for collision, speed and the nearest-body readout. */
  bodies: RigBody[];
  state: CameraState;
  /** Tab selects a body ahead of the camera; Esc and H select null. */
  select(name: string | null): void;
  /** Overview pose as an offset from the center; defaults to the camera's offset at creation. */
  overview?: Vector3;
  units?: RigUnits;
  /** A click that was not a drag, in normalized device coordinates. */
  onClick?(ndcX: number, ndcY: number): void;
  onDoubleClick?(ndcX: number, ndcY: number): void;
}

export { createFreeRig } from './free-rig';
export { CAMERA_CONTROLS, type Control } from './keys';
export { createCameraState, type CameraMode, type CameraState, type Flight } from './state';

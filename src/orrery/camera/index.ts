import type { PerspectiveCamera, Vector3 } from 'three';

export interface RigBody {
  name: string;
  /** Live scene position; read every frame. */
  position: Vector3;
  /** Displayed radius in scene units. */
  radius(): number;
  radiusKm: number;
  /** Extent a fly-to should fit on screen (rings, moon system); defaults to radius(). */
  frameRadius?(): number;
  /** Spin axis in world space; fly-to arrives above its equator on the sunlit side. */
  pole?(out: Vector3): Vector3;
  /** Arrival azimuth off the body→Sun line, degrees (larger shows more terminator). */
  phaseDeg?: number;
}

export interface CameraRig {
  camera: PerspectiveCamera;
  /** Per frame, after body positions are updated. `sunDelta` is the Sun's displacement this frame. */
  update(dt: number, sunDelta: Vector3): void;
  /** Fly to the body and orbit it; the camera rides along with it until released. */
  focus(target: RigBody): void;
  release(): void;
  /** Move camera and pivot rigidly by `delta` (drift reset, float rebase). */
  translate(delta: Vector3): void;
  dispose(): void;
}

export interface CameraRigOptions {
  /** Sun first; used for collision, speed, the nearest-body readout and orbit picking. */
  bodies: RigBody[];
  /** A click that was not a drag, in normalized device coordinates. */
  onClick(ndcX: number, ndcY: number): void;
  onDoubleClick(ndcX: number, ndcY: number): void;
}

export { createFreeRig } from './free-rig';

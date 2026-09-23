/* The Sun orbits the galactic center at ~230 km/s (0.133 AU/day); the ecliptic
   is tilted ~60° to the galactic plane, so planets trace helixes — sometimes
   ahead of the Sun, not trailing it like a comet tail. Speed is shown ÷8: at
   true speed the pitch is ~48 AU per Earth orbit and reads as a straight line. */
import { Vector3 } from 'three';
import { DEG } from '../physics/time';
import { AU_SCENE } from './scale';

const DRIFT_AU_DAY = 0.133 / 8;
const REBASE_AT = 30000;   // scene units; before float precision degrades

export interface Drift {
  offset: Vector3;         // Sun's scene position
  /** Advance by sim days; returns the frame's displacement. */
  advance(dtDays: number): Vector3;
  /** Offset to subtract from everything to recenter, or null. */
  rebaseShift(): Vector3 | null;
  reset(): void;
}

export function createDrift(): Drift {
  const dir = new Vector3(Math.cos(60 * DEG), Math.sin(60 * DEG), 0).normalize();
  const offset = new Vector3(), delta = new Vector3(), shift = new Vector3();
  return {
    offset,
    advance(dtDays) {
      delta.copy(dir).multiplyScalar(DRIFT_AU_DAY * dtDays * AU_SCENE);
      offset.add(delta);
      return delta;
    },
    rebaseShift() {
      if (offset.length() <= REBASE_AT) return null;
      shift.copy(offset);
      offset.set(0, 0, 0);
      return shift;
    },
    reset() { offset.set(0, 0, 0); },
  };
}

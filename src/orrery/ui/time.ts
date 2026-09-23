/* Time controls on top of SPEEDS: direction and magnitude are split so the
   console can offer reverse / pause / play plus a magnitude picker. */
import { PAUSED_IDX, SPEEDS, actions, sim } from '../state';

let lastRunning = sim.get().speedIdx === PAUSED_IDX ? 6 : sim.get().speedIdx;
sim.subscribe(s => { if (s.speedIdx !== PAUSED_IDX) lastRunning = s.speedIdx; });

const indexOf = (mult: number) => SPEEDS.findIndex(s => s.mult === mult);

export const MAGNITUDES = [...new Set(SPEEDS.map(s => Math.abs(s.mult)).filter(m => m > 0))]
  .sort((x, y) => x - y)
  .map(m => ({ value: m, label: SPEEDS[indexOf(m)].label.replace(/^1 /, '').replace('/s', '') }));

export const direction = (idx: number) => Math.sign(SPEEDS[idx].mult);

/** Nearest available speed with the given sign, preferring magnitude `mag`. */
function pick(sign: number, mag: number): number {
  const exact = indexOf(sign * mag);
  if (exact >= 0) return exact;
  let best = -1, bestD = Infinity;
  SPEEDS.forEach((s, i) => {
    if (Math.sign(s.mult) !== sign) return;
    const d = Math.abs(Math.log(Math.abs(s.mult)) - Math.log(mag));
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

export const time = {
  pause: () => actions.setSpeed(PAUSED_IDX),
  togglePause() {
    if (sim.get().speedIdx === PAUSED_IDX) actions.setSpeed(lastRunning);
    else actions.setSpeed(PAUSED_IDX);
  },
  run(sign: 1 | -1) {
    const mag = Math.abs(SPEEDS[lastRunning].mult);
    actions.setSpeed(pick(sign, mag));
  },
  setMagnitude(mag: number) {
    const cur = direction(sim.get().speedIdx);
    const i = cur < 0 ? indexOf(-mag) : -1;
    actions.setSpeed(i >= 0 ? i : indexOf(mag));
  },
  step(delta: 1 | -1) {
    const i = Math.max(0, Math.min(SPEEDS.length - 1, sim.get().speedIdx + delta));
    actions.setSpeed(i);
  },
  now() {
    sim.update(s => ({ ...s, time: Date.now() }));
  },
};

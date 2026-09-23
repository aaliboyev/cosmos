/* Runs the cloud off the main thread. Each 'frame' request advances the sim for
   a slice of wall time and answers with a snapshot in buffers the page hands
   back, so nothing is allocated per frame once running. */
import { createCloud, type Cloud, type CloudParams } from './physics/sim';

export type ToWorker =
  | { type: 'start'; params: CloudParams }
  | { type: 'frame'; budgetMs: number; wantStats: boolean; pos?: Float32Array; size?: Float32Array; dens?: Float32Array };

export interface Snapshot {
  type: 'snapshot';
  t: number;
  pos: Float32Array;       // xyz per particle, R0
  size: Float32Array;      // smoothing length, R0; 0 once swallowed
  dens: Float32Array;      // density / ρ0
  /** Per sink: x y z m mdot lx ly lz. */
  sinks: Float64Array;
  stats: ReturnType<Cloud['stats']> | null;
}

let cloud: Cloud | null = null;

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'start') { cloud = createCloud(msg.params); return; }
  if (!cloud) return;
  cloud.advance(msg.budgetMs);
  const n = cloud.params.n;
  const pos = msg.pos?.length === n * 3 ? msg.pos : new Float32Array(n * 3);
  const size = msg.size?.length === n ? msg.size : new Float32Array(n);
  const dens = msg.dens?.length === n ? msg.dens : new Float32Array(n);
  const { x, y, z, h, rho, alive } = cloud;
  const rho0 = 3 / (4 * Math.PI);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = x[i]; pos[i * 3 + 1] = y[i]; pos[i * 3 + 2] = z[i];
    size[i] = alive[i] ? h[i] : 0;
    dens[i] = rho[i] / rho0;
  }
  const sinks = new Float64Array(cloud.sinks.length * 8);
  cloud.sinks.forEach((s, k) => sinks.set([s.x, s.y, s.z, s.m, s.mdot, s.lx, s.ly, s.lz], k * 8));
  const snap: Snapshot = { type: 'snapshot', t: cloud.t, pos, size, dens, sinks, stats: msg.wantStats ? cloud.stats() : null };
  (self as unknown as Worker).postMessage(snap, [pos.buffer, size.buffer, dens.buffer]);
};

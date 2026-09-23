/* Runs the disk off the main thread and posts one snapshot per tick: heliocentric
   positions, masses and composition for every body, collision events, the leaders'
   orbital elements and, less often, the conservation check. */
import { G, M_EARTH, createDisk, elementsOf, type DiskParams } from './physics';

export type ToWorker =
  | { kind: 'start'; params: Partial<DiskParams> }
  | { kind: 'rate'; yearsPerSecond: number }
  | { kind: 'pause'; paused: boolean };

export interface Leader {
  id: number; massEarth: number; gasEarth: number; ice: number;
  a: number; e: number; i: number; node: number; peri: number;
}

export interface Frame {
  kind: 'frame';
  n: number;
  pos: Float32Array;        // AU, heliocentric, scene axes (y = disk normal)
  mass: Float32Array;       // M⊕
  ice: Float32Array;        // ice mass fraction
  gas: Float32Array;        // accreted gas, M⊕
  ids: Int32Array;
  events: Float32Array;     // x, y, z, mass M⊕, fragments per event
  leaders: Leader[];
  t: number;                // orbital time, yr
  gasAge: number;           // gas-disk age, yr
  inflate: number;
  gasFrac: number;
  rate: number;             // achieved yr/s
  check: { dE: number; dP: number; dL: number } | null;
}

let disk = createDisk();
let yearsPerSecond = 1, paused = false;
let debt = 0, last = performance.now(), ticks = 0;
let rateWindow = { t0: performance.now(), sim0: 0 }, rate = 0;

const LEADERS = 8;
const BUDGET_MS = 12;

function snapshot(check: Frame['check']): Frame {
  const n = disk.n, { x, y, z, vx, vy, vz, m, ice, gas, id } = disk.arrays, st = disk.star;
  const pos = new Float32Array(n * 3), mass = new Float32Array(n), ic = new Float32Array(n), gs = new Float32Array(n), ids = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = x[i] - st.x; pos[i * 3 + 1] = y[i] - st.y; pos[i * 3 + 2] = z[i] - st.z;
    mass[i] = m[i] / M_EARTH; ic[i] = ice[i]; gs[i] = gas[i] / M_EARTH; ids[i] = id[i];
  }
  const top: number[] = [];
  for (let i = 0; i < n; i++) {
    if (top.length < LEADERS) { top.push(i); top.sort((a, b) => m[b] - m[a]); continue; }
    if (m[i] > m[top[LEADERS - 1]]) { top[LEADERS - 1] = i; top.sort((a, b) => m[b] - m[a]); }
  }
  const leaders = top.map(i => {
    // scene axes (x, y_up, z) → ecliptic-style (x, −z, y) for the elements
    const el = elementsOf(x[i] - st.x, -(z[i] - st.z), y[i] - st.y, vx[i] - st.vx, -(vz[i] - st.vz), vy[i] - st.vy, G * (st.m + m[i]));
    return { id: id[i], massEarth: m[i] / M_EARTH, gasEarth: gas[i] / M_EARTH, ice: ice[i], ...el };
  });
  const ev = disk.state.events;
  const events = new Float32Array(ev.length * 5);
  ev.forEach((e, k) => events.set([e.x, e.y, e.z, e.mass / M_EARTH, e.fragments], k * 5));
  ev.length = 0;
  return {
    kind: 'frame', n, pos, mass, ice: ic, gas: gs, ids, events, leaders,
    t: disk.state.t, gasAge: disk.state.t * disk.params.gasClock, inflate: disk.params.inflate, gasFrac: disk.state.gasFrac, rate, check,
  };
}

function tick() {
  const now = performance.now();
  const real = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) {
    debt += real * yearsPerSecond / disk.state.dt;
    const t0 = performance.now();
    while (debt >= 1 && performance.now() - t0 < BUDGET_MS) { disk.step(); debt--; }
    // what the machine can't keep up with is dropped, not queued
    debt = Math.min(debt, 2);
  }
  if (now - rateWindow.t0 > 1000) {
    rate = (disk.state.t - rateWindow.sim0) / ((now - rateWindow.t0) / 1000);
    rateWindow = { t0: now, sim0: disk.state.t };
  }
  const check = ++ticks % 30 === 0 ? disk.conservation() : null;
  const f = snapshot(check);
  (self as unknown as Worker).postMessage(f, [f.pos.buffer, f.mass.buffer, f.ice.buffer, f.gas.buffer, f.ids.buffer, f.events.buffer]);
  setTimeout(tick, Math.max(0, 16 - (performance.now() - now)));
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.kind === 'start') {
    disk = createDisk(msg.params);
    debt = 0;
    rateWindow = { t0: performance.now(), sim0: 0 };
  } else if (msg.kind === 'rate') yearsPerSecond = msg.yearsPerSecond;
  else paused = msg.paused;
};

tick();

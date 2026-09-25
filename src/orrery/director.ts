/* Plays a scripted timeline against the frame clock, for recording videos. Dev server only:
   `?demo=<module path>` loads the timeline and plays it in real time (`&from=<s>` seeks);
   `&capture` stops the animation loop and exposes `window.cosmosCapture` to step frames on a
   fixed clock; `&clean` hides the HUD. P logs the camera pose for pasting into a timeline. */
import type { PerspectiveCamera } from 'three';
import type { CameraPose, CameraRig, RigBody } from '../shared/camera';
import { actions, sim, toggles } from './state';
import type { Trails } from './trails';

/** Runs once at `at`, or every frame over [at, at + dur] with k going 0 → 1 (always ending on 1). */
export interface Cue { at: number; dur?: number; run(k: number): void }

export interface DirectorContext {
  rig: CameraRig;
  camera: PerspectiveCamera;
  actions: typeof actions;
  sim: typeof sim;
  toggles: typeof toggles;
  /** Sim seconds per real second from now on; null hands time back to the speed setting. */
  setRate(mult: number | null): void;
  /** Land sim time on `ms` this frame (sets the rate for one frame, so motion stays continuous). */
  setTime(ms: number): void;
  /** Title card; opacity 0 hides it. */
  title(card: TitleCard, opacity: number): void;
  /** Fact panel on the right; opacity 0 hides it. */
  panel(card: PanelCard, opacity: number): void;
  /** One line of monospace text at the top centre (a running date); opacity 0 hides it. */
  clock(text: string, opacity: number): void;
  /** Live scene body (position, radius, pole) by name. */
  body(name: string): RigBody;
  /** Run `fn` this frame after bodies and the camera rig have moved, before drawing:
      to hold the camera still in space while the system drifts. */
  afterUpdate(fn: () => void): void;
  trails: Trails;
}

export interface TitleCard {
  title: string; kind?: string; date?: string; small?: boolean;
  /** Extra small lines under the date (credits). */
  lines?: string[];
  /** Centre of the frame instead of the lower third. */
  center?: boolean;
}

export interface PanelCard { title: string; kind?: string; date?: string; time?: string; rows: [string, string][]; note?: string }

export type Timeline = (ctx: DirectorContext) => Cue[];

export interface Director {
  tick(dt: number): void;
  /** Sim rate for the frame just ticked, or null to use the speed setting. */
  rate(): number | null;
  /** Runs this frame's `afterUpdate` callbacks. */
  afterUpdate(): void;
}

interface Stage { rig: CameraRig; camera: PerspectiveCamera; bodies: RigBody[]; trails: Trails; step(dt: number, draw?: boolean): void }

declare global {
  interface Window {
    /** `skip(n)` advances n frames without drawing, to start a chunk mid-timeline. */
    cosmosCapture?: { fps: number; duration: number; step(): void; skip(n: number): void };
  }
}

export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
/** Interpolates in log space: constant ratio per unit k, for distances and time rates. */
export const logLerp = (a: number, b: number, k: number): number => Math.exp(lerp(Math.log(a), Math.log(b), k));
export const easeInOut = (k: number): number => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
export const easeIn = (k: number): number => k * k * k;
export const easeOut = (k: number): number => 1 - Math.pow(1 - k, 3);

/** Calls `show(opacity)` every frame over [at, at + dur], fading in and out over `fade` seconds. */
export function fadeCue(at: number, dur: number, show: (opacity: number) => void, fade = 0.8): Cue {
  return {
    at, dur,
    run: k => {
      const t = k * dur;
      show(k >= 1 ? 0 : clamp01(Math.min(t, dur - t) / fade));
    },
  };
}

export const titleCue = (ctx: DirectorContext, at: number, dur: number, card: TitleCard, fade = 0.8): Cue =>
  fadeCue(at, dur, o => ctx.title(card, o), fade);

/** `card` may be a function, re-evaluated every frame for live values. */
export const panelCue = (ctx: DirectorContext, at: number, dur: number, card: PanelCard | (() => PanelCard), fade = 0.6): Cue =>
  fadeCue(at, dur, o => ctx.panel(typeof card === 'function' ? card() : card, o), fade);

/** Overlay element that rebuilds its content only when the card changes. */
function overlay<T>(css: string, build: (el: HTMLDivElement, card: T) => void): (card: T, opacity: number) => void {
  const el = document.createElement('div');
  el.style.cssText = css + ';position:fixed;z-index:20;pointer-events:none;opacity:0';
  document.body.appendChild(el);
  let shown = '';
  return (card, opacity) => {
    const key = JSON.stringify(card);
    if (key !== shown) { shown = key; el.replaceChildren(); build(el, card); }
    el.style.opacity = String(opacity);
  };
}

function div(parent: HTMLElement, text: string, css: string): HTMLDivElement {
  const d = document.createElement('div');
  d.textContent = text;
  d.style.cssText = css;
  parent.appendChild(d);
  return d;
}

function createPanel(): (card: PanelCard, opacity: number) => void {
  return overlay<PanelCard>('right:6vw;top:50%;transform:translateY(-50%);width:44vh;text-shadow:0 1px 10px rgba(0,0,10,.9)', (el, card) => {
    if (card.kind) div(el, card.kind, 'font-size:1.3vh;letter-spacing:.3em;text-transform:uppercase;color:var(--accent);margin-bottom:.9vh');
    div(el, card.title, 'font-size:4.4vh;font-weight:300;letter-spacing:.05em;color:var(--text);margin-bottom:2.2vh');
    if (card.date) {
      div(el, card.date, `font-size:3.2vh;font-weight:300;color:var(--text);margin:-1vh 0 ${card.time ? '.4vh' : '2.2vh'}`);
      if (card.time) div(el, card.time, 'font-family:var(--mono);font-size:1.7vh;color:var(--accent-hi);margin-bottom:2.2vh');
    }
    for (const [label, value] of card.rows) {
      const row = div(el, '', 'display:flex;justify-content:space-between;gap:2vh;padding:.9vh 0;border-top:1px solid var(--line)');
      div(row, label, 'font-size:1.25vh;letter-spacing:.2em;text-transform:uppercase;color:var(--dim);white-space:nowrap');
      div(row, value, 'font-family:var(--mono);font-size:1.45vh;color:var(--soft);text-align:right;white-space:nowrap');
    }
    if (card.note) div(el, card.note, 'font-size:1.5vh;line-height:1.5;color:var(--soft);margin-top:2vh;padding-top:1.6vh;border-top:1px solid var(--line)');
  });
}

function createTitle(): (card: TitleCard, opacity: number) => void {
  return overlay<TitleCard>('left:0;right:0;text-align:center;text-shadow:0 2px 18px rgba(0,0,10,.9)', (el, card) => {
    el.style.bottom = card.center ? '' : '14vh';
    el.style.top = card.center ? '50%' : '';
    el.style.transform = card.center ? 'translateY(-50%)' : '';
    if (card.kind) div(el, card.kind, 'font-size:1.6vh;letter-spacing:.32em;text-transform:uppercase;color:var(--accent);margin-bottom:1.2vh');
    div(el, card.title, `font-size:${card.small ? 3.4 : 5.2}vh;font-weight:300;letter-spacing:.06em;color:var(--text)`);
    if (card.date) div(el, card.date, 'font-family:var(--mono);font-size:1.8vh;color:var(--soft);margin-top:1.4vh');
    if (card.lines?.length) {
      const box = div(el, '', 'margin:3.2vh auto 0;max-width:62vw;display:grid;grid-template-columns:auto auto;gap:.5vh 2.4vh;'
        + 'justify-content:center;text-align:left;font-size:1.3vh;line-height:1.4');
      for (const line of card.lines) {
        const [label, value] = line.split(' — ');
        div(box, label, 'color:var(--dim);text-align:right;letter-spacing:.06em');
        div(box, value ?? '', 'color:var(--soft)');
      }
    }
  });
}

function createClock(): (text: string, opacity: number) => void {
  return overlay<string>('left:0;right:0;top:6vh;text-align:center;font-family:var(--mono);font-size:2.2vh;'
    + 'letter-spacing:.12em;color:var(--soft);text-shadow:0 1px 10px rgba(0,0,10,.9)', (el, text) => { el.textContent = text; });
}

function watchPoseKey(rig: CameraRig): void {
  addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 'p' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const r = (x: number) => Number(x.toPrecision(7));
    const p: CameraPose = rig.pose();
    const pose = { ...p, dist: r(p.dist), quaternion: p.quaternion.map(r), pan: p.pan.map(r) };
    const json = JSON.stringify(pose);
    console.log(`pose @ ${new Date(sim.get().time).toISOString()}`, toggles.get(), '\n' + json);
    navigator.clipboard?.writeText(json).catch(() => {});
  });
}

export async function startDirector(stage: Stage): Promise<Director> {
  const params = new URLSearchParams(location.search);
  if (params.has('clean')) document.getElementById('hud')!.style.display = 'none';
  watchPoseKey(stage.rig);

  let rateSetting: number | null = null;
  let timeGoal: number | null = null;
  let frameRate: number | null = null;
  let dt = 1 / 60;
  let late: (() => void)[] = [];
  const ctx: DirectorContext = {
    rig: stage.rig, camera: stage.camera, actions, sim, toggles,
    setRate: m => { rateSetting = m; },
    setTime: ms => { timeGoal = ms; },
    title: createTitle(),
    panel: createPanel(),
    clock: createClock(),
    body: name => {
      const b = stage.bodies.find(x => x.name === name);
      if (!b) throw new Error(`no body ${name}`);
      return b;
    },
    afterUpdate: fn => { late.push(fn); },
    trails: stage.trails,
  };

  const path = params.get('demo');
  const cues: Cue[] = path ? ((await import(/* @vite-ignore */ path)).default as Timeline)(ctx) : [];
  cues.sort((a, b) => a.at - b.at);
  const done = new Set<Cue>();
  const duration = cues.reduce((m, c) => Math.max(m, c.at + (c.dur ?? 0)), 0);

  let t = 0;
  function play() {
    for (const c of cues) {
      if (done.has(c) || t < c.at) continue;
      const k = c.dur ? clamp01((t - c.at) / c.dur) : 1;
      c.run(k);
      if (k >= 1) done.add(c);
    }
  }

  const director: Director = {
    tick(frameDt) {
      dt = frameDt;
      t += frameDt;
      play();
      if (timeGoal !== null) {
        frameRate = dt > 0 ? (timeGoal - sim.get().time) / 1000 / dt : 0;
        timeGoal = null;
      } else frameRate = rateSetting;
    },
    rate: () => frameRate,
    afterUpdate() {
      const fns = late;
      late = [];
      for (const fn of fns) fn();
    },
  };

  // seek: replay every cue up to `from` in order; scenes set their own absolute state
  const from = Number(params.get('from'));
  if (from > 0) { t = from; play(); }

  if (params.has('capture')) {
    const fps = Number(params.get('fps')) || 60;
    window.cosmosCapture = {
      fps, duration: duration - t,
      step: () => stage.step(1 / fps),
      skip: n => { for (let i = 0; i < n; i++) stage.step(1 / fps, false); },
    };
  }
  return director;
}

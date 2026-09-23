/* 6-DOF camera. Orientation is a quaternion rotated about the camera's own axes, so
   there is no pole clamp and roll is free. Two modes share it: free flight, and
   orbit, where position is derived from orientation around a pivot. While a body
   is focused the camera rides along with it in both modes. */
import { Quaternion, Vector3, type PerspectiveCamera } from 'three';
import type { CameraRig, CameraRigOptions, RigBody, RigUnits } from './index';
import type { CameraMode } from './state';
import { attitude, damp, easeInOutCubic, flySpeed, lookQuaternion, rotateLocal } from './math';

const MOVE_KEYS = 'wsadrf';
const CLICK_SLOP_PX = 5;
const LOOK_RATE = 1.0;        // rad per screen-height of drag, scaled by fov
const ORBIT_RATE = 5.0;       // rad per screen-height of drag
const ROLL_RATE = 1.4;        // rad/s
const COLLIDE = 1.15;         // stay outside this many radii
const ORBIT_MIN = 1.3;

type Pivot = { kind: 'target' } | { kind: 'center' } | { kind: 'point'; p: Vector3 };

interface Transition {
  body: () => Vector3;          // live point the offsets are measured from
  fromOffset: Vector3;
  toOffset: Vector3;
  fromQ: Quaternion;
  up: Vector3;
  t: number;
  dur: number;
  pivot: Pivot;
}

const isEditable = (el: EventTarget | null): boolean =>
  el instanceof HTMLElement && (el.isContentEditable || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
    || (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'range'].includes(el.type)));

const SCENE_UNITS: RigUnits = {
  distance: (cam, b) => cam.distanceTo(b.position),
  perSceneUnit: () => 1,
};

export function createFreeRig(camera: PerspectiveCamera, dom: HTMLElement, opts: CameraRigOptions): CameraRig {
  const { mode: cameraMode, flight, request: cameraRequest } = opts.state;
  const units = opts.units ?? SCENE_UNITS;
  // "center" is the page's anchor body: the Sun in the orrery, the protostar in the nebula
  const center = opts.bodies[0];
  const overviewOffset = opts.overview?.clone() ?? camera.position.clone().sub(center.position);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const q = camera.quaternion;
  const pos = camera.position;

  let mode: CameraMode = cameraMode.get();
  let target: RigBody | null = null;
  const prevTarget = new Vector3();
  let pivot: Pivot = { kind: 'center' };
  const pan = new Vector3();
  let dist = pos.distanceTo(center.position);
  let distGoal = dist;
  let transition: Transition | null = null;
  let aimOnlyName: string | null = null;

  const vel = new Vector3();              // own velocity, world frame
  const angVel = new Vector3();           // local rad/s: x pitch, y yaw, z roll
  const keys = new Set<string>();
  let boost = false;
  let dollyPending = 0;                   // free-mode scroll, log units, eased in over a few frames

  lookQuaternion(pos, center.position, new Vector3(0, 1, 0), q);

  // ---------- geometry helpers
  const tmp = new Vector3(), tmp2 = new Vector3(), fwd = new Vector3(), right = new Vector3(), up = new Vector3();
  const qSpan = new Quaternion(), qStep = new Quaternion(), qLook = new Quaternion();

  function pivotPos(out: Vector3): Vector3 {
    if (pivot.kind === 'target' && target) return out.copy(target.position).add(pan);
    if (pivot.kind === 'point') return out.copy(pivot.p);
    return out.copy(center.position).add(pan);
  }
  const pivotRadius = (): number =>
    pivot.kind === 'target' && target ? target.radius() : pivot.kind === 'center' ? center.radius() : 0;

  function nearestBody(): { body: RigBody; surface: number } {
    let best = center, surface = Infinity;
    for (const b of opts.bodies) {
      const s = pos.distanceTo(b.position) - b.radius();
      if (s < surface) { surface = s; best = b; }
    }
    return { body: best, surface };
  }

  function collide() {
    for (const b of opts.bodies) {
      const min = b.radius() * COLLIDE;
      tmp.subVectors(pos, b.position);
      const d = tmp.length();
      if (d < min && d > 0) {
        tmp.divideScalar(d);
        pos.copy(b.position).addScaledVector(tmp, min);
        const inward = vel.dot(tmp);
        if (inward < 0) vel.addScaledVector(tmp, -inward);
      }
    }
  }

  /** Body closest to the view axis, within its apparent size (reticle) or else a 25° cone. */
  function pickAhead(): RigBody | null {
    camera.getWorldDirection(fwd);
    let reticle: RigBody | null = null, reticleD = Infinity;
    let cone: RigBody | null = null, coneD = Infinity;
    for (const b of opts.bodies) {
      tmp.subVectors(b.position, pos);
      const d = tmp.length();
      if (d < 1e-9) continue;
      const ang = Math.acos(Math.min(1, tmp.dot(fwd) / d));
      const apparent = Math.max(Math.atan(b.radius() / d) * 1.5, 2 * Math.PI / 180);
      if (ang < apparent && d < reticleD) { reticle = b; reticleD = d; }
      if (ang < 25 * Math.PI / 180 && d < coneD) { cone = b; coneD = d; }
    }
    return reticle ?? cone;
  }

  // ---------- modes and transitions
  function setMode(m: CameraMode) {
    if (m === mode) return;
    mode = m;
    if (cameraMode.get() !== m) cameraMode.set(m);
  }

  function startTransition(body: () => Vector3, toOffset: Vector3, dur: number, nextPivot: Pivot, upHint?: Vector3) {
    vel.set(0, 0, 0); angVel.set(0, 0, 0);
    transition = {
      body,
      fromOffset: pos.clone().sub(body()),
      toOffset,
      fromQ: q.clone(),
      up: upHint ?? new Vector3(0, 1, 0).applyQuaternion(q),
      t: 0,
      dur: reducedMotion ? 0 : dur,
      pivot: nextPivot,
    };
    setMode('orbit');
  }

  const poleV = new Vector3(), lightDir = new Vector3(), horiz = new Vector3();

  /** Distance at which a sphere of radius `extent` fits inside the narrower half-fov with margin. */
  function fitDistance(extent: number): number {
    const halfV = camera.fov * Math.PI / 360;
    const halfH = Math.atan(Math.tan(halfV) * camera.aspect);
    return extent / Math.sin(Math.min(halfV, halfH) * 0.85);
  }

  function flyTo(b: RigBody) {
    const r = b.radius();
    const frame = b === center ? r * 6 : Math.max(r * 4.5, fitDistance(b.frameRadius?.() ?? r));
    const dir = tmp2;
    let upHint: Vector3 | undefined;
    if (b === center) {
      dir.subVectors(pos, b.position);
      if (dir.lengthSq() < 1e-12) dir.set(0, 0, 1);
      dir.normalize();
      dir.y += 0.35;
      dir.normalize();
    } else {
      // lit side: rotate the body→center line (the light source) by phaseDeg about the pole, then
      // lift above the equator on the lit side so rings show their lit face
      const n = b.pole ? b.pole(poleV).normalize() : poleV.set(0, 1, 0);
      lightDir.subVectors(center.position, b.position).normalize();
      const lat = Math.asin(Math.max(-1, Math.min(1, lightDir.dot(n))));
      horiz.copy(lightDir).addScaledVector(n, -lightDir.dot(n));
      if (horiz.lengthSq() < 1e-6) horiz.set(1, 0, 0).addScaledVector(n, -n.x);
      horiz.normalize().applyAxisAngle(n, (b.phaseDeg ?? 38) * Math.PI / 180);
      const elev = (lat < 0 ? -1 : 1) * Math.min(70, Math.max(18, Math.abs(lat) * 180 / Math.PI + 10)) * Math.PI / 180;
      dir.copy(horiz).multiplyScalar(Math.cos(elev)).addScaledVector(n, Math.sin(elev));
      upHint = n.clone();
    }
    const toOffset = dir.multiplyScalar(frame);
    const ratio = Math.abs(Math.log10(Math.max(pos.distanceTo(b.position), 1e-9) / frame));
    const dur = Math.min(2.5, 1.2 + 0.35 * ratio);
    pan.set(0, 0, 0);
    startTransition(() => b.position, toOffset.clone(), dur, { kind: 'target' }, upHint);
  }

  function aimAt(body: () => Vector3, nextPivot: Pivot) {
    startTransition(body, pos.clone().sub(body()), 0.5, nextPivot);
  }

  function finishTransition(tr: Transition) {
    transition = null;
    pivot = tr.pivot;
    dist = distGoal = tr.toOffset.length();
    pan.set(0, 0, 0);
    if (target) prevTarget.copy(target.position);
  }

  function stepTransition(dt: number) {
    const tr = transition!;
    tr.t = tr.dur > 0 ? Math.min(1, tr.t + dt / tr.dur) : 1;
    const e = easeInOutCubic(tr.t);
    const a = tr.fromOffset.length(), b = tr.toOffset.length();
    const len = a > 0 && b > 0 ? Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * e) : b;
    const dirA = tmp.copy(tr.fromOffset).normalize();
    const dirB = tmp2.copy(tr.toOffset).normalize();
    qSpan.setFromUnitVectors(dirA, dirB);
    const dir = dirA.applyQuaternion(qStep.identity().slerp(qSpan, e));
    const center = tr.body();
    pos.copy(center).addScaledVector(dir, len);
    const look = lookQuaternion(pos, center, tr.up, qLook);
    q.slerpQuaternions(tr.fromQ, look, easeInOutCubic(Math.min(1, tr.t * 1.6)));
    if (tr.t >= 1) { q.copy(look); finishTransition(tr); }
  }

  function cancelTransition() {
    if (!transition) return;
    transition = null;
    pan.set(0, 0, 0);
    if (target) prevTarget.copy(target.position);
    setMode('free');
  }

  function enterOrbit() {
    if (target) { aimAt(() => target!.position, { kind: 'target' }); return; }
    const pick = pickAhead();
    if (pick) {
      if (pick === center) { aimAt(() => center.position, { kind: 'center' }); return; }
      aimOnlyName = pick.name;
      opts.select(pick.name);   // → focus() aims instead of flying
      return;
    }
    // nothing ahead: orbit a point straight ahead, no motion needed
    camera.getWorldDirection(fwd);
    const d = Math.max(nearestBody().surface, 1e-3);
    pivot = { kind: 'point', p: pos.clone().addScaledVector(fwd, d) };
    dist = distGoal = d;
    pan.set(0, 0, 0);
    mode = 'orbit';
  }

  function overview() {
    pan.set(0, 0, 0);
    startTransition(() => center.position, overviewOffset.clone(), 2.0, { kind: 'center' }, new Vector3(0, 1, 0));
  }

  const unsubMode = cameraMode.subscribe(m => {
    if (m === mode) return;
    if (m === 'orbit') {
      mode = 'orbit';
      transition = null;
      enterOrbit();
    } else {
      cancelTransition();
      mode = 'free';
    }
  });

  let lastRequest = cameraRequest.get().n;
  const unsubRequest = cameraRequest.subscribe(r => {
    if (r.n === lastRequest) return;
    lastRequest = r.n;
    if (r.kind === 'overview') overview();
    if (r.kind === 'focus' && target) flyTo(target);
  });

  let refocusPending = false;   // displayed size changes on the next frame; reframe after that

  // ---------- input
  function onKeyDown(e: KeyboardEvent) {
    if (isEditable(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    boost = e.shiftKey;
    if (MOVE_KEYS.includes(k) || k === 'q' || k === 'e') {
      keys.add(k);
      e.preventDefault();
      if (MOVE_KEYS.includes(k)) { cancelTransition(); setMode('free'); }
      return;
    }
    if (k === '-' || k === '_' || k === '=' || k === '+') {
      opts.state.setThrottle(flight.get().throttle + (k === '-' || k === '_' ? -0.05 : 0.05));
      e.preventDefault();
      return;
    }
    if (e.repeat) return;
    if (k === 'tab') {
      const active = document.activeElement;
      if (active && active !== document.body && active !== dom) return;   // keyboard navigation of the HUD
      e.preventDefault();
      if (mode === 'orbit') { cancelTransition(); setMode('free'); } else cameraMode.set('orbit');
    } else if (k === 'escape') {
      cancelTransition();
      pan.set(0, 0, 0);
      opts.select(null);
    } else if (k === 'h') {
      opts.select(null);
      overview();
    }
  }
  function onKeyUp(e: KeyboardEvent) {
    keys.delete(e.key.toLowerCase());
    boost = e.shiftKey;
  }
  function onBlur() { keys.clear(); boost = false; }

  const pointers = new Map<number, { x: number; y: number }>();
  let downX = 0, downY = 0, moved = 0, button = 0, lastMoveAt = 0;
  let pinchDist = 0;
  const pinchMid = { x: 0, y: 0 };
  const dragVel = new Vector3();

  function onPointerDown(e: PointerEvent) {
    dom.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    cancelTransition();
    angVel.set(0, 0, 0);
    dragVel.set(0, 0, 0);
    if (pointers.size === 1) {
      downX = e.clientX; downY = e.clientY; moved = 0; button = e.button;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchMid.x = (a.x + b.x) / 2; pinchMid.y = (a.y + b.y) / 2;
      moved = CLICK_SLOP_PX + 1;
    }
  }

  function rotateBy(dx: number, dy: number, dtEvent: number) {
    const h = dom.clientHeight || innerHeight;
    let px: number, py: number;
    if (mode === 'free') {
      // grab-the-sky: content follows the pointer
      const k = LOOK_RATE * camera.fov * Math.PI / 180 / h;
      px = dy * k; py = dx * k;
    } else {
      const k = ORBIT_RATE / h;
      px = -dy * k; py = -dx * k;
    }
    rotateLocal(q, px, py, 0);
    const inv = 1 / Math.max(dtEvent, 1 / 240);
    dragVel.lerp(tmp.set(px * inv, py * inv, 0), 0.5);
  }

  function panBy(dx: number, dy: number) {
    const h = dom.clientHeight || innerHeight;
    const scale = mode === 'orbit' ? dist : Math.max(nearestBody().surface, 1e-4);
    const k = scale * Math.tan(camera.fov * Math.PI / 360) * 2 / h;
    right.set(1, 0, 0).applyQuaternion(q);
    up.set(0, 1, 0).applyQuaternion(q);
    tmp.copy(right).multiplyScalar(-dx * k).addScaledVector(up, dy * k);
    if (mode === 'orbit') {
      if (pivot.kind === 'point') pivot.p.add(tmp); else pan.add(tmp);
    } else pos.add(tmp);
  }

  function zoomBy(factor: number) {
    if (mode === 'orbit') {
      const min = Math.max(pivotRadius() * ORBIT_MIN, 1e-5);
      distGoal = Math.min(Math.max(distGoal * factor, min), 2e5);
    } else {
      camera.getWorldDirection(fwd);
      pos.addScaledVector(fwd, (1 - factor) * Math.max(nearestBody().surface, 1e-4));
      collide();
    }
  }

  function onPointerMove(e: PointerEvent) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    const now = performance.now();
    const dtEvent = (now - lastMoveAt) / 1000;
    lastMoveAt = now;
    if (pointers.size === 1) {
      moved = Math.max(moved, Math.hypot(e.clientX - downX, e.clientY - downY));
      if (moved <= CLICK_SLOP_PX) return;
      if (button === 0) rotateBy(dx, dy, dtEvent);
      else panBy(dx, dy);
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (pinchDist > 0 && d > 0) zoomBy(pinchDist / d);
      panBy(mx - pinchMid.x, my - pinchMid.y);
      pinchDist = d; pinchMid.x = mx; pinchMid.y = my;
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId);
    if (pointers.size === 0 && e.type === 'pointerup') {
      if (moved <= CLICK_SLOP_PX && e.button === 0) {
        opts.onClick?.((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      } else if (button === 0 && performance.now() - lastMoveAt < 60) {
        angVel.copy(dragVel).multiplyScalar(0.6);   // coast
      }
    }
    pinchDist = 0;
  }

  function onWheel(e: WheelEvent) {
    // labels sit over the canvas and take clicks; wheel over them still zooms
    const t = e.target as HTMLElement | null;
    if (t !== dom && !t?.classList?.contains('label')) return;
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const logZoom = Math.max(-0.5, Math.min(0.5, dy * 0.0015));
    if (transition) transition.toOffset.multiplyScalar(Math.exp(logZoom));   // zoom the destination
    else if (mode === 'orbit') zoomBy(Math.exp(logZoom));
    else dollyPending += logZoom;
  }

  const onDblClick = (e: MouseEvent) => opts.onDoubleClick?.((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  const onContextMenu = (e: Event) => e.preventDefault();

  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  addEventListener('blur', onBlur);
  dom.addEventListener('pointerdown', onPointerDown);
  dom.addEventListener('pointermove', onPointerMove);
  dom.addEventListener('pointerup', onPointerUp);
  dom.addEventListener('pointercancel', onPointerUp);
  addEventListener('wheel', onWheel, { passive: false });
  dom.addEventListener('dblclick', onDblClick);
  dom.addEventListener('contextmenu', onContextMenu);
  dom.style.touchAction = 'none';

  // ---------- flight readout
  let readoutAt = 0, speedSmooth = 0;
  const frameRel = new Vector3(), prevFrameRel = new Vector3();
  let hasPrevRel = false;

  /** Body nearest in page units, and that distance. */
  function nearestTrue(): { body: RigBody; dist: number } {
    let best = center, bestD = Infinity;
    for (const b of opts.bodies) {
      const d = units.distance(pos, b);
      if (d < bestD) { bestD = d; best = b; }
    }
    return { body: best, dist: bestD };
  }

  function writeFlight(dt: number) {
    const anchor = target ? target.position : center.position;
    frameRel.subVectors(pos, anchor);
    if (hasPrevRel && dt > 0) speedSmooth += (frameRel.distanceTo(prevFrameRel) / dt - speedSmooth) * damp(6, dt);
    prevFrameRel.copy(frameRel);
    hasPrevRel = true;

    const now = performance.now();
    if (now - readoutAt < 100) return;
    readoutAt = now;
    const near = nearestTrue();
    const att = attitude(q);
    flight.set({
      speed: speedSmooth * units.perSceneUnit(pos, near.body), throttle: flight.get().throttle,
      headingDeg: att.headingDeg, pitchDeg: att.pitchDeg, rollDeg: att.rollDeg,
      nearest: near.body.name, nearestDist: near.dist,
    });
  }

  // ---------- frame
  function update(dt: number, centerDelta: Vector3) {
    if (refocusPending && target) { refocusPending = false; flyTo(target); }
    // ride the focused body, or the drifting system
    if (target) {
      tmp.subVectors(target.position, prevTarget);
      if (!transition && mode === 'free') pos.add(tmp);
      prevTarget.copy(target.position);
    } else if (!transition && mode === 'free') pos.add(centerDelta);
    if (pivot.kind === 'point') pivot.p.add(centerDelta);

    if (transition) {
      stepTransition(dt);
    } else {
      const roll = (keys.has('q') ? 1 : 0) - (keys.has('e') ? 1 : 0);
      angVel.z += (roll * ROLL_RATE - angVel.z) * damp(8, dt);
      if (!pointers.size) {
        const decay = Math.exp(-4 * dt);
        angVel.x *= decay; angVel.y *= decay;
      }
      rotateLocal(q, angVel.x * dt, angVel.y * dt, angVel.z * dt);

      if (mode === 'free') {
        const dir = tmp.set(
          (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0),
          (keys.has('r') ? 1 : 0) - (keys.has('f') ? 1 : 0),
          (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0));
        if (dir.lengthSq() > 0) dir.normalize().applyQuaternion(q);
        const speed = flySpeed(nearestBody().surface, flight.get().throttle, boost);
        vel.lerp(dir.multiplyScalar(speed), damp(6, dt));
        pos.addScaledVector(vel, dt);
        collide();
        if (dollyPending !== 0) {
          const step = Math.abs(dollyPending) < 1e-4 ? dollyPending : dollyPending * damp(14, dt);
          dollyPending -= step;
          zoomBy(Math.exp(step));
        }
      } else {
        vel.set(0, 0, 0);
        const min = Math.max(pivotRadius() * ORBIT_MIN, 1e-5);
        distGoal = Math.max(distGoal, min);
        dist = Math.exp(Math.log(dist) + (Math.log(distGoal) - Math.log(dist)) * damp(10, dt));
        pivotPos(pos).add(tmp.set(0, 0, dist).applyQuaternion(q));
      }
    }
    writeFlight(dt);
  }

  return {
    camera,
    update,
    focus(b) {
      target = b;
      hasPrevRel = false;
      prevTarget.copy(b.position);
      pan.set(0, 0, 0);
      if (aimOnlyName === b.name) { aimOnlyName = null; aimAt(() => b.position, { kind: 'target' }); }
      else flyTo(b);
    },
    refocus() {
      if (target) refocusPending = true;
    },
    release() {
      if (!target) return;
      if (transition?.pivot.kind === 'target') cancelTransition();
      if (pivot.kind === 'target') pivot = { kind: 'point', p: pivotPos(new Vector3()) };
      pan.set(0, 0, 0);
      target = null;
      hasPrevRel = false;
    },
    translate(d) {
      pos.add(d);
      prevTarget.add(d);
      if (pivot.kind === 'point') pivot.p.add(d);
    },
    dispose() {
      unsubMode(); unsubRequest();
      removeEventListener('keydown', onKeyDown);
      removeEventListener('keyup', onKeyUp);
      removeEventListener('blur', onBlur);
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointermove', onPointerMove);
      dom.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('pointercancel', onPointerUp);
      removeEventListener('wheel', onWheel);
      dom.removeEventListener('dblclick', onDblClick);
      dom.removeEventListener('contextmenu', onContextMenu);
    },
  };
}

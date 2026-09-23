/* DOM labels over bodies. Overlapping labels are resolved greedily by priority
   (selected > larger bodies > dwarf > moons); moon labels appear only for the
   selected planet's system. Positions update every frame so labels stay pinned to
   their bodies; the overlap pass runs at ~30 Hz. */
import { Vector3, type PerspectiveCamera } from 'three';
import { selected } from './state';

export interface LabelAnchor {
  name: string;
  position: Vector3;
  radiusKm: number;
  /** displayed radius in scene units; the label sits just above the disk */
  radius?: () => number;
  dwarf?: boolean;
  /** parent planet, for moons */
  parent?: string;
}

export interface Labels {
  update(camera: PerspectiveCamera, now: number): void;
  setVisible(on: boolean): void;
}

const INTERVAL_MS = 33;
const PAD = 4;

interface Item {
  a: LabelAnchor;
  el: HTMLDivElement;
  w: number;
  h: number;
  shown: boolean;
  x: number;
  y: number;
  prio: number;
}

export function createLabels(anchors: LabelAnchor[], onClick: (name: string) => void): Labels {
  const items: Item[] = anchors.map(a => {
    const el = document.createElement('div');
    el.className = 'label' + (a.dwarf ? ' dwarf' : '') + (a.parent ? ' moon' : '');
    el.textContent = a.name;
    el.style.visibility = 'hidden';
    el.addEventListener('click', () => onClick(a.name));
    document.body.appendChild(el);
    return { a, el, w: 0, h: 0, shown: false, x: 0, y: 0, prio: 0 };
  });
  const order: Item[] = [];
  const placed: Item[] = [];
  const v = new Vector3();
  let visible = true, last = -Infinity;

  const place = (it: Item) => {
    it.el.style.transform = `translate(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px) translate(-50%, -140%)`;
  };
  const hide = (it: Item) => { if (it.shown) { it.el.style.visibility = 'hidden'; it.shown = false; } };

  return {
    update(camera, now) {
      if (!visible) return;
      const resolve = now - last >= INTERVAL_MS;
      if (resolve) last = now;
      const sel = selected.get();
      const system = sel ? (sel.parent ?? sel.name) : null;
      const W = innerWidth, H = innerHeight;
      const pxPerUnit = H / 2 / Math.tan(camera.fov * Math.PI / 360);

      order.length = 0;
      for (const it of items) {
        const a = it.a;
        if (a.parent && a.parent !== system) { hide(it); continue; }
        v.copy(a.position).project(camera);
        if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) { hide(it); continue; }
        it.x = (v.x * 0.5 + 0.5) * W;
        it.y = (-v.y * 0.5 + 0.5) * H;
        if (a.radius) {
          const d = camera.position.distanceTo(a.position);
          it.y -= Math.min(a.radius() / Math.max(d, 1e-9) * pxPerUnit, H * 0.4);
        }
        if (!it.w) { it.w = it.el.offsetWidth; it.h = it.el.offsetHeight; }
        it.prio = sel?.name === a.name ? Infinity : (a.parent ? 0 : a.dwarf ? 1 : 2) * 1e7 + a.radiusKm;
        order.push(it);
      }
      if (!resolve) {
        for (const it of order) if (it.shown) place(it);
        return;
      }
      order.sort((p, q) => q.prio - p.prio);

      placed.length = 0;
      for (const it of order) {
        // box matches the CSS anchor: centered, raised by 1.4× its height
        const x0 = it.x - it.w / 2 - PAD, x1 = it.x + it.w / 2 + PAD;
        const y0 = it.y - it.h * 1.4 - PAD, y1 = it.y - it.h * 0.4 + PAD;
        let clear = true;
        for (const p of placed) {
          const px0 = p.x - p.w / 2, px1 = p.x + p.w / 2, py0 = p.y - p.h * 1.4, py1 = p.y - p.h * 0.4;
          if (x0 < px1 && x1 > px0 && y0 < py1 && y1 > py0) { clear = false; break; }
        }
        if (!clear) { hide(it); continue; }
        placed.push(it);
        place(it);
        if (!it.shown) { it.el.style.visibility = 'visible'; it.shown = true; }
      }
    },
    setVisible(on) {
      visible = on;
      last = -Infinity;
      for (const it of items) it.el.style.display = on ? '' : 'none';
    },
  };
}

import { BufferAttribute, BufferGeometry, Line, LineBasicMaterial, type Scene, type Vector3 } from 'three';

const TRAIL_MAX = 700;

interface Trail { line: Line; count: number }

export interface Trails {
  push(key: string, color: number, opacity: number, v: Vector3): void;
  clear(): void;
  shift(delta: Vector3): void;
}

export function createTrails(scene: Scene): Trails {
  const trails = new Map<string, Trail>();

  function trailFor(key: string, color: number, opacity: number): Trail {
    let t = trails.get(key);
    if (!t) {
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(new Float32Array(TRAIL_MAX * 3), 3));
      geo.setDrawRange(0, 0);
      const line = new Line(geo, new LineBasicMaterial({ color, transparent: true, opacity }));
      line.frustumCulled = false;
      scene.add(line);
      t = { line, count: 0 };
      trails.set(key, t);
    }
    return t;
  }

  const attr = (t: Trail) => t.line.geometry.attributes.position as BufferAttribute;

  return {
    push(key, color, opacity, v) {
      const t = trailFor(key, color, opacity);
      const a = attr(t), arr = a.array as Float32Array;
      if (t.count > 0) {
        const i = (t.count - 1) * 3;
        const dx = arr[i] - v.x, dy = arr[i + 1] - v.y, dz = arr[i + 2] - v.z;
        if (dx * dx + dy * dy + dz * dz < 0.5) return;   // adaptive spacing
      }
      if (t.count === TRAIL_MAX) { arr.copyWithin(0, 3); t.count--; }
      arr.set([v.x, v.y, v.z], t.count * 3); t.count++;
      t.line.geometry.setDrawRange(0, t.count);
      a.needsUpdate = true;
    },
    clear() {
      trails.forEach(t => { t.count = 0; t.line.geometry.setDrawRange(0, 0); });
    },
    shift(delta) {
      trails.forEach(t => {
        const a = attr(t), arr = a.array as Float32Array;
        for (let i = 0; i < t.count; i++) { arr[i * 3] -= delta.x; arr[i * 3 + 1] -= delta.y; arr[i * 3 + 2] -= delta.z; }
        a.needsUpdate = true;
      });
    },
  };
}

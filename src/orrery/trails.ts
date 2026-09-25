/* Drift trails as screen-space-width lines that fade with age: bright at the
   body, dark at the tail. Max blending lets the fade read as fading light on the
   dark sky without the bright beads additive blending leaves where segment caps
   overlap. Buffers are allocated once per trail and rewritten in place. */
import { Color, CustomBlending, MaxEquation, type InterleavedBufferAttribute, type Scene, type Vector3 } from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';

const TRAIL_MAX = 900;
const MIN_STEP2 = 0.25;   // scene units², adaptive spacing
const FADE_POW = 1.6;

interface Trail {
  line: LineSegments2;
  width: number;
  points: Float32Array;   // oldest first
  segs: Float32Array;     // per segment: start xyz, end xyz
  cols: Float32Array;     // per segment: start rgb, end rgb
  color: Color;
  count: number;
}

export interface Trails {
  /** `width` in CSS pixels. */
  push(key: string, color: number, width: number, v: Vector3): void;
  clear(): void;
  shift(delta: Vector3): void;
  /** Scales every trail's light, 0..1; max blending ignores opacity, so dimming is the fade. */
  setBrightness(k: number): void;
}

/** `pixelRatio`: line widths are drawn in device pixels, so CSS widths are scaled by it. */
export function createTrails(scene: Scene, pixelRatio: () => number): Trails {
  const trails = new Map<string, Trail>();
  let brightness = 1;

  function trailFor(key: string, color: number, width: number): Trail {
    let t = trails.get(key);
    if (t) return t;
    const segs = new Float32Array((TRAIL_MAX - 1) * 6);
    const cols = new Float32Array((TRAIL_MAX - 1) * 6);
    const geo = new LineSegmentsGeometry();
    geo.setPositions(segs);
    geo.setColors(cols);
    geo.instanceCount = 0;
    const mat = new LineMaterial({
      linewidth: width * pixelRatio(), vertexColors: true, worldUnits: false,
      transparent: true, depthWrite: false, blending: CustomBlending, blendEquation: MaxEquation,
    });
    mat.color.setScalar(brightness);
    const line = new LineSegments2(geo, mat);
    line.frustumCulled = false;
    scene.add(line);
    t = { line, width, points: new Float32Array(TRAIL_MAX * 3), segs, cols, color: new Color(color), count: 0 };
    trails.set(key, t);
    return t;
  }

  function rebuild(t: Trail) {
    const { points: p, segs, cols, color, count } = t;
    const n = count - 1;
    for (let i = 0; i < n; i++) {
      const o = i * 6, a = i * 3;
      segs[o] = p[a]; segs[o + 1] = p[a + 1]; segs[o + 2] = p[a + 2];
      segs[o + 3] = p[a + 3]; segs[o + 4] = p[a + 4]; segs[o + 5] = p[a + 5];
      // age 1 at the oldest point, 0 at the body
      const k0 = Math.pow(i / n, FADE_POW), k1 = Math.pow((i + 1) / n, FADE_POW);
      cols[o] = color.r * k0; cols[o + 1] = color.g * k0; cols[o + 2] = color.b * k0;
      cols[o + 3] = color.r * k1; cols[o + 4] = color.g * k1; cols[o + 5] = color.b * k1;
    }
    const geo = t.line.geometry;
    geo.instanceCount = Math.max(n, 0);
    (geo.attributes.instanceStart as InterleavedBufferAttribute).data.needsUpdate = true;
    (geo.attributes.instanceColorStart as InterleavedBufferAttribute).data.needsUpdate = true;
  }

  return {
    push(key, color, width, v) {
      const t = trailFor(key, color, width);
      t.line.material.linewidth = t.width * pixelRatio();
      const p = t.points;
      if (t.count > 0) {
        const i = (t.count - 1) * 3;
        const dx = p[i] - v.x, dy = p[i + 1] - v.y, dz = p[i + 2] - v.z;
        if (dx * dx + dy * dy + dz * dz < MIN_STEP2) return;
      }
      if (t.count === TRAIL_MAX) { p.copyWithin(0, 3); t.count--; }
      const i = t.count * 3;
      p[i] = v.x; p[i + 1] = v.y; p[i + 2] = v.z;
      t.count++;
      rebuild(t);
    },
    clear() {
      trails.forEach(t => { t.count = 0; t.line.geometry.instanceCount = 0; });
    },
    setBrightness(k) {
      brightness = k;
      trails.forEach(t => t.line.material.color.setScalar(k));
    },
    shift(delta) {
      trails.forEach(t => {
        const p = t.points;
        for (let i = 0; i < t.count; i++) { p[i * 3] -= delta.x; p[i * 3 + 1] -= delta.y; p[i * 3 + 2] -= delta.z; }
        rebuild(t);
      });
    },
  };
}

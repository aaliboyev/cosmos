/* IAU constellation figures drawn between catalog stars at infinity, same frame as the stars.
   Names are DOM labels that fade in toward the view center. */
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, Quaternion, ShaderMaterial, Vector2, Vector3,
  type PerspectiveCamera, type Scene,
} from 'three';
import data from '../../assets/sky/constellations.json';
import catalog from '../../assets/sky/stars.json';
import { EQ_TO_SCENE, apply, unit, type V3 } from '../../shared/sky/frames';

export interface Constellations {
  update(camera: PerspectiveCamera): void;
  setVisible(on: boolean): void;
}

// Each segment is a screen-space quad: a thin core with a soft falloff reads as a faint glow
// rather than a hard 1px stroke. Endpoints behind the camera are pulled onto the near side.
const vertex = /* glsl */ `
attribute vec3 aOther;
attribute vec2 aCorner;       // x: 0 at the segment's first end, 1 at its second; y: side, ±1
uniform vec2 uViewport;       // drawing buffer, px
uniform float uHalfWidth;     // px
varying float vSide;
void main() {
  vec3 a = (viewMatrix * vec4(position, 0.0)).xyz;
  vec3 b = (viewMatrix * vec4(aOther, 0.0)).xyz;
  const float NEAR = -1e-3;
  if (a.z > NEAR && b.z > NEAR) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  if (a.z > NEAR) a = mix(a, b, (a.z - NEAR) / (a.z - b.z));
  if (b.z > NEAR) b = mix(b, a, (b.z - NEAR) / (b.z - a.z));
  vec4 ca = projectionMatrix * vec4(a, 1.0);
  vec4 cb = projectionMatrix * vec4(b, 1.0);
  vec2 sa = ca.xy / ca.w * uViewport, sb = cb.xy / cb.w * uViewport;
  vec2 n = normalize(vec2(sa.y - sb.y, sb.x - sa.x) + 1e-9);
  // the normal is taken from this end toward the other, so it flips at the second end
  float side = aCorner.x < 0.5 ? aCorner.y : -aCorner.y;
  vec4 c = ca;
  c.xy += n * side * uHalfWidth / uViewport * c.w;
  c.z = c.w * 0.999999;
  gl_Position = c;
  vSide = aCorner.y;
}`;

const fragment = /* glsl */ `
uniform vec3 uColor;
varying float vSide;
void main() {
  float d = abs(vSide);
  float glow = exp(-d * d * 9.0) * 0.55 + exp(-d * d * 90.0) * 0.45;
  gl_FragColor = vec4(uColor * glow, 1.0);
  #include <colorspace_fragment>
}`;

const stars = catalog as [number, number, number, number][];
const starDir = (i: number): V3 => apply(EQ_TO_SCENE, unit(stars[i][0], stars[i][1]));

const HALF_WIDTH_PX = 2.5;

function lines(scene: Scene, indices: number[], color: Color, order: number) {
  const segs = indices.length / 2;
  const pos = new Float32Array(segs * 12), other = new Float32Array(segs * 12), corner = new Float32Array(segs * 8);
  const index: number[] = [];
  for (let k = 0; k < segs; k++) {
    const a = starDir(indices[2 * k]), b = starDir(indices[2 * k + 1]);
    [[a, b, 0, -1], [a, b, 0, 1], [b, a, 1, -1], [b, a, 1, 1]].forEach(([p, o, end, side], j) => {
      const v = k * 4 + j;
      pos.set(p as V3, v * 3);
      other.set(o as V3, v * 3);
      corner.set([end as number, side as number], v * 2);
    });
    const v = k * 4;
    index.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('aOther', new BufferAttribute(other, 3));
  geo.setAttribute('aCorner', new BufferAttribute(corner, 2));
  geo.setIndex(index);
  const viewport = new Vector2();
  const halfWidth = { value: HALF_WIDTH_PX };
  const obj = new Mesh(geo, new ShaderMaterial({
    uniforms: { uColor: { value: color }, uViewport: { value: viewport }, uHalfWidth: halfWidth },
    vertexShader: vertex, fragmentShader: fragment,
    depthTest: false, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
  }));
  obj.onBeforeRender = renderer => {
    // ndc spans 2 units; half the buffer maps px offsets onto it
    renderer.getDrawingBufferSize(viewport).multiplyScalar(0.5);
    halfWidth.value = HALF_WIDTH_PX * renderer.getPixelRatio();
  };
  obj.frustumCulled = false;
  obj.renderOrder = order;
  scene.add(obj);
  return obj;
}

interface SkyLabel { el: HTMLDivElement; dir: Vector3; shown: boolean }

function label(text: string, dir: V3, asterism: boolean): SkyLabel {
  const el = document.createElement('div');
  el.className = 'sky-label' + (asterism ? ' asterism' : '');
  el.textContent = text;
  el.style.display = 'none';
  document.body.appendChild(el);
  return { el, dir: new Vector3(...dir), shown: false };
}

function centroid(indices: number[]): V3 {
  const c: V3 = [0, 0, 0];
  for (const i of indices) { const d = starDir(i); c[0] += d[0]; c[1] += d[1]; c[2] += d[2]; }
  const n = Math.hypot(...c);
  return [c[0] / n, c[1] / n, c[2] / n];
}

export function createConstellations(scene: Scene): Constellations {
  const figures = lines(scene, data.constellations.flatMap(c => c.segs), new Color(0.014, 0.035, 0.055), -999);
  const asterismSegs = data.asterisms.flatMap(a => a.path.slice(1).flatMap((s, k) => [a.path[k], s]));
  const asterisms = lines(scene, asterismSegs, new Color(0.025, 0.055, 0.085), -998);

  const labels = [
    ...data.constellations.map(c => label(c.name, apply(EQ_TO_SCENE, unit(c.label[0], c.label[1])), false)),
    ...data.asterisms.map(a => label(a.name, centroid(a.path), true)),
  ];

  const inv = new Quaternion();
  const v = new Vector3();
  let visible = false;
  figures.visible = asterisms.visible = false;

  return {
    update(camera) {
      if (!visible) return;
      camera.getWorldQuaternion(inv).invert();
      const tanY = Math.tan((camera.fov * Math.PI) / 360), tanX = tanY * camera.aspect;
      for (const l of labels) {
        v.copy(l.dir).applyQuaternion(inv);
        const x = v.x / -v.z / tanX, y = v.y / -v.z / tanY;
        const r = Math.hypot(x, y);
        const on = v.z < 0 && r < 1.1;
        if (on !== l.shown) { l.el.style.display = on ? '' : 'none'; l.shown = on; }
        if (!on) continue;
        l.el.style.transform = `translate(${((x * 0.5 + 0.5) * innerWidth).toFixed(1)}px, ${((-y * 0.5 + 0.5) * innerHeight).toFixed(1)}px) translate(-50%, -50%)`;
        // fully visible in the central half of the view, gone at the edges
        l.el.style.opacity = Math.min(1, Math.max(0, (1.05 - r) / 0.55)).toFixed(2);
      }
    },
    setVisible(on) {
      visible = figures.visible = asterisms.visible = on;
      if (!on) for (const l of labels) { l.el.style.display = 'none'; l.shown = false; }
    },
  };
}

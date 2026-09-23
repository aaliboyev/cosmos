/* IAU constellation figures drawn between catalog stars at infinity, same frame as the stars.
   Names are DOM labels that fade in toward the view center. */
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, LineSegments, Quaternion, ShaderMaterial, Vector3,
  type PerspectiveCamera, type Scene,
} from 'three';
import data from '../../assets/sky/constellations.json';
import catalog from '../../assets/sky/stars.json';
import { EQ_TO_SCENE, apply, unit, type V3 } from '../../shared/sky/frames';

export interface Constellations {
  update(camera: PerspectiveCamera): void;
  setVisible(on: boolean): void;
}

const vertex = /* glsl */ `
void main() {
  vec3 d = (viewMatrix * vec4(position, 0.0)).xyz;
  gl_Position = projectionMatrix * vec4(d, 1.0);
}`;

const fragment = /* glsl */ `
uniform vec3 uColor;
void main() {
  gl_FragColor = vec4(uColor, 1.0);
  #include <colorspace_fragment>
}`;

const stars = catalog as [number, number, number, number][];
const starDir = (i: number): V3 => apply(EQ_TO_SCENE, unit(stars[i][0], stars[i][1]));

function lines(scene: Scene, indices: number[], color: Color, order: number) {
  const pos = new Float32Array(indices.length * 3);
  indices.forEach((s, k) => pos.set(starDir(s), k * 3));
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  const obj = new LineSegments(geo, new ShaderMaterial({
    uniforms: { uColor: { value: color } }, vertexShader: vertex, fragmentShader: fragment,
    depthTest: false, depthWrite: false, blending: AdditiveBlending,
  }));
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
  const figures = lines(scene, data.constellations.flatMap(c => c.segs), new Color(0.055, 0.08, 0.135), -999);
  const asterismSegs = data.asterisms.flatMap(a => a.path.slice(1).flatMap((s, k) => [a.path[k], s]));
  const asterisms = lines(scene, asterismSegs, new Color(0.16, 0.21, 0.32), -998);

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

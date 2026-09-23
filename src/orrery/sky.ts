/* The sky at infinity: the ESO Milky Way panorama (galactic frame) rotated into the scene's
   ecliptic frame, plus the Yale Bright Star Catalogue drawn as points at their J2000 positions.
   Both are drawn first with depth off, so everything in the system paints over them. */
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, DataTexture, Matrix3, Mesh, PlaneGeometry, Points,
  RepeatWrapping, ShaderMaterial, SRGBColorSpace, Vector2, type PerspectiveCamera, type Scene,
} from 'three';
import milkyWayUrl from '../assets/sky/milky_way_galactic_2k.webp';
import catalog from '../assets/sky/stars.json';
import { EQ_TO_SCENE, SCENE_TO_PANORAMA, apply, unit } from './sky/frames';

export interface Sky { update(camera: PerspectiveCamera): void }

const MAP_WIDTH = 2048;   // star-removed glow map width
const MAG_LIMIT = 6.5;

const bgVertex = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// direction from the camera frustum, not the projection inverse: near/far span 1e12
const bgFragment = /* glsl */ `
uniform sampler2D uMap;
uniform mat3 uToGal;
uniform mat3 uCamRot;
uniform vec2 uTan;
uniform float uLod;
uniform float uGain;
uniform float uFloor;
varying vec2 vNdc;
void main() {
  vec3 dir = normalize(uCamRot * vec3(vNdc * uTan, -1.0));
  vec3 g = uToGal * dir;
  float l = atan(g.y, g.x);
  float b = asin(clamp(g.z, -1.0, 1.0));
  // galactic center at image center, longitude increasing to the left
  vec2 uv = vec2(0.5 - l / 6.2831853, 0.5 + b / 3.1415927);
  // explicit LOD: no seam at the longitude wrap
  vec3 glow = textureLod(uMap, uv, uLod).rgb;
  vec3 col = max(glow - uFloor, vec3(0.0)) * uGain;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const starVertex = /* glsl */ `
attribute float aMag;
attribute vec3 aColor;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vHalo;
void main() {
  // rotation only: stars sit at infinity
  vec3 d = (viewMatrix * vec4(position, 0.0)).xyz;
  gl_Position = projectionMatrix * vec4(d, 1.0);
  float flux = pow(10.0, -0.4 * (aMag - ${MAG_LIMIT.toFixed(1)}));
  gl_PointSize = clamp(2.0 * pow(flux, 0.25), 2.0, 18.0) * uPixelRatio;
  vColor = aColor * clamp(0.35 * pow(flux, 0.3), 0.25, 2.5);
  vHalo = smoothstep(1.5, 400.0, flux);
}`;

const starFragment = /* glsl */ `
varying vec3 vColor;
varying float vHalo;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r > 1.0) discard;
  float core = exp(-r * r * 6.0);
  float halo = exp(-r * 3.5) * 0.35 * vHalo;
  gl_FragColor = vec4(vColor * (core + halo), 1.0);
  #include <colorspace_fragment>
}`;

/** B−V color index → approximate sRGB of the star's blackbody, softened toward white. */
export function starColor(bv: number, out = new Color()): Color {
  const t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  const k = t / 100;
  const r = k <= 66 ? 255 : 329.7 * Math.pow(k - 60, -0.1332);
  const g = k <= 66 ? 99.47 * Math.log(k) - 161.12 : 288.12 * Math.pow(k - 60, -0.0755);
  const b = k >= 66 ? 255 : k <= 19 ? 0 : 138.52 * Math.log(k - 10) - 305.04;
  const f = (v: number) => (0.75 * Math.min(255, Math.max(0, v)) + 0.25 * 255) / 255;
  return out.setRGB(f(r), f(g), f(b), SRGBColorSpace);
}

/* The panorama has stars baked in; the catalog draws them instead. A 5×5 minimum
   filter erases point sources, then two box blurs smooth the erosion. Isotropic
   in pixels and done once, so dust lanes survive without mip-level streaks. */
function removeStars(img: HTMLImageElement): CanvasTexture {
  const w = MAP_WIDTH, h = MAP_WIDTH / 2;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, w, h);
  const data = g.getImageData(0, 0, w, h);
  const px = data.data;
  const a = new Float32Array(w * h), b = new Float32Array(w * h);
  for (let ch = 0; ch < 3; ch++) {
    for (let i = 0; i < w * h; i++) a[i] = px[i * 4 + ch];
    pass(a, b, w, h, true, true); pass(b, a, w, h, false, true);
    for (let k = 0; k < 2; k++) { pass(a, b, w, h, true, false); pass(b, a, w, h, false, false); }
    for (let i = 0; i < w * h; i++) px[i * 4 + ch] = a[i];
  }
  g.putImageData(data, 0, 0);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  return t;
}

const R = 2;

/** One separable radius-2 pass, min or mean; wraps horizontally (longitude), clamps vertically. */
function pass(src: Float32Array, dst: Float32Array, w: number, h: number, horizontal: boolean, min: boolean) {
  const n = horizontal ? w : h, lines = horizontal ? h : w;
  const step = horizontal ? 1 : w;
  for (let line = 0; line < lines; line++) {
    const base = horizontal ? line * w : line;
    for (let i = 0; i < n; i++) {
      let acc = min ? Infinity : 0;
      for (let k = -R; k <= R; k++) {
        const j = horizontal ? (i + k + n) % n : Math.min(n - 1, Math.max(0, i + k));
        const v = src[base + j * step];
        acc = min ? (v < acc ? v : acc) : acc + v;
      }
      dst[base + i * step] = min ? acc : acc / (2 * R + 1);
    }
  }
}

export function createSky(scene: Scene): Sky {
  // placeholder until the panorama is decoded and cleaned
  const map = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  map.needsUpdate = true;
  const img = new Image();
  img.onload = () => { bgUniforms.uMap.value = removeStars(img); };
  img.src = milkyWayUrl;

  const bgUniforms = {
    uMap: { value: map as DataTexture | CanvasTexture },
    uToGal: { value: new Matrix3().set(...SCENE_TO_PANORAMA) },
    uCamRot: { value: new Matrix3() },
    uTan: { value: new Vector2(1, 1) },
    uLod: { value: 0 },
    uGain: { value: 0.6 },
    uFloor: { value: 0.002 },
  };
  const background = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({
    uniforms: bgUniforms, vertexShader: bgVertex, fragmentShader: bgFragment,
    depthTest: false, depthWrite: false,
  }));
  background.frustumCulled = false;
  background.renderOrder = -1001;
  scene.add(background);

  const rows = catalog as [number, number, number, number][];
  const pos = new Float32Array(rows.length * 3), col = new Float32Array(rows.length * 3), mag = new Float32Array(rows.length);
  const c = new Color();
  rows.forEach(([ra, dec, vmag, bv], i) => {
    pos.set(apply(EQ_TO_SCENE, unit(ra, dec)), i * 3);
    starColor(bv, c);
    col.set([c.r, c.g, c.b], i * 3);
    mag[i] = vmag;
  });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new BufferAttribute(col, 3));
  geo.setAttribute('aMag', new BufferAttribute(mag, 1));
  const starUniforms = { uPixelRatio: { value: 1 } };
  // opaque pass + additive blend: stays ahead of planets in draw order
  const stars = new Points(geo, new ShaderMaterial({
    uniforms: starUniforms, vertexShader: starVertex, fragmentShader: starFragment,
    depthTest: false, depthWrite: false, blending: AdditiveBlending,
  }));
  stars.frustumCulled = false;
  stars.renderOrder = -1000;
  stars.onBeforeRender = renderer => { starUniforms.uPixelRatio.value = renderer.getPixelRatio(); };
  scene.add(stars);

  background.onBeforeRender = (renderer, _scene, camera) => {
    const cam = camera as PerspectiveCamera;
    const tanHalf = Math.tan((cam.fov * Math.PI) / 360);
    bgUniforms.uTan.value.set(tanHalf * cam.aspect, tanHalf);
    bgUniforms.uCamRot.value.setFromMatrix4(cam.matrixWorld);
    const heightPx = renderer.domElement.height || innerHeight;
    const pixelAngle = (2 * Math.atan(tanHalf)) / heightPx;
    bgUniforms.uLod.value = Math.max(0, Math.log2(pixelAngle / ((2 * Math.PI) / MAP_WIDTH)));
  };

  return { update(camera) { camera.updateMatrixWorld(); } };
}

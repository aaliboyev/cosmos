/* Small bodies (main belt, Hungarias, Hildas, Trojans, Kuiper belt) solved on the GPU from
   their elements every frame, so any sim date puts each one where its orbit says. */
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial, SRGBColorSpace, Vector3, type Scene } from 'three';
import { Group, generatePopulation } from '../physics/belt';
import { julianDate } from '../physics/time';
import { AU_SCENE, DIST_POW, isTrueScale } from './scale';

export interface Belt {
  /** `time`: sim time (ms UTC); `sunPos`: Sun's scene position. */
  update(time: number, sunPos: Vector3): void;
  setVisible(on: boolean): void;
}

// sRGB albedo tints per group; main belt splits into dark C-types and ruddier S-types
const TINT: Record<number, string[]> = {
  [Group.Main]: ['#8f8b84', '#b9a07c'],
  [Group.Hungaria]: ['#cfc7b8'],
  [Group.Hilda]: ['#8e8074'],
  [Group.Trojan]: ['#a4806a'],
  [Group.Kuiper]: ['#b8917a', '#9c8f86'],
};
// sparse outer groups get a boost so they read as structures, not noise
const GAIN: Record<number, number> = { [Group.Hilda]: 1.5, [Group.Trojan]: 1.6, [Group.Kuiper]: 1.7 };

const vertexShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec4 aOrbit;      // node, argument of perihelion, M at J2000, mean motion (rad/day)
attribute float aSize;
attribute vec3 aTint;
uniform float uDays;        // days since J2000 (float32 resolves ~1e-3 d today: < 1e-5 rad in M)
uniform float uTrueScale;
uniform vec3 uSun;
uniform float uPxPerRad;    // viewport pixels per radian
uniform float uPixelRatio;
uniform float uWorldSize;
varying vec3 vColor;
varying float vFade;

void main() {
  float a = position.x, e = position.y, inc = position.z;
  float M = mod(aOrbit.z + aOrbit.w * uDays, 6.2831853);
  float E = M + e * sin(M);
  for (int k = 0; k < 4; k++) E -= (E - e * sin(E) - M) / (1.0 - e * cos(E));
  float xo = a * (cos(E) - e), yo = a * sqrt(1.0 - e * e) * sin(E);
  float cw = cos(aOrbit.y), sw = sin(aOrbit.y), cO = cos(aOrbit.x), sO = sin(aOrbit.x), ci = cos(inc), si = sin(inc);
  vec3 ecl = vec3(
    (cw * cO - sw * sO * ci) * xo + (-sw * cO - cw * sO * ci) * yo,
    (cw * sO + sw * cO * ci) * xo + (-sw * sO + cw * cO * ci) * yo,
    (sw * si) * xo + (cw * si) * yo);
  float r = length(ecl);
  // same radial compression the planets use
  float d = uTrueScale > 0.5 ? r * ${AU_SCENE.toFixed(1)} : pow(r, ${DIST_POW.toFixed(3)}) * ${AU_SCENE.toFixed(1)};
  vec3 p = vec3(ecl.x, ecl.z, -ecl.y) / r * d + uSun;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>

  float dist = max(-mv.z, 1e-6);
  float px = aSize * uWorldSize / dist * uPxPerRad;
  gl_PointSize = clamp(px, 1.6, 7.0) * uPixelRatio;
  // points pinned at the minimum size pile up into a white ring from afar; screen density
  // grows with 1/dist², so fade with the square of the true projected size
  float density = clamp(px * px * 25.0, 0.03, 1.0);
  // phase: bodies seen sunlit are brighter than those seen backlit
  float phase = dot(normalize(uSun - p), normalize(cameraPosition - p));
  vFade = mix(0.55, 1.0, 0.5 + 0.5 * phase) * clamp(0.6 + 0.2 * aSize, 0.6, 1.2) * density;
  vColor = aTint;
}`;

const fragmentShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uGain;
varying vec3 vColor;
varying float vFade;
void main() {
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c) * 4.0;
  if (r2 > 1.0) discard;
  float a = exp(-r2 * 3.0);
  gl_FragColor = vec4(vColor * vFade * uGain * a, 1.0);
  #include <colorspace_fragment>
}`;

export function createBelt(scene: Scene): Belt {
  const pop = generatePopulation();
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pop.aei, 3));
  geo.setAttribute('aOrbit', new BufferAttribute(pop.angles, 4));
  geo.setAttribute('aSize', new BufferAttribute(pop.size, 1));

  const tints = new Float32Array(pop.count * 3), c = new Color();
  const palette = Object.fromEntries(Object.entries(TINT).map(([g, hexes]) => [g, hexes.map(h => new Color().setStyle(h, SRGBColorSpace))]));
  for (let k = 0; k < pop.count; k++) {
    const choices = palette[pop.group[k]];
    c.copy(choices[k % choices.length]).multiplyScalar((GAIN[pop.group[k]] ?? 1) * (0.8 + 0.4 * ((k * 2654435761) % 1000) / 1000));
    tints.set([c.r, c.g, c.b], k * 3);
  }
  geo.setAttribute('aTint', new BufferAttribute(tints, 3));

  const uniforms = {
    uDays: { value: 0 },
    uTrueScale: { value: 0 },
    uSun: { value: new Vector3() },
    uPxPerRad: { value: 1000 },
    uPixelRatio: { value: 1 },
    uWorldSize: { value: 0.07 },
    uGain: { value: 0.7 },
  };
  const points = new Points(geo, new ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  }));
  points.frustumCulled = false;
  scene.add(points);

  // pixels per radian from the active camera, refreshed each draw
  points.onBeforeRender = (renderer, _scene, camera) => {
    const cam = camera as { fov?: number };
    const h = renderer.domElement.clientHeight || innerHeight;
    if (cam.fov) uniforms.uPxPerRad.value = h / (2 * Math.tan((cam.fov * Math.PI) / 360));
    uniforms.uPixelRatio.value = renderer.getPixelRatio();
  };

  return {
    update(time, sunPos) {
      uniforms.uDays.value = julianDate(time) - 2451545.0;
      uniforms.uTrueScale.value = isTrueScale() ? 1 : 0;
      uniforms.uSun.value.copy(sunPos);
    },
    setVisible(on) { points.visible = on; },
  };
}

/* Nebula renderer. The gas is drawn as column density: each particle is a soft
   sprite whose surface brightness is its mass over its smoothing area, summed in a
   half-float target, then tone-mapped and composited over the sky with the
   summed column also dimming what lies behind it, as dust does. The protostar
   sits in the main scene, so the envelope and disk extinguish it too. */
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, ConeGeometry, CustomBlending, HalfFloatType, Mesh,
  MeshBasicMaterial, OneFactor, OrthographicCamera, PerspectiveCamera, PlaneGeometry, Points, Scene, ShaderMaterial,
  SphereGeometry, SrcAlphaFactor, Vector2, Vector3, Vector4, WebGLRenderTarget,
} from 'three';
import { createFreeRig, type RigBody } from '../shared/camera';
import { createStarHalo } from '../shared/halo';
import { createStage } from '../shared/renderer';
import { createSky } from '../shared/sky/sky';
import { R0_AU, RHO0, RHO_CRIT } from './physics/units';
import { accretionLsun } from './readout';
import { camera as cameraState, hasStar, params, paused, restarts, stats } from './state';
import type { Snapshot, ToWorker } from './worker';
import CloudWorker from './worker?worker&inline';

/** Scene units per cloud radius R0. */
const S = 100;
const MAX_SINKS_DRAWN = 4;
const particleCount = (() => {
  const n = Number(new URLSearchParams(location.search).get('n'));
  return n >= 1000 && n <= 40000 ? Math.round(n) : 8000;
})();

const gasVertex = /* glsl */`
attribute float aSize;
attribute float aDens;
uniform float uScale;
uniform float uPx;
uniform vec4 uSink[${MAX_SINKS_DRAWN}];
uniform int uSinkN;
uniform float uLogCrit;
varying vec3 vColor;
varying float vWeight;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = -mv.z;
  if (aSize <= 0.0 || dist <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float worldR = aSize * uScale * 1.2;
  float px = worldR * uPx / dist;
  gl_PointSize = 2.0 * clamp(px, 1.5, 320.0);
  gl_Position = projectionMatrix * mv;
  // column contribution: mass over smoothing area (surface brightness is distance-independent)
  vWeight = 1.0 / (worldR * worldR);
  float ld = log(max(aDens, 1e-3)) / log(10.0);
  // cold gas mostly absorbs (a dark globule, faint blue with scattered starlight);
  // compressed dust warms red, the opaque first core glows orange, the hottest gas white
  vec3 cold = vec3(0.26, 0.32, 0.55);
  vec3 dusty = vec3(0.55, 0.22, 0.12);
  vec3 warm = vec3(1.00, 0.50, 0.18);
  vec3 hot = vec3(1.00, 0.85, 0.62);
  float t1 = smoothstep(0.3, 1.6, ld);
  float t2 = smoothstep(1.6, uLogCrit, ld);
  float t3 = smoothstep(uLogCrit, uLogCrit + 1.2, ld);
  vec3 col = mix(mix(mix(cold, dusty, t1), warm, t2), hot, t3);
  float glow = 0.12 + 0.25 * t1 + 0.8 * t2 + 1.2 * t3;
  // light from the protostars, falling off with distance
  vec3 w = (modelMatrix * vec4(position, 1.0)).xyz;
  for (int k = 0; k < ${MAX_SINKS_DRAWN}; k++) {
    if (k >= uSinkN) break;
    vec3 d = (w - uSink[k].xyz) / uScale;
    float lit = min(uSink[k].w / (dot(d, d) * 400.0 + 0.05), 1.5);
    glow += 0.4 * lit;
    col = mix(col, vec3(1.0, 0.78, 0.5), clamp(lit, 0.0, 0.5));
  }
  vColor = col * glow;
}`;

const gasFragment = /* glsl */`
varying vec3 vColor;
varying float vWeight;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  // falls to zero at the rim so large near sprites show no edge
  float f = 1.0 - r2;
  float w = f * f * exp(-2.0 * r2) * vWeight;
  gl_FragColor = vec4(vColor * w, w);
}`;

const compositeFragment = /* glsl */`
uniform sampler2D uGas;
uniform float uExposure;
uniform float uExtinction;
varying vec2 vUv;
void main() {
  vec4 g = texture2D(uGas, vUv);
  // logarithmic brightness, hue kept: columns span ~4 decades from envelope to disk
  vec3 e = g.rgb * uExposure;
  float l = max(max(e.r, e.g), e.b);
  vec3 c = l > 0.0 ? e / l * log(1.0 + 4.0 * l) / log(1.0 + 4000.0) : vec3(0.0);
  gl_FragColor = vec4(c, exp(-g.a * uExtinction));
  #include <colorspace_fragment>
}`;

const jetVertex = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying float vAlong;
void main() {
  vAlong = uv.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;
const jetFragment = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uStrength;
varying float vAlong;
void main() {
  #include <logdepthbuf_fragment>
  float a = uStrength * pow(vAlong, 1.5);
  gl_FragColor = vec4(vec3(0.55, 0.7, 1.0) * a, a);
}`;

export function startNebula(canvas: HTMLCanvasElement): void {
  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 1, 1e-3, 1e6);
  camera.position.set(0, 48, 245);
  const stage = createStage(canvas, camera);
  const { renderer } = stage;
  const sky = createSky(scene, { panoramaGain: 0.28 });

  // ---------- gas
  const N = particleCount;
  const pos = new Float32Array(N * 3), size = new Float32Array(N), dens = new Float32Array(N);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new BufferAttribute(size, 1));
  geo.setAttribute('aDens', new BufferAttribute(dens, 1));
  const sinkUniform = Array.from({ length: MAX_SINKS_DRAWN }, () => new Vector4());
  const gasUniforms = {
    uScale: { value: S }, uPx: { value: 1 }, uSink: { value: sinkUniform }, uSinkN: { value: 0 },
    uLogCrit: { value: Math.log10(RHO_CRIT / RHO0) },
  };
  const gas = new Points(geo, new ShaderMaterial({
    uniforms: gasUniforms, vertexShader: gasVertex, fragmentShader: gasFragment,
    transparent: true, depthTest: false, depthWrite: false,
    blending: CustomBlending, blendSrc: OneFactor, blendDst: OneFactor, blendSrcAlpha: OneFactor, blendDstAlpha: OneFactor,
  }));
  gas.scale.setScalar(S);
  gas.frustumCulled = false;
  const gasScene = new Scene();
  gasScene.add(gas);
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });

  const composite = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({
    uniforms: { uGas: { value: target.texture }, uExposure: { value: 3.0 }, uExtinction: { value: 3.0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: compositeFragment,
    transparent: true, depthTest: false, depthWrite: false,
    blending: CustomBlending, blendSrc: OneFactor, blendDst: SrcAlphaFactor,
  }));
  composite.frustumCulled = false;
  const overlay = new Scene();
  overlay.add(composite);
  const overlayCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const bufSize = new Vector2();
  function resizeTarget() {
    renderer.getDrawingBufferSize(bufSize);
    target.setSize(bufSize.x, bufSize.y);
  }
  addEventListener('resize', resizeTarget);
  resizeTarget();

  // ---------- protostars: disk, glow and (drawn, not simulated) jets. The glow is drawn after the
  // dust, standing in for light scattered out of the unresolved inner disk
  const glowScene = new Scene();
  const starMat = new MeshBasicMaterial({ color: new Color(1.0, 0.93, 0.82) });
  const starGeo = new SphereGeometry(1, 32, 16);
  const jetGeo = new ConeGeometry(1, 1, 24, 1, true).translate(0, -0.5, 0);
  const stars = Array.from({ length: MAX_SINKS_DRAWN }, () => {
    const mesh = new Mesh(starGeo, starMat);
    mesh.visible = false;
    scene.add(mesh);
    const halo = createStarHalo(glowScene);
    halo.setColors(new Color(1.0, 0.9, 0.75), new Color(1.0, 0.6, 0.3));
    halo.mesh.visible = false;
    const jetMat = new ShaderMaterial({
      uniforms: { uStrength: { value: 0 } }, vertexShader: jetVertex, fragmentShader: jetFragment,
      transparent: true, depthWrite: false, blending: AdditiveBlending,
    });
    const jets = [new Mesh(jetGeo, jetMat), new Mesh(jetGeo, jetMat)];
    jets.forEach(j => { j.visible = false; scene.add(j); });
    return { mesh, halo, jets, jetMat };
  });
  // a protostar is ~0.01 AU; drawn at ~1 AU so it reads as a point with a glow
  const starRadius = 0.02;
  const glowRadius = 0.3;     // the glow's scale: ~15 AU, reaching a few hundred

  const core: RigBody = {
    name: 'Cloud centre', position: new Vector3(), radius: () => (hasStar.get() ? starRadius : 0.5), radiusKm: 0,
    frameRadius: () => Math.max(6, (stats.get()?.diskRadius ?? 0) * S * 1.4),
  };
  const rig = createFreeRig(camera, renderer.domElement, {
    bodies: [core],
    state: cameraState,
    select: name => { if (name && hasStar.get()) rig.focus(core); else rig.release(); },
    units: { distance: (cam, b) => cam.distanceTo(b.position) / S * R0_AU, perSceneUnit: () => R0_AU / S },
    onClick: (nx, ny) => {
      if (!hasStar.get()) return;
      const p = core.position.clone().project(camera);
      if (p.z < 1 && Math.hypot(p.x - nx, (p.y - ny) / camera.aspect) < 0.05) rig.focus(core);
    },
  });

  // ---------- worker
  const worker = new CloudWorker();
  let spare: Snapshot | null = null, waiting = false, lastStats = 0, latest: Snapshot | null = null;
  const up = new Vector3(), down = new Vector3(), yAxis = new Vector3(0, 1, 0);

  function start() {
    const p = params.get();
    const msg: ToWorker = { type: 'start', params: { n: N, rotation: p.rotation, turbulence: p.turbulence, seed: (Math.random() * 1e9) | 0 } };
    worker.postMessage(msg);
    size.fill(0);
    geo.attributes.aSize.needsUpdate = true;
    spare = null; latest = null; waiting = false;
    stats.set(null);
    hasStar.set(false);
    core.name = 'Cloud centre';
    core.position.set(0, 0, 0);
    rig.release();
    request();
  }

  function request() {
    if (waiting || paused.get()) return;
    waiting = true;
    const now = performance.now();
    const msg: ToWorker = { type: 'frame', budgetMs: 12, wantStats: now - lastStats > 400 };
    if (msg.wantStats) lastStats = now;
    if (spare) {
      msg.pos = spare.pos; msg.size = spare.size; msg.dens = spare.dens;
      worker.postMessage(msg, [spare.pos.buffer, spare.size.buffer, spare.dens.buffer]);
      spare = null;
    } else worker.postMessage(msg);
  }

  worker.onmessage = (e: MessageEvent<Snapshot>) => {
    waiting = false;
    const snap = e.data;
    if (snap.pos.length !== N * 3) { request(); return; }
    pos.set(snap.pos); size.set(snap.size); dens.set(snap.dens);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.attributes.aDens.needsUpdate = true;
    if (snap.stats) stats.set(snap.stats);
    latest = snap;
    spare = snap;
    request();
  };

  paused.subscribe(p => { if (!p) request(); });
  let lastRestart = restarts.get();
  restarts.subscribe(n => { if (n !== lastRestart) { lastRestart = n; start(); } });
  // initial conditions changed: a new cloud, once the slider settles
  let paramTimer = 0, lastParams = params.get();
  params.subscribe(p => {
    if (p === lastParams) return;
    lastParams = p;
    clearTimeout(paramTimer);
    paramTimer = window.setTimeout(start, 450);
  });

  function updateStars() {
    const sinks = latest?.sinks;
    const k = sinks ? Math.min(MAX_SINKS_DRAWN, sinks.length / 8) : 0;
    let mainMass = 0;
    const diskMass = stats.get()?.diskMass ?? 0;
    for (let s = 0; s < MAX_SINKS_DRAWN; s++) {
      const st = stars[s];
      const on = s < k;
      st.mesh.visible = on; st.halo.mesh.visible = on;
      if (!on) { st.jets.forEach(j => (j.visible = false)); sinkUniform[s].w = 0; continue; }
      const o = s * 8;
      const m = sinks![o + 3], mdot = sinks![o + 4];
      const p = st.mesh.position.set(sinks![o] * S, sinks![o + 1] * S, sinks![o + 2] * S);
      const L = accretionLsun(m, mdot);
      const lum = Math.log10(1 + L);
      st.mesh.scale.setScalar(starRadius);
      st.halo.update(p, glowRadius);
      st.halo.setIntensity(0.4 + 0.5 * lum);
      sinkUniform[s].set(p.x, p.y, p.z, 0.25 * lum);
      if (m > mainMass) { mainMass = m; core.position.copy(p); }
      // jets along the spin axis once a disk feeds the star
      up.set(sinks![o + 5], sinks![o + 6], sinks![o + 7]);
      const show = diskMass > 0.02 && up.lengthSq() > 0;
      if (show) up.normalize();
      st.jetMat.uniforms.uStrength.value = show ? Math.min(0.5, 0.08 * lum) : 0;
      st.jets.forEach((j, side) => {
        j.visible = show;
        if (!show) return;
        const len = S * (0.05 + 0.04 * lum);
        j.scale.set(len * 0.12, len, len * 0.12);
        j.position.copy(p);
        j.quaternion.setFromUnitVectors(yAxis, side ? up : down.copy(up).negate());
      });
    }
    gasUniforms.uSinkN.value = k;
    if (k > 0 && !hasStar.get()) { hasStar.set(true); core.name = 'Protostar'; }
  }

  let last = performance.now();
  const noDelta = new Vector3();
  function loop(now: number) {
    requestAnimationFrame(loop);
    stage.perf.begin(now);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    updateStars();
    rig.update(dt, noDelta);
    sky.update(camera);
    gasUniforms.uPx.value = bufSize.y / 2 / Math.tan(camera.fov * Math.PI / 360);

    stage.perf.beforeRender();
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(gasScene, camera);
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    renderer.autoClear = false;
    renderer.render(overlay, overlayCam);
    renderer.render(glowScene, camera);
    renderer.autoClear = true;
    stage.perf.afterRender();
    stage.perf.end();
  }

  start();
  requestAnimationFrame(loop);
}

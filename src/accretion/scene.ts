/* Accretion renderer: the young Sun, a fading gas disk, planetesimals as points,
   the largest bodies as lit spheres, collision flashes and the leaders' orbits.
   Physics runs in the worker; this file only draws its snapshots. */
import {
  AdditiveBlending, AmbientLight, BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, DynamicDrawUsage,
  InstancedMesh, Line, LineBasicMaterial, LineDashedMaterial, LineLoop, Matrix4, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PerspectiveCamera, PointLight, Points, Quaternion, Raycaster, RingGeometry, SRGBColorSpace, Scene,
  ShaderMaterial, SphereGeometry, Vector2, Vector3,
} from 'three';
import { createFreeRig, type RigBody } from '../shared/camera';
import { createStarHalo } from '../shared/halo';
import { createStage } from '../shared/renderer';
import { createSky } from '../shared/sky/sky';
import { SNOW_LINE } from './physics';
import { camera as cameraState, diskMass, focusRequest, heat, paused, readout, restarts, speed, stageOf, toggles } from './state';
import type { Frame, ToWorker } from './worker';
import SimWorker from './worker?worker&inline';

export const AU_SCENE = 10;
/** Display radius of an Earth mass, AU: ~700× the real size so bodies are visible. */
export const VIS_EARTH_AU = 0.03;
const STAR_R_AU = 0.12;
const MAX_SPHERES = 64, MAX_GIANTS = 16, SPHERE_MIN_EARTH = 0.03, GIANT_MIN_GAS = 1;
const ROCK = new Color(0.62, 0.5, 0.4), ICE = new Color(0.82, 0.9, 1.0);

const displayRadius = (massEarth: number) => VIS_EARTH_AU * Math.cbrt(massEarth) * AU_SCENE;

function tint(ice: number, out: Color): Color {
  return out.copy(ROCK).lerp(ICE, Math.min(1, ice / 0.76));
}

function bandTexture(): CanvasTexture {
  const c = document.createElement('canvas'); c.width = 16; c.height = 128;
  const g = c.getContext('2d')!;
  const cols = ['#e6d8bf', '#c9ad86', '#efe3cc', '#b89770', '#e2d2b5', '#c4a67d', '#eee2cb', '#bf9f76'];
  for (let y = 0; y < 128; y++) {
    const t = y / 128, k = Math.floor((t + Math.sin(t * 31) * 0.012) * cols.length);
    g.fillStyle = cols[Math.min(cols.length - 1, Math.max(0, k))]; g.fillRect(0, y, 16, 1);
  }
  const tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Gas disk: stacked annuli that flare with radius, brightness ∝ Σ_gas, fading as the gas clears. */
function createGasDisk(scene: Scene) {
  const uniforms = { uGas: { value: 1 }, uLayer: { value: 0 } };
  const geo = new RingGeometry(0.2 * AU_SCENE, 48 * AU_SCENE, 256, 1);
  geo.rotateX(-Math.PI / 2);
  const layers: Mesh[] = [];
  for (let k = -3; k <= 3; k++) {
    const mat = new ShaderMaterial({
      uniforms: { uGas: uniforms.uGas, uLayer: { value: k / 3 } },
      transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
      vertexShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_vertex>
        uniform float uLayer;
        varying float vR;
        void main() {
          vec3 p = position;
          vR = length(p.xz) / ${AU_SCENE.toFixed(1)};
          // scale height h/r ≈ 0.033 (r/AU)^0.25: a flaring disk
          p.y += uLayer * 0.033 * pow(vR, 1.25) * ${AU_SCENE.toFixed(1)} * 2.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform float uGas;
        uniform float uLayer;
        varying float vR;
        void main() {
          #include <logdepthbuf_fragment>
          // seen face-on, brightness follows the column Σ ∝ r^-1; softened so the outer disk reads
          float sigma = pow(max(vR, 0.4), -0.6);
          float edge = smoothstep(0.2, 0.7, vR) * (1.0 - smoothstep(28.0, 46.0, vR));
          float layer = exp(-uLayer * uLayer * 2.5);
          float a = uGas * 0.07 * sigma * edge * layer;
          vec3 warm = vec3(1.0, 0.62, 0.36), cool = vec3(0.36, 0.44, 0.78);
          vec3 col = mix(warm, cool, smoothstep(0.8, 12.0, vR));
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new Mesh(geo, mat);
    mesh.renderOrder = 2;
    layers.push(mesh);
    scene.add(mesh);
  }
  return { set gas(v: number) { uniforms.uGas.value = v; } };
}

function createSnowLine(scene: Scene) {
  const pts: Vector3[] = [];
  for (let k = 0; k < 256; k++) {
    const a = k / 256 * Math.PI * 2;
    pts.push(new Vector3(Math.cos(a) * SNOW_LINE * AU_SCENE, 0, Math.sin(a) * SNOW_LINE * AU_SCENE));
  }
  const line = new LineLoop(new BufferGeometry().setFromPoints(pts),
    new LineDashedMaterial({ color: 0x9cc4ff, dashSize: 0.35, gapSize: 0.35, transparent: true, opacity: 0.45 }));
  line.computeLineDistances();
  scene.add(line);
  const label = document.createElement('div');
  label.className = 'sky-label';
  label.textContent = `snow line · ${SNOW_LINE} AU`;
  document.body.appendChild(label);
  const anchor = new Vector3(SNOW_LINE * AU_SCENE * Math.SQRT1_2, 0, SNOW_LINE * AU_SCENE * Math.SQRT1_2);
  const v = new Vector3();
  return {
    setVisible(on: boolean) { line.visible = on; label.style.display = on ? '' : 'none'; },
    update(camera: PerspectiveCamera) {
      if (!line.visible) return;
      v.copy(anchor).project(camera);
      const hidden = v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1;
      label.style.visibility = hidden ? 'hidden' : 'visible';
      if (!hidden) label.style.transform = `translate(${((v.x * 0.5 + 0.5) * innerWidth).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * innerHeight).toFixed(1)}px) translate(-50%, -140%)`;
    },
  };
}

/** Small bodies as round points: at least `minPx` wide, true display size when closer. */
function createDust(scene: Scene, cap: number) {
  const geo = new BufferGeometry();
  const pos = new BufferAttribute(new Float32Array(cap * 3), 3).setUsage(DynamicDrawUsage);
  const size = new BufferAttribute(new Float32Array(cap), 1).setUsage(DynamicDrawUsage);
  const col = new BufferAttribute(new Float32Array(cap * 3), 3).setUsage(DynamicDrawUsage);
  geo.setAttribute('position', pos); geo.setAttribute('aSize', size); geo.setAttribute('aColor', col);
  const uniforms = { uScale: { value: 1 }, uMinPx: { value: 1.7 } };
  const pts = new Points(geo, new ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float aSize;
      attribute vec3 aColor;
      uniform float uScale, uMinPx;
      varying vec3 vColor;
      varying float vFade;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float px = aSize * uScale / max(-mv.z, 1e-4);
        gl_PointSize = aSize <= 0.0 ? 0.0 : max(px, uMinPx);
        // points smaller than the floor dim instead of shrinking further
        vFade = clamp(px / uMinPx, 0.6, 1.0);
        vColor = aColor;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_fragment>
      varying vec3 vColor;
      varying float vFade;
      void main() {
        #include <logdepthbuf_fragment>
        vec2 c = gl_PointCoord - 0.5;
        float d = dot(c, c);
        if (d > 0.25) discard;
        gl_FragColor = vec4(vColor, (1.0 - smoothstep(0.12, 0.25, d)) * vFade);
        #include <colorspace_fragment>
      }`,
  }));
  pts.frustumCulled = false;
  scene.add(pts);
  return { geo, pos, size, col, uniforms };
}

/** Short-lived glows at merger sites; brighter and wider for bigger impacts. */
function createFlashes(scene: Scene) {
  const N = 96;
  const geo = new BufferGeometry();
  const pos = new BufferAttribute(new Float32Array(N * 3), 3).setUsage(DynamicDrawUsage);
  const life = new BufferAttribute(new Float32Array(N), 1).setUsage(DynamicDrawUsage);
  const size = new BufferAttribute(new Float32Array(N), 1).setUsage(DynamicDrawUsage);
  geo.setAttribute('position', pos); geo.setAttribute('aLife', life); geo.setAttribute('aSize', size);
  const uniforms = { uScale: { value: 1 } };
  const pts = new Points(geo, new ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float aLife, aSize;
      uniform float uScale;
      varying float vLife;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        vLife = aLife;
        gl_PointSize = aLife <= 0.0 ? 0.0 : clamp(aSize * (1.6 - aLife) * uScale / max(-mv.z, 1e-4), 3.0, 180.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_fragment>
      varying float vLife;
      void main() {
        #include <logdepthbuf_fragment>
        vec2 c = gl_PointCoord - 0.5;
        float g = exp(-dot(c, c) * 18.0);
        gl_FragColor = vec4(vec3(1.0, 0.78, 0.5) * g, g * vLife);
        #include <colorspace_fragment>
      }`,
  }));
  pts.frustumCulled = false;
  scene.add(pts);
  let next = 0;
  return {
    uniforms,
    add(x: number, y: number, z: number, massEarth: number, fragments: number) {
      const k = next++ % N;
      pos.setXYZ(k, x * AU_SCENE, y * AU_SCENE, z * AU_SCENE);
      life.setX(k, 1);
      size.setX(k, (0.08 + 0.12 * Math.log10(1 + massEarth * 30) + (fragments ? 0.15 : 0)) * AU_SCENE);
    },
    update(dt: number) {
      const a = life.array as Float32Array;
      for (let k = 0; k < N; k++) if (a[k] > 0) a[k] = Math.max(0, a[k] - dt * 1.4);
      life.needsUpdate = true; pos.needsUpdate = true; size.needsUpdate = true;
    },
  };
}

function createOrbits(scene: Scene, count: number) {
  const SEG = 180;
  const c = new Color();
  const lines = Array.from({ length: count }, () => {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(SEG * 3), 3).setUsage(DynamicDrawUsage));
    const line = new Line(geo, new LineBasicMaterial({ transparent: true, opacity: 0.32, depthWrite: false }));
    line.frustumCulled = false;
    scene.add(line);
    return line;
  });
  return {
    setVisible(on: boolean) { for (const l of lines) l.visible = on; },
    update(leaders: Frame['leaders']) {
      lines.forEach((line, k) => {
        const l = leaders[k];
        if (!l || l.e >= 1 || !(l.a > 0)) { line.geometry.setDrawRange(0, 0); return; }
        const arr = (line.geometry.attributes.position as BufferAttribute).array as Float32Array;
        const cw = Math.cos(l.peri), sw = Math.sin(l.peri), cO = Math.cos(l.node), sO = Math.sin(l.node), ci = Math.cos(l.i), si = Math.sin(l.i);
        const b = l.a * Math.sqrt(1 - l.e * l.e);
        for (let s = 0; s < SEG; s++) {
          const E = s / (SEG - 1) * Math.PI * 2;
          const px = l.a * (Math.cos(E) - l.e), py = b * Math.sin(E);
          const ex = (cO * cw - sO * sw * ci) * px + (-cO * sw - sO * cw * ci) * py;
          const ey = (sO * cw + cO * sw * ci) * px + (-sO * sw + cO * cw * ci) * py;
          const ez = (sw * si) * px + (cw * si) * py;
          arr[s * 3] = ex * AU_SCENE; arr[s * 3 + 1] = ez * AU_SCENE; arr[s * 3 + 2] = -ey * AU_SCENE;
        }
        line.geometry.attributes.position.needsUpdate = true;
        line.geometry.setDrawRange(0, SEG);
        (line.material as LineBasicMaterial).color.copy(tint(l.ice, c)).multiplyScalar(k === 0 ? 1 : 0.8);
      });
    },
  };
}


export function startAccretion(canvas: HTMLCanvasElement): void {
  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 1, 1e-4, 1e5);
  camera.position.set(0, 55, 95);
  const stage = createStage(canvas, camera);
  const sky = createSky(scene, { panoramaGain: 0.35 });

  scene.add(new AmbientLight(0xffffff, 0.05));
  const light = new PointLight(0xffe6c8, 2.6 * Math.PI, 0, 0);
  scene.add(light);
  const starMesh = new Mesh(new SphereGeometry(1, 48, 24), new MeshBasicMaterial({ color: new Color(1.0, 0.86, 0.66) }));
  starMesh.scale.setScalar(STAR_R_AU * AU_SCENE);
  scene.add(starMesh);
  const halo = createStarHalo(scene);
  // a young, cooler, redder star than today's Sun
  halo.setColors(0xffe2b6, 0xff8a45);
  halo.setIntensity(1.1);
  halo.update(new Vector3(), STAR_R_AU * AU_SCENE);

  const gasDisk = createGasDisk(scene);
  const snow = createSnowLine(scene);
  const CAP = 8000;
  const dust = createDust(scene, CAP);
  const flashes = createFlashes(scene);
  const orbits = createOrbits(scene, 8);

  const sphereGeo = new SphereGeometry(1, 24, 16);
  const rocks = new InstancedMesh(sphereGeo, new MeshStandardMaterial({ roughness: 0.92, metalness: 0 }), MAX_SPHERES);
  const giants = new InstancedMesh(sphereGeo, new MeshStandardMaterial({ roughness: 0.8, metalness: 0, map: bandTexture() }), MAX_GIANTS);
  rocks.count = 0; giants.count = 0;
  rocks.frustumCulled = false; giants.frustumCulled = false;
  scene.add(rocks, giants);
  const rockIds = new Int32Array(MAX_SPHERES), giantIds = new Int32Array(MAX_GIANTS);

  toggles.subscribe(t => { snow.setVisible(t.snowLine); orbits.setVisible(t.orbits); });

  // camera: the star is the centre; a focused body gets a live slot
  const sun: RigBody = { name: 'Sun', position: new Vector3(), radius: () => STAR_R_AU * AU_SCENE, radiusKm: 696000 * 2 };
  let focusedId = -1;
  const focus: RigBody = { name: '', position: new Vector3(), radius: () => focusRadius, radiusKm: 0, frameRadius: () => Math.max(focusRadius * 6, 0.2 * AU_SCENE) };
  let focusRadius = 0.1;
  const bodies: RigBody[] = [sun];
  const rig = createFreeRig(camera, stage.renderer.domElement, {
    bodies,
    state: cameraState,
    select: name => {
      if (name === 'Sun') { release(); rig.focus(sun); }
      else if (!name) { release(); rig.release(); }
    },
    units: { distance: (cam, b) => cam.distanceTo(b.position) / AU_SCENE, perSceneUnit: () => 1 / AU_SCENE },
    onClick: (x, y) => pick(x, y),
    onDoubleClick: () => { release(); rig.release(); },
  });
  function release() { focusedId = -1; if (bodies.length > 1) bodies.length = 1; }
  function focusOn(id: number) {
    const k = latest ? Array.prototype.indexOf.call(latest.ids, id) : -1;
    if (k < 0 || !latest) return;
    focusedId = id;
    focus.name = `Body ${id}`;
    focus.position.set(latest.pos[k * 3], latest.pos[k * 3 + 1], latest.pos[k * 3 + 2]).multiplyScalar(AU_SCENE);
    focusRadius = displayRadius(latest.mass[k]);
    if (bodies.length === 1) bodies.push(focus);
    rig.focus(focus);
  }
  const ray = new Raycaster(), ndc = new Vector2();
  function pick(x: number, y: number) {
    ndc.set(x, y);
    ray.setFromCamera(ndc, camera);
    rocks.computeBoundingSphere(); giants.computeBoundingSphere();
    const hit = ray.intersectObjects([giants, rocks], false)[0];
    if (hit && hit.instanceId !== undefined) focusOn((hit.object === giants ? giantIds : rockIds)[hit.instanceId]);
  }
  let lastFocusReq = focusRequest.get().n;
  focusRequest.subscribe(r => { if (r.n !== lastFocusReq) { lastFocusReq = r.n; focusOn(r.id); } });

  // ---------- worker
  const worker: Worker = new SimWorker();
  const send = (msg: ToWorker) => worker.postMessage(msg);
  let startCount = 0;
  const start = () => {
    send({ kind: 'start', params: { heat: heat.get(), massFactor: diskMass.get() } });
    release(); rig.release();
    startCount = 0;
  };
  speed.subscribe(v => send({ kind: 'rate', yearsPerSecond: v }));
  paused.subscribe(p => send({ kind: 'pause', paused: p }));
  let lastRestart = restarts.get();
  restarts.subscribe(n => { if (n !== lastRestart) { lastRestart = n; start(); } });

  let latest: Frame | null = null, fresh = false;
  let check = { dE: 0, dP: 0, dL: 0 };
  worker.onmessage = (e: MessageEvent<Frame>) => {
    latest = e.data; fresh = true;
    if (latest.check) check = latest.check;
    const ev = latest.events;
    for (let k = 0; k < ev.length; k += 5) flashes.add(ev[k], ev[k + 1], ev[k + 2], ev[k + 3], ev[k + 4]);
  };

  const m4 = new Matrix4(), c = new Color(), v = new Vector3(), sc = new Vector3(), noTurn = new Quaternion(), white = new Color(1, 1, 1);
  const order: number[] = [];

  function applyFrame(f: Frame) {
    if (!startCount) startCount = f.n;
    const n = Math.min(f.n, CAP);
    // largest bodies become spheres; the rest stay points
    order.length = 0;
    for (let i = 0; i < n; i++) if (f.mass[i] >= SPHERE_MIN_EARTH || f.gas[i] >= GIANT_MIN_GAS) order.push(i);
    order.sort((a, b) => f.mass[b] - f.mass[a]);
    let nr = 0, ng = 0;
    const posA = dust.pos.array as Float32Array, sizeA = dust.size.array as Float32Array, colA = dust.col.array as Float32Array;
    for (let i = 0; i < n; i++) {
      posA[i * 3] = f.pos[i * 3] * AU_SCENE; posA[i * 3 + 1] = f.pos[i * 3 + 1] * AU_SCENE; posA[i * 3 + 2] = f.pos[i * 3 + 2] * AU_SCENE;
      sizeA[i] = displayRadius(f.mass[i]);
      tint(f.ice[i], c);
      colA[i * 3] = c.r; colA[i * 3 + 1] = c.g; colA[i * 3 + 2] = c.b;
    }
    for (const i of order) {
      const r = displayRadius(f.mass[i]);
      v.set(posA[i * 3], posA[i * 3 + 1], posA[i * 3 + 2]);
      m4.compose(v, noTurn, sc.setScalar(r));
      tint(f.ice[i], c);
      if (f.gas[i] >= GIANT_MIN_GAS && ng < MAX_GIANTS) {
        giants.setMatrixAt(ng, m4); giants.setColorAt(ng, c.lerp(white, 0.6)); giantIds[ng++] = f.ids[i];
      } else if (nr < MAX_SPHERES) {
        rocks.setMatrixAt(nr, m4); rocks.setColorAt(nr, c); rockIds[nr++] = f.ids[i];
      } else continue;
      sizeA[i] = 0;   // drawn as a sphere
    }
    rocks.count = nr; giants.count = ng;
    rocks.instanceMatrix.needsUpdate = true; giants.instanceMatrix.needsUpdate = true;
    if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
    if (giants.instanceColor) giants.instanceColor.needsUpdate = true;
    dust.geo.setDrawRange(0, n);
    dust.pos.needsUpdate = true; dust.size.needsUpdate = true; dust.col.needsUpdate = true;

    if (focusedId >= 0) {
      const k = Array.prototype.indexOf.call(f.ids, focusedId);
      if (k >= 0) {
        focus.position.set(posA[k * 3], posA[k * 3 + 1], posA[k * 3 + 2]);
        focusRadius = displayRadius(f.mass[k]);
      } else {
        // swallowed: follow whoever now carries the most mass nearby — the leader
        const lead = f.leaders[0];
        if (lead) focusOn(lead.id);
      }
    }
    gasDisk.gas = f.gasFrac;
    orbits.update(f.leaders);
  }

  let hudAt = 0;
  function updateHud(f: Frame, now: number) {
    if (now - hudAt < 150) return;
    hudAt = now;
    const lead = f.leaders[0];
    const giant = f.leaders.some(l => l.gasEarth >= GIANT_MIN_GAS);
    const eqMyr = f.gasAge / 1e6;
    readout.set({
      time: Math.round(f.t).toLocaleString('en-US') + ' yr',
      equiv: eqMyr < 0.1 ? (eqMyr * 1000).toFixed(0) + ' kyr' : eqMyr.toFixed(2) + ' Myr',
      count: f.n,
      biggest: lead ? lead.massEarth.toFixed(lead.massEarth < 1 ? 3 : 1) + ' M⊕' : '—',
      gas: Math.round(f.gasFrac * 100),
      inflate: f.inflate,
      dE: check.dE, dP: check.dP, dL: check.dL,
      rate: f.rate,
      stage: stageOf(f.n, startCount || f.n, lead?.massEarth ?? 0, giant, f.gasFrac),
      leaders: f.leaders.slice(0, 5),
    });
  }

  let last = performance.now();
  const sunDelta = new Vector3();
  function loop(now: number) {
    requestAnimationFrame(loop);
    stage.perf.begin(now);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (latest && fresh) { applyFrame(latest); updateHud(latest, now); fresh = false; }
    const pxScale = stage.renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360));
    dust.uniforms.uScale.value = pxScale;
    dust.uniforms.uMinPx.value = 1.7 * stage.renderer.getPixelRatio();
    flashes.uniforms.uScale.value = pxScale;
    flashes.update(dt);
    rig.update(dt, sunDelta);
    sky.update(camera);
    snow.update(camera);
    stage.render(scene, camera);
    stage.perf.end();
  }

  start();
  requestAnimationFrame(loop);
}


/* The disk is not drawn — it emerges. Three ingredients only:
   1. gravity toward the enclosed mass (softened, from a radial histogram)
   2. inelastic gas collisions (particles in the same grid cell mix velocity —
      opposing motions cancel, shared rotation survives; this is the ONLY
      place energy is lost)
   3. a small random net spin the cloud starts with, by statistical accident
   Everything the viewer sees — collapse, spin-up, flattening, the ignition —
   is a consequence, not a script. */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';


const N = 7000;
const R0 = 100;                 // initial cloud radius
const GM = 18000;               // gravity strength (total mass = 1) — tuned so
                                // the fall takes ~half a minute, not a blink
const SOFT2 = 120;               // softening² so the core doesn't explode
const CELL = 6;                 // collision cell size — must stay smaller than
                                // the disk, or mixing cancels rotation itself
const DT = 1 / 60;
const BINS = 100, BIN_R = 220;  // enclosed-mass histogram

// ---------- state
const pos = new Float32Array(N * 3);
const vel = new Float32Array(N * 3);
let spin0 = 0.50, visc = 0.05;
let elapsed = 0;

function seedCloud() {
  elapsed = 0;
  let mx = 0, my = 0, mz = 0;
  for (let i = 0; i < N; i++) {
    // uniform-ish sphere with ragged edge
    const r = R0 * Math.cbrt(Math.random()) * (0.75 + Math.random() * 0.35);
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    const x = r * Math.sin(ph) * Math.cos(th);
    const y = r * Math.cos(ph);
    const z = r * Math.sin(ph) * Math.sin(th);
    pos.set([x, y, z], i * 3);
    // random drift + the accidental net spin around Y
    const vx = (Math.random() - .5) * 5 + -z * spin0;
    const vy = (Math.random() - .5) * 5;
    const vz = (Math.random() - .5) * 5 + x * spin0;
    vel.set([vx, vy, vz], i * 3);
    mx += vx; my += vy; mz += vz;
  }
  // remove net linear momentum so the cloud doesn't wander off
  mx /= N; my /= N; mz /= N;
  for (let i = 0; i < N; i++) { vel[i * 3] -= mx; vel[i * 3 + 1] -= my; vel[i * 3 + 2] -= mz; }
}

// ---------- enclosed mass: M(<r) from a radial histogram, refreshed cheaply
const massEnc = new Float32Array(BINS);
function refreshMass() {
  massEnc.fill(0);
  for (let i = 0; i < N; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const b = Math.min(BINS - 1, (Math.sqrt(x * x + y * y + z * z) / BIN_R * BINS) | 0);
    massEnc[b]++;
  }
  let acc = 0;
  for (let b = 0; b < BINS; b++) { acc += massEnc[b]; massEnc[b] = acc / N; }
}

// ---------- collisions: velocity mixing inside grid cells
const cellMap = new Map();
function collide() {
  cellMap.clear();
  for (let i = 0; i < N; i++) {
    const k = ((pos[i * 3] / CELL) | 0) * 73856093 ^ ((pos[i * 3 + 1] / CELL) | 0) * 19349663 ^ ((pos[i * 3 + 2] / CELL) | 0) * 83492791;
    let c = cellMap.get(k);
    if (!c) { c = { n: 0, vx: 0, vy: 0, vz: 0, ids: [] }; cellMap.set(k, c); }
    c.n++; c.vx += vel[i * 3]; c.vy += vel[i * 3 + 1]; c.vz += vel[i * 3 + 2];
    c.ids.push(i);
  }
  for (const c of cellMap.values()) {
    if (c.n < 2) continue;
    const vx = c.vx / c.n, vy = c.vy / c.n, vz = c.vz / c.n;
    // denser cell → more collisions → stronger mixing (capped gently);
    // too high and viscosity drains angular momentum in seconds — the disk
    // accretes away before anyone sees it
    const k = Math.min(0.12, visc * (1 + c.n / 120));
    for (const i of c.ids) {
      vel[i * 3] += (vx - vel[i * 3]) * k;
      vel[i * 3 + 1] += (vy - vel[i * 3 + 1]) * k;
      vel[i * 3 + 2] += (vz - vel[i * 3 + 2]) * k;
    }
  }
}

// ---------- physics step
function step() {
  for (let i = 0; i < N; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const r2 = x * x + y * y + z * z;
    const r = Math.sqrt(r2) + 1e-6;
    const b = Math.min(BINS - 1, (r / BIN_R * BINS) | 0);
    const a = -GM * massEnc[b] / (r2 + SOFT2);
    const ax = a * x / r, ay = a * y / r, az = a * z / r;
    vel[i * 3] += ax * DT; vel[i * 3 + 1] += ay * DT; vel[i * 3 + 2] += az * DT;
    pos[i * 3] += vel[i * 3] * DT;
    pos[i * 3 + 1] += vel[i * 3 + 1] * DT;
    pos[i * 3 + 2] += vel[i * 3 + 2] * DT;
  }
}

// ---------- stats: flatness = rms height / rms cylindrical radius; core %
function stats() {
  let h2 = 0, rc2 = 0, core = 0;
  for (let i = 0; i < N; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    h2 += y * y; rc2 += x * x + z * z;
    if (x * x + y * y + z * z < 64) core++;
  }
  return { flat: Math.sqrt(h2 / N) / Math.sqrt(rc2 / (2 * N)), core: core / N };
}

// ---------- scene
const canvas = document.getElementById('space');
// colors here were tuned without color management
THREE.ColorManagement.enabled = false;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 4000);
camera.position.set(0, 48, 245);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.06; controls.maxDistance = 1200;

const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
const colors = new Float32Array(N * 3);
geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
const pts = new THREE.Points(geo, new THREE.PointsMaterial({
  size: 2.2, sizeAttenuation: true, vertexColors: true,
  transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false,
}));
pts.frustumCulled = false;
scene.add(pts);

// protostar glow — invisible until the core earns it
function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,235,190,1)'); r.addColorStop(.3, 'rgba(255,180,80,.5)'); r.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const star = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
star.scale.setScalar(1);
scene.add(star);

// faint far stars for depth
{
  const M = 1500, sp = new Float32Array(M * 3);
  for (let i = 0; i < M; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(1500 + Math.random() * 600);
    sp.set([v.x, v.y, v.z], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x5a6488, size: 1.2, sizeAttenuation: false, transparent: true, opacity: .5 })));
}

// color by local crowding (reuses collision cells): lonely = cold blue, dense = hot
function paint() {
  for (const c of cellMap.values()) {
    const heat = Math.min(1, c.n / 60);
    const r = 0.35 + heat * 0.65, g = 0.45 + heat * 0.42, b = 0.85 - heat * 0.25;
    for (const i of c.ids) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      // swallowed by the star: the sprite represents them now — dim, or the
      // additive core outshines the disk that survived
      const d = (x * x + y * y + z * z < 36) ? 0.06 : 1;
      colors.set([r * d, g * d, b * d], i * 3);
    }
  }
  geo.attributes.color.needsUpdate = true;
}

// ---------- UI
const timeEl = document.getElementById('time');
const flatEl = document.getElementById('flat');
const coreEl = document.getElementById('core');
const stageEl = document.getElementById('stage');
const spinIn = document.getElementById('spin'), spinOut = document.getElementById('spinOut');
const viscIn = document.getElementById('visc'), viscOut = document.getElementById('viscOut');
spinIn.addEventListener('input', () => { spin0 = spinIn.value / 100; spinOut.textContent = spin0.toFixed(2); });
viscIn.addEventListener('input', () => { visc = viscIn.value / 100; viscOut.textContent = visc.toFixed(2); });
document.getElementById('restart').addEventListener('click', () => { seedCloud(); refreshMass(); star.material.opacity = 0; });

function stage(flat, core) {
  if (core > 0.6) return 'SCENE 5 · THE STAR TAKES ITS 99% — THE LEFTOVERS ARE THE PLANETS';
  if (core > 0.05 && flat < 0.25) return 'SCENE 4 · DISK + PROTOSTAR — A SOLAR SYSTEM IS BORN';
  if (flat < 0.35) return 'SCENE 4 · FLATTENING — UP AND DOWN ARE CANCELLING';
  if (core > 0.02) return 'SCENE 3 · COLLAPSE — THE SKATER PULLS HER ARMS IN';
  if (elapsed > 2) return 'SCENE 2 · THE FALL BEGINS';
  return 'SCENE 1 · COLD FOG, HANGING';
}

// ---------- loop
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let frame = 0, paused = false;
if (reduced) paused = true;
addEventListener('keydown', e => { if (e.key === ' ') { paused = !paused; e.preventDefault(); } });

function loop() {
  requestAnimationFrame(loop);
  if (!paused) {
    if (frame % 6 === 0) refreshMass();
    step();
    collide();          // fills cellMap
    paint();            // reuses it
    elapsed += DT;
    frame++;
    if (frame % 15 === 0) {
      const s = stats();
      timeEl.textContent = (elapsed * 40 | 0).toLocaleString('en-US') + ',000 yr';
      flatEl.textContent = s.flat.toFixed(2);
      coreEl.textContent = Math.round(s.core * 100) + '%';
      stageEl.textContent = stage(s.flat, s.core);
      // ignition: brightness follows core density, no script
      const target = s.core > 0.04 ? Math.min(0.75, (s.core - 0.04) * 12) : 0;
      star.material.opacity += (target - star.material.opacity) * 0.05;
      star.scale.setScalar(8 + s.core * 20);
    }
    geo.attributes.position.needsUpdate = true;
  }
  controls.update();
  renderer.render(scene, camera);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
seedCloud();
refreshMass();
loop();

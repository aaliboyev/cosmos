/* Nebula renderer and loop: the particle cloud, the protostar glow that the core
   earns, and faint far stars for depth. The sim itself lives in sim.ts. */
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, ColorManagement, LinearSRGBColorSpace,
  PerspectiveCamera, Points, PointsMaterial, Scene, Sprite, SpriteMaterial, Vector3,
} from 'three';
import { createFreeRig, type RigBody } from '../shared/camera';
import { createStage } from '../shared/renderer';
import { R0, createNebulaSim, stageOf } from './sim';
import { camera as cameraState, params, paused, readout, restarts } from './state';

function glowTex(): CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,235,190,1)'); r.addColorStop(.3, 'rgba(255,180,80,.5)'); r.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

export function startNebula(canvas: HTMLCanvasElement): void {
  // colors here were tuned without color management
  ColorManagement.enabled = false;
  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 1, 0.1, 1e5);
  camera.position.set(0, 48, 245);
  const stage = createStage(canvas, camera);
  stage.renderer.outputColorSpace = LinearSRGBColorSpace;

  const sim = createNebulaSim({ ...params.get() });
  params.subscribe(p => Object.assign(sim.params, p));

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(sim.pos, 3));
  geo.setAttribute('color', new BufferAttribute(sim.colors, 3));
  const pts = new Points(geo, new PointsMaterial({
    size: 2.2, sizeAttenuation: true, vertexColors: true,
    transparent: true, opacity: .85, blending: AdditiveBlending, depthWrite: false,
  }));
  pts.frustumCulled = false;
  scene.add(pts);

  // protostar glow — invisible until the core earns it
  const star = new Sprite(new SpriteMaterial({ map: glowTex(), blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  scene.add(star);

  {
    const M = 1500, sp = new Float32Array(M * 3), v = new Vector3();
    for (let i = 0; i < M; i++) {
      v.randomDirection().multiplyScalar(1500 + Math.random() * 600);
      sp.set([v.x, v.y, v.z], i * 3);
    }
    const sg = new BufferGeometry();
    sg.setAttribute('position', new BufferAttribute(sp, 3));
    scene.add(new Points(sg, new PointsMaterial({ color: 0x5a6488, size: 1.2, sizeAttenuation: false, transparent: true, opacity: .5 })));
  }

  // distances read in initial cloud radii: the sim has no physical length scale yet
  const core: RigBody = { name: 'Protostar', position: new Vector3(), radius: () => 2, radiusKm: 0 };
  const rig = createFreeRig(camera, stage.renderer.domElement, {
    bodies: [core],
    state: cameraState,
    select: name => { if (name) rig.focus(core); else rig.release(); },
    units: { distance: (cam, b) => cam.distanceTo(b.position) / R0, perSceneUnit: () => 1 / R0 },
  });

  const restart = () => { sim.seed(); star.material.opacity = 0; };
  let lastRestart = restarts.get();
  restarts.subscribe(n => { if (n !== lastRestart) { lastRestart = n; restart(); } });

  const noDelta = new Vector3();
  let frame = 0, last = performance.now();
  function loop(now: number) {
    requestAnimationFrame(loop);
    stage.perf.begin(now);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!paused.get()) {
      sim.tick(frame % 6 === 0);
      frame++;
      if (frame % 15 === 0) {
        const s = sim.stats();
        readout.set({
          time: (sim.elapsed * 40 | 0).toLocaleString('en-US') + ',000 yr',
          flat: s.flat, core: s.core, stage: stageOf(s.flat, s.core, sim.elapsed),
        });
        // ignition: brightness follows core density, no script
        const target = s.core > 0.04 ? Math.min(0.75, (s.core - 0.04) * 12) : 0;
        star.material.opacity += (target - star.material.opacity) * 0.05;
        star.scale.setScalar(8 + s.core * 20);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    }
    rig.update(dt, noDelta);
    stage.render(scene, camera);
    stage.perf.end();
  }

  restart();
  requestAnimationFrame(loop);
}

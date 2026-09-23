/* Renderer, scene assembly and the frame loop. Reads state every frame; writes
   only sim time and the selected body's live distance. */
import { AmbientLight, PCFShadowMap, PerspectiveCamera, Raycaster, Scene, Vector2, Vector3 } from 'three';
import { SUN } from '../data/bodies';
import { centuries } from '../physics/time';
import { createBelt } from './belt';
import { createFreeRig, type RigBody } from '../shared/camera';
import { createDrift } from './drift';
import { createLabels } from './labels';
import { createOrbits } from './orbits';
import { createPlanets, type Planet } from './planets';
import { systemSpan } from './bodies/moons';
import { isTrueScale } from './scale';
import { createStage } from '../shared/renderer';
import { createSky } from '../shared/sky/sky';
import { orreryUnits } from './rig-units';
import { createConstellations } from './sky/constellations';
import { PAUSED_IDX, SPEEDS, actions, camera as cameraState, selected, selectedDistance, sim, toggles, type Toggles } from './state';
import { createSun } from './sun';
import { createTrails } from './trails';

/** What a fly-to fits on screen, beyond the planet itself. */
const FRAME_EXTENT: Record<string, (p: Planet) => number> = {
  Saturn: p => p.mesh.scale.x * (p.rings ? p.rings.sys.outer / p.eqKm : 1) * 1.05,
  Jupiter: () => systemSpan('Jupiter', isTrueScale()) * 0.8,
};

// dimmed body colours: trails add up where helixes cross, so they start below full brightness
const TRAIL_COLORS: Record<string, number> = {
  Mercury: 0x8a8580, Venus: 0xc8b27a, Earth: 0x4f8fe0, Mars: 0xc0603a, Jupiter: 0xc49a6c,
  Saturn: 0xc8b47c, Uranus: 0x7cc8cc, Neptune: 0x4f6fd8, Pluto: 0xa08c78,
};

export function startOrrery(canvas: HTMLCanvasElement): void {
  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 1, 1e-5, 1e7);
  camera.position.set(0, 130, 210);
  // log depth: one buffer spans a close-up of Phobos and the whole true-scale system
  const stage = createStage(canvas, camera);
  const { renderer, perf } = stage;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  // faint neutral fill: night sides read as near-black, not blue-grey
  scene.add(new AmbientLight(0xffffff, 0.035 * Math.PI));
  const sky = createSky(scene);
  const constellations = createConstellations(scene);
  const sun = createSun(scene);
  const planets = createPlanets(scene);
  const orbits = createOrbits(scene);
  const belt = createBelt(scene);
  const trails = createTrails(scene, () => renderer.getPixelRatio());
  const drift = createDrift();

  const rigBodies: RigBody[] = [
    { name: 'Sun', position: sun.mesh.position, radius: () => sun.mesh.scale.x, radiusKm: SUN.radiusKm },
    ...planets.list.map((p): RigBody => ({
      name: p.name, position: p.group.position, radius: () => p.mesh.scale.x, radiusKm: p.radiusKm,
      frameRadius: () => FRAME_EXTENT[p.name]?.(p) ?? p.mesh.scale.x,
      pole: out => out.set(0, 1, 0).applyQuaternion(p.tiltG.quaternion),
      phaseDeg: p.name === 'Earth' ? 60 : 38,
    })),
    ...planets.moonBodies.map(m => ({ name: m.name, position: m.world, radius: () => m.mesh.scale.x, radiusKm: m.radiusKm })),
  ];
  const bodyByName = Object.fromEntries(rigBodies.map(b => [b.name, b]));
  const ray = new Raycaster(), ndc = new Vector2();
  const pick = (x: number, y: number): string | null => {
    ray.setFromCamera(ndc.set(x, y), camera);
    const hit = ray.intersectObjects([sun.mesh, ...planets.meshes])[0];
    return hit ? hit.object.userData.body as string : null;
  };
  const moonByName = Object.fromEntries(planets.moonBodies.map(m => [m.name, m]));
  const moonDistKm = (name: string) => moonByName[name].distKm;
  const rig = createFreeRig(camera, renderer.domElement, {
    bodies: rigBodies,
    state: cameraState,
    select: actions.select,
    units: orreryUnits(rigBodies[0]),
    onClick: (x, y) => { const name = pick(x, y); if (name) actions.focus(name); },
    onDoubleClick: (x, y) => { if (!pick(x, y)) actions.release(); },
  });

  const labels = createLabels(
    [{ name: 'Sun', position: sun.mesh.position, radiusKm: SUN.radiusKm, radius: () => sun.mesh.scale.x },
      ...planets.list.map(p => ({ name: p.name, dwarf: p.name === 'Pluto', position: p.group.position, radiusKm: p.radiusKm, radius: () => p.mesh.scale.x })),
      ...planets.moonBodies.map(m => ({ name: m.name, parent: m.parent, position: m.world, radiusKm: m.radiusKm, radius: () => m.mesh.scale.x }))],
    name => actions.focus(name),
  );

  selected.subscribe(body => {
    if (!body) { rig.release(); return; }
    rig.focus(bodyByName[body.name]);
  });

  let prevToggles: Toggles | null = null;
  toggles.subscribe(t => {
    orbits.group.visible = t.orbits;
    belt.setVisible(t.belts);
    constellations.setVisible(t.constellations);
    labels.setVisible(t.labels);
    if (prevToggles && t.trueScale !== prevToggles.trueScale) {
      orbits.rebuild(centuries(sim.get().time));
      trails.clear();
      rig.refocus();
    }
    if (prevToggles?.drift && !t.drift) {
      rig.translate(drift.offset.clone().negate());
      drift.reset();
      trails.clear();
    }
    prevToggles = t;
  });

  const noDelta = new Vector3();
  let last = performance.now();

  function frame(now: number) {
    requestAnimationFrame(frame);
    perf.begin(now);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    const s = sim.get();
    const speed = SPEEDS[s.speedIdx].mult;
    const time = s.time + dt * speed * 1000;
    sim.set({ ...s, time });
    const dtDays = dt * speed / 86400;
    const T = centuries(time);
    const t = toggles.get();

    const sunDelta = t.drift && speed > 0 ? drift.advance(dtDays) : noDelta;
    const shift = t.drift ? drift.rebaseShift() : null;
    if (shift) {
      rig.translate(shift.clone().negate());
      trails.shift(shift);
    }
    sun.update(drift.offset, dt, speed, (time - Date.UTC(2000, 0, 1, 12)) / 86400000);
    orbits.group.position.copy(drift.offset);
    planets.update({ T, time, dt, dtDays, speed, sunPos: drift.offset, camera });
    belt.update(time, drift.offset);

    if (t.drift) {
      trails.push('Sun', 0xffc46b, 3, drift.offset);
      planets.list.forEach(p => trails.push(p.name, TRAIL_COLORS[p.name] ?? 0x8090c0, 1.6, p.group.position));
    }

    rig.update(dt, sunDelta);

    const body = selected.get();
    if (body) selectedDistance.set(body.isSun ? '0 AU, by definition'
      : body.parent ? Math.round(moonDistKm(body.name)).toLocaleString('en-US') + ' km'
      : planets.byName[body.name].au.toFixed(3) + ' AU');

    sky.update(camera);
    constellations.update(camera);
    labels.update(camera, now);
    stage.render(scene, camera);
    perf.end();
  }

  orbits.rebuild(centuries(sim.get().time));
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) actions.setSpeed(PAUSED_IDX);
  requestAnimationFrame(frame);
}

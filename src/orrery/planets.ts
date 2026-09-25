/* Planets: real surface maps, IAU pole orientation and prime meridian for the
   sim date, oblate giants, rings, atmospheres, and each planet's moon system. */
import {
  CanvasTexture, Color, Group, Matrix4, Mesh, MeshLambertMaterial, MeshPhongMaterial, MeshStandardMaterial, PointLight,
  SRGBColorSpace, SphereGeometry, Sprite, SpriteMaterial, TextureLoader, Vector2, Vector3, type PerspectiveCamera,
  type Scene, type Texture,
} from 'three';
import { BODIES, type PlanetInfo } from '../data/bodies';
import { SATURN_RINGS, URANUS_RINGS, type RingSystem } from '../data/rings';
import { AU_KM, bodyPosAU } from '../physics/ephemeris';
import { orientation } from '../physics/rotation';
import { createMoonSystem, type MoonBody, type MoonSystem } from './bodies/moons';
import { basisToScene } from './bodies/orient';
import { createRings, ringProfileTexture, type RingUniforms, type Rings } from './bodies/rings';
import { eclipseUniforms, type EclipseUniforms } from './bodies/eclipse';
import { atmosphereMaterial, patchSurface } from './bodies/surface';
import { distScene, eclipticToScene, isTrueScale, trueRadius } from './scale';
import { selected, toggles } from './state';
import { markerTex } from './textures';
import mercuryUrl from '../assets/planets/mercury.webp';
import venusUrl from '../assets/planets/venus_atmosphere.webp';
import marsUrl from '../assets/planets/mars.webp';
import jupiterUrl from '../assets/planets/jupiter.webp';
import saturnUrl from '../assets/planets/saturn.webp';
import uranusUrl from '../assets/planets/uranus.webp';
import neptuneUrl from '../assets/planets/neptune.webp';
import plutoUrl from '../assets/planets/pluto.webp';
import earthColorUrl from '../assets/planets/earth_color_4096.webp';
import earthNightUrl from '../assets/planets/earth_nightmap.webp';
import earthNormalUrl from '../assets/planets/earth_normal_2048.webp';
import earthSpecularUrl from '../assets/planets/earth_specular_2048.webp';
import earthCloudsUrl from '../assets/planets/earth_clouds_1024.webp';

interface Look {
  url: string;
  bump?: number;
  /** brightness left at the limb (thick atmospheres) */
  limb?: number;
  /** day-side fresnel rim: color, strength, falloff power */
  rim?: [string, number, number];
  rings?: RingSystem;
  ringTint?: string;
  /** map brightness scale: these maps are display images, not albedo */
  gain?: number;
}

const LOOKS: Record<string, Look> = {
  Mercury: { url: mercuryUrl, bump: 2, gain: 0.9 },
  Venus: { url: venusUrl, gain: 0.6, limb: 0.7, rim: ['#f6dfae', 0.9, 2.2] },
  Earth: { url: earthColorUrl },
  Mars: { url: marsUrl, bump: 1.5, rim: ['#f0a57e', 0.35, 4] },
  Jupiter: { url: jupiterUrl, gain: 0.85, limb: 0.5, rim: ['#efe0c4', 0.22, 3] },
  Saturn: { url: saturnUrl, gain: 0.85, limb: 0.5, rim: ['#efe2bf', 0.2, 3], rings: SATURN_RINGS, ringTint: '#e9dcc0' },
  Uranus: { url: uranusUrl, gain: 0.5, limb: 0.6, rim: ['#c4f1ff', 0.35, 2.5], rings: URANUS_RINGS, ringTint: '#b8b0a6' },
  Neptune: { url: neptuneUrl, gain: 0.85, limb: 0.6, rim: ['#93b6ff', 0.4, 2.5] },
  Pluto: { url: plutoUrl, bump: 1.5, rim: ['#b9c9e8', 0.14, 4] },
};

const J2000_MS = Date.UTC(2000, 0, 1, 12);

export interface Planet extends PlanetInfo {
  group: Group;      // orbital position (translation only; moons live here too)
  tiltG: Group;      // body frame at W = 0: local +y is the IAU pole
  mesh: Mesh<SphereGeometry, MeshStandardMaterial | MeshPhongMaterial>;
  rings: Rings | null;
  moonSystem: MoonSystem;
  marker: Sprite;
  au: number;        // current heliocentric distance
  eqKm: number;      // equatorial radius
  clouds?: Mesh;
  moonLight?: PointLight;
  /** the Moon's shadow on Earth */
  eclipse?: EclipseUniforms;
}

export interface FrameContext {
  T: number;          // Julian centuries since J2000
  time: number;       // sim time, ms UTC
  dt: number;         // real seconds since last frame
  dtDays: number;     // sim days since last frame
  speed: number;      // sim seconds per real second
  sunPos: Vector3;    // scene position of the Sun
  camera: PerspectiveCamera;
}

export interface Planets {
  list: Planet[];
  byName: Record<string, Planet>;
  meshes: Mesh[];
  moonBodies: MoonBody[];
  update(ctx: FrameContext): void;
}

const loader = new TextureLoader();
function colorMap(url: string): Texture {
  const t = loader.load(url);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function createPlanets(scene: Scene): Planets {
  const sunWorld = new Vector3();
  const sunU = { value: sunWorld };
  const sphere = new SphereGeometry(1, 96, 48);

  const list: Planet[] = BODIES.map(b => {
    const look = LOOKS[b.name];
    const group = new Group();
    const tiltG = new Group();
    const isEarth = b.name === 'Earth';
    const map = isEarth ? new CanvasTexture(document.createElement('canvas')) : colorMap(look.url);
    // Earth: tight, faint specular — under the strong Sun a broad lobe reads as grey fog on the oceans
    const mat = isEarth
      ? new MeshPhongMaterial({ map, shininess: 60, specular: new Color(0x2a3440).multiplyScalar(0.35) })
      : new MeshStandardMaterial({ map, color: new Color().setScalar(look.gain ?? 1), roughness: 1, metalness: 0, ...(look.bump ? { bumpMap: map, bumpScale: look.bump } : {}) });
    const mesh = new Mesh(sphere, mat);
    mesh.userData.body = b.name;
    tiltG.add(mesh); group.add(tiltG); scene.add(group);

    let rings: Rings | null = null;
    if (look.rings) {
      const uniforms: RingUniforms = {
        uProfile: { value: ringProfileTexture(look.rings) },
        uSun: sunU,
        uCenter: { value: group.position },
        uNormal: { value: new Vector3(0, 1, 0) },
        uInner: { value: 1 }, uOuter: { value: 2 }, uPlanetR: { value: 1 },
        uTint: { value: new Color(look.ringTint) },
        uGain: { value: 1.6 },
      };
      rings = createRings(look.rings, uniforms);
      tiltG.add(rings.mesh);
    }
    if (!isEarth) patchSurface(mat, { sun: sunU, limb: look.limb, rings: rings?.uniforms });
    if (look.rim) {
      const shell = new Mesh(sphere, atmosphereMaterial(sunU, ...look.rim));
      shell.scale.setScalar(look.rings || look.limb ? 1.012 : 1.025);
      mesh.add(shell);
    }

    const marker = new Sprite(new SpriteMaterial({ map: markerTex(), depthWrite: false, transparent: true, sizeAttenuation: false }));
    marker.scale.setScalar(0.022);
    marker.visible = false;
    group.add(marker);

    const eqKm = b.radiusKm / Math.cbrt(1 - b.flattening);
    return { ...b, group, tiltG, mesh, rings, moonSystem: createMoonSystem(b.name, group, sunU), marker, au: 0, eqKm };
  });
  const byName: Record<string, Planet> = Object.fromEntries(list.map(p => [p.name, p]));
  setupEarth(scene, byName.Earth, sunU);

  const basis = new Matrix4(), normal = new Vector3(), toSun = new Vector3(), toMoon = new Vector3();
  const moonBodies = list.flatMap(p => p.moonSystem.spheres);

  function update({ T, time, dt, speed, sunPos, camera }: FrameContext) {
    const trueScale = isTrueScale();
    const d = (time - J2000_MS) / 86400000;
    const jd = d + 2451545.0;
    sunWorld.copy(sunPos);
    const sel = selected.get();
    const orbitsOn = toggles.get().orbits;
    const pxPerUnit = innerHeight / 2 / Math.tan((camera.fov * Math.PI) / 360);

    for (const p of list) {
      const pos = bodyPosAU(p.name, T);
      p.au = Math.hypot(pos.x, pos.y, pos.z);
      eclipticToScene(pos, p.group.position).normalize().multiplyScalar(distScene(p.au)).add(sunPos);

      const eq = (trueScale ? trueRadius(p.radiusKm) : p.visR) / Math.cbrt(1 - p.flattening);
      p.mesh.scale.set(eq, eq * (1 - p.flattening), eq);

      const o = orientation(p.name, d);
      p.tiltG.quaternion.setFromRotationMatrix(basisToScene(o, basis));
      p.mesh.rotation.y = o.W;
      if (p.clouds && speed !== 0) p.clouds.rotation.y += dt * 0.004 * Math.sign(speed);

      if (p.rings) {
        p.rings.mesh.scale.setScalar(eq * p.rings.sys.planetRadiusKm / p.eqKm);
        const u = p.rings.uniforms;
        u.uNormal.value.copy(normal.set(0, 1, 0).applyQuaternion(p.tiltG.quaternion));
        u.uInner.value = p.rings.sys.inner / p.eqKm * eq;
        u.uOuter.value = p.rings.sys.outer / p.eqKm * eq;
        u.uPlanetR.value = eq;
      }

      const showMoonOrbits = orbitsOn && !!sel && (sel.name === p.name || sel.parent === p.name);
      p.moonSystem.update(jd, T, p.group.position, p.eqKm, eq, trueScale, showMoonOrbits);

      if (p.moonLight) {
        // moonlight on the night side: magnitude exaggerated, follows the real phase
        const moon = p.moonSystem.spheres[0];
        toSun.copy(sunPos).sub(p.group.position).normalize();
        const cosE = toMoon.copy(moon.mesh.position).normalize().dot(toSun);
        p.moonLight.position.copy(moon.world);
        p.moonLight.intensity = 0.35 * Math.PI * (1 - cosE) / 2;
      }
      if (p.eclipse) updateEclipses(p, pos, eq);

      // true-scale marker: a dot while the planet is sub-pixel, gone once it resolves
      const px = eq / Math.max(camera.position.distanceTo(p.group.position), 1e-9) * pxPerUnit;
      const fade = Math.min(1, Math.max(0, (4 - px) / 2.5));
      p.marker.visible = trueScale && fade > 0;
      p.marker.material.opacity = fade;
    }
  }

  const sunKm = new Vector3();
  // true geometry in 1000 km: Sun from Earth, Moon from Earth
  function updateEclipses(earth: Planet, earthAU: { x: number; y: number; z: number }, earthR: number) {
    const moon = earth.moonSystem.spheres[0];
    eclipticToScene(earthAU, sunKm).multiplyScalar(-AU_KM / 1000);
    const toMoon = moon.offsetKm;

    const onMoon = moon.eclipse!;
    onMoon.uEclCenter.value.copy(moon.world);
    onMoon.uEclR.value = moon.mesh.scale.x;
    onMoon.uEclRecv.value.copy(toMoon).multiplyScalar(1 / 1000);
    onMoon.uEclRecvR.value = moon.radiusKm / 1000;
    onMoon.uEclSun.value.copy(sunKm);

    const onEarth = earth.eclipse!;
    onEarth.uEclCenter.value.copy(earth.group.position);
    onEarth.uEclR.value = earthR;
    onEarth.uEclRecv.value.copy(toMoon).multiplyScalar(-1 / 1000);
    onEarth.uEclRecvR.value = earth.eqKm / 1000;
    onEarth.uEclSun.value.copy(sunKm).addScaledVector(toMoon, -1 / 1000);
  }

  return { list, byName, meshes: [...list.map(p => p.mesh), ...moonBodies.map(m => m.mesh)], moonBodies, update };
}

// NASA Blue Marble color (Tashkent marked) + relief + ocean shine + clouds + city lights
function setupEarth(scene: Scene, e: Planet, sun: { value: Vector3 }) {
  const mat = e.mesh.material as MeshPhongMaterial;
  const night = colorMap(earthNightUrl);
  e.eclipse = eclipseUniforms(1737.4, new Color(0, 0, 0), 1, 0.75);
  patchSurface(mat, { sun, night: { map: night, gain: 1.6 }, eclipse: e.eclipse });

  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d')!; g.drawImage(img, 0, 0);
    // Tashkent: 41.31 N, 69.24 E
    const tx = (69.24 + 180) / 360 * c.width, ty = (90 - 41.31) / 180 * c.height, s = c.width / 2048;
    g.strokeStyle = '#ffffff'; g.lineWidth = 2.5 * s;
    g.beginPath(); g.arc(tx, ty, 7 * s, 0, 7); g.stroke();
    g.fillStyle = '#ff3b30'; g.beginPath(); g.arc(tx, ty, 3.5 * s, 0, 7); g.fill();
    const tex = new CanvasTexture(c);
    tex.anisotropy = 8;
    tex.colorSpace = SRGBColorSpace;
    mat.map?.dispose();
    mat.map = tex;
  };
  img.src = earthColorUrl;

  mat.normalMap = loader.load(earthNormalUrl);
  mat.normalScale = new Vector2(0.85, 0.85);
  mat.specularMap = loader.load(earthSpecularUrl);

  e.moonLight = new PointLight(0xbfd4ff, 0, 60, 0);
  scene.add(e.moonLight);

  const clouds = new Mesh(new SphereGeometry(1.008, 96, 48),
    new MeshLambertMaterial({ map: colorMap(earthCloudsUrl), transparent: true, opacity: 0.55, depthWrite: false }));
  patchSurface(clouds.material, { sun, eclipse: e.eclipse });
  e.mesh.add(clouds);
  e.clouds = clouds;
  const shell = new Mesh(e.mesh.geometry, atmosphereMaterial(sun, '#6aa6ff', 1.1, 3.2));
  shell.scale.setScalar(1.03);
  e.mesh.add(shell);
}

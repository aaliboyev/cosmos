/* Every known moon, placed from its elements for the sim date. Large and
   notable moons are spheres; the rest are dots. Compressed mode keeps each
   system's order but squeezes it to fit between planetary orbits. */
import {
  BufferAttribute, BufferGeometry, Color, Group, LineBasicMaterial, LineLoop, Mesh, MeshStandardMaterial, Points,
  PointsMaterial, SRGBColorSpace, SphereGeometry, TextureLoader, Vector3, type Texture,
} from 'three';
import { SPHERE_MOONS, type SphereMoon } from '../../data/satellites';
import { AU_KM, type Vec3 } from '../../physics/ephemeris';
import { lunarPosKm } from '../../physics/moon';
import { moonPosKm, moonsOf, orbitPointKm, type MoonElements } from '../../physics/moons';
import { AU_SCENE, eclipticToScene } from '../scale';
import { eclipseUniforms, type EclipseUniforms } from './eclipse';
import { atmosphereMaterial, patchSurface } from './surface';
import moonMapUrl from '../../assets/planets/moon.webp';

/* Compressed layout, in parent equatorial radii x = a/R: identity out to 3 R
   (rings and ring moons keep true proportions), then logarithmic, scaled so the
   outermost regular moon (at xOuter) lands `span` scene units from the planet. */
const LAYOUT: Record<string, { xOuter: number; span: number }> = {
  Earth: { xOuter: 60.3, span: 7 },
  Mars: { xOuter: 6.9, span: 6 },
  Jupiter: { xOuter: 26.3, span: 30 },
  Saturn: { xOuter: 59.1, span: 30 },
  Uranus: { xOuter: 22.8, span: 18 },
  Neptune: { xOuter: 14.4, span: 15 },
  Pluto: { xOuter: 16.5, span: 6 },
};

const SEGMENTS = 160;

const isRegular = (parent: string, el: MoonElements) => !el.retrograde && el.aKm <= LAYOUT[parent].xOuter * 1.05 * PARENT_EQ_KM[parent];
const PARENT_EQ_KM: Record<string, number> = { Earth: 6378, Mars: 3396, Jupiter: 71492, Saturn: 60268, Uranus: 25559, Neptune: 24764, Pluto: 1188 };

export interface MoonBody extends SphereMoon {
  mesh: Mesh<SphereGeometry, MeshStandardMaterial>;
  /** live world position, for the camera rig */
  world: Vector3;
  /** true offset from the parent, km, scene axes */
  offsetKm: Vector3;
  /** true distance from the parent */
  distKm: number;
  /** Earth's shadow on the Moon */
  eclipse: EclipseUniforms | null;
  elements: MoonElements | null;   // null: the Moon, which has its own theory
  orbit: LineLoop | null;
  orbitKm: Float32Array | null;
}

export interface MoonSystem {
  parent: string;
  spheres: MoonBody[];
  update(jd: number, T: number, planetPos: Vector3, parentR: number, parentVisEq: number, trueScale: boolean, showOrbits: boolean): void;
}

const kmToScene = AU_SCENE / AU_KM;

/** Scene distance of the outermost regular moon from its planet, at the current scale. */
export function systemSpan(parent: string, trueScale: boolean): number {
  const l = LAYOUT[parent];
  return trueScale ? l.xOuter * PARENT_EQ_KM[parent] * kmToScene : l.span;
}

let moonMap: Texture | null = null;
const sphereGeo = new SphereGeometry(1, 40, 20);

export function createMoonSystem(parent: string, group: Group, sun: { value: Vector3 }): MoonSystem {
  const elements = moonsOf(parent);
  moonMap ??= (() => { const t = new TextureLoader().load(moonMapUrl); t.colorSpace = SRGBColorSpace; t.anisotropy = 4; return t; })();
  const layout = LAYOUT[parent];

  const spheres: MoonBody[] = SPHERE_MOONS.filter(m => m.parent === parent).map(info => {
    const el = elements.find(e => e.name === info.name) ?? null;
    const mat = new MeshStandardMaterial({
      ...(info.hazy ? {} : { map: moonMap!, bumpMap: moonMap!, bumpScale: 1.5 }),
      roughness: 1, metalness: 0,
      color: info.name === 'Moon' ? new Color(1, 1, 1) : new Color(info.color).multiplyScalar(info.hazy ? 0.45 : 1.25),
    });
    // Earth's shadow grows ~2% from its atmosphere (Danjon); the umbra keeps a dim red
    const eclipse = info.name === 'Moon' ? eclipseUniforms(PARENT_EQ_KM.Earth * 1.02, new Color(0.16, 0.05, 0.02), 2.5) : null;
    if (info.hazy) patchSurface(mat, { sun, limb: 0.35 });
    if (eclipse) patchSurface(mat, { sun, eclipse });
    const mesh = new Mesh(sphereGeo, mat);
    mesh.userData.body = info.name;
    group.add(mesh);
    if (info.name === 'Titan') {
      const haze = new Mesh(sphereGeo, atmosphereMaterial(sun, '#e0a050', 1.1, 2));
      haze.scale.setScalar(1.08);
      mesh.add(haze);
    }

    let orbit: LineLoop | null = null, orbitKm: Float32Array | null = null;
    // orbit lines for the regular system only; irregular orbits would streak across the view
    if (el && isRegular(parent, el)) {
      orbitKm = new Float32Array(SEGMENTS * 3);
      const p: Vec3 = { x: 0, y: 0, z: 0 };
      for (let k = 0; k < SEGMENTS; k++) {
        orbitPointKm(el, (k / SEGMENTS) * Math.PI * 2, false, p);
        orbitKm.set([p.x, p.y, p.z], k * 3);
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(new Float32Array(SEGMENTS * 3), 3));
      orbit = new LineLoop(geo, new LineBasicMaterial({ color: 0x5a6a90, transparent: true, opacity: 0.35, depthWrite: false }));
      orbit.frustumCulled = false;
      orbit.visible = false;
      group.add(orbit);
    }
    return { ...info, mesh, world: new Vector3(), offsetKm: new Vector3(), distKm: 0, eclipse, elements: el, orbit, orbitKm };
  });

  const sphereNames = new Set(spheres.map(s => s.name));
  const dotEls = elements.filter(e => !sphereNames.has(e.name));
  const dotGeo = new BufferGeometry();
  dotGeo.setAttribute('position', new BufferAttribute(new Float32Array(Math.max(dotEls.length, 1) * 3), 3));
  const dots = new Points(dotGeo, new PointsMaterial({ color: 0x9ea3ad, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.8, depthWrite: false }));
  dots.frustumCulled = false;
  dots.visible = dotEls.length > 0;
  group.add(dots);

  const km: Vec3 = { x: 0, y: 0, z: 0 };
  const v = new Vector3();
  let orbitsFor: string | null = null;   // "scale:visEq" the orbit lines were built for

  /** km offset from the parent (ecliptic) → scene offset */
  function place(p: Vec3, out: Vector3, parentR: number, parentVisEq: number, trueScale: boolean): Vector3 {
    eclipticToScene(p, out);
    const rKm = out.length();
    if (trueScale || rKm === 0) return out.multiplyScalar(kmToScene);
    const x = rKm / parentR;
    const k = (layout.span - 3 * parentVisEq) / Math.log(layout.xOuter / 3);
    const d = x <= 3 ? x * parentVisEq : 3 * parentVisEq + k * Math.log(x / 3);
    return out.multiplyScalar(d / rKm);
  }

  function update(jd: number, T: number, planetPos: Vector3, parentR: number, parentVisEq: number, trueScale: boolean, showOrbits: boolean) {
    for (const m of spheres) {
      if (m.elements) moonPosKm(m.elements, jd, km);
      else { const l = lunarPosKm(T); km.x = l.x; km.y = l.y; km.z = l.z; }
      m.distKm = Math.hypot(km.x, km.y, km.z);
      eclipticToScene(km, m.offsetKm);
      place(km, m.mesh.position, parentR, parentVisEq, trueScale);
      const r = trueScale ? m.radiusKm * kmToScene : Math.max(0.55 * Math.sqrt(m.radiusKm / 2000), 0.06);
      m.mesh.scale.setScalar(r);
      m.visR = r;
      m.world.copy(m.mesh.position).add(planetPos);
      if (m.locked) {
        // near side (longitude 0, local +x) faces the parent
        m.mesh.lookAt(planetPos);
        m.mesh.rotateY(-Math.PI / 2);
      }
      if (m.orbit) m.orbit.visible = showOrbits;
    }

    const key = showOrbits ? `${trueScale}:${parentVisEq.toFixed(4)}` : null;
    if (key && key !== orbitsFor) {
      for (const m of spheres) {
        if (!m.orbit || !m.orbitKm) continue;
        const arr = m.orbit.geometry.attributes.position.array as Float32Array;
        for (let k = 0; k < SEGMENTS; k++) {
          km.x = m.orbitKm[k * 3]; km.y = m.orbitKm[k * 3 + 1]; km.z = m.orbitKm[k * 3 + 2];
          place(km, v, parentR, parentVisEq, trueScale);
          arr[k * 3] = v.x; arr[k * 3 + 1] = v.y; arr[k * 3 + 2] = v.z;
        }
        m.orbit.geometry.attributes.position.needsUpdate = true;
      }
    }
    orbitsFor = key;

    if (dotEls.length) {
      const arr = dotGeo.attributes.position.array as Float32Array;
      dotEls.forEach((el, i) => {
        moonPosKm(el, jd, km);
        place(km, v, parentR, parentVisEq, trueScale);
        arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
      });
      dotGeo.attributes.position.needsUpdate = true;
    }
  }

  return { parent, spheres, update };
}


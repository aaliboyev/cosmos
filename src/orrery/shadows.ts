/* Umbra and penumbra cones behind each planet and sphere moon, pointing away
   from the Sun. True scale only: compressed mode has no consistent geometry to show. */
import {
  AdditiveBlending, CylinderGeometry, Color, DoubleSide, Mesh, NormalBlending, Quaternion, ShaderMaterial, Vector3, type Scene,
} from 'three';
import { SUN } from '../data/bodies';
import { trueRadius } from './scale';

interface Cone {
  mesh: Mesh<CylinderGeometry, ShaderMaterial>;
  set(origin: Vector3, axis: Vector3, r0: number, r1: number, len: number): void;
}

interface ConeLook {
  color: string;
  alpha: number;
  additive: boolean;
  fadeFrom: number;    // fraction of the length where it starts fading out
  order: number;       // haze first, then the dark cones carve into it
}

// faint sunlit haze around the shadow, so the dark reads against something
const HAZE: ConeLook = { color: '#6f9cff', alpha: 0.10, additive: true, fadeFrom: 0.3, order: 1 };
const PENUMBRA: ConeLook = { color: '#000000', alpha: 0.35, additive: false, fadeFrom: 0.4, order: 2 };
const UMBRA: ConeLook = { color: '#000000', alpha: 0.85, additive: false, fadeFrom: 0.8, order: 3 };
const HAZE_WIDTH = 1.6;   // haze radius over the penumbra's

// unit open tube along +y, t = 0..1; the vertex shader tapers it from uR0 to uR1 over uLen
const tube = new CylinderGeometry(1, 1, 1, 96, 1, true).translate(0, 0.5, 0);
const up = new Vector3(0, 1, 0);

function createCone(scene: Scene, look: ConeLook): Cone {
  const uniforms = {
    uR0: { value: 1 }, uR1: { value: 0 }, uLen: { value: 1 },
    uColor: { value: new Color(look.color) }, uAlpha: { value: look.alpha }, uFadeFrom: { value: look.fadeFrom },
  };
  const mesh = new Mesh(tube, new ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: look.additive ? AdditiveBlending : NormalBlending,
    vertexShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_vertex>
      uniform float uR0, uR1, uLen;
      varying float vT;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vT = position.y;
        float r = mix(uR0, uR1, vT);
        vec3 p = vec3(position.x * r, vT * uLen, position.z * r);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * vec3(position.x, (uR0 - uR1) / uLen, position.z));
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uColor;
      uniform float uAlpha, uFadeFrom;
      varying float vT;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        #include <logdepthbuf_fragment>
        // path length through the volume: densest along the axis, nothing at the silhouette
        float depth = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
        float fade = 1.0 - smoothstep(uFadeFrom, 1.0, vT);
        gl_FragColor = vec4(uColor, uAlpha * depth * fade);
      }`,
  }));
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = look.order;
  scene.add(mesh);
  const q = new Quaternion();
  return {
    mesh,
    set(origin, axis, r0, r1, len) {
      mesh.position.copy(origin);
      mesh.quaternion.copy(q.setFromUnitVectors(up, axis));
      uniforms.uR0.value = r0;
      uniforms.uR1.value = r1;
      uniforms.uLen.value = len;
    },
  };
}

export interface ShadowBody {
  position: Vector3;
  radius: number;
  /** how far behind the body the cones are drawn */
  reach: number;
}

export interface ShadowCones {
  update(visible: boolean, sun: Vector3, bodies: ShadowBody[]): void;
}

export function createShadowCones(scene: Scene): ShadowCones {
  const sets: { haze: Cone; penumbra: Cone; umbra: Cone }[] = [];
  const axis = new Vector3();

  return {
    update(visible, sun, bodies) {
      while (sets.length < bodies.length) {
        sets.push({ haze: createCone(scene, HAZE), penumbra: createCone(scene, PENUMBRA), umbra: createCone(scene, UMBRA) });
      }
      for (const c of sets) c.haze.mesh.visible = c.penumbra.mesh.visible = c.umbra.mesh.visible = visible;
      if (!visible) return;
      const sunR = trueRadius(SUN.radiusKm);
      bodies.forEach((b, i) => {
        const d = axis.subVectors(b.position, sun).length();
        axis.divideScalar(d);
        // similar triangles on the Sun's and body's tangent lines; long umbrae are cut at reach
        const umbraLen = b.radius * d / (sunR - b.radius), len = Math.min(umbraLen, b.reach);
        const penEnd = b.radius + b.reach * (sunR + b.radius) / d;
        sets[i].umbra.set(b.position, axis, b.radius, b.radius * (1 - len / umbraLen), len);
        sets[i].penumbra.set(b.position, axis, b.radius, penEnd, b.reach);
        sets[i].haze.set(b.position, axis, b.radius * HAZE_WIDTH, penEnd * HAZE_WIDTH, b.reach);
      });
    },
  };
}

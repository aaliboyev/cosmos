/* Rings as a lit particle layer: opacity from optical depth along the slant
   path, brightness from a thin-layer scattering model (dim when the Sun grazes
   the ring plane, as around equinox; the lit and unlit faces differ), and the
   planet's shadow computed analytically. */
import {
  ClampToEdgeWrapping, DataTexture, DoubleSide, LinearFilter, LinearMipmapLinearFilter, Mesh, RGBAFormat, RingGeometry, ShaderMaterial,
  UnsignedByteType, Vector3, type Color,
} from 'three';
import type { RingSystem } from '../../data/rings';

const PROFILE_W = 4096;

/** R: albedo, G: normal-incidence transmission exp(−τ), B: unused, A: 1 */
export function ringProfileTexture(sys: RingSystem): DataTexture {
  const data = new Uint8Array(PROFILE_W * 4);
  const span = sys.outer - sys.inner;
  // deterministic ringlet structure: the real rings are grooved at every scale
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const ripple = Array.from({ length: 64 }, () => [rand() * 900 + 60, rand() * Math.PI * 2, rand()]);
  for (let i = 0; i < PROFILE_W; i++) {
    const r = sys.inner + (i + 0.5) / PROFILE_W * span;
    let tau = 0, albedo = 0;
    for (const b of sys.bands) if (r >= b.from && r < b.to) { tau = Math.max(tau, b.tau); albedo = Math.max(albedo, b.albedo); }
    for (const g of sys.gaps) if (Math.abs(r - g.center) < g.width / 2) tau = 0;
    if (tau > 0.01) {
      let m = 0;
      for (const [k, ph, w] of ripple) m += Math.sin((r / span) * k + ph) * w;
      tau *= Math.max(0.25, 1 + 0.07 * m);
    }
    data[i * 4] = Math.round(Math.min(1, albedo) * 255);
    data[i * 4 + 1] = Math.round(Math.exp(-tau) * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = new DataTexture(data, PROFILE_W, 1, RGBAFormat, UnsignedByteType);
  tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;   // ringlets alias badly at grazing angles otherwise
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export interface RingUniforms {
  uProfile: { value: DataTexture };
  uSun: { value: Vector3 };        // world position of the Sun
  uCenter: { value: Vector3 };     // world position of the planet
  uNormal: { value: Vector3 };     // world ring-plane normal
  uInner: { value: number };       // world radii
  uOuter: { value: number };
  uPlanetR: { value: number };     // world equatorial radius, for the shadow
  uTint: { value: Color };
  uGain: { value: number };
}

export interface Rings {
  mesh: Mesh<RingGeometry, ShaderMaterial>;
  uniforms: RingUniforms;
  sys: RingSystem;
}

/** Ring mesh in the planet's equatorial plane (local xz), sized in planet radii. */
export function createRings(sys: RingSystem, uniforms: RingUniforms): Rings {
  const inner = sys.inner / sys.planetRadiusKm, outer = sys.outer / sys.planetRadiusKm;
  const geo = new RingGeometry(inner, outer, 256, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, { value: unknown }>,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    vertexShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vWPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D uProfile;
      uniform vec3 uSun, uCenter, uNormal, uTint;
      uniform float uInner, uOuter, uPlanetR, uGain;
      varying vec3 vWPos;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 rel = vWPos - uCenter;
        float r = length(rel);
        float s = (r - uInner) / (uOuter - uInner);
        if (s < 0.0 || s > 1.0) discard;
        vec4 prof = texture2D(uProfile, vec2(s, 0.5));
        float T0 = max(prof.g, 1e-4);
        vec3 V = normalize(cameraPosition - vWPos);
        vec3 L = normalize(uSun - vWPos);
        float muV = max(abs(dot(V, uNormal)), 0.015);
        float muS = max(abs(dot(L, uNormal)), 0.002);
        float alpha = 1.0 - pow(T0, 1.0 / muV);
        if (alpha < 0.003) discard;
        // Lommel–Seeliger reflection off the lit face; single-scattered diffuse
        // transmission through to the unlit face (thin parts glow, the B ring stays dark)
        float a = 1.0 / muS, b = 1.0 / muV;
        float Ts = pow(T0, a), Tv = pow(T0, b);
        bool sameSide = dot(V, uNormal) * dot(L, uNormal) > 0.0;
        float lit = sameSide
          ? 2.0 * muS / (muS + muV) * (1.0 - pow(T0, a + b))
          : 2.0 * (abs(b - a) < 1e-3 ? -log(T0) * a * Ts : a * (Ts - Tv) / (b - a));
        lit *= prof.r;
        lit += 0.6 * prof.r * pow(max(dot(-V, L), 0.0), 8.0) * (1.0 - T0);   // forward scattering
        // planet shadow: does the ray toward the Sun hit the planet?
        float along = dot(rel, L);
        float miss = sqrt(max(dot(rel, rel) - along * along, 0.0));
        float shadow = along < 0.0 ? smoothstep(0.97, 1.02, miss / uPlanetR) : 1.0;
        vec3 col = uTint * lit * shadow * uGain + uTint * 0.012;
        gl_FragColor = vec4(col, alpha);
      }`,
  });
  return { mesh: new Mesh(geo, mat), uniforms, sys };
}

/* Shader patches on three's lit materials: limb darkening for thick
   atmospheres, city lights on Earth's night side, ring shadows on the planet,
   and eclipses. All work in world space against the Sun's live position. */
import {
  AdditiveBlending, Color, FrontSide, ShaderMaterial, type MeshLambertMaterial, type MeshPhongMaterial, type MeshStandardMaterial,
  type Texture, type Vector3,
} from 'three';
import { ECLIPSE_APPLY, ECLIPSE_PARS, type EclipseUniforms } from './eclipse';
import type { RingUniforms } from './rings';

export interface SurfaceOptions {
  sun: { value: Vector3 };
  /** 0..1 brightness left at the limb; omit for none */
  limb?: number;
  night?: { map: Texture; gain: number };
  rings?: RingUniforms;
  eclipse?: EclipseUniforms;
}

export function patchSurface(mat: MeshStandardMaterial | MeshPhongMaterial | MeshLambertMaterial, opts: SurfaceOptions): void {
  const key = `surface:${opts.limb ?? '-'}:${opts.night ? 'n' : '-'}:${opts.rings ? 'r' : '-'}:${opts.eclipse ? 'e' : '-'}`;
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = shader => {
    shader.uniforms.uSun = opts.sun;
    if (opts.night) {
      shader.uniforms.uNight = { value: opts.night.map };
      shader.uniforms.uNightGain = { value: opts.night.gain };
    }
    if (opts.rings) Object.assign(shader.uniforms, opts.rings);
    if (opts.eclipse) Object.assign(shader.uniforms, opts.eclipse);
    shader.uniforms.uLimb = { value: opts.limb ?? 1 };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNormal = normalize(mat3(modelMatrix) * objectNormal);');

    let pars = 'varying vec3 vWPos;\nvarying vec3 vWNormal;\nuniform vec3 uSun;\nuniform float uLimb;\n';
    if (opts.night) pars += 'uniform sampler2D uNight;\nuniform float uNightGain;\n';
    if (opts.rings) pars += 'uniform sampler2D uProfile;\nuniform vec3 uCenter, uNormal;\nuniform float uInner, uOuter;\n';
    if (opts.eclipse) pars += ECLIPSE_PARS;

    let emissive = '';
    if (opts.night) emissive = `
      {
        float nd = dot(normalize(vWNormal), normalize(uSun - vWPos));
        vec3 lights = texture2D(uNight, vMapUv).rgb;
        totalEmissiveRadiance += lights * lights * uNightGain * smoothstep(0.08, -0.18, nd);
      }`;

    let post = `outgoingLight *= mix(uLimb, 1.0, pow(max(dot(normal, normalize(vViewPosition)), 0.0), 0.45));`;
    if (opts.rings) post += `
      {
        vec3 L = normalize(uSun - vWPos);
        float den = dot(L, uNormal);
        if (abs(den) > 1e-4) {
          float t = dot(uCenter - vWPos, uNormal) / den;
          if (t > 0.0) {
            float r = length(vWPos + L * t - uCenter);
            float s = (r - uInner) / (uOuter - uInner);
            if (s > 0.0 && s < 1.0) {
              float T0 = max(texture2D(uProfile, vec2(s, 0.5)).g, 1e-4);
              outgoingLight *= mix(0.08, 1.0, pow(T0, 1.0 / max(abs(den), 0.01)));
            }
          }
        }
      }`;

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + pars)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>' + emissive)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>' + (opts.eclipse ? ECLIPSE_APPLY : ''))
      .replace('#include <opaque_fragment>', post + '\n#include <opaque_fragment>');
  };
  mat.needsUpdate = true;
}

/** Thin additive shell: a fresnel rim that only glows on the day side. */
export function atmosphereMaterial(sun: { value: Vector3 }, color: string, strength: number, power = 3): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uSun: sun, uColor: { value: new Color(color) }, uStrength: { value: strength }, uPower: { value: power } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: FrontSide,
    vertexShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vWPos;
      varying vec3 vWNormal;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz;
        vWNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uSun, uColor;
      uniform float uStrength, uPower;
      varying vec3 vWPos;
      varying vec3 vWNormal;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 N = normalize(vWNormal);
        vec3 V = normalize(cameraPosition - vWPos);
        vec3 L = normalize(uSun - vWPos);
        float rim = pow(1.0 - max(dot(N, V), 0.0), uPower);
        float day = smoothstep(-0.25, 0.4, dot(N, L));
        gl_FragColor = vec4(uColor * rim * day * uStrength, 1.0);
      }`,
  });
}

/* The Sun: photosphere map with limb darkening (cooler, dimmer, redder toward
   the edge) and slow-moving granulation noise, oriented and spun by its IAU pole
   and ~25.4-day equatorial rotation. It is also the scene's light. */
import {
  Matrix4, Mesh, PointLight, Quaternion, SRGBColorSpace, ShaderMaterial, SphereGeometry, TextureLoader, Vector3, type Scene,
} from 'three';
import { SUN } from '../data/bodies';
import { orientation } from '../physics/rotation';
import { isTrueScale, trueRadius } from './scale';
import { basisToScene } from './bodies/orient';
import { createStarHalo } from '../shared/halo';
import sunMapUrl from '../assets/planets/sun.webp';

export interface Sun {
  mesh: Mesh;
  light: PointLight;
  update(position: Vector3, dt: number, speed: number, daysJ2000: number): void;
}

export function createSun(scene: Scene): Sun {
  const map = new TextureLoader().load(sunMapUrl);
  map.colorSpace = SRGBColorSpace;
  const uniforms = { uMap: { value: map }, uTime: { value: 0 } };
  const mesh = new Mesh(new SphereGeometry(1, 64, 32), new ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      void main() {
        vUv = uv;
        vP = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D uMap;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float noise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      void main() {
        #include <logdepthbuf_fragment>
        vec3 base = texture2D(uMap, vUv).rgb;
        float g = noise(vP * 38.0 + uTime * 0.15) * 0.6 + noise(vP * 90.0 - uTime * 0.25) * 0.4;
        float mu = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
        // quadratic limb-darkening law, stronger in blue than red
        vec3 limb = 1.0 - vec3(0.45, 0.6, 0.78) * (1.0 - mu) - vec3(0.15, 0.2, 0.2) * (1.0 - mu) * (1.0 - mu);
        // the map reads orange; the eye sees a near-white disk with a warm limb
        float lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
        vec3 col = vec3(1.0, 0.93, 0.8) * (0.75 + 0.5 * lum) * (0.93 + 0.14 * g) * limb * 1.35;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  mesh.userData.body = SUN.name;
  scene.add(mesh);

  const halo = createStarHalo(scene);
  halo.setMinPixels(5);

  // decay 0: the light carries to Neptune undimmed, like the original look
  const light = new PointLight(0xfff2dd, 2.4 * Math.PI, 0, 0);
  light.castShadow = true;                     // eclipses: Moon↔Earth only
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.camera.near = 10;
  light.shadow.camera.far = 200;
  light.shadow.bias = -0.004;
  scene.add(light);

  const basis = new Matrix4(), spin = new Quaternion(), yAxis = new Vector3(0, 1, 0);

  return {
    mesh,
    light,
    update(position, dt, speed, daysJ2000) {
      const r = isTrueScale() ? trueRadius(SUN.radiusKm) : SUN.visR;
      mesh.scale.setScalar(r);
      halo.update(position, r);
      mesh.position.copy(position);
      light.position.copy(position);
      const o = orientation('Sun', daysJ2000);
      basisToScene(o, basis);
      mesh.quaternion.setFromRotationMatrix(basis).multiply(spin.setFromAxisAngle(yAxis, o.W));
      if (speed !== 0) uniforms.uTime.value += dt;
    },
  };
}

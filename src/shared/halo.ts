/* Star glow from each pixel's view ray: its closest approach to the star's centre,
   in stellar radii, drives the falloff. A billboard can't match the sphere's
   perspective stretch near the screen edge; this stays centred at any angle and
   distance, including from inside the glow. */
import { AdditiveBlending, BackSide, Color, Mesh, PerspectiveCamera, ShaderMaterial, SphereGeometry, Vector3, type Scene } from 'three';

const HALO_R = 16;   // shell radius in stellar radii; the glow is negligible beyond

export interface StarHalo {
  mesh: Mesh;
  /** Per frame: star centre and displayed radius in scene units. */
  update(position: Vector3, radius: number): void;
  /** `inner` near the limb, `outer` in the wide corona. */
  setColors(inner: Color | number, outer: Color | number): void;
  /** Multiplies the whole glow; 1 is the Sun's. */
  setIntensity(k: number): void;
  /** Smallest on-screen glow radius, px: a bright star glares however small its disk. 0 is off. */
  setMinPixels(px: number): void;
}

export function createStarHalo(scene: Scene): StarHalo {
  const uniforms = {
    uCenter: { value: new Vector3() },
    uRadius: { value: 1 },
    uIntensity: { value: 1 },
    uInner: { value: new Color(1.0, 0.95, 0.85) },
    uOuter: { value: new Color(1.0, 0.72, 0.42) },
  };
  const mesh = new Mesh(new SphereGeometry(1, 48, 24), new ShaderMaterial({
    uniforms,
    side: BackSide, transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uCenter;
      uniform float uRadius;
      uniform float uIntensity;
      uniform vec3 uInner;
      uniform vec3 uOuter;
      varying vec3 vWorld;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 d = normalize(vWorld - cameraPosition);
        vec3 oc = uCenter - cameraPosition;
        float x = length(oc - d * max(dot(oc, d), 0.0)) / uRadius;
        // bright inner glow hugging the limb plus a faint wide corona; x < 1 is behind the disk
        float h = max(x - 1.0, 0.0);
        float glow = 0.75 * exp(-h * 2.6);
        float corona = 0.07 * exp(-h * 0.5);
        vec3 col = mix(uOuter, uInner, glow / (glow + corona + 1e-4));
        gl_FragColor = vec4(col, clamp((glow + corona) * uIntensity, 0.0, 1.0));
        #include <colorspace_fragment>
      }`,
  }));
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  scene.add(mesh);

  let radius = 1, minPx = 0;
  const camPos = new Vector3();
  const fit = (r: number) => {
    mesh.scale.setScalar(r * HALO_R);
    uniforms.uRadius.value = r;
  };
  // the floor depends on the viewing camera, so it is applied at draw time
  mesh.onBeforeRender = (renderer, _scene, camera) => {
    if (minPx <= 0 || !(camera instanceof PerspectiveCamera)) return;
    const radPerPx = 2 * Math.tan(camera.fov * Math.PI / 360) / renderer.domElement.clientHeight;
    const dist = camera.getWorldPosition(camPos).distanceTo(uniforms.uCenter.value);
    fit(Math.max(radius, minPx * radPerPx * dist));
    mesh.updateMatrixWorld();
  };

  return {
    mesh,
    update(position, r) {
      radius = r;
      fit(r);
      mesh.position.copy(position);
      uniforms.uCenter.value.copy(position);
    },
    setColors(inner, outer) {
      uniforms.uInner.value.set(inner);
      uniforms.uOuter.value.set(outer);
    },
    setIntensity(k) { uniforms.uIntensity.value = k; },
    setMinPixels(px) { minPx = px; },
  };
}

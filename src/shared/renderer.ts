/* One renderer setup for every page: log depth, a capped pixel ratio (`?dpr=`
   overrides), the `?perf` overlay, and a resize hook that keeps the camera's
   aspect in step with the window. */
import { WebGLRenderer, type PerspectiveCamera, type Scene } from 'three';
import { createPerf, type Perf } from './perf';

export interface Stage {
  renderer: WebGLRenderer;
  perf: Perf;
  /** Draw one frame, timed by the perf overlay. */
  render(scene: Scene, camera: PerspectiveCamera): void;
}

export interface StageOptions {
  /** One depth buffer from close-ups to the whole system; costs little. */
  logDepth?: boolean;
}

export function createStage(canvas: HTMLCanvasElement, camera: PerspectiveCamera, opts: StageOptions = {}): Stage {
  const renderer = new WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: opts.logDepth ?? true });
  // retina at 2× costs ~1.8× the fill of 1.5× for little visible gain
  const dprParam = Number(new URLSearchParams(location.search).get('dpr'));
  renderer.setPixelRatio(dprParam > 0 ? dprParam : Math.min(devicePixelRatio, 1.5));
  const perf = createPerf(renderer);

  function resize() {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  return {
    renderer,
    perf,
    render(scene, cam) {
      perf.beforeRender();
      renderer.render(scene, cam);
      perf.afterRender();
    },
  };
}

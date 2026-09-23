/* `?perf` overlay: FPS, CPU ms per frame, GPU ms (timer query where the driver
   exposes it) and renderer.info. Running averages are also on `window.cosmosPerf`
   so they can be sampled by scripts. */
import type { WebGLRenderer } from 'three';

export interface PerfStats {
  fps: number; cpuMs: number; gpuMs: number | null;
  calls: number; triangles: number; points: number; lines: number;
  textures: number; geometries: number; renderer: string;
}

export interface Perf {
  begin(now: number): void;
  beforeRender(): void;
  afterRender(): void;
  end(): void;
}

const NOOP: Perf = { begin() {}, beforeRender() {}, afterRender() {}, end() {} };

interface TimerExt { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

export function createPerf(renderer: WebGLRenderer): Perf {
  if (!new URLSearchParams(location.search).has('perf')) return NOOP;
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererName = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));

  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;right:8px;bottom:84px;z-index:50;margin:0;padding:8px 10px;font:11px/1.45 ui-monospace,monospace;'
    + 'color:#cfe3ff;background:rgba(4,8,18,.8);border:1px solid rgba(120,160,255,.25);border-radius:8px;pointer-events:none;white-space:pre';
  document.body.appendChild(el);

  const stats: PerfStats = { fps: 0, cpuMs: 0, gpuMs: null, calls: 0, triangles: 0, points: 0, lines: 0, textures: 0, geometries: 0, renderer: rendererName };
  (window as unknown as { cosmosPerf: PerfStats }).cosmosPerf = stats;

  const pending: WebGLQuery[] = [];
  let query: WebGLQuery | null = null;
  let t0 = 0, frames = 0, windowStart = performance.now(), cpuAcc = 0, gpuAcc = 0, gpuN = 0;

  function pollQueries() {
    if (!ext) return;
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) { pending.length = 0; return; }
    while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q = pending.shift()!;
      gpuAcc += gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
      gpuN++;
      gl.deleteQuery(q);
    }
  }

  return {
    begin() { t0 = performance.now(); },
    beforeRender() {
      if (ext && pending.length < 4) { query = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, query!); }
    },
    afterRender() {
      if (ext && query) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(query); query = null; }
    },
    end() {
      const now = performance.now();
      cpuAcc += now - t0;
      frames++;
      pollQueries();
      if (now - windowStart < 1000) return;
      const span = (now - windowStart) / 1000;
      const info = renderer.info;
      stats.fps = frames / span;
      stats.cpuMs = cpuAcc / frames;
      stats.gpuMs = gpuN ? gpuAcc / gpuN : null;
      stats.calls = info.render.calls;
      stats.triangles = info.render.triangles;
      stats.points = info.render.points;
      stats.lines = info.render.lines;
      stats.textures = info.memory.textures;
      stats.geometries = info.memory.geometries;
      frames = 0; cpuAcc = 0; gpuAcc = 0; gpuN = 0; windowStart = now;
      el.textContent = [
        `fps   ${stats.fps.toFixed(1)}`,
        `cpu   ${stats.cpuMs.toFixed(2)} ms`,
        `gpu   ${stats.gpuMs === null ? 'n/a' : stats.gpuMs.toFixed(2) + ' ms'}`,
        `calls ${stats.calls}   tris ${stats.triangles.toLocaleString('en-US')}`,
        `pts   ${stats.points.toLocaleString('en-US')}   lines ${stats.lines}`,
        `tex   ${stats.textures}   geo ${stats.geometries}`,
        `dpr   ${renderer.getPixelRatio()}`,
        rendererName.slice(0, 48),
      ].join('\n');
    },
  };
}

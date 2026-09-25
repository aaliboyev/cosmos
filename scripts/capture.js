// Renders a director timeline to video, one frame at a time on a fixed clock:
//   node scripts/capture.js <timeline.ts> [--out demo.mp4] [--size 1920x1080] [--dpr 1] [--fps 60]
//                           [--from s] [--to s] [--hud] [--preview] [--jobs n] [--nvenc] [--png]
// --preview renders a quick draft: 960x540 at 30 fps unless --size/--fps say otherwise.
// --jobs splits the frames into n chunks rendered in parallel. Each chunk steps from frame 0
// without drawing up to its first frame, so its state matches a single continuous render.
// --nvenc encodes on an NVIDIA GPU instead of x264.
// Frames are grabbed as JPEG q95 through the DevTools protocol (PNG encoding was ~95% of the frame
// time); --png grabs lossless frames instead, about 2x slower.
// Starts the dev server, drives headless Chrome, pipes screenshots into ffmpeg.
import { spawn } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string', default: 'demo.mp4' },
    size: { type: 'string' },
    dpr: { type: 'string', default: '1' },
    fps: { type: 'string' },
    from: { type: 'string', default: '0' },
    to: { type: 'string' },
    hud: { type: 'boolean', default: false },
    preview: { type: 'boolean', default: false },
    jobs: { type: 'string', default: '1' },
    nvenc: { type: 'boolean', default: false },
    png: { type: 'boolean', default: false },
  },
});
if (!positionals[0]) {
  console.error('usage: node scripts/capture.js <timeline.ts> [--out file] [--size WxH] [--dpr n] [--fps n] [--from s] [--to s] [--hud] [--preview] [--jobs n] [--nvenc] [--png]');
  process.exit(1);
}
const timeline = '/' + relative(process.cwd(), resolve(positionals[0])).split('\\').join('/');
const [width, height] = (opt.size ?? (opt.preview ? '960x540' : '1920x1080')).split('x').map(Number);
const fps = Number(opt.fps ?? (opt.preview ? 30 : 60)), dpr = Number(opt.dpr);
// consumer NVIDIA drivers cap concurrent NVENC sessions; past the cap an encoder receives nothing
const NVENC_SESSIONS = 8;
const jobs = Math.max(1, Math.min(Number(opt.jobs), opt.nvenc ? NVENC_SESSIONS : Infinity));

// headless Chrome falls back to software GL unless pointed at the platform's GPU backend
const GPU_ARGS = {
  darwin: ['--use-angle=metal'],
  linux: ['--use-angle=vulkan', '--enable-features=Vulkan'],
  win32: ['--use-angle=d3d11'],
}[process.platform] ?? [];

const ENCODE = opt.nvenc
  ? ['-c:v', 'h264_nvenc', '-preset', 'p7', '-tune', 'hq', '-rc', 'vbr', '-cq', '17', '-b:v', '0', '-pix_fmt', 'yuv420p']
  : ['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p'];

const server = await createServer({ logLevel: 'warn', server: { port: 0 } });
await server.listen();
const base = server.resolvedUrls.local[0];
// installed Chrome: the real GPU rather than a bundled build that may fall back to software GL
const browser = await chromium.launch({ channel: 'chrome', args: [...GPU_ARGS, '--ignore-gpu-blocklist', '--enable-gpu'] });

async function openPage() {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr });
  page.on('pageerror', e => console.error('page:', e.message));
  const query = new URLSearchParams({ demo: timeline, capture: '', fps: String(fps), dpr: String(dpr) });
  if (!opt.hud) query.set('clean', '');
  await page.goto(`${base}?${query}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.cosmosCapture);
  return page;
}

const probe = await openPage();
const gpu = await probe.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
const duration = await probe.evaluate(() => window.cosmosCapture.duration);
await probe.close();

const first = Math.round(Number(opt.from) * fps);
const last = Math.round((opt.to ? Number(opt.to) : duration) * fps);
const total = last - first;
console.log(`${gpu} · ${width}x${height}@${dpr}x · ${total} frames (${(total / fps).toFixed(1)} s) · ${jobs} job(s) → ${opt.out}`);

let done = 0;
const started = Date.now();
function progress() {
  const s = (Date.now() - started) / 1000;
  process.stdout.write(`\r${done}/${total} frames · ${s.toFixed(0)} s · ${(done / Math.max(s, 1e-3)).toFixed(1)} fps`);
}

/** Renders frames [a, b) to `file`. */
async function renderChunk(a, b, file) {
  const page = await openPage();
  // reach frame a exactly as a continuous render would, without drawing
  await page.evaluate(n => window.cosmosCapture.skip(n), a);
  const cdp = await page.context().newCDPSession(page);
  const grab = opt.png ? { format: 'png', optimizeForSpeed: true } : { format: 'jpeg', quality: 95, optimizeForSpeed: true };
  const ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', ...ENCODE, file],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const encoded = new Promise(res => ffmpeg.on('close', res));
  for (let i = a; i < b; i++) {
    await page.evaluate(() => window.cosmosCapture.step());
    const { data } = await cdp.send('Page.captureScreenshot', grab);
    if (!ffmpeg.stdin.write(Buffer.from(data, 'base64'))) await new Promise(res => ffmpeg.stdin.once('drain', res));
    done++;
    if (done % fps === 0) progress();
  }
  ffmpeg.stdin.end();
  const code = await encoded;
  await page.close();
  if (code) throw new Error(`ffmpeg exited ${code} for ${file}`);
}

if (jobs === 1) {
  await renderChunk(first, last, opt.out);
} else {
  const size = Math.ceil(total / jobs);
  const parts = Array.from({ length: jobs }, (_, j) => ({
    a: first + j * size, b: Math.min(last, first + (j + 1) * size), file: `${opt.out}.part${j}.mp4`,
  })).filter(p => p.a < p.b);
  await Promise.all(parts.map(p => renderChunk(p.a, p.b, p.file)));
  const list = `${opt.out}.parts.txt`;
  writeFileSync(list, parts.map(p => `file '${resolve(p.file)}'`).join('\n'));
  const code = await new Promise(res => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', opt.out],
    { stdio: 'inherit' }).on('close', res));
  if (code) throw new Error(`concat exited ${code}`);
  for (const f of [list, ...parts.map(p => p.file)]) rmSync(f);
}
progress();
console.log(`\ndone in ${((Date.now() - started) / 1000).toFixed(0)} s`);

await browser.close();
await server.close();

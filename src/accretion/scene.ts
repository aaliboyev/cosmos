/* Accretion renderer (2D canvas, the disk is flat) and loop. The sim lives in sim.ts. */
import { createAccretionSim, stageOf } from './sim';
import { heat, paused, readout, restarts, speed } from './state';

const EARTH = 500;   // mass units per Earth mass, for the readout

export function startAccretion(canvas: HTMLCanvasElement): void {
  const sim = createAccretionSim(heat.get());
  heat.subscribe(h => { sim.heat = h; });

  const ctx = canvas.getContext('2d')!;
  let W = 0, H = 0, zoom = 1;
  function resize() {
    W = canvas.width = innerWidth * devicePixelRatio;
    H = canvas.height = innerHeight * devicePixelRatio;
  }
  addEventListener('resize', resize); resize();
  canvas.addEventListener('wheel', e => {
    zoom = Math.min(3.5, Math.max(0.55, zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
  }, { passive: true });

  const bgStars: [number, number, number][] = [];
  for (let i = 0; i < 260; i++) bgStars.push([Math.random(), Math.random(), Math.random() * .5 + .15]);

  function draw() {
    const { X, Y, M, R, n } = sim;
    ctx.fillStyle = '#04050c';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#5a6488';
    for (const [sx, sy, sa] of bgStars) {
      ctx.globalAlpha = sa;
      ctx.fillRect(sx * W, sy * H, 1.4 * devicePixelRatio, 1.4 * devicePixelRatio);
    }
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(W / 2, H / 2);
    const s = zoom * devicePixelRatio * Math.min(W, H) / (620 * devicePixelRatio);
    ctx.scale(s, s);

    // the star
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 46);
    g.addColorStop(0, 'rgba(255,236,190,1)'); g.addColorStop(.35, 'rgba(255,180,80,.5)'); g.addColorStop(1, 'rgba(255,150,50,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 46, 0, 7); ctx.fill();

    const oligSet = new Set(sim.oligarchs);
    for (let i = 0; i < n; i++) {
      const m = M[i];
      if (m > 400) {          // planet tier: warm, glowing
        const gg = ctx.createRadialGradient(X[i], Y[i], 0, X[i], Y[i], R[i] * 2.4);
        gg.addColorStop(0, 'rgba(255,200,140,.95)'); gg.addColorStop(.5, 'rgba(230,140,90,.5)'); gg.addColorStop(1, 'rgba(230,140,90,0)');
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(X[i], Y[i], R[i] * 2.4, 0, 7); ctx.fill();
      } else if (m > 60) {    // planetesimal tier
        ctx.fillStyle = oligSet.has(i) ? '#e8c9a0' : '#b8a88e';
        ctx.beginPath(); ctx.arc(X[i], Y[i], R[i], 0, 7); ctx.fill();
      } else {                // dust/pebbles
        ctx.fillStyle = 'rgba(150,168,220,.8)';
        ctx.fillRect(X[i] - R[i] / 2, Y[i] - R[i] / 2, R[i], R[i]);
      }
    }
    ctx.restore();
  }

  function publish() {
    const { X, Y, M, n } = sim;
    const top = [...sim.oligarchs].filter(i => i < n).sort((a, b) => M[b] - M[a]).slice(0, 5);
    readout.set({
      time: (sim.elapsed * 2).toFixed(1) + ' Myr',
      count: n,
      biggest: top.length ? (M[top[0]] / EARTH).toFixed(2) + ' M⊕' : '—',
      stage: stageOf(n),
      leaders: top.map(i => ({ massEarth: M[i] / EARTH, r: Math.round(Math.hypot(X[i], Y[i])) })),
    });
  }

  const restart = () => { sim.seed(); sim.findOligarchs(); publish(); };
  let lastRestart = restarts.get();
  restarts.subscribe(k => { if (k !== lastRestart) { lastRestart = k; restart(); } });

  let frame = 0;
  function loop() {
    requestAnimationFrame(loop);
    if (!paused.get()) {
      const steps = speed.get();
      for (let i = 0; i < steps; i++) sim.step();
      if (frame % 20 === 0) sim.findOligarchs();
      if (frame % 10 === 0) publish();
      frame++;
    }
    draw();
  }
  restart();
  loop();
}

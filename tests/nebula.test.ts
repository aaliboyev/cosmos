import { describe, expect, it } from 'vitest';
import { kernelW } from '../src/nebula/physics/kernel';
import { createOctree } from '../src/nebula/physics/octree';
import { createCloud } from '../src/nebula/physics/sim';

describe('SPH kernel', () => {
  it('integrates to 1 over its support', () => {
    for (const h of [0.01, 1, 3]) {
      let s = 0;
      const n = 4000, dr = 2 * h / n;
      for (let k = 0; k < n; k++) { const r = (k + 0.5) * dr; s += kernelW(r, h) * 4 * Math.PI * r * r * dr; }
      expect(s).toBeCloseTo(1, 4);
    }
  });
});

describe('Barnes-Hut octree', () => {
  it('matches direct summation to < 1% rms on a clumpy distribution', () => {
    const n = 3000;
    const x = new Float64Array(n), y = new Float64Array(n), z = new Float64Array(n), m = new Float64Array(n);
    const ids = new Int32Array(n);
    let a = 12345;
    const rnd = () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; };
    for (let i = 0; i < n; i++) {
      // a sphere plus a dense clump and a thin disk
      const kind = i % 3, u = rnd(), v = rnd() * 2 * Math.PI, w = Math.acos(2 * rnd() - 1);
      const r = kind === 1 ? 0.05 * Math.cbrt(u) : Math.cbrt(u);
      x[i] = r * Math.sin(w) * Math.cos(v) + (kind === 1 ? 0.3 : 0);
      y[i] = kind === 2 ? (rnd() - 0.5) * 0.02 : r * Math.cos(w);
      z[i] = r * Math.sin(w) * Math.sin(v);
      m[i] = 1 / n; ids[i] = i;
    }
    const tree = createOctree(n);
    tree.build(x, y, z, m, ids, n);
    const eps2 = 1e-6;
    const gx_ = new Float64Array(n), gy_ = new Float64Array(n), gz_ = new Float64Array(n), gp = new Float64Array(n);
    const L = tree.groups();
    for (let l = 0; l < L.n; l++) tree.gravityGroup(l, 0.7, eps2, gx_, gy_, gz_, gp);
    const out = new Float64Array(4);
    let err2 = 0, ref2 = 0, errWalk2 = 0;
    for (let i = 0; i < n; i += 7) {
      tree.gravity(x[i], y[i], z[i], i, 0.6, eps2, out);
      let gx = 0, gy = 0, gz = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const dx = x[i] - x[j], dy = y[i] - y[j], dz = z[i] - z[j];
        const s2 = dx * dx + dy * dy + dz * dz + eps2, f = m[j] / (s2 * Math.sqrt(s2));
        gx -= f * dx; gy -= f * dy; gz -= f * dz;
      }
      err2 += (gx_[i] - gx) ** 2 + (gy_[i] - gy) ** 2 + (gz_[i] - gz) ** 2;
      errWalk2 += (out[0] - gx) ** 2 + (out[1] - gy) ** 2 + (out[2] - gz) ** 2;
      ref2 += gx * gx + gy * gy + gz * gz;
    }
    expect(Math.sqrt(err2 / ref2)).toBeLessThan(0.01);       // group walk, as the sim uses
    expect(Math.sqrt(errWalk2 / ref2)).toBeLessThan(0.01);   // single-point walk
  });
});

describe('collapsing cloud', () => {
  it('conserves momentum and angular momentum over many steps', () => {
    const cloud = createCloud({ n: 1500, rotation: 0.04, turbulence: 0.05, seed: 3 });
    for (let k = 0; k < 60; k++) cloud.step();
    const s = cloud.stats();
    expect(s.momentum).toBeLessThan(2e-3);
    expect(s.angMomDrift).toBeLessThan(0.02);
  });

  it('flattens when it spins', () => {
    const cloud = createCloud({ n: 2000, rotation: 0.06, turbulence: 0, seed: 5 });
    const start = cloud.stats().flatness;
    let guard = 0;
    while (cloud.t < 1.4 && guard++ < 20000) cloud.step();
    const end = cloud.stats();
    expect(start).toBeGreaterThan(0.9);
    expect(end.flatness).toBeLessThan(0.6);
  }, 120000);
});

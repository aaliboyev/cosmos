import { describe, expect, it } from 'vitest';
import { G, M_EARTH, SNOW_LINE, captureRadius, createDisk, elementsOf, iceFractionAt, physicalRadius } from '../src/accretion/physics';

const circular = (r: number, m: number, phase = 0) => {
  const v = Math.sqrt(G * (1 + m) / r);
  // prograde about +y: velocity = ŷ × r
  return { x: r * Math.cos(phase), y: 0, z: r * Math.sin(phase), vx: v * Math.sin(phase), vy: 0, vz: -v * Math.cos(phase), m };
};

const totalP = (d: ReturnType<typeof createDisk>) => d.momentum();

describe('accretion physics', () => {
  it('keeps a two-body orbit bounded in energy over many orbits', () => {
    const d = createDisk({ n: 1, embryos: 4 });
    d.setGasOff();
    d.reset([{ ...circular(1, M_EARTH), vz: -Math.sqrt(G * (1 + M_EARTH)) * 1.05 }]);
    // leapfrog: the energy error oscillates but does not grow
    let early = 0, late = 0;
    for (let k = 0; k < 12000; k++) {
      d.step();
      if (k % 50 !== 0) continue;
      const err = Math.abs(d.conservation().dE);
      if (k < 6000) early = Math.max(early, err); else late = Math.max(late, err);
    }
    expect(early).toBeLessThan(5e-4);
    expect(late).toBeLessThan(early * 1.5);
    expect(d.conservation().dL).toBeLessThan(1e-10);
  });

  it('conserves momentum through a merger', () => {
    const d = createDisk({ n: 2 });
    d.setGasOff();
    const a = circular(1, 0.1 * M_EARTH), b = { ...circular(1.00001, 0.05 * M_EARTH, 0.00001), vx: 0.001 };
    d.reset([a, b]);
    const p0 = totalP(d);
    d.resolve(0, 1);
    expect(d.n).toBe(1);
    const p1 = totalP(d);
    for (let k = 0; k < 3; k++) expect(Math.abs(p1[k] - p0[k])).toBeLessThan(1e-18);
    expect(d.arrays.m[0]).toBeCloseTo(0.15 * M_EARTH, 20);
  });

  it('conserves mass, momentum and centre of mass through a fragmenting impact', () => {
    const d = createDisk({ n: 2 });
    d.setGasOff();
    const a = circular(1, 0.5 * M_EARTH), b = { ...circular(1.00002, 0.4 * M_EARTH), vx: 6 };   // ≈ 28 km/s, above 2 v_esc
    d.reset([a, b]);
    const p0 = totalP(d);
    const { x, z, m } = d.arrays;
    const cm0 = (m[0] * x[0] + m[1] * x[1]) / (m[0] + m[1]), cz0 = (m[0] * z[0] + m[1] * z[1]) / (m[0] + m[1]);
    d.resolve(0, 1);
    expect(d.n).toBeGreaterThan(1);
    let mt = 0, cx = 0, cz = 0;
    for (let i = 0; i < d.n; i++) { mt += m[i]; cx += m[i] * x[i]; cz += m[i] * z[i]; }
    expect(mt / M_EARTH).toBeCloseTo(0.9, 12);
    expect(cx / mt).toBeCloseTo(cm0, 12);
    expect(cz / mt).toBeCloseTo(cz0, 12);
    const p1 = totalP(d);
    for (let k = 0; k < 3; k++) expect(Math.abs(p1[k] - p0[k])).toBeLessThan(1e-16);
  });

  it('seeds rock inside the snow line and ice-rich solids beyond it', () => {
    const d = createDisk({ n: 2000 });
    const { x, z, ice, m } = d.arrays;
    let inside = 0, outside = 0, mIn = 0, mOut = 0, nIn = 0, nOut = 0;
    for (let i = 0; i < d.n; i++) {
      const r = Math.hypot(x[i], z[i]);
      if (r < SNOW_LINE * 0.9) { inside = Math.max(inside, ice[i]); if (r > 2) { mIn += m[i]; nIn++; } }
      if (r > SNOW_LINE * 1.1) { outside = Math.min(outside || 1, ice[i]); if (r < 3.5) { mOut += m[i]; nOut++; } }
    }
    expect(inside).toBe(0);
    expect(outside).toBeCloseTo(iceFractionAt(5), 6);
    // the solid surface density jumps by ~4× across the line
    expect((mOut / nOut) / (mIn / nIn)).toBeGreaterThan(3);
    // ice lowers bulk density, so an icy body is larger at the same mass
    expect(physicalRadius(M_EARTH, 0.76)).toBeGreaterThan(physicalRadius(M_EARTH, 0));
  });

  it('finds a big body\'s collisions across cell boundaries, including around the origin', () => {
    const d = createDisk({ n: 3, embryos: 1, inflate: 300 });
    d.setGasOff();
    // a large embryo whose inflated radius spans several 0.04 AU cells, and a small body
    // inside that radius but in another cell
    const big = circular(1.0, 30 * M_EARTH);
    const small = { ...circular(1.0, 1e-3 * M_EARTH, 0), x: 1.0 + d.params.inflate * physicalRadius(30 * M_EARTH, 0) * 0.9 };
    d.reset([big, small]);
    expect(d.arrays.rad[0]).toBeGreaterThan(0.04);
    d.collide();
    expect(d.n).toBe(1);

    // two small bodies straddling x = 0 (truncating toward zero used to merge those cells wrongly)
    const e = createDisk({ n: 2, embryos: 0 });
    e.setGasOff();
    const p = { x: -0.0004, y: 0, z: 1, vx: 0, vy: 0, vz: 0, m: 1e-3 * M_EARTH };
    e.reset([p, { ...p, x: 0.0004 }]);
    e.collide();
    expect(e.n).toBe(1);
  });

  it('enlarges the capture radius by gravitational focusing when encounters are slow', () => {
    const rSum = 1e-3, mSum = 2 * M_EARTH;
    const fast = captureRadius(rSum, mSum, 10, false, 1);
    const slow = captureRadius(rSum, mSum, 1e-4, false, 1);
    expect(fast).toBeGreaterThan(rSum);
    expect(slow).toBeGreaterThan(fast);
    expect(captureRadius(rSum, mSum, 1e-4, true, 1)).toBe(rSum);
    // capped at the mutual Hill radius
    expect(captureRadius(rSum, mSum, 1e-12, false, 0.01)).toBe(0.01);
  });

  it('keeps momentum balanced while a giant core accretes gas', () => {
    const d = createDisk({ n: 2, embryos: 4 });
    d.reset([circular(5, 12 * M_EARTH), circular(5.6, 0.5 * M_EARTH, 1)]);
    const m0 = d.arrays.m[0];
    for (let k = 0; k < 400; k++) d.step();
    expect(d.arrays.m[0]).toBeGreaterThan(m0 * 1.01);
    expect(d.arrays.gas[0]).toBeGreaterThan(0);
    const c = d.conservation();
    expect(c.dP).toBeLessThan(1e-12);
    expect(c.dL).toBeLessThan(1e-10);
  });

  it('recovers orbital elements', () => {
    const el = elementsOf(1, 0, 0, 0, 2 * Math.PI * 1.1, 0, G);
    expect(el.a).toBeGreaterThan(1);
    expect(el.e).toBeCloseTo(0.21, 2);
    expect(el.i).toBeCloseTo(0, 9);
  });
});

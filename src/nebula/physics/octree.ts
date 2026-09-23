/* Barnes-Hut octree over the gas: monopole + quadrupole moments for gravity, and
   the same boxes for gather-radius neighbour search, which suits smoothing
   lengths that span two orders of magnitude between the envelope and the core. */

const LEAF = 8;
const GROUP = 48;     // particles sharing one interaction list / neighbour gather
const MAX_DEPTH = 48;

export interface Octree {
  /** `h` (optional) enables `neighboursSym`: per-node maximum smoothing length. */
  build(x: Float64Array, y: Float64Array, z: Float64Array, m: Float64Array, ids: Int32Array, n: number, h?: Float64Array): void;
  /** Acceleration and potential at a point from all gas except `self`; writes into `out` [ax, ay, az, phi]. */
  gravity(px: number, py: number, pz: number, self: number, theta: number, eps2: number, out: Float64Array): void;
  /** Group node ids (≤ GROUP particles each, covering all particles); a group's particles are `order()[start[id] .. start[id] + count[id])`. */
  groups(): { ids: Int32Array; start: Int32Array; count: Int32Array; n: number };
  /** Leaf node ids, same layout as `groups()`. */
  leaves(): { ids: Int32Array; start: Int32Array; count: Int32Array; n: number };
  order(): Int32Array;
  /** Gravity on every particle of the `l`-th group from one shared interaction list; adds into the arrays. */
  gravityGroup(l: number, theta: number, eps2: number,
    ax: Float64Array, ay: Float64Array, az: Float64Array, phi: Float64Array, active?: Uint8Array): void;
  /** Particles within `radius` of the `l`-th leaf's particle bounds; returns the count. */
  leafCandidates(l: number, radius: number, outIdx: Int32Array): number;
  /** Particles j with r < 2·max(hi, h_j): the gather and scatter neighbours SPH forces need. */
  neighboursSym(px: number, py: number, pz: number, hi: number, outIdx: Int32Array, outR2: Float64Array): number;
  /** Writes indices and squared distances of every particle within `radius` of the point; returns the count.
      The buffers must hold every particle. */
  neighbours(px: number, py: number, pz: number, radius: number, outIdx: Int32Array, outR2: Float64Array): number;
}

export function createOctree(capacity: number): Octree {
  let cap = 0;
  let cx!: Float64Array, cy!: Float64Array, cz!: Float64Array, hs!: Float64Array;
  let mass!: Float64Array, mx!: Float64Array, my!: Float64Array, mz!: Float64Array;
  let q!: Float64Array;                 // 6 per node: xx yy zz xy xz yz (traceless ×3 form)
  let child!: Int32Array;               // first of 8 consecutive children, −1 for a leaf
  let hmax!: Float64Array;
  let start!: Int32Array, count!: Int32Array;
  let nodes = 0;
  /** Node ids with tight particle bounds (centre and half-extent per axis). */
  interface BoxList { ids: Int32Array; n: number; bx: Float64Array; by: Float64Array; bz: Float64Array; ex: Float64Array; ey: Float64Array; ez: Float64Array }
  const boxList = (): BoxList => ({ ids: new Int32Array(1024), n: 0,
    bx: new Float64Array(1024), by: new Float64Array(1024), bz: new Float64Array(1024),
    ex: new Float64Array(1024), ey: new Float64Array(1024), ez: new Float64Array(1024) });
  const groupBox = boxList(), leafBox = boxList();

  function grow(n: number) {
    const old = { cx, cy, cz, hs, mass, mx, my, mz, q, child, start, count, hmax };
    cap = n;
    cx = new Float64Array(n); cy = new Float64Array(n); cz = new Float64Array(n); hs = new Float64Array(n);
    mass = new Float64Array(n); mx = new Float64Array(n); my = new Float64Array(n); mz = new Float64Array(n);
    q = new Float64Array(n * 6); child = new Int32Array(n); start = new Int32Array(n); count = new Int32Array(n);
    hmax = new Float64Array(n);
    if (old.cx) {
      cx.set(old.cx); cy.set(old.cy); cz.set(old.cz); hs.set(old.hs); mass.set(old.mass);
      mx.set(old.mx); my.set(old.my); mz.set(old.mz); q.set(old.q); child.set(old.child);
      start.set(old.start); count.set(old.count); hmax.set(old.hmax);
    }
  }
  grow(Math.max(64, capacity));

  let X!: Float64Array, Y!: Float64Array, Z!: Float64Array, M!: Float64Array, H: Float64Array | undefined;
  let perm = new Int32Array(0), tmp = new Int32Array(0);
  const oct = new Int32Array(8), off = new Int32Array(8);
  const boundsAt = new Int32Array((MAX_DEPTH + 1) * 9);

  function alloc(k: number): number {
    if (nodes + k > cap) grow(Math.ceil((nodes + k) * 1.5));
    const i = nodes; nodes += k; return i;
  }

  function register(L: BoxList, node: number, s: number, e: number) {
    if (L.n === L.ids.length) {
      const g2 = (a: Float64Array) => { const g = new Float64Array(L.n * 2); g.set(a); return g; };
      const g = new Int32Array(L.n * 2); g.set(L.ids); L.ids = g;
      L.bx = g2(L.bx); L.by = g2(L.by); L.bz = g2(L.bz); L.ex = g2(L.ex); L.ey = g2(L.ey); L.ez = g2(L.ez);
    }
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let k = s; k < e; k++) {
      const j = perm[k];
      if (X[j] < x0) x0 = X[j]; if (X[j] > x1) x1 = X[j];
      if (Y[j] < y0) y0 = Y[j]; if (Y[j] > y1) y1 = Y[j];
      if (Z[j] < z0) z0 = Z[j]; if (Z[j] > z1) z1 = Z[j];
    }
    const i = L.n++;
    L.bx[i] = (x0 + x1) / 2; L.by[i] = (y0 + y1) / 2; L.bz[i] = (z0 + z1) / 2;
    L.ex[i] = (x1 - x0) / 2; L.ey[i] = (y1 - y0) / 2; L.ez[i] = (z1 - z0) / 2;
    L.ids[i] = node;
  }

  function buildNode(node: number, s: number, e: number, ncx: number, ncy: number, ncz: number, h: number, depth: number, inGroup: boolean) {
    cx[node] = ncx; cy[node] = ncy; cz[node] = ncz; hs[node] = h;
    start[node] = s; count[node] = e - s;
    if (!inGroup && e > s && (e - s <= GROUP || depth >= MAX_DEPTH)) { register(groupBox, node, s, e); inGroup = true; }
    if (e - s <= LEAF || depth >= MAX_DEPTH) {
      child[node] = -1;
      if (e > s) register(leafBox, node, s, e);
      let m = 0, sx = 0, sy = 0, sz = 0;
      for (let k = s; k < e; k++) { const j = perm[k], w = M[j]; m += w; sx += w * X[j]; sy += w * Y[j]; sz += w * Z[j]; }
      mass[node] = m;
      if (m > 0) { sx /= m; sy /= m; sz /= m; }
      mx[node] = sx; my[node] = sy; mz[node] = sz;
      let hm = 0;
      if (H) for (let k = s; k < e; k++) if (H[perm[k]] > hm) hm = H[perm[k]];
      hmax[node] = hm;
      let xx = 0, yy = 0, zz = 0, xy = 0, xz = 0, yz = 0;
      for (let k = s; k < e; k++) {
        const j = perm[k], w = M[j], dx = X[j] - sx, dy = Y[j] - sy, dz = Z[j] - sz, r2 = dx * dx + dy * dy + dz * dz;
        xx += w * (3 * dx * dx - r2); yy += w * (3 * dy * dy - r2); zz += w * (3 * dz * dz - r2);
        xy += w * 3 * dx * dy; xz += w * 3 * dx * dz; yz += w * 3 * dy * dz;
      }
      const o = node * 6;
      q[o] = xx; q[o + 1] = yy; q[o + 2] = zz; q[o + 3] = xy; q[o + 4] = xz; q[o + 5] = yz;
      return;
    }
    oct.fill(0);
    for (let k = s; k < e; k++) {
      const j = perm[k];
      oct[(X[j] >= ncx ? 1 : 0) | (Y[j] >= ncy ? 2 : 0) | (Z[j] >= ncz ? 4 : 0)]++;
    }
    let acc = s;
    for (let c = 0; c < 8; c++) { off[c] = acc; acc += oct[c]; }
    const b = depth * 9;
    for (let c = 0; c < 8; c++) boundsAt[b + c] = off[c];
    boundsAt[b + 8] = e;
    for (let k = s; k < e; k++) {
      const j = perm[k];
      tmp[off[(X[j] >= ncx ? 1 : 0) | (Y[j] >= ncy ? 2 : 0) | (Z[j] >= ncz ? 4 : 0)]++] = j;
    }
    for (let k = s; k < e; k++) perm[k] = tmp[k];
    const first = alloc(8);
    child[node] = first;
    const h2 = h / 2;
    for (let c = 0; c < 8; c++) {
      buildNode(first + c, boundsAt[b + c], boundsAt[b + c + 1],
        ncx + (c & 1 ? h2 : -h2), ncy + (c & 2 ? h2 : -h2), ncz + (c & 4 ? h2 : -h2), h2, depth + 1, inGroup);
    }
    // combine children moments about this node's centre of mass
    let m = 0, sx = 0, sy = 0, sz = 0, hm = 0;
    for (let c = 0; c < 8; c++) if (hmax[first + c] > hm) hm = hmax[first + c];
    hmax[node] = hm;
    for (let c = 0; c < 8; c++) { const k = first + c, w = mass[k]; m += w; sx += w * mx[k]; sy += w * my[k]; sz += w * mz[k]; }
    mass[node] = m;
    if (m > 0) { sx /= m; sy /= m; sz /= m; }
    mx[node] = sx; my[node] = sy; mz[node] = sz;
    const o = node * 6;
    let xx = 0, yy = 0, zz = 0, xy = 0, xz = 0, yz = 0;
    for (let c = 0; c < 8; c++) {
      const k = first + c, w = mass[k];
      if (w === 0) continue;
      const ok = k * 6, dx = mx[k] - sx, dy = my[k] - sy, dz = mz[k] - sz, r2 = dx * dx + dy * dy + dz * dz;
      xx += q[ok] + w * (3 * dx * dx - r2); yy += q[ok + 1] + w * (3 * dy * dy - r2); zz += q[ok + 2] + w * (3 * dz * dz - r2);
      xy += q[ok + 3] + w * 3 * dx * dy; xz += q[ok + 4] + w * 3 * dx * dz; yz += q[ok + 5] + w * 3 * dy * dz;
    }
    q[o] = xx; q[o + 1] = yy; q[o + 2] = zz; q[o + 3] = xy; q[o + 4] = xz; q[o + 5] = yz;
  }

  let stack = new Int32Array(1024);
  let farList = new Int32Array(1024), nearList = new Int32Array(1024);

  return {
    build(x, y, z, m, ids, n, smoothing) {
      X = x; Y = y; Z = z; M = m; H = smoothing;
      if (perm.length < n) { perm = new Int32Array(n); tmp = new Int32Array(n); }
      let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let k = 0; k < n; k++) {
        const j = ids[k]; perm[k] = j;
        if (x[j] < minX) minX = x[j]; if (x[j] > maxX) maxX = x[j];
        if (y[j] < minY) minY = y[j]; if (y[j] > maxY) maxY = y[j];
        if (z[j] < minZ) minZ = z[j]; if (z[j] > maxZ) maxZ = z[j];
      }
      if (n === 0) { minX = minY = minZ = -1; maxX = maxY = maxZ = 1; }
      const half = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 2 * 1.0001 + 1e-9;
      nodes = 0; groupBox.n = 0; leafBox.n = 0;
      alloc(1);
      buildNode(0, 0, n, (minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2, half, 0, false);
      if (stack.length < nodes) stack = new Int32Array(nodes);
    },

    gravity(px, py, pz, self, theta, eps2, out) {
      let ax = 0, ay = 0, az = 0, phi = 0, sp = 0;
      const th2 = theta * theta;
      stack[sp++] = 0;
      while (sp > 0) {
        const nd = stack[--sp];
        if (mass[nd] === 0) continue;
        const dx = px - mx[nd], dy = py - my[nd], dz = pz - mz[nd];
        const r2 = dx * dx + dy * dy + dz * dz;
        const size = 2 * hs[nd];
        const inside = Math.abs(px - cx[nd]) <= hs[nd] && Math.abs(py - cy[nd]) <= hs[nd] && Math.abs(pz - cz[nd]) <= hs[nd];
        if (child[nd] >= 0 && (inside || size * size >= th2 * r2)) {
          const f = child[nd];
          if (sp + 8 > stack.length) { const s2 = new Int32Array(stack.length * 2); s2.set(stack); stack = s2; }
          for (let c = 0; c < 8; c++) stack[sp++] = f + c;
          continue;
        }
        if (child[nd] < 0 && (inside || size * size >= th2 * r2)) {
          for (let k = start[nd], e = start[nd] + count[nd]; k < e; k++) {
            const j = perm[k];
            if (j === self) continue;
            const ex = px - X[j], ey = py - Y[j], ez = pz - Z[j];
            const s2 = ex * ex + ey * ey + ez * ez + eps2;
            const inv = 1 / Math.sqrt(s2), w = M[j] * inv;
            const f = w * inv * inv;
            ax -= f * ex; ay -= f * ey; az -= f * ez; phi -= w;
          }
          continue;
        }
        // far node: monopole (softened) + quadrupole
        const s2 = r2 + eps2, inv = 1 / Math.sqrt(s2), m = mass[nd];
        const f = m * inv * inv * inv;
        ax -= f * dx; ay -= f * dy; az -= f * dz; phi -= m * inv;
        const o = nd * 6;
        const qx = q[o] * dx + q[o + 3] * dy + q[o + 4] * dz;
        const qy = q[o + 3] * dx + q[o + 1] * dy + q[o + 5] * dz;
        const qz = q[o + 4] * dx + q[o + 5] * dy + q[o + 2] * dz;
        const dqd = dx * qx + dy * qy + dz * qz;
        const inv2 = inv * inv, inv5 = inv2 * inv2 * inv, inv7 = inv5 * inv2;
        ax += qx * inv5 - 2.5 * dqd * dx * inv7;
        ay += qy * inv5 - 2.5 * dqd * dy * inv7;
        az += qz * inv5 - 2.5 * dqd * dz * inv7;
        phi -= 0.5 * dqd * inv5;
      }
      out[0] = ax; out[1] = ay; out[2] = az; out[3] = phi;
    },

    groups: () => ({ ids: groupBox.ids, start, count, n: groupBox.n }),
    leaves: () => ({ ids: leafBox.ids, start, count, n: leafBox.n }),
    order: () => perm,

    gravityGroup(l, theta, eps2, gax, gay, gaz, gphi, active) {
      // interaction list for the group's particle bounds: far nodes by moments, near leaves particle by particle
      const B = groupBox, group = B.ids[l];
      const lx = B.bx[l], ly = B.by[l], lz = B.bz[l], lhx = B.ex[l], lhy = B.ey[l], lhz = B.ez[l];
      const th2 = theta * theta;
      let nf = 0, nn = 0, sp = 0;
      stack[sp++] = 0;
      while (sp > 0) {
        const nd = stack[--sp];
        if (mass[nd] === 0) continue;
        // distance from the node's centre of mass to the nearest point of the leaf box
        const ox = Math.max(0, Math.abs(mx[nd] - lx) - lhx);
        const oy = Math.max(0, Math.abs(my[nd] - ly) - lhy);
        const oz = Math.max(0, Math.abs(mz[nd] - lz) - lhz);
        const d2 = ox * ox + oy * oy + oz * oz;
        const size = 2 * hs[nd];
        const overlap = Math.abs(cx[nd] - lx) < hs[nd] + lhx && Math.abs(cy[nd] - ly) < hs[nd] + lhy && Math.abs(cz[nd] - lz) < hs[nd] + lhz;
        if (!overlap && size * size < th2 * d2) {
          if (nf === farList.length) { const g = new Int32Array(nf * 2); g.set(farList); farList = g; }
          farList[nf++] = nd;
        } else if (child[nd] >= 0) {
          const f = child[nd];
          if (sp + 8 > stack.length) { const s2 = new Int32Array(stack.length * 2); s2.set(stack); stack = s2; }
          for (let c = 0; c < 8; c++) stack[sp++] = f + c;
        } else {
          for (let k = start[nd], e = start[nd] + count[nd]; k < e; k++) {
            if (nn === nearList.length) { const g = new Int32Array(nn * 2); g.set(nearList); nearList = g; }
            nearList[nn++] = perm[k];
          }
        }
      }
      for (let k = start[group], e = start[group] + count[group]; k < e; k++) {
        if (active && !active[perm[k]]) continue;
        const i = perm[k], px = X[i], py = Y[i], pz = Z[i];
        let ax = 0, ay = 0, az = 0, phi = 0;
        for (let u = 0; u < nn; u++) {
          const j = nearList[u];
          if (j === i) continue;
          const ex = px - X[j], ey = py - Y[j], ez = pz - Z[j];
          const s2 = ex * ex + ey * ey + ez * ez + eps2;
          const inv = 1 / Math.sqrt(s2), w = M[j] * inv, f = w * inv * inv;
          ax -= f * ex; ay -= f * ey; az -= f * ez; phi -= w;
        }
        for (let u = 0; u < nf; u++) {
          const nd = farList[u];
          const dx = px - mx[nd], dy = py - my[nd], dz = pz - mz[nd];
          const s2 = dx * dx + dy * dy + dz * dz + eps2, inv = 1 / Math.sqrt(s2), m = mass[nd];
          const f = m * inv * inv * inv;
          ax -= f * dx; ay -= f * dy; az -= f * dz; phi -= m * inv;
          const o = nd * 6;
          const qx = q[o] * dx + q[o + 3] * dy + q[o + 4] * dz;
          const qy = q[o + 3] * dx + q[o + 1] * dy + q[o + 5] * dz;
          const qz = q[o + 4] * dx + q[o + 5] * dy + q[o + 2] * dz;
          const dqd = dx * qx + dy * qy + dz * qz;
          const inv2 = inv * inv, inv5 = inv2 * inv2 * inv, inv7 = inv5 * inv2;
          ax += qx * inv5 - 2.5 * dqd * dx * inv7;
          ay += qy * inv5 - 2.5 * dqd * dy * inv7;
          az += qz * inv5 - 2.5 * dqd * dz * inv7;
          phi -= 0.5 * dqd * inv5;
        }
        gax[i] += ax; gay[i] += ay; gaz[i] += az; gphi[i] += phi;
      }
    },

    leafCandidates(l, radius, outIdx) {
      const B = leafBox;
      const lx = B.bx[l], ly = B.by[l], lz = B.bz[l], rx = B.ex[l] + radius, ry = B.ey[l] + radius, rz = B.ez[l] + radius;
      let sp = 0, n = 0;
      stack[sp++] = 0;
      while (sp > 0) {
        const nd = stack[--sp];
        if (count[nd] === 0) continue;
        const h = hs[nd];
        if (Math.abs(cx[nd] - lx) > h + rx || Math.abs(cy[nd] - ly) > h + ry || Math.abs(cz[nd] - lz) > h + rz) continue;
        if (child[nd] >= 0) {
          const f = child[nd];
          if (sp + 8 > stack.length) { const s2 = new Int32Array(stack.length * 2); s2.set(stack); stack = s2; }
          for (let c = 0; c < 8; c++) stack[sp++] = f + c;
          continue;
        }
        for (let k = start[nd], e = start[nd] + count[nd]; k < e; k++) {
          const j = perm[k];
          if (Math.abs(X[j] - lx) <= rx && Math.abs(Y[j] - ly) <= ry && Math.abs(Z[j] - lz) <= rz) outIdx[n++] = j;
        }
      }
      return n;
    },

    neighboursSym(px, py, pz, hi, outIdx, outR2) {
      let sp = 0, n = 0;
      const H_ = H!;
      stack[sp++] = 0;
      while (sp > 0) {
        const nd = stack[--sp];
        if (count[nd] === 0) continue;
        const reach = 2 * Math.max(hi, hmax[nd]);
        const h = hs[nd];
        const ox = Math.max(0, Math.abs(px - cx[nd]) - h);
        const oy = Math.max(0, Math.abs(py - cy[nd]) - h);
        const oz = Math.max(0, Math.abs(pz - cz[nd]) - h);
        if (ox * ox + oy * oy + oz * oz > reach * reach) continue;
        if (child[nd] >= 0) {
          const f = child[nd];
          if (sp + 8 > stack.length) { const s2 = new Int32Array(stack.length * 2); s2.set(stack); stack = s2; }
          for (let c = 0; c < 8; c++) stack[sp++] = f + c;
          continue;
        }
        for (let k = start[nd], e = start[nd] + count[nd]; k < e; k++) {
          const j = perm[k];
          const ex_ = X[j] - px, ey_ = Y[j] - py, ez_ = Z[j] - pz;
          const r2 = ex_ * ex_ + ey_ * ey_ + ez_ * ez_;
          const rr = 2 * Math.max(hi, H_[j]);
          if (r2 < rr * rr) { outIdx[n] = j; outR2[n] = r2; n++; }
        }
      }
      return n;
    },

    neighbours(px, py, pz, radius, outIdx, outR2) {
      const r2max = radius * radius;
      let sp = 0, n = 0;
      stack[sp++] = 0;
      while (sp > 0) {
        const nd = stack[--sp];
        if (count[nd] === 0) continue;
        const h = hs[nd];
        const ox = Math.max(0, Math.abs(px - cx[nd]) - h);
        const oy = Math.max(0, Math.abs(py - cy[nd]) - h);
        const oz = Math.max(0, Math.abs(pz - cz[nd]) - h);
        if (ox * ox + oy * oy + oz * oz > r2max) continue;
        if (child[nd] >= 0) {
          const f = child[nd];
          if (sp + 8 > stack.length) { const s2 = new Int32Array(stack.length * 2); s2.set(stack); stack = s2; }
          for (let c = 0; c < 8; c++) stack[sp++] = f + c;
          continue;
        }
        for (let k = start[nd], e = start[nd] + count[nd]; k < e; k++) {
          const j = perm[k];
          const ex = X[j] - px, ey = Y[j] - py, ez = Z[j] - pz;
          const r2 = ex * ex + ey * ey + ez * ez;
          if (r2 < r2max) { outIdx[n] = j; outR2[n] = r2; n++; }
        }
      }
      return n;
    },
  };
}

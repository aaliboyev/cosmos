/* Cubic spline (M4) kernel in 3D with support radius 2h. */

const SIGMA = 1 / Math.PI;

export function kernelW(r: number, h: number): number {
  const q = r / h;
  const s = SIGMA / (h * h * h);
  if (q < 1) return s * (1 - 1.5 * q * q + 0.75 * q * q * q);
  if (q < 2) { const t = 2 - q; return s * 0.25 * t * t * t; }
  return 0;
}

/** dW/dr (≤ 0). */
export function kernelDW(r: number, h: number): number {
  const q = r / h;
  const s = SIGMA / (h * h * h * h);
  if (q < 1) return s * (-3 * q + 2.25 * q * q);
  if (q < 2) { const t = 2 - q; return -s * 0.75 * t * t; }
  return 0;
}

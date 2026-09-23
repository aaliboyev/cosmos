export const DEG = Math.PI / 180;

export const julianDate = (ms: number): number => ms / 86400000 + 2440587.5;

/** Julian centuries since J2000.0 */
export const centuries = (ms: number): number => (julianDate(ms) - 2451545.0) / 36525;

export const normDeg = (a: number): number => {
  a %= 360;
  return a < 0 ? a + 360 : a;
};

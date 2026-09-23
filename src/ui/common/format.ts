const C_KMS = 299792.458;
const AU_KM = 149597870.7;

export function speed(kms: number): string {
  if (kms >= C_KMS * 0.001) return (kms / C_KMS).toFixed(kms >= C_KMS * 0.1 ? 2 : 3) + ' c';
  if (kms >= 1000) return Math.round(kms).toLocaleString('en-US') + ' km/s';
  return kms.toFixed(kms < 10 ? 2 : 0) + ' km/s';
}

export function distance(au: number): string {
  if (au < 0.01) return Math.round(au * AU_KM).toLocaleString('en-US') + ' km';
  return au.toFixed(au < 10 ? 3 : 1) + ' AU';
}

export const deg = (d: number) => String(((Math.round(d) % 360) + 360) % 360).padStart(3, '0');

export function signed(d: number): string {
  const r = Math.round(d);
  return (r < 0 ? '−' : '+') + String(Math.abs(r)).padStart(2, '0');
}

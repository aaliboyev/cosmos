/* Code units: G = 1, cloud mass M = 1 (1 M☉), initial cloud radius R0 = 1.
   Physical scale: R0 = 5000 AU, so one time unit is R0^1.5 / 2π years and one
   velocity unit is the circular speed at R0 (29.8 km/s / √R0[AU]). */

export const R0_AU = 5000;
export const YEAR_PER_T = Math.pow(R0_AU, 1.5) / (2 * Math.PI);
export const KMS_PER_V = 29.78 / Math.sqrt(R0_AU);
/** Free-fall time of a uniform sphere: π/2 · √(R³ / 2GM). */
export const T_FF = (Math.PI / (2 * Math.SQRT2));

/** Isothermal sound speed of molecular gas (μ = 2.33) in km/s. */
export const soundSpeedKms = (tempK: number): number => 0.188 * Math.sqrt(tempK / 10);
export const TEMP_K = 7;
/** Isothermal sound speed in code units. */
export const C0 = soundSpeedKms(TEMP_K) / KMS_PER_V;

/** Mean density of the initial sphere. */
export const RHO0 = 1 / (4 / 3 * Math.PI);
/* Barotropic law after Bate et al. (2003): isothermal while the gas can radiate,
   stiffening (γ = 5/3) once it turns opaque (first core), softening again
   (γ = 1.1) where H₂ dissociates (second collapse). Real transition densities are
   ~1e5 and ~1e10 ρ0 here; resolution compresses them to 300 and 3000 ρ0. */
export const RHO_CRIT = 300 * RHO0;
export const RHO_2 = 10 * RHO_CRIT;
export const RHO_SINK = 2 * RHO_2;
export const GAMMA = 5 / 3;
const GAMMA_2 = 1.1;

export const EPS_GAS = 0.005;     // Plummer softening, R0
export const R_ACC = 0.016;       // sink accretion radius, R0 (80 AU)
export const EPS_SINK = R_ACC / 2;

const stiff = (rho: number) => Math.sqrt(1 + Math.pow(rho / RHO_CRIT, 2 * (GAMMA - 1)));
const S2 = stiff(RHO_2);

/** Barotropic pressure / density. */
export function pOverRho(rho: number): number {
  if (rho <= RHO_2) return C0 * C0 * stiff(rho);
  return C0 * C0 * S2 * Math.pow(rho / RHO_2, GAMMA_2 - 1);
}

/** Effective adiabatic index for the sound speed. */
export const gammaAt = (rho: number): number => (rho <= RHO_CRIT ? 1 : rho <= RHO_2 ? GAMMA : GAMMA_2);

/** ∫ P/ρ² dρ: the gas's reversible compression energy per unit mass. */
export function compressionEnergy(rho: number): number {
  const k = 1 / (2 * (GAMMA - 1));
  const lower = (r: number) => { const s = stiff(r); return C0 * C0 * k * (2 * s + Math.log((s - 1) / (s + 1))); };
  if (rho <= RHO_2) return lower(rho);
  return lower(RHO_2) + C0 * C0 * S2 / (GAMMA_2 - 1) * (Math.pow(rho / RHO_2, GAMMA_2 - 1) - 1);
}

/** Gas temperature implied by the barotropic law. */
export const temperatureK = (rho: number): number => TEMP_K * pOverRho(rho) / (C0 * C0);

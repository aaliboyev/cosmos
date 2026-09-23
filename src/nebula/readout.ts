/* Physical readouts for the HUD: code units to years, AU, M☉ and L☉, and the stage
   caption chosen from measured quantities. */
import type { CloudStats } from './physics/sim';
import { R0_AU, T_FF, YEAR_PER_T } from './physics/units';

/** Protostellar radius assumed for the accretion luminosity: the sink can't resolve it. */
export const STAR_RADIUS_RSUN = 2.5;

export const years = (t: number): number => t * YEAR_PER_T;
export const au = (r: number): number => r * R0_AU;
/** Mass accretion rate in M☉/yr (the cloud is 1 M☉). */
export const msunPerYear = (mdot: number): number => mdot / YEAR_PER_T;

/** L = G M Ṁ / R: 314 L☉ per (M☉ · 1e-5 M☉/yr) at 1 R☉. */
export const accretionLsun = (mass: number, mdot: number): number =>
  314 * mass * (msunPerYear(mdot) / 1e-5) / STAR_RADIUS_RSUN;

export function formatYears(t: number): string {
  const y = years(t);
  return y < 1e4 ? Math.round(y).toLocaleString('en-US') + ' yr' : (y / 1000).toFixed(1) + ' kyr';
}

export function stageOf(s: CloudStats, rhoCrit: number): string {
  const multiple = s.sinks > 1 ? ` · ${s.sinks} STARS — THE CORE FRAGMENTED` : '';
  if (s.sinks === 0) {
    if (s.virial > 1.3 && s.t > 0.5 * T_FF) return 'SUPPORTED · PRESSURE AND MOTION BEAT GRAVITY — NO STAR THIS TIME';
    if (s.maxRho >= rhoCrit) return '3 · FIRST CORE · THE CENTRE TURNS OPAQUE, TRAPS ITS HEAT, AND PRESSURE HOLDS IT';
    if (s.maxRho >= 5) return '2 · COLLAPSE · THE CENTRE FALLS FASTEST — INSIDE-OUT';
    return '1 · COLD CORE · 1 M☉ OF GAS AT 7 K, 10,000 AU ACROSS';
  }
  if (s.starFraction > 0.5) return '6 · THE STAR HOLDS MOST OF THE MASS · THE DISK IS WHAT PLANETS ARE MADE OF' + multiple;
  if (s.diskMass > 0.03 && s.flatness < 0.5) return '5 · DISK · SPIN KEEPS THE GAS ORBITING INSTEAD OF FALLING IN' + multiple;
  return '4 · PROTOSTAR · INFALL LIGHTS IT: L = GMṀ/R' + multiple;
}

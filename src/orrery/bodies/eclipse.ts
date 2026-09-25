/* Eclipses as the fraction of the solar disk an occluding sphere hides, per
   fragment. The geometry is evaluated in true proportions (1000 km units,
   occluder at the origin), so umbra and penumbra are right in either scale
   mode; the fragment is mapped there by its offset on the receiver's sphere. */
import { Color, Vector3 } from 'three';

export interface EclipseUniforms {
  uEclCenter: { value: Vector3 };   // receiver centre, scene
  uEclR: { value: number };         // receiver radius, scene
  uEclRecv: { value: Vector3 };     // receiver centre, true, relative to occluder
  uEclRecvR: { value: number };
  uEclOccR: { value: number };
  uEclSun: { value: Vector3 };      // Sun centre, true, relative to occluder
  uEclSunR: { value: number };
  uEclTint: { value: Color };       // light left in the umbra (refracted through an atmosphere)
  uEclDeepen: { value: number };    // penumbra exponent: 1 is photometric
  uEclCore: { value: number };      // solar coverage past which it darkens steeply; ≥ 1 is off
}

export const eclipseUniforms = (occluderKm: number, tint: Color, deepen: number, core = 1): EclipseUniforms => ({
  uEclCenter: { value: new Vector3() },
  uEclR: { value: 1 },
  uEclRecv: { value: new Vector3() },
  uEclRecvR: { value: 1 },
  uEclOccR: { value: occluderKm / 1000 },
  uEclSun: { value: new Vector3() },
  uEclSunR: { value: 696 },
  uEclTint: { value: tint },
  uEclDeepen: { value: deepen },
  uEclCore: { value: core },
});

export const ECLIPSE_PARS = /* glsl */`
uniform vec3 uEclCenter, uEclRecv, uEclSun, uEclTint;
uniform float uEclR, uEclRecvR, uEclOccR, uEclSunR, uEclDeepen, uEclCore;

// overlap area of two circles (radii r1, r2, centre separation d) over the area of the first
float diskCover(float r1, float r2, float d) {
  if (d >= r1 + r2) return 0.0;
  if (d <= abs(r1 - r2)) return min(r1, r2) * min(r1, r2) / (r1 * r1);
  float a1 = r1 * r1 * acos(clamp((d * d + r1 * r1 - r2 * r2) / (2.0 * d * r1), -1.0, 1.0));
  float a2 = r2 * r2 * acos(clamp((d * d + r2 * r2 - r1 * r1) / (2.0 * d * r2), -1.0, 1.0));
  float k = sqrt(max((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2), 0.0));
  return (a1 + a2 - 0.5 * k) / (PI * r1 * r1);
}

float sunVisible(vec3 wPos) {
  vec3 P = uEclRecv + (wPos - uEclCenter) / uEclR * uEclRecvR;
  vec3 S = uEclSun - P, O = -P;
  if (dot(S, O) <= 0.0) return 1.0;
  float dS = length(S), dO = length(O);
  float a = asin(min(uEclSunR / dS, 1.0)), b = asin(min(uEclOccR / dO, 1.0));
  // atan of |cross| and dot keeps small separations precise in float
  float c = atan(length(cross(S, O)), dot(S, O));
  return 1.0 - diskCover(a, b, c);
}
`;

// runs after lighting, before the terms are summed: only direct light is eclipsed.
// The penumbra is deepened (overall, or only past a coverage) so partial phases read on
// screen; its extent stays exact.
// The tint only shows near the umbra, where no direct sunlight is left to drown it.
export const ECLIPSE_APPLY = /* glsl */`
{
  float vis = sunVisible(vWPos);
  float lit = pow(vis, uEclDeepen);
  if (uEclCore < 1.0) lit *= 1.0 - smoothstep(uEclCore, 1.0, 1.0 - vis);
  vec3 k = vec3(lit) + uEclTint * pow(1.0 - vis, 8.0);
  reflectedLight.directDiffuse *= k;
  reflectedLight.directSpecular *= k;
}
`;

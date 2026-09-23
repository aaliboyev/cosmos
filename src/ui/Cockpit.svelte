<script lang="ts">
  import { cameraMode } from '../orrery/state';
</script>

<!-- canopy: stretched to the viewport; strokes stay hairline via non-scaling-stroke -->
<svg class="canopy" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
  <g fill="none" vector-effect="non-scaling-stroke">
    <path d="M0 64 Q500 -6 1000 64" class="strut" vector-effect="non-scaling-stroke" />
    <path d="M0 64 L34 1000" class="strut faint" vector-effect="non-scaling-stroke" />
    <path d="M1000 64 L966 1000" class="strut faint" vector-effect="non-scaling-stroke" />
    <path d="M140 880 Q500 846 860 880" class="strut faint" vector-effect="non-scaling-stroke" />
  </g>
</svg>

{#each ['tl', 'tr', 'bl', 'br'] as c}
  <svg class="corner {c}" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
    <path d="M1 20V1h19" fill="none" />
    <path d="M5 9V5h4" fill="none" class="inner" />
  </svg>
{/each}

{#if $cameraMode === 'free'}
  <svg class="reticle" width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="13" fill="none" stroke-dasharray="6 5.6" />
    <path d="M32 6v10M32 48v10M6 32h10M48 32h10" />
    <circle cx="32" cy="32" r="1.2" class="dot" />
  </svg>
{/if}

<div class="vignette" aria-hidden="true"></div>

<style>
  .canopy, .corner, .reticle, .vignette { position: fixed; pointer-events: none; z-index: 4; }
  .canopy { inset: 0; width: 100%; height: 100%; }
  .strut { stroke: rgba(120, 200, 255, .16); stroke-width: 1; }
  .strut.faint { stroke: rgba(120, 200, 255, .07); }
  .corner { stroke: rgba(120, 200, 255, .45); stroke-width: 1.2; }
  .corner .inner { stroke: rgba(120, 200, 255, .22); }
  .tl { top: 10px; left: 10px; }
  .tr { top: 10px; right: 10px; transform: scaleX(-1); }
  .bl { bottom: 10px; left: 10px; transform: scaleY(-1); }
  .br { bottom: 10px; right: 10px; transform: scale(-1, -1); }
  .reticle { top: 50%; left: 50%; transform: translate(-50%, -50%); stroke: rgba(150, 215, 255, .55); stroke-width: 1; }
  .reticle .dot { fill: rgba(150, 215, 255, .8); stroke: none; }
  .vignette { inset: 0; background: radial-gradient(ellipse at center, transparent 62%, rgba(0, 2, 8, .55) 100%); }
</style>

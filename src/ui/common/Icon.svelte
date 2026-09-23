<script lang="ts" module>
  // 16×16 stroke paths; kept inline so the page loads nothing
  const PATHS = {
    reverse: 'M8 3.5 3 8l5 4.5V3.5ZM13.5 3.5 8.5 8l5 4.5V3.5Z',
    pause: 'M5 3.5v9M11 3.5v9',
    play: 'M5 3.2v9.6L12.6 8 5 3.2Z',
    now: 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM8 5v3l2 1.5',
    orbits: 'M1.8 8c0-2 2.8-3.6 6.2-3.6s6.2 1.6 6.2 3.6-2.8 3.6-6.2 3.6S1.8 10 1.8 8ZM8 7.2v1.6',
    labels: 'M2.5 3.5h6.2l4.8 4.5-4.8 4.5H2.5v-9ZM5.5 8h.01',
    trueScale: 'M1.5 10.5 10.5 1.5l4 4-9 9-4-4ZM4.5 7.5l1.5 1.5M6.5 5.5l1.5 1.5M8.5 3.5l1.5 1.5',
    belts: 'M1.5 8c0-1.6 2.9-2.9 6.5-2.9s6.5 1.3 6.5 2.9-2.9 2.9-6.5 2.9S1.5 9.6 1.5 8ZM4 8h.01M7 6.4h.01M10.5 9.4h.01M12 7.3h.01M6 9.6h.01',
    constellations: 'M1.5 11.5 4.5 9l3 1.2 2.2-2.4M9.7 7.8l1.1-4.3 3.7.9-.6 4.1-4.2-.7',
    drift: 'M2 13c2-6 4-6 6-3s4 3 6-3M2 7.5c1.5-3.5 3-4 4.5-2.5',
    free: 'M8 1.5v3.5M8 11v3.5M1.5 8H5M11 8h3.5M8 7.4v1.2',
    orbit: 'M8 6.3a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4ZM2.2 5.2A6.5 6.5 0 0 1 13.8 5.2M13.8 10.8a6.5 6.5 0 0 1-11.6 0M13.8 5.2l.4-2M13.8 5.2l-2-.3',
    overview: 'M2.5 7.5 8 3l5.5 4.5M4 6.5V13h8V6.5',
    help: 'M6 6a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2V10M8 12.4v.1',
    close: 'M4 4l8 8M12 4l-8 8',
    flyTo: 'M2.5 13.5 13.5 2.5M6.5 2.5h7v7',
    release: 'M6 10 10 6M4.5 8.5 3 10a2.1 2.1 0 0 0 3 3l1.5-1.5M8.5 4.5 10 3a2.1 2.1 0 0 1 3 3l-1.5 1.5',
    restart: 'M13 8a5 5 0 1 1-1.6-3.7M13.2 2.6v3h-3',
    snow: 'M8 1.5v13M2.4 4.75l11.2 6.5M2.4 11.25l11.2-6.5M6.3 2.6 8 4.2l1.7-1.6M6.3 13.4 8 11.8l1.7 1.6',
  } as const;
  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  let { name, size = 16 }: { name: IconName; size?: number } = $props();
</script>

<svg class="icon" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true"
  fill={name === 'play' || name === 'reverse' ? 'currentColor' : 'none'}
  stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
  <path d={PATHS[name]} />
</svg>

<style>
  .icon { display: block; flex: none; }
</style>

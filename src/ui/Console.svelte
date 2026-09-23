<script lang="ts">
  import { PAUSED_IDX, SPEEDS, actions, cameraMode, sim, toggles, type Toggles } from '../orrery/state';
  import Button from './controls/Button.svelte';
  import Segmented from './controls/Segmented.svelte';
  import type { IconName } from './controls/Icon.svelte';
  import { MAGNITUDES, direction, time } from './time';

  let { onhelp }: { onhelp: () => void } = $props();

  const VIEW: { key: keyof Toggles; label: string; icon: IconName }[] = [
    { key: 'orbits', label: 'Orbits', icon: 'orbits' },
    { key: 'labels', label: 'Labels', icon: 'labels' },
    { key: 'belts', label: 'Asteroid & Kuiper belts', icon: 'belts' },
    { key: 'constellations', label: 'Constellations', icon: 'constellations' },
    { key: 'trueScale', label: 'True scale', icon: 'trueScale' },
    { key: 'drift', label: 'Galactic drift ÷8', icon: 'drift' },
  ];

  const dir = $derived(direction($sim.speedIdx));
  const mag = $derived(Math.abs(SPEEDS[$sim.speedIdx].mult));
  // minute resolution: the text node only changes once per sim minute
  const stamp = $derived(new Date(Math.floor($sim.time / 60000) * 60000).toISOString());
</script>

<div class="console">
  <section aria-label="Time">
    <div class="cluster">
      <Button icon="reverse" label="Reverse" compact tone="warn" pressed={dir < 0} onclick={() => time.run(-1)} />
      <Button icon="pause" label="Pause" compact pressed={$sim.speedIdx === PAUSED_IDX} onclick={time.pause} />
      <Button icon="play" label="Play" compact pressed={dir > 0} onclick={() => time.run(1)} />
    </div>
    <Segmented label="Time rate" options={MAGNITUDES} value={dir === 0 ? null : mag} tone={dir < 0 ? 'warn' : 'accent'} onchange={time.setMagnitude} />
    <div class="clock" class:rev={dir < 0} title="Simulated time, UTC">
      <span class="d">{stamp.slice(0, 10)}</span>
      <span class="t">{stamp.slice(11, 16)}<small>UTC</small></span>
    </div>
    <Button icon="now" label="Now" title="Jump to the present" onclick={time.now} />
  </section>

  <span class="sep" aria-hidden="true"></span>

  <section aria-label="View">
    {#each VIEW as v}
      <Button icon={v.icon} label={v.label} compact pressed={$toggles[v.key]} onclick={() => actions.toggle(v.key)} />
    {/each}
  </section>

  <span class="sep" aria-hidden="true"></span>

  <section aria-label="Camera">
    <div class="cluster">
      <Button icon="orbit" label="Orbit camera" compact pressed={$cameraMode === 'orbit'} onclick={() => actions.setCameraMode('orbit')} />
      <Button icon="free" label="Free flight" compact pressed={$cameraMode === 'free'} onclick={() => actions.setCameraMode('free')} />
    </div>
    <Button icon="overview" label="Overview" title="Overview (H)" compact onclick={actions.overview} />
    <Button icon="help" label="Controls" title="Controls (?)" compact onclick={onhelp} />
  </section>
</div>

<style>
  .console {
    position: fixed; z-index: 10; bottom: 16px; left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 12px; padding: 9px 12px; max-width: calc(100vw - 24px);
    background: var(--glass); border: 1px solid var(--line); border-radius: 10px;
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: var(--shadow);
  }
  /* notched top edge: the console reads as a dash panel, not a floating card */
  .console::before {
    content: ''; position: absolute; top: -1px; left: 50%; width: 120px; height: 2px;
    transform: translateX(-50%); background: var(--accent); opacity: .6; border-radius: 2px;
  }
  section { display: flex; align-items: center; gap: 6px; }
  .cluster { display: flex; gap: 3px; }
  .sep { width: 1px; align-self: stretch; background: var(--line); }
  .clock {
    display: flex; flex-direction: column; align-items: flex-end; justify-content: center; min-width: 86px;
    font-family: var(--mono); font-variant-numeric: tabular-nums; line-height: 1.15; padding: 0 4px;
  }
  .clock .d { font-size: 12px; color: var(--text); }
  .clock .t { font-size: 11px; color: var(--dim); }
  .clock small { font-size: 9px; margin-left: 3px; letter-spacing: .08em; }
  .clock.rev .d { color: var(--warn-hi); }

  @media (max-width: 900px) {
    .console { flex-wrap: wrap; justify-content: center; row-gap: 8px; bottom: 10px; width: max-content; }
    section { flex-wrap: wrap; justify-content: center; row-gap: 8px; }
    .sep { display: none; }
  }
</style>

<script lang="ts">
  import { PAUSED_IDX, SPEEDS, actions, activeEvent, cameraMode, sim, toggles, type Toggles } from '../state';
  import { EVENTS, type SkyEvent } from '../../data/events';
  import Button from '../../ui/common/Button.svelte';
  import ConsoleBar from '../../ui/common/ConsoleBar.svelte';
  import Segmented from '../../ui/common/Segmented.svelte';
  import type { IconName } from '../../ui/common/Icon.svelte';
  import { MAGNITUDES, direction, time } from './time';

  let { onhelp }: { onhelp: () => void } = $props();

  const VIEW: { key: keyof Toggles; label: string; icon: IconName }[] = [
    { key: 'orbits', label: 'Orbits', icon: 'orbits' },
    { key: 'labels', label: 'Labels', icon: 'labels' },
    { key: 'belts', label: 'Asteroid & Kuiper belts', icon: 'belts' },
    { key: 'constellations', label: 'Constellations', icon: 'constellations' },
    { key: 'trueScale', label: 'True scale', icon: 'trueScale' },
    { key: 'shadows', label: 'Shadow cones (true scale)', icon: 'shadows' },
    { key: 'drift', label: 'Galactic drift ÷8', icon: 'drift' },
  ];

  const dir = $derived(direction($sim.speedIdx));
  const mag = $derived(Math.abs(SPEEDS[$sim.speedIdx].mult));
  // minute resolution: the text node only changes once per sim minute
  const stamp = $derived(new Date(Math.floor($sim.time / 60000) * 60000).toISOString());

  // Standish's elements are fitted to 1800–2050; outside, positions drift by arcminutes and more
  const MIN = '1000-01-01T00:00', MAX = '2999-12-31T23:59';
  let picking = $state(false);
  let draft = $state('');
  const draftMs = $derived(Date.parse(draft + 'Z'));
  const draftYear = $derived(Number(draft.slice(0, 4)));

  function openPicker() {
    draft = stamp.slice(0, 16);
    picking = !picking;
    listing = false;
  }
  function go() {
    if (Number.isNaN(draftMs) || draft < MIN || draft > MAX) return;
    time.jump(draftMs);
    picking = false;
  }
  let listing = $state(false);
  function openEvent(ev: SkyEvent) {
    actions.showEvent(ev);
    listing = false;
  }

  function onpickerkey(e: KeyboardEvent) {
    if (e.key === 'Enter') { go(); e.preventDefault(); }
    else if (e.key === 'Escape') { picking = false; e.preventDefault(); }
  }
</script>

<ConsoleBar chapter="orrery">
  <section aria-label="Time">
    <div class="cluster">
      <Button icon="reverse" label="Reverse" compact tone="warn" pressed={dir < 0} onclick={() => time.run(-1)} />
      <Button icon="pause" label="Pause" compact pressed={$sim.speedIdx === PAUSED_IDX} onclick={time.pause} />
      <Button icon="play" label="Play" compact pressed={dir > 0} onclick={() => time.run(1)} />
    </div>
    <Button icon="now" label="Now" title="Jump to the present, live" onclick={time.now} />
    <Segmented label="Time rate" options={MAGNITUDES} value={dir === 0 ? null : mag} tone={dir < 0 ? 'warn' : 'accent'} onchange={time.setMagnitude} />
    <div class="when">
      <button type="button" class="clock" class:rev={dir < 0} class:open={picking} title="Simulated time, UTC — pick a date"
        aria-label="Pick a date" aria-expanded={picking} onclick={openPicker}>
        <span class="d">{stamp.slice(0, 10)}</span>
        <span class="t">{stamp.slice(11, 16)}<small>UTC</small></span>
      </button>
      {#if picking}
        <div class="picker" role="dialog" aria-label="Jump to date">
          <label>
            <span>Date &amp; time, UTC</span>
            <!-- svelte-ignore a11y_autofocus -->
            <input type="datetime-local" step="60" min={MIN} max={MAX} bind:value={draft} onkeydown={onpickerkey} autofocus />
          </label>
          {#if draftYear < 1800 || draftYear > 2050}
            <p class="hint">Outside 1800–2050 planet positions are approximate.</p>
          {/if}
          <div class="row">
            <Button label="Cancel" onclick={() => (picking = false)} />
            <Button label="Go" pressed onclick={go} />
          </div>
        </div>
      {/if}
    </div>
    <div class="when">
      <Button icon="events" label="Events" title="Notable events" compact pressed={listing || !!$activeEvent}
        onclick={() => { listing = !listing; picking = false; }} />
      {#if listing}
        <div class="picker events" role="dialog" aria-label="Notable events">
          <span class="head">Notable events</span>
          <ul>
            {#each EVENTS as ev}
              <li>
                <button type="button" class:on={$activeEvent?.id === ev.id} onclick={() => openEvent(ev)}>
                  <span class="d">{ev.time.slice(0, 10)}</span>
                  <span class="n">{ev.title}</span>
                  <span class="k">{ev.kind}</span>
                </button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
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
</ConsoleBar>

<style>
  .when { position: relative; }
  .clock {
    display: flex; flex-direction: column; align-items: flex-end; justify-content: center; min-width: 86px;
    font-family: var(--mono); font-variant-numeric: tabular-nums; line-height: 1.15; padding: 2px 6px;
    white-space: nowrap; flex: none;
    background: none; border: 1px solid transparent; border-radius: 6px; cursor: pointer;
  }
  .clock:hover, .clock.open { border-color: var(--line-hi); }
  .clock:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .picker {
    position: absolute; bottom: calc(100% + 14px); left: 50%; transform: translateX(-50%);
    display: flex; flex-direction: column; gap: 10px; padding: 12px; width: 240px;
    background: var(--glass); border: 1px solid var(--line); border-radius: 10px;
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: var(--shadow);
  }
  .picker label { display: flex; flex-direction: column; gap: 6px; }
  .picker label span { font: 600 10px/1 var(--sans); letter-spacing: .1em; text-transform: uppercase; color: var(--dim); }
  .picker input {
    height: 30px; padding: 0 8px; color: var(--text); color-scheme: dark;
    background: rgba(120, 200, 255, .04); border: 1px solid var(--line); border-radius: 6px;
    font: 12px var(--mono); font-variant-numeric: tabular-nums;
  }
  .picker input:focus { outline: none; border-color: var(--accent); }
  .picker .hint { margin: 0; font-size: 11px; color: var(--warn-hi); }
  .picker .row { display: flex; justify-content: flex-end; gap: 6px; }
  .events { width: 300px; max-height: min(420px, calc(100vh - 140px)); overflow: auto; gap: 8px; }
  .events .head { font: 600 10px/1 var(--sans); letter-spacing: .1em; text-transform: uppercase; color: var(--dim); }
  .events ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .events li button {
    display: grid; grid-template-columns: auto 1fr; column-gap: 10px; width: 100%; padding: 7px 8px; text-align: left;
    background: none; border: 1px solid transparent; border-radius: 6px; color: var(--text); cursor: pointer;
  }
  .events li button:hover { border-color: var(--line-hi); background: rgba(120, 200, 255, .04); }
  .events li button.on { border-color: var(--warn); }
  .events li button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .events .d { grid-row: span 2; font: 11px var(--mono); font-variant-numeric: tabular-nums; color: var(--dim); padding-top: 1px; }
  .events .n { font-size: 12.5px; font-weight: 600; }
  .events .k { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--dim); }
  .clock .d { font-size: 12px; color: var(--text); }
  .clock .t { font-size: 11px; color: var(--dim); }
  .clock small { font-size: 9px; margin-left: 3px; letter-spacing: .08em; }
  .clock.rev .d { color: var(--warn-hi); }
</style>

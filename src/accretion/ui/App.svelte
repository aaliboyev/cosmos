<script lang="ts">
  import Brand from '../../ui/common/Brand.svelte';
  import Button from '../../ui/common/Button.svelte';
  import Caption from '../../ui/common/Caption.svelte';
  import Cockpit from '../../ui/common/Cockpit.svelte';
  import ConsoleBar from '../../ui/common/ConsoleBar.svelte';
  import Help from '../../ui/common/Help.svelte';
  import Instruments, { type Readout } from '../../ui/common/Instruments.svelte';
  import Segmented from '../../ui/common/Segmented.svelte';
  import Slider from '../../ui/common/Slider.svelte';
  import { CHAPTER_CONTROL, chapterKey } from '../../ui/common/chapters';
  import Leaderboard from './Leaderboard.svelte';
  import { SPEEDS, actions, heat, paused, readout, speed } from '../state';

  const CONTROLS = [
    { keys: 'Scroll', action: 'zoom in / out' },
    { keys: 'Space', action: 'pause / resume' },
    CHAPTER_CONTROL,
    { keys: '?', action: 'this help' },
  ];
  const SPEED_OPTIONS = SPEEDS.map(s => ({ value: s as number, label: s + '×' }));

  let help = $state(false);

  const rows: Readout[] = $derived([
    { label: 'T', value: $readout.time },
    { label: 'BODIES', value: $readout.count.toLocaleString('en-US') },
    { label: 'BIGGEST', value: $readout.biggest, tone: 'name' },
  ]);

  function onkeydown(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '?') { help = !help; e.preventDefault(); return; }
    if (help) { if (e.key === 'Escape') { help = false; e.preventDefault(); } return; }
    if (e.key === ' ') { actions.togglePause(); e.preventDefault(); }
    else chapterKey(e, 'accretion');
  }
</script>

<svelte:window {onkeydown} />

<Cockpit />
<Brand sub="ACCRETION" status={$paused ? 'PAUSED' : $speed + '× SPEED'} />
<Caption text={$readout.stage} />
<Instruments {rows} label="Disk instruments" />
<Leaderboard leaders={$readout.leaders} />

<ConsoleBar chapter="accretion">
  <section aria-label="Simulation">
    <div class="cluster">
      <Button icon="pause" label="Pause" compact pressed={$paused} onclick={actions.togglePause} />
      <Button icon="restart" label="New disk" onclick={actions.restart} />
    </div>
    <Segmented label="Simulation speed" options={SPEED_OPTIONS} value={$speed} onchange={v => speed.set(v)} />
  </section>
  <span class="sep" aria-hidden="true"></span>
  <section aria-label="Disk">
    <Slider label="Disk heat" value={$heat} min={0.01} max={0.2} oninput={v => heat.set(v)} />
  </section>
  <span class="sep" aria-hidden="true"></span>
  <section aria-label="Help">
    <Button icon="help" label="Controls" title="Controls (?)" compact onclick={() => (help = true)} />
  </section>
</ConsoleBar>

{#if help}
  <Help controls={CONTROLS} credit="Gravitational focusing: the big eat faster. Runaway growth is real astrophysics." onclose={() => (help = false)} />
{/if}

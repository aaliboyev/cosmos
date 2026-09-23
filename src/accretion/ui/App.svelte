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
  import { CAMERA_CONTROLS } from '../../shared/camera';
  import Leaderboard from './Leaderboard.svelte';
  import { SPEEDS, actions, camera, cameraMode, diskMass, flight, heat, paused, readout, speed, toggles } from '../state';

  const CONTROLS = [
    ...CAMERA_CONTROLS,
    { keys: 'Space', action: 'pause / resume' },
    CHAPTER_CONTROL,
    { keys: '?', action: 'this help' },
  ];

  let help = $state(false);

  const err = (v: number) => (Math.abs(v) < 1e-12 ? '<1e-12' : v.toExponential(1));
  const rows: Readout[] = $derived([
    { label: 'T', value: $readout.time },
    { label: 'GAS AGE', value: $readout.equiv },
    { label: 'BODIES', value: $readout.count.toLocaleString('en-US') },
    { label: 'BIGGEST', value: $readout.biggest, tone: 'name' },
    { label: 'GAS', value: $readout.gas + '%' },
    { label: 'RATE', value: $readout.rate.toFixed(1) + ' yr/s' },
    { label: 'ΔE/E', value: err($readout.dE) },
    { label: 'ΔP', value: err($readout.dP) },
    { label: 'ΔL/L', value: err($readout.dL) },
    { label: 'RADII', value: '×' + $readout.inflate },
    { label: 'NEAR', value: $flight.nearestDist.toFixed(2) + ' AU' },
    { label: 'MODE', value: $cameraMode === 'free' ? 'FREE' : 'ORBIT', tone: 'mode' },
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

<Cockpit reticle={$cameraMode === 'free'} />
<Brand sub="ACCRETION" status={$paused ? 'PAUSED' : $readout.rate.toFixed(1) + ' YR/S'} />
<Caption text={$readout.stage} />
<Instruments {rows} label="Disk instruments" throttle={$flight.throttle} onthrottle={camera.setThrottle} />
<Leaderboard leaders={$readout.leaders} onpick={actions.focusBody} />

<ConsoleBar chapter="accretion">
  <section aria-label="Simulation">
    <div class="cluster">
      <Button icon="pause" label="Pause" compact pressed={$paused} onclick={actions.togglePause} />
      <Button icon="restart" label="New disk" onclick={actions.restart} />
    </div>
    <Segmented label="Simulation speed" options={SPEEDS} value={$speed} onchange={v => speed.set(v)} />
  </section>
  <span class="sep" aria-hidden="true"></span>
  <section aria-label="Disk">
    <Slider label="Mass ×MMSN" value={$diskMass} min={1} max={10} step={0.5} digits={1} oninput={v => diskMass.set(v)} />
    <Slider label="Heat e" value={$heat} min={0.002} max={0.05} step={0.001} digits={3} oninput={v => heat.set(v)} />
    <div class="cluster">
      <Button icon="snow" label="Snow line" compact pressed={$toggles.snowLine} onclick={() => actions.toggle('snowLine')} />
      <Button icon="orbits" label="Leader orbits" compact pressed={$toggles.orbits} onclick={() => actions.toggle('orbits')} />
    </div>
  </section>
  <span class="sep" aria-hidden="true"></span>
  <section aria-label="Camera">
    <div class="cluster">
      <Button icon="orbit" label="Orbit camera" compact pressed={$cameraMode === 'orbit'} onclick={() => camera.setMode('orbit')} />
      <Button icon="free" label="Free flight" compact pressed={$cameraMode === 'free'} onclick={() => camera.setMode('free')} />
    </div>
    <Button icon="overview" label="Overview" title="Overview (H)" compact onclick={actions.overview} />
    <Button icon="help" label="Controls" title="Controls (?)" compact onclick={() => (help = true)} />
  </section>
</ConsoleBar>

{#if help}
  <Help controls={CONTROLS}
    credit="Star + embryo gravity with reaction forces; planetesimal pairs don't attract each other. Radii ×100 and a sped-up gas clock (gas years per orbital year) make growth fit in minutes. Gas drag and giant-core gas accretion are parametrised models. Disk mass and heat apply to the next disk."
    onclose={() => (help = false)} />
{/if}

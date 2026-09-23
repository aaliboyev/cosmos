<script lang="ts">
  import Brand from '../../ui/common/Brand.svelte';
  import Button from '../../ui/common/Button.svelte';
  import Caption from '../../ui/common/Caption.svelte';
  import Cockpit from '../../ui/common/Cockpit.svelte';
  import ConsoleBar from '../../ui/common/ConsoleBar.svelte';
  import Help from '../../ui/common/Help.svelte';
  import Instruments, { type Readout } from '../../ui/common/Instruments.svelte';
  import Slider from '../../ui/common/Slider.svelte';
  import { CHAPTER_CONTROL, chapterKey } from '../../ui/common/chapters';
  import { deg, signed } from '../../ui/common/format';
  import { CAMERA_CONTROLS } from '../../shared/camera';
  import { actions, camera, cameraMode, flight, params, paused, readout } from '../state';

  const CONTROLS = [
    ...CAMERA_CONTROLS,
    { keys: 'Space', action: 'pause / resume' },
    CHAPTER_CONTROL,
    { keys: '?', action: 'this help' },
  ];

  let help = $state(false);

  const rows: Readout[] = $derived([
    { label: 'T', value: $readout.time },
    { label: 'FLAT', value: $readout.flat.toFixed(2) },
    { label: 'STAR', value: Math.round($readout.core * 100) + '%' },
    { label: 'HDG', value: deg($flight.headingDeg) + '°' },
    { label: 'PIT', value: signed($flight.pitchDeg) + '°' },
    { label: 'CORE', value: $flight.nearestDist.toFixed(2) + ' R₀' },
    { label: 'MODE', value: $cameraMode === 'free' ? 'FREE' : 'ORBIT', tone: 'mode' },
  ]);

  function onkeydown(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '?') { help = !help; e.preventDefault(); return; }
    if (help) { if (e.key === 'Escape') { help = false; e.preventDefault(); } return; }
    if (e.key === ' ') { actions.togglePause(); e.preventDefault(); }
    else chapterKey(e, 'nebula');
  }
</script>

<svelte:window {onkeydown} />

<Cockpit reticle={$cameraMode === 'free'} />
<Brand sub="NEBULA" status={$paused ? 'PAUSED' : 'RUNNING'} />
<Caption text={$readout.stage} />
<Instruments {rows} label="Cloud instruments" throttle={$flight.throttle} onthrottle={camera.setThrottle} />

<ConsoleBar chapter="nebula">
  <section aria-label="Simulation">
    <div class="cluster">
      <Button icon="pause" label="Pause" compact pressed={$paused} onclick={actions.togglePause} />
      <Button icon="restart" label="New cloud" onclick={actions.restart} />
    </div>
  </section>
  <span class="sep" aria-hidden="true"></span>
  <section aria-label="Cloud">
    <Slider label="Initial spin" value={$params.spin0} min={0} max={0.8} oninput={actions.setSpin} />
    <Slider label="Gas stickiness" value={$params.visc} min={0} max={0.4} oninput={actions.setVisc} />
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
  <Help controls={CONTROLS} credit="Gravity + inelastic collisions + conserved rotation = disk. Nothing is scripted." onclose={() => (help = false)} />
{/if}

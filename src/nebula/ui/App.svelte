<script lang="ts">
  import Brand from '../../ui/common/Brand.svelte';
  import Credits from '../../ui/common/Credits.svelte';
  import Button from '../../ui/common/Button.svelte';
  import Caption from '../../ui/common/Caption.svelte';
  import Cockpit from '../../ui/common/Cockpit.svelte';
  import ConsoleBar from '../../ui/common/ConsoleBar.svelte';
  import Help from '../../ui/common/Help.svelte';
  import Instruments, { type Readout } from '../../ui/common/Instruments.svelte';
  import Slider from '../../ui/common/Slider.svelte';
  import { CHAPTER_CONTROL, chapterKey } from '../../ui/common/chapters';
  import { CAMERA_CONTROLS } from '../../shared/camera';
  import { RHO_CRIT, RHO0, R0_AU, T_FF, TEMP_K } from '../physics/units';
  import { STAR_RADIUS_RSUN, accretionLsun, au, formatYears, msunPerYear, stageOf } from '../readout';
  import { actions, camera, cameraMode, flight, hasStar, params, paused, stats } from '../state';

  const controls = $derived([
    ...CAMERA_CONTROLS
      .filter(c => c.keys !== 'Click body' || $hasStar)
      .map(c => (c.keys === 'Click body' ? { ...c, keys: 'Click the star' } : c)),
    { keys: 'Space', action: 'pause / resume' },
    CHAPTER_CONTROL,
    { keys: '?', action: 'this help' },
  ]);

  let help = $state(false);

  const pct = (v: number) => (Math.abs(v) < 1e-4 ? '0.00' : (v * 100).toFixed(2)) + '%';
  const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  function sci(v: number): string {
    if (v === 0) return '0';
    const [mant, exp] = v.toExponential(1).split('e');
    const e = exp.replace('+', '');
    return e === '0' ? mant : `${mant}·10${[...e].map(c => SUP[c] ?? '').join('')}`;
  }

  const rows: Readout[] = $derived.by(() => {
    const s = $stats;
    if (!s) return [{ label: 'T', value: '—' }];
    const star = s.starFraction;
    const L = accretionLsun(star, s.mdot);
    return [
      { label: 'T', value: formatYears(s.t) },
      { label: 't/tff', value: (s.t / T_FF).toFixed(2) },
      { label: 'STAR', value: s.sinks ? star.toFixed(3) + ' M☉' : '—', tone: 'name' },
      { label: 'Ṁ', value: s.sinks ? sci(msunPerYear(s.mdot)) + ' M☉/yr' : '—' },
      { label: 'L', value: s.sinks ? L.toFixed(L < 10 ? 1 : 0) + ' L☉' : '—' },
      { label: 'DISK', value: s.diskRadius ? `${Math.round(au(s.diskRadius))} AU · ${s.diskMass.toFixed(2)} M☉` : '—' },
      { label: 'FLAT', value: s.flatness.toFixed(2) },
      { label: 'ρmax', value: sci(s.maxRho) + ' ρ₀' },
      { label: 'ΔE', value: pct(s.energyDrift) },
      { label: 'ΔL', value: pct(s.angMomDrift) },
      { label: 'P', value: sci(s.momentum) },
      { label: 'VIEW', value: Math.round($flight.nearestDist).toLocaleString('en-US') + ' AU' },
      { label: 'MODE', value: $cameraMode === 'free' ? 'FREE' : 'ORBIT', tone: 'mode' },
    ];
  });

  const stage = $derived($stats ? stageOf($stats, RHO_CRIT / RHO0) : '1 · COLD CORE · 1 M☉ OF GAS AT 7 K, 10,000 AU ACROSS');

  function onkeydown(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '?') { help = !help; e.preventDefault(); return; }
    if (help) { if (e.key === 'Escape') { help = false; e.preventDefault(); } return; }
    if (e.key === ' ') { actions.togglePause(); e.preventDefault(); }
    else chapterKey(e, 'nebula');
  }

  const credit = `SPH gas (barotropic: ${TEMP_K} K isothermal, stiff once opaque, soft again past H₂ dissociation), `
    + `Barnes-Hut gravity, sink-particle stars. R₀ = ${R0_AU.toLocaleString('en-US')} AU. `
    + `Luminosity assumes a ${STAR_RADIUS_RSUN} R☉ protostar; jets are drawn, not simulated. The sky is today's.`;
</script>

<svelte:window {onkeydown} />

<Cockpit reticle={$cameraMode === 'free'} />
<Brand sub="NEBULA" status={$paused ? 'PAUSED' : 'RUNNING'} />
<Credits />
<Caption text={stage} />
<Instruments {rows} label="Cloud instruments" throttle={$flight.throttle} onthrottle={camera.setThrottle} />

<ConsoleBar chapter="nebula">
  <section aria-label="Simulation">
    <div class="cluster">
      <Button icon="pause" label="Pause" compact pressed={$paused} onclick={actions.togglePause} />
      <Button icon="restart" label="New cloud" onclick={actions.restart} />
    </div>
  </section>
  <span class="sep" aria-hidden="true"></span>
  <section aria-label="Initial cloud">
    <Slider label="Rotation β" value={$params.rotation} min={0} max={0.1} step={0.005} digits={3} oninput={actions.setRotation} />
    <Slider label="Turbulence" value={$params.turbulence} min={0} max={0.4} step={0.01} oninput={actions.setTurbulence} />
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
  <Help {controls} {credit} onclose={() => (help = false)} />
{/if}

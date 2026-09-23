<script lang="ts">
  import Brand from '../../ui/common/Brand.svelte';
  import Cockpit from '../../ui/common/Cockpit.svelte';
  import Help from '../../ui/common/Help.svelte';
  import Instruments, { type Readout } from '../../ui/common/Instruments.svelte';
  import { CHAPTER_CONTROL, chapterKey } from '../../ui/common/chapters';
  import { deg, distance, signed, speed } from '../../ui/common/format';
  import { CAMERA_CONTROLS } from '../../shared/camera';
  import { AU_KM } from '../../physics/ephemeris';
  import Console from './Console.svelte';
  import TargetPanel from './TargetPanel.svelte';
  import { SPEEDS, actions, cameraMode, flight, sim } from '../state';
  import { time } from './time';

  const CONTROLS = [
    ...CAMERA_CONTROLS,
    { keys: 'C', action: 'constellations' },
    { keys: 'Space', action: 'pause / resume time' },
    { keys: '[ / ]', action: 'slower / faster time' },
    CHAPTER_CONTROL,
    { keys: '?', action: 'this help' },
  ];

  let help = $state(false);

  const rows: Readout[] = $derived([
    { label: 'VEL', value: speed($flight.speed) },
    { label: 'HDG', value: deg($flight.headingDeg) + '°' },
    { label: 'PIT', value: signed($flight.pitchDeg) + '°' },
    { label: 'ROL', value: signed($flight.rollDeg) + '°' },
    { label: 'NRST', value: $flight.nearest, tone: 'name' },
    { label: '', value: distance($flight.nearestDist / AU_KM) },
    { label: 'MODE', value: $cameraMode === 'free' ? 'FREE' : 'ORBIT', tone: 'mode' },
  ]);

  function onkeydown(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '?') { help = !help; e.preventDefault(); return; }
    if (help) { if (e.key === 'Escape') { help = false; e.preventDefault(); } return; }
    // a focused button would also fire on Space; the shortcut wins
    if (e.key === ' ') { time.togglePause(); e.preventDefault(); }
    else if (e.key === '[') time.step(-1);
    else if (e.key === ']') time.step(1);
    else if (e.key === 'c' || e.key === 'C') actions.toggle('constellations');
    else chapterKey(e, 'orrery');
  }
</script>

<svelte:window {onkeydown} />

<Cockpit reticle={$cameraMode === 'free'} />
<Brand sub="SOL SYSTEM" status={SPEEDS[$sim.speedIdx].label} warn={SPEEDS[$sim.speedIdx].mult < 0} />
<Instruments {rows} throttle={$flight.throttle} onthrottle={actions.setThrottle} />
<TargetPanel />
<Console onhelp={() => (help = true)} />
{#if help}
  <Help controls={CONTROLS} credit="Planet positions: Keplerian elements, J2000 + rates." onclose={() => (help = false)} />
{/if}

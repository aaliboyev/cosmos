<script lang="ts">
  import Brand from './Brand.svelte';
  import Cockpit from './Cockpit.svelte';
  import Console from './Console.svelte';
  import Help from './Help.svelte';
  import Instruments from './Instruments.svelte';
  import TargetPanel from './TargetPanel.svelte';
  import { actions } from '../orrery/state';
  import { time } from './time';

  let help = $state(false);

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
  }
</script>

<svelte:window {onkeydown} />

<Cockpit />
<Brand />
<Instruments />
<TargetPanel />
<Console onhelp={() => (help = true)} />
{#if help}<Help onclose={() => (help = false)} />{/if}

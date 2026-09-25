<script lang="ts" generics="T">
  import Dropdown from './Dropdown.svelte';

  let { options, value, label, onchange, tone = 'accent' }: {
    options: readonly { value: T; label: string; title?: string }[];
    value: T | null;
    label: string;
    onchange: (value: T) => void;
    tone?: 'accent' | 'warn';
  } = $props();
</script>

<div class="seg {tone}" role="group" aria-label={label}>
  {#each options as o}
    <button type="button" class:on={o.value === value} aria-pressed={o.value === value}
      title={o.title ?? o.label} onclick={() => onchange(o.value)}>{o.label}</button>
  {/each}
</div>
<span class="fold"><Dropdown {options} {value} {label} {onchange} /></span>

<style>
  .seg { display: inline-flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; height: 30px; }
  button {
    background: none; border: none; border-left: 1px solid var(--line); padding: 0 9px; min-width: 34px;
    color: var(--dim); font: 600 11px/1 var(--mono); cursor: pointer; transition: color .15s, background .15s;
  }
  button:first-child { border-left: none; }
  button:hover { color: var(--text); background: rgba(120, 200, 255, .06); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  button.on { color: var(--accent-hi); background: rgba(94, 200, 255, .16); }
  .warn button.on { color: var(--warn-hi); background: rgba(255, 170, 70, .16); }
  .fold { display: none; }
  /* narrow screens: folded into a dropdown (same breakpoint as the chapter switcher) */
  @media (max-width: 1400px) { .seg { display: none; } .fold { display: inline-block; } }
  @media (prefers-reduced-motion: reduce) { button { transition: none; } }
</style>

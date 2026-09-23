<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon, { type IconName } from './Icon.svelte';

  let { icon, label, title, onclick, pressed, tone = 'accent', compact = false, children }: {
    icon?: IconName;
    label: string;          // accessible name; also the visible text unless children are given
    title?: string;
    onclick: () => void;
    pressed?: boolean;      // set → toggle button semantics
    tone?: 'accent' | 'warn';
    compact?: boolean;      // icon only
    children?: Snippet;
  } = $props();
</script>

<button type="button" class="btn {tone}" class:on={pressed} class:compact
  aria-label={label} aria-pressed={pressed} title={title ?? label} {onclick}>
  {#if icon}<Icon name={icon} />{/if}
  {#if children}{@render children()}{:else if !compact}<span>{label}</span>{/if}
</button>

<style>
  .btn {
    display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px;
    background: rgba(120, 200, 255, .04); border: 1px solid var(--line); border-radius: 6px;
    color: var(--dim); font: 600 11px/1 var(--sans); letter-spacing: .08em; text-transform: uppercase;
    cursor: pointer; transition: color .15s, border-color .15s, background .15s, box-shadow .15s;
    white-space: nowrap;
  }
  .btn.compact { width: 30px; padding: 0; justify-content: center; }
  .btn:hover { color: var(--text); border-color: var(--line-hi); }
  .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .btn.on { color: var(--accent-hi); border-color: var(--accent); background: rgba(94, 200, 255, .14);
    box-shadow: inset 0 0 10px rgba(94, 200, 255, .18); }
  .btn.warn.on { color: var(--warn-hi); border-color: var(--warn); background: rgba(255, 170, 70, .14);
    box-shadow: inset 0 0 10px rgba(255, 170, 70, .18); }
  @media (prefers-reduced-motion: reduce) { .btn { transition: none; } }
</style>

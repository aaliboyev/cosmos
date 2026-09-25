<script lang="ts" generics="T">
  /* A one-of-many picker folded into a button and an upward list: the narrow-screen
     form of Segmented and the chapter switcher. */
  let { options, value, label, onchange, placeholder = '—' }: {
    options: readonly { value: T; label: string; hint?: string }[];
    value: T | null;
    label: string;
    onchange: (value: T) => void;
    placeholder?: string;
  } = $props();

  let open = $state(false);
  let root: HTMLDivElement;
  const current = $derived(options.find(o => o.value === value));

  function pick(v: T) {
    open = false;
    onchange(v);
  }
  function onwindowdown(e: PointerEvent) {
    if (open && !root.contains(e.target as Node)) open = false;
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) { open = false; e.stopPropagation(); }
  }
</script>

<svelte:window onpointerdown={onwindowdown} />

<div class="dd" bind:this={root} {onkeydown} role="presentation">
  <button type="button" class="face" class:open aria-haspopup="listbox" aria-expanded={open} aria-label={label}
    title={label} onclick={() => (open = !open)}>
    <span>{current?.label ?? placeholder}</span>
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 6.5 5 3.5l3 3" /></svg>
  </button>
  {#if open}
    <ul role="listbox" aria-label={label}>
      {#each options as o}
        <li role="option" aria-selected={o.value === value}>
          <button type="button" class:on={o.value === value} onclick={() => pick(o.value)}>
            {#if o.hint}<span class="hint">{o.hint}</span>{/if}{o.label}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .dd { position: relative; display: inline-block; }
  .face {
    display: inline-flex; align-items: center; gap: 8px; height: 30px; padding: 0 9px 0 10px;
    background: rgba(94, 200, 255, .1); border: 1px solid var(--line); border-radius: 6px;
    color: var(--accent-hi); font: 600 11px/1 var(--mono); letter-spacing: .06em; text-transform: uppercase;
    cursor: pointer; white-space: nowrap;
  }
  .face:hover, .face.open { border-color: var(--line-hi); }
  .face:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  svg { fill: none; stroke: var(--dim); stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
  .face:not(.open) svg { transform: rotate(180deg); }
  ul {
    position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%); z-index: 1;
    min-width: 100%; margin: 0; padding: 4px; list-style: none;
    background: var(--glass-solid); border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow);
  }
  li button {
    display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 10px; border: none; border-radius: 5px;
    background: none; color: var(--dim); font: 600 11px/1 var(--mono); letter-spacing: .06em; text-transform: uppercase;
    text-align: left; white-space: nowrap; cursor: pointer;
  }
  li button:hover { color: var(--text); background: rgba(120, 200, 255, .06); }
  li button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  li button.on { color: var(--accent-hi); background: rgba(94, 200, 255, .16); }
  .hint { color: var(--accent); opacity: .8; }
</style>

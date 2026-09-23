<script lang="ts" module>
  export interface Readout { label: string; value: string; tone?: 'name' | 'mode' }
</script>

<script lang="ts">
  let { rows, throttle = null, onthrottle, label = 'Flight instruments' }: {
    rows: readonly Readout[];
    throttle?: number | null;       // null hides the gauge
    onthrottle?: (v: number) => void;
    label?: string;
  } = $props();
</script>

<aside class="instruments" aria-label={label}>
  {#if throttle !== null}
    <div class="throttle">
      <input type="range" min="0" max="1" step="0.01" value={throttle} aria-label="Throttle"
        oninput={e => onthrottle?.(+e.currentTarget.value)} />
      <div class="bar" aria-hidden="true"><div class="fill" style:height="{throttle * 100}%"></div></div>
      <span class="cap">THR</span>
    </div>
  {/if}
  <dl>
    {#each rows as r}
      <dt>{r.label}</dt><dd class={r.tone}>{r.value}</dd>
    {/each}
  </dl>
</aside>

<style>
  .instruments {
    position: fixed; z-index: 10; left: 16px; top: 50%; transform: translateY(-50%);
    display: flex; gap: 12px; padding: 12px 14px 12px 10px;
    background: var(--glass); border: 1px solid var(--line); border-radius: 10px;
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: var(--shadow);
  }
  .throttle { position: relative; width: 14px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .bar { position: relative; flex: 1; width: 6px; min-height: 120px; border: 1px solid var(--line); border-radius: 3px; overflow: hidden; }
  .fill { position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(to top, var(--accent), var(--accent-hi)); opacity: .75; }
  /* the range input sits over the bar so the whole gauge is draggable */
  input {
    position: absolute; top: 0; bottom: 18px; left: 50%; width: 22px; transform: translateX(-50%);
    writing-mode: vertical-lr; direction: rtl; opacity: 0; cursor: ns-resize; margin: 0;
  }
  input:focus-visible + .bar { outline: 2px solid var(--accent); outline-offset: 2px; }
  .cap { font: 600 9px/1 var(--mono); letter-spacing: .1em; color: var(--dim); }
  dl { display: grid; grid-template-columns: auto auto; gap: 4px 12px; align-content: center;
    font: 11px/1.2 var(--mono); font-variant-numeric: tabular-nums; }
  dt { color: var(--dim); letter-spacing: .1em; font-size: 9.5px; align-self: center; }
  dd { color: var(--text); text-align: right; min-width: 78px; }
  dd.name { color: var(--accent-hi); text-transform: uppercase; letter-spacing: .06em; }
  dd.mode { color: var(--accent-hi); }
  @media (max-width: 700px) { .instruments { display: none; } }
</style>

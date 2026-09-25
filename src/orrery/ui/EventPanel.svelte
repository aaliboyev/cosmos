<script lang="ts">
  import { activeEvent } from '../state';
  import Icon from '../../ui/common/Icon.svelte';

  const stamp = (iso: string) => iso.slice(0, 10) + ' · ' + iso.slice(11, 16) + ' UTC';
</script>

{#if $activeEvent}
  {@const ev = $activeEvent}
  <aside class="event" aria-label="Event">
    <header>
      <span class="tag">EVENT</span>
      <button type="button" class="close" aria-label="Close" onclick={() => activeEvent.set(null)}><Icon name="close" size={14} /></button>
    </header>
    <h2>{ev.title}</h2>
    <div class="kind">{ev.kind}</div>
    <div class="when">{stamp(ev.time)}</div>
    <dl>
      {#each ev.facts as [label, value]}
        <dt>{label.toUpperCase()}</dt><dd>{value}</dd>
      {/each}
    </dl>
    {#each ev.text as p}<p>{p}</p>{/each}
    {#if ev.tip}<p class="tip"><span>TRY</span>{ev.tip}</p>{/if}
  </aside>
{/if}

<style>
  .event {
    padding: 14px 18px 16px; overflow: auto; min-height: 0;
    background: var(--glass); border: 1px solid var(--line); border-radius: 10px;
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: var(--shadow);
    border-left: 2px solid var(--warn);
  }
  header { display: flex; justify-content: space-between; align-items: center; }
  .tag { font: 600 9.5px/1 var(--mono); letter-spacing: .24em; color: var(--warn-hi); }
  .close { background: none; border: none; color: var(--dim); cursor: pointer; padding: 4px; margin: -4px; border-radius: 4px; }
  .close:hover { color: var(--text); }
  .close:focus-visible { outline: 2px solid var(--accent); }
  h2 { margin-top: 8px; font-size: 18px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; line-height: 1.25; }
  .kind { font-size: 10px; letter-spacing: .2em; color: var(--dim); text-transform: uppercase; margin-top: 3px; }
  .when { margin-top: 8px; font: 11.5px var(--mono); font-variant-numeric: tabular-nums; color: var(--warn-hi); }
  dl { margin-top: 12px; display: grid; grid-template-columns: auto 1fr; gap: 5px 12px; border-top: 1px solid var(--line); padding-top: 10px; }
  dt { font: 9.5px/1.4 var(--mono); letter-spacing: .12em; color: var(--dim); }
  dd { font: 11.5px/1.4 var(--mono); text-align: right; }
  p { margin-top: 10px; font-size: 12.5px; line-height: 1.55; color: var(--soft); }
  .tip { padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; background: rgba(120, 200, 255, .04); font-size: 12px; }
  .tip span { display: block; margin-bottom: 4px; font: 600 9px/1 var(--mono); letter-spacing: .24em; color: var(--accent); }
</style>

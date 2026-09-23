<script lang="ts">
  import { actions, selected, selectedDistance } from '../state';
  import Button from '../../ui/common/Button.svelte';
  import Icon from '../../ui/common/Icon.svelte';
</script>

{#if $selected}
  <aside class="target" aria-label="Target">
    <header>
      <span class="tag">TARGET</span>
      <button type="button" class="close" aria-label="Close" onclick={() => actions.select(null)}><Icon name="close" size={14} /></button>
    </header>
    <h2>{$selected.name}</h2>
    <div class="kind">{$selected.kind}</div>
    <dl>
      <dt>RADIUS</dt><dd>{$selected.radiusKm.toLocaleString('en-US')} km</dd>
      <dt>DAY</dt><dd>{$selected.day}</dd>
      <dt>YEAR</dt><dd>{$selected.year}</dd>
      <dt>{$selected.parent ? `FROM ${$selected.parent.toUpperCase()}` : 'SUN DIST'}</dt><dd>{$selectedDistance}</dd>
      {#if $selected.moons}
        <dt title="Known moons, JPL Solar System Dynamics">MOONS</dt>
        <dd>{$selected.moons.known} known{$selected.moons.retrograde ? ` · ${$selected.moons.retrograde} retrograde` : ''}</dd>
      {/if}
    </dl>
    <p class="note">{$selected.note}</p>
    <div class="actions">
      <Button icon="flyTo" label="Fly to" onclick={() => actions.focus($selected!.name)} />
      <Button icon="release" label="Release" onclick={actions.release} />
    </div>
  </aside>
{/if}

<style>
  .target {
    position: fixed; z-index: 10; top: 16px; right: 16px; width: 268px; padding: 12px 16px 14px;
    background: var(--glass); border: 1px solid var(--line); border-radius: 10px;
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: var(--shadow);
    border-left: 2px solid var(--accent);
  }
  header { display: flex; justify-content: space-between; align-items: center; }
  .tag { font: 600 9.5px/1 var(--mono); letter-spacing: .24em; color: var(--accent); }
  .close { background: none; border: none; color: var(--dim); cursor: pointer; padding: 4px; margin: -4px; border-radius: 4px; }
  .close:hover { color: var(--text); }
  .close:focus-visible { outline: 2px solid var(--accent); }
  h2 { margin-top: 6px; font-size: 19px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
  .kind { font-size: 10px; letter-spacing: .2em; color: var(--dim); text-transform: uppercase; margin-top: 2px; }
  dl { margin-top: 12px; display: grid; grid-template-columns: auto 1fr; gap: 5px 12px; border-top: 1px solid var(--line); padding-top: 10px; }
  dt { font: 9.5px/1.4 var(--mono); letter-spacing: .12em; color: var(--dim); }
  dd { font: 11.5px/1.4 var(--mono); text-align: right; font-variant-numeric: tabular-nums; }
  .note { margin-top: 10px; font-size: 12px; line-height: 1.5; color: var(--soft); font-style: italic; }
  .actions { margin-top: 12px; display: flex; gap: 6px; }
  @media (max-width: 700px) {
    .target { top: auto; bottom: 150px; left: 10px; right: 10px; width: auto; }
    .note { display: none; }
  }
</style>

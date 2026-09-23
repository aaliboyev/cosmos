<script lang="ts">
  import type { Control } from '../../shared/camera';
  import Icon from './Icon.svelte';

  let { controls, credit, onclose }: { controls: readonly Control[]; credit?: string; onclose: () => void } = $props();
</script>

<div class="scrim" role="presentation" onclick={onclose}>
  <div class="help" role="dialog" aria-modal="true" aria-label="Controls" tabindex="-1"
    onclick={e => e.stopPropagation()} onkeydown={e => e.key === 'Escape' && onclose()}>
    <header>
      <span class="tag">CONTROLS</span>
      <button type="button" class="close" aria-label="Close" onclick={onclose}><Icon name="close" size={14} /></button>
    </header>
    <dl>
      {#each controls as c}
        <dt><kbd>{c.keys}</kbd></dt><dd>{c.action}</dd>
      {/each}
    </dl>
    {#if credit}<p class="credit">{credit}</p>{/if}
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; background: rgba(0, 2, 8, .45); }
  .help {
    width: min(460px, calc(100vw - 24px)); max-height: calc(100vh - 40px); overflow: auto; padding: 14px 18px 16px;
    background: var(--glass-solid); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow);
    border-top: 2px solid var(--accent);
  }
  .help:focus { outline: none; }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .tag { font: 600 9.5px/1 var(--mono); letter-spacing: .24em; color: var(--accent); }
  .close { background: none; border: none; color: var(--dim); cursor: pointer; padding: 4px; margin: -4px; }
  .close:hover { color: var(--text); }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; align-items: center; }
  kbd {
    display: inline-block; font: 600 10.5px/1 var(--mono); color: var(--accent-hi); white-space: nowrap;
    border: 1px solid var(--line-hi); border-radius: 4px; padding: 4px 6px; background: rgba(94, 200, 255, .06);
  }
  dd { font-size: 12.5px; color: var(--soft); }
  .credit { margin-top: 14px; font-size: 10px; letter-spacing: .08em; color: var(--dim); }
</style>

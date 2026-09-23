<script lang="ts">
  import type { Leader } from '../state';

  let { leaders }: { leaders: readonly Leader[] } = $props();
</script>

<aside class="board" aria-label="Largest bodies">
  <span class="tag">LARGEST BODIES</span>
  <ol>
    {#each leaders as l, rank}
      <li class:first={rank === 0}>
        <span class="rank">#{rank + 1}</span>
        <span class="mass">{l.massEarth.toFixed(2)} M⊕</span>
        <span class="r">r {l.r}</span>
      </li>
    {/each}
  </ol>
</aside>

<style>
  .board {
    position: fixed; z-index: 10; top: 16px; right: 16px; width: 236px; padding: 14px 16px;
    background: var(--glass); border: 1px solid var(--line); border-left: 2px solid var(--accent); border-radius: 10px;
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: var(--shadow);
  }
  .tag { font: 600 9.5px/1 var(--mono); letter-spacing: .24em; color: var(--accent); }
  ol { list-style: none; margin-top: 10px; border-top: 1px solid var(--line); padding-top: 8px; }
  li { display: grid; grid-template-columns: 28px 1fr auto; gap: 8px; padding: 3px 0;
    font: 11.5px/1.3 var(--mono); font-variant-numeric: tabular-nums; color: var(--soft); }
  li.first { color: var(--accent-hi); }
  .rank { color: var(--dim); }
  .r { color: var(--dim); }
  @media (max-width: 700px) { .board { display: none; } }
</style>

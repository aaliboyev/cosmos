<script lang="ts">
  import type { Leader } from '../worker';

  let { leaders, onpick }: { leaders: readonly Leader[]; onpick: (id: number) => void } = $props();

  const mass = (m: number) => (m < 1 ? m.toFixed(3) : m.toFixed(1)) + ' M⊕';
</script>

<aside class="board" aria-label="Largest bodies">
  <span class="tag">LARGEST BODIES</span>
  <ol>
    {#each leaders as l, rank (l.id)}
      <li class:first={rank === 0}>
        <button type="button" onclick={() => onpick(l.id)} title="Fly to this body">
          <span class="rank">#{rank + 1}</span>
          <span class="mass">{mass(l.massEarth)}{#if l.gasEarth >= 1}<span class="gas"> · gas giant</span>{/if}</span>
          <span class="orbit">{l.a.toFixed(2)} AU · e {l.e.toFixed(3)}</span>
          <span class="bar" aria-label="ice fraction {Math.round(l.ice * 100)}%"><span style:width="{Math.round(l.ice / 0.76 * 100)}%"></span></span>
        </button>
      </li>
    {/each}
  </ol>
  <p class="legend"><span class="rock"></span>rock <span class="ice"></span>ice</p>
</aside>

<style>
  .board {
    position: fixed; z-index: 10; top: 58px; right: 16px; width: 256px; padding: 14px 16px 12px;
    background: var(--glass); border: 1px solid var(--line); border-left: 2px solid var(--accent); border-radius: 10px;
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: var(--shadow);
  }
  .tag { font: 600 9.5px/1 var(--mono); letter-spacing: .24em; color: var(--accent); }
  ol { list-style: none; margin-top: 10px; border-top: 1px solid var(--line); padding-top: 6px; }
  button {
    all: unset; box-sizing: border-box; width: 100%; cursor: pointer; display: grid;
    grid-template-columns: 26px 1fr; grid-template-rows: auto auto auto; column-gap: 8px; padding: 5px 4px; border-radius: 6px;
    font: 11.5px/1.35 var(--mono); font-variant-numeric: tabular-nums; color: var(--soft);
  }
  button:hover { background: rgba(143, 178, 255, .08); }
  button:focus-visible { outline: 1px solid var(--accent); }
  .first button { color: var(--accent-hi); }
  .rank { grid-row: 1 / span 3; color: var(--dim); }
  .gas { color: #e8c48f; }
  .orbit { color: var(--dim); font-size: 10.5px; }
  .bar { height: 3px; margin-top: 3px; background: #9d8066; border-radius: 2px; overflow: hidden; }
  .bar span { display: block; height: 100%; background: #d6e5ff; }
  .legend { margin-top: 8px; font: 9.5px/1 var(--mono); letter-spacing: .12em; color: var(--dim); display: flex; gap: 6px; align-items: center; }
  .legend span { width: 8px; height: 3px; border-radius: 2px; display: inline-block; }
  .legend .rock { background: #9d8066; }
  .legend .ice { background: #d6e5ff; margin-left: 6px; }
  @media (max-width: 700px) { .board { display: none; } }
</style>

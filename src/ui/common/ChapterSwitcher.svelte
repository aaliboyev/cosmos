<script lang="ts">
  import { CHAPTERS, chapterHref, type ChapterId } from './chapters';
  import Dropdown from './Dropdown.svelte';

  let { current }: { current: ChapterId } = $props();
  const options = CHAPTERS.map(c => ({ value: c.id, label: c.label, hint: String(c.key) }));
</script>

<nav class="chapters" aria-label="Chapters">
  {#each CHAPTERS as c}
    <a href={chapterHref(current, c.id)} class:on={c.id === current} aria-current={c.id === current ? 'page' : undefined}
      title="{c.label} ({c.key})"><span class="n">{c.key}</span>{c.label}</a>
  {/each}
</nav>
<span class="fold">
  <Dropdown {options} value={current} label="Chapter" onchange={id => { location.href = chapterHref(current, id); }} />
</span>

<style>
  .chapters { display: inline-flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; height: 30px; }
  a {
    display: inline-flex; align-items: center; gap: 6px; padding: 0 10px; border-left: 1px solid var(--line);
    color: var(--dim); font: 600 10.5px/1 var(--sans); letter-spacing: .1em; text-transform: uppercase;
    text-decoration: none; white-space: nowrap; transition: color .15s, background .15s;
  }
  a:first-child { border-left: none; }
  a:hover { color: var(--text); background: rgba(120, 200, 255, .06); }
  a:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  a.on { color: var(--accent-hi); background: rgba(94, 200, 255, .16); }
  .n { font: 600 10px/1 var(--mono); color: var(--accent); opacity: .8; }
  .fold { display: none; }
  @media (max-width: 1400px) { .chapters { display: none; } .fold { display: inline-block; } }
  @media (prefers-reduced-motion: reduce) { a { transition: none; } }
</style>

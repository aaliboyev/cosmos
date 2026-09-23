<script lang="ts">
  import type { Snippet } from 'svelte';
  import ChapterSwitcher from './ChapterSwitcher.svelte';
  import type { ChapterId } from './chapters';

  let { chapter, children }: { chapter: ChapterId; children: Snippet } = $props();
</script>

<!-- sections and separators come from the page; layout rules for them live here -->
<div class="console">
  {@render children()}
  <span class="sep" aria-hidden="true"></span>
  <section aria-label="Chapter"><ChapterSwitcher current={chapter} /></section>
</div>

<style>
  .console {
    position: fixed; z-index: 10; bottom: 16px; left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 12px; padding: 9px 12px; max-width: calc(100vw - 24px);
    background: var(--glass); border: 1px solid var(--line); border-radius: 10px;
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: var(--shadow);
  }
  /* notched top edge: the console reads as a dash panel, not a floating card */
  .console::before {
    content: ''; position: absolute; top: -1px; left: 50%; width: 120px; height: 2px;
    transform: translateX(-50%); background: var(--accent); opacity: .6; border-radius: 2px;
  }
  .console :global(section) { display: flex; align-items: center; gap: 6px; }
  .console :global(.cluster) { display: flex; gap: 3px; }
  .console :global(.sep) { width: 1px; align-self: stretch; background: var(--line); }

  @media (max-width: 1100px) {
    .console { flex-wrap: wrap; justify-content: center; row-gap: 8px; bottom: 10px; width: max-content; }
    .console :global(section) { flex-wrap: wrap; justify-content: center; row-gap: 8px; }
    .console :global(.sep) { display: none; }
  }
</style>

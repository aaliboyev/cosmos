<script lang="ts">
  let { text }: { text: string } = $props();
</script>

<!-- the current stage of a simulation, top centre, announced politely when it changes -->
<div class="caption" aria-live="polite">{text}</div>

<style>
  .caption {
    position: fixed; z-index: 10; top: 22px; left: 50%; transform: translateX(-50%); max-width: min(720px, 60vw);
    padding: 7px 14px; text-align: center; pointer-events: none;
    font: 600 10.5px/1.4 var(--mono); letter-spacing: .16em; color: var(--accent-hi); text-transform: uppercase;
    background: var(--glass); border: 1px solid var(--line); border-radius: 8px;
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  }
  @media (max-width: 700px) { .caption { top: 64px; max-width: calc(100vw - 32px); } }
</style>

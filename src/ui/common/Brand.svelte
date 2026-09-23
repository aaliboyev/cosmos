<script lang="ts">
  let { sub, status, warn = false }: { sub: string; status: string; warn?: boolean } = $props();
</script>

<div class="brand">
  <h1>COSMOS</h1>
  <div class="sub">{sub} <span aria-hidden="true">·</span> <b class:rev={warn}>{status}</b></div>
</div>

<style>
  .brand { position: fixed; z-index: 10; top: 22px; left: 26px; pointer-events: none; }
  h1 { font-size: 15px; font-weight: 700; letter-spacing: .42em; color: var(--text); }
  .sub { margin-top: 4px; font: 10px/1 var(--mono); letter-spacing: .16em; color: var(--dim); }
  .sub b { color: var(--accent-hi); font-weight: 600; text-transform: uppercase; }
  .sub b.rev { color: var(--warn-hi); }
</style>

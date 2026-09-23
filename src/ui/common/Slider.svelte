<script lang="ts">
  let { label, value, min, max, step = 0.01, digits = 2, oninput }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    digits?: number;
    oninput: (v: number) => void;
  } = $props();
</script>

<label class="slider">
  <span class="head"><span class="name">{label}</span><output>{value.toFixed(digits)}</output></span>
  <input type="range" {min} {max} {step} {value} oninput={e => oninput(+e.currentTarget.value)} />
</label>

<style>
  .slider { display: flex; flex-direction: column; gap: 4px; min-width: 150px; }
  .head { display: flex; justify-content: space-between; gap: 10px; }
  .name { font: 600 9.5px/1 var(--mono); letter-spacing: .14em; color: var(--dim); text-transform: uppercase; white-space: nowrap; }
  output { font: 600 10.5px/1 var(--mono); color: var(--accent-hi); font-variant-numeric: tabular-nums; }
  input { accent-color: var(--accent); cursor: pointer; height: 14px; margin: 0; }
  input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>

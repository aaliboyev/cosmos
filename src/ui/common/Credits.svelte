<script lang="ts">
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  let open = $state(false);

  const SOURCES: [string, string][] = [
    ['Planet positions', 'JPL approximate Keplerian elements (Standish)'],
    ['The Moon', 'Meeus, Astronomical Algorithms, ch. 47'],
    ['Rotation and poles', 'IAU WGCCRE (Archinal et al. 2018)'],
    ['Moons', 'NASA/JPL-Caltech Solar System Dynamics'],
    ['Stars', 'Yale Bright Star Catalogue, 5th ed., via CDS'],
  ];
  const IMAGES: [string, string][] = [
    ['Milky Way', 'ESO/S. Brunier, CC BY 4.0'],
    ['Planet, Sun and Moon maps', 'Solar System Scope, CC BY 4.0'],
    ['Earth', 'NASA Blue Marble; relief, specular and clouds from the three.js examples (MIT)'],
    ['Pluto', 'NASA/JHUAPL/SwRI New Horizons, via USGS'],
    ['Constellations', 'd3-celestial by Olaf Frohn, BSD-3-Clause'],
  ];
</script>

<div class="credits-btn">
  <Button icon="info" label="Credits" pressed={open} onclick={() => (open = !open)} />
</div>

{#if open}
  <aside class="credits" aria-label="Credits">
    <header>
      <span class="tag">CREDITS</span>
      <button type="button" class="close" aria-label="Close" onclick={() => (open = false)}><Icon name="close" size={14} /></button>
    </header>
    <h2>Cosmos</h2>
    <p class="by">Made with <span class="heart" aria-label="love">♥</span> by <b>Abror Aliboyev</b> and <b>Claude Opus 5.5</b></p>
    <ul class="links">
      <li><a href="https://aliboyev.com" target="_blank" rel="noopener">aliboyev.com</a></li>
      <li><a href="mailto:abror@aliboyev.com">abror@aliboyev.com</a></li>
      <li><a href="https://github.com/aaliboyev/cosmos" target="_blank" rel="noopener">github.com/aaliboyev/cosmos</a></li>
    </ul>

    <h3>Built with</h3>
    <p class="stack">Three.js · Svelte · Vite · TypeScript</p>

    <h3>Science</h3>
    <dl>
      {#each SOURCES as [what, from]}<dt>{what}</dt><dd>{from}</dd>{/each}
    </dl>

    <h3>Imagery</h3>
    <dl>
      {#each IMAGES as [what, from]}<dt>{what}</dt><dd>{from}</dd>{/each}
    </dl>

    <p class="license">Code is MIT. Images and data keep their own licenses.</p>
  </aside>
{/if}

<style>
  .credits-btn { position: fixed; z-index: 11; top: 16px; right: 16px; }
  .credits {
    position: fixed; z-index: 11; top: 58px; right: 16px; width: 320px; max-height: calc(100vh - 150px); overflow: auto;
    padding: 14px 18px 16px;
    background: var(--glass-solid); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow);
    backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-left: 2px solid var(--accent);
  }
  header { display: flex; justify-content: space-between; align-items: center; }
  .tag { font: 600 9.5px/1 var(--mono); letter-spacing: .24em; color: var(--accent); }
  .close { background: none; border: none; color: var(--dim); cursor: pointer; padding: 4px; margin: -4px; border-radius: 4px; }
  .close:hover { color: var(--text); }
  .close:focus-visible { outline: 2px solid var(--accent); }
  h2 { margin-top: 8px; font-size: 19px; font-weight: 700; letter-spacing: .42em; text-transform: uppercase; }
  .by { margin-top: 6px; font-size: 13px; color: var(--soft); }
  .by b { color: var(--text); font-weight: 600; }
  .heart { color: #ff6b81; }
  .links { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  a { font: 12px var(--mono); color: var(--accent-hi); text-decoration: none; }
  a:hover { text-decoration: underline; }
  a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 2px; }
  h3 {
    margin-top: 16px; padding-top: 10px; border-top: 1px solid var(--line);
    font: 600 9.5px/1 var(--mono); letter-spacing: .2em; color: var(--dim); text-transform: uppercase;
  }
  .stack { margin-top: 8px; font: 12px var(--mono); color: var(--text); }
  dl { margin-top: 8px; display: grid; gap: 2px; }
  dt { margin-top: 6px; font-size: 10.5px; letter-spacing: .08em; color: var(--dim); text-transform: uppercase; }
  dd { font-size: 12px; line-height: 1.45; color: var(--soft); }
  .license { margin-top: 16px; font-size: 11px; color: var(--dim); }
  @media (max-width: 700px) { .credits { left: 10px; right: 10px; width: auto; } }
</style>

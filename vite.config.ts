import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export const PAGES = {
  orrery: resolve(import.meta.dirname, 'index.html'),
  nebula: resolve(import.meta.dirname, 'nebula/index.html'),
  accretion: resolve(import.meta.dirname, 'accretion/index.html'),
};

// BUILD=web: one multi-page build with separate assets, for hosting.
// Otherwise each page builds to one self-contained HTML file (opens from file://);
// the single-file plugin takes one input per build, so PAGE selects it.
const web = process.env.BUILD === 'web';
const page = (process.env.PAGE ?? 'orrery') as keyof typeof PAGES;

const TITLE = 'COSMOS — The Solar System';
const DESCRIPTION = 'The solar system in the browser: real ephemeris, IAU orientation, JPL moons and the catalog sky, positioned for real time.';

/** Link-preview tags for the orrery page. Crawlers need absolute image URLs, so
    og:image and og:url are emitted only when SITE_URL is set. */
function shareMeta(siteUrl: string): Plugin {
  const base = siteUrl && (siteUrl.endsWith('/') ? siteUrl : siteUrl + '/');
  const tags = [
    ['property', 'og:type', 'website'],
    ['property', 'og:title', TITLE],
    ['property', 'og:description', DESCRIPTION],
    ['name', 'description', DESCRIPTION],
    ['name', 'twitter:card', 'summary_large_image'],
    ...(base ? [
      ['property', 'og:url', base],
      ['property', 'og:image', base + 'og.jpg'],
      ['property', 'og:image:width', '1280'],
      ['property', 'og:image:height', '640'],
    ] : []),
  ];
  return {
    name: 'share-meta',
    transformIndexHtml(html, ctx) {
      if (resolve(ctx.filename) !== PAGES.orrery) return html;
      return tags.map(([attr, key, content]) => ({ tag: 'meta', attrs: { [attr]: key, content }, injectTo: 'head' as const }));
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [svelte(), shareMeta(loadEnv(mode, process.cwd(), '').SITE_URL ?? ''), ...(web ? [] : [viteSingleFile()])],
  build: web
    ? { outDir: 'dist/web', emptyOutDir: true, rollupOptions: { input: PAGES } }
    : { emptyOutDir: false, rollupOptions: { input: PAGES[page] } },
}));

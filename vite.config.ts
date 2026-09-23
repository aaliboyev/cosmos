import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
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

export default defineConfig({
  base: './',
  plugins: web ? [svelte()] : [svelte(), viteSingleFile()],
  build: web
    ? { outDir: 'dist/web', emptyOutDir: true, rollupOptions: { input: PAGES } }
    : { emptyOutDir: false, rollupOptions: { input: PAGES[page] } },
});

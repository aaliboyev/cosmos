// Builds every page as a standalone single-file HTML under dist/.
import { rmSync } from 'node:fs';
import { build } from 'vite';

rmSync('dist', { recursive: true, force: true });
for (const page of ['orrery', 'nebula', 'accretion']) {
  process.env.PAGE = page;
  await build({ logLevel: 'warn' });
}

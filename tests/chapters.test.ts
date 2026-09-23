import { describe, expect, it } from 'vitest';
import { CHAPTERS, chapterHref } from '../src/ui/common/chapters';

// page location in each layout; links must land on the sibling page's file
const LAYOUTS: Record<string, Record<string, string>> = {
  dev: { orrery: 'http://h/', nebula: 'http://h/nebula/', accretion: 'http://h/accretion/' },
  hosted: { orrery: 'https://h/cosmos/index.html', nebula: 'https://h/cosmos/nebula/index.html', accretion: 'https://h/cosmos/accretion/index.html' },
  file: { orrery: 'file:///d/dist/index.html', nebula: 'file:///d/dist/nebula/index.html', accretion: 'file:///d/dist/accretion/index.html' },
};

describe('chapter links', () => {
  for (const [layout, pages] of Object.entries(LAYOUTS)) {
    it(`resolve to each page's file in the ${layout} layout`, () => {
      const root = new URL('.', pages.orrery).href;
      for (const from of CHAPTERS) {
        for (const to of CHAPTERS) {
          const url = new URL(chapterHref(from.id, to.id), pages[from.id]).href;
          expect(url).toBe(root + to.path);
        }
      }
    });
  }
});

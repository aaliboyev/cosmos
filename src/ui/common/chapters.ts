/* The three pages as one sequence. Links are relative and name the file, so they
   resolve the same in the dev server, the hosted build and the single-file build
   opened from disk (file:// has no directory index). */
export type ChapterId = 'nebula' | 'accretion' | 'orrery';

export const CHAPTERS: readonly { id: ChapterId; key: string; label: string; path: string }[] = [
  { id: 'nebula', key: '1', label: 'Nebula', path: 'nebula/index.html' },
  { id: 'accretion', key: '2', label: 'Accretion', path: 'accretion/index.html' },
  { id: 'orrery', key: '3', label: 'Solar System', path: 'index.html' },
];

/** Relative link from page `from` to page `to`: the orrery sits at the root, the others one level down. */
export const chapterHref = (from: ChapterId, to: ChapterId): string =>
  (from === 'orrery' ? '' : '../') + CHAPTERS.find(c => c.id === to)!.path;

/** Handles the 1/2/3 keys; returns whether the event was used. */
export function chapterKey(e: KeyboardEvent, from: ChapterId): boolean {
  const c = CHAPTERS.find(ch => ch.key === e.key);
  if (!c || c.id === from) return false;
  location.href = chapterHref(from, c.id);
  return true;
}

export const CHAPTER_CONTROL = { keys: '1 / 2 / 3', action: 'nebula · accretion · solar system' };

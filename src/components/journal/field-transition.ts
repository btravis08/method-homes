/*
  Handoff between the journal field (/journal/alt) and an article:
  the grid stores which image was clicked just before navigating, and
  the article's top claims it on mount to open in fullscreen "field
  entry" mode (the expanded tile becomes the hero, title fading up
  over it). Module state on purpose — it must survive the route
  change but die with the tab.
*/

export interface FieldEntry {
  slug: string;
  src: string;
}

let pending: FieldEntry | null = null;

export function setFieldEntry(entry: FieldEntry) {
  pending = entry;
}

export function takeFieldEntry(slug: string): FieldEntry | null {
  if (pending?.slug !== slug) return null;
  const entry = pending;
  pending = null;
  return entry;
}

/* the article hero announces it has mounted so the grid's expansion
   overlay knows the page beneath is ready */
export const HERO_READY_EVENT = "sdr:article-hero-ready";

/* the overlay announces it covers the whole viewport — only then may
   the article show its fullscreen hero (any earlier and the hero is
   visible around the still-expanding tile, breaking the reveal) */
export const FLIP_COVERED_EVENT = "sdr:field-flip-covered";

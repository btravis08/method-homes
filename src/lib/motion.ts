/*
  The motion vocabulary — every animation in the app speaks these
  tokens instead of restating numbers. Retuning the site's feel is a
  one-line change here.

  (CSS-side twins live inline as cubic-bezier() strings in utility
  classes; keep them in sync when changing an ease.)
*/

/* the house ease: media reveals, sheets, accordions, page chrome */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
/* dramatic in-out: travelling underlines, FLIP flights, viewer moves */
export const EASE_DRAMATIC = [0.85, 0, 0.15, 1] as const;
/* quick settle for small elements (gauge ticks) */
export const EASE_TICK = [0.33, 1, 0.68, 1] as const;

/* duration scale (seconds) */
export const DUR = {
  /* crossfades, swaps */
  fast: 0.25,
  /* accordions, chrome */
  base: 0.4,
  /* media reveals */
  media: 0.9,
  /* long text/mask reveals */
  slow: 1.2,
} as const;

/* shared variants: keyed-layer crossfade (colorway swaps, nav panes) */
export const fadeSwap = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: DUR.fast },
} as const;

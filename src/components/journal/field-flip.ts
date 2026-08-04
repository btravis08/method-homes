"use client";

import { JOURNAL_CATEGORIES } from "@/components/journal/articles";
import {
  FLIP_COVERED_EVENT,
  HERO_READY_EVENT,
  setFieldEntry,
} from "@/components/journal/field-transition";

/*
  Shared FLIP machinery for the journal fields (dark /journal/alt and
  light /journal/alt2): the cover-entry list, the single-flight guard,
  and the compositor-only tile → article-hero expansion overlay.
*/

export interface GridEntry {
  src: string;
  href: string;
}

/* one tile per article COVER: the tile you click, the FLIP, the
   article hero, and any refresh are all the same photo (articles
   sharing a cover with an earlier one don't get their own tile) */
export const ENTRIES: GridEntry[] = (() => {
  const seen = new Map<string, GridEntry>();
  for (const category of JOURNAL_CATEGORIES)
    for (const article of category.articles)
      if (!seen.has(article.hero))
        seen.set(article.hero, {
          src: article.hero,
          href: `/journal/${article.slug}`,
        });
  return [...seen.values()];
})();

/* one transition at a time: further clicks are ignored while an
   overlay is in flight (they stacked replays of the animation) */
let flipInFlight = false;

export function tryBeginFlip(): boolean {
  if (flipInFlight) return false;
  flipInFlight = true;
  /* safety: an aborted navigation must not lock the grid */
  window.setTimeout(() => {
    flipInFlight = false;
  }, 3500);
  return true;
}

/* sampled CSS cubic-bezier — the FLIP bakes its ease into linear
   keyframes so wrap and image stay exact inverses mid-flight */
export function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = (t: number) =>
    3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t * t * x2 + t ** 3;
  const cy = (t: number) =>
    3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t * t * y2 + t ** 3;
  return (x: number) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (cx(mid) < x) lo = mid;
      else hi = mid;
    }
    return cy((lo + hi) / 2);
  };
}

/*
  Hand-rolled FLIP: an imperative overlay (plain DOM, so it survives
  the route change) expands the clicked tile's image from its rect to
  the full viewport while the article loads underneath, then fades
  out over the article's identical fullscreen hero.

  Transforms ONLY: the route change keeps the main thread busy
  hydrating the article, and left/top/width/height tweens run on the
  main thread — on phones they simply froze. The wrap is laid out at
  its final fullscreen size and scaled DOWN to the tile; the inner
  image counter-scales (plus a crop-zoom term so frame one matches
  the tile's own crop), with the ease baked into dense linear
  keyframes so the pair stay exact inverses on the compositor.
*/
export function launchFieldFlip(
  src: string,
  from: { left: number; top: number; width: number; height: number },
  size: { w: number; h: number } | undefined,
) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const wrap = document.createElement("div");
  /* TRANSPARENT on purpose: until the overlay image has painted, the
     identical canvas tile shows through — a background here covered
     the tile with a dark box for the first frames (visible flash) */
  wrap.style.cssText =
    `position:fixed;left:0;top:0;width:${W}px;height:${H}px;` +
    "z-index:80;overflow:hidden;pointer-events:none;" +
    "transform-origin:0 0;will-change:transform;";
  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  /* sync decode: the file is small and warm from the atlas — first
     paint lands with pixels, not a blank frame */
  img.decoding = "sync";
  /* object-fit is a no-op once the element carries the image's own
     dimensions, and it makes every fallback distortion-proof.
     Centering is static px left/top (set in startWith) so the
     animated transform is a PURE scale — Safari won't composite a
     percentage translate inside animated keyframes.
     max-width:none: the global img reset clamps to the containing
     block (the viewport) — that silently shrank any cover wider than
     the screen and the counter-scale then distorted it (the squish) */
  img.style.cssText =
    "position:absolute;object-fit:cover;max-width:none;max-height:none;" +
    "transform-origin:center;will-change:transform;";
  wrap.appendChild(img);
  document.body.appendChild(wrap);

  const sx0 = from.width / W;
  const sy0 = from.height / H;
  /* park the overlay on the tile until dimensions are known */
  wrap.style.transform = `translate(${from.left}px, ${from.top}px) scale(${sx0}, ${sy0})`;

  let expansion: Animation | null = null;
  let started = false;
  /* the image element carries the given box and, per frame, is scaled
     to be exactly the COVER of that frame's window — it can never
     underfill (no dark edges) and its on-screen scale stays uniform
     (no stretch) */
  const startWith = (iw: number, ih: number) => {
    if (started) return;
    started = true;
    img.style.width = `${iw}px`;
    img.style.height = `${ih}px`;
    /* center the natural box in the wrap with px, not % */
    img.style.left = `${(W - iw) / 2}px`;
    img.style.top = `${(H - ih) / 2}px`;
    const ease = bezier(0.85, 0, 0.15, 1); // EASE_DRAMATIC
    const N = 40;
    const wrapFrames = [];
    const imgFrames = [];
    for (let i = 0; i <= N; i++) {
      const p = ease(i / N);
      const sx = sx0 + (1 - sx0) * p;
      const sy = sy0 + (1 - sy0) * p;
      const tx = from.left * (1 - p);
      const ty = from.top * (1 - p);
      /* uniform screen-space cover scale of the current window */
      const k = Math.max((W * sx) / iw, (H * sy) / ih);
      wrapFrames.push({
        transform: `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`,
      });
      imgFrames.push({
        transform: `scale(${k / sx}, ${k / sy})`,
      });
    }
    const timing = { duration: 750, easing: "linear", fill: "forwards" } as const;
    expansion = wrap.animate(wrapFrames, timing);
    const inner = img.animate(imgFrames, timing);
    /* the pair are exact inverses ONLY at the same progress — pin
       both to one start time so they can never drift a frame apart */
    expansion.startTime = document.timeline.currentTime as number;
    inner.startTime = expansion.startTime;
  };
  if (size) startWith(size.w, size.h);
  else if (img.complete && img.naturalWidth)
    startWith(img.naturalWidth, img.naturalHeight);
  else {
    img.onload = () => startWith(img.naturalWidth, img.naturalHeight);
    /* dims never arrived: a viewport-box cover still never distorts
       or underfills — it just skips the tile-crop starting frame */
    window.setTimeout(() => startWith(W, H), 300);
  }

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    flipInFlight = false;
    window.removeEventListener(HERO_READY_EVENT, onReady);
    /* the screen is covered — the article may now show its hero
       beneath; the fade then crosses identical pixels */
    window.dispatchEvent(new CustomEvent(FLIP_COVERED_EVENT));
    const fade = wrap.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 350,
      delay: 60,
      fill: "forwards",
    });
    fade.onfinish = () => wrap.remove();
    window.setTimeout(() => wrap.remove(), 700);
  };
  const onReady = () => {
    /* never fade before the expansion lands */
    (expansion?.finished ?? Promise.resolve())
      .then(() => setTimeout(finish, 80))
      .catch(finish);
  };
  window.addEventListener(HERO_READY_EVENT, onReady);
  /* failsafe: a failed navigation must not leave the screen covered */
  window.setTimeout(finish, 3000);
}

/* the full click → article flow both fields share; returns false if a
   flip is already in flight */
export function flipToArticle(
  entry: GridEntry,
  from: { left: number; top: number; width: number; height: number },
  size: { w: number; h: number } | undefined,
  navigate: (href: string) => void,
  reduced: boolean,
): boolean {
  if (!reduced) {
    if (!tryBeginFlip()) return false;
    try {
      setFieldEntry({
        slug: entry.href.split("/").pop()!,
        src: entry.src,
      });
      launchFieldFlip(entry.src, from, size);
    } catch {
      /* navigate plainly */
    }
  }
  navigate(entry.href);
  return true;
}

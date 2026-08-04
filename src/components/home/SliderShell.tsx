"use client";

import { AnimatePresence, m } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ArrowButton, ArrowSwap } from "@/components/home/ArrowHover";
import { ArrowLeft, ArrowRight } from "@/components/icons";

export interface SliderItem {
  key: string;
  gender?: string;
  card: React.ReactNode;
}

const FADE_S = 0.22;
const STAGGER_S = 0.26;

/* Deterministic pseudo-random in [0,1) — stable during render */
function hash01(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/*
  Slider chrome from the Figma SDR library, made functional:
  - arrows scroll the track by exactly one card width; each arrow is
    disabled when its end of the track is reached
  - when items carry genders, MENS/WOMENS buttons filter the set; the
    outgoing cards fade in random staggered order, then the incoming
    set fades in (Motion AnimatePresence)
  - the track stays natively swipeable on touch
*/
export function SliderShell({
  title,
  titleClassName = "font-display text-title-sm text-ink",
  items,
  variable = false,
  bordered = true,
  cols = "auto-cols-[85%] sm:auto-cols-[45%] lg:auto-cols-[31%] xl:auto-cols-[23.75%]",
  progress: showProgress = true,
  headerClassName = "p-4 md:p-6",
  trackClassName = "",
}: {
  title?: string;
  /* override for label-style headers (e.g. PAIRS WELL WITH) */
  titleClassName?: string;
  items: SliderItem[];
  /* variable: slides size themselves (gallery — natural aspect ratios)
     instead of the uniform card-width grid */
  variable?: boolean;
  /* the hairline above the header (off when the parent draws its own) */
  bordered?: boolean;
  /* responsive auto-cols widths for the track (e.g. wider cards for
     the half-width pairs-well-with rail) */
  cols?: string;
  /* the eased progress line under the track */
  progress?: boolean;
  /* header padding override (flush rails inside padded sections) */
  headerClassName?: string;
  /* extra classes on the track (e.g. the comp's 1.5px top rule) */
  trackClassName?: string;
}) {
  const genders = useMemo(
    () => Array.from(new Set(items.map((i) => i.gender).filter(Boolean))) as string[],
    [items],
  );
  const filterable = genders.length > 1;

  const [gender, setGender] = useState<string | null>(null);
  /* slides gain their Motion wrappers on first filter intent */
  const [filterArmed, setFilterArmed] = useState(false);
  // Bumped per filter click so the stagger order reshuffles each time
  const [generation, setGeneration] = useState(0);
  const visible = useMemo(
    () => (gender ? items.filter((i) => !i.gender || i.gender === gender) : items),
    [items, gender],
  );

  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  // Fraction of the track scrolled past + in view: clientWidth/scrollWidth
  // at the start, 1 at the end
  const [progress, setProgress] = useState(0);
  // a track whose items all fit shows no progress line at all
  const [scrollable, setScrollable] = useState(false);

  const updateArrows = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    setProgress(el.scrollWidth > 0 ? (el.scrollLeft + el.clientWidth) / el.scrollWidth : 1);
    setScrollable(el.scrollWidth > el.clientWidth + 4);
  }, []);

  /* JS snapping. CSS scroll-snap is off entirely — iOS's snap engine
     fought programmatic scrolls (stranding the track) and its
     proximity mode barely snaps, leaving swipes parked mid-card.
     iOS is also unreliable at the two obvious primitives (scroll
     events can go quiet during momentum, and smooth scrollTo around
     momentum gets ignored), so the settle is fully hand-driven: a
     rAF watcher polls scrollLeft until the track is actually still,
     then a rAF glide animates scrollLeft directly to the nearest
     card start, clamped so the last card rests flush right.
     (References below — stepWidth, drag, pending — are declared
     later; the callbacks only run after mount.) */
  const touching = useRef(false);
  const settleRaf = useRef(0);
  const watching = useRef(false);

  const glideTo = useCallback((el: HTMLDivElement, target: number) => {
    const from = el.scrollLeft;
    if (Math.abs(target - from) < 1) return;
    const t0 = performance.now();
    const D = 320;
    const anim = (now: number) => {
      /* a finger or drag reclaims the track instantly */
      if (touching.current || drag.current.active) return;
      const t = Math.min((now - t0) / D, 1);
      el.scrollLeft = from + (target - from) * (1 - Math.pow(1 - t, 3));
      if (t < 1) settleRaf.current = requestAnimationFrame(anim);
    };
    cancelAnimationFrame(settleRaf.current);
    settleRaf.current = requestAnimationFrame(anim);
  }, []);

  const glide = useCallback(
    (el: HTMLDivElement) => {
      const step = stepWidth(el);
      if (step <= 0) return;
      const max = el.scrollWidth - el.clientWidth;
      glideTo(el, Math.min(Math.max(Math.round(el.scrollLeft / step) * step, 0), max));
    },
    [glideTo],
  );

  const settleWatch = useCallback(() => {
    if (watching.current) return;
    const el0 = trackRef.current;
    if (!el0) return;
    watching.current = true;
    let last = el0.scrollLeft;
    let still = 0;
    const tick = () => {
      const el = trackRef.current;
      /* bail under a finger, a mouse drag, or an in-flight arrow
         scroll (which hard-settles on its own) */
      if (!el || touching.current || drag.current.active || pending.current !== null) {
        watching.current = false;
        return;
      }
      const cur = el.scrollLeft;
      if (Math.abs(cur - last) < 0.5) {
        still += 1;
        if (still >= 6) {
          /* ~100ms of stillness: momentum is done, glide home */
          watching.current = false;
          glide(el);
          return;
        }
      } else {
        still = 0;
        last = cur;
      }
      settleRaf.current = requestAnimationFrame(tick);
    };
    settleRaf.current = requestAnimationFrame(tick);
  }, [glide]);

  useEffect(() => {
    updateArrows();
    const el = trackRef.current;
    if (!el) return;
    const onScroll = () => {
      updateArrows();
      /* free scrolls (momentum, trackpad wheel) start the stillness
         watcher; guarded states bail inside settleWatch */
      if (!touching.current) settleWatch();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", updateArrows);
    };
  }, [updateArrows, settleWatch, visible.length]);

  /* One step = distance between consecutive card starts (card width
     plus the 1px gap), so arrows and snap stay exact */
  const stepWidth = (el: HTMLDivElement) => {
    const slides = el.querySelectorAll<HTMLElement>("[data-slide]");
    if (slides.length >= 2) return slides[1].offsetLeft - slides[0].offsetLeft;
    return slides[0]?.offsetWidth ?? el.clientWidth;
  };

  /* Arrows scroll to exact clamped card positions (never relative
     nudges). iOS Safari's snap engine fights smooth programmatic
     scrolls and can strand the track (even parked in overscroll), so
     snapping is suspended for the flight and re-armed after a hard
     settle on the exact target. */
  const snapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /* the in-flight destination — rapid taps step from it, not from the
     mid-animation scroll position, so each tap advances a full card */
  const pending = useRef<number | null>(null);
  const slide = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const step = stepWidth(el);
    if (step <= 0) return;
    const max = el.scrollWidth - el.clientWidth;
    const base = pending.current ?? el.scrollLeft;
    /* few-px tolerance so a settled position counts as its own index */
    const idx =
      dir > 0 ? Math.floor((base + 4) / step) : Math.ceil((base - 4) / step);
    const target = Math.min(Math.max((idx + dir) * step, 0), max);
    pending.current = target;
    el.scrollTo({ left: target, behavior: "smooth" });
    clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => {
      el.scrollTo({ left: target, behavior: "instant" });
      pending.current = null;
      updateArrows();
    }, 650);
  };

  /* a touch mid-flight cancels the pending arrow settle (it would
     yank the track out from under the finger) */
  /* Touch paging (Swiper-style, hand-rolled). The track has
     touch-action: pan-y, so iOS never scrolls it horizontally itself
     — there is no native momentum to fight. Horizontal gestures are
     ours: the finger drives scrollLeft 1:1, and release locks to the
     next/previous card by swipe velocity (or the nearest card for a
     slow drag). Vertical gestures pass through to page scroll. */
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let mode: "h" | "v" | null = null;
    let startX = 0;
    let startY = 0;
    let startScroll = 0;
    let lastX = 0;
    let lastT = 0;
    let vx = 0;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      touching.current = true;
      clearTimeout(snapTimer.current);
      cancelAnimationFrame(settleRaf.current);
      watching.current = false;
      pending.current = null;
      mode = null;
      startX = lastX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startScroll = el.scrollLeft;
      lastT = performance.now();
      vx = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!touching.current || e.touches.length !== 1) return;
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      if (mode === null) {
        const dx = x - startX;
        const dy = y - startY;
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        mode = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      }
      if (mode !== "h") return;
      e.preventDefault();
      const now = performance.now();
      if (now > lastT) {
        vx = (x - lastX) / (now - lastT);
        lastX = x;
        lastT = now;
      }
      el.scrollLeft = startScroll - (x - startX);
    };
    const onEnd = () => {
      touching.current = false;
      if (mode === "h") {
        const step = stepWidth(el);
        if (step > 0) {
          const max = el.scrollWidth - el.clientWidth;
          const cur = el.scrollLeft / step;
          /* a real flick advances one card in its direction; a slow
             drag settles to whichever card is nearest */
          const idx =
            Math.abs(vx) > 0.25
              ? vx < 0
                ? Math.floor(cur) + 1
                : Math.ceil(cur) - 1
              : Math.round(cur);
          glideTo(el, Math.min(Math.max(idx * step, 0), max));
        }
      }
      mode = null;
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    /* passive: false — preventDefault must be able to stop the page
       from vertical-scrolling once a gesture locks horizontal */
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [glideTo]);

  const applyFilter = (next: string | null) => {
    setGender(next === gender ? null : next);
    setGeneration((g) => g + 1);
  };

  /* Cursor drag: mouse-drag the track (touch already swipes natively).
     Snap is suspended while dragging and the track snaps to the nearest
     card on release; a drag suppresses the click it would end on. */
  const drag = useRef({ active: false, startX: 0, startScroll: 0, moved: false });
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const el = trackRef.current;
    if (!el) return;
    drag.current = { active: true, startX: e.clientX, startScroll: el.scrollLeft, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    if (!el || !drag.current.active) return;
    const dx = e.clientX - drag.current.startX;
    if (!drag.current.moved) {
      if (Math.abs(dx) < 5) return;
      drag.current.moved = true;
      setDragging(true);
      el.setPointerCapture(e.pointerId);
    }
    el.scrollLeft = drag.current.startScroll - dx;
  };

  const endDrag = () => {
    const el = trackRef.current;
    if (!el || !drag.current.active) return;
    drag.current.active = false;
    if (drag.current.moved) {
      setDragging(false);
      glide(el);
    }
  };

  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
  };

  // On filter change: reset the track, and re-settle once the card
  // transition is done (scroll snapping can nudge scrollLeft mid-swap)
  useEffect(() => {
    trackRef.current?.scrollTo({ left: 0 });
    updateArrows();
    const t = setTimeout(
      () => {
        trackRef.current?.scrollTo({ left: 0 });
        updateArrows();
      },
      (FADE_S + 2 * STAGGER_S) * 1000 + 150,
    );
    return () => clearTimeout(t);
  }, [gender, updateArrows]);

  return (
    <div className="flex w-full flex-col">
      <div
        className={`flex w-full flex-wrap items-center justify-between gap-4 bg-surface ${headerClassName} ${
          bordered ? "border-t border-line" : ""
        }`}
      >
        {/* no title (undefined, null, or empty) → the gender toggles
            take the left side and the arrows stay right. On mobile a
            filterable slider stacks: title on its own row, then the
            MENS/WOMENS buttons with the arrows beside them (comp
            33691:63716) */}
        {Boolean(title) && (
          <p
            className={`min-w-0 flex-1 ${
              filterable ? "max-sm:w-full max-sm:flex-none" : ""
            } ${titleClassName}`}
          >
            {title}
          </p>
        )}
        {filterable && (
          <div
            className="flex items-center gap-3"
            /* pointerdown fires before click: the slides' Motion
               wrappers mount here, so even the first filter click
               gets the full exit/enter stagger */
            onPointerDown={() => setFilterArmed(true)}
            onFocusCapture={() => setFilterArmed(true)}
          >
            {genders.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => applyFilter(g)}
                className={`label flex h-10 min-w-[7.5rem] items-center justify-center rounded-xs px-3.5 font-medium transition-colors hover:opacity-80 ${
                  gender === g ? "bg-btn text-btn-fg" : "bg-wash text-ink"
                }`}
              >
                {g === "mens" ? "MENS" : g === "womens" ? "WOMENS" : g.toUpperCase()}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-start pl-3">
          <ArrowButton
            type="button"
            aria-label="Previous"
            disabled={!canPrev}
            onClick={() => slide(-1)}
            className="flex size-10 items-center justify-center rounded-xs bg-wash text-ink transition-all disabled:bg-transparent disabled:opacity-30"
          >
            <ArrowSwap dx={-1}>
              <ArrowLeft />
            </ArrowSwap>
          </ArrowButton>
          <ArrowButton
            type="button"
            aria-label="Next"
            disabled={!canNext}
            onClick={() => slide(1)}
            className="flex size-10 items-center justify-center rounded-xs bg-wash text-ink transition-all disabled:bg-transparent disabled:opacity-30"
          >
            <ArrowSwap dx={1}>
              <ArrowRight />
            </ArrowSwap>
          </ArrowButton>
        </div>
      </div>
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        onDragStart={(e) => e.preventDefault()}
        /* media reveals inside the rail key off the rail's own
           vertical arrival, not per-slide horizontal visibility */
        data-reveal-scope
        className={`no-scrollbar w-full touch-pan-y gap-px overflow-x-auto ${trackClassName} ${
          variable ? "flex" : `grid grid-flow-col ${cols}`
        } ${dragging ? "cursor-grabbing select-none" : "cursor-grab"}`}
      >
        {filterArmed ? (
          <AnimatePresence initial={false} onExitComplete={updateArrows}>
            {visible.map((item) => (
              <m.div
                key={item.key}
                data-slide
                className={`flex ${variable ? "shrink-0" : "min-w-0"}`}
                initial={{ opacity: 0 }}
                animate={{
                  opacity: 1,
                  // incoming cards wait for the outgoing stagger to clear
                  transition: {
                    duration: FADE_S,
                    delay: FADE_S + STAGGER_S + hash01(item.key + generation) * STAGGER_S,
                  },
                }}
                exit={{
                  opacity: 0,
                  transition: {
                    duration: FADE_S,
                    delay: hash01(item.key + generation) * STAGGER_S,
                  },
                }}
              >
                {item.card}
              </m.div>
            ))}
          </AnimatePresence>
        ) : (
          /* until the filter is touched the Motion wrappers (and the
             AnimatePresence context) never mount — with initial=false
             they render at rest anyway, so this is pixel-identical
             and saves a per-slide motion instance on every rail
             (three 24-card sliders on the homepage) */
          visible.map((item) => (
            <div
              key={item.key}
              data-slide
              className={`flex ${variable ? "shrink-0" : "min-w-0"}`}
            >
              {item.card}
            </div>
          ))
        )}
      </div>
      {/* Custom scroll progress: eased fill, full width at the end.
          Sits on top of the cards' bottom hairline (-mt) with no track
          background of its own. */}
      {showProgress && scrollable && (
        /* mobile (comp 33691:63716): a short centered track with a
           visible wash rail; desktop keeps the full-width fill */
        <div className="relative z-10 -mt-0.5 h-0.5 w-full max-sm:mx-auto max-sm:mt-4xl max-sm:w-40 max-sm:bg-wash">
          <m.div
            className="h-full bg-ink"
            initial={false}
            animate={{ width: `${Math.min(progress, 1) * 100}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      )}
    </div>
  );
}

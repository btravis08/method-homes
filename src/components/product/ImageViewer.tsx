"use client";

import { animate, m, useMotionValue } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { ArrowLeft, ArrowRight, Close, Minus, Plus } from "@/components/icons";
import { EASE_DRAMATIC, EASE_OUT } from "@/lib/motion";

/* a screen rect captured on the page at open time */
export interface SourceBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

const FLY = { duration: 0.6, ease: [...EASE_DRAMATIC] as const };

/* FLIP: start the element at a captured on-page rect (offset +
   scale from its natural layout position) and settle it into place.
   Imperative motion values — mount animations are suppressed under
   the page transition's presence context. axis "y" translates
   vertically only (used for the slide image, whose horizontal rect
   isn't meaningful before the track positions itself). */
function useFlyFrom(box: SourceBox | undefined, axis: "both" | "y" = "both") {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scaleX = useMotionValue(1);
  const scaleY = useMotionValue(1);
  /* the open-time deltas, kept so close can retrace them exactly */
  const start = useRef({ x: 0, y: 0, sx: 1, sy: 1, has: false });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!box || !el) return;
    const to = el.getBoundingClientRect();
    if (!to.width) return;
    const dy = box.top + box.height / 2 - (to.top + to.height / 2);
    const dx = box.left + box.width / 2 - (to.left + to.width / 2);
    start.current = {
      x: axis === "both" ? dx : 0,
      y: dy,
      sx: axis === "both" ? box.width / to.width : 1,
      sy: axis === "both" ? box.height / to.height : 1,
      has: true,
    };
    y.jump(dy);
    animate(y, 0, FLY);
    if (axis === "both") {
      x.jump(dx);
      scaleX.jump(start.current.sx);
      scaleY.jump(start.current.sy);
      animate(x, 0, FLY);
      animate(scaleX, 1, FLY);
      animate(scaleY, 1, FLY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* retrace back to the on-page rect (scroll is locked while open, so
     the captured deltas still land exactly) */
  const reverse = () => {
    const s = start.current;
    if (!s.has) return Promise.resolve();
    return Promise.all([
      animate(y, s.y, FLY),
      animate(x, s.x, FLY),
      animate(scaleX, s.sx, FLY),
      animate(scaleY, s.sy, FLY),
    ]).then(() => undefined);
  };
  return { ref, style: { x, y, scaleX, scaleY }, reverse };
}

/*
  Full-screen product image viewer (opened by tapping a hero slide):
  numbered counter top-left (mono, like the size/stat numerals), close
  top-right, a swipeable full-bleed track with the hero's eased
  progress line along the very bottom, arrow chips at the bottom
  corners, and a centered zoom pill stepping 100 / 150 / 200%. While
  zoomed the track is replaced by a natively pannable canvas of the
  current image; the arrows still page between images.
*/

const ZOOMS = [100, 150, 200];

export function ImageViewer({
  images,
  title,
  initialIndex = 0,
  from,
  onFadeStart,
  onClose,
}: {
  images: string[];
  title?: string;
  initialIndex?: number;
  /* on-page rects the controls fly in from (mobile: the hero arrows,
     the bottom bar shrinking into the zoom pill, and the tapped
     slide's image sliding to screen center) */
  from?: {
    left?: SourceBox;
    right?: SourceBox;
    bar?: SourceBox;
    image?: SourceBox;
  };
  /* fired when the closing fade begins — the parent unhides the
     page's originals so the site fades in beneath the overlay */
  onFadeStart?: () => void;
  onClose: () => void;
}) {
  const n = images.length;
  const [index, setIndex] = useState(Math.min(initialIndex, n - 1));
  /* zoom target (drives the pill and the resting canvas size). The
     transition itself runs as a compositor scale on a fixed overlay —
     animating the canvas's layout size reflows (and recentering
     scrolls) every frame, which stutters on phones. The native-scroll
     pan layer swaps back in at rest; it stays mounted until a
     zoom-out lands on 100 */
  const [zoom, setZoom] = useState(100);
  const [panning, setPanning] = useState(false);
  const [animating, setAnimating] = useState(false);
  const zscale = useMotionValue(1);
  const zoomTarget = useRef(100);
  const [progress, setProgress] = useState(n > 1 ? index / (n - 1) : 1);
  const trackRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<HTMLDivElement>(null);

  const flyLeft = useFlyFrom(from?.left);
  const flyRight = useFlyFrom(from?.right);
  const flyPill = useFlyFrom(from?.bar);
  /* the tapped image slides from its on-page spot to screen center */
  const flyImg = useFlyFrom(from?.image, "y");
  const initialSlot = useRef(Math.min(initialIndex, n - 1) + (n > 1 ? 1 : 0));

  /* closing retraces the whole choreography — controls fly back to
     their on-page rects, then the overlay fades over the real
     elements sitting exactly beneath them. Zoomed close skips the
     retrace (the composition no longer matches the page) */
  const closingRef = useRef(false);
  /* counter / close / progress line — these have no on-page
     counterpart, so they fade away during the retrace, leaving just
     the background to dissolve once everything has landed */
  const chromeOp = useMotionValue(1);
  /* the whole overlay's dissolve is imperative (never a presence
     exit) so the site reliably fades in beneath it */
  const rootOp = useMotionValue(1);
  const fadeOut = (duration: number) => {
    onFadeStart?.();
    animate(rootOp, 0, { duration, ease: [...EASE_OUT] }).then(onClose);
  };
  const requestClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (panning) {
      fadeOut(0.4);
      return;
    }
    animate(pillContent, 0, { duration: 0.2 });
    animate(chromeOp, 0, { duration: 0.25 });
    Promise.all([
      flyLeft.reverse(),
      flyRight.reverse(),
      flyPill.reverse(),
      flyImg.reverse(),
    ]).then(() => fadeOut(0.5));
  };
  /* the pill's content resolves after the bar has mostly shrunk in */
  const pillContent = useMotionValue(from?.bar ? 0 : 1);
  useEffect(() => {
    if (from?.bar) animate(pillContent, 1, { duration: 0.3, delay: 0.3 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* lock the page scroll behind the overlay */
  useEffect(() => {
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
      if (e.key === "ArrowLeft") page(-1);
      if (e.key === "ArrowRight") page(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* the track loops like the hero: edge clones on both ends, and a
     settle-teleport recenters after crossing into a clone */
  const loop = n > 1;
  const renderImages = loop ? [images[n - 1], ...images, images[0]] : images;

  /* track mode: open on (or return to) the current image (offset by
     the leading clone) */
  useLayoutEffect(() => {
    if (panning) return;
    const el = trackRef.current;
    if (el)
      el.scrollTo({
        left: (index + (loop ? 1 : 0)) * el.clientWidth,
        behavior: "instant",
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panning]);

  /* teleport by one full span once a clone settles, so both arrows
     keep their direction seamlessly at either end */
  useEffect(() => {
    if (!loop || panning) return;
    const el = trackRef.current;
    if (!el) return;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(settle);
      settle = setTimeout(() => {
        const w = el.clientWidth;
        if (w <= 0) return;
        const span = n * w;
        const max = el.scrollWidth - el.clientWidth;
        if (el.scrollLeft < w * 0.5) {
          el.scrollTo({ left: el.scrollLeft + span, behavior: "instant" });
        } else if (el.scrollLeft > max - w * 0.5) {
          el.scrollTo({ left: el.scrollLeft - span, behavior: "instant" });
        }
      }, 90);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(settle);
      el.removeEventListener("scroll", onScroll);
    };
  }, [loop, panning, n]);

  /* zoomed: center the canvas whenever it (re)appears — after a zoom
     transition settles or when paging between images */
  useLayoutEffect(() => {
    if (!panning || animating) return;
    const el = panRef.current;
    if (el)
      el.scrollTo({
        left: (el.scrollWidth - el.clientWidth) / 2,
        top: (el.scrollHeight - el.clientHeight) / 2,
        behavior: "instant",
      });
  }, [panning, animating, index, zoom]);

  const onTrackScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const w = el.clientWidth;
    if (loop) {
      /* clones excluded: raw real position 0..n-1 */
      const raw = el.scrollLeft / w - 1;
      const pos = Math.min(n - 1, Math.max(0, raw));
      setProgress(n > 1 ? pos / (n - 1) : 1);
      setIndex(((Math.round(raw) % n) + n) % n);
    } else {
      const max = el.scrollWidth - el.clientWidth;
      if (max > 0) setProgress(el.scrollLeft / max);
      setIndex(Math.max(0, Math.min(n - 1, Math.round(el.scrollLeft / w))));
    }
  };

  const page = (dir: number) => {
    if (!panning) {
      const el = trackRef.current;
      if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
    } else {
      const next = loop
        ? (index + dir + n) % n
        : Math.max(0, Math.min(n - 1, index + dir));
      setIndex(next);
      setProgress(n > 1 ? next / (n - 1) : 1);
    }
  };

  /* ease between zoom stops on the overlay's compositor scale; the
     overlay at scale 1 is composed identically to a slide, so both
     mode handoffs are invisible. Landing back on 100 returns to the
     track */
  const stepZoom = (dir: number) => {
    const i = ZOOMS.indexOf(zoom) + dir;
    if (i < 0 || i >= ZOOMS.length) return;
    const next = ZOOMS[i];
    setZoom(next);
    zoomTarget.current = next;
    if (next > 100) setPanning(true);
    setAnimating(true);
    animate(zscale, next / 100, { duration: 0.5, ease: [...EASE_OUT] }).then(
      () => {
        if (zoomTarget.current !== next) return; // superseded mid-flight
        setAnimating(false);
        if (next === 100) setPanning(false);
      },
    );
  };

  const pad = (v: number) => String(v).padStart(2, "0");

  return (
    <m.div
      data-mode="light"
      data-nav-overlay
      style={{ opacity: rootOp }}
      className="fixed inset-0 z-[80] flex flex-col bg-surface-2 text-ink"
      role="dialog"
      aria-modal="true"
      aria-label={`${title ?? "Product"} images`}
    >
      {/* counter + close */}
      <m.div
        style={{ opacity: chromeOp }}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4 md:p-6"
      >
        <p className="font-mono text-[0.875rem] leading-none text-ink">
          {pad(index + 1)} / {pad(n)}
        </p>
        <button
          type="button"
          aria-label="Close viewer"
          onClick={requestClose}
          className="pointer-events-auto text-ink"
        >
          <Close />
        </button>
      </m.div>

      {/* imagery */}
      <div className="relative min-h-0 flex-1">
        {!panning ? (
          <div
            ref={trackRef}
            onScroll={onTrackScroll}
            className="no-scrollbar grid h-full w-full snap-x snap-mandatory auto-cols-[100%] grid-flow-col overflow-x-auto"
          >
            {renderImages.map((src, i) => {
              const fly = i === initialSlot.current;
              return (
                <div key={i} className="relative h-full snap-start">
                  <m.div
                    ref={fly ? flyImg.ref : undefined}
                    role="img"
                    aria-label={`${title ?? "Product"} — image ${
                      loop ? ((i - 1 + n) % n) + 1 : i + 1
                    }`}
                    className="absolute inset-0 bg-[length:100%_auto] bg-center bg-no-repeat md:inset-x-[8%] md:inset-y-[16%] md:bg-contain"
                    style={{
                      ...(fly ? flyImg.style : undefined),
                      backgroundImage: `url(${src})`,
                    }}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <>
            {/* at rest: the real canvas at the target size, panning
                with native (momentum) scrolling; hidden while the
                overlay animates the transition */}
            <div
              ref={panRef}
              className="no-scrollbar h-full w-full overflow-auto"
              style={{ visibility: animating ? "hidden" : "visible" }}
            >
              <div
                className="relative"
                style={{ width: `${zoom}%`, height: `${zoom}%` }}
              >
                <div
                  role="img"
                  aria-label={`${title ?? "Product"} — image ${index + 1}, ${zoom}%`}
                  className="absolute inset-0 bg-[length:100%_auto] bg-center bg-no-repeat md:inset-x-[8%] md:inset-y-[16%] md:bg-contain"
                  style={{ backgroundImage: `url(${images[index]})` }}
                />
              </div>
            </div>
            {/* transition overlay: a full-frame slide composition
                scaled about center on the compositor — buttery on
                phones where per-frame layout is not */}
            {animating && (
              <div className="absolute inset-0 overflow-hidden">
                <m.div aria-hidden className="absolute inset-0" style={{ scale: zscale }}>
                  <div
                    className="absolute inset-0 bg-[length:100%_auto] bg-center bg-no-repeat md:inset-x-[8%] md:inset-y-[16%] md:bg-contain"
                    style={{ backgroundImage: `url(${images[index]})` }}
                  />
                </m.div>
              </div>
            )}
          </>
        )}
      </div>

      {/* bottom controls: arrows at the corners, zoom pill centered.
          On open they fly in from their on-page rects — the hero
          arrows slide down into the corners, the bottom bar shrinks
          into the zoom pill */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-between p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] md:p-6">
        <m.div ref={flyLeft.ref} style={flyLeft.style}>
          <button
            type="button"
            aria-label="Previous image"
            onClick={() => page(-1)}
            className="pointer-events-auto flex size-[2.875rem] items-center justify-center rounded-xs bg-wash text-ink backdrop-blur-md"
          >
            <ArrowLeft />
          </button>
        </m.div>
        <m.div
          ref={flyPill.ref}
          style={flyPill.style}
          className="pointer-events-auto flex h-[2.875rem] items-center gap-1 rounded-xs bg-wash backdrop-blur-md px-2"
        >
          <m.div style={{ opacity: pillContent }} className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Zoom out"
              disabled={zoom === ZOOMS[0]}
              onClick={() => stepZoom(-1)}
              className="flex size-9 items-center justify-center text-ink disabled:opacity-30"
            >
              <Minus />
            </button>
            <p className="w-14 text-center font-mono text-[0.875rem] leading-none text-ink">
              {zoom}%
            </p>
            <button
              type="button"
              aria-label="Zoom in"
              disabled={zoom === ZOOMS[ZOOMS.length - 1]}
              onClick={() => stepZoom(1)}
              className="flex size-9 items-center justify-center text-ink disabled:opacity-30"
            >
              <Plus />
            </button>
          </m.div>
        </m.div>
        <m.div ref={flyRight.ref} style={flyRight.style}>
          <button
            type="button"
            aria-label="Next image"
            onClick={() => page(1)}
            className="pointer-events-auto flex size-[2.875rem] items-center justify-center rounded-xs bg-wash text-ink backdrop-blur-md"
          >
            <ArrowRight />
          </button>
        </m.div>
      </div>

      {/* the hero's eased slide indicator along the very bottom */}
      <m.div
        style={{ opacity: chromeOp }}
        className="absolute inset-x-0 bottom-0 z-10 h-0.5"
      >
        <m.div
          className="h-full bg-ink"
          initial={false}
          animate={{ width: `${Math.min(progress, 1) * 100}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </m.div>
    </m.div>
  );
}

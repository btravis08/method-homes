"use client";

import {
  AnimatePresence,
  animate,
  m,
  useMotionValue,
  useTransform,
} from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { MEDIA_EASE } from "@/components/home/AnimatedMedia";
import { Pause } from "@/components/icons";
import { EASE_DRAMATIC } from "@/lib/motion";

export interface CarouselItemData {
  _key?: string;
  title?: string;
  description?: string;
  image?: string;
}

export interface CarouselProps {
  mode?: "light" | "light-mid" | "dark-mid" | "dark";
  eyebrow?: string;
  items?: CarouselItemData[];
}

const LOREM =
  "Maecenas suspendisse ultrices pellentesque et ornare dui nisl. Eget convallis lorem faucibus tortor in. Cursus feugiat feugiat a quam vestibulum dignissim sem ullamcorper.";

const defaultImages = [
  "/figma/media-portrait.jpg",
  "/figma/campaign.jpg",
  "/figma/card-shoe.jpg",
  "/figma/legacy-video.jpg",
  "/figma/products/presidio-black.png",
];

const defaultItems: CarouselItemData[] = [
  "Pioneer",
  "Presidio",
  "Osprey",
  "Cardinal",
  "Jupiter",
].map((title, i) => ({
  title,
  description: LOREM,
  image: defaultImages[i % defaultImages.length],
}));

/*
  Carousel. Desktop (lg+): exact 50/50 split — the serif list items are
  links; hovering (or focusing) one makes it active, swapping the
  right-half image with the standard fade/1.05x-settle treatment and
  crossfading the description in the bottom left.

  Below lg the same content reorganizes into a vertical carousel: a
  tappable body-size list above, the main image with a tappable
  thumbnail rail on its right, and the description below the imagery.
*/
export function Carousel({
  mode = "light",
  eyebrow = "Shop Footwear",
  items = defaultItems,
}: CarouselProps) {
  const [active, setActive] = useState(0);
  const current = items[active] ?? items[0];

  /* the image shown before the latest change — the static underlay
     the incoming mobile slide covers */
  const lastImage = useRef<string | undefined>(undefined);
  const prevImage = lastImage.current;
  useEffect(() => {
    lastImage.current = current?.image;
  }, [current?.image]);

  /* Mobile slide-over: a persistent layer driven by motion values
     (mount animations are suppressed under the page transition's
     presence context, so a keyed element with `initial` won't play).
     On change the incoming image starts offset 30% of the container
     toward the travel direction — from below when moving to a later
     slide, from above when moving to an earlier one — at 1.2x scale
     and transparent, then fades/settles into place over the held
     underlay; same duration/easing as the rail bar */
  const slideBoxRef = useRef<HTMLDivElement>(null);
  const slideY = useMotionValue(0);
  const slideOpacity = useMotionValue(1);
  const slideScale = useMotionValue(1);
  const prevActive = useRef(active);
  useLayoutEffect(() => {
    const prev = prevActive.current;
    if (prev === active) return;
    prevActive.current = active;
    const h = slideBoxRef.current?.offsetHeight ?? 0;
    if (!h) return;
    const dir = active > prev ? 1 : -1;
    const T = {
      duration: 0.6,
      ease: [...EASE_DRAMATIC] as [number, number, number, number],
    };
    slideY.jump(dir * h * 0.3);
    slideOpacity.jump(0);
    slideScale.jump(1.2);
    animate(slideY, 0, T);
    animate(slideOpacity, 1, T);
    animate(slideScale, 1, T);
  }, [active, slideY, slideOpacity, slideScale]);

  /* The thumb rail's travelling edge bar. Both edges tween to the
     active thumb on the SAME bezier in one continuous motion; the
     trailing edge starts a beat after the leading edge, so the bar
     stretches while it travels and reabsorbs as it lands — no
     mid-flight keyframe stall. The lag shrinks with travel distance
     so the peak stretch stays ~1.5x regardless of how far it jumps */
  const railRef = useRef<HTMLDivElement>(null);
  const prevTop = useRef<number | null>(null);
  const edgeTop = useMotionValue(0);
  const edgeBottom = useMotionValue(0);
  const barHeight = useTransform(
    [edgeTop, edgeBottom],
    ([t, b]: number[]) => b - t,
  );
  useLayoutEffect(() => {
    const measure = () => {
      const btn = railRef.current?.querySelectorAll("button")[active];
      if (!btn) return null;
      return { top: btn.offsetTop, height: btn.offsetHeight };
    };
    const m = measure();
    if (!m) return;
    const prev = prevTop.current;
    if (prev === null || prev === m.top) {
      edgeTop.jump(m.top);
      edgeBottom.jump(m.top + m.height);
    } else {
      const DUR = 0.6;
      const EASE: [number, number, number, number] = [...EASE_DRAMATIC];
      const dist = Math.abs(m.top - prev);
      /* stretch scales with travel: 1.5x for an adjacent hop up to
         2x for a full-rail jump, interpolated by steps travelled */
      const btns = railRef.current!.querySelectorAll("button");
      const step =
        btns.length > 1 ? btns[1].offsetTop - btns[0].offsetTop : m.height;
      const steps = Math.max(1, Math.round(dist / step));
      const totalSteps = Math.max(2, btns.length - 1);
      const stretch = 1.5 + (0.5 * (steps - 1)) / (totalSteps - 1);
      /* peak stretch ≈ mid-flight speed (≈5.9·dist/DUR for this
         bezier) × lag; solve lag for the target extra length */
      const extra = (stretch - 1) * m.height;
      const lag = Math.min(0.15, (extra * DUR) / (5.9 * dist));
      const down = m.top > prev;
      animate(edgeTop, m.top, { duration: DUR, ease: EASE, delay: down ? lag : 0 });
      animate(edgeBottom, m.top + m.height, {
        duration: DUR,
        ease: EASE,
        delay: down ? 0 : lag,
      });
    }
    prevTop.current = m.top;

    const onResize = () => {
      const r = measure();
      if (!r) return;
      edgeTop.jump(r.top);
      edgeBottom.jump(r.top + r.height);
      prevTop.current = r.top;
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [active, items.length, edgeTop, edgeBottom]);

  const description = (
    <AnimatePresence mode="wait" initial={false}>
      <m.p
        key={active}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="label max-w-[30.375rem] font-medium text-ink-2"
      >
        {current?.description}
      </m.p>
    </AnimatePresence>
  );

  return (
    <section
      data-mode={mode}
      className="grid w-full grid-cols-1 bg-surface text-ink lg:grid-cols-2"
    >
      {/* the deep bottom padding (spacing-11xl on desktop) keeps the
          body copy clear of the sticky purchase bar */}
      <div className="flex min-w-0 flex-col gap-12 px-4 pt-12 md:px-8 lg:justify-between lg:px-32 lg:pb-11xl lg:pt-24">
        <div className="flex flex-col gap-8">
          {/* serif title, matching the framed slider headers above.
              Legacy CMS documents stored the eyebrow in all caps —
              render those in sentence case */}
          {eyebrow && (
            <p className="font-display text-title-md text-ink">
              {eyebrow === eyebrow.toUpperCase()
                ? eyebrow.charAt(0) + eyebrow.slice(1).toLowerCase()
                : eyebrow}
            </p>
          )}
          {/* desktop: serif headline list, hover-driven */}
          <div className="hidden flex-col items-start font-display text-headline-sm lg:flex">
            {items.map((item, i) => (
              <a
                key={item._key ?? i}
                href="#"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                className={`transition-colors duration-300 ${
                  i === active ? "text-ink" : "text-ink-2 hover:text-ink"
                }`}
              >
                {(item.title ?? "").replace(/→+$/, "")}
                {i === active && "→"}
              </a>
            ))}
          </div>
          {/* mobile/tablet: tappable list in the breadcrumb link style
              (label uppercase, 1px underline ~4px under the caps); the
              underline draws left-in / right-out like the nav links */}
          <div className="flex flex-col items-start gap-2.5 lg:hidden">
            {items.map((item, i) => (
              <button
                key={item._key ?? i}
                type="button"
                onClick={() => setActive(i)}
                className={`label relative text-left font-medium transition-colors duration-300 ${
                  i === active ? "text-ink" : "text-ink-2"
                }`}
              >
                {(item.title ?? "").replace(/→+$/, "")}
                <span
                  aria-hidden
                  className={`absolute inset-x-0 bottom-0 h-px bg-current transition-transform duration-300 ${
                    i === active
                      ? "origin-left scale-x-100"
                      : "origin-right scale-x-0"
                  }`}
                />
              </button>
            ))}
          </div>
        </div>
        <div className="relative hidden min-h-14 lg:block">{description}</div>
      </div>

      {/* desktop image half: the module's height is driven by this
          image, 4:5 portrait at half the section width. data-mode=dark:
          imagery inverts the fixed bars' point-sampling */}
      <div
        data-mode="dark"
        className="relative hidden aspect-[4/5] overflow-hidden bg-surface-2 lg:block"
      >
        <AnimatePresence initial={false}>
          <m.div
            key={active}
            aria-hidden
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url(${current?.image ?? "/figma/media-portrait.jpg"})`,
            }}
            initial={{ opacity: 0, scale: 1.05 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.2 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: [...MEDIA_EASE] }}
          />
        </AnimatePresence>
        <div className="absolute inset-0 flex items-end justify-end p-4 md:p-6">
          <button
            aria-label="Pause"
            className="flex size-7 items-center justify-center rounded-full bg-btn text-btn-fg"
          >
            <Pause />
          </button>
        </div>
      </div>

      {/* mobile/tablet: main image + vertical thumbnail rail, then the
          description under the imagery */}
      <div className="flex flex-col gap-8 px-4 pb-28 pt-8 md:px-8 lg:hidden">
        <div className="flex items-start gap-2">
          <div
            ref={slideBoxRef}
            data-mode="dark"
            className="relative aspect-[4/5] min-w-0 flex-1 overflow-hidden bg-surface-2"
          >
            {/* the outgoing image holds still underneath while the new
                one slides up over it */}
            {prevImage && (
              <div
                aria-hidden
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${prevImage})` }}
              />
            )}
            <m.div
              aria-hidden
              className="absolute inset-0 bg-cover bg-center"
              style={{
                y: slideY,
                opacity: slideOpacity,
                scale: slideScale,
                backgroundImage: `url(${current?.image ?? "/figma/media-portrait.jpg"})`,
              }}
            />
          </div>
          <div ref={railRef} className="relative flex w-16 shrink-0 flex-col gap-2">
            {items.map((item, i) => (
              <button
                key={item._key ?? i}
                type="button"
                aria-label={(item.title ?? `Slide ${i + 1}`).replace(/→+$/, "")}
                onClick={() => setActive(i)}
                className={`relative aspect-square w-full overflow-hidden bg-surface-2 transition-opacity duration-300 ${
                  i === active ? "" : "opacity-60"
                }`}
              >
                <span
                  aria-hidden
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${item.image})` }}
                />
              </button>
            ))}
            {/* one 2px bar on the rail's right edge travels to the
                active thumb, stretching in flight (edge-lag) */}
            <m.span
              aria-hidden
              className="absolute right-0 w-0.5 bg-ink"
              style={{ top: edgeTop, height: barHeight }}
            />
          </div>
        </div>
        <div className="relative min-h-14">{description}</div>
      </div>
    </section>
  );
}

"use client";

import { m, useInView } from "motion/react";
import type { Transition } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { MEDIA_EASE } from "@/components/home/AnimatedMedia";
import { ArrowInViewPlay, ArrowSwap } from "@/components/home/ArrowHover";
import { ArrowUpRight } from "@/components/icons";

/*
  Hero / Full Width text treatment: nav-style label texts on the sides,
  display type in the middle, sitting on the media's vertical center.
  The sides start 4% in from each edge and, while the image entrance is
  still settling, fade in as they travel outward to the 24px insets
  (Motion layout/FLIP, ease-in-out); the center text fades in place,
  centered on the container.

  `stack` swaps mobile to a bottom-aligned centered column: eyebrow +
  headline stacked, then the CTA. "button" (the homepage hero) renders
  it as a full-width Primary Button Large riding the hero-cta hold
  line 16px above the fixed control bar; "link" (Full Width sections)
  keeps the nav-style text link, resting 16px above the section's
  bottom edge.

  Hovering the whole section animates the right element's underline
  exactly like the nav links (the section provides the `group`).
*/
const SPREAD: Transition = { duration: 0.7, ease: "easeInOut" };

export function CampaignOverlay({
  left,
  center,
  right,
  stack,
  priority = false,
}: {
  left?: string;
  center?: string;
  right?: string;
  stack?: "button" | "link";
  /* the LCP instance (homepage hero): the texts fade via the CSS
     .sdr-text-reveal animation instead of Motion, so the headline —
     the page's LCP element on mobile — paints without waiting for
     hydration. Same delay/duration/ease as the Motion fade. */
  priority?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.2 });
  const [go, setGo] = useState(false);

  useEffect(() => {
    if (!inView) return;
    // kick off while the image entrance is still running
    const t = setTimeout(() => setGo(true), 300);
    return () => clearTimeout(t);
  }, [inView]);

  if (!left && !center && !right) return null;

  const fade = priority
    ? {}
    : ({
        initial: { opacity: 0 },
        animate: { opacity: go ? 1 : 0 },
        transition: SPREAD,
      } as const);
  const fadeClass = priority ? "sdr-text-reveal " : "";

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0">
      {/* mobile: bottom-aligned centered stack. The hero ("button")
          rides the hero-cta hold line — flow position 16px above the
          section's bottom (pb-4), held 16px clear of the fixed
          control bar until the edge catches up (pure CSS sticky).
          Full Width ("link") rests statically 16px above the
          section's bottom and keeps the nav-style text link. */}
      {stack === "button" && (
        <div className="absolute inset-0 md:hidden">
          <div className="flex h-full flex-col justify-end px-4 pb-4">
            <div className="hero-cta sticky flex w-full flex-col items-center gap-6">
              <div className="flex flex-col items-center gap-4 text-center">
                {left !== undefined && (
                  <m.span {...fade} className={`${fadeClass}label font-medium`}>
                    {left}
                  </m.span>
                )}
                {center !== undefined && (
                  <m.span {...fade} className={`${fadeClass}font-display text-headline-lg`}>
                    {center}
                  </m.span>
                )}
              </div>
              {right !== undefined && (
                <m.span
                  {...fade}
                  className={`${fadeClass}label flex h-[2.875rem] w-full items-center justify-center rounded-xs bg-btn font-medium text-btn-fg`}
                >
                  {right}
                </m.span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Full Width mobile: eyebrow + headline bottom-left, square NE
          arrow bottom-right (plays its swap once when it enters view) */}
      {stack === "link" && (
        <div className="absolute inset-0 md:hidden">
          <div className="flex h-full items-end justify-between gap-4 p-4">
            <div className="flex min-w-0 flex-col gap-3">
              {left !== undefined && (
                <m.span {...fade} className={`${fadeClass}label font-medium`}>
                  {left}
                </m.span>
              )}
              {center !== undefined && (
                <m.span {...fade} className={`${fadeClass}font-display text-headline-lg`}>
                  {center}
                </m.span>
              )}
            </div>
            <m.span {...fade} className={`${fadeClass}shrink-0`}>
              <ArrowInViewPlay className="flex size-10 items-center justify-center rounded-xs bg-white text-[#161716]">
                <ArrowSwap dx={1} dy={-1}>
                  <ArrowUpRight />
                </ArrowSwap>
              </ArrowInViewPlay>
            </m.span>
          </div>
        </div>
      )}

      {/* desktop (and non-stacked mobile): the centered 3-column row */}
      <div
        className={`absolute inset-0 items-center ${stack ? "hidden md:flex" : "flex"}`}
      >
        {/* 1fr/auto/1fr grid keeps the center text centered on the
            container regardless of the side texts' widths; the padding
            swap is what the sides travel through (FLIP) */}
        {/* each text fades in over the same ease-in-out as its travel */}
        <div
          className={`grid w-full grid-cols-[1fr_auto_1fr] items-center ${
            go ? "px-4 md:px-6" : "px-[4%]"
          }`}
        >
          {left !== undefined && (
            <m.span
              layout="position"
              {...fade}
              className={`${fadeClass}label col-start-1 justify-self-start font-medium`}
            >
              {left}
            </m.span>
          )}
          {center !== undefined && (
            <m.span
              layout="position"
              {...fade}
              className={`${fadeClass}col-start-2 justify-self-center font-display text-headline-lg`}
            >
              {center}
            </m.span>
          )}
          {right !== undefined && (
            <m.span
              layout="position"
              {...fade}
              className={`${fadeClass}label relative col-start-3 justify-self-end font-medium`}
            >
              {right}
              {/* nav-style underline, driven by hovering the whole section */}
              <span className="absolute inset-x-0 -bottom-0.5 h-px origin-right scale-x-0 bg-current transition-transform duration-300 group-hover:origin-left group-hover:scale-x-100" />
            </m.span>
          )}
        </div>
      </div>
    </div>
  );
}

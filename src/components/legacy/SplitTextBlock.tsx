"use client";

import { motion, useInView, useScroll } from "motion/react";
import { useRef } from "react";

import { ArrowUpRight } from "@/components/icons";

/*
  Legacy "Text Block" (Figma 33599:71930 / 34023:185081) — a full-
  viewport centered column: a vertical hairline dropping from the
  section edge, an eyebrow, a Feature Deck paragraph at title-lg on a
  700px measure, then an optional CTA or the embossed tiger mark, and
  the hairline resuming to the bottom edge.

  The paragraph carries the split-text reveal: invisible until it
  rises 30% from the bottom of the screen, then each word resolves
  from blurred to sharp ink on a time-driven 2s pass (dramatic
  bezier), the words overlap-staggered inside that window. Plays
  once; the hairlines stay scrubbed to the scroll.
*/

const DRAMA = [0.85, 0, 0.15, 1] as const;
/* the whole paragraph resolves in 2s: each word's own fade runs
   WORD_S, and start times overlap-stagger across the remainder */
const TOTAL_S = 2;
const WORD_S = 0.8;

function Rule({ progress, origin }: { progress: import("motion/react").MotionValue<number>; origin: "top" | "bottom" }) {
  return (
    <div className="flex min-h-0 w-px flex-1 justify-center">
      <motion.span
        className="w-px bg-line-2"
        style={{
          height: "100%",
          scaleY: progress,
          transformOrigin: origin === "top" ? "top" : "bottom",
        }}
      />
    </div>
  );
}

function Word({
  children,
  visible,
  delay,
}: {
  children: string;
  visible: boolean;
  delay: number;
}) {
  /* state-driven (initial={false} + animate) — mount animations are
     suppressed under the page transition's presence context */
  return (
    <motion.span
      initial={false}
      animate={{
        opacity: visible ? 1 : 0,
        filter: visible ? "blur(0px)" : "blur(8px)",
      }}
      transition={{ duration: WORD_S, ease: DRAMA, delay: visible ? delay : 0 }}
      className="inline-block"
    >
      {children}&nbsp;
    </motion.span>
  );
}

export function SplitTextBlock({
  mode = "light",
  eyebrow,
  text,
  cta,
  markImage,
}: {
  mode?: "light" | "light-mid";
  eyebrow: string;
  text: string;
  /* black button below the copy (OUR MANTRA blocks) */
  cta?: string;
  /* embossed mark below the copy instead (OUR MARK block) */
  markImage?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const pRef = useRef<HTMLParagraphElement>(null);
  /* The rules draw over the section's full pass. */
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.9", "center center"],
  });
  /* The words fire once the paragraph is 30% up from the bottom of
     the viewport, and stay resolved after. */
  const inView = useInView(pRef, { once: true, margin: "0px 0px -30% 0px" });
  const words = text.split(/\s+/).filter(Boolean);
  const step = (TOTAL_S - WORD_S) / Math.max(1, words.length - 1);

  return (
    <section
      ref={ref}
      data-mode={mode}
      className="flex h-screen w-full flex-col items-center justify-center gap-12 bg-surface px-6 text-ink"
    >
      <Rule progress={scrollYProgress} origin="top" />
      <p className="label font-medium">{eyebrow.toUpperCase()}</p>
      <p ref={pRef} className="max-w-[43.75rem] text-center font-display text-title-md">
        {words.map((word, i) => (
          <Word key={i} visible={inView} delay={i * step}>
            {word}
          </Word>
        ))}
      </p>
      {cta && (
        <a
          href="#"
          className="label flex h-12 min-w-[9.375rem] items-center justify-center gap-1.5 rounded-xs bg-btn px-[1.125rem] font-medium text-btn-fg transition-opacity hover:opacity-80"
        >
          {cta}
          <ArrowUpRight />
        </a>
      )}
      {markImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={markImage}
          alt="Sun Day Red tiger mark"
          className="w-full max-w-[32.375rem]"
        />
      )}
      <Rule progress={scrollYProgress} origin="bottom" />
    </section>
  );
}

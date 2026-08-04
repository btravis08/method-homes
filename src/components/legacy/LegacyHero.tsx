"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useLenis } from "lenis/react";
import { useCallback, useEffect, useRef, useState } from "react";

/*
  Legacy page introduction (Figma 33982:60407) — a time-driven title
  sequence with scroll locked until it resolves:

    1. "A New Legacy" slides up into dead center (2s, dramatic bezier)
    2. holds for a beat
    3. the campaign image appears between the words and EXPANDS,
       mechanically pushing each word outward ahead of its edge until
       the words pin at the viewport edges; the film keeps growing to
       full bleed, and each word inverts to white only at the moment
       the film passes beneath it
    4. the page unlocks and scrolls normally

  The push is literal: every frame, a word sits just outside the
  film's edge (film half-width + gutter) until it reaches its edge
  slot and pins there. Reduced motion goes straight to the resting
  state with no lock.
*/

const DRAMA = [0.85, 0, 0.15, 1] as const;
const EDGE = 24;   // the words' final inset, px
const GUTTER = 20; // words ride this far ahead of the film's edge
const SPLIT_S = 2.0;

type Phase = "enter" | "hold" | "split" | "done";

interface Metrics {
  vw: number;
  vh: number;
  /* word half-widths and initial center offsets (phrase layout) */
  halfL: number;
  halfR: number;
  offL0: number;
  offR0: number;
}

export function LegacyHero({
  left = "A New",
  right = "Legacy",
  image = "/figma/legacy/hero.jpg",
}: {
  left?: string;
  right?: string;
  image?: string;
}) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("enter");
  const lenis = useLenis();
  const leftRef = useRef<HTMLParagraphElement>(null);
  const rightRef = useRef<HTMLParagraphElement>(null);
  const [m, setM] = useState<Metrics | null>(null);
  const [inverted, setInverted] = useState<{ l: boolean; r: boolean }>({
    l: false,
    r: false,
  });

  useEffect(() => {
    if (reduced) setPhase("done");
  }, [reduced]);

  /* the film must be decoded before the split — a load-pop mid-
     sequence shifts everything */
  useEffect(() => {
    const img = new Image();
    img.src = image;
    img.decode?.().catch(() => {});
  }, [image]);

  /* Reloading mid-page restores a deep scroll position and would run
     the title sequence out of view behind a locked scroll — this page
     always opens at the top instead. */
  useEffect(() => {
    const prev = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    return () => {
      window.history.scrollRestoration = prev;
    };
  }, []);

  /* Scroll stays locked until the sequence resolves. */
  const locked = phase !== "done" && !reduced;
  useEffect(() => {
    if (!locked) return;
    window.scrollTo(0, 0);
    lenis?.stop();
    const keys = new Set([
      " ", "ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End",
    ]);
    const onKey = (e: KeyboardEvent) => {
      if (keys.has(e.key)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKey);
      lenis?.start();
    };
  }, [locked, lenis]);

  /* Split progress: 0 = film hidden between the words, 1 = full bleed. */
  const p = useMotionValue(0);

  const measure = useCallback((): Metrics | null => {
    const l = leftRef.current?.getBoundingClientRect();
    const r = rightRef.current?.getBoundingClientRect();
    if (!l || !r) return null;
    const vw = window.innerWidth;
    return {
      vw,
      vh: window.innerHeight,
      halfL: l.width / 2,
      halfR: r.width / 2,
      offL0: l.left + l.width / 2 - vw / 2,
      offR0: r.left + r.width / 2 - vw / 2,
    };
  }, []);

  /* The whole sequence is timer-driven (the enter tween is 2s) — no
     reliance on animation callbacks, which some provider setups eat. */
  useEffect(() => {
    if (phase === "enter" && !reduced) {
      const t = setTimeout(() => setPhase("hold"), 2100);
      return () => clearTimeout(t);
    }
    if (phase === "hold") {
      const t = setTimeout(() => setPhase("split"), 1000);
      return () => clearTimeout(t);
    }
    if (phase === "split") {
      setM(measure());
      const drive = animate(p, 1, { duration: SPLIT_S, ease: DRAMA });
      const t = setTimeout(() => setPhase("done"), SPLIT_S * 1000 + 200);
      return () => {
        drive.stop();
        clearTimeout(t);
      };
    }
    if (phase === "done") p.set(1);
  }, [phase, measure, p, reduced]);

  /* ---- the coupled geometry, evaluated per frame ---- */
  const filmW = useTransform(() => (m ? m.vw * p.get() : 0));
  /* 4:3 while small (the comp's ratio), guaranteed full cover at the
     end regardless of viewport aspect */
  const filmH = useTransform(() => {
    if (!m) return 0;
    return Math.max(m.vw * p.get() * 0.75, m.vh * p.get());
  });

  /* A word's center offset: pushed ahead of the film's edge, pinned
     at its edge slot; never inside its phrase position. */
  const offsetFor = (half: number, initial: number, dir: 1 | -1, vw: number) => {
    /* the gutter can't exceed the word's distance from center, or the
       push formula would exceed the phrase seat at film width 0 and
       the word would jump the instant the split begins */
    const g = Math.min(GUTTER, Math.max(0, Math.abs(initial) - half));
    const pushed = filmW.get() / 2 + g + half;
    const max = vw / 2 - EDGE - half;
    return dir * Math.min(Math.max(pushed, Math.abs(initial)), max);
  };
  const xL = useTransform(() => {
    if (!m) return 0;
    return offsetFor(m.halfL, m.offL0, -1, m.vw) - m.halfL;
  });
  const xR = useTransform(() => {
    if (!m) return 0;
    return offsetFor(m.halfR, m.offR0, 1, m.vw) - m.halfR;
  });

  /* Invert each word the moment the film's edge crosses its center. */
  useEffect(() => {
    const un = filmW.on("change", (w) => {
      if (!m) return;
      const halfFilm = w / 2;
      const overL = halfFilm >= Math.abs(offsetFor(m.halfL, m.offL0, -1, m.vw));
      const overR = halfFilm >= offsetFor(m.halfR, m.offR0, 1, m.vw);
      setInverted((prev) =>
        prev.l === overL && prev.r === overR ? prev : { l: overL, r: overR },
      );
    });
    return un;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m]);

  const splitting = phase === "split" || phase === "done";
  const wordClass =
    "font-display text-headline-lg whitespace-nowrap opacity-80 transition-colors duration-500";

  return (
    <section
      data-mode={phase === "done" ? "dark" : "light"}
      className="relative h-screen w-full overflow-hidden bg-surface"
    >
      {/* The film, growing from between the words to full bleed. */}
      <motion.div
        className="absolute left-1/2 top-1/2 overflow-hidden"
        style={{
          width: filmW,
          height: filmH,
          x: "-50%",
          y: "-50%",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt="Sun Day Red campaign"
          className="h-full w-full object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-black/20" />
      </motion.div>

      {reduced || (phase === "done" && !m) ? (
        /* Resting state without a measured run (reduced motion). */
        <>
          <p className={`${wordClass} absolute left-6 top-1/2 -translate-y-1/2 text-white`}>
            {left}
          </p>
          <p className={`${wordClass} absolute right-6 top-1/2 -translate-y-1/2 text-white`}>
            {right}
          </p>
        </>
      ) : splitting && m ? (
        /* Split: each word absolutely centered, pushed by the film. */
        <>
          <motion.p
            className={`${wordClass} absolute left-1/2 top-1/2`}
            style={{
              x: xL,
              y: "-50%",
              color: inverted.l ? "#ffffff" : "var(--color-ink, #161716)",
            }}
          >
            {left}
          </motion.p>
          <motion.p
            className={`${wordClass} absolute left-1/2 top-1/2`}
            style={{
              x: xR,
              y: "-50%",
              color: inverted.r ? "#ffffff" : "var(--color-ink, #161716)",
            }}
          >
            {right}
          </motion.p>
        </>
      ) : (
        /* Enter/hold: the phrase rises to center as one line. */
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-6">
          <motion.div
            initial={{ y: "14vh", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 2, ease: DRAMA }}
            className="flex w-full items-center justify-center gap-[0.35em]"
          >
            <p ref={leftRef} className={`${wordClass} text-ink`}>
              {left}
            </p>
            <p ref={rightRef} className={`${wordClass} text-ink`}>
              {right}
            </p>
          </motion.div>
        </div>
      )}
    </section>
  );
}

"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";

/*
  Legacy horizontal gallery (Figma 33599:72159 — "Floating Images"
  desktop symbol, a 4166×1000 canvas). The section pins and vertical
  scroll slides the canvas right-to-left, locked linearly to the
  scroll (Lenis supplies the glide).

  Scaling: sizes and vertical positions scale from viewport height
  (the comp's 1000px frame = 100vh) so margins and card proportions
  hold at any aspect; horizontal positions additionally stretch on
  wide viewports (aspect > the comp's 1.44) so the opening
  composition fills the width like the comp instead of clustering
  left.

  As the ride progresses the surface crossfades from Light to Medium
  Light, landing on the next section's mode. Inner images are
  oversized and translate slower than the travel — the swing is
  computed in element units so the photo can never expose its frame.
*/

const FRAME_W = 1440;
const FRAME_H = 1000;
const TRACK_D = 4166;
/* design px (1000-tall frame) → vh, for heights and sizes */
const vh = (d: number) => `${d / 10}vh`;
/* inner-parallax amplitude (% of frame width): the photo is 2A
   oversize and slides ±A across the pass */
const A = 18;
/* translate % applies to the oversized element, not the frame */
const A_EL = A / (1 + (2 * A) / 100);

interface Card {
  src: string;
  meta: string;
  /* design-frame geometry, px */
  x: number;
  y: number;
  w: number;
  aspect: string;
  tone?: "tint";
}

/* the comp's ten Interactive Gallery Cards, left to right */
const CARDS: Card[] = [
  { src: "/figma/legacy/float-putt.jpg",  meta: "Practice Green, 2024", x: 73.1,   y: 110.3, w: 266, aspect: "aspect-[320/400]" },
  { src: "/figma/journal/stream-03.jpg",  meta: "Fitting Room, 2024",   x: 317.1,  y: 523.3, w: 308, aspect: "aspect-square", tone: "tint" },
  { src: "/figma/journal/stream-11.jpg",  meta: "Media Day, 2024",      x: 730.9,  y: 286.1, w: 653, aspect: "aspect-square" },
  { src: "/figma/journal/stream-10.jpg",  meta: "St Andrews, 2022",     x: 1505.3, y: 110.3, w: 200, aspect: "aspect-square" },
  { src: "/figma/legacy/float-crowd.jpg", meta: "Riviera, 2024",        x: 1629.2, y: 503.1, w: 308, aspect: "aspect-square" },
  { src: "/figma/journal/stream-05.jpg",  meta: "The Range, 2024",      x: 2182.5, y: 612,   w: 266, aspect: "aspect-[320/400]" },
  { src: "/figma/legacy/float-shoes.jpg", meta: "Pebble Beach, 2024",   x: 2393.9, y: 198,   w: 200, aspect: "aspect-square" },
  { src: "/figma/legacy/hero.jpg",        meta: "Studio, 2024",         x: 2782.1, y: 60.6,  w: 653, aspect: "aspect-square" },
  { src: "/figma/journal/stream-06.jpg",  meta: "Sawgrass, 2024",       x: 3604.2, y: 523.3, w: 308, aspect: "aspect-square" },
  { src: "/figma/legacy/float-putt.jpg",  meta: "Sunday, 2024",         x: 3826.9, y: 110.3, w: 266, aspect: "aspect-[320/400]" },
];

/* the comp's two 460px paragraphs, seated by the feature cards */
const TEXTS = [
  {
    copy: "Pursue better, always. From first-light practice rounds to Sunday's final walk, every piece is built to move the way a champion moves.",
    x: 730.9,
    y: 118.8,
  },
  {
    copy: "You carry the legacy of a champion. You become part of the Sun Day Red story — written one Sunday at a time.",
    x: 2782.1,
    y: 819.3,
  },
];

interface Geom {
  /* px the canvas overflows the viewport */
  overflow: number;
  /* screen px per design px (height-based) */
  scale: number;
  /* horizontal spread factor for wide viewports */
  stretch: number;
  vw: number;
}

/* Light → Medium Light surfaces (globals.css light / light-mid) */
const SURFACE_FROM = "#f7f8f4";
const SURFACE_TO = "#e1e1de";

export interface GalleryCardContent {
  src?: string;
  meta?: string;
}

export function FloatingWords({
  cards,
  texts,
}: {
  /* CMS overrides, merged by position onto the code-owned layout
     slots — an empty slot keeps the built-in imagery/caption */
  cards?: GalleryCardContent[];
  texts?: (string | undefined)[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [geom, setGeom] = useState<Geom>({
    overflow: 1,
    scale: 0.9,
    stretch: 1,
    vw: 1440,
  });

  const mergedCards = CARDS.map((card, i) => ({
    ...card,
    src: cards?.[i]?.src || card.src,
    meta: cards?.[i]?.meta || card.meta,
  }));
  const mergedTexts = TEXTS.map((text, i) => ({
    ...text,
    copy: texts?.[i] || text.copy,
  }));

  /* decode every image up front — cards otherwise decode as they
     enter the viewport mid-travel, which stutters the ride */
  const srcKey = mergedCards.map((c) => c.src).join("|");
  useEffect(() => {
    srcKey.split("|").forEach((src) => {
      const img = new Image();
      img.src = src;
      img.decode?.().catch(() => {});
    });
  }, [srcKey]);

  useEffect(() => {
    const measure = () => {
      const scale = window.innerHeight / FRAME_H;
      const stretch = Math.max(1, window.innerWidth / (FRAME_W * scale));
      setGeom({
        overflow: Math.max(1, TRACK_D * scale * stretch - window.innerWidth),
        scale,
        stretch,
        vw: window.innerWidth,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end end"],
  });
  /* The pass starts as the section enters the viewport: the first
     100vh (of the 550vh wrapper) rides the stage into view with the
     track already drifting right-to-left at the ride's own speed —
     the slope is constant across entry and pin, so the opening
     composition seats exactly as the container top reaches the top
     of the screen, with no velocity kink. Linear, locked to the
     scroll. */
  const ENTRY = 100 / 550;
  const x = useTransform(() => {
    const preroll = geom.overflow * (ENTRY / (1 - ENTRY));
    return preroll - (preroll + geom.overflow) * scrollYProgress.get();
  });
  /* pin-phase progress (0 at pin, 1 at release) — the card parallax
     windows and the surface crossfade run on the pinned ride only */
  const pinned = useTransform(() =>
    Math.min(1, Math.max(0, (scrollYProgress.get() - ENTRY) / (1 - ENTRY))),
  );
  const surface = useTransform(pinned, [0.08, 0.92], [SURFACE_FROM, SURFACE_TO]);

  const left = (d: number) => d * geom.scale * geom.stretch;

  return (
    <div ref={ref} data-mode="light" className="relative h-[550vh] w-full bg-surface text-ink">
      <motion.div
        style={{ backgroundColor: surface }}
        className="sticky top-0 h-screen w-full overflow-hidden border-y border-line"
      >
        <motion.div
          style={{ x, width: left(TRACK_D), willChange: "transform" }}
          className="relative h-full"
        >
          {mergedCards.map((card, i) => (
            <GalleryCard key={i} progress={pinned} geom={geom} card={card} />
          ))}
          {mergedTexts.map((text) => (
            <p
              key={text.x}
              className="absolute font-display leading-[1.1] text-ink"
              style={{
                left: left(text.x),
                top: vh(text.y),
                width: vh(460),
                fontSize: vh(20),
              }}
            >
              {text.copy}
            </p>
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}

function GalleryCard({
  progress,
  geom,
  card,
}: {
  progress: import("motion/react").MotionValue<number>;
  geom: Geom;
  card: Card;
}) {
  /* the frame's slice of the ride, from entering right to leaving
     left — drives the inner image's lag (element-relative %, so the
     photo never exposes the frame) */
  const x = useTransform(() => {
    const leftPx = card.x * geom.scale * geom.stretch;
    const wPx = card.w * geom.scale;
    const a = Math.max(0, (leftPx - geom.vw) / geom.overflow);
    const b = Math.min(1, (leftPx + wPx) / geom.overflow);
    const t = Math.min(1, Math.max(0, (progress.get() - a) / (b - a)));
    return `${-A_EL + 2 * A_EL * t}%`;
  });
  return (
    <div
      className="absolute"
      style={{
        left: card.x * geom.scale * geom.stretch,
        top: vh(card.y),
        width: vh(card.w),
      }}
    >
      <p className="label mb-[1.26vh] font-medium text-ink-2">
        {card.meta.toUpperCase()}
      </p>
      <div className={`relative w-full overflow-hidden bg-surface-2 ${card.aspect}`}>
        <motion.div
          style={{ x, left: `-${A}%`, width: `${100 + A * 2}%` }}
          className="absolute inset-y-0"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={card.src} alt="" className="h-full w-full object-cover" />
        </motion.div>
        {card.tone === "tint" && (
          <div className="pointer-events-none absolute inset-0 bg-surface/45 mix-blend-color" aria-hidden />
        )}
      </div>
    </div>
  );
}

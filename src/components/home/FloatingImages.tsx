"use client";

import { useRef } from "react";
import { m, useReducedMotion, useScroll, useTransform } from "motion/react";

/*
  The "Floating images" interstitial's photographs: 4–6 lazy <img>s
  with real alt text, placed around a centered statement, each
  drifting at its own depth as the section scrolls through the
  viewport (0.1–0.3 of scroll distance — the Rivian/Apple "parallax
  as pacing" move, never a hero). Static under reduced motion.
  Positions are the Figma comp's six slots (37528:15387) as
  percentages of the 1440×900 frame so they scale with the viewport.
*/

export interface FloatData {
  src: string;
  alt: string;
}

/* left%, top%, width% of the frame, and the depth factor */
const SLOTS: [number, number, number, number][] = [
  [6.7, 12.4, 16.7, 0.18],
  [77.5, 9.8, 15.8, 0.26],
  [5.0, 62.2, 20.8, 0.12],
  [73.1, 64.4, 19.2, 0.22],
  [29.2, 77.8, 12.5, 0.3],
  [58.3, 6.7, 11.1, 0.16],
];

function Float({ src, alt, slot, progress }: { src: string; alt: string; slot: (typeof SLOTS)[number]; progress: ReturnType<typeof useScroll>["scrollYProgress"] }) {
  const reduce = useReducedMotion();
  const [left, top, width, depth] = slot;
  /* drift in px over the section's scroll span; depth sets the amount */
  const y = useTransform(progress, [0, 1], [depth * 240, depth * -240]);
  return (
    <m.figure
      className="absolute m-0"
      style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, y: reduce ? 0 : y }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" decoding="async" className="block h-auto w-full rounded-xs object-cover" />
      ) : (
        /* no asset yet (library preview, unfilled CMS slot): a neutral
           tile carrying the alt so the composition still reads */
        <span className="label flex aspect-[4/5] w-full items-center justify-center rounded-xs bg-wash p-2xl text-center text-ink-3">{alt}</span>
      )}
    </m.figure>
  );
}

export function FloatingImages({ floats, children }: { floats: FloatData[]; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  return (
    <div ref={ref} className="relative flex min-h-[56.25rem] w-full items-center justify-center">
      {floats.slice(0, SLOTS.length).map((f, i) => (
        <Float key={i} src={f.src} alt={f.alt} slot={SLOTS[i]} progress={scrollYProgress} />
      ))}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

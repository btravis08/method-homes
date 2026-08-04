"use client";

import {
  cubicBezier,
  motion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useRef } from "react";

import { ArrowUpRight } from "@/components/icons";

/*
  Legacy "Product Swirl" (Figma 34023:187310) — a black full-viewport
  moment: product imagery recedes along a diagonal spiral into the
  dark, dim mirrored arcs above and below, the campaign card dead
  center under a white SHOP button.

  The planes are positioned per the Figma frame (1440×1019 space,
  percentages here). The skewed ghost planes are rendered node
  exports; the flat center card reuses the hero photo. On scroll the
  cluster drifts subtly along the spiral's diagonal — background
  planes travel further than the center, so the stack parallaxes as
  it passes.
*/

const GLIDE = cubicBezier(0.22, 1, 0.36, 1);

/* x, y, w as % of the 1440×1019 frame; depth scales the drift */
const PLANES = [
  { src: "/figma/legacy/swirl-arc-high.png", x: 23.48, y: -3.16, w: 45.18, depth: 1 },
  { src: "/figma/legacy/swirl-arc-low.png",  x: 19.32, y: 63.72, w: 59.16, depth: 1 },
  { src: "/figma/legacy/swirl-sliver-l.png", x: 23.28, y: 13.12, w: 2.53,  depth: 0.7 },
  { src: "/figma/legacy/swirl-hoodie.png",   x: 26.22, y: 20.05, w: 13.52, depth: 0.55 },
  { src: "/figma/legacy/swirl-table.png",    x: 61.49, y: 41.19, w: 15.39, depth: 0.55 },
  { src: "/figma/legacy/swirl-sliver-r.png", x: 77.52, y: 51.1,  w: 4.22,  depth: 0.7 },
] as const;

function Plane({
  progress,
  src,
  x,
  y,
  w,
  depth,
}: {
  progress: MotionValue<number>;
  src: string;
  x: number;
  y: number;
  w: number;
  depth: number;
}) {
  /* drift down-right to up-left along the spiral's diagonal */
  const drift = useTransform(progress, [0, 1], [40 * depth, -40 * depth], {
    ease: GLIDE,
  });
  return (
    <motion.div
      className="absolute"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: `${w}%`,
        x: drift,
        y: drift,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="w-full" />
    </motion.div>
  );
}

export function ProductSwirl({
  cta = "Shop Sun Day Red",
  centerImage = "/figma/legacy/hero.jpg",
}: {
  cta?: string;
  centerImage?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const centerDrift = useTransform(scrollYProgress, [0, 1], [16, -16], {
    ease: GLIDE,
  });

  return (
    <section
      ref={ref}
      data-mode="dark"
      className="relative h-screen w-full overflow-hidden bg-black text-ink"
    >
      {PLANES.map((plane) => (
        <Plane key={plane.src} progress={scrollYProgress} {...plane} />
      ))}
      {/* the flat center card — the campaign photo, then the button */}
      <motion.div
        className="absolute left-[40.4%] top-[29.64%] w-[20.45%]"
        style={{ x: centerDrift, y: centerDrift }}
      >
        <div className="relative aspect-[294/369] w-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={centerImage}
            alt="Sun Day Red campaign"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      </motion.div>
      <div className="absolute inset-0 flex items-center justify-center">
        <a
          href="#"
          className="label flex h-12 min-w-[9.375rem] items-center justify-center gap-1.5 rounded-xs bg-white px-[1.125rem] font-medium text-black transition-opacity hover:opacity-90"
        >
          {cta.toUpperCase()}
          <ArrowUpRight />
        </a>
      </div>
    </section>
  );
}

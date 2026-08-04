"use client";

import { useRef } from "react";
import { m, useInView } from "motion/react";
import { EASE_TICK } from "@/lib/motion";

/*
  Radial tick dials for the tech-specs stats. Each ring is 45 ticks on
  an 8° rhythm (3° tick / 5° gap); the full ring renders in the
  hairline tone and the value's share draws over it in ink.

  The dials stack vertically and share one timeline: when the group
  first scrolls into view every dial starts animating, each offset by
  its index, and within a dial the ink ticks draw outward from their
  inner end (pathLength 0 → 1, ease-out) staggered tightly enough that
  neighbors overlap as the fill sweeps clockwise from 12 o'clock.
*/

const TICKS = 45;
const STEP = 360 / TICKS;
const R_OUT = 32;
const R_IN = 20;
/* start-time offset between consecutive dials on the shared timeline */
const DIAL_STAGGER = 0.225;

/* inner→outer path so pathLength draws the tick outward */
const tickPath = (i: number) => {
  const a = ((-90 + i * STEP) * Math.PI) / 180;
  const x1 = 32 + R_IN * Math.cos(a);
  const y1 = 32 + R_IN * Math.sin(a);
  const x2 = 32 + R_OUT * Math.cos(a);
  const y2 = 32 + R_OUT * Math.sin(a);
  return `M ${x1.toFixed(3)} ${y1.toFixed(3)} L ${x2.toFixed(3)} ${y2.toFixed(3)}`;
};

function StatDial({
  value = 0,
  label,
  active,
  delay = 0,
}: {
  value?: number;
  label?: string;
  active: boolean;
  delay?: number;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const filled = Math.round((pct / 100) * TICKS);

  return (
    <div className="flex shrink-0 items-center gap-3">
      <svg aria-hidden viewBox="0 0 64 64" className="size-16 overflow-visible" strokeWidth={1.6}>
        {/* full hairline ring underneath; the value's ticks draw over it */}
        {Array.from({ length: TICKS }, (_, i) => (
          <path key={i} d={tickPath(i)} className="stroke-[var(--line)]" />
        ))}
        {Array.from({ length: filled }, (_, i) => (
          <m.path
            key={i}
            d={tickPath(i)}
            className="stroke-[var(--ink)]"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: active ? 1 : 0 }}
            transition={{
              duration: 0.34,
              delay: delay + i * 0.026,
              ease: [...EASE_TICK],
            }}
          />
        ))}
      </svg>
      <div className="flex flex-col gap-0.5 font-mono text-[0.6875rem] uppercase leading-tight tracking-wide">
        <p className="max-w-32 text-ink">{label}</p>
        <p className="text-ink-3">{pct}/100</p>
      </div>
    </div>
  );
}

export function StatDials({
  stats,
}: {
  stats: Array<{ _key?: string; value?: number; label?: string }>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -15% 0px" });

  return (
    <div ref={ref} className="flex flex-col gap-8 pt-4">
      {stats.map((stat, i) => (
        <StatDial
          key={stat._key ?? i}
          value={stat.value}
          label={stat.label}
          active={inView}
          delay={i * DIAL_STAGGER}
        />
      ))}
    </div>
  );
}

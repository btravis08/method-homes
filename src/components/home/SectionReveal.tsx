"use client";

import { createContext, useContext, useRef } from "react";
import { m, useInView } from "motion/react";
import { EASE_OUT } from "@/lib/motion";

/*
  Generic section animation wrapper: the wrapper watches its own
  bounds and flips a context flag once 20% of the section has entered
  the viewport (once per page view). Reveal leaves anywhere inside
  read that flag and run their own delayed animation, so a section's
  whole choreography starts from a single trigger instead of each
  element tripping independently.

  Leaves:
  - RevealText — the text holds still while a mask wipes down over
    it (clip-path inset), uncovering it top to bottom
  - RevealLine — a rule that draws in from the left (scaleX)
*/

const RevealContext = createContext(false);
export const useSectionRevealed = () => useContext(RevealContext);

const EASE: [number, number, number, number] = [...EASE_OUT];

export function SectionReveal({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.2 });
  return (
    <div ref={ref} className={className}>
      <RevealContext.Provider value={inView}>{children}</RevealContext.Provider>
    </div>
  );
}

export function RevealText({
  delay = 0,
  className,
  children,
}: {
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const on = useSectionRevealed();
  return (
    <m.div
      className={className}
      initial={{ clipPath: "inset(0 0 100% 0)" }}
      animate={{ clipPath: on ? "inset(0 0 0% 0)" : "inset(0 0 100% 0)" }}
      transition={{ duration: 1.2, delay, ease: EASE }}
    >
      {children}
    </m.div>
  );
}

export function RevealLine({
  delay = 0,
  className,
}: {
  delay?: number;
  className?: string;
}) {
  const on = useSectionRevealed();
  return (
    <m.div
      aria-hidden
      className={`origin-left ${className ?? ""}`}
      initial={{ scaleX: 0 }}
      animate={{ scaleX: on ? 1 : 0 }}
      transition={{ duration: 0.55, delay, ease: EASE }}
    />
  );
}

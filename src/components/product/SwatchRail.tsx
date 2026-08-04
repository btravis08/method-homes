"use client";

import { animate, m, useMotionValue, useTransform } from "motion/react";
import { useLayoutEffect, useRef } from "react";

import type { HeroVariantData } from "@/components/product/ProductHero";
import { EASE_DRAMATIC } from "@/lib/motion";

/*
  Colorway swatch tiles with a travelling selection underline — the
  horizontal twin of the vertical carousel's thumb-rail bar. One 2px
  ink line rides the bottom edge; selecting another swatch slides it
  over on the dramatic bezier, both edges tweening on the same curve
  with the trailing edge lagged so the line stretches mid-travel
  (~1.5x for an adjacent hop up to 2x across the full row) and
  reabsorbs into the landing.
*/

const DUR = 0.6;
const EASE: [number, number, number, number] = [...EASE_DRAMATIC];

export function SwatchRail({
  variants,
  selected,
  onSelect,
}: {
  variants: HeroVariantData[];
  selected: number;
  onSelect: (i: number) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const prevLeft = useRef<number | null>(null);
  const edgeL = useMotionValue(0);
  const edgeR = useMotionValue(0);
  const barWidth = useTransform([edgeL, edgeR], ([l, r]: number[]) => r - l);

  useLayoutEffect(() => {
    const measure = () => {
      const btns = railRef.current?.querySelectorAll("button");
      const btn = btns?.[selected];
      if (!btns || !btn) return null;
      return { btns, left: btn.offsetLeft, width: btn.offsetWidth };
    };
    const m = measure();
    if (!m) return;
    const right = m.left + m.width;
    const prev = prevLeft.current;
    if (prev === null || prev === m.left) {
      edgeL.jump(m.left);
      edgeR.jump(right);
    } else {
      const dist = Math.abs(m.left - prev);
      const step =
        m.btns.length > 1
          ? Math.abs(m.btns[1].offsetLeft - m.btns[0].offsetLeft)
          : m.width;
      const steps = Math.max(1, Math.round(dist / step));
      const totalSteps = Math.max(2, m.btns.length - 1);
      const stretch = 1.5 + (0.5 * (steps - 1)) / (totalSteps - 1);
      /* peak stretch ≈ mid-flight speed (≈5.9·dist/DUR) × lag */
      const extra = (stretch - 1) * m.width;
      const lag = Math.min(0.15, (extra * DUR) / (5.9 * dist));
      const fwd = m.left > prev;
      animate(edgeL, m.left, { duration: DUR, ease: EASE, delay: fwd ? lag : 0 });
      animate(edgeR, right, { duration: DUR, ease: EASE, delay: fwd ? 0 : lag });
    }
    prevLeft.current = m.left;

    const onResize = () => {
      const r = measure();
      if (!r) return;
      edgeL.jump(r.left);
      edgeR.jump(r.left + r.width);
      prevLeft.current = r.left;
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, variants.length]);

  return (
    <div ref={railRef} className="relative flex items-center gap-[0.3125rem]">
      {variants.map((variant, i) => (
        <button
          key={i}
          type="button"
          aria-label={variant.name ?? `Colorway ${i + 1}`}
          aria-pressed={i === selected}
          onClick={() => onSelect(i)}
          className="flex size-[2.875rem] items-end justify-center overflow-hidden bg-wash md:size-10"
        >
          {variant.image ? (
            <span
              aria-hidden
              className="block size-full bg-contain bg-center bg-no-repeat opacity-90"
              style={{ backgroundImage: `url(${variant.image})` }}
            />
          ) : (
            <span
              aria-hidden
              className="block size-full"
              style={{ backgroundColor: variant.color ?? "#c8c8c4" }}
            />
          )}
        </button>
      ))}
      {/* the travelling underline */}
      <m.span
        aria-hidden
        className="absolute bottom-0 h-0.5 bg-ink"
        style={{ left: edgeL, width: barWidth }}
      />
    </div>
  );
}

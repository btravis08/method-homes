"use client";

import { useState } from "react";

import { LazyPlanViewer } from "./LazyPlanViewer";

/*
  HOW IT WORKS — the module story section, after the Figma "How it
  works" frame (9nqsOUuF2UrgukNYok3Oko, node 37656:61297; Bryce,
  2026-10-09): the step toggle on top, a thin ring around the 3D view
  with four square "+" hotspots on it, a callout card at the upper
  right, the model in the middle. Desktop frame 1440 × 1246, ring
  921 px at (259, 212), hotspots 60 px squares at 10:30 / 8:30 / 6 /
  3:30 on the ring, card 479 × 166 at (900, 255). Mobile stacks: the
  view, a step indicator, the card, the toggle. The 3D treatment itself
  lives in PlanViewer (modes single / modules / 3d).
*/

type Mode = "single" | "modules" | "3d" | "plan";

export interface HowItWorksStep {
  mode: Mode;
  label: string;
  callout: { title: string; body: string; image?: string };
}

const DEFAULT_STEPS: HowItWorksStep[] = [
  { mode: "single", label: "The Module", callout: { title: "Craft at the bench", body: "Carpenters and plumbers working at a level of detail a site crew can’t hold. Same hands, same station, every module." } },
  { mode: "modules", label: "The Assembly", callout: { title: "Set in a day", body: "Modules arrive finished inside and out, craned onto the foundation and joined along the marriage walls." } },
  { mode: "3d", label: "The Finished Home", callout: { title: "Smart lighting", body: "Every room wired at the factory, so the home is ready to live in the week it lands." } },
];

/* ring positions of the four hotspots, as angles on screen (0 = 3
   o'clock, clockwise), read off the Figma frame */
const HOTSPOTS = [237, 159, 90, 21];

export function HowItWorks({ src = "/models/test.glb", focusRoom = "KITCHEN", steps = DEFAULT_STEPS, eyebrow = "How it works" }: { src?: string; focusRoom?: string; steps?: HowItWorksStep[]; eyebrow?: string }) {
  const [index, setIndex] = useState(0);
  const step = steps[index] ?? steps[0];
  const toggle = (
    <div role="group" aria-label={eyebrow} className="pointer-events-auto flex items-center rounded-(--radius-xl) bg-black/10 p-xs">
      {steps.map((s, i) => (
        <button
          key={s.mode}
          type="button"
          aria-pressed={i === index}
          onClick={() => setIndex(i)}
          className={`h-11 rounded-(--radius-lg) px-xl text-body-sm font-medium tracking-tight transition-colors ${i === index ? "bg-white text-ink" : "text-ink-2 hover:text-ink"}`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
  const card = (
    <div className="flex overflow-hidden rounded-(--radius-xl) bg-surface/90 backdrop-blur-md">
      <div className="w-[33%] shrink-0 bg-line-2 md:w-[9.75rem]">{step.callout.image && <img src={step.callout.image} alt="" className="size-full object-cover" loading="lazy" decoding="async" />}</div>
      <div className="flex flex-col gap-lg p-3xl">
        <p className="text-body-md font-medium text-ink">{step.callout.title}</p>
        <p className="text-body-sm text-ink-3">{step.callout.body}</p>
      </div>
    </div>
  );
  return (
    <section data-mode="light" className="relative w-full bg-surface text-ink">
      {/* desktop: the Figma frame, kept in its 1440 × 1246 proportion */}
      <div className="relative hidden w-full md:block" style={{ aspectRatio: "1440 / 1246" }}>
        <div className="absolute inset-0">
          <LazyPlanViewer src={src} alt="Method home, module by module" modes={steps.map((s) => s.mode)} focusRoom={focusRoom} explodeGap={0.36} connectors occlusion hideControls fill distance={1.45} distanceSingle={2.3} mode={step.mode} />
        </div>
        {/* the ring and its hotspots */}
        <div className="pointer-events-none absolute left-[18.02%] top-[17%] aspect-square w-[63.98%] rounded-full border border-line-2">
          {HOTSPOTS.map((deg) => (
            <button
              key={deg}
              type="button"
              aria-label="More"
              className="pointer-events-auto absolute flex size-[3.75rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-(--radius-xl) bg-black/20 text-white backdrop-blur-md transition-colors hover:bg-black/30"
              style={{ left: `${50 + 50 * Math.cos((deg * Math.PI) / 180)}%`, top: `${50 + 50 * Math.sin((deg * Math.PI) / 180)}%` }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden><path d="M9 2v14M2 9h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </button>
          ))}
        </div>
        <div className="absolute left-1/2 top-[6.1%] -translate-x-1/2">{toggle}</div>
        <div className="absolute left-[62.5%] top-[20.5%] w-[33.3%]">{card}</div>
      </div>
      {/* mobile: the view, a step indicator, the card, the toggle */}
      <div className="flex flex-col gap-2xl px-xl py-4xl md:hidden">
        <div className="relative h-[60svh] w-full">
          <LazyPlanViewer src={src} alt="Method home, module by module" modes={steps.map((s) => s.mode)} focusRoom={focusRoom} explodeGap={0.36} connectors occlusion hideControls fill distance={1.45} distanceSingle={2.3} mode={step.mode} />
        </div>
        <div className="flex items-center justify-center gap-xs" aria-hidden>
          {steps.map((s, i) => (
            <span key={s.mode} className={`h-1 rounded-(--radius-full) transition-all ${i === index ? "w-6 bg-ink" : "w-2 bg-line-2"}`} />
          ))}
        </div>
        {card}
        <div className="flex justify-center">{toggle}</div>
      </div>
    </section>
  );
}

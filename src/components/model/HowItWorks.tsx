"use client";

import { useEffect, useRef, useState } from "react";

import { LazyPlanViewer } from "./LazyPlanViewer";

/*
  HOW IT WORKS — the module story section, after the Figma "How it
  works" frame (9nqsOUuF2UrgukNYok3Oko, node 37656:61297; Bryce,
  2026-10-09/10):

  DESKTOP (1440 × 1246): the step toggle on top, a thin ring around the
  3D view with four square "+" hotspots on it, a callout card at the
  upper right, the model in the middle. Ring 921 px at (259, 212),
  hotspots 60 px squares at 10:30 / 8:30 / 6 / 3:30 on the ring, card
  479 × 166 at (900, 255).

  MOBILE (428 × 800, node 37660:63233): a viewport-high panel; the model
  sits in the upper half, and a stack hugs the bottom with 24 px gaps —
  the card indicator (five bars: the active one long and dark, the rest
  dots), the callout card (centred text, 24 / 32 padding), and the
  toggle stretched full width (its last label shortens to "The Home").

  CARDS: each step carries five callouts. The indicator animates the
  way Apple's does — the active bar fills over `cardSeconds`, then the
  next card comes in — and it runs only while the section is on screen.
  The 3D treatment itself lives in PlanViewer (modes single / modules /
  3d); phones get the model about twice as close (Bryce: "the module
  should be double its current size, the assembly 1.5×, the home 1.4×").
*/

type Mode = "single" | "modules" | "3d" | "plan";

export interface HowItWorksCard {
  title: string;
  body: string;
  image?: string;
}

export interface HowItWorksStep {
  mode: Mode;
  label: string;
  /* a shorter label for the stretched mobile toggle */
  short?: string;
  cards: HowItWorksCard[];
}

const DEFAULT_STEPS: HowItWorksStep[] = [
  {
    mode: "single",
    label: "The Module",
    cards: [
      { title: "Craft at the bench", body: "Carpenters and plumbers working at a level of detail a site crew can’t hold. Same hands, same station, every module." },
      { title: "Built indoors", body: "Framing, wiring and finishes go in under a roof, so weather never touches the work or the schedule." },
      { title: "Checked at every station", body: "Each module passes inspection before it moves down the line, not once at the end." },
      { title: "Finished inside and out", body: "Cabinets, tile, fixtures and siding ship installed. What leaves the factory is a room, not a shell." },
      { title: "Wrapped for the road", body: "Modules are sealed, strapped and trucked to the site with the interiors protected." },
    ],
  },
  {
    mode: "modules",
    label: "The Assembly",
    cards: [
      { title: "Set in a day", body: "Modules arrive finished inside and out, craned onto the foundation and joined along the marriage walls." },
      { title: "A crane and a crew", body: "One lift per module. Most homes are weather-tight by the end of the first day on site." },
      { title: "Married at the seams", body: "Adjoining walls bolt together and the roof is stitched across the joint, then flashed and sealed." },
      { title: "Site-built pieces", body: "Decks, garages and the larger living spaces are framed on site to meet the modules." },
      { title: "Utilities connected", body: "Plumbing, power and data were roughed in at the factory; on site they are joined and tested." },
    ],
  },
  {
    mode: "3d",
    label: "The Finished Home",
    short: "The Home",
    cards: [
      { title: "Smart lighting", body: "Every room wired at the factory, so the home is ready to live in the week it lands." },
      { title: "Energy efficiency", body: "A tight envelope and factory-fitted insulation keep the heating and cooling loads low." },
      { title: "Light on the earth", body: "Less site disturbance, less waste and a shorter build keep the footprint small." },
      { title: "Move-in ready", body: "Final trim, landscaping and a walkthrough, then the keys." },
      { title: "Built to last", body: "Engineered to travel, so the structure is stiffer than a stick-built home needs to be." },
    ],
  },
];

/* ring positions of the four hotspots, as angles on screen (0 = 3
   o'clock, clockwise), read off the Figma frame */
const HOTSPOTS = [237, 159, 90, 21];

function Indicator({ count, active, seconds, running }: { count: number; active: number; seconds: number; running: boolean }) {
  return (
    <div className="flex items-center justify-center gap-[0.3125rem]" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={`relative h-[0.56rem] overflow-hidden rounded-(--radius-full) bg-line-2 transition-[width] duration-300 ${i === active ? "w-12" : "w-[0.59rem]"}`}>
          {i === active && (
            <span
              className="absolute inset-y-0 left-0 rounded-(--radius-full) bg-ink"
              style={{ width: running ? "100%" : "0%", transition: running ? `width ${seconds}s linear` : "none" }}
            />
          )}
        </span>
      ))}
    </div>
  );
}

export function HowItWorks({ src = "/models/test.glb", focusRoom = "KITCHEN", steps = DEFAULT_STEPS, eyebrow = "How it works", cardSeconds = 5 }: { src?: string; focusRoom?: string; steps?: HowItWorksStep[]; eyebrow?: string; cardSeconds?: number }) {
  const [index, setIndex] = useState(0);
  const [card, setCard] = useState(0);
  const [onScreen, setOnScreen] = useState(false);
  /* the fill starts a beat after the card mounts, so the transition runs
     from 0 instead of landing at 100 */
  const [running, setRunning] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const step = steps[index] ?? steps[0];
  const cards = step.cards;
  const current = cards[card % cards.length] ?? cards[0];

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => setOnScreen(entries.some((e) => e.isIntersecting)), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  /* the card clock: fill over `cardSeconds`, then the next card; only
     while the section is on screen */
  useEffect(() => {
    if (!onScreen) {
      setRunning(false);
      return;
    }
    setRunning(false);
    const start = window.setTimeout(() => setRunning(true), 30);
    const next = window.setTimeout(() => setCard((c) => (c + 1) % cards.length), cardSeconds * 1000 + 30);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(next);
    };
  }, [card, index, onScreen, cards.length, cardSeconds]);

  const select = (i: number) => {
    setIndex(i);
    setCard(0);
  };
  const toggle = (stretch: boolean) => (
    <div role="group" aria-label={eyebrow} className={`pointer-events-auto flex items-center rounded-(--radius-xl) bg-black/10 p-xs ${stretch ? "w-full" : ""}`}>
      {steps.map((s, i) => (
        <button
          key={s.mode}
          type="button"
          aria-pressed={i === index}
          onClick={() => select(i)}
          className={`h-11 rounded-(--radius-lg) text-body-sm font-medium tracking-tight transition-colors ${stretch ? "flex-1 px-md" : "px-xl"} ${i === index ? "bg-white text-ink" : "text-ink-2 hover:text-ink"}`}
        >
          {stretch ? (s.short ?? s.label) : s.label}
        </button>
      ))}
    </div>
  );
  const viewer = (phone: boolean) => (
    <LazyPlanViewer
      src={src}
      alt="Method home, module by module"
      modes={steps.map((s) => s.mode)}
      focusRoom={focusRoom}
      explodeGap={0.36}
      connectors
      occlusion
      hideControls
      fill
      distance={phone ? 1.0 : 1.45}
      distanceSingle={phone ? 1.15 : 2.3}
      mode={step.mode}
    />
  );
  const fade = { animation: "hiw-fade 0.5s ease-out" } as const;
  return (
    <section ref={ref} data-mode="light" className="relative w-full bg-surface text-ink">
      <style>{`@keyframes hiw-fade { from { opacity: 0; transform: translateY(0.25rem) } to { opacity: 1; transform: none } }`}</style>
      {/* desktop: the Figma frame, kept in its 1440 × 1246 proportion */}
      <div className="relative hidden w-full md:block" style={{ aspectRatio: "1440 / 1246" }}>
        <div className="absolute inset-0">{viewer(false)}</div>
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
        <div className="absolute left-1/2 top-[6.1%] -translate-x-1/2">{toggle(false)}</div>
        <div className="absolute left-[62.5%] top-[20.5%] w-[33.3%]">
          <div key={`${index}-${card}`} style={fade} className="flex overflow-hidden rounded-(--radius-xl) bg-surface/90 backdrop-blur-md">
            <div className="w-[9.75rem] shrink-0 bg-line-2">{current.image && <img src={current.image} alt="" className="size-full object-cover" loading="lazy" decoding="async" />}</div>
            <div className="flex flex-col gap-lg p-3xl">
              <p className="text-body-md font-medium text-ink">{current.title}</p>
              <p className="text-body-sm text-ink-3">{current.body}</p>
            </div>
          </div>
          <div className="mt-lg">
            <Indicator count={cards.length} active={card % cards.length} seconds={cardSeconds} running={running} />
          </div>
        </div>
      </div>
      {/* mobile: the model in the upper half, the stack hugging the bottom */}
      <div className="relative flex h-[100svh] min-h-[40rem] w-full flex-col justify-end gap-3xl p-3xl md:hidden">
        <div className="absolute inset-x-0 top-0 h-[58%]">{viewer(true)}</div>
        <div className="relative">
          <Indicator count={cards.length} active={card % cards.length} seconds={cardSeconds} running={running} />
        </div>
        <div key={`${index}-${card}`} style={fade} className="relative flex flex-col items-center gap-lg rounded-(--radius-xl) bg-surface/90 px-3xl pb-4xl pt-3xl text-center backdrop-blur-md">
          <p className="text-body-md font-medium text-ink">{current.title}</p>
          <p className="text-body-sm text-ink-3">{current.body}</p>
        </div>
        <div className="relative">{toggle(true)}</div>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import { m, useReducedMotion } from "motion/react";

import { CtaButton, UnderlineLink } from "@/components/home/sections";
import { DUR, EASE_OUT } from "@/lib/motion";

/*
  Lineup (Figma 37525:15056) — the Rivian "Explore the lineup" pattern:
  a pill toggle across the series swaps one photograph, a sentence, a
  meta line, four big numbers and the exterior palette.

  Editorial-section rules (AGENTS.md): every fact is DOM text; the
  pills are real links to each series page (no-JS and crawlers get a
  working list of the lineup; JS turns a click into an in-place swap);
  one toggle, nothing else interactive. The shared twin that carries
  every series' facts at once is the Card grid above it and the
  Compare table below, so nothing here needs to be hidden-but-present.
  Numbers carry footnote markers to the sources line the page prints.
*/

export interface LineupSeriesData {
  slug: string;
  name: string;
  sentence?: string;
  /* "From $585k²  ·  9–11 months from contract to set day³" */
  meta?: string;
  image?: string;
  alt?: string;
  lqip?: string;
  numbers: { value: string; label: string }[];
  palette?: { name?: string; color?: string }[];
}

const SAMPLE: LineupSeriesData[] = [
  {
    slug: "elemental",
    name: "Elemental",
    sentence: "Our most flexible series: single-storey studios to family-size two-storey plans, all on one modular grid.",
    meta: "From {low}²  ·  {months} months from contract to set day³",
    alt: "Elemental Series home — exterior, flat roof and deep overhangs",
    numbers: [
      { value: "624–3,500", label: "Square feet" },
      { value: "8", label: "Floor plans" },
      { value: "1–4", label: "Bedrooms" },
      { value: "10–14 wks", label: "In the factory" },
    ],
    palette: [
      { name: "Cedar", color: "#8a6a4b" },
      { name: "Charcoal", color: "#2b2b2a" },
      { name: "Fog", color: "#b9bab6" },
      { name: "Bone", color: "#e9e7e0" },
      { name: "Rust", color: "#7a4a3a" },
    ],
  },
  {
    slug: "annata",
    name: "Annata",
    sentence: "Warm, gabled family homes in two sizes, with a vaulted living room under the ridge.",
    meta: "From {low}²  ·  {months} months from contract to set day³",
    alt: "Annata Series home — exterior, gabled façade in cedar",
    numbers: [
      { value: "1,590–2,250", label: "Square feet" },
      { value: "2", label: "Floor plans" },
      { value: "3–4", label: "Bedrooms" },
      { value: "12 wks", label: "In the factory" },
    ],
    palette: [
      { name: "Cedar", color: "#8a6a4b" },
      { name: "Charcoal", color: "#2b2b2a" },
      { name: "Fog", color: "#b9bab6" },
    ],
  },
];

export function Lineup({
  mode = "light",
  eyebrow = "The series",
  headline = "Explore the lineup.",
  series = SAMPLE,
  compareHref = "#compare",
  sources,
}: {
  mode?: "light" | "light-mid" | "dark-mid" | "dark";
  eyebrow?: string;
  headline?: string;
  series?: LineupSeriesData[];
  /* the Compare link beside the toggle; null hides it */
  compareHref?: string | null;
  /* footnote sources the ¹²³ markers in the facts point at */
  sources?: { label?: string; url?: string; date?: string }[];
}) {
  const list = series.filter((s) => s.slug && s.name);
  /* `index` is the pill the visitor chose; `shown` is what the stage
     renders — it follows after a short fade-out so the swap is a
     state-driven cross-fade, not a mount animation */
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(0);
  const reduce = useReducedMotion();
  const fading = index !== shown;
  const active = list[Math.min(shown, Math.max(0, list.length - 1))];
  if (!active) return null;
  const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) : null);
  const used = (sources ?? []).filter((s) => s.label);

  return (
    <section data-mode={mode} className="w-full bg-surface px-4 py-10xl text-ink md:px-7xl md:py-11xl">
      <div className="mx-auto flex w-full max-w-page flex-col items-center gap-7xl">
        <div className="flex w-full max-w-[62.5rem] flex-col items-center gap-3xl text-center">
          {eyebrow && <p className="label text-ink-3">{eyebrow}</p>}
          <h2 className="font-display text-headline-lg text-ink">{headline}</h2>
        </div>

        <div className="flex w-full max-w-full flex-col items-center gap-3xl md:flex-row md:justify-center">
          {/* the toggle: a list of links to the series pages; JS makes a
              click swap the stage in place instead of navigating */}
          <nav aria-label="Series" className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ul role="list" className="flex w-max items-start gap-xxs rounded-(--radius-full) bg-line-2 p-xxs">
              {list.map((s, i) => {
                const on = i === index;
                return (
                  <li key={s.slug}>
                    <a
                      href={`/series/${s.slug}`}
                      aria-current={on ? "true" : undefined}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                        e.preventDefault();
                        setIndex(i);
                      }}
                      className={`relative inline-flex items-center whitespace-nowrap rounded-(--radius-full) px-3xl py-lg text-body-sm font-medium transition-colors ${on ? "text-ink" : "text-ink-3 hover:text-ink"}`}
                    >
                      <span aria-hidden className={`absolute inset-0 rounded-(--radius-full) bg-surface transition-opacity duration-300 ${on ? "opacity-100" : "opacity-0"}`} />
                      <span className="relative">{s.name}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
          {compareHref && <UnderlineLink label="Compare" href={compareHref} />}
        </div>

        {/* the stage: one series at a time, state-driven fades (never
            mount animations — the page transition suppresses those) */}
        <m.div
          initial={false}
          animate={{ opacity: fading ? 0 : 1 }}
          transition={{ duration: reduce ? 0 : DUR.fast, ease: EASE_OUT }}
          onAnimationComplete={() => {
            if (fading) setShown(index);
          }}
          aria-live="polite"
          className="flex w-full flex-col items-center gap-7xl"
        >
          <div className="relative aspect-[2/1] w-full max-w-[68.75rem] overflow-hidden rounded-md bg-wash md:aspect-auto md:h-[35rem]">
            {active.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={active.image}
                alt={active.alt ?? `${active.name} series home`}
                loading={shown === 0 ? "eager" : "lazy"}
                decoding="async"
                className="absolute inset-0 size-full object-cover"
                style={active.lqip ? { backgroundImage: `url(${active.lqip})`, backgroundSize: "cover" } : undefined}
              />
            ) : (
              <span className="label absolute inset-0 flex items-center justify-center px-2xl text-center text-ink-3">{active.alt ?? `${active.name} series photograph`}</span>
            )}
          </div>

          <div className="flex w-full max-w-[62.5rem] flex-col items-center gap-4xl text-center">
            {active.sentence && <p className="max-w-[45rem] text-body-xl text-ink-2">{active.sentence}</p>}
            {active.meta && <p className="text-body-md font-medium text-ink">{active.meta}</p>}
            {active.numbers.length > 0 && (
              <dl className="flex flex-wrap items-start justify-center gap-x-6xl gap-y-3xl">
                {active.numbers.filter((n) => n.value).map((n) => (
                  <div key={n.label} className="flex flex-col items-center gap-xs">
                    <dd className="font-display text-headline-lg text-ink">{n.value}</dd>
                    <dt className="text-body-sm text-ink-3">{n.label}</dt>
                  </div>
                ))}
              </dl>
            )}
            {active.palette && active.palette.filter((p) => p.color).length > 0 && (
              <ul role="list" aria-label="Exterior palette" className="flex items-center gap-lg">
                {active.palette.filter((p) => p.color).map((p, i) => (
                  <li key={`${p.name}-${i}`} className="size-7 rounded-(--radius-full) border border-line" style={{ backgroundColor: p.color }} title={p.name}>
                    <span className="sr-only">{p.name}</span>
                  </li>
                ))}
                <li className="label text-ink-3">Exterior palette</li>
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-lg">
            <CtaButton label={`Explore ${active.name}`} href={`/series/${active.slug}`} />
            <CtaButton label="Get a range for your site" href="/get-started" variant="secondary" />
          </div>
        </m.div>

        {used.length > 0 && (
          <ol className="flex flex-wrap justify-center gap-x-xl gap-y-xs label text-ink-3">
            <li className="list-none">Sources</li>
            {used.map((s, i) => (
              <li key={i} className="list-none">
                <sup>{i + 1}</sup>{" "}
                {s.url ? <a href={s.url} rel="noopener" className="underline-offset-2 hover:underline">{s.label}</a> : s.label}
                {fmt(s.date) ? ` (${fmt(s.date)})` : ""}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

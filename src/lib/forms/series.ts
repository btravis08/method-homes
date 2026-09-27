import data from "./series-data.json";
import type { Answers, FieldOption } from "./types";

/*
  Predesigned series and the "fit" rule behind the series step.

  The step asks about size and budget first, then offers the series
  whose plans fit: a series fits when its plan sizes overlap the chosen
  size (±25%) and its starting price is within the chosen budget band.
  A series with unknown size or price is never excluded by that
  dimension — missing data widens the list, it never hides a series.
  When nothing fits, every series is offered.

  series-data.json is filled from the live series and floor-plan pages
  (GitHub Actions → crawl-series) — sizes are the smallest and largest
  plan, price is the lowest "starting at" figure. Null means unknown.
*/

export interface SeriesInfo {
  value: string;
  label: string;
  image: string;
  sqftMin: number | null;
  sqftMax: number | null;
  priceFrom: number | null;
  plans: number | null;
}

const ORDER = ["method-one", "annata", "cabin", "elemental", "m", "option", "paradigm"] as const;
const LABEL: Record<string, string> = {
  "method-one": "Method One",
  annata: "Annata",
  cabin: "Cabin",
  elemental: "Elemental",
  m: "M Series",
  option: "Option",
  paradigm: "Paradigm",
};

type Raw = Record<string, { sqftMin?: number | null; sqftMax?: number | null; priceFrom?: number | null; plans?: number | null }>;

export const SERIES: SeriesInfo[] = ORDER.map((slug) => {
  const d = (data as Raw)[slug] ?? {};
  return {
    value: slug,
    label: LABEL[slug],
    image: `/method/intake/series-${slug}.webp`,
    sqftMin: d.sqftMin ?? null,
    sqftMax: d.sqftMax ?? null,
    priceFrom: d.priceFrom ?? null,
    plans: d.plans ?? null,
  };
});

/* the size answer → a target square footage */
const SIZE_TARGET: Record<string, number> = {
  "500": 500,
  "800": 800,
  "1000": 1000,
  "1500": 1500,
  "2000": 2000,
  "2500": 2500,
  "2500-plus": 3200,
};

/* the budget answer → the most they said they'd spend */
const BUDGET_MAX: Record<string, number> = {
  "200-400k": 400_000,
  "400-600k": 600_000,
  "600-800k": 800_000,
  "800k-1m": 1_000_000,
  "1-2m": 2_000_000,
  "2m-plus": Number.POSITIVE_INFINITY,
};

export function seriesFits(s: SeriesInfo, a: Answers): boolean {
  const target = SIZE_TARGET[String(a.res_size)];
  if (target && s.sqftMin !== null && s.sqftMax !== null) {
    if (s.sqftMax < target * 0.75 || s.sqftMin > target * 1.25) return false;
  }
  const max = BUDGET_MAX[String(a.res_budget)];
  if (max !== undefined && s.priceFrom !== null && s.priceFrom > max) return false;
  return true;
}

const fmtSqft = (n: number) => n.toLocaleString("en-US");
const fmtPrice = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n % 1_000_000 ? 2 : 0).replace(/\.?0+$/, "")}M` : `$${Math.round(n / 1000)}k`;

export function seriesMeta(s: SeriesInfo): string {
  const parts: string[] = [];
  if (s.sqftMin !== null && s.sqftMax !== null)
    parts.push(s.sqftMin === s.sqftMax ? `${fmtSqft(s.sqftMin)} sq. ft.` : `${fmtSqft(s.sqftMin)}–${fmtSqft(s.sqftMax)} sq. ft.`);
  if (s.priceFrom !== null) parts.push(`from ${fmtPrice(s.priceFrom)}`);
  if (s.plans) parts.push(`${s.plans} floor plan${s.plans === 1 ? "" : "s"}`);
  return parts.join(" · ") || "Predesigned series";
}

const toOption = (s: SeriesInfo): FieldOption => ({
  value: s.value,
  label: s.label,
  image: s.image,
  eyebrow: "Series",
  meta: seriesMeta(s),
});

export const ALL_SERIES_OPTION: FieldOption = { value: "not-sure", label: "Show me all series" };

/* the series step's options for these answers */
export function seriesOptions(a: Answers): FieldOption[] {
  const fit = SERIES.filter((s) => seriesFits(s, a));
  const list = fit.length ? fit : SERIES;
  return [...list.map(toOption), ALL_SERIES_OPTION];
}

/* did the size/budget actually narrow the list? (for the step copy) */
export const seriesNarrowed = (a: Answers) => {
  const n = SERIES.filter((s) => seriesFits(s, a)).length;
  return n > 0 && n < SERIES.length;
};

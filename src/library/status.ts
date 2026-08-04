import drift from "@/design/design-drift.json";
import history from "@/design/library.history.json";
import status from "@/design/library.status.json";
import { SECTIONS, type SectionEntry } from "@/library/registry";

/*
  Joins the registry with the audit results (src/design/library.status
  .json, written by `npm run audit`) — the shape both the grid and
  /library/manifest.json read from.
*/

export interface SectionStatus {
  comps: Record<string, { pixel: number; layout: number }>;
  motion?: { passed: number; total: number; failed: { name: string; error: string }[] };
  tokens: {
    elements: number;
    offToken: number;
    byKind: Record<string, number>;
    examples: { selector: string; kind: string; value: string }[];
  } | null;
}

const sections = (status as { sections: Record<string, SectionStatus> }).sections ?? {};

export const auditedAt = (status as { generatedAt?: string }).generatedAt ?? null;

export const statusFor = (slug: string): SectionStatus | null => sections[slug] ?? null;

/* the worst layout match across a section's breakpoints — one number
   for the card, since a section is only as aligned as its weakest
   breakpoint */
export function worstLayout(slug: string): number | null {
  const s = sections[slug];
  const scores = Object.values(s?.comps ?? {}).map((c) => c.layout);
  return scores.length ? Math.min(...scores) : null;
}

/* the run before the current one — the baseline the deltas read from
   (the newest history entry IS the current status) */
type HistoryRun = {
  generatedAt: string;
  sections: Record<string, { layout: number | null; offToken: number }>;
};
const previousRun: HistoryRun | null =
  (history as HistoryRun[]).length > 1
    ? (history as HistoryRun[])[(history as HistoryRun[]).length - 2]
    : null;

/* layout delta vs the previous audit run; null when there's nothing
   to compare (first run, no comp, or section added since) */
export function layoutDelta(slug: string): number | null {
  const now = worstLayout(slug);
  const prev = previousRun?.sections[slug]?.layout ?? null;
  if (now === null || prev === null) return null;
  return +(now - prev).toFixed(1);
}

export function summarize(entry: SectionEntry) {
  const s = statusFor(entry.slug);
  return {
    slug: entry.slug,
    title: entry.title,
    group: entry.group,
    description: entry.description,
    schemaType: entry.schemaType,
    tall: entry.tall,
    timed: entry.timed,
    breakpoints: Object.keys(entry.comps ?? {}),
    layout: worstLayout(entry.slug),
    delta: layoutDelta(entry.slug),
    offToken: s?.tokens?.offToken ?? 0,
    motion: s?.motion ? { passed: s.motion.passed, total: s.motion.total } : null,
    designDrift: driftScore(entry.slug),
  };
}

export const summaries = () => SECTIONS.map(summarize);

/* design-drift check (scripts/check-design-drift.mjs): the Figma node
   re-rendered and compared against the committed comp — a low score
   means the DESIGN moved since the comp was exported */
type DriftFile = { generatedAt: string | null; sections: Record<string, { score: number | null }> };
export function driftScore(slug: string): number | null {
  return (drift as DriftFile).sections?.[slug]?.score ?? null;
}
export const driftCheckedAt = (drift as DriftFile).generatedAt ?? null;

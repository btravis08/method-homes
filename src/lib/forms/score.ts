import type { Answers, LeadScore, LeadTier } from "./types";

/*
  Lead scoring for the Get Started intake. Pure and client-safe: the
  server stores the result on the submission (score, tier, reasons) so
  the Studio inbox can sort and filter by it, and the thank-you screen
  uses the same function to decide whether to offer a booking slot.

  Points are additive and capped at 100. Every rule names its reason so
  an editor can see WHY a lead is hot without reading the answers. Tune
  the tables, not the callers. Out-of-area leads score 0 by design —
  they are a mailing list, not a pipeline.
*/

export const SERVICE_STATES = new Set([
  "alaska",
  "arizona",
  "british-columbia",
  "california",
  "colorado",
  "idaho",
  "montana",
  "nevada",
  "oregon",
  "utah",
  "washington",
  "wyoming",
]);

export const inServiceArea = (a: Answers) =>
  typeof a.build_state === "string" && SERVICE_STATES.has(a.build_state);

const RES_BUDGET: Record<string, [number, string]> = {
  "200-400k": [10, "Budget $200k–$400k"],
  "400-600k": [20, "Budget $400k–$600k"],
  "600-800k": [30, "Budget $600k–$800k"],
  "800k-1m": [35, "Budget $800k–$1M"],
  "1-2m": [40, "Budget $1M–$2M"],
  "2m-plus": [45, "Budget over $2M"],
};

/* commercial budgets are free text ("$1.25M", "2,000,000", "about 800k") */
export function parseMoney(text: unknown): number | undefined {
  if (typeof text !== "string") return undefined;
  const m = text.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(k|m|mm|million|thousand)?/i);
  if (!m) return undefined;
  let n = Number(m[1]);
  const unit = (m[2] ?? "").toLowerCase();
  if (unit === "k" || unit === "thousand") n *= 1_000;
  if (unit === "m" || unit === "mm" || unit === "million") n *= 1_000_000;
  return Number.isFinite(n) ? n : undefined;
}

const thisYear = () => new Date().getFullYear();

function timelinePoints(value: unknown): [number, string] | undefined {
  if (typeof value !== "string") return undefined;
  if (value === "later") return [5, "Building later"];
  const y = Number(value);
  if (!Number.isFinite(y)) return undefined;
  const delta = y - thisYear();
  if (delta <= 0) return [25, `Building ${y}`];
  if (delta === 1) return [15, `Building ${y}`];
  return [5, `Building ${y}`];
}

export function scoreIntake(a: Answers): LeadScore {
  const reasons: string[] = [];
  let score = 0;
  const add = (pts: number, why: string) => {
    score += pts;
    reasons.push(why);
  };

  if (!inServiceArea(a)) return { score: 0, tier: "cool", reasons: ["Outside the service area"] };
  add(10, "In service area");

  if (a.project_type === "commercial") {
    const n = parseMoney(a.com_budget);
    if (n !== undefined) add(n >= 1_000_000 ? 35 : n >= 250_000 ? 20 : 10, `Budget ${a.com_budget}`);
    if (a.role === "owner" || a.role === "developer") add(10, "Owner or developer");
  } else {
    const b = RES_BUDGET[String(a.res_budget)];
    if (b) add(b[0], b[1]);
    if (a.build_type === "predesigned") add(5, "Predesigned model");
    const picked = Array.isArray(a.series) ? a.series.length : a.series ? 1 : 0;
    if (picked) add(5, picked > 1 ? `${picked} series picked` : "Series picked");
  }

  const t = timelinePoints(a.res_timeline ?? a.com_timeline);
  if (t) add(t[0], t[1]);

  if (a.own_land === "yes") add(15, "Owns land");
  else if (a.land_help === "yes") add(5, "Wants help finding land");

  if (typeof a.phone === "string" && a.phone) add(5, "Phone provided");

  score = Math.min(100, score);
  const tier: LeadTier = score >= 65 ? "hot" : score >= 40 ? "warm" : "cool";
  return { score, tier, reasons };
}

/* who gets offered a call straight from the thank-you screen */
export function qualifiesForBooking(a: Answers): boolean {
  if (!inServiceArea(a)) return false;
  const { tier } = scoreIntake(a);
  if (tier === "cool") return false;
  const t = a.res_timeline ?? a.com_timeline;
  return t !== "later";
}

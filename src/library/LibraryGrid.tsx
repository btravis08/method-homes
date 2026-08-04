"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Thumb } from "@/library/Thumb";

/*
  The grid, with status. Each card carries what the audit found — how
  closely the build matches its comp and how many values match no
  token — so the library reads as triage rather than a catalogue.
*/

export interface GridEntry {
  slug: string;
  title: string;
  group: string;
  description: string;
  schemaType?: string;
  tall?: boolean;
  timed?: boolean;
  breakpoints: string[];
  /* worst layout match across the section's breakpoints */
  layout: number | null;
  /* change vs the previous audit run */
  delta: number | null;
  offToken: number;
  motion: { passed: number; total: number } | null;
  /* Figma node re-render vs committed comp; low = design moved */
  designDrift: number | null;
}

/* Thresholds, calibrated against the cosine edge-map metric on real
   screenshot/comp pairs: a verified-matching section scores ~95, a
   wrong-layout pairing ~22. Bands: ≥85 matching, 50–85 partial
   (usually responsive drift at one breakpoint — the score shown is
   the WORST breakpoint), <50 the composition genuinely doesn't match
   its comp. The flag fires on the bottom band so triage starts with
   certain mismatches; partials still show their number on the card.
   Off-token: a handful is usually one shared utility repeated down a
   list, so only a cluster flags — the exact count always shows. */
const LAYOUT_OK = 50;
const OFF_TOKEN_CLUSTER = 10;

const DESIGN_MOVED = 85;

function needsAttention(e: GridEntry) {
  if (e.offToken >= OFF_TOKEN_CLUSTER) return true;
  if (e.layout !== null && !e.timed && e.layout < LAYOUT_OK) return true;
  if (e.motion && e.motion.passed < e.motion.total) return true;
  if (e.designDrift !== null && e.designDrift < DESIGN_MOVED) return true;
  return false;
}

/* tiny device glyphs for the comp-coverage badge */
function DeviceIcons({ breakpoints }: { breakpoints: string[] }) {
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.2 } as const;
  return (
    <span aria-hidden className="inline-flex items-center gap-1 align-middle">
      {breakpoints.includes("desktop") && (
        <svg width="12" height="12" viewBox="0 0 12 12" {...stroke}>
          <rect x="1" y="2" width="10" height="6.5" rx="0.5" />
          <path d="M4 10.5h4M6 8.5v2" />
        </svg>
      )}
      {breakpoints.includes("tablet") && (
        <svg width="12" height="12" viewBox="0 0 12 12" {...stroke}>
          <rect x="2" y="1.5" width="8" height="9" rx="1" />
          <path d="M5 9.25h2" />
        </svg>
      )}
      {breakpoints.includes("mobile") && (
        <svg width="12" height="12" viewBox="0 0 12 12" {...stroke}>
          <rect x="3.5" y="1.5" width="5" height="9" rx="1" />
          <path d="M5.25 9.25h1.5" />
        </svg>
      )}
    </span>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value === null || Math.abs(value) < 0.5) return null;
  return (
    <span
      title="Change vs the previous audit run"
      className="label font-medium"
    >
      {value > 0 ? `\u2191${value}` : `\u2193${Math.abs(value)}`}
    </span>
  );
}

function Badge({
  children,
  strong,
  title,
}: {
  children: React.ReactNode;
  strong?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`label rounded-xs px-2 py-1 font-medium ${
        strong ? "bg-btn text-btn-fg" : "bg-wash text-ink-3"
      }`}
    >
      {children}
    </span>
  );
}

export function LibraryGrid({
  entries,
  groups,
  generatedAt,
  scheme,
}: {
  entries: GridEntry[];
  groups: string[];
  generatedAt: string | null;
  /* chrome scheme carried through entry links (Studio embed) */
  scheme?: "light" | "dark";
}) {
  const [onlyAttention, setOnlyAttention] = useState(false);

  const flagged = useMemo(() => entries.filter(needsAttention).length, [entries]);
  const shown = onlyAttention ? entries.filter(needsAttention) : entries;

  return (
    <>
      <div className="flex flex-wrap items-center gap-4 border-b border-line px-6 py-4">
        <button
          type="button"
          onClick={() => setOnlyAttention((v) => !v)}
          className={`label rounded-xs px-3 py-2 font-medium transition-colors ${
            onlyAttention ? "bg-btn text-btn-fg" : "bg-wash text-ink-3 hover:text-ink"
          }`}
        >
          NEEDS ATTENTION · {flagged}
        </button>
        <p className="text-body-sm text-ink-2">
          {generatedAt
            ? `Audited ${new Date(generatedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })} — layout match is measured against the Figma comp; off-token counts every value that matches no design token.`
            : "Not audited yet — run npm run audit."}
        </p>
      </div>

      {groups.map((group) => {
        const items = shown.filter((s) => s.group === group);
        if (!items.length) return null;
        return (
          <section key={group} className="px-6 py-10">
            <div className="mb-6 flex items-baseline gap-3">
              <h2 className="label font-medium">{group.toUpperCase()}</h2>
              <span className="text-body-sm text-ink-3">{items.length}</span>
            </div>

            <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((entry) => (
                <li key={entry.slug}>
                  <Link
                    href={`/library/${entry.slug}${scheme === "dark" ? "?scheme=dark" : ""}`}
                    className="group block overflow-hidden rounded-xs border border-line bg-surface transition-colors hover:border-ink"
                  >
                    <Thumb slug={entry.slug} height={entry.tall ? 900 : 620} />
                    <div className="flex flex-col gap-3 border-t border-line p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="mr-1 font-display text-title-sm">{entry.title}</h3>
                        <Badge>{entry.schemaType ? "CMS" : "FIXED"}</Badge>
                        {entry.breakpoints.length > 0 && (
                          <Badge title={`Comps: ${entry.breakpoints.join(", ")}`}>
                            <span className="inline-flex items-center gap-1.5">
                              COMP <DeviceIcons breakpoints={entry.breakpoints} />
                            </span>
                          </Badge>
                        )}
                      </div>

                      {/* the status line */}
                      <div className="flex flex-wrap items-center gap-2">
                        {entry.layout !== null ? (
                          <Badge
                            strong={!entry.timed && entry.layout < LAYOUT_OK}
                            title={
                              entry.timed
                                ? "This section animates — a still frame catches a different moment than the comp, so treat the score as indicative"
                                : "Worst layout match across this section's comps"
                            }
                          >
                            <span className="inline-flex items-center gap-1.5">
                              {entry.layout}% MATCH{entry.timed ? " · TIMED" : ""}
                              <Delta value={entry.delta} />
                            </span>
                          </Badge>
                        ) : (
                          <Badge title="No comp exported, so nothing to diff against">
                            NO COMP
                          </Badge>
                        )}
                        {entry.motion && (
                          <Badge
                            strong={entry.motion.passed < entry.motion.total}
                            title="Choreography assertions replayed in a real browser"
                          >
                            MOTION {entry.motion.passed}/{entry.motion.total}
                          </Badge>
                        )}
                        {entry.designDrift !== null && entry.designDrift < DESIGN_MOVED && (
                          <Badge
                            strong
                            title="The Figma node no longer matches the exported comp — the design changed since this was built"
                          >
                            DESIGN MOVED
                          </Badge>
                        )}
                        <Badge
                          strong={entry.offToken >= OFF_TOKEN_CLUSTER}
                          title="Values matching no design token"
                        >
                          {entry.offToken === 0
                            ? "ON TOKEN"
                            : `${entry.offToken} OFF-TOKEN`}
                        </Badge>
                      </div>

                      <p className="text-body-sm text-ink-2">{entry.description}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

"use client";

import report from "@/design/aeo.status.json";

import designops from "../../../designops.config.json";

/*
  Traffic — the two edge-counted AEO signals (LLM bot insights and
  AI-referred visitors, written by src/proxy.ts → /api/aeo/hit and
  read back nightly by scripts/aeo-audit.mjs), plus where the general
  web analytics live. Same Tailwind-token styling as the AEO view.
*/

type Roll = { name: string; hits: number; pages: { path: string; hits: number }[] };
type Traffic = {
  available: boolean;
  reason?: string;
  days: number;
  since: string;
  botHits: number;
  aiSessions: number;
  bots: Roll[];
  sources: Roll[];
  botDays: { day: string; hits: number }[];
  aiDays: { day: string; hits: number }[];
};

const T = ((report as unknown as { traffic?: Traffic }).traffic ?? {
  available: false,
  reason: "no run yet",
  days: 30,
  since: "",
  botHits: 0,
  aiSessions: 0,
  bots: [],
  sources: [],
  botDays: [],
  aiDays: [],
}) as Traffic;
const GENERATED = (report as unknown as { generatedAt: string }).generatedAt;

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="label text-ink-3">{children}</p>;
}
function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-md border border-line bg-surface-2/40 p-2xl">{children}</section>;
}
function Meter({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-md bg-wash">
      <div className="h-full rounded-md bg-ink" style={{ width: `${Math.max(1, Math.min(100, value))}%` }} />
    </div>
  );
}
function Stat({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="flex flex-col gap-sm rounded-md border border-line bg-surface p-xl">
      <p className="text-body-sm text-ink-3">{label}</p>
      <p className="font-sans text-title-md font-medium text-ink">{value}</p>
      <p className="text-body-sm text-ink-3">{sub}</p>
    </div>
  );
}

/* daily columns: ≤24px thick, 4px rounded tops, surface gap */
function Columns({ rows }: { rows: { day: string; hits: number }[] }) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.hits), 1);
  return (
    <div className="flex h-16 items-end gap-[2px]" aria-hidden="true">
      {rows.map((r) => (
        <div key={r.day} title={`${r.day}: ${r.hits}`} className="max-w-6 flex-1 rounded-t-[4px] bg-ink" style={{ height: `${Math.max(4, (r.hits / max) * 100)}%` }} />
      ))}
    </div>
  );
}

function RollList({ rolls, unit }: { rolls: Roll[]; unit: string }) {
  const max = Math.max(...rolls.map((r) => r.hits), 1);
  return (
    <ul className="flex flex-col divide-y divide-line">
      {rolls.map((r) => (
        <li key={r.name} className="grid gap-md py-lg md:grid-cols-[14rem_1fr]">
          <div className="flex flex-col gap-xs">
            <p className="text-body-md text-ink">{r.name}</p>
            <p className="text-body-sm text-ink-3 tabular-nums">
              {r.hits} {unit}
            </p>
            <Meter value={(r.hits / max) * 100} />
          </div>
          <ul className="flex flex-col gap-xs text-body-sm">
            {r.pages.slice(0, 5).map((pg) => (
              <li key={pg.path} className="flex items-center justify-between gap-md">
                <a href={`${designops.site.baseUrl}${pg.path}`} target="_blank" rel="noreferrer" className="truncate text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                  {pg.path}
                </a>
                <span className="text-ink-3 tabular-nums">{pg.hits}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export default function TrafficPane() {
  return (
    <div data-mode="light" className="h-full min-h-0 overflow-y-auto bg-surface font-sans text-ink">
      <div className="mx-auto flex w-full max-w-[88rem] flex-col gap-4xl px-2xl py-4xl">
        <header className="flex flex-col gap-sm border-b border-line pb-2xl">
          <Eyebrow>Traffic · AI discovery</Eyebrow>
          <h1 className="text-title-md text-ink">Who reads the site, and who arrives from an AI answer</h1>
          <p className="max-w-[44rem] text-body-md text-ink-3">
            Counted at the edge for every page view: visits from the {designops.aeo.bots.length} tracked answer-engine crawlers, and sessions whose first page came from an AI assistant. Last {T.days} days{T.since ? ` since ${T.since}` : ""}, rolled up by the nightly AEO run.
          </p>
        </header>

        {!T.available ? (
          <Panel>
            <div className="flex flex-col gap-md">
              <p className="text-body-md text-ink">No traffic counters yet{T.reason ? ` — ${T.reason}` : ""}.</p>
              <p className="text-body-sm text-ink-3">
                Counting starts once the deploy carries <code className="font-mono">SANITY_API_WRITE_TOKEN</code> and <code className="font-mono">AEO_HIT_KEY</code> (or <code className="font-mono">FORMS_SECRET</code>) in Vercel. The first numbers appear after the next nightly run.
              </p>
            </div>
          </Panel>
        ) : (
          <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="LLM bot visits" value={T.botHits} sub={`${T.bots.length} crawler${T.bots.length === 1 ? "" : "s"} seen`} />
            <Stat label="AI-referred sessions" value={T.aiSessions} sub={`${T.sources.length} source${T.sources.length === 1 ? "" : "s"}`} />
            <Stat label="Most active crawler" value={T.bots[0]?.name ?? "—"} sub={T.bots[0] ? `${T.bots[0].hits} visits` : "none yet"} />
            <Stat label="Top AI source" value={T.sources[0]?.name ?? "—"} sub={T.sources[0] ? `${T.sources[0].hits} sessions` : "none yet"} />
          </div>
        )}

        <Panel>
          <div className="flex flex-col gap-xl">
            <div className="flex flex-wrap items-baseline justify-between gap-lg">
              <div className="flex flex-col gap-xs">
                <Eyebrow>LLM bot insights</Eyebrow>
                <h2 className="text-body-md text-ink">Which crawlers read which pages</h2>
              </div>
              <p className="text-body-sm text-ink-3">GPTBot and OAI-SearchBot feed ChatGPT · ClaudeBot feeds Claude · PerplexityBot feeds Perplexity · Google-Extended feeds Gemini</p>
            </div>
            <Columns rows={T.botDays} />
            {T.bots.length ? <RollList rolls={T.bots} unit="visits" /> : <p className="text-body-sm text-ink-3">No crawler visits recorded in the window.</p>}
          </div>
        </Panel>

        <Panel>
          <div className="flex flex-col gap-xl">
            <div className="flex flex-wrap items-baseline justify-between gap-lg">
              <div className="flex flex-col gap-xs">
                <Eyebrow>AI-referred visitors</Eyebrow>
                <h2 className="text-body-md text-ink">Sessions that started from an AI answer, by source and landing page</h2>
              </div>
              <p className="text-body-sm text-ink-3">a session is counted once, on its first page, and carries an mh_ai cookie so the intake form can attribute the lead</p>
            </div>
            <Columns rows={T.aiDays} />
            {T.sources.length ? <RollList rolls={T.sources} unit="sessions" /> : <p className="text-body-sm text-ink-3">No AI-referred sessions recorded in the window.</p>}
          </div>
        </Panel>

        <aside className="grid gap-xl border-t border-line pt-2xl text-body-sm text-ink-3 md:grid-cols-2">
          <p>
            <span className="text-ink">General web analytics.</span> Page views, referrers, countries and devices for all visitors live in Vercel Web Analytics (the project&apos;s Analytics tab in Vercel — enable it once and the site&apos;s script starts reporting). Real-user Core Web Vitals are in Speed Insights beside it.
          </p>
          <p>
            <span className="text-ink">How counting works.</span> The edge proxy matches each request&apos;s user agent against the tracked crawler list and each first visit&apos;s referrer against the AI sources in designops.config.json → aeo, then increments one counter document per day, crawler or source, and path. Nothing is counted for the Studio, the API, assets or the section library. Rolled up {GENERATED ? `at ${GENERATED.slice(0, 16).replace("T", " ")} UTC` : "nightly"}.
          </p>
        </aside>
      </div>
    </div>
  );
}

"use client";

import history from "@/design/aeo.history.json";
import report from "@/design/aeo.status.json";

import designops from "../../../designops.config.json";

/*
  "AEO" — the AEO maturity dashboard, in Webflow AEO's vocabulary:
  AEO maturity (0–100 score, Level 1–5 on the four-pillar Maturity
  Model — what the site itself does), AEO analytics · Prompt insights
  (visibility score / citation rate — the outcome, which lags), LLM bot
  access, AEO recommendations (prioritized fixes) and the page-level
  audit.

  Built with the site's own Tailwind tokens (surface / ink / wash /
  line, the spacing ladder, the fluid type scale) inside a
  data-mode="light" wrapper, so it reads as a Method surface rather
  than a generic admin table. Charts follow the dataviz rules: one
  hero figure in the UI sans, stat tiles, meters whose track is the
  same ramp (ink on wash), hairline rules, status colors only where a
  color means pass / watch / fail — always paired with a label.

  Data: scripts/aeo-audit.mjs via the nightly aeo workflow →
  src/design/aeo.status.json (+ aeo.history.json).
*/

type Gate = { level: number; check: string; label: string; min: number; actual: number; met: boolean };
type Pillar = { score: number; level: number; levelByScore?: number; gatedTo?: number | null; weight: number; checks: number; passing: number; gates?: Gate[] };
type Rec = { id: string; pillar: string; title: string; fix: string; effort: string; impact: number; priority: number; detail: string; pages: string[]; pagesAffected: number };
type PageRow = { path: string; type: string; score: number; words: number; schema: string[]; fails: string[]; title: string };
type Check = { id: string; pillar: string; title: string; ratio: number; detail: string; scope: string; weight: number };
type PromptResult = { prompt: string; stage?: string; recorded?: boolean; mentioned: boolean; cited: boolean; surfaced: boolean; competitors?: string[]; messages?: string[]; sentiment?: number; accuracy?: number; judgeNote?: string; citedUrls?: string[]; sources?: string[]; excerpt?: string; error?: string; refused?: boolean };
type Prompts = {
  ran: boolean;
  manual?: boolean;
  reason?: string;
  model?: string;
  prompts?: number;
  answered?: number;
  unrecorded?: number;
  mentionRate?: number;
  visibility?: number;
  citationRate?: number;
  surfacedRate?: number;
  shareOfVoice?: number;
  sentiment?: number | null;
  accuracy?: number | null;
  messagePullThrough?: number;
  competitors?: { name: string; count: number; domain?: string }[];
  messages?: { id: string; label: string; count: number; rate: number }[];
  byStage?: { stage: string; prompts: number; mentioned: number; cited: number; mentionRate: number }[];
  results: PromptResult[];
};
type Report = {
  generatedAt: string;
  origin: string;
  score: number;
  level: number;
  levelName: string;
  pillars: Record<string, Pillar>;
  pagesCrawled: number;
  bots: { bot: string; allowed: boolean; explicit: boolean; rule: string }[];
  llms: { ok: boolean; status: number };
  sitemap: { ok: boolean; urls: number; lastmod: boolean };
  links: { checked: number; broken: { path: string; status: number }[] };
  levelByScore?: number;
  gateBlocks?: ({ pillar: string } & Gate)[];
  prompts: Prompts;
  checks: Check[];
  recommendations: Rec[];
  pages: PageRow[];
};
type Run = { t: string; score: number; level: number; pillars: Record<string, number>; visibility: number | null; citationRate: number | null };

const DATA = report as unknown as Report;
const RUNS = (history as { runs: Run[] }).runs;

const PILLAR_BLURB: Record<string, string> = {
  technical: "Can an answer engine reach, parse and trust the page?",
  content: "Is there a direct, liftable answer with depth and freshness?",
  authority: "Can a model tell who is speaking, and verify it?",
  measurement: "Do we know how AI answers describe and cite us?",
};
const LEVELS = ["", "Invisible", "Emerging", "Developing", "Established", "Leading"];
const LEVEL_FLOOR = [0, 0, 20, 40, 60, 80];

/* status palette (fixed, never themed): a color only ever means pass /
   watch / fail and always travels with a label or glyph */
const STATUS = {
  good: "#0ca30c",
  warning: "#c98500",
  critical: "#d03b3b",
} as const;
const statusOf = (score: number) => (score >= 80 ? "good" : score >= 50 ? "warning" : "critical");
const STATUS_LABEL = { good: "on track", warning: "watch", critical: "needs work" } as const;

function ago(iso: string) {
  const hours = (Date.now() - new Date(iso).getTime()) / 36e5;
  if (hours < 1.5) return "just now";
  if (hours < 36) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/* ── primitives ──────────────────────────────────────────────────── */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="label text-ink-3">{children}</p>;
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-md border border-line bg-surface-2/40 p-2xl ${className}`}>{children}</section>;
}

function Dot({ tone }: { tone: keyof typeof STATUS }) {
  return <span aria-hidden="true" className="inline-block size-2 shrink-0 rounded-full" style={{ background: STATUS[tone] }} />;
}

function StatusPill({ tone, children }: { tone: keyof typeof STATUS; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-sm rounded-md border border-line bg-surface px-md py-xs text-body-sm text-ink">
      <Dot tone={tone} />
      {children}
    </span>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="label inline-flex items-center rounded-md bg-wash px-md py-xs text-ink-2">{children}</span>;
}

/* meter: fill = ink, track = the same ramp lighter (wash) */
function Meter({ value, height = "h-1.5" }: { value: number; height?: string }) {
  return (
    <div className={`${height} w-full overflow-hidden rounded-md bg-wash`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
      <div className="h-full rounded-md bg-ink transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ width: `${Math.max(1, Math.min(100, value))}%` }} />
    </div>
  );
}

/* the 1–5 level stepper: filled steps reached, the rest on the track */
function LevelSteps({ level }: { level: number }) {
  return (
    <ol className="flex items-center gap-xs" aria-label={`Level ${level} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <li key={n} className={`h-1.5 w-8 rounded-md ${n <= level ? "bg-ink" : "bg-wash"}`} title={`Level ${n} · ${LEVELS[n]} (${LEVEL_FLOOR[n]}+)`} />
      ))}
    </ol>
  );
}

/* 2px line, ≥8px end marker with a surface ring, hairline baseline */
function Sparkline({ values, width = 240, height = 56 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) {
    return <div className="flex h-14 items-center text-body-sm text-ink-3">one assessment so far — the trend draws after tomorrow&apos;s run</div>;
  }
  const min = Math.max(0, Math.min(...values) - 10);
  const max = Math.min(100, Math.max(...values) + 10);
  const x = (i: number) => (i / (values.length - 1)) * (width - 8) + 4;
  const y = (v: number) => height - 6 - ((v - min) / (max - min || 1)) * (height - 12);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block max-w-full" aria-hidden="true">
      <line x1={4} x2={width - 4} y1={height - 6} y2={height - 6} className="stroke-line" strokeWidth={1} />
      <polyline points={pts} fill="none" className="stroke-ink" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(last)} r={6} className="fill-surface" />
      <circle cx={x(values.length - 1)} cy={y(last)} r={4} className="fill-ink" />
    </svg>
  );
}

function Stat({ label, value, unit, sub, tone }: { label: string; value: string | number; unit?: string; sub?: string; tone?: keyof typeof STATUS }) {
  return (
    <div className="flex flex-col gap-sm rounded-md border border-line bg-surface p-xl">
      <p className="text-body-sm text-ink-3">{label}</p>
      <p className="flex items-baseline gap-xs font-sans text-title-md font-medium text-ink">
        {value}
        {unit ? <span className="text-body-md text-ink-3">{unit}</span> : null}
      </p>
      {sub ? (
        <p className="flex items-center gap-sm text-body-sm text-ink-3">
          {tone ? <Dot tone={tone} /> : null}
          {sub}
        </p>
      ) : null}
    </div>
  );
}

function Glyph({ ok }: { ok: boolean }) {
  return ok ? (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
      <path d="M3 7.5l2.5 2.5L11 4" fill="none" stroke={STATUS.good} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0 text-ink-3">
      <path d="M3.5 7h7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/* ── sections ────────────────────────────────────────────────────── */

function Hero() {
  const runs = RUNS.map((r) => r.score);
  const prev = runs.length > 1 ? runs[runs.length - 2] : null;
  const delta = prev == null ? null : DATA.score - prev;
  const nextFloor = DATA.level < 5 ? LEVEL_FLOOR[DATA.level + 1] : null;
  const tone = statusOf(DATA.score);
  return (
    <header className="grid gap-2xl border-b border-line pb-2xl lg:grid-cols-[1fr_auto] lg:items-end">
      <div className="flex flex-col gap-xl">
        <div className="flex flex-col gap-sm">
          <Eyebrow>AEO maturity</Eyebrow>
          <h1 className="text-title-md text-ink">Answer engine optimization</h1>
          <p className="max-w-[44rem] text-body-md text-ink-3">
            How ready {designops.aeo.brand}&apos;s site is to be read, understood and cited by ChatGPT, Claude, Perplexity and Gemini — scored on the four-pillar AEO Maturity Model. {DATA.origin.replace(/^https?:\/\//, "")} · {DATA.pagesCrawled} pages · assessed {ago(DATA.generatedAt)}.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2xl">
          <div className="flex items-baseline gap-md">
            {/* the one hero figure on the view: UI sans, proportional figures */}
            <span className="font-sans text-[4rem] font-medium leading-none tracking-[-0.02em] text-ink">{DATA.score}</span>
            <span className="text-body-md text-ink-3">/ 100</span>
          </div>
          <div className="flex flex-col gap-md pb-xs">
            <div className="flex items-center gap-lg">
              <LevelSteps level={DATA.level} />
              <span className="text-body-md text-ink">
                Level {DATA.level} of 5 · {LEVELS[DATA.level]}
              </span>
            </div>
            <p className="flex flex-wrap items-center gap-lg text-body-sm text-ink-3">
              <StatusPill tone={tone}>{STATUS_LABEL[tone]}</StatusPill>
              {delta != null ? (
                <span>
                  {delta >= 0 ? "+" : ""}
                  {delta} since the last assessment
                </span>
              ) : null}
              {DATA.levelByScore && DATA.levelByScore > DATA.level ? (
                <span>score would be Level {DATA.levelByScore} — held at {DATA.level} by {DATA.gateBlocks?.length ?? 0} unmet gate{(DATA.gateBlocks?.length ?? 0) === 1 ? "" : "s"}</span>
              ) : nextFloor != null ? (
                <span>{nextFloor - DATA.score} points to Level {DATA.level + 1}</span>
              ) : (
                <span>top level reached</span>
              )}
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-sm">
        <Eyebrow>Trend · {runs.length} run{runs.length === 1 ? "" : "s"}</Eyebrow>
        <Sparkline values={runs} />
        <p className="text-body-sm text-ink-3">
          first {runs[0]} → now {DATA.score}
        </p>
      </div>
    </header>
  );
}

function Pillars() {
  return (
    <section className="flex flex-col gap-xl">
      <div className="flex items-baseline justify-between gap-lg">
        <Eyebrow>Maturity by pillar</Eyebrow>
        <p className="text-body-sm text-ink-3">each pillar is the weighted pass ratio of its checks · weights sum to 100</p>
      </div>
      <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-4">
        {Object.entries(DATA.pillars).map(([name, p]) => {
          const tone = statusOf(p.score);
          return (
            <article key={name} className="flex flex-col gap-lg rounded-md border border-line bg-surface p-xl">
              <div className="flex items-start justify-between gap-md">
                <div className="flex flex-col gap-xs">
                  <h2 className="text-body-md font-medium capitalize text-ink">{name}</h2>
                  <p className="text-body-sm text-ink-3">{PILLAR_BLURB[name]}</p>
                </div>
                <Tag>{p.weight}%</Tag>
              </div>
              <div className="flex items-baseline gap-md">
                <span className="font-sans text-title-md font-medium leading-none text-ink">{p.score}</span>
                <span className="text-body-sm text-ink-3">Level {p.level} · {LEVELS[p.level]}</span>
              </div>
              <Meter value={p.score} />
              <p className="flex items-center gap-sm text-body-sm text-ink-3">
                <Dot tone={tone} />
                {p.passing} of {p.checks} checks pass
              </p>
              {(p.gates ?? []).filter((g) => g.level === p.level + 1).length ? (
                <ul className="flex flex-col gap-xs border-t border-line pt-md">
                  {(p.gates ?? [])
                    .filter((g) => g.level === p.level + 1)
                    .map((g) => (
                      <li key={g.check} className="flex items-start gap-sm text-body-sm text-ink-3">
                        <Glyph ok={g.met} />
                        <span>
                          <span className="text-ink">Gate to Level {g.level}:</span> {g.label} · {Math.round(g.actual * 100)}% of {Math.round(g.min * 100)}%
                        </span>
                      </li>
                    ))}
                </ul>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Analytics() {
  const p = DATA.prompts;
  const rows: PromptResult[] = p.ran
    ? p.results
    : (designops.aeo.prompts as { text: string; stage: string }[]).map((x) => ({ prompt: x.text, stage: x.stage, mentioned: false, cited: false, surfaced: false }));
  return (
    <Panel>
      <div className="flex flex-col gap-xl">
        <div className="flex flex-wrap items-baseline justify-between gap-lg">
          <div className="flex flex-col gap-xs">
            <Eyebrow>AEO analytics · Prompt insights</Eyebrow>
            <h2 className="text-body-md text-ink">What AI answers say when buyers ask</h2>
          </div>
          <p className="text-body-sm text-ink-3">
            {p.ran ? `${p.answered} of ${p.prompts ?? p.answered} prompts ${p.manual ? "recorded by hand" : "answered with live web search"} · ${p.model}` : `not recorded — ${p.reason}`}
          </p>
        </div>

        {p.ran ? (
          <>
            <div className="grid gap-md sm:grid-cols-3 xl:grid-cols-6">
              <Stat label="Mention rate" value={p.mentionRate ?? 0} unit="%" sub="answers naming the brand" tone={statusOf(p.mentionRate ?? 0)} />
              <Stat label="Citation rate" value={p.citationRate ?? 0} unit="%" sub="answers citing our domain" tone={statusOf(p.citationRate ?? 0)} />
              <Stat label="Share of voice" value={p.shareOfVoice ?? 0} unit="%" sub="of tracked-brand mentions" tone={statusOf(p.shareOfVoice ?? 0)} />
              <Stat label="Sentiment" value={p.sentiment ?? "—"} unit={p.sentiment != null ? "%" : undefined} sub="how favourably we are portrayed" tone={p.sentiment != null ? statusOf(p.sentiment) : undefined} />
              <Stat label="Accuracy" value={p.accuracy ?? "—"} unit={p.accuracy != null ? "%" : undefined} sub="facts about us stated correctly" tone={p.accuracy != null ? statusOf(p.accuracy) : undefined} />
              <Stat label="Message pull-through" value={p.messagePullThrough ?? 0} unit="%" sub="key messages that come through" tone={statusOf(p.messagePullThrough ?? 0)} />
            </div>
            <div className="grid gap-md lg:grid-cols-3">
              <div className="flex flex-col gap-md rounded-md border border-line bg-surface p-xl">
                <p className="text-body-sm text-ink-3">By funnel stage</p>
                <ul className="flex flex-col gap-sm">
                  {["awareness", "consideration", "decision", "retention"].map((stage) => {
                    const row = (p.byStage ?? []).find((x) => x.stage === stage);
                    return (
                      <li key={stage} className="flex items-center justify-between gap-md text-body-sm">
                        <span className="capitalize text-ink">{stage}</span>
                        <span className="text-ink-3 tabular-nums">{row ? `${row.mentioned}/${row.prompts} mentioned · ${row.cited} cited` : "not recorded"}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="flex flex-col gap-md rounded-md border border-line bg-surface p-xl">
                <p className="text-body-sm text-ink-3">Competitors mentioned alongside us</p>
                <ul className="flex flex-col gap-sm">
                  {(p.competitors ?? []).slice(0, 6).map((c) => (
                    <li key={c.name} className="flex items-center justify-between gap-md text-body-sm">
                      <span className="text-ink">
                        {c.name} {c.domain ? <span className="text-ink-3">({c.domain})</span> : null}
                      </span>
                      <span className="text-ink-3 tabular-nums">{c.count}×</span>
                    </li>
                  ))}
                  {!(p.competitors ?? []).length && <li className="text-body-sm text-ink-3">none of the tracked competitors appeared</li>}
                </ul>
              </div>
              <div className="flex flex-col gap-md rounded-md border border-line bg-surface p-xl">
                <p className="text-body-sm text-ink-3">Key messages that come through</p>
                <ul className="flex flex-col gap-sm">
                  {(p.messages ?? []).map((m) => (
                    <li key={m.id} className="flex flex-col gap-xs text-body-sm">
                      <span className="flex items-center justify-between gap-md">
                        <span className="text-ink">{m.label}</span>
                        <span className="text-ink-3 tabular-nums">{m.rate}%</span>
                      </span>
                      <Meter value={m.rate} height="h-1" />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        ) : (
          <p className="rounded-md border border-line bg-surface p-xl text-body-sm text-ink-2">
            Add an <code className="font-mono">ANTHROPIC_API_KEY</code> secret to the repository&apos;s Actions for a nightly probe, or ask an answer engine the tracked prompts and record the answers in <code className="font-mono">src/design/aeo.prompts.manual.json</code>.
          </p>
        )}

        <ul className="flex flex-col divide-y divide-line">
          {rows.map((r) => (
            <li key={r.prompt} className="grid gap-md py-lg md:grid-cols-[1fr_auto] md:items-start">
              <div className="flex flex-col gap-xs">
                <p className="flex flex-wrap items-center gap-md text-body-md text-ink">
                  {r.prompt}
                  {r.stage ? <Tag>{r.stage}</Tag> : null}
                </p>
                {r.excerpt ? <p className="text-body-sm text-ink-3">{r.excerpt}</p> : null}
                {p.ran && r.recorded !== false && (r.competitors?.length || r.messages?.length || r.sentiment != null) ? (
                  <p className="text-body-sm text-ink-3">
                    {r.competitors?.length ? `with ${r.competitors.join(", ")}` : "no tracked competitors named"}
                    {r.messages?.length ? ` · conveys ${r.messages.length} key message${r.messages.length === 1 ? "" : "s"}` : ""}
                    {r.sentiment != null ? ` · sentiment ${r.sentiment}` : ""}
                    {r.accuracy != null ? ` · accuracy ${r.accuracy}` : ""}
                  </p>
                ) : null}
              </div>
              {p.ran && r.recorded === false ? (
                <Tag>not yet recorded</Tag>
              ) : p.ran ? (
                <div className="flex flex-wrap items-center gap-md md:justify-end">
                  <span className="inline-flex items-center gap-sm text-body-sm text-ink">
                    <Glyph ok={r.mentioned} /> {r.mentioned ? "mentioned" : "not mentioned"}
                  </span>
                  <span className="inline-flex items-center gap-sm text-body-sm text-ink">
                    <Glyph ok={r.cited} /> {r.cited ? "cited" : r.surfaced ? "found, not cited" : "not cited"}
                  </span>
                </div>
              ) : (
                <Tag>tracked</Tag>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

function Bots() {
  const allowed = DATA.bots.filter((b) => b.allowed).length;
  return (
    <Panel>
      <div className="flex flex-col gap-xl">
        <div className="flex items-baseline justify-between gap-lg">
          <div className="flex flex-col gap-xs">
            <Eyebrow>LLM bot access</Eyebrow>
            <h2 className="text-body-md text-ink">Which answer-engine crawlers may read the site</h2>
          </div>
          <StatusPill tone={allowed === DATA.bots.length ? "good" : "warning"}>
            {allowed}/{DATA.bots.length} allowed
          </StatusPill>
        </div>
        <ul className="flex flex-wrap gap-sm">
          {DATA.bots.map((b) => (
            <li key={b.bot} className="inline-flex items-center gap-sm rounded-md border border-line bg-surface px-md py-sm text-body-sm text-ink" title={b.rule}>
              <Dot tone={b.allowed ? (b.explicit ? "good" : "warning") : "critical"} />
              {b.bot}
            </li>
          ))}
        </ul>
        <dl className="grid gap-md text-body-sm sm:grid-cols-3">
          <div className="flex flex-col gap-xs rounded-md bg-surface p-lg">
            <dt className="text-ink-3">llms.txt</dt>
            <dd className="flex items-center gap-sm text-ink">
              <Dot tone={DATA.llms.ok ? "good" : "critical"} />
              {DATA.llms.ok ? "published" : `missing (${DATA.llms.status})`}
            </dd>
          </div>
          <div className="flex flex-col gap-xs rounded-md bg-surface p-lg">
            <dt className="text-ink-3">Sitemap</dt>
            <dd className="flex items-center gap-sm text-ink">
              <Dot tone={DATA.sitemap.ok ? (DATA.sitemap.lastmod ? "good" : "warning") : "critical"} />
              {DATA.sitemap.urls} URLs{DATA.sitemap.lastmod ? ", with lastmod" : ", no lastmod"}
            </dd>
          </div>
          <div className="flex flex-col gap-xs rounded-md bg-surface p-lg">
            <dt className="text-ink-3">Internal links</dt>
            <dd className="flex items-center gap-sm text-ink">
              <Dot tone={DATA.links.broken.length ? "critical" : "good"} />
              {DATA.links.broken.length} broken of {DATA.links.checked}
            </dd>
          </div>
        </dl>
        <p className="text-body-sm text-ink-3">green = named and allowed · amber = allowed only by the wildcard rule · red = blocked</p>
      </div>
    </Panel>
  );
}

function Recommendations() {
  const max = Math.max(...DATA.recommendations.map((r) => r.impact), 1);
  return (
    <Panel>
      <div className="flex flex-col gap-xl">
        <div className="flex flex-wrap items-baseline justify-between gap-lg">
          <div className="flex flex-col gap-xs">
            <Eyebrow>AEO recommendations</Eyebrow>
            <h2 className="text-body-md text-ink">What to fix next, in order</h2>
          </div>
          <p className="text-body-sm text-ink-3">prioritized by maturity points recovered ÷ effort</p>
        </div>
        <ol className="flex flex-col divide-y divide-line">
          {DATA.recommendations.slice(0, 14).map((r, i) => (
            <li key={r.id} className="grid gap-lg py-xl md:grid-cols-[2.5rem_1fr_14rem] md:items-start">
              <span className="font-sans text-title-sm leading-none text-ink-3 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <div className="flex flex-col gap-sm">
                <p className="text-body-md font-medium text-ink">{r.title}</p>
                <p className="max-w-[60rem] text-body-md text-ink-2">{r.fix}</p>
                <p className="text-body-sm text-ink-3">
                  {r.detail}
                  {r.pagesAffected ? ` · ${r.pagesAffected} page${r.pagesAffected === 1 ? "" : "s"}: ${r.pages.slice(0, 3).map((x) => x.split(" — ")[0]).join(", ")}${r.pagesAffected > 3 ? "…" : ""}` : ""}
                </p>
                <div className="flex flex-wrap gap-sm">
                  <Tag>{r.pillar}</Tag>
                  <Tag>{r.effort} effort</Tag>
                </div>
              </div>
              <div className="flex flex-col gap-sm">
                <p className="flex items-baseline justify-between text-body-sm text-ink-3">
                  <span>recovers</span>
                  <span className="font-medium text-ink tabular-nums">+{r.impact.toFixed(1)} pts</span>
                </p>
                <Meter value={(r.impact / max) * 100} height="h-1" />
              </div>
            </li>
          ))}
          {!DATA.recommendations.length && <li className="py-xl text-body-md text-ink">Every check passes.</li>}
        </ol>
      </div>
    </Panel>
  );
}

function Pages() {
  return (
    <Panel>
      <div className="flex flex-col gap-xl">
        <div className="flex flex-wrap items-baseline justify-between gap-lg">
          <div className="flex flex-col gap-xs">
            <Eyebrow>Page-level audit</Eyebrow>
            <h2 className="text-body-md text-ink">Every crawled page, weakest first</h2>
          </div>
          <p className="text-body-sm text-ink-3">{DATA.pagesCrawled} pages from the sitemap</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-body-sm">
            <thead>
              <tr className="border-b border-line text-left text-ink-3">
                <th className="py-md pr-lg font-normal">Score</th>
                <th className="py-md pr-lg font-normal">Page</th>
                <th className="py-md pr-lg font-normal">Type</th>
                <th className="py-md pr-lg text-right font-normal">Words</th>
                <th className="py-md pr-lg font-normal">Schema</th>
                <th className="py-md font-normal">Failing checks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {DATA.pages.map((pg) => (
                <tr key={pg.path} className="align-top">
                  <td className="py-md pr-lg">
                    <span className="inline-flex items-center gap-sm text-ink tabular-nums">
                      <Dot tone={statusOf(pg.score)} />
                      {pg.score}
                    </span>
                  </td>
                  <td className="max-w-[22rem] py-md pr-lg">
                    <a href={`${designops.site.baseUrl}${pg.path}`} target="_blank" rel="noreferrer" className="block truncate text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                      {pg.path}
                    </a>
                  </td>
                  <td className="py-md pr-lg text-ink-3">{pg.type}</td>
                  <td className="py-md pr-lg text-right text-ink-3 tabular-nums">{pg.words}</td>
                  <td className="max-w-[14rem] truncate py-md pr-lg text-ink-3">{pg.schema.length ? pg.schema.join(", ") : "none"}</td>
                  <td className="max-w-[24rem] py-md text-ink-3">{pg.fails.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}

function Method() {
  return (
    <aside className="grid gap-xl border-t border-line pt-2xl text-body-sm text-ink-3 md:grid-cols-2">
      <p>
        <span className="text-ink">Readiness vs visibility.</span> The maturity score is what the site itself does and changes the moment a fix ships. Prompt insights are the outcome it drives — whether AI answers mention and cite {designops.aeo.brand} — and they lag until the engines re-read the site.
      </p>
      <p>
        <span className="text-ink">How it is scored.</span> {DATA.checks.length} checks, each with a pillar, a weight and an effort. Page checks run on every crawled page they apply to and contribute their average pass ratio; site checks run once. A pillar is the weighted pass ratio of its checks; the score weights the pillars{" "}
        {Object.entries(DATA.pillars)
          .map(([k, v]) => `${k} ${v.weight}`)
          .join(" · ")}
        . Levels: &lt;20 Invisible · &lt;40 Emerging · &lt;60 Developing · &lt;80 Established · 80+ Leading. Weights, bots, prompts and the brand live in designops.config.json → aeo.
      </p>
    </aside>
  );
}

export default function AeoPane() {
  return (
    <div data-mode="light" className="h-full min-h-0 overflow-y-auto bg-surface font-sans text-ink">
      <div className="mx-auto flex w-full max-w-[88rem] flex-col gap-4xl px-2xl py-4xl">
        <Hero />
        <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Pages assessed" value={DATA.pagesCrawled} sub="crawled from the sitemap" />
          <Stat label="LLM bots allowed" value={`${DATA.bots.filter((b) => b.allowed).length}/${DATA.bots.length}`} sub="named in robots.txt" tone={DATA.bots.every((b) => b.allowed) ? "good" : "warning"} />
          <Stat label="Checks passing" value={`${DATA.checks.filter((c) => c.ratio >= 0.999).length}/${DATA.checks.length}`} sub="site-wide and page-level" />
          <Stat label="Top fix recovers" value={DATA.recommendations[0] ? `+${DATA.recommendations[0].impact.toFixed(1)}` : "—"} unit={DATA.recommendations[0] ? "pts" : undefined} sub={DATA.recommendations[0]?.title ?? "every check passes"} />
        </div>
        <Pillars />
        <Analytics />
        <Bots />
        <Recommendations />
        <Pages />
        <Method />
      </div>
    </div>
  );
}

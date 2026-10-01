"use client";

import { Badge, Box, Card, Code, Container, Flex, Grid, Heading, Stack, Text } from "@sanity/ui";

import history from "@/design/aeo.history.json";
import report from "@/design/aeo.status.json";

import designops from "../../../designops.config.json";

/*
  "AEO" — answer-engine readiness, graded the way Webflow AEO grades a
  site: four pillars (Content · Technical · Authority · Measurement),
  a 0–100 score with a 1–5 maturity level, prompt insights (how often
  AI answers mention and cite us), the AI-crawler access matrix, a
  ranked list of recommendations (impact in score points, discounted
  by effort) and the per-page table behind them.

  Data: scripts/aeo-audit.mjs via the nightly aeo workflow →
  src/design/aeo.status.json (+ aeo.history.json). Plain @sanity/ui,
  themed by the Studio.
*/

type Pillar = { score: number; level: number; weight: number; checks: number; passing: number };
type Rec = { id: string; pillar: string; title: string; fix: string; effort: string; impact: number; priority: number; detail: string; pages: string[]; pagesAffected: number };
type PageRow = { path: string; type: string; score: number; words: number; schema: string[]; fails: string[]; title: string };
type Check = { id: string; pillar: string; title: string; ratio: number; detail: string; scope: string; weight: number };
type PromptResult = { prompt: string; mentioned: boolean; cited: boolean; surfaced: boolean; citedUrls?: string[]; sources?: string[]; excerpt?: string; error?: string; refused?: boolean };
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
  prompts: { ran: boolean; manual?: boolean; reason?: string; model?: string; answered?: number; visibility?: number; citationRate?: number; surfacedRate?: number; results: PromptResult[] };
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

const tone = (score: number) => (score >= 80 ? "positive" : score >= 50 ? "caution" : "critical");

function ago(iso: string) {
  const hours = (Date.now() - new Date(iso).getTime()) / 36e5;
  if (hours < 1.5) return "just now";
  if (hours < 36) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/* 0–100 bar in the Studio's own colors */
function Bar({ value }: { value: number }) {
  return (
    <Card tone="transparent" border radius={2} style={{ height: 8, overflow: "hidden" }}>
      <Card tone={tone(value)} style={{ height: "100%", width: `${Math.max(2, Math.min(100, value))}%`, transition: "width .3s" }} />
    </Card>
  );
}

function Trend() {
  const scores = RUNS.map((r) => r.score);
  if (scores.length < 2)
    return (
      <Text size={1} muted>
        one run — the trend appears after tomorrow&apos;s grade
      </Text>
    );
  const W = 220;
  const H = 44;
  const min = Math.min(...scores, 0);
  const max = 100;
  const pts = scores.map((s, i) => `${((i / (scores.length - 1)) * (W - 4) + 2).toFixed(1)},${(H - 4 - ((s - min) / (max - min)) * (H - 8)).toFixed(1)}`).join(" ");
  const latest = scores[scores.length - 1];
  const prev = scores[scores.length - 2];
  return (
    <Flex align="center" gap={3}>
      <Text muted={latest === prev} accent={latest < prev}>
        <svg width={W} height={H} aria-hidden style={{ display: "block" }}>
          <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </Text>
      <Text size={1} muted>
        {latest - prev >= 0 ? "+" : ""}
        {latest - prev} since last run · {scores.length} runs
      </Text>
    </Flex>
  );
}

function Pillars() {
  return (
    <Grid columns={[1, 2, 4]} gap={3}>
      {Object.entries(DATA.pillars).map(([name, p]) => (
        <Card key={name} padding={4} radius={3} border>
          <Stack space={3}>
            <Flex justify="space-between" align="baseline">
              <Text size={1} weight="medium" style={{ textTransform: "capitalize" }}>
                {name}
              </Text>
              <Text size={1} muted>
                weight {p.weight}
              </Text>
            </Flex>
            <Flex align="baseline" gap={2}>
              <Heading size={4}>{p.score}</Heading>
              <Badge tone={tone(p.score)}>level {p.level}</Badge>
            </Flex>
            <Bar value={p.score} />
            <Text size={1} muted>
              {p.passing}/{p.checks} checks pass · {PILLAR_BLURB[name]}
            </Text>
          </Stack>
        </Card>
      ))}
    </Grid>
  );
}

function PromptInsights() {
  const p = DATA.prompts;
  const rows: PromptResult[] = p.ran
    ? p.results
    : (designops.aeo.prompts as string[]).map((prompt) => ({ prompt, mentioned: false, cited: false, surfaced: false }));
  return (
    <Card padding={4} radius={3} border>
      <Stack space={4}>
        <Flex justify="space-between" align="baseline" gap={3} wrap="wrap">
          <Heading size={1}>Prompt insights</Heading>
          <Text size={1} muted>
            {p.ran ? (p.manual ? `${p.answered} prompts, recorded by hand — ${p.model}` : `${p.answered} prompts answered with live web search (${p.model})`) : `not run — ${p.reason}`}
          </Text>
        </Flex>
        {p.ran ? (
          <Grid columns={[1, 3]} gap={3}>
            {[
              ["Visibility", p.visibility, "answers that mention the brand"],
              ["Citation rate", p.citationRate, "answers that cite one of our domains"],
              ["Surfaced", p.surfacedRate, "searches that found us, cited or not"],
            ].map(([label, value, blurb]) => (
              <Card key={String(label)} padding={3} radius={2} tone="transparent" border>
                <Stack space={2}>
                  <Text size={1} muted>
                    {label}
                  </Text>
                  <Heading size={3}>{value}%</Heading>
                  <Text size={0} muted>
                    {blurb}
                  </Text>
                </Stack>
              </Card>
            ))}
          </Grid>
        ) : (
          <Text size={1}>
            Add <Code size={1}>ANTHROPIC_API_KEY</Code> to the repository&apos;s Actions secrets for a nightly probe, or ask an answer engine the tracked prompts yourself and record the answers in{" "}
            <Code size={1}>src/design/aeo.prompts.manual.json</Code>. The prompts live in <Code size={1}>designops.config.json → aeo.prompts</Code>.
          </Text>
        )}
        <Stack space={2}>
          {rows.map((r) => (
            <Flex key={r.prompt} gap={3} align="flex-start">
              <Box flex={1}>
                <Text size={1}>{r.prompt}</Text>
                {r.excerpt ? (
                  <Text size={0} muted style={{ marginTop: 4 }}>
                    {r.excerpt.slice(0, 180)}…
                  </Text>
                ) : null}
              </Box>
              {p.ran ? (
                <Flex gap={1}>
                  <Badge tone={r.mentioned ? "positive" : "default"}>{r.mentioned ? "mentioned" : "no mention"}</Badge>
                  <Badge tone={r.cited ? "positive" : r.surfaced ? "caution" : "default"}>{r.cited ? "cited" : r.surfaced ? "found" : "not cited"}</Badge>
                </Flex>
              ) : (
                <Badge>tracked</Badge>
              )}
            </Flex>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

function Bots() {
  const allowed = DATA.bots.filter((b) => b.allowed).length;
  return (
    <Card padding={4} radius={3} border>
      <Stack space={3}>
        <Flex justify="space-between" align="baseline">
          <Heading size={1}>AI crawler access</Heading>
          <Badge tone={allowed === DATA.bots.length ? "positive" : "caution"}>
            {allowed}/{DATA.bots.length} allowed
          </Badge>
        </Flex>
        <Flex gap={2} wrap="wrap">
          {DATA.bots.map((b) => (
            <Badge key={b.bot} tone={b.allowed ? (b.explicit ? "positive" : "primary") : "critical"} title={b.rule}>
              {b.bot}
            </Badge>
          ))}
        </Flex>
        <Text size={0} muted>
          green = named and allowed · blue = allowed by the * rule · red = blocked. Also: llms.txt {DATA.llms.ok ? "present" : `missing (${DATA.llms.status})`} · sitemap {DATA.sitemap.urls} URLs{DATA.sitemap.lastmod ? " with lastmod" : ", no lastmod"} · {DATA.links.broken.length} broken of {DATA.links.checked} internal links
        </Text>
      </Stack>
    </Card>
  );
}

function Recommendations() {
  return (
    <Card padding={4} radius={3} border>
      <Stack space={4}>
        <Flex justify="space-between" align="baseline">
          <Heading size={1}>Recommendations</Heading>
          <Text size={1} muted>
            ranked by score points recovered ÷ effort
          </Text>
        </Flex>
        <Stack space={3}>
          {DATA.recommendations.slice(0, 14).map((r, i) => (
            <Card key={r.id} padding={3} radius={2} tone="transparent" border>
              <Stack space={2}>
                <Flex gap={3} align="baseline" wrap="wrap">
                  <Text size={1} muted>
                    {i + 1}
                  </Text>
                  <Box flex={1}>
                    <Text size={1} weight="medium">
                      {r.title}
                    </Text>
                  </Box>
                  <Badge tone="primary">+{r.impact} pts</Badge>
                  <Badge>{r.effort} effort</Badge>
                  <Badge style={{ textTransform: "capitalize" }}>{r.pillar}</Badge>
                </Flex>
                <Text size={1}>{r.fix}</Text>
                <Text size={0} muted>
                  {r.detail}
                  {r.pagesAffected ? ` · ${r.pagesAffected} page(s): ${r.pages.slice(0, 3).join(" · ")}${r.pagesAffected > 3 ? " …" : ""}` : ""}
                </Text>
              </Stack>
            </Card>
          ))}
          {!DATA.recommendations.length && <Text size={1}>Every check passes.</Text>}
        </Stack>
      </Stack>
    </Card>
  );
}

function Pages() {
  return (
    <Card padding={4} radius={3} border>
      <Stack space={3}>
        <Flex justify="space-between" align="baseline">
          <Heading size={1}>Pages</Heading>
          <Text size={1} muted>
            {DATA.pagesCrawled} crawled from the sitemap · weakest first
          </Text>
        </Flex>
        <Stack space={2}>
          {DATA.pages.map((pg) => (
            <Flex key={pg.path} gap={3} align="center">
              <Box style={{ width: 40 }}>
                <Badge tone={tone(pg.score)}>{pg.score}</Badge>
              </Box>
              <Box flex={1} style={{ minWidth: 0 }}>
                <Text size={1} textOverflow="ellipsis">
                  <a href={`${designops.site.baseUrl}${pg.path}`} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
                    {pg.path}
                  </a>{" "}
                  <Text as="span" size={0} muted>
                    {pg.type} · {pg.words} words · {pg.schema.length ? pg.schema.join(", ") : "no schema"}
                  </Text>
                </Text>
              </Box>
              <Text size={0} muted style={{ maxWidth: 320 }} textOverflow="ellipsis">
                {pg.fails.join(", ")}
              </Text>
            </Flex>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

export default function AeoPane() {
  return (
    <Card height="fill" overflow="auto">
      <Container width={5} paddingX={4} paddingY={5}>
        <Stack space={5}>
          <Flex align="flex-end" justify="space-between" gap={4} wrap="wrap">
            <Stack space={3}>
              <Heading as="h1" size={3}>
                Answer engine readiness
              </Heading>
              <Text size={1} muted>
                {DATA.origin.replace(/^https?:\/\//, "")} · graded {ago(DATA.generatedAt)} · {DATA.pagesCrawled} pages · model after Webflow AEO&apos;s four pillars
              </Text>
            </Stack>
            <Flex align="baseline" gap={3}>
              <Heading size={5}>{DATA.score}</Heading>
              <Stack space={2}>
                <Badge tone={tone(DATA.score)} fontSize={1} padding={3}>
                  level {DATA.level} · {LEVELS[DATA.level]}
                </Badge>
                <Text size={0} muted>
                  out of 100
                </Text>
              </Stack>
            </Flex>
          </Flex>
          <Trend />
          <Pillars />
          <PromptInsights />
          <Grid columns={[1, 1, 2]} gap={3}>
            <Bots />
            <Card padding={4} radius={3} border>
              <Stack space={3}>
                <Heading size={1}>How the score works</Heading>
                <Text size={1}>
                  Each check has a pillar, a weight and an effort. Page checks run on every crawled page they apply to and contribute their average pass ratio; site checks run once. A pillar is the weighted pass ratio of its checks; the site score is the pillars weighted{" "}
                  {Object.entries(DATA.pillars)
                    .map(([k, v]) => `${k} ${v.weight}`)
                    .join(" · ")}
                  . Levels: &lt;20 Invisible · &lt;40 Emerging · &lt;60 Developing · &lt;80 Established · 80+ Leading.
                </Text>
                <Text size={0} muted>
                  {DATA.checks.length} checks · edit weights, bots, prompts and the brand in designops.config.json → aeo.
                </Text>
              </Stack>
            </Card>
          </Grid>
          <Recommendations />
          <Pages />
        </Stack>
      </Container>
    </Card>
  );
}

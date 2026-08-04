"use client";

import { icons } from "@sanity/icons";
import { Badge, Card, Code, Container, Flex, Grid, Heading, Stack, Text } from "@sanity/ui";
import type { Tool } from "sanity";

import history from "@/design/perf.history.json";

import designops from "../../../designops.config.json";

/*
  "Performance" — one card per production page: current mobile and
  desktop Lighthouse scores, trend, and the metrics behind the number
  (LCP / TBT / CLS plus the other category grades). Plain @sanity/ui,
  themed by the Studio.

  Data comes from the lighthouse-history workflow (nightly, 08:30
  UTC, against production) via src/design/perf.history.json.
*/

interface Scores {
  perf: number;
  a11y: number;
  bp: number;
  seo: number;
  lcp: number | null;
  cls: number | null;
  tbt: number | null;
  lcpElement?: { selector: string | null; snippet: string } | null;
  opportunities?: { id: string; savingsMs: number }[];
}

/* nightly snapshot: both form factors. The first collection predates
   the desktop runs and stored flat mobile scores — normalize reads. */
interface Snap extends Partial<Scores> {
  t: string;
  mobile?: Scores;
  desktop?: Scores;
}

const mobileOf = (s: Snap): Scores => s.mobile ?? (s as unknown as Scores);
const desktopOf = (s: Snap): Scores | null => s.desktop ?? null;

const DATA = (history as { pages: Record<string, Snap[]> }).pages;

/* attention thresholds (Lighthouse bands / Core Web Vitals "good") */
const passScore = (v: number) => v >= 90;
const passLcp = (ms: number | null) => ms !== null && ms <= 2500;
const passTbt = (ms: number | null) => ms !== null && ms <= 200;
const passCls = (v: number | null) => v !== null && v <= 0.1;

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 36) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

/* trend line over the score history — theme-aware via currentColor */
function Sparkline({ snaps, pick }: { snaps: Snap[]; pick: (s: Snap) => number | null }) {
  const W = 160;
  const H = 40;
  const scores = snaps.map(pick).filter((n): n is number => n !== null);
  if (scores.length < 2)
    return (
      <Text size={0} muted>
        one run — trend appears tomorrow
      </Text>
    );
  const latest = scores[scores.length - 1];
  const prev = scores[scores.length - 2];
  const min = Math.min(...scores, 50);
  const max = Math.max(...scores, 100);
  const pts = scores
    .map((s, i) => {
      const x = (i / (scores.length - 1)) * (W - 4) + 2;
      const y = H - 4 - ((s - min) / (max - min || 1)) * (H - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <Text muted={latest === prev} accent={latest < prev}>
      <svg width={W} height={H} aria-hidden style={{ display: "block" }}>
        <polyline
          points={pts}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle
          cx={W - 2}
          cy={H - 4 - ((latest - min) / (max - min || 1)) * (H - 8)}
          r="2.5"
          fill="currentColor"
        />
      </svg>
    </Text>
  );
}

function delta(snaps: Snap[], pick: (s: Snap) => number | null): number {
  const present = snaps.map(pick).filter((n): n is number => n !== null);
  return present.length > 1 ? present[present.length - 1] - present[present.length - 2] : 0;
}

function Metric({ label, value, pass }: { label: string; value: string; pass: boolean }) {
  return (
    <Flex justify="space-between" gap={2}>
      <Text size={1} muted>
        {label}
      </Text>
      <Badge tone={pass ? "positive" : "caution"}>{value}</Badge>
    </Flex>
  );
}

function PageCard({ page, snaps }: { page: string; snaps: Snap[] }) {
  const latest = snaps[snaps.length - 1];
  const m = mobileOf(latest);
  const d = desktopOf(latest);
  const mDelta = delta(snaps, (s) => mobileOf(s)?.perf ?? null);

  return (
    <Card padding={4} radius={3} border>
      <Stack space={4}>
        <Flex justify="space-between" gap={2} wrap="wrap">
          <Code size={1}>{page}</Code>
          <Text size={1} muted>
            tested {ago(latest.t)} ·{" "}
            <a
              href={`https://pagespeed.web.dev/analysis?url=${encodeURIComponent(`${designops.site.baseUrl}${page}`)}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "inherit" }}
            >
              PSI ↗
            </a>
          </Text>
        </Flex>

        <Flex gap={5} wrap="wrap" align="flex-start">
          <Stack space={2} style={{ minWidth: 120 }}>
            <Flex align="baseline" gap={2}>
              <Heading size={5}>{m.perf}</Heading>
              <Text size={1} muted>
                {mDelta !== 0 ? (mDelta > 0 ? `▲${mDelta}` : `▼${Math.abs(mDelta)}`) : "▬"}
              </Text>
            </Flex>
            <Flex gap={2}>
              <Badge tone={passScore(m.perf) ? "positive" : "critical"}>mobile</Badge>
              {d && (
                <Badge tone={passScore(d.perf) ? "positive" : "critical"}>
                  desktop {d.perf}
                </Badge>
              )}
            </Flex>
          </Stack>

          <Stack space={2}>
            <Text size={0} muted>
              MOBILE
            </Text>
            <Sparkline snaps={snaps} pick={(s) => mobileOf(s)?.perf ?? null} />
          </Stack>
          <Stack space={2}>
            <Text size={0} muted>
              DESKTOP
            </Text>
            <Sparkline snaps={snaps} pick={(s) => desktopOf(s)?.perf ?? null} />
          </Stack>

          <Stack space={3} flex={1} style={{ minWidth: 200 }}>
            <Metric
              label="LCP"
              value={m.lcp !== null ? `${(m.lcp / 1000).toFixed(1)}s` : "—"}
              pass={passLcp(m.lcp)}
            />
            <Metric
              label="TBT"
              value={m.tbt !== null ? `${Math.round(m.tbt)}ms` : "—"}
              pass={passTbt(m.tbt)}
            />
            <Metric
              label="CLS"
              value={m.cls !== null ? m.cls.toFixed(3) : "—"}
              pass={passCls(m.cls)}
            />
            <Metric
              label="A11Y / BP / SEO"
              value={`${m.a11y} · ${m.bp} · ${m.seo}`}
              pass={passScore(Math.min(m.a11y, m.bp, m.seo))}
            />
          </Stack>
        </Flex>

        {(m.lcpElement?.selector || (m.opportunities?.length ?? 0) > 0) && (
          <Text size={0} muted title={m.lcpElement?.snippet}>
            LCP el {m.lcpElement?.selector ?? "—"}
            {m.opportunities?.length
              ? ` · fix first: ${m.opportunities
                  .map((o) => `${o.id} (~${(o.savingsMs / 1000).toFixed(1)}s)`)
                  .join(", ")}`
              : ""}
          </Text>
        )}
      </Stack>
    </Card>
  );
}

export default function PerformancePanel() {
  const pages = Object.entries(DATA).filter(([, snaps]) => snaps.length > 0);
  const latestRun = pages
    .map(([, snaps]) => snaps[snaps.length - 1].t)
    .sort()
    .pop();

  /* the site as one number per form factor: the average of the
     latest scores (desktop averages only pages with a desktop run) */
  const average = (pick: (s: Snap) => Scores | null, back: number) => {
    const scores = pages
      .map(([, s]) => (s.length > back ? pick(s[s.length - 1 - back]) : null))
      .filter((v): v is Scores => v !== null)
      .map((v) => v.perf);
    return scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;
  };
  const mobileNow = average((s) => mobileOf(s), 0);
  const mobilePrev = average((s) => mobileOf(s), 1);
  const desktopNow = average(desktopOf, 0);
  const siteDelta = mobileNow !== null && mobilePrev !== null ? mobileNow - mobilePrev : 0;

  return (
    <Card height="fill" overflow="auto">
      <Container width={5} paddingX={4} paddingY={5}>
        <Stack space={5}>
          <Flex align="flex-end" justify="space-between" gap={4} wrap="wrap">
            <Stack space={3}>
              <Heading as="h1" size={3}>
                Performance
              </Heading>
              <Text size={1} muted>
                Lighthouse against production, nightly · mobile and desktop
                {latestRun ? ` · last test ${new Date(latestRun).toLocaleString()}` : ""}
              </Text>
            </Stack>
            {mobileNow !== null && (
              <Flex align="baseline" gap={2}>
                <Heading size={4}>{mobileNow}</Heading>
                <Text size={1} muted>
                  {siteDelta > 0 ? `▲${siteDelta}` : siteDelta < 0 ? `▼${Math.abs(siteDelta)}` : "▬"}{" "}
                  site mobile avg{desktopNow !== null ? ` · desktop ${desktopNow}` : ""}
                </Text>
              </Flex>
            )}
          </Flex>

          {pages.length === 0 ? (
            <Card padding={4} radius={3} border>
              <Text size={1} muted>
                Dispatch the <Code size={1}>lighthouse-history</Code> workflow on GitHub (or
                wait for tonight&apos;s run) — results appear here after the next deploy.
              </Text>
            </Card>
          ) : (
            <Grid columns={[1, 1, 1, 2]} gap={3}>
              {pages.map(([page, snaps]) => (
                <PageCard key={page} page={page} snaps={snaps} />
              ))}
            </Grid>
          )}
        </Stack>
      </Container>
    </Card>
  );
}

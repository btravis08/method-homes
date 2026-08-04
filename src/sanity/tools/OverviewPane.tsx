import { icons } from "@sanity/icons";
import { Badge, Box, Card, Container, Flex, Grid, Heading, Stack, Text } from "@sanity/ui";
import type { Tool } from "sanity";

import backupStatus from "@/design/backup.status.json";
import driftStatus from "@/design/design-drift.json";
import libraryStatus from "@/design/library.status.json";
import linksStatus from "@/design/links.status.json";
import perfHistory from "@/design/perf.history.json";

import { ExperimentsCard } from "./Experiments";

/*
  Overview — the Studio's landing readout: is everything okay?
  Pulls the JSON the nightly jobs commit (Lighthouse history, section
  audit, link check, dataset backup, design drift) into one pane.
  Data ships with the bundle, so "as of" times matter. Built from
  plain @sanity/ui components so it follows the Studio theme.
*/

/* timed sections animate through their screenshots — their layout
   scores are structurally low and are verified by motion specs
   instead (see AGENTS.md) */
import designops from "../../../designops.config.json";

const TIMED = new Set<string>(designops.audit.timedSections);

type Snap = {
  t?: string;
  perf?: number;
  mobile?: { perf?: number; lcp?: number; tbt?: number };
  desktop?: { perf?: number };
};

const mobileOf = (snap: Snap | undefined) =>
  snap ? (snap.mobile ?? snap) : undefined;

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const hours = (Date.now() - new Date(iso).getTime()) / 36e5;
  if (hours < 1.5) return "just now";
  if (hours < 36) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function hoursSince(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 36e5;
}

interface PerfRow {
  path: string;
  score?: number;
  prevMedian?: number;
  desktop?: number;
  t?: string;
}

function collect() {
  const pages = (perfHistory as { pages?: Record<string, Snap[]> }).pages ?? {};
  const perf: PerfRow[] = Object.entries(pages).map(([path, snaps]) => {
    const last = snaps.at(-1);
    const prev = snaps
      .slice(-6, -1)
      .map((snap) => mobileOf(snap)?.perf)
      .filter((value): value is number => typeof value === "number");
    return {
      path,
      score: mobileOf(last)?.perf,
      prevMedian: median(prev),
      desktop: last?.desktop?.perf,
      t: last?.t,
    };
  });

  const sections = Object.entries(
    (libraryStatus as {
      generatedAt?: string;
      sections?: Record<string, { comps?: Record<string, { layout?: number }> }>;
    }).sections ?? {},
  )
    .filter(([slug]) => !TIMED.has(slug))
    .map(([slug, entry]) => {
      const layouts = Object.values(entry.comps ?? {})
        .map((bp) => bp.layout)
        .filter((value): value is number => typeof value === "number");
      return { slug, worst: layouts.length ? Math.min(...layouts) : undefined };
    })
    .filter((row) => row.worst != null)
    .sort((a, b) => (a.worst ?? 0) - (b.worst ?? 0));

  const links = linksStatus as {
    generatedAt: string | null;
    checked: number;
    broken: { url: string; code: number }[];
  };
  const backup = backupStatus as {
    generatedAt: string | null;
    docs: number;
    bytes: number;
  };
  const drift = driftStatus as { generatedAt: string | null };

  const alerts: string[] = [];
  if (links.broken?.length) alerts.push(`${links.broken.length} broken link(s)`);
  if (hoursSince(backup.generatedAt) > designops.alerts.backupStaleHours)
    alerts.push("dataset backup is stale");
  for (const row of perf) {
    if (
      row.score != null &&
      row.prevMedian != null &&
      row.prevMedian - row.score >= designops.alerts.perfDrop
    )
      alerts.push(`${row.path} perf dropped (${row.prevMedian}→${row.score})`);
  }

  return { perf, sections, links, backup, drift, alerts };
}

const scoreTone = (score: number | undefined) =>
  score == null ? undefined : score >= 90 ? "positive" : score >= 75 ? "caution" : "critical";

export default function OverviewPane() {
  const { perf, sections, links, backup, drift, alerts } = collect();
  const base = designops.site.baseUrl;
  const lastRun = perf[0]?.t;
  const backupFresh = hoursSince(backup.generatedAt) <= designops.alerts.backupStaleHours;

  return (
    <Card height="fill" overflow="auto">
      <Container width={5} paddingX={4} paddingY={5}>
        <Stack space={5}>
          <Flex align="flex-end" justify="space-between" gap={4} wrap="wrap">
            <Stack space={3}>
              <Heading as="h1" size={3}>
                Site overview
              </Heading>
              <Text size={1} muted>
                {base.replace(/^https?:\/\//, "")} · monitors as of {ago(lastRun)}
              </Text>
            </Stack>
            <Badge
              tone={alerts.length ? "critical" : "positive"}
              fontSize={1}
              padding={3}
            >
              {alerts.length
                ? `${alerts.length} alert${alerts.length === 1 ? "" : "s"}`
                : "all monitors green"}
            </Badge>
          </Flex>

          {alerts.length > 0 && (
            <Card padding={4} radius={3} tone="critical">
              <Stack space={3}>
                {alerts.map((alert) => (
                  <Text key={alert} size={1}>
                    {alert}
                  </Text>
                ))}
              </Stack>
            </Card>
          )}

          <Grid columns={[1, 1, 2, 3]} gap={3}>
            {perf.map((row) => (
              <Card key={row.path} padding={4} radius={3} border>
                <Stack space={3}>
                  <Flex justify="space-between" gap={2}>
                    <Text size={1} weight="medium">
                      {row.path}
                    </Text>
                    <Text size={1} muted>
                      <a
                        href={`${base}${row.path}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "inherit" }}
                      >
                        open ↗
                      </a>
                    </Text>
                  </Flex>
                  <Flex align="baseline" gap={3}>
                    <Heading size={4}>{row.score ?? "—"}</Heading>
                    <Badge tone={scoreTone(row.score)}>mobile</Badge>
                    {row.desktop != null && (
                      <Text size={1} muted>
                        desktop {row.desktop}
                      </Text>
                    )}
                  </Flex>
                  {row.prevMedian != null &&
                    row.score != null &&
                    row.score !== row.prevMedian && (
                      <Text
                        size={1}
                        muted={row.score >= row.prevMedian}
                      >
                        {row.score > row.prevMedian ? "+" : ""}
                        {row.score - row.prevMedian} vs median of last 5
                      </Text>
                    )}
                </Stack>
              </Card>
            ))}
          </Grid>

          <Grid columns={[1, 1, 2, 3]} gap={3}>
            <Card padding={4} radius={3} border>
              <Stack space={3}>
                <Flex justify="space-between">
                  <Text size={1} weight="medium">
                    Design fidelity · worst breakpoint
                  </Text>
                  <Text size={1} muted>
                    <a href="/studio/sections" style={{ color: "inherit" }}>
                      sections →
                    </a>
                  </Text>
                </Flex>
                {sections.slice(0, 6).map((row) => (
                  <Flex key={row.slug} justify="space-between">
                    <Text size={1} muted>
                      {row.slug}
                    </Text>
                    <Badge
                      tone={
                        row.worst! >= designops.audit.bands.match
                          ? "positive"
                          : "caution"
                      }
                    >
                      {row.worst!.toFixed(1)}
                    </Badge>
                  </Flex>
                ))}
                <Text size={0} muted>
                  timed sections verify via motion specs instead
                </Text>
              </Stack>
            </Card>

            <Card padding={4} radius={3} border>
              <Stack space={3}>
                <Text size={1} weight="medium">
                  Links checked
                </Text>
                <Flex align="baseline" gap={3}>
                  <Heading size={4}>
                    {links.checked ? links.checked - links.broken.length : "—"}
                  </Heading>
                  <Badge tone={links.broken.length ? "critical" : "positive"}>
                    {links.broken.length ? `${links.broken.length} broken` : "none broken"}
                  </Badge>
                </Flex>
                <Text size={1} muted>
                  {links.generatedAt == null
                    ? "no run recorded yet"
                    : `${links.checked} URLs · ${ago(links.generatedAt)}`}
                </Text>
              </Stack>
            </Card>

            <Card padding={4} radius={3} border>
              <Stack space={3}>
                <Text size={1} weight="medium">
                  Dataset backup
                </Text>
                <Flex align="baseline" gap={3}>
                  <Heading size={4}>{backup.docs || "—"}</Heading>
                  <Badge tone={backupFresh ? "positive" : "critical"}>
                    {backupFresh ? "fresh" : "stale"}
                  </Badge>
                </Flex>
                <Text size={1} muted>
                  {backup.generatedAt == null
                    ? "no backup recorded yet"
                    : `${(backup.bytes / 1024).toFixed(0)}KB · ${ago(backup.generatedAt)}`}
                </Text>
              </Stack>
            </Card>
          </Grid>

          {/* live A/B results (D1) — reads the dataset, not bundled JSON */}
          <ExperimentsCard />

          <Box>
            <Text size={0} muted>
              Design drift:{" "}
              {drift.generatedAt
                ? `last checked ${ago(drift.generatedAt)}`
                : "dormant (FIGMA_TOKEN not set)"}{" "}
              · data updates with each deploy after the nightly jobs commit their
              results.
            </Text>
          </Box>
        </Stack>
      </Container>
    </Card>
  );
}

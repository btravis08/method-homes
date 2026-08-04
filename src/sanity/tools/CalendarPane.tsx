"use client";

import { icons } from "@sanity/icons";
import {
  Badge,
  Box,
  Button,
  Card,
  Container,
  Flex,
  Grid,
  Heading,
  Stack,
  Text,
} from "@sanity/ui";
import { useEffect, useMemo, useState } from "react";
import { useClient } from "sanity";
import { IntentLink } from "sanity/router";

/*
  "Calendar" — the editorial month at a glance, in plain @sanity/ui.
  Every post lands on its publish date: solid badges are published,
  outlined (caution) ones are drafts, positive rows are content
  releases on their intended publish date. Chips deep-link to the
  document; releases open the Releases tool. Undated drafts surface
  in their own card. Data reads live from the dataset each time the
  month changes.
*/

interface CalPost {
  id: string;
  title: string;
  publishedAt?: string;
  draft: boolean;
}

interface CalRelease {
  id: string;
  title: string;
  at?: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOWS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const editUrl = (id: string) => `/studio/intent/edit/id=${id};type=post/`;

export default function CalendarPanel() {
  const client = useClient({ apiVersion: "2026-07-01" });
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [posts, setPosts] = useState<CalPost[]>([]);
  const [releases, setReleases] = useState<CalRelease[]>([]);
  const [undated, setUndated] = useState<CalPost[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const from = new Date(year, month, 1).toISOString();
    const to = new Date(year, month + 1, 1).toISOString();
    (async () => {
      try {
        /* raw perspective: published + draft versions side by side,
           merged here so a post shows once (draft edits win the
           display; "draft" marks posts with no published version) */
        const rows = await client
          .withConfig({ perspective: "raw" })
          .fetch<{ _id: string; title?: string; publishedAt?: string }[]>(
            `*[_type == "post"]{ _id, title, publishedAt }`,
          );
        if (cancelled) return;
        const publishedDocs = new Map<string, (typeof rows)[number]>();
        const draftDocs = new Map<string, (typeof rows)[number]>();
        for (const row of rows) {
          if (row._id.startsWith("drafts.")) draftDocs.set(row._id.slice(7), row);
          else publishedDocs.set(row._id, row);
        }
        const merged: CalPost[] = [
          ...new Set([...publishedDocs.keys(), ...draftDocs.keys()]),
        ].map((id) => {
          const doc = draftDocs.get(id) ?? publishedDocs.get(id)!;
          return {
            id,
            title: doc.title ?? "Untitled",
            publishedAt: doc.publishedAt ?? publishedDocs.get(id)?.publishedAt,
            draft: !publishedDocs.has(id),
          };
        });
        setUndated(merged.filter((p) => !p.publishedAt));
        setPosts(
          merged.filter(
            (p) => p.publishedAt && p.publishedAt >= from && p.publishedAt < to,
          ),
        );
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      }
      try {
        const rel = await client.fetch<
          { _id: string; metadata?: { title?: string; intendedPublishAt?: string } }[]
        >(`releases::all(){ _id, metadata }`);
        if (cancelled) return;
        setReleases(
          rel.map((r) => ({
            id: r._id,
            title: r.metadata?.title ?? "Release",
            at: r.metadata?.intendedPublishAt,
          })),
        );
      } catch {
        /* releases API unavailable — the grid still works */
        if (!cancelled) setReleases([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, year, month]);

  /* Monday-first week grid covering the whole month */
  const days = useMemo(() => {
    const first = new Date(year, month, 1);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7));
    const cells: Date[] = [];
    const d = new Date(start);
    while (d < new Date(year, month + 1, 1) || cells.length % 7 !== 0) {
      cells.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return cells;
  }, [year, month]);

  const byDay = useMemo(() => {
    const map = new Map<string, { posts: CalPost[]; releases: CalRelease[] }>();
    const bucket = (key: string) => {
      const hit = map.get(key) ?? { posts: [], releases: [] };
      map.set(key, hit);
      return hit;
    };
    for (const post of posts)
      bucket(dayKey(new Date(post.publishedAt!))).posts.push(post);
    for (const release of releases)
      if (release.at) bucket(dayKey(new Date(release.at))).releases.push(release);
    return map;
  }, [posts, releases]);

  const drafts = posts.filter((p) => p.draft).length;
  const monthReleases = releases.filter((r) => {
    if (!r.at) return false;
    const d = new Date(r.at);
    return d.getFullYear() === year && d.getMonth() === month;
  }).length;
  const todayKey = dayKey(today);

  const shift = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  return (
    <Card height="fill" overflow="auto">
      <Container width={5} paddingX={4} paddingY={5}>
        <Stack space={5}>
          <Flex align="flex-end" justify="space-between" gap={4} wrap="wrap">
            <Stack space={3}>
              <Heading as="h1" size={3}>
                Content calendar
              </Heading>
              <Text size={1} muted>
                Posts on their publish dates, drafts outlined, releases marked — the
                editorial month at a glance.
              </Text>
            </Stack>
            <Text size={1} muted>
              {posts.length} {posts.length === 1 ? "post" : "posts"} · {drafts} draft
              {drafts === 1 ? "" : "s"} · {monthReleases} release
              {monthReleases === 1 ? "" : "s"}
            </Text>
          </Flex>

          <Card padding={4} radius={3} border>
            <Stack space={4}>
              <Flex align="center" gap={2}>
                <Heading size={2} style={{ minWidth: "11ch" }}>
                  {MONTHS[month]} {year}
                </Heading>
                <Box flex={1} />
                <Button mode="ghost" text="‹" aria-label="Previous month" onClick={() => shift(-1)} />
                <Button
                  mode="ghost"
                  text="Today"
                  onClick={() => {
                    setYear(today.getFullYear());
                    setMonth(today.getMonth());
                  }}
                />
                <Button mode="ghost" text="›" aria-label="Next month" onClick={() => shift(1)} />
              </Flex>

              {error && (
                <Text size={1} muted>
                  Dataset unreachable — the calendar fills in when the Studio can reach
                  Sanity.
                </Text>
              )}

              <Box
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr)",
                  gap: 4,
                }}
              >
                {DOWS.map((dow) => (
                  <Box key={dow} paddingX={2} paddingBottom={2}>
                    <Text size={0} muted>
                      {dow}
                    </Text>
                  </Box>
                ))}
                {days.map((d) => {
                  const key = dayKey(d);
                  const inMonth = d.getMonth() === month;
                  const hit = byDay.get(key);
                  return (
                    <Card
                      key={key}
                      padding={2}
                      radius={2}
                      tone={inMonth ? "default" : "transparent"}
                      border={inMonth}
                      style={{
                        minHeight: 92,
                        outline:
                          key === todayKey
                            ? "2px solid var(--card-focus-ring-color, #556bfc)"
                            : undefined,
                        outlineOffset: -2,
                      }}
                    >
                      <Stack space={2}>
                        <Flex justify="space-between" align="center">
                          <Text size={0} muted>
                            {d.getDate()}
                          </Text>
                          {inMonth && (
                            <IntentLink
                              intent="create"
                              params={[
                                { type: "post", template: "post-on-date" },
                                {
                                  publishedAt: new Date(
                                    d.getFullYear(),
                                    d.getMonth(),
                                    d.getDate(),
                                    9,
                                  ).toISOString(),
                                },
                              ]}
                              title={`New post on ${key}`}
                              aria-label={`Create a post publishing ${key}`}
                              style={{
                                textDecoration: "none",
                                lineHeight: 1,
                                padding: "0 2px",
                              }}
                            >
                              <Text size={1} muted>
                                +
                              </Text>
                            </IntentLink>
                          )}
                        </Flex>
                        {inMonth &&
                          hit?.releases.map((release) => (
                            <a
                              key={release.id}
                              href="/studio/releases"
                              style={{ textDecoration: "none", display: "block" }}
                              title={`${release.title} — release`}
                            >
                              <Badge tone="positive" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                ⏱ {release.title}
                              </Badge>
                            </a>
                          ))}
                        {inMonth &&
                          hit?.posts.map((post) => (
                            <a
                              key={post.id}
                              href={editUrl(post.id)}
                              style={{ textDecoration: "none", display: "block" }}
                              title={`${post.title}${post.draft ? " — draft" : ""}`}
                            >
                              <Badge
                                tone={post.draft ? "caution" : "primary"}
                                style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                              >
                                {post.title}
                              </Badge>
                            </a>
                          ))}
                      </Stack>
                    </Card>
                  );
                })}
              </Box>
            </Stack>
          </Card>

          <Grid columns={[1, 1, 2]} gap={3}>
            <Card padding={4} radius={3} border>
              <Stack space={3}>
                <Text size={1} weight="medium">
                  Undated drafts
                </Text>
                {undated.length === 0 ? (
                  <Text size={1} muted>
                    Every draft has a publish date.
                  </Text>
                ) : (
                  undated.map((post) => (
                    <Flex key={post.id} justify="space-between" gap={2}>
                      <Text size={1} textOverflow="ellipsis">
                        <a href={editUrl(post.id)} style={{ color: "inherit" }}>
                          {post.title}
                        </a>
                      </Text>
                      <Text size={1} muted>
                        no date
                      </Text>
                    </Flex>
                  ))
                )}
              </Stack>
            </Card>

            <Card padding={4} radius={3} border>
              <Stack space={3}>
                <Text size={1} weight="medium">
                  How to schedule
                </Text>
                <Text size={1} muted>
                  Set a future Published at on a draft to slot it into the month — it
                  stays outlined until the day it goes live. Grouped launches belong in
                  a content release with an intended publish date.
                </Text>
              </Stack>
            </Card>
          </Grid>
        </Stack>
      </Container>
    </Card>
  );
}

"use client";

import { Badge, Card, Flex, Stack, Text } from "@sanity/ui";
import { useEffect, useState } from "react";
import { useClient } from "sanity";

/*
  Experiments card (Overview pane): live A/B results. Counters come
  from abResult docs (flat views_<variantKey> / converts_<variantKey>,
  written by /api/ab); variant labels and hypotheses come from the
  experiment sections still present on pages. The best conversion
  rate is badged; a positive badge marks a variant beating the
  control once both have views.
*/

interface ResultDoc {
  experiment?: string;
  counters?: Record<string, number>;
  _updatedAt?: string;
}

interface ExperimentConfig {
  key?: string;
  note?: string;
  variants?: { _key: string; label?: string }[];
}

interface Row {
  experiment: string;
  note?: string;
  live: boolean;
  variants: { label: string; views: number; converts: number; rate: number }[];
}

export function ExperimentsCard() {
  const client = useClient({ apiVersion: "2026-07-01" });
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [results, pages] = await Promise.all([
          client.fetch<ResultDoc[]>(
            `*[_type == "abResult"]{ experiment, counters, _updatedAt }`,
          ),
          client.fetch<{ ex?: ExperimentConfig[] }[]>(
            `*[_type == "page" && count(sections[_type == "sectionExperiment"]) > 0]{
              "ex": sections[_type == "sectionExperiment"]{ key, note, variants[]{ _key, label } }
            }`,
          ),
        ]);
        if (cancelled) return;
        const configs = new Map<string, ExperimentConfig>();
        for (const page of pages)
          for (const ex of page.ex ?? [])
            if (ex.key) configs.set(ex.key, ex);

        const keys = new Set<string>([
          ...results.map((r) => r.experiment ?? "").filter(Boolean),
          ...configs.keys(),
        ]);
        const built: Row[] = [...keys].map((key) => {
          const config = configs.get(key);
          const counters = results.find((r) => r.experiment === key)?.counters ?? {};
          /* variant keys: configured ones first, then any orphaned
             counter keys (variant deleted mid-experiment) */
          const known = config?.variants ?? [];
          const counted = new Set(
            Object.keys(counters)
              .map((k) => k.replace(/^(views|converts)_/, ""))
              .filter(Boolean),
          );
          for (const variant of known) counted.delete(variant._key);
          const variants = [
            ...known.map((v, i) => ({ vKey: v._key, label: v.label ?? `Variant ${i + 1}` })),
            ...[...counted].map((vKey) => ({ vKey, label: `(removed ${vKey.slice(0, 6)})` })),
          ].map(({ vKey, label }) => {
            const views = counters[`views_${vKey}`] ?? 0;
            const converts = counters[`converts_${vKey}`] ?? 0;
            return { label, views, converts, rate: views > 0 ? converts / views : 0 };
          });
          return { experiment: key, note: config?.note, live: Boolean(config), variants };
        });
        setRows(built.sort((a, b) => Number(b.live) - Number(a.live)));
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <Card padding={4} radius={3} border>
      <Stack space={4}>
        <Text size={1} weight="medium">
          Experiments
        </Text>
        {!rows || rows.length === 0 ? (
          <Text size={1} muted>
            {rows === null
              ? "Loading…"
              : "No experiments yet — add an A/B Experiment section to a page."}
          </Text>
        ) : (
          rows.map((row) => {
            const best = Math.max(...row.variants.map((v) => v.rate));
            const control = row.variants[0];
            return (
              <Stack key={row.experiment} space={3}>
                <Flex gap={2} align="baseline" wrap="wrap">
                  <Text size={1} weight="medium">
                    {row.experiment}
                  </Text>
                  {!row.live && <Badge tone="caution">ended</Badge>}
                  {row.note && (
                    <Text size={1} muted textOverflow="ellipsis">
                      {row.note}
                    </Text>
                  )}
                </Flex>
                {row.variants.map((variant, i) => {
                  const beatsControl =
                    i > 0 &&
                    variant.views > 0 &&
                    (control?.views ?? 0) > 0 &&
                    variant.rate > (control?.rate ?? 0);
                  const isBest = variant.rate === best && variant.views > 0;
                  return (
                    <Flex
                      key={`${row.experiment}-${variant.label}-${i}`}
                      gap={3}
                      align="center"
                      wrap="wrap"
                    >
                      <Text
                        size={1}
                        muted={!isBest}
                        style={{ width: 160 }}
                        textOverflow="ellipsis"
                      >
                        {variant.label}
                        {i === 0 ? " (control)" : ""}
                      </Text>
                      <Text size={1} muted style={{ width: 90 }}>
                        {variant.views} views
                      </Text>
                      <Text size={1} muted style={{ width: 70 }}>
                        {variant.converts} conv
                      </Text>
                      <Badge tone={beatsControl ? "positive" : isBest ? "primary" : undefined}>
                        {variant.views > 0 ? `${(variant.rate * 100).toFixed(1)}%` : "—"}
                        {beatsControl ? " ▲" : ""}
                      </Badge>
                    </Flex>
                  );
                })}
              </Stack>
            );
          })
        )}
      </Stack>
    </Card>
  );
}

import { defineField, defineType } from "sanity";

/*
  AEO traffic counters — system documents written by /api/aeo/hit (from
  src/proxy.ts), one per day × crawler × path and per day × AI source
  × landing path. Read by scripts/aeo-audit.mjs for the Studio's
  Traffic view. Not editor content: they are kept out of the desk and
  the "create new" menu, and the Studio only ever shows them read-only.
*/

const common = [
  defineField({ name: "day", title: "Day (UTC)", type: "string", readOnly: true }),
  defineField({ name: "path", title: "Path", type: "string", readOnly: true }),
  defineField({ name: "hits", title: "Hits", type: "number", readOnly: true }),
];

export const aeoBotHit = defineType({
  name: "aeoBotHit",
  title: "AEO · LLM bot hit",
  type: "document",
  readOnly: true,
  fields: [defineField({ name: "bot", title: "Crawler", type: "string", readOnly: true }), ...common],
  preview: {
    select: { bot: "bot", path: "path", hits: "hits", day: "day" },
    prepare: ({ bot, path, hits, day }) => ({ title: `${bot} · ${path}`, subtitle: `${hits} hit(s) · ${day}` }),
  },
});

export const aeoAiSession = defineType({
  name: "aeoAiSession",
  title: "AEO · AI-referred session",
  type: "document",
  readOnly: true,
  fields: [defineField({ name: "source", title: "AI source", type: "string", readOnly: true }), ...common],
  preview: {
    select: { source: "source", path: "path", hits: "hits", day: "day" },
    prepare: ({ source, path, hits, day }) => ({ title: `${source} → ${path}`, subtitle: `${hits} session(s) · ${day}` }),
  },
});

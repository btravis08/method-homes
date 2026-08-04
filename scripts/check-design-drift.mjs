/**
 * Design-drift check — the alarm pointed at Figma.
 *
 * The audit refreshes the BUILD side nightly, but comps are snapshots
 * from the day they were exported: if the design moves in Figma, the
 * audit keeps scoring against a stale target. This script re-renders
 * each registered section's Figma node via the Figma REST API and
 * compares it (same metric as the audit) against the committed comp.
 * A low score means the DESIGN changed since the comp was minted —
 * the section needs its comp re-exported and probably a build pass.
 *
 * Desktop nodes only: the registry stores each section's desktop
 * variant id (tablet/mobile variant ids aren't recorded yet).
 *
 * Needs FIGMA_TOKEN (a Figma personal access token with file read
 * scope) in the environment. Writes src/design/design-drift.json.
 * Run: npm run drift
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { layoutScore, readRegistry } from "./lib/image-metric.mjs";

const ROOT = process.cwd();
const DESIGNOPS = JSON.parse(
  readFileSync(path.join(ROOT, "designops.config.json"), "utf8"),
);
const FILE_KEY = DESIGNOPS.figma.fileKey;
const OUT = path.join(ROOT, "src/design/design-drift.json");

const token = process.env.FIGMA_TOKEN;
if (!token) {
  console.error("FIGMA_TOKEN not set — skipping design-drift check.");
  process.exit(0);
}

const compPath = (slug) => path.join(ROOT, "public/figma/comps", `${slug}.jpg`);

async function run() {
  const entries = readRegistry(path.join(ROOT, "src/library/registry.tsx")).filter(
    (e) => e.figmaNodeId && e.comps.desktop,
  );

  const ids = entries.map((e) => e.figmaNodeId).join(",");
  const res = await fetch(
    `https://api.figma.com/v1/images/${FILE_KEY}?ids=${encodeURIComponent(ids)}&format=png&scale=1`,
    { headers: { "X-Figma-Token": token } },
  );
  if (!res.ok) throw new Error(`Figma API ${res.status}: ${await res.text()}`);
  const { images, err } = await res.json();
  if (err) throw new Error(`Figma render error: ${err}`);

  const sections = {};
  for (const entry of entries) {
    const url = images[entry.figmaNodeId];
    if (!url) {
      sections[entry.slug] = { score: null, error: "node did not render" };
      console.log(`${entry.slug.padEnd(22)} — no render (deleted node?)`);
      continue;
    }
    const png = Buffer.from(await (await fetch(url)).arrayBuffer());
    const score = await layoutScore(png, readFileSync(compPath(entry.slug)));
    sections[entry.slug] = { score };
    console.log(`${entry.slug.padEnd(22)} design-vs-comp ${score}%`);
  }

  writeFileSync(
    OUT,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), sections }, null, 2)}\n`,
  );
  console.log(`\n✓ ${path.relative(ROOT, OUT)}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

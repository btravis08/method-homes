/**
 * Section audit — turns the library from a catalogue into a dashboard.
 *
 * For every registered section it:
 *   1. screenshots the live render at each breakpoint that has a comp
 *   2. diffs that against the Figma comp, producing two numbers:
 *        layout — STRUCTURE match: both images are reduced to
 *                 normalized 96px gradient maps (where edges are, not
 *                 what pixels contain), so different photography or
 *                 copy in the same composition scores high while a
 *                 moved/resized/missing block scores low. This is the
 *                 drift number.
 *        pixel  — full-resolution raw match. Always lower (the comp's
 *                 photography is not the site's); a relative trend
 *                 only.
 *   3. sweeps every visible element through the token matcher and
 *      counts values that match no token
 *
 * Results land in src/design/library.status.json; every run also
 * appends a snapshot to src/design/library.history.json so the grid
 * can show per-section deltas and regressions are visible.
 *
 * Needs a built server on :3000 (npm run build && npm start).
 * Run: npm run audit
 *   AUDIT_ORIGIN    — server origin (default http://localhost:3000)
 *   AUDIT_CHROMIUM  — chromium/chrome binary (default the sandbox's
 *                     /opt/pw-browsers/chromium; CI passes
 *                     /usr/bin/google-chrome)
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { gradientMap, cosineScore, readRegistry as readRegistryFrom } from "./lib/image-metric.mjs";
import { MOTION_SPECS } from "./motion-specs.mjs";

/* playwright-core: prefer a local install (CI does npm i --no-save
   playwright-core); fall back to the sandbox's sibling project */
const localRequire = createRequire(import.meta.url);
function resolvePlaywright() {
  try {
    return localRequire("playwright-core");
  } catch {
    return createRequire("/home/user/site-framework/package.json")("playwright-core");
  }
}
const { chromium } = resolvePlaywright();
const sharp = localRequire("sharp");

const ROOT = process.cwd();
const ORIGIN = process.env.AUDIT_ORIGIN ?? "http://localhost:3000";
const EXECUTABLE = process.env.AUDIT_CHROMIUM ?? "/opt/pw-browsers/chromium";
const OUT = path.join(ROOT, "src/design/library.status.json");
const HISTORY = path.join(ROOT, "src/design/library.history.json");
/* enough runs for a real trend without bloating the bundle */
const DESIGNOPS = JSON.parse(
  readFileSync(path.join(ROOT, "designops.config.json"), "utf8"),
);
const HISTORY_CAP = DESIGNOPS.audit.historyCap;

const WIDTHS = DESIGNOPS.audit.breakpoints;

/* the registry is TSX — read the fields the audit needs without
   compiling it (slug, modes, comps) */
const readRegistry = () =>
  readRegistryFrom(path.join(ROOT, "src/library/registry.tsx"));

const compPath = (slug, bp) =>
  path.join(ROOT, "public/figma/comps", `${slug}${bp === "desktop" ? "" : `-${bp}`}.jpg`);

/* mean absolute difference of two same-size buffers, as a 0–100
   "match" score */
function matchScore(a, b, scale = 255) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return +(100 - (sum / a.length / scale) * 100).toFixed(1);
}

/* Gradient map: where the edges are, per pixel, on a normalized 96px
   thumbnail. Two images of the same COMPOSITION — same blocks in the
   same places — produce near-identical maps even when the photography
   or copy inside those blocks differs, which is exactly the
   distinction the layout score needs: content changes shouldn't move
   it, moved/resized/missing blocks should. */
async function diff(shotBuf, compFile) {
  const comp = sharp(compFile);
  const { width, height } = await comp.metadata();

  /* full-res: both normalized to the comp's size and grayscaled */
  const [aFull, bFull] = await Promise.all([
    sharp(shotBuf).resize(width, height, { fit: "fill" }).greyscale().raw().toBuffer(),
    comp.clone().greyscale().raw().toBuffer(),
  ]);

  const [aGrad, bGrad] = await Promise.all([gradientMap(shotBuf), gradientMap(compFile)]);

  return {
    pixel: matchScore(aFull, bFull),
    /* shared metric (scripts/lib/image-metric.mjs): cosine of blurred
       edge maps — verified match ~95, unrelated layouts ~22 */
    layout: cosineScore(aGrad, bGrad),
  };
}

async function run() {
  const entries = readRegistry();
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    args: ["--no-sandbox"],
  });
  const status = {};

  for (const entry of entries) {
    const record = { comps: {}, tokens: null };

    for (const bp of Object.keys(entry.comps)) {
      const page = await browser.newPage({
        viewport: { width: WIDTHS[bp], height: entry.comps[bp].height },
      });
      await page.goto(`${ORIGIN}/library/${entry.slug}?frame=1&mode=${entry.modes[0]}`, {
        waitUntil: "domcontentloaded",
      });
      /* the locked hero sequence and the reveal passes need to settle
         before the frame represents the section's resting state */
      await page.waitForTimeout(entry.slug === "legacy-hero" ? 7000 : 3000);
      const shot = await page.screenshot({ type: "png" });
      record.comps[bp] = await diff(shot, compPath(entry.slug, bp));
      await page.close();
    }

    /* token sweep, once, at desktop in the section's default mode */
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(
      `${ORIGIN}/library/${entry.slug}?frame=1&audit=1&mode=${entry.modes[0]}`,
      { waitUntil: "domcontentloaded" },
    );
    await page.waitForTimeout(entry.slug === "legacy-hero" ? 7000 : 3000);
    await page.waitForFunction(() => typeof window.__sdrAudit === "function", null, {
      timeout: 15000,
    });
    const audit = await page.evaluate(() => window.__sdrAudit());
    await page.close();

    /* group findings so the dashboard can say WHAT drifted, not just
       how many times */
    const byKind = {};
    for (const f of audit.findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
    record.tokens = {
      elements: audit.elements,
      offToken: audit.findings.length,
      byKind,
      /* a handful of examples is enough to start fixing */
      examples: audit.findings.slice(0, 8),
    };

    /* motion specs: replayable assertions for the choreography a
       screenshot can't judge — a fresh page per spec */
    const specs = MOTION_SPECS[entry.slug] ?? [];
    if (specs.length) {
      const failed = [];
      for (const spec of specs) {
        const specPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        try {
          await specPage.goto(
            `${ORIGIN}/library/${entry.slug}?frame=1&mode=${entry.modes[0]}`,
            { waitUntil: "domcontentloaded" },
          );
          await spec.run(specPage, ORIGIN, entry.slug);
        } catch (err) {
          failed.push({ name: spec.name, error: String(err.message ?? err) });
        } finally {
          await specPage.close();
        }
      }
      record.motion = { passed: specs.length - failed.length, total: specs.length, failed };
    }

    status[entry.slug] = record;
    const worst = Object.values(record.comps).map((c) => c.layout);
    console.log(
      `${entry.slug.padEnd(22)} layout ${worst.length ? `${Math.min(...worst)}%` : "—".padEnd(4)}` +
        `  off-token ${record.tokens.offToken}` +
        (record.motion ? `  motion ${record.motion.passed}/${record.motion.total}` : ""),
    );
  }

  await browser.close();
  const generatedAt = new Date().toISOString();
  writeFileSync(OUT, `${JSON.stringify({ generatedAt, sections: status }, null, 2)}\n`);

  /* append this run to the history so the grid can show deltas and a
     regression is a visible drop, not a silent overwrite */
  const history = existsSync(HISTORY) ? JSON.parse(readFileSync(HISTORY, "utf8")) : [];
  history.push({
    generatedAt,
    sections: Object.fromEntries(
      Object.entries(status).map(([slug, s]) => {
        const layouts = Object.values(s.comps).map((c) => c.layout);
        return [
          slug,
          {
            layout: layouts.length ? Math.min(...layouts) : null,
            offToken: s.tokens?.offToken ?? 0,
          },
        ];
      }),
    ),
  });
  writeFileSync(
    HISTORY,
    `${JSON.stringify(history.slice(-HISTORY_CAP), null, 2)}\n`,
  );
  console.log(`\n✓ ${path.relative(ROOT, OUT)} (+ history, ${history.length} runs)`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

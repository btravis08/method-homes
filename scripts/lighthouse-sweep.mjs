/*
  Full-site Lighthouse sweep of methodhomes.net (runs on GitHub Actions;
  the sandbox cannot reach the site). Shards the 331 captured URLs across
  parallel jobs via SHARD/SHARDS env vars; each URL is scored on simulated
  mobile and desktop, performance category only. Output: sweep-<shard>.json
  with {url, form, score, lcp, cls, tbt} per run (score null after retry
  = page failed to load). Consumed by the speed-audit workflow's aggregate
  job, which commits the merged file to design/perf/.
*/
import fs from "node:fs";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import desktopConfig from "lighthouse/core/config/desktop-config.js";

const shard = Number(process.env.SHARD ?? 0);
const shards = Number(process.env.SHARDS ?? 1);

const data = JSON.parse(
  fs.readFileSync("design/method-content/pages.json", "utf8"),
);
const urls = Object.values(data.pages)
  .map((p) => p.url)
  .sort();
const mine = urls.filter((_, i) => i % shards === shard);
console.log(`shard ${shard}/${shards}: ${mine.length} urls`);

const chrome = await chromeLauncher.launch({
  chromeFlags: ["--headless=new"],
});

const results = [];
async function run(url, form) {
  const opts = {
    port: chrome.port,
    output: "json",
    onlyCategories: ["performance"],
    maxWaitForLoad: 60_000,
  };
  const config = form === "desktop" ? desktopConfig : undefined;
  const r = await lighthouse(url, opts, config);
  const lhr = r.lhr;
  const a = lhr.audits;
  return {
    url,
    form,
    score:
      lhr.categories.performance.score == null
        ? null
        : Math.round(lhr.categories.performance.score * 100),
    lcp: a["largest-contentful-paint"]?.numericValue ?? null,
    cls: a["cumulative-layout-shift"]?.numericValue ?? null,
    tbt: a["total-blocking-time"]?.numericValue ?? null,
  };
}

for (const url of mine) {
  for (const form of ["mobile", "desktop"]) {
    let entry = null;
    for (let attempt = 0; attempt < 2 && !entry?.score && entry?.score !== 0; attempt++) {
      try {
        entry = await run(url, form);
      } catch (e) {
        console.log(`ERR ${form} ${url}: ${String(e).slice(0, 120)}`);
        entry = { url, form, score: null, lcp: null, cls: null, tbt: null };
      }
    }
    results.push(entry);
    console.log(`${form} ${entry.score} ${url}`);
  }
}

chrome.kill();
fs.writeFileSync(`sweep-${shard}.json`, JSON.stringify(results, null, 1));
console.log(`wrote sweep-${shard}.json (${results.length} runs)`);

/**
 * Redirect map check — every legacy URL in design/redirects/legacy-map.json
 * must resolve the way the map says, in ONE hop:
 *   redirect  → 301/308 whose Location is exactly `to`, and `to` → 200
 *   keep      → 200
 *   gone      → 410 or 404
 * Pending redirects (live: false) are checked for the hop only when
 * their destination answers 200; otherwise they are reported as
 * pending, not failing.
 *
 *   node scripts/check-redirects.mjs
 *     REDIRECTS_ORIGIN  site to check (default designops site.baseUrl)
 *
 * Writes src/design/redirects.status.json; exits 1 when a live entry
 * fails (so the workflow goes red at launch time).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DESIGNOPS = JSON.parse(readFileSync(path.join(ROOT, "designops.config.json"), "utf8"));
const ORIGIN = (process.env.REDIRECTS_ORIGIN ?? DESIGNOPS.site.baseUrl).replace(/\/$/, "");
const MAP = JSON.parse(readFileSync(path.join(ROOT, "design/redirects/legacy-map.json"), "utf8"));
const OUT = path.join(ROOT, "src/design/redirects.status.json");
const UA = "Mozilla/5.0 (compatible; MethodRedirects/1.0; +https://github.com/btravis08/method-homes)";

async function head(url) {
  try {
    const res = await fetch(url, { method: "GET", redirect: "manual", headers: { "user-agent": UA } });
    return { status: res.status, location: res.headers.get("location") };
  } catch (err) {
    return { status: 0, error: String(err?.message ?? err) };
  }
}
const samePath = (loc, to) => {
  if (!loc) return false;
  try {
    const u = new URL(loc, ORIGIN);
    return (u.pathname.replace(/\/$/, "") || "/") === to && (u.origin === ORIGIN || u.host.replace(/^www\./, "") === new URL(ORIGIN).host.replace(/^www\./, ""));
  } catch {
    return false;
  }
};

const rows = [];
const okCache = new Map();
async function destOk(to) {
  if (!okCache.has(to)) {
    const r = await head(`${ORIGIN}${to}`);
    okCache.set(to, r.status === 200);
  }
  return okCache.get(to);
}

for (const e of MAP.entries) {
  const r = await head(`${ORIGIN}${e.from}`);
  let result;
  if (e.action === "keep") result = r.status === 200 ? "pass" : "fail";
  else if (e.action === "gone") result = r.status === 410 || r.status === 404 ? "pass" : "fail";
  else {
    const hop = (r.status === 301 || r.status === 308) && samePath(r.location, e.to);
    const dest = await destOk(e.to);
    if (!e.live && !dest) result = "pending";
    else result = hop && dest ? "pass" : "fail";
  }
  rows.push({ from: e.from, action: e.action, to: e.to, live: e.live, status: r.status, location: r.location ?? null, result });
}

const summary = rows.reduce((a, r) => ((a[r.result] = (a[r.result] ?? 0) + 1), a), {});
writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), origin: ORIGIN, summary, rows }, null, 2) + "\n");
console.log(`check-redirects: ${rows.length} URLs ·`, summary);
for (const r of rows.filter((r) => r.result === "fail").slice(0, 30)) console.log(`  FAIL ${r.from} → ${r.status} ${r.location ?? ""} (wanted ${r.action}${r.to ? ` → ${r.to}` : ""})`);
if (summary.fail) process.exit(1);

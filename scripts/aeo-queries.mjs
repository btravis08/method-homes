/**
 * AEO · questions people already ask — pulls the last 90 days of
 * Google Search Console queries for the site and keeps the ones
 * phrased as questions (who / what / how much / does … / vs / cost),
 * each with the page it currently lands on, impressions, clicks and
 * average position. That list is the FAQ brief: every question with
 * impressions and no direct answer on its landing page is a FAQ item
 * (sectionFaq) waiting to be written, and the H2 to give it.
 *
 *   node scripts/aeo-queries.mjs
 *     GSC_SERVICE_ACCOUNT_JSON  the service-account key file's JSON
 *                               (an Actions secret). The account's
 *                               email must be added as a user — Full
 *                               or Restricted — on the Search Console
 *                               property.
 *     GSC_SITE_URL              the property, e.g. sc-domain:methodhomes.net
 *                               or https://method-homes.vercel.app/
 *
 * Writes src/design/aeo.queries.json for the Studio's AEO tool
 * ("Questions people already ask"). Without credentials it leaves an
 * existing real run untouched and records why it did not run.
 * Runs from aeo.yml after the grade. No third-party packages: the
 * service-account JWT is signed with node:crypto.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createSign } from "node:crypto";
import path from "node:path";

const OUT = path.join(process.cwd(), "src/design/aeo.queries.json");
const DAYS = 90;
const QUESTION_RE =
  /^(who|whom|whose|what|what's|when|where|why|how|which|can|could|do|does|did|is|are|was|were|should|will|would)\b|\b(cost|costs|price|prices|pricing|vs\.?|versus|near me|worth it|per (sq|square) ?f(oo)?t)\b/i;

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error(`token ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).access_token;
}

async function searchAnalytics(token, siteUrl, body) {
  const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`searchAnalytics ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).rows ?? [];
}

const iso = (d) => d.toISOString().slice(0, 10);
const r1 = (n) => Math.round(n * 10) / 10;
const pathOf = (url) => {
  try {
    return new URL(url).pathname.replace(/\/$/, "") || "/";
  } catch {
    return url;
  }
};

function skip(reason) {
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
  if (prev?.ran) {
    console.log(`aeo-queries: ${reason} — keeping the previous run (${prev.generatedAt})`);
    return;
  }
  writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), ran: false, reason, questions: [], top: [] }, null, 2) + "\n");
  console.log(`aeo-queries: ${reason}`);
}

async function main() {
  const raw = process.env.GSC_SERVICE_ACCOUNT_JSON;
  const siteUrl = process.env.GSC_SITE_URL;
  if (!raw || !siteUrl) return skip("not configured — set GSC_SERVICE_ACCOUNT_JSON and GSC_SITE_URL (Actions secrets) and add the service account as a Search Console user");

  let sa;
  try {
    sa = JSON.parse(raw);
  } catch {
    return skip("GSC_SERVICE_ACCOUNT_JSON is not valid JSON");
  }

  const end = new Date(Date.now() - 3 * 86400e3); /* GSC data lags ~3 days */
  const start = new Date(end.getTime() - DAYS * 86400e3);
  const range = { startDate: iso(start), endDate: iso(end) };

  const token = await accessToken(sa);
  const rows = await searchAnalytics(token, siteUrl, { ...range, dimensions: ["query", "page"], rowLimit: 5000, dataState: "final" });

  const totals = rows.reduce((a, r) => ({ clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions }), { clicks: 0, impressions: 0 });

  /* one row per query: the page with the most impressions is where
     the question currently lands */
  const byQuery = new Map();
  for (const r of rows) {
    const [query, page] = r.keys;
    const q = byQuery.get(query) ?? { query, clicks: 0, impressions: 0, positionSum: 0, pages: new Map() };
    q.clicks += r.clicks;
    q.impressions += r.impressions;
    q.positionSum += r.position * r.impressions;
    q.pages.set(page, (q.pages.get(page) ?? 0) + r.impressions);
    byQuery.set(query, q);
  }
  const flat = [...byQuery.values()]
    .map((q) => ({
      query: q.query,
      clicks: q.clicks,
      impressions: q.impressions,
      ctr: q.impressions ? r1((q.clicks / q.impressions) * 1000) / 10 : 0,
      position: q.impressions ? r1(q.positionSum / q.impressions) : null,
      page: pathOf([...q.pages.entries()].sort((a, b) => b[1] - a[1])[0][0]),
    }))
    .sort((a, b) => b.impressions - a.impressions);

  const questions = flat.filter((q) => QUESTION_RE.test(q.query)).slice(0, 150);
  const top = flat.slice(0, 40);

  /* group the questions by landing page so a page's FAQ brief reads
     as one list */
  const byPage = {};
  for (const q of questions) (byPage[q.page] ??= []).push(q.query);

  const report = {
    generatedAt: new Date().toISOString(),
    ran: true,
    siteUrl,
    range,
    totals: { ...totals, queries: flat.length, questionQueries: questions.length },
    questions,
    byPage,
    top,
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log(`aeo-queries: ${flat.length} queries, ${questions.length} question-form, ${totals.impressions} impressions over ${DAYS} days`);
}

main().catch((err) => {
  console.error(`aeo-queries: ${err.message}`);
  skip(`failed — ${err.message.slice(0, 200)}`);
});

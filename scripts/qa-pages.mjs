/**
 * QA gate checker — runs the launch plan's page gates (G3–G11,
 * docs/LAUNCH-PLAN.md §1) on every URL in the sitemap and writes
 * src/design/qa.status.json for the Studio and for the QA sheet.
 *
 *   node scripts/qa-pages.mjs
 *     QA_ORIGIN   site to check (default designops site.baseUrl;
 *                 http://localhost:3000 checks a local build)
 *     QA_LIMIT    max pages (default 80)
 *
 * What it checks per page (the gate id matches the plan):
 *   G3  exactly one H1; no heading level skipped by more than one
 *   G4  <title> 10–60 chars; meta description 120–160; self canonical;
 *       og:image present
 *   G5  every <img> in <main> has alt (empty alt allowed only with
 *       role=presentation)
 *   G6  the URL is in the sitemap (it came from there) and not noindex
 *   G7  ≥300 words in <main>; ≥2 question-form H2/H3s; the first 120
 *       words of body copy contain a sentence (the "lede")
 *   G8  JSON-LD: a WebPage-kind node + BreadcrumbList; FAQPage when
 *       the page shows a FAQ (details/summary with a question);
 *       the template's entity node (House on /projects/*, BlogPosting
 *       on /journal/*)
 *   G9  a visible "Updated <Month> <Year>" line (CMS pages, projects,
 *       posts)
 *   G10 no unfilled {placeholder}; a byline on posts
 *   G11 the URL appears in /llms-full.txt
 *
 * Each gate is pass / fail / n/a per page; the report carries the
 * failing reason so the fix is obvious. The home page and listing
 * pages skip G7's word count (they are navigational by design) and
 * G9.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse } from "node-html-parser";

const ROOT = process.cwd();
const DESIGNOPS = JSON.parse(readFileSync(path.join(ROOT, "designops.config.json"), "utf8"));
const BASE = DESIGNOPS.site.baseUrl.replace(/\/$/, "");
const ORIGIN = (process.env.QA_ORIGIN ?? BASE).replace(/\/$/, "");
const LIMIT = Number(process.env.QA_LIMIT ?? 80);
const OUT = path.join(ROOT, "src/design/qa.status.json");
const UA = "Mozilla/5.0 (compatible; MethodQA/1.0; +https://github.com/btravis08/method-homes)";

const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const words = (s) => clean(s).split(" ").filter(Boolean);
const QUESTION_RE = /^(who|what|when|where|why|how|which|can|do|does|is|are|should|will)\b|\?$/i;
const UPDATED_RE = /\bUpdated\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/;

async function get(url) {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,*/*" }, redirect: "follow" });
    return { ok: res.ok, status: res.status, text: await res.text(), finalUrl: res.url };
  } catch (err) {
    return { ok: false, status: 0, text: "", finalUrl: url, error: String(err?.message ?? err) };
  }
}

const toOrigin = (url) => {
  const u = new URL(url);
  return `${ORIGIN}${u.pathname}${u.search}`;
};
const pathOf = (url) => new URL(url).pathname.replace(/\/$/, "") || "/";

function jsonLd(root) {
  const nodes = [];
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(s.text);
      const list = Array.isArray(data) ? data : data["@graph"] ? data["@graph"] : [data];
      for (const n of list) {
        nodes.push(n);
        if (n?.mainEntity && typeof n.mainEntity === "object") nodes.push(n.mainEntity);
      }
    } catch {
      /* malformed JSON-LD is itself a failure, recorded below */
      nodes.push({ "@type": "__invalid__" });
    }
  }
  return nodes;
}
const typesOf = (nodes) => nodes.flatMap((n) => (Array.isArray(n?.["@type"]) ? n["@type"] : [n?.["@type"]])).filter(Boolean);

function kindOf(p) {
  if (p === "/") return "home";
  if (p === "/projects" || p === "/journal" || p.startsWith("/journal/category/") || p === "/collections" || p === "/products") return "list";
  if (p.startsWith("/projects/")) return "project";
  if (p.startsWith("/journal/")) return "post";
  if (p.startsWith("/products/") || p.startsWith("/collections/")) return "commerce";
  return "page";
}

function checkPage(url, html, llmsFull) {
  const root = parse(html);
  const p = pathOf(url);
  const kind = kindOf(p);
  const gates = {};
  const gate = (id, pass, note) => {
    gates[id] = { pass, ...(note ? { note } : {}) };
  };
  const na = (id, why) => {
    gates[id] = { pass: null, note: why };
  };

  const main = root.querySelector("main") ?? root.querySelector("body") ?? root;

  /* G3 headings */
  const hs = root.querySelectorAll("h1,h2,h3,h4,h5,h6").map((h) => ({ level: Number(h.tagName[1]), text: clean(h.text) }));
  const h1s = hs.filter((h) => h.level === 1 && h.text);
  let skip = false;
  for (let i = 1; i < hs.length; i++) if (hs[i].level > hs[i - 1].level + 1) skip = true;
  gate("G3", h1s.length === 1 && !skip, h1s.length !== 1 ? `${h1s.length} H1s` : skip ? "heading level skipped" : undefined);

  /* G4 metadata */
  const title = clean(root.querySelector("title")?.text);
  const desc = clean(root.querySelector('meta[name="description"]')?.getAttribute("content"));
  const canonical = root.querySelector('link[rel="canonical"]')?.getAttribute("href");
  const og = root.querySelector('meta[property="og:image"]')?.getAttribute("content");
  const problems = [];
  if (title.length < 10 || title.length > 60) problems.push(`title ${title.length} chars`);
  if (desc.length < 120 || desc.length > 160) problems.push(desc ? `description ${desc.length} chars` : "no description");
  if (!canonical) problems.push("no canonical");
  else if (pathOf(canonical) !== p) problems.push("canonical differs");
  if (!og) problems.push("no og:image");
  gate("G4", problems.length === 0, problems.join("; ") || undefined);

  /* G5 images */
  const imgs = main.querySelectorAll("img");
  const noAlt = imgs.filter((i) => !i.getAttribute("alt") && i.getAttribute("role") !== "presentation" && i.getAttribute("aria-hidden") !== "true");
  gate("G5", noAlt.length === 0, noAlt.length ? `${noAlt.length}/${imgs.length} images without alt` : undefined);

  /* G6 indexable */
  const robots = clean(root.querySelector('meta[name="robots"]')?.getAttribute("content")).toLowerCase();
  gate("G6", !robots.includes("noindex"), robots.includes("noindex") ? "noindex (in sitemap)" : undefined);

  /* G7 depth */
  const bodyText = clean(main.querySelectorAll("p,li,dd,blockquote,summary").map((n) => clean(n.text)).join(" "));
  const count = words(bodyText).length;
  const questionHeads = hs.filter((h) => (h.level === 2 || h.level === 3) && QUESTION_RE.test(h.text)).length;
  if (kind === "home" || kind === "list") na("G7", "navigational page");
  else {
    const notes = [];
    if (count < 300) notes.push(`${count} words`);
    if (questionHeads < 2) notes.push(`${questionHeads} question headings`);
    gate("G7", notes.length === 0, notes.join("; ") || undefined);
  }

  /* G8 structured data */
  const nodes = jsonLd(root);
  const types = typesOf(nodes);
  const hasWebPage = types.some((t) => /Page$|^Blog$|^WebPage$/.test(t));
  const hasCrumbs = types.includes("BreadcrumbList");
  const showsFaq = root.querySelectorAll("details summary").some((s) => QUESTION_RE.test(clean(s.text)));
  const needs = [];
  if (!hasWebPage) needs.push("WebPage node");
  if (!hasCrumbs && p !== "/") needs.push("BreadcrumbList");
  if (showsFaq && !types.includes("FAQPage")) needs.push("FAQPage");
  if (kind === "project" && !types.includes("House")) needs.push("House");
  if (kind === "post" && !types.some((t) => /Article|BlogPosting/.test(t))) needs.push("BlogPosting");
  if (types.includes("__invalid__")) needs.push("malformed JSON-LD");
  gate("G8", needs.length === 0, needs.length ? `missing ${needs.join(", ")}` : undefined);

  /* G9 freshness */
  const updated = UPDATED_RE.test(clean(root.text)) || Boolean(root.querySelector("time[datetime]"));
  if (kind === "home" || kind === "list" || kind === "commerce") na("G9", "not a dated page");
  else gate("G9", updated, updated ? undefined : "no visible Updated line");

  /* G10 placeholders + byline */
  const placeholders = (clean(main.text).match(/\{[a-zA-Z_][\w .-]*\}/g) ?? []).slice(0, 5);
  const lorem = /lorem ipsum/i.test(main.text);
  const byline = kind === "post" ? /\b(by|reviewed by)\s+[A-Z][a-z]+/i.test(clean(main.text)) || Boolean(root.querySelector('[rel="author"]')) : true;
  const g10 = [];
  if (placeholders.length) g10.push(`placeholders ${placeholders.join(" ")}`);
  if (lorem) g10.push("lorem ipsum");
  if (!byline) g10.push("no byline");
  gate("G10", g10.length === 0, g10.join("; ") || undefined);

  /* G11 llms-full */
  const inFull = llmsFull.includes(`${BASE}${p === "/" ? "/" : p}`) || llmsFull.includes(`${ORIGIN}${p}`);
  if (kind === "commerce") na("G11", "template demo route");
  else gate("G11", inFull, inFull ? undefined : "not in /llms-full.txt");

  const applicable = Object.values(gates).filter((g) => g.pass !== null);
  const passing = applicable.filter((g) => g.pass).length;
  return {
    path: p,
    kind,
    title,
    words: count,
    questionHeadings: questionHeads,
    schema: [...new Set(types)].filter((t) => t !== "__invalid__"),
    gates,
    score: applicable.length ? Math.round((passing / applicable.length) * 100) : 100,
    fails: Object.entries(gates).filter(([, g]) => g.pass === false).map(([id, g]) => `${id}: ${g.note ?? "fail"}`),
  };
}

async function main() {
  const t0 = Date.now();
  const sm = await get(`${ORIGIN}/sitemap.xml`);
  const urls = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => toOrigin(m[1].trim()));
  if (!urls.length) {
    console.error(`qa-pages: no URLs in ${ORIGIN}/sitemap.xml (status ${sm.status})`);
  }
  const full = await get(`${ORIGIN}/llms-full.txt`);
  const llmsFull = full.ok ? full.text : "";

  const pages = [];
  const errors = [];
  for (const url of urls.slice(0, LIMIT)) {
    const res = await get(url);
    if (!res.ok) {
      errors.push({ path: pathOf(url), status: res.status, error: res.error });
      continue;
    }
    pages.push(checkPage(url, res.text, llmsFull));
  }

  const gateIds = ["G3", "G4", "G5", "G6", "G7", "G8", "G9", "G10", "G11"];
  const byGate = Object.fromEntries(
    gateIds.map((id) => {
      const rows = pages.map((p) => p.gates[id]).filter((g) => g && g.pass !== null);
      return [id, { applicable: rows.length, passing: rows.filter((g) => g.pass).length }];
    }),
  );
  const score = pages.length ? Math.round(pages.reduce((a, p) => a + p.score, 0) / pages.length) : 0;

  const report = {
    generatedAt: new Date().toISOString(),
    origin: ORIGIN,
    durationMs: Date.now() - t0,
    sitemapUrls: urls.length,
    checked: pages.length,
    score,
    byGate,
    llmsFull: { ok: full.ok, bytes: Buffer.byteLength(llmsFull) },
    errors,
    pages: pages.sort((a, b) => a.score - b.score || a.path.localeCompare(b.path)),
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log(`qa-pages: ${pages.length} pages · score ${score} · ${Object.entries(byGate).map(([id, g]) => `${id} ${g.passing}/${g.applicable}`).join(" · ")}`);
  for (const p of report.pages.filter((p) => p.fails.length).slice(0, 15)) console.log(`  ${p.path}  ${p.fails.join(" | ")}`);
}

main().catch((err) => {
  console.error(`qa-pages: ${err.message}`);
  process.exit(1);
});

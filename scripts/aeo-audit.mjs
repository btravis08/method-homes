/**
 * AEO audit — grades the site for answer engines (ChatGPT, Perplexity,
 * Gemini, Claude) the way Webflow AEO does: four pillars — Content,
 * Technical, Authority, Measurement — rolled into a 0–100 score and a
 * 1–5 maturity level, with a ranked list of recommendations (impact ×
 * effort) and the per-page evidence behind each one.
 *
 * The data source for the Studio's "AEO" tool and the Overview card.
 *
 *   node scripts/aeo-audit.mjs
 *     AEO_ORIGIN         site to crawl (default designops site.baseUrl;
 *                        http://localhost:3000 grades a local build)
 *     ANTHROPIC_API_KEY  enables prompt insights (lib/aeo-prompts.mjs)
 *     AEO_SKIP_PROMPTS=1 skip prompt insights even with a key
 *
 * Writes src/design/aeo.status.json (the full report) and appends a
 * snapshot to src/design/aeo.history.json. Runs nightly from the
 * aeo.yml workflow (the sandbox can't reach vercel.app).
 *
 * How it grades: every check has a pillar, a relative weight and an
 * effort. Page checks run on every crawled page they apply to and
 * contribute their average pass ratio; site checks run once. A pillar
 * is the weighted pass ratio of its checks (0–100); the site score is
 * the pillar scores weighted by designops aeo.pillarWeights. Levels:
 * <20 → 1 · <40 → 2 · <60 → 3 · <80 → 4 · else 5 (Webflow's maturity
 * index found the average company at 2 of 5).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse } from "node-html-parser";

import { runPromptInsights } from "./lib/aeo-prompts.mjs";

const ROOT = process.cwd();
const DESIGNOPS = JSON.parse(readFileSync(path.join(ROOT, "designops.config.json"), "utf8"));
const AEO = DESIGNOPS.aeo;
const BASE = DESIGNOPS.site.baseUrl.replace(/\/$/, "");
const ORIGIN = (process.env.AEO_ORIGIN ?? BASE).replace(/\/$/, "");
const BASE_HOST = new URL(BASE).host;
const ORIGIN_HOST = new URL(ORIGIN).host;
const OUT = path.join(ROOT, "src/design/aeo.status.json");
const HISTORY = path.join(ROOT, "src/design/aeo.history.json");
const UA = "Mozilla/5.0 (compatible; MethodAEO/1.0; +https://github.com/btravis08/method-homes)";
const FRESH_MS = (AEO.freshnessDays ?? 180) * 86400e3;
const BRAND_RE = new RegExp(AEO.brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

/* ── fetching ────────────────────────────────────────────────────── */

async function get(url, { timeoutMs = 25000, method = "GET" } = {}) {
  const t0 = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method, redirect: "follow", headers: { "user-agent": UA, accept: "text/html,*/*" }, signal: ctrl.signal });
    const ttfb = Math.round(performance.now() - t0);
    const text = method === "HEAD" ? "" : await res.text();
    return { ok: res.ok, status: res.status, ttfb, bytes: Buffer.byteLength(text), text, finalUrl: res.url, type: res.headers.get("content-type") ?? "" };
  } catch (err) {
    return { ok: false, status: 0, ttfb: Math.round(performance.now() - t0), bytes: 0, text: "", finalUrl: url, type: "", error: String(err?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}

/* sitemap URLs point at the production host; when crawling a local
   build, rewrite them onto the origin under test */
const localize = (url) => {
  try {
    const u = new URL(url);
    if (u.host === BASE_HOST && ORIGIN_HOST !== BASE_HOST) return `${ORIGIN}${u.pathname}${u.search}`;
    return u.toString();
  } catch {
    return url;
  }
};
const isInternal = (url) => {
  try {
    const h = new URL(url).host;
    return h === BASE_HOST || h === ORIGIN_HOST;
  } catch {
    return false;
  }
};
const pathOf = (url) => {
  try {
    const u = new URL(url);
    return u.pathname.replace(/\/$/, "") || "/";
  } catch {
    return url;
  }
};

/* ── robots.txt ──────────────────────────────────────────────────── */

function parseRobots(text) {
  const groups = []; // { agents: [], allow: [], disallow: [] }
  let cur = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) cur = { agents: [], allow: [], disallow: [] }, groups.push(cur);
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!cur) continue;
      if (key === "allow") cur.allow.push(val);
      if (key === "disallow") cur.disallow.push(val);
    }
  }
  return groups;
}

/* a bot may read the site when its own group (else `*`) does not
   disallow the root */
function botAccess(groups, bot) {
  const own = groups.find((g) => g.agents.includes(bot.toLowerCase()));
  const star = groups.find((g) => g.agents.includes("*"));
  const g = own ?? star;
  if (!g) return { bot, allowed: true, explicit: false, rule: "no rules" };
  const blocked = g.disallow.some((p) => p === "/" || p === "/*");
  return { bot, allowed: !blocked, explicit: Boolean(own), rule: blocked ? "Disallow: /" : own ? "named, allowed" : "falls under *" };
}

/* ── page analysis ───────────────────────────────────────────────── */

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "NAV", "FOOTER", "HEADER", "FORM", "BUTTON", "SELECT"]);

function textOf(node, out = []) {
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      out.push(child.rawText);
    } else if (child.nodeType === 1) {
      if (SKIP_TAGS.has(child.tagName)) continue;
      if (child.getAttribute("aria-hidden") === "true" || child.getAttribute("role") === "dialog") continue;
      textOf(child, out);
    }
  }
  return out;
}
const clean = (s) => (s ?? "").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim();
const words = (s) => clean(s).split(/\s+/).filter(Boolean);

function pageType(p) {
  if (p === "/") return "home";
  if (/^\/journal\/category\//.test(p)) return "category";
  if (/^\/journal\/[^/]+$/.test(p)) return "post";
  if (p === "/journal" || p === "/projects") return "index";
  if (/^\/projects\/[^/]+$/.test(p)) return "project";
  if (/^\/products\//.test(p)) return "product";
  if (/^\/collections\//.test(p)) return "collection";
  return "page";
}

function flattenLd(node, out) {
  if (!node) return out;
  if (Array.isArray(node)) {
    node.forEach((n) => flattenLd(n, out));
    return out;
  }
  if (typeof node === "object") {
    if (node["@graph"]) flattenLd(node["@graph"], out);
    if (node["@type"]) out.push(node);
  }
  return out;
}

function analyze(url, res, lastmod) {
  const p = pathOf(url);
  const type = pageType(p);
  const html = res.text;
  const root = parse(html, { blockTextElements: { script: true, noscript: true, style: true, pre: false } });
  const meta = (sel) => clean(root.querySelector(sel)?.getAttribute("content"));
  const main = root.querySelector("main") ?? root.querySelector("body") ?? root;

  const headingsAll = root.querySelectorAll("h1,h2,h3,h4,h5,h6").map((h) => ({ level: Number(h.tagName[1]), text: clean(h.text), inMain: Boolean(h.closest?.("main")) }));
  const headings = headingsAll.filter((h) => h.inMain || type === "home");
  const h1s = headingsAll.filter((h) => h.level === 1 && h.text);

  const mainText = clean(textOf(main).join(" "));
  const wordCount = words(mainText).length;
  const paragraphs = main.querySelectorAll("p").map((n) => clean(n.text)).filter((t) => words(t).length >= 25);
  const firstAnswer = paragraphs[0] ?? "";
  const firstIdx = firstAnswer ? mainText.indexOf(firstAnswer.slice(0, 60)) : -1;
  const wordsBeforeAnswer = firstIdx >= 0 ? words(mainText.slice(0, firstIdx)).length : Infinity;
  const sentences = mainText.split(/(?<=[.!?])\s+/).filter((s) => words(s).length > 2);
  const avgSentence = sentences.length ? wordCount / sentences.length : 0;
  const lists = main.querySelectorAll("ul,ol,table,dl").length;

  const imgs = main.querySelectorAll("img").filter((i) => i.getAttribute("role") !== "presentation");
  const imgsWithAlt = imgs.filter((i) => i.hasAttribute("alt"));

  const anchors = main.querySelectorAll("a[href]");
  const internal = new Map();
  let external = 0;
  for (const a of anchors) {
    const href = a.getAttribute("href") ?? "";
    if (/^(#|mailto:|tel:|javascript:)/.test(href)) continue;
    let abs;
    try {
      abs = new URL(href, url).toString();
    } catch {
      continue;
    }
    if (isInternal(abs)) {
      const key = pathOf(abs);
      if (key !== p && !/^\/(studio|api|library)(\/|$)/.test(key)) internal.set(key, clean(a.text) || internal.get(key) || "");
    } else external++;
  }
  const genericAnchors = [...internal.values()].filter((t) => /^(learn more|read more|click here|here|more|view|see more|view all|shop|go)$/i.test(t)).length;

  const ld = [];
  const ldErrors = [];
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      flattenLd(JSON.parse(s.text), ld);
    } catch (e) {
      ldErrors.push(String(e.message).slice(0, 80));
    }
  }
  const ldTypes = [...new Set(ld.flatMap((n) => (Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]])))];
  const ldHas = (t) => ldTypes.includes(t);
  const org = ld.find((n) => ["Organization", "LocalBusiness", "HomeAndConstructionBusiness", "GeneralContractor"].some((t) => (Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]]).includes(t)));
  const article = ld.find((n) => ["Article", "BlogPosting", "NewsArticle"].some((t) => (Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]]).includes(t)));

  const dates = [
    article?.dateModified,
    article?.datePublished,
    meta('meta[property="article:modified_time"]'),
    meta('meta[property="article:published_time"]'),
    ...root.querySelectorAll("time[datetime]").map((t) => t.getAttribute("datetime")),
    lastmod,
  ]
    .map((d) => (d ? Date.parse(d) : NaN))
    .filter((n) => Number.isFinite(n));
  const newest = dates.length ? Math.max(...dates) : null;

  const authorLd = article?.author;
  const authorName = clean(
    (Array.isArray(authorLd) ? authorLd[0]?.name : authorLd?.name) ??
      meta('meta[name="author"]') ??
      root.querySelector('[rel="author"], .byline, [data-author]')?.text,
  );

  const questionHeadings = headings.filter((h) => h.level >= 2 && /\?\s*$/.test(h.text));
  const faqSchema = ldHas("FAQPage");

  /* hierarchy: a heading may step down at most one level from the one before it */
  const seq = headings.map((h) => h.level);
  let skips = 0;
  for (let i = 1; i < seq.length; i++) if (seq[i] > seq[i - 1] + 1) skips++;

  const first200 = words(mainText).slice(0, 200).join(" ");
  const title = clean(root.querySelector("title")?.text);
  const description = meta('meta[name="description"]');
  const robotsMeta = meta('meta[name="robots"]');

  return {
    path: p,
    type,
    status: res.status,
    ttfb: res.ttfb,
    bytes: res.bytes,
    title,
    titleLen: title.length,
    description,
    descriptionLen: description.length,
    canonical: root.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "",
    lang: root.querySelector("html")?.getAttribute("lang") ?? "",
    viewport: Boolean(root.querySelector('meta[name="viewport"]')),
    noindex: /noindex/i.test(robotsMeta),
    og: { title: Boolean(meta('meta[property="og:title"]')), description: Boolean(meta('meta[property="og:description"]')), image: Boolean(meta('meta[property="og:image"]')) },
    h1: h1s.map((h) => h.text),
    headings: headings.length,
    headingSkips: skips,
    questionHeadings: questionHeadings.length,
    landmarks: { main: Boolean(root.querySelector("main")), nav: Boolean(root.querySelector("nav")), header: Boolean(root.querySelector("header")), footer: Boolean(root.querySelector("footer")) },
    wordCount,
    avgSentence: Math.round(avgSentence * 10) / 10,
    lists,
    answerFirst: { words: words(firstAnswer).length, before: wordsBeforeAnswer, excerpt: firstAnswer.slice(0, 160) },
    brandSpots: [title, h1s[0]?.text ?? "", first200].filter((s) => BRAND_RE.test(s)).length,
    images: { total: imgs.length, withAlt: imgsWithAlt.length },
    internalLinks: internal.size,
    genericAnchors,
    externalLinks: external,
    internalPaths: [...internal.keys()],
    ld: { count: ld.length, types: ldTypes, errors: ldErrors, org: org ? { sameAs: Array.isArray(org.sameAs) ? org.sameAs.length : 0, address: Boolean(org.address), telephone: Boolean(org.telephone), logo: Boolean(org.logo) } : null, article: article ? { author: Boolean(article.author), datePublished: Boolean(article.datePublished), dateModified: Boolean(article.dateModified) } : null },
    faqSchema,
    newest: newest ? new Date(newest).toISOString() : null,
    author: authorName || null,
    analytics: { web: /\/_vercel\/insights|googletagmanager|gtag\(|plausible\.io|cdn\.segment|analytics\.js/.test(html), rum: /\/_vercel\/speed-insights/.test(html) },
    referrerTracking: meta('meta[name="ai-referrer-tracking"]') || null,
  };
}

/* ── the rubric ──────────────────────────────────────────────────── */

const CONTENT_TYPES = new Set(["home", "post", "page", "project"]);
const ratio = (ok, total) => (total ? ok / total : 1);
const pct = (n) => `${Math.round(n * 100)}%`;
const MIN_WORDS = { post: 400, page: 200, home: 200, project: 200, index: 80, category: 80, product: 80, collection: 80 };

/* { id, pillar, weight, effort, title, fix, scope, applies?, run } —
   run returns { ratio 0..1, detail } */
const CHECKS = [
  /* ── Technical: can an answer engine reach, parse and trust the page? ── */
  { id: "robots", pillar: "technical", weight: 2, effort: "low", scope: "site", title: "robots.txt present and parseable", fix: "Serve /robots.txt (Next: app/robots.ts) with a sitemap line.", run: (s) => ({ ratio: s.robots.ok ? 1 : 0, detail: s.robots.ok ? `${s.robots.groups.length} group(s)` : `HTTP ${s.robots.status}` }) },
  { id: "ai-bots", pillar: "technical", weight: 6, effort: "low", scope: "site", title: "AI crawlers allowed to read the site", fix: "Allow GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, Google-Extended and the other answer-engine crawlers in robots.txt — name them explicitly so intent is unambiguous.", run: (s) => { const ok = s.bots.filter((b) => b.allowed); return { ratio: ratio(ok.length, s.bots.length) * (s.bots.every((b) => b.explicit) ? 1 : 0.85), detail: `${ok.length}/${s.bots.length} allowed · ${s.bots.filter((b) => b.explicit).length} named` }; } },
  { id: "sitemap", pillar: "technical", weight: 3, effort: "low", scope: "site", title: "XML sitemap lists the site's pages", fix: "Serve /sitemap.xml from the CMS so every published page is discoverable.", run: (s) => ({ ratio: s.sitemap.urls.length ? 1 : 0, detail: `${s.sitemap.urls.length} URL(s)${s.sitemap.lastmod ? ", lastmod present" : ", no lastmod"}` }) },
  { id: "llms-txt", pillar: "technical", weight: 5, effort: "medium", scope: "site", title: "/llms.txt describes the site for language models", fix: "Publish /llms.txt (llmstxt.org): a one-paragraph summary, then the key pages with one-line descriptions, kept in sync with the CMS.", run: (s) => ({ ratio: s.llms.ok ? (s.llms.sections >= 2 ? 1 : 0.6) : 0, detail: s.llms.ok ? `${s.llms.bytes} bytes, ${s.llms.sections} section(s)` : `HTTP ${s.llms.status}` }) },
  { id: "https", pillar: "technical", weight: 1, effort: "low", scope: "site", title: "Served over HTTPS", fix: "Force HTTPS at the edge.", run: (s) => ({ ratio: s.https ? 1 : 0, detail: s.https ? "yes" : "no" }) },
  { id: "broken-links", pillar: "technical", weight: 3, effort: "medium", scope: "site", title: "Internal links resolve", fix: "Fix or redirect the broken internal links (CMS redirects document).", run: (s) => ({ ratio: 1 - ratio(s.links.broken.length, s.links.checked || 1), detail: `${s.links.broken.length} broken of ${s.links.checked} checked` }) },

  { id: "title", pillar: "technical", weight: 2, effort: "low", scope: "page", title: "Title tag, 15–65 characters", fix: "Give the page a specific title in the SEO fields (15–65 characters, brand suffix included).", run: (pg) => ({ ratio: pg.titleLen >= 15 && pg.titleLen <= 65 ? 1 : pg.titleLen ? 0.5 : 0, detail: pg.titleLen ? `${pg.titleLen} chars` : "missing" }) },
  { id: "description", pillar: "technical", weight: 3, effort: "low", scope: "page", title: "Meta description, 70–160 characters", fix: "Write a meta description that answers 'what is this page' in one or two sentences (70–160 characters).", run: (pg) => ({ ratio: pg.descriptionLen >= 70 && pg.descriptionLen <= 160 ? 1 : pg.descriptionLen ? 0.5 : 0, detail: pg.descriptionLen ? `${pg.descriptionLen} chars` : "missing" }) },
  { id: "canonical", pillar: "technical", weight: 2, effort: "low", scope: "page", title: "Canonical URL declared", fix: "Emit <link rel=canonical> on every page (seoMeta does this when the route uses it).", run: (pg) => ({ ratio: pg.canonical ? 1 : 0, detail: pg.canonical || "missing" }) },
  { id: "open-graph", pillar: "technical", weight: 2, effort: "low", scope: "page", title: "Open Graph title, description and image", fix: "Set og:title, og:description and a 1200×630 og:image so previews and answer cards render.", run: (pg) => ({ ratio: ratio([pg.og.title, pg.og.description, pg.og.image].filter(Boolean).length, 3), detail: `${[pg.og.title && "title", pg.og.description && "description", pg.og.image && "image"].filter(Boolean).join(", ") || "none"}` }) },
  { id: "indexable", pillar: "technical", weight: 1, effort: "low", scope: "page", title: "Page responds 200 and is indexable", fix: "Return 200 and drop noindex on pages that should be cited.", run: (pg) => ({ ratio: pg.status === 200 && !pg.noindex ? 1 : 0, detail: `${pg.status}${pg.noindex ? ", noindex" : ""}` }) },
  { id: "lang-viewport", pillar: "technical", weight: 1, effort: "low", scope: "page", title: "html lang and viewport declared", fix: "Set <html lang> and a viewport meta tag.", run: (pg) => ({ ratio: ratio([pg.lang, pg.viewport].filter(Boolean).length, 2), detail: `lang=${pg.lang || "–"}, viewport ${pg.viewport ? "yes" : "no"}` }) },
  { id: "h1", pillar: "technical", weight: 2, effort: "low", scope: "page", title: "Exactly one H1", fix: "One H1 per page naming the subject; demote the others.", run: (pg) => ({ ratio: pg.h1.length === 1 ? 1 : pg.h1.length ? 0.5 : 0, detail: `${pg.h1.length} H1` }) },
  { id: "heading-order", pillar: "technical", weight: 2, effort: "low", scope: "page", title: "Headings step down one level at a time", fix: "Don't jump from H2 to H4 — answer engines use the outline to segment the page.", run: (pg) => ({ ratio: pg.headings ? Math.max(0, 1 - pg.headingSkips / Math.max(1, pg.headings - 1)) : 1, detail: `${pg.headingSkips} skip(s) in ${pg.headings} headings` }) },
  { id: "landmarks", pillar: "technical", weight: 1, effort: "low", scope: "page", title: "Semantic landmarks (main, nav, header, footer)", fix: "Wrap page content in <main> and chrome in <nav>/<header>/<footer> so parsers can drop the chrome.", run: (pg) => ({ ratio: ratio(Object.values(pg.landmarks).filter(Boolean).length, 4), detail: Object.entries(pg.landmarks).filter(([, v]) => v).map(([k]) => k).join(", ") || "none" }) },
  { id: "jsonld", pillar: "technical", weight: 3, effort: "medium", scope: "page", title: "Valid JSON-LD structured data", fix: "Add a JSON-LD block per page (Organization/WebSite on the home page, Article on posts, Product on products, BreadcrumbList everywhere) and keep it parseable.", run: (pg) => ({ ratio: pg.ld.errors.length ? 0.3 : pg.ld.count ? 1 : 0, detail: pg.ld.errors.length ? `parse error: ${pg.ld.errors[0]}` : pg.ld.types.join(", ") || "none" }) },
  { id: "schema-type", pillar: "technical", weight: 3, effort: "medium", scope: "page", title: "Schema type matches the page", fix: "home → Organization + WebSite · post → Article/BlogPosting with author and dates · product → Product · project → CreativeWork/Article · others → WebPage.", run: (pg) => { const want = { home: ["Organization", "LocalBusiness", "WebSite"], post: ["Article", "BlogPosting", "NewsArticle"], product: ["Product"], project: ["CreativeWork", "Article", "House", "Residence", "WebPage"], collection: ["CollectionPage", "ItemList", "WebPage"], category: ["CollectionPage", "Blog", "WebPage"], index: ["CollectionPage", "Blog", "WebPage", "ItemList"], page: ["WebPage", "AboutPage", "ContactPage", "FAQPage", "Article"] }[pg.type] ?? ["WebPage"]; const hit = want.some((t) => pg.ld.types.includes(t)); return { ratio: hit ? 1 : 0, detail: hit ? pg.ld.types.filter((t) => want.includes(t)).join(", ") : `want ${want[0]}, have ${pg.ld.types.join(", ") || "none"}` }; } },
  { id: "alt-text", pillar: "technical", weight: 2, effort: "low", scope: "page", title: "Images carry alt text", fix: "Describe content images in alt; mark decorative ones alt=\"\".", applies: (pg) => pg.images.total > 0, run: (pg) => ({ ratio: ratio(pg.images.withAlt, pg.images.total), detail: `${pg.images.withAlt}/${pg.images.total}` }) },
  { id: "html-weight", pillar: "technical", weight: 2, effort: "medium", scope: "page", title: "HTML document under 300 KB", fix: "Trim inlined data (serialized props, oversized JSON-LD, base64) so crawlers with byte budgets read the whole page.", run: (pg) => ({ ratio: pg.bytes <= 300e3 ? 1 : pg.bytes <= 600e3 ? 0.5 : 0, detail: `${Math.round(pg.bytes / 1024)} KB` }) },
  { id: "ttfb", pillar: "technical", weight: 1, effort: "high", scope: "page", title: "Server responds within 800 ms", fix: "Cache/ISR the route; crawlers abandon slow origins.", run: (pg) => ({ ratio: pg.ttfb <= 800 ? 1 : pg.ttfb <= 1800 ? 0.5 : 0, detail: `${pg.ttfb} ms` }) },

  /* ── Content: is there a liftable answer here? ── */
  { id: "answer-first", pillar: "content", weight: 6, effort: "medium", scope: "page", title: "Direct answer in the first 200 words", fix: "Open with a 2–4 sentence paragraph that states what the page is about and answers its core question before any scene-setting.", applies: (pg) => CONTENT_TYPES.has(pg.type), run: (pg) => ({ ratio: pg.answerFirst.words >= 25 && pg.answerFirst.before <= 200 ? 1 : pg.answerFirst.words >= 25 ? 0.5 : 0, detail: pg.answerFirst.words ? `${pg.answerFirst.words}-word paragraph after ${Number.isFinite(pg.answerFirst.before) ? pg.answerFirst.before : "∞"} words` : "no paragraph ≥ 25 words" }) },
  { id: "question-headings", pillar: "content", weight: 4, effort: "medium", scope: "page", title: "Headings phrased as the questions people ask", fix: "Turn section headings into the question they answer ('How much does a Method home cost?') and answer it in the first sentence beneath.", applies: (pg) => pg.type === "post" || pg.type === "page", run: (pg) => ({ ratio: pg.questionHeadings >= 2 ? 1 : pg.questionHeadings === 1 ? 0.6 : 0, detail: `${pg.questionHeadings} question heading(s)` }) },
  { id: "faq", pillar: "content", weight: 4, effort: "medium", scope: "page", title: "FAQ block with FAQPage schema", fix: "Add a short FAQ (3–6 real questions) to key pages and emit FAQPage JSON-LD for it.", applies: (pg) => ["home", "page", "post"].includes(pg.type), run: (pg) => ({ ratio: pg.faqSchema ? 1 : pg.questionHeadings >= 2 ? 0.5 : 0, detail: pg.faqSchema ? "FAQPage schema" : pg.questionHeadings >= 2 ? "Q&A headings, no schema" : "none" }) },
  { id: "depth", pillar: "content", weight: 4, effort: "high", scope: "page", title: "Enough substance to be worth citing", fix: "Expand thin pages: real specifics (sizes, timelines, prices, process) rather than taglines.", run: (pg) => { const min = MIN_WORDS[pg.type] ?? 150; return { ratio: Math.min(1, pg.wordCount / min), detail: `${pg.wordCount} words (target ${min})` }; } },
  { id: "readability", pillar: "content", weight: 3, effort: "medium", scope: "page", title: "Sentences average 25 words or fewer", fix: "Shorten long sentences; answer engines lift short declarative ones.", applies: (pg) => pg.wordCount >= 80, run: (pg) => ({ ratio: pg.avgSentence <= 25 ? 1 : pg.avgSentence <= 32 ? 0.5 : 0, detail: `${pg.avgSentence} words/sentence` }) },
  { id: "structures", pillar: "content", weight: 2, effort: "low", scope: "page", title: "Lists or tables to extract from", fix: "Put specs, steps and comparisons in lists or tables — they are quoted verbatim.", applies: (pg) => CONTENT_TYPES.has(pg.type), run: (pg) => ({ ratio: pg.lists ? 1 : 0, detail: `${pg.lists} list(s)/table(s)` }) },
  { id: "entity-clarity", pillar: "content", weight: 3, effort: "low", scope: "page", title: "Brand named in title, H1 or opening", fix: `Name "${AEO.brand}" in the title, H1 or first paragraph so the answer attributes the fact to you.`, applies: (pg) => CONTENT_TYPES.has(pg.type), run: (pg) => ({ ratio: pg.brandSpots >= 2 ? 1 : pg.brandSpots === 1 ? 0.6 : 0, detail: `${pg.brandSpots}/3 spots` }) },
  { id: "internal-links", pillar: "content", weight: 4, effort: "medium", scope: "page", title: "Descriptive internal links to related pages", fix: "Link each page to 3+ related pages with anchor text that says what's there (not 'learn more').", run: (pg) => ({ ratio: Math.min(1, pg.internalLinks / 3) * (pg.internalLinks ? 1 - 0.5 * ratio(pg.genericAnchors, pg.internalLinks) : 1), detail: `${pg.internalLinks} internal, ${pg.genericAnchors} generic anchor(s)` }) },
  { id: "freshness", pillar: "content", weight: 5, effort: "medium", scope: "page", title: `Updated within ${AEO.freshnessDays} days (dateModified / lastmod)`, fix: "Expose dateModified in Article schema and <lastmod> in the sitemap, and revisit key pages at least twice a year.", applies: (pg) => CONTENT_TYPES.has(pg.type), run: (pg) => { if (!pg.newest) return { ratio: 0, detail: "no date signal" }; const age = Date.now() - Date.parse(pg.newest); return { ratio: age <= FRESH_MS ? 1 : age <= FRESH_MS * 2 ? 0.5 : 0.2, detail: `${Math.round(age / 86400e3)} days` }; } },

  /* ── Authority: can a model tell who is speaking and trust them? ── */
  { id: "organization", pillar: "authority", weight: 4, effort: "low", scope: "site", title: "Organization schema on the home page", fix: "Emit Organization (or LocalBusiness) JSON-LD on the home page with name, url, logo, description.", run: (s) => ({ ratio: s.home?.ld.org ? 1 : 0, detail: s.home?.ld.org ? `logo ${s.home.ld.org.logo ? "yes" : "no"}` : "none" }) },
  { id: "same-as", pillar: "authority", weight: 3, effort: "low", scope: "site", title: "Organization sameAs links the brand's other profiles", fix: "List the official Instagram, LinkedIn, Houzz, Wikipedia etc. URLs in Organization.sameAs so engines merge mentions into one entity.", run: (s) => { const n = s.home?.ld.org?.sameAs ?? 0; return { ratio: n >= 3 ? 1 : n ? 0.5 : 0, detail: `${n} profile(s)` }; } },
  { id: "nap", pillar: "authority", weight: 2, effort: "low", scope: "site", title: "Address and phone in the Organization schema", fix: "Add postalAddress and telephone to the Organization JSON-LD (matches the site footer).", run: (s) => ({ ratio: ratio([s.home?.ld.org?.address, s.home?.ld.org?.telephone].filter(Boolean).length, 2), detail: `${s.home?.ld.org?.address ? "address" : "no address"}, ${s.home?.ld.org?.telephone ? "phone" : "no phone"}` }) },
  { id: "about-contact", pillar: "authority", weight: 2, effort: "low", scope: "site", title: "About and contact pages linked from the site", fix: "Publish and link /about and a contact path — models verify who you are there.", run: (s) => { const all = new Set(s.pages.flatMap((p) => p.internalPaths)); const about = [...all].some((p) => /about|team|company|story/.test(p)); const contact = [...all].some((p) => /contact|get-started|inquire/.test(p)); return { ratio: ratio([about, contact].filter(Boolean).length, 2), detail: `${about ? "about" : "no about"}, ${contact ? "contact" : "no contact"}` }; } },
  { id: "bylines", pillar: "authority", weight: 3, effort: "medium", scope: "page", title: "Articles carry a named author", fix: "Attach an author (name, role) to every post and emit it as Article.author in JSON-LD.", applies: (pg) => pg.type === "post", run: (pg) => ({ ratio: pg.author ? (pg.ld.article?.author ? 1 : 0.6) : 0, detail: pg.author ? `${pg.author}${pg.ld.article?.author ? " (schema)" : " (visible only)"}` : "none" }) },
  { id: "references", pillar: "authority", weight: 2, effort: "medium", scope: "page", title: "Articles cite outside sources", fix: "Link to the studies, codes and partners you reference — cited content gets cited.", applies: (pg) => pg.type === "post", run: (pg) => ({ ratio: pg.externalLinks ? 1 : 0, detail: `${pg.externalLinks} external link(s)` }) },

  /* ── Measurement: do we know how AI sees us? ── */
  { id: "monitoring", pillar: "measurement", weight: 3, effort: "low", scope: "site", title: "This grader runs on a schedule", fix: "Keep the aeo workflow on its nightly schedule so the trend is real.", run: (s) => ({ ratio: s.historyRuns >= 2 ? 1 : 0.5, detail: `${s.historyRuns} run(s) recorded` }) },
  { id: "prompt-insights", pillar: "measurement", weight: 5, effort: "low", scope: "site", title: "Tracked prompts probed for mentions and citations", fix: "Set ANTHROPIC_API_KEY as an Actions secret and keep aeo.prompts current — this is the visibility score and citation rate.", run: (s) => ({ ratio: s.prompts.ran ? 1 : 0, detail: s.prompts.ran ? `visibility ${s.prompts.visibility}%, cited ${s.prompts.citationRate}% of ${s.prompts.answered}` : s.prompts.reason }) },
  { id: "analytics", pillar: "measurement", weight: 4, effort: "low", scope: "site", title: "Web analytics on the site", fix: "Enable Vercel Web Analytics (or GA4) so AI-referred sessions can be segmented by referrer.", run: (s) => ({ ratio: s.analytics.web ? 1 : s.analytics.rum ? 0.4 : 0, detail: s.analytics.web ? "web analytics" : s.analytics.rum ? "Speed Insights only" : "none" }) },
  { id: "ai-referrers", pillar: "measurement", weight: 3, effort: "medium", scope: "site", title: "AI-referred visitors tracked", fix: "Record chatgpt.com, perplexity.ai, claude.ai, gemini.google.com, copilot.microsoft.com referrers on sessions, not only on form leads.", run: (s) => ({ ratio: s.referrerTracking === "visits" ? 1 : s.referrerTracking ? 0.5 : 0, detail: s.referrerTracking ? `on ${s.referrerTracking}` : "none" }) },
];

const EFFORT_FACTOR = { low: 1, medium: 1.6, high: 2.5 };
const level = (score) => (score < 20 ? 1 : score < 40 ? 2 : score < 60 ? 3 : score < 80 ? 4 : 5);
const LEVEL_NAMES = { 1: "Invisible", 2: "Emerging", 3: "Developing", 4: "Established", 5: "Leading" };

/* ── main ────────────────────────────────────────────────────────── */

async function main() {
  console.log(`AEO audit → ${ORIGIN}`);
  const [robotsRes, sitemapRes, llmsRes] = await Promise.all([get(`${ORIGIN}/robots.txt`), get(`${ORIGIN}/sitemap.xml`), get(`${ORIGIN}/llms.txt`)]);

  const groups = robotsRes.ok ? parseRobots(robotsRes.text) : [];
  const bots = AEO.bots.map((b) => botAccess(groups, b));

  const lastmods = new Map();
  let urls = [];
  if (sitemapRes.ok) {
    for (const m of sitemapRes.text.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const loc = m[1].match(/<loc>\s*([^<\s]+)\s*<\/loc>/)?.[1];
      const lm = m[1].match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/)?.[1];
      if (loc) {
        urls.push(loc);
        if (lm) lastmods.set(pathOf(loc), lm);
      }
    }
    /* sitemap index → first child sitemap */
    if (!urls.length) {
      for (const m of sitemapRes.text.matchAll(/<sitemap>[\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
        const child = await get(localize(m[1]));
        for (const u of child.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) urls.push(u[1]);
      }
    }
  }
  urls = [...new Set([`${BASE}/`, ...urls].map(localize))].filter(isInternal);
  /* cap, but keep a representative mix: the home page first, then
     every type in turn */
  const cap = AEO.pageCap ?? 60;
  if (urls.length > cap) {
    const byType = new Map();
    for (const u of urls) {
      const t = pageType(pathOf(u));
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t).push(u);
    }
    const picked = [];
    while (picked.length < cap) {
      let took = false;
      for (const list of byType.values()) {
        if (list.length && picked.length < cap) picked.push(list.shift()), (took = true);
      }
      if (!took) break;
    }
    urls = picked;
  }
  console.log(`crawling ${urls.length} page(s)`);

  const pages = [];
  for (let i = 0; i < urls.length; i += 6) {
    const batch = urls.slice(i, i + 6);
    const results = await Promise.all(batch.map((u) => get(u)));
    results.forEach((res, j) => {
      const url = batch[j];
      try {
        pages.push(analyze(url, res, lastmods.get(pathOf(url))));
      } catch (err) {
        console.warn(`! ${url}: ${err.message}`);
        pages.push({ path: pathOf(url), type: pageType(pathOf(url)), status: res.status, error: String(err.message) });
      }
    });
    process.stdout.write(`  ${Math.min(i + 6, urls.length)}/${urls.length}\r`);
  }
  process.stdout.write("\n");
  const graded = pages.filter((p) => !p.error);

  /* broken internal links: every path linked from the crawled pages
     that the crawl didn't already fetch (cap 150, HEAD) */
  const fetched = new Set(graded.map((p) => p.path));
  const candidates = [...new Set(graded.flatMap((p) => p.internalPaths))].filter((p) => !fetched.has(p)).slice(0, 150);
  const broken = [];
  for (let i = 0; i < candidates.length; i += 10) {
    const batch = candidates.slice(i, i + 10);
    const rs = await Promise.all(batch.map((p) => get(`${ORIGIN}${p}`, { method: "HEAD", timeoutMs: 15000 })));
    rs.forEach((r, j) => {
      if (r.status >= 400 || r.status === 0) broken.push({ path: batch[j], status: r.status });
    });
  }
  const links = { checked: candidates.length + graded.filter((p) => p.status === 200).length, broken: [...broken, ...graded.filter((p) => p.status >= 400).map((p) => ({ path: p.path, status: p.status }))] };

  const history = existsSync(HISTORY) ? JSON.parse(readFileSync(HISTORY, "utf8")) : { runs: [] };
  const prompts = process.env.AEO_SKIP_PROMPTS ? { ran: false, reason: "skipped (AEO_SKIP_PROMPTS)", results: [] } : await runPromptInsights({ prompts: AEO.prompts ?? [], brand: AEO.brand, brandDomains: AEO.brandDomains ?? [BASE_HOST] });
  if (prompts.ran) console.log(`prompt insights: visibility ${prompts.visibility}% · citation rate ${prompts.citationRate}% (${prompts.answered} prompts)`);
  else console.log(`prompt insights: not run — ${prompts.reason}`);

  const home = graded.find((p) => p.path === "/");
  const site = {
    robots: { ok: robotsRes.ok, status: robotsRes.status, groups },
    bots,
    sitemap: { urls, lastmod: lastmods.size > 0 },
    llms: { ok: llmsRes.ok && /text/.test(llmsRes.type), status: llmsRes.status, bytes: llmsRes.bytes, sections: (llmsRes.text.match(/^#{1,3}\s/gm) ?? []).length },
    https: ORIGIN.startsWith("https://"),
    links,
    home,
    pages: graded,
    historyRuns: history.runs.length + 1,
    prompts,
    analytics: { web: graded.some((p) => p.analytics?.web), rum: graded.some((p) => p.analytics?.rum) },
    referrerTracking: home?.referrerTracking ?? null,
  };

  /* ── score ── */
  const checks = CHECKS.map((c) => {
    if (c.scope === "site") {
      const r = c.run(site);
      return { id: c.id, pillar: c.pillar, weight: c.weight, effort: c.effort, title: c.title, fix: c.fix, scope: "site", ratio: Math.max(0, Math.min(1, r.ratio)), detail: r.detail, pages: [] };
    }
    const applicable = graded.filter((p) => (c.applies ? c.applies(p) : true));
    const per = applicable.map((p) => {
      const r = c.run(p);
      return { path: p.path, ratio: Math.max(0, Math.min(1, r.ratio)), detail: r.detail };
    });
    const avg = per.length ? per.reduce((s, x) => s + x.ratio, 0) / per.length : 1;
    return { id: c.id, pillar: c.pillar, weight: c.weight, effort: c.effort, title: c.title, fix: c.fix, scope: "page", ratio: avg, detail: per.length ? `${per.filter((x) => x.ratio >= 0.999).length}/${per.length} pages pass` : "no applicable pages", pages: per.filter((x) => x.ratio < 0.999).sort((a, b) => a.ratio - b.ratio) };
  });

  const pillars = {};
  for (const [name, pw] of Object.entries(AEO.pillarWeights)) {
    const own = checks.filter((c) => c.pillar === name);
    const wsum = own.reduce((s, c) => s + c.weight, 0);
    const score = wsum ? Math.round((own.reduce((s, c) => s + c.weight * c.ratio, 0) / wsum) * 100) : 0;
    pillars[name] = { score, level: level(score), weight: pw, checks: own.length, passing: own.filter((c) => c.ratio >= 0.999).length };
  }
  const totalW = Object.values(AEO.pillarWeights).reduce((a, b) => a + b, 0);
  const score = Math.round(Object.entries(pillars).reduce((s, [, p]) => s + p.score * p.weight, 0) / totalW);

  /* page score: weighted ratio of the page checks that apply to it */
  const pageScores = graded.map((p) => {
    let w = 0;
    let got = 0;
    const fails = [];
    for (const c of CHECKS) {
      if (c.scope !== "page" || (c.applies && !c.applies(p))) continue;
      const r = Math.max(0, Math.min(1, c.run(p).ratio));
      w += c.weight;
      got += c.weight * r;
      if (r < 0.999) fails.push(c.id);
    }
    return { path: p.path, type: p.type, score: w ? Math.round((got / w) * 100) : 0, words: p.wordCount, schema: p.ld.types, fails, title: p.title };
  });

  /* recommendations: points lost on the 100 scale, discounted by effort */
  const recommendations = checks
    .filter((c) => c.ratio < 0.999)
    .map((c) => {
      const pillarW = pillars[c.pillar].weight;
      const pillarChecksW = checks.filter((x) => x.pillar === c.pillar).reduce((s, x) => s + x.weight, 0);
      const impact = ((1 - c.ratio) * c.weight * pillarW) / pillarChecksW; // points of the site score
      return { id: c.id, pillar: c.pillar, title: c.title, fix: c.fix, effort: c.effort, impact: Math.round(impact * 10) / 10, priority: Math.round((impact / EFFORT_FACTOR[c.effort]) * 100) / 100, detail: c.detail, pages: c.pages.slice(0, 12).map((x) => `${x.path} — ${x.detail}`), pagesAffected: c.pages.length };
    })
    .sort((a, b) => b.priority - a.priority);

  const report = {
    generatedAt: new Date().toISOString(),
    origin: ORIGIN,
    model: "Four pillars after Webflow AEO (Content · Technical · Authority · Measurement); score = pillar scores × pillar weights; level 1–5",
    score,
    level: level(score),
    levelName: LEVEL_NAMES[level(score)],
    pillars,
    pagesCrawled: graded.length,
    pagesFailed: pages.length - graded.length,
    bots,
    robots: { ok: robotsRes.ok, status: robotsRes.status },
    sitemap: { ok: sitemapRes.ok, urls: urls.length, lastmod: lastmods.size > 0 },
    llms: site.llms,
    links,
    prompts: { ...prompts, results: (prompts.results ?? []).map((r) => ({ prompt: r.prompt, mentioned: r.mentioned, cited: r.cited, surfaced: r.surfaced, citedUrls: r.citedUrls, sources: r.sources, excerpt: r.excerpt, error: r.error, refused: r.refused })) },
    checks: checks.map((c) => ({ ...c, pages: c.pages.slice(0, 20) })),
    recommendations,
    pages: pageScores.sort((a, b) => a.score - b.score),
  };

  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  history.runs.push({ t: report.generatedAt, score, level: report.level, pillars: Object.fromEntries(Object.entries(pillars).map(([k, v]) => [k, v.score])), pages: graded.length, visibility: prompts.ran ? prompts.visibility : null, citationRate: prompts.ran ? prompts.citationRate : null });
  history.runs = history.runs.slice(-(AEO.historyCap ?? 120));
  writeFileSync(HISTORY, JSON.stringify(history, null, 2) + "\n");

  console.log(`\nAEO score ${score}/100 · level ${report.level} (${report.levelName})`);
  for (const [k, v] of Object.entries(pillars)) console.log(`  ${k.padEnd(12)} ${String(v.score).padStart(3)}  (${v.passing}/${v.checks} checks pass, weight ${v.weight})`);
  console.log(`\ntop recommendations:`);
  for (const r of recommendations.slice(0, 8)) console.log(`  +${r.impact.toFixed(1).padStart(4)} pts  [${r.effort}] ${r.title} — ${r.detail}`);
  console.log(`\n→ ${path.relative(ROOT, OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

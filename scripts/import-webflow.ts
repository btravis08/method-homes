/*
  Webflow CMS export → Sanity dataset.

  Bryce exported every collection of the old methodhomes.net (Webflow)
  as CSV on 2026-10-05; the files live in design/webflow-export/. This
  maps them onto our document types. It supersedes the crawl-based
  import-method-content.ts for everything the CMS held (the crawl only
  saw what the templates rendered) and uses the SAME deterministic ids
  (method-project-<slug>, method-post-<slug>, …; never a dot) so the
  two converge instead of duplicating.

  Runs on a GitHub Actions runner (import-webflow.yml): the dev sandbox
  reaches neither sanity.io nor Webflow's CDN. Imagery is fetched from
  the CDN URLs in the export and uploaded to Sanity, deduped by the
  CDN filename (<hash>_<name>.<ext>, unique per asset).

    npx tsx scripts/import-webflow.ts [--only=projects,series,plans,commercial,regions,posts] [--dry]

  --dry builds every document without touching the network and writes
  design/webflow-export/preview.json for inspection.

  Mapping:
    4 portfolio collections → project   (one doc per slug; a row that is
                                         published in any collection wins,
                                         then the latest-updated row)
    Predesigned Series      → series    (+ ranges and starting price
                                         rolled up from its plans)
    Predesigned Models      → plan      (bullet facts parsed to numbers)
    Commercial Project Types→ commercialType (case studies by slug)
    Custom Residential Regions → page   (hero + story + project grid)
    Blogs                   → post      (+ three postCategory docs:
                                         Articles / Press / Events)

  Webflow drafts become Sanity drafts (drafts.<id>) unless the crawl
  import already published that slug — the old site served it, so it
  stays live. A document the Studio has touched since the crawl import
  (_updatedAt after 2026-08-06) is left alone and reported.
*/
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SanityClient } from "@sanity/client";
import { parse as parseHtml, HTMLElement, Node, TextNode } from "node-html-parser";

const DIR = "design/webflow-export";
const ONLY = (process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? "projects,series,plans,commercial,regions,posts").split(",");
const DRY = process.argv.includes("--dry");
/* anything edited in the Studio after the crawl import is hand work */
const CRAWL_IMPORT_CUTOFF = "2026-08-06T00:00:00Z";

const token = process.env.SANITY_TOKEN ?? process.env.SANITY_AUTH_TOKEN;
const client: SanityClient | null = DRY
  ? null
  : createClient({
      projectId: process.env.SANITY_PROJECT_ID ?? "i2wd5pr1",
      dataset: process.env.SANITY_DATASET ?? "production",
      apiVersion: "2026-07-01",
      token,
      useCdn: false,
    });
if (!DRY && !token) {
  console.error("SANITY_TOKEN (or SANITY_AUTH_TOKEN) is required unless --dry");
  process.exit(1);
}

/* ---------- CSV (RFC 4180: quoted fields, "" escapes, embedded newlines) ---------- */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.length > 1 || r[0] !== "");
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}
const csv = (name: string) => parseCsv(readFileSync(path.join(DIR, `${name}.csv`), "utf8").replace(/^﻿/, ""));

/* ---------- helpers ---------- */
const key = () => `k${Math.random().toString(36).slice(2, 10)}`;
const slugField = (value: string) => ({ _type: "slug" as const, current: value });
const ref = (id: string) => ({ _type: "reference" as const, _ref: id });
const list = (s: string) => s.split(";").map((x) => x.trim()).filter(Boolean);
const bool = (s: string) => s === "true";
const num = (s: string) => {
  const n = Number(String(s).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const webflowDate = (s: string) => {
  if (!s) return undefined;
  const d = new Date(s.replace(/\s*\(.*\)$/, ""));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};
const clean = (s: string) => s.replace(/[​‍﻿]/g, "").replace(/ /g, " ").trim();

const STATE_CODES: Record<string, string> = {
  Washington: "WA", California: "CA", "British Columbia": "BC", Wyoming: "WY", Idaho: "ID",
  Alaska: "AK", Colorado: "CO", Montana: "MT", Oregon: "OR", Utah: "UT", Nevada: "NV", Arizona: "AZ",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.log(`  retry ${attempt}/3 ${label}: ${String(err).slice(0, 100)}`);
      await sleep(1500 * 2 ** (attempt - 1));
    }
  }
  throw lastErr;
}

/* ---------- assets: fetch from the Webflow CDN, upload once ---------- */
const assetCache = new Map<string, string | null>();
const report = { uploaded: 0, reused: 0, failed: [] as string[], skipped: [] as string[], kept: [] as string[] };

function cdnFilename(url: string) {
  const base = decodeURIComponent(decodeURIComponent(url.split("?")[0].split("/").pop() ?? ""));
  return base.replace(/[^\w.\-() +&,%]/g, "-").slice(0, 200);
}

async function uploadFromUrl(url: string, kind: "image" | "file"): Promise<string | null> {
  if (!url) return null;
  const cacheKey = `${kind}:${url}`;
  if (assetCache.has(cacheKey)) return assetCache.get(cacheKey)!;
  if (DRY) {
    assetCache.set(cacheKey, `${kind}-dry-${cdnFilename(url)}`);
    return assetCache.get(cacheKey)!;
  }
  const filename = cdnFilename(url);
  const type = kind === "image" ? "sanity.imageAsset" : "sanity.fileAsset";
  try {
    const existing = await withRetry(`lookup ${filename}`, () =>
      client!.fetch<string | null>(`*[_type == $type && originalFilename == $fn][0]._id`, { type, fn: filename }),
    );
    if (existing) {
      assetCache.set(cacheKey, existing);
      report.reused++;
      return existing;
    }
    const res = await withRetry(`fetch ${filename}`, async () => {
      const r = await fetch(url, { redirect: "follow" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    });
    if (res.byteLength > 40 * 1024 * 1024) throw new Error("over 40MB");
    const asset = await withRetry(`upload ${filename}`, () => client!.assets.upload(kind, res, { filename }));
    assetCache.set(cacheKey, asset._id);
    report.uploaded++;
    return asset._id;
  } catch (err) {
    console.log(`  SKIP ${kind} ${filename}: ${String(err).slice(0, 120)}`);
    report.failed.push(url);
    assetCache.set(cacheKey, null);
    return null;
  }
}

const imageField = (assetId: string, alt?: string) => ({
  _type: "image" as const,
  asset: ref(assetId),
  ...(alt ? { alt } : {}),
});
async function image(url: string, alt?: string) {
  const id = await uploadFromUrl(url, "image");
  return id ? imageField(id, alt) : undefined;
}
async function gallery(urls: string[], altBase: string, except?: string) {
  const out: Array<ReturnType<typeof imageField> & { _key: string }> = [];
  const seen = new Set<string>(except ? [except] : []);
  for (const u of urls) {
    if (seen.has(u)) continue;
    seen.add(u);
    const id = await uploadFromUrl(u, "image");
    if (id) out.push({ ...imageField(id, `${altBase} — photo ${out.length + 1}`), _key: key() });
  }
  return out;
}

/* ---------- HTML (Webflow rich text) → Portable Text ---------- */
type Span = { _type: "span"; _key: string; text: string; marks: string[] };
type Block = {
  _type: "block"; _key: string; style: string; markDefs: { _key: string; _type: "link"; href: string }[];
  children: Span[]; listItem?: "bullet" | "number"; level?: number;
};
type ImageBlock = ReturnType<typeof imageField> & { _key: string; caption?: string };
type PT = Array<Block | ImageBlock>;

const para = (text: string, style = "normal"): Block => ({
  _type: "block", _key: key(), style, markDefs: [],
  children: [{ _type: "span", _key: key(), text, marks: [] }],
});

async function htmlToBlocks(html: string, altBase: string): Promise<PT> {
  const out: PT = [];
  if (!html || !clean(html.replace(/<[^>]+>/g, ""))) {
    /* still may hold images or video figures */
    if (!/<img|<iframe/.test(html)) return out;
  }
  const root = parseHtml(html, { blockTextElements: { script: false, style: false } });

  const inline = (node: Node, marks: string[], defs: Block["markDefs"], spans: Span[]) => {
    if (node instanceof TextNode) {
      const t = node.rawText.replace(/\s+/g, " ");
      if (t) spans.push({ _type: "span", _key: key(), text: decode(t), marks });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.rawTagName?.toLowerCase();
    if (tag === "br") {
      spans.push({ _type: "span", _key: key(), text: "\n", marks });
      return;
    }
    let m = marks;
    if (tag === "strong" || tag === "b") m = [...m, "strong"];
    if (tag === "em" || tag === "i") m = [...m, "em"];
    if (tag === "a") {
      const href = node.getAttribute("href");
      if (href && /^https?:/.test(href)) {
        const def = { _key: key(), _type: "link" as const, href };
        defs.push(def);
        m = [...m, def._key];
      }
    }
    for (const c of node.childNodes) inline(c, m, defs, spans);
  };

  const block = (el: HTMLElement, style: string, listItem?: Block["listItem"]) => {
    const defs: Block["markDefs"] = [];
    const spans: Span[] = [];
    for (const c of el.childNodes) inline(c, [], defs, spans);
    /* trim edges, drop empties */
    if (spans.length) {
      spans[0].text = spans[0].text.replace(/^\s+/, "");
      spans[spans.length - 1].text = spans[spans.length - 1].text.replace(/\s+$/, "");
    }
    const text = spans.map((s) => s.text).join("");
    if (!clean(text)) return;
    const b: Block = { _type: "block", _key: key(), style, markDefs: defs, children: spans.filter((s) => s.text !== "") };
    if (listItem) {
      b.listItem = listItem;
      b.level = 1;
    }
    out.push(b);
  };

  const walk = async (el: HTMLElement) => {
    for (const node of el.childNodes) {
      if (node instanceof TextNode) {
        if (clean(node.rawText)) out.push(para(decode(clean(node.rawText))));
        continue;
      }
      if (!(node instanceof HTMLElement)) continue;
      const tag = node.rawTagName?.toLowerCase();
      switch (tag) {
        case "p":
          block(node, "normal");
          break;
        case "h1":
        case "h2":
          block(node, "h2");
          break;
        case "h3":
        case "h4":
        case "h5":
        case "h6":
          block(node, "h3");
          break;
        case "blockquote":
          block(node, "blockquote");
          break;
        case "ul":
        case "ol":
          for (const li of node.querySelectorAll(":scope > li")) block(li, "normal", tag === "ul" ? "bullet" : "number");
          break;
        case "img": {
          const src = node.getAttribute("src");
          if (src) {
            const img = await image(src, node.getAttribute("alt") || altBase);
            if (img) out.push({ ...img, _key: key() });
          }
          break;
        }
        case "figure": {
          const img = node.querySelector("img");
          const frame = node.querySelector("iframe");
          const caption = clean(node.querySelector("figcaption")?.text ?? "");
          if (img?.getAttribute("src")) {
            const asset = await image(img.getAttribute("src")!, img.getAttribute("alt") || caption || altBase);
            if (asset) out.push({ ...asset, _key: key(), ...(caption ? { caption } : {}) });
          } else if (frame) {
            const url = node.getAttribute("data-page-url") || frame.getAttribute("src");
            if (url) {
              const def = { _key: key(), _type: "link" as const, href: url };
              out.push({
                _type: "block", _key: key(), style: "normal", markDefs: [def],
                children: [
                  { _type: "span", _key: key(), text: "Watch the video: ", marks: [] },
                  { _type: "span", _key: key(), text: caption || url.replace(/^https?:\/\/(www\.)?/, ""), marks: [def._key] },
                ],
              });
            }
          } else await walk(node);
          break;
        }
        case "div":
        case "section":
        case "span":
          await walk(node);
          break;
        default:
          block(node, "normal");
      }
    }
  };
  await walk(root);
  return out;
}
const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&nbsp;/g, " ").replace(/&#x27;/g, "'");

const plainText = (html: string) => clean(decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " "));

/* ---------- write (createOrReplace, draft-aware, hand-edit guard) ---------- */
type Doc = { _id: string; _type: string; [k: string]: unknown };
const preview: Record<string, Doc[]> = {};
let existing: Map<string, { updated: string; published: boolean }> = new Map();

async function loadExisting() {
  if (DRY) return;
  const rows = await client!.fetch<{ _id: string; _updatedAt: string }[]>(
    `*[_id match "method-*" || _id match "drafts.method-*"]{_id, _updatedAt}`,
  );
  existing = new Map();
  for (const r of rows) {
    const bare = r._id.replace(/^drafts\./, "");
    const cur = existing.get(bare);
    existing.set(bare, {
      updated: cur && cur.updated > r._updatedAt ? cur.updated : r._updatedAt,
      published: (cur?.published ?? false) || !r._id.startsWith("drafts."),
    });
  }
  console.log(`dataset holds ${existing.size} method-* documents`);
}

async function write(doc: Doc, draft: boolean) {
  const bare = doc._id;
  const prior = existing.get(bare);
  if (prior && prior.updated > CRAWL_IMPORT_CUTOFF) {
    report.kept.push(bare);
    console.log(`  keep  ${bare} (edited in the Studio ${prior.updated.slice(0, 10)})`);
    return;
  }
  /* a Webflow draft the old site nevertheless served stays published */
  const asDraft = draft && !(prior?.published ?? false);
  const id = asDraft ? `drafts.${bare}` : bare;
  const final = { ...doc, _id: id };
  (preview[doc._type] ??= []).push(final);
  if (DRY) return;
  await withRetry(`write ${id}`, () => client!.createOrReplace(final));
  /* a published write supersedes a stale draft of the same doc */
  if (!asDraft && prior && existing.get(bare)) {
    await client!.delete(`drafts.${bare}`).catch(() => undefined);
  }
  console.log(`  ${asDraft ? "draft" : "doc  "} ${id}`);
}

/* ---------- projects ---------- */
type PortfolioRow = Record<string, string>;
function portfolioRows(): Map<string, PortfolioRow> {
  const sources = ["custom-portfolios", "custom-portfolios-new-designs", "predesigned-portfolios", "commercial-portfolios"];
  const bySlug = new Map<string, PortfolioRow>();
  for (const name of sources) {
    for (const row of csv(name)) {
      if (bool(row.Archived)) continue;
      const slug = row.Slug;
      const cur = bySlug.get(slug);
      if (!cur) {
        bySlug.set(slug, row);
        continue;
      }
      const published = !bool(row.Draft);
      const curPublished = !bool(cur.Draft);
      const newer = (webflowDate(row["Updated On"]) ?? "") > (webflowDate(cur["Updated On"]) ?? "");
      if ((published && !curPublished) || (published === curPublished && newer)) bySlug.set(slug, { ...cur, ...row, Draft: String(!(published || curPublished)) });
      else if (curPublished && !published) cur.Draft = "false";
    }
  }
  return bySlug;
}

const REAL_SERIES = new Set(["Cabin", "Elemental", "Option", "M", "Paradigm", "Annata", "Method One"]);

async function importProjects() {
  const rows = portfolioRows();
  console.log(`\nprojects: ${rows.size} unique slugs`);
  for (const [slug, r] of rows) {
    const seriesRaw = r["Property Series"];
    const series = REAL_SERIES.has(seriesRaw) ? seriesRaw : seriesRaw.startsWith("HOMB") ? "HOMB" : undefined;
    const type = r["Property Type"];
    const category = type === "Commercial" ? "commercial" : type === "Predesigned" || series ? "predesigned" : "residential";
    const title = clean(r["Short Title"] || r["Project Name"]);
    const feature = r["Feature Image"];
    const main = await image(feature, title);
    const gal = await gallery(list(r["Property Gallery"]), title, feature);
    const body = await htmlToBlocks(r["(Optional) Property Long Description"], title);
    const sqft = num(r["Square Feet: For Filter"]);
    const beds = num(r.Bedrooms);
    const baths = num(r.Bathrooms);
    const state = STATE_CODES[r["Installation State"]];
    const credits = [
      r["Design Team: Architect"],
      r["Design Team: Interior Designer"] && `Interiors: ${r["Design Team: Interior Designer"]}`,
      r["Design Team: Landscape Architect"] && `Landscape: ${r["Design Team: Landscape Architect"]}`,
      r["Design Team: General Contractor"] && `Builder: ${r["Design Team: General Contractor"]}`,
      r["Design Team: Engineer"] && `Engineer: ${r["Design Team: Engineer"]}`,
    ].filter(Boolean);
    await write(
      {
        _id: `method-project-${slug}`,
        _type: "project",
        title,
        slug: slugField(slug),
        category,
        featured: bool(r["Homepage Featured"]),
        summary: clean(r["Property Short Description"]),
        ...(main ? { mainImage: main } : {}),
        ...(gal.length ? { gallery: gal } : {}),
        ...(r["Installation Location"] ? { location: clean(r["Installation Location"]) } : {}),
        ...(state ? { state } : {}),
        ...(credits.length ? { architect: credits.join(" · ") } : {}),
        /* 99/999 are Webflow filter placeholders, not facts */
        ...(sqft && sqft !== 999 ? { squareFeet: sqft } : {}),
        ...(beds && beds !== 99 ? { bedrooms: beds } : {}),
        ...(baths && baths !== 99 ? { bathrooms: baths } : {}),
        ...(series ? { series } : {}),
        status: r["Property Status"] === "In Progress" ? "in-progress" : "completed",
        ...(num(r["Order (for portfolio sort)"]) ? { order: num(r["Order (for portfolio sort)"]) } : {}),
        ...(body.length ? { body } : {}),
      },
      bool(r.Draft),
    );
  }
}

/* ---------- plans (Predesigned Models) ---------- */
type PlanFacts = {
  sqft?: number; sqftMax?: number; deck?: string; garage?: string; priceFrom?: number; siteFrom?: number;
  beds?: number; bedsMax?: number; baths?: number; bathsMax?: number; modules?: number; modulesMax?: number; stories?: number; notes: string[];
};
function parseBullets(html: string): PlanFacts {
  const items = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => plainText(m[1])).filter(Boolean);
  const f: PlanFacts = { notes: [] };
  const n = (s: string) => Number(s.replace(/,/g, ""));
  for (const it of items) {
    let m: RegExpMatchArray | null;
    if ((m = it.match(/^([\d,]+)(?:\s*[–-]\s*([\d,]+))?\s*(?:sq\s?ft|sqft)$/i)) || (m = it.match(/^([\d,]{3,})$/))) {
      if (f.sqft === undefined) {
        f.sqft = n(m[1]);
        if (m[2]) f.sqftMax = n(m[2]);
      } else f.notes.push(it);
    } else if ((m = it.match(/^([\d,]+(?:\s*[–-]\s*[\d,]+)?)\s*deck\s*sq\s?ft/i))) f.deck = `${m[1].replace(/\s*[–-]\s*/, "–")} sq ft`;
    else if ((m = it.match(/^(?:garage\s*)?([\d,]+)\s*garage(?:\s*\+\s*lower level)?\s*sq\s?ft/i)) || (m = it.match(/^garage\s*([\d,]+)\s*sq\s?ft/i)))
      f.garage = `${m[1]} sq ft${/lower level/i.test(it) ? " (garage + lower level)" : ""}`;
    else if ((m = it.match(/^modular\s*\+\s*site:?\s*\$([\d,]+)/i))) f.siteFrom = n(m[1]);
    else if ((m = it.match(/^modular:?\s*\$([\d,]+)/i))) f.priceFrom = n(m[1]);
    else if ((m = it.match(/^(\d+)(?:\s*[–-]\s*(\d+))?\s*bed/i))) {
      f.beds = Number(m[1]);
      if (m[2]) f.bedsMax = Number(m[2]);
      if (/loft/i.test(it)) f.notes.push("Plus loft");
      if (/study/i.test(it)) f.notes.push("Plus study");
      const b = it.match(/(\d+(?:\.\d+)?)(?:\s*[–-]\s*(\d+(?:\.\d+)?))?\s*bath/i);
      if (b) {
        f.baths = Number(b[1]);
        if (b[2]) f.bathsMax = Number(b[2]);
      }
    } else if (/^studio/i.test(it)) {
      f.beds = 0;
      f.notes.push("Studio");
    } else if ((m = it.match(/^(\d+(?:\.\d+)?)(?:\s*[–-]\s*(\d+(?:\.\d+)?))?\s*bath/i))) {
      f.baths = Number(m[1]);
      if (m[2]) f.bathsMax = Number(m[2]);
    } else if ((m = it.match(/^(\d+)(?:\s*(?:or|[–-])\s*(\d+))?\s*modules?/i))) {
      f.modules = Number(m[1]);
      if (m[2]) f.modulesMax = Number(m[2]);
    } else if ((m = it.match(/^(\d+)\s*stor/i))) f.stories = Number(m[1]);
    else if (!/^na$/i.test(it)) f.notes.push(it);
  }
  return f;
}
const usd = (v: number) => `$${v.toLocaleString("en-US")}`;
const planFacts = new Map<string, PlanFacts & { seriesSlug: string; draft: boolean }>();

async function importPlans() {
  const rows = csv("predesigned-models").filter((r) => !bool(r.Archived));
  console.log(`\nplans: ${rows.length}`);
  for (const r of rows) {
    const f = parseBullets(r["Bullet Point Highlights"]);
    planFacts.set(r.Slug, { ...f, seriesSlug: r["Predesigned Series"], draft: bool(r.Draft) });
    const dims = [
      f.sqftMax ? { label: "Size", value: `${f.sqft!.toLocaleString("en-US")}–${f.sqftMax.toLocaleString("en-US")} sq ft` } : null,
      f.deck ? { label: "Deck", value: f.deck } : null,
      f.garage ? { label: "Garage", value: f.garage } : null,
      f.siteFrom ? { label: "Modular + site from", value: `${usd(f.siteFrom)}+` } : null,
      f.bedsMax ? { label: "Bedrooms", value: `${f.beds}–${f.bedsMax}` } : null,
      f.bathsMax ? { label: "Bathrooms", value: `${f.baths}–${f.bathsMax}` } : null,
      f.modulesMax ? { label: "Modules", value: `${f.modules}–${f.modulesMax}` } : null,
      ...f.notes.map((note) => ({ label: "Note", value: note })),
    ].filter(Boolean) as { label: string; value: string }[];
    const pdfId = await uploadFromUrl(r["PDF Link"], "file");
    await write(
      {
        _id: `method-plan-${r.Slug}`,
        _type: "plan",
        name: clean(r.Name),
        slug: slugField(r.Slug),
        series: ref(`method-series-${r["Predesigned Series"]}`),
        ...(f.beds !== undefined ? { beds: f.beds } : {}),
        ...(f.baths !== undefined ? { baths: f.baths } : {}),
        ...(f.sqft ? { sqft: f.sqft } : {}),
        ...(f.modules ? { modules: f.modules } : {}),
        ...(f.stories ? { stories: f.stories } : {}),
        ...(f.priceFrom ? { priceFrom: f.priceFrom } : {}),
        ...(dims.length ? { dimensions: dims.map((d) => ({ _type: "dimension", _key: key(), ...d })) } : {}),
        ...(pdfId ? { pdf: { _type: "file", asset: ref(pdfId) } } : {}),
      },
      bool(r.Draft),
    );
  }
}

/* ---------- series ---------- */
/* design credits as the series descriptions state them */
const SERIES_ARCHITECT: Record<string, string> = {
  annata: "Chris Pardo Design: Elemental Architecture",
  cabin: "Prentiss + Balance + Wickline Architects",
  elemental: "Chris Pardo Design: Elemental Architecture",
  m: "Prentiss + Balance + Wickline Architects",
  "method-one": "Method Arc",
  option: "Grouparchitect",
  paradigm: "Bogue Trondowski Architects",
};
const range = (vals: number[]) => (vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : undefined);

async function importSeries() {
  const rows = csv("predesigned-series").filter((r) => !bool(r.Archived));
  console.log(`\nseries: ${rows.length}`);
  if (!planFacts.size) {
    for (const r of csv("predesigned-models")) planFacts.set(r.Slug, { ...parseBullets(r["Bullet Point Highlights"]), seriesSlug: r["Predesigned Series"], draft: bool(r.Draft) });
  }
  for (const r of rows) {
    const plans = [...planFacts.values()].filter((p) => p.seriesSlug === r.Slug && !p.draft);
    const pick = (f: (p: PlanFacts) => number | undefined) => plans.map(f).filter((v): v is number => typeof v === "number");
    const name = clean(r.Name);
    const hero = await image(r["Feature Image"], `${name} series`);
    const gal = await gallery(list(r["Series Gallery"]), `${name} series`, r["Feature Image"]);
    const brochure = await uploadFromUrl(r["Series PDF"], "file");
    const teaser = clean(r["Teaser Description"]);
    const story = clean(r["Series Description"]);
    await write(
      {
        _id: `method-series-${r.Slug}`,
        _type: "series",
        name,
        slug: slugField(r.Slug),
        lede: teaser,
        ...(story && story !== teaser ? { body: [para(story)] } : {}),
        ...(hero ? { heroImage: hero } : {}),
        ...(gal.length ? { gallery: gal } : {}),
        ...(brochure ? { brochure: { _type: "file", asset: ref(brochure) } } : {}),
        ...(SERIES_ARCHITECT[r.Slug] ? { architect: SERIES_ARCHITECT[r.Slug] } : {}),
        featured: true,
        order: num(r["Sort Order"]) ?? 100,
        ...(range(pick((p) => p.beds)) ? { beds: range([...pick((p) => p.beds), ...pick((p) => p.bedsMax)]) } : {}),
        ...(range(pick((p) => p.baths)) ? { baths: range([...pick((p) => p.baths), ...pick((p) => p.bathsMax)]) } : {}),
        ...(range(pick((p) => p.sqft)) ? { sqft: range([...pick((p) => p.sqft), ...pick((p) => p.sqftMax)]) } : {}),
        ...(range(pick((p) => p.modules)) ? { modules: range([...pick((p) => p.modules), ...pick((p) => p.modulesMax)]) } : {}),
        ...(pick((p) => p.stories).length ? { storiesMax: Math.max(...pick((p) => p.stories)) } : {}),
        ...(pick((p) => p.priceFrom).length ? { priceFrom: Math.min(...pick((p) => p.priceFrom)) } : {}),
        ...(pick((p) => p.siteFrom).length
          ? { priceNote: `Modular from ${usd(Math.min(...pick((p) => p.priceFrom)))}; modular + site from ${usd(Math.min(...pick((p) => p.siteFrom)))}. From the ${new Date().getFullYear()} Webflow price list.` }
          : {}),
      },
      false,
    );
  }
}

/* ---------- commercial project types ---------- */
async function importCommercial() {
  const rows = csv("commercial-project-types").filter((r) => !bool(r.Archived));
  console.log(`\ncommercial types: ${rows.length}`);
  const projectSlugs = new Set(portfolioRows().keys());
  for (const r of rows) {
    const name = clean(r.Name);
    const hero = await image(r["Hero Image"], name);
    const body: PT = [para(clean(r["Paragraph Description"]))];
    for (const i of [1, 2, 3]) {
      const h = clean(r[`Subheader ${i}`]);
      const p = clean(r[`Section ${i} Description`]);
      if (h) body.push(para(h, "h3"));
      if (p) body.push(para(p));
      const img = await image(r[`Image ${i}`], h || name);
      if (img) body.push({ ...img, _key: key() });
    }
    const cases = list(r.Portfolio).filter((s) => projectSlugs.has(s));
    await write(
      {
        _id: `method-commercial-type-${r.Slug}`,
        _type: "commercialType",
        name,
        slug: slugField(r.Slug),
        lede: clean(r["H1 Header Text"]),
        body,
        ...(hero ? { heroImage: hero } : {}),
        ...(cases.length ? { caseStudies: cases.map((s) => ({ ...ref(`method-project-${s}`), _key: key() })) } : {}),
        order: num(r.Order) ?? 100,
      },
      bool(r.Draft),
    );
  }
}

/* ---------- custom residential regions → pages ---------- */
async function importRegions() {
  const rows = csv("custom-residential-regions").filter((r) => !bool(r.Archived));
  console.log(`\nregions: ${rows.length}`);
  const portfolio = portfolioRows();
  for (const r of rows) {
    const name = clean(r.Name);
    const slug = `custom-homes-${r.Slug}`;
    const hero = await image(r["Header Image"], name);
    const story: PT = clean(r["Paragraph Description"]).split(/\n\s*\n/).map((p) => para(clean(p)));
    for (const col of ["Secondary Image", "Process Image 1", "Process Image 2", "Process Image 3"]) {
      const img = await image(r[col], `${name} — ${col.toLowerCase()}`);
      if (img) story.push({ ...img, _key: key() });
    }
    const cards = [];
    for (const s of [...list(r.Portfolios), ...list(r["Predesigned Portfolios"])]) {
      const p = portfolio.get(s);
      if (!p) continue;
      const img = await image(p["Feature Image"], clean(p["Short Title"]));
      cards.push({
        _type: "gridCard", _key: key(),
        title: clean(p["Short Title"]),
        ...(img ? { image: img } : {}),
        eyebrow: clean(p["Installation Location"]),
        body: clean(p["Property Short Description"]).slice(0, 160),
        url: `/projects/${s}`,
      });
    }
    await write(
      {
        _id: `method-page-${slug}`,
        _type: "page",
        title: name,
        slug: slugField(slug),
        sections: [
          { _type: "sectionHeroPage", _key: key(), colorMode: "light", headline: name, lede: clean(r["H1 Description"]) },
          ...(hero ? [{ _type: "sectionFullWidth", _key: key(), colorMode: "light", mediaKind: "image", image: hero }] : []),
          { _type: "sectionRichText", _key: key(), colorMode: "light", body: story },
          ...(cards.length
            ? [{ _type: "sectionCardGrid", _key: key(), colorMode: "light", eyebrow: "Portfolio", headline: clean(r["Portfolio Header"]) || `${name} portfolio`, columns: 3, cards }]
            : []),
        ],
      },
      bool(r.Draft),
    );
  }
}

/* ---------- blog ---------- */
const CATEGORIES: Record<string, { id: string; title: string; slug: string; description: string }> = {
  Article: { id: "method-post-category-articles", title: "Articles", slug: "articles", description: "Stories from the factory floor, the field and the design studio." },
  Press: { id: "method-post-category-press", title: "Press", slug: "press", description: "Method Homes in the news." },
  Event: { id: "method-post-category-events", title: "Events", slug: "events", description: "Open houses, shows and talks." },
};

async function importPosts() {
  for (const c of Object.values(CATEGORIES)) {
    await write({ _id: c.id, _type: "postCategory", title: c.title, slug: slugField(c.slug), description: c.description }, false);
  }
  const rows = csv("blogs").filter((r) => !bool(r.Archived));
  console.log(`\nposts: ${rows.length}`);
  for (const r of rows) {
    const title = clean(r.Name);
    const hero = await image(r["Feature Image"], title);
    const body = await htmlToBlocks(r.Body, title);
    for (const u of list(r.Gallery)) {
      const img = await image(u, title);
      if (img) body.push({ ...img, _key: key() });
    }
    const firstPara = body.find((b): b is Block => b._type === "block" && b.style === "normal" && !("listItem" in b));
    const excerpt = clean(r["Short Description"]) || (firstPara ? firstPara.children.map((c) => c.text).join("").slice(0, 240) : "");
    const cat = CATEGORIES[r["Post Type"]] ?? CATEGORIES.Article;
    await write(
      {
        _id: `method-post-${r.Slug}`.slice(0, 120),
        _type: "post",
        title,
        slug: slugField(r.Slug),
        ...(hero ? { heroImage: hero } : {}),
        ...(excerpt ? { excerpt } : {}),
        body,
        publishedAt: webflowDate(r["Publish Date"]) ?? webflowDate(r["Created On"]),
        featured: bool(r.Featured),
        categories: [{ ...ref(cat.id), _key: key() }],
      },
      bool(r.Draft),
    );
  }
}

/* ---------- main ---------- */
async function main() {
  console.log(`${DRY ? "DRY RUN — " : ""}importing ${DIR}/*.csv (${ONLY.join(", ")})${client ? ` into ${client.config().projectId}/${client.config().dataset}` : ""}`);
  await loadExisting();
  if (ONLY.includes("plans")) await importPlans();
  if (ONLY.includes("series")) await importSeries();
  if (ONLY.includes("projects")) await importProjects();
  if (ONLY.includes("commercial")) await importCommercial();
  if (ONLY.includes("regions")) await importRegions();
  if (ONLY.includes("posts")) await importPosts();

  const counts = Object.fromEntries(Object.entries(preview).map(([t, d]) => [t, { total: d.length, drafts: d.filter((x) => x._id.startsWith("drafts.")).length }]));
  console.log("\nsummary", JSON.stringify({ documents: counts, assets: { uploaded: report.uploaded, reused: report.reused, failed: report.failed.length }, keptHandEdited: report.kept.length }, null, 1));
  if (report.failed.length) console.log("failed assets:\n  " + report.failed.join("\n  "));
  if (report.kept.length) console.log("kept (hand-edited):\n  " + report.kept.join("\n  "));
  if (DRY) {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(path.join(DIR, "preview.json"), JSON.stringify(preview, null, 1));
    console.log(`preview → ${DIR}/preview.json`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

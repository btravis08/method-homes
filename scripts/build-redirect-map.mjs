/**
 * Legacy URL map — every one of the old methodhomes.net URLs from the
 * 2026-08-05 crawl (design/method-content/pages.json) with its fate
 * under the accepted URL scheme (PROJECT-LOG 2026-10-03):
 *
 *   /series/<slug>, /series/<slug>/<plan>      predesigned catalog
 *   /projects/<slug>                           one URL per project
 *   /where-we-build, /where-we-build/<state>   markets
 *   /commercial/<type>                         commercial types
 *   /blog, /blog/<slug>, /blog/category/<c>, /blog/authors/<a>
 *   /custom-homes /predesigned /process /pricing /architects
 *   /method-arc /prefab-101 /sustainability /about /contact /press
 *   /privacy /faq
 *
 *   node scripts/build-redirect-map.mjs
 *
 * Writes design/redirects/legacy-map.json:
 *   { generatedAt, counts, entries: [{ from, action, to?, live, note? }] }
 *   action  keep      the URL survives as-is (200)
 *           redirect  301 to `to`, one hop
 *           gone      410 (junk: survey copies)
 *   live    false until the destination route exists on the site —
 *           next.config.ts only emits live entries, so nothing 301s
 *           into a 404 on staging. Flip to true when the route ships.
 *
 * next.config.ts reads the file for its redirects();
 * scripts/check-redirects.mjs verifies it against an origin.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CRAWL = JSON.parse(readFileSync(path.join(ROOT, "design/method-content/pages.json"), "utf8"));
const OUT = path.join(ROOT, "design/redirects/legacy-map.json");

const pages = Array.isArray(CRAWL.pages) ? CRAWL.pages : Object.entries(CRAWL.pages).map(([k, v]) => ({ url: v.url || k, ...v }));
const pathOf = (u) => new URL(u, "https://methodhomes.net").pathname.replace(/\/$/, "") || "/";
const old = [...new Set(pages.map((p) => pathOf(p.url)))].sort();

/* routes that exist on the rebuilt site today; everything else a
   redirect points at is `live: false` until its route ships */
const LIVE_PREFIXES = ["/projects/", "/blog"];
const LIVE_EXACT = new Set(["/", "/about", "/commercial", "/pricing", "/faq", "/sustainability", "/get-started", "/projects", "/blog", "/search", "/custom-homes", "/predesigned", "/architects"]);
const isLive = (to) => LIVE_EXACT.has(to) || LIVE_PREFIXES.some((p) => to.startsWith(p));

/* the ten flat vanity project pages → their canonical project slug
   (the portfolio slug the import created). Chosen by title: the vanity
   titles all say "Custom", so the custom-portfolio entry wins over a
   same-named predesigned one. */
const VANITY = {
  "/peninsula": "peninsula-custom-by-studio-s2",
  "/calistoga": "calistoga-custom",
  "/chimney-rock-estate": "chimney-rock-designed-by-nick-noyes-architects",
  "/martis-camp-416": "martis-416-custom-home-designed-by-sagemodern-architects",
  "/martis-camp-663": "martis-663-by-sagemodern",
  "/santa-rosa": "santa-rosa-custom-by-tobylongdesign",
  "/orcas-cabin-retreat": "orcas-retreat-washington",
  "/sv-residence": "sv-residence-custom",
  "/sv-residence-arc": "sv-residence-custom",
  "/fish-creek": "fish-creek-passage-by-method-arc",
};
/* /project/<slug> detail pages duplicate a portfolio entry */
const PROJECT_DETAIL = { calistoga: "calistoga-custom", peninsula: "peninsula-custom-by-studio-s2" };

const COMMERCIAL_TYPES = {
  "affordable-workforce-housing": "workforce-housing",
  "classrooms-and-school-additions": "schools",
  "multi-family-housing-units": "multifamily",
  "remote-ski-lodge-and-hospitality-projects": "hospitality",
};

const CORE = {
  "/custom-residential": "/custom-homes",
  "/predesigned-residential": "/predesigned",
  "/method-process": "/process",
  "/process-services": "/process",
  "/partnerships-with-architects-and-developers": "/architects",
  "/privacy-policy": "/privacy",
  "/arc": "/method-arc",
  "/what-is-prefab": "/prefab-101",
  "/featured-projects": "/projects",
  "/residential-survey": "/get-started",
  "/commercial-survey": "/get-started",
  "/res-survey": "/get-started",
};
const KEEP = new Set(["/", "/about", "/commercial", "/pricing", "/faq", "/sustainability", "/get-started", "/search", "/blog"]);
const GONE = new Set(["/residential-survey-copy", "/commercial-survey-copy"]);

function fate(p) {
  if (GONE.has(p)) return { action: "gone", note: "junk duplicate survey" };
  if (KEEP.has(p)) return { action: "keep", ...(p === "/search" ? { note: "noindex" } : {}), ...(p === "/press" ? { note: "becomes the press page (today a blog index)" } : {}) };
  if (p.startsWith("/blog/")) return { action: "keep", note: "post slug unchanged; pruning decisions (keep/301/410) land here per post" };
  const seg = p.split("/").filter(Boolean);
  if (p === "/press") return { action: "redirect", to: "/blog", note: "old /press was a blog index; flip to keep when the press page ships" };
  if (["custom-portfolio", "predesigned-portfolio", "commercial-portfolio", "custom-portfolios-new-design"].includes(seg[0])) {
    return seg[1] ? { action: "redirect", to: `/projects/${seg[1]}` } : { action: "redirect", to: "/projects", note: "portfolio index" };
  }
  if (seg[0] === "project" && PROJECT_DETAIL[seg[1]]) return { action: "redirect", to: `/projects/${PROJECT_DETAIL[seg[1]]}`, note: "old detail page duplicating a portfolio entry (not imported as its own doc)" };
  if (VANITY[p]) return { action: "redirect", to: `/projects/${VANITY[p]}`, note: "flat vanity URL (likely to carry links)" };
  if (seg[0] === "predesigned-series") return { action: "redirect", to: `/series/${seg[1]}` };
  if (seg[0] === "custom-regions") return { action: "redirect", to: "/where-we-build", note: `lifestyle lander (${seg[1]}) — no state equivalent; parent page` };
  if (seg[0] === "commercial-project-types") return { action: "redirect", to: `/commercial/${COMMERCIAL_TYPES[seg[1]] ?? seg[1]}` };
  if (CORE[p]) return { action: "redirect", to: CORE[p] };
  return { action: "redirect", to: "/", note: "UNMAPPED — review" };
}

const entries = old.map((from) => {
  const f = fate(from);
  return { from, ...f, ...(f.action === "redirect" ? { live: isLive(f.to) } : {}) };
});

const counts = entries.reduce((a, e) => ((a[e.action] = (a[e.action] ?? 0) + 1), a), {});
counts.redirectLive = entries.filter((e) => e.action === "redirect" && e.live).length;
counts.redirectPending = entries.filter((e) => e.action === "redirect" && !e.live).length;
counts.unmapped = entries.filter((e) => e.note?.startsWith("UNMAPPED")).length;

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), source: "design/method-content/pages.json", counts, entries }, null, 2) + "\n");
console.log(`legacy-map: ${entries.length} URLs ·`, counts);
for (const e of entries.filter((e) => e.note?.startsWith("UNMAPPED"))) console.log("  UNMAPPED", e.from);

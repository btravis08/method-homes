/*
  Method Homes content capture — runs on a GitHub Actions runner (the
  sandbox can't reach methodhomes.net). Discovers pages via sitemap
  (fallback: nav crawl from the homepage), extracts per-page structure
  (title, meta, headings, paragraphs, images) and downloads imagery.

  Output:
    design/method-content/pages.json      structured page content
    design/method-content/crawl-log.json  what happened, per URL
    public/method/<page-slug>/<n>.<ext>   page imagery (deduped by URL)

  Resumable: pages already in pages.json are skipped, so re-runs only
  fetch what's missing. Client content for the platform rebuild —
  staging/design use.
*/
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ORIGIN = "https://www.methodhomes.net";
const OUT_DIR = "design/method-content";
const IMG_DIR = "public/method";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE_CAP = 200;
const IMG_PER_PAGE_CAP = 24;
const DELAY_MS = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, asBuffer = false) {
  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      accept: asBuffer
        ? "image/avif,image/webp,image/*,*/*"
        : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return asBuffer ? Buffer.from(await res.arrayBuffer()) : await res.text();
}

const decode = (s) =>
  s
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();

const stripTags = (html) =>
  decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  );

function absolutize(src, pageUrl) {
  try {
    return new URL(src, pageUrl).href;
  } catch {
    return null;
  }
}

/* pull structure out of a page without a DOM parser: titles, meta,
   headings in order, paragraph-ish text blocks, image candidates */
function extract(html, pageUrl) {
  const title = decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
  const metaDesc = decode(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1] ??
      /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i.exec(html)?.[1] ??
      "",
  );
  const ogImage = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1];

  const headings = [];
  for (const m of html.matchAll(/<(h[1-4])[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = stripTags(m[2]);
    if (text && text.length < 200) headings.push({ level: m[1], text });
  }

  /* paragraphs: real <p> blocks with enough text to matter */
  const paragraphs = [];
  for (const m of html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = stripTags(m[1]);
    if (text.length >= 40) paragraphs.push(text);
  }

  /* images: src + largest srcset candidate; skip svg/sprites/logos */
  const seen = new Set();
  const images = [];
  for (const m of html.matchAll(/<img[^>]*>/gi)) {
    const tag = m[0];
    const srcset = /srcset=["']([^"']*)["']/i.exec(tag)?.[1];
    let src = /src=["']([^"']*)["']/i.exec(tag)?.[1];
    if (srcset) {
      const candidates = srcset
        .split(",")
        .map((c) => c.trim().split(/\s+/))
        .map(([u, w]) => [u, parseInt(w) || 0]);
      candidates.sort((a, b) => b[1] - a[1]);
      if (candidates[0]?.[0]) src = candidates[0][0];
    }
    if (!src) continue;
    const abs = absolutize(src, pageUrl);
    if (!abs || seen.has(abs)) continue;
    if (/\.svg|sprite|logo|icon|favicon/i.test(abs)) continue;
    seen.add(abs);
    const alt = decode(/alt=["']([^"']*)["']/i.exec(tag)?.[1] ?? "");
    images.push({ url: abs, alt });
  }
  if (ogImage) {
    const abs = absolutize(ogImage, pageUrl);
    if (abs && !seen.has(abs)) images.unshift({ url: abs, alt: "" });
  }

  /* internal links, for crawl discovery */
  const links = new Set();
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#?]*)["']/gi)) {
    const abs = absolutize(m[1], pageUrl);
    if (!abs) continue;
    const u = new URL(abs);
    if (u.origin !== new URL(ORIGIN).origin) continue;
    if (/\.(pdf|jpg|jpeg|png|webp|zip|mp4)$/i.test(u.pathname)) continue;
    links.add(u.origin + u.pathname.replace(/\/$/, ""));
  }

  return { title, metaDesc, headings, paragraphs, images, links: [...links] };
}

const slugFor = (url) => {
  const p = new URL(url).pathname.replace(/^\/|\/$/g, "");
  return (p || "home").replace(/[^a-zA-Z0-9/-]/g, "-").replaceAll("/", "--").slice(0, 80);
};

const extFor = (url) => {
  const m = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.exec(url);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
};

async function discover() {
  const urls = new Set([ORIGIN + "/"]);
  for (const candidate of ["/sitemap.xml", "/sitemap_index.xml", "/wp-sitemap.xml"]) {
    try {
      const xml = await get(ORIGIN + candidate);
      const locs = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map((m) => m[1].trim());
      /* child sitemaps */
      for (const loc of locs) {
        if (/\.xml$/.test(loc)) {
          try {
            const child = await get(loc);
            for (const c of child.matchAll(/<loc>([\s\S]*?)<\/loc>/g)) urls.add(c[1].trim());
            await sleep(DELAY_MS);
          } catch {}
        } else {
          urls.add(loc);
        }
      }
      console.log(`sitemap ${candidate}: ${urls.size} URLs`);
      if (urls.size > 2) return [...urls];
    } catch {}
  }
  console.log("no sitemap — will crawl from nav");
  return [...urls];
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(IMG_DIR, { recursive: true });

  const pagesPath = path.join(OUT_DIR, "pages.json");
  const existing = existsSync(pagesPath)
    ? JSON.parse(readFileSync(pagesPath, "utf8"))
    : { fetchedAt: null, pages: {} };
  const log = [];

  const queue = (await discover())
    .map((u) => u.replace(/\/$/, "") || ORIGIN)
    .filter((u, i, a) => a.indexOf(u) === i);
  const visited = new Set(Object.keys(existing.pages));
  let fetched = 0;

  while (queue.length && fetched < PAGE_CAP) {
    const url = queue.shift();
    const key = new URL(url).pathname.replace(/\/$/, "") || "/";
    if (visited.has(key)) continue;
    visited.add(key);
    try {
      const html = await get(url);
      const data = extract(html, url);
      /* enqueue discovered internal links (nav crawl fallback) */
      for (const link of data.links) {
        const lk = new URL(link).pathname.replace(/\/$/, "") || "/";
        if (!visited.has(lk) && queue.length + fetched < PAGE_CAP * 2) queue.push(link);
      }

      /* download imagery */
      const slug = slugFor(url);
      const dir = path.join(IMG_DIR, slug);
      const kept = [];
      for (const [i, img] of data.images.slice(0, IMG_PER_PAGE_CAP).entries()) {
        try {
          const buf = await get(img.url, true);
          if (buf.length < 8_000) continue; /* icons/pixels */
          mkdirSync(dir, { recursive: true });
          const name = `${String(i + 1).padStart(2, "0")}-${createHash("md5").update(img.url).digest("hex").slice(0, 8)}.${extFor(img.url)}`;
          writeFileSync(path.join(dir, name), buf);
          kept.push({ file: `${slug}/${name}`, alt: img.alt, source: img.url, bytes: buf.length });
          await sleep(250);
        } catch (e) {
          log.push({ url: img.url, error: String(e).slice(0, 120) });
        }
      }

      existing.pages[key] = {
        url,
        slug,
        title: data.title,
        metaDesc: data.metaDesc,
        headings: data.headings,
        paragraphs: data.paragraphs,
        images: kept,
      };
      fetched += 1;
      console.log(`ok ${key} — ${data.paragraphs.length} paras, ${kept.length} images`);
      log.push({ url, ok: true, images: kept.length });
    } catch (e) {
      console.log(`fail ${url}: ${String(e).slice(0, 100)}`);
      log.push({ url, error: String(e).slice(0, 120) });
    }
    await sleep(DELAY_MS);
  }

  existing.fetchedAt = new Date().toISOString();
  writeFileSync(pagesPath, `${JSON.stringify(existing, null, 2)}\n`);
  writeFileSync(path.join(OUT_DIR, "crawl-log.json"), `${JSON.stringify(log, null, 2)}\n`);
  console.log(`\ndone: ${Object.keys(existing.pages).length} pages captured`);
}

await main();

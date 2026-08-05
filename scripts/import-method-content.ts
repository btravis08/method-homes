/*
  Import the methodhomes.net capture (design/method-content/pages.json
  + public/method imagery) into the Sanity dataset. Idempotent:
  deterministic ids (method-project-<slug>, method-post-<slug>, …,
  never containing a dot) and createOrReplace, so re-runs converge;
  image uploads are deduped by filename.

  Run on a machine that can reach sanity.io:
    npx sanity exec scripts/import-method-content.ts --with-user-token

  Mapping:
    /predesigned-portfolio/<slug>  -> project (residential; specs parsed)
    /blog/<slug>                   -> post
    /about                         -> teamMember roster + about page
    core marketing pages           -> page (hero + rich text sections)
*/
import { readFileSync, createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { createClient } from "@sanity/client";
import { getCliClient } from "sanity/cli";

/* two ways in: `sanity exec --with-user-token` locally, or a
   SANITY_TOKEN env (the CI import workflow passes the write token) */
const client = process.env.SANITY_TOKEN
  ? createClient({
      projectId: process.env.SANITY_PROJECT_ID ?? "i2wd5pr1",
      dataset: process.env.SANITY_DATASET ?? "production",
      apiVersion: "2026-07-01",
      token: process.env.SANITY_TOKEN,
      useCdn: false,
    })
  : getCliClient({ apiVersion: "2026-07-01" });

const DATA = JSON.parse(
  readFileSync("design/method-content/pages.json", "utf8"),
) as {
  pages: Record<string, CapturedPage>;
};

interface CapturedImage {
  file: string;
  alt: string;
  source: string;
  bytes: number;
}
interface CapturedFile {
  file: string;
  source: string;
  bytes: number;
}
interface CapturedPage {
  url: string;
  slug: string;
  title: string;
  metaDesc: string;
  headings: { level: string; text: string }[];
  paragraphs: string[];
  images: CapturedImage[];
  files?: CapturedFile[];
}

const IMG_ROOT = "public/method";
const key = () => `k${Math.random().toString(36).slice(2, 10)}`;

/* transient-network resilience: one dropped socket must not kill a
   40-minute run. Exponential backoff, then give up on that item. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.log(`  retry ${attempt}/3 ${label}: ${String(err).slice(0, 80)}`);
      await sleep(1500 * 2 ** (attempt - 1));
    }
  }
  throw lastErr;
}

/* ---------- image upload, deduped by filename ---------- */
const assetCache = new Map<string, string>();
async function uploadImage(img: CapturedImage): Promise<string | null> {
  const abs = path.join(IMG_ROOT, img.file);
  if (!existsSync(abs)) return null;
  const filename = path.basename(img.file);
  if (assetCache.has(filename)) return assetCache.get(filename)!;
  try {
    const existing = await withRetry(`lookup ${filename}`, () =>
      client.fetch<string | null>(
        `*[_type == "sanity.imageAsset" && originalFilename == $fn][0]._id`,
        { fn: filename },
      ),
    );
    if (existing) {
      assetCache.set(filename, existing);
      return existing;
    }
    const asset = await withRetry(`upload ${filename}`, () =>
      client.assets.upload("image", createReadStream(abs), { filename }),
    );
    assetCache.set(filename, asset._id);
    console.log(`  uploaded ${filename}`);
    return asset._id;
  } catch (err) {
    console.log(`  SKIP image ${filename}: ${String(err).slice(0, 100)}`);
    return null;
  }
}

async function uploadPdf(f: CapturedFile): Promise<string | null> {
  const abs = path.join(IMG_ROOT, f.file);
  if (!existsSync(abs)) return null;
  const filename = path.basename(f.file);
  const cacheKey = `file:${filename}`;
  if (assetCache.has(cacheKey)) return assetCache.get(cacheKey)!;
  try {
    const existing = await withRetry(`lookup ${filename}`, () =>
      client.fetch<string | null>(
        `*[_type == "sanity.fileAsset" && originalFilename == $fn][0]._id`,
        { fn: filename },
      ),
    );
    if (existing) {
      assetCache.set(cacheKey, existing);
      return existing;
    }
    const asset = await withRetry(`upload ${filename}`, () =>
      client.assets.upload("file", createReadStream(abs), { filename }),
    );
    assetCache.set(cacheKey, asset._id);
    console.log(`  uploaded ${filename}`);
    return asset._id;
  } catch (err) {
    console.log(`  SKIP file ${filename}: ${String(err).slice(0, 100)}`);
    return null;
  }
}

const imageRef = (assetId: string, alt?: string) => ({
  _type: "image" as const,
  asset: { _type: "reference" as const, _ref: assetId },
  ...(alt ? { alt } : {}),
});

const block = (text: string) => ({
  _type: "block" as const,
  _key: key(),
  style: "normal" as const,
  markDefs: [],
  children: [{ _type: "span" as const, _key: key(), text, marks: [] }],
});

const slugField = (value: string) => ({ _type: "slug" as const, current: value });

/* dedupe near-identical paragraphs (nav/footer boilerplate repeats) */
function uniqueParas(paras: string[]): string[] {
  const seen = new Set<string>();
  return paras.filter((p) => {
    const sig = p.slice(0, 60).toLowerCase();
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
}

/* ---------- projects (predesigned portfolio) ---------- */
function parseSpecs(page: CapturedPage) {
  const text = [...page.headings.map((h) => h.text), ...page.paragraphs].join("\n");
  const num = (re: RegExp) => {
    const m = re.exec(text);
    return m ? Number(m[1].replace(/,/g, "")) : undefined;
  };
  return {
    squareFeet: num(/([\d,]{3,6})\s*(?:sq\.?\s*ft|square\s*feet)/i),
    bedrooms: num(/(\d+)\s*(?:bed(?:room)?s?)/i),
    bathrooms: num(/(\d+(?:\.\d+)?)\s*(?:bath(?:room)?s?)/i),
  };
}

const PORTFOLIOS: [prefix: string, category: string][] = [
  ["/custom-portfolio/", "residential"],
  ["/predesigned-portfolio/", "predesigned"],
  ["/commercial-portfolio/", "commercial"],
  /* the featured-projects index links these detail pages */
  ["/project/", "residential"],
];

async function importProjects() {
  const entries = Object.entries(DATA.pages).flatMap(([p, page]) => {
    const hit = PORTFOLIOS.find(([prefix]) => p.startsWith(prefix));
    return hit ? [[p, page, hit[1]] as const] : [];
  });
  console.log(`\nprojects: ${entries.length}`);
  for (const [pathName, page, category] of entries) {
    const slug = pathName.split("/").pop()!;
    const h1 = page.headings.find((h) => h.level === "h1")?.text ?? page.title;
    const tagline = page.headings.filter((h) => h.level === "h1")[1]?.text;
    const paras = uniqueParas(page.paragraphs);
    const specs = parseSpecs(page);

    const [main, ...rest] = page.images;
    const mainAsset = main ? await uploadImage(main) : null;
    const gallery: Array<ReturnType<typeof imageRef> & { _key: string }> = [];
    for (const img of rest) {
      const id = await uploadImage(img);
      if (id) gallery.push({ ...imageRef(id, img.alt), _key: key() });
    }
    const plans: Array<{
      _type: "file";
      _key: string;
      asset: { _type: "reference"; _ref: string };
    }> = [];
    for (const f of page.files ?? []) {
      const id = await uploadPdf(f);
      if (id)
        plans.push({
          _type: "file" as const,
          _key: key(),
          asset: { _type: "reference" as const, _ref: id },
        });
    }

    await withRetry(`doc`, () => client.createOrReplace({
      _id: `method-project-${slug}`,
      _type: "project",
      title: h1,
      slug: slugField(slug),
      category,
      summary: tagline ?? page.metaDesc ?? paras[0]?.slice(0, 200),
      ...(mainAsset ? { mainImage: imageRef(mainAsset, main!.alt) } : {}),
      ...(gallery.length ? { gallery } : {}),
      ...(plans.length ? { plans } : {}),
      featured: pathName.startsWith("/project/"),
      ...specs,
      body: paras.map(block),
    }));
    console.log(`  project ${slug} [${category}]${specs.squareFeet ? ` (${specs.squareFeet} sqft)` : ""}`);
  }
}

/* ---------- blog posts ---------- */
async function importPosts() {
  const entries = Object.entries(DATA.pages).filter(([p]) =>
    p.startsWith("/blog/"),
  );
  console.log(`\nposts: ${entries.length}`);
  for (const [pathName, page] of entries) {
    const slug = pathName.split("/").pop()!;
    const h1 = page.headings.find((h) => h.level === "h1")?.text ?? page.title;
    if (!h1) continue;
    const paras = uniqueParas(page.paragraphs);
    const hero = page.images[0];
    const heroAsset = hero ? await uploadImage(hero) : null;
    await withRetry(`doc`, () => client.createOrReplace({
      _id: `method-post-${slug}`.slice(0, 120),
      _type: "post",
      title: h1,
      slug: slugField(slug),
      ...(heroAsset ? { heroImage: imageRef(heroAsset) } : {}),
      excerpt: page.metaDesc || paras[0]?.slice(0, 240),
      body: paras.map(block),
      publishedAt: DATA.pages[pathName] ? new Date().toISOString() : undefined,
    }));
    console.log(`  post ${slug}`);
  }
}

/* ---------- team (from /about) ---------- */
async function importTeam() {
  const about = DATA.pages["/about"];
  if (!about) {
    console.log("\nteam: /about not captured yet — skipping");
    return;
  }
  /* methodhomes.net publishes no individual roster (verified across
     the full capture) — team members are entered by hand in the
     Studio. The detector below stays for a future re-crawl. */
  /* roster pattern: portrait images whose alt is a person's name;
     role often rides in the heading right after the name */
  const members: { name: string; role?: string; img?: CapturedImage }[] = [];
  const headingTexts = about.headings.map((h) => h.text);
  for (const img of about.images) {
    const alt = img.alt.trim();
    /* person-shaped alt: 2-4 capitalized words, no sentence */
    if (!/^[A-Z][a-z]+(?: [A-Z][a-zA-Z'.-]+){1,3}$/.test(alt)) continue;
    const idx = headingTexts.findIndex((t) => t.trim() === alt);
    const role = idx >= 0 ? headingTexts[idx + 1] : undefined;
    members.push({
      name: alt,
      role: role && role.length < 60 ? role : undefined,
      img,
    });
  }
  console.log(`\nteam: ${members.length} member(s) detected on /about`);
  for (const [i, m] of members.entries()) {
    const slug = m.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const photo = m.img ? await uploadImage(m.img) : null;
    await withRetry(`doc`, () => client.createOrReplace({
      _id: `method-team-${slug}`,
      _type: "teamMember",
      name: m.name,
      slug: slugField(slug),
      ...(m.role ? { role: m.role } : {}),
      ...(photo ? { photo: imageRef(photo) } : {}),
      order: (i + 1) * 10,
    }));
    console.log(`  team ${m.name}${m.role ? ` — ${m.role}` : ""}`);
  }
}

/* ---------- core marketing pages ---------- */
const LANDING_PREFIXES = [
  "/predesigned-series/",
  "/custom-regions/",
  "/commercial-project-types/",
];

const CORE_PAGES = [
  "/about",
  "/custom-residential",
  "/predesigned-residential",
  "/commercial",
  "/sustainability",
  "/pricing",
  "/faq",
  "/get-started",
  "/partnerships-with-architects-and-developers",
];

async function importPages() {
  console.log(`\npages:`);
  const landing = Object.keys(DATA.pages).filter((p) =>
    LANDING_PREFIXES.some((prefix) => p.startsWith(prefix)),
  );
  for (const pathName of [...CORE_PAGES, ...landing]) {
    const page = DATA.pages[pathName];
    if (!page) continue;
    const slug = pathName.replace(/^\//, "").replace(/[^a-z0-9-]/g, "-");
    const h1 = page.headings.find((h) => h.level === "h1")?.text ?? page.title;
    const paras = uniqueParas(page.paragraphs);
    const hero = page.images[0];
    const heroAsset = hero ? await uploadImage(hero) : null;

    const sections = [
      ...(heroAsset
        ? [
            {
              _type: "sectionHero",
              _key: key(),
              colorMode: "dark",
              headline: h1,
              image: imageRef(heroAsset),
              mediaKind: "image",
            },
          ]
        : []),
      {
        _type: "sectionRichText",
        _key: key(),
        colorMode: "light",
        body: paras.map(block),
      },
    ];

    await withRetry(`doc`, () => client.createOrReplace({
      _id: `method-page-${slug}`,
      _type: "page",
      title: h1 || slug,
      slug: slugField(slug),
      seo: page.metaDesc
        ? { _type: "seo", description: page.metaDesc }
        : undefined,
      sections,
    }));
    console.log(`  page /${slug} (${paras.length} paras)`);
  }
}

async function main() {
  console.log(`importing capture of ${Object.keys(DATA.pages).length} pages into ${client.config().projectId}/${client.config().dataset}`);
  await importProjects();
  await importTeam();
  await importPages();
  await importPosts();
  console.log("\ndone — review drafts/documents in the Studio");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { groq } from "next-sanity";

import { sanityFetch } from "@/sanity/lib/fetch";

import designops from "../../../designops.config.json";

/*
  /llms-full.txt (llmstxt.org, the "full" companion to /llms.txt): the
  site's substance as one plain-text document — every public page's
  copy (section headlines, body text, FAQ pairs, spec rows), every
  project's case-study facts and every post's lede + body — so a model
  that ingests one file gets the answers, not just a map of URLs.
  Built from the CMS under ISR; capped so it stays a document, not a
  dump (per-post body ≈1,500 chars, 60 posts, 60 projects).
*/
export const revalidate = 3600;

const BASE = designops.site.baseUrl;

const query = groq`{
  "settings": *[_type == "siteSettings"][0]{ companyName, tagline, phone, email, address, city, region },
  "pages": *[_type == "page" && defined(slug.current) && protected != true]
    | order(slug.current == "home" desc, title asc){
      title, "slug": slug.current, _updatedAt,
      "description": coalesce(seo.description, ""),
      sections[]{
        _type, eyebrow, headline, title, intro, lede, description, items, body, text, subline, headers,
        cards[]{ title, body, meta }, panels[]{ title, eyebrow, body },
        rows[]{ label, value, cells }, stats[]{ value, label },
        steps[]{ title, body, duration }, links[]{ title, description },
        quote, clientName, clientDetail, logos[]{ name }, members[]->{ name, role, credentials },
        "variantSections": variants[0].sections[]{ _type, eyebrow, headline, title, intro, description, items, body, rows[]{ label, value } }
      },
      body
    },
  "projects": *[_type == "project" && defined(slug.current)]
    | order(completedYear desc, _createdAt desc)[0...60]{
      title, "slug": slug.current, category, summary, location, series, squareFeet, bedrooms, bathrooms,
      modules, timelineMonths, costBand, completedYear, challenge, approach, testimonial, _updatedAt
    },
  "posts": *[_type == "post" && defined(slug.current) && defined(publishedAt)]
    | order(publishedAt desc)[0...60]{
      title, "slug": slug.current, excerpt, publishedAt, _updatedAt, body,
      "author": author->name, "reviewedBy": reviewedBy->name,
      "categories": categories[]->title
    },
  "series": *[_type == "series" && defined(slug.current)] | order(order asc, name asc){
    name, "slug": slug.current, tagline, lede, _updatedAt, architect,
    beds, baths, sqft, modules, storiesMax, priceFrom, priceBand, priceNote, timelineMonths,
    specs[]{ label, value },
    finishLevels[]{ name, tagline, from, includes },
    faq[]{ question, answer },
    body,
    "plans": *[_type == "plan" && series._ref == ^._id && defined(slug.current)] | order(sqft asc){
      name, "slug": slug.current, lede, beds, baths, sqft, modules, stories, priceFrom,
      dimensions[]{ label, value }, "pdf": pdf.asset->url
    }
  }
}`;

type Block = { _type?: string; children?: { text?: string }[]; style?: string };
type Section = {
  _type?: string;
  eyebrow?: string;
  headline?: string;
  title?: string;
  intro?: string;
  lede?: string;
  description?: string;
  items?: unknown;
  body?: Block[];
  text?: string;
  subline?: string;
  headers?: string[];
  cards?: { title?: string; body?: string; meta?: string }[];
  panels?: { title?: string; eyebrow?: string; body?: string }[];
  rows?: { label?: string; value?: string; cells?: string[] }[];
  stats?: { value?: number | string; label?: string }[];
  steps?: { title?: string; body?: string; duration?: string }[];
  links?: { title?: string; description?: string }[];
  quote?: string;
  clientName?: string;
  clientDetail?: string;
  logos?: { name?: string }[];
  members?: ({ name?: string; role?: string; credentials?: string } | null)[];
  /* an experiment's control-variant sections (aliased in GROQ — a bare
     `variants[0].sections[]{}` attribute is a syntax error that made
     the whole query fall back to empty on the first production run) */
  variantSections?: Section[];
};
interface Data {
  settings: { companyName?: string; tagline?: string; phone?: string; email?: string; address?: string; city?: string; region?: string } | null;
  pages: { title: string; slug: string; _updatedAt?: string; description: string; sections?: Section[]; body?: Block[] }[];
  projects: {
    title: string; slug: string; category?: string; summary?: string; location?: string; series?: string;
    squareFeet?: number; bedrooms?: number; bathrooms?: number; modules?: number; timelineMonths?: number;
    costBand?: string; completedYear?: number; challenge?: string; approach?: string; _updatedAt?: string;
    testimonial?: { quote?: string; clientName?: string; clientDetail?: string; rating?: number } | null;
  }[];
  posts: {
    title: string; slug: string; excerpt?: string; publishedAt?: string; _updatedAt?: string; body?: Block[];
    author?: string; reviewedBy?: string; categories?: string[];
  }[];
  series: {
    name: string; slug: string; tagline?: string; lede?: string; _updatedAt?: string; architect?: string;
    beds?: Rng; baths?: Rng; sqft?: Rng; modules?: Rng; storiesMax?: number;
    priceFrom?: number; priceBand?: string; priceNote?: string; timelineMonths?: Rng;
    specs?: { label?: string; value?: string }[];
    finishLevels?: { name?: string; tagline?: string; from?: number; includes?: string[] }[];
    faq?: { question?: string; answer?: string }[];
    body?: Block[];
    plans: {
      name: string; slug: string; lede?: string; beds?: number; baths?: number; sqft?: number; modules?: number;
      stories?: number; priceFrom?: number; dimensions?: { label?: string; value?: string }[]; pdf?: string;
    }[];
  }[];
}
type Rng = { min?: number; max?: number } | null;

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const rng = (r?: Rng, unit = "") => {
  if (!r || (r.min == null && r.max == null)) return "";
  const f = (n: number) => n.toLocaleString("en-US");
  const v = r.min != null && r.max != null && r.min !== r.max ? `${f(r.min)}–${f(r.max)}` : f((r.min ?? r.max)!);
  return unit ? `${v} ${unit}` : v;
};

const clean = (s?: string | null) => (s ?? "").replace(/\s+/g, " ").trim();
const month = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) : "");

/* Portable Text → paragraphs (headings kept as "## "), truncated at a
   sentence boundary */
function portable(blocks: Block[] | undefined, max = Infinity): string {
  if (!Array.isArray(blocks)) return "";
  const out: string[] = [];
  let len = 0;
  for (const b of blocks) {
    if (b?._type !== "block") continue;
    const text = clean((b.children ?? []).map((c) => c.text ?? "").join(""));
    if (!text) continue;
    const line = /^h[1-4]$/.test(b.style ?? "") ? `## ${text}` : text;
    if (len + line.length > max) {
      const room = max - len;
      if (room > 80) out.push(`${line.slice(0, room).replace(/\s+\S*$/, "")}…`);
      break;
    }
    out.push(line);
    len += line.length;
  }
  return out.join("\n\n");
}

function sectionText(s: Section): string[] {
  const out: string[] = [];
  const head = clean(s.headline || s.title);
  if (head) out.push(`## ${head}`);
  else if (s.eyebrow) out.push(`## ${clean(s.eyebrow)}`);
  for (const p of [s.lede, s.intro, s.description]) if (clean(p)) out.push(clean(p));
  if (Array.isArray(s.items)) {
    for (const it of s.items as { question?: string; answer?: string; title?: string; body?: string }[]) {
      if (it?.question && it.answer) out.push(`Q: ${clean(it.question)}\nA: ${clean(it.answer)}`);
      else if (it?.title || it?.body) out.push(`- ${[clean(it.title), clean(it.body)].filter(Boolean).join(": ")}`);
    }
  }
  if (clean(s.text)) out.push([clean(s.text), clean(s.subline)].filter(Boolean).join(" — "));
  for (const c of s.cards ?? []) if (c.title || c.body) out.push(`- ${[clean(c.title), clean(c.body), clean(c.meta)].filter(Boolean).join(": ")}`);
  for (const p of s.panels ?? []) if (p.title || p.body) out.push(`- ${[clean(p.eyebrow), clean(p.title), clean(p.body)].filter(Boolean).join(": ")}`);
  if (s.headers?.length && s.rows?.some((r) => r.cells?.length)) {
    out.push(`| ${s.headers.map(clean).join(" | ")} |`);
    for (const r of s.rows ?? []) if (r.label) out.push(`| ${[clean(r.label), ...(r.cells ?? []).map(clean)].join(" | ")} |`);
  } else {
    for (const r of s.rows ?? []) if (r.label) out.push(`- ${clean(r.label)}: ${clean(r.value)}`);
  }
  for (const st of s.stats ?? []) if (st.label) out.push(`- ${st.value ?? ""} ${clean(st.label)}`.trim());
  (s.steps ?? []).forEach((st, i) => { if (st.title) out.push(`${i + 1}. ${clean(st.title)}${st.body ? ` — ${clean(st.body)}` : ""}${st.duration ? ` (${clean(st.duration)})` : ""}`); });
  for (const l of s.links ?? []) if (l.title) out.push(`- ${clean(l.title)}${l.description ? `: ${clean(l.description)}` : ""}`);
  if (s.quote && s.clientName) out.push(`“${clean(s.quote)}” — ${clean(s.clientName)}${s.clientDetail ? `, ${clean(s.clientDetail)}` : ""}`);
  if (s.logos?.length) out.push(`Partners & certifications: ${s.logos.map((l) => clean(l.name)).filter(Boolean).join(", ")}`);
  for (const m of s.members ?? []) if (m?.name) out.push(`- ${clean(m.name)}${m.role ? `, ${clean(m.role)}` : ""}${m.credentials ? ` (${clean(m.credentials)})` : ""}`);
  const body = portable(s.body);
  if (body) out.push(body);
  /* experiments: the control variant's sections are the page's canon */
  for (const v of s.variantSections ?? []) out.push(...sectionText(v));
  return out;
}

export async function GET() {
  const data = await sanityFetch<Data>(query, {}, { settings: null, pages: [], projects: [], posts: [], series: [] });
  const name = data.settings?.companyName || designops.aeo.brand;
  const org = designops.aeo.organization;
  const s = data.settings;

  const out: string[] = [
    `# ${name} — full text`,
    "",
    `> ${name} designs and builds architect-led prefab (modular) homes — predesigned series and custom residences — manufactured indoors and delivered to sites across ${org.areaServed.join(", ")}.${s?.tagline ? ` ${s.tagline}` : ""}`,
    "",
    `Site: ${BASE} · Map: ${BASE}/llms.txt · Sitemap: ${BASE}/sitemap.xml`,
    ...(org.foundingDate ? [`Founded: ${org.foundingDate}${org.foundingLocation ? `, ${org.foundingLocation}` : ""}`] : []),
    ...(s?.phone || s?.email ? [`Contact: ${[s?.phone, s?.email].filter(Boolean).join(" · ")}`] : []),
    ...(s?.address || s?.city ? [`Address: ${[clean(s?.address), [s?.city, s?.region].filter(Boolean).join(", ")].filter(Boolean).join(", ")}`] : []),
    `Service area: ${org.areaServed.join(", ")}`,
    "",
    "This file is the full-text companion to /llms.txt: every public page's copy, every project's facts and every journal post, in one document. Quote with the page URL given under each heading.",
  ];

  if (data.pages.length) {
    out.push("", "# Pages");
    for (const p of data.pages) {
      const path = p.slug === "home" ? "/" : `/${p.slug}`;
      out.push("", `# ${p.title}`, `URL: ${BASE}${path}${p._updatedAt ? ` · Updated ${month(p._updatedAt)}` : ""}`);
      if (p.description) out.push("", clean(p.description));
      const seen = new Set<string>();
      for (const sec of p.sections ?? []) {
        for (const line of sectionText(sec)) {
          if (seen.has(line)) continue;
          seen.add(line);
          out.push("", line);
        }
      }
      const body = portable(p.body);
      if (body) out.push("", body);
    }
  }

  if (data.series.length) {
    out.push("", "# Predesigned series", "", `Index: ${BASE}/predesigned`);
    for (const s of data.series) {
      out.push("", `## ${s.name} series`, `URL: ${BASE}/series/${s.slug}${s._updatedAt ? ` · Updated ${month(s._updatedAt)}` : ""}`);
      if (s.tagline) out.push(clean(s.tagline));
      if (s.lede) out.push(clean(s.lede));
      const facts = [
        rng(s.beds) && `Bedrooms: ${rng(s.beds)}`,
        rng(s.baths) && `Bathrooms: ${rng(s.baths)}`,
        rng(s.sqft) && `Size: ${rng(s.sqft, "sq ft")}`,
        rng(s.modules) && `Modules: ${rng(s.modules)}`,
        s.storiesMax && `Stories: up to ${s.storiesMax}`,
        s.priceFrom ? `Starting price: ${usd(s.priceFrom)}` : s.priceBand && `Price band: ${s.priceBand}`,
        s.priceNote && `Price includes: ${clean(s.priceNote)}`,
        rng(s.timelineMonths) && `Contract to keys: ${rng(s.timelineMonths, "months")}`,
        s.architect && `Design: ${s.architect}`,
        s.plans.length && `Floor plans: ${s.plans.length}`,
      ].filter(Boolean) as string[];
      if (facts.length) out.push(facts.map((f) => `- ${f}`).join("\n"));
      for (const r of s.specs ?? []) if (r.label) out.push(`- ${clean(r.label)}: ${clean(r.value)}`);
      for (const f of s.finishLevels ?? []) if (f.name) out.push(`- Finish level ${clean(f.name)}${f.from ? ` from ${usd(f.from)}` : ""}${f.tagline ? ` — ${clean(f.tagline)}` : ""}${f.includes?.length ? `. Includes: ${f.includes.map(clean).join("; ")}` : ""}`);
      const body = portable(s.body, 2500);
      if (body) out.push(body);
      for (const q of s.faq ?? []) if (q.question && q.answer) out.push(`Q: ${clean(q.question)}\nA: ${clean(q.answer)}`);
      for (const p of s.plans) {
        out.push("", `### ${p.name}`, `URL: ${BASE}/series/${s.slug}/${p.slug}`);
        if (p.lede) out.push(clean(p.lede));
        const pf = [
          p.beds != null && `Bedrooms: ${p.beds}`,
          p.baths != null && `Bathrooms: ${p.baths}`,
          p.sqft && `Size: ${p.sqft.toLocaleString()} sq ft`,
          p.modules && `Modules: ${p.modules}`,
          p.stories && `Stories: ${p.stories}`,
          p.priceFrom && `Starting price: ${usd(p.priceFrom)}`,
          p.pdf && `Floor plan PDF: ${p.pdf}`,
        ].filter(Boolean) as string[];
        if (pf.length) out.push(pf.map((f) => `- ${f}`).join("\n"));
        for (const d of p.dimensions ?? []) if (d.label) out.push(`- ${clean(d.label)}: ${clean(d.value)}`);
      }
    }
  }

  if (data.projects.length) {
    out.push("", "# Projects", "", `Index: ${BASE}/projects`);
    for (const p of data.projects) {
      out.push("", `## ${p.title}`, `URL: ${BASE}/projects/${p.slug}`);
      const facts = [
        p.location && `Location: ${p.location}`,
        p.series && `Series: ${p.series}`,
        p.category && `Category: ${p.category}`,
        p.squareFeet && `Size: ${p.squareFeet.toLocaleString()} sq ft`,
        p.bedrooms && `Bedrooms: ${p.bedrooms}`,
        p.bathrooms && `Bathrooms: ${p.bathrooms}`,
        p.modules && `Modules: ${p.modules}`,
        p.timelineMonths && `Contract to keys: ${p.timelineMonths} months`,
        p.costBand && `Cost band: ${p.costBand}`,
        p.completedYear && `Completed: ${p.completedYear}`,
      ].filter(Boolean) as string[];
      if (facts.length) out.push(facts.map((f) => `- ${f}`).join("\n"));
      if (p.summary) out.push(clean(p.summary));
      if (p.challenge) out.push(`The brief: ${clean(p.challenge)}`);
      if (p.approach) out.push(`What we did: ${clean(p.approach)}`);
      if (p.testimonial?.quote && p.testimonial.clientName) {
        out.push(`Client: “${clean(p.testimonial.quote)}” — ${p.testimonial.clientName}${p.testimonial.clientDetail ? `, ${p.testimonial.clientDetail}` : ""}${p.testimonial.rating ? ` (${p.testimonial.rating}/5)` : ""}`);
      }
    }
  }

  if (data.posts.length) {
    out.push("", "# Journal", "", `Index: ${BASE}/blog`);
    for (const p of data.posts) {
      const by = [p.author && `By ${p.author}`, p.reviewedBy && `Reviewed by ${p.reviewedBy}`].filter(Boolean).join(" · ");
      out.push(
        "",
        `## ${p.title}`,
        `URL: ${BASE}/blog/${p.slug}${p.publishedAt ? ` · Published ${month(p.publishedAt)}` : ""}${p._updatedAt && p.publishedAt && p._updatedAt.slice(0, 7) !== p.publishedAt.slice(0, 7) ? ` · Updated ${month(p._updatedAt)}` : ""}${by ? ` · ${by}` : ""}${p.categories?.length ? ` · ${p.categories.join(", ")}` : ""}`,
      );
      if (p.excerpt) out.push("", clean(p.excerpt));
      const body = portable(p.body, 1500);
      if (body) out.push("", body);
    }
  }

  return new Response(out.join("\n") + "\n", {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600, s-maxage=3600" },
  });
}

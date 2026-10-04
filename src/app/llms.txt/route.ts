import { groq } from "next-sanity";

import { sanityFetch } from "@/sanity/lib/fetch";

import designops from "../../../designops.config.json";

/*
  /llms.txt (llmstxt.org): a plain-text map of the site for language
  models — what the company is, then the pages worth reading with a
  one-line description each. Built from the CMS on each request window
  (ISR) so new pages and posts show up without a deploy; static routes
  stand in when the CMS is unreachable.
*/
export const revalidate = 3600;

const BASE = designops.site.baseUrl;

const query = groq`{
  "settings": *[_type == "siteSettings"][0]{ companyName, tagline },
  "pages": *[_type == "page" && defined(slug.current) && slug.current != "home" && protected != true]
    | order(title asc){ title, "slug": slug.current, "description": coalesce(seo.description, "") },
  "posts": *[_type == "post" && defined(slug.current) && defined(publishedAt)]
    | order(publishedAt desc)[0...40]{ title, "slug": slug.current, excerpt, publishedAt },
  "projects": *[_type == "project" && defined(slug.current)]
    | order(completedYear desc)[0...40]{ title, "slug": slug.current, location, completedYear },
  "series": *[_type == "series" && defined(slug.current)] | order(order asc, name asc){
    name, "slug": slug.current, tagline, sqft, priceFrom, priceBand,
    "plans": *[_type == "plan" && series._ref == ^._id && defined(slug.current)] | order(sqft asc){ name, "slug": slug.current, beds, sqft }
  }
}`;

interface Data {
  settings: { companyName?: string; tagline?: string } | null;
  pages: { title: string; slug: string; description: string }[];
  posts: { title: string; slug: string; excerpt?: string; publishedAt?: string }[];
  projects: { title: string; slug: string; location?: string; completedYear?: number }[];
  series: {
    name: string; slug: string; tagline?: string; sqft?: { min?: number; max?: number } | null;
    priceFrom?: number; priceBand?: string;
    plans: { name: string; slug: string; beds?: number; sqft?: number }[];
  }[];
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

const line = (title: string, path: string, note?: string) =>
  `- [${title}](${BASE}${path})${note ? `: ${note.replace(/\s+/g, " ").trim()}` : ""}`;

export async function GET() {
  const data = await sanityFetch<Data>(query, {}, { settings: null, pages: [], posts: [], projects: [], series: [] });
  const name = data.settings?.companyName || designops.aeo.brand;
  const org = designops.aeo.organization;

  const out = [
    `# ${name}`,
    "",
    `> ${name} designs and builds architect-led prefab (modular) homes — predesigned series and custom residences — manufactured indoors and delivered to sites across ${org.areaServed.join(", ")}.${data.settings?.tagline ? ` ${data.settings.tagline}` : ""}`,
    "",
    `Site: ${BASE} · Sitemap: ${BASE}/sitemap.xml · Full text: ${BASE}/llms-full.txt`,
    "",
    "## Start here",
    line("Home", "/", "overview of the series, process and recent projects"),
    line("Get started", "/get-started", "the project intake: tell us about your site, timeline, size and budget and we match you to a series"),
    line("Projects", "/projects", "completed homes with location, size and series"),
    line("Journal", "/blog", "articles on prefab construction, design and process"),
  ];

  if (data.pages.length) {
    out.push("", "## Pages");
    for (const p of data.pages) out.push(line(p.title, `/${p.slug}`, p.description));
  }
  if (data.series.length) {
    out.push("", "## Predesigned series");
    for (const s of data.series) {
      const size = s.sqft?.min && s.sqft?.max ? `${s.sqft.min.toLocaleString()}–${s.sqft.max.toLocaleString()} sq ft` : s.sqft?.min ? `from ${s.sqft.min.toLocaleString()} sq ft` : "";
      const price = s.priceFrom ? `from ${usd(s.priceFrom)}` : s.priceBand || "";
      out.push(line(`${s.name} series`, `/series/${s.slug}`, [s.tagline, size, price, s.plans.length ? `${s.plans.length} floor plan${s.plans.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")));
      for (const p of s.plans) out.push(`  ${line(p.name, `/series/${s.slug}/${p.slug}`, [p.beds != null ? `${p.beds} bed` : "", p.sqft ? `${p.sqft.toLocaleString()} sq ft` : ""].filter(Boolean).join(", "))}`);
    }
  }
  if (data.projects.length) {
    out.push("", "## Projects");
    for (const p of data.projects) out.push(line(p.title, `/projects/${p.slug}`, [p.location, p.completedYear].filter(Boolean).join(", ")));
  }
  if (data.posts.length) {
    out.push("", "## Journal");
    for (const p of data.posts) out.push(line(p.title, `/blog/${p.slug}`, p.excerpt));
  }

  return new Response(out.join("\n") + "\n", {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600, s-maxage=3600" },
  });
}

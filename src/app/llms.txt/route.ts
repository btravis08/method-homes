import { groq } from "next-sanity";

import { JOURNAL_CATEGORIES } from "@/components/journal/articles";
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
    | order(completedYear desc)[0...40]{ title, "slug": slug.current, location, completedYear }
}`;

interface Data {
  settings: { companyName?: string; tagline?: string } | null;
  pages: { title: string; slug: string; description: string }[];
  posts: { title: string; slug: string; excerpt?: string; publishedAt?: string }[];
  projects: { title: string; slug: string; location?: string; completedYear?: number }[];
}

const line = (title: string, path: string, note?: string) =>
  `- [${title}](${BASE}${path})${note ? `: ${note.replace(/\s+/g, " ").trim()}` : ""}`;

export async function GET() {
  const data = await sanityFetch<Data>(query, {}, { settings: null, pages: [], posts: [], projects: [] });
  const name = data.settings?.companyName || designops.aeo.brand;
  const org = designops.aeo.organization;

  const out = [
    `# ${name}`,
    "",
    `> ${name} designs and builds architect-led prefab (modular) homes — predesigned series and custom residences — manufactured indoors and delivered to sites across ${org.areaServed.join(", ")}.${data.settings?.tagline ? ` ${data.settings.tagline}` : ""}`,
    "",
    `Site: ${BASE} · Sitemap: ${BASE}/sitemap.xml`,
    "",
    "## Start here",
    line("Home", "/", "overview of the series, process and recent projects"),
    line("Get started", "/get-started", "the project intake: tell us about your site, timeline, size and budget and we match you to a series"),
    line("Projects", "/projects", "completed homes with location, size and series"),
    line("Journal", "/journal", "articles on prefab construction, design and process"),
  ];

  if (data.pages.length) {
    out.push("", "## Pages");
    for (const p of data.pages) out.push(line(p.title, `/${p.slug}`, p.description));
  }
  if (data.projects.length) {
    out.push("", "## Projects");
    for (const p of data.projects) out.push(line(p.title, `/projects/${p.slug}`, [p.location, p.completedYear].filter(Boolean).join(", ")));
  }
  out.push("", "## Journal");
  if (data.posts.length) {
    for (const p of data.posts) out.push(line(p.title, `/journal/${p.slug}`, p.excerpt));
  } else {
    for (const c of JOURNAL_CATEGORIES) for (const a of c.articles) out.push(line(a.title, `/journal/${a.slug}`));
  }

  out.push("", "## Optional", line("Legacy site", "/legacy", "the previous methodhomes.net, kept for reference"));

  return new Response(out.join("\n") + "\n", {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600, s-maxage=3600" },
  });
}

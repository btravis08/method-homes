import { sanityFetch } from "@/sanity/lib/fetch";
import { rssPostsQuery } from "@/sanity/lib/queries";

import designops from "../../../../../designops.config.json";

/*
  RSS 2.0 feed for the Honors Journal — the newest 50 CMS posts.
  Linked from the journal landing via an alternate link so readers
  and aggregators discover it. Regenerates hourly; an unreachable
  CMS yields a valid, empty channel rather than an error.
*/

export const revalidate = 3600;

interface RssPost {
  title?: string;
  slug?: string;
  excerpt?: string;
  publishedAt?: string;
  tags?: string[];
  categories?: string[];
  author?: string;
}

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export async function GET() {
  const base = designops.site.baseUrl;
  const posts = await sanityFetch<RssPost[]>(rssPostsQuery, {}, []);

  const items = posts
    .filter((post) => post.slug && post.title)
    .map((post) => {
      const url = `${base}/journal/${post.slug}`;
      const labels = [...(post.categories ?? []), ...(post.tags ?? [])];
      return [
        "    <item>",
        `      <title>${escapeXml(post.title!)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        post.excerpt
          ? `      <description>${escapeXml(post.excerpt)}</description>`
          : null,
        post.publishedAt
          ? `      <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>`
          : null,
        post.author
          ? `      <dc:creator>${escapeXml(post.author)}</dc:creator>`
          : null,
        ...labels.map(
          (label) => `      <category>${escapeXml(label)}</category>`,
        ),
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(`${designops.site.name} — Honors Journal`)}</title>
    <link>${escapeXml(`${base}/journal`)}</link>
    <atom:link href="${escapeXml(`${base}/journal/rss.xml`)}" rel="self" type="application/rss+xml"/>
    <description>People, ideas, &amp; culture — stories from the course and beyond the red.</description>
    <language>en-US</language>
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

import type { Metadata, Viewport } from "next";

import { JournalLanding } from "@/components/journal/JournalLanding";
import { JsonLd, webPage } from "@/components/seo/JsonLd";
import { sanityFetch } from "@/sanity/lib/fetch";
import { urlFor } from "@/sanity/lib/image";
import { journalPostsQuery } from "@/sanity/lib/queries";
import type { SanityImageSource } from "@sanity/image-url";

import designops from "../../../../designops.config.json";

export const metadata: Metadata = {
  title: "Journal",
  description: "Articles on prefab construction, design and process from Method Homes.",
  alternates: {
    canonical: `${designops.site.baseUrl}/journal`,
    types: { "application/rss+xml": "/journal/rss.xml" },
  },
  openGraph: {
    title: "Journal",
    description: "Articles on prefab construction, design and process from Method Homes.",
    url: `${designops.site.baseUrl}/journal`,
  },
};

/* pin iOS bar chrome to the light surface (matches the page ground) */
export const viewport: Viewport = { themeColor: "#f7f8f4" };

interface JournalPost {
  title?: string;
  slug?: string;
  heroImage?: SanityImageSource;
  category?: string;
}

export default async function JournalPage() {
  /* CMS posts join their category\u2019s landing stream, newest first */
  const posts = await sanityFetch<JournalPost[]>(journalPostsQuery, {}, []);
  const extraStreams: Record<
    string,
    { src: string; ratio: string; href: string }[]
  > = {};
  for (const post of posts) {
    if (!post.slug || !post.category || !post.heroImage) continue;
    let src: string;
    try {
      src = urlFor(post.heroImage).width(700).url();
    } catch {
      continue;
    }
    (extraStreams[post.category] ??= []).push({
      src,
      ratio: "3 / 4",
      href: `/journal/${post.slug}`,
    });
  }

  return (
    <>
      <JsonLd data={webPage({ type: "Blog", name: "Journal", description: "Articles on prefab construction, design and process from Method Homes.", path: "/journal" })} />
      <JournalLanding extraStreams={extraStreams} />
    </>
  );
}

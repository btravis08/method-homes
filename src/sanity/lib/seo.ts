import type { Metadata } from "next";

import { urlFor } from "@/sanity/lib/image";
import designops from "../../../designops.config.json";

/*
  Builds a route's Metadata from a document's seo object + sensible
  fallbacks — one place for the title/description/canonical/robots/
  OpenGraph logic every generateMetadata shares.

  `image` is the OG fallback when seo.ogImage isn't set; leave it out
  on routes with their own opengraph-image (the PDP) so the generated
  card keeps serving unless an editor explicitly overrides it.
*/

import type { SeoDoc } from "@/sanity/types";

export function seoMeta(opts: {
  seo?: SeoDoc | null;
  title: string;
  description?: string | null;
  path: string;
  image?: unknown;
}): Metadata {
  const title = opts.seo?.title || opts.title;
  const description = opts.seo?.description || opts.description || undefined;
  const canonical = opts.seo?.canonical || `${designops.site.baseUrl}${opts.path}`;

  let ogUrl: string | undefined;
  const source = opts.seo?.ogImage ?? opts.image;
  if (source && typeof source === "object" && "asset" in (source as object)) {
    try {
      ogUrl = urlFor(source).width(1200).height(630).fit("crop").url();
    } catch {
      /* malformed image reference — skip the OG image */
    }
  }

  return {
    title,
    ...(description ? { description } : {}),
    alternates: { canonical },
    ...(opts.seo?.noindex ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      title,
      ...(description ? { description } : {}),
      url: canonical,
      ...(ogUrl ? { images: [{ url: ogUrl, width: 1200, height: 630 }] } : {}),
    },
  };
}

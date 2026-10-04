import type { MetadataRoute } from "next";
import { groq } from "next-sanity";

import { sanityFetch } from "@/sanity/lib/fetch";

/*
  CMS-driven sitemap: static routes + every published page, active
  product, and collection with a slug. Falls back to the static
  routes alone when the CMS is unreachable.
*/

import designops from "../../designops.config.json";

const BASE = designops.site.baseUrl;

const slugsQuery = groq`{
  "pages": *[_type == "page" && defined(slug.current) && slug.current != "home"
    && protected != true].slug.current,
  "products": *[_type == "product" && (!defined(status) || status == "active") && defined(slug.current)].slug.current,
  "collections": *[_type == "collection" && defined(slug.current)].slug.current,
  "posts": *[_type == "post" && defined(slug.current)].slug.current,
  "postCategories": *[_type == "postCategory" && defined(slug.current)
    && count(*[_type == "post" && ^.slug.current in categories[]->slug.current]) > 0
  ].slug.current,
  "series": *[_type == "series" && defined(slug.current)].slug.current,
  "plans": *[_type == "plan" && defined(slug.current) && defined(series->slug.current)]{
    "slug": slug.current, "series": series->slug.current
  }
}`;

interface Slugs {
  pages: string[];
  products: string[];
  collections: string[];
  posts: string[];
  postCategories: string[];
  series: string[];
  plans: { slug: string; series: string }[];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { pages, products, collections, posts, postCategories, series, plans } =
    await sanityFetch<Slugs>(slugsQuery, {}, {
      pages: [],
      products: [],
      collections: [],
      posts: [],
      postCategories: [],
      series: [],
      plans: [],
    });

  const entry = (
    path: string,
    priority: number,
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"],
  ): MetadataRoute.Sitemap[number] => ({
    url: `${BASE}${path}`,
    changeFrequency,
    priority,
  });

  return [
    entry("/", 1, "daily"),
    entry("/legacy", 0.8, "monthly"),
    entry("/blog", 0.7, "weekly"),
    /* the built-in design articles (JOURNAL_CATEGORIES) are the CMS-less
       fallback, not Method content — they stay out of the sitemap */
    ...pages.map((slug) => entry(`/${slug}`, 0.6, "weekly")),
    ...series.map((slug) => entry(`/series/${slug}`, 0.9, "weekly")),
    ...plans.map((p) => entry(`/series/${p.series}/${p.slug}`, 0.7, "monthly")),
    ...collections.map((slug) => entry(`/collections/${slug}`, 0.8, "daily")),
    ...products.map((slug) => entry(`/products/${slug}`, 0.7, "weekly")),
    ...posts.map((slug) => entry(`/blog/${slug}`, 0.6, "weekly")),
    ...postCategories.map((slug) =>
      entry(`/blog/category/${slug}`, 0.5, "weekly"),
    ),
  ];
}

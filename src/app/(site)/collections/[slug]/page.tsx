import type { Metadata } from "next";

import { CollectionExplorer } from "@/components/collection/CollectionExplorer";
import { redirect } from "next/navigation";
import { resolveRedirect } from "@/sanity/lib/redirects";
import type { CardMeta, ExplorerItem, StoryData } from "@/components/collection/CollectionExplorer";
import { FooterTagline } from "@/components/FooterTagline";
import { NavTextLink } from "@/components/NavTextLink";
import { SmartLink } from "@/components/SmartLink";
import type { ProductCardData } from "@/components/home/ProductCard";
import { activeOnly, productsForCollection, toCards } from "@/components/SectionRenderer";
import { sanityFetch } from "@/sanity/lib/fetch";
import { urlFor } from "@/sanity/lib/image";
import { seoMeta } from "@/sanity/lib/seo";
import {
  automaticDiscountsQuery,
  collectionBySlugQuery,
  productsByTagQuery,
  storeSettingsQuery,
  storiesForCollectionQuery,
} from "@/sanity/lib/queries";
import type {
  CollectionDoc,
  Discount,
  SliderProduct,
  StoreSettings,
  StoryDoc,
} from "@/sanity/types";
import type { SanityImageSource } from "@sanity/image-url";

/*
  Collection page (PLP): centered breadcrumb + serif title, subcategory
  chips linking one level deeper (leaf pages show none), then the
  client-side explorer — FILTER & SORT modal, borderless 1px-gap
  product grid with story cards, and complete-rows-only load more.
*/

/* Gender-scoped collections are titled uniquely ("Mens Polos") so the
   Studio list has no duplicates; on the page the parent prefix comes
   off — breadcrumb MENS / POLOS, title Polos, chips POLOS. */
function leaf(title: string, parentTitle?: string | null) {
  return parentTitle && title.toLowerCase().startsWith(`${parentTitle.toLowerCase()} `)
    ? title.slice(parentTitle.length + 1)
    : title;
}

function img(source: SanityImageSource | undefined, width = 1600) {
  if (!source) return undefined;
  try {
    return urlFor(source).width(width).url();
  } catch {
    return undefined;
  }
}

/* Filterable facets for one product; every colorway card from the
   product shares them */
function toMeta(product: SliderProduct): CardMeta {
  const sizes =
    product.options?.find((option) => option.name?.toLowerCase() === "size")?.values ??
    [];
  const colors = (product.variants ?? [])
    .filter((variant) => variant.name || variant.color)
    .map((variant) => ({
      label: (variant.name ?? "").split("/")[0].trim() || "Color",
      hex: variant.color,
    }));
  const legacyPrice = parseFloat((product.price ?? "").replace(/[^0-9.]/g, ""));
  return {
    productType: product.productType,
    gender: product.gender,
    price:
      typeof product.pricing?.price === "number"
        ? product.pricing.price
        : Number.isNaN(legacyPrice)
          ? undefined
          : legacyPrice,
    sizes,
    colors,
    postedAt: product.postedAt,
  };
}

/* Fallback content so the template renders before the first seed */
const FALLBACK_STORIES: StoryData[] = [
  {
    title: "Lorem Ipsum Dolor",
    body: "Cras erat viverra quam adipiscing eget. A ut sed molestie sollicitudin ac condimentum nunc lorem. At ullamcorper congue sed morbi odio in blandit adipiscing.",
    ctaLabel: "Explore the Collection",
    url: "#",
    image: "/figma/products/presidio-white-hover.png",
  },
  {
    title: "Lorem Ipsum Dolor",
    body: "Cras erat viverra quam adipiscing eget. A ut sed molestie sollicitudin ac condimentum nunc lorem. At ullamcorper congue sed morbi odio in blandit adipiscing.",
    ctaLabel: "Explore the Collection",
    url: "#",
    image: "/figma/products/presidio-black-hover.png",
    placement: "center",
  },
];

const FALLBACK_CHIPS = [
  "Polos",
  "T-Shirts",
  "Sweaters",
  "Hoodies & Pullovers",
  "Outerwear",
  "Pants",
  "Shorts",
];

const FALLBACK_DESCRIPTION =
  "Facilisis non aliquet morbi ultrices neque ac tempus, enim et vitae scelerisque risus integer ipsum sed sequat duis lectus. Rhoncus ut mauris id hendrerit mauris magna, nulla sagittis pulvinar risus elementum diam duis lectus, tuin turpis odio, facilisis ut proin vitae aliquam ac viverra.";

function Chip({ label, href }: { label: string; href: string }) {
  return (
    <SmartLink
      href={href}
      className="label flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-xs bg-wash px-3.5 font-medium text-ink transition-colors hover:opacity-80"
    >
      {label.toUpperCase()}
    </SmartLink>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const collection = await sanityFetch<CollectionDoc | null>(
    collectionBySlugQuery,
    { slug },
    null,
  );
  if (!collection) return { title: "Collection" };
  return seoMeta({
    seo: collection.seo,
    title: collection.title ?? "Collection",
    description: collection.description,
    path: `/collections/${slug}`,
    image: collection.image,
  });
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const collection = await sanityFetch<CollectionDoc | null>(
    collectionBySlugQuery,
    { slug },
    null,
  );
  if (!collection) {
    /* a retired collection may have a CMS-managed redirect */
    const hit = await resolveRedirect(`/collections/${slug}`);
    if (hit) redirect(hit.to);
  }
  /* a subcategory slug like mens-pants matches stories tagged either
     "mens" or "pants" */
  const storyKeys = Array.from(new Set([slug, ...slug.split("-")]));
  const [storyDocs, settings, discounts] = await Promise.all([
    sanityFetch<StoryDoc[]>(storiesForCollectionQuery, { keys: storyKeys }, []),
    sanityFetch<StoreSettings | null>(storeSettingsQuery, {}, null),
    sanityFetch<Discount[]>(automaticDiscountsQuery, {}, []),
  ]);

  let products: SliderProduct[] = collection
    ? await productsForCollection(collection)
    : [];
  if (!collection) {
    // CMS unreachable / unseeded: render the template with the catalog
    products = activeOnly(
      await sanityFetch<SliderProduct[]>(productsByTagQuery, { productTag: "all" }, []),
    );
  }

  const title = leaf(collection?.title ?? "Shop All", collection?.parent?.title);
  /* one card per product on the PLP (swatches still switch colorways),
     each paired with its filterable facets */
  const items: ExplorerItem[] = products
    .map((product): ExplorerItem | null => {
      const card = toCards(product, discounts, settings)[0];
      return card ? { card, meta: toMeta(product) } : null;
    })
    .filter((item): item is ExplorerItem => Boolean(item));
  const fallbackItems: ExplorerItem[] = Array.from({ length: 24 }, (_, i) => ({
    card: {
      _key: `fallback-${i}`,
      title: "Presidio",
      price: "$198.00",
      colorway: "Gray / Navy",
      colorCount: "+4 colors",
      image: "/figma/products/presidio-white.png",
      hoverImage: "/figma/products/presidio-white-hover.png",
    } satisfies ProductCardData,
    meta: {
      productType: "Footwear",
      gender: i % 2 === 0 ? "mens" : "womens",
      price: 198,
      sizes: ["7", "8", "9", "10", "11", "12"],
      colors: [{ label: "Gray", hex: "#cacbc8" }],
    },
  }));
  const gridItems = collection ? items : items.length ? items : fallbackItems;
  const stories: StoryData[] = storyDocs.length
    ? storyDocs.map((story) => ({
        title: story.title,
        body: story.body,
        ctaLabel: story.ctaLabel,
        url: story.url,
        image: img(story.image),
        placement: story.placement,
      }))
    : FALLBACK_STORIES;
  const chips = collection
    ? (collection.subcategories ?? []).filter((sub) => Boolean(sub?.slug))
    : FALLBACK_CHIPS.map((label) => ({ _id: label, title: label, slug: undefined }));

  return (
    <div data-mode="light" className="flex w-full flex-col bg-surface text-ink">
      {collection?.showFooterTagline && <FooterTagline />}
      {/* breadcrumb + centered serif title; crumbs use the nav link
          style, the current page keeps its underline drawn */}
      {/* mobile: 30% less air under the logo (144px -> ~101px) */}
      <div className="flex flex-col items-center gap-4 px-4 pb-10 pt-[6.3125rem] md:px-6 md:pt-36">
        <div className="flex items-center gap-3">
          {collection?.parent?.slug ? (
            <NavTextLink
              href={`/collections/${collection.parent.slug}`}
              label={(collection.parent.title ?? "").toUpperCase()}
            />
          ) : (
            <NavTextLink href="/" label="SHOP" />
          )}
          <span className="label text-ink-2">/</span>
          <NavTextLink label={title.toUpperCase()} active />
        </div>
        <h1 className="font-display text-headline-lg">{title}</h1>
      </div>

      {/* subcategory chips — one level deeper; leaf pages show none */}
      {chips.length > 0 && (
        <div className="no-scrollbar flex w-full justify-start gap-2 overflow-x-auto px-4 pb-8 md:justify-center md:px-6">
          {chips.map((sub) => (
            <Chip
              key={sub!._id}
              label={leaf(sub!.title ?? "", collection?.title)}
              href={sub!.slug ? `/collections/${sub!.slug}` : "#"}
            />
          ))}
        </div>
      )}

      <CollectionExplorer items={gridItems} stories={stories} />

      {/* collection description */}
      <p className="label px-4 pb-16 text-ink-3 md:px-6">
        {collection?.description ?? FALLBACK_DESCRIPTION}
      </p>
    </div>
  );
}

"use client";

import { useMemo } from "react";

import type { ProductCardData } from "@/components/home/ProductCard";
import { SectionList } from "@/components/preview/SectionList";
import { buildProductView, ProductPageView } from "@/components/product/ProductPageView";
import { previewClient } from "@/sanity/lib/client";
import { useLiveMode, useQuery } from "@/sanity/lib/preview-store";
import { productBySlugQuery } from "@/sanity/lib/queries";
import type { Discount, ProductFull, SliderProduct, StoreSettings } from "@/sanity/types";

/*
  Draft-mode PDP shell: the product document streams in live from the
  Studio (pre-save), and the whole view model rebuilds from it on
  every edit — title, description, detail links, imagery, sections.
  Related/pairs product lists and slider cards are server-resolved
  snapshots (they change through OTHER documents, rarely mid-edit).
*/

function LiveMode() {
  useLiveMode({ client: previewClient });
  return null;
}

export function ProductPreview({
  slug,
  initial,
  settings,
  discounts,
  related,
  homeHeroImage,
  sliderCards,
}: {
  slug: string;
  initial: ProductFull | null;
  settings: StoreSettings | null;
  discounts: Discount[];
  related: SliderProduct[];
  homeHeroImage?: string;
  sliderCards: Record<string, ProductCardData[]>;
}) {
  const { data } = useQuery<ProductFull | null>(
    productBySlugQuery,
    { slug },
    { initial: { data: initial, sourceMap: undefined, perspective: "drafts" } },
  );
  const product = data ?? initial;

  const model = useMemo(
    () => buildProductView(slug, product, { settings, discounts, related, homeHeroImage }),
    [slug, product, settings, discounts, related, homeHeroImage],
  );

  return (
    <>
      <ProductPageView
        model={model}
        sections={
          product?.sections?.length ? (
            <SectionList sections={product.sections} sliderCards={sliderCards} />
          ) : undefined
        }
      />
      <LiveMode />
    </>
  );
}

"use client";

import { FooterTagline } from "@/components/FooterTagline";
import { SectionList } from "@/components/preview/SectionList";
import type { ProductCardData } from "@/components/home/ProductCard";
import { previewClient } from "@/sanity/lib/client";
import { useLiveMode, useQuery } from "@/sanity/lib/preview-store";
import { pageBySlugQuery } from "@/sanity/lib/queries";
import type { Page } from "@/sanity/types";

/*
  Draft-mode shell for any page-builder page (home + /[slug]): renders
  the SAME section components as the server path, but from a live
  query subscription — inside Presentation, edits stream in BEFORE
  they save. Never rendered outside draft mode.
*/

function LiveMode() {
  useLiveMode({ client: previewClient });
  return null;
}

export function PagePreview({
  slug,
  initial,
  sliderCards,
}: {
  slug: string;
  initial: Page;
  sliderCards: Record<string, ProductCardData[]>;
}) {
  const { data } = useQuery<Page | null>(
    pageBySlugQuery,
    { slug },
    { initial: { data: initial, sourceMap: undefined, perspective: "drafts" } },
  );
  const page = data ?? initial;

  return (
    <div data-mode="light" className="flex flex-col items-start bg-surface">
      {page?.showFooterTagline && <FooterTagline />}
      {page?.sections?.length ? (
        <SectionList sections={page.sections} sliderCards={sliderCards} />
      ) : null}
      <LiveMode />
    </div>
  );
}

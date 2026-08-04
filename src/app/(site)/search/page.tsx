import type { Metadata } from "next";
import Link from "next/link";

import { ProductCard } from "@/components/home/ProductCard";
import { searchCatalog } from "@/sanity/lib/search";

/* Search results (structure per the Figma Search Results wireframe,
   33880:92735): query echo, counts, collection chips, product grid —
   the full-page twin of the flyout. */

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: true },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const { query, cards, collections } = await searchCatalog(q);

  return (
    <div data-mode="light" className="min-h-screen w-full bg-surface pt-24 text-ink">
      <header className="flex flex-col gap-4 px-6 pb-10">
        <p className="label font-medium text-ink-3">SEARCH</p>
        {query ? (
          <>
            <h1 className="font-display text-headline-md">“{query}”</h1>
            <p className="label text-ink-2">
              {cards.length} PRODUCT{cards.length === 1 ? "" : "S"}
              {collections.length > 0 &&
                ` · ${collections.length} COLLECTION${collections.length === 1 ? "" : "S"}`}
            </p>
          </>
        ) : (
          <h1 className="font-display text-headline-md">What are you looking for?</h1>
        )}
        {collections.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {collections.map((collection) => (
              <Link
                key={collection._id}
                href={`/collections/${collection.slug}`}
                className="label flex h-10 items-center rounded-xs bg-wash px-4 font-medium text-ink transition-opacity hover:opacity-80"
              >
                {collection.title.toUpperCase()}
              </Link>
            ))}
          </div>
        )}
      </header>

      {cards.length > 0 ? (
        <div className="grid grid-cols-2 gap-px border-t border-line lg:grid-cols-4">
          {cards.map((card, i) => (
            <ProductCard key={card.href ?? i} product={card} />
          ))}
        </div>
      ) : query ? (
        <div className="flex flex-col items-start gap-6 border-t border-line px-6 py-16">
          <p className="font-display text-title-md">
            Nothing matched “{query}”.
          </p>
          <Link
            href="/collections/shop-all"
            className="label flex h-12 items-center rounded-xs bg-btn px-[1.125rem] font-medium text-btn-fg transition-opacity hover:opacity-80"
          >
            SHOP ALL
          </Link>
        </div>
      ) : null}
    </div>
  );
}

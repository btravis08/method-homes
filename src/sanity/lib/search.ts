import { toCards } from "@/sanity/lib/cards";
import { sanityFetch } from "@/sanity/lib/fetch";
import {
  automaticDiscountsQuery,
  collectionSearchQuery,
  productSearchQuery,
  storeSettingsQuery,
} from "@/sanity/lib/queries";
import type { Discount, SliderProduct, StoreSettings } from "@/sanity/types";
import type { ProductCardData } from "@/components/home/ProductCard";

/*
  Catalog search, shared by the flyout's API route and the /search
  page. Products map through the same card pipeline the sliders use,
  so search results carry the full card behavior — hover imagery,
  colorway swatches, and automatic discounts applied to displayed
  prices.

  Synonyms: storeSettings.searchSynonyms holds editor-managed groups
  of equivalent terms ("tee, t-shirt, tshirt"). A search matching any
  term in a group also runs the group's other terms (capped at 4),
  with the typed term's results ranked first.
*/

export interface SearchResults {
  query: string;
  cards: ProductCardData[];
  collections: { _id: string; title: string; slug: string }[];
}

function expandTerms(term: string, groups: string[][] | undefined): string[] {
  const plain = term.toLowerCase();
  const out = [term];
  for (const group of groups ?? []) {
    if (group?.some((t) => t?.toLowerCase() === plain)) {
      for (const t of group) {
        if (t && t.toLowerCase() !== plain) out.push(t);
      }
    }
  }
  return out.slice(0, 4);
}

export async function searchCatalog(raw: string): Promise<SearchResults> {
  const term = raw.trim().slice(0, 64);
  if (term.length < 2) return { query: term, cards: [], collections: [] };

  /* settings first — they carry the synonym groups the product
     queries expand through */
  const [discounts, settings] = await Promise.all([
    sanityFetch<Discount[]>(automaticDiscountsQuery, {}, []),
    sanityFetch<StoreSettings | null>(storeSettingsQuery, {}, null),
  ]);

  const terms = expandTerms(term, settings?.searchSynonyms);
  const [collections, ...productSets] = await Promise.all([
    sanityFetch<SearchResults["collections"]>(
      collectionSearchQuery,
      { q: `${term}*` },
      [],
    ),
    ...terms.map((t) =>
      sanityFetch<SliderProduct[]>(
        productSearchQuery,
        { q: `${t}*`, plain: t.toLowerCase() },
        [],
      ),
    ),
  ]);

  /* merge in term order, dedupe by product id — the typed term wins */
  const seen = new Set<string>();
  const products: SliderProduct[] = [];
  for (const set of productSets) {
    for (const product of set) {
      if (!seen.has(product._id)) {
        seen.add(product._id);
        products.push(product);
      }
    }
  }

  return {
    query: term,
    /* first colorway card per product, like the sliders */
    cards: products.map((p) => toCards(p, discounts, settings)[0]).filter(Boolean),
    collections,
  };
}

import type { LookProductData } from "@/components/home/MediaBlock";
import type { ProductCardData } from "@/components/home/ProductCard";
import {
  basePrice,
  formatPrice,
  resolveDisplayPrice,
} from "@/sanity/lib/commerce";
import { urlFor } from "@/sanity/lib/image";
import type { Discount, SliderProduct, StoreSettings } from "@/sanity/types";
import type { SanityImageSource } from "@sanity/image-url";

/*
  Pure product→card mappers, client-safe ON PURPOSE: the draft-mode
  preview shells rebuild cards in the browser from live-streamed
  documents, so nothing here may import the fetch layer (next/headers)
  or any server-only module. SectionRenderer re-exports these for the
  server paths — import from here in client/preview code.
*/

export function cardImg(
  source: SanityImageSource | undefined,
  width = 2000,
): string | undefined {
  if (!source) return undefined;
  try {
    return urlFor(source).width(width).url();
  } catch {
    return undefined;
  }
}

/* Each color variant renders as its own card: the card defaults to
   that colorway but keeps every sibling variant switchable via the
   swatches. Products without variants yield a single card. Prices run
   through the store settings + active automatic discounts. */
export function toCards(
  product: SliderProduct,
  discounts: Discount[] = [],
  settings?: StoreSettings | null,
): ProductCardData[] {
  const displayed = resolveDisplayPrice(
    basePrice(product),
    product.pricing?.compareAtPrice,
    product,
    discounts,
    settings,
  );
  const variants = (product.variants ?? [])
    .filter((variant) => variant && (variant.name || variant.color))
    .map((variant) => {
      const own =
        typeof variant.price === "number"
          ? resolveDisplayPrice(
              variant.price,
              variant.compareAtPrice,
              product,
              discounts,
              settings,
            )
          : undefined;
      return {
        name: variant.name,
        color: variant.color,
        image: cardImg(variant.image, 800),
        hoverImage: cardImg(variant.hoverImage, 1200),
        price: own?.price,
        compareAtPrice: own?.compareAt,
      };
    });
  const base: ProductCardData = {
    title: product.title,
    href: product.slug ? `/products/${product.slug}` : undefined,
    price: displayed.price ?? formatPrice(product.price, settings),
    compareAtPrice: displayed.compareAt,
    gender: product.gender,
    colorway: variants[0]?.name,
    image: cardImg(product.thumb, 800),
    imageLqip: product.thumbLqip,
    hoverImage: cardImg(product.hoverImage, 1200),
    variants,
  };
  if (variants.length === 0) return [{ ...base, _key: product._id }];
  return variants.map((_, i) => ({
    ...base,
    _key: `${product._id}-${i}`,
    defaultVariant: i,
  }));
}

export const activeOnly = (products: Array<SliderProduct | null>) =>
  products.filter(
    (product): product is SliderProduct =>
      Boolean(product?._id) && (!product?.status || product.status === "active"),
  );

/* Shop-the-look product references become the mini cards hovered up
   from the bag button */
export function toLookCards(products?: Array<SliderProduct | null>): LookProductData[] {
  return (products ?? [])
    .filter((product): product is SliderProduct => Boolean(product?._id))
    .map((product) => ({
      _key: product._id,
      title: product.title,
      price: formatPrice(product.pricing?.price ?? product.price),
      colorway: product.variants?.[0]?.name,
      colorCount:
        product.variants && product.variants.length > 1
          ? `+${product.variants.length - 1} colors`
          : undefined,
      thumb: cardImg(product.variants?.[0]?.image ?? product.thumb, 200),
    }));
}

/* Manual collections honor their sort order in JS (the reference
   array itself is the manual order) */
export function sortProducts(products: SliderProduct[], sort?: string): SliderProduct[] {
  const num = (product: SliderProduct) =>
    typeof product.pricing?.price === "number" ? product.pricing.price : Infinity;
  switch (sort) {
    case "priceAsc":
      return [...products].sort((a, b) => num(a) - num(b));
    case "priceDesc":
      return [...products].sort((a, b) => num(b) - num(a));
    case "titleAsc":
      return [...products].sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
    case "newest":
      return [...products].sort(
        (a, b) => Date.parse(b.postedAt ?? "") - Date.parse(a.postedAt ?? ""),
      );
    default:
      return products;
  }
}

import dynamic from "next/dynamic";
import { PortableText } from "next-sanity";

import { FooterTagline } from "@/components/FooterTagline";
import { RegisterCartRecommendations } from "@/components/cart/CartContext";
import { CardAddButton, DetailLinks } from "@/components/product/DetailLinks";
import { ProductHero } from "@/components/product/ProductHero";
import type { HeroVariantData } from "@/components/product/ProductHero";
import { SmartLink } from "@/components/SmartLink";
import { VariantPanel } from "@/components/product/VariantPanel";
import type { ProductCardData } from "@/components/home/ProductCard";
import {
  Carousel,
  FiftyFifty,
  Gallery,
  InfoSlider,
  ProductSlider,
  Reviews,
  TechSpecs,
  ThreeDViewer,
} from "@/components/home/sections";
import { activeOnly, cardImg, toCards } from "@/sanity/lib/cards";
import type {
  Discount,
  ProductFull,
  SliderProduct,
  StoreSettings,
} from "@/sanity/types";

/* same split chunk the sections use — the pairs rail hydrates off the
   page's critical path (below the fold on mobile) */
const SliderShell = dynamic(() =>
  import("@/components/home/SliderShell").then((m) => m.SliderShell),
);

/*
  Shared PDP view + pure view-model builder. CLIENT-SAFE ON PURPOSE:
  the server route renders this directly, and the draft-mode preview
  shell re-renders it in the browser from live-streamed product data —
  so nothing here may import the fetch layer or other server-only
  modules. Data arrives fully resolved through the model.
*/

/* Template fallback (CMS unreachable / unseeded): the Presidio */
export const FALLBACK_DESCRIPTION =
  "The Presidio sets a new benchmark in spikeless performance, connecting you to the course like never before. The mesh-reinforced upper with strategic foam padding provides breathability and comfort for long days on the course.";

export const FALLBACK_PRODUCT = {
  title: "Presidio",
  price: "$198.00",
  images: [
    "/figma/products/presidio-white.png",
    "/figma/products/presidio-white-hover.png",
    "/figma/products/presidio-black.png",
  ],
  variants: [
    { name: "White / White", color: "#f4f4f2", image: "/figma/products/presidio-white.png" },
    { name: "White / Red", color: "#b01f24", image: "/figma/products/presidio-red.png" },
    { name: "Black / White", color: "#161716", image: "/figma/products/presidio-black.png" },
    { name: "White / Blue", color: "#4b74ad", image: "/figma/products/presidio-blue.png" },
  ],
  sizes: ["7", "8", "9", "10", "11", "12"],
};

export const FALLBACK_DETAIL_LINKS = [
  {
    label: "The Details",
    text: [
      "Engineered spikeless outsole with torsional traction plate. Mesh-reinforced upper with strategic foam padding for breathability and comfort across long days on the course.",
    ],
  },
  {
    label: "Fabric & Tech",
    text: [
      "Upper: 89% polyamide, 11% elastane. Dermacare breathability lining with moisture wicking throughout. 140 grams.",
    ],
  },
  {
    label: "Product Care",
    text: [
      "Spot clean with a soft brush and mild soap. Air dry away from direct heat. Do not machine wash.",
    ],
  },
];

export const FALLBACK_PAIRS: ProductCardData[] = [1, 2, 3, 4, 5].map((n) => ({
  _key: `pair-${n}`,
  title: "Presidio",
  price: "$198.00",
  colorway: "Gray / Navy",
  colorCount: "+4 colors",
  image: "/figma/products/presidio-white.png",
}));

export interface ProductHeroModel {
  title?: string;
  price?: string;
  compareAtPrice?: string;
  images: string[];
  variants?: HeroVariantData[];
  sizes?: string[];
}

export interface ProductViewModel {
  product: ProductFull | null;
  hero: ProductHeroModel;
  heroImages: string[];
  pairs: ProductCardData[];
  shopCards: ProductCardData[];
  pairsForCart: Array<{
    title: string;
    price?: string;
    image?: string;
    color?: string;
  }>;
  jsonLd: object | null;
}

/* Pure assembly of everything the view renders, shared by the server
   route and the live preview (which re-runs it on every streamed
   edit). `related` = products sharing the first tag (server-fetched);
   `homeHeroImage` = the CONTENT OVERRIDE slide for the Presidio. */
export function buildProductView(
  slug: string,
  product: ProductFull | null,
  extras: {
    settings: StoreSettings | null;
    discounts: Discount[];
    related: SliderProduct[];
    homeHeroImage?: string;
  },
): ProductViewModel {
  const { settings, discounts, homeHeroImage } = extras;
  const card = product ? toCards(product, discounts, settings)[0] : undefined;

  const hero: ProductHeroModel = product
    ? {
        title: product.title,
        price: card?.price,
        compareAtPrice: card?.compareAtPrice,
        images: (product.images ?? [])
          /* 1200w covers a 428px phone at 3x DPR */
          .map((image) => cardImg(image, 1200))
          .filter((src): src is string => Boolean(src)),
        variants: card?.variants,
        sizes: product.options
          ?.find((option) => option.name?.toLowerCase() === "size")
          ?.values?.filter(Boolean),
      }
    : FALLBACK_PRODUCT;
  if (product && hero.images.length === 0) {
    hero.images = [card?.image, card?.hoverImage].filter(
      (src): src is string => Boolean(src),
    );
  }

  /* CONTENT OVERRIDE — the Presidio's second carousel slide mirrors
     the homepage hero image (see the server route, which fetches it) */
  let heroImages = hero.images;
  if ((slug === "the-presidio" || !product) && homeHeroImage) {
    heroImages = [heroImages[0], homeHeroImage, ...heroImages.slice(2)].filter(
      (src): src is string => Boolean(src),
    );
  }

  /* pairs well with: explicit references first, topped up to at least
     four cards with products sharing the first tag (excluding self) */
  const related = extras.related.filter((item) => item._id !== product?._id);
  const pairDocs = activeOnly(product?.pairsWellWith ?? []);
  if (pairDocs.length < 4) {
    const have = new Set(pairDocs.map((doc) => doc._id));
    pairDocs.push(
      ...related.filter((doc) => !have.has(doc._id)).slice(0, 6 - pairDocs.length),
    );
  }
  let pairs: ProductCardData[] = pairDocs
    .map((doc) => toCards(doc, discounts, settings)[0])
    .filter((item): item is ProductCardData => Boolean(item));
  if (pairs.length === 0) pairs = FALLBACK_PAIRS;

  const shopCards = related
    .flatMap((item) => toCards(item, discounts, settings))
    .slice(0, 24);

  const pairsForCart = pairs.slice(0, 4).map((item) => ({
    title: item.title ?? "",
    price: item.price,
    image: item.image,
    color: item.colorway,
  }));

  /* Product structured data → rich results; CMS products only */
  const jsonLd = product
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.title,
        image: heroImages.filter(Boolean),
        sku: product.variants?.[0]?.sku,
        brand: { "@type": "Brand", name: product.vendor ?? "Sun Day Red" },
        offers:
          typeof product.pricing?.price === "number"
            ? {
                "@type": "Offer",
                price: product.pricing.price,
                priceCurrency: "USD",
                availability: "https://schema.org/InStock",
              }
            : undefined,
      }
    : null;

  return { product, hero, heroImages, pairs, shopCards, pairsForCart, jsonLd };
}

/* Compact product card for the "pairs well with" rail: gray well with
   the small product shot, then the standard two info rows */
function MiniProductCard({ card, first }: { card: ProductCardData; first?: boolean }) {
  const extra = card.variants?.length ? card.variants.length - 1 : undefined;
  const extraLabel =
    extra !== undefined ? (extra > 0 ? `+${extra} colors` : undefined) : card.colorCount;
  return (
    <SmartLink
      href={card.href ?? "#"}
      /* every card keeps its 16px (24px md+) padding; on mobile the
         rail's track starts at the SCREEN edge, so a snapped cell
         sits at x=0 and its padded image lands exactly on the 16px
         line. sm+ anchors the track at the gutter with the flush
         first card instead. */
      className={`group flex w-full flex-col gap-[1.125rem] border-b border-r border-line bg-surface p-4 pb-16 md:p-6 md:pb-16 ${
        first ? "sm:pl-0 md:pl-0" : ""
      }`}
    >
      <div className="relative aspect-[236/301] w-full overflow-hidden rounded-xs bg-surface-2">
        <div
          role="img"
          aria-label={card.title}
          className="absolute inset-x-[17.77%] top-1/2 aspect-square -translate-y-1/2 bg-contain bg-center bg-no-repeat transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105"
          style={card.image ? { backgroundImage: `url(${card.image})` } : undefined}
        />
        <CardAddButton
          title={card.title}
          price={card.price}
          image={card.image}
          color={card.colorway}
        />
      </div>
      <div className="flex w-full flex-col gap-1.5">
        <div className="label flex w-full items-center justify-between font-medium text-ink">
          <p>{(card.title ?? "").toUpperCase()}</p>
          <p className="flex items-baseline gap-3">
            {card.compareAtPrice && (
              <s className="text-ink-3 line-through">{card.compareAtPrice}</s>
            )}
            <span>{card.price}</span>
          </p>
        </div>
        <div className="flex w-full items-center justify-between font-mono text-label-sm uppercase leading-none text-ink-2">
          <p>{card.colorway}</p>
          {extraLabel && <p>{extraLabel}</p>}
        </div>
      </div>
    </SmartLink>
  );
}

/* The PDP body. `sections` is the adjustable middle — the server
   route passes SectionRenderer output, the preview passes SectionList
   — null renders the template defaults. */
export function ProductPageView({
  model,
  sections,
}: {
  model: ProductViewModel;
  sections?: React.ReactNode;
}) {
  const { product, hero, heroImages, pairs, shopCards, pairsForCart, jsonLd } = model;
  return (
    <div data-mode="light" className="flex w-full flex-col bg-surface text-ink">
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      {product?.showFooterTagline && <FooterTagline />}

      {/* required: hero carousel + affixed purchase bar */}
      <ProductHero product={{ ...hero, images: heroImages }} />
      <RegisterCartRecommendations items={pairsForCart} />

      {/* required: about + pairs well with (arrowed mini-card slider);
          the halves split the section and it runs tall per the comp */}
      <section
        data-mode="light"
        className="grid w-full grid-cols-1 gap-y-9 bg-surface px-4 pb-8xl pt-6xl text-ink md:min-h-[80svh] md:grid-cols-2 md:px-8"
      >
        <div className="flex flex-col gap-9 md:gap-16 md:pr-24 md:pt-[0.875rem]">
          <nav aria-label="Breadcrumb" className="label flex items-center gap-1.5 font-medium">
            {[product?.gender ?? "Men", product?.productType ?? "Footwear"].map(
              (crumb) => (
                <span key={crumb} className="flex items-center gap-1.5">
                  <a href="#" className="transition-opacity hover:opacity-70">
                    {crumb.toUpperCase()}
                  </a>
                  <span aria-hidden className="mr-1.5">
                    /
                  </span>
                </span>
              ),
            )}
            <span className="underline decoration-1 underline-offset-4">
              {(product?.title ?? "Presidio").toUpperCase()}
            </span>
          </nav>
          <div className="font-display text-title-lg">
            {product?.description ? (
              <PortableText value={product.description} />
            ) : (
              <p>{FALLBACK_DESCRIPTION}</p>
            )}
          </div>
          <DetailLinks
            links={
              product?.detailLinks?.length ? product.detailLinks : FALLBACK_DETAIL_LINKS
            }
          />
          {/* tablet/mobile: variant selectors live here; the mobile
              purchase bar minimizes while this panel is on screen */}
          <VariantPanel
            className="max-md:mt-7 xl:hidden"
            title={hero.title ?? "Presidio"}
            price={hero.price}
            image={hero.images[0]}
            variants={hero.variants}
            sizes={hero.sizes}
          />
        </div>
        {/* the rail bleeds off the right page edge (comp) */}
        <div className="-mx-4 min-w-0 sm:ml-0 md:-mr-8">
          <SliderShell
            title="PAIRS WELL WITH"
            titleClassName="label font-medium"
            bordered={false}
            progress={false}
            headerClassName="pb-7 px-4 sm:pl-0 md:pr-8"
            trackClassName="border-t-[1.5px] border-line"
            cols="auto-cols-[68%] sm:auto-cols-[41%] sm:[grid-template-columns:calc(41%-1rem)] md:[grid-template-columns:calc(41%-1.5rem)]"
            items={pairs.map((item, i) => ({
              key: item._key ?? String(i),
              card: <MiniProductCard card={item} first={i === 0} />,
            }))}
          />
        </div>
      </section>

      {/* adjustable middle: the product's CMS sections; the template
          defaults render until the document carries its own */}
      {sections ?? (
        <>
          <TechSpecs />
          <InfoSlider
            title="Features / Technology"
            cards={[1, 2, 3, 4, 5, 6, 7].map((n) => ({
              _key: `feature-${n}`,
              title: "Lorem Ipsum Dolor Sit®",
              body: "Torsional Traction Plate for benefit lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod. Learn More",
              image: "/figma/products/presidio-white-hover.png",
            }))}
          />
          {/* Design Details — the homepage carousel component */}
          <Carousel eyebrow="Design details" />
          <ThreeDViewer image="/figma/products/presidio-white.png" />
          <FiftyFifty
            mode="light"
            panels={[
              { _key: "media", image: "/figma/products/presidio-black-hover.png" },
              {
                _key: "text",
                kind: "text",
                eyebrow: "Sample Testimonial",
                body: "“I’m really excited for the Presidio. It has the stability and control to perform on the golf course; it satisfies everything a golfer wants in a spikeless shoe.”",
              },
            ]}
          />
          <Gallery />
          <Reviews />
        </>
      )}

      {/* required: the shopping module (untitled gender slider); the
          marker tells the hero's fixed purchase dock when to retire */}
      <div data-shop-module>
        <ProductSlider products={shopCards.length ? shopCards : undefined} />
      </div>
    </div>
  );
}

import { PortableText } from "next-sanity";
import { Suspense } from "react";

import {
  CardGrid,
  Carousel,
  CompareTable,
  CtaBand,
  Faq,
  FeatureList,
  FiftyFifty,
  FullWidth,
  Gallery,
  Hero,
  HeroPage,
  InfoSlider,
  Interstitial,
  LinkList,
  ProcessTimeline,
  ProductSlider,
  Reviews,
  SpecTable,
  StatsBar,
  TechSpecs,
  TextIntro,
  ThreeDViewer,
} from "@/components/home/sections";
import { SubNav } from "@/components/home/SubNav";
import type { LookProductData } from "@/components/home/MediaBlock";
import type { ProductCardData } from "@/components/home/ProductCard";
import { formatPrice } from "@/sanity/lib/commerce";
import { urlFor } from "@/sanity/lib/image";
import type { PageSection, SliderProduct } from "@/sanity/types";
import type { SanityImageSource } from "@sanity/image-url";

/*
  PREVIEW TWIN of SectionRenderer's switch — client-safe on purpose.

  SectionRenderer is a server module (it imports the draft-aware fetch
  layer, which uses next/headers), so it can't render inside the
  draft-mode client shell where edits stream in before saving. This
  file replicates the section mapping WITHOUT any data fetching:
  product sliders take precomputed cards (resolved server-side and
  passed down), everything else renders straight from the section
  data. If you add or change a section type in SectionRenderer, mirror
  it here — the preview shows whatever this file renders.
*/

function img(source: SanityImageSource | undefined, width = 2000): string | undefined {
  if (!source) return undefined;
  try {
    return urlFor(source).width(width).url();
  } catch {
    return undefined;
  }
}

function toLookCards(products?: Array<SliderProduct | null>): LookProductData[] {
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
      thumb: img(product.variants?.[0]?.image ?? product.thumb, 200),
    }));
}

const PAD_TOP = {
  s: "pt-section-s",
  m: "pt-section-m",
  l: "pt-section-l",
} as const;
const PAD_BOTTOM = {
  s: "pb-section-s",
  m: "pb-section-m",
  l: "pb-section-l",
} as const;

export function SectionList({
  sections,
  sliderCards,
}: {
  sections: PageSection[];
  /* product cards per slider section _key, resolved server-side */
  sliderCards: Record<string, ProductCardData[]>;
}) {
  return (
    <>
      {sections.map((section, sectionIndex) => {
        const node = (() => {
          switch (section._type) {
            case "sectionHero":
              return (
                <Hero
                  key={section._key}
                  mode={section.colorMode}
                  eyebrow={section.eyebrow}
                  headline={section.headline}
                  primaryCta={section.primaryCta}
                  image={img(section.image) ?? "/figma/campaign.jpg"}
                  lqip={section.imageLqip}
                  kind={section.mediaKind === "videoAutoplay" ? "videoAutoplay" : "image"}
                  videoUrl={section.videoUrl}
                />
              );
            case "sectionFullWidth":
              return (
                <FullWidth
                  key={section._key}
                  mode={section.colorMode}
                  eyebrow={section.eyebrow}
                  headline={section.headline}
                  primaryCta={section.primaryCta}
                  image={img(section.image) ?? "/figma/campaign.jpg"}
                  lqip={section.imageLqip}
                  kind={section.mediaKind}
                  videoUrl={section.videoUrl}
                  lookProducts={toLookCards(section.lookProducts)}
                />
              );
            case "sectionInfoSlider":
              return (
                <InfoSlider
                  key={section._key}
                  mode={section.colorMode}
                  title={section.title}
                  cards={section.cards?.map((card) => ({
                    _key: card._key,
                    title: card.title,
                    body: card.body,
                    image: img(card.image, 800),
                    kind: card.mediaKind,
                    videoUrl: card.videoUrl,
                  }))}
                />
              );
            case "sectionProductSlider": {
              const cards = sliderCards[section._key] ?? [];
              return (
                <ProductSlider
                  key={section._key}
                  mode={section.colorMode}
                  title={section.title}
                  products={cards.length ? cards : undefined}
                />
              );
            }
            case "sectionCarousel": {
              const items = (section.items ?? []).map((item) =>
                typeof item === "string"
                  ? {
                      title: item,
                      description: section.description,
                      image: img(section.image, 1400),
                    }
                  : {
                      _key: item._key,
                      title: item.title,
                      description: item.description ?? section.description,
                      image: img(item.image, 1400) ?? img(section.image, 1400),
                    },
              );
              return (
                <Carousel
                  key={section._key}
                  mode={section.colorMode}
                  eyebrow={section.eyebrow}
                  items={items.length ? items : undefined}
                />
              );
            }
            case "sectionFiftyFifty":
              return (
                <FiftyFifty
                  key={section._key}
                  mode={section.colorMode}
                  ratio={section.ratio}
                  panels={section.panels?.map((panel) => ({
                    _key: panel._key,
                    title: panel.title,
                    url: panel.url,
                    eyebrow: panel.eyebrow,
                    body: panel.body,
                    showEyebrow: panel.showEyebrow,
                    showButton: panel.showButton,
                    ctaLabel: panel.ctaLabel,
                    image: img(panel.image, 1400),
                    kind: panel.mediaKind,
                    videoUrl: panel.videoUrl,
                    lookProducts: toLookCards(panel.lookProducts),
                  }))}
                />
              );
            case "sectionTechSpecs":
              return (
                <TechSpecs
                  key={section._key}
                  mode={section.colorMode}
                  title={section.title}
                  rows={section.rows}
                  description={section.description}
                  stats={section.stats}
                />
              );
            case "sectionGallery":
              return (
                <Gallery
                  key={section._key}
                  mode={section.colorMode}
                  title={section.title}
                  slides={section.slides?.map((slide) => ({
                    _key: slide._key,
                    image: img(slide.image, 1600),
                    aspect: slide.aspect,
                    kind: slide.mediaKind,
                    videoUrl: slide.videoUrl,
                    lookProducts: toLookCards(slide.lookProducts),
                  }))}
                />
              );
            case "sectionReviews":
              return (
                <Reviews key={section._key} mode={section.colorMode} title={section.title} />
              );
            case "sectionThreeD":
              return (
                <ThreeDViewer
                  key={section._key}
                  mode={section.colorMode}
                  title={section.title}
                  image={img(section.image, 1600)}
                />
              );
            case "sectionFaq":
              return (
                <Faq
                  key={section._key}
                  mode={section.colorMode}
                  eyebrow={section.eyebrow}
                  title={section.title}
                  intro={section.intro}
                  items={section.items}
                />
              );
            case "sectionTextIntro":
              return (
                <TextIntro
                  key={section._key}
                  mode={section.colorMode}
                  eyebrow={section.eyebrow}
                  headline={section.headline}
                  body={section.body?.length ? <PortableText value={section.body} /> : undefined}
                  link={section.link}
                />
              );
            case "sectionStats":
              return (
                <StatsBar key={section._key} id={`stats-${section._key}`} mode={section.colorMode} stats={section.stats} sources={section.sources} />
              );
            case "sectionFeatureList":
              return (
                <FeatureList
                  key={section._key}
                  mode={section.colorMode}
                  eyebrow={section.eyebrow}
                  headline={section.headline}
                  columns={section.columns}
                  items={section.items?.map((f) => ({ ...f, icon: img(f.icon, 80) }))}
                />
              );
            case "sectionCtaBand":
              return (
                <CtaBand
                  key={section._key}
                  mode={section.colorMode}
                  headline={section.headline}
                  body={section.body}
                  primary={section.ctaPrimary}
                  secondary={section.ctaSecondary}
                />
              );
            case "sectionCardGrid":
              return (
                <CardGrid
                  key={section._key}
                  mode={section.colorMode}
                  eyebrow={section.eyebrow}
                  headline={section.headline}
                  link={section.link}
                  columns={section.columns}
                  cards={section.cards?.map((c) => ({ ...c, image: img(c.image ?? undefined, 800), alt: c.image?.alt }))}
                />
              );
            case "sectionProcess":
              return (
                <ProcessTimeline key={section._key} mode={section.colorMode} eyebrow={section.eyebrow} headline={section.headline} link={section.link} steps={section.steps} />
              );
            case "sectionCompare":
              return (
                <CompareTable key={section._key} mode={section.colorMode} eyebrow={section.eyebrow} headline={section.headline} link={section.link} headers={section.headers} rows={section.rows} sources={section.sources} />
              );
            case "sectionLinkList":
              return (
                <LinkList key={section._key} mode={section.colorMode} eyebrow={section.eyebrow} headline={section.headline} intro={section.intro} links={section.links} />
              );
            case "sectionInterstitial":
              return (
                <Interstitial
                  key={section._key}
                  mode={section.colorMode}
                  kind={section.kind}
                  text={section.text}
                  subline={section.subline}
                  image={img(section.image ?? undefined, 2000)}
                  alt={section.image?.alt}
                  caption={section.image?.caption}
                  floats={section.floats?.map((f) => ({ src: img(f, 600) ?? "", alt: f.alt ?? "" }))}
                />
              );
            case "sectionHeroPage":
              return (
                <HeroPage key={section._key} mode={section.colorMode} as="h2" crumbs={[{ name: section.headline ?? "" }]} headline={section.headline} lede={section.lede} primary={section.ctaPrimary} secondary={section.ctaSecondary} />
              );
            case "sectionSubNav":
              return (
                <SubNav key={section._key} mode={section.colorMode} contextName={section.contextName} anchors={section.anchors} cta={section.cta} />
              );
            case "sectionSpecTable":
              return (
                <SpecTable key={section._key} mode={section.colorMode} eyebrow={section.eyebrow} headline={section.headline} body={section.body} link={section.link} rows={section.rows} />
              );
            case "sectionRichText":
              return (
                <section
                  key={section._key}
                  data-mode={section.colorMode ?? "light"}
                  className="w-full bg-surface text-ink"
                >
                  <div className="mx-auto max-w-3xl px-4 py-16 md:px-6">
                    <div className="prose prose-neutral max-w-none dark:prose-invert">
                      {section.body && <PortableText value={section.body} />}
                    </div>
                  </div>
                </section>
              );
            case "sectionExperiment":
              /* preview affordance: every variant renders stacked
                 with a label strip, so editors can see and edit each
                 one — the live split only happens on the published
                 site (SectionRenderer). */
              return (
                <div key={section._key} className="w-full">
                  {(section.variants ?? []).map((variant, variantIndex) => (
                    <div key={variant._key} className="w-full">
                      <div
                        data-mode="dark"
                        className="label w-full bg-surface px-6 py-3 text-ink-3"
                      >
                        A/B {section.key ?? ""} — {variant.label ?? `VARIANT ${variantIndex + 1}`}
                        {variantIndex === 0 ? " (CONTROL)" : ""}
                      </div>
                      {variant.sections?.length ? (
                        <SectionList
                          sections={variant.sections}
                          sliderCards={sliderCards}
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              );
            default:
              return null;
          }
        })();
        const pt =
          section.paddingTop && section.paddingTop !== "none" ? PAD_TOP[section.paddingTop] : "";
        const pb =
          section.paddingBottom && section.paddingBottom !== "none"
            ? PAD_BOTTOM[section.paddingBottom]
            : "";
        const cv = sectionIndex > 0 ? "cv-auto" : "";
        const wrapped =
          sectionIndex > 0 ? <Suspense fallback={null}>{node}</Suspense> : node;
        /* an Anchor id (Sub-nav target) needs a wrapper to live on */
        const anchor = section.anchor?.trim() || undefined;
        if (!pt && !pb)
          return cv || anchor ? (
            <div key={section._key} id={anchor} className={`w-full ${cv} ${anchor ? "scroll-mt-(--anchor-offset)" : ""}`}>
              {wrapped}
            </div>
          ) : (
            wrapped
          );
        const shellMode =
          section.colorMode ??
          (section._type === "sectionFullWidth" ||
          section._type === "sectionFiftyFifty" ||
          section._type === "sectionHero"
            ? "dark"
            : "light");
        return (
          <div
            key={section._key}
            id={anchor}
            data-mode={shellMode}
            className={`w-full bg-surface ${pt} ${pb} ${cv} ${anchor ? "scroll-mt-(--anchor-offset)" : ""}`}
          >
            {wrapped}
          </div>
        );
      })}
    </>
  );
}

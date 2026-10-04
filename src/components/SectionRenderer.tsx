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
  LogoRow,
  MapBlock,
  FormBlock,
  ProcessTimeline,
  ProductSlider,
  Reviews,
  SpecTable,
  StatsBar,
  TeamGrid,
  TechSpecs,
  Testimonial,
  TextIntro,
  ThreeDViewer,
} from "@/components/home/sections";
import { SubNav } from "@/components/home/SubNav";
import { ContactForm } from "@/components/forms/ContactForm";
import { ExperimentSection } from "@/components/experiment/ExperimentSection";
import type { LookProductData } from "@/components/home/MediaBlock";
import type { ProductCardData } from "@/components/home/ProductCard";
import {
  basePrice,
  buildRulesFilter,
  COLLECTION_ORDER,
  formatPrice,
  resolveDisplayPrice,
} from "@/sanity/lib/commerce";
import { sanityFetch } from "@/sanity/lib/fetch";
import { urlFor } from "@/sanity/lib/image";
import {
  automaticDiscountsQuery,
  collectionProductsQuery,
  marketRowsQuery,
  productsByTagQuery,
  siteSettingsQuery,
  smartCollectionProductsQuery,
  storeSettingsQuery,
  teamMembersQuery,
} from "@/sanity/lib/queries";
import type {
  Discount,
  MarketRow,
  PageSection,
  SectionFormBlock,
  SectionMapBlock,
  SectionProductSlider,
  SectionTeamGrid,
  SiteSettings,
  SliderProduct,
  StoreSettings,
  TeamMember,
} from "@/sanity/types";
import type { SanityImageSource } from "@sanity/image-url";

import {
  activeOnly,
  sortProducts,
  toCards,
  toLookCards,
} from "@/sanity/lib/cards";

/* re-exported for the existing import graph (PDP, collections) */
export { activeOnly, toCards } from "@/sanity/lib/cards";

function img(source: SanityImageSource | undefined, width = 2000): string | undefined {
  if (!source) return undefined;
  try {
    return urlFor(source).width(width).url();
  } catch {
    return undefined;
  }
}

export async function productsForCollection(
  collection: { _id?: string; type?: string; match?: "all" | "any"; rules?: import("@/sanity/types").CollectionRule[]; sortOrder?: string } | null | undefined,
): Promise<SliderProduct[]> {
  if (!collection?._id) return [];
  if (collection.type === "smart") {
    const { filter, params } = buildRulesFilter(
      collection.rules ?? [],
      collection.match ?? "all",
    );
    const order =
      COLLECTION_ORDER[(collection.sortOrder ?? "newest") as keyof typeof COLLECTION_ORDER] ??
      COLLECTION_ORDER.newest;
    return sanityFetch<SliderProduct[]>(
      smartCollectionProductsQuery(filter, order),
      params,
      [],
    );
  }
  const referenced = await sanityFetch<Array<SliderProduct | null> | null>(
    collectionProductsQuery,
    { collectionId: collection._id },
    [],
  );
  const active = activeOnly(referenced ?? []);
  return collection.sortOrder && collection.sortOrder !== "manual"
    ? sortProducts(active, collection.sortOrder)
    : active;
}

/* Sliders source products manually, from a collection, or by tag
   (newest post date first) */
async function ProductSliderSection({ section }: { section: SectionProductSlider }) {
  /* one round trip, not two: settings/discounts and the product
     source resolve together (draft-mode refreshes re-run all of this
     uncached, so every serial hop is felt in the preview latency) */
  const productsPromise: Promise<SliderProduct[]> =
    section.source === "manual"
      ? Promise.resolve(activeOnly(section.products ?? []))
      : section.source === "collection"
        ? productsForCollection(section.collection)
        : sanityFetch<SliderProduct[]>(
            productsByTagQuery,
            { productTag: section.tag ?? "all" },
            [],
          );
  const [settings, discounts, sourced] = await Promise.all([
    sanityFetch<StoreSettings | null>(storeSettingsQuery, {}, null),
    sanityFetch<Discount[]>(automaticDiscountsQuery, {}, []),
    productsPromise,
  ]);
  let products = sourced;
  /* a manual list that resolved empty still tops up by tag */
  if (products.length === 0 && section.source === "manual") {
    products = await sanityFetch<SliderProduct[]>(
      productsByTagQuery,
      { productTag: section.tag ?? "all" },
      [],
    );
  }
  const cards = products
    .flatMap((product) => toCards(product, discounts, settings))
    .slice(0, 24);
  return (
    <ProductSlider
      mode={section.colorMode}
      title={section.title}
      products={cards.length ? cards : undefined}
    />
  );
}

/* Server-side resolver for the draft-mode preview shell: product
   cards per slider section, keyed by section _key — the client
   preview can't fetch, so this hands it ready-made cards. */
export async function buildSliderCardMap(
  sections: PageSection[],
): Promise<Record<string, ProductCardData[]>> {
  /* experiments hold nested section stacks — flatten one level so
     sliders inside variants get their preview cards too */
  const flattened = sections.flatMap((section) =>
    section._type === "sectionExperiment"
      ? [
          section,
          ...(section.variants ?? []).flatMap((v) => v.sections ?? []),
        ]
      : [section],
  );
  const sliders = flattened.filter(
    (section): section is SectionProductSlider =>
      section._type === "sectionProductSlider",
  );
  if (sliders.length === 0) return {};
  const [settings, discounts] = await Promise.all([
    sanityFetch<StoreSettings | null>(storeSettingsQuery, {}, null),
    sanityFetch<Discount[]>(automaticDiscountsQuery, {}, []),
  ]);
  const entries = await Promise.all(
    sliders.map(async (section) => {
      let products: SliderProduct[] = [];
      if (section.source === "manual") {
        products = activeOnly(section.products ?? []);
      } else if (section.source === "collection") {
        products = await productsForCollection(section.collection);
      }
      if (products.length === 0 && section.source !== "collection") {
        products = await sanityFetch<SliderProduct[]>(
          productsByTagQuery,
          { productTag: section.tag ?? "all" },
          [],
        );
      }
      const cards = products
        .flatMap((product) => toCards(product, discounts, settings))
        .slice(0, 24);
      return [section._key, cards] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/* CMS padding sizes -> fluid tokens (S 16→32, M 24→64, L 48→96
   across the 428→1440 frames) */
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

/* ---- data-backed sections (server only; SectionList shows the
   section's own fields or placeholders in the preview) ---- */

const person = (m: TeamMember | null) =>
  m ? { _key: m._id, name: m.name, role: m.role, credentials: m.credentials, image: img(m.photo ?? undefined, 600), url: m.linkedin } : null;

/* every team member when the editor picked none */
async function TeamGridData({ section }: { section: SectionTeamGrid }) {
  const picked = (section.members ?? []).filter(Boolean) as TeamMember[];
  const members = picked.length ? picked : await sanityFetch<TeamMember[]>(teamMembersQuery, {}, []);
  return (
    <TeamGrid
      mode={section.colorMode}
      eyebrow={section.eyebrow}
      headline={section.headline}
      link={section.link}
      people={members.length ? (members.map(person).filter(Boolean) as NonNullable<ReturnType<typeof person>>[]) : undefined}
    />
  );
}

/* market rows from the Market documents (state → regions served) */
async function MapBlockData({ section }: { section: SectionMapBlock }) {
  const rows = section.source === "manual" ? (section.rows ?? []) : await sanityFetch<MarketRow[]>(marketRowsQuery, {}, []);
  return (
    <MapBlock
      mode={section.colorMode}
      eyebrow={section.eyebrow}
      headline={section.headline}
      body={section.body}
      image={img(section.image ?? undefined, 1600)}
      alt={section.image?.alt}
      rows={rows.length ? rows : undefined}
      linkRows={section.linkRows}
    />
  );
}

/* phone + email from Site Settings, then the typed rows */
async function FormBlockData({ section }: { section: SectionFormBlock }) {
  const settings = await sanityFetch<SiteSettings | null>(siteSettingsQuery, {}, null);
  const details = [
    settings?.phone ? { _key: "phone", label: "Phone", value: settings.phone, href: `tel:${settings.phone.replace(/[^+\d]/g, "")}` } : null,
    settings?.email ? { _key: "email", label: "Email", value: settings.email, href: `mailto:${settings.email}` } : null,
    ...(section.rows ?? []),
  ].filter(Boolean) as { _key: string; label?: string; value?: string; href?: string }[];
  return (
    <FormBlock
      mode={section.colorMode}
      eyebrow={section.eyebrow}
      headline={section.headline}
      body={section.body}
      details={details}
      form={<ContactForm options={section.options} submitLabel={section.submitLabel} note={section.note} />}
    />
  );
}

export function SectionRenderer({
  sections,
  crumbs,
}: {
  sections: PageSection[];
  /* the page's breadcrumb trail (without Home), for a Hero / Page */
  crumbs?: { name: string; path?: string }[];
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
          case "sectionProductSlider":
            return <ProductSliderSection key={section._key} section={section} />;
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
            /* CMS pages already carry an sr-only H1 (their title); the
               hero's heading is the visible H2 twin */
            return (
              <HeroPage key={section._key} mode={section.colorMode} as="h2" crumbs={crumbs ?? [{ name: section.headline ?? "" }]} headline={section.headline} lede={section.lede} primary={section.ctaPrimary} secondary={section.ctaSecondary} />
            );
          case "sectionSubNav":
            return (
              <SubNav key={section._key} mode={section.colorMode} contextName={section.contextName} anchors={section.anchors} cta={section.cta} />
            );
          case "sectionSpecTable":
            return (
              <SpecTable key={section._key} mode={section.colorMode} eyebrow={section.eyebrow} headline={section.headline} body={section.body} link={section.link} rows={section.rows} />
            );
          case "sectionTestimonial": {
            const t = section.project?.testimonial;
            const p = section.project;
            const detail = section.clientDetail || [p?.series ? `${p.series} Series` : null, p?.location, p?.completedYear].filter(Boolean).join(" · ");
            return (
              <Testimonial
                key={section._key}
                mode={section.colorMode}
                eyebrow={section.eyebrow}
                quote={section.quote || t?.quote}
                clientName={section.clientName || t?.clientName}
                clientDetail={detail || t?.clientDetail}
                date={section.date || t?.date}
                rating={section.rating ?? t?.rating}
                link={section.link?.url ? section.link : p?.slug ? { label: section.link?.label || "Read the project story", url: `/projects/${p.slug}` } : null}
              />
            );
          }
          case "sectionLogoRow":
            return (
              <LogoRow key={section._key} mode={section.colorMode} eyebrow={section.eyebrow} logos={section.logos?.map((l) => ({ ...l, image: img(l.image ?? undefined, 400) }))} />
            );
          case "sectionTeamGrid":
            return <TeamGridData key={section._key} section={section} />;
          case "sectionMapBlock":
            return <MapBlockData key={section._key} section={section} />;
          case "sectionFormBlock":
            return <FormBlockData key={section._key} section={section} />;
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
          case "sectionExperiment": {
            /* A/B split (D1): all variants render into the shared
               cached HTML; the shell's pre-paint script shows one.
               Degenerate configs (fewer than two usable variants)
               render the first variant plainly. */
            const usable = (section.variants ?? []).filter(
              (v) => v.sections?.length,
            );
            const exKey = (section.key ?? "").replace(/[^a-zA-Z0-9-]/g, "");
            if (usable.length < 2 || !exKey) {
              return usable[0] ? (
                <SectionRenderer
                  key={section._key}
                  sections={usable[0].sections!}
                />
              ) : null;
            }
            return (
              <ExperimentSection
                key={section._key}
                exKey={exKey}
                variants={usable.map((v) => ({
                  key: v._key,
                  node: <SectionRenderer sections={v.sections!} />,
                }))}
              />
            );
          }
          default:
            return null;
        }
        })();
        /* optional vertical padding shell; it carries the section's
           color mode so the padded strip matches its surface */
        const pt = section.paddingTop && section.paddingTop !== "none" ? PAD_TOP[section.paddingTop] : "";
        const pb = section.paddingBottom && section.paddingBottom !== "none" ? PAD_BOTTOM[section.paddingBottom] : "";
        /* below-fold sections defer layout/paint until they approach
           the viewport; the first section renders eagerly (LCP) */
        const cv = sectionIndex > 0 ? "cv-auto" : "";
        /* Suspense per below-fold section = a selective-hydration
           boundary: the server HTML streams complete as before (the
           fallback never shows), but React 19 hydrates each boundary
           at low priority instead of hydrating the whole page in one
           long task — interaction with a boundary jumps its priority.
           The first section stays boundary-free: it hydrates first. */
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

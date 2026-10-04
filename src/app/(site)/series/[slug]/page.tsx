import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PortableText } from "next-sanity";
import { preload } from "react-dom";

import {
  CardGrid,
  CtaBand,
  Faq,
  Gallery,
  HeroSeries,
  SpecTable,
  StatsBar,
} from "@/components/home/sections";
import { SubNav } from "@/components/home/SubNav";
import { breadcrumbList, faqPage, itemList, JsonLd, updatedLabel, webPage } from "@/components/seo/JsonLd";
import { sanityFetch } from "@/sanity/lib/fetch";
import { urlFor } from "@/sanity/lib/image";
import { seriesBySlugQuery } from "@/sanity/lib/queries";
import { seoMeta } from "@/sanity/lib/seo";
import type { PlanCard, Range, Series } from "@/sanity/types";

import designops from "../../../../../designops.config.json";

/*
  /series/<slug> — a predesigned series (Figma template 37513:9343).
  Built from the `series` document, not the page builder: the Hero /
  Series wordmark, the Sub-nav, then the sections the series has
  content for (overview, plans, finish levels, specs, gallery, FAQ).
  Every section that renders carries the anchor id the Sub-nav points
  at, and sections with no content disappear together with their
  anchor — the sub-nav never links to nothing.

  Structured data: WebPage → mainEntity Product (brand = the
  Organization, offers from the published price, additionalProperty
  from the spec rows, hasVariant per plan) + ItemList of the plans +
  FAQPage + BreadcrumbList. Price policy (LAUNCH-PLAN C4): an exact
  "from" price emits an Offer; a band alone emits text, never a
  fabricated number.
*/

const BASE = designops.site.baseUrl;
const PREDESIGNED = { name: "Predesigned Series", path: "/predesigned" };

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const fmt = (n: number) => n.toLocaleString("en-US");
/* "1,590–2,250" / "2" / "" */
const range = (r?: Range | null, unit = "") => {
  if (!r || (r.min == null && r.max == null)) return "";
  const v = r.min != null && r.max != null && r.min !== r.max ? `${fmt(r.min)}–${fmt(r.max)}` : fmt((r.min ?? r.max)!);
  return unit ? `${v} ${unit}` : v;
};

const img = (source: unknown, width: number, height?: number) => {
  if (!source || typeof source !== "object" || !("asset" in (source as object))) return undefined;
  try {
    const b = urlFor(source as Parameters<typeof urlFor>[0]).width(width);
    return (height ? b.height(height).fit("crop") : b).url();
  } catch {
    return undefined;
  }
};

/* the meta line under the sentence: every number with its footnote
   marker, pointing at the sources list the stats bar prints */
function metaLine(s: Series) {
  const parts: string[] = [];
  if (s.priceFrom) parts.push(`From ${usd(s.priceFrom)}¹`);
  else if (s.priceBand) parts.push(`${s.priceBand}¹`);
  if (range(s.sqft)) parts.push(range(s.sqft, "sq ft"));
  const n = s.plans?.length ?? 0;
  if (n) parts.push(`${n} floor plan${n === 1 ? "" : "s"}`);
  if (range(s.timelineMonths)) parts.push(`${range(s.timelineMonths)} months contract to keys²`);
  return parts.join(" · ");
}

function planCard(seriesSlug: string, p: PlanCard) {
  const facts = [
    p.beds != null ? `${p.beds} bed` : null,
    p.baths != null ? `${p.baths} bath` : null,
    p.sqft ? `${fmt(p.sqft)} sq ft` : null,
    p.modules ? `${p.modules} module${p.modules === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  const image = p.heroImage ?? p.planImage;
  return {
    _key: p._id,
    title: p.name,
    eyebrow: p.priceFrom ? `From ${usd(p.priceFrom)}` : undefined,
    body: p.lede,
    meta: facts.join(" · "),
    url: `/series/${seriesSlug}/${p.slug}`,
    image: img(image, 800, 600),
    alt: image?.alt ?? `${p.name} floor plan`,
  };
}

function productJsonLd(s: Series, path: string) {
  const image = img(s.heroImage, 1200, 675);
  const props: { name: string; value: string }[] = [];
  if (range(s.beds)) props.push({ name: "Bedrooms", value: range(s.beds) });
  if (range(s.baths)) props.push({ name: "Bathrooms", value: range(s.baths) });
  if (range(s.sqft)) props.push({ name: "Size", value: range(s.sqft, "sq ft") });
  if (range(s.modules)) props.push({ name: "Modules", value: range(s.modules) });
  if (s.storiesMax) props.push({ name: "Stories", value: `up to ${s.storiesMax}` });
  if (range(s.timelineMonths)) props.push({ name: "Contract to keys", value: range(s.timelineMonths, "months") });
  for (const r of s.specs ?? []) if (r.label && r.value) props.push({ name: r.label, value: r.value });
  const plans = s.plans ?? [];
  const planPrices = plans.map((p) => p.priceFrom).filter((n): n is number => typeof n === "number");
  const low = s.priceFrom ?? (planPrices.length ? Math.min(...planPrices) : undefined);
  const high = planPrices.length ? Math.max(...planPrices) : undefined;
  return {
    "@type": "Product",
    "@id": `${BASE}${path}#product`,
    name: `${s.name} series`,
    url: `${BASE}${path}`,
    ...(s.lede || s.tagline ? { description: s.lede || s.tagline } : {}),
    ...(image ? { image } : {}),
    brand: { "@id": `${BASE}/#organization` },
    manufacturer: { "@id": `${BASE}/#organization` },
    category: "Predesigned prefab home",
    ...(props.length ? { additionalProperty: props.map((p) => ({ "@type": "PropertyValue", ...p })) } : {}),
    ...(low
      ? {
          offers: {
            "@type": "AggregateOffer",
            priceCurrency: "USD",
            lowPrice: low,
            ...(high && high > low ? { highPrice: high } : {}),
            offerCount: Math.max(1, plans.length),
            availability: "https://schema.org/InStock",
            areaServed: designops.aeo.organization.areaServed,
            seller: { "@id": `${BASE}/#organization` },
            ...(s.priceNote ? { description: s.priceNote } : {}),
          },
        }
      : {}),
    ...(plans.length
      ? {
          hasVariant: plans.map((p) => ({
            "@type": "Product",
            "@id": `${BASE}/series/${s.slug}/${p.slug}#product`,
            name: p.name,
            url: `${BASE}/series/${s.slug}/${p.slug}`,
          })),
        }
      : {}),
  };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const s = await sanityFetch<Series | null>(seriesBySlugQuery, { slug }, null);
  if (!s) return { title: "Series not found" };
  return seoMeta({
    seo: s.seo,
    title: `${s.name} series — predesigned prefab homes`,
    description: s.lede || s.tagline,
    path: `/series/${slug}`,
    image: s.heroImage,
  });
}

export default async function SeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await sanityFetch<Series | null>(seriesBySlugQuery, { slug }, null);
  if (!s) notFound();

  const path = `/series/${slug}`;
  const hero = img(s.heroImage, 2000);
  if (hero) preload(hero, { as: "image", fetchPriority: "high" });

  const plans = s.plans ?? [];
  const finish = (s.finishLevels ?? []).filter((f) => f.name);
  const specs = (s.specs ?? []).filter((r) => r.label && r.value);
  const gallery = (s.gallery ?? []).filter((g) => img(g, 10));
  const faq = (s.faq ?? []).filter((q) => q.question && q.answer);
  const overview = Boolean(s.body?.length || s.lede);

  /* the sub-nav lists only what the page has */
  const anchors = [
    overview && { label: "Overview", anchor: "overview" },
    plans.length && { label: "Plans", anchor: "plans" },
    (finish.length || specs.length) && { label: "Features", anchor: "features" },
    gallery.length && { label: "Gallery", anchor: "gallery" },
    faq.length && { label: "FAQ", anchor: "faq" },
  ].filter(Boolean) as { label: string; anchor: string }[];

  /* the footnote line: ¹ price, ² timeline — the series' own sources
     first, then the catalog itself */
  const sources = s.sources?.length
    ? s.sources
    : [{ _key: "catalog", label: `${s.name} series catalog, Method Homes`, date: s._updatedAt?.slice(0, 10) }];
  const stats = [
    s.priceFrom ? { _key: "price", value: usd(s.priceFrom), label: "Starting price, modules delivered", footnote: 1 } : s.priceBand ? { _key: "price", value: s.priceBand, label: "Price band, modules delivered", footnote: 1 } : null,
    range(s.sqft) ? { _key: "sqft", value: range(s.sqft), label: "Square feet across the plans" } : null,
    range(s.beds) ? { _key: "beds", value: range(s.beds), label: "Bedrooms" } : null,
    range(s.timelineMonths) ? { _key: "time", value: range(s.timelineMonths), label: "Months, contract to keys", footnote: 2 } : null,
  ].filter(Boolean) as { _key: string; value: string; label: string; footnote?: number }[];

  const updated = updatedLabel(s._updatedAt);

  return (
    <div data-mode="light" className="flex flex-col items-start bg-surface">
      <JsonLd
        data={webPage({
          name: s.seo?.title || `${s.name} series`,
          description: s.seo?.description || s.lede || s.tagline,
          path,
          dateModified: s._updatedAt,
          image: img(s.heroImage, 1200, 675),
          extra: { mainEntity: productJsonLd(s, path) },
        })}
      />
      <JsonLd data={breadcrumbList([PREDESIGNED, { name: s.name, path }])} />
      {plans.length > 0 && (
        <JsonLd data={itemList(path, plans.map((p) => ({ name: p.name, path: `/series/${slug}/${p.slug}`, image: img(p.heroImage ?? p.planImage, 800, 600) })), `${s.name} floor plans`)} />
      )}
      <JsonLd data={faqPage(path, faq)} />

      <HeroSeries
        crumbs={[PREDESIGNED, { name: s.name }]}
        name={s.name}
        sentence={s.tagline || s.lede || ""}
        meta={metaLine(s)}
        image={hero}
        alt={s.heroImage?.alt}
        lqip={s.heroLqip}
        primary={{ label: "Get a range for your site", url: "/get-started" }}
        secondary={plans.length ? { label: "Explore the plans", url: "#plans" } : null}
      />
      {anchors.length > 1 && <SubNav contextName={s.name} anchors={anchors} cta={{ label: "Get a range", url: "/get-started" }} />}

      {overview && (
        <section id="overview" className="scroll-mt-(--anchor-offset) w-full bg-surface px-4 py-8xl text-ink md:px-7xl md:py-10xl">
          <div className="mx-auto grid w-full max-w-page grid-cols-1 gap-6xl md:grid-cols-[minmax(0,32.5rem)_1fr] md:gap-9xl">
            <div className="flex flex-col gap-xl">
              <p className="label text-ink-3">Overview</p>
              <h2 className="font-display text-headline-md text-ink">What is the {s.name} series?</h2>
            </div>
            <div className="flex flex-col gap-3xl text-body-md text-ink-2 [&_p]:max-w-prose">
              {s.lede && <p className="text-body-xl text-ink">{s.lede}</p>}
              {s.body?.length ? <PortableText value={s.body} /> : null}
              {s.architect && <p className="text-body-sm text-ink-3">Design: {s.architect}</p>}
            </div>
          </div>
        </section>
      )}

      {stats.length > 0 && <StatsBar id="series-facts" stats={stats} sources={sources} />}

      {plans.length > 0 && (
        <div id="plans" className="w-full scroll-mt-(--anchor-offset)">
          <CardGrid
            eyebrow="Floor plans"
            headline={`${plans.length} ${s.name} floor plan${plans.length === 1 ? "" : "s"}`}
            link={null}
            columns={plans.length >= 4 ? 4 : plans.length === 1 ? 2 : (plans.length as 2 | 3)}
            cards={plans.map((p) => planCard(slug, p))}
          />
        </div>
      )}

      {(finish.length > 0 || specs.length > 0) && (
        <div id="features" className="w-full scroll-mt-(--anchor-offset)">
          {finish.length > 0 && (
            <section className="w-full bg-surface px-4 py-8xl text-ink md:px-7xl md:py-10xl">
              <div className="mx-auto flex w-full max-w-page flex-col gap-6xl">
                <div className="flex max-w-[47.5rem] flex-col gap-xl">
                  <p className="label text-ink-3">Finish levels</p>
                  <h2 className="font-display text-headline-md text-ink">How is the {s.name} finished?</h2>
                  {s.priceNote && <p className="text-body-md text-ink-2">{s.priceNote}</p>}
                </div>
                <ul className={`grid grid-cols-1 gap-4xl ${finish.length >= 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
                  {finish.map((f) => (
                    <li key={f._key} className="flex flex-col gap-2xl rounded-md border border-line p-3xl">
                      <div className="flex flex-col gap-xs">
                        <h3 className="font-display text-title-md text-ink">{f.name}</h3>
                        {f.tagline && <p className="text-body-sm text-ink-2">{f.tagline}</p>}
                      </div>
                      {f.from ? <p className="text-body-md font-medium text-ink">From {usd(f.from)}¹</p> : null}
                      {f.numbers?.length ? (
                        <dl className="grid grid-cols-3 gap-xl border-t border-line pt-2xl">
                          {f.numbers.filter((n) => n.value).map((n, i) => (
                            <div key={n._key ?? i} className="flex flex-col gap-xs">
                              <dd className="font-display text-title-sm text-ink">{n.value}</dd>
                              <dt className="text-label-sm text-ink-3">{n.label}</dt>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                      {f.includes?.length ? (
                        <div className="flex flex-col gap-md">
                          <p className="label text-ink-3">Includes</p>
                          <ul className="flex flex-col gap-xs text-body-sm text-ink-2">
                            {f.includes.map((x, i) => <li key={i}>{x}</li>)}
                          </ul>
                        </div>
                      ) : null}
                      {f.optional?.length ? (
                        <div className="flex flex-col gap-md">
                          <p className="label text-ink-3">Optional</p>
                          <ul className="flex flex-col gap-xs text-body-sm text-ink-2">
                            {f.optional.map((x, i) => <li key={i}>{x}</li>)}
                          </ul>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
          {specs.length > 0 && (
            <SpecTable
              eyebrow="Specifications"
              headline={`What is the ${s.name} built to?`}
              body="What every home in the series is built to — structure, envelope, systems and the certifications they carry. Site-specific items are confirmed in your range."
              link={null}
              rows={specs}
            />
          )}
        </div>
      )}

      {gallery.length > 0 && (
        <div id="gallery" className="w-full scroll-mt-(--anchor-offset)">
          <Gallery
            title={`${s.name} gallery`}
            slides={gallery.map((g) => ({ _key: g._key, image: img(g, 1600), aspect: g.aspect ?? 4 / 3 }))}
          />
        </div>
      )}

      {faq.length > 0 && (
        <div id="faq" className="w-full scroll-mt-(--anchor-offset)">
          <Faq eyebrow="FAQ" title={`Questions about the ${s.name}`} items={faq} />
        </div>
      )}

      <CtaBand
        headline={`Is the ${s.name} right for your site?`}
        body="Tell us where you are building and what you need; we send a range for your lot within a few days."
        primary={{ label: "Get a range for your site", url: "/get-started" }}
        secondary={{ label: "All predesigned series", url: "/predesigned" }}
      />

      {updated && (
        <p className="label w-full px-4 py-6 text-ink-3 md:px-7xl">
          <time dateTime={s._updatedAt}>{updated}</time>
        </p>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PortableText } from "next-sanity";
import { preload } from "react-dom";

import { CardGrid, CtaBand, Gallery, HeroPage, SpecTable } from "@/components/home/sections";
import { LazyPlanViewer } from "@/components/model/LazyPlanViewer";
import { breadcrumbList, JsonLd, updatedLabel, webPage } from "@/components/seo/JsonLd";
import { sanityFetch } from "@/sanity/lib/fetch";
import { urlFor } from "@/sanity/lib/image";
import { planBySlugQuery } from "@/sanity/lib/queries";
import { seoMeta } from "@/sanity/lib/seo";
import type { Plan } from "@/sanity/types";

import designops from "../../../../../../designops.config.json";

/*
  /series/<series>/<plan> — one floor plan (Figma template 37509:5006).
  Hero / Page (breadcrumb Home / Predesigned Series / <series> / <plan>,
  H1 + lede), the plan drawing, the facts as a Spec table (beds, baths,
  size, modules, stories, then the lettered dimensions from Size it
  up), the PDF as a plain crawlable link, photos, the other plans in
  the series, CTA.

  Structured data: Product that isVariantOf the series Product, with
  an Offer when the plan (or its series) publishes a "from" price, the
  PDF as subjectOf DigitalDocument, and the drawing as image.
*/

const BASE = designops.site.baseUrl;
const PREDESIGNED = { name: "Predesigned Series", path: "/predesigned" };

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const fmt = (n: number) => n.toLocaleString("en-US");
const mb = (bytes?: number) => (bytes ? `${Math.max(0.1, Math.round((bytes / 1024 / 1024) * 10) / 10)} MB` : undefined);

const img = (source: unknown, width: number, height?: number) => {
  if (!source || typeof source !== "object" || !("asset" in (source as object))) return undefined;
  try {
    const b = urlFor(source as Parameters<typeof urlFor>[0]).width(width);
    return (height ? b.height(height).fit("crop") : b).url();
  } catch {
    return undefined;
  }
};

function factsRows(p: Plan) {
  const rows = [
    p.beds != null ? { _key: "beds", label: "Bedrooms", value: String(p.beds) } : null,
    p.baths != null ? { _key: "baths", label: "Bathrooms", value: String(p.baths) } : null,
    p.sqft ? { _key: "sqft", label: "Size", value: `${fmt(p.sqft)} sq ft` } : null,
    p.modules ? { _key: "modules", label: "Modules", value: String(p.modules) } : null,
    p.stories ? { _key: "stories", label: "Stories", value: String(p.stories) } : null,
    p.priceFrom || p.series?.priceFrom
      ? { _key: "price", label: "Starting price", value: `${usd((p.priceFrom ?? p.series?.priceFrom)!)}${p.series?.priceNote ? ` — ${p.series.priceNote}` : ""}` }
      : p.series?.priceBand
        ? { _key: "price", label: "Price band", value: p.series.priceBand }
        : null,
    p.series?.timelineMonths?.min || p.series?.timelineMonths?.max
      ? { _key: "time", label: "Contract to keys", value: `${[p.series.timelineMonths.min, p.series.timelineMonths.max].filter((n) => n != null).join("–")} months` }
      : null,
  ].filter(Boolean) as { _key: string; label: string; value: string }[];
  const letters = "ABCDEFGH";
  for (const [i, d] of (p.dimensions ?? []).entries()) {
    if (d.label && d.value) rows.push({ _key: d._key ?? `dim-${i}`, label: `${letters[i] ?? ""} ${d.label}`.trim(), value: d.value });
  }
  return rows;
}

function productJsonLd(p: Plan, path: string) {
  const series = p.series;
  const image = img(p.heroImage ?? p.planImage, 1200, 675);
  const drawing = img(p.planImage, 1600);
  const price = p.priceFrom ?? series?.priceFrom;
  const props = factsRows(p).filter((r) => !["price", "time"].includes(r._key)).map((r) => ({ "@type": "PropertyValue", name: r.label, value: r.value }));
  return {
    "@type": "Product",
    "@id": `${BASE}${path}#product`,
    name: `${p.name}${series ? ` — ${series.name} series` : ""}`,
    url: `${BASE}${path}`,
    ...(p.lede ? { description: p.lede } : {}),
    ...(image || drawing ? { image: [image, drawing].filter(Boolean) } : {}),
    brand: { "@id": `${BASE}/#organization` },
    manufacturer: { "@id": `${BASE}/#organization` },
    category: "Predesigned prefab home floor plan",
    ...(series ? { isVariantOf: { "@type": "Product", "@id": `${BASE}/series/${series.slug}#product`, name: `${series.name} series`, url: `${BASE}/series/${series.slug}` } } : {}),
    ...(props.length ? { additionalProperty: props } : {}),
    ...(p.sqft ? { size: `${fmt(p.sqft)} sq ft` } : {}),
    ...(price
      ? {
          offers: {
            "@type": "Offer",
            priceCurrency: "USD",
            price,
            availability: "https://schema.org/InStock",
            areaServed: designops.aeo.organization.areaServed,
            seller: { "@id": `${BASE}/#organization` },
            ...(series?.priceNote ? { description: series.priceNote } : {}),
          },
        }
      : {}),
    ...(p.pdf?.url
      ? {
          subjectOf: {
            "@type": "DigitalDocument",
            name: `${p.name} floor plan (PDF)`,
            url: p.pdf.url,
            encodingFormat: "application/pdf",
          },
        }
      : {}),
  };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; plan: string }> }): Promise<Metadata> {
  const { slug, plan } = await params;
  const p = await sanityFetch<Plan | null>(planBySlugQuery, { series: slug, plan }, null);
  if (!p) return { title: "Floor plan not found" };
  const facts = [p.beds != null ? `${p.beds} bed` : null, p.sqft ? `${fmt(p.sqft)} sq ft` : null].filter(Boolean).join(", ");
  return seoMeta({
    seo: p.seo,
    title: `${p.name} floor plan${facts ? ` — ${facts}` : ""}`,
    description: p.lede,
    path: `/series/${slug}/${plan}`,
    image: p.heroImage ?? p.planImage,
  });
}

export default async function PlanPage({ params }: { params: Promise<{ slug: string; plan: string }> }) {
  const { slug, plan } = await params;
  const p = await sanityFetch<Plan | null>(planBySlugQuery, { series: slug, plan }, null);
  if (!p) notFound();

  const path = `/series/${slug}/${plan}`;
  const series = p.series;
  const crumbs = [PREDESIGNED, ...(series ? [{ name: series.name, path: `/series/${series.slug}` }] : []), { name: p.name, path }];
  const drawing = img(p.planImage, 2000);
  if (drawing) preload(drawing, { as: "image", fetchPriority: "high" });
  const rows = factsRows(p);
  const photos = (p.photos ?? []).filter((g) => img(g, 10));
  const siblings = (series?.plans ?? []).filter((x) => x._id !== p._id);
  const updated = updatedLabel(p._updatedAt);
  const price = p.priceFrom ?? series?.priceFrom;

  return (
    <div data-mode="light" className="flex flex-col items-start bg-surface">
      <JsonLd
        data={webPage({
          name: p.seo?.title || `${p.name} floor plan`,
          description: p.seo?.description || p.lede,
          path,
          dateModified: p._updatedAt,
          image: img(p.heroImage ?? p.planImage, 1200, 675),
          extra: { mainEntity: productJsonLd(p, path) },
        })}
      />
      <JsonLd data={breadcrumbList(crumbs)} />

      <HeroPage
        crumbs={crumbs.map((c, i) => (i === crumbs.length - 1 ? { name: c.name } : c))}
        headline={`${p.name}${series ? ` — ${series.name} series` : ""}`}
        lede={p.lede || [p.beds != null ? `${p.beds} bedroom` : null, p.baths != null ? `${p.baths} bath` : null, p.sqft ? `${fmt(p.sqft)} sq ft` : null, price ? `from ${usd(price)}` : null].filter(Boolean).join(", ")}
        primary={{ label: "Get a range for this plan", url: "/get-started" }}
        secondary={p.pdf?.url ? { label: "Download the floor plan (PDF)", url: p.pdf.url } : series ? { label: `All ${series.name} plans`, url: `/series/${series.slug}` } : null}
      />

      {p.model?.url && (
        /* Walk the plan, 3D view: a progressive layer over the drawing
           below — loads after idle + in view; the drawing is its poster */
        <section className="w-full bg-surface px-4 pb-8xl text-ink md:px-7xl md:pb-10xl">
          <div className="mx-auto flex w-full max-w-page flex-col gap-xl">
            <LazyPlanViewer src={p.model.url} poster={img(p.heroImage ?? p.planImage, 1600)} alt={`${p.name} — 3D model`} northDeg={p.northDeg} />
            <p className="text-body-sm text-ink-3">Drag to turn the home. “Floor plan” cuts the model at 1.2 m and turns it north-up.</p>
          </div>
        </section>
      )}

      {drawing && (
        <section className="w-full bg-surface px-4 pb-8xl text-ink md:px-7xl md:pb-10xl">
          <figure className="mx-auto flex w-full max-w-page flex-col gap-xl">
            <div className="w-full overflow-hidden rounded-md bg-wash">
              {/* the plan drawing is the LCP: eager, high priority, no fade */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={drawing} alt={p.planImage?.alt ?? `${p.name} floor plan drawing`} fetchPriority="high" decoding="async" className="block w-full" />
            </div>
            <figcaption className="text-body-sm text-ink-3">{p.planImage?.alt ?? `${p.name} floor plan`}{rows.some((r) => /^[A-H] /.test(r.label)) ? " — letters match the dimensions below." : ""}</figcaption>
          </figure>
        </section>
      )}

      {rows.length > 0 && (
        <SpecTable
          eyebrow="Size it up"
          headline={`How big is the ${p.name}?`}
          body={`The ${p.name} at a glance${series ? ` — one of ${series.plans?.length ?? "the"} ${series.name} floor plans` : ""}. Dimensions are overall module dimensions; site-specific items are confirmed in your range.`}
          link={p.pdf?.url ? { label: `Download the floor plan (PDF${mb(p.pdf.size) ? `, ${mb(p.pdf.size)}` : ""})`, url: p.pdf.url } : null}
          rows={rows}
        />
      )}

      {p.body?.length ? (
        <section className="w-full bg-surface px-4 py-8xl text-ink md:px-7xl md:py-10xl">
          <div className="mx-auto grid w-full max-w-page grid-cols-1 gap-6xl md:grid-cols-[minmax(0,32.5rem)_1fr] md:gap-9xl">
            <div className="flex flex-col gap-xl">
              <p className="label text-ink-3">About the plan</p>
              <h2 className="font-display text-headline-md text-ink">Who is the {p.name} for?</h2>
            </div>
            <div className="flex flex-col gap-3xl text-body-md text-ink-2 [&_p]:max-w-prose">
              <PortableText value={p.body} />
            </div>
          </div>
        </section>
      ) : null}

      {photos.length > 0 && (
        <Gallery title={`${p.name} photos`} slides={photos.map((g) => ({ _key: g._key, image: img(g, 1600), aspect: g.aspect ?? 4 / 3 }))} />
      )}

      {siblings.length > 0 && series && (
        <CardGrid
          eyebrow={`${series.name} series`}
          headline={`Other ${series.name} floor plans`}
          link={{ label: `About the ${series.name}`, url: `/series/${series.slug}` }}
          columns={siblings.length >= 4 ? 4 : siblings.length === 1 ? 2 : (siblings.length as 2 | 3)}
          cards={siblings.map((x) => ({
            _key: x._id,
            title: x.name,
            eyebrow: x.priceFrom ? `From ${usd(x.priceFrom)}` : undefined,
            body: x.lede,
            meta: [x.beds != null ? `${x.beds} bed` : null, x.baths != null ? `${x.baths} bath` : null, x.sqft ? `${fmt(x.sqft)} sq ft` : null].filter(Boolean).join(" · "),
            url: `/series/${series.slug}/${x.slug}`,
            image: img(x.heroImage ?? x.planImage, 800, 600),
            alt: (x.heroImage ?? x.planImage)?.alt ?? `${x.name} floor plan`,
          }))}
        />
      )}

      <CtaBand
        headline={`Build the ${p.name} on your site`}
        body="Tell us where you are building; we send a range for this plan on your lot within a few days."
        primary={{ label: "Get a range", url: "/get-started" }}
        secondary={series ? { label: `All ${series.name} plans`, url: `/series/${series.slug}` } : { label: "All predesigned series", url: "/predesigned" }}
      />

      {updated && (
        <p className="label w-full px-4 py-6 text-ink-3 md:px-7xl">
          <time dateTime={p._updatedAt}>{updated}</time>
        </p>
      )}
    </div>
  );
}

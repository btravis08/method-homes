import type { Metadata } from "next";
import { preload } from "react-dom";

import {
  CardGrid,
  CompareTable,
  CtaBand,
  Faq,
  HeroPage,
  Interstitial,
  TextIntro,
} from "@/components/home/sections";
import { Lineup, type LineupSeriesData } from "@/components/home/Lineup";
import { breadcrumbList, collectFaq, faqPage, itemList, JsonLd, updatedLabel, webPage } from "@/components/seo/JsonLd";
import { sanityFetch } from "@/sanity/lib/fetch";
import { urlFor } from "@/sanity/lib/image";
import { pageBySlugQuery, seriesListQuery } from "@/sanity/lib/queries";
import { seoMeta } from "@/sanity/lib/seo";
import type { Page, Range, SeriesCard } from "@/sanity/types";

import designops from "../../../../designops.config.json";

/*
  /predesigned — the predesigned hub (Figma "Page / Predesigned Series"
  37565:18408): Hero / Page, the series Card grid, the Lineup toggle,
  a Number interstitial, "Why a series" Text intro, the Compare table,
  FAQ, CTA band. Built in code from the series documents so every
  number on the page is the catalog's, never typed twice.

  A `page` document with slug "predesigned" is the editorial override:
  its Hero / Page section replaces the hero copy, its Text intro the
  why-copy, its FAQ section the questions, and its SEO fields the
  metadata. No document → the designed defaults below render.

  Structured data: CollectionPage → ItemList of the series (each a
  Product, by @id) + FAQPage + BreadcrumbList. Prices appear only
  where a series publishes one.
*/

const BASE = designops.site.baseUrl;
const PATH = "/predesigned";
const CRUMB = { name: "Predesigned Series", path: PATH };

const usd = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`);
const fmt = (n: number) => n.toLocaleString("en-US");
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
/* the union of a range across series */
const union = (rs: (Range | null | undefined)[]): Range | null => {
  const mins = rs.map((r) => r?.min).filter((n): n is number => typeof n === "number");
  const maxs = rs.map((r) => r?.max ?? r?.min).filter((n): n is number => typeof n === "number");
  if (!mins.length && !maxs.length) return null;
  return { min: mins.length ? Math.min(...mins) : undefined, max: maxs.length ? Math.max(...maxs) : undefined };
};
const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const word = (n: number) => words[n] ?? String(n);

/* the designed default copy (the page document overrides it) */
const DEFAULT_FAQ = [
  {
    _key: "cost",
    question: "How much does a Method home cost?",
    answer:
      "Pricing depends on the series, finish level and your site. The factory build is one part; foundation, utilities, transport, set and finish make up the rest. Our pricing guide shows typical all-in ranges by path, and the intake gives you a range for your site.",
  },
  {
    _key: "time",
    question: "How long does it take?",
    answer:
      "Most predesigned homes are complete 8–12 months after contract: 6–8 weeks of design and permitting, 10–14 weeks in the factory, and 2–4 months of on-site finish after set day.",
  },
  {
    _key: "where",
    question: "Where does Method Homes deliver?",
    answer: `We set homes across ${designops.aeo.organization.areaServed.join(", ")} from our factory in Ferndale, WA.`,
  },
  {
    _key: "customize",
    question: "Can I customize a predesigned series plan?",
    answer:
      "Yes. Finishes, fixtures and façade materials are selections on every series, and most plans offer layout options. If none of the plans fits your site, our architects can modify one or start a custom design.",
  },
  {
    _key: "code",
    question: "Is a prefab home built to the same code as a site-built home?",
    answer:
      "Yes. Modular homes are built to the same state and local residential building code as a site-built home, inspected in the factory by an approved third-party agency, and permitted and inspected again on your site.",
  },
];

function lineupData(all: SeriesCard[]): LineupSeriesData[] {
  return all.map((s) => {
    const meta: string[] = [];
    if (s.priceFrom) meta.push(`From ${usd(s.priceFrom)}²`);
    else if (s.priceBand) meta.push(`${s.priceBand}²`);
    if (range(s.timelineMonths)) meta.push(`${range(s.timelineMonths)} months from contract to set day³`);
    const numbers = [
      range(s.sqft) ? { value: `${range(s.sqft)}¹`, label: "Square feet" } : null,
      s.planCount ? { value: String(s.planCount), label: `Floor plan${s.planCount === 1 ? "" : "s"}` } : null,
      range(s.beds) ? { value: range(s.beds), label: "Bedrooms" } : null,
      range(s.factoryWeeks) ? { value: `${range(s.factoryWeeks)} wks`, label: "In the factory" } : null,
    ].filter(Boolean) as { value: string; label: string }[];
    return {
      slug: s.slug,
      name: s.name,
      sentence: s.tagline || s.lede,
      meta: meta.join("  ·  "),
      image: img(s.heroImage, 2000, 1000),
      alt: s.heroImage?.alt,
      lqip: s.heroLqip,
      numbers,
      palette: s.palette,
    };
  });
}

export async function generateMetadata(): Promise<Metadata> {
  const [page, all] = await Promise.all([
    sanityFetch<Page | null>(pageBySlugQuery, { slug: "predesigned" }, null),
    sanityFetch<SeriesCard[]>(seriesListQuery, {}, []),
  ]);
  const plans = all.reduce((n, s) => n + (s.planCount ?? 0), 0);
  const sqft = union(all.map((s) => s.sqft));
  const hero = page?.sections?.find((s) => s._type === "sectionHeroPage");
  const description =
    page?.seo?.description ||
    (hero?._type === "sectionHeroPage" && hero.lede) ||
    (all.length
      ? `${word(all.length)[0].toUpperCase()}${word(all.length).slice(1)} architect-designed prefab home series${plans ? ` — ${plans} floor plans` : ""}${range(sqft) ? ` from ${range(sqft, "square feet")}` : ""} — with fixed structure, selectable finishes and a factory price you know on day one.`
      : "Architect-designed predesigned prefab home series from Method Homes: fixed structure, selectable finishes and a factory price you know on day one.");
  return seoMeta({ seo: page?.seo, title: page?.seo?.title || "Predesigned prefab home series", description, path: PATH });
}

export default async function PredesignedPage() {
  const [page, all] = await Promise.all([
    sanityFetch<Page | null>(pageBySlugQuery, { slug: "predesigned" }, null),
    sanityFetch<SeriesCard[]>(seriesListQuery, {}, []),
  ]);

  const n = all.length;
  const plans = all.reduce((sum, s) => sum + (s.planCount ?? 0), 0);
  const sqft = union(all.map((s) => s.sqft));
  const months = union(all.map((s) => s.timelineMonths));
  const updatedAt = [page?._updatedAt, ...all.map((s) => s._updatedAt)].filter(Boolean).sort().pop();

  /* editorial overrides from the page document */
  const heroSection = page?.sections?.find((s) => s._type === "sectionHeroPage");
  const introSection = page?.sections?.find((s) => s._type === "sectionTextIntro");
  const faqFromPage = collectFaq(page?.sections);
  const faq = faqFromPage.length ? faqFromPage : DEFAULT_FAQ;

  const headline = (heroSection?._type === "sectionHeroPage" && heroSection.headline) || "Predesigned prefab home series";
  const lede =
    (heroSection?._type === "sectionHeroPage" && heroSection.lede) ||
    [
      n
        ? `${word(n)[0].toUpperCase()}${word(n).slice(1)} architect-designed series${plans ? ` — ${plans} floor plans${range(sqft) ? ` from ${range(sqft, "square feet")}` : ""}` : ""} — with fixed structure, selectable finishes and a factory price you know on day one.`
        : "Architect-designed series with fixed structure, selectable finishes and a factory price you know on day one.",
      range(months) ? `Most series homes are set within ${range(months)} months of a signed contract.` : "",
    ]
      .filter(Boolean)
      .join(" ");

  const first = all[0];
  const heroImg = img(first?.heroImage, 2000, 1000);
  if (heroImg) preload(heroImg, { as: "image", fetchPriority: "high" });

  /* footnotes: ¹ catalog facts, ² prices, ³ timelines — the series'
     own sources when they name them, else the catalog itself */
  const asOf = updatedAt?.slice(0, 10);
  const named = all.flatMap((s) => s.sources ?? []).filter((s) => s.label);
  const sources = named.length
    ? named.filter((s, i, arr) => arr.findIndex((x) => x.label === s.label) === i).slice(0, 3)
    : [
        { label: "Predesigned catalog, Method Homes", date: asOf },
        { label: "Method Homes published starting prices", date: asOf },
        { label: "Method Homes project schedules", date: asOf },
      ];

  const cards = all.map((s) => ({
    _key: s._id,
    eyebrow: s.planCount ? `Series · ${s.planCount} floor plan${s.planCount === 1 ? "" : "s"}` : "Series",
    title: s.name,
    body: s.tagline || s.lede,
    meta: [range(s.sqft) ? range(s.sqft, "sq ft") : null, s.planCount ? `${s.planCount} plan${s.planCount === 1 ? "" : "s"}` : null].filter(Boolean).join(" · "),
    url: `/series/${s.slug}`,
    image: img(s.heroImage, 800, 600),
    alt: s.heroImage?.alt ?? `${s.name} Series home — exterior`,
  }));

  const compareRows = all.map((s) => ({
    _key: s._id,
    label: s.name,
    cells: [
      range(s.sqft) ? range(s.sqft, "sq ft") : "—",
      s.planCount ? String(s.planCount) : "—",
      range(s.beds) || "—",
      s.priceFrom ? `From ${usd(s.priceFrom)}²` : s.priceBand ? `${s.priceBand}²` : "On request",
      s.bestFor || s.tagline || "—",
    ],
  }));

  const updated = updatedLabel(updatedAt);

  return (
    <div data-mode="light" className="flex flex-col items-start bg-surface">
      <JsonLd
        data={webPage({
          type: "CollectionPage",
          name: page?.seo?.title || headline,
          description: page?.seo?.description || lede,
          path: PATH,
          dateModified: updatedAt,
          image: img(first?.heroImage, 1200, 675),
          ...(n ? { extra: { mainEntity: { "@id": `${BASE}${PATH}#list` } } } : {}),
        })}
      />
      <JsonLd data={breadcrumbList([CRUMB])} />
      {n > 0 && (
        <JsonLd
          data={{
            ...itemList(PATH, all.map((s) => ({ name: `${s.name} series`, path: `/series/${s.slug}`, image: img(s.heroImage, 800, 600) })), "Method Homes predesigned series"),
            itemListElement: all.map((s, i) => ({
              "@type": "ListItem",
              position: i + 1,
              item: { "@type": "Product", "@id": `${BASE}/series/${s.slug}#product`, name: `${s.name} series`, url: `${BASE}/series/${s.slug}` },
            })),
          }}
        />
      )}
      <JsonLd data={faqPage(PATH, faq)} />

      <HeroPage
        crumbs={[{ name: CRUMB.name }]}
        headline={headline}
        lede={lede}
        primary={{ label: "Compare the series", url: "#compare" }}
        secondary={{ label: "Get a range for your site", url: "/get-started" }}
      />

      {n > 0 ? (
        <>
          <div id="series" className="w-full scroll-mt-(--anchor-offset)">
            <CardGrid
              eyebrow="The series"
              headline={`${word(n)[0].toUpperCase()}${word(n).slice(1)} series${plans ? `, ${plans} floor plans` : ""}`}
              link={{ label: "How to choose", url: "#why" }}
              columns={4}
              cards={cards}
            />
          </div>
          <div id="lineup" className="w-full scroll-mt-(--anchor-offset)">
            <Lineup series={lineupData(all)} compareHref="#compare" sources={sources} />
          </div>
          {plans > 0 && (
            <Interstitial
              mode="light-mid"
              kind="number"
              text={String(plans)}
              subline={`floor plan${plans === 1 ? "" : "s"} across ${word(n)} series, all built in one factory.¹`}
            />
          )}
        </>
      ) : (
        <section className="w-full px-4 py-10xl md:px-7xl">
          <p className="mx-auto max-w-page text-body-md text-ink-2">The series catalog is being published. Check back shortly, or tell us about your site and we will send the lineup directly.</p>
        </section>
      )}

      <div id="why" className="w-full scroll-mt-(--anchor-offset)">
        {introSection?._type === "sectionTextIntro" && introSection.body?.length ? (
          <TextIntro
            eyebrow={introSection.eyebrow ?? "Why a series"}
            headline={introSection.headline ?? "Why buy a predesigned series home instead of custom?"}
            paragraphs={introSection.body
              .filter((b) => b._type === "block")
              .map((b) => ((b as { children?: { text?: string }[] }).children ?? []).map((c) => c.text ?? "").join(""))
              .filter(Boolean)}
            link={introSection.link ?? { label: "Compare series and custom", url: "/pricing" }}
          />
        ) : (
          <TextIntro
            eyebrow="Why a series"
            headline="Why buy a predesigned series home instead of custom?"
            paragraphs={[
              "A series home starts from a plan we've already engineered and built. Design time drops to selections, the factory price is known on day one, and permitting is faster because the structural package has been reviewed before.",
              `You still choose finishes, fixtures and façade materials — and most plans offer layout options. If none of the ${plans || ""} plans fits your site, our architects can modify one, or start a custom design.`.replace("the  plans", "the plans"),
            ]}
            link={{ label: "Compare series and custom", url: "/pricing" }}
          />
        )}
      </div>

      {n > 0 && (
        <div id="compare" className="w-full scroll-mt-(--anchor-offset)">
          <CompareTable
            eyebrow="Compare"
            headline="Which Method series fits your site and budget?"
            link={{ label: "Pricing guide", url: "/pricing" }}
            headers={["Series", "Size range", "Floor plans", "Bedrooms", "Starting range", "Best for"]}
            rows={compareRows}
            sources={sources}
          />
        </div>
      )}

      <div id="faq" className="w-full scroll-mt-(--anchor-offset)">
        <Faq
          eyebrow="FAQ"
          title="Common questions about predesigned homes"
          intro="Short, direct answers. Each question is a heading so it can be cited on its own."
          link={{ label: "Ask us a question", url: "/contact" }}
          items={faq}
        />
      </div>

      <CtaBand
        headline="Not sure which series fits your site? Tell us where you're building."
        body="A ten-minute intake tells us where you're building and what you need. We reply within two business days with a recommended path and a realistic range."
        primary={{ label: "Get a range for your site", url: "/get-started" }}
        secondary={{ label: "Talk to our team", url: "/contact" }}
      />

      {updated && (
        <p className="label w-full px-4 py-6 text-ink-3 md:px-7xl">
          <time dateTime={updatedAt}>{updated}</time>
        </p>
      )}
    </div>
  );
}

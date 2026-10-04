import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PortableText } from "next-sanity";

import { breadcrumbList, JsonLd, updatedLabel, webPage } from "@/components/seo/JsonLd";
import { sanityFetch } from "@/sanity/lib/fetch";
import { seoMeta } from "@/sanity/lib/seo";
import { urlFor } from "@/sanity/lib/image";
import { projectBySlugQuery } from "@/sanity/lib/queries";
import type { Project } from "@/sanity/types";

import designops from "../../../../../designops.config.json";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = await sanityFetch<Project | null>(
    projectBySlugQuery,
    { slug },
    null,
  );
  if (!project) return { title: "Project not found" };
  return seoMeta({ title: project.title, description: project.summary, path: `/projects/${slug}`, image: project.mainImage });
}

/* A project page is a case study (AEO play 7): the facts strip states
   series, size, modules, timeline, cost band and location; the
   brief/approach pair gives an engine the "why" to quote; a named
   testimonial carries a Review. All of it is mirrored into a House
   node so the page is one typed entity, not a photo with a caption. */
function houseJsonLd(project: Project, slug: string) {
  const base = designops.site.baseUrl;
  const props: { name: string; value: string | number }[] = [];
  if (project.series) props.push({ name: "Series", value: project.series });
  if (project.modules) props.push({ name: "Modules", value: project.modules });
  if (project.timelineMonths) props.push({ name: "Contract to keys", value: `${project.timelineMonths} months` });
  if (project.costBand) props.push({ name: "Cost band", value: project.costBand });
  let image: string | undefined;
  try {
    image = project.mainImage ? urlFor(project.mainImage).width(1200).height(675).fit("crop").url() : undefined;
  } catch {
    image = undefined;
  }
  const t = project.testimonial;
  return {
    "@type": "House",
    "@id": `${base}/projects/${slug}#house`,
    name: project.title,
    url: `${base}/projects/${slug}`,
    ...(project.summary ? { description: project.summary } : {}),
    ...(image ? { image } : {}),
    ...(project.location ? { address: { "@type": "PostalAddress", addressLocality: project.location } } : {}),
    ...(project.geo?.lat != null && project.geo?.lng != null
      ? { geo: { "@type": "GeoCoordinates", latitude: project.geo.lat, longitude: project.geo.lng } }
      : {}),
    ...(project.squareFeet ? { floorSize: { "@type": "QuantitativeValue", value: project.squareFeet, unitCode: "FTK" } } : {}),
    ...(project.bedrooms ? { numberOfBedrooms: project.bedrooms } : {}),
    ...(project.bathrooms ? { numberOfBathroomsTotal: project.bathrooms } : {}),
    ...(project.completedYear ? { yearBuilt: project.completedYear } : {}),
    ...(props.length ? { additionalProperty: props.map((p) => ({ "@type": "PropertyValue", ...p })) } : {}),
    ...(project.category === "commercial"
      ? {}
      : { accommodationCategory: project.category === "predesigned" ? "Predesigned prefab home" : "Custom prefab home" }),
    ...(t?.quote && t.clientName
      ? {
          review: {
            "@type": "Review",
            reviewBody: t.quote,
            author: { "@type": "Person", name: t.clientName },
            ...(t.date ? { datePublished: t.date } : {}),
            ...(t.rating ? { reviewRating: { "@type": "Rating", ratingValue: t.rating, bestRating: 5, worstRating: 1 } } : {}),
            /* the review is of the builder — the entity every page links to */
            itemReviewed: { "@id": `${base}/#organization` },
          },
        }
      : {}),
  };
}

const fmtSize = (bytes?: number) => (bytes ? `${Math.max(0.1, Math.round(bytes / 1024 / 1024 * 10) / 10)} MB` : undefined);

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await sanityFetch<Project | null>(
    projectBySlugQuery,
    { slug },
    null,
  );

  if (!project) notFound();

  const stats = [
    { label: "Location", value: project.location },
    { label: "Series", value: project.series },
    { label: "Category", value: project.category },
    {
      label: "Size",
      value: project.squareFeet
        ? `${project.squareFeet.toLocaleString()} sq ft`
        : undefined,
    },
    { label: "Bedrooms", value: project.bedrooms },
    { label: "Bathrooms", value: project.bathrooms },
    { label: "Modules", value: project.modules },
    { label: "Contract to keys", value: project.timelineMonths ? `${project.timelineMonths} months` : undefined },
    { label: "Cost band", value: project.costBand },
    { label: "Completed", value: project.completedYear },
  ].filter((stat) => stat.value !== undefined && stat.value !== null && stat.value !== "");

  const t = project.testimonial;
  const plans = (project.plans ?? []).filter((p) => p.url);
  const path = `/projects/${slug}`;
  const updated = updatedLabel(project._updatedAt);

  return (
    <article>
      <JsonLd
        data={webPage({
          name: project.title,
          description: project.summary,
          path,
          dateModified: project._updatedAt,
          extra: { mainEntity: houseJsonLd(project, slug) },
        })}
      />
      <JsonLd data={breadcrumbList([{ name: "Projects", path: "/projects" }, { name: project.title, path }])} />
      <div className="flex flex-col gap-6 px-6 pb-12 pt-16 sm:pt-24">
        <Link
          href="/projects"
          className="label font-medium text-ink-2 hover:text-ink"
        >
          ← All projects
        </Link>
        <h1 className="max-w-[56rem] font-display text-display-sm text-ink">
          {project.title}
        </h1>
        {project.summary && (
          <p className="max-w-2xl text-body-md text-ink-2">
            {project.summary}
          </p>
        )}
      </div>

      {project.mainImage && (
        <div className="relative aspect-[16/9] overflow-hidden bg-surface-2">
          <Image
            src={urlFor(project.mainImage).width(2000).height(1125).url()}
            alt={project.mainImage.alt ?? project.title}
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
        </div>
      )}

      {stats.length > 0 && (
        <dl className="grid grid-cols-2 border-t border-line sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className={`flex flex-col gap-[1.125rem] border-b border-line px-6 pb-16 pt-6 ${
                i > 0 ? "border-l" : ""
              }`}
            >
              <dt className="label font-medium opacity-70">{stat.label}</dt>
              <dd className="label font-medium capitalize text-ink">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {(project.challenge || project.approach) && (
        <section className="mx-auto grid max-w-5xl gap-10 px-6 py-16 md:grid-cols-2">
          {project.challenge && (
            <div className="flex flex-col gap-4">
              <h2 className="label font-medium text-ink-2">The brief</h2>
              <p className="text-body-md text-ink">{project.challenge}</p>
            </div>
          )}
          {project.approach && (
            <div className="flex flex-col gap-4">
              <h2 className="label font-medium text-ink-2">What we did</h2>
              <p className="text-body-md text-ink">{project.approach}</p>
            </div>
          )}
        </section>
      )}

      {project.body && (
        <div className="mx-auto max-w-3xl px-6 py-16">
          <div className="prose prose-neutral max-w-none dark:prose-invert">
            <PortableText value={project.body} />
          </div>
        </div>
      )}

      {t?.quote && t.clientName && (
        <section className="border-y border-line px-6 py-16">
          <figure className="mx-auto flex max-w-3xl flex-col gap-6">
            <blockquote className="font-display text-title-lg text-ink">“{t.quote}”</blockquote>
            <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-ink-2">
              <span className="font-medium text-ink">{t.clientName}</span>
              {t.clientDetail && <span>{t.clientDetail}</span>}
              {t.rating ? <span aria-label={`${t.rating} out of 5`}>{"★".repeat(Math.round(t.rating))}</span> : null}
              {t.date && (
                <time dateTime={t.date}>
                  {new Date(t.date).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
                </time>
              )}
            </figcaption>
          </figure>
        </section>
      )}

      {plans.length > 0 && (
        <section className="px-6 py-16">
          {/* plan PDFs as plain links (AEO play 9): crawlable, with the
              label in the anchor so the file is indexed under its name */}
          <h2 className="label mb-6 font-medium text-ink">Plans &amp; documents</h2>
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {plans.map((plan) => (
              <li key={plan._key}>
                <a
                  href={plan.url}
                  className="flex items-center justify-between gap-6 py-4 text-body-md text-ink hover:text-ink-2"
                  rel="noopener"
                  type="application/pdf"
                >
                  <span>{plan.label ?? "Floor plan (PDF)"}</span>
                  <span className="label text-ink-3">PDF{fmtSize(plan.size) ? ` · ${fmtSize(plan.size)}` : ""}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {project.gallery && project.gallery.length > 0 && (
        <section>
          <div className="flex h-[5.5rem] items-center border-y border-line px-6">
            <h2 className="label font-medium text-ink">Gallery</h2>
          </div>
          <div className="grid gap-px bg-line sm:grid-cols-2">
            {project.gallery.map((image) => (
              <div
                key={image._key}
                className="relative aspect-[4/3] overflow-hidden bg-surface-2"
              >
                <Image
                  src={urlFor(image).width(1200).height(900).url()}
                  alt={image.alt ?? project.title}
                  fill
                  sizes="(min-width: 640px) 50vw, 100vw"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {updated && (
        <p className="label px-6 py-6 text-ink-3">
          <time dateTime={project._updatedAt}>{updated}</time>
        </p>
      )}
    </article>
  );
}

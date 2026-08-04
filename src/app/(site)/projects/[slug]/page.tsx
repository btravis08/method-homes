import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PortableText } from "next-sanity";

import { sanityFetch } from "@/sanity/lib/fetch";
import { urlFor } from "@/sanity/lib/image";
import { projectBySlugQuery } from "@/sanity/lib/queries";
import type { Project } from "@/sanity/types";

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
  return { title: project.title, description: project.summary };
}

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
    { label: "Category", value: project.category },
    {
      label: "Size",
      value: project.squareFeet
        ? `${project.squareFeet.toLocaleString()} sq ft`
        : undefined,
    },
    { label: "Bedrooms", value: project.bedrooms },
    { label: "Bathrooms", value: project.bathrooms },
    { label: "Completed", value: project.completedYear },
  ].filter((stat) => stat.value !== undefined && stat.value !== null);

  return (
    <article>
      <div className="flex flex-col gap-6 px-6 pb-12 pt-16 sm:pt-24">
        <Link
          href="/projects"
          className="label font-medium text-ink-2 hover:text-ink"
        >
          ← All projects
        </Link>
        <h1 className="max-w-[56rem] font-display text-display-xl text-ink">
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
        <dl className="grid grid-cols-2 border-t border-line sm:grid-cols-3 lg:grid-cols-6">
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

      {project.body && (
        <div className="mx-auto max-w-3xl px-6 py-16">
          <div className="prose prose-neutral max-w-none dark:prose-invert">
            <PortableText value={project.body} />
          </div>
        </div>
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
    </article>
  );
}

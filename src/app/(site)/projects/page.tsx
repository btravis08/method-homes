import type { Metadata } from "next";
import Link from "next/link";

import { ProjectCard } from "@/components/ProjectCard";
import { sanityFetch } from "@/sanity/lib/fetch";
import {
  allProjectsQuery,
  projectsByCategoryQuery,
} from "@/sanity/lib/queries";
import type { Project } from "@/sanity/types";

export const metadata: Metadata = {
  title: "Projects",
  description: "Our residential and commercial prefab builds.",
};

const filters = [
  { value: undefined, label: "All" },
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
] as const;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const activeCategory =
    category === "residential" || category === "commercial"
      ? category
      : undefined;

  const projects = activeCategory
    ? await sanityFetch<Project[]>(
        projectsByCategoryQuery,
        { category: activeCategory },
        [],
      )
    : await sanityFetch<Project[]>(allProjectsQuery, {}, []);

  return (
    <div>
      <div className="flex flex-col gap-6 px-6 pb-12 pt-16 sm:pt-24">
        <p className="label font-medium text-ink-2">
          Residential + Commercial
        </p>
        <h1 className="font-display text-display-xl text-ink">
          Projects
        </h1>
      </div>

      <div className="flex items-center gap-2 border-b border-line px-6 pb-6">
        {filters.map((filter) => {
          const isActive = filter.value === activeCategory;
          return (
            <Link
              key={filter.label}
              href={
                filter.value
                  ? `/projects?category=${filter.value}`
                  : "/projects"
              }
              className={`label flex h-10 items-center justify-center rounded-xs px-3.5 font-medium transition-opacity hover:opacity-80 ${
                isActive ? "bg-btn text-btn-fg" : "bg-wash text-ink"
              }`}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      {projects.length > 0 ? (
        <div className="grid gap-px border-b border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project._id} project={project} />
          ))}
        </div>
      ) : (
        <div className="label border-b border-line p-12 text-center text-ink-2">
          <p>
            No {activeCategory ?? ""} projects yet. Add some in{" "}
            <Link href="/studio" className="text-ink underline">
              the Studio
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}

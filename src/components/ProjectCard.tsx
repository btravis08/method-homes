import Image from "next/image";
import Link from "next/link";

import { urlFor } from "@/sanity/lib/image";
import type { Project } from "@/sanity/types";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href={`/projects/${project.slug}`}
      className="group flex flex-col gap-[1.125rem] bg-surface px-6 pb-16 pt-6"
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-xs bg-surface-2">
        {project.mainImage ? (
          <Image
            src={urlFor(project.mainImage).width(800).height(600).url()}
            alt={project.mainImage.alt ?? project.title}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="label flex h-full items-center justify-center text-ink-3">
            No photo yet
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="label font-medium text-ink">{project.title}</h3>
          {project.completedYear && (
            <p className="label font-medium text-ink">{project.completedYear}</p>
          )}
        </div>
        <div className="flex items-baseline justify-between gap-4">
          {project.location && (
            <p className="label text-ink-2">{project.location}</p>
          )}
          <p className="label ml-auto text-ink-2">{project.category}</p>
        </div>
      </div>
    </Link>
  );
}

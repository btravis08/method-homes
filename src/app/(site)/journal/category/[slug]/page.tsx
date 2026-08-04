import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { sanityFetch } from "@/sanity/lib/fetch";
import { urlFor, sanitySrcSet } from "@/sanity/lib/image";
import {
  postCategoryBySlugQuery,
  postsByCategoryQuery,
  postsByCategoryCountQuery,
} from "@/sanity/lib/queries";
import type { SanityImageSource } from "@sanity/image-url";

/*
  Paginated category archive (Honors Journal): dark editorial list of
  a category's posts, newest first, 12 per page via ?page=N. Composed
  entirely from tokens; cards reuse the journal's image-over-label
  language.
*/

export const viewport: Viewport = { themeColor: "#0b0b0b" };

const PER_PAGE = 12;

interface ArchiveCategory {
  title?: string;
  slug?: string;
  description?: string;
}

interface ArchivePost {
  title?: string;
  slug?: string;
  heroImage?: SanityImageSource;
  excerpt?: string;
  publishedAt?: string;
  author?: string;
}

function formatDate(iso?: string) {
  if (!iso) return undefined;
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function pageNumber(raw: string | string[] | undefined) {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && n > 1 ? n : 1;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await sanityFetch<ArchiveCategory | null>(
    postCategoryBySlugQuery,
    { slug },
    null,
  );
  if (!category?.title) return { title: "Honors Journal" };
  return {
    title: `${category.title} — Honors Journal`,
    description:
      category.description ??
      `${category.title} stories from the Honors Journal.`,
  };
}

export default async function JournalCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const [{ slug }, search] = await Promise.all([params, searchParams]);
  const page = pageNumber(search.page);
  const from = (page - 1) * PER_PAGE;

  const [category, posts, total] = await Promise.all([
    sanityFetch<ArchiveCategory | null>(postCategoryBySlugQuery, { slug }, null),
    sanityFetch<ArchivePost[]>(
      postsByCategoryQuery,
      { slug, from, to: from + PER_PAGE },
      [],
    ),
    sanityFetch<number>(postsByCategoryCountQuery, { slug }, 0),
  ]);

  if (!category && posts.length === 0) notFound();

  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  if (page > pages) notFound();

  const withQuery = (n: number) =>
    n <= 1 ? `/journal/category/${slug}` : `/journal/category/${slug}?page=${n}`;

  return (
    <main data-mode="dark" className="w-full bg-surface pb-32 text-ink">
      {/* masthead */}
      <header className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-6 pb-16 pt-[8.75rem] text-center">
        <p className="label text-ink-3">
          <Link href="/journal" className="transition-colors hover:text-ink">
            HONORS JOURNAL
          </Link>
        </p>
        <h1 className="font-display text-headline-lg">
          {category?.title ?? slug}
        </h1>
        {category?.description && (
          <p className="max-w-xl text-body-md text-ink-2">{category.description}</p>
        )}
      </header>

      {/* archive grid */}
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-x-6 gap-y-12 px-6 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => {
          let src: string | undefined;
          try {
            src = post.heroImage
              ? urlFor(post.heroImage).width(800).url()
              : undefined;
          } catch {
            src = undefined;
          }
          const date = formatDate(post.publishedAt);
          return (
            <Link
              key={post.slug}
              href={`/journal/${post.slug}`}
              className="group flex flex-col gap-4"
            >
              {src && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={src}
                  srcSet={sanitySrcSet(src)}
                  sizes="(min-width: 1024px) 24rem, (min-width: 640px) 50vw, 100vw"
                  alt={post.title ?? ""}
                  loading="lazy"
                  decoding="async"
                  className="aspect-[3/4] w-full rounded-xs object-cover"
                />
              )}
              <div className="flex flex-col gap-2">
                {date && <p className="label text-ink-3">{date.toUpperCase()}</p>}
                <h2 className="font-display text-title-md transition-colors group-hover:text-ink-2">
                  {post.title}
                </h2>
                {post.excerpt && (
                  <p className="text-body-sm text-ink-2">{post.excerpt}</p>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {posts.length === 0 && (
        <p className="mx-auto max-w-xl px-6 text-center text-body-md text-ink-2">
          No stories in this category yet.
        </p>
      )}

      {/* pagination */}
      {pages > 1 && (
        <nav
          aria-label="Archive pages"
          className="mx-auto mt-20 flex max-w-6xl items-center justify-between border-t border-line px-6 pt-8"
        >
          {page > 1 ? (
            <Link href={withQuery(page - 1)} className="label transition-colors hover:text-ink-2">
              ← NEWER
            </Link>
          ) : (
            <span className="label text-ink-disabled">← NEWER</span>
          )}
          <p className="label text-ink-3">
            PAGE {page} OF {pages}
          </p>
          {page < pages ? (
            <Link href={withQuery(page + 1)} className="label transition-colors hover:text-ink-2">
              OLDER →
            </Link>
          ) : (
            <span className="label text-ink-disabled">OLDER →</span>
          )}
        </nav>
      )}
    </main>
  );
}

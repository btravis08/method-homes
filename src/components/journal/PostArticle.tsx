import Link from "next/link";
import { PortableText } from "next-sanity";
import type { PortableTextBlock } from "next-sanity";

import { urlFor } from "@/sanity/lib/image";
import { sanitySrcSet } from "@/sanity/lib/image";
import type { SanityImageSource } from "@sanity/image-url";

/*
  CMS blog post layout (Honors Journal): dark editorial surface —
  category + date masthead, Feature Deck title, full-bleed featured
  image, measured prose column with inline images and pull quotes,
  author byline. Tokens only; type rides the fluid scale.
*/

export interface PostDoc {
  title?: string;
  slug?: string;
  heroImage?: SanityImageSource;
  excerpt?: string;
  body?: PortableTextBlock[];
  publishedAt?: string;
  seoTitle?: string;
  seo?: import("@/sanity/types").SeoDoc | null;
  tags?: string[];
  author?: { name?: string; role?: string; avatar?: SanityImageSource };
  categories?: { title?: string; slug?: string }[];
}

export interface RelatedPost {
  title?: string;
  slug?: string;
  heroImage?: SanityImageSource;
  excerpt?: string;
  publishedAt?: string;
  category?: string;
}

function img(source: SanityImageSource | undefined, width: number) {
  if (!source) return undefined;
  try {
    return urlFor(source).width(width).url();
  } catch {
    return undefined;
  }
}

function formatDate(iso?: string) {
  if (!iso) return undefined;
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function PostArticle({
  post,
  related = [],
}: {
  post: PostDoc;
  related?: RelatedPost[];
}) {
  const hero = img(post.heroImage, 2000);
  const date = formatDate(post.publishedAt);
  const category = post.categories?.[0];

  return (
    <article data-mode="dark" className="w-full bg-surface pb-32 text-ink">
      {/* masthead */}
      <header className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-6 pb-12 pt-[8.75rem] text-center">
        <p className="label text-ink-3">
          {category?.title && category.slug ? (
            <>
              <Link
                href={`/journal/category/${category.slug}`}
                className="transition-colors hover:text-ink"
              >
                {category.title.toUpperCase()}
              </Link>
              {date && ` · ${date.toUpperCase()}`}
            </>
          ) : (
            [category?.title, date].filter(Boolean).join(" · ").toUpperCase()
          )}
        </p>
        <h1 className="font-display text-headline-lg">{post.title}</h1>
        {post.excerpt && (
          <p className="max-w-xl text-body-md text-ink-2">{post.excerpt}</p>
        )}
      </header>

      {/* featured image — eager: it's the page's LCP */}
      {hero && (
        <div className="w-full px-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hero}
            srcSet={sanitySrcSet(hero)}
            sizes="100vw"
            alt={post.title ?? ""}
            fetchPriority="high"
            decoding="async"
            className="aspect-[16/9] w-full rounded-xs object-cover"
          />
        </div>
      )}

      {/* body */}
      {post.body && (
        <div className="prose-journal mx-auto mt-16 flex max-w-2xl flex-col gap-6 px-6 text-body-md leading-relaxed text-ink-2">
          <PortableText
            value={post.body}
            components={{
              block: {
                normal: ({ children }) => <p>{children}</p>,
                h2: ({ children }) => (
                  <h2 className="mt-6 font-display text-title-lg text-ink">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="mt-4 font-display text-title-sm text-ink">{children}</h3>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="my-6 border-l border-line pl-6 font-display text-title-md text-ink">
                    {children}
                  </blockquote>
                ),
              },
              types: {
                image: ({ value }) => {
                  const src = img(value, 1400);
                  if (!src) return null;
                  return (
                    <figure className="my-6 flex flex-col gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        srcSet={sanitySrcSet(src)}
                        sizes="(min-width: 768px) 42rem, 100vw"
                        alt={value.alt ?? ""}
                        loading="lazy"
                        decoding="async"
                        className="w-full rounded-xs"
                      />
                      {value.caption && (
                        <figcaption className="label text-ink-3">{value.caption}</figcaption>
                      )}
                    </figure>
                  );
                },
              },
            }}
          />
        </div>
      )}

      {/* byline */}
      {post.author?.name && (
        <footer className="mx-auto mt-16 flex max-w-2xl items-center gap-4 border-t border-line px-6 pt-8">
          {img(post.author.avatar, 200) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img(post.author.avatar, 200)}
              alt={post.author.name}
              loading="lazy"
              className="size-12 rounded-xs object-cover"
            />
          )}
          <div className="flex flex-col">
            <p className="label font-medium text-ink">{post.author.name.toUpperCase()}</p>
            {post.author.role && <p className="label text-ink-3">{post.author.role}</p>}
          </div>
        </footer>
      )}

      {/* tags */}
      {(post.tags?.length ?? 0) > 0 && (
        <ul className="mx-auto mt-8 flex max-w-2xl flex-wrap gap-2 px-6">
          {post.tags!.map((tag) => (
            <li
              key={tag}
              className="label rounded-xs border border-line px-3 py-2 text-ink-3"
            >
              {tag.toUpperCase()}
            </li>
          ))}
        </ul>
      )}

      {/* related stories — shared category, newest first */}
      {related.length > 0 && (
        <aside className="mx-auto mt-24 max-w-6xl border-t border-line px-6 pt-12">
          <h2 className="label mb-8 text-ink-3">RELATED STORIES</h2>
          <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-3">
            {related.map((item) => {
              const src = img(item.heroImage, 800);
              const itemDate = formatDate(item.publishedAt);
              return (
                <Link
                  key={item.slug}
                  href={`/journal/${item.slug}`}
                  className="group flex flex-col gap-4"
                >
                  {src && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      srcSet={sanitySrcSet(src)}
                      sizes="(min-width: 640px) 33vw, 100vw"
                      alt={item.title ?? ""}
                      loading="lazy"
                      decoding="async"
                      className="aspect-[3/4] w-full rounded-xs object-cover"
                    />
                  )}
                  <div className="flex flex-col gap-2">
                    <p className="label text-ink-3">
                      {[item.category, itemDate]
                        .filter(Boolean)
                        .join(" · ")
                        .toUpperCase()}
                    </p>
                    <h3 className="font-display text-title-sm transition-colors group-hover:text-ink-2">
                      {item.title}
                    </h3>
                  </div>
                </Link>
              );
            })}
          </div>
        </aside>
      )}
    </article>
  );
}

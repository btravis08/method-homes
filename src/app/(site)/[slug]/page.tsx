import type { Metadata } from "next";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";

import { resolveRedirect } from "@/sanity/lib/redirects";
import { PortableText } from "next-sanity";

import { cookies, draftMode } from "next/headers";

import { FooterTagline } from "@/components/FooterTagline";
import { PageGate } from "@/components/PageGate";
import { buildSliderCardMap, SectionRenderer } from "@/components/SectionRenderer";
import { gateCookieName, gateCookieValue } from "@/lib/gate";
import { sanityFetch } from "@/sanity/lib/fetch";
import { urlFor } from "@/sanity/lib/image";
import { pageBySlugQuery, pagePassphraseQuery } from "@/sanity/lib/queries";
import { seoMeta } from "@/sanity/lib/seo";
import type { Page } from "@/sanity/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await sanityFetch<Page | null>(pageBySlugQuery, { slug }, null);
  if (!page) return { title: "Page not found" };
  const meta = seoMeta({ seo: page.seo, title: page.title, path: `/${slug}` });
  /* protected pages never index, whatever the SEO fields say */
  if (page.protected) meta.robots = { index: false, follow: false };
  return meta;
}

export default async function CmsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ gate?: string }>;
}) {
  const { slug } = await params;
  const page = await sanityFetch<Page | null>(pageBySlugQuery, { slug }, null);

  if (!page) {
    /* CMS-managed redirects get a look before the 404 */
    const hit = await resolveRedirect(`/${slug}`);
    if (hit) redirect(hit.to);
    notFound();
  }

  /* Presentation preview: live client shell, edits stream pre-save */
  const { isEnabled: isDraft } = await draftMode();

  /* Passphrase gate (C1) — editors in draft mode walk through. Fails
     closed: no reachable passphrase means no page. */
  if (page.protected && !isDraft) {
    const passphrase = await sanityFetch<string | null>(
      pagePassphraseQuery,
      { slug },
      null,
    );
    const cookie = (await cookies()).get(gateCookieName(slug))?.value;
    const unlocked =
      Boolean(passphrase?.trim()) &&
      cookie === gateCookieValue(slug, passphrase!);
    if (!unlocked) {
      const { gate } = await searchParams;
      return <PageGate slug={slug} title={page.title} wrong={gate === "wrong"} />;
    }
  }
  if (isDraft && page.sections?.length) {
    const { PreviewGate } = await import("@/components/preview/PreviewGate");
    const sliderCards = await buildSliderCardMap(page.sections ?? []);
    return <PreviewGate kind="page" slug={slug} initial={page} sliderCards={sliderCards} />;
  }

  // Section-built page
  if (page.sections?.length) {
    return (
      <div data-mode="light" className="flex flex-col items-start bg-surface">
        {page.showFooterTagline && <FooterTagline />}
        <SectionRenderer sections={page.sections} />
      </div>
    );
  }

  // Legacy page (heroImage + body)
  return (
    <article>
      <div className="flex flex-col gap-6 px-6 pb-12 pt-16 sm:pt-24">
        <h1 className="max-w-[56rem] font-display text-display-xl text-ink">
          {page.title}
        </h1>
      </div>

      {page.heroImage && (
        <div className="relative aspect-[16/9] overflow-hidden bg-surface-2">
          <Image
            src={urlFor(page.heroImage).width(2000).height(1125).url()}
            alt={page.heroImage.alt ?? page.title}
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
        </div>
      )}

      {page.body && (
        <div className="mx-auto max-w-3xl px-6 py-16">
          <div className="prose prose-neutral max-w-none dark:prose-invert">
            <PortableText value={page.body} />
          </div>
        </div>
      )}
    </article>
  );
}

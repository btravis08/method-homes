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
import { breadcrumbList, collectFaq, collectHowTo, collectPeople, faqPage, howTo, JsonLd, personNodes, reviewNodes, updatedLabel, webPage } from "@/components/seo/JsonLd";
import { sanityFetch as fetchTeam } from "@/sanity/lib/fetch";
import { teamMembersQuery } from "@/sanity/lib/queries";
import type { TeamMember } from "@/sanity/types";
import { sanityFetch } from "@/sanity/lib/fetch";
import { urlFor } from "@/sanity/lib/image";
import { pageBySlugQuery, pagePassphraseQuery } from "@/sanity/lib/queries";
import { seoMeta } from "@/sanity/lib/seo";
import type { Page } from "@/sanity/types";

/* Plain text from a section tree: strings and Portable Text blocks in
   copy-bearing fields, longest-first — the meta description fallback
   when the SEO field is empty, so no CMS page ships without one */
function describeSections(sections: unknown, max = 155): string | undefined {
  const texts: string[] = [];
  const KEYS = new Set(["body", "description", "copy", "text", "headline", "subtitle", "quote", "title", "intro", "answer"]);
  const grab = (v: unknown): string => {
    if (typeof v === "string") return v;
    if (Array.isArray(v))
      return v
        .map((b) => (b && typeof b === "object" && (b as { _type?: string })._type === "block" ? ((b as { children?: { text?: string }[] }).children ?? []).map((c) => c.text ?? "").join("") : ""))
        .join(" ");
    return "";
  };
  const walk = (node: unknown, depth: number) => {
    if (!node || typeof node !== "object" || depth > 3) return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (KEYS.has(k)) {
        const t = grab(v).replace(/\s+/g, " ").trim();
        if (t.length >= 40) texts.push(t);
      } else if (v && typeof v === "object") walk(v, depth + 1);
    }
  };
  walk(sections, 0);
  if (!texts.length) return undefined;
  const best = texts.sort((a, b) => b.length - a.length)[0];
  if (best.length <= max) return best;
  const cut = best.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 80)).trim()}…`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await sanityFetch<Page | null>(pageBySlugQuery, { slug }, null);
  if (!page) return { title: "Page not found" };
  const meta = seoMeta({ seo: page.seo, title: page.title, description: describeSections(page.sections), path: `/${slug}` });
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

  const path = `/${slug}`;
  const crumbs = breadcrumbList([{ name: page.title, path }]);
  const updated = updatedLabel(page._updatedAt);

  // Section-built page
  if (page.sections?.length) {
    const faq = collectFaq(page.sections);
    const hasForm = page.sections.some((s) => s._type === "sectionFormBlock");
    /* Person nodes: the Team grid's picks, or everyone when it shows all */
    const picked = collectPeople(page.sections);
    const showsEveryone = page.sections.some((s) => s._type === "sectionTeamGrid" && !(s.members ?? []).filter(Boolean).length);
    const people = showsEveryone ? await fetchTeam<TeamMember[]>(teamMembersQuery, {}, []) : picked;
    return (
      <div data-mode="light" className="flex flex-col items-start bg-surface">
        <JsonLd
          data={webPage({
            /* a page that IS a FAQ types itself as one; a page with a
               FAQ section among others stays a WebPage and carries the
               FAQPage node beside it */
            type: hasForm
              ? "ContactPage"
              : faq.length && page.sections.every((s) => s._type === "sectionFaq" || s._type === "sectionHero")
                ? "FAQPage"
                : "WebPage",
            name: page.seo?.title || page.title,
            description: page.seo?.description || describeSections(page.sections),
            path,
            dateModified: page._updatedAt,
          })}
        />
        <JsonLd data={crumbs} />
        <JsonLd data={faqPage(path, faq)} />
        <JsonLd data={howTo(path, collectHowTo(page.sections), page.seo?.description)} />
        {reviewNodes(path, page.sections).map((r) => <JsonLd key={String(r["@id"])} data={r} />)}
        {personNodes(path, people).map((n) => <JsonLd key={n["@id"]} data={n} />)}
        {/* the document heading: section headlines are display copy,
            not the page's name — answer engines want exactly one H1 */}
        <h1 className="sr-only">{page.title}</h1>
        {page.showFooterTagline && <FooterTagline />}
        <SectionRenderer sections={page.sections} crumbs={[{ name: page.title, path }]} />
        {/* visible freshness: the date an engine can read off the page
            (its twin is WebPage.dateModified above) */}
        {updated && (
          <p className="label w-full px-4 py-6 text-ink-3 md:px-8">
            <time dateTime={page._updatedAt}>{updated}</time>
          </p>
        )}
      </div>
    );
  }

  // Legacy page (heroImage + body)
  return (
    <article>
      <JsonLd data={webPage({ name: page.seo?.title || page.title, description: page.seo?.description, path, dateModified: page._updatedAt })} />
      <JsonLd data={crumbs} />
      <div className="flex flex-col gap-6 px-6 pb-12 pt-16 sm:pt-24">
        <h1 className="max-w-[56rem] font-display text-display-sm text-ink">
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
          {updated && (
            <p className="label pt-8 text-ink-3">
              <time dateTime={page._updatedAt}>{updated}</time>
            </p>
          )}
        </div>
      )}
    </article>
  );
}

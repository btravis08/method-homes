import type { FaqItem, PageSection } from "@/sanity/types";

import designops from "../../../designops.config.json";

/*
  Per-route structured data. The site layout emits the Organization +
  WebSite graph on every page; routes add the node that says what THIS
  page is (WebPage / CollectionPage / Blog / ContactPage…), linked to
  that graph. Answer engines use it to type the page before quoting it
  — the AEO grader's "schema type matches the page" check.

  The helpers below (breadcrumbList, faqPage, itemList) are the other
  node kinds a route adds next to its WebPage: breadcrumbs name the
  page's place in the site, FAQPage makes each Q/A a quotable unit,
  ItemList types a listing's members. Every node links back to the
  page's @id so the graph stays one graph.
*/

export type WebPageKind = "WebPage" | "AboutPage" | "ContactPage" | "CollectionPage" | "Blog" | "FAQPage" | "ProfilePage";

const BASE = designops.site.baseUrl;

export const pageId = (path: string) => `${BASE}${path}#webpage`;

export function webPage(opts: {
  type?: WebPageKind;
  name: string;
  description?: string | null;
  path: string;
  dateModified?: string | null;
  image?: string | null;
  extra?: Record<string, unknown>;
}) {
  const url = `${BASE}${opts.path}`;
  return {
    "@context": "https://schema.org",
    "@type": opts.type ?? "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: opts.name,
    ...(opts.description ? { description: opts.description } : {}),
    ...(opts.image ? { primaryImageOfPage: { "@type": "ImageObject", url: opts.image } } : {}),
    ...(opts.dateModified ? { dateModified: opts.dateModified } : {}),
    isPartOf: { "@id": `${BASE}/#website` },
    about: { "@id": `${BASE}/#organization` },
    inLanguage: "en-US",
    ...(opts.extra ?? {}),
  };
}

/* Home → … → this page. The first crumb is always the site root; pass
   the rest in order. Paths are site-relative. */
export function breadcrumbList(crumbs: { name: string; path: string }[]) {
  const all = [{ name: designops.aeo.brand, path: "/" }, ...crumbs];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": `${BASE}${all[all.length - 1].path}#breadcrumb`,
    itemListElement: all.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: `${BASE}${crumb.path}`,
    })),
  };
}

/* Every FAQ item a section-built page shows — top-level FAQ sections
   plus those in an experiment's CONTROL variant (the first one), which
   is what no-JS visitors and crawlers receive. */
export function collectFaq(sections: PageSection[] | undefined): FaqItem[] {
  const out: FaqItem[] = [];
  for (const section of sections ?? []) {
    if (section._type === "sectionFaq") out.push(...(section.items ?? []));
    else if (section._type === "sectionExperiment") out.push(...collectFaq(section.variants?.[0]?.sections));
  }
  return out;
}

/* The first Process timeline on a page (top level or in the control
   variant) — the HowTo the route emits */
export function collectHowTo(sections: PageSection[] | undefined): { name?: string; steps: { title?: string; body?: string; duration?: string }[] } | null {
  for (const section of sections ?? []) {
    if (section._type === "sectionProcess" && section.steps?.length) return { name: section.headline, steps: section.steps };
    if (section._type === "sectionExperiment") {
      const inner = collectHowTo(section.variants?.[0]?.sections);
      if (inner) return inner;
    }
  }
  return null;
}

/* Every testimonial on a section-built page → Review nodes of the
   Organization (the entity every page links to). A section that
   pulls a project's testimonial reviews the Organization too. */
export function reviewNodes(path: string, sections: PageSection[] | undefined) {
  const out: Record<string, unknown>[] = [];
  const walk = (list: PageSection[] | undefined) => {
    for (const s of list ?? []) {
      if (s._type === "sectionTestimonial") {
        const t = s.project?.testimonial;
        const quote = s.quote || t?.quote;
        const name = s.clientName || t?.clientName;
        if (!quote || !name) continue;
        const date = s.date || t?.date;
        const rating = s.rating ?? t?.rating;
        out.push({
          "@context": "https://schema.org",
          "@type": "Review",
          "@id": `${BASE}${path}#review-${s._key}`,
          reviewBody: quote,
          author: { "@type": "Person", name },
          ...(date ? { datePublished: date } : {}),
          ...(rating ? { reviewRating: { "@type": "Rating", ratingValue: rating, bestRating: 5, worstRating: 1 } } : {}),
          itemReviewed: { "@id": `${BASE}/#organization` },
          isPartOf: { "@id": pageId(path) },
        });
      } else if (s._type === "sectionExperiment") walk(s.variants?.[0]?.sections);
    }
  };
  walk(sections);
  return out;
}

/* Named people on the page (Team grid picks) → Person nodes who work
   for the Organization; LinkedIn is their sameAs. The "everyone"
   case resolves server-side, so pass the resolved members in. */
export function personNodes(path: string, people: { _id: string; name?: string; role?: string; credentials?: string; linkedin?: string }[]) {
  return people
    .filter((p) => p.name)
    .map((p) => ({
      "@context": "https://schema.org",
      "@type": "Person",
      "@id": `${BASE}${path}#person-${p._id}`,
      name: p.name,
      ...(p.role ? { jobTitle: p.role } : {}),
      ...(p.credentials ? { description: p.credentials } : {}),
      ...(p.linkedin ? { sameAs: [p.linkedin] } : {}),
      worksFor: { "@id": `${BASE}/#organization` },
    }));
}

/* the Team grid picks on a page (top level or control variant) */
export function collectPeople(sections: PageSection[] | undefined): { _id: string; name?: string; role?: string; credentials?: string; linkedin?: string }[] {
  const out: { _id: string; name?: string; role?: string; credentials?: string; linkedin?: string }[] = [];
  for (const s of sections ?? []) {
    if (s._type === "sectionTeamGrid") out.push(...((s.members ?? []).filter(Boolean) as { _id: string; name?: string; role?: string; credentials?: string; linkedin?: string }[]));
    else if (s._type === "sectionExperiment") out.push(...collectPeople(s.variants?.[0]?.sections));
  }
  return out;
}

/* "6–8 weeks" → ISO 8601 duration of the upper bound (P8W); anything
   that does not parse is left out rather than guessed */
function isoDuration(s?: string) {
  const m = s?.match(/(\d+)(?:\s*[–-]\s*(\d+))?\s*(week|month|day)s?/i);
  if (!m) return undefined;
  const n = Number(m[2] ?? m[1]);
  const unit = m[3].toLowerCase();
  return unit === "week" ? `P${n}W` : unit === "month" ? `P${n}M` : `P${n}D`;
}

export function howTo(path: string, data: { name?: string; steps: { title?: string; body?: string; duration?: string }[] } | null, description?: string | null) {
  if (!data || !data.steps.length) return null;
  const steps = data.steps.filter((s) => s.title);
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "@id": `${BASE}${path}#howto`,
    name: data.name ?? "How a Method home gets built",
    ...(description ? { description } : {}),
    isPartOf: { "@id": pageId(path) },
    step: steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.title,
      ...(s.body ? { text: s.body } : {}),
      ...(isoDuration(s.duration) ? { timeRequired: isoDuration(s.duration) } : {}),
      url: `${BASE}${path}#step-${i + 1}`,
    })),
  };
}

/* FAQPage node for a page's question/answer items (every FAQ section
   on the page pooled into one list — Google wants one FAQPage per
   page). Returns null when there is nothing to say. */
export function faqPage(path: string, items: { question?: string; answer?: string }[]) {
  const qa = items.filter((item) => item.question?.trim() && item.answer?.trim());
  if (!qa.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${BASE}${path}#faq`,
    isPartOf: { "@id": pageId(path) },
    mainEntity: qa.map((item) => ({
      "@type": "Question",
      name: item.question!.trim(),
      acceptedAnswer: { "@type": "Answer", text: item.answer!.trim() },
    })),
  };
}

/* ItemList for an index page (projects, posts, plans): names each
   member and its URL so an engine can enumerate "Method Homes
   projects" without guessing from the cards. */
export function itemList(path: string, items: { name: string; path: string; image?: string | null }[], name?: string) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${BASE}${path}#list`,
    ...(name ? { name } : {}),
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      url: `${BASE}${item.path}`,
      ...(item.image ? { image: item.image } : {}),
    })),
  };
}

/* "Updated March 2026" — the visible twin of dateModified. Answer
   engines weigh a date they can see over one only in the schema. */
export function updatedLabel(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `Updated ${d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}`;
}

export function JsonLd({ data }: { data: unknown }) {
  if (data == null) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

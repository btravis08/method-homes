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

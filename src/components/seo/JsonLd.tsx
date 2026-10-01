import designops from "../../../designops.config.json";

/*
  Per-route structured data. The site layout emits the Organization +
  WebSite graph on every page; routes add the node that says what THIS
  page is (WebPage / CollectionPage / Blog / ContactPage…), linked to
  that graph. Answer engines use it to type the page before quoting it
  — the AEO grader's "schema type matches the page" check.
*/

export type WebPageKind = "WebPage" | "AboutPage" | "ContactPage" | "CollectionPage" | "Blog" | "FAQPage";

export function webPage(opts: {
  type?: WebPageKind;
  name: string;
  description?: string | null;
  path: string;
  dateModified?: string | null;
  image?: string | null;
  extra?: Record<string, unknown>;
}) {
  const base = designops.site.baseUrl;
  const url = `${base}${opts.path}`;
  return {
    "@context": "https://schema.org",
    "@type": opts.type ?? "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: opts.name,
    ...(opts.description ? { description: opts.description } : {}),
    ...(opts.image ? { primaryImageOfPage: { "@type": "ImageObject", url: opts.image } } : {}),
    ...(opts.dateModified ? { dateModified: opts.dateModified } : {}),
    isPartOf: { "@id": `${base}/#website` },
    about: { "@id": `${base}/#organization` },
    inLanguage: "en-US",
    ...(opts.extra ?? {}),
  };
}

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

import { SpeedInsights } from "@vercel/speed-insights/next";
import { draftMode } from "next/headers";

import { AnnouncementBar } from "@/components/AnnouncementBar";
import { CartProvider } from "@/components/cart/CartContext";
import { LazyCartFlyout } from "@/components/cart/LazyCartFlyout";
import { LazySearchFlyout } from "@/components/search/LazySearchFlyout";
import { Navigation } from "@/components/Navigation";
import type { MenuItem, NavData, NavLink } from "@/components/Navigation";
import { FooterTaglineProvider } from "@/components/FooterTagline";
import { PageTransition } from "@/components/PageTransition";
import { LegacyBand, SiteFooter } from "@/components/SiteFooter";
import { LiveVisualEditing } from "@/components/LiveVisualEditing";
import { TokenInspectorGate } from "@/components/dev/TokenInspectorGate";
import { MotionProvider } from "@/components/MotionProvider";
import { SmoothScroll } from "@/components/SmoothScroll";
import { sanityFetch } from "@/sanity/lib/fetch";
import { urlFor } from "@/sanity/lib/image";
import { navigationQuery, siteSettingsQuery } from "@/sanity/lib/queries";
import type { NavigationDoc, NavLinkDoc, SiteSettingsDoc } from "@/sanity/types";
import type { SanityImageSource } from "@sanity/image-url";

function img(source: SanityImageSource | undefined | null, width = 1400) {
  if (!source) return undefined;
  try {
    return urlFor(source).width(width).url();
  } catch {
    return undefined;
  }
}

/* Site-owned routes for CMS links that predate their pages: entries in
   the navigation document still pointing at "#" get routed here by
   label, so the journal is reachable without a dataset edit */
const OWNED_ROUTES: [RegExp, string][] = [[/honors\s*journal/i, "/journal"]];

function ownedUrl(label: string, url: string): string {
  if (url && url !== "#") return url;
  return OWNED_ROUTES.find(([re]) => re.test(label))?.[1] ?? url;
}

/* Resolve CMS links: a linked collection supplies the label fallback
   and routes to its collection page */
function toLink(link: NavLinkDoc): NavLink {
  const collectionUrl = link.collection?.slug
    ? `/collections/${link.collection.slug}`
    : undefined;
  const label = link.label ?? link.collection?.title ?? "";
  return {
    label,
    url: ownedUrl(
      label,
      (link.url && link.url !== "#" ? link.url : undefined) ?? collectionUrl ?? "#",
    ),
  };
}

function toNavData(doc: NavigationDoc | null): NavData | undefined {
  if (!doc?.items?.length) return undefined;
  const items: MenuItem[] = doc.items.map((item) => ({
    title: item.title ?? "",
    layout: item.layout ?? "columns",
    columns: item.columns?.map((column) => ({
      title: column.title ?? "",
      links: (column.links ?? []).map(toLink),
    })),
    products: (item.products ?? [])
      .filter((product) => Boolean(product?._id))
      .map((product) => ({
        title: product!.title ?? "",
        image: img(product!.hoverImage ?? product!.thumb, 900),
      })),
    cards: item.cards?.map((card) => ({
      title: card.title ?? "",
      image: img(card.image, 1100),
      url: ownedUrl(card.title ?? "", card.url || "#"),
    })),
    /* image card: collection first, overrides win */
    image: img(item.image, 1100) ?? img(item.imageCollection?.image, 1100),
    imageTitle: item.imageTitle ?? item.imageCollection?.title,
    /* the mobile sheet's ALL link — the item's collection page */
    allUrl: item.imageCollection?.slug
      ? `/collections/${item.imageCollection.slug}`
      : undefined,
  }));
  return { items, company: (doc.companyLinks ?? []).map(toLink) };
}

/* SDR site chrome — wraps every site route, but not /studio */
export default async function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [navDoc, settings] = await Promise.all([
    sanityFetch<NavigationDoc | null>(navigationQuery, {}, null),
    sanityFetch<SiteSettingsDoc | null>(siteSettingsQuery, {}, null),
  ]);
  const { isEnabled: isDraft } = await draftMode();

  /* announcement bar: enabled + inside its schedule window (evaluated
     at render/revalidate time — 10-minute ISR granularity is fine) */
  const a = settings?.announcement;
  const now = Date.now();
  const announcement =
    a?.enabled &&
    a.text &&
    (!a.startsAt || Date.parse(a.startsAt) <= now) &&
    (!a.endsAt || Date.parse(a.endsAt) >= now)
      ? {
          text: a.text,
          url: a.url || undefined,
          colorMode: a.colorMode,
          dismissible: a.dismissible,
        }
      : null;

  return (
    <MotionProvider>
    <SmoothScroll>
      <CartProvider>
      <FooterTaglineProvider>
      {/* raised page wrapper; its bottom margin (--footer-h, published
          by SiteFooter) is the reveal window for the fixed footer
          pinned underneath — a margin, so the footer stays clickable.
          Capped at one viewport: a footer taller than the screen
          (mobile) reveals its bottom viewport-full with no dead
          scroll past it */}
      <div
        id="top"
        /* min-h-lvh (not svh): during iOS toolbar transitions the
           layout viewport is taller than svh — the wrapper must cover
           it or the fixed footer peeks through on load */
        className="relative z-10 flex min-h-lvh flex-col bg-surface mb-[min(var(--footer-h,0px),100svh)]"
      >
        {announcement && (
          <>
            {/* nav + page offset while the bar is live; the bar's
                dismiss logic zeroes the var */}
            <style>{`:root{--announce-h:2.5rem}`}</style>
            <AnnouncementBar announcement={announcement} />
          </>
        )}
        <Navigation data={toNavData(navDoc)} />
        <main className="flex-1">
          {/* draft mode (Presentation preview) skips the transition
              wrapper: its FrozenRouter freezes the router context so
              exiting pages keep their old content — which also eats
              router.refresh(), so live edits never landed on the
              page. Editors get edits; visitors keep the fade. */}
          {isDraft ? children : <PageTransition>{children}</PageTransition>}
        </main>
        <LegacyBand />
      </div>
      <SiteFooter />
      <LazyCartFlyout />
      <LazySearchFlyout />
      {/* real-user Core Web Vitals (enable Speed Insights in Vercel) */}
      <SpeedInsights />
      {/* click-to-edit overlays + live refresh, ONLY inside the
          Studio's Presentation preview (draft mode); ordinary
          visitors never load this */}
      {isDraft && <LiveVisualEditing />}
      {/* Figma-Dev-Mode-style token readout: Alt+T or ?inspect=1.
          Off by default and its chunk stays unloaded until then */}
      <TokenInspectorGate />
      </FooterTaglineProvider>
      </CartProvider>
    </SmoothScroll>
    </MotionProvider>
  );
}

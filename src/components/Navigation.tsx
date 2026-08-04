"use client";

import {
  AnimatePresence,
  animate,
  m,
  useMotionValue,
  useTransform,
} from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { MEDIA_EASE } from "@/components/home/AnimatedMedia";
import { ArrowLink, ArrowSwap } from "@/components/home/ArrowHover";
import { Logo } from "@/components/Logo";
import { useCart } from "@/components/cart/CartContext";
import { NavTextLink } from "@/components/NavTextLink";
import { SmartLink } from "@/components/SmartLink";
import { startNavBackdropProbes } from "@/components/navBackdrop";
import { ArrowUpRight, SearchMd } from "@/components/icons";
import { MenuX } from "@/components/MenuX";
import { EASE_DRAMATIC, EASE_OUT } from "@/lib/motion";

/*
  Site navigation. Content comes from the Sanity "navigation" singleton
  (menu items → dropdown layouts → links, Shopify-style); the constants
  below are the fallback when the document doesn't exist yet.

  Desktop / tablet (md+):
  - fixed; transparent over the hero, otherwise light-gray tiles with
    1px white gaps (the product grid scheme)
  - slides away on scroll down, back in on scroll up
  - hovering fills the nav; hovering a menu link slides the meganav
    down. Three dropdown layouts: link columns + image card, a product
    grid, and image cards.

  Mobile (< md):
  - the control bar (SEARCH / ACCOUNT / BAG / menu) is fixed to the
    bottom at all times, blurred over content, inverting over dark
    sections
  - the menu button opens a full-screen sheet with accordion sections
*/

export interface NavLink {
  label: string;
  url: string;
}

export interface MenuColumn {
  title: string;
  links: NavLink[];
}

export interface NavCard {
  title: string;
  image?: string;
  url: string;
}

export interface NavProduct {
  title: string;
  image?: string;
}

export interface MenuItem {
  title: string;
  layout: "columns" | "products" | "cards" | "none";
  columns?: MenuColumn[];
  products?: NavProduct[];
  cards?: NavCard[];
  image?: string;
  imageTitle?: string;
  /* the mobile sheet's ALL link — this item's own collection page */
  allUrl?: string;
}

export interface NavData {
  items: MenuItem[];
  company: NavLink[];
}

/* ---------- fallback content (mirrors the seeded navigation) ---------- */

const L = (labels: string[]): NavLink[] => labels.map((label) => ({ label, url: "#" }));

const FEATURED: MenuColumn = {
  title: "Featured",
  links: L([
    "New Arrivals",
    "The Coral Standard",
    "Training Gear",
    "First Light Collection",
    "Footwear",
    "Final Few",
  ]),
};

const DEFAULT_NAV: NavData = {
  items: [
    {
      title: "Men",
      layout: "columns",
      image: "/figma/products/presidio-white.png",
      imageTitle: "Men’s Apparel",
      columns: [
        FEATURED,
        { title: "Tops", links: L(["Polos", "T-Shirts", "Sweaters", "Hoodies & Pullovers", "Outerwear"]) },
        { title: "Bottoms", links: L(["Shorts", "Pants", "Joggers"]) },
        { title: "Accessories", links: L(["Headwear", "Gloves", "Bags", "Socks", "Outerwear"]) },
      ],
    },
    {
      title: "Women",
      layout: "columns",
      image: "/figma/media-portrait.jpg",
      imageTitle: "Women’s Apparel",
      columns: [
        FEATURED,
        { title: "Tops", links: L(["Polos", "T-Shirts", "Sweaters", "Hoodies & Pullovers"]) },
        { title: "Bottoms", links: L(["Shorts", "Skirts", "Pants", "Joggers"]) },
        { title: "Accessories", links: L(["Headwear", "Gloves", "Bags", "Socks"]) },
      ],
    },
    {
      title: "Footwear",
      layout: "products",
      columns: [
        { title: "Footwear", links: L(["Men’s Footwear", "Women’s Footwear"]) },
      ],
      products: [
        { title: "Pioneer Willow", image: "/figma/products/presidio-white-hover.png" },
        { title: "Pioneer Cypress", image: "/figma/products/presidio-black-hover.png" },
        { title: "Pioneer Magnolia", image: "/figma/products/presidio-blue-hover.png" },
        { title: "Presidio", image: "/figma/products/presidio-navy-hover.png" },
        { title: "Osprey", image: "/figma/products/presidio-red-hover.png" },
        { title: "Jupiter", image: "/figma/products/presidio-white-hover.png" },
      ],
    },
    {
      title: "Gear",
      layout: "columns",
      image: "/figma/campaign.jpg",
      imageTitle: "Gear",
      columns: [
        { title: "Featured", links: L(["New Arrivals", "Sun Day Red x Vessel", "Tiger’s Favorites"]) },
        { title: "Bags & Headcovers", links: L(["Golf Bags", "Headcovers", "Shoe Bags", "Totes"]) },
        { title: "Wearables", links: L(["Headwear", "Gloves", "Socks"]) },
        { title: "On Course", links: L(["Tees", "Ball Markers"]) },
      ],
    },
    {
      title: "Explore",
      layout: "cards",
      cards: [
        { title: "The Legacy", image: "/figma/legacy-video.jpg", url: "#" },
        { title: "Honors Journal", image: "/figma/campaign.jpg", url: "/journal" },
        { title: "Team Sunday Red", image: "/figma/media-portrait.jpg", url: "#" },
      ],
    },
  ],
  company: [
    { label: "The Legacy", url: "#" },
    { label: "Honors Journal", url: "/journal" },
    { label: "Team Sun Day Red", url: "#" },
    { label: "Careers", url: "#" },
  ],
};

const NAV_H = "3.75rem";

const NavButton = NavTextLink;

/* Content fade shared by the panel tiles when the active item swaps */
const contentFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.3, ease: [...MEDIA_EASE], delay: 0.08 },
} as const;

/* ---------- desktop dropdown: link columns + image card ---------- */

function ColumnsPanel({ item }: { item: MenuItem }) {
  return (
    <div className="flex w-full items-stretch gap-px border-b border-line bg-line">
      <div className="grid flex-1 grid-cols-2 gap-px lg:grid-cols-4">
        {(item.columns ?? []).map((column, i) => (
          <div key={i} className="bg-surface p-6 pb-16">
            <m.div
              key={`${item.title}-${column.title}`}
              {...contentFade}
              className="flex flex-col items-start gap-8"
            >
              <p className="label text-ink-2">{column.title.toUpperCase()}</p>
              <div className="flex flex-col items-start gap-6">
                {column.links.map((link) => (
                  <NavButton key={link.label} label={link.label.toUpperCase()} href={link.url} />
                ))}
              </div>
            </m.div>
          </div>
        ))}
      </div>
      {item.image && (
        <div className="relative hidden aspect-[5/6] w-1/3 shrink-0 overflow-hidden bg-surface lg:block">
          {/* image card, hover-identical to a 50/50 panel: image
              scales, the arrow swaps */}
          <m.div key={item.title} {...contentFade} className="absolute inset-0">
            <ArrowLink
              href="#"
              aria-label={item.imageTitle}
              className="group absolute inset-0 block overflow-hidden"
            >
              <div
                aria-hidden
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105"
                style={{ backgroundImage: `url(${item.image})` }}
              />
              <div className="media-overlay" />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-6">
                <p className="font-display text-title-md text-white">{item.imageTitle}</p>
                <span className="flex size-10 items-center justify-center rounded-xs bg-white text-[#161716]">
                  <ArrowSwap dx={1} dy={-1}>
                    <ArrowUpRight />
                  </ArrowSwap>
                </span>
              </div>
            </ArrowLink>
          </m.div>
        </div>
      )}
    </div>
  );
}

/* ---------- desktop dropdown: link column + product grid ---------- */

function ProductsPanel({ item }: { item: MenuItem }) {
  const column = item.columns?.[0];
  return (
    <m.div
      key={item.title}
      {...contentFade}
      className="flex w-full items-stretch gap-px border-b border-line bg-line"
    >
      {column && (
        <div className="w-1/4 shrink-0 bg-surface p-6 pb-16">
          <div className="flex flex-col items-start gap-8">
            <p className="label text-ink-2">{column.title.toUpperCase()}</p>
            <div className="flex flex-col items-start gap-6">
              {column.links.map((link) => (
                <NavButton key={link.label} label={link.label.toUpperCase()} href={link.url} />
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="grid flex-1 grid-cols-2 gap-px lg:grid-cols-3">
        {(item.products ?? []).map((product, i) => (
          <div key={i} className="flex flex-col bg-surface pb-10">
            <a href="#" className="group block w-full overflow-hidden">
              <div
                aria-hidden
                className="aspect-[16/10] w-full bg-cover bg-center transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105"
                style={product.image ? { backgroundImage: `url(${product.image})` } : undefined}
              />
            </a>
            <div className="label flex items-center justify-between gap-4 px-6 py-5 text-ink">
              <p>{product.title.toUpperCase()}</p>
              <span className="flex items-center gap-4">
                <a href="#" className="underline decoration-1 underline-offset-4">
                  MEN’S
                </a>
                <a href="#" className="underline decoration-1 underline-offset-4">
                  WOMEN’S
                </a>
              </span>
            </div>
          </div>
        ))}
      </div>
    </m.div>
  );
}

/* ---------- desktop dropdown: image cards ---------- */

function CardsPanel({ item }: { item: MenuItem }) {
  return (
    <m.div
      key={item.title}
      {...contentFade}
      className="grid w-full grid-cols-3 gap-px border-b border-line bg-line"
    >
      {(item.cards ?? []).map((card, i) => (
        <SmartLink key={i} href={card.url} className="group block bg-surface pb-16">
          <div className="w-full overflow-hidden">
            <div
              aria-hidden
              className="aspect-[8/7] w-full bg-cover bg-center transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105"
              style={card.image ? { backgroundImage: `url(${card.image})` } : undefined}
            />
          </div>
          <p className="px-6 pt-6 font-display text-title-md text-ink">{card.title}</p>
        </SmartLink>
      ))}
    </m.div>
  );
}

function MegaPanel({ item }: { item: MenuItem }) {
  if (item.layout === "cards") return <CardsPanel item={item} />;
  if (item.layout === "products") return <ProductsPanel item={item} />;
  return <ColumnsPanel item={item} />;
}

/* ---------- mobile accordion sheet ---------- */

/* nested column group inside a mobile section: the column title
   expands to its links (the links carry the collection routes) */
function MobileGroup({ column }: { column: MenuColumn }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="label flex items-center justify-between py-2 text-ink"
      >
        {column.title.toUpperCase()}
        <span className="text-ink-2">{open ? "[ - ]" : "[ + ]"}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [...MEDIA_EASE] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 py-2 pl-4">
              {column.links.map((link) => (
                <SmartLink key={link.label} href={link.url} className="label text-ink-2">
                  {link.label.toUpperCase()}
                </SmartLink>
              ))}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}

function MobileSection({ item }: { item: MenuItem }) {
  const [open, setOpen] = useState(false);

  /* cards → their titles as flat links; one column → its links flat;
     several columns → ALL (the item's collection page) plus every
     column as an expandable group of real links */
  const columns = item.columns ?? [];
  const groups = columns.length > 1 ? columns : [];
  const flat: NavLink[] =
    item.layout === "cards"
      ? (item.cards ?? []).map((card) => ({ label: card.title, url: card.url }))
      : columns.length === 1
        ? columns[0].links
        : [];
  const expandable = groups.length > 0 || flat.length > 0;

  return (
    <div className="border-t border-line">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-6 py-5"
      >
        <span className="font-display text-title-md text-ink">{item.title}</span>
        {expandable && <span className="label text-ink-2">{open ? "[ - ]" : "[ + ]"}</span>}
      </button>
      <AnimatePresence initial={false}>
        {open && expandable && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [...MEDIA_EASE] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col items-stretch gap-1 px-6 pb-6">
              {groups.length > 0 && item.allUrl && (
                <SmartLink href={item.allUrl} className="label py-2 text-ink">
                  ALL
                </SmartLink>
              )}
              {groups.map((column) => (
                <MobileGroup key={column.title} column={column} />
              ))}
              {flat.map((link) => (
                <SmartLink key={link.label} href={link.url} className="label py-2 text-ink">
                  {link.label.toUpperCase()}
                </SmartLink>
              ))}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- navigation ---------- */

export function Navigation({ data }: { data?: NavData | null }) {
  const nav = data ?? DEFAULT_NAV;
  const pathname = usePathname();
  const isHome = pathname === "/";
  /* journal surfaces keep the sticky top nav and swap the mobile
     control bar for one PDP-dock hamburger chip pinned bottom right */
  const minimized = pathname === "/journal" || pathname.startsWith("/journal/");
  /* the photoyoshi recreation carries its OWN header — the site's
     chrome (bar, chip, mobile pill) stays out of its way entirely */
  const lightField =
    pathname === "/journal/alt2" || pathname === "/journal/alt2/about";
  /* the dark field + articles; the landings are light */
  const minimizedDark = minimized && pathname !== "/journal" && !lightField;
  /* pages with a full-bleed hero the nav floats transparently over:
     the homepage (dark imagery), product pages (light gray canvas),
     and the dark journal surfaces (field + article heroes) */
  /* the Legacy page's hero resolves to dark imagery like the home hero */
  const isLegacy = pathname === "/legacy";
  const hasFullHero =
    isHome || isLegacy || pathname.startsWith("/products/") || minimizedDark || lightField;

  /* the page wrapper behind every route is light bg-surface — during
     a route fade between two dark journal pages it blinked through.
     Flag the root so CSS can hold the wrapper dark on those routes. */
  useEffect(() => {
    document.documentElement.toggleAttribute("data-journal-dark", minimizedDark);
    /* the field pages drop the legacy band + revealed footer */
    document.documentElement.toggleAttribute(
      "data-journal-no-footer",
      pathname === "/journal/alt" || pathname.startsWith("/journal/alt2"),
    );
    return () => {
      document.documentElement.removeAttribute("data-journal-dark");
      document.documentElement.removeAttribute("data-journal-no-footer");
    };
  }, [minimizedDark, pathname]);

  const [hidden, setHidden] = useState(false);
  const [overHero, setOverHero] = useState(hasFullHero);
  /* non-home pages: transparent (light mode) until scrolling starts */
  const [atTop, setAtTop] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  /* keeps the light presentation while the meganav exit-animates */
  const [panelVisible, setPanelVisible] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { count: bagCount, openCart } = useCart();

  /* On pages where the bar is hidden behind a purchase dock (PDP),
     opening the menu reveals it with a choreography: the bar unclips
     leftward from the hamburger chip while the links fade in right to
     left. Imperative motion values — mount animations are suppressed
     under the page transition's presence context. */
  const mobileBarRef = useRef<HTMLDivElement>(null);
  const barClip = useMotionValue(0);
  const barClipPath = useTransform(
    barClip,
    (v) => `inset(0 0 0 ${v}px round 0.125rem)`,
  );
  const searchOp = useMotionValue(1);
  const accountOp = useMotionValue(1);
  const bagOp = useMotionValue(1);
  const prevMobileOpen = useRef(false);
  useLayoutEffect(() => {
    const opened = mobileOpen && !prevMobileOpen.current;
    prevMobileOpen.current = mobileOpen;
    if (!opened || !(hasFullHero && !isHome)) return;
    const el = mobileBarRef.current;
    if (!el || el.offsetWidth === 0) return;
    barClip.jump(Math.max(0, el.offsetWidth - 48));
    animate(barClip, 0, { duration: 0.5, ease: [...EASE_DRAMATIC] });
    /* rightmost first (nearest the X), sweeping left */
    [bagOp, accountOp, searchOp].forEach((mv, i) => {
      mv.jump(0);
      animate(mv, 1, {
        duration: 0.35,
        delay: 0.18 + i * 0.09,
        ease: [...EASE_OUT],
      });
    });
  }, [mobileOpen, hasFullHero, isHome, barClip, searchOp, accountOp, bagOp]);
  /* color mode of the section under the mobile bottom bar */
  const [barMode, setBarMode] = useState<"light" | "dark">("light");
  const lastY = useRef(0);
  /* the transition resample loop runs on route CHANGES, not mount */
  const firstModeSample = useRef(true);
  const headerRef = useRef<HTMLElement>(null);
  /* the hide-on-scroll header animation only applies at md+ — on
     mobile the bar is absolute and scrolls away naturally */
  const [mdUp, setMdUp] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setMdUp(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const modeUnderBar = (): "light" | "dark" => {
      // the bar sits bottom-4 with h-12 → its center is 40px up
      const stack = document.elementsFromPoint(
        window.innerWidth / 2,
        window.innerHeight - 40,
      );
      for (const el of stack) {
        /* overlays (menu sheet, flyouts) sit over the page — sample
           through them so the bar reflects the content beneath and
           can't get stuck in the overlay's mode after it closes */
        if (
          el.closest("[data-navbar]") ||
          el.closest("header") ||
          el.closest("[data-nav-overlay]")
        )
          continue;
        const section = el.closest<HTMLElement>("[data-mode]");
        /* only true dark inverts the bar — the mid modes carry
           light-mode content treatment per the Figma variables */
        if (section) return section.dataset.mode === "dark" ? "dark" : "light";
      }
      return "light";
    };
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY.current;
      if (y < 80) setHidden(false);
      else if (delta > 2) {
        setHidden(true);
        setActive(null);
      } else if (delta < -2) setHidden(false);
      lastY.current = y;
      // the hero fills the viewport; past it the nav needs its surface
      setOverHero(hasFullHero && y < window.innerHeight - 60);
      setAtTop(y < 10);
      setBarMode(modeUnderBar());
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    /* SPA route changes swap the page beneath the bar without any
       scroll event (the reset lands at the same position, often 0) —
       the point-sample under the bar would keep the OLD page's mode.
       Resample every frame through the page transition (exit + enter
       + settle) so the bar tracks whatever fades in beneath it. */
    let raf = 0;
    /* only needed on ROUTE CHANGES — at initial mount there is no
       transition, and each sample forces a hit-test against the full
       page DOM (on the homepage that's expensive enough to register
       as startup long tasks; it was the largest attributable TBT
       source). A binary mode flip also doesn't need 60Hz: ~150ms
       cadence tracks the 1.3s transition fade closely enough. */
    if (!firstModeSample.current) {
      const started = performance.now();
      let lastSample = 0;
      const resample = (now: number) => {
        if (now - lastSample > 150) {
          lastSample = now;
          setBarMode(modeUnderBar());
        }
        if (performance.now() - started < 1300) raf = requestAnimationFrame(resample);
      };
      raf = requestAnimationFrame(resample);
    }
    firstModeSample.current = false;
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
    /* pathname included so overHero/atTop/barMode recompute on every
       route change, not only when hasFullHero flips — a same-kind
       navigation (e.g. PDP → home at rest) fires no scroll event */
  }, [hasFullHero, pathname]);

  /* the PDP purchase bar's menu chip opens the standard sheet */
  useEffect(() => {
    const onOpen = () => setMobileOpen(true);
    window.addEventListener("sdr:open-menu", onOpen);
    return () => window.removeEventListener("sdr:open-menu", onOpen);
  }, []);

  /* broadcast the sheet state so other chrome (the PDP dock's
     hamburger) can morph in sync */
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("sdr:menu-state", { detail: mobileOpen }),
    );
  }, [mobileOpen]);

  /* SPA navigation keeps this component mounted — close the meganav
     and the mobile sheet whenever the route changes, and drop the
     hover state (iOS taps fire mouseenter with no mouseleave, and on
     desktop the cursor is still parked on the link it clicked — both
     would hold the bar opaque over the new page's hero) */
  useEffect(() => {
    setActive(null);
    setMobileOpen(false);
    setHovered(false);
  }, [pathname]);

  // lock page scroll behind the mobile sheet
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  /* the transparent flip waits for the meganav's exit animation, so
     the bar fades white → transparent instead of snapping dark.
     Home: transparent (dark mode) over the hero. Elsewhere:
     transparent (light mode) until the page starts scrolling. */
  const overlayZone = hasFullHero ? overHero : atTop;
  const transparent = overlayZone && !hovered && active === null && !panelVisible;

  /* while transparent, each [data-nav-probe] element samples the
     backdrop luminance behind it and flips its own color mode — a
     dark carousel slide under one link turns that link white while
     its neighbors stay ink */
  useEffect(() => {
    if (!transparent || !headerRef.current) return;
    /* canvas point-sampling is startup-expensive — wait for idle so
       it never competes with hydration/LCP */
    let stop: (() => void) | undefined;
    let cancel: () => void;
    const start = () => {
      if (headerRef.current) stop = startNavBackdropProbes(headerRef.current);
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(start);
      cancel = () => window.cancelIdleCallback(handle);
    } else {
      const handle = window.setTimeout(start, 350);
      cancel = () => window.clearTimeout(handle);
    }
    return () => {
      cancel();
      stop?.();
    };
  }, [transparent, pathname]);
  const activeItem = active !== null ? nav.items[active] : null;
  const hasDropdown = (item: MenuItem) => item.layout !== "none";

  useEffect(() => {
    if (activeItem && hasDropdown(activeItem)) setPanelVisible(true);
  }, [activeItem]);

  return (
    <>
      {/* journal: the PDP dock's hamburger chip, pinned bottom right
          on every breakpoint, opening the full-screen sheet (the
          photoyoshi recreation brings its own header instead) */}
      {minimized && !lightField && (
        <div
          data-navbar
          data-mode={mobileOpen || !minimizedDark ? "light" : "dark"}
          className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] right-4 z-[70] md:right-6"
        >
          <button
            type="button"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
            className="flex size-[2.875rem] items-center justify-center rounded-xs bg-wash text-ink backdrop-blur-md"
          >
            <MenuX open={mobileOpen} className="text-ink" />
          </button>
        </div>
      )}
      {!lightField && (
      <m.header
        data-mode={transparent && (isHome || isLegacy || minimizedDark) ? "dark" : "light"}
        data-nav-root
        initial={false}
        /* mobile: the logo bar is absolute at the page top and simply
           scrolls away (no links to keep around) — the slide-away/
           return animation is desktop-only. The Legacy page does the
           same on every breakpoint: the bar seats absolutely at the
           top of the document, scrolls out with the hero, and is only
           seen again back at the top. */
        animate={{ y: hidden && !isLegacy && !mobileOpen && mdUp ? "-100%" : "0%" }}
        transition={{ duration: 0.45, ease: [...MEDIA_EASE] }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          setHovered(false);
          setActive(null);
        }}
        ref={headerRef}
        className={`${
          isLegacy ? "absolute" : "fixed"
        } top-[var(--announce-h,0px)] z-50 flex w-full flex-col text-ink max-md:absolute`}
      >
        {/* bar: transparent over the hero / at top, bg-primary once
            scrolled back in or engaged (hover / open dropdown). The
            hairline is the alpha border while transparent (white 15%
            over a dark hero) and border-primary once opaque */}
        <div
          className={`flex h-[3.75rem] items-center border-b max-md:border-b-0 px-6 py-3 transition-colors duration-300 ${
            transparent
              ? "border-line-2 bg-transparent"
              : "border-line bg-surface"
          }`}
        >
          <div className="hidden flex-1 items-center gap-8 md:flex">
            {nav.items.map((item, i) => (
              <span
                key={item.title}
                data-nav-probe
                className="text-ink"
                onMouseEnter={() => setActive(hasDropdown(item) ? i : null)}
                onFocus={() => setActive(hasDropdown(item) ? i : null)}
              >
                <NavButton label={item.title.toUpperCase()} active={active === i} />
              </span>
            ))}
          </div>
          <div className="flex-1 md:hidden" />
          <div className="flex flex-1 items-center justify-center">
            <Link href="/" aria-label="Home" data-nav-probe className="text-ink">
              <Logo className="max-md:translate-y-1 max-md:scale-125" />
            </Link>
          </div>
          <div className="hidden flex-1 items-center justify-end gap-8 md:flex">
            <button
              type="button"
              aria-label="Search"
              data-nav-probe
              onClick={() => window.dispatchEvent(new CustomEvent("sdr:search"))}
              className="text-ink"
            >
              <SearchMd />
            </button>
            <span data-nav-probe className="text-ink">
              <NavButton label="ACCOUNT" />
            </span>
            <button type="button" onClick={openCart} data-nav-probe className="text-ink">
              <NavButton label={`BAG [${bagCount}]`} />
            </button>
          </div>
          <div className="flex-1 md:hidden" />
        </div>

        {/* meganav: slides open under the bar, Moncler-style */}
        <AnimatePresence onExitComplete={() => setPanelVisible(false)}>
          {activeItem && hasDropdown(activeItem) && (
            <m.div
              key="meganav"
              initial={{ height: 0 }}
              animate={{ height: "auto" }}
              exit={{ height: 0 }}
              transition={{ duration: 0.55, ease: [...MEDIA_EASE] }}
              className="hidden max-h-[calc(100vh-3.75rem)] overflow-hidden md:block"
            >
              <MegaPanel item={activeItem} />
            </m.div>
          )}
        </AnimatePresence>
      </m.header>
      )}

      {/* 30% scrim over the page while the meganav is open — fades in
          place rather than sliding with the panel */}
      <AnimatePresence>
        {activeItem && hasDropdown(activeItem) && (
          <m.div
            key="meganav-scrim"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [...MEDIA_EASE] }}
            className="pointer-events-none fixed inset-0 z-40 hidden bg-black/30 md:block"
          />
        )}
      </AnimatePresence>

      {/* content offset on pages without a full-bleed hero */}
      {!hasFullHero && <div style={{ height: NAV_H }} />}

      {/* mobile sheet */}
      <AnimatePresence>
        {mobileOpen && (
          <m.div
            data-mode="light"
            data-nav-overlay
            /* rises from the bottom like every other mobile modal */
            initial={{ y: "100%" }}
            animate={{ y: "0%" }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.6, ease: [...MEDIA_EASE] }}
            className={`fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-surface text-ink ${
              minimized ? "" : "md:hidden"
            }`}
          >
            <div className="p-6">
              <Link href="/" aria-label="Home" onClick={() => setMobileOpen(false)}>
                <Logo className="max-md:origin-left max-md:scale-125" />
              </Link>
            </div>
            <div className="mt-4 flex flex-col">
              {nav.items
                .filter((item) => hasDropdown(item))
                .map((item) => (
                  <MobileSection key={item.title} item={item} />
                ))}
            </div>
            <div className="mt-auto flex flex-col gap-3 px-6 pb-32 pt-16">
              <p className="label text-ink-3">COMPANY</p>
              {nav.company.map((link) => (
                <SmartLink key={link.label} href={link.url} className="label text-ink">
                  {link.label.toUpperCase()}
                </SmartLink>
              ))}
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* mobile control bar: fixed to the bottom, always present.
          Blurred light surface normally; inverts over dark sections.
          Always light while the menu sheet is open. */}
      <div
        data-navbar
        data-mode={mobileOpen ? "light" : barMode}
        className={`fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] z-[70] md:hidden ${
          minimized || (hasFullHero && !isHome && !mobileOpen) ? "hidden" : ""
        }`}
      >
        {/* every item binds text-ink directly (icons included): each
            runs its own color transition off the same var flip, so
            text and glyphs invert in perfect lockstep — inherited
            animation doesn't reach SVG strokes reliably on iOS */}
        <m.div
          ref={mobileBarRef}
          style={{ clipPath: barClipPath }}
          className={`label flex h-12 items-center justify-between rounded-xs px-6 text-ink transition-colors duration-300 ${
            mobileOpen ? "bg-surface-2" : "bg-wash backdrop-blur-md"
          }`}
        >
          <m.button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("sdr:search"))}
            className="text-ink"
            style={{ opacity: searchOp }}
          >
            SEARCH
          </m.button>
          <m.a href="#" className="text-ink" style={{ opacity: accountOp }}>
            ACCOUNT
          </m.a>
          <m.button
            type="button"
            onClick={openCart}
            className="uppercase text-ink"
            style={{ opacity: bagOp }}
          >
            BAG [{bagCount}]
          </m.button>
          <button
            type="button"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
            className="flex size-8 items-center justify-center text-ink"
          >
            <MenuX open={mobileOpen} className="text-ink" />
          </button>
        </m.div>
      </div>
    </>
  );
}

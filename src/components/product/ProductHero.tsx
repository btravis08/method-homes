"use client";

import { AnimatePresence, m } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { MEDIA_EASE } from "@/components/home/AnimatedMedia";
import { sanitySrcSet } from "@/sanity/lib/image";
import { useCart } from "@/components/cart/CartContext";
import { ArrowLeft, ArrowRight } from "@/components/icons";
import { MenuX } from "@/components/MenuX";
import dynamic from "next/dynamic";

import type { SourceBox } from "@/components/product/ImageViewer";

/* the zoom viewer only exists after a tap — keep its chunk (and its
   share of Motion) out of the initial PDP bundle */
const ImageViewer = dynamic(
  () => import("@/components/product/ImageViewer").then((m) => m.ImageViewer),
  { ssr: false },
);
import { SwatchRail } from "@/components/product/SwatchRail";

/*
  PDP hero: required on every product page. Matches the comp:
  - full-viewport carousel on the shared gray canvas (surface-2); the
    images sit large and centered, scroll/drag to browse (arrow
    buttons come later), eased progress line at the very bottom
  - the purchase controls float OVER the images along the bottom, each
    in its own chip with padding around the container: name + price,
    COLOR: <name>, image-thumbnail swatches, black SELECT SIZE button
  - once the hero is completely out of view, the same module docks
    fixed to the bottom of the screen until the bottom shopping module
    ([data-shop-module]) scrolls into view
  - the nav floats transparently over this hero, like the homepage
*/

export interface HeroVariantData {
  name?: string;
  color?: string;
  image?: string;
}

export interface ProductHeroData {
  title?: string;
  price?: string;
  compareAtPrice?: string;
  images: string[];
  variants?: HeroVariantData[];
  sizes?: string[];
}

export function ProductHero({ product }: { product: ProductHeroData }) {
  const heroRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(0);
  /* dock: hero fully gone AND the bottom shopping module not yet
     reached — once the module (or anything below it) is on screen the
     dock stays away */
  const [heroGone, setHeroGone] = useState(false);
  const [shopReached, setShopReached] = useState(false);
  /* color mode of the section under the fixed dock — the quaternary
     chips/button flip with it (dark section → light controls) */
  const [barMode, setBarMode] = useState<"light" | "dark">("light");
  /* mobile: the fixed bar collapses to the menu chip while the
     description section's variant panel is on screen */
  const [panelInView, setPanelInView] = useState(false);
  /* mobile carousel arrows ride a sticky hold line 16px above the
     fixed purchase bar (its measured height + gap), then anchor 16px
     from the hero's bottom edge once scrolling carries it up — same
     handoff as the homepage hero CTA */
  const mobileDockRef = useRef<HTMLDivElement>(null);
  const [arrowHold, setArrowHold] = useState(140);
  useEffect(() => {
    const el = mobileDockRef.current;
    if (!el) return;
    const measure = () => setArrowHold(el.offsetHeight + 16);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const variants = product.variants ?? [];
  const active = variants[selected];
  const sizes = product.sizes ?? [];
  const { openQuickAdd } = useCart();
  /* the selected colorway leads the carousel; the product's remaining
     shots follow */
  const slides = [
    ...(active?.image ? [active.image] : []),
    ...product.images.filter((src) => src !== active?.image),
  ];
  /* infinite loop: clone the last slide before the first and the
     first after the last; the track starts one slide in, and any
     motion that settles on a clone teleports (instantly, invisibly)
     to its real twin — so left always slides the previous image in
     from the left.

     The clones (and the compensating scroll to "one slide in") are
     withheld until `loopReady` flips true in a layout effect. Without
     this, the leading clone sat at scrollLeft 0 in the raw SSR HTML —
     exactly what the browser paints before hydration ever runs — so
     the LAZY clone (not the eager, fetchPriority=high real first
     slide, which was scrolled offscreen) was winning the LCP race.
     Gating on loopReady means the first paint already shows the real
     first slide at position 0; the clones are spliced in — and the
     track re-scrolled to compensate — synchronously before the next
     paint, so there's no visible flash either. */
  const loop = slides.length > 1;
  const [loopReady, setLoopReady] = useState(false);
  const looping = loop && loopReady;
  const renderSlides = looping
    ? [slides[slides.length - 1], ...slides, slides[0]]
    : slides;

  const trackRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  const slideWidth = (el: HTMLDivElement) => {
    const slideEls = el.querySelectorAll<HTMLElement>("[data-slide]");
    return slideEls.length > 1
      ? slideEls[1].offsetLeft - slideEls[0].offsetLeft
      : el.clientWidth;
  };

  useLayoutEffect(() => {
    if (loop) setLoopReady(true);
  }, [loop]);

  const updateProgress = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    /* measure against the real slides — the edge clones don't count */
    const w = looping ? slideWidth(el) : 0;
    const realWidth = el.scrollWidth - 2 * w;
    setProgress(
      realWidth > 0
        ? Math.min(1, Math.max(0, (el.scrollLeft - w + el.clientWidth) / realWidth))
        : 1,
    );
  }, [looping]);

  useEffect(() => {
    updateProgress();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);
    return () => {
      el.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
    };
  }, [updateProgress]);

  /* looping track opens on the first REAL slide (one slide in) — a
     layout effect so the compensating scroll (now that the clones
     just landed) lands before the browser's next paint */
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el || !looping) return;
    el.scrollTo({ left: slideWidth(el), behavior: "instant" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, looping]);

  /* once motion settles on a clone, swap to its real twin */
  useEffect(() => {
    const el = trackRef.current;
    if (!el || !looping) return;
    let settle: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      clearTimeout(settle);
      settle = setTimeout(() => {
        const w = slideWidth(el);
        if (w <= 0) return;
        const span = slides.length * w;
        const max = el.scrollWidth - el.clientWidth;
        if (el.scrollLeft < w * 0.5) {
          el.scrollTo({ left: el.scrollLeft + span, behavior: "instant" });
        } else if (el.scrollLeft > max - w * 0.5) {
          el.scrollTo({ left: el.scrollLeft - span, behavior: "instant" });
        }
      }, 90);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(settle);
      el.removeEventListener("scroll", onScroll);
    };
  }, [selected, looping, slides.length]);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    if (heroRef.current) {
      const obs = new IntersectionObserver(
        ([entry]) => setHeroGone(!entry.isIntersecting),
        { threshold: 0 },
      );
      obs.observe(heroRef.current);
      observers.push(obs);
    }
    const shop = document.querySelector("[data-shop-module]");
    if (shop) {
      /* "reached" rather than "visible": below the module (footer),
         it leaves the viewport upward — the dock must not return */
      const obs = new IntersectionObserver(
        ([entry]) =>
          setShopReached(
            entry.isIntersecting ||
              entry.boundingClientRect.top < window.innerHeight,
          ),
        { threshold: 0 },
      );
      obs.observe(shop);
      observers.push(obs);
    }
    const panel = document.querySelector("[data-variant-panel]");
    if (panel) {
      const obs = new IntersectionObserver(
        ([entry]) => setPanelInView(entry.isIntersecting),
        { threshold: 0.2 },
      );
      obs.observe(panel);
      observers.push(obs);
    }
    return () => observers.forEach((obs) => obs.disconnect());
  }, []);

  /* sample the section under the dock on scroll — like the mobile nav
     bar, only true dark inverts (the mid modes keep light treatment) */
  useEffect(() => {
    const modeUnderDock = (): "light" | "dark" => {
      const stack = document.elementsFromPoint(
        window.innerWidth / 2,
        window.innerHeight - 52,
      );
      for (const el of stack) {
        if (
          el.closest("[data-purchase-dock]") ||
          el.closest("[data-navbar]") ||
          el.closest("[data-nav-overlay]")
        )
          continue;
        const section = el.closest<HTMLElement>("[data-mode]");
        if (section) return section.dataset.mode === "dark" ? "dark" : "light";
      }
      return "light";
    };
    const onScroll = () => setBarMode(modeUnderDock());
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  /* arrows step one slide; the edge clones + settle-teleport make
     the direction seamless at both ends */
  const step = (dir: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * slideWidth(el), behavior: "smooth" });
  };

  /* mouse drag for the track (touch swipes natively) */
  const drag = useRef({ active: false, startX: 0, startScroll: 0, moved: false });
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const el = trackRef.current;
    if (!el) return;
    drag.current = { active: true, startX: e.clientX, startScroll: el.scrollLeft, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    if (!el || !drag.current.active) return;
    const dx = e.clientX - drag.current.startX;
    if (!drag.current.moved) {
      if (Math.abs(dx) < 5) return;
      drag.current.moved = true;
      setDragging(true);
      el.setPointerCapture(e.pointerId);
    }
    el.scrollLeft = drag.current.startScroll - dx;
  };
  const suppressClick = useRef(false);
  const endDrag = () => {
    if (!drag.current.active) return;
    /* a drag release lands on a slide — swallow the click it spawns */
    suppressClick.current = drag.current.moved;
    drag.current.active = false;
    drag.current.moved = false;
    setDragging(false);
    if (suppressClick.current)
      setTimeout(() => (suppressClick.current = false), 0);
  };

  /* full-screen viewer, opened by tapping a slide (real image index —
     the loop clones map back to their originals). At open we capture
     the live rects of the mobile arrows and bottom bar so the
     viewer's controls fly in from them */
  const [viewer, setViewer] = useState<{
    index: number;
    from?: {
      left?: SourceBox;
      right?: SourceBox;
      bar?: SourceBox;
      image?: SourceBox;
    };
  } | null>(null);
  /* the nav's sheet state — the dock's hamburger morphs in sync */
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const onState = (e: Event) =>
      setMenuOpen(Boolean((e as CustomEvent).detail));
    window.addEventListener("sdr:menu-state", onState);
    return () => window.removeEventListener("sdr:menu-state", onState);
  }, []);

  /* the closing fade reveals the originals beneath the overlay */
  const [viewerFading, setViewerFading] = useState(false);
  const originalsHidden = viewer !== null && !viewerFading;
  const openViewer = (index: number, slideEl?: HTMLElement) => {
    setViewerFading(false);
    const box = (el?: Element | null): SourceBox | undefined => {
      if (!el) return undefined;
      const r = (el as HTMLElement).getBoundingClientRect();
      return r.width > 0
        ? { left: r.left, top: r.top, width: r.width, height: r.height }
        : undefined;
    };
    const hero = heroRef.current;
    setViewer({
      index,
      from: {
        left: box(hero?.querySelector('button[aria-label="Previous image"]')),
        right: box(hero?.querySelector('button[aria-label="Next image"]')),
        bar: box(mobileDockRef.current?.firstElementChild),
        image: box(slideEl?.querySelector('[role="img"]')),
      },
    });
  };

  /* each slide fades in only once its image has actually decoded —
     otherwise a refresh paints the frame first and the image pops in
     whenever the network delivers it */
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  /* keyed on the JOINED urls, not the array: `slides` is rebuilt every
     render, and an every-render effect re-fire kept interrupting the
     router's navigation transition under cacheComponents (Next 16) —
     Link clicks away from the PDP silently never committed */
  const slidesKey = slides.join("|");
  useEffect(() => {
    let alive = true;
    const mark = (src: string) =>
      setLoaded((l) => (l[src] ? l : { ...l, [src]: true }));
    slidesKey.split("|").forEach((src) => {
      if (!src) return;
      const img = new Image();
      img.onload = () => alive && mark(src);
      img.onerror = () => alive && mark(src);
      img.src = src;
      if (img.complete) mark(src);
    });
    return () => {
      alive = false;
    };
  }, [slidesKey]);

  /* the purchase module, shared by the in-hero overlay and the fixed
     dock. Per the comp (Product Details 33298:29150): a 16px-padded
     inner container inside a 16px-padded wrapper; name/price and the
     color dropdown split the flexible space, the button is a fixed
     350px column (flexible below xl). SELECT SIZE opens the quick-add
     flyout (size selection there). Mobile is name/price
     + button + a 40px menu button. Chips and swatch tiles are the
     library's Quaternary button (bg alpha-black-10, fg primary) with
     a 12px backdrop blur; bg-wash/text-ink alias those tokens and
     invert with the data-mode the dock samples from the section
     below it. The fixed container carries bg-primary at 8px padding
     with the comp's soft drop shadow on md+ (transparent on mobile
     and in the hero) */
  const chip = "bg-wash backdrop-blur-md";
  const controls = (docked: boolean) => (
    <div
      className={`flex w-full items-center gap-3 transition-colors duration-300 ${
        docked
          ? "p-0 md:bg-surface md:p-2 md:shadow-[0_20px_10px_rgba(16,24,40,0.02),0_8px_4px_rgba(16,24,40,0.02)]"
          : "p-0 md:p-4"
      }`}
    >
      <div
        className={`label flex h-[2.875rem] min-w-0 flex-1 items-center justify-between gap-6 rounded-xs px-3 font-medium text-ink md:h-10 ${chip}`}
      >
        <span className="truncate">{(product.title ?? "").toUpperCase()}</span>
        <span className="flex items-baseline gap-1.5">
          {product.compareAtPrice && (
            <s className="text-ink-3 line-through">{product.compareAtPrice}</s>
          )}
          {product.price}
        </span>
      </div>
      {/* color dropdown: the chip fills what the swatch tiles leave */}
      <div className="hidden min-w-0 flex-1 items-center gap-1.5 md:flex">
        <div
          className={`label flex h-[2.875rem] min-w-0 flex-1 items-center rounded-xs px-3 font-medium text-ink md:h-10 ${chip}`}
        >
          <span className="truncate">
            COLOR: {(active?.name ?? "").toUpperCase()}
          </span>
        </div>
        {variants.length > 1 && (
          <SwatchRail variants={variants} selected={selected} onSelect={setSelected} />
        )}
      </div>
      <button
        type="button"
        onClick={() =>
          openQuickAdd({
            title: product.title ?? "",
            price: product.price,
            image: slides[0],
            variants,
            sizes,
          })
        }
        className="label flex h-[2.875rem] min-w-[9.375rem] flex-1 items-center justify-center rounded-xs bg-btn px-3.5 font-medium text-btn-fg md:h-10 xl:w-[21.875rem] xl:flex-none"
      >
        SELECT SIZE
      </button>
    </div>
  );

  return (
    /* dvh (not svh): the hero's bottom tracks the live viewport
       through iOS toolbar transitions, so the arrows' 16px hold above
       the purchase bar stays exact in every toolbar state */
    <div ref={heroRef} className="relative h-dvh w-full bg-surface-2">
      {/* image carousel: slides share the canvas, no gaps */}
      {/* while the viewer is open its flown copies own the screen —
          the originals hide so the open fade doesn't double them, and
          reappear under the exit fade once the copies land back */}
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDragStart={(e) => e.preventDefault()}
        style={{ visibility: originalsHidden ? "hidden" : "visible" }}
        className={`no-scrollbar grid h-full w-full auto-cols-[100%] grid-flow-col overflow-x-auto sm:auto-cols-[45%] ${
          dragging ? "cursor-grabbing select-none" : "cursor-grab snap-x snap-mandatory"
        }`}
      >
        {renderSlides.map((src, i) => (
          <div
            key={`${selected}-${i}`}
            data-slide
            onClick={(e) => {
              if (suppressClick.current) return;
              openViewer(
                looping ? (i - 1 + slides.length) % slides.length : i,
                e.currentTarget,
              );
            }}
            className="relative h-full cursor-zoom-in snap-start"
          >
            <m.div
              className="absolute inset-0 overflow-hidden md:inset-x-[8%] md:inset-y-[22%]"
              initial={false}
              animate={{ scale: loaded[src] ? 1 : 1.04 }}
              transition={{ duration: 0.9, ease: [...MEDIA_EASE] }}
            >
              {/* a real <img> (not a CSS background) so the initial
                  slide can preload and count as the LCP the moment it
                  paints. Mobile: width-bound full bleed (height
                  follows the aspect, centered, cropped by the frame);
                  md+: the framed contain layout from the comp */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                srcSet={sanitySrcSet(src)}
                sizes="(min-width: 640px) 45vw, 100vw"
                alt={`${product.title} — image ${
                  (looping ? (i - 1 + slides.length) % slides.length : i) + 1
                }`}
                loading={i === (looping ? 1 : 0) ? "eager" : "lazy"}
                fetchPriority={i === (looping ? 1 : 0) ? "high" : undefined}
                decoding="async"
                draggable={false}
                className="absolute left-0 top-1/2 w-full -translate-y-1/2 md:static md:h-full md:translate-y-0 md:object-contain"
              />
            </m.div>
            {/* the image itself stays at full opacity from first paint
                (so it counts as the LCP immediately); this surface-
                colored overlay fading away creates the same fade-in
                illusion without delaying the metric */}
            <m.div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-surface"
              initial={false}
              animate={{ opacity: loaded[src] ? 0 : 1 }}
              transition={{ duration: 0.9, ease: [...MEDIA_EASE] }}
            />
          </div>
        ))}
      </div>

      {/* purchase controls floating over the images (16px wrapper
          padding per the comp; the inner container adds its own 16px).
          Mobile uses the always-fixed bar below instead */}
      <div className="absolute inset-x-0 bottom-0 hidden p-4 md:block">
        {controls(false)}
      </div>

      {/* mobile carousel arrows: left/right edges of the hero, held
          16px above the fixed purchase bar until the hero's bottom
          edge catches them (sticky handoff, like the homepage hero
          CTA), then they ride away with the hero */}
      <div className="pointer-events-none absolute inset-0 z-10 md:hidden">
        <div className="flex h-full flex-col justify-end px-4 pb-4">
          <div
            className="sticky flex w-full items-center justify-between"
            style={{
              bottom: arrowHold,
              visibility: originalsHidden ? "hidden" : "visible",
            }}
          >
            <button
              type="button"
              aria-label="Previous image"
              onClick={() => step(-1)}
              className="pointer-events-auto flex size-[2.875rem] items-center justify-center rounded-xs bg-wash text-ink backdrop-blur-md"
            >
              <ArrowLeft />
            </button>
            <button
              type="button"
              aria-label="Next image"
              onClick={() => step(1)}
              className="pointer-events-auto flex size-[2.875rem] items-center justify-center rounded-xs bg-wash text-ink backdrop-blur-md"
            >
              <ArrowRight />
            </button>
          </div>
        </div>
      </div>

      {/* eased scroll progress along the very bottom (hidden with the
          other originals while the viewer owns the screen — the black
          line reads loudly through the opening fade) */}
      <div
        className="absolute inset-x-0 bottom-0 z-10 h-0.5"
        style={{ visibility: originalsHidden ? "hidden" : "visible" }}
      >
        <m.div
          className="h-full bg-ink"
          initial={false}
          animate={{ width: `${Math.min(progress, 1) * 100}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>

      {/* fixed dock: the same module pinned to the screen bottom once
          the hero has fully scrolled away, gone again as soon as the
          bottom shopping module comes into view (sits above the mobile
          control bar on small screens) */}
      {/* full-screen image viewer */}
      <AnimatePresence>
        {viewer !== null && (
          <m.div
            key="image-viewer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease: [...MEDIA_EASE] }}
          >
            <ImageViewer
              images={slides}
              title={product.title}
              initialIndex={viewer.index}
              from={viewer.from}
              /* the viewer fades itself out imperatively; the exit
                 here is instant — originals are revealed for the fade */
              onFadeStart={() => setViewerFading(true)}
              onClose={() => {
                setViewer(null);
                setViewerFading(false);
              }}
            />
          </m.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {heroGone && !shopReached && (
          <m.div
            key="purchase-dock"
            data-purchase-dock
            /* desktop dock is ALWAYS dark treatment (black bar, white
               text) — the sampled mode read weak over light sections;
               the mobile bar below keeps sampling */
            data-mode="dark"
            initial={{ y: "120%" }}
            animate={{ y: "0%" }}
            exit={{ y: "120%" }}
            transition={{ duration: 0.45, ease: [...MEDIA_EASE] }}
            className="fixed inset-x-0 bottom-0 z-40 hidden p-4 text-ink transition-colors duration-300 md:block"
          >
            {controls(true)}
          </m.div>
        )}
      </AnimatePresence>

      {/* mobile: the purchase bar IS the bottom nav, fixed from load
          (bottom of the svh hero). While the description's variant
          panel is on screen it minimizes to just the menu chip on
          the right, returning once the panel passes — and minimizes
          for good once the bottom product slider is reached (and
          stays minimal over the footer) */}
      <div
        ref={mobileDockRef}
        data-purchase-dock
        data-mode={barMode}
        style={{ visibility: originalsHidden ? "hidden" : "visible" }}
        className="fixed inset-x-0 bottom-0 z-40 p-4 text-ink md:hidden"
      >
        <div className="flex w-full items-center justify-end gap-3">
          <AnimatePresence initial={false}>
            {!panelInView && !shopReached && (
              <m.div
                key="mobile-controls"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ duration: 0.4, ease: [...MEDIA_EASE] }}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <div
                  className={`label flex h-[2.875rem] min-w-0 flex-1 items-center justify-between gap-4 rounded-xs px-3 font-medium text-ink ${chip}`}
                >
                  <span className="truncate">
                    {(product.title ?? "").toUpperCase()}
                  </span>
                  <span>{product.price}</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    openQuickAdd({
                      title: product.title ?? "",
                      price: product.price,
                      image: slides[0],
                      variants,
                      sizes,
                    })
                  }
                  className="label flex h-[2.875rem] min-w-[9.375rem] flex-1 items-center justify-center rounded-xs bg-btn px-3.5 font-medium text-btn-fg"
                >
                  SELECT SIZE
                </button>
              </m.div>
            )}
          </AnimatePresence>
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => window.dispatchEvent(new CustomEvent("sdr:open-menu"))}
            className="flex size-[2.875rem] shrink-0 items-center justify-center rounded-xs bg-wash text-ink backdrop-blur-md"
          >
            <MenuX open={menuOpen} className="text-ink" />
          </button>
        </div>
      </div>
    </div>
  );
}

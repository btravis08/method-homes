"use client";

import { AnimatePresence, m } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { MEDIA_EASE } from "@/components/home/AnimatedMedia";
import { useTouch } from "@/lib/useTouch";

export interface ProductVariantData {
  name?: string;
  color?: string;
  image?: string;
  hoverImage?: string;
  /* formatted price override for this variant */
  price?: string;
  compareAtPrice?: string;
}

export interface ProductCardData {
  _key?: string;
  title?: string;
  /* product page URL (/products/<handle>) */
  href?: string;
  price?: string;
  /* formatted original price to strike through (sale) */
  compareAtPrice?: string;
  gender?: string;
  colorway?: string;
  colorCount?: string;
  image?: string;
  /* base64 blur preview of the card image (Sanity metadata.lqip) */
  imageLqip?: string;
  hoverImage?: string;
  variants?: ProductVariantData[];
  /* which variant this card shows by default (variant-per-card model) */
  defaultVariant?: number;
}

/* CSS twin of MEDIA_EASE (EASE_OUT) — keep in sync with lib/motion */
const EASE_CSS = "cubic-bezier(0.22,1,0.36,1)";

/*
  Product Card V1 with the standard image behaviors:
  - the padded product shot enters with the fade/settle animation
  - hovering the IMAGE WELL reveals its full-bleed hover image,
    settling from 1.05x to 1x
  - hovering the card anywhere OUTSIDE the well swaps "+N colors" for
    clickable swatches; picking one switches the visible product shot,
    the hover image, and the variant name — the two hover zones never
    overlap, so the swap is always visible

  Hydration is deliberately light: the homepage mounts ~a hundred of
  these at once under mobile CPU throttle, so hover choreography
  (swatch stagger, label swap) runs on CSS transitions, the swatch
  row and colorway-crossfade machinery mount only after the first
  pointer entry ("armed"), and the touch check is one shared
  subscription (useTouch). Motion is reserved for what it animates:
  the entrance settle and the armed crossfade.
*/
export function ProductCard({ product }: { product: ProductCardData }) {
  const variants = product.variants ?? [];
  const [selected, setSelected] = useState(product.defaultVariant ?? 0);
  const [cardHover, setCardHover] = useState(false);
  const [wellHover, setWellHover] = useState(false);
  /* first pointer entry arms the interactive layer (swatches,
     crossfade, hover image) — touch devices never arm it: the mobile
     comp (33691:63716) shows the "+N colors" text, not swatches, and
     touch users pick colorways on the PDP */
  const [armed, setArmed] = useState(false);
  const touch = useTouch();
  const showSwatches = !touch && cardHover && !wellHover;
  const active = variants[selected];

  /* Warm the browser cache for every colorway's images on first hover
     so a swatch click swaps instantly instead of flashing while the
     new image loads */
  const preloaded = useRef(false);
  useEffect(() => {
    if (!armed || preloaded.current) return;
    preloaded.current = true;
    for (const variant of variants) {
      for (const src of [variant.image, variant.hoverImage]) {
        if (src) new window.Image().src = src;
      }
    }
  }, [armed, variants]);
  const wellImage = active?.image ?? product.image ?? "/figma/card-shoe.jpg";
  const hoverImage = active?.hoverImage ?? product.hoverImage;
  const extra = variants.length > 0 ? variants.length - 1 : undefined;
  const colorLabel = active?.name ?? product.colorway;
  /* variant price override wins; sale shows the struck original */
  const priceLabel = active?.price ?? product.price;
  const compareAtLabel = active?.price ? active?.compareAtPrice : product.compareAtPrice;
  const extraLabel =
    extra !== undefined
      ? extra > 0
        ? `+${extra} colors`
        : undefined
      : product.colorCount;

  const internal = Boolean(product.href?.startsWith("/"));
  const CardShell = internal ? Link : "a";

  /* the product shot (+ LQIP underlay), shared by both swap modes */
  const shot = (
    <>
      {/* LQIP blur under the shot while it lazy-loads (only the
          default colorway has one — swatch swaps skip it) */}
      {product.imageLqip && wellImage === product.image && (
        <div
          aria-hidden
          className="absolute inset-0 bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${product.imageLqip})` }}
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={wellImage}
        alt={product.title}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="absolute inset-0 size-full object-contain"
      />
    </>
  );

  return (
    <CardShell
      href={product.href ?? "#"}
      {...(internal ? { prefetch: true, scroll: false } : {})}
      onMouseEnter={() => {
        setCardHover(true);
        if (!touch) setArmed(true);
      }}
      onMouseLeave={() => setCardHover(false)}
      className="flex w-full flex-col gap-[1.125rem] overflow-hidden bg-surface pb-16"
    >
      <m.div
        onMouseEnter={() => setWellHover(true)}
        onMouseLeave={() => setWellHover(false)}
        className="group/well relative flex aspect-[236/301] w-full flex-col justify-end overflow-hidden rounded-xs bg-surface-2 p-4 md:p-6"
        initial={{ opacity: 0, scale: 1.05 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.9, ease: [...MEDIA_EASE] }}
      >
        {/* padded product shot; after arming, the outgoing colorway
            stays visible while the new one fades in, so a swatch swap
            never goes blank. Until then (every card at hydration) it
            is a plain static layer — the crossfade machinery only
            exists on cards the pointer has actually visited. */}
        {armed ? (
          <AnimatePresence initial={false}>
            <m.div
              key={selected}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-x-[17.77%] top-1/2 aspect-square -translate-y-1/2"
            >
              {shot}
            </m.div>
          </AnimatePresence>
        ) : (
          <div className="absolute inset-x-[17.77%] top-1/2 aspect-square -translate-y-1/2">
            {shot}
          </div>
        )}
        {/* full-bleed hover image, settles 1.05x → 1x, shown only while
            the pointer is over the well itself; the keyed layers
            crossfade when a swatch picks another colorway. Touch
            devices never hover, so they never mount (or download) it;
            on desktop it mounts on the first pointer entry, which also
            warms every colorway via the preload effect above. */}
        {hoverImage && !touch && armed && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 scale-105 opacity-0 transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/well:scale-100 group-hover/well:opacity-100"
          >
            <AnimatePresence initial={false}>
              <m.div
                key={selected}
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={hoverImage}
                  alt=""
                  decoding="async"
                  draggable={false}
                  className="absolute inset-0 size-full object-cover"
                />
              </m.div>
            </AnimatePresence>
          </div>
        )}
      </m.div>
      {/* fixed-height text zone: it always reserves room for a
          two-line title, so a wrapping name grows inside it without
          changing the card height — the image grid never shifts */}
      <div className="flex h-[3.325rem] w-full flex-col gap-1.5 overflow-hidden px-4 md:px-6">
        <div className="label flex w-full items-start justify-between gap-3 font-medium text-ink">
          <p className="line-clamp-2 min-w-0">{product.title}</p>
          <p className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap">
            {compareAtLabel && (
              <s className="text-ink-3 line-through">{compareAtLabel}</s>
            )}
            <span>{priceLabel}</span>
          </p>
        </div>
        <div className="flex h-4 w-full items-center justify-between text-[0.75rem] font-medium uppercase leading-none text-ink-2">
          <p>{colorLabel}</p>
          <span className="relative flex items-center justify-end">
            {extraLabel && (
              <p
                /* swaps out for the swatches on hover (CSS twin of the
                   old Motion variants: hide 150ms, return 200ms after
                   a 150ms hold) */
                className="transition-opacity"
                style={
                  variants.length > 1
                    ? {
                        opacity: showSwatches ? 0 : 1,
                        transitionDuration: showSwatches ? "150ms" : "200ms",
                        transitionDelay: showSwatches ? "0ms" : "150ms",
                      }
                    : undefined
                }
              >
                {extraLabel}
              </p>
            )}
            {variants.length > 1 && armed && (
              <span
                className={`absolute right-0 flex items-center gap-1.5 ${
                  showSwatches ? "pointer-events-auto" : "pointer-events-none"
                }`}
              >
                {variants.map((variant, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={variant.name ?? `Variant ${i + 1}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelected(i);
                    }}
                    /* stagger-fade in from the right, right to left —
                       the old swatchVariants as a CSS transition */
                    className={`size-4 rounded-xs border transition-[opacity,transform] ${
                      i === selected ? "border-ink" : "border-line"
                    } ${showSwatches ? "translate-x-0 opacity-100" : "translate-x-2 opacity-0"}`}
                    style={{
                      backgroundColor: variant.color ?? "#c8c8c4",
                      transitionDuration: showSwatches ? "300ms" : "150ms",
                      transitionTimingFunction: EASE_CSS,
                      transitionDelay: showSwatches
                        ? `${(variants.length - 1 - i) * 60}ms`
                        : "0ms",
                    }}
                  />
                ))}
              </span>
            )}
          </span>
        </div>
      </div>
    </CardShell>
  );
}

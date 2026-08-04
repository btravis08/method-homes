"use client";

import { AnimatePresence, m } from "motion/react";
import { PortableText } from "next-sanity";
import type { PortableTextBlock } from "next-sanity";
import { useEffect, useState } from "react";

import { MEDIA_EASE } from "@/components/home/AnimatedMedia";
import { parsePrice, useCart } from "@/components/cart/CartContext";
import { Close, Plus } from "@/components/icons";

/*
  Links under the PDP description (comp 33298:29696): label-style
  buttons with a 10px plus, 24px apart. Each opens the specifications
  drawer — a right-side panel with the link's CMS content.
*/

export interface DetailLinkData {
  _key?: string;
  label?: string;
  body?: PortableTextBlock[];
  /* template fallback: plain paragraphs instead of rich text */
  text?: string[];
}

export function DetailLinks({ links }: { links: DetailLinkData[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const active = open !== null ? links[open] : null;

  /* lock page scroll behind the drawer */
  useEffect(() => {
    document.body.style.overflow = open !== null ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (links.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap items-start gap-6">
        {links.map((link, i) => (
          <button
            key={link._key ?? i}
            type="button"
            onClick={() => setOpen(i)}
            className="label flex items-center gap-1.5 font-medium text-ink transition-opacity hover:opacity-70"
          >
            {(link.label ?? "").toUpperCase()}
            <Plus size={10} />
          </button>
        ))}
      </div>

      {/* specifications drawer */}
      <AnimatePresence>
        {active && (
          <>
            <m.button
              key="drawer-scrim"
              type="button"
              aria-label="Close"
              onClick={() => setOpen(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: [...MEDIA_EASE] }}
              className="fixed inset-0 z-[80] cursor-default bg-black/30"
            />
            <m.aside
              key="drawer"
              data-mode="light"
              role="dialog"
              aria-label={active.label}
              initial={{ x: "100%" }}
              animate={{ x: "0%" }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.5, ease: [...MEDIA_EASE] }}
              className="fixed inset-y-0 right-0 z-[90] flex w-[30rem] max-w-full flex-col overflow-y-auto bg-surface text-ink"
            >
              <div className="flex items-center justify-between border-b border-line p-4 md:p-6">
                <p className="label font-medium">{(active.label ?? "").toUpperCase()}</p>
                <button
                  type="button"
                  aria-label="Close drawer"
                  onClick={() => setOpen(null)}
                  className="flex size-10 items-center justify-center rounded-xs bg-wash"
                >
                  <Close />
                </button>
              </div>
              <div className="flex flex-col gap-4 p-4 text-body-sm leading-relaxed text-ink-2 md:p-6">
                {active.body ? (
                  <PortableText value={active.body} />
                ) : (
                  (active.text ?? []).map((paragraph, i) => <p key={i}>{paragraph}</p>)
                )}
              </div>
            </m.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

/*
  The pairs-well-with add-to-cart plus (36px, white on the media
  well, 16px inset). The card itself links to the product; the plus
  intercepts the click, adds the product, and opens the bag.
*/
export function CardAddButton({
  title,
  price,
  image,
  color,
}: {
  title?: string;
  price?: string;
  image?: string;
  color?: string;
}) {
  const { addItem, openCart } = useCart();
  return (
    <button
      type="button"
      aria-label="Add to cart"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        addItem({ title: title ?? "", price: parsePrice(price), image, color });
        openCart();
      }}
      className="absolute bottom-4 right-4 flex size-9 items-center justify-center rounded-xs bg-white text-[#161716] transition-transform duration-300 hover:scale-105"
    >
      <Plus size={10} />
    </button>
  );
}

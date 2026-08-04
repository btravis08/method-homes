"use client";

import { AnimatePresence, m } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { MEDIA_EASE } from "@/components/home/AnimatedMedia";
import { ProductCard, type ProductCardData } from "@/components/home/ProductCard";
import { SearchMd } from "@/components/icons";

/*
  Search flyout (structure per the Figma search wireframes, 33880:
  91162 — right-side panel: input row, quick links, Products/
  Collections tabs, two-column product grid; rendered with the SDR
  system). Results come live from /api/search as you type, through
  the same card pipeline the sliders use, so hover imagery, swatches
  and discount pricing all carry over.
*/

interface Collection {
  _id: string;
  title: string;
  slug: string;
}

interface Results {
  query: string;
  cards: ProductCardData[];
  collections: Collection[];
}

const QUICK_LINKS = ["Polos", "Footwear", "Headwear", "T-Shirts"];

export default function SearchFlyout({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"products" | "collections">("products");
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* focus on open; lock the page scroll behind the panel */
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  /* debounced live search */
  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) {
      setResults(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as Results;
        setResults(data);
        setTab((current) =>
          current === "products" && data.cards.length === 0 && data.collections.length > 0
            ? "collections"
            : current,
        );
      } catch {
        /* aborted or offline — keep the previous results */
      } finally {
        setBusy(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [term]);

  const showing = results && results.query === term.trim() ? results : null;

  return (
    <AnimatePresence>
      {open && (
        <>
          <m.button
            type="button"
            aria-label="Close search"
            onClick={onClose}
            className="fixed inset-0 z-[80] cursor-default bg-[rgba(29,29,29,0.5)] backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [...MEDIA_EASE] }}
          />
          <m.div
            data-mode="light"
            className="fixed inset-y-0 right-0 z-[90] flex w-[44rem] max-w-full flex-col bg-surface text-ink"
            initial={{ x: "100%" }}
            animate={{ x: "0%" }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.6, ease: [...MEDIA_EASE] }}
          >
            {/* input row */}
            <div className="flex items-center gap-4 border-b border-line px-6 py-5">
              <SearchMd className="shrink-0 text-ink" />
              <input
                ref={inputRef}
                value={term}
                onChange={(e) => setTerm(e.currentTarget.value)}
                placeholder="Search Sun Day Red"
                aria-label="Search"
                className="min-w-0 flex-1 bg-transparent font-sans text-title-sm text-ink outline-none placeholder:text-ink-3"
              />
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="flex size-10 shrink-0 items-center justify-center rounded-xs bg-wash text-ink transition-opacity hover:opacity-80"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                  <path d="M1 1l10 10M11 1L1 11" />
                </svg>
              </button>
            </div>

            {/* quick links */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-6 py-4">
              <span className="label font-medium text-ink-3">POPULAR</span>
              {QUICK_LINKS.map((link) => (
                <button
                  key={link}
                  type="button"
                  onClick={() => setTerm(link)}
                  className="label font-medium text-ink transition-opacity hover:opacity-70"
                >
                  {link.toUpperCase()}
                </button>
              ))}
            </div>

            {/* tabs */}
            {showing && (showing.cards.length > 0 || showing.collections.length > 0) && (
              <div className="flex items-center gap-6 border-b border-line px-6 py-4">
                <button
                  type="button"
                  onClick={() => setTab("products")}
                  className={`label font-medium ${
                    tab === "products"
                      ? "text-ink underline decoration-ink underline-offset-4"
                      : "text-ink-3"
                  }`}
                >
                  PRODUCTS ({showing.cards.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTab("collections")}
                  className={`label font-medium ${
                    tab === "collections"
                      ? "text-ink underline decoration-ink underline-offset-4"
                      : "text-ink-3"
                  }`}
                >
                  COLLECTIONS ({showing.collections.length})
                </button>
              </div>
            )}

            {/* results */}
            <div className="no-scrollbar flex-1 overflow-y-auto">
              {term.trim().length < 2 ? (
                <p className="label px-6 py-10 text-ink-3">
                  START TYPING TO SEARCH THE CATALOG
                </p>
              ) : busy && !showing ? (
                <p className="label px-6 py-10 text-ink-3">SEARCHING…</p>
              ) : showing && showing.cards.length === 0 && showing.collections.length === 0 ? (
                <p className="label px-6 py-10 text-ink-3">
                  NO RESULTS FOR “{term.trim().toUpperCase()}”
                </p>
              ) : showing && tab === "products" ? (
                <div className="grid grid-cols-2 gap-px" onClick={onClose}>
                  {showing.cards.map((card, i) => (
                    <ProductCard key={card.href ?? i} product={card} />
                  ))}
                </div>
              ) : showing ? (
                <div className="flex flex-col">
                  {showing.collections.map((collection) => (
                    <Link
                      key={collection._id}
                      href={`/collections/${collection.slug}`}
                      onClick={onClose}
                      className="border-b border-line px-6 py-5 font-display text-title-sm text-ink transition-opacity hover:opacity-70"
                    >
                      {collection.title}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>

            {/* full results page */}
            {showing && showing.cards.length > 0 && (
              <div className="border-t border-line p-4">
                <Link
                  href={`/search?q=${encodeURIComponent(term.trim())}`}
                  onClick={onClose}
                  className="label flex h-12 items-center justify-center rounded-xs bg-btn font-medium text-btn-fg transition-opacity hover:opacity-80"
                >
                  VIEW ALL RESULTS
                </Link>
              </div>
            )}
          </m.div>
        </>
      )}
    </AnimatePresence>
  );
}

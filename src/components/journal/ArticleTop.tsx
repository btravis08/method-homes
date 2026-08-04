"use client";

import { m } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { NavTextLink } from "@/components/NavTextLink";
import {
  FLIP_COVERED_EVENT,
  HERO_READY_EVENT,
  takeFieldEntry,
} from "@/components/journal/field-transition";
import { EASE_OUT } from "@/lib/motion";

/*
  Article opening — ONE design for every entry path (a refresh must
  look identical to the click-through): fullscreen dark hero with the
  breadcrumb and title rising over its lower edge.

  Direct loads render it fully visible from the server. A live field
  transition (a tile clicked on /journal/alt) claims its pending
  entry before paint, hides the hero and copy, and replays the
  entrance: the grid's overlay expands the clicked tile to the
  viewport, then its fade-out doubles as a crossfade into this
  canonical hero, and the copy rises.
*/

function Slash() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden
      className="text-ink"
    >
      <path d="M2.9 9.2 7.1.8" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

export function ArticleTop({
  slug,
  title,
  categoryTitle,
  heroSrc,
  children,
}: {
  slug: string;
  title: string;
  categoryTitle: string;
  heroSrc: string;
  /* the article body — fades up after the hero lands on field entry,
     rendered fully visible on direct loads */
  children: React.ReactNode;
}) {
  /* visible immediately (SSR/direct loads); a live transition flips
     these off before the first client paint */
  const [covered, setCovered] = useState(true);
  const [ready, setReady] = useState(true);
  const [live, setLive] = useState(false);
  const heroRef = useRef<HTMLImageElement>(null);

  useLayoutEffect(() => {
    if (takeFieldEntry(slug)) {
      setLive(true);
      setCovered(false);
      setReady(false);
    }
  }, [slug]);

  useEffect(() => {
    if (!live) return;
    let titleTimer = 0;
    let offLoad: (() => void) | undefined;
    const onCovered = () => {
      setCovered(true);
      titleTimer = window.setTimeout(() => setReady(true), 250);
    };
    window.addEventListener(FLIP_COVERED_EVENT, onCovered);
    /* announce only once the hero has pixels — the overlay's fade is
       a crossfade from the clicked tile into this canonical cover */
    const announce = () =>
      window.dispatchEvent(new CustomEvent(HERO_READY_EVENT));
    const img = heroRef.current;
    if (img && !img.complete) {
      img.addEventListener("load", announce, { once: true });
      offLoad = () => img.removeEventListener("load", announce);
    } else {
      announce();
    }
    /* failsafe: never leave the page a black hole if the overlay died */
    const safety = window.setTimeout(onCovered, 2200);
    return () => {
      window.removeEventListener(FLIP_COVERED_EVENT, onCovered);
      offLoad?.();
      window.clearTimeout(safety);
      window.clearTimeout(titleTimer);
    };
  }, [live]);

  return (
    <>
    <div
      data-mode="dark"
      className="relative h-svh w-full overflow-hidden bg-[#0b0b0b]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={heroRef}
        src={heroSrc}
        alt={title}
        fetchPriority="high"
        data-field-hero
        /* swapped in beneath the opaque overlay — no transition */
        className={`size-full object-cover ${covered ? "" : "opacity-0"}`}
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 via-black/20 to-transparent px-6 pb-10 pt-28 md:px-10 md:pb-14">
        <m.nav
          aria-label="Breadcrumb"
          initial={false}
          animate={{ opacity: ready ? 1 : 0, y: ready ? 0 : 18 }}
          /* hide instantly when a live transition claims the page —
             only the reveal is eased */
          transition={{ duration: ready ? 0.55 : 0, ease: [...EASE_OUT] }}
          className="flex items-center gap-3"
        >
          <span className="flex items-center gap-1.5">
            <NavTextLink href="/journal" label="HONORS JOURNAL" />
            <Slash />
          </span>
          <NavTextLink href="/journal" label={categoryTitle.toUpperCase()} />
        </m.nav>
        <m.h1
          initial={false}
          animate={{ opacity: ready ? 1 : 0, y: ready ? 0 : 26 }}
          transition={
            ready
              ? { duration: 0.65, ease: [...EASE_OUT], delay: 0.09 }
              : { duration: 0 }
          }
          className="mt-3 font-display text-display-xl text-ink"
        >
          {title}
        </m.h1>
      </div>
    </div>
    {/* body: rises with the copy once the hero has landed (hides
        instantly when a live transition claims the page) */}
    <m.div
      initial={false}
      animate={{ opacity: ready ? 1 : 0, y: ready ? 0 : 24 }}
      transition={
        ready
          ? { duration: 0.6, ease: [...EASE_OUT], delay: 0.12 }
          : { duration: 0 }
      }
    >
      {children}
    </m.div>
    </>
  );
}

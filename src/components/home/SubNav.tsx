"use client";

import { useEffect, useState } from "react";
import { useLenis } from "lenis/react";

import { ArrowLink } from "@/components/home/ArrowHover";

/*
  Sub-nav (Figma 37525:15383): the strip that sticks under the Nav on
  long pages — context name left, in-page anchors center, a short
  primary button right. Per the Dev Mode annotation: anchors are real
  links (crawlable, keyboard-reachable), scrolling goes through Lenis
  (window.scrollTo is overridden the next frame), and the active anchor
  follows the scroll position. No-JS: the links still jump via the
  browser's own anchor handling.

  Sticky offset = the fixed Nav (3.75rem) + the announcement bar's
  measured height var, so the strip never hides under either.
*/

export interface SubNavAnchorData {
  _key?: string;
  label?: string;
  anchor?: string;
}

export interface SubNavProps {
  mode?: "light" | "light-mid" | "dark-mid" | "dark";
  contextName?: string;
  anchors?: SubNavAnchorData[];
  cta?: { label?: string; url?: string } | null;
}

const defaultAnchors: SubNavAnchorData[] = [
  { label: "Overview", anchor: "overview" },
  { label: "Plans", anchor: "plans" },
  { label: "Features", anchor: "features" },
  { label: "Gallery", anchor: "gallery" },
  { label: "FAQ", anchor: "faq" },
];

/* Nav 3.75rem + sub-nav 3.5rem (+ announcement bar): the line a
   section's top must pass to count as "current", and where a click
   lands it — the same --anchor-offset the sections' scroll-margin uses */
const ACTIVE_LINE = "var(--anchor-offset, 7.25rem)";

export function SubNav({ mode = "light", contextName = "Series name", anchors = defaultAnchors, cta = { label: "Get a range", url: "/get-started" } }: SubNavProps) {
  const lenis = useLenis();
  const items = anchors.filter((a) => a.label && a.anchor);
  const [active, setActive] = useState<string | null>(null);

  /* the active anchor is the last section whose top has passed the
     line under the strip; measured on scroll (passive) — IO with a
     rootMargin cannot express "last passed" cleanly with uneven
     section heights */
  useEffect(() => {
    if (!items.length) return;
    let frame = 0;
    const line = () => {
      const probe = document.createElement("div");
      probe.style.cssText = `position:fixed;top:${ACTIVE_LINE};height:0;visibility:hidden`;
      document.body.appendChild(probe);
      const y = probe.getBoundingClientRect().top;
      probe.remove();
      return y;
    };
    const update = () => {
      frame = 0;
      const y = line();
      let current: string | null = null;
      for (const a of items) {
        const el = document.getElementById(a.anchor!);
        if (el && el.getBoundingClientRect().top <= y + 1) current = a.anchor!;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [items.map((a) => a.anchor).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const el = document.getElementById(id);
    if (!el) return; // let the browser handle it (or 404 the hash)
    event.preventDefault();
    const probe = document.createElement("div");
    probe.style.cssText = `position:fixed;top:${ACTIVE_LINE};height:0;visibility:hidden`;
    document.body.appendChild(probe);
    const offset = -probe.getBoundingClientRect().top;
    probe.remove();
    if (lenis) lenis.scrollTo(el, { offset });
    else window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + offset, behavior: "smooth" });
    history.replaceState(null, "", `#${id}`);
  };

  return (
    <nav
      aria-label="On this page"
      data-mode={mode}
      className="sticky top-[calc(var(--announce-h,0px)+3.75rem)] z-40 w-full border-b border-line bg-surface text-ink"
    >
      <div className="mx-auto flex w-full max-w-page items-center gap-4xl px-4 py-md md:px-7xl">
        <p className="hidden shrink-0 text-body-md font-medium text-ink md:block">{contextName}</p>
        {/* the anchors scroll sideways on phones instead of wrapping */}
        <ul className="flex flex-1 items-center justify-start gap-4xl overflow-x-auto [scrollbar-width:none] md:justify-center [&::-webkit-scrollbar]:hidden">
          {items.map((a) => {
            const on = active === a.anchor;
            return (
              <li key={a._key ?? a.anchor} className="shrink-0">
                <a
                  href={`#${a.anchor}`}
                  onClick={(e) => go(e, a.anchor!)}
                  aria-current={on ? "location" : undefined}
                  className={`relative inline-block py-md text-body-sm transition-colors ${on ? "text-ink" : "text-ink-3 hover:text-ink"}`}
                >
                  {a.label}
                  <span aria-hidden className={`absolute inset-x-0 bottom-0 h-px bg-ink transition-opacity duration-300 ${on ? "opacity-100" : "opacity-0"}`} />
                </a>
              </li>
            );
          })}
        </ul>
        {cta?.label && (
          <ArrowLink href={cta.url || "/get-started"} className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-btn px-[1.125rem] text-body-sm font-medium text-btn-fg transition-opacity hover:opacity-80">
            {cta.label}
          </ArrowLink>
        )}
      </div>
    </nav>
  );
}

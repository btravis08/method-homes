"use client";

import { m } from "motion/react";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";

import { useFooterTagline } from "@/components/FooterTagline";
import { Logo } from "@/components/Logo";
import { NavTextLink } from "@/components/NavTextLink";
import { NewsletterForm } from "@/components/NewsletterForm";
import { ArrowUp, CurrencyDollar, Plus } from "@/components/icons";
import { EASE_OUT } from "@/lib/motion";

interface FooterLink {
  label: string;
  href?: string;
}

const columns: { heading: string; links: FooterLink[] }[] = [
  {
    heading: "Support",
    links: [
      { label: "Help & FAQs" },
      { label: "Returns & Exchanges" },
      { label: "Warranty" },
      { label: "Contact Us" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "The Legacy" },
      { label: "Honors Journal", href: "/journal" },
      { label: "TEAM SUN DAY RED" },
      { label: "Careers" },
    ],
  },
  {
    heading: "More",
    links: [{ label: "Gift Cards" }, { label: "ID.me" }],
  },
];

const BLURB =
  "Pursue better always. Maecenas suspendisse ultrices pellentesque et ornare dui nisl. Eget convallis lorem faucibus tortor in.";

const social = ["FB", "TT", "IG", "X", "TW"];

const legalLinks = [
  "Privacy Policy",
  "Website Terms & Conditions of Use",
  "Terms & Conditions of Purchase",
  "Gift Card Terms & Conditions",
  "Supplier Responsibility",
  "Accessibility Statement",
];

/* the big spelled-out wordmark band: SUN / DAY / RED word vectors
   (public/figma/sdr-word-*.svg) rendered through CSS masks so they
   take the section ink color. Sizes are the Figma exports' own
   boxes (desktop 52.5px tall; mobile is the same art at 0.576x). */
function WordMark({ file, className }: { file: string; className: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block bg-current ${className}`}
      style={{
        maskImage: `url(/figma/${file})`,
        maskSize: "100% 100%",
        maskRepeat: "no-repeat",
        WebkitMaskImage: `url(/figma/${file})`,
        WebkitMaskSize: "100% 100%",
        WebkitMaskRepeat: "no-repeat",
      }}
    />
  );
}

/* mobile link groups collapse into accordions; the + rotates into an
   x while the panel's height eases open */
function FooterAccordion({ heading, links }: { heading: string; links: FooterLink[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-[0.6875rem] text-left"
      >
        <span className="text-[0.875rem] leading-5 text-ink">{heading.toUpperCase()}</span>
        <Plus
          size={20}
          className={`text-ink transition-transform duration-300 ${
            open ? "rotate-45" : ""
          }`}
        />
      </button>
      <m.div
        initial={false}
        animate={{ height: open ? "auto" : 0 }}
        transition={{ duration: 0.4, ease: [...EASE_OUT] }}
        className="overflow-hidden"
      >
        <div className="flex flex-col items-start gap-3 pb-6">
          {links.map((link) => (
            <NavTextLink key={link.label} label={link.label.toUpperCase()} href={link.href} />
          ))}
        </div>
      </m.div>
    </div>
  );
}

/*
  Fixed-reveal footer. The page scrolls inside a raised (z-10) wrapper
  whose bottom margin is --footer-h; the footer sits fixed at the
  viewport bottom underneath it, so scrolling past the legacy band
  "reveals" it. The reveal gap is a margin, not an element — margins
  aren't hit targets, so the footer stays clickable once uncovered.
*/

/* Last scrolling element of the page — the reveal's curtain edge.
   Rendered inside the page wrapper, above the fixed footer. */
export function LegacyBand() {
  /* The Legacy page ends on the product swirl — no photo band there. */
  const pathname = usePathname();
  if (pathname === "/legacy") return null;
  return (
    <div data-mode="dark" data-legacy-band className="relative h-[26.75rem] w-full overflow-hidden bg-black">
      {/* a real lazy <img>: as a CSS background this downloaded on
          every page load despite being the last thing on the page */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/figma/legacy-video.jpg"
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        draggable={false}
        className="absolute inset-0 size-full bg-surface-2 object-cover"
      />
      <div className="absolute inset-0 bg-black/20" />
    </div>
  );
}

export function SiteFooter() {
  const ref = useRef<HTMLElement>(null);
  /* "Pursue Better Always" art — per-page CMS toggle, off by default */
  const showTagline = useFooterTagline();
  /* painted only when the scroll position is within reveal range —
     SSR renders it invisible, so it can never flash on load, during
     streaming, or mid route-transition while document height shifts */
  const [inRange, setInRange] = useState(false);

  /* publish the footer's height as --footer-h; the page wrapper uses
     it as margin-bottom so exactly one footer-height gets revealed */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const publish = () =>
      document.documentElement.style.setProperty("--footer-h", `${el.offsetHeight}px`);
    publish();
    const check = () => {
      const remaining =
        document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
      /* flip 100px before the reveal zone could possibly show */
      setInRange(remaining < el.offsetHeight + 100);
    };
    check();
    const observer = new ResizeObserver(() => {
      publish();
      check();
    });
    observer.observe(el);
    observer.observe(document.body);
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      document.documentElement.style.removeProperty("--footer-h");
    };
  }, []);

  return (
    <footer
      ref={ref}
      data-mode="light"
      className={`fixed inset-x-0 bottom-0 bg-surface text-ink pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-0 ${
        inRange ? "" : "invisible"
      }`}
    >
      {/* Pursue Better Always wordmark art */}
      {showTagline && (
        <div className="flex w-full items-center justify-center overflow-hidden border-b border-line px-2.5 py-32 md:py-[11.25rem]">
          <div className="relative h-[9.4375rem] w-[28.9375rem] shrink-0 scale-[0.7] sm:scale-100">
            <p className="absolute left-[8.75rem] top-0 whitespace-nowrap font-display text-display-xl">
              Pursue
            </p>
            <p className="absolute left-0 top-[3.40625rem] whitespace-nowrap font-display text-display-xl">
              Better
            </p>
            <p className="absolute left-[17.9375rem] top-[3.59375rem] whitespace-nowrap font-display text-display-xl">
              Always
            </p>
            <span
              aria-hidden
              className="absolute left-[12rem] top-[5.71875rem] inline-block h-[1.29375rem] w-[3.91875rem] bg-current"
              style={{
                maskImage: "url(/figma/union-swoosh.svg)",
                maskSize: "100% 100%",
                maskRepeat: "no-repeat",
                WebkitMaskImage: "url(/figma/union-swoosh.svg)",
                WebkitMaskSize: "100% 100%",
                WebkitMaskRepeat: "no-repeat",
              }}
            />
            <p className="label absolute left-0 top-[8.46875rem] font-medium">SUN</p>
            <p className="label absolute left-[9.5rem] top-[8.46875rem] font-medium">DAY</p>
            <p className="label absolute left-[17.8125rem] top-[8.46875rem] font-medium">RED</p>
            <p className="label absolute right-0 top-[8.46875rem] font-medium">2026</p>
          </div>
        </div>
      )}

      {/* mobile: blurb over accordion link groups (per the mobile
          footer comp); sm+ keeps the column grid below */}
      <div className="sm:hidden">
        <div className="pb-4 pl-4 pr-11 pt-6">
          <p className="label font-medium">{BLURB}</p>
        </div>
        <div className="flex flex-col px-4 pb-8 pt-4">
          {columns.map((col) => (
            <FooterAccordion key={col.heading} heading={col.heading} links={col.links} />
          ))}
        </div>
      </div>

      {/* link columns */}
      <div className="hidden w-full grid-cols-1 border-t border-line sm:grid sm:grid-cols-2 md:grid-cols-4">
        {columns.map((col) => (
          <div
            key={col.heading}
            className="flex flex-col gap-[1.125rem] border-b border-l border-line px-4 pb-16 pt-4 md:px-6 md:pt-6"
          >
            <p className="label font-medium opacity-70">{col.heading}</p>
            <div className="flex flex-col items-start gap-[0.5625rem]">
              {col.links.map((link) => (
                <NavTextLink key={link.label} label={link.label.toUpperCase()} href={link.href} />
              ))}
            </div>
          </div>
        ))}
        <div className="flex flex-col border-b border-l border-line px-4 pb-16 pt-4 md:px-6 md:pt-6">
          <p className="label font-medium">{BLURB}</p>
        </div>
      </div>

      {/* SUN DAY RED spelled-out band (word vectors from the comp) */}
      <div
        aria-label="Sun Day Red"
        role="img"
        className="flex w-full items-center justify-between p-4 sm:px-6 sm:py-8"
      >
        <WordMark
          file="sdr-word-sun.svg"
          className="h-[1.89rem] w-[5.1854rem] sm:h-[3.28125rem] sm:w-[9.0024rem]"
        />
        <WordMark
          file="sdr-word-day.svg"
          className="h-[1.8001rem] w-[4.9378rem] sm:h-[3.1252rem] sm:w-[8.5725rem]"
        />
        <WordMark
          file="sdr-word-red.svg"
          className="h-[1.8008rem] w-[5.0716rem] sm:h-[3.1263rem] sm:w-[8.8049rem]"
        />
      </div>

      {/* newsletter */}
      <NewsletterForm />

      {/* logo + socials row */}
      <div className="flex w-full items-center gap-16 p-4 sm:gap-8 sm:px-6 sm:py-8">
        <div className="flex items-center sm:flex-1">
          <Logo />
        </div>
        <div className="flex flex-1 items-center justify-between pr-6 sm:pr-0">
          {social.map((s) => (
            <NavTextLink key={s} label={s} />
          ))}
          <a
            href="#top"
            className="label group relative hidden items-center gap-1.5 font-medium text-ink sm:flex"
          >
            BACK TO TOP
            <ArrowUp size={10} />
            <span className="absolute inset-x-0 -bottom-0.5 h-px origin-right scale-x-0 bg-ink transition-transform duration-300 group-hover:origin-left group-hover:scale-x-100" />
          </a>
        </div>
      </div>

      {/* legal row */}
      <div className="flex w-full flex-col items-start gap-6 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:p-6">
        <p className="label font-medium text-ink-2">
          ©2026 SUN DAY RED&nbsp;&nbsp;&nbsp;—&nbsp;{" "}
          {legalLinks.map((label, i) => (
            <span key={label}>
              {i > 0 && <span className="whitespace-pre">{"  |  "}</span>}
              <a href="#" className="transition-colors hover:text-ink">
                {label}
              </a>
            </span>
          ))}
        </p>
        <button
          type="button"
          className="label flex shrink-0 items-center gap-1.5 font-medium text-ink"
        >
          <span className="underline decoration-1 underline-offset-4">US / USD</span>
          <CurrencyDollar size={10} />
        </button>
      </div>
    </footer>
  );
}

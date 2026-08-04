"use client";

import { m, useMotionValue, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { preload } from "react-dom";

import { ArrowLink, ArrowSwap } from "@/components/home/ArrowHover";
import { ArrowUpRight } from "@/components/icons";
import { SmartLink } from "@/components/SmartLink";
import { JOURNAL_CATEGORIES } from "@/components/journal/articles";
import { EASE_DRAMATIC, EASE_OUT } from "@/lib/motion";

/*
  Honors Journal landing (Figma "Blog Landing Page V2", node
  33996:98494). A stack of category titles between hairlines behaving
  as an always-one-open accordion: Ambassadors starts open, hovering
  another section hands the open state over (the closing and opening
  panels animate together so the stack's height never jumps), and the
  last activated section simply stays open.

  Each open section is an endless stream of top-aligned editorial
  imagery drifting left → right. Hovering an image eases the drift to
  a standstill; the wheel (or a touch drag) scrubs the stream by hand,
  and once the input goes quiet the drift resumes its original speed
  gracefully. Cards link to their articles.
*/

interface StreamImage {
  src: string;
  ratio: string;
  href: string;
}

/* each category streams its articles' imagery (1:1, 4:5, 3:4 cards);
   clicking a card opens that article. The rail renders at 160/229px,
   so it uses the 480w .thumb.jpg variants — the full-size files are
   for covers, pairs, and the legacy fallbacks */
const SECTIONS = JOURNAL_CATEGORIES.map((category) => ({
  slug: category.slug,
  title: category.title,
  label: category.label,
  images: category.articles.flatMap((article): StreamImage[] =>
    article.stream.map((image) => ({
      ...image,
      src: image.src.replace(/\.jpg$/, ".thumb.jpg"),
      href: `/journal/${article.slug}`,
    })),
  ),
}));

/* stream drift in px/s (left → right) */
const BASE_SPEED = 70;
/* seconds for the drift to ease toward its target speed — the "slow
   easing" stop on image hover and the graceful resume after scrubbing */
const SPEED_TAU = 0.7;
/* quiet time after wheel scrubbing before the drift resumes */
const RESUME_DELAY_MS = 600;
/* fastest flick momentum carried out of a touch swipe (px/s) */
const MAX_FLICK = 3500;

function Stream({
  images,
  open,
  cruise,
  priority = false,
}: {
  images: StreamImage[];
  open: boolean;
  /* signed loop speed in px/s — desktop drifts left → right, mobile
     right → left at half pace */
  cruise: number;
  /* first (above-fold) rail: its leading images load eagerly and the
     very first carries fetchPriority=high — it IS the mobile LCP, and
     a lazy LCP is the exact anti-pattern the perf rules ban */
  priority?: boolean;
}) {
  const copyRef = useRef<HTMLDivElement>(null);
  const copyW = useRef(0);
  const x = useMotionValue(0);
  const speed = useRef(0);
  const target = useRef(0);
  /* timestamp of the last manual scrub — drift stays parked until
     the input has been quiet for RESUME_DELAY_MS */
  const lastScrub = useRef(0);
  const imageHovered = useRef(false);
  const reduced = useReducedMotion();

  /* width of one copy (its own padding-right carries the seam gap) */
  useEffect(() => {
    const el = copyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      copyW.current = el.offsetWidth;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* keep x in [-W, 0) — two copies back to back, seam never shows
     whichever way the stream travels */
  const wrap = (value: number) => {
    const w = copyW.current;
    if (w <= 0) return value;
    let nx = value;
    while (nx >= 0) nx -= w;
    while (nx < -w) nx += w;
    return nx;
  };

  /* six streams can be open at once on mobile — only the one(s) on
     screen spend frames */
  const [inView, setInView] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: "100px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!open || !inView || reduced) return;
    target.current = cruise;
    speed.current = 0;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      /* while a finger owns the stream, the loop just idles — x is
         driven directly by pointermove */
      if (dragging.current) {
        raf = requestAnimationFrame(tick);
        return;
      }
      /* over a hovered image (or briefly after a wheel scrub) the
         drift aims for 0; otherwise it aims for cruise — which is
         also what carries flick momentum back down: a released swipe
         seeds speed with the finger's velocity and this same ease
         decays it gradually to the constant loop speed */
      const parked =
        imageHovered.current || now - lastScrub.current < RESUME_DELAY_MS;
      target.current = parked ? 0 : cruise;
      speed.current +=
        (target.current - speed.current) * (1 - Math.exp(-dt / SPEED_TAU));
      /* the ease is asymptotic — settle to a true standstill */
      if (target.current === 0 && Math.abs(speed.current) < 1.5)
        speed.current = 0;
      x.set(wrap(x.get() + speed.current * dt));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, inView, reduced, cruise, x]);

  /* manual horizontal scrub: trackpad/shift-wheel moves the stream
     directly (parked, then resuming after quiet); a touch swipe rides
     the finger 1:1 and releases with native-feeling momentum. */
  const dragging = useRef(false);
  const dragX = useRef(0);
  const dragged = useRef(0);
  /* smoothed finger velocity (px/s) — the momentum seed on release */
  const flickVel = useRef(0);
  const lastMoveTs = useRef(0);
  useEffect(() => {
    const el = railRef.current;
    if (!el || !open) return;
    const onWheel = (e: WheelEvent) => {
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0;
      if (dx === 0) return;
      e.preventDefault();
      lastScrub.current = performance.now();
      speed.current = 0;
      x.set(wrap(x.get() - dx));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open, x]);

  const card = (image: StreamImage, i: number, copy: number) => (
    <m.div
      key={copy * images.length + i}
      initial={false}
      animate={open ? { opacity: 1, y: 0 } : { opacity: 0, y: 28 }}
      transition={{
        duration: 0.55,
        ease: [...EASE_OUT],
        /* staggered fade-up sweeping left → right on open */
        delay: open ? 0.2 + i * 0.07 : 0,
      }}
      /* mobile panels are always expanded — keep cards painted from
         the first (server) frame instead of waiting on hydration */
      className="max-md:transform-none! max-md:opacity-100!"
    >
      <SmartLink
        href={image.href}
        className="block"
        draggable={false}
        onMouseEnter={() => {
          imageHovered.current = true;
        }}
        onMouseLeave={() => {
          imageHovered.current = false;
        }}
        onClick={(e) => {
          /* a drag that travelled isn't a click — but thumbs wobble,
             so taps get generous slop */
          if (dragged.current > 16) e.preventDefault();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.src}
          alt=""
          loading={priority && copy === 0 && i < 4 ? "eager" : "lazy"}
          fetchPriority={priority && copy === 0 && i === 0 ? "high" : undefined}
          decoding="async"
          draggable={false}
          className="w-[10rem] bg-surface-2 object-cover md:w-[14.3125rem]"
          style={{ aspectRatio: image.ratio }}
        />
      </SmartLink>
    </m.div>
  );

  return (
    <div
      ref={railRef}
      className="w-full touch-pan-y overflow-hidden"
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") return;
        dragging.current = true;
        dragX.current = e.clientX;
        dragged.current = 0;
        flickVel.current = 0;
        lastMoveTs.current = e.timeStamp;
        speed.current = 0;
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        const dx = e.clientX - dragX.current;
        dragX.current = e.clientX;
        dragged.current += Math.abs(dx);
        /* smoothed instantaneous velocity, so the release carries the
           flick rather than the last jittery sample */
        const dt = (e.timeStamp - lastMoveTs.current) / 1000;
        lastMoveTs.current = e.timeStamp;
        if (dt > 0)
          flickVel.current = flickVel.current * 0.7 + (dx / dt) * 0.3;
        x.set(wrap(x.get() + dx));
      }}
      onPointerUp={(e) => {
        if (!dragging.current) return;
        dragging.current = false;
        /* a fast swipe leaves fast, then the loop's ease gradually
           brings it back to cruise speed — a stale flick sample dies
           if the finger paused before lifting */
        const stale = e.timeStamp - lastMoveTs.current > 120;
        speed.current = stale
          ? 0
          : Math.max(-MAX_FLICK, Math.min(MAX_FLICK, flickVel.current));
      }}
      onPointerCancel={() => {
        dragging.current = false;
        speed.current = 0;
      }}
    >
      {/* top-aligned rows — mixed ratios hang from a common top edge */}
      <m.div style={{ x }} className="flex w-max items-start">
        {[0, 1].map((copy) => (
          <div
            key={copy}
            ref={copy === 0 ? copyRef : undefined}
            className="flex items-start gap-8 pr-8 md:gap-[4.5rem] md:pr-[4.5rem]"
          >
            {images.map((image, i) => card(image, i, copy))}
          </div>
        ))}
      </m.div>
    </div>
  );
}

function JournalSection({
  title,
  label,
  images,
  open,
  alwaysOpen,
  onActivate,
  priority,
}: {
  title: string;
  label: string;
  images: StreamImage[];
  open: boolean;
  /* touch layout: every section stays expanded */
  alwaysOpen: boolean;
  onActivate: () => void;
  priority: boolean;
}) {
  const expanded = open || alwaysOpen;
  return (
    <section
      onMouseEnter={onActivate}
      onFocus={onActivate}
      className="w-full border-t border-line"
    >
      {/* desktop: eyebrow | centered display title | view-all, the
          whole row part of the hover hit area. Mobile: a 20px
          left-set title with the view-all link bottom-aligned right */}
      <div className="flex w-full items-end justify-between gap-4 px-6 py-8 md:grid md:grid-cols-[1fr_auto_1fr] md:items-center md:py-12">
        <m.p
          initial={false}
          animate={{ opacity: open ? 1 : 0 }}
          transition={{ duration: 0.35, ease: [...EASE_OUT] }}
          className="label text-ink max-md:hidden"
        >
          {label}
        </m.p>
        <h2 className="font-display text-headline-lg text-ink max-md:text-[1.25rem] max-md:leading-[1.2] md:text-center">
          {title}
        </h2>
        <m.span
          initial={false}
          animate={{ opacity: open ? 1 : 0 }}
          transition={{ duration: 0.35, ease: [...EASE_OUT] }}
          className={`flex items-center justify-end max-md:hidden ${
            open ? "" : "pointer-events-none"
          }`}
        >
          <ArrowLink
            href="#"
            className="label group relative flex items-center gap-1.5 text-ink"
          >
            <span className="relative">
              VIEW ALL ARTICLES
              <span className="absolute inset-x-0 -bottom-0.5 h-px origin-right scale-x-0 bg-ink transition-transform duration-300 group-hover:origin-left group-hover:scale-x-100" />
            </span>
            <ArrowSwap dx={1} dy={-1}>
              <ArrowUpRight />
            </ArrowSwap>
          </ArrowLink>
        </m.span>
        <SmartLink
          href="#"
          className="label flex shrink-0 items-center gap-1.5 text-ink underline decoration-1 underline-offset-4 md:hidden"
        >
          VIEW ALL
          <ArrowUpRight size={10} />
        </SmartLink>
      </div>

      {/* open/close share one duration + ease, so the section handing
          its height to the next keeps the stack's total constant;
          mobile forces every panel open in CSS so the always-expanded
          layout is right from the very first (server) paint */}
      <m.div
        initial={false}
        animate={{ height: open ? "auto" : 0 }}
        transition={{ duration: 0.65, ease: [...EASE_DRAMATIC] }}
        className="overflow-hidden max-md:h-auto!"
      >
        <div className="pb-8 md:py-[11.25rem]">
          <Stream
            images={images}
            open={expanded}
            cruise={alwaysOpen ? -BASE_SPEED / 2 : BASE_SPEED}
            priority={priority}
          />
        </div>
      </m.div>
    </section>
  );
}

export function JournalLanding({
  extraStreams = {},
}: {
  /* CMS blog posts merged into their category's stream, newest
     first (keyed by category slug; built by the journal route) */
  extraStreams?: Record<string, StreamImage[]>;
}) {
  /* always-one-open accordion: Ambassadors by default, and the last
     activated section stays open — nothing ever closes to zero */
  const [active, setActive] = useState(0);

  /* touch devices don't hover — there every section simply stays
     expanded (the panels are also forced open in CSS so the layout is
     right before hydration) */
  const [hoverCapable, setHoverCapable] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setHoverCapable(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  /* the first rail's first thumb is the mobile LCP — hand it to the
     preload scanner (SSR emits the <link>, so discovery beats
     hydration) */
  const sections = SECTIONS.map((section) => ({
    ...section,
    images: [...(extraStreams[section.slug] ?? []), ...section.images],
  }));

  preload(sections[0].images[0].src, { as: "image", fetchPriority: "high" });

  return (
    <div data-mode="light" className="bg-surface text-ink">
      {/* masthead: HJ script monogram + mission line */}
      {/* 140px here + the 60px nav offset = the design's 200px */}
      <header className="flex flex-col items-center justify-end gap-12 px-6 pb-8 pt-[8.75rem]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/figma/journal/hj-monogram.svg"
          alt="Honors Journal"
          width={171}
          height={104}
          fetchPriority="high"
          className="h-[5.25rem] w-auto md:h-[6.5rem]"
        />
        <p className="label max-w-[22.875rem] text-center">
          The Honors Journal is a tempor faucibus est amet et. Ipsum faucibus
          adipiscing ultricies et commodo morbi adipiscing tristique. Lectus
          amet eget neque pellentesque.
        </p>
      </header>

      <div className="flex flex-col pb-32 pt-[4.5rem]">
        {sections.map((section, i) => (
          <JournalSection
            key={section.title}
            open={active === i}
            alwaysOpen={!hoverCapable}
            onActivate={() => setActive(i)}
            priority={i === 0}
            {...section}
          />
        ))}
      </div>
    </div>
  );
}

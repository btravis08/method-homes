"use client";

import { m, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { sanitySrcSet } from "@/sanity/lib/image";

/*
  Standard image treatment: when the image enters the viewport it fades
  in while settling from 1.05x to 1x. When the image sits inside a
  clickable `group` parent and hoverScale is set, hovering the parent
  scales it back up to 1.05x with the same easing.

  Parallax variant (hero, 50/50): the image settles from 1.2x to 1.15x
  instead — the residual 15% oversize leaves ~7.5% bleed above and
  below the frame, which the image spends by translating slower than
  the page (±6.5% of its height, scrubbed to scroll position).

  Touch devices skip the JS scrub: it's driven by scroll events,
  which iOS delivers too sparsely during momentum scrolling — the
  image visibly stair-steps. There the same ±6.5% drift runs as a CSS
  scroll-driven animation instead (.sdr-parallax in globals.css,
  compositor-driven via animation-timeline: view()), falling back to
  the static entrance where unsupported.
*/
import { EASE_OUT } from "@/lib/motion";

/* re-exported house ease — kept for the existing import graph */
export const MEDIA_EASE = EASE_OUT;

export function AnimatedMedia({
  image,
  position = "center",
  hoverScale = false,
  parallax = false,
  entranceDuration = 0.9,
  priority = false,
  sizes = "100vw",
  lqip,
}: {
  image: string;
  position?: string;
  hoverScale?: boolean;
  parallax?: boolean;
  /* seconds for the fade/settle entrance (the hero runs it slower) */
  entranceDuration?: number;
  /* the LCP instance (home hero): eager high-priority fetch */
  priority?: boolean;
  sizes?: string;
  /* base64 blur preview painted under the image while it loads */
  lqip?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: none), (pointer: coarse)");
    const update = () => setTouch(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const scrub = parallax && !touch;
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], ["-6.5%", "6.5%"]);

  /* a real <img>: native lazy-loading below the fold, responsive
     srcset on Sanity URLs, and it paints at full opacity from the
     first frame (LCP-honest) — the fade-in illusion comes from the
     surface-colored overlay below fading away */
  const inner = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image}
      srcSet={sanitySrcSet(image)}
      sizes={sizes}
      alt=""
      aria-hidden
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      draggable={false}
      className={`absolute inset-0 size-full object-cover ${
        hoverScale
          ? "transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105"
          : ""
      }`}
      style={{ objectPosition: position }}
    />
  );

  /* state-driven (not whileInView props): mount animations get
     suppressed under the SPA transition's presence context, which
     froze reveal overlays at opaque — a state flip + animate prop
     runs regardless.
     Inside a horizontal rail the slide itself is clipped by the
     scroller (intersection is zero no matter the rootMargin), so the
     reveal observes the nearest [data-reveal-scope] — the rail — and
     fires on VERTICAL arrival: upcoming cards arrive already
     revealed. */
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = el.closest("[data-reveal-scope]") ?? el;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(target);
    return () => io.disconnect();
  }, []);

  return (
    /* imagery counts as dark-mode content for the fixed bars'
       point-sampling, wherever this renders */
    <div ref={ref} data-mode="dark" className="absolute inset-0 overflow-hidden">
      <m.div
        className={`absolute inset-0 ${parallax && touch ? "sdr-parallax" : ""}`}
        style={scrub ? { y } : undefined}
        initial={false}
        animate={{ scale: inView ? (scrub ? 1.15 : 1) : scrub ? 1.2 : 1.05 }}
        transition={{ duration: entranceDuration, ease: [...MEDIA_EASE] }}
      >
        {/* LQIP underlay: the blurred preview shows the instant the
            reveal overlay clears, until the real image paints over it */}
        {lqip && (
          <div
            aria-hidden
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${lqip})`, backgroundPosition: position }}
          />
        )}
        {inner}
      </m.div>
      {/* fade-out overlay in place of fading the image itself. Capped
          at 0.9s regardless of the entrance: the scale settle can run
          long, but visual completeness (Speed Index) shouldn't wait
          on a slow reveal */}
      <m.div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-surface-2"
        initial={false}
        animate={{ opacity: inView ? 0 : 1 }}
        transition={{ duration: Math.min(entranceDuration, 0.9), ease: [...MEDIA_EASE] }}
      />
    </div>
  );
}

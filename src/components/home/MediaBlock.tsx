"use client";

import { AnimatePresence, m } from "motion/react";
import type { Variants } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { MEDIA_EASE } from "@/components/home/AnimatedMedia";
import { Bag, ChevronRight, Close, Pause, Play } from "@/components/icons";

/*
  Interactive media-block behaviors shared by Full Width and 50/50
  columns. The base image (or video) fills its aspect container; these
  components layer the behavior on top:

  - ShopTheLook: a bag button in the bottom-right; hovering it fades in
    the tagged products as mini cards stacked above the button
  - VideoPlayerBlock: a centered play button over the poster image that
    opens the video in a full-screen player
  - AutoplayVideo: plays muted while in view, with a pause/play pill in
    the bottom-right
*/

/* ---------- Shop the look ---------- */

export interface LookProductData {
  _key?: string;
  title?: string;
  price?: string;
  colorway?: string;
  colorCount?: string;
  thumb?: string;
}

const lookCardVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: (order: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [...MEDIA_EASE], delay: order * 0.06 },
  }),
  exit: { opacity: 0, y: 8, transition: { duration: 0.15 } },
};

export function ShopTheLook({ products }: { products: LookProductData[] }) {
  const [open, setOpen] = useState(false);
  if (products.length === 0) return null;
  return (
    <div
      className="absolute bottom-0 right-0 flex flex-col items-end gap-2 p-4 md:p-6"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <AnimatePresence>
        {open && (
          <div className="flex w-80 flex-col gap-1.5">
            {products.map((product, i) => (
              <m.a
                key={product._key ?? i}
                href="#"
                custom={i}
                variants={lookCardVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="flex w-full items-center gap-3 rounded-xs bg-white p-2 pr-3 text-[#161716]"
              >
                <span
                  aria-hidden
                  className="size-12 shrink-0 rounded-xs bg-[#eceded] bg-cover bg-center"
                  style={
                    product.thumb
                      ? { backgroundImage: `url(${product.thumb})` }
                      : undefined
                  }
                />
                {/* same type scale as the slider's MENS/WOMENS toggle */}
                <span className="label flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-medium">{product.title}</span>
                    <span className="shrink-0 font-medium">{product.price}</span>
                  </span>
                  <span className="flex items-baseline justify-between gap-3 text-[#818380]">
                    <span className="truncate">{product.colorway}</span>
                    {product.colorCount && (
                      <span className="shrink-0">{product.colorCount}</span>
                    )}
                  </span>
                </span>
                <ChevronRight size={14} className="shrink-0 text-[#161716]" />
              </m.a>
            ))}
          </div>
        )}
      </AnimatePresence>
      <button
        type="button"
        aria-label="Shop the look"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex size-10 items-center justify-center rounded-xs bg-white text-[#161716]"
      >
        <Bag />
      </button>
    </div>
  );
}

/* ---------- Video: click to play ---------- */

export function VideoPlayerBlock({ src }: { src: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="absolute inset-0 flex items-center justify-center">
        <button
          type="button"
          aria-label="Play video"
          onClick={() => setOpen(true)}
          className="flex size-10 items-center justify-center rounded-xs bg-white text-[#161716] transition-transform duration-300 hover:scale-110"
        >
          <Play />
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 md:p-6"
            onClick={() => setOpen(false)}
          >
            <button
              type="button"
              aria-label="Close video"
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-xs bg-white text-[#161716] md:right-6 md:top-6"
            >
              <Close />
            </button>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              src={src}
              controls
              autoPlay
              playsInline
              onClick={(e) => e.stopPropagation()}
              className="max-h-full max-w-full rounded-xs"
            />
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ---------- Video: autoplay in view ---------- */

export function AutoplayVideo({
  src,
  poster,
}: {
  src: string;
  poster?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (inView && !paused) el.play().catch(() => {});
    else el.pause();
  }, [inView, paused]);

  return (
    <>
      <m.div
        className="absolute inset-0"
        initial={{ opacity: 0, scale: 1.05 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.9, ease: [...MEDIA_EASE] }}
      >
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          muted
          loop
          playsInline
          preload="metadata"
          className="absolute inset-0 size-full object-cover"
        />
      </m.div>
      <div className="absolute inset-0 flex items-end justify-end p-4 md:p-6">
        <button
          type="button"
          aria-label={paused ? "Play" : "Pause"}
          onClick={(e) => {
            // the hero wraps its media in a link — the toggle must not navigate
            e.preventDefault();
            e.stopPropagation();
            setPaused((v) => !v);
          }}
          className="pointer-events-auto flex size-7 items-center justify-center rounded-full bg-white text-[#161716]"
        >
          {paused ? <Play /> : <Pause />}
        </button>
      </div>
    </>
  );
}

"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

/*
  Client gate for the 3D plan viewer: the three.js chunk is fetched
  only after the section is near the viewport AND the browser is idle,
  and never during SSR. Until then (and for no-WebGL browsers) the
  poster — the plan page's own photograph or drawing — stays put, so
  the viewer is a progressive layer over the static twin, never the
  LCP and never a cost to visitors who don't scroll to it.
*/

const PlanViewer = dynamic(() => import("./PlanViewer").then((m) => m.PlanViewer), { ssr: false });

export function LazyPlanViewer({ src, poster, alt, northDeg, className = "" }: { src: string; poster?: string; alt?: string; northDeg?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  /* the 3D view mounts UNDER the poster and only replaces it once it has
     fully settled (house, planting, sky) — no photo → grey → 3D flash */
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || ready) return;
    /* no WebGL → keep the poster (old devices, locked-down browsers) */
    try {
      const c = document.createElement("canvas");
      if (!c.getContext("webgl2") && !c.getContext("webgl")) return;
    } catch {
      return;
    }
    let cancelled = false;
    const arm = () => {
      const go = () => { if (!cancelled) setReady(true); };
      if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(go, { timeout: 2000 });
      else window.setTimeout(go, 300);
    };
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        arm();
      }
    }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [ready]);

  return (
    <div ref={ref} className={`relative w-full ${className}`}>
      {ready && <PlanViewer src={src} northDeg={northDeg} onReady={() => setShown(true)} showLoading={false} />}
      <div
        aria-hidden={shown}
        className={`${ready ? "pointer-events-none absolute inset-0" : "relative"} aspect-[4/3] w-full overflow-hidden rounded-md bg-surface-2 transition-opacity duration-700 ease-out md:aspect-[16/9]`}
        style={{ opacity: shown ? 0 : 1 }}
      >
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt={alt ?? ""} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
        ) : (
          <span className="label absolute inset-0 flex items-center justify-center text-ink-3">{alt ?? "3D model"}</span>
        )}
        <p className="label absolute bottom-xl left-xl rounded-(--radius-full) bg-surface px-2xl py-md text-ink-3">Loading 3D view…</p>
      </div>
    </div>
  );
}

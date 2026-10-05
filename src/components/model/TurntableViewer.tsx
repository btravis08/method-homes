"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
  Turntable viewer — the photoreal layer of the plan viewer.

  Plays pre-rendered frames from render-turntable.py / encode-frames
  (Blender Cycles: sky, sun, glass, lawn): drag or use the arrow keys
  to turn the home through the orbit frames; "Floor plan" plays the
  flight-and-cut sequence forward and holds on the drawing, "3D" plays
  it back. Frames load progressively: the tiny poster paints at once,
  the first orbit frame replaces it, the rest of the orbit arrives in
  the background in an order that keeps the nearest frames ready
  (every 4th, then every 2nd, then the rest), and the plan frames
  load on the first request. AVIF with a WebP fallback. Reduced motion
  jumps between states instead of playing the sequence.

  The static twin (photo, drawing, dimensions, PDF) stays on the page.
*/

export interface TurntableManifest {
  orbit: string[];
  plan: string[];
  width: number;
  height: number;
  sizes?: Record<string, { avif: number; webp: number }>;
}

export interface TurntableViewerProps {
  /* folder that holds the manifest and frames, e.g. /models/sample/turntable */
  base: string;
  manifest: TurntableManifest;
  alt?: string;
  className?: string;
}

type Mode = "3d" | "plan";

/* AVIF support is a DECODE question: Chrome decodes AVIF but refuses to
   encode it, so canvas.toDataURL("image/avif") says "no" everywhere. Probe
   by decoding a 2 × 2 AVIF instead (async; memoised per page). */
const AVIF_PROBE =
  "data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=";
let avifMemo: Promise<boolean> | null = null;
function supportsAvif(): Promise<boolean> {
  if (!avifMemo) {
    avifMemo = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.width === 2);
      img.onerror = () => resolve(false);
      img.src = AVIF_PROBE;
    });
  }
  return avifMemo;
}

/* load order that keeps the nearest frames ready first */
function spread(n: number) {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const step of [8, 4, 2, 1]) for (let i = 0; i < n; i += step) if (!seen.has(i)) { seen.add(i); out.push(i); }
  return out;
}

export function TurntableViewer({ base, manifest, alt = "3D view of the home", className = "" }: TurntableViewerProps) {
  const [ext, setExt] = useState<"avif" | "webp" | null>(null);
  useEffect(() => {
    let live = true;
    supportsAvif().then((ok) => live && setExt(ok ? "avif" : "webp"));
    return () => {
      live = false;
    };
  }, []);
  const url = useCallback((id: string) => `${base}/${id}.${ext ?? "webp"}`, [base, ext]);
  const [mode, setMode] = useState<Mode>("3d");
  const [orbitIndex, setOrbitIndex] = useState(0);
  const [planIndex, setPlanIndex] = useState(-1); // -1 = not in the plan sequence
  const [loaded, setLoaded] = useState<Set<string>>(() => new Set());
  const [reduce, setReduce] = useState(false);
  const cache = useRef(new Map<string, HTMLImageElement>());
  const drag = useRef<{ x: number; index: number } | null>(null);
  const raf = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduce(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  /* progressive preload of the orbit */
  const load = useCallback(
    (id: string) =>
      new Promise<void>((resolve) => {
        if (cache.current.has(id)) return resolve();
        const img = new Image();
        img.decoding = "async";
        img.onload = () => {
          cache.current.set(id, img);
          setLoaded((s) => new Set(s).add(id));
          resolve();
        };
        img.onerror = () => resolve();
        img.src = url(id);
      }),
    [url],
  );

  useEffect(() => {
    if (!ext) return; // wait for the format probe so every frame is one format
    let cancelled = false;
    (async () => {
      await load(manifest.orbit[0]);
      for (const i of spread(manifest.orbit.length)) {
        if (cancelled) return;
        await load(manifest.orbit[i]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [manifest.orbit, load, ext]);

  /* the plan sequence: play forward on "Floor plan", back on "3D" */
  const play = useCallback(
    async (dir: 1 | -1) => {
      cancelAnimationFrame(raf.current);
      const ids = manifest.plan;
      if (!ids.length) return;
      if (reduce) {
        await load(ids[ids.length - 1]);
        setPlanIndex(dir === 1 ? ids.length - 1 : -1);
        return;
      }
      /* make sure the first few frames are in before starting */
      await Promise.all(ids.slice(0, 4).map(load));
      ids.slice(4).forEach((id) => void load(id));
      let i = dir === 1 ? 0 : ids.length - 1;
      let last = performance.now();
      const step = (now: number) => {
        if (now - last >= 1000 / 24) {
          last = now;
          setPlanIndex(i);
          i += dir;
        }
        if (i >= 0 && i < ids.length) raf.current = requestAnimationFrame(step);
        else if (dir === -1) setPlanIndex(-1);
      };
      raf.current = requestAnimationFrame(step);
    },
    [manifest.plan, load, reduce],
  );

  const change = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    void play(m === "plan" ? 1 : -1);
  };

  /* drag / keys turn the home (3D only) */
  const n = manifest.orbit.length;
  const onPointerDown = (e: React.PointerEvent) => {
    if (mode !== "3d") return;
    drag.current = { x: e.clientX, index: orbitIndex };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const width = (e.currentTarget as HTMLElement).clientWidth || 1;
    const delta = Math.round(((e.clientX - drag.current.x) / width) * n * 1.2);
    setOrbitIndex((((drag.current.index - delta) % n) + n) % n);
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (mode !== "3d") return;
    if (e.key === "ArrowLeft") setOrbitIndex((i) => (i - 1 + n) % n);
    if (e.key === "ArrowRight") setOrbitIndex((i) => (i + 1) % n);
  };

  /* which frame to show: a plan frame while in/after the sequence, else
     the nearest LOADED orbit frame so dragging never flashes empty */
  const frameId = (() => {
    if (planIndex >= 0) return manifest.plan[planIndex];
    if (loaded.has(manifest.orbit[orbitIndex])) return manifest.orbit[orbitIndex];
    for (let d = 1; d < n; d++) {
      const a = manifest.orbit[(orbitIndex - d + n) % n];
      const b = manifest.orbit[(orbitIndex + d) % n];
      if (loaded.has(a)) return a;
      if (loaded.has(b)) return b;
    }
    return null;
  })();
  const ready = loaded.has(manifest.orbit[0]);
  const pct = Math.round((loaded.size / Math.max(1, manifest.orbit.length)) * 100);

  return (
    <div className={`relative w-full overflow-hidden rounded-md bg-surface-2 ${className}`} data-mode-3d={mode}>
      <div
        role="img"
        aria-label={alt}
        tabIndex={0}
        onKeyDown={onKey}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`relative w-full select-none touch-pan-y outline-none focus-visible:ring-1 focus-visible:ring-ink ${mode === "3d" ? "cursor-grab active:cursor-grabbing" : ""}`}
        style={{ aspectRatio: `${manifest.width} / ${manifest.height}` }}
      >
        {/* poster: tiny and blurred, paints at once — the browser picks the format */}
        <picture>
          <source srcSet={`${base}/poster.avif`} type="image/avif" />
          <img src={`${base}/poster.webp`} alt="" aria-hidden className={`absolute inset-0 size-full object-contain transition-opacity duration-500 ${ready ? "opacity-0" : "opacity-100"}`} />
        </picture>
        {frameId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img key="frame" src={url(frameId)} alt="" aria-hidden draggable={false} className="absolute inset-0 size-full object-contain" />
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-lg p-xl">
        <div role="group" aria-label="View" className="pointer-events-auto flex items-center gap-xxs rounded-(--radius-full) bg-line-2 p-xxs">
          {(["3d", "plan"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => change(m)}
              className={`relative rounded-(--radius-full) px-2xl py-md text-body-sm font-medium transition-colors ${mode === m ? "bg-surface text-ink" : "text-ink-3 hover:text-ink"}`}
            >
              {m === "3d" ? "3D" : "Floor plan"}
            </button>
          ))}
        </div>
        {mode === "3d" && pct < 100 && <p className="label text-ink-3">Loading {pct}%</p>}
        {mode === "3d" && pct >= 100 && <p className="label text-ink-3">Drag to turn</p>}
      </div>
      {mode === "plan" && planIndex >= manifest.plan.length - 1 && <p aria-hidden className="label absolute right-xl top-xl text-ink-3">N ↑</p>}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
  Turntable viewer — the photoreal layer of the plan viewer.

  Plays pre-rendered frames from render-turntable.py / encode-frames
  (Blender Cycles): drag or use the arrow keys to turn the home through
  the orbit frames; "Floor plan" plays the flight-and-cut sequence
  forward and holds on the drawing, "3D" plays it back.

  Smoothness: frames are decoded once and drawn to a canvas (swapping an
  <img> src re-decodes on every step and flashes), the turn is a
  continuous angle with momentum on release, and the home spins slowly
  on its own until the first touch. With 72 orbit frames a step is 5°.
  Frames load progressively (first frame, then every 8th, 4th, 2nd, the
  rest) and the nearest LOADED frame always shows, so a drag never
  shows an empty canvas. AVIF (decode-probed) with a WebP fallback.
  Reduced motion: no idle spin, no momentum, the plan sequence jumps.

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
  /* seconds for one idle revolution (0 disables the idle spin) */
  spinSeconds?: number;
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

const wrap = (a: number, n: number) => ((a % n) + n) % n;

/* the turn: a continuous angle in frame units + momentum, kept off React
   state so pointer moves don't re-render (only the shown frame does) */
class Turn {
  angle = 0;
  velocity = 0; // frames per ms
  lastX = 0;
  lastT = 0;
  dragging = false;
  touched = false;
  raf = 0;
}

export function TurntableViewer({ base, manifest, alt = "3D view of the home", className = "", spinSeconds = 24 }: TurntableViewerProps) {
  const n = manifest.orbit.length;
  const [ext, setExt] = useState<"avif" | "webp" | null>(null);
  const [mode, setMode] = useState<Mode>("3d");
  const [orbitIndex, setOrbitIndex] = useState(0);
  const [planIndex, setPlanIndex] = useState(-1); // -1 = not in the plan sequence
  const [loaded, setLoaded] = useState<Set<string>>(() => new Set());
  const [reduce, setReduce] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const cache = useRef(new Map<string, HTMLImageElement>());
  const canvas = useRef<HTMLCanvasElement>(null);
  const turn = useRef<Turn | null>(null);
  if (turn.current == null) {
    turn.current = new Turn();
  }
  const playRaf = useRef(0);

  useEffect(() => {
    let live = true;
    supportsAvif().then((ok) => live && setExt(ok ? "avif" : "webp"));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduce(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const url = useCallback((id: string) => `${base}/${id}.${ext ?? "webp"}`, [base, ext]);

  /* decode once, keep the bitmap */
  const load = useCallback(
    (id: string) =>
      new Promise<void>((resolve) => {
        if (cache.current.has(id)) return resolve();
        const img = new Image();
        img.decoding = "async";
        img.onload = async () => {
          try {
            await img.decode();
          } catch {
            /* drawImage still works */
          }
          cache.current.set(id, img);
          setLoaded((s) => new Set(s).add(id));
          resolve();
        };
        img.onerror = () => resolve();
        img.src = url(id);
      }),
    [url],
  );

  /* progressive preload of the orbit */
  useEffect(() => {
    if (!ext) return; // wait for the format probe so every frame is one format
    let cancelled = false;
    (async () => {
      await load(manifest.orbit[0]);
      for (const i of spread(n)) {
        if (cancelled) return;
        await load(manifest.orbit[i]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [manifest.orbit, n, load, ext]);

  /* which frame to show: a plan frame while in/after the sequence, else
     the nearest LOADED orbit frame so turning never flashes empty */
  let frameId: string | null = null;
  if (planIndex >= 0) frameId = manifest.plan[planIndex];
  else if (loaded.has(manifest.orbit[orbitIndex])) frameId = manifest.orbit[orbitIndex];
  else {
    for (let d = 1; d < n; d++) {
      const a = manifest.orbit[wrap(orbitIndex - d, n)];
      const b = manifest.orbit[wrap(orbitIndex + d, n)];
      if (loaded.has(a)) { frameId = a; break; }
      if (loaded.has(b)) { frameId = b; break; }
    }
  }

  /* draw the shown frame */
  useEffect(() => {
    const c = canvas.current;
    if (!c || !frameId) return;
    const img = cache.current.get(frameId);
    if (!img) return;
    if (c.width !== manifest.width || c.height !== manifest.height) {
      c.width = manifest.width;
      c.height = manifest.height;
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    setDrawn(true);
  }, [frameId, manifest.width, manifest.height]);

  /* the turn loop: momentum after a drag, idle spin before the first touch */
  const showAngle = useCallback(
    (a: number) => {
      const idx = wrap(Math.round(a), n);
      setOrbitIndex((cur) => (cur === idx ? cur : idx));
    },
    [n],
  );
  const stopTurn = useCallback(() => {
    const t = turn.current!;
    cancelAnimationFrame(t.raf);
    t.raf = 0;
  }, []);
  const runTurn = useCallback(() => {
    const t = turn.current!;
    cancelAnimationFrame(t.raf);
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      if (t.dragging) return;
      if (Math.abs(t.velocity) > 0.0004) {
        t.angle += t.velocity * dt;
        t.velocity *= Math.pow(0.9955, dt); // ≈ 1.5 s to settle
        showAngle(t.angle);
        t.raf = requestAnimationFrame(step);
        return;
      }
      t.velocity = 0;
      if (!t.touched && spinSeconds > 0) {
        t.angle += (n / (spinSeconds * 1000)) * dt;
        showAngle(t.angle);
        t.raf = requestAnimationFrame(step);
        return;
      }
      t.raf = 0;
    };
    t.raf = requestAnimationFrame(step);
  }, [n, showAngle, spinSeconds]);

  const ready = loaded.has(manifest.orbit[0]);
  const pct = Math.round((loaded.size / Math.max(1, n)) * 100);
  const spinReady = pct >= 50; // enough frames in for the idle spin to look continuous
  useEffect(() => {
    if (mode !== "3d" || reduce || !spinReady) return;
    runTurn();
    return stopTurn;
  }, [mode, reduce, spinReady, runTurn, stopTurn]);

  /* the plan sequence: play forward on "Floor plan", back on "3D" */
  const play = useCallback(
    async (dir: 1 | -1) => {
      cancelAnimationFrame(playRaf.current);
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
        if (i >= 0 && i < ids.length) playRaf.current = requestAnimationFrame(step);
        else if (dir === -1) setPlanIndex(-1);
      };
      playRaf.current = requestAnimationFrame(step);
    },
    [manifest.plan, load, reduce],
  );

  const change = (m: Mode) => {
    if (m === mode) return;
    const t = turn.current!;
    t.touched = true;
    t.velocity = 0;
    stopTurn();
    if (m === "plan") t.angle = 0; // the flight starts from the first orbit pose
    setMode(m);
    void play(m === "plan" ? 1 : -1);
  };

  /* drag / keys turn the home (3D only) */
  const onPointerDown = (e: React.PointerEvent) => {
    if (mode !== "3d") return;
    const t = turn.current!;
    t.dragging = true;
    t.touched = true;
    t.velocity = 0;
    t.lastX = e.clientX;
    t.lastT = performance.now();
    stopTurn();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const t = turn.current!;
    if (!t.dragging) return;
    const width = (e.currentTarget as HTMLElement).clientWidth || 1;
    const now = performance.now();
    const dFrames = -((e.clientX - t.lastX) / width) * n * 1.1; // a full-width drag ≈ one turn
    const dt = Math.max(1, now - t.lastT);
    t.angle += dFrames;
    t.velocity = 0.6 * t.velocity + 0.4 * (dFrames / dt);
    t.lastX = e.clientX;
    t.lastT = now;
    showAngle(t.angle);
  };
  const onPointerUp = () => {
    const t = turn.current!;
    if (!t.dragging) return;
    t.dragging = false;
    if (performance.now() - t.lastT > 80) t.velocity = 0; // held still before release: no fling
    if (reduce) t.velocity = 0;
    const idx = wrap(Math.round(t.angle), n);
    t.angle = Math.round(t.angle);
    setOrbitIndex(idx);
    if (t.velocity !== 0) runTurn();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (mode !== "3d") return;
    const t = turn.current!;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    t.touched = true;
    t.velocity = 0;
    stopTurn();
    t.angle = Math.round(t.angle) + (e.key === "ArrowLeft" ? -1 : 1);
    showAngle(t.angle);
  };

  return (
    <div className={`relative w-full overflow-hidden rounded-md ${className}`} data-mode-3d={mode} data-frame={frameId ?? undefined}>
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
          <img src={`${base}/poster.webp`} alt="" aria-hidden className={`absolute inset-0 size-full object-contain transition-opacity duration-500 ${drawn ? "opacity-0" : "opacity-100"}`} />
        </picture>
        <canvas ref={canvas} aria-hidden className={`absolute inset-0 size-full ${drawn ? "opacity-100" : "opacity-0"}`} />
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
        {mode === "3d" && !ready && <p className="label text-ink-3">Loading…</p>}
        {mode === "3d" && ready && pct < 100 && <p className="label text-ink-3">Loading {pct}%</p>}
        {mode === "3d" && pct >= 100 && <p className="label text-ink-3">Drag to turn</p>}
      </div>
      {mode === "plan" && planIndex >= manifest.plan.length - 1 && <p aria-hidden className="label absolute right-xl top-xl text-ink-3">N ↑</p>}
    </div>
  );
}

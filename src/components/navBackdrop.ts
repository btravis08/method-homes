/*
  Per-element nav color modes from real backdrop luminance.

  While the nav floats transparently, each element marked
  [data-nav-probe] samples the pixels of whatever actually sits
  behind its center point — background-image divs (cover/contain,
  centered), video frames, or solid backgrounds — and flips its own
  data-mode between "light" and "dark". Elements then color through
  the normal design tokens (and the existing 300ms ease), so a dark
  carousel slide under one link turns that link white while its
  neighbors stay ink.

  Images are downsampled once into tiny canvases (Sanity's CDN sends
  CORS headers, local assets are same-origin); a probe whose media
  can't be read falls back to the media's declared data-mode. Probes
  re-run on any scroll (window or inner tracks, via capture), resize,
  and a slow tick for video frames and slide fades.
*/

const SAMPLE = 48;
/* scrims sit over most imagery, so borderline backdrops lean dark
   (white text) */
const THRESHOLD = 150;

interface ImageEntry {
  ok: boolean;
  data?: ImageData;
  w: number;
  h: number;
}

export function startNavBackdropProbes(header: HTMLElement): () => void {
  const cache = new Map<string, ImageEntry | "loading">();
  const videoCanvas = new WeakMap<
    HTMLVideoElement,
    { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D }
  >();
  /* per-sweep video frame cache; cleared at the top of probeAll */
  const videoFrame = new Map<HTMLVideoElement, ImageData>();
  let raf = 0;
  let dirty = true;

  const luminanceAt = (entry: ImageEntry, u: number, v: number): number | null => {
    if (!entry.data) return null;
    const x = Math.min(entry.w - 1, Math.max(0, Math.round(u * (entry.w - 1))));
    const y = Math.min(entry.h - 1, Math.max(0, Math.round(v * (entry.h - 1))));
    const i = (y * entry.w + x) * 4;
    const d = entry.data.data;
    if (d[i + 3] < 128) return null; // transparent pixel (letterbox)
    return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  };

  const ensureImage = (url: string): ImageEntry | null => {
    const hit = cache.get(url);
    if (hit) return hit === "loading" ? null : hit;
    cache.set(url, "loading");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const ar = img.naturalWidth / Math.max(1, img.naturalHeight);
        const c = document.createElement("canvas");
        c.width = SAMPLE;
        c.height = Math.max(1, Math.round(SAMPLE / ar));
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, c.width, c.height);
        cache.set(url, {
          ok: true,
          data: ctx.getImageData(0, 0, c.width, c.height),
          w: c.width,
          h: c.height,
        });
      } catch {
        cache.set(url, { ok: false, w: 0, h: 0 });
      }
      dirty = true;
    };
    img.onerror = () => cache.set(url, { ok: false, w: 0, h: 0 });
    img.src = url;
    return null;
  };

  /* map a viewport point into image space for centered cover/contain */
  const mapPoint = (
    u0: number,
    v0: number,
    imgAR: number,
    elAR: number,
    size: string,
  ): { u: number; v: number; outside: boolean } => {
    let u = u0;
    let v = v0;
    if (size === "contain") {
      if (imgAR > elAR) {
        const dispH = elAR / imgAR;
        v = (v0 - (1 - dispH) / 2) / dispH;
      } else {
        const dispW = imgAR / elAR;
        u = (u0 - (1 - dispW) / 2) / dispW;
      }
      return { u, v, outside: u < 0 || u > 1 || v < 0 || v > 1 };
    }
    /* cover and friends */
    if (imgAR > elAR) {
      const dispW = imgAR / elAR;
      u = 0.5 + (u0 - 0.5) / dispW;
    } else {
      const dispH = elAR / imgAR;
      v = 0.5 + (v0 - 0.5) / dispH;
    }
    return { u, v, outside: false };
  };

  /* luminance of el's media at the point; null = unknown/miss */
  const mediaLuminance = (el: Element, x: number, y: number): number | null | "none" => {
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return "none";
    const u0 = (x - rect.left) / rect.width;
    const v0 = (y - rect.top) / rect.height;
    const elAR = rect.width / rect.height;

    if (el instanceof HTMLVideoElement && el.videoWidth) {
      try {
        let entry = videoCanvas.get(el);
        if (!entry) {
          const c = document.createElement("canvas");
          c.width = SAMPLE;
          c.height = Math.max(1, Math.round((SAMPLE * el.videoHeight) / el.videoWidth));
          entry = { c, ctx: c.getContext("2d", { willReadFrequently: true })! };
          videoCanvas.set(el, entry);
        }
        /* one readback per video per sweep — the three sample points
           share the same frame */
        let data = videoFrame.get(el);
        if (!data) {
          entry.ctx.drawImage(el, 0, 0, entry.c.width, entry.c.height);
          data = entry.ctx.getImageData(0, 0, entry.c.width, entry.c.height);
          videoFrame.set(el, data);
        }
        const { u, v, outside } = mapPoint(
          u0,
          v0,
          el.videoWidth / el.videoHeight,
          elAR,
          "cover",
        );
        if (outside) return null;
        return luminanceAt({ ok: true, data, w: entry.c.width, h: entry.c.height }, u, v);
      } catch {
        return null;
      }
    }

    const cs = getComputedStyle(el);
    const m = /url\("?([^")]+)"?\)/.exec(cs.backgroundImage);
    if (!m) return "none";
    const entry = ensureImage(m[1]);
    if (!entry || !entry.ok || !entry.data) return null;
    const { u, v, outside } = mapPoint(u0, v0, entry.w / entry.h, elAR, cs.backgroundSize);
    if (outside) return null;
    return luminanceAt(entry, u, v);
  };

  const modeAt = (x: number, y: number): "light" | "dark" | null => {
    for (const el of document.elementsFromPoint(x, y)) {
      if (header.contains(el)) continue;
      if (el.closest("[data-navbar]") || el.closest("[data-purchase-dock]")) continue;
      const lum = mediaLuminance(el, x, y);
      if (typeof lum === "number") return lum < THRESHOLD ? "dark" : "light";
      if (lum === null) {
        /* unreadable/loading media, or a letterboxed miss: if it (or
           a wrapper) declares a mode, trust that; otherwise keep
           descending to whatever shows through */
        const declared = el.closest<HTMLElement>("[data-mode]");
        if (declared)
          return declared.dataset.mode === "dark" ? "dark" : "light";
        continue;
      }
      /* not media — an opaque background decides directly */
      const p = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(
        getComputedStyle(el).backgroundColor,
      );
      if (p && (p[4] === undefined || parseFloat(p[4]) > 0.5)) {
        const l = 0.2126 * +p[1] + 0.7152 * +p[2] + 0.0722 * +p[3];
        return l < THRESHOLD ? "dark" : "light";
      }
    }
    return null;
  };

  const probeAll = () => {
    /* Two phases, reads then writes. Setting data-mode invalidates
       style document-wide, and the next probe's elementsFromPoint
       would force a full synchronous recalc — interleaved, a sweep
       used to trigger up to one full style+layout pass per sample
       (the intermittent multi-hundred-ms long tasks Lighthouse
       attributed to the page during startup). */
    const updates: Array<[HTMLElement, "light" | "dark" | null]> = [];
    videoFrame.clear();
    header.querySelectorAll<HTMLElement>("[data-nav-probe]").forEach((probe) => {
      const r = probe.getBoundingClientRect();
      if (r.width < 1) return;
      /* three samples across the width — an element straddling a
         light/dark boundary follows its majority, ties lean dark
         (white text is safer over mixed imagery) */
      const y = r.top + r.height / 2;
      let dark = 0;
      let light = 0;
      for (const fx of [0.2, 0.5, 0.8]) {
        const mode = modeAt(r.left + r.width * fx, y);
        if (mode === "dark") dark += 1;
        else if (mode === "light") light += 1;
      }
      updates.push([
        probe,
        dark === 0 && light === 0 ? null : dark >= light ? "dark" : "light",
      ]);
    });
    /* writes last, and only when the value actually changes */
    for (const [probe, mode] of updates) {
      if (mode === null) {
        if (probe.dataset.mode !== undefined) delete probe.dataset.mode;
      } else if (probe.dataset.mode !== mode) {
        probe.dataset.mode = mode;
      }
    }
  };

  const schedule = () => {
    dirty = true;
  };
  const loop = () => {
    if (dirty) {
      dirty = false;
      probeAll();
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  /* the first probe adapts the first paint; the STANDING work (the
     600ms media tick, scroll/resize) arms after idle — each probeAll
     hit-tests the full page DOM, and during hydration those ticks
     were stacking into the startup long-task window (TBT) for no
     visual benefit: nothing scrolls or fades before the user can
     interact */
  let tick = 0;
  let armed = false;
  const arm = () => {
    if (armed) return;
    armed = true;
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    tick = window.setInterval(schedule, 600);
  };
  const hasIdle = typeof window.requestIdleCallback === "function";
  const idle = hasIdle
    ? window.requestIdleCallback(arm, { timeout: 4000 })
    : (window.setTimeout(arm, 3000) as unknown as number);

  return () => {
    cancelAnimationFrame(raf);
    if (hasIdle) window.cancelIdleCallback(idle);
    else clearTimeout(idle);
    if (armed) {
      clearInterval(tick);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    }
    header
      .querySelectorAll<HTMLElement>("[data-nav-probe]")
      .forEach((probe) => delete probe.dataset.mode);
  };
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ENTRIES, bezier, flipToArticle } from "@/components/journal/field-flip";
import { PhotoHeader } from "@/components/journal/PhotoHeader";

/*
  Alt journal landing v2 — a faithful photoyoshi.com recreation,
  reverse-engineered from its bundle's GLSL and a frame-by-frame
  screencast of the real site (design/reference/photoyoshi):

  Intro: the grid starts ZOOMED IN on the centered tile — a lit
  photo in the middle with its 8 ghosted neighbours bleeding off the
  screen edges — while the wordmark fades ghost→ink and the counter
  tracks the atlas load. At 100 the wordmark ROLLS once, then the
  whole field zooms out to the resting wide view (a bend impulse
  settles it) as the chrome fades. One column is always centered on
  screen; a row is centered at load so the intro tile sits dead
  center.

  Grid: 8-column lattice (measured off the 1440 capture), tiles at
  natural aspect. Ghost
  state is the reference's exact recipe — grayscale at low opacity
  over the cream. Focus is PER TILE (their planes ease a hover state
  each): tiles near the cursor dissolve to a slightly brightened,
  subtly time-wobbling full-color copy through a noise-speckled edge,
  and the reveal radius widens the longer the cursor dwells. Touch
  reveals a band around the viewport's center instead. While
  scrolling, tiles shear like tilting cards, more toward the screen
  edges (their vertex stage tilts planes in Z under a perspective
  camera).

  A click that didn't travel FLIPs the photo into its article.
*/

const ATLAS_GRID = 4;
const ATLAS_CELL = 512;
/* reference lattice measured off the 1440 capture: 8 columns at a
   180px horizontal / 162px vertical stride, tiles ~60-100px */
const DESKTOP_STRIDE = { x: 180, y: 162 };
const MOBILE_STRIDE = { x: 136, y: 124 };
const TILE_MAX = 0.7;
const CREAM = "#f1efe7";
const INTRO_MIN_MS = 2400;
/* intro zoom-out: duration + the dramatic ease shared with the FLIP */
const ZOOM_MS = 1150;
const ZOOM_EASE = bezier(0.85, 0, 0.15, 1);

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uScroll;
uniform float uVel;
uniform vec2 uFocus;
uniform float uTouchMode;
uniform vec2 uStride;
uniform float uCount;
uniform float uDwell;
uniform float uTime;
/* intro zoom-out: the grid renders scaled up around the screen
   center; 1.0 = the resting wide view */
uniform float uZoom;
/* lattice shift that puts one column exactly on the screen's
   vertical centerline */
uniform float uXOff;
/* during the intro only the exact center cell is lit */
uniform vec2 uCenterCell;
uniform float uIntroFocus;
uniform sampler2D uTex;

const vec3 CREAM = vec3(0.9451, 0.9373, 0.9059);

vec2 atlasUv(float idx, vec2 t) {
  vec2 cell = vec2(mod(idx, ${ATLAS_GRID}.0), floor(idx / ${ATLAS_GRID}.0));
  return (cell + clamp(t, 0.002, 0.998)) / ${ATLAS_GRID}.0;
}

float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 fragPx = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  /* intro zoom-out around the screen center */
  vec2 g = (fragPx - 0.5 * uRes) / uZoom + 0.5 * uRes;
  float xn = g.x / uRes.x - 0.5;
  float velN = clamp(uVel / 2600.0, -1.0, 1.0);

  /* mild global bow — the settle wave rides this too */
  float bend = xn * xn * 4.0 * velN * 60.0;
  vec2 p = vec2(g.x - uXOff, g.y + uScroll + bend);
  float c = floor(p.x / uStride.x);
  float r = floor(p.y / uStride.y);
  vec2 local = p - vec2(c, r) * uStride;

  /* per-cell size jitter, mild like the reference (integer math —
     the JS hit-test mirrors it exactly) */
  float sj = mod(c * 31.0 + r * 47.0 + c * r * 13.0, 5.0);
  float scale = 0.62 + 0.065 * sj; /* 0.62 .. 0.88 */
  float side = uStride.y * ${TILE_MAX} * scale;
  vec2 pad = (uStride - vec2(side)) * 0.5;
  vec2 t = (local - pad) / side;
  /* scrolling shears each tile like a tilting card, stronger toward
     the screen edges (the reference tilts its planes in Z) */
  t.y += (t.x - 0.5) * velN * xn * 1.1;

  vec3 col = CREAM;
  if (t.x > 0.0 && t.x < 1.0 && t.y > 0.0 && t.y < 1.0) {
    vec2 b = floor(vec2(c, r) / 4.0);
    float jitter = mod(b.x * 13.0 + b.y * 29.0 + b.x * b.y * 7.0, uCount);
    float idx = mod(c * 5.0 + r * 7.0 + jitter, uCount);

    /* PER-TILE focus, evaluated at the tile's center so whole tiles
       transition together like the reference's planes */
    vec2 tileCenter = vec2((c + 0.5) * uStride.x, (r + 0.5) * uStride.y - uScroll);
    float focus;
    if (uTouchMode > 0.5) {
      float dy = abs(tileCenter.y - uRes.y * 0.45);
      focus = 1.0 - smoothstep(uRes.y * 0.14, uRes.y * 0.32, dy);
    } else {
      float dd = distance(tileCenter, uFocus);
      /* dwell widens the reveal — their hoverN scales the radius */
      float rad = uStride.y * (1.5 + uDwell * 2.6);
      focus = 1.0 - smoothstep(rad * 0.45, rad, dd);
    }
    /* intro: only the exact center cell is lit; the 8 neighbours
       stay ghosts until the zoom settles and the hand-off eases
       this weight back to the pointer/band focus */
    float cf =
      (abs(c - uCenterCell.x) < 0.5 && abs(r - uCenterCell.y) < 0.5)
        ? 1.0
        : 0.0;
    focus = mix(focus, cf, uIntroFocus);

    /* alpha marks the photo within its square cell (CONTAIN
       padding) — everything outside composites to plain cream, so
       the reveal never draws a bright box around the picture */
    vec4 photo = texture2D(uTex, atlasUv(idx, t));
    /* the revealed copy: slightly brightened and breathing (their
       refract wobble) */
    vec2 wob = vec2(
      sin(t.y * 50.0 + uTime) * 0.0015,
      cos(t.x * 50.0 + uTime) * 0.0015
    );
    vec4 wobbled = texture2D(uTex, atlasUv(idx, t + wob));
    vec3 bright = mix(CREAM, wobbled.rgb + 0.04, wobbled.a);
    /* ghost: the reference's exact vec4(gray,gray,gray,opacityN) —
       grayscale sunk into the cream */
    float g = dot(photo.rgb, vec3(0.299, 0.587, 0.114));
    vec3 ghost = mix(CREAM, vec3(g), 0.15 * photo.a);
    /* noise-speckled dissolve at the reveal edge, per the bundle */
    float n = hash2(floor(fragPx / 3.0) + floor(uTime * 3.0));
    float f = clamp(focus * 1.25 - n * 0.35, 0.0, 1.0);
    col = mix(ghost, bright, f);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

type IntroPhase = "count" | "roll" | "expand" | "out";

/* the preloader chrome: ghost→ink wordmark, +marks, caption, house
   label, counter. The photo itself lives on the canvas behind — the
   grid starts zoomed to the center tile (its 8 neighbours bleeding
   off the edges) and zooms out to the wide view at the hand-off. */
function Intro({
  progress,
  phase,
}: {
  progress: number;
  phase: IntroPhase;
}) {
  const [inked, setInked] = useState(false);
  useEffect(() => {
    const a = window.setTimeout(() => setInked(true), 80);
    return () => window.clearTimeout(a);
  }, []);
  return (
    <div
      aria-hidden
      data-intro-phase={phase}
      className={`absolute inset-0 z-[60] transition-opacity duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
        phase === "out" ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      {/* wordmark: ghost → ink, then one roll at 100 (the window is
          exactly one line tall so the second copy stays hidden) */}
      <div
        className="absolute inset-x-0 top-[38%] overflow-hidden"
        style={{ height: "calc(10.4vw * 0.94)" }}
      >
        <div
          className={`transition-transform duration-[650ms] ease-[cubic-bezier(0.85,0,0.15,1)] ${
            phase === "count" ? "translate-y-0" : "-translate-y-1/2"
          }`}
        >
          {[0, 1].map((copy) => (
            <div
              key={copy}
              className={`whitespace-nowrap text-center font-medium leading-[0.94] tracking-[-0.03em] text-[10.4vw] text-[#252726] transition-opacity duration-[1000ms] ${
                inked ? "opacity-100" : "opacity-15"
              }`}
              style={{ WebkitTextStroke: "0.032em #252726" }}
            >
              HONORS JOURNAL
            </div>
          ))}
        </div>
      </div>
      <span className="absolute left-6 top-1/2 -translate-y-1/2 text-[0.625rem] text-[#252726]">+</span>
      <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[0.625rem] text-[#252726]">+</span>
      <p className="absolute inset-x-0 bottom-14 mx-auto max-w-[24rem] text-center text-[0.625rem] font-medium leading-[1.5] text-[#252726]">
        The Honors Journal is the field notes of Sun Day Red — a word that
        combines &ldquo;honors&rdquo; and &ldquo;journal.&rdquo;
      </p>
      <p className="absolute bottom-6 left-6 text-[0.625rem] font-medium text-[#252726]">
        HONORS JOURNAL&nbsp;|*|&nbsp;SUN DAY RED
      </p>
      <p className="absolute bottom-6 right-6 text-[0.8125rem] font-medium tabular-nums text-[#252726]">
        {Math.min(progress, 100)}
      </p>
    </div>
  );
}

export function JournalGridLight() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<IntroPhase>("count");
  const mountAt = useRef(0);
  const router = useRouter();

  /* intro state machine: count → roll (wordmark tick) → expand
     (the grid zooms out from the center tile) → out (chrome fades) */
  useEffect(() => {
    /* one timer per phase: scheduling the next step from a fresh
       effect run survives the cleanup that a nested-timer chain
       doesn't (the phase change itself would cancel the chain) */
    if (phase === "count") {
      if (progress < 100) return;
      const elapsed = performance.now() - mountAt.current;
      const t = window.setTimeout(
        () => setPhase("roll"),
        Math.max(0, INTRO_MIN_MS - elapsed),
      );
      return () => window.clearTimeout(t);
    }
    if (phase === "roll") {
      const t = window.setTimeout(() => setPhase("expand"), 620);
      return () => window.clearTimeout(t);
    }
    if (phase === "expand") {
      /* the zoom-out is canvas-driven — tell the GL loop to start */
      window.dispatchEvent(new CustomEvent("hj:intro-zoom"));
      const t = window.setTimeout(() => {
        setPhase("out");
        window.dispatchEvent(new CustomEvent("hj:intro-done"));
      }, ZOOM_MS);
      return () => window.clearTimeout(t);
    }
  }, [progress, phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    gl.useProgram(program);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const U = (name: string) => gl.getUniformLocation(program, name);
    const uRes = U("uRes");
    const uScroll = U("uScroll");
    const uVel = U("uVel");
    const uFocus = U("uFocus");
    const uTouchMode = U("uTouchMode");
    const uStride = U("uStride");
    const uCount = U("uCount");
    const uDwell = U("uDwell");
    const uTime = U("uTime");
    const uZoom = U("uZoom");
    const uXOff = U("uXOff");
    const uCenterCell = U("uCenterCell");
    const uIntroFocus = U("uIntroFocus");

    /* ---------- atlas: natural aspect CONTAIN, alpha = photo mask
       (padding pixels keep cream rgb but zero alpha so the shader
       composites them away) ---------- */
    const cell = document.createElement("canvas");
    cell.width = cell.height = ATLAS_CELL;
    const cctx = cell.getContext("2d", { willReadFrequently: true })!;

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    /* zero-filled allocation: unloaded cells composite to pure cream */
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      ATLAS_GRID * ATLAS_CELL,
      ATLAS_GRID * ATLAS_CELL,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );

    mountAt.current = performance.now();
    let disposed = false;
    const imageDims = new Map<string, { w: number; h: number }>();
    const photoRect = new Map<string, { x: number; y: number; w: number; h: number }>();
    let loadedCount = 0;
    /* the counter must land even if the network drags */
    const progressTimer = window.setTimeout(() => setProgress(100), 3500);
    ENTRIES.forEach((entry, i) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        if (disposed) return;
        loadedCount += 1;
        setProgress(Math.round((loadedCount / ENTRIES.length) * 100));
        imageDims.set(entry.src, { w: img.naturalWidth, h: img.naturalHeight });
        const fit = Math.min(
          ATLAS_CELL / img.naturalWidth,
          ATLAS_CELL / img.naturalHeight,
        );
        const w = img.naturalWidth * fit;
        const h = img.naturalHeight * fit;
        const ox = (ATLAS_CELL - w) / 2;
        const oy = (ATLAS_CELL - h) / 2;
        photoRect.set(entry.src, {
          x: ox / ATLAS_CELL,
          y: oy / ATLAS_CELL,
          w: w / ATLAS_CELL,
          h: h / ATLAS_CELL,
        });
        /* draw the cell over cream, then zero alpha outside the
           photo so only the picture itself survives compositing */
        cctx.fillStyle = CREAM;
        cctx.fillRect(0, 0, ATLAS_CELL, ATLAS_CELL);
        cctx.drawImage(img, ox, oy, w, h);
        const data = cctx.getImageData(0, 0, ATLAS_CELL, ATLAS_CELL);
        const px = data.data;
        const x0 = Math.floor(ox);
        const x1 = Math.ceil(ox + w);
        const y0 = Math.floor(oy);
        const y1 = Math.ceil(oy + h);
        for (let y = 0; y < ATLAS_CELL; y++) {
          const inRow = y >= y0 && y < y1;
          for (let x = 0; x < ATLAS_CELL; x++) {
            if (!inRow || x < x0 || x >= x1) px[(y * ATLAS_CELL + x) * 4 + 3] = 0;
          }
        }
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          (i % ATLAS_GRID) * ATLAS_CELL,
          Math.floor(i / ATLAS_GRID) * ATLAS_CELL,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          data,
        );
        requestRender();
      };
      img.src = entry.src;
    });

    /* ---------- state (CSS px) ---------- */
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const touch = !window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let strideCss = DESKTOP_STRIDE;
    let scroll = 0;
    let vel = 0;
    let shownVel = 0;
    const focus = { x: -99999, y: -99999 };
    /* dwell: the reveal widens while the cursor rests (their hoverN) */
    let lastBigMove = 0;
    /* the wobble needs frames while the cursor is over the field */
    let hovering = false;
    let dragging = false;
    let lastPointer = { x: 0, y: 0, t: 0 };
    let flickVel = 0;
    let travelled = 0;
    let lastScrub = 0;

    /* intro zoom-out: the grid starts scaled so the centered tile
       and its 8 neighbours (bleeding off the edges) fill the screen */
    let xOff = 0;
    const centerCell = { c: 0, r: 0 };
    let zoom = 1;
    let zooming = false;
    let zoomFrom = 1;
    let zoomStart = 0;
    let introFocus = reduced ? 0 : 1;
    let focusFading = false;
    let focusFadeStart = 0;
    let introSettled = reduced;

    const onIntroZoom = () => {
      if (reduced) return;
      zooming = true;
      zoomFrom = zoom;
      zoomStart = performance.now();
      requestRender();
    };
    window.addEventListener("hj:intro-zoom", onIntroZoom);

    const onIntroDone = () => {
      /* settle wave: a bend impulse without scroll drift, so the
         centered column/row stays exactly where the zoom left it */
      if (!reduced) {
        shownVel = 1600;
        requestRender();
      }
    };
    window.addEventListener("hj:intro-done", onIntroDone);

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      strideCss = window.innerWidth < 768 ? MOBILE_STRIDE : DESKTOP_STRIDE;
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      /* one column always sits on the screen's vertical centerline */
      const cc = Math.round(w / (2 * strideCss.x) - 0.5);
      xOff = w / 2 - (cc + 0.5) * strideCss.x;
      if (!introSettled && !zooming) {
        /* while the intro holds, a row is centered too and the view
           is zoomed to the center tile's 3x3 neighbourhood */
        const rc = Math.round(h / (2 * strideCss.y) - 0.5);
        scroll = (rc + 0.5) * strideCss.y - h / 2;
        centerCell.c = cc;
        centerCell.r = rc;
        zoom = Math.min(
          w / (1.7 * strideCss.x),
          h / (1.7 * strideCss.y),
        );
      }
      requestRender();
    };

    let raf = 0;
    let running = false;
    let lastT = 0;
    const draw = (now: number) => {
      const dwell = reduced
        ? 0
        : Math.min(1, Math.max(0, (now - lastBigMove - 250) / 1400));
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uScroll, scroll * dpr);
      gl.uniform1f(uVel, reduced ? 0 : shownVel * dpr);
      /* uFocus compares against lattice-space tile centers, so the
         column-centering shift comes off the pointer here */
      gl.uniform2f(uFocus, (focus.x - xOff) * dpr, focus.y * dpr);
      gl.uniform1f(uTouchMode, touch ? 1 : 0);
      gl.uniform2f(uStride, strideCss.x * dpr, strideCss.y * dpr);
      gl.uniform1f(uCount, ENTRIES.length);
      gl.uniform1f(uDwell, dwell);
      gl.uniform1f(uTime, (now / 1000) % 1000);
      gl.uniform1f(uZoom, zoom);
      gl.uniform1f(uXOff, xOff * dpr);
      gl.uniform2f(uCenterCell, centerCell.c, centerCell.r);
      gl.uniform1f(uIntroFocus, introFocus);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const step = (now: number) => {
      const dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;
      if (zooming) {
        const t = Math.min(1, (now - zoomStart) / ZOOM_MS);
        zoom = zoomFrom + (1 - zoomFrom) * ZOOM_EASE(t);
        if (t >= 1) {
          zooming = false;
          zoom = 1;
          introSettled = true;
          /* ease the center tile back to pointer/band focus */
          focusFading = true;
          focusFadeStart = now;
        }
      }
      if (focusFading) {
        const t = Math.min(1, (now - focusFadeStart) / 700);
        introFocus = 1 - t;
        if (t >= 1) {
          focusFading = false;
          introFocus = 0;
        }
      }
      if (!dragging && now - lastScrub > 90) {
        vel *= Math.exp(-dt / 0.7);
        if (Math.abs(vel) < 4) vel = 0;
        scroll -= vel * dt;
      }
      const k = 1 - Math.exp(-dt / 0.14);
      shownVel += (vel - shownVel) * k;
      draw(now);
      const still =
        !dragging &&
        !zooming &&
        !focusFading &&
        vel === 0 &&
        Math.abs(shownVel) < 2 &&
        !(hovering && !touch);
      if (still) {
        shownVel = 0;
        draw(now);
        running = false;
        return;
      }
      raf = requestAnimationFrame(step);
    };
    const requestRender = () => {
      if (running) return;
      running = true;
      lastT = performance.now();
      raf = requestAnimationFrame(step);
    };

    /* ---------- input ---------- */
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      lastScrub = performance.now();
      scroll += e.deltaY;
      vel = 0;
      requestRender();
    };
    const onEnter = () => {
      hovering = true;
      requestRender();
    };
    const onLeave = () => {
      hovering = false;
      focus.x = -99999;
      focus.y = -99999;
      requestRender();
    };
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const nx = e.clientX - rect.left;
      const ny = e.clientY - rect.top;
      if (Math.hypot(nx - focus.x, ny - focus.y) > strideCss.y * 0.5)
        lastBigMove = performance.now();
      focus.x = nx;
      focus.y = ny;
      if (!dragging) {
        requestRender();
        return;
      }
      const dy = e.clientY - lastPointer.y;
      const dt = (e.timeStamp - lastPointer.t) / 1000;
      travelled += Math.hypot(e.clientX - lastPointer.x, e.clientY - lastPointer.y);
      lastPointer = { x: e.clientX, y: e.clientY, t: e.timeStamp };
      if (dt > 0) flickVel = flickVel * 0.7 + (dy / dt) * 0.3;
      scroll -= dy;
      requestRender();
    };
    const onDown = (e: PointerEvent) => {
      dragging = true;
      travelled = 0;
      vel = 0;
      flickVel = 0;
      lastPointer = { x: e.clientX, y: e.clientY, t: e.timeStamp };
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* a pointer released between event and capture is fine */
      }
      requestRender();
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      const stale = e.timeStamp - lastPointer.t > 120;
      vel = stale || reduced ? 0 : Math.max(-3500, Math.min(3500, flickVel));
      const slop = e.pointerType === "mouse" ? 6 : 16;
      if (travelled < slop) {
        const rect = canvas.getBoundingClientRect();
        const px = e.clientX - rect.left - xOff;
        const py = e.clientY - rect.top + scroll;
        const c = Math.floor(px / strideCss.x);
        const r = Math.floor(py / strideCss.y);
        const m = (v: number, n: number) => ((v % n) + n) % n;
        const sj = m(c * 31 + r * 47 + c * r * 13, 5);
        const scale = 0.62 + 0.065 * sj;
        const side = strideCss.y * TILE_MAX * scale;
        const padX = (strideCss.x - side) / 2;
        const padY = (strideCss.y - side) / 2;
        /* whole-cell hit: the photos are small in the lattice and a
           strict in-photo test made most clicks land in the gutter
           (dead taps) — accept the cell, FLIP from the photo rect */
        {
          const n = ENTRIES.length;
          const jitter = m(
            Math.floor(c / 4) * 13 +
              Math.floor(r / 4) * 29 +
              Math.floor(c / 4) * Math.floor(r / 4) * 7,
            n,
          );
          const idx = m(c * 5 + r * 7 + jitter, n);
          const entry = ENTRIES[idx];
          const pr = photoRect.get(entry.src) ?? { x: 0, y: 0, w: 1, h: 1 };
          const tileLeft = rect.left + c * strideCss.x + padX + xOff;
          const tileTop = r * strideCss.y + padY - scroll + rect.top;
          flipToArticle(
            entry,
            {
              left: tileLeft + side * pr.x,
              top: tileTop + side * pr.y,
              width: side * pr.w,
              height: side * pr.h,
            },
            imageDims.get(entry.src),
            (href) => router.push(href),
            reduced,
          );
        }
      }
      requestRender();
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerenter", onEnter);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    return () => {
      disposed = true;
      window.clearTimeout(progressTimer);
      window.removeEventListener("hj:intro-zoom", onIntroZoom);
      window.removeEventListener("hj:intro-done", onIntroDone);
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerenter", onEnter);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      gl.deleteTexture(tex);
      gl.deleteBuffer(quad);
      gl.deleteProgram(program);
    };
  }, [router]);

  return (
    <div
      data-mode="light"
      className="relative h-svh w-full overflow-hidden bg-[#f1efe7] text-[#252726]"
    >
      <canvas
        ref={canvasRef}
        aria-label="Honors Journal — scroll to explore, click a photo to open its article"
        className="size-full cursor-pointer touch-none select-none"
      />
      <PhotoHeader />
      <Intro progress={progress} phase={phase} />
      {/* the same articles as real links, for keyboards and crawlers */}
      <ul className="sr-only">
        {ENTRIES.map((entry) => (
          <li key={entry.src}>
            <a href={entry.href}>{entry.href.split("/").pop()}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

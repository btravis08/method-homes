"use client";

import Link from "next/link";
import { useState } from "react";

import { compUrl, type Breakpoint, type Mode } from "@/library/registry";

/* the serializable half of a registry entry — the viewer iframes the
   section rather than rendering it, so the render fn stays server-side
   (functions can't cross into a client component) */
export interface ViewerEntry {
  slug: string;
  title: string;
  schemaType?: string;
  description: string;
  modes: Mode[];
  figmaNodeId?: string;
  figmaUrl?: string;
  comps?: Partial<Record<Breakpoint, { width: number; height: number }>>;
  /* latest audit: per-breakpoint match scores + off-token count */
  match?: Partial<Record<Breakpoint, { pixel: number; layout: number }>>;
  offToken?: number;
  timed?: boolean;
}

/*
  The single-section viewer: a toolbar over an iframe of the same
  section's bare render. The iframe is the point — resizing it gives
  the section's real responsive behavior (media queries, the vh-based
  canvases, touch layouts) instead of a simulated scale.
*/
const VIEWPORTS: { id: Breakpoint; label: string; width: number }[] = [
  { id: "desktop", label: "Desktop", width: 1440 },
  { id: "tablet", label: "Tablet", width: 1024 },
  { id: "mobile", label: "Mobile", width: 428 },
];

function DeviceIcon({ id }: { id: Breakpoint }) {
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.2 } as const;
  if (id === "desktop")
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden {...stroke}>
        <rect x="1" y="2" width="10" height="6.5" rx="0.5" />
        <path d="M4 10.5h4M6 8.5v2" />
      </svg>
    );
  if (id === "tablet")
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden {...stroke}>
        <rect x="2" y="1.5" width="8" height="9" rx="1" />
        <path d="M5 9.25h2" />
      </svg>
    );
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden {...stroke}>
      <rect x="3.5" y="1.5" width="5" height="9" rx="1" />
      <path d="M5.25 9.25h1.5" />
    </svg>
  );
}

/* comp overlay modes: off, ghosted over the build, or difference-
   blended so any mismatch lights up and a perfect match goes black */
type Compare = "off" | "overlay" | "difference";

export function SectionViewer({
  entry,
  scheme = "light",
}: {
  entry: ViewerEntry;
  /* chrome scheme (Studio embed passes its appearance) — the frame's
     own section mode stays independently switchable */
  scheme?: "light" | "dark";
}) {
  const [mode, setMode] = useState<Mode>(entry.modes[0]);
  const [vp, setVp] = useState<Breakpoint>("desktop");
  const [compare, setCompare] = useState<Compare>("off");
  const [opacity, setOpacity] = useState(50);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const width = VIEWPORTS.find((v) => v.id === vp)!.width;
  const src = `/library/${entry.slug}?frame=1&mode=${mode}`;
  /* the comp for the breakpoint being viewed — responsive drift is
     only visible when the design being diffed is the device frame */
  const hasComp = Boolean(entry.comps?.[vp]);

  /* nudge the comp a pixel at a time to find true alignment */
  const nudge = (dx: number, dy: number) =>
    setOffset((o) => ({ x: o.x + dx, y: o.y + dy }));

  return (
    <div data-mode={scheme} className="flex h-screen w-full flex-col bg-surface text-ink">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line px-6 py-4">
        <Link
          href={scheme === "dark" ? "/library?scheme=dark" : "/library"}
          className="label font-medium text-ink-3 hover:text-ink"
        >
          ← LIBRARY
        </Link>
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-title-sm">{entry.title}</h1>
          {entry.schemaType && (
            <code className="label text-ink-3">{entry.schemaType}</code>
          )}
          {entry.figmaUrl && (
            <a
              href={entry.figmaUrl}
              target="_blank"
              rel="noreferrer"
              className="label font-medium text-ink-3 underline decoration-line underline-offset-4 hover:text-ink"
              title={entry.figmaNodeId}
            >
              FIGMA ↗
            </a>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-6">
          {entry.modes.length > 1 && (
            <div className="flex items-center gap-1">
              {entry.modes.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`label rounded-xs px-3 py-2 font-medium transition-colors ${
                    mode === m ? "bg-btn text-btn-fg" : "bg-wash text-ink-3 hover:text-ink"
                  }`}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1">
            {VIEWPORTS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVp(v.id)}
                className={`label flex items-center gap-1.5 rounded-xs px-3 py-2 font-medium transition-colors ${
                  vp === v.id ? "bg-btn text-btn-fg" : "bg-wash text-ink-3 hover:text-ink"
                }`}
              >
                <DeviceIcon id={v.id} />
                {v.label.toUpperCase()}
              </button>
            ))}
          </div>
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="label font-medium text-ink-3 hover:text-ink"
          >
            OPEN ↗
          </a>
        </div>
      </header>

      {/* compare bar: the Figma comp over the live build */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line px-6 py-3">
        {hasComp ? (
          <>
            <span className="label font-medium text-ink-3">COMP</span>
            {entry.match?.[vp] && (
              <span
                className="label text-ink-3"
                title={
                  entry.timed
                    ? "This section animates, so a still frame catches a different moment than the comp — indicative only"
                    : "Layout match measured on 64px thumbnails; pixel match is full resolution and always lower (the comp's photography is not the site's)"
                }
              >
                {entry.match[vp]!.layout}% LAYOUT · {entry.match[vp]!.pixel}% PIXEL
                {entry.timed ? " · TIMED" : ""}
              </span>
            )}
            <div className="flex items-center gap-1">
              {(
                [
                  ["off", "Off"],
                  ["overlay", "Overlay"],
                  ["difference", "Difference"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCompare(id)}
                  className={`label rounded-xs px-3 py-2 font-medium transition-colors ${
                    compare === id
                      ? "bg-btn text-btn-fg"
                      : "bg-wash text-ink-3 hover:text-ink"
                  }`}
                >
                  {label.toUpperCase()}
                </button>
              ))}
            </div>

            {compare !== "off" && (
              <>
                <label className="flex items-center gap-3">
                  <span className="label text-ink-3">OPACITY</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={opacity}
                    onChange={(e) => setOpacity(Number(e.currentTarget.value))}
                    className="w-40 accent-black"
                  />
                  <span className="label w-10 text-ink-3">{opacity}%</span>
                </label>

                <div className="flex items-center gap-1">
                  <span className="label text-ink-3">NUDGE</span>
                  {(
                    [
                      ["←", -1, 0],
                      ["→", 1, 0],
                      ["↑", 0, -1],
                      ["↓", 0, 1],
                    ] as const
                  ).map(([label, dx, dy]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => nudge(dx, dy)}
                      className="label rounded-xs bg-wash px-2 py-1 font-medium text-ink-3 hover:text-ink"
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setOffset({ x: 0, y: 0 })}
                    className="label ml-1 rounded-xs bg-wash px-2 py-1 font-medium text-ink-3 hover:text-ink"
                  >
                    {offset.x || offset.y ? `${offset.x},${offset.y} ✕` : "0,0"}
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          <span className="label text-ink-3">
            {entry.comps
              ? `NO ${vp.toUpperCase()} COMP FOR THIS SECTION`
              : "NO COMP EXPORTED FOR THIS SECTION YET"}
          </span>
        )}
      </div>

      <p className="border-b border-line px-6 py-3 text-body-sm text-ink-2">
        {entry.description}
      </p>

      <div className="flex-1 overflow-auto bg-surface-2 p-6">
        <div className="relative mx-auto h-full" style={{ width, maxWidth: "100%" }}>
          <iframe
            /* remount on mode/viewport change so scroll-driven sections
               re-measure from a clean state */
            key={`${mode}-${vp}`}
            src={src}
            title={entry.title}
            className="block h-full w-full border border-line bg-surface"
          />
          {hasComp && compare !== "off" && (
            /* the comp, pinned over the build at the frame's true
               scale — difference blending turns any mismatch into
               visible edges and a perfect match into black */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={compUrl(entry.slug, vp)}
              alt=""
              className="pointer-events-none absolute left-0 top-0 w-full"
              style={{
                opacity: opacity / 100,
                transform: `translate(${offset.x}px, ${offset.y}px)`,
                mixBlendMode: compare === "difference" ? "difference" : "normal",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

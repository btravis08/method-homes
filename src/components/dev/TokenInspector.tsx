"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { buildTables, read, type Match, type Readout, type Tables } from "@/components/dev/tokenMatch";

/*
  Token inspector — Figma Dev Mode for the running site.

  Hover any element and the panel names the tokens behind what you're
  looking at: the section's color mode, the semantic color vars for
  its surface and ink, the type style (with line-height and tracking),
  the spacing steps behind its padding and gaps, and its radius.
  Values that match no token are flagged "off-token" — the whole point
  is that drift is visible.

  Resolution is measured, not guessed: on mount, hidden probes read
  every token's computed value at the current viewport (clamp() type
  and rem spacing resolve to real px; every color resolves per mode),
  then computed styles are matched back against those tables.

  Toggle with Alt+T, or load any page with ?inspect=1. Click to pin a
  reading, Esc to unpin. Never loads for ordinary visitors — the gate
  only imports this chunk once inspection is switched on.
*/

const PANEL_W = 300;

/* ---- presentation ---- */

const S = {
  panel: {
    position: "fixed" as const,
    zIndex: 2147483647,
    width: PANEL_W,
    background: "#111",
    color: "#eee",
    font: '11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
    borderRadius: 6,
    boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
    overflow: "hidden",
  },
  row: {
    display: "flex",
    gap: 8,
    padding: "3px 10px",
    alignItems: "baseline" as const,
  },
  key: { color: "#7b7b7b", width: 62, flex: "none" as const },
  val: { color: "#eee", wordBreak: "break-all" as const, flex: 1 },
  /* monochrome: a token hit reads bright, a miss inverts to a chip —
     loud without spending a hue */
  hit: { color: "#fff", fontWeight: 600 },
  miss: {
    background: "#fff",
    color: "#111",
    fontWeight: 600,
    padding: "0 4px",
    borderRadius: 2,
  },
};

function Line({ label, m }: { label: string; m: Match }) {
  const ok = m.token && m.token !== "—";
  return (
    <div style={S.row}>
      <span style={S.key}>{label}</span>
      <span style={S.val}>
        <span style={ok ? S.hit : m.token === "—" ? S.key : S.miss}>
          {ok ? m.token : m.token === "—" ? "—" : "off-token"}
        </span>
        {m.token !== "—" && <span style={{ color: "#7b7b7b" }}>{`  ${m.value}`}</span>}
      </span>
    </div>
  );
}

export default function TokenInspector({ onExit }: { onExit: () => void }) {
  const [tables, setTables] = useState<Tables | null>(null);
  const [readout, setReadout] = useState<Readout | null>(null);
  const [box, setBox] = useState<DOMRect | null>(null);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState({ x: 16, y: 16 });
  const raf = useRef(0);

  /* probes need the fonts and mode blocks in place */
  useEffect(() => {
    const build = () => setTables(buildTables());
    if (typeof window.requestIdleCallback === "function") {
      const h = window.requestIdleCallback(build);
      return () => window.cancelIdleCallback(h);
    }
    const h = window.setTimeout(build, 50);
    return () => window.clearTimeout(h);
  }, []);

  /* re-measure the clamp()-driven tables when the viewport changes */
  useEffect(() => {
    if (!tables) return;
    const onResize = () => setTables(buildTables());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [tables]);

  const sample = useCallback(
    (x: number, y: number) => {
      if (!tables || pinned) return;
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => {
        const el = document.elementFromPoint(x, y);
        if (!el || el === document.documentElement || el === document.body) return;
        setReadout(read(el, tables));
        setBox(el.getBoundingClientRect());
        /* keep the panel opposite the cursor's half of the screen */
        setPos({
          x: x > window.innerWidth - PANEL_W - 40 ? 16 : window.innerWidth - PANEL_W - 16,
          y: 16,
        });
      });
    },
    [tables, pinned],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => sample(e.clientX, e.clientY);
    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setPinned((v) => !v);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (pinned) setPinned(false);
        else onExit();
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(raf.current);
    };
  }, [sample, pinned, onExit]);

  /* padding bands, drawn inside the element's box like Dev Mode */
  const bands = useMemo(() => {
    if (!box || !readout) return null;
    const [t, r, b, l] = readout.padding.map((p) => parseFloat(p.value) || 0);
    return { t, r, b, l };
  }, [box, readout]);

  return (
    <>
      {/* element outline + padding shading */}
      {box && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height,
            outline: "1px solid rgba(255,255,255,0.9)",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.55)",
            background: "rgba(255,255,255,0.06)",
            zIndex: 2147483646,
            pointerEvents: "none",
          }}
        >
          {bands &&
            (["t", "r", "b", "l"] as const).map((side) => {
              const v = bands[side];
              if (!v) return null;
              const common = {
                position: "absolute" as const,
                background:
                  "repeating-linear-gradient(45deg, rgba(255,255,255,0.22) 0 3px, rgba(255,255,255,0.06) 3px 6px)",
              };
              const style =
                side === "t"
                  ? { ...common, left: 0, right: 0, top: 0, height: v }
                  : side === "b"
                    ? { ...common, left: 0, right: 0, bottom: 0, height: v }
                    : side === "l"
                      ? { ...common, top: 0, bottom: 0, left: 0, width: v }
                      : { ...common, top: 0, bottom: 0, right: 0, width: v };
              return <div key={side} style={style} />;
            })}
        </div>
      )}

      {/* readout */}
      <div style={{ ...S.panel, left: pos.x, top: pos.y }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 10px",
            background: pinned ? "#3a3a3a" : "#1c1c1c",
            borderBottom: "1px solid #2a2a2a",
          }}
        >
          <strong style={{ fontWeight: 600, letterSpacing: "0.04em" }}>TOKENS</strong>
          <span style={{ color: "#7b7b7b", flex: 1 }}>
            {pinned ? "pinned · click to release" : "hover · click to pin"}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onExit();
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "#7b7b7b",
              cursor: "pointer",
              font: "inherit",
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>

        {!tables ? (
          <div style={{ ...S.row, color: "#7b7b7b" }}>measuring tokens…</div>
        ) : !readout ? (
          <div style={{ ...S.row, color: "#7b7b7b" }}>hover any element</div>
        ) : (
          <div style={{ padding: "6px 0" }}>
            <div style={{ ...S.row, color: "#fff" }}>
              <span style={S.key}>element</span>
              <span style={S.val}>
                {readout.tag}
                <span style={{ color: "#7b7b7b" }}>{`  ${readout.size}`}</span>
              </span>
            </div>
            <div style={S.row}>
              <span style={S.key}>mode</span>
              <span style={{ ...S.val, color: "#fff", fontWeight: 600 }}>
                {readout.mode}
              </span>
            </div>

            <Divider label="COLOR" />
            <Line label="surface" m={readout.background} />
            <Line label="ink" m={readout.color} />

            <Divider label="TYPE" />
            <Line label="style" m={readout.type} />
            <div style={S.row}>
              <span style={S.key}>metrics</span>
              <span style={{ ...S.val, color: "#7b7b7b" }}>
                {`lh ${readout.type.lineHeight} · ls ${readout.type.letterSpacing}`}
              </span>
            </div>
            <Line label="family" m={readout.font} />

            <Divider label="SPACING" />
            {(["padding-t", "padding-r", "padding-b", "padding-l"] as const).map(
              (label, i) =>
                readout.padding[i].value !== "0" ? (
                  <Line key={label} label={label} m={readout.padding[i]} />
                ) : null,
            )}
            {readout.gap.map((g, i) => (
              <Line key={`gap${i}`} label={i === 0 ? "row-gap" : "col-gap"} m={g} />
            ))}
            {readout.padding.every((p) => p.value === "0") && !readout.gap.length && (
              <div style={{ ...S.row, color: "#7b7b7b" }}>
                <span style={S.key}>—</span>
                <span style={S.val}>no padding or gap</span>
              </div>
            )}

            <Divider label="SHAPE" />
            <Line label="radius" m={readout.radius} />
          </div>
        )}
      </div>
    </>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div
      style={{
        margin: "6px 10px 3px",
        paddingTop: 6,
        borderTop: "1px solid #2a2a2a",
        color: "#5a5a5a",
        letterSpacing: "0.08em",
      }}
    >
      {label}
    </div>
  );
}

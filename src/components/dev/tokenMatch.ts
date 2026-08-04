/*
  Token matching — the engine behind both the hover inspector and the
  headless section audit, so a value judged off-token in one is judged
  off-token in the other.

  Resolution is measured, not guessed: hidden probes read every token's
  computed value at the current viewport (clamp() type and rem spacing
  resolve to real px; every color resolves inside each section mode),
  then computed styles are matched back against those tables.

  Browser-only — every function here needs a live document.
*/
import tokens from "@/design/tokens.site.json";

export type Match = { token: string | null; value: string };

export interface Readout {
  tag: string;
  mode: string;
  size: string;
  color: Match;
  background: Match;
  font: Match;
  type: Match & { lineHeight?: string; letterSpacing?: string };
  padding: Match[];
  gap: Match[];
  radius: Match;
}

/* ---- token resolution tables, measured in the live document ---- */

export interface Tables {
  /* mode → normalized css color → token var; a color is only named
     from the mode the element actually sits in (white is --ink in
     dark and --btn-fg in light — the mode decides which is true) */
  color: Map<string, Map<string, string>>;
  /* px → spacing token name */
  spacing: Map<number, string>;
  /* px → type token name + its metrics */
  type: Map<number, { name: string; lineHeight?: string; letterSpacing?: string }>;
  radius: Map<number, string>;
  font: Map<string, string>;
}

export function buildTables(): Tables {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;left:-9999px;top:-9999px;width:0;height:0;pointer-events:none;visibility:hidden";
  document.body.appendChild(probe);

  /* browsers normalize any color to rgb()/rgba() on read-back */
  const norm = (raw: string) => {
    if (!raw) return "";
    probe.style.color = "";
    probe.style.color = raw.trim();
    const out = getComputedStyle(probe).color;
    probe.style.color = "";
    return out;
  };
  const px = (raw: string) => {
    probe.style.width = "";
    probe.style.width = raw.trim();
    const out = parseFloat(getComputedStyle(probe).width);
    probe.style.width = "";
    return Number.isFinite(out) ? Math.round(out * 100) / 100 : NaN;
  };

  const color = new Map<string, Map<string, string>>();
  /* every semantic var, resolved inside each section mode */
  for (const mode of tokens.modes) {
    const modeProbe = document.createElement("div");
    modeProbe.setAttribute("data-mode", mode);
    modeProbe.style.cssText = "position:fixed;left:-9999px;top:-9999px;visibility:hidden";
    document.body.appendChild(modeProbe);
    const cs = getComputedStyle(modeProbe);
    const forMode = new Map<string, string>();
    for (const t of tokens.semantic) {
      const raw = cs.getPropertyValue(t.path).trim();
      if (!raw) continue;
      const key = norm(raw);
      if (key && !forMode.has(key)) forMode.set(key, t.path);
    }
    color.set(mode, forMode);
    modeProbe.remove();
  }

  const spacing = new Map<number, string>();
  for (const t of tokens.spacing) {
    const v = px(t.value);
    if (Number.isFinite(v) && !spacing.has(v)) spacing.set(v, t.name);
  }

  const type = new Map<number, { name: string; lineHeight?: string; letterSpacing?: string }>();
  for (const t of tokens.type) {
    const v = px(t.value);
    if (Number.isFinite(v) && !type.has(v)) {
      type.set(v, {
        name: t.name,
        lineHeight: t.detail?.lineHeight,
        letterSpacing: t.detail?.letterSpacing,
      });
    }
  }

  const radius = new Map<number, string>();
  for (const t of tokens.radius) {
    const v = px(t.value);
    if (Number.isFinite(v) && !radius.has(v)) radius.set(v, t.name);
  }

  const font = new Map<string, string>();
  for (const t of tokens.fonts) {
    /* the var resolves to the next/font family stack */
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue(t.value.replace(/^var\(|\)$/g, ""))
      .trim();
    const first = (raw || t.value).split(",")[0].replace(/['"]/g, "").trim();
    if (first) font.set(first.toLowerCase(), t.name);
  }

  probe.remove();
  return { color, spacing, type, radius, font };
}

/* ---- matching ---- */

const TRANSPARENT = /rgba\(0, 0, 0, 0\)|transparent/;

const near = (map: Map<number, string>, v: number) => {
  for (const [k, name] of map) if (Math.abs(k - v) <= 0.6) return name;
  return null;
};

export function read(el: Element, t: Tables): Readout {
  const cs = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const mode = el.closest("[data-mode]")?.getAttribute("data-mode") ?? "—";

  /* name the color from the element's own mode; if it only matches
     some other mode, say so rather than claiming the wrong token */
  const colorOf = (raw: string): Match => {
    const own = t.color.get(mode)?.get(raw);
    if (own) return { token: own, value: raw };
    for (const [m, table] of t.color) {
      const hit = table.get(raw);
      if (hit) return { token: `${hit} · ${m} mode`, value: raw };
    }
    return { token: null, value: raw };
  };

  const spacingOf = (raw: string): Match => {
    const v = parseFloat(raw);
    if (!Number.isFinite(v)) return { token: null, value: raw };
    if (v === 0) return { token: "0", value: "0" };
    return { token: near(t.spacing, v), value: `${Math.round(v * 100) / 100}px` };
  };

  const fontSize = parseFloat(cs.fontSize);
  const typeHit = (() => {
    for (const [k, meta] of t.type) if (Math.abs(k - fontSize) <= 0.6) return meta;
    return null;
  })();

  const family = cs.fontFamily.split(",")[0].replace(/['"]/g, "").trim().toLowerCase();
  const bg = cs.backgroundColor;

  return {
    tag:
      el.tagName.toLowerCase() +
      (el.getAttribute("data-mode") ? `[data-mode="${el.getAttribute("data-mode")}"]` : ""),
    mode,
    size: `${Math.round(rect.width)} × ${Math.round(rect.height)}`,
    color: colorOf(cs.color),
    background: TRANSPARENT.test(bg)
      ? { token: "—", value: "transparent" }
      : colorOf(bg),
    font: { token: t.font.get(family) ?? null, value: cs.fontFamily.split(",")[0] },
    type: {
      token: typeHit?.name ?? null,
      value: `${Math.round(fontSize * 100) / 100}px`,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
    },
    padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(
      spacingOf,
    ),
    gap: cs.display.includes("flex") || cs.display.includes("grid")
      ? [cs.rowGap, cs.columnGap].filter((g) => g && g !== "normal").map(spacingOf)
      : [],
    radius: (() => {
      const v = parseFloat(cs.borderTopLeftRadius);
      if (!Number.isFinite(v) || v === 0) return { token: "—", value: "0" };
      return { token: near(t.radius, v), value: `${v}px` };
    })(),
  };
}

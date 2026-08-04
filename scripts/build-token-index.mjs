/**
 * Builds design/tokens.index.json — the single machine-readable
 * inventory of the design system, consumed by:
 *
 *   - the Studio's "Design tokens" panel (Figma variables-panel view)
 *   - the site's token inspector overlay (reverse value → token lookup)
 *
 * Sources:
 *   1. design/figma-tokens/<Mode>.tokens.json — the Figma variable
 *      collection, one export per mode (colors, aliases resolved)
 *   2. src/app/globals.css — the tokens the site actually consumes:
 *      the semantic color vars per data-mode block, the spacing
 *      scale, the fluid type scale, radii, and font families
 *
 * "Last updated" per source is the last commit that touched the file
 * (falling back to its mtime), so the panel can show when the tokens
 * were last re-exported from Figma.
 *
 * Run: npm run tokens
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FIGMA_DIR = path.join(ROOT, "design/figma-tokens");
const GLOBALS = path.join(ROOT, "src/app/globals.css");
/* full inventory (Studio panel) + the slim site half (inspector) */
const OUT = path.join(ROOT, "src/design/tokens.index.json");
const OUT_SITE = path.join(ROOT, "src/design/tokens.site.json");

/* ---------- helpers ---------- */

function lastUpdated(file) {
  try {
    const iso = execFileSync(
      "git",
      ["log", "-1", "--format=%cI", "--", path.relative(ROOT, file)],
      { cwd: ROOT, encoding: "utf8" },
    ).trim();
    if (iso) return iso;
  } catch {
    /* not a git checkout / never committed — fall through */
  }
  return new Date(statSync(file).mtimeMs).toISOString();
}

const clamp255 = (n) => Math.max(0, Math.min(255, Math.round(n * 255)));
const hex2 = (n) => clamp255(n).toString(16).padStart(2, "0");

/* Figma exports colors as {colorSpace, components:[r,g,b], alpha} */
function colorToCss(value) {
  if (!value || !Array.isArray(value.components)) return null;
  const [r, g, b] = value.components;
  const a = value.alpha ?? 1;
  if (a >= 1) return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  const round = (n) => Math.round(n * 1000) / 1000;
  return `rgba(${clamp255(r)}, ${clamp255(g)}, ${clamp255(b)}, ${round(a)})`;
}

/* Aliases arrive as the string "{Group.Sub.token-name}" */
const aliasTarget = (value) =>
  typeof value === "string" && value.startsWith("{") && value.endsWith("}")
    ? value.slice(1, -1).replace(/\./g, "/")
    : null;

/* ---------- 1. the Figma variable collection ---------- */

function flattenTokens(node, trail, sink) {
  if (!node || typeof node !== "object") return;
  const value = node.$value ?? node.value;
  const type = node.$type ?? node.type;
  if (value !== undefined && typeof type === "string") {
    sink.set(trail.join("/"), { type, value });
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith("$")) continue;
    flattenTokens(v, [...trail, k], sink);
  }
}

function readFigmaModes() {
  const files = readdirSync(FIGMA_DIR)
    .filter((f) => f.endsWith(".tokens.json") && !f.includes(".resolved."))
    .sort();

  const modes = [];
  /* path → { type, group, values: { [mode]: css }, alias: {…} } */
  const tokens = new Map();

  for (const file of files) {
    const mode = path.basename(file, ".tokens.json").replace(/_/g, " ");
    modes.push({ name: mode, file, updatedAt: lastUpdated(path.join(FIGMA_DIR, file)) });

    const raw = JSON.parse(readFileSync(path.join(FIGMA_DIR, file), "utf8"));
    const flat = new Map();
    flattenTokens(raw, [], flat);

    /* resolve aliases within the mode (chains included) */
    const resolve = (tokenPath, depth = 0) => {
      const entry = flat.get(tokenPath);
      if (!entry || depth > 8) return null;
      const target = aliasTarget(entry.value);
      if (target) return resolve(target, depth + 1);
      return entry.type === "color" ? colorToCss(entry.value) : entry.value;
    };

    for (const [tokenPath, entry] of flat) {
      let token = tokens.get(tokenPath);
      if (!token) {
        token = {
          path: tokenPath,
          group: tokenPath.split("/").slice(0, -1).join("/"),
          name: tokenPath.split("/").pop(),
          type: entry.type,
          values: {},
          aliasOf: {},
        };
        tokens.set(tokenPath, token);
      }
      const target = aliasTarget(entry.value);
      if (target) token.aliasOf[mode] = target;
      const resolved = resolve(tokenPath);
      if (resolved !== null && resolved !== undefined) token.values[mode] = resolved;
    }
  }

  return { modes, figmaTokens: [...tokens.values()] };
}

/* ---------- 2. the CSS the site actually consumes ---------- */

/* strip comments so declarations parse cleanly */
const decomment = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

function blockBody(css, selector) {
  const at = css.indexOf(selector);
  if (at === -1) return "";
  const open = css.indexOf("{", at);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return "";
}

function declarations(body) {
  const out = new Map();
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out.set(m[1], m[2].trim().replace(/\s+/g, " "));
  }
  return out;
}

/* the four section color modes, in the order globals.css defines them */
const CSS_MODES = [
  { mode: "light", selector: '[data-mode="light"]' },
  { mode: "light-mid", selector: '[data-mode="light-mid"]' },
  { mode: "dark-mid", selector: '[data-mode="dark-mid"]' },
  { mode: "dark", selector: '[data-mode="dark"]' },
];

function readCssTokens() {
  const css = decomment(readFileSync(GLOBALS, "utf8"));

  /* semantic color vars: one row per var, one column per section mode */
  const semantic = new Map();
  for (const { mode, selector } of CSS_MODES) {
    for (const [name, value] of declarations(blockBody(css, selector))) {
      let row = semantic.get(name);
      if (!row) {
        row = { path: name, name, type: "color", values: {}, aliasOf: {} };
        semantic.set(name, row);
      }
      row.values[mode] = value;
    }
  }

  /* the @theme block: spacing / type / radius / fonts */
  const theme = declarations(blockBody(css, "@theme"));
  const scale = (prefix, type) =>
    [...theme]
      .filter(([n]) => n.startsWith(prefix) && !n.includes("--line-height") && !n.includes("--letter-spacing"))
      .map(([name, value]) => {
        const token = {
          path: name,
          name: name.slice(prefix.length),
          type,
          value,
          utility: null,
          detail: {},
        };
        if (type === "fontSize") {
          const lh = theme.get(`${name}--line-height`);
          const ls = theme.get(`${name}--letter-spacing`);
          if (lh) token.detail.lineHeight = lh;
          if (ls) token.detail.letterSpacing = ls;
          token.utility = `text-${token.name}`;
        } else if (type === "spacing") {
          token.utility = `p-${token.name} · gap-${token.name} · m-${token.name}`;
        } else if (type === "radius") {
          token.utility = `rounded-${token.name}`;
        } else if (type === "font") {
          token.utility = `font-${token.name}`;
        }
        return token;
      });

  return {
    semantic: [...semantic.values()].map((row) => ({
      ...row,
      utility: `bg-${row.name.slice(2)} · text-${row.name.slice(2)} · border-${row.name.slice(2)}`,
    })),
    spacing: scale("--spacing-", "spacing"),
    type: scale("--text-", "fontSize"),
    radius: scale("--radius-", "radius"),
    fonts: scale("--font-", "font"),
    updatedAt: lastUpdated(GLOBALS),
  };
}

/* ---------- build ---------- */

const { modes, figmaTokens } = readFigmaModes();
const css = readCssTokens();

const index = {
  generatedAt: new Date().toISOString(),
  sources: {
    figma: {
      dir: "design/figma-tokens",
      modes,
      /* the newest export across the modes = last re-upload */
      updatedAt: modes.map((m) => m.updatedAt).sort().pop() ?? null,
    },
    css: { file: "src/app/globals.css", updatedAt: css.updatedAt },
  },
  /* what the site consumes — the authoritative build vocabulary */
  css: {
    modes: CSS_MODES.map((m) => m.mode),
    semantic: css.semantic,
    spacing: css.spacing,
    type: css.type,
    radius: css.radius,
    fonts: css.fonts,
  },
  /* the raw Figma collection, for provenance and lookup */
  figma: { modes: modes.map((m) => m.name), tokens: figmaTokens },
};

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(index, null, 2)}\n`);

/* the inspector only needs what the site consumes — keep the Figma
   collection out of the browser bundle */
writeFileSync(
  OUT_SITE,
  `${JSON.stringify({ generatedAt: index.generatedAt, ...index.css }, null, 2)}\n`,
);

console.log(
  `✓ ${path.relative(ROOT, OUT)} — ${figmaTokens.length} Figma variables across ${modes.length} modes; ` +
    `${css.semantic.length} semantic colors, ${css.spacing.length} spacing steps, ${css.type.length} type styles`,
);

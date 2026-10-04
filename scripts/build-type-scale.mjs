#!/usr/bin/env node
/*
  Type scale generator — design/type-scale.json → the @generated block
  in src/app/globals.css.

  Each style has three anchors, the Figma Typography collection's
  Mobile (428), Tablet (1024) and Desktop (1440) values, so designers
  keep working in the three modes they already have. The CSS
  interpolates linearly between the anchors (two segments), then keeps
  growing above the desktop frame at `aboveDesktop.rate` × the
  viewport's growth until `aboveDesktop.until`, where the root
  font-size zoom (html { font-size: max(100%, .83333vw) }) takes over
  and scales type and layout together. Below the mobile frame the
  scale holds the mobile value.

  Every token is ONE declaration — a clamp() over nested min()/max()
  of the linear segments — so there are no breakpoint jumps and the
  token inspector keeps a single value to match. The nesting is
  chosen by evaluating every candidate against the target curve at
  sampled widths; the shortest one that matches everywhere is emitted.

  Run: npm run type   (then npm run tokens, and commit both outputs)
*/
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CFG = JSON.parse(readFileSync(path.join(ROOT, "design/type-scale.json"), "utf8"));
const CSS = path.join(ROOT, "src/app/globals.css");
const START = "  /* @generated:type-scale — do not edit by hand; edit design/type-scale.json and run `npm run type` */";
const END = "  /* @end:type-scale */";

const { mobile: M, tablet: T, desktop: D } = CFG.anchors;
const RATE = CFG.aboveDesktop?.rate ?? 0;
const UNTIL = CFG.aboveDesktop?.until ?? D;

const rem = (px) => `${Math.round((px / 16) * 10000) / 10000}rem`;
const vw = (slope) => `${Math.round(slope * 100 * 10000) / 10000}vw`;

/* a segment through (x0,y0)-(x1,y1): y = a0 + a1·x (px, px) */
const seg = (x0, y0, x1, y1) => {
  const a1 = x1 === x0 ? 0 : (y1 - y0) / (x1 - x0);
  return { a0: y0 - a1 * x0, a1 };
};
const evalSeg = (s, x) => s.a0 + s.a1 * x;
const flat = (s) => Math.abs(s.a1) < 1e-9;
const cssSeg = (s) => (flat(s) ? rem(s.a0) : `${rem(s.a0)} + ${vw(s.a1)}`);
const wrap = (s) => (flat(s) ? rem(s.a0) : `calc(${cssSeg(s)})`);

/* the target piecewise-linear curve */
const target = (pts) => (x) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return pts[pts.length - 1][1];
};

/* candidate nestings of the segments, shortest first */
function candidates(segs) {
  const [A, B, C] = segs;
  const fns = [];
  const add = (expr, f) => fns.push({ expr, f });
  for (const s of segs) add(wrap(s), (x) => evalSeg(s, x));
  for (const [p, q] of [[A, B], [B, C], [A, C]]) {
    add(`max(${cssSeg(p)}, ${cssSeg(q)})`, (x) => Math.max(evalSeg(p, x), evalSeg(q, x)));
    add(`min(${cssSeg(p)}, ${cssSeg(q)})`, (x) => Math.min(evalSeg(p, x), evalSeg(q, x)));
  }
  add(`max(${cssSeg(A)}, ${cssSeg(B)}, ${cssSeg(C)})`, (x) => Math.max(evalSeg(A, x), evalSeg(B, x), evalSeg(C, x)));
  add(`min(${cssSeg(A)}, ${cssSeg(B)}, ${cssSeg(C)})`, (x) => Math.min(evalSeg(A, x), evalSeg(B, x), evalSeg(C, x)));
  add(`max(min(${cssSeg(A)}, ${cssSeg(B)}), ${cssSeg(C)})`, (x) => Math.max(Math.min(evalSeg(A, x), evalSeg(B, x)), evalSeg(C, x)));
  add(`min(max(${cssSeg(A)}, ${cssSeg(B)}), ${cssSeg(C)})`, (x) => Math.min(Math.max(evalSeg(A, x), evalSeg(B, x)), evalSeg(C, x)));
  add(`max(${cssSeg(A)}, min(${cssSeg(B)}, ${cssSeg(C)}))`, (x) => Math.max(evalSeg(A, x), Math.min(evalSeg(B, x), evalSeg(C, x))));
  add(`min(${cssSeg(A)}, max(${cssSeg(B)}, ${cssSeg(C)}))`, (x) => Math.min(evalSeg(A, x), Math.max(evalSeg(B, x), evalSeg(C, x))));
  return fns.sort((a, b) => a.expr.length - b.expr.length);
}

const lines = [];
const table = [];
for (const [name, s] of Object.entries(CFG.styles)) {
  const m = s.mobile, t = s.tablet, d = s.desktop;
  const cap = s.scaleAbove === false ? d : d * (1 + (RATE * (UNTIL - D)) / D);
  const f = target([[M, m], [T, t], [D, d], [UNTIL, cap]]);
  const lo = Math.min(m, t, d, cap);
  const hi = Math.max(m, t, d, cap);
  let decl;
  if (hi - lo < 1e-9) {
    decl = rem(d);
  } else {
    const segs = [seg(M, m, T, t), seg(T, t, D, d), seg(D, d, UNTIL, cap)];
    const xs = [];
    for (let x = 320; x <= 2600; x += 4) xs.push(x);
    const ok = (g) => xs.every((x) => Math.abs(Math.min(hi, Math.max(lo, g(x))) - f(x)) < 0.02);
    const pick = candidates(segs).find((c) => ok(c.f));
    if (!pick) throw new Error(`no clamp expression reproduces ${name} (${m}/${t}/${d}/${cap})`);
    decl = `clamp(${rem(lo)}, ${pick.expr}, ${rem(hi)})`;
  }
  const note = s.figma ? `Figma ${s.figma}` : "code-only";
  lines.push(`  /* ${name} — ${m} → ${t} → ${d}${cap !== d ? ` → ${Math.round(cap * 10) / 10} @${UNTIL}` : ""} · ${note}${s._note ? ` · ${s._note}` : ""} */`);
  lines.push(`  --text-${name}: ${decl};`);
  lines.push(`  --text-${name}--line-height: ${s.lineHeight};`);
  if (s.tracking) lines.push(`  --text-${name}--letter-spacing: ${s.tracking}em;`);
  table.push([name, m, t, d, Math.round(cap * 10) / 10, s.family]);
}

const header = [
  START,
  "  /*",
  "    Fluid type scale — generated from design/type-scale.json (the",
  "    Figma Typography collection's Mobile / Tablet / Desktop values).",
  `    Anchors: ${M}px → ${T}px → ${D}px, then × ${RATE} of the viewport's`,
  `    growth to ${UNTIL}px, where the root font-size zoom takes over. One`,
  "    clamp() per token (nested min/max of the linear segments): no",
  "    breakpoint jumps. Line-heights are unitless and tracking is em so",
  "    both ride along with the size. Values are rem so user zoom works.",
  "  */",
];
const block = [...header, ...lines, END].join("\n");

let css = readFileSync(CSS, "utf8");
const i = css.indexOf(START);
const j = css.indexOf(END);
if (i < 0 || j < 0) throw new Error("globals.css is missing the @generated:type-scale markers");
css = css.slice(0, i) + block + css.slice(j + END.length);
writeFileSync(CSS, css);

console.log(`✓ src/app/globals.css type scale — ${table.length} styles · anchors ${M}/${T}/${D} · ×${RATE} to ${UNTIL}`);
for (const [n, m, t, d, c, fam] of table) console.log(`  ${n.padEnd(12)} ${String(m).padStart(3)} → ${String(t).padStart(3)} → ${String(d).padStart(3)} → ${String(c).padStart(5)}  ${fam}`);

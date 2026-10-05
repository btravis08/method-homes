#!/usr/bin/env node
/*
  Encode a render-turntable.py output folder to web frames.

    node scripts/model/encode-frames.mjs <frames-dir> <out-dir> [--quality 55] [--width 1440]

  Every PNG becomes an AVIF (alpha kept — the frames sit on the page
  surface), plus a WebP fallback for browsers without AVIF, plus a
  small blurred poster (poster.avif/webp) of the first orbit frame.
  The manifest is copied with byte sizes added so the viewer can
  budget what it preloads.
*/
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const [, , inDir, outDir, ...rest] = process.argv;
if (!inDir || !outDir) {
  console.error("usage: encode-frames.mjs <frames-dir> <out-dir> [--quality 55] [--width 1440]");
  process.exit(1);
}
const opt = (name, def) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? Number(rest[i + 1]) : def;
};
const quality = opt("quality", 55);
const width = opt("width", 1440);

mkdirSync(outDir, { recursive: true });
const manifestPath = path.join(inDir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const pngs = readdirSync(inDir).filter((f) => f.endsWith(".png")).sort();

const sizes = {};
let total = 0;
for (const f of pngs) {
  const id = f.replace(/\.png$/, "");
  const img = sharp(path.join(inDir, f)).resize({ width, withoutEnlargement: true });
  const avif = await img.clone().avif({ quality, effort: 6, chromaSubsampling: "4:2:0" }).toBuffer();
  const webp = await img.clone().webp({ quality: Math.min(92, quality + 22), alphaQuality: 80, effort: 5 }).toBuffer();
  writeFileSync(path.join(outDir, `${id}.avif`), avif);
  writeFileSync(path.join(outDir, `${id}.webp`), webp);
  sizes[id] = { avif: avif.length, webp: webp.length };
  total += avif.length;
}

/* poster: first orbit frame, small and soft, for the instant paint */
const first = manifest.orbit?.[0] ?? pngs[0]?.replace(/\.png$/, "");
if (first) {
  const p = sharp(path.join(inDir, `${first}.png`)).resize({ width: 48 }).blur(1.2);
  writeFileSync(path.join(outDir, "poster.avif"), await p.clone().avif({ quality: 40 }).toBuffer());
  writeFileSync(path.join(outDir, "poster.webp"), await p.clone().webp({ quality: 60 }).toBuffer());
}

const out = { ...manifest, encodedWidth: width, quality, sizes, totalAvifBytes: total };
writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(out, null, 2) + "\n");
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
console.log(`✓ ${pngs.length} frames → ${outDir} · AVIF total ${mb(total)} · avg ${(total / Math.max(1, pngs.length) / 1024).toFixed(0)} KB/frame · poster ${statSync(path.join(outDir, "poster.avif")).size} B`);

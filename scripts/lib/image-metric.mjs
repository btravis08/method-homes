/**
 * The layout-similarity metric shared by the section audit and the
 * design-drift check — one definition of "matches the design".
 *
 * Both images reduce to normalized 96px gradient maps (where the
 * edges are, not what pixels contain), box-blurred so 1-cell edges
 * become bands (a browser render and a Figma export never align at
 * the pixel level even on a matching layout), then compared by
 * cosine similarity. Calibrated on real pairs: a verified match
 * scores ~95, a wrong-layout pairing ~22.
 */
import { createRequire } from "node:module";

const sharp = createRequire(import.meta.url)("sharp");

const GRID = 96;
const EDGE_TOLERANCE = 2;

export async function gradientMap(input) {
  const raw = await sharp(input)
    .resize(GRID, GRID, { fit: "fill" })
    .greyscale()
    .normalise()
    /* soften texture so photographic grain doesn't read as edges */
    .blur(0.6)
    .raw()
    .toBuffer();
  let grad = new Float32Array(GRID * GRID);
  for (let y = 0; y < GRID - 1; y++) {
    for (let x = 0; x < GRID - 1; x++) {
      const i = y * GRID + x;
      grad[i] = Math.abs(raw[i] - raw[i + 1]) + Math.abs(raw[i] - raw[i + GRID]);
    }
  }
  for (let t = 0; t < EDGE_TOLERANCE; t++) {
    const next = new Float32Array(GRID * GRID);
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        let sum = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const yy = y + dy;
            const xx = x + dx;
            if (yy >= 0 && yy < GRID && xx >= 0 && xx < GRID) {
              sum += grad[yy * GRID + xx];
              n++;
            }
          }
        }
        next[y * GRID + x] = sum / n;
      }
    }
    grad = next;
  }
  return grad;
}

export function cosineScore(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return +(((dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)) * 100).toFixed(1));
}

export async function layoutScore(imageA, imageB) {
  const [a, b] = await Promise.all([gradientMap(imageA), gradientMap(imageB)]);
  return cosineScore(a, b);
}

/* the registry is TSX — read the fields the checkers need without
   compiling it; sliced per entry so fields can't bleed between
   sections */
import { readFileSync } from "node:fs";

export function readRegistry(registryPath) {
  const src = readFileSync(registryPath, "utf8");
  const marks = [...src.matchAll(/^    slug: "([^"]+)",$/gm)];
  return marks.map((mark, i) => {
    const body = src.slice(mark.index, marks[i + 1]?.index ?? src.length);
    const modes = (body.match(/modes: \[([^\]]*)\]/)?.[1] ?? "")
      .split(",")
      .map((s) => s.trim().replace(/"/g, ""))
      .filter(Boolean);
    const comps = {};
    for (const c of body.matchAll(
      /(desktop|tablet|mobile): \{ width: (\d+), height: (\d+) \}/g,
    )) {
      comps[c[1]] = { width: Number(c[2]), height: Number(c[3]) };
    }
    return {
      slug: mark[1],
      modes,
      comps,
      figmaNodeId: body.match(/figmaNodeId: "([^"]+)"/)?.[1] ?? null,
      timed: /timed: true/.test(body),
    };
  });
}

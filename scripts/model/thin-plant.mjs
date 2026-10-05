#!/usr/bin/env node
/*
  THIN A PLANT for real time: the foliage-LOD trick.

  Scanned trees carry hundreds of thousands of leaf triangles, and
  geometric simplification can't reduce leaf cards (each card is already
  two triangles; collapsing them just deletes leaves unevenly). So:

  - leaves: split the leaf primitive into its connected islands (cards /
    sprigs), KEEP a seeded random fraction, and grow each kept island
    about its own centre to win back most of the canopy's coverage;
  - bark (every other primitive): meshoptimizer simplification to a
    triangle ratio;
  - textures: WebP, resized to a max edge;
  - meshopt geometry compression on write.

  Usage:
    node scripts/model/thin-plant.mjs in.glb out.glb [--keep 0.18] [--bark 0.25] [--tex 512] [--leaves <material substring>]

  Needs (install --no-save): @gltf-transform/core @gltf-transform/extensions
  @gltf-transform/functions meshoptimizer sharp
*/
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { compactPrimitive, dequantize, meshopt, prune, simplifyPrimitive, textureCompress } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const args = process.argv.slice(2);
const [input, output] = args.filter((a, i) => !a.startsWith("--") && !(args[i - 1] ?? "").startsWith("--"));
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const KEEP = Number(opt("keep", 0.18));
const BARK = Number(opt("bark", 0.25));
const TEX = Number(opt("tex", 512));
const LEAVES = String(opt("leaves", "leaves")).toLowerCase();
if (!input || !output) {
  console.error("usage: thin-plant.mjs in.glb out.glb [--keep 0.18] [--bark 0.25] [--tex 512] [--leaves leaves]");
  process.exit(2);
}

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(input);
await doc.transform(dequantize());

/* seeded PRNG so the same inputs always give the same tree */
let seed = 0x2f6e2b1;
const rand = () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function thinLeaves(prim) {
  const pos = prim.getAttribute("POSITION");
  const idx = prim.getIndices();
  const n = pos.getCount();
  const ia = idx.getArray();
  /* union-find over vertices joined by triangles = islands */
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (a) => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]];
    return a;
  };
  for (let t = 0; t < ia.length; t += 3) {
    const a = find(ia[t]);
    for (const v of [ia[t + 1], ia[t + 2]]) {
      const b = find(v);
      if (b !== a) parent[b] = a;
    }
  }
  const keepIsland = new Map();
  const tris = [];
  for (let t = 0; t < ia.length; t += 3) {
    const r = find(ia[t]);
    if (!keepIsland.has(r)) keepIsland.set(r, rand() < KEEP);
    if (keepIsland.get(r)) tris.push(ia[t], ia[t + 1], ia[t + 2]);
  }
  /* grow kept islands about their centroids: coverage goes as area, so
     1/sqrt(keep) would restore it all; ~0.7 of that keeps them leafy */
  const grow = Math.pow(1 / KEEP, 0.5 * 0.7);
  const sum = new Map();
  const v = [0, 0, 0];
  const used = new Uint8Array(n);
  for (const i of tris) used[i] = 1;
  for (let i = 0; i < n; i++) {
    if (!used[i]) continue;
    const r = find(i);
    pos.getElement(i, v);
    const s = sum.get(r) ?? [0, 0, 0, 0];
    s[0] += v[0];
    s[1] += v[1];
    s[2] += v[2];
    s[3] += 1;
    sum.set(r, s);
  }
  for (let i = 0; i < n; i++) {
    if (!used[i]) continue;
    const s = sum.get(find(i));
    pos.getElement(i, v);
    const c = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
    pos.setElement(i, [c[0] + (v[0] - c[0]) * grow, c[1] + (v[1] - c[1]) * grow, c[2] + (v[2] - c[2]) * grow]);
  }
  const Arr = n > 65535 ? Uint32Array : Uint16Array;
  idx.setArray(new Arr(tris));
  /* drop the vertices only the discarded islands used */
  compactPrimitive(prim);
  const kept = [...keepIsland.values()].filter(Boolean).length;
  console.log(`  leaves: ${keepIsland.size} islands → kept ${kept}; ${ia.length / 3} → ${tris.length / 3} tris (grow ×${grow.toFixed(2)})`);
}

for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const name = (prim.getMaterial()?.getName() ?? "").toLowerCase();
    const before = prim.getIndices().getCount() / 3;
    if (name.includes(LEAVES)) {
      thinLeaves(prim);
    } else if (BARK < 1) {
      simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: BARK, error: Number(opt("bark-error", 0.05)) });
      console.log(`  ${name}: ${before} → ${prim.getIndices().getCount() / 3} tris`);
    }
  }
}

await doc.transform(
  prune(),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [TEX, TEX] }),
  meshopt({ encoder: MeshoptEncoder, level: "high" }),
);
await io.write(output, doc);
console.log(`wrote ${output}`);

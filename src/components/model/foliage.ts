import * as THREE from "three";

/*
  PAINTERLY FOLIAGE — procedural, no assets.

  The stylised-foliage technique: each bush or tree canopy is a cloud of
  small leaf CARDS carrying a painted-dab texture, and every card's
  normals point away from the clump's centre, so the clump is lit as one
  soft volume (light side, shade side, a brushy edge) instead of as
  hundreds of flat leaves. Colour varies per card across a muted green
  palette and darkens toward the clump's base (a cheap occlusion), which
  is what reads as "painted".

  Everything is one merged geometry per material (two draw calls for the
  leaves, one for the trunks), seeded, so the same model always gets the
  same planting. Placement is generic until a real site plan exists:
  shrubs strung along the long elevations just outside the walls, a few
  low clumps at the corners, and two trees off the short ends.

  Fading: the leaves DISSOLVE (alphaTest rises) as the view goes to plan,
  and the trunks fade — the drawing never carries planting.

  This is now the instant FALLBACK: it draws on the first frame, and the
  real scanned plants (plants.ts) replace it at the same spots once their
  GLBs arrive. If they never arrive (offline, error) this stays.
*/

export interface FoliageHandle {
  group: THREE.Group;
  leaves: THREE.MeshStandardMaterial;
  trunks: THREE.MeshStandardMaterial;
  setFade(e: number): void;
  dispose(): void;
}

interface Footprint {
  width_m: number;
  depth_m: number;
  height_m: number;
}

/* small seeded PRNG (mulberry32) so the planting is stable per model */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* the painted dab: a few soft overlapping leaf strokes, white (vertex
   colour tints it), drawn once on a canvas */
function leafTexture(): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const r = rng(11);
  for (let i = 0; i < 9; i++) {
    const x = size * (0.28 + r() * 0.44);
    const y = size * (0.28 + r() * 0.44);
    const len = size * (0.16 + r() * 0.14);
    g.save();
    g.translate(x, y);
    g.rotate(r() * Math.PI * 2);
    g.scale(1, 0.48 + r() * 0.2);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, len);
    const tone = 205 + Math.round(r() * 50);
    grad.addColorStop(0, `rgba(${tone},${tone},${tone},1)`);
    grad.addColorStop(0.72, `rgba(${tone},${tone},${tone},0.95)`);
    grad.addColorStop(1, `rgba(${tone},${tone},${tone},0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, len, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* muted, slightly warm greens — the Samara / PNW planting register */
const GREENS = ["#4c6638", "#5b7542", "#68834a", "#3d5530", "#788f52", "#869a5c", "#55703f"];

interface Clump {
  c: THREE.Vector3; // centre
  r: THREE.Vector3; // radii (x, y, z)
  cards: number;
  card: number; // card size, m
}

/* how a card is skinned: which part of the texture it shows (u0, v0,
   u1, v1 rects, one picked per card), its height/width ratio, and
   whether vertex colour TINTS a white dab (painterly) or only SHADES a
   photographic texture that already carries its colour */
interface Skin {
  rects: number[][];
  aspect: number;
  tint: boolean;
  /* photo skins: a colour the species' cards are multiplied by */
  color?: [number, number, number];
  /* cards per clump at a 0.7 m radius (scaled by the clump's footprint),
     card size in m, and height relative to the plan's size */
  cards?: number;
  card?: number;
  rise?: number;
}
const DAB: Skin = { rects: [[0, 0, 1, 1]], aspect: 1, tint: true };

function addClump(clump: Clump, rand: () => number, pos: number[], nrm: number[], col: number[], uv: number[], idx: number[], skin: Skin = DAB) {
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const corner = new THREE.Vector3();
  const p = new THREE.Vector3();
  const base = new THREE.Color();
  for (let k = 0; k < clump.cards; k++) {
    /* a point inside the ellipsoid, biased toward the surface so the
       silhouette is full and the inside isn't wasted */
    const u = rand() * 2 - 1;
    const th = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const rr = 0.55 + 0.45 * Math.cbrt(rand());
    p.set(s * Math.cos(th) * clump.r.x * rr, u * clump.r.y * rr, s * Math.sin(th) * clump.r.z * rr).add(clump.c);
    e.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    q.setFromEuler(e);
    const size = clump.card * (0.75 + rand() * 0.5);
    /* height within the clump: 0 at the base, 1 at the top */
    const h = THREE.MathUtils.clamp((p.y - (clump.c.y - clump.r.y)) / (2 * clump.r.y), 0, 1);
    if (skin.tint) base.set(GREENS[Math.floor(rand() * GREENS.length)]);
    else {
      const [cr, cg, cb] = skin.color ?? [1, 1, 1];
      base.setRGB(cr * (0.92 + rand() * 0.16), cg * (0.92 + rand() * 0.16), cb * (0.9 + rand() * 0.12));
    }
    const shade = 0.55 + 0.45 * h; // darker toward the base
    const [u0, v0, u1, v1] = skin.rects[Math.floor(rand() * skin.rects.length)];
    const vi = pos.length / 3;
    for (const [cx, cy, tu, tv] of [
      [-0.5, -0.5, u0, v1],
      [0.5, -0.5, u1, v1],
      [0.5, 0.5, u1, v0],
      [-0.5, 0.5, u0, v0],
    ]) {
      corner.set(cx * size, cy * size * skin.aspect, 0).applyQuaternion(q).add(p);
      pos.push(corner.x, corner.y, corner.z);
      /* the volumetric trick: normals from the clump centre (with a lift
         toward the sky so tops catch light) */
      const n = corner.clone().sub(clump.c).divide(clump.r).normalize();
      n.y += 0.35;
      n.normalize();
      nrm.push(n.x, n.y, n.z);
      col.push(base.r * shade, base.g * shade, base.b * shade);
      uv.push(tu, tv);
    }
    idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
  }
}

/* THE PLANTING PLAN: where every plant goes, shared by the procedural
   cards below, the real plants (plants.ts) and the lawn (lawn.ts), so
   swapping one for another never moves the garden. `size` is the plant's
   height; `species` picks the shrub's look (plants.ts SPECIES). */
export interface Plant {
  kind: "shrub" | "tree";
  x: number;
  z: number;
  size: number;
  /* plan footprint radii (x, z) */
  rx: number;
  rz: number;
  yaw: number;
  species: number;
}

/* an exterior door, found in the model (doors.ts): centre on the wall
   line, width along the wall, outward unit normal */
export interface Door {
  x: number;
  z: number;
  w: number;
  nx: number;
  nz: number;
}

/* how many shrub looks the plan deals between (plants.ts SPECIES) */
export const SPECIES = 4;

/* the clear approach in front of a door: wider than the door, running
   out from the wall indefinitely — no shrub, no grass */
export const DOOR_CLEAR = 0.9; // m beyond each jamb
export function doorClear(doors: Door[], x: number, z: number, r = 0): boolean {
  return doors.some((d) => {
    const dx = x - d.x;
    const dz = z - d.z;
    const out = dx * d.nx + dz * d.nz;
    const along = Math.abs(-dx * d.nz + dz * d.nx);
    return out > -0.6 - r && along < d.w / 2 + DOOR_CLEAR + r;
  });
}

/*
  PLANTING RULES (Bryce, 2026-10-05):
  - shrubs grow in CLUSTERS (drifts of 3–5), never as a row along the
    walls: one round each tree's base, two at corners of the home, one
    drift partway along a long side;
  - every cluster mixes species: a dominant look (its biggest plant and
    most of the rest) plus an accent, and neighbouring clusters lead
    with different species, so no two drifts read as copies;
  - sizes step down from a big anchor plant to smaller ones in front;
  - nothing in front of an exterior door (doorClear); the lawn leaves
    the same strip bare, so each door gets a clear approach.
*/
export function plantingPlan(fp: Footprint, seed = 7, doors: Door[] = []): Plant[] {
  const rand = rng(seed);
  const hw = fp.width_m / 2;
  const hd = fp.depth_m / 2;
  const out: Plant[] = [];
  /* two trees off the short ends */
  const trees: Plant[] = [];
  for (const sx of [-1, 1]) {
    const x = sx * (hw + 3.2 + rand() * 1.5);
    const z = (rand() - 0.5) * fp.depth_m * 0.8;
    const size = 4.5 + rand() * 1.5;
    trees.push({ kind: "tree", x, z, size, rx: 2, rz: 2, yaw: rand() * Math.PI * 2, species: 0 });
  }
  out.push(...trees);

  const overlaps = (x: number, z: number, r: number) =>
    out.some((p) => Math.hypot(p.x - x, p.z - z) < (p.kind === "tree" ? 0.9 : p.rx * 0.8) + r * 0.8);
  const onHouse = (x: number, z: number, r: number) => Math.abs(x) < hw + r * 0.5 && Math.abs(z) < hd + r * 0.5;

  /* species order shuffled per seed; each new cluster leads with the
     next one, so neighbours differ */
  const order = Array.from({ length: SPECIES }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  let lead = 0;
  const cluster = (cx: number, cz: number, n: number, ring?: number) => {
    const dom = order[lead % SPECIES];
    const accent = order[(lead + 1 + Math.floor(rand() * (SPECIES - 1))) % SPECIES];
    lead++;
    const a0 = rand() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const anchor = i === 0 && ring === undefined;
      const size = anchor ? 1.15 + rand() * 0.45 : 0.55 + rand() * 0.5;
      const r = size * (0.55 + rand() * 0.2);
      let placed = false;
      for (let t = 0; t < 6 && !placed; t++) {
        let x: number;
        let z: number;
        if (ring !== undefined) {
          /* round a tree's base, spread over most of the circle */
          const a = a0 + (i / n) * Math.PI * 2 * (0.75 + rand() * 0.2) + t * 0.5;
          const d = ring * (0.85 + rand() * 0.4);
          x = cx + Math.cos(a) * d;
          z = cz + Math.sin(a) * d;
        } else if (anchor && t === 0) {
          x = cx;
          z = cz;
        } else {
          const a = rand() * Math.PI * 2;
          const d = 0.9 + rand() * 1.3 + t * 0.2;
          x = cx + Math.cos(a) * d;
          z = cz + Math.sin(a) * d;
        }
        if (onHouse(x, z, r) || doorClear(doors, x, z, r) || overlaps(x, z, r)) continue;
        const species = i === 0 || rand() < 0.6 ? dom : accent;
        out.push({ kind: "shrub", x, z, size, rx: r, rz: r * (0.8 + rand() * 0.2), yaw: rand() * Math.PI * 2, species });
        placed = true;
      }
    }
  };

  /* round each tree's base */
  for (const t of trees) cluster(t.x, t.z, 3, 1.7);
  /* two corners of the home on a DIAGONAL (one on each long side, so
     both elevations get a drift), skipping any beside a door */
  const sx0 = rand() < 0.5 ? -1 : 1;
  const sz0 = rand() < 0.5 ? -1 : 1;
  const diagonals = [
    [
      [sx0, sz0],
      [-sx0, -sz0],
    ],
    [
      [-sx0, sz0],
      [sx0, -sz0],
    ],
  ];
  const free = ([sx, sz]: number[]) => !doorClear(doors, sx * (hw + 1.2), sz * (hd + 1.2), 2);
  const pick = diagonals.find((d) => d.every(free)) ?? diagonals.flat().filter(free).slice(0, 2);
  for (const [sx, sz] of pick) cluster(sx * (hw + 1.2), sz * (hd + 1.2), rand() < 0.5 ? 3 : 5);
  /* one drift partway along a long side, clear of doors */
  const side = rand() < 0.5 ? -1 : 1;
  for (let t = 0; t < 8; t++) {
    const x = (rand() * 2 - 1) * (hw - 3);
    const z = side * (hd + 1.3);
    if (doorClear(doors, x, z, 2.2)) continue;
    cluster(x, z, 3);
    break;
  }
  return out;
}

/* PHOTO CLUMPS: volumetric clumps for the plan's shrubs, skinned with
   a real leaf atlas instead of painted dabs (plants.ts gives each
   species its atlas, colour, density and habit). Returns one geometry;
   the caller supplies the material. */
export function buildClumpGeometry(plan: Plant[], skin: Skin, seed = 7): THREE.BufferGeometry {
  const rand = rng(seed + 2);
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const p of plan) {
    if (p.kind !== "shrub") continue;
    const h = (p.size / 2) * (skin.rise ?? 1);
    const cards = Math.round(THREE.MathUtils.clamp((skin.cards ?? 80) * ((p.rx * p.rz) / 0.49), 24, 220));
    addClump({ c: new THREE.Vector3(p.x, h, p.z), r: new THREE.Vector3(p.rx, h, p.rz), cards, card: skin.card ?? 0.7 }, rand, pos, nrm, col, uv, idx, skin);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}
export type { Skin };

export function buildFoliage(plan: Plant[], seed = 7): FoliageHandle {
  const rand = rng(seed + 1);
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const trunks: THREE.BufferGeometry[] = [];

  for (const p of plan) {
    if (p.kind === "shrub") {
      const h = p.size / 2;
      const cards = Math.round(THREE.MathUtils.clamp(100 * ((p.rx * p.rz) / 0.49), 30, 220));
      addClump({ c: new THREE.Vector3(p.x, h, p.z), r: new THREE.Vector3(p.rx, h, p.rz), cards, card: 0.5 }, rand, pos, nrm, col, uv, idx);
      continue;
    }
    /* a tree: a trunk and a canopy of several clumps */
    const tx = p.x;
    const tz = p.z;
    const height = p.size;
    const trunk = new THREE.CylinderGeometry(0.15, 0.24, height * 0.5, 8, 1);
    trunk.translate(tx, height * 0.25, tz);
    trunks.push(trunk);
    const crown = new THREE.Vector3(tx, height * 0.62, tz);
    for (let k = 0; k < 7; k++) {
      const o = new THREE.Vector3((rand() - 0.5) * 1.8, (rand() - 0.35) * 1.5, (rand() - 0.5) * 1.8);
      const r = 1.15 + rand() * 0.55;
      addClump(
        { c: crown.clone().add(o), r: new THREE.Vector3(r, r * 0.85, r), cards: 170, card: 0.78 },
        rand, pos, nrm, col, uv, idx,
      );
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();

  const leaves = new THREE.MeshStandardMaterial({
    map: leafTexture(),
    vertexColors: true,
    alphaTest: 0.42,
    /* with the composer's MSAA, alpha-to-coverage gives the dab edges
       soft, unjagged silhouettes instead of a hard alpha cut */
    alphaToCoverage: true,
    side: THREE.DoubleSide,
    roughness: 0.92,
    metalness: 0,
  });
  const leafMesh = new THREE.Mesh(geo, leaves);
  leafMesh.name = "foliage_leaves";

  const trunkMat = new THREE.MeshStandardMaterial({ color: "#4a4038", roughness: 0.95, transparent: true });
  const group = new THREE.Group();
  group.name = "foliage";
  group.add(leafMesh);
  if (trunks.length) {
    let merged = trunks[0];
    if (trunks.length > 1) {
      /* tiny merge without importing BufferGeometryUtils */
      const p: number[] = [];
      const n: number[] = [];
      const ix: number[] = [];
      for (const t of trunks) {
        const g = t.index ? t.toNonIndexed() : t;
        const off = p.length / 3;
        p.push(...(g.getAttribute("position").array as Float32Array));
        n.push(...(g.getAttribute("normal").array as Float32Array));
        for (let i = 0; i < g.getAttribute("position").count; i++) ix.push(off + i);
      }
      merged = new THREE.BufferGeometry();
      merged.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
      merged.setAttribute("normal", new THREE.Float32BufferAttribute(n, 3));
      merged.setIndex(ix);
    }
    const trunkMesh = new THREE.Mesh(merged, trunkMat);
    trunkMesh.name = "foliage_trunks";
    group.add(trunkMesh);
  }

  return {
    group,
    leaves,
    trunks: trunkMat,
    setFade(e: number) {
      /* leaves dissolve over the first half of the flight to plan */
      const k = Math.min(1, e * 2);
      leaves.alphaTest = 0.42 + 0.58 * k;
      trunkMat.opacity = 1 - k;
      group.visible = k < 0.999;
    },
    dispose() {
      geo.dispose();
      leaves.map?.dispose();
      leaves.dispose();
      trunkMat.dispose();
      group.traverse((o) => {
        if (o instanceof THREE.Mesh && o.name === "foliage_trunks") o.geometry.dispose();
      });
    },
  };
}

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

function addClump(clump: Clump, rand: () => number, pos: number[], nrm: number[], col: number[], uv: number[], idx: number[]) {
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
    base.set(GREENS[Math.floor(rand() * GREENS.length)]);
    const shade = 0.55 + 0.45 * h; // darker toward the base
    const vi = pos.length / 3;
    for (const [cx, cy, tu, tv] of [
      [-0.5, -0.5, 0, 0],
      [0.5, -0.5, 1, 0],
      [0.5, 0.5, 1, 1],
      [-0.5, 0.5, 0, 1],
    ]) {
      corner.set(cx * size, cy * size, 0).applyQuaternion(q).add(p);
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

export function buildFoliage(fp: Footprint, seed = 7): FoliageHandle {
  const rand = rng(seed);
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const trunks: THREE.BufferGeometry[] = [];

  const hw = fp.width_m / 2;
  const hd = fp.depth_m / 2;

  /* shrubs along both long elevations, just outside the walls */
  for (const side of [-1, 1]) {
    let x = -hw + 0.6 + rand() * 1.2;
    while (x < hw - 0.6) {
      const r = 0.45 + rand() * 0.45;
      const h = 0.35 + rand() * 0.35;
      addClump(
        { c: new THREE.Vector3(x, h, side * (hd + 0.45 + rand() * 0.5)), r: new THREE.Vector3(r, h, r * (0.7 + rand() * 0.3)), cards: 90, card: 0.5 },
        rand, pos, nrm, col, uv, idx,
      );
      x += 1.2 + rand() * 2.6;
    }
  }
  /* low clumps at the corners */
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const r = 0.7 + rand() * 0.4;
      addClump(
        { c: new THREE.Vector3(sx * (hw + 0.6), r * 0.7, sz * (hd + 0.6)), r: new THREE.Vector3(r, r * 0.7, r), cards: 130, card: 0.56 },
        rand, pos, nrm, col, uv, idx,
      );
    }
  /* two trees off the short ends: a trunk and a canopy of several clumps */
  for (const sx of [-1, 1]) {
    const tx = sx * (hw + 3.2 + rand() * 1.5);
    const tz = (rand() - 0.5) * fp.depth_m * 0.8;
    const height = 4.5 + rand() * 1.5;
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

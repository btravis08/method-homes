import * as THREE from "three";
import type { Plant } from "./foliage";

/*
  ORGANIC LAWN — procedural, no assets, and STABLE IN MOTION.

  One scalar COVERAGE FIELD decides the shape: positive where there is
  grass, crossing zero at the lawn's edge. It is the union (max) of
    - a rounded rectangle (superellipse) a few metres out from the walls,
    - a soft disc under each tree, so the lawn reaches out and wraps them,
  plus low-frequency noise, so the edge undulates — bays and
  promontories, never a clean curve.

  The lawn is ONE textured ground plane, nothing else:
    - a macro texture bakes colour (soft grey-greens, a little drier at
      the fringe), a CONTACT DARKENING along the foot of the walls (the
      home's grounding, baked here so nothing is re-rendered as it turns),
      and alpha (coverage, fading over ~25 cm — a soft edge, not a cut);
    - a tiled detail texture adds the grain of turf.
  Both are mipmapped and blended (no alpha test), so as the model spins
  every pixel is a filtered average — nothing sub-pixel to shimmer. The
  earlier version (instanced grass tufts, a hash-frayed alpha-to-coverage
  edge, a per-frame contact shadow) shimmered and smeared on the spin
  (Bryce, 2026-10-05: "terribly fake").

  The lawn rides the model group (turns with the home), lives on the
  plant layer, and FADES with the planting on the flight to plan — the
  drawing stays ink.
*/

export interface LawnHandle {
  group: THREE.Group;
  setFade(e: number): void;
  dispose(): void;
}

interface Footprint {
  width_m: number;
  depth_m: number;
}

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

/* 2D value noise + fBm, seeded through a permutation table */
function noise2(seed: number) {
  const r = rng(seed);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const val = new Float32Array(256).map(() => r() * 2 - 1);
  const at = (x: number, y: number) => val[perm[(perm[x & 255] + y) & 255]];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const n = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const u = smooth(x - xi);
    const v = smooth(y - yi);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return (x: number, y: number) => n(x, y) * 0.6 + n(x * 2.07 + 17, y * 2.07 + 5) * 0.28 + n(x * 4.3 + 41, y * 4.3 + 23) * 0.12;
}

/* how far the lawn reaches past the walls, and how wide a tree's skirt is */
const MARGIN = 3.4;
const TREE_SKIRT = 2.8;
const BRIDGE = 2.2; // half-width (m) of the neck joining a tree's lawn to the home's
const EDGE_WOBBLE = 0.32; // coverage units of edge noise
/* coverage over which alpha fades 0 → 1. The field changes ~0.12 per m at
   the edge, so 0.03 ≈ 25 cm: soft, but not a pale glow over the ground */
const EDGE_SOFT: [number, number] = [-0.01, 0.02];
const CONTACT = { depth: 0.38, reach: 0.55 }; // wall-foot darkening: strength, falloff (m)
/* m per repeat of the turf grain. At the viewer's distance a screen
   pixel is ~2 cm of lawn, so the grain's features must be 5–20 cm or
   mipmapping averages them to flat grey (a 1.6 m tile of 1 cm strokes
   vanished entirely) */
const DETAIL_TILE = 6;

/* the turf grain: short strokes of lighter and darker blades on a mid
   grey, tiled. Grey-centred so it modulates the colour without shifting
   it; strokes near an edge are drawn again on the far side (seamless). */
function detailTexture(seed: number): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgb(128,128,128)";
  g.fillRect(0, 0, size, size);
  const r = rng(seed);
  /* drawn 9× (wrapped) so the tile is seamless */
  const blot = (x: number, y: number, draw: (x: number, y: number) => void) => {
    for (const ox of [0, -size, size]) for (const oy of [0, -size, size]) draw(x + ox, y + oy);
  };
  /* clumps: soft blotches 5–20 cm across, lighter and darker */
  for (let i = 0; i < 900; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = 2 + r() * 6;
    const v = Math.round(r() < 0.5 ? 70 + r() * 30 : 160 + r() * 40);
    blot(x, y, (px, py) => {
      const grd = g.createRadialGradient(px, py, 0, px, py, rad);
      grd.addColorStop(0, `rgba(${v},${v + 6},${v},0.5)`);
      grd.addColorStop(1, `rgba(${v},${v + 6},${v},0)`);
      g.fillStyle = grd;
      g.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    });
  }
  /* tufts: short strokes ~3 × 10 cm */
  for (let i = 0; i < 2200; i++) {
    const x = r() * size;
    const y = r() * size;
    const v = Math.round(r() < 0.5 ? 78 + r() * 26 : 150 + r() * 34);
    const a = r() * Math.PI;
    g.fillStyle = `rgba(${v},${v + 4},${v},0.6)`;
    blot(x, y, (px, py) => {
      g.save();
      g.translate(px, py);
      g.rotate(a);
      g.fillRect(-0.7, -2.2, 1.4, 4.4);
      g.restore();
    });
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.NoColorSpace; // a multiplier, not a colour
  return tex;
}

export function buildLawn(fp: Footprint, plan: Plant[], walls: THREE.Box3 | null, seed = 7): LawnHandle {
  const hw = fp.width_m / 2;
  const hd = fp.depth_m / 2;
  const trees = plan.filter((p) => p.kind === "tree");
  const nEdge = noise2(seed + 11);
  const nTone = noise2(seed + 23);

  /* the coverage field: > 0 is lawn */
  const ax = hw + MARGIN;
  const az = hd + MARGIN;
  /* each tree's lawn is joined to the home's by a broad BRIDGE (a
     capsule from the trunk to the nearest point of the walls), and all
     the pieces meet through a SMOOTH union, so a tree's grass flows
     into the main lawn with a waisted neck — never a separate circle
     (Bryce, 2026-10-05) */
  const bridges = trees.map((t) => ({
    ax: t.x,
    az: t.z,
    bx: THREE.MathUtils.clamp(t.x, -hw, hw),
    bz: THREE.MathUtils.clamp(t.z, -hd, hd),
  }));
  const capsule = (x: number, z: number, b: (typeof bridges)[number]) => {
    const vx = b.bx - b.ax;
    const vz = b.bz - b.az;
    const len2 = vx * vx + vz * vz || 1;
    const k = THREE.MathUtils.clamp(((x - b.ax) * vx + (z - b.az) * vz) / len2, 0, 1);
    return Math.hypot(x - (b.ax + vx * k), z - (b.az + vz * k));
  };
  const smax = (a: number, b: number, k: number) => {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.max(a, b) + h * h * k * 0.25;
  };
  const field = (x: number, z: number) => {
    const se = Math.pow(Math.pow(Math.abs(x) / ax, 4) + Math.pow(Math.abs(z) / az, 4), 0.25);
    let c = (1 - se) * 1.6;
    trees.forEach((t, i) => {
      const disc = (1 - Math.hypot(x - t.x, z - t.z) / TREE_SKIRT) * 1.2;
      const neck = (1 - capsule(x, z, bridges[i]) / BRIDGE) * 1.1;
      c = smax(c, smax(disc, neck, 0.5), 0.6);
    });
    return c + nEdge(x * 0.22, z * 0.22) * EDGE_WOBBLE;
  };

  /* distance (m) outside the wall box, for the contact darkening */
  const wb = walls ?? new THREE.Box3(new THREE.Vector3(-hw, 0, -hd), new THREE.Vector3(hw, 1, hd));
  const outside = (x: number, z: number) => {
    const dx = Math.max(wb.min.x - x, 0, x - wb.max.x);
    const dz = Math.max(wb.min.z - z, 0, z - wb.max.z);
    return Math.hypot(dx, dz);
  };

  /* extent: everything the field could reach, with room for the wobble */
  let ex = ax + 1.5;
  let ez = az + 1.5;
  for (const t of trees) {
    ex = Math.max(ex, Math.abs(t.x) + TREE_SKIRT + 1.5);
    ez = Math.max(ez, Math.abs(t.z) + TREE_SKIRT + 1.5);
  }

  /* the macro texture: colour × contact darkening, alpha = coverage */
  const res = 512;
  const data = new Uint8Array(res * res * 4);
  /* soft grey-greens (Bryce: "less green"), close in value so the lawn
     reads as a calm ground plane */
  /* a shade darker, with more spread between patches (Bryce: the first
     grey-green pass was too even) */
  const deep = new THREE.Color("#3f4c35");
  const mid = new THREE.Color("#4e5c41");
  const light = new THREE.Color("#63724f");
  const c = new THREE.Color();
  const srgb = { r: 0, g: 0, b: 0 };
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const x = ((i + 0.5) / res - 0.5) * 2 * ex;
      /* row 0 is v = 0, which the rotated plane puts at +z */
      const z = (0.5 - (j + 0.5) / res) * 2 * ez;
      const f = field(x, z);
      const t = THREE.MathUtils.clamp(0.5 + nTone(x * 0.35, z * 0.35) * 1.15 + nTone(x * 1.6 + 9, z * 1.6) * 0.5, 0, 1);
      c.copy(deep).lerp(mid, Math.min(1, t * 1.6));
      if (t > 0.62) c.lerp(light, (t - 0.62) / 0.38);
      /* (no paler fringe: over the light ground it read as a glow) */
      /* grounding: darker right at the foot of the walls, gone by ~1 m */
      c.multiplyScalar(1 - CONTACT.depth * Math.exp(-outside(x, z) / CONTACT.reach));
      const k = (j * res + i) * 4;
      c.getRGB(srgb, THREE.SRGBColorSpace);
      data[k] = Math.round(srgb.r * 255);
      data[k + 1] = Math.round(srgb.g * 255);
      data[k + 2] = Math.round(srgb.b * 255);
      data[k + 3] = Math.round(THREE.MathUtils.smoothstep(f, EDGE_SOFT[0], EDGE_SOFT[1]) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  const detail = detailTexture(seed + 5);

  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 1,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    envMapIntensity: 0.5,
  });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uDetail = { value: detail };
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vLawnXZ;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvLawnXZ = transformed.xz;");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D uDetail;\nvarying vec2 vLawnXZ;")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        /* turf grain, tiled in the lawn's own space (it turns with the
           home), filtered so it stays steady in motion */
        diffuseColor.rgb *= 0.4 + 1.2 * texture2D(uDetail, vLawnXZ / ${DETAIL_TILE.toFixed(2)}).g;`,
      );
  };
  mat.customProgramCacheKey = () => "lawn";
  /* a ground plane drawn first among the blended layers; everything
     standing on it is opaque or alpha-tested and depth-tests over it */
  const geo = new THREE.PlaneGeometry(2 * ex, 2 * ez);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "lawn";
  mesh.position.y = 0.002;
  mesh.renderOrder = -1;

  const group = new THREE.Group();
  group.name = "lawn";
  group.add(mesh);

  return {
    group,
    setFade(e: number) {
      /* gone over the first half of the flight, like the planting */
      const k = Math.min(1, e * 2);
      mat.opacity = 1 - k;
      group.visible = k < 0.999;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      tex.dispose();
      detail.dispose();
      group.removeFromParent();
    },
  };
}

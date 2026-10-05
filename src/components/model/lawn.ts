import * as THREE from "three";
import { DOOR_CLEAR, type Door, type Plant } from "./foliage";

/*
  ORGANIC LAWN — procedural, no assets.

  One scalar COVERAGE FIELD decides everything: positive where there is
  grass, growing toward the home, crossing zero at the lawn's edge.
  It is the union (max) of
    - a rounded rectangle (superellipse) a few metres out from the walls,
    - a soft disc under each tree, so the lawn reaches out and wraps them,
  with low-frequency noise added, so the edge undulates — bays and
  promontories, never a clean curve.

  Two layers read that field:
    1. the LAWN MAT, a ground plane whose colour (mottled greens, drying
       toward the edge) and alpha (coverage) are baked into one small
       texture; the shader adds a world-space grain to the alpha and cuts
       it with alpha-to-coverage, so the edge frays into clumps instead
       of fading like a gradient;
    2. GRASS TUFTS, one instanced mesh of five-blade tufts scattered with
       probability rising with coverage: dense by the walls, thinning
       outward, with a few strays past the edge.

  The lawn rides the model group (turns with the home), lives on the
  plant layer (out of the contact shadow, which ignores alpha), and
  DISSOLVES with the planting going to plan — the drawing stays ink.
*/

export interface LawnHandle {
  group: THREE.Group;
  tufts: number;
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
const MARGIN = 4.4;
const TREE_SKIRT = 3.4;
const EDGE_WOBBLE = 0.32; // coverage units of edge noise
const TUFTS = 20000;

export function buildLawn(fp: Footprint, plan: Plant[], doors: Door[] = [], seed = 7): LawnHandle {
  const hw = fp.width_m / 2;
  const hd = fp.depth_m / 2;
  const trees = plan.filter((p) => p.kind === "tree");
  const nEdge = noise2(seed + 11);
  const nTone = noise2(seed + 23);

  /* the coverage field: > 0 is lawn, larger is thicker */
  const ax = hw + MARGIN;
  const az = hd + MARGIN;
  const field = (x: number, z: number) => {
    const se = Math.pow(Math.pow(Math.abs(x) / ax, 4) + Math.pow(Math.abs(z) / az, 4), 0.25);
    let c = (1 - se) * 1.6;
    for (const t of trees) {
      const d = Math.hypot(x - t.x, z - t.z) / TREE_SKIRT;
      c = Math.max(c, (1 - d) * 1.2);
    }
    c += nEdge(x * 0.22, z * 0.22) * EDGE_WOBBLE;
    /* a bare approach to every exterior door: the strip in front of it
       (as wide as the planting keeps clear) carries no grass, its sides
       slightly ragged like a worn path */
    for (const d of doors) {
      const dx = x - d.x;
      const dz = z - d.z;
      const out = dx * d.nx + dz * d.nz;
      if (out < -0.6) continue;
      const along = Math.abs(-dx * d.nz + dz * d.nx);
      const half = d.w / 2 + DOOR_CLEAR * 0.6 + nEdge(out * 0.9 + 31, d.x * 0.3) * 0.12;
      c = Math.min(c, (along - half) * 2.5);
    }
    return c;
  };

  /* extent: everything the field could reach, with room for the wobble */
  let ex = ax + 1.5;
  let ez = az + 1.5;
  for (const t of trees) {
    ex = Math.max(ex, Math.abs(t.x) + TREE_SKIRT + 1.5);
    ez = Math.max(ez, Math.abs(t.z) + TREE_SKIRT + 1.5);
  }

  /* 1. the lawn mat: colour + coverage baked into a small texture */
  const res = 256;
  const data = new Uint8Array(res * res * 4);
  /* muted, slightly cool lawn greens (the sun is strong: these read
     brighter lit than they look here) and a straw fringe */
  const deep = new THREE.Color("#3a5426");
  const mid = new THREE.Color("#4c6832");
  const light = new THREE.Color("#5f7a3e");
  const dry = new THREE.Color("#5f6038");
  const c = new THREE.Color();
  const srgb = { r: 0, g: 0, b: 0 };
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const x = ((i + 0.5) / res - 0.5) * 2 * ex;
      /* row 0 is v = 0, which the rotated plane puts at +z */
      const z = (0.5 - (j + 0.5) / res) * 2 * ez;
      const f = field(x, z);
      /* mottling: broad patches + finer clumps */
      const t = THREE.MathUtils.clamp(0.5 + nTone(x * 0.35, z * 0.35) * 0.9 + nTone(x * 1.6 + 9, z * 1.6) * 0.35, 0, 1);
      c.copy(deep).lerp(mid, Math.min(1, t * 1.6));
      if (t > 0.62) c.lerp(light, (t - 0.62) / 0.38);
      /* the fringe dries and yellows a little */
      c.lerp(dry, THREE.MathUtils.clamp(1 - f / 0.35, 0, 1) * 0.35);
      const k = (j * res + i) * 4;
      c.getRGB(srgb, THREE.SRGBColorSpace);
      data[k] = Math.round(srgb.r * 255);
      data[k + 1] = Math.round(srgb.g * 255);
      data[k + 2] = Math.round(srgb.b * 255);
      /* alpha 0.5 = the edge; ramps over ~0.25 coverage either side */
      data[k + 3] = Math.round(THREE.MathUtils.clamp(0.5 + f * 2, 0, 1) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
  /* baked as sRGB bytes, tagged so the shader decodes them */
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;

  const fade = { value: 0 };
  const matMat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 1,
    metalness: 0,
    alphaTest: 0.5,
    alphaToCoverage: true,
    envMapIntensity: 0.5,
  });
  matMat.onBeforeCompile = (s) => {
    s.uniforms.uDissolve = fade;
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLawnW;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvLawnW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uDissolve;
        varying vec3 vLawnW;
        float lawnHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`,
      )
      .replace(
        "#include <alphatest_fragment>",
        `/* fray the edge: an 8 cm grain jitters the coverage around the
            cut, so the boundary breaks into clumps of turf, not a smooth
            line (a finer grain went sub-pixel and shimmered on the spin) */
        float g = lawnHash(floor(vLawnW.xz * 12.0)) - 0.5;
        diffuseColor.a = clamp((diffuseColor.a + g * 0.42 - alphaTest) / max(fwidth(diffuseColor.a), 1e-3) * 0.5 + 0.5, 0.0, 1.0);
        if (lawnHash(floor(vLawnW.xz * 9.0) + 3.1) < uDissolve) discard;
        if (diffuseColor.a <= 0.0) discard;`,
      );
  };
  matMat.customProgramCacheKey = () => "lawn-mat";
  const matGeo = new THREE.PlaneGeometry(2 * ex, 2 * ez);
  matGeo.rotateX(-Math.PI / 2);
  const mat = new THREE.Mesh(matGeo, matMat);
  mat.name = "lawn_mat";
  mat.position.y = 0.002;

  /* 2. tufts: five tapered blades fanned around a centre, one triangle
     each; normals point up so a tuft lights like the turf under it */
  const blades = 5;
  const tp: number[] = [];
  const tc: number[] = [];
  const tr = rng(seed + 31);
  const base = new THREE.Color("#2f4420");
  const tip = new THREE.Color("#6a8443");
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + tr() * 0.8;
    const w = 0.018;
    const h = 0.75 + tr() * 0.5;
    const lean = 0.25 + tr() * 0.35;
    const ox = Math.cos(a) * 0.02;
    const oz = Math.sin(a) * 0.02;
    const px = -Math.sin(a) * w;
    const pz = Math.cos(a) * w;
    /* tip leans outward a few cm (absolute, not scaled with the tuft) */
    tp.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz, ox + Math.cos(a) * lean * 0.12, h, oz + Math.sin(a) * lean * 0.12);
    tc.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const tuftGeo = new THREE.BufferGeometry();
  tuftGeo.setAttribute("position", new THREE.Float32BufferAttribute(tp, 3));
  const tn: number[] = [];
  for (let i = 0; i < tp.length / 3; i++) tn.push(0, 1, 0);
  tuftGeo.setAttribute("normal", new THREE.Float32BufferAttribute(tn, 3));
  tuftGeo.setAttribute("color", new THREE.Float32BufferAttribute(tc, 3));

  const tuftMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.5 });
  tuftMat.onBeforeCompile = (s) => {
    s.uniforms.uDissolve = fade;
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTuftW;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vec4 tw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          tw = instanceMatrix * tw;
        #endif
        vTuftW = (modelMatrix * tw).xyz;`,
      );
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uDissolve;\nvarying vec3 vTuftW;")
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
        if (fract(sin(dot(floor(vTuftW.xz * 9.0) + 3.1, vec2(12.9898, 78.233))) * 43758.5453) < uDissolve) discard;`,
      );
  };
  tuftMat.customProgramCacheKey = () => "lawn-tuft";

  /* scatter: probability rises with coverage (thick by the walls, thin
     at the fringe), a few strays past the edge, none under the home */
  const pr = rng(seed + 47);
  const mats: THREE.Matrix4[] = [];
  const cols: number[] = [];
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const sv = new THREE.Vector3();
  const tv = new THREE.Vector3();
  const tint = new THREE.Color();
  let tries = 0;
  while (mats.length < TUFTS && tries < TUFTS * 8) {
    tries++;
    const x = (pr() * 2 - 1) * ex;
    const z = (pr() * 2 - 1) * ez;
    if (Math.abs(x) < hw - 0.05 && Math.abs(z) < hd - 0.05) continue;
    const f = field(x, z);
    const p = f > 0 ? 0.12 + 0.88 * THREE.MathUtils.smoothstep(f, 0, 0.6) : f > -0.12 ? 0.05 : 0;
    if (pr() > p) continue;
    q.setFromAxisAngle(up, pr() * Math.PI * 2);
    /* taller toward the fringe (the mown part is near the house) */
    const h = 0.09 + pr() * 0.07 + THREE.MathUtils.clamp(0.4 - f, 0, 0.4) * 0.18;
    sv.set(1 + pr() * 0.4, h, 1 + pr() * 0.4);
    tv.set(x, 0, z);
    mats.push(new THREE.Matrix4().compose(tv, q, sv));
    const k = 0.82 + pr() * 0.36;
    tint.setRGB(k, k * (0.96 + pr() * 0.08), k * 0.92);
    cols.push(tint.r, tint.g, tint.b);
  }
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, mats.length);
  tufts.name = "lawn_tufts";
  mats.forEach((m, i) => tufts.setMatrixAt(i, m));
  tufts.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cols), 3);
  tufts.instanceMatrix.needsUpdate = true;
  tufts.computeBoundingSphere();

  const group = new THREE.Group();
  group.name = "lawn";
  group.add(mat, tufts);

  return {
    group,
    tufts: mats.length,
    setFade(e: number) {
      const k = Math.min(1, e * 2);
      fade.value = k;
      group.visible = k < 0.999;
    },
    dispose() {
      matGeo.dispose();
      matMat.dispose();
      tex.dispose();
      tuftGeo.dispose();
      tuftMat.dispose();
      group.removeFromParent();
    },
  };
}

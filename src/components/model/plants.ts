import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { buildClumpGeometry, type Plant } from "./foliage";

/*
  REAL PLANTING — scanned CC0 plant models (Poly Haven), drawn in real time.

  The plants.yml workflow fetches each model, compresses it (meshopt
  geometry, WebP textures ≤ 1024 px) and writes public/models/plants/
  <id>.glb plus plants.json. Here every model is normalised (base on the
  ground, centred, 1 m tall) and drawn as ONE InstancedMesh per sub-mesh
  across all the spots the planting plan gives its kind — a whole garden
  is a handful of draw calls, whatever the plant count.

  Loading is deliberately late and optional: it starts after the house is
  on screen, the procedural cards (foliage.ts) hold the spots meanwhile,
  and any failure simply leaves those cards in place.

  Leaves keep their alpha-mask cut-outs with alpha-to-coverage (the
  composer's MSAA turns the mask edge into soft coverage, not stair
  steps). Going to plan, every plant DISSOLVES on a world-space noise —
  bark and leaves alike — so the drawing never carries planting.
*/

/* which scanned models play which part. Only trees are whole models:
   Poly Haven's shrubs are wild, leggy sprigs that read as weeds beside a
   house, so the shrub and corner spots are PHOTO CLUMPS instead — the
   volumetric clump technique (foliage.ts) skinned with the scanned
   tree's own frond atlas: full, garden-like masses with photographic
   leaves, in one draw call. Roles left empty fall to the clumps. */
type Role = Plant["kind"] | "ground";
const CAST: Record<Role, string[]> = {
  shrub: [],
  corner: [],
  tree: ["jacaranda_tree"],
  ground: [],
};
/* the model whose leaf material dresses the photo clumps, and the
   fronds on its atlas (u0, v0, u1, v1; v down, as glTF stores it) */
const ATLAS = {
  model: "jacaranda_tree",
  material: /leaves/i,
  rects: [
    [0.16, 0.03, 1.0, 0.46],
    [0.0, 0.33, 0.43, 0.7],
    [0.25, 0.58, 1.0, 0.98],
  ],
  aspect: 0.5,
};

export interface PlantsHandle {
  group: THREE.Group;
  triangles: number;
  setFade(e: number): void;
  dispose(): void;
}

interface Manifest {
  [id: string]: { file: string; bytes: number };
}

/* per-variant geometry + material pairs, baked into the variant's own
   space and normalised to a 1 m tall plant standing on the origin */
interface Part {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
}

function bake(mesh: THREE.Mesh, fix: THREE.Matrix4): Part[] {
  const geo = (mesh.geometry as THREE.BufferGeometry).clone();
  geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(fix, mesh.matrixWorld));
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  if (mats.length < 2 || !geo.groups.length) return [{ geo, mat: mats[0] }];
  /* multi-material meshes split by group */
  const parts = geo.groups.map((g) => {
    const sub = geo.clone();
    const idx = sub.index;
    if (idx) sub.setIndex(Array.from(idx.array as ArrayLike<number>).slice(g.start, g.start + g.count));
    sub.clearGroups();
    return { geo: sub, mat: mats[g.materialIndex ?? 0] };
  });
  geo.dispose();
  return parts;
}

/* a variant = one top-level node with everything under it (Poly Haven
   lays variants out as sibling nodes; a tree's trunk, branches and
   leaves are sub-meshes of ONE node and stay together) */
function variants(root: THREE.Object3D): Part[][] {
  root.updateMatrixWorld(true);
  const out: Part[][] = [];
  for (const node of root.children) {
    const box = new THREE.Box3().setFromObject(node);
    if (box.isEmpty()) continue;
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const k = 1 / Math.max(size.y, 1e-6);
    const fix = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-centre.x, -box.min.y, -centre.z));
    const parts: Part[] = [];
    node.traverse((o) => {
      if (o instanceof THREE.Mesh) parts.push(...bake(o, fix));
    });
    if (parts.length) out.push(parts);
  }
  return out;
}

/* seeded scatter of low cover round the shrubs (mulberry32) */
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

interface Spot {
  role: Role;
  x: number;
  z: number;
  size: number;
  yaw: number;
}

function spots(plan: Plant[]): Spot[] {
  const rand = rng(23);
  const out: Spot[] = plan.map((p) => ({ role: p.kind, x: p.x, z: p.z, size: p.size, yaw: p.yaw }));
  for (const p of plan) {
    if (p.kind === "tree" || !CAST.ground.length) continue;
    /* "outward" = away from the house: shrubs sit off the long walls (z),
       corner clumps off both */
    const ox = p.kind === "corner" ? Math.sign(p.x) : 0;
    const oz = Math.sign(p.z) || 1;
    const n = p.kind === "corner" ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const along = p.kind === "corner" ? (rand() - 0.3) * 1.6 : (rand() - 0.5) * 2.2;
      const out_ = 0.35 + rand() * 0.9;
      out.push({
        role: "ground",
        x: p.x + (ox ? ox * out_ : along),
        z: p.z + oz * (p.kind === "corner" ? (rand() - 0.3) * 1.6 : out_),
        size: 0.3 + rand() * 0.3,
        yaw: rand() * Math.PI * 2,
      });
    }
  }
  return out;
}

/* the dissolve: one shared uniform, a hash of the world-space cell each
   fragment sits in; fragments whose hash falls under the fade discard */
function dissolve(mat: THREE.Material, fade: { value: number }): THREE.Material {
  const m = mat.clone() as THREE.MeshStandardMaterial;
  const cutout = m.alphaTest > 0 || m.transparent || !!m.alphaMap;
  if (cutout) {
    /* foliage cards: a hard mask, softened by alpha-to-coverage */
    m.transparent = false;
    m.alphaTest = Math.max(m.alphaTest, 0.5);
    m.alphaToCoverage = true;
    m.side = THREE.DoubleSide;
    /* leaves are matte: the full sky reflection silvered them */
    m.envMapIntensity = 0.45;
  }
  const mapSize = (m.map?.image as { width?: number } | undefined)?.width ?? 1024;
  m.onBeforeCompile = (s) => {
    s.uniforms.uDissolve = fade;
    s.uniforms.uMapSize = { value: mapSize };
    if (cutout) {
      /* LEAF COVERAGE AT A DISTANCE. Mipmapping averages a leaf card's
         alpha toward its mean (~0.3), so at the viewer's 170 m camera a
         plain 0.5 cut-off erases the canopy. Two standard fixes:
         scale alpha up with the mip level being sampled (keeps the
         downsampled card's coverage), then sharpen it to the pixel
         footprint around the cut-off, so alpha-to-coverage gets a crisp
         but anti-aliased edge instead of a stair-stepped test. */
      s.fragmentShader = s.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uMapSize;")
        .replace(
          "#include <alphatest_fragment>",
          `#ifdef USE_MAP
            vec2 lx = dFdx(vMapUv * uMapSize);
            vec2 ly = dFdy(vMapUv * uMapSize);
            float lod = max(0.0, 0.5 * log2(max(dot(lx, lx), dot(ly, ly))));
            diffuseColor.a *= 1.0 + lod * 0.25;
          #endif
          #ifdef USE_ALPHATEST
            diffuseColor.a = clamp((diffuseColor.a - alphaTest) / max(fwidth(diffuseColor.a), 1e-4) + 0.5, 0.0, 1.0);
            if (diffuseColor.a <= 0.0) discard;
          #endif`,
        );
    }
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vDissolveW;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vec4 dW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          dW = instanceMatrix * dW;
        #endif
        vDissolveW = (modelMatrix * dW).xyz;`,
      );
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uDissolve;\nvarying vec3 vDissolveW;")
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
        if (uDissolve > 0.0) {
          float dh = fract(sin(dot(floor(vDissolveW * 9.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          if (dh < uDissolve) discard;
        }`,
      );
  };
  m.customProgramCacheKey = () => (cutout ? "plant-dissolve-cut" : "plant-dissolve");
  return m;
}

export async function loadPlants(base: string, plan: Plant[], signal?: AbortSignal): Promise<PlantsHandle | null> {
  const res = await fetch(`${base}/plants.json`, { signal });
  if (!res.ok) return null;
  const manifest = (await res.json()) as Manifest;

  /* load every model any role casts that the manifest lists */
  const ids = [...new Set([...Object.values(CAST).flat(), ATLAS.model])].filter((id) => manifest[id]);
  if (!ids.length) return null;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const models = new Map<string, Part[][]>();
  await Promise.all(
    ids.map(async (id) => {
      const gltf = await loader.loadAsync(`${base}/${manifest[id].file}`, undefined);
      models.set(id, variants(gltf.scene));
    }),
  );
  if (signal?.aborted) return null;

  /* deal the spots across every (model, variant) its role casts */
  const pools: Record<string, [string, number][]> = {};
  for (const role of Object.keys(CAST) as Role[]) {
    pools[role] = CAST[role].filter((id) => models.has(id)).flatMap((id) => models.get(id)!.map((_, v) => [id, v] as [string, number]));
  }
  const byVariant = new Map<string, Spot[]>();
  const turn: Record<string, number> = {};
  for (const sp of spots(plan)) {
    const pool = pools[sp.role];
    if (!pool?.length) continue;
    const i = turn[sp.role] ?? 0;
    turn[sp.role] = i + 1;
    const [id, v] = pool[i % pool.length];
    const key = `${id}#${v}`;
    if (!byVariant.has(key)) byVariant.set(key, []);
    byVariant.get(key)!.push(sp);
  }

  const fade = { value: 0 };
  const group = new THREE.Group();
  group.name = "plants";
  const mats = new Map<THREE.Material, THREE.Material>();
  const geos: THREE.BufferGeometry[] = [];
  let triangles = 0;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const s = new THREE.Vector3();
  const t = new THREE.Vector3();
  const allGeos = new Set<THREE.BufferGeometry>();
  for (const parts of models.values()) for (const v of parts) for (const p of v) allGeos.add(p.geo);
  for (const [key, list] of byVariant) {
    const [id, v] = key.split("#");
    for (const part of models.get(id)![Number(v)]) {
      let mat = mats.get(part.mat);
      if (!mat) {
        mat = dissolve(part.mat, fade);
        mats.set(part.mat, mat);
      }
      const im = new THREE.InstancedMesh(part.geo, mat, list.length);
      im.name = `plant_${key}`;
      list.forEach((p, i) => {
        q.setFromAxisAngle(up, p.yaw);
        s.setScalar(p.size);
        t.set(p.x, 0, p.z);
        im.setMatrixAt(i, m.compose(t, q, s));
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      const tri = (part.geo.index ? part.geo.index.count : part.geo.getAttribute("position").count) / 3;
      triangles += tri * list.length;
      group.add(im);
    }
  }
  geos.push(...allGeos);

  /* photo clumps for every shrub / corner spot no model was cast for */
  const leafSrc = models
    .get(ATLAS.model)
    ?.flat()
    .find((p) => ATLAS.material.test(p.mat.name))?.mat;
  const open = plan.filter((p) => (p.kind === "shrub" || p.kind === "corner") && !pools[p.kind]?.length);
  if (leafSrc && open.length) {
    const src = leafSrc.clone() as THREE.MeshStandardMaterial;
    src.vertexColors = true;
    const mat = dissolve(src, fade);
    src.dispose();
    const geo = buildClumpGeometry(open, { rects: ATLAS.rects, aspect: ATLAS.aspect, tint: false });
    geos.push(geo);
    mats.set(mat, mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = "plant_clumps";
    group.add(mesh);
    triangles += (geo.index?.count ?? 0) / 3;
  }
  if (!group.children.length) return null;

  return {
    group,
    triangles,
    setFade(e: number) {
      /* gone over the first half of the flight, like the cards */
      const k = Math.min(1, e * 2);
      fade.value = k;
      group.visible = k < 0.999;
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const [src, mat] of mats) {
        src.dispose();
        mat.dispose();
      }
      group.removeFromParent();
    },
  };
}

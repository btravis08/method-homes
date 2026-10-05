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

/* Only trees are whole scanned models: Poly Haven's shrubs are wild,
   leggy sprigs that read as weeds beside a house. Shrubs are PHOTO
   CLUMPS — the volumetric clump technique (foliage.ts) skinned with real
   leaf atlases — in several SPECIES so neighbouring plants differ. */
const TREES = ["jacaranda_tree"];

/* COLOUR: every look is tinted so its leaves' average (alpha-weighted,
   linear, inside its rects) matches the tree's fronds — the planting
   reads as one palette, shapes vary but no shrub out-colours the trees
   (Bryce, 2026-10-05). Re-measure if an atlas or the tree changes.

   the shrub looks, indexed by Plant.species (foliage.ts SPECIES must
   match the count). Each is a CC0 Poly Haven leaf atlas (alpha merged;
   v down, as glTF stores it) — `atlas: null` = the scanned tree's own
   fronds — with a colour, card density/size and habit (rise = height
   relative to the plan's size: upright > 1, spreading < 1). */
interface Look {
  name: string;
  atlas: string | null;
  rects: number[][];
  aspect: number;
  color: [number, number, number];
  cards: number;
  card: number;
  rise: number;
}
const LOOKS: Look[] = [
  /* feathery fronds (the jacaranda's own), airy mound */
  { name: "feather", atlas: null, rects: [[0.16, 0.03, 1.0, 0.46], [0.0, 0.33, 0.43, 0.7], [0.25, 0.58, 1.0, 0.98]], aspect: 0.5, color: [1, 1, 1], cards: 70, card: 0.75, rise: 1 },
  /* long sage-silver lance leaves (shrub_02), upright; toned down —
     full strength read white in the sun */
  { name: "willow", atlas: "atlas-willow.webp", rects: [[0.2, 0.03, 0.6, 0.97], [0.55, 0.0, 0.97, 0.88]], aspect: 2.2, color: [1.04, 1.22, 0.73], cards: 120, card: 0.5, rise: 1.35 },
  /* broad heart leaves (shrub_03), deepened from lime, low and spreading */
  { name: "heart", atlas: "atlas-heart.webp", rects: [[0.02, 0.02, 0.62, 0.52], [0.02, 0.45, 0.62, 0.95]], aspect: 0.85, color: [0.67, 0.82, 1.6], cards: 110, card: 0.55, rise: 0.7 },
  /* small rounded leaves (shrub_04), dense tidy dome */
  { name: "pittosporum", atlas: "atlas-obovate.webp", rects: [[0.0, 0.05, 0.36, 0.95], [0.3, 0.05, 0.67, 0.95]], aspect: 2.4, color: [0.69, 0.86, 0.59], cards: 150, card: 0.42, rise: 0.9 },
];
const FRONDS = /leaves/i; // the tree material that carries the fronds

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

  /* the trees, and the leaf atlases for the shrub looks */
  const ids = TREES.filter((id) => manifest[id]);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const models = new Map<string, Part[][]>();
  const texLoader = new THREE.TextureLoader();
  const atlases = new Map<string, THREE.Texture>();
  await Promise.all([
    ...ids.map(async (id) => {
      const gltf = await loader.loadAsync(`${base}/${manifest[id].file}`, undefined);
      models.set(id, variants(gltf.scene));
    }),
    ...LOOKS.filter((l) => l.atlas).map(async (l) => {
      try {
        const tex = await texLoader.loadAsync(`${base}/${l.atlas}`);
        tex.flipY = false; // rects are in glTF's v-down space
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        tex.needsUpdate = true;
        atlases.set(l.name, tex);
      } catch {
        /* a missing atlas: its plants borrow another look */
      }
    }),
  ]);
  if (signal?.aborted) return null;
  const treeSpots = plan.filter((p) => p.kind === "tree");
  const variantsOf = ids.flatMap((id) => models.get(id)!.map((_, v) => [id, v] as [string, number]));
  const byVariant = new Map<string, Plant[]>();
  treeSpots.forEach((sp, i) => {
    if (!variantsOf.length) return;
    const [id, v] = variantsOf[i % variantsOf.length];
    const key = `${id}#${v}`;
    if (!byVariant.has(key)) byVariant.set(key, []);
    byVariant.get(key)!.push(sp);
  });

  const fade = { value: 0 };
  const group = new THREE.Group();
  group.name = "plants";
  const mats = new Map<THREE.Material, THREE.Material>();
  const geos: THREE.BufferGeometry[] = [];
  const textures: THREE.Texture[] = [];
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
        /* sunk 4 cm so the base never shows a gap on a slope */
        t.set(p.x, (p.y ?? 0) - 0.04, p.z);
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

  /* photo clumps: one geometry + material per shrub look */
  const fronds = [...models.values()].flat(2).find((p) => FRONDS.test(p.mat.name))?.mat;
  const lookMat = (l: Look): THREE.Material | null => {
    if (!l.atlas) {
      if (!fronds) return null;
      const src = fronds.clone() as THREE.MeshStandardMaterial;
      src.vertexColors = true;
      const mat = dissolve(src, fade);
      src.dispose();
      return mat;
    }
    const map = atlases.get(l.name);
    if (!map) return null;
    const src = new THREE.MeshStandardMaterial({ map, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
    const mat = dissolve(src, fade);
    src.dispose();
    return mat;
  };
  const ready = LOOKS.map((l) => ({ l, mat: lookMat(l) }));
  const usable = ready.filter((r) => r.mat);
  if (usable.length) {
    const shrubs = plan.filter((p) => p.kind === "shrub");
    /* a plant whose look failed to load borrows the next usable one */
    const lookFor = (i: number) => (ready[i]?.mat ? ready[i] : usable[i % usable.length]);
    const groups = new Map<(typeof ready)[number], Plant[]>();
    for (const p of shrubs) {
      const r = lookFor(p.species);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r)!.push(p);
    }
    for (const [r, list] of groups) {
      const l = r.l;
      const geo = buildClumpGeometry(list, { rects: l.rects, aspect: l.aspect, tint: false, color: l.color, cards: l.cards, card: l.card, rise: l.rise });
      geos.push(geo);
      mats.set(r.mat!, r.mat!);
      const mesh = new THREE.Mesh(geo, r.mat!);
      mesh.name = `plant_clumps_${l.name}`;
      group.add(mesh);
      triangles += (geo.index?.count ?? 0) / 3;
    }
  }
  for (const t of atlases.values()) textures.push(t);
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
      for (const t of textures) t.dispose();
      for (const [src, mat] of mats) {
        src.dispose();
        mat.dispose();
      }
      group.removeFromParent();
    },
  };
}

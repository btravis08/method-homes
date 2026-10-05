"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type RootState } from "@react-three/fiber";
import { OrbitControls, PerformanceMonitor, useGLTF } from "@react-three/drei";
import { EffectComposer, HueSaturation, ToneMapping } from "@react-three/postprocessing";
import { buildFoliage, plantingPlan, type Door, type FoliageHandle, type Plant } from "./foliage";
import { findDoors, wallBounds } from "./doors";
import { loadPlants, type PlantsHandle } from "./plants";
import { buildLawn, type LawnHandle } from "./lawn";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";

/* the web-sized copy of the render HDRI (scripts/model/prep-env.py →
   public/models/env/{sky.hdr, env.json}); the viewer falls back to the
   procedural RoomEnvironment when it is absent */
export const DEFAULT_ENV_BASE = "/models/env";
/* folder with plants.json + the plant GLBs (plants.yml); "" = cards only */
export const DEFAULT_PLANTS_BASE = "/models/plants";
interface EnvMeta { file: string; sun?: { azimuthDeg: number; elevationDeg: number; strength?: number } }

/* direction of the HDRI's sun in three's frame (see prep-env.py) */
function sunDirection(sun: EnvMeta["sun"]): [number, number, number] {
  if (!sun) return [12, 16, 8];
  const theta = THREE.MathUtils.degToRad(sun.azimuthDeg - 180);
  const el = THREE.MathUtils.degToRad(sun.elevationDeg);
  return [Math.cos(theta) * Math.cos(el), Math.sin(el), Math.sin(theta) * Math.cos(el)];
}

/* loads env.json + the HDR, prefilters it and makes it the scene's light;
   reports the sun so the shadow light can line up with the reflections.
   (A plain function: three.js mutation stays out of component code for
   the React Compiler's immutability lint.) Returns a cleanup. */
function loadSky(base: string, gl: THREE.WebGLRenderer, root: THREE.Scene, onSun: (dir: [number, number, number]) => void) {
  let live = true;
  let env: THREE.Texture | null = null;
  (async () => {
    try {
      const res = await fetch(`${base}/env.json`);
      if (!res.ok) return;
      const meta = (await res.json()) as EnvMeta;
      if (!live) return;
      if (meta.sun) onSun(sunDirection(meta.sun));
      const hdr = await new HDRLoader().loadAsync(`${base}/${meta.file}`);
      if (!live) {
        hdr.dispose();
        return;
      }
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(gl);
      env = pmrem.fromEquirectangular(hdr).texture;
      pmrem.dispose();
      hdr.dispose();
      root.environment?.dispose();
      root.environment = env;
      /* a real sky's diffuse light is modest (mean luminance ≈ 0.7 for
         the Poly Haven partly-cloudy map) — lift it so the shaded sides
         still read, and let the directional light carry the sun */
      root.environmentIntensity = 1.3;
      root.userData.envSource = "hdri";
    } catch {
      /* keep the procedural room */
    }
  })();
  return () => {
    live = false;
    if (env && root.environment === env) {
      root.environment = null;
      env.dispose();
    }
  };
}

function SkyEnvironment({ base, onSun }: { base: string; onSun: (dir: [number, number, number]) => void }) {
  const { gl, scene: root } = useThree();
  useEffect(() => loadSky(base, gl, root, onSun), [base, gl, root, onSun]);
  return null;
}

/*
  3D plan viewer — the interactive floor plan prototype.

  Loads the pipeline's GLB (scripts/model/ifc-to-glb.py: one mesh per
  storey × category, metadata in extras) and offers two modes:

  - "3D": the home turns slowly on its vertical axis under soft light;
    drag to rotate, no zoom or pan. Auto-rotation pauses while the
    pointer is down and stops under prefers-reduced-motion.
  - "Floor plan": the camera flies to a top-down, north-up, near-
    orthographic view (narrow FOV, far camera) while a clipping plane
    descends to 1.2 m above the chosen storey — an architectural
    section cut. The palette turns to a drawing (dark walls, light
    floors, roof gone). Storey pills pick the level.

  Everything here is a progressive layer: the plan page's photo,
  drawing, dimensions and PDF stay the no-JS twin, and this chunk is
  loaded by LazyPlanViewer (ssr:false, after idle + in view) so no
  visitor pays for three.js unless the section is on screen.

  The per-frame work lives in ViewerState (a plain class the frame
  loop drives) rather than in React render scope: it mutates three.js
  objects every frame, which is exactly what the React Compiler's
  immutability rule forbids inside component code.
*/

export interface PlanViewerProps {
  src: string;
  /* degrees to rotate about the vertical axis so plan view is north-up
     (overrides the GLB's extras.northDeg) */
  northDeg?: number;
  mode?: "3d" | "plan";
  onModeChange?: (mode: "3d" | "plan") => void;
  className?: string;
  /* folder with env.json + the HDR (prep-env.py); default /models/env */
  envBase?: string;
  /* folder with plants.json + plant GLBs; default /models/plants, "" keeps
     the procedural planting only */
  plantsBase?: string;
}

type Mode = "3d" | "plan";
interface Storey { index: number; name: string; elevation_m: number; habitable?: boolean }
interface Footprint { width_m: number; depth_m: number; height_m: number }
interface Extras { northDeg?: number; storeys?: Storey[]; footprint?: Footprint }

const CUT_ABOVE_FLOOR = 1.2; // metres — the conventional plan cut height
/* a long lens far away — Samara's configurator shoots at 5°, which is why
   their home reads as a flat product render with no perspective splay.
   Distance scales with 1/tan(fov/2), so the framing stays the same. */
const FOV_3D = 8;
const FOV_PLAN = 8; // narrow + far ≈ orthographic
const ORBIT_RADIUS = 7.2; // × the model's largest dimension (was 1.6 at 35°)
const GLASS_TRANSMISSION = 0.92;
const SPEED = 0.85; // mode transition, 1/s (≈1.2 s flight)
const SPIN = 0.15; // rad/s
/* cubic in-out: the flight leaves and arrives gently, no snap */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* the two palettes, keyed by the pipeline's category names */
/* the render finish (Bryce, 2026-10-05): off-white fibre-cement panel
   siding, black standing-seam metal roof, black window mullions, dark
   doors, concrete floors. The siding and roof get procedural relief in
   the shader (see FINISH). */
const RENDER: Record<string, [string, number]> = {
  wall: ["#e9e5dd", 1], floor: ["#b9b5ad", 1], roof: ["#0e0f10", 1], glass: ["#8fb0c2", 0.45],
  door: ["#1a1918", 1], frame: ["#111111", 1], stair: ["#8e8a84", 1], rail: ["#1a1a19", 1], structure: ["#6f6c67", 1], misc: ["#a6a39d", 1],
};
/* PBR per category: [roughness, metalness] */
const SURFACE: Record<string, [number, number]> = {
  wall: [0.82, 0], floor: [0.95, 0], roof: [0.42, 0.55], glass: [0.12, 0.1],
  door: [0.5, 0.3], frame: [0.4, 0.5], stair: [0.9, 0], rail: [0.45, 0.6], structure: [0.8, 0], misc: [0.9, 0],
};

/*
  FINISH — procedural relief computed from world position, so the
  model needs no UVs or texture files:
  - siding: 4 × 8 ft fibre-cement panels (1.2192 × 2.4384 m) with a
    12 mm reveal joint, a touch of per-panel tone variation; applied
    to vertical faces only
  - roof: standing seams every 16 in (0.4064 m) running down the
    slope (derived from the face normal), a 30 mm rib with light and
    shade on its flanks and a lower roughness on the rib; roof planes
    only (fascia edges skip it)
  Both fade out with uPlan so the drawing palette stays flat.
*/
const PRELUDE = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vWorldNrm;
  uniform float uPlan;
  float gRib = 0.0;
`;
const VERTEX_WORLD = /* glsl */ `
  #include <project_vertex>
  vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vWorldNrm = normalize(mat3(modelMatrix) * objectNormal);
`;
const SIDING_COLOR = /* glsl */ `
  #include <color_fragment>
  {
    /* the true face normal (derivatives), not the smoothed vertex
       normal — otherwise seams and joints bend across a plane */
    vec3 n = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
    vec2 uv = abs(n.x) > abs(n.z) ? vec2(vWorldPos.z, vWorldPos.y) : vec2(vWorldPos.x, vWorldPos.y);
    vec2 panel = vec2(1.2192, 2.4384);
    vec2 f = fract(uv / panel);
    vec2 cell = floor(uv / panel);
    vec2 d = min(f, 1.0 - f) * panel;
    float dm = min(d.x, d.y);
    /* analytic anti-aliasing: the reveal is 12 mm wide; the edge ramp is
       at least one screen pixel wide (fwidth) and the whole line fades
       as it becomes sub-pixel, so distant joints read as a faint even
       tone instead of sparkling */
    float px = max(fwidth(dm), 1e-4);
    float w = max(0.003, px);
    float joint = 1.0 - smoothstep(0.006 - w, 0.006 + w, dm);
    float coverage = clamp(0.012 / px, 0.0, 1.0);
    float tone = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453) * 0.08 - 0.04;
    float vertical = 1.0 - step(0.85, abs(n.y));
    float k = (1.0 - uPlan) * vertical;
    diffuseColor.rgb *= 1.0 + tone * k;
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.45, joint * coverage * k);
    /* in plan, a horizontal wall face seen from its FRONT is a sill or
       a wall top — paper, not ink — so openings read as openings. The
       hollow wall bottoms the cut exposes are seen from their BACK and
       stay ink, which keeps the cut walls solid. */
    float horizontal = step(0.85, abs(n.y));
    float sill = horizontal * (gl_FrontFacing ? 1.0 : 0.0);
    /* sills fade out with the floor, so an opening is a true gap in the
       black wall fill */
    diffuseColor.a *= 1.0 - sill * uPlan;
  }
`;
const ROOF_COLOR = /* glsl */ `
  #include <color_fragment>
  {
    /* the true face normal (derivatives), not the smoothed vertex
       normal — otherwise seams and joints bend across a plane */
    vec3 n = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
    vec2 dh = n.xz;
    float l = length(dh);
    vec2 along = l > 0.03 ? dh / l : vec2(1.0, 0.0);
    vec2 across = vec2(-along.y, along.x);
    float pitch = 0.4064;
    float t = dot(vWorldPos.xz, across);
    float f = fract(t / pitch) * pitch;
    float c = pitch * 0.5;
    /* analytic anti-aliasing (see the siding): one-pixel edge ramps and a
       coverage fade so the 30 mm ribs never shimmer at a distance */
    float px = max(fwidth(f), 1e-4);
    float w = max(0.003, px);
    float rib = 1.0 - smoothstep(0.015 - w, 0.015 + w, abs(f - c));
    float coverage = clamp(0.03 / px, 0.0, 1.0);
    float flank = clamp((f - c) / max(0.015, px), -1.0, 1.0);
    float plane = step(0.25, abs(n.y));
    float k = (1.0 - uPlan) * plane * coverage;
    gRib = rib * k;
    diffuseColor.rgb *= 1.0 + rib * k * 0.9 + flank * rib * k * 0.6;
  }
`;
const ROOF_ROUGHNESS = /* glsl */ `
  #include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.6, gRib);
`;

function finish(mat: THREE.MeshStandardMaterial, cat: string) {
  if (cat !== "wall" && cat !== "roof") return;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPlan = { value: 0 };
    shader.vertexShader = PRELUDE + shader.vertexShader.replace("#include <project_vertex>", VERTEX_WORLD);
    shader.fragmentShader = PRELUDE + shader.fragmentShader
      .replace("#include <color_fragment>", cat === "wall" ? SIDING_COLOR : ROOF_COLOR)
      .replace("#include <roughnessmap_fragment>", cat === "roof" ? ROOF_ROUGHNESS : "#include <roughnessmap_fragment>");
    mat.userData.shader = shader;
  };
  mat.customProgramCacheKey = () => `finish-${cat}`;
}
const PLAN: Record<string, [string, number]> = {
  /* walls are solid black fills; the floor fades out (Bryce, 2026-10-05)
     — with the slab gone, each cut wall shows its own underside as a
     solid ink fill instead of losing a z-fight to the slab top */
  /* the plan has NO colour (Bryce, 2026-10-05): ink, greys and paper only;
     a desaturation pass at the end of the chain guarantees it */
  wall: ["#111111", 1], floor: ["#f7f7f7", 0], roof: ["#f7f7f7", 0], glass: ["#c4c4c4", 0.9],
  /* frames read as openings in the drawing (light grey), not as wall */
  door: ["#7a7a7a", 1], frame: ["#c8c8c8", 1], stair: ["#a9a9a9", 1], rail: ["#4d4d4d", 1], structure: ["#111111", 1], misc: ["#b4b4b4", 1],
};

interface Inputs { mode: Mode; storey: number; northDeg: number; reduce: boolean; spinning: boolean }

/* all mutable three.js state, driven from the frame loop */
class ViewerState {
  group: THREE.Group | null = null;
  root: THREE.Scene | null = null; // for the debug hook (window.__planViewer)
  controls: { enabled: boolean } | null = null;
  /* desaturation at the end of the chain: 0 in 3D, full grey in plan */
  sat: { saturation: number } | null = null;
  /* painterly planting around the home (foliage.ts); dissolves in plan */
  foliage: FoliageHandle | null = null;
  /* the real scanned plants (plants.ts): replace the cards once loaded */
  plants: PlantsHandle | null = null;
  /* organic lawn round the home (lawn.ts); dissolves in plan */
  lawn: LawnHandle | null = null;
  /* the planting plan (foliage.ts) and the exterior doors it keeps clear */
  doors: Door[] = [];
  plan: Plant[] = [];
  plantsBase = DEFAULT_PLANTS_BASE;
  private plantsLoading = false;
  private fade = 0;
  plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 100);
  mats: { mat: THREE.MeshStandardMaterial; cat: string; storey: number }[] = [];
  storeys: Storey[] = [{ index: 0, name: "Ground", elevation_m: 0 }];
  footprint: Footprint = { width_m: 12, depth_m: 10, height_m: 8 };
  progress = 0; // 0 = 3D, 1 = plan
  yaw = 0;
  private a = new THREE.Color();
  private b = new THREE.Color();
  private look = new THREE.Vector3();
  /* the flight is a pure function of progress between the orbit pose the
     user left and the top view: spherical path, azimuth held */
  private orbitPos = new THREE.Vector3();
  private sph = new THREE.Spherical();
  private hasOrbitPos = false;
  private flightTheta = 0;

  attach(scene: THREE.Object3D, gl: THREE.WebGLRenderer, root: THREE.Scene, initial: Mode) {
    gl.localClippingEnabled = true;
    /* the transmission pass re-renders the scene behind glass; half
       resolution is plenty for panes this small on screen */
    if ("transmissionResolutionScale" in gl) (gl as THREE.WebGLRenderer & { transmissionResolutionScale: number }).transmissionResolutionScale = 0.5;
    this.root = root;
    /* image-based light: a procedural room until (or unless) the HDRI
       copy loads — SkyEnvironment swaps in the real sky */
    if (!root.environment) {
      const pmrem = new THREE.PMREMGenerator(gl);
      root.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      root.environmentIntensity = 0.3;
      root.userData.envSource = "room";
      pmrem.dispose();
    }
    const extras = (scene.userData as Extras | undefined) ?? {};
    if (extras.storeys?.length) this.storeys = extras.storeys;
    if (extras.footprint) this.footprint = extras.footprint;
    this.plane.constant = this.footprint.height_m + 1;
    this.progress = initial === "plan" ? 1 : 0;
    this.mats = [];
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o.userData.stencil) return;
      const m = o.name.match(/^storey(\d+)_(\w+)$/);
      const cat = m ? m[2] : "misc";
      const storey = m ? Number(m[1]) : 0;
      if (!(o.material instanceof THREE.MeshStandardMaterial && o.material.userData.viewer)) {
        const [rough, metal] = SURFACE[cat] ?? SURFACE.misc;
        const common = {
          color: (RENDER[cat] ?? RENDER.misc)[0],
          roughness: rough,
          metalness: metal,
          transparent: true,
          opacity: (RENDER[cat] ?? RENDER.misc)[1],
          side: THREE.DoubleSide,
          clippingPlanes: [this.plane],
          /* architecture is planes: flat shading keeps roofs and walls
             crisp instead of smearing light across welded normals */
          flatShading: true,
        };
        /* glass is physical: real transmission (refraction through the
           pane into the interior) instead of a translucent tint — the
           same material Samara's configurator uses */
        const mat =
          cat === "glass"
            ? /* flat shading stays ON: the welded pane corners carry averaged
                 normals, and smooth normals swing the refraction into a
                 kaleidoscope across each pane */
              new THREE.MeshPhysicalMaterial({ ...common, opacity: 1, transmission: GLASS_TRANSMISSION, ior: 1.5, thickness: 0.02, roughness: 0.06, metalness: 0 })
            : new THREE.MeshStandardMaterial(common);
        finish(mat, cat);
        mat.userData.viewer = true;
        (o.material as THREE.Material).dispose?.();
        o.material = mat;
      }
      this.mats.push({ mat: o.material as THREE.MeshStandardMaterial, cat, storey });
    });
    this.buildCap(scene, root);
    /* planting rides the model group, so it turns north-up with the home */
    /* doors first: the plan and the lawn both keep their approaches clear */
    this.doors = findDoors(scene);
    this.plan = plantingPlan(this.footprint, 7, this.doors);
    if (this.group && !this.foliage) {
      this.foliage = buildFoliage(this.plan);
      plantLayer(this.foliage.group);
      this.group.add(this.foliage.group);
    }
    if (this.group && !this.lawn) {
      this.lawn = buildLawn(this.footprint, this.plan, wallBounds(scene));
      plantLayer(this.lawn.group);
      this.group.add(this.lawn.group);
    }
    this.loadRealPlants();
  }

  /* fetched after the house is up, so they never compete with it; the
     cards hold the same spots until the swap, and stay on any failure */
  private loadRealPlants() {
    const group = this.group;
    if (!group || this.plants || this.plantsLoading || !this.plantsBase) return;
    this.plantsLoading = true;
    loadPlants(this.plantsBase, this.plan)
      .then((h) => {
        if (!h) return;
        if (this.group !== group) {
          h.dispose();
          return;
        }
        this.plants = h;
        h.setFade(this.fade);
        plantLayer(h.group);
        group.add(h.group);
        if (this.foliage) {
          this.foliage.group.removeFromParent();
          this.foliage.dispose();
          this.foliage = null;
        }
      })
      .catch(() => {
        /* keep the painterly cards */
      })
      .finally(() => {
        this.plantsLoading = false;
      });
  }

  /* SECTION FILL (poché): a stencil cap. Each wall/structure solid gets two
     invisible clipped copies — back faces add 1 to the stencil, front
     faces subtract 1 — so after them the stencil is non-zero exactly where
     the cut plane lies inside a solid (overlapping solids and reversed
     winding still read non-zero). A black plane at the cut height then
     draws only there. Openings are gaps in the solid at the cut, so they
     stay open by construction — no guessing from faces or heights.
     Everything is in the transparent list (renderOrder after the model) so
     the glass transmission pass, which has no stencil buffer, never sees
     the cap. */
  cap: THREE.Mesh | null = null;
  private buildCap(scene: THREE.Object3D, root: THREE.Scene) {
    if (this.cap) {
      this.cap.removeFromParent();
      this.cap.geometry.dispose();
      (this.cap.material as THREE.Material).dispose();
      this.cap = null;
    }
    const solids: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh && /_(wall|structure)$/.test(o.name) && !o.userData.capped) solids.push(o);
    });
    const counter = (side: THREE.Side, op: THREE.StencilOp) =>
      new THREE.MeshBasicMaterial({
        side,
        transparent: true,
        colorWrite: false,
        depthWrite: false,
        depthTest: false,
        clippingPlanes: [this.plane],
        stencilWrite: true,
        stencilFunc: THREE.AlwaysStencilFunc,
        stencilFail: op,
        stencilZFail: op,
        stencilZPass: op,
      });
    const back = counter(THREE.BackSide, THREE.IncrementWrapStencilOp);
    const front = counter(THREE.FrontSide, THREE.DecrementWrapStencilOp);
    for (const s of solids) {
      s.userData.capped = true;
      for (const mat of [back, front]) {
        const m = new THREE.Mesh(s.geometry, mat);
        m.renderOrder = 10;
        m.userData.stencil = true;
        s.add(m);
      }
    }
    const span = Math.max(this.footprint.width_m, this.footprint.depth_m) * 3;
    const cap = new THREE.Mesh(
      new THREE.PlaneGeometry(span, span).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: PLAN.wall[0],
        transparent: true,
        toneMapped: false,
        stencilWrite: true,
        stencilRef: 0,
        stencilFunc: THREE.NotEqualStencilFunc,
        stencilFail: THREE.ReplaceStencilOp,
        stencilZFail: THREE.ReplaceStencilOp,
        stencilZPass: THREE.ReplaceStencilOp,
      }),
    );
    cap.renderOrder = 11;
    cap.visible = false;
    root.add(cap);
    this.cap = cap;
  }

  radius() {
    const f = this.footprint;
    return Math.max(f.width_m, f.depth_m, f.height_m) * ORBIT_RADIUS;
  }

  tick(state: RootState, dt: number, input: Inputs) {
    const target = input.mode === "plan" ? 1 : 0;
    const speed = input.reduce ? 1000 : SPEED;
    const d = target - this.progress;
    this.progress = Math.abs(d) < 0.001 ? target : this.progress + Math.sign(d) * Math.min(Math.abs(d), dt * speed);
    const e = ease(this.progress);
    const f = this.footprint;
    /* capture the orbit pose the moment a flight starts; it anchors both
       the camera path and the north-up turn */
    if (this.progress > 0.001 && !this.hasOrbitPos) {
      this.orbitPos.copy(state.camera.position);
      this.sph.setFromVector3(this.orbitPos);
      this.flightTheta = this.sph.theta;
      this.hasOrbitPos = true;
    }

    /* section cut descends from above the roof to the storey's cut height */
    const cutY = (this.storeys[input.storey]?.elevation_m ?? 0) + CUT_ABOVE_FLOOR;
    this.plane.constant = THREE.MathUtils.lerp(f.height_m + 1, cutY, e);

    /* palette: render → drawing; storeys above the chosen one fade */
    for (const { mat, cat, storey } of this.mats) {
      const [ra, oa] = RENDER[cat] ?? RENDER.misc;
      const [rb, ob] = PLAN[cat] ?? PLAN.misc;
      this.a.set(ra);
      this.b.set(rb);
      mat.color.copy(this.a).lerp(this.b, e);
      const above = input.mode === "plan" && storey > input.storey ? 0 : 1;
      if (mat instanceof THREE.MeshPhysicalMaterial) {
        /* glass: clear and refractive in 3D, a flat blue line in plan */
        mat.transmission = THREE.MathUtils.lerp(GLASS_TRANSMISSION, 0, e);
        mat.opacity = THREE.MathUtils.lerp(1, ob, e) * THREE.MathUtils.lerp(1, above, e);
      } else {
        mat.opacity = THREE.MathUtils.lerp(oa, ob, e) * THREE.MathUtils.lerp(1, above, e);
      }
      mat.visible = mat.opacity > 0.01;
      /* the drawing is matte: metal and gloss fade with the palette */
      const [rough, metal] = SURFACE[cat] ?? SURFACE.misc;
      mat.roughness = THREE.MathUtils.lerp(rough, 1, e);
      mat.metalness = THREE.MathUtils.lerp(metal, 0, e);
      /* the sky's blue cast leaves the drawing with the palette: a plan is
         flat ink on paper, not a lit model */
      mat.envMapIntensity = THREE.MathUtils.lerp(1, 0.15, e);
      const shader = mat.userData.shader as { uniforms: { uPlan: { value: number } } } | undefined;
      if (shader) shader.uniforms.uPlan.value = e;
    }

    /* yaw: spin in 3D, settle to north-up in plan */
    if (this.group) {
      /* the camera keeps its azimuth θ on the flight, so screen-up in the
         top view is −(sin θ, cos θ); turning the model by θ more lands
         north on screen-up by the shortest way round */
      const north = THREE.MathUtils.degToRad(input.northDeg) + (this.hasOrbitPos ? this.flightTheta : 0);
      if (target === 0 && input.spinning && !input.reduce && this.progress < 0.01) this.yaw += dt * SPIN;
      const twoPi = Math.PI * 2;
      this.yaw = ((this.yaw % twoPi) + twoPi) % twoPi;
      const diff = ((north - this.yaw + Math.PI + twoPi) % twoPi) - Math.PI;
      this.group.rotation.y = this.yaw + diff * e;
    }

    /* camera: orbit (OrbitControls) in 3D, flight to the top in plan */
    const cam = state.camera as THREE.PerspectiveCamera;
    if (this.controls) this.controls.enabled = this.progress < 0.02;
    /* the section fill rides the cut plane (plane: −y + c = 0 → y = c) */
    if (this.cap) {
      this.cap.position.y = this.plane.constant;
      this.cap.visible = e > 0.01;
    }
    this.fade = e;
    this.foliage?.setFade(e);
    this.plants?.setFade(e);
    this.lawn?.setFade(e);
    /* the plan has no colour: saturation goes to −1 (full grey) on landing */
    if (this.sat) this.sat.saturation = -e;
    if (this.progress > 0.001) {
      /* spherical path from the orbit pose to straight above: the polar
         angle closes to the top, the azimuth holds (no camera spin — the
         only turn is the model settling north-up), the radius eases to
         the plan distance. Deterministic in e, so no chase and no snap. */
      const topDistance = Math.max(f.width_m, f.depth_m) * 6;
      this.sph.setFromVector3(this.orbitPos);
      const phi = THREE.MathUtils.lerp(this.sph.phi, 0.012, e);
      const r = THREE.MathUtils.lerp(this.sph.radius, topDistance, e);
      this.sph.set(r, phi, this.sph.theta);
      cam.position.setFromSpherical(this.sph);
      cam.fov = THREE.MathUtils.lerp(FOV_3D, FOV_PLAN, e);
      this.look.set(0, THREE.MathUtils.lerp(f.height_m * 0.4, 0, e), 0);
      cam.lookAt(this.look);
      cam.updateProjectionMatrix();
    } else {
      this.hasOrbitPos = false;
      if (Math.abs(cam.fov - FOV_3D) > 0.01) {
        cam.fov = FOV_3D;
        cam.updateProjectionMatrix();
      }
      const r = this.radius();
      const len = cam.position.length();
      if (len < r * 0.8 || len > r * 1.25) cam.position.setLength(r);
    }
  }
}

/* PLANTS LIVE ON THEIR OWN LAYER, so any pass that renders "the house"
   from another camera (it was the contact shadow, removed 2026-10-05 for
   smearing the ground as the home turned) can leave them out. The view
   camera enables PLANT_LAYER, so plants draw and are lit as normal.
   Grounding is now baked into the lawn (lawn.ts), static, no per-frame
   re-render. */
const PLANT_LAYER = 1;
function plantLayer(root: THREE.Object3D) {
  root.traverse((o) => o.layers.set(PLANT_LAYER));
}

/* imperative hand-off from React land to the viewer state */
function wire(vs: React.RefObject<ViewerState | null>, group: THREE.Group | null, scene: THREE.Object3D, gl: THREE.WebGLRenderer, root: THREE.Scene, mode: Mode, plantsBase: string) {
  const v = vs.current;
  if (!v) return;
  v.group = group;
  v.plantsBase = plantsBase;
  v.attach(scene, gl, root, mode);
  /* inspectable from the console / Playwright: window.__planViewer */
  (window as unknown as { __planViewer?: ViewerState }).__planViewer = v;
}

function House({ src, vs, input, plantsBase }: { src: string; vs: React.RefObject<ViewerState | null>; input: Inputs; plantsBase: string }) {
  const { scene } = useGLTF(src);
  const group = useRef<THREE.Group>(null);
  /* the frame loop reads the latest inputs through a ref (updated in
     an effect, never during render) */
  const ref = useRef(input);
  useEffect(() => {
    ref.current = input;
  }, [input]);
  /* wiring the loaded scene into the viewer state is a side effect */
  const { gl, scene: root } = useThree();
  useEffect(() => {
    wire(vs, group.current, scene, gl, root, ref.current.mode, plantsBase);
  }, [scene, gl, root, vs, plantsBase]);
  useFrame((state, dt) => {
    vs.current?.tick(state, Math.min(dt, 0.1), ref.current);
  });
  return (
    <group ref={group}>
      <primitive object={scene} />
    </group>
  );
}

export function PlanViewer({ src, northDeg, mode: initialMode = "3d", onModeChange, className = "", envBase = DEFAULT_ENV_BASE, plantsBase = DEFAULT_PLANTS_BASE }: PlanViewerProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [storey, setStorey] = useState(0);
  const [spinning, setSpinning] = useState(true);
  const [reduce, setReduce] = useState(false);
  const [sun, setSun] = useState<[number, number, number] | null>(null);
  /* render at full device pixels (edges and the procedural reveals stay
     crisp); PerformanceMonitor steps it down only when the frame rate
     actually sags, and back up when it recovers */
  const [dpr, setDpr] = useState(2);
  const vs = useRef<ViewerState | null>(null);
  if (vs.current == null) {
    vs.current = new ViewerState();
  }
  const { scene } = useGLTF(src);
  const extras = (scene.userData as Extras | undefined) ?? {};
  const all = extras.storeys ?? [{ index: 0, name: "Ground", elevation_m: 0 }];
  /* only levels with walls get a pill (Revit exports its roof level as
     a storey; a plan cut there shows the roof slab) */
  const habitable = all.filter((s) => s.habitable !== false);
  const storeys = habitable.length ? habitable : all;
  const fp = extras.footprint ?? { width_m: 12, depth_m: 10, height_m: 8 };
  const north = northDeg ?? extras.northDeg ?? 0;
  const radius = Math.max(fp.width_m, fp.depth_m, fp.height_m) * ORBIT_RADIUS;
  /* Samara's trick: render at a lower ratio while the pointer is down and
     restore 200 ms after it lifts, so drags stay fluid on any GPU */
  const [interacting, setInteracting] = useState(false);
  const restore = useRef(0);
  const onDown = () => {
    window.clearTimeout(restore.current);
    setInteracting(true);
    setSpinning(false);
  };
  const onUp = () => {
    setSpinning(true);
    window.clearTimeout(restore.current);
    restore.current = window.setTimeout(() => setInteracting(false), 200);
  };

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduce(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const change = (m: Mode) => {
    setMode(m);
    onModeChange?.(m);
  };

  return (
    <div className={`relative w-full overflow-hidden rounded-md bg-surface-2 ${className}`} data-mode-3d={mode}>
      <div className="aspect-[4/3] w-full md:aspect-[16/9]">
        <Canvas
          onCreated={({ camera }) => camera.layers.enable(PLANT_LAYER)}
          dpr={interacting ? Math.min(dpr, 1.25) : dpr}
          /* near/far hug the orbit radius: with the camera ~170 m out a
             0.1 m near plane would starve depth precision and the panes
             would fight their frames */
          camera={{ position: [radius * 0.8, radius * 0.45, radius * 0.6], fov: FOV_3D, near: radius * 0.3, far: radius * 3 }}
          /* Neutral (Khronos PBR) tone mapping keeps material colour
             faithful — a product shot, not a film look */
          /* premultipliedAlpha false: the post chain writes STRAIGHT alpha
             to this transparent canvas, and a premultiplied canvas added
             the page behind it twice wherever the image is part-transparent
             — a pale glow (and over-bright pixels) round the lawn's soft
             edge */
          gl={{ antialias: false, alpha: true, premultipliedAlpha: false, stencil: true, powerPreference: "low-power", toneMapping: THREE.NoToneMapping }}
          onPointerDown={onDown}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <hemisphereLight args={["#f4f3ef", "#6d6c68", sun ? 0.4 : 0.45]} />
          {/* the sun: aligned with the HDRI's once env.json arrives */}
          <directionalLight position={sun ? [sun[0] * 30, sun[1] * 30, sun[2] * 30] : [12, 16, 8]} intensity={sun ? 2.2 : 1.25} />
          {/* fill from the opposite side so the shaded elevations keep their panel reveals */}
          <directionalLight position={sun ? [-sun[0] * 30, 8, -sun[2] * 30] : [-10, 6, -8]} intensity={sun ? 0.5 : 0.3} />
          <SkyEnvironment base={envBase} onSun={setSun} />
          {/* resolution steps down only on a sustained low frame rate, never
              on the brief dip of a mode flight (that read as a quality drop) */}
          <PerformanceMonitor ms={1500} iterations={6} threshold={0.6} onDecline={() => setDpr(1.25)} onIncline={() => setDpr(2)} flipflops={2} onFallback={() => setDpr(1.25)} />
          <House src={src} vs={vs} plantsBase={plantsBase} input={{ mode, storey, northDeg: north, reduce, spinning }} />
          <OrbitControls
            ref={(c) => {
              const v = vs.current;
              if (v) v.controls = c as unknown as { enabled: boolean } | null;
            }}
            enableZoom={false}
            enablePan={false}
            minPolarAngle={Math.PI / 3.2}
            maxPolarAngle={Math.PI / 2.1}
            target={[0, fp.height_m * 0.4, 0]}
            enableDamping
          />
          {/* POST CHAIN: Neutral tone mapping (three skips it for render
              targets, so it moves here) and the plan's desaturation. MSAA
              ×4 on the composer's buffer keeps edges as clean as the plain
              canvas; stencilBuffer keeps the plan's section fill working.
              No ambient occlusion: screen-space AO painted grey patches on
              the ground that swam as the house turned (removed 2026-10-05,
              Bryce). */}
          <EffectComposer multisampling={4} stencilBuffer enableNormalPass={false}>
            <ToneMapping mode={ToneMappingMode.NEUTRAL} />
            <HueSaturation
              ref={(s) => {
                const v = vs.current;
                if (v) v.sat = s as unknown as ViewerState["sat"];
              }}
              saturation={0}
            />
          </EffectComposer>
        </Canvas>
      </div>

      {/* mode + storey controls: DOM, library-styled */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-lg p-xl">
        <div role="group" aria-label="View" className="pointer-events-auto flex items-center gap-xxs rounded-(--radius-full) bg-line-2 p-xxs">
          {(["3d", "plan"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => change(m)}
              className={`relative rounded-(--radius-full) px-2xl py-md text-body-sm font-medium transition-colors ${mode === m ? "bg-surface text-ink" : "text-ink-3 hover:text-ink"}`}
            >
              {m === "3d" ? "3D" : "Floor plan"}
            </button>
          ))}
        </div>
        {mode === "plan" && storeys.length > 1 && (
          <div role="group" aria-label="Storey" className="pointer-events-auto flex items-center gap-xxs rounded-(--radius-full) bg-line-2 p-xxs">
            {storeys.map((s) => (
              <button
                key={s.index}
                type="button"
                aria-pressed={storey === s.index}
                onClick={() => setStorey(s.index)}
                className={`rounded-(--radius-full) px-2xl py-md text-body-sm font-medium transition-colors ${storey === s.index ? "bg-surface text-ink" : "text-ink-3 hover:text-ink"}`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {mode === "plan" && <p aria-hidden className="label absolute right-xl top-xl text-ink-3">N ↑</p>}
    </div>
  );
}

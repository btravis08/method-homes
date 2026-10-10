"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type RootState } from "@react-three/fiber";
import { OrbitControls, PerformanceMonitor, useGLTF } from "@react-three/drei";
import { BrightnessContrast, EffectComposer, HueSaturation, N8AO, ToneMapping, Vignette } from "@react-three/postprocessing";
import { buildFoliage, plantingPlan, type Door, type FoliageHandle, type Plant } from "./foliage";
import { findDoors, wallBounds } from "./doors";
import { loadPlants, type PlantsHandle } from "./plants";
import { buildLawn, type LawnHandle } from "./lawn";
import { makeTerrain } from "./terrain";
import { buildScenery, type SceneryHandle } from "./scenery";
import { useLenis } from "lenis/react";
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
function loadSky(base: string, intensity: number, gl: THREE.WebGLRenderer, root: THREE.Scene, onSun: (dir: [number, number, number]) => void, onDone: () => void) {
  let live = true;
  let env: THREE.Texture | null = null;
  (async () => {
    try {
      const res = await fetch(`${base}/env.json`);
      if (!res.ok) {
        onDone();
        return;
      }
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
      /* meadow_2 has a bright green ground half (the puresky it replaced
         had none), so its bounce lifts and warms everything: 0.9 keeps the
         old exposure */
      /* 0.5 (2026-10-05, the Samara pass): with 0.9 of sky plus a
         hemisphere and a fill, the shaded sides were lit almost as well
         as the sunny ones and the soft shadows washed out. A product
         shot's balance is a strong key and a modest sky (three divides a
         light's irradiance by π for diffuse, so the sun needs ~7 to out-
         light the sky about 3:1 on the lawn, as real daylight does). */
      root.environmentIntensity = intensity; // 0.45 for the daylight look; each Look sets its own
      root.userData.envSource = "hdri";
    } catch {
      /* keep the procedural room */
    }
    if (live) onDone();
  })();
  return () => {
    live = false;
    if (env && root.environment === env) {
      root.environment = null;
      env.dispose();
    }
  };
}

function SkyEnvironment({ base, intensity, onSun, onDone }: { base: string; intensity: number; onSun: (dir: [number, number, number]) => void; onDone: () => void }) {
  const { gl, scene: root } = useThree();
  useEffect(() => loadSky(base, intensity, gl, root, onSun, onDone), [base, intensity, gl, root, onSun, onDone]);
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
  mode?: Mode;
  onModeChange?: (mode: Mode) => void;
  /* the toggle's steps, in order (default 3D / Floor plan, plus Modules
     when the GLB has module nodes); "single" shows one module alone */
  modes?: Mode[];
  labels?: Partial<Record<Mode, string>>;
  /* the module the "single" step shows: a room it holds ("KITCHEN") or
     its own name ("MOD D"), matched case-insensitively */
  focusRoom?: string;
  /* how far the modules pull apart (positions scale by 1 + gap) */
  explodeGap?: number;
  /* dotted corner-to-corner lines between adjacent modules while they
     are apart (25% ink), showing how they meet */
  connectors?: boolean;
  /* the section draws its own toggle (the Figma "How it works" layout):
     hide the built-in one and drive `mode` from outside */
  hideControls?: boolean;
  /* screen-space ambient occlusion (N8AO) — the white model needs it to
     read as solid; costs a pass, so opt in per section */
  occlusion?: boolean;
  /* fill the parent (no fixed aspect, no panel background): the section
     composes the ring and cards around the canvas */
  fill?: boolean;
  /* orbit distance multipliers: the How it works ring wants the home at
     ~60% of the frame and a single module at ~30% */
  distance?: number;
  distanceSingle?: number;
  className?: string;
  /* folder with env.json + the HDR (prep-env.py); default /models/env */
  envBase?: string;
  /* folder with plants.json + plant GLBs; default /models/plants, "" keeps
     the procedural planting only */
  plantsBase?: string;
  /* called once when the view has fully settled and faded in */
  onReady?: () => void;
  /* show the built-in "Loading 3D view…" label (off when a wrapper,
     e.g. LazyPlanViewer, keeps its own poster up until onReady) */
  showLoading?: boolean;
  /* lighting / grade preset (LOOKS); `?look=` in the URL overrides for previews */
  look?: LookName;
  /* aerial descent: the viewer fills its sticky parent inside a tall
     [data-descent] wrapper and flies in from above the clouds on scroll */
  descent?: boolean;
}

/* "modules" (Bryce, 2026-10-09): the prefab modules pull apart from the
   footprint centre so each reads as its own shipped box — the pipeline
   groups geometry under `module<K>` nodes (extras: centre) when the IFC
   carries that structure; the button appears only when the GLB has them */
export type Mode = "3d" | "plan" | "modules" | "single";
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
/* glass: see-through enough to read the interior, reflective enough to
   carry the sky and the tree line (Bryce: "reflects the sky but also
   green trees") */
const GLASS_TRANSMISSION = 0.35;
/* per-surface reflection strength in 3D: glass mirrors the meadow; the
   black roof stays black instead of picking up a green cast */
/* multiplied by the scene's environmentIntensity (0.45): glass keeps the
   reflection strength it had at 0.9 × 2.4 */
const ENV_BOOST: Record<string, number> = { glass: 4.8, roof: 1.2 };
const SPEED = 0.85; // mode transition, 1/s (≈1.2 s flight)
/* SCROLL-TIED TURN (Bryce, 2026-10-05: no free spin). As the viewer
   scrolls into view the home turns from REST_YAW − SWEEP to REST_YAW,
   reaching rest when the viewer is centred in the window; scrolling back
   unwinds it. The first drag hands control to the user for good. */
const UP = new THREE.Vector3(0, 1, 0);
const REST_YAW = 0; // rad: the framed three-quarter view
const SWEEP = THREE.MathUtils.degToRad(100);
const YAW_DAMP = 7; // 1/s: how quickly the turn catches up with the scroll
/* cubic in-out: the flight leaves and arrives gently, no snap */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* the two palettes, keyed by the pipeline's category names */
/* the render finish (Bryce, 2026-10-05): off-white fibre-cement panel
   siding, black standing-seam metal roof, black window mullions, dark
   doors, concrete floors. The siding and roof get procedural relief in
   the shader (see FINISH). */
const RENDER: Record<string, [string, number]> = {
  /* off-white cooled from cream, and the "black" roof as black metal
     actually reads in daylight — a deep charcoal, so its seams show
     (Bryce, 2026-10-05: Samara's "less stark materials", "relief") */
  wall: ["#d7d6d1", 1], floor: ["#b9b5ad", 1], roof: ["#3b3e41", 1], glass: ["#1f2a30", 0.45],
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
  - siding: board-and-batten — 38 mm battens every 16 in standing proud
    of the boards (lit face + shadow strip), per-board tone variation,
    and a soft occlusion band at the foot of the wall; vertical faces
    only (was flat 4 × 8 ft panels until 2026-10-05)
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
  uniform float uRelief;
  uniform float uDiagram;
  float gRib = 0.0;
`;

/*
  SOURCE MATERIALS (ifc-to-glb --keep-materials, 2026-10-09). Method's
  Revit export names every wall layer ("VERTICAL STAINED WOOD SIDING",
  "Board Form Concrete", ". 5/8\" GWB (Level 5)") but paints most of
  them Revit's default shaded grey (#787878) — the IFC carries the
  material IDENTITY, not its appearance. So the finish is decided by
  NAME, and the IFC colour is used only when it is a real one (the
  cast-in-place concrete's #818476, trim's #0d0d0d).
  STAIN is a placeholder until Method says what the siding is stained.
*/
const STAIN = "#5a4634";
const INTERIOR = "#efece6";

/*
  LOOKS (Bryce, 2026-10-09: time of day + weather, materials, grade) —
  one preset bundles the sky folder (prep-env.py output), the sun and
  fills, the environment strength, the post grade (tone curve,
  saturation, contrast, vignette) and the material accents (siding
  stain, glass reflection strength). `daylight` is the look the viewer
  had; the others are candidates to pick from side by side. A preset
  is chosen by the `look` prop or, for previews, `?look=` in the URL.
*/
export type LookName = "daylight" | "golden" | "overcast";
export interface Look {
  envBase: string;
  envIntensity: number;
  sun: { intensity: number; color: string };
  hemi: number;
  fill: number;
  tone: ToneMappingMode;
  saturation: number;
  brightness: number;
  contrast: number;
  vignette: number;
  stain: string;
  glassBoost: number;
}
export const LOOKS: Record<LookName, Look> = {
  /* the product-shot daylight tuned on 2026-10-05: partly cloudy sky,
     warm strong key, calm saturation */
  daylight: { envBase: "/models/env", envIntensity: 0.45, sun: { intensity: 7, color: "#fff7ee" }, hemi: 0.12, fill: 0.15, tone: ToneMappingMode.NEUTRAL, saturation: -0.12, brightness: 0, contrast: 0, vignette: 0, stain: STAIN, glassBoost: 4.8 },
  /* golden hour: low warm sun (sunrise HDRI), long shadows, glowing
     glass, filmic AgX roll-off, a touch more colour and a soft vignette */
  golden: { envBase: "/models/env-golden", envIntensity: 0.55, sun: { intensity: 5.5, color: "#ffc98a" }, hemi: 0.1, fill: 0.08, tone: ToneMappingMode.AGX, saturation: 0.04, brightness: 0.01, contrast: 0.06, vignette: 0.28, stain: "#6a4b33", glassBoost: 6.5 },
  /* overcast: a bright even sky carries the light, the sun is a faint
     direction for soft shadows, cooler and quieter grade */
  overcast: { envBase: "/models/env-overcast", envIntensity: 0.95, sun: { intensity: 1.4, color: "#eef2f8" }, hemi: 0.3, fill: 0.2, tone: ToneMappingMode.NEUTRAL, saturation: -0.26, brightness: 0.02, contrast: -0.04, vignette: 0.12, stain: "#5c4a3c", glassBoost: 3.2 },
};
export const DEFAULT_LOOK: LookName = "daylight";
const isDefaultGrey = (c: THREE.Color) => {
  const { r, g, b } = c;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return spread < 0.03 && r > 0.4 && r < 0.56;
};
function materialFinish(key: string, source: THREE.Color, stain: string = STAIN): { color: THREE.Color; relief: boolean; rough?: number; metal?: number } {
  const k = key.toLowerCase();
  const real = !isDefaultGrey(source);
  if (/siding|cedar|clapboard|shiplap|\bwood\b|timber/.test(k)) return { color: new THREE.Color(real ? source : stain), relief: true, rough: 0.78 };
  if (/gwb|gypsum|drywall|plaster|plywood|cdx|osb|sheathing|insulation|stud|default-wall/.test(k)) return { color: new THREE.Color(INTERIOR), relief: false, rough: 0.9 };
  if (/concrete|cmu|block|masonry|brick|stone/.test(k)) return { color: new THREE.Color(real ? source : "#9a978f"), relief: false, rough: 0.95 };
  if (/black|steel|metal|fascia|trim|aluminum|aluminium/.test(k)) return { color: new THREE.Color(real ? source : "#111111"), relief: false, rough: 0.4, metal: 0.5 };
  if (/glass|glazing/.test(k)) return { color: new THREE.Color(RENDER.glass[0]), relief: false, rough: 0.12, metal: 0.1 };
  return { color: new THREE.Color(real ? source : RENDER.wall[0]), relief: true };
}
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
    /* BOARD-AND-BATTEN: vertical battens every 16 in (0.4064 m), 38 mm
       wide, standing proud of the boards — a lit face, a shaded flank and
       a thin shadow line on the board beside it, so the cladding has
       relief at any angle. Analytic AA (fwidth ramps + coverage fade) as
       before, so the lines never sparkle. */
    float pitch = 0.4064;
    float bw = 0.019; // half the batten width
    float fu = fract(uv.x / pitch) * pitch - pitch * 0.5; // −p/2 … p/2, batten centred at 0
    float px = max(fwidth(uv.x), 1e-4);
    float w = max(0.002, px);
    float batten = 1.0 - smoothstep(bw - w, bw + w, abs(fu));
    float side = smoothstep(bw - w, bw + w, fu) * (1.0 - smoothstep(bw + 0.012 - w, bw + 0.012 + w, fu)); // shadow strip beside it
    float coverage = clamp(0.038 / px, 0.0, 1.0);
    float cell = floor(uv.x / pitch);
    float tone = fract(sin(cell * 12.9898) * 43758.5453) * 0.05 - 0.025;
    float vertical = 1.0 - step(0.85, abs(n.y));
    float k = (1.0 - uPlan) * (1.0 - uDiagram) * vertical * uRelief; // uRelief 0: a flat material (concrete, interior layers) — the sill logic below still applies
    diffuseColor.rgb *= 1.0 + tone * k;
    diffuseColor.rgb *= 1.0 + (batten * 0.06 - side * 0.28) * coverage * k;
    /* soft occlusion where the wall meets the ground (~25 cm), baked so
       it is stable as the home turns */
    float foot = exp(-max(vWorldPos.y, 0.0) / 0.22);
    diffuseColor.rgb *= 1.0 - 0.22 * foot * k;
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
    float k = (1.0 - uPlan) * (1.0 - uDiagram) * plane * coverage;
    gRib = rib * k;
    /* the rib catches light on one flank and drops shade on the other;
       on the charcoal base this is what makes the seams read */
    diffuseColor.rgb *= 1.0 + rib * k * 1.6 + flank * rib * k * 1.1;
  }
`;
const ROOF_ROUGHNESS = /* glsl */ `
  #include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.6, gRib);
`;

/* ART-DIRECTED WINDOW REFLECTIONS. The long lens (FOV 8°) is nearly
   orthographic, so a flat pane reflects ONE direction — from this height
   ~30° up into open sky, above the tree line: the windows read as flat
   blue. Archviz practice: steer the reflection. In 3D each pane's
   reflection is pulled to the horizon band — tree line along the bottom
   of the pane, sky toward the top — and its azimuth sweeps with position
   along the facade, so the trees run across the glazing and slide as the
   home turns. World position comes from the transmission varying; in
   plan (transmission 0) the steering is compiled out with it. */
const GLASS_REFLECT = /* glsl */ `
  #ifdef USE_TRANSMISSION
  varying vec3 vWorldPosition; // declared here, so it precedes the IBL code
  vec3 glassHorizon(vec3 r) {
    vec2 h = normalize(r.xz + vec2(1e-4, 0.0));
    float a = (vWorldPosition.x + vWorldPosition.z) * 0.12;
    h = mat2(cos(a), sin(a), -sin(a), cos(a)) * h;
    float t = clamp((vWorldPosition.y - 0.55) / 2.1, 0.0, 1.0);
    float el = mix(-0.04, 0.55, t);
    return vec3(h.x * cos(el), sin(el), h.y * cos(el));
  }
  #endif
`;

/* BAKED MODELS (scripts/model/bake.py, 2026-10-09): the GLB arrives with
   real texture sets (wood grain, concrete, plaster — world-box-projected
   UVs) and an ambient-occlusion atlas on uv1. The texture fades to the
   flat ink with the palette, and the occlusion also shades the sun a
   little — contact darkening at the foot of a wall and under the eaves
   is most of what makes a surface read as solid. */
const TEXTURE_PLAN = /* glsl */ `
  #include <map_fragment>
  #ifdef USE_MAP
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuse, max(uPlan, uDiagram));
  #endif
`;
const AO_DIRECT = /* glsl */ `
  #include <aomap_fragment>
  #ifdef USE_AOMAP
  {
    float bakedAo = (texture2D(aoMap, vAoMapUv).r - 1.0) * aoMapIntensity + 1.0;
    reflectedLight.directDiffuse *= mix(1.0, bakedAo, 0.55 * (1.0 - uPlan));
  }
  #endif
`;

function finish(mat: THREE.MeshStandardMaterial, cat: string, relief = true, textured = false) {
  if (cat === "glass") {
    mat.onBeforeCompile = (shader) => {
      const chunk = THREE.ShaderChunk.envmap_physical_pars_fragment.replace(
        "reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );",
        `reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );
        #ifdef USE_TRANSMISSION
          reflectVec = glassHorizon( reflectVec );
        #endif`,
      );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <envmap_physical_pars_fragment>", GLASS_REFLECT + chunk)
        /* …and dropped from the transmission chunk that normally declares it */
        .replace("#include <transmission_pars_fragment>", THREE.ShaderChunk.transmission_pars_fragment.replace("varying vec3 vWorldPosition;", ""));
    };
    mat.customProgramCacheKey = () => "finish-glass";
    return;
  }
  const structural = cat === "wall" || cat === "roof";
  if (!structural && !textured) return;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPlan = { value: 0 };
    shader.uniforms.uRelief = { value: relief ? 1 : 0 };
    shader.uniforms.uDiagram = { value: 0 };
    shader.vertexShader = PRELUDE + shader.vertexShader.replace("#include <project_vertex>", VERTEX_WORLD);
    let frag = shader.fragmentShader;
    if (structural) {
      frag = frag
        .replace("#include <color_fragment>", cat === "wall" ? SIDING_COLOR : ROOF_COLOR)
        .replace("#include <roughnessmap_fragment>", cat === "roof" ? ROOF_ROUGHNESS : "#include <roughnessmap_fragment>");
    }
    if (textured) frag = frag.replace("#include <map_fragment>", TEXTURE_PLAN).replace("#include <aomap_fragment>", AO_DIRECT);
    shader.fragmentShader = PRELUDE + frag;
    mat.userData.shader = shader;
  };
  mat.customProgramCacheKey = () => `finish-${cat}-${relief ? "relief" : "flat"}-${textured ? "tex" : "plain"}`;
}
/* DIAGRAM (Bryce, 2026-10-09: "the module and the assembly should not
   have ground beneath… show the primitive elements that make up the
   home. Once you toggle to the finished home the materials render in
   and the foliage/grass appears"): a white model — one pale tone, no
   relief, no sky in the surfaces, no lawn or planting — for the story's
   first two steps; the finishes fade in on "The Finished Home". */
/* Tones sit a step UNDER the page (Bryce, 2026-10-10: "a white border
   around the edge… cut out in photoshop"): the first palette's lit roof
   tone-mapped to a white brighter than the page, so the silhouette read
   as a pale rim. Lit faces now land around #ddd, shaded ones mid-grey. */
const DIAGRAM: Record<string, string> = {
  wall: "#e2dfd8", floor: "#d6d3cc", roof: "#cfccc5", glass: "#c3cbce",
  door: "#cbc9c3", frame: "#b5b3ae", stair: "#d2d0ca", rail: "#b6b4af", structure: "#cdcbc5", misc: "#d2d0ca",
};
/* the white model's study lighting: a soft fill (AmbientLight — three
   divides it by π on a Lambert surface, so 1.4 lights a 0.76-albedo face
   to ~0.34 linear, a mid grey, not slate) under a sun gentle enough that
   the roof top stays under the page tone */
/* the sky dome lights the roof top far harder than the walls (it is
   bright overhead, dark at the horizon), which is what snapped the model
   from white to slate — so the sky is held low and the flat fill high */
/* sized so a wall SQUARE to the sun (fill + sun × 0.9 + sky) still
   tone-maps under the page: the phone saw the sunlit side blow out to
   white where the sandbox camera had shown the shaded side */
const DIAGRAM_FILL = 1.3;
const DIAGRAM_SUN = 1.4;
const DIAGRAM_ENV = 0.5;

/* OPAQUE BACKDROP (Bryce, 2026-10-10, phone: a bright halo round the
   white model, "cut out in photoshop"). The halo is alpha compositing:
   the post chain hands the browser edge pixels whose colour and alpha
   don't agree (sRGB-encoded premultiplied values from the MSAA resolve),
   and iOS Safari composites them brighter than either side. In `fill`
   mode the canvas now clears to the page's own background colour, so
   no browser does alpha math on the picture at all. The colour the
   scene clears to is the PRE-IMAGE of the page colour through the post
   chain (Neutral tone map → saturation → sRGB), solved here, so the
   canvas is indistinguishable from the page around it. */
const srgbToLinear = (c: number) => (c < 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linearToSrgb = (c: number) => (c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
/* three's NeutralToneMapping (Khronos PBR Neutral), exposure 1 */
function neutralToneMap(c: [number, number, number]): [number, number, number] {
  const start = 0.8 - 0.04;
  const desat = 0.15;
  const x = Math.min(c[0], c[1], c[2]);
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  let r = c[0] - offset, g = c[1] - offset, b = c[2] - offset;
  const peak = Math.max(r, g, b);
  if (peak < start) return [r, g, b];
  const d = 1 - start;
  const newPeak = 1 - (d * d) / (peak + d - start);
  const k = newPeak / peak;
  r *= k; g *= k; b *= k;
  const m = 1 - 1 / (desat * (peak - newPeak) + 1);
  return [r + (newPeak - r) * m, g + (newPeak - g) * m, b + (newPeak - b) * m];
}
/* postprocessing's HueSaturation (hue 0): c += (avg − c) · k */
function saturate(c: [number, number, number], s: number): [number, number, number] {
  const avg = (c[0] + c[1] + c[2]) / 3;
  const k = s > 0 ? 1 - 1 / (1.001 - s) : -s;
  return [c[0] + (avg - c[0]) * k, c[1] + (avg - c[1]) * k, c[2] + (avg - c[2]) * k];
}
/* the linear scene colour that the chain maps onto `page` (sRGB 0–1):
   undo sRGB and saturation in closed form, the tone map by damped
   fixed-point iteration (its slope is < 1 everywhere, so this converges) */
function backdropPreimage(page: [number, number, number], s: number, out: THREE.Color) {
  const lin: [number, number, number] = [srgbToLinear(page[0]), srgbToLinear(page[1]), srgbToLinear(page[2])];
  const avg = (lin[0] + lin[1] + lin[2]) / 3;
  const k = s > 0 ? 1 - 1 / (1.001 - s) : -s;
  const t: [number, number, number] = k >= 0.999 ? [avg, avg, avg] : [(lin[0] - avg * k) / (1 - k), (lin[1] - avg * k) / (1 - k), (lin[2] - avg * k) / (1 - k)];
  const L: [number, number, number] = [t[0], t[1], t[2]];
  for (let i = 0; i < 80; i++) {
    const n = neutralToneMap(L);
    L[0] += t[0] - n[0]; L[1] += t[1] - n[1]; L[2] += t[2] - n[2];
  }
  out.setRGB(Math.max(0, L[0]), Math.max(0, L[1]), Math.max(0, L[2]), THREE.LinearSRGBColorSpace);
}
/* the LINEAR alpha of black that darkens the backdrop by `ink` (0–1) in
   DISPLAY space: the backdrop's pre-image sits above the tone map's
   knee, where a linear 30% cut compresses to almost nothing, so the
   plinth's ink is specified on the page and converted here */
function inkAlpha(page: [number, number, number], s: number, ink: number): number {
  const a = new THREE.Color();
  const b = new THREE.Color();
  backdropPreimage(page, s, a);
  backdropPreimage([page[0] * (1 - ink), page[1] * (1 - ink), page[2] * (1 - ink)], s, b);
  const la = (a.r + a.g + a.b) / 3;
  const lb = (b.r + b.g + b.b) / 3;
  return la > 0 ? THREE.MathUtils.clamp(1 - lb / la, 0, 1) : ink;
}
/* the colour behind an element: the nearest ancestor with a painted
   background (CSS rgb()/rgba() string → sRGB 0–1), or null */
function pageColourBehind(el: HTMLElement | null): [number, number, number] | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const bg = getComputedStyle(node).backgroundColor;
    const m = bg.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/);
    if (!m) continue;
    if (m[4] !== undefined && Number(m[4]) < 0.999) continue;
    return [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255];
  }
  return null;
}
/* the ground under the white model (Bryce, 2026-10-10: "cast shadow /
   relief on the ground perhaps?"): no lawn — the model stands on the
   page — so a shadow catcher takes the sun's shadow and a second plane
   paints a soft contact gradient round each module's footprint (the
   grounding a real white model has from its base, and the one thing
   screen-space AO cannot give a transparent ground). Both are ink at
   low alpha over the page. */
const PLINTH_SHADOW = 0.24;
const PLINTH_CONTACT = 0.22;
const PLINTH_REACH = 2.4; // m the contact gradient runs out from a footprint
const PLINTH_MAX = 16; // rects the contact shader takes
const CONTACT_VERT = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const CONTACT_FRAG = /* glsl */ `
  uniform vec4 uRects[${PLINTH_MAX}];
  uniform float uWeights[${PLINTH_MAX}];
  uniform int uCount;
  uniform float uOpacity;
  uniform float uReach;
  varying vec3 vPos;
  void main() {
    float a = 0.0;
    for (int i = 0; i < ${PLINTH_MAX}; i++) {
      if (i >= uCount) break;
      vec4 r = uRects[i];
      vec2 d = abs(vPos.xz - r.xy) - r.zw;
      float dist = length(max(d, 0.0));
      float k = 1.0 - smoothstep(0.0, uReach, dist);
      a = max(a, k * k * uWeights[i]);
    }
    gl_FragColor = vec4(0.0, 0.0, 0.0, a * uOpacity);
  }`;
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

interface Inputs { mode: Mode; storey: number; northDeg: number; reduce: boolean }

/* all mutable three.js state, driven from the frame loop */
class ViewerState {
  group: THREE.Group | null = null;
  root: THREE.Scene | null = null; // for the debug hook (window.__planViewer)
  controls: { enabled: boolean } | null = null;
  /* desaturation at the end of the chain: slight in 3D, full grey in plan */
  sat: { saturation: number } | null = null;
  /* the sun: its soft shadow map fades out with the 3D view */
  sunLight: THREE.DirectionalLight | null = null;
  gl: THREE.WebGLRenderer | null = null; // debug hook (window.__planViewer)
  /* painterly planting around the home (foliage.ts); dissolves in plan */
  foliage: FoliageHandle | null = null;
  /* the real scanned plants (plants.ts): replace the cards once loaded */
  plants: PlantsHandle | null = null;
  /* organic lawn round the home (lawn.ts); dissolves in plan */
  lawn: LawnHandle | null = null;
  /* the planting plan (foliage.ts) and the exterior doors it keeps clear */
  doors: Door[] = [];
  plan: Plant[] = [];
  /* NO FLASH ON LOAD: the canvas stays hidden until the house, the
     planting (real or, on failure, the painterly fallback) and the sky
     have all settled, then fades in once (PlanViewer `ready`). */
  private plantsSettled = false;
  skySettled = false;
  isReady = false;
  onReady: (() => void) | null = null;
  private appear = 1; // plants' dissolve-in, 0 → 1
  /* the scroll-tied turn; `dragged` freezes it once the user takes over */
  dragged = false;
  /* AERIAL DESCENT (scenery.ts): when the viewer sits in a pinned
     [data-descent] wrapper, scroll progress through it flies the camera
     from high above the clouds down to the framed view. `arrived` hands
     control back to the user; the mode toggle appears then. */
  wantScenery = false;
  scenery: SceneryHandle | null = null;
  descent = 1; // raw scroll progress, 1 = arrived
  private descentDamped = 1;
  arrived = true;
  onArrive: ((arrived: boolean) => void) | null = null;
  checkReady() {
    if (this.isReady || !this.plantsSettled || !this.skySettled || !this.group) return;
    this.isReady = true;
    this.onReady?.();
  }
  plantsBase = DEFAULT_PLANTS_BASE;
  private plantsLoading = false;
  private fade = 0;
  plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 100);
  /* GROUND (Bryce, 2026-10-09: "remove the foundation, or hide anything
     below the terrain"): the pipeline's ground is the lowest storey with
     walls — on Method's model the FOUNDATION level, so the footings and
     the crawl-space walls stood a storey tall under the home. The viewer
     now puts the ground GROUND_BELOW_FLOOR under the lowest habitable
     storey (a short plinth, like a home on a crawl space reads from the
     street), drops the model by that much, and clips everything below
     the lawn so nothing pokes through its relief. */
  groundOffset = 0;
  ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.02);
  /* EXPLODE: module nodes slide out along the line from the footprint
     centre to their own centre — positions scale about the centre, so a
     row of modules gets even gaps. 0 = assembled, 1 = pulled apart. */
  modules: { node: THREE.Object3D; index: number; name: string; prefab: boolean; centre: THREE.Vector3; size: THREE.Vector2; rooms: string[]; mats: THREE.Material[]; vis: number }[] = [];
  explode = 0;
  explodeGap = EXPLODE_GAP;
  /* SINGLE (the module story, Bryce, 2026-10-09: "renders a single
     module… the module that has the kitchen"): the other modules fade
     out, the home slides so the focus module sits on the orbit centre
     and the orbit tightens to its size */
  focus: number | null = null;
  single = 0;
  private focusShift = new THREE.Vector3();
  diagram = 0;
  fillLight: THREE.AmbientLight | null = null;
  /* the page colour the canvas clears to in fill mode (null = transparent) */
  backdrop: [number, number, number] | null = null;
  private bgColor = new THREE.Color();
  private bgKey = "";
  /* the plinth's linear alphas for its display-space ink on this backdrop */
  private inkShadow = PLINTH_SHADOW;
  private inkContact = PLINTH_CONTACT;
  /* the white model's ground: shadow catcher + contact gradient */
  plinth: { shadow: THREE.Mesh; shadowMat: THREE.ShadowMaterial; contact: THREE.Mesh; contactMat: THREE.ShaderMaterial } | null = null;
  /* ghost opacity for the modules around the focus one in the assembly
     (the Figma boxes read clearly — light, not faint) */
  ghost = 0.55;
  /* a solid block per module between its wall tops and its roof
     underside: Method's Revit roof is a slab over an unmodelled rafter
     zone, so the module read as a lid floating over a thin ceiling */
  cavities: THREE.Mesh[] = [];
  /* dashed connectors between adjacent modules while they are apart */
  connectors: THREE.Group | null = null;
  wantConnectors = false;
  distance = 1;
  distanceSingle = 1;
  adjacency: { a: number; b: number; axis: "x" | "z"; at: number }[] = [];
  /* `source` = the GLB's own colour when the pipeline kept the IFC's
     siding material (node `storey0_wall__cedar-siding-8a6a4b`); the
     category palette otherwise */
  mats: { mat: THREE.MeshStandardMaterial; cat: string; storey: number; source: THREE.Color | null; module: number | null }[] = [];
  /* the active look's material + grade parameters (set by the component) */
  lookPreset: Look = LOOKS[DEFAULT_LOOK];
  storeys: Storey[] = [{ index: 0, name: "Ground", elevation_m: 0 }];
  footprint: Footprint = { width_m: 12, depth_m: 10, height_m: 8 };
  progress = 0; // 0 = 3D, 1 = plan
  yaw = 0;
  private a = new THREE.Color();
  private b = new THREE.Color();
  private c = new THREE.Color();
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
    {
      /* the same "lived-in" test the storey pills use: a storey with a
         door or a window on it */
      const lived = new Set<number>();
      scene.traverse((o) => {
        const lm = o.name.match(/^storey(\d+)_(door|glass|frame)\b/);
        if (lm) lived.add(Number(lm[1]));
      });
      const hab = this.storeys.filter((st) => st.habitable !== false && (lived.size === 0 || lived.has(st.index)));
      const floor = hab.length ? Math.min(...hab.map((st) => st.elevation_m)) : 0;
      this.groundOffset = Math.max(0, floor - GROUND_BELOW_FLOOR);
      scene.position.y = -this.groundOffset;
    }
    this.progress = initial === "plan" ? 1 : 0;
    this.mats = [];
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o.userData.stencil) return;
      /* storey<N>_<category>[__<material-key>] — the suffix marks a wall
         node whose glTF material carries the IFC's real siding colour
         (ifc-to-glb --keep-materials, 2026-10-09): that colour is kept
         instead of the palette's off-white */
      /* …and a trailing ~m<K> when the pipeline grouped the node under a
         prefab module (see MODULES) */
      const m = o.name.match(/^storey(\d+)_([a-z]+)(?:__(.+?))?(?:~m\d+)?$/);
      const cat = m ? m[2] : "misc";
      const storey = m ? Number(m[1]) : 0;
      const sourceMat = o.material as THREE.MeshStandardMaterial;
      /* a baked GLB (bake.py) carries its own texture sets + AO atlas:
         those come across, and its base-colour factor is the tint */
      const baked = !!sourceMat && !sourceMat.userData.viewer && !!(sourceMat.map || sourceMat.aoMap || sourceMat.normalMap || sourceMat.roughnessMap);
      const fin = m?.[3] && sourceMat?.color && !sourceMat.userData.viewer ? materialFinish(m[3], sourceMat.color, this.lookPreset.stain) : null;
      const source = baked ? sourceMat.color.clone() : (fin?.color ?? (sourceMat?.userData.source as THREE.Color | undefined) ?? null);
      if (!(o.material instanceof THREE.MeshStandardMaterial && o.material.userData.viewer)) {
        const [rough, metal] = SURFACE[cat] ?? SURFACE.misc;
        const maps = baked
          ? {
              map: sourceMat.map ?? null,
              normalMap: sourceMat.normalMap ?? null,
              normalScale: sourceMat.normalScale?.clone(),
              roughnessMap: sourceMat.roughnessMap ?? null,
              /* the roughness jpg is greyscale, so its blue channel would
                 scale metalness too — the factor alone decides that */
              metalnessMap: null,
              aoMap: sourceMat.aoMap ?? null,
              aoMapIntensity: 1,
            }
          : {};
        const common = {
          ...maps,
          color: source ?? (RENDER[cat] ?? RENDER.misc)[0],
          roughness: baked ? (sourceMat.roughnessMap ? 1 : sourceMat.roughness) : (fin?.rough ?? rough),
          metalness: baked ? sourceMat.metalness : (fin?.metal ?? metal),
          transparent: true,
          opacity: (RENDER[cat] ?? RENDER.misc)[1],
          side: THREE.DoubleSide,
          clippingPlanes: [this.plane, this.ground],
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
              new THREE.MeshPhysicalMaterial({ ...common, opacity: 1, transmission: GLASS_TRANSMISSION, ior: 1.7, thickness: 0.02, roughness: 0.03, metalness: 0, specularIntensity: 1.6, envMapIntensity: this.lookPreset.glassBoost })
            : new THREE.MeshStandardMaterial(common);
        finish(mat, cat, fin ? fin.relief : true, baked && cat !== "glass");
        mat.userData.viewer = true;
        if (source) mat.userData.source = source;
        if (fin || baked) mat.userData.finish = { rough: mat.roughness, metal: mat.metalness };
        (o.material as THREE.Material).dispose?.();
        o.material = mat;
      }
      let module: number | null = null;
      for (let q: THREE.Object3D | null = o.parent; q; q = q.parent) {
        const pm = q.name.match(/^module(\d+)$/);
        if (pm) {
          module = Number(pm[1]);
          break;
        }
      }
      this.mats.push({ mat: o.material as THREE.MeshStandardMaterial, cat, storey, source, module });
      /* SUN SHADOWS: the home shades itself (eaves on the walls) and the
         lawn. Glass passes light (no cast), so rooms don't go black. */
      o.castShadow = cat !== "glass";
      o.receiveShadow = true;
    });
    this.modules = [];
    type ModuleInfo = { index: number; name?: string; prefab?: boolean; centre?: number[]; size_m?: number[]; rooms?: string[] };
    const moduleList = (extras as { modules?: ModuleInfo[] }).modules ?? [];
    scene.traverse((o) => {
      const mm = o.name.match(/^module(\d+)$/);
      if (!mm) return;
      const index = Number(mm[1]);
      /* centre + size: the node's own extras, else the scene's module list
         (trimesh writes scene extras, not node extras), else the bounds */
      const info = { ...(moduleList.find((x) => x.index === index) ?? {}), ...(o.userData as ModuleInfo) };
      const box = new THREE.Box3().setFromObject(o);
      const c = info.centre;
      const centre = c && c.length >= 2 ? new THREE.Vector3(c[0], 0, c[1]) : box.getCenter(new THREE.Vector3()).setY(0);
      const sz = info.size_m;
      const size = sz && sz.length >= 2 ? new THREE.Vector2(sz[0], sz[1]) : new THREE.Vector2(box.max.x - box.min.x, box.max.z - box.min.z);
      const mats: THREE.Material[] = [];
      this.modules.push({ node: o, index, name: info.name ?? o.name, prefab: info.prefab !== false, centre, size, rooms: info.rooms ?? [], mats, vis: 1 });
    });
    for (const entry of this.mats) {
      if (entry.module == null) continue;
      this.modules.find((m) => m.index === entry.module)?.mats.push(entry.mat);
    }
    /* neighbours: axis-aligned footprints whose edges meet (within 0.6 m)
       and overlap at least 1 m along the seam */
    this.adjacency = [];
    for (let i = 0; i < this.modules.length; i++) {
      for (let j = i + 1; j < this.modules.length; j++) {
        const A = this.modules[i];
        const B = this.modules[j];
        const dx = Math.abs(A.centre.x - B.centre.x) - (A.size.x + B.size.x) / 2;
        const dz = Math.abs(A.centre.z - B.centre.z) - (A.size.y + B.size.y) / 2;
        const ovz = Math.min(A.centre.z + A.size.y / 2, B.centre.z + B.size.y / 2) - Math.max(A.centre.z - A.size.y / 2, B.centre.z - B.size.y / 2);
        const ovx = Math.min(A.centre.x + A.size.x / 2, B.centre.x + B.size.x / 2) - Math.max(A.centre.x - A.size.x / 2, B.centre.x - B.size.x / 2);
        if (Math.abs(dx) < 0.6 && ovz > 1) this.adjacency.push({ a: i, b: j, axis: "x", at: (Math.max(A.centre.z - A.size.y / 2, B.centre.z - B.size.y / 2) + Math.min(A.centre.z + A.size.y / 2, B.centre.z + B.size.y / 2)) / 2 });
        else if (Math.abs(dz) < 0.6 && ovx > 1) this.adjacency.push({ a: i, b: j, axis: "z", at: (Math.max(A.centre.x - A.size.x / 2, B.centre.x - B.size.x / 2) + Math.min(A.centre.x + A.size.x / 2, B.centre.x + B.size.x / 2)) / 2 });
      }
    }
    if (this.connectors) {
      this.connectors.removeFromParent();
      this.connectors.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      this.connectors = null;
    }
    /* CAVITY BLOCKS: wall tops → roof underside, inside the walls */
    for (const c of this.cavities) {
      c.removeFromParent();
      c.geometry.dispose();
      (c.material as THREE.Material).dispose();
    }
    this.cavities = [];
    for (const m of this.modules) {
      let wallTop = -Infinity;
      let roofBottom = Infinity;
      m.node.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || o.userData.stencil) return;
        o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox!;
        if (/_wall/.test(o.name)) wallTop = Math.max(wallTop, bb.max.y);
        if (/_roof/.test(o.name)) roofBottom = Math.min(roofBottom, bb.min.y);
      });
      if (!isFinite(wallTop) || !isFinite(roofBottom)) continue;
      /* the walls usually run up to the roof underside, so the void is the
         rafter zone INSIDE them, above the ceiling: a band under the roof */
      const top = Math.min(roofBottom, wallTop);
      const h = roofBottom - wallTop > 0.12 ? roofBottom - wallTop : CAVITY_BAND;
      const geo = new THREE.BoxGeometry(Math.max(0.5, m.size.x - 0.3), h, Math.max(0.5, m.size.y - 0.3));
      const mat = new THREE.MeshStandardMaterial({ color: DIAGRAM.structure, roughness: 1, metalness: 0, transparent: true, clippingPlanes: [this.plane, this.ground] });
      const block = new THREE.Mesh(geo, mat);
      block.name = `cavity~m${m.index}`;
      block.position.set(m.centre.x, roofBottom - wallTop > 0.12 ? wallTop + h / 2 : top - h / 2, m.centre.z);
      block.castShadow = true;
      block.receiveShadow = true;
      m.node.add(block);
      m.mats.push(mat);
      this.mats.push({ mat, cat: "structure", storey: 0, source: new THREE.Color(DIAGRAM.structure), module: m.index });
      this.cavities.push(block);
    }
    if (this.adjacency.length && this.wantConnectors) {
      /* corner-to-corner lines: for each adjacent pair, the two bottom and
         the two top corners of the shared seam, each joined across the gap */
      const group = new THREE.Group();
      group.name = "connectors";
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.adjacency.length * 4 * 2 * 3), 3));
      const mat = new THREE.LineDashedMaterial({ color: "#000000", dashSize: 0.22, gapSize: 0.22, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      const lines = new THREE.LineSegments(geo, mat);
      lines.frustumCulled = false;
      lines.renderOrder = 5;
      group.add(lines);
      group.visible = false;
      scene.add(group);
      this.connectors = group;
    }
    this.buildCap(scene, root);
    if (this.group && !this.plinth) {
      /* large enough for the spread assembly; group space, so its x/z are
         the modules' own (the group turns and slides with the home) */
      const f = this.footprint;
      const span = Math.max(f.width_m, f.depth_m) * (1 + this.explodeGap) + 2 * PLINTH_REACH + 8;
      const geo = new THREE.PlaneGeometry(span, span);
      geo.rotateX(-Math.PI / 2);
      const shadowMat = new THREE.ShadowMaterial({ color: "#000000", opacity: 0, transparent: true, depthWrite: false });
      const shadow = new THREE.Mesh(geo, shadowMat);
      shadow.name = "plinth-shadow";
      shadow.position.y = 0.05;
      shadow.receiveShadow = true;
      shadow.renderOrder = 2;
      shadow.visible = false;
      const contactMat = new THREE.ShaderMaterial({
        vertexShader: CONTACT_VERT,
        fragmentShader: CONTACT_FRAG,
        uniforms: {
          uRects: { value: Array.from({ length: PLINTH_MAX }, () => new THREE.Vector4()) },
          uWeights: { value: new Array<number>(PLINTH_MAX).fill(0) },
          uCount: { value: 0 },
          uOpacity: { value: 0 },
          uReach: { value: PLINTH_REACH },
        },
        transparent: true,
        depthWrite: false,
      });
      const contact = new THREE.Mesh(geo, contactMat);
      contact.name = "plinth-contact";
      contact.position.y = 0.04;
      contact.renderOrder = 1;
      contact.visible = false;
      this.group.add(contact, shadow);
      this.plinth = { shadow, shadowMat, contact, contactMat };
    }
    /* planting rides the model group, so it turns north-up with the home */
    /* doors first: the plan and the lawn both keep their approaches clear */
    this.doors = findDoors(scene);
    this.plan = plantingPlan(this.footprint, 7, this.doors);
    /* the ground's gentle relief: every plant stands at its height */
    const walls = wallBounds(scene);
    const terrain = makeTerrain(this.footprint, walls, this.plan);
    for (const p of this.plan) p.y = terrain(p.x, p.z);
    if (this.group && !this.lawn) {
      this.lawn = buildLawn(this.footprint, this.plan, walls, terrain);
      plantLayer(this.lawn.group);
      this.lawn.group.traverse((o) => (o.receiveShadow = true));
      this.group.add(this.lawn.group);
    }
    if (this.group && this.wantScenery && !this.scenery) {
      /* the basin must clear the landing camera's reach in portrait too
         (the orbit backs off by 1/aspect there) */
      this.scenery = buildScenery(this.footprint, this.radius() * Math.sin(ARRIVE_PHI) * 1.7);
      this.scenery.group.traverse((o) => (o.receiveShadow = o.name === "terrain"));
      this.group.add(this.scenery.group);
      /* haze in the page's own surface colour: far ridges dissolve into the
         page, never a horizon line. Exp² so the home 400 m off is clear and
         the valley 1.2 km below the aerial camera sits in a light haze. */
      root.fog = new THREE.FogExp2("#f3f2ee", 0.0001);
      this.arrived = false;
      this.descent = this.descentDamped = 0;
    }
    this.loadRealPlants();
    this.checkReady();
  }

  /* the painterly cards: only when the real planting can't load */
  private fallbackFoliage() {
    if (!this.group || this.foliage || this.plants) return;
    this.foliage = buildFoliage(this.plan);
    plantLayer(this.foliage.group);
    this.foliage.setFade(this.fade);
    this.group.add(this.foliage.group);
  }

  /* fetched after the house is up, so they never compete with it; the
     cards hold the same spots until the swap, and stay on any failure */
  private loadRealPlants() {
    const group = this.group;
    if (!group || this.plants || this.plantsLoading) return;
    if (!this.plantsBase) {
      this.fallbackFoliage();
      this.plantsSettled = true;
      return;
    }
    this.plantsLoading = true;
    loadPlants(this.plantsBase, this.plan)
      .then((h) => {
        if (!h) {
          this.fallbackFoliage();
          return;
        }
        if (this.group !== group) {
          h.dispose();
          return;
        }
        this.plants = h;
        /* hidden canvas: no visible swap; if they arrive after the
           reveal (slow network), they dissolve in over half a second */
        this.appear = this.isReady ? 0 : 1;
        h.setFade(Math.max(this.fade, (1 - this.appear) / 2));
        plantLayer(h.group);
        /* trees and shrubs cast dappled shade (leaf alpha carries into the
           shadow pass); they don't receive, which keeps leaves clean */
        h.group.traverse((o) => (o.castShadow = true));
        group.add(h.group);
      })
      .catch(() => {
        this.fallbackFoliage();
      })
      .finally(() => {
        this.plantsLoading = false;
        this.plantsSettled = true;
        this.checkReady();
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
      /* material-split walls (…__<material>) are OPEN shells — one node per
         surface colour — so the solid count cannot work on them; they
         fill the drawing with their undersides instead (see GROUND below) */
      if (o instanceof THREE.Mesh && /_(wall|structure)(?:~m\d+)?$/.test(o.name) && !o.userData.capped) solids.push(o);
    });
    const counter = (side: THREE.Side, op: THREE.StencilOp) =>
      new THREE.MeshBasicMaterial({
        side,
        transparent: true,
        colorWrite: false,
        depthWrite: false,
        depthTest: false,
        /* the cut plane only: the stencil count needs the whole solid,
           including the part the ground plane hides — clipping its
           underside away left every wall uncounted (no ink fill) */
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
    const cutY = (this.storeys[input.storey]?.elevation_m ?? 0) - this.groundOffset + CUT_ABOVE_FLOOR;
    this.plane.constant = THREE.MathUtils.lerp(f.height_m + 1, cutY, e);
    /* GROUND: the clip that buries the foundation in 3D lifts away in
       plan — the cut walls' undersides are the drawing's ink, and the
       ones that reach down to the footings were being clipped off */
    this.ground.constant = THREE.MathUtils.lerp(0.02, 100, e);

    /* diagram: the white model for the story's module and assembly steps */
    {
      const dtg = input.mode === "single" || input.mode === "modules" ? 1 : 0;
      const dd = dtg - this.diagram;
      this.diagram = Math.abs(dd) < 0.001 ? dtg : this.diagram + Math.sign(dd) * Math.min(Math.abs(dd), dt * speed);
    }
    const dg = ease(this.diagram);
    /* modules: pull apart / reassemble at the flight's pace */
    if (this.modules.length) {
      const xt = input.mode === "modules" ? 1 : 0;
      const xd = xt - this.explode;
      this.explode = Math.abs(xd) < 0.001 ? xt : this.explode + Math.sign(xd) * Math.min(Math.abs(xd), dt * speed);
      const xe = ease(this.explode) * this.explodeGap;
      for (const m of this.modules) m.node.position.set(m.centre.x * xe, 0, m.centre.z * xe);
      /* the lawn stretches with the spread, so no module hangs off it */
      if (this.lawn) this.lawn.group.scale.set(1 + xe, 1, 1 + xe);
      /* single: everything but the focus module fades, and the home slides
         so that module sits on the orbit centre */
      const st = input.mode === "single" && this.focus != null ? 1 : 0;
      const sd = st - this.single;
      this.single = Math.abs(sd) < 0.001 ? st : this.single + Math.sign(sd) * Math.min(Math.abs(sd), dt * speed);
      const se = ease(this.single);
      const fm = this.modules.find((m) => m.index === this.focus);
      /* the slide is applied AFTER the yaw below, in the turned frame, so
         the focus module spins on the spot (applied before it, the module
         swung round the home's centre through the scroll sweep) */
      this.focusShift.set(fm ? -fm.centre.x * se : 0, 0, fm ? -fm.centre.z * se : 0);
      /* the assembly shows the PREFAB modules only — site-built pieces and
         anything outside a module (decks, rails, site work) belong to the
         finished home — and ghosts every module but the focus one */
      const assembly = input.mode === "modules" ? 1 : 0;
      for (const m of this.modules) {
        let want = 1;
        if (st && m.index !== this.focus) want = 0;
        else if (assembly && m.index !== this.focus) want = m.prefab ? this.ghost : 0;
        m.vis = Math.abs(want - m.vis) < 0.001 ? want : m.vis + Math.sign(want - m.vis) * Math.min(Math.abs(want - m.vis), dt * speed);
      }
      /* connectors across the gaps, only while the modules are apart */
      if (this.connectors) {
        const scale = 1 + xe;
        /* 25% ink while apart, gone in the drawing and the home */
        const op = 0.25 * ease(this.explode) * (1 - e);
        const lines = this.connectors.children[0] as THREE.LineSegments;
        const pos = lines.geometry.attributes.position as THREE.BufferAttribute;
        const yLo = GROUND_BELOW_FLOOR + 0.02;
        const yHi = f.height_m - this.groundOffset;
        let i = 0;
        for (const adj of this.adjacency) {
          const A = this.modules[adj.a];
          const B = this.modules[adj.b];
          /* the seam's two ends along its axis (the overlap of the two
             footprints), at the matching edges of each module */
          const near = adj.axis === "x" ? (A.centre.x < B.centre.x ? A : B) : (A.centre.z < B.centre.z ? A : B);
          const far = near === A ? B : A;
          const lo = Math.max(adj.axis === "x" ? A.centre.z - A.size.y / 2 : A.centre.x - A.size.x / 2, adj.axis === "x" ? B.centre.z - B.size.y / 2 : B.centre.x - B.size.x / 2);
          const hi = Math.min(adj.axis === "x" ? A.centre.z + A.size.y / 2 : A.centre.x + A.size.x / 2, adj.axis === "x" ? B.centre.z + B.size.y / 2 : B.centre.x + B.size.x / 2);
          for (const t of [lo, hi]) {
            for (const y of [yLo, yHi]) {
              if (adj.axis === "x") {
                pos.setXYZ(i++, near.centre.x * scale + near.size.x / 2, y, t * scale);
                pos.setXYZ(i++, far.centre.x * scale - far.size.x / 2, y, t * scale);
              } else {
                pos.setXYZ(i++, t * scale, y, near.centre.z * scale + near.size.y / 2);
                pos.setXYZ(i++, t * scale, y, far.centre.z * scale - far.size.y / 2);
              }
            }
          }
        }
        pos.needsUpdate = true;
        lines.computeLineDistances();
        (lines.material as THREE.LineDashedMaterial).opacity = op;
        this.connectors.visible = op > 0.01;
      }
    }

    /* palette: render → drawing; storeys above the chosen one fade */
    for (const { mat, cat, storey, source, module } of this.mats) {
      const [ra, oa] = RENDER[cat] ?? RENDER.misc;
      const [rb, ob] = PLAN[cat] ?? PLAN.misc;
      if (source) this.a.copy(source);
      else this.a.set(ra);
      this.b.set(rb);
      /* surfaces that LEAVE the drawing (floor, roof) keep their own
         colour while they fade — lerping them toward the plan palette
         flashed them white on the way out (Bryce, 2026-10-05: "the floor
         should never be white") */
      const leaves = ob === 0;
      mat.color.copy(this.a).lerp(this.b, leaves ? 0 : e);
      if (dg > 0) {
        mat.color.lerp(this.c.set(DIAGRAM[cat] ?? DIAGRAM.misc), dg * (1 - e));
        if (module != null && module === this.focus && this.modules.length > 1) mat.color.multiplyScalar(1 - 0.22 * dg * (1 - e));
      }
      const above = input.mode === "plan" && storey > input.storey ? 0 : 1;
      if (cat === "floor") {
        /* the floor is simply gone in plan: transparent within the first
           sixth of the flight, before the cut reaches it */
        mat.opacity = THREE.MathUtils.lerp(oa, 0, Math.min(1, e / 0.15)) * THREE.MathUtils.lerp(1, above, e);
      } else if (mat instanceof THREE.MeshPhysicalMaterial) {
        /* glass: clear and refractive in 3D, a flat blue line in plan */
        mat.transmission = THREE.MathUtils.lerp(GLASS_TRANSMISSION, 0, e);
        mat.opacity = THREE.MathUtils.lerp(1, ob, e) * THREE.MathUtils.lerp(1, above, e);
      } else {
        mat.opacity = THREE.MathUtils.lerp(oa, ob, e) * THREE.MathUtils.lerp(1, above, e);
      }
      mat.visible = mat.opacity > 0.01;
      /* the drawing is matte: metal and gloss fade with the palette */
      const own = mat.userData.finish as { rough: number; metal: number } | undefined;
      const [rough, metal] = own ? [own.rough, own.metal] : (SURFACE[cat] ?? SURFACE.misc);
      mat.roughness = THREE.MathUtils.lerp(rough, 1, Math.max(e, dg));
      mat.metalness = THREE.MathUtils.lerp(metal, 0, Math.max(e, dg));
      /* the sky's blue cast leaves the drawing with the palette: a plan is
         flat ink on paper, not a lit model */
      /* three ignores a material's envMapIntensity when the light comes
         from scene.environment (it uses scene.environmentIntensity for
         every material), so the house's materials hold the sky THEMSELVES —
         only then do the per-surface strengths below (glass mirrors, roof
         stays black, the drawing goes matte) take effect */
      const env = this.root?.environment ?? null;
      if (mat.envMap !== env) {
        mat.envMap = env;
        mat.needsUpdate = true;
      }
      /* the white model keeps most of the sky's fill (it is what lights
         its shaded faces — without it they went black), just not the
         glass boost */
      mat.envMapIntensity = THREE.MathUtils.lerp(THREE.MathUtils.lerp(cat === "glass" ? this.lookPreset.glassBoost : (ENV_BOOST[cat] ?? 1), DIAGRAM_ENV, dg), 0.15, e) * (this.root?.environmentIntensity ?? 1);
      if (mat instanceof THREE.MeshPhysicalMaterial) mat.transmission = THREE.MathUtils.lerp(GLASS_TRANSMISSION, 0, Math.max(e, dg));
      const shader = mat.userData.shader as { uniforms: { uPlan: { value: number }; uDiagram?: { value: number } } } | undefined;
      if (shader) {
        shader.uniforms.uPlan.value = e;
        if (shader.uniforms.uDiagram) shader.uniforms.uDiagram.value = dg;
      }
    }
    for (const m of this.modules) {
      if (m.vis >= 1) continue;
      for (const mat of m.mats) {
        const mm = mat as THREE.MeshStandardMaterial;
        mm.opacity *= m.vis;
        mm.visible = mm.opacity > 0.01;
      }
    }
    /* …and what belongs to no module (deck rails, posts, site work) leaves
       with them, so the single module stands alone */
    if (this.diagram > 0) {
      const keep = 1 - dg;
      for (const { mat, module } of this.mats) {
        if (module != null) continue;
        mat.opacity *= keep;
        mat.visible = mat.opacity > 0.01;
      }
    }

    /* yaw: spin in 3D, settle to north-up in plan */
    if (this.group) {
      /* the camera keeps its azimuth θ on the flight, so screen-up in the
         top view is −(sin θ, cos θ); turning the model by θ more lands
         north on screen-up by the shortest way round */
      const north = THREE.MathUtils.degToRad(input.northDeg) + (this.hasOrbitPos ? this.flightTheta : 0);
      if (!this.dragged && this.progress < 0.01) {
        /* scroll-tied: 0 as the viewer's top enters the bottom of the
           window, 1 once the viewer is centred */
        const r = state.gl.domElement.getBoundingClientRect();
        const vh = window.innerHeight || 1;
        const p = THREE.MathUtils.clamp((vh - r.top) / ((vh + r.height) / 2), 0, 1);
        const goal = REST_YAW - SWEEP * (1 - ease(p));
        /* hidden (not yet revealed) or reduced motion: sit on the goal, so
           the first visible frame is already in the right pose */
        this.yaw = input.reduce ? REST_YAW : !this.isReady ? goal : this.yaw + (goal - this.yaw) * (1 - Math.exp(-dt * YAW_DAMP));
      }
      const twoPi = Math.PI * 2;
      const diff = ((((north - this.yaw + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
      this.group.rotation.y = this.yaw + diff * e;
      this.group.position.copy(this.focusShift).applyAxisAngle(UP, this.group.rotation.y);
    }

    /* camera: orbit (OrbitControls) in 3D, flight to the top in plan */
    const cam = state.camera as THREE.PerspectiveCamera;
    if (this.controls) this.controls.enabled = this.progress < 0.02 && this.arrived;
    /* the section fill rides the cut plane (plane: −y + c = 0 → y = c) */
    if (this.cap) {
      this.cap.position.y = this.plane.constant;
      this.cap.visible = e > 0.01;
    }
    this.fade = e;
    const gone = Math.max(e, dg); // the drawing and the white model both stand on nothing
    this.foliage?.setFade(gone);
    if (this.plants) {
      this.appear = Math.min(1, this.appear + dt / 0.5);
      this.plants.setFade(Math.max(gone, (1 - this.appear) / 2));
    }
    this.lawn?.setFade(gone);
    this.scenery?.setFade(e); // the wilderness leaves with the drawing
    /* the plan has no colour: saturation goes to −1 (full grey) on landing */
    /* a touch calmer than raw in 3D (Samara's "less stark"), no colour in plan */
    if (this.sat) this.sat.saturation = THREE.MathUtils.lerp(this.lookPreset.saturation, -1, e);
    /* opaque backdrop: re-solve only when the page colour or the chain's
       saturation moves */
    if (this.root) {
      if (this.backdrop) {
        const s = this.sat?.saturation ?? 0;
        const key = `${this.backdrop.join(",")}|${s.toFixed(4)}`;
        if (key !== this.bgKey) {
          this.bgKey = key;
          backdropPreimage(this.backdrop, s, this.bgColor);
          this.inkShadow = inkAlpha(this.backdrop, s, PLINTH_SHADOW);
          this.inkContact = inkAlpha(this.backdrop, s, PLINTH_CONTACT);
        }
        if (this.root.background !== this.bgColor) this.root.background = this.bgColor;
      } else {
        if (this.root.background === this.bgColor) this.root.background = null;
        this.inkShadow = PLINTH_SHADOW;
        this.inkContact = PLINTH_CONTACT;
      }
    }
    /* shadows leave with the 3D view: the drawing is flat */
    if (this.sunLight) {
      this.sunLight.shadow.intensity = 1 - e; // shadows stay at full in the white model — they are what makes it read
      /* the white model is lit like a study model — a gentler sun and a
         soft fill — so its shaded faces read mid-grey, not slate */
      this.sunLight.intensity = THREE.MathUtils.lerp(this.lookPreset.sun.intensity, DIAGRAM_SUN, dg);
    }
    if (this.root) {
      if (!this.fillLight) {
        this.fillLight = new THREE.AmbientLight("#ffffff", 0);
        this.root.add(this.fillLight);
      }
      this.fillLight.intensity = DIAGRAM_FILL * dg;
    }
    /* the ground under the white model: the sun's shadow and the contact
       gradient round each standing module, fading with the drawing and
       the finished home (whose lawn carries its own grounding) */
    if (this.plinth) {
      const on = dg * (1 - e);
      const p = this.plinth;
      p.shadowMat.opacity = this.inkShadow * on;
      p.contactMat.uniforms.uOpacity.value = this.inkContact * on;
      p.shadow.visible = p.contact.visible = on > 0.01;
      if (on > 0.01) {
        const rects = p.contactMat.uniforms.uRects.value as THREE.Vector4[];
        const weights = p.contactMat.uniforms.uWeights.value as number[];
        let n = 0;
        for (const m of this.modules) {
          if (n >= PLINTH_MAX || m.vis < 0.02) continue;
          rects[n].set(m.centre.x + m.node.position.x, m.centre.z + m.node.position.z, m.size.x / 2, m.size.y / 2);
          weights[n] = m.vis;
          n++;
        }
        if (n === 0) {
          /* a model with no module map grounds on its footprint */
          rects[0].set(0, 0, f.width_m / 2, f.depth_m / 2);
          weights[0] = 1;
          n = 1;
        }
        p.contactMat.uniforms.uCount.value = n;
      }
    }
    if (this.progress > 0.001) {
      /* spherical path from the orbit pose to straight above: the polar
         angle closes to the top, the azimuth holds (no camera spin — the
         only turn is the model settling north-up), the radius eases to
         the plan distance. Deterministic in e, so no chase and no snap. */
      /* the plan distance FITS the north-up footprint in the frame: the
         footprint turned by northDeg, the longer screen axis against the
         viewport aspect, 12% air. (A flat ×6 cropped the Method home's
         50 m long axis top and bottom, 2026-10-09.) */
      const rot = THREE.MathUtils.degToRad(input.northDeg);
      const wr = Math.abs(f.width_m * Math.cos(rot)) + Math.abs(f.depth_m * Math.sin(rot));
      const dr = Math.abs(f.width_m * Math.sin(rot)) + Math.abs(f.depth_m * Math.cos(rot));
      /* the plan fills 80% of the container's limiting axis (Bryce, 2026-10-09) */
      const fit = Math.max(dr, wr / Math.max(cam.aspect, 0.5)) / 0.8;
      const topDistance = fit / (2 * Math.tan(THREE.MathUtils.degToRad(FOV_PLAN / 2)));
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
      /* a portrait container (phones: 75svh tall, 428 wide) sees a narrower
         slice — back the camera off by the inverse aspect so the long home
         is not cropped at the sides (2026-10-09) */
      const fm = this.modules.find((m) => m.index === this.focus);
      /* the module's diagonal (it is seen three-quarter on) plus air */
      const rSingle = fm ? Math.max(Math.hypot(fm.size.x, fm.size.y) * 1.15, f.height_m * 1.6) * ORBIT_RADIUS : this.radius();
      const se2 = ease(this.single);
      const r = THREE.MathUtils.lerp(this.radius() * this.distance, rSingle * this.distanceSingle, se2) * Math.max(1, 1 / Math.max(cam.aspect, 0.3)) * (1 + ease(this.explode) * this.explodeGap);
      if (this.scenery) {
        /* scroll progress through the pinned wrapper: 0 as its top meets
           the viewport top, 1 when its bottom does */
        const wrap = state.gl.domElement.closest("[data-descent]") as HTMLElement | null;
        let p = 1;
        if (wrap) {
          const rc = wrap.getBoundingClientRect();
          const vh = window.innerHeight || 1;
          p = THREE.MathUtils.clamp(-rc.top / Math.max(1, rc.height - vh), 0, 1);
        }
        this.descent = p;
        this.descentDamped = input.reduce || !this.isReady ? p : this.descentDamped + (p - this.descentDamped) * (1 - Math.exp(-dt * DESCENT_DAMP));
        /* smoothstep, not the cubic page ease: the first quarter of the
           scroll must already move the camera */
        const d = THREE.MathUtils.smoothstep(this.descentDamped, 0, 1);
        this.scenery.setFade(e);
        this.scenery.update(cam.position.y, this.descentDamped, state.clock.elapsedTime);
        const arrived = d > 0.995;
        if (arrived !== this.arrived) {
          this.arrived = arrived;
          this.onArrive?.(arrived);
        }
        if (!arrived) {
          /* from straight above the cloud deck (wide lens) down a spiral to
             the framed three-quarter view (the 8° lens): radius eases in log
             space so the fall feels even, the azimuth unwinds ~50° */
          const startR = Math.max(3000, r * 8);
          const radius = Math.exp(THREE.MathUtils.lerp(Math.log(startR), Math.log(r), d));
          const phi = THREE.MathUtils.lerp(0.05, ARRIVE_PHI, d);
          const theta = ARRIVE_THETA + 0.9 * (1 - d);
          cam.position.setFromSphericalCoords(radius, phi, theta);
          cam.fov = THREE.MathUtils.lerp(FOV_AERIAL, FOV_3D, d);
          this.look.set(0, THREE.MathUtils.lerp(0, f.height_m * 0.4, d), 0);
          cam.lookAt(this.look);
          cam.updateProjectionMatrix();
          return;
        }
      }
      /* near/far hug the CURRENT orbit radius: the single-module orbit
         is a quarter of the home's, and the home sat inside the near
         plane until these followed it */
      const near = this.scenery ? cam.near : r * 0.3;
      const far = this.scenery ? cam.far : r * 3;
      if (Math.abs(cam.fov - FOV_3D) > 0.01 || Math.abs(cam.near - near) > 0.01 || Math.abs(cam.far - far) > 0.01) {
        cam.fov = FOV_3D;
        cam.near = near;
        cam.far = far;
        cam.updateProjectionMatrix();
      }
      const len = cam.position.length();
      /* while the orbit radius is animating (single ↔ home, apart ↔
         together) the camera rides it every frame — no snaps */
      const moving = (this.single > 0 && this.single < 1) || (this.explode > 0 && this.explode < 1);
      if (moving || len < r * 0.8 || len > r * 1.25) cam.position.setLength(r);
    }
  }
}

/* the descent's start lens and its landing pose — the Canvas camera's
   initial position [0.8, 0.45, 0.6]·r in spherical terms */
const GROUND_BELOW_FLOOR = 0.3; // m of plinth showing under the lowest habitable floor
const EXPLODE_GAP = 0.35; // module positions scale by 1 + this when pulled apart
const CAVITY_BAND = 1.2; // m of solid under the roof when the walls already reach it
const FOV_AERIAL = 42;
const ARRIVE_PHI = Math.acos(0.45 / Math.hypot(0.8, 0.45, 0.6));
const ARRIVE_THETA = Math.atan2(0.8, 0.6);
const DESCENT_DAMP = 6; // 1/s

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
  v.gl = gl;
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

export function PlanViewer({ src, northDeg, mode: modeProp, onModeChange, modes: modesProp, labels, focusRoom, explodeGap = EXPLODE_GAP, connectors = false, hideControls = false, occlusion = false, fill = false, distance = 1, distanceSingle, className = "", envBase, plantsBase = DEFAULT_PLANTS_BASE, onReady, showLoading = true, look: lookProp, descent = false }: PlanViewerProps) {
  const [mode, setMode] = useState<Mode>(modeProp ?? modesProp?.[0] ?? "3d");
  /* a section that owns the toggle drives the step from outside */
  useEffect(() => {
    if (modeProp) setMode(modeProp);
  }, [modeProp]);
  const [arrived, setArrived] = useState(!descent);
  const lenis = useLenis();
  const rootRef = useRef<HTMLDivElement>(null);
  /* SKIP: jump to the end of the pinned wrapper (through Lenis when it runs
     the page, so the easing is the site's) */
  const skip = () => {
    const wrap = rootRef.current?.closest("[data-descent]") as HTMLElement | null;
    if (!wrap) return;
    const top = wrap.getBoundingClientRect().top + window.scrollY + wrap.offsetHeight - window.innerHeight;
    if (lenis) lenis.scrollTo(top);
    else window.scrollTo({ top, behavior: "smooth" });
  };
  /* the look: prop, else ?look= (previews), else daylight — fixed for the
     component's life so the sky loads once */
  const [lookName] = useState<LookName>(() => {
    if (lookProp) return lookProp;
    if (typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search).get("look");
      if (q && q in LOOKS) return q as LookName;
    }
    return DEFAULT_LOOK;
  });
  const look = LOOKS[lookName];
  const skyBase = envBase ?? look.envBase;
  const [storey, setStorey] = useState(0);
  /* the canvas fades in once, when everything has settled (no flash) */
  const [ready, setReady] = useState(false);
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
  vs.current.lookPreset = look;
  vs.current.distance = distance;
  vs.current.distanceSingle = distanceSingle ?? distance;
  vs.current.wantConnectors = connectors;
  vs.current.wantScenery = descent;
  vs.current.onArrive = setArrived;
  /* fill mode: the canvas clears to the page colour behind it (read from
     the DOM once mounted; the section's data-mode fixes it) */
  useEffect(() => {
    const v = vs.current;
    if (!v) return;
    v.backdrop = fill ? pageColourBehind(rootRef.current) : null;
  }, [fill]);
  const { scene } = useGLTF(src);
  const extras = (scene.userData as Extras | undefined) ?? {};
  const all = extras.storeys ?? [{ index: 0, name: "Ground", elevation_m: 0 }];
  /* only levels with walls get a pill (Revit exports its roof level as
     a storey; a plan cut there shows the roof slab) */
  /* …and only levels with an opening on them (a door or a window): walls
     alone are a foundation or a parapet. Read off the mesh names so an
     older GLB whose extras still flag those levels behaves the same
     (Bryce, 2026-10-09: "only the first floor, no toggle") */
  const lived = new Set<number>();
  scene.traverse((o) => {
    const m = o.name.match(/^storey(\d+)_(door|glass|frame)\b/);
    if (m) lived.add(Number(m[1]));
  });
  const habitable = all.filter((s) => s.habitable !== false && (lived.size === 0 || lived.has(s.index)));
  const storeys = habitable.length ? habitable : all;
  /* the storey state is the RAW index into extras.storeys (what the mesh
     names and the cut height use). Until a pill is pressed it is 0 — and
     on a Revit export the storey at 0 is "INTERNAL ORIGIN", two
     kilometres below the house (Method sample, 2026-10-09): the plan cut
     landed under the ground and showed nothing. Default to the first
     habitable storey instead. */
  const current = storeys.some((s) => s.index === storey) ? storey : (storeys[0]?.index ?? 0);
  let hasModules = false;
  scene.traverse((o) => {
    if (/^module\d+$/.test(o.name)) hasModules = true;
  });
  const modes: Mode[] = (modesProp ?? (hasModules ? ["3d", "plan", "modules"] : ["3d", "plan"])).filter((m) => hasModules || (m !== "modules" && m !== "single"));
  /* the focus module: by a room it holds, else by its own name */
  const moduleInfos = (extras as { modules?: { index: number; name?: string; rooms?: string[] }[] }).modules ?? [];
  const want = focusRoom?.trim().toLowerCase();
  const focus = want ? (moduleInfos.find((m) => (m.rooms ?? []).some((r) => r.toLowerCase() === want)) ?? moduleInfos.find((m) => (m.name ?? "").toLowerCase() === want))?.index ?? null : null;
  vs.current.focus = focus;
  vs.current.explodeGap = explodeGap;
  const label = (m: Mode) => labels?.[m] ?? (m === "3d" ? "3D" : m === "plan" ? "Floor plan" : m === "modules" ? "Modules" : focusRoom ? `${focusRoom[0].toUpperCase()}${focusRoom.slice(1).toLowerCase()} module` : "One module");
  const fp = extras.footprint ?? { width_m: 12, depth_m: 10, height_m: 8 };
  const north = northDeg ?? extras.northDeg ?? 0;
  const radius = Math.max(fp.width_m, fp.depth_m, fp.height_m) * ORBIT_RADIUS * distance;
  /* the shadow frustum's half-width: the home, its trees and their shade */
  const shadowSpan = Math.max(fp.width_m, fp.depth_m) / 2 + 9;
  /* Samara's trick: render at a lower ratio while the pointer is down and
     restore 200 ms after it lifts, so drags stay fluid on any GPU */
  const [interacting, setInteracting] = useState(false);
  const restore = useRef(0);
  const onDown = () => {
    window.clearTimeout(restore.current);
    setInteracting(true);
    /* the user has the model now: scroll no longer turns it */
    const v = vs.current;
    if (v) v.dragged = true;
  };
  const onUp = () => {
    window.clearTimeout(restore.current);
    restore.current = window.setTimeout(() => setInteracting(false), 200);
  };

  useEffect(() => {
    const v = vs.current;
    if (!v) return;
    v.onReady = () => setReady(true);
    if (v.isReady) setReady(true);
    /* never hold the view back for long: reveal after 6 s regardless (a
       late planting then dissolves in) */
    const t = window.setTimeout(() => setReady(true), 6000);
    return () => {
      window.clearTimeout(t);
      v.onReady = null;
    };
  }, []);
  const readyCb = useRef(onReady);
  useEffect(() => {
    readyCb.current = onReady;
  }, [onReady]);
  useEffect(() => {
    if (ready) readyCb.current?.();
  }, [ready]);
  const onSkyDone = useCallback(() => {
    const v = vs.current;
    if (!v) return;
    v.skySettled = true;
    v.checkReady();
  }, []);

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
    <div ref={rootRef} className={`relative w-full overflow-hidden ${descent || fill ? "h-full bg-transparent" : "rounded-md bg-surface-2"} ${className}`} data-mode-3d={mode}>
      {!ready && showLoading && <p className="label absolute bottom-xl left-xl z-10 rounded-(--radius-full) bg-surface px-2xl py-md text-ink-3">Loading 3D view…</p>}
      {/* 75% of the viewport height on phones (Bryce, 2026-10-09), 16:9 from
          md up; a viewport fraction has no spacing token by nature */}
      <div className={`w-full transition-opacity duration-700 ease-out ${descent || fill ? "h-full" : "h-[75svh] md:aspect-[16/9] md:h-auto"}`} style={{ opacity: ready ? 1 : 0 }}>
        <Canvas
          shadows="variance"
          onCreated={({ camera }) => camera.layers.enable(PLANT_LAYER)}
          dpr={interacting ? Math.min(dpr, 1.25) : dpr}
          /* near/far hug the orbit radius: with the camera ~170 m out a
             0.1 m near plane would starve depth precision and the panes
             would fight their frames */
          camera={{ position: [radius * 0.8, radius * 0.45, radius * 0.6], fov: FOV_3D, near: descent ? 20 : radius * 0.3, far: descent ? 14000 : radius * 3 }}
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
          <hemisphereLight args={["#f4f3ef", "#6d6c68", sun ? look.hemi : 0.45]} />
          {/* the sun: aligned with the HDRI's once env.json arrives */}
          {/* SOFT SUN SHADOWS (variance shadow map, blurred): the eaves
              shade the walls, the home and trees shade the lawn — the depth
              Samara's renders have and ours lacked. The frustum hugs the
              site so texels stay ~2 cm; the light stays put while the home
              turns, so shadows move as they would. */}
          <directionalLight
            ref={(l) => {
              const v = vs.current;
              if (v) v.sunLight = l;
            }}
            position={sun ? [sun[0] * 40, sun[1] * 40, sun[2] * 40] : [12, 16, 8]}
            /* the key: strong and a touch warm against the cooler sky, so
               sunlit faces and shade read apart */
            intensity={sun ? look.sun.intensity : 1.25}
            color={sun ? look.sun.color : "#ffffff"}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-shadowSpan}
            shadow-camera-right={shadowSpan}
            shadow-camera-top={shadowSpan}
            shadow-camera-bottom={-shadowSpan}
            shadow-camera-near={5}
            shadow-camera-far={90}
            shadow-radius={9}
            shadow-blurSamples={16}
            shadow-bias={-0.0004}
            shadow-normalBias={0.03}
          />
          {/* fill from the opposite side so the shaded elevations keep their panel reveals */}
          <directionalLight position={sun ? [-sun[0] * 30, 8, -sun[2] * 30] : [-10, 6, -8]} intensity={sun ? look.fill : 0.3} />
          <SkyEnvironment base={skyBase} intensity={look.envIntensity} onSun={setSun} onDone={onSkyDone} />
          {/* resolution steps down only on a sustained low frame rate, never
              on the brief dip of a mode flight (that read as a quality drop) */}
          <PerformanceMonitor ms={1500} iterations={6} threshold={0.6} onDecline={() => setDpr(1.25)} onIncline={() => setDpr(2)} flipflops={2} onFallback={() => setDpr(1.25)} />
          <House src={src} vs={vs} plantsBase={plantsBase} input={{ mode, storey: current, northDeg: north, reduce }} />
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
            {occlusion && <N8AO aoRadius={1.6} intensity={2.2} distanceFalloff={0.6} quality="medium" halfRes />}
            <ToneMapping mode={look.tone} />
            {(look.brightness !== 0 || look.contrast !== 0) && <BrightnessContrast brightness={look.brightness} contrast={look.contrast} />}
            {look.vignette > 0 && <Vignette offset={0.3} darkness={look.vignette} />}
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

      {/* mode + storey controls: DOM, library-styled; centred along the
          bottom edge, 20 px up (Bryce, 2026-10-09 — between the xl and 2xl
          tokens, so 1.25rem is set outright) */}
      {descent && !arrived && (
        <button type="button" onClick={skip} className="label pointer-events-auto absolute bottom-[1.25rem] left-1/2 -translate-x-1/2 rounded-(--radius-full) bg-surface px-2xl py-md text-ink-3 transition-colors hover:text-ink">
          Skip
        </button>
      )}
      {!hideControls && (
      <div className={`pointer-events-none absolute inset-x-0 bottom-[1.25rem] flex flex-wrap items-center justify-center gap-lg px-xl transition-opacity duration-500 ${arrived ? "opacity-100" : "opacity-0"}`} aria-hidden={!arrived}>
        <div role="group" aria-label="View" className={`${arrived ? "pointer-events-auto" : "pointer-events-none"} flex items-center gap-xxs rounded-(--radius-full) bg-line-2 p-xxs`}>
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => change(m)}
              className={`relative rounded-(--radius-full) px-2xl py-md text-body-sm font-medium transition-colors ${mode === m ? "bg-surface text-ink" : "text-ink-3 hover:text-ink"}`}
            >
              {label(m)}
            </button>
          ))}
        </div>
        {mode === "plan" && storeys.length > 1 && (
          <div role="group" aria-label="Storey" className="pointer-events-auto flex items-center gap-xxs rounded-(--radius-full) bg-line-2 p-xxs">
            {storeys.map((s) => (
              <button
                key={s.index}
                type="button"
                aria-pressed={current === s.index}
                onClick={() => setStorey(s.index)}
                className={`rounded-(--radius-full) px-2xl py-md text-body-sm font-medium transition-colors ${current === s.index ? "bg-surface text-ink" : "text-ink-3 hover:text-ink"}`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>
      )}
      {mode === "plan" && <p aria-hidden className="label absolute right-xl top-xl text-ink-3">N ↑</p>}
    </div>
  );
}

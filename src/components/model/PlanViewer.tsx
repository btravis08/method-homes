"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type RootState } from "@react-three/fiber";
import { OrbitControls, PerformanceMonitor, useGLTF } from "@react-three/drei";
import { BrightnessContrast, EffectComposer, HueSaturation, ToneMapping, Vignette } from "@react-three/postprocessing";
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
  mode?: "3d" | "plan";
  onModeChange?: (mode: "3d" | "plan") => void;
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
    float k = (1.0 - uPlan) * vertical * uRelief; // uRelief 0: a flat material (concrete, interior layers) — the sill logic below still applies
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
    float k = (1.0 - uPlan) * plane * coverage;
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
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuse, uPlan);
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
  /* `source` = the GLB's own colour when the pipeline kept the IFC's
     siding material (node `storey0_wall__cedar-siding-8a6a4b`); the
     category palette otherwise */
  mats: { mat: THREE.MeshStandardMaterial; cat: string; storey: number; source: THREE.Color | null }[] = [];
  /* the active look's material + grade parameters (set by the component) */
  lookPreset: Look = LOOKS[DEFAULT_LOOK];
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
      /* storey<N>_<category>[__<material-key>] — the suffix marks a wall
         node whose glTF material carries the IFC's real siding colour
         (ifc-to-glb --keep-materials, 2026-10-09): that colour is kept
         instead of the palette's off-white */
      const m = o.name.match(/^storey(\d+)_([a-z]+)(?:__(.+))?$/);
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
              new THREE.MeshPhysicalMaterial({ ...common, opacity: 1, transmission: GLASS_TRANSMISSION, ior: 1.7, thickness: 0.02, roughness: 0.03, metalness: 0, specularIntensity: 1.6, envMapIntensity: this.lookPreset.glassBoost })
            : new THREE.MeshStandardMaterial(common);
        finish(mat, cat, fin ? fin.relief : true, baked && cat !== "glass");
        mat.userData.viewer = true;
        if (source) mat.userData.source = source;
        if (fin || baked) mat.userData.finish = { rough: mat.roughness, metal: mat.metalness };
        (o.material as THREE.Material).dispose?.();
        o.material = mat;
      }
      this.mats.push({ mat: o.material as THREE.MeshStandardMaterial, cat, storey, source });
      /* SUN SHADOWS: the home shades itself (eaves on the walls) and the
         lawn. Glass passes light (no cast), so rooms don't go black. */
      o.castShadow = cat !== "glass";
      o.receiveShadow = true;
    });
    this.buildCap(scene, root);
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
    for (const { mat, cat, storey, source } of this.mats) {
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
      mat.roughness = THREE.MathUtils.lerp(rough, 1, e);
      mat.metalness = THREE.MathUtils.lerp(metal, 0, e);
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
      mat.envMapIntensity = THREE.MathUtils.lerp(cat === "glass" ? this.lookPreset.glassBoost : (ENV_BOOST[cat] ?? 1), 0.15, e) * (this.root?.environmentIntensity ?? 1);
      const shader = mat.userData.shader as { uniforms: { uPlan: { value: number } } } | undefined;
      if (shader) shader.uniforms.uPlan.value = e;
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
    this.foliage?.setFade(e);
    if (this.plants) {
      this.appear = Math.min(1, this.appear + dt / 0.5);
      this.plants.setFade(Math.max(e, (1 - this.appear) / 2));
    }
    this.lawn?.setFade(e);
    this.scenery?.setFade(e); // the wilderness leaves with the drawing
    /* the plan has no colour: saturation goes to −1 (full grey) on landing */
    /* a touch calmer than raw in 3D (Samara's "less stark"), no colour in plan */
    if (this.sat) this.sat.saturation = THREE.MathUtils.lerp(this.lookPreset.saturation, -1, e);
    /* shadows leave with the 3D view: the drawing is flat */
    if (this.sunLight) this.sunLight.shadow.intensity = 1 - e;
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
      const r = this.radius() * Math.max(1, 1 / Math.max(cam.aspect, 0.3));
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
      if (Math.abs(cam.fov - FOV_3D) > 0.01) {
        cam.fov = FOV_3D;
        cam.updateProjectionMatrix();
      }
      const len = cam.position.length();
      if (len < r * 0.8 || len > r * 1.25) cam.position.setLength(r);
    }
  }
}

/* the descent's start lens and its landing pose — the Canvas camera's
   initial position [0.8, 0.45, 0.6]·r in spherical terms */
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

export function PlanViewer({ src, northDeg, mode: initialMode = "3d", onModeChange, className = "", envBase, plantsBase = DEFAULT_PLANTS_BASE, onReady, showLoading = true, look: lookProp, descent = false }: PlanViewerProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
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
  vs.current.wantScenery = descent;
  vs.current.onArrive = setArrived;
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
  const fp = extras.footprint ?? { width_m: 12, depth_m: 10, height_m: 8 };
  const north = northDeg ?? extras.northDeg ?? 0;
  const radius = Math.max(fp.width_m, fp.depth_m, fp.height_m) * ORBIT_RADIUS;
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
    <div ref={rootRef} className={`relative w-full overflow-hidden bg-surface-2 ${descent ? "h-full" : "rounded-md"} ${className}`} data-mode-3d={mode}>
      {!ready && showLoading && <p className="label absolute bottom-xl left-xl z-10 rounded-(--radius-full) bg-surface px-2xl py-md text-ink-3">Loading 3D view…</p>}
      {/* 75% of the viewport height on phones (Bryce, 2026-10-09), 16:9 from
          md up; a viewport fraction has no spacing token by nature */}
      <div className={`w-full transition-opacity duration-700 ease-out ${descent ? "h-full" : "h-[75svh] md:aspect-[16/9] md:h-auto"}`} style={{ opacity: ready ? 1 : 0 }}>
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
      <div className={`pointer-events-none absolute inset-x-0 bottom-[1.25rem] flex flex-wrap items-center justify-center gap-lg px-xl transition-opacity duration-500 ${arrived ? "opacity-100" : "opacity-0"}`} aria-hidden={!arrived}>
        <div role="group" aria-label="View" className={`${arrived ? "pointer-events-auto" : "pointer-events-none"} flex items-center gap-xxs rounded-(--radius-full) bg-line-2 p-xxs`}>
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
      {mode === "plan" && <p aria-hidden className="label absolute right-xl top-xl text-ink-3">N ↑</p>}
    </div>
  );
}

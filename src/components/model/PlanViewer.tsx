"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type RootState } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

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
}

type Mode = "3d" | "plan";
interface Storey { index: number; name: string; elevation_m: number; habitable?: boolean }
interface Footprint { width_m: number; depth_m: number; height_m: number }
interface Extras { northDeg?: number; storeys?: Storey[]; footprint?: Footprint }

const CUT_ABOVE_FLOOR = 1.2; // metres — the conventional plan cut height
const FOV_3D = 35;
const FOV_PLAN = 8; // narrow + far ≈ orthographic
const SPEED = 1.6; // mode transition, 1/s
const SPIN = 0.15; // rad/s
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/* the two palettes, keyed by the pipeline's category names */
const RENDER: Record<string, [string, number]> = {
  wall: ["#ece9e2", 1], floor: ["#cfc9bf", 1], roof: ["#5b5b58", 1], glass: ["#9dbccb", 0.5],
  door: ["#8b6d52", 1], stair: ["#b3a897", 1], rail: ["#4d4d4a", 1], structure: ["#99948c", 1], misc: ["#bfbab2", 1],
};
const PLAN: Record<string, [string, number]> = {
  wall: ["#161716", 1], floor: ["#f7f8f4", 1], roof: ["#f7f8f4", 0], glass: ["#9dbccb", 0.9],
  door: ["#8b6d52", 1], stair: ["#b3a897", 1], rail: ["#4d4d4a", 1], structure: ["#161716", 1], misc: ["#b4b4b1", 1],
};

interface Inputs { mode: Mode; storey: number; northDeg: number; reduce: boolean; spinning: boolean }

/* all mutable three.js state, driven from the frame loop */
class ViewerState {
  group: THREE.Group | null = null;
  controls: { enabled: boolean } | null = null;
  plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 100);
  mats: { mat: THREE.MeshStandardMaterial; cat: string; storey: number }[] = [];
  storeys: Storey[] = [{ index: 0, name: "Ground", elevation_m: 0 }];
  footprint: Footprint = { width_m: 12, depth_m: 10, height_m: 8 };
  progress = 0; // 0 = 3D, 1 = plan
  yaw = 0;
  private a = new THREE.Color();
  private b = new THREE.Color();
  private look = new THREE.Vector3();
  private top = new THREE.Vector3();

  attach(scene: THREE.Object3D, gl: THREE.WebGLRenderer, initial: Mode) {
    gl.localClippingEnabled = true;
    const extras = (scene.userData as Extras | undefined) ?? {};
    if (extras.storeys?.length) this.storeys = extras.storeys;
    if (extras.footprint) this.footprint = extras.footprint;
    this.plane.constant = this.footprint.height_m + 1;
    this.progress = initial === "plan" ? 1 : 0;
    this.mats = [];
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const m = o.name.match(/^storey(\d+)_(\w+)$/);
      const cat = m ? m[2] : "misc";
      const storey = m ? Number(m[1]) : 0;
      if (!(o.material instanceof THREE.MeshStandardMaterial && o.material.userData.viewer)) {
        const mat = new THREE.MeshStandardMaterial({
          color: (RENDER[cat] ?? RENDER.misc)[0],
          roughness: cat === "glass" ? 0.25 : 0.9,
          metalness: 0,
          transparent: true,
          opacity: (RENDER[cat] ?? RENDER.misc)[1],
          side: THREE.DoubleSide,
          clippingPlanes: [this.plane],
        });
        mat.userData.viewer = true;
        (o.material as THREE.Material).dispose?.();
        o.material = mat;
      }
      this.mats.push({ mat: o.material as THREE.MeshStandardMaterial, cat, storey });
    });
  }

  radius() {
    const f = this.footprint;
    return Math.max(f.width_m, f.depth_m, f.height_m) * 1.6;
  }

  tick(state: RootState, dt: number, input: Inputs) {
    const target = input.mode === "plan" ? 1 : 0;
    const speed = input.reduce ? 1000 : SPEED;
    const d = target - this.progress;
    this.progress = Math.abs(d) < 0.001 ? target : this.progress + Math.sign(d) * Math.min(Math.abs(d), dt * speed);
    const e = ease(this.progress);
    const f = this.footprint;

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
      mat.opacity = THREE.MathUtils.lerp(oa, ob, e) * THREE.MathUtils.lerp(1, above, e);
      mat.visible = mat.opacity > 0.01;
    }

    /* yaw: spin in 3D, settle to north-up in plan */
    if (this.group) {
      const north = THREE.MathUtils.degToRad(input.northDeg);
      if (target === 0 && input.spinning && !input.reduce && this.progress < 0.01) this.yaw += dt * SPIN;
      const twoPi = Math.PI * 2;
      this.yaw = ((this.yaw % twoPi) + twoPi) % twoPi;
      const diff = ((north - this.yaw + Math.PI + twoPi) % twoPi) - Math.PI;
      this.group.rotation.y = this.yaw + diff * e;
    }

    /* camera: orbit (OrbitControls) in 3D, flight to the top in plan */
    const cam = state.camera as THREE.PerspectiveCamera;
    if (this.controls) this.controls.enabled = this.progress < 0.02;
    if (this.progress > 0.001) {
      const topDistance = Math.max(f.width_m, f.depth_m) * 6;
      this.top.set(0, topDistance, 0.0001);
      cam.position.lerp(this.top, Math.min(1, e * 0.25 + (e > 0.98 ? 1 : 0)));
      cam.fov = THREE.MathUtils.lerp(FOV_3D, FOV_PLAN, e);
      this.look.set(0, THREE.MathUtils.lerp(f.height_m * 0.4, 0, e), 0);
      cam.lookAt(this.look);
      cam.updateProjectionMatrix();
    } else {
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

/* imperative hand-off from React land to the viewer state */
function wire(vs: React.RefObject<ViewerState | null>, group: THREE.Group | null, scene: THREE.Object3D, gl: THREE.WebGLRenderer, mode: Mode) {
  const v = vs.current;
  if (!v) return;
  v.group = group;
  v.attach(scene, gl, mode);
}

function House({ src, vs, input }: { src: string; vs: React.RefObject<ViewerState | null>; input: Inputs }) {
  const { scene } = useGLTF(src);
  const group = useRef<THREE.Group>(null);
  /* the frame loop reads the latest inputs through a ref (updated in
     an effect, never during render) */
  const ref = useRef(input);
  useEffect(() => {
    ref.current = input;
  }, [input]);
  /* wiring the loaded scene into the viewer state is a side effect */
  const { gl } = useThree();
  useEffect(() => {
    wire(vs, group.current, scene, gl, ref.current.mode);
  }, [scene, gl, vs]);
  useFrame((state, dt) => {
    vs.current?.tick(state, Math.min(dt, 0.1), ref.current);
  });
  return (
    <group ref={group}>
      <primitive object={scene} />
    </group>
  );
}

export function PlanViewer({ src, northDeg, mode: initialMode = "3d", onModeChange, className = "" }: PlanViewerProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [storey, setStorey] = useState(0);
  const [spinning, setSpinning] = useState(true);
  const [reduce, setReduce] = useState(false);
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
  const radius = Math.max(fp.width_m, fp.depth_m, fp.height_m) * 1.6;

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
          dpr={[1, 1.5]}
          camera={{ position: [radius * 0.8, radius * 0.45, radius * 0.6], fov: FOV_3D, near: 0.1, far: 500 }}
          gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
          onPointerDown={() => setSpinning(false)}
          onPointerUp={() => setSpinning(true)}
        >
          <hemisphereLight args={["#ffffff", "#8a8a86", 1.1]} />
          <directionalLight position={[8, 14, 6]} intensity={1.4} />
          <directionalLight position={[-10, 6, -8]} intensity={0.5} />
          <House src={src} vs={vs} input={{ mode, storey, northDeg: north, reduce, spinning }} />
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

import * as THREE from "three";
import { noise2 } from "./lawn";
import type { Plant } from "./foliage";

/*
  SUBTLE TOPOGRAPHY (Bryce, 2026-10-05: "realistically terrain is uneven
  or curves slightly into hills").

  One height function h(x, z) in the house scene's space, shared by the
  lawn (its plane is displaced by it) and the planting (every tree and
  shrub stands at h where it grows), so nothing floats or sinks.

  - A FLAT PAD round the home: h = 0 within PAD_FLAT of the walls, easing
    to full relief by PAD_EASE — the house sits on level ground, as it
    would on a graded site.
  - Beyond, two octaves of value noise make soft swells: a long roll
    (~9 m) of up to ~0.4 m and a shorter undulation (~3 m) of ~0.1 m,
    biased slightly upward so the ground tends to rise away from the
    home rather than dip below it.
  - A slight mound under each tree, as roots and leaf litter build up.

  Kept deliberately small: at the viewer's distance a 30 cm swell reads
  in the light across the lawn, not as a hill model.
*/

const PAD_FLAT = 0.8; // m from the walls that stays level
/* full relief by 3 m: the lawn only reaches ~3.4 m past the walls, so a
   wider ease (6 m, first pass) left the swells outside the grass */
const PAD_EASE = 3;
const ROLL = { scale: 0.11, amp: 0.42 }; // long swells (~9 m)
const RIPPLE = { scale: 0.3, amp: 0.12 }; // shorter undulation (~3 m)
const BIAS = 0.12; // m: lean upward away from the home
const MOUND = { amp: 0.22, radius: 2.4 }; // under each tree

export type Terrain = (x: number, z: number) => number;

export function makeTerrain(fp: { width_m: number; depth_m: number }, walls: THREE.Box3 | null, plan: Plant[], seed = 7): Terrain {
  const hw = fp.width_m / 2;
  const hd = fp.depth_m / 2;
  const wb = walls ?? new THREE.Box3(new THREE.Vector3(-hw, 0, -hd), new THREE.Vector3(hw, 1, hd));
  const n1 = noise2(seed + 41);
  const n2 = noise2(seed + 57);
  const trees = plan.filter((p) => p.kind === "tree");
  return (x, z) => {
    const dx = Math.max(wb.min.x - x, 0, x - wb.max.x);
    const dz = Math.max(wb.min.z - z, 0, z - wb.max.z);
    const d = Math.hypot(dx, dz);
    const pad = THREE.MathUtils.smoothstep(d, PAD_FLAT, PAD_EASE);
    let h = n1(x * ROLL.scale, z * ROLL.scale) * ROLL.amp + n2(x * RIPPLE.scale, z * RIPPLE.scale) * RIPPLE.amp + BIAS;
    for (const t of trees) {
      const r = Math.hypot(x - t.x, z - t.z) / MOUND.radius;
      h += MOUND.amp * Math.exp(-r * r);
    }
    return Math.max(-0.08, h) * pad;
  };
}

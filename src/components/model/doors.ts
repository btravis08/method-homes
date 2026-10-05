import * as THREE from "three";
import type { Door } from "./foliage";

/*
  EXTERIOR DOORS, read from the model itself.

  The pipeline merges every door on a storey into one `storey<N>_door`
  mesh (and every wall into `storey<N>_wall`), so individual doors are
  recovered here: door vertices are binned on a 25 cm plan grid, and bins
  within ~1 m of each other are flood-filled into one door (a leaf and its
  jambs come apart in the IFC; 1 m rejoins them without merging two
  doors). A door is EXTERIOR when its box sits on the outer line of the
  ground storey's walls; its outward normal points away from the house.

  Coordinates are the house scene's own space — the same space the
  planting and lawn live in (both are children of the model group).
*/

const CELL = 0.25;
const JOIN = 4; // cells: rejoin pieces up to ~1 m apart
const ON_WALL = 0.45; // m from the wall line to count as exterior

export function findDoors(scene: THREE.Object3D): Door[] {
  scene.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const v = new THREE.Vector3();

  /* the lowest storey that has walls is the one people walk in from */
  const byStorey = new Map<number, { door: THREE.Mesh[]; wall: THREE.Mesh[] }>();
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.userData.stencil) return;
    const m = o.name.match(/^storey(\d+)_(door|wall)$/);
    if (!m) return;
    const k = Number(m[1]);
    if (!byStorey.has(k)) byStorey.set(k, { door: [], wall: [] });
    byStorey.get(k)![m[2] as "door" | "wall"].push(o);
  });
  const ground = [...byStorey.entries()].filter(([, g]) => g.wall.length && g.door.length).sort((a, b) => a[0] - b[0])[0]?.[1];
  if (!ground) return [];

  const walls = new THREE.Box3();
  for (const w of ground.wall) {
    rel.multiplyMatrices(inv, w.matrixWorld);
    const g = w.geometry as THREE.BufferGeometry;
    if (!g.boundingBox) g.computeBoundingBox();
    walls.union(g.boundingBox!.clone().applyMatrix4(rel));
  }

  /* bin door vertices on the plan grid */
  const bins = new Map<string, number[]>(); // key → [minX, minZ, maxX, maxZ]
  for (const d of ground.door) {
    rel.multiplyMatrices(inv, d.matrixWorld);
    const pos = (d.geometry as THREE.BufferGeometry).getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(rel);
      const key = `${Math.floor(v.x / CELL)},${Math.floor(v.z / CELL)}`;
      const b = bins.get(key) ?? [Infinity, Infinity, -Infinity, -Infinity];
      b[0] = Math.min(b[0], v.x);
      b[1] = Math.min(b[1], v.z);
      b[2] = Math.max(b[2], v.x);
      b[3] = Math.max(b[3], v.z);
      bins.set(key, b);
    }
  }

  /* flood-fill neighbouring bins into doors */
  const seen = new Set<string>();
  const doors: Door[] = [];
  for (const start of bins.keys()) {
    if (seen.has(start)) continue;
    seen.add(start);
    const stack = [start];
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    while (stack.length) {
      const key = stack.pop()!;
      const b = bins.get(key)!;
      box[0] = Math.min(box[0], b[0]);
      box[1] = Math.min(box[1], b[1]);
      box[2] = Math.max(box[2], b[2]);
      box[3] = Math.max(box[3], b[3]);
      const [cx, cz] = key.split(",").map(Number);
      for (let dx = -JOIN; dx <= JOIN; dx++)
        for (let dz = -JOIN; dz <= JOIN; dz++) {
          const n = `${cx + dx},${cz + dz}`;
          if (bins.has(n) && !seen.has(n)) {
            seen.add(n);
            stack.push(n);
          }
        }
    }
    const x = (box[0] + box[2]) / 2;
    const z = (box[1] + box[3]) / 2;
    /* which wall line is it on? */
    const sides = [
      { d: Math.abs(z - walls.min.z), nx: 0, nz: -1, w: box[2] - box[0], at: [x, walls.min.z] },
      { d: Math.abs(z - walls.max.z), nx: 0, nz: 1, w: box[2] - box[0], at: [x, walls.max.z] },
      { d: Math.abs(x - walls.min.x), nx: -1, nz: 0, w: box[3] - box[1], at: [walls.min.x, z] },
      { d: Math.abs(x - walls.max.x), nx: 1, nz: 0, w: box[3] - box[1], at: [walls.max.x, z] },
    ].sort((a, b) => a.d - b.d);
    const s = sides[0];
    if (s.d > ON_WALL) continue;
    doors.push({ x: s.at[0], z: s.at[1], w: Math.max(s.w, 0.8), nx: s.nx, nz: s.nz });
  }
  return doors;
}

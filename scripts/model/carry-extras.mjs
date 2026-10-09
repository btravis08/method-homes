// Copy the pipeline's extras (storeys, footprint, northDeg, materials…)
// from the raw ifc-to-glb GLB onto the baked GLB, which Blender exported
// without them, and record what the bake did. Scene 0 + the root carry
// the same object (three reads scene.extras as scene.userData); node
// extras are matched by name.
//
//   node scripts/model/carry-extras.mjs raw.glb baked.glb out.glb [bake-report.json]
import { readFileSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const [, , rawPath, bakedPath, outPath, reportPath] = process.argv;
if (!rawPath || !bakedPath || !outPath) {
  console.error("usage: carry-extras.mjs raw.glb baked.glb out.glb [bake-report.json]");
  process.exit(2);
}
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const raw = await io.read(rawPath);
const baked = await io.read(bakedPath);

const sceneExtras = { ...(raw.getRoot().listScenes()[0]?.getExtras() ?? {}), ...(raw.getRoot().getExtras() ?? {}) };
let bake = null;
if (reportPath) {
  try {
    const r = JSON.parse(readFileSync(reportPath, "utf8"));
    bake = { ao: r.ao, materials: r.materials };
  } catch {
    bake = null;
  }
}
const extras = { ...sceneExtras, baked: bake ?? { ao: null, materials: {} } };
baked.getRoot().setExtras(extras);
for (const scene of baked.getRoot().listScenes()) scene.setExtras(extras);

const byName = new Map(raw.getRoot().listNodes().map((n) => [n.getName(), n.getExtras()]));
let carried = 0;
for (const n of baked.getRoot().listNodes()) {
  const e = byName.get(n.getName());
  if (e && Object.keys(e).length) {
    n.setExtras(e);
    carried++;
  }
}
await io.write(outPath, baked);
console.log(`extras carried: scene (${Object.keys(sceneExtras).join(", ")}), ${carried} nodes → ${outPath}`);

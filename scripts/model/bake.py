#!/usr/bin/env python
"""
bake.py — real materials + baked ambient occlusion for the plan viewer's
GLB (Bryce, 2026-10-09: "wood grains, concrete textures, ambient
occlusion"). Runs in Blender-as-a-module on the model-pipeline runner
between ifc-to-glb.py and gltf-transform.

  python scripts/model/bake.py in.raw.glb out.glb --textures /tmp/assets \
      [--ao 2048] [--samples 128] [--report bake.json]

What it does to the raw GLB (uncompressed, one node per storey × category
× material, no UVs):

  1. CLASSIFIES every node by its name — storey<N>_<cat>[__<material-key>]
     — into a texture class with the same name rules the viewer's
     materialFinish uses: wood / plywood / plaster / concrete / floor /
     metal / black / glass. The IFC carries material identity, not
     appearance (Revit paints nearly everything #787878), so the class
     decides what a surface is made of.
  2. TEXTURES each class from a Poly Haven-style set in --textures/<set>/
     (diff / nor / rough jpgs, CC0), box-projected from WORLD metres into
     a first UV set ("UVMap") at a per-class tile size, so a 50 m wall and
     a 1 m stair tread get the same grain density. Wood is turned so its
     grain runs UP the siding. A set that failed to download leaves that
     class a flat colour — nothing breaks, it just stays plain.
  3. UNWRAPS a second UV set ("lightmap"), bakes Cycles ambient occlusion
     — with a ground plane as an occluder, so the walls darken at their
     foot and under the eaves — into ONE atlas for the whole home, and
     wires it as the glTF occlusion texture on TEXCOORD_1 (three's
     GLTFLoader turns that into aoMap on uv1 by itself).
  4. EXPORTS a GLB with the node names intact. Scene / node extras are
     NOT carried here (Blender's custom-property round trip mangles the
     storey list) — carry-extras.mjs copies them from the raw GLB after.

Glass is left alone (the viewer builds its physical glass) and hidden
from the bake so rooms still see sky.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
import time
from pathlib import Path

import bpy
from mathutils import Vector

NAME_RE = re.compile(r"^storey(\d+)_([a-z]+)(?:__(.+?))?(?:~m\d+)?$")  # ~m<K>: the node sits under prefab module K

# class → texture set folder, tile size (m per repeat), base-colour tint
# (multiplies the diffuse; LINEAR values — Principled takes linear, so the
# viewer's #3b3e41 charcoal roof is 0.045 here, not 0.23), roughness and
# metalness factors, and whether the grain runs vertically (siding, doors)
CLASSES: dict[str, dict] = {
    "wood": dict(set="wood", tile=1.8, tint=(0.86, 0.78, 0.70), rough=1.0, metal=0.0, vertical=True, normal=0.55),
    "plywood": dict(set="plywood", tile=2.4, tint=(1.0, 1.0, 1.0), rough=1.0, metal=0.0, vertical=False, normal=0.35),
    "plaster": dict(set="plaster", tile=2.2, tint=(0.97, 0.96, 0.94), rough=1.0, metal=0.0, vertical=False, normal=0.3),
    "concrete": dict(set="concrete", tile=2.6, tint=(1.0, 1.0, 1.0), rough=1.0, metal=0.0, vertical=False, normal=0.6),
    "floor": dict(set="floor", tile=3.2, tint=(1.0, 1.0, 1.0), rough=1.0, metal=0.0, vertical=False, normal=0.45),
    # dark painted standing-seam metal: only a roughness map (the seams
    # stay procedural in the viewer)
    "metal": dict(set="metal", tile=1.2, tint=(0.045, 0.05, 0.056), rough=0.42, metal=0.55, vertical=False, normal=0.0, flat=(0.045, 0.05, 0.056)),
    "black": dict(set="metal", tile=0.8, tint=(0.006, 0.006, 0.006), rough=0.4, metal=0.5, vertical=False, normal=0.0, flat=(0.006, 0.006, 0.006)),
    "glass": dict(set=None, tile=1, tint=(0.013, 0.024, 0.03), rough=0.05, metal=0.0, vertical=False, normal=0.0),
}
FALLBACK_COLOUR = {  # when the class's set is missing (linear)
    "wood": (0.10, 0.065, 0.04), "plywood": (0.50, 0.34, 0.17), "plaster": (0.86, 0.84, 0.79),
    "concrete": (0.31, 0.30, 0.27), "floor": (0.25, 0.23, 0.21), "metal": (0.045, 0.05, 0.056), "black": (0.006, 0.006, 0.006),
    "glass": (0.013, 0.024, 0.03),
}


def log(*a):
    print("[bake]", *a, flush=True)


def base_colour(o) -> tuple[float, float, float]:
    """The importer's Principled base colour for a node (the IFC surface
    style), for the colour-decided classes (doors, structure)."""
    for m in o.data.materials:
        if not m or not m.use_nodes:
            continue
        for n in m.node_tree.nodes:
            if n.type == "BSDF_PRINCIPLED":
                c = n.inputs["Base Color"].default_value
                return (c[0], c[1], c[2])
    return (0.5, 0.5, 0.5)


def classify(o) -> str:
    m = NAME_RE.match(o.name)
    cat = m.group(2) if m else "misc"
    key = (m.group(3) or "").lower() if m else ""
    if cat == "glass":
        return "glass"
    if cat == "wall":
        if re.search(r"siding|cedar|clapboard|shiplap|wood|timber", key):
            return "wood"
        if re.search(r"plywood|cdx|osb|sheathing", key):
            return "plywood"
        if re.search(r"gwb|gypsum|drywall|plaster|insulation|stud|default-wall", key):
            return "plaster"
        if re.search(r"concrete|cmu|block|masonry|brick|stone", key):
            return "concrete"
        if re.search(r"black|steel|metal|fascia|trim|alumin", key):
            return "black"
        return "wood"
    if cat == "roof":
        return "metal"
    if cat in ("floor", "stair"):
        return "floor"
    r, g, b = base_colour(o)
    if cat == "door":
        return "wood" if (r > 0.25 and r > g > b) else "black"
    if cat == "structure":
        return "black" if max(r, g, b) < 0.12 else "concrete"
    if cat in ("frame", "rail"):
        return "black"
    return "concrete"


def find_map(folder: Path, *patterns: str) -> Path | None:
    if not folder.exists():
        return None
    for p in patterns:
        hits = sorted(f for f in folder.iterdir() if p in f.name.lower() and f.suffix.lower() in (".jpg", ".jpeg", ".png"))
        if hits:
            return hits[0]
    return None


def gltf_output_group():
    """The node group io_scene_gltf2 reads the occlusion texture from."""
    name = "glTF Material Output"
    g = bpy.data.node_groups.get(name)
    if g is None:
        g = bpy.data.node_groups.new(name, "ShaderNodeTree")
        g.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    return g


def build_material(cls: str, spec: dict, textures: Path | None, ao_image, report: dict):
    mat = bpy.data.materials.new(f"baked-{cls}")
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    bsdf.inputs["Roughness"].default_value = spec["rough"]
    bsdf.inputs["Metallic"].default_value = spec["metal"]
    uv0 = nt.nodes.new("ShaderNodeUVMap")
    uv0.uv_map = "UVMap"
    folder = textures / spec["set"] if (textures and spec.get("set")) else None
    used = []
    diff = find_map(folder, "diff", "col", "albedo") if folder and not spec.get("flat") else None
    if diff:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(str(diff))
        tex.image.colorspace_settings.name = "sRGB"
        nt.links.new(uv0.outputs["UV"], tex.inputs["Vector"])
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        nt.links.new(tex.outputs["Color"], mix.inputs[6])
        mix.inputs[7].default_value = (*spec["tint"], 1.0)
        nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
        used.append("diff")
    else:
        c = spec.get("flat") or FALLBACK_COLOUR.get(cls, (0.5, 0.5, 0.5))
        bsdf.inputs["Base Color"].default_value = (*c, 1.0)
    rough = find_map(folder, "rough") if folder else None
    if rough:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(str(rough))
        tex.image.colorspace_settings.name = "Non-Color"
        nt.links.new(uv0.outputs["UV"], tex.inputs["Vector"])
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Roughness"])
        used.append("rough")
    nor = find_map(folder, "nor_gl", "normal", "nor") if folder and spec["normal"] > 0 else None
    if nor:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(str(nor))
        tex.image.colorspace_settings.name = "Non-Color"
        nt.links.new(uv0.outputs["UV"], tex.inputs["Vector"])
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.uv_map = "UVMap"
        nm.inputs["Strength"].default_value = spec["normal"]
        nt.links.new(tex.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
        used.append("nor")
    if ao_image is not None and cls != "glass":
        uv1 = nt.nodes.new("ShaderNodeUVMap")
        uv1.uv_map = "lightmap"
        ao = nt.nodes.new("ShaderNodeTexImage")
        ao.image = ao_image
        ao.name = "AO"
        nt.links.new(uv1.outputs["UV"], ao.inputs["Vector"])
        grp = nt.nodes.new("ShaderNodeGroup")
        grp.node_tree = gltf_output_group()
        nt.links.new(ao.outputs["Color"], grp.inputs["Occlusion"])
        nt.nodes.active = ao  # the bake target
    report["materials"][cls] = {"set": spec.get("set"), "maps": used, "tile_m": spec["tile"]}
    log(f"material {cls}: {spec.get('set')} ({', '.join(used) or 'flat colour'}) tile {spec['tile']} m")
    return mat


def box_uvs(o, tile: float, vertical: bool):
    """UVMap: world-space box projection in metres / tile. Each face picks
    the axis its normal mostly faces; vertical faces map (along, up)."""
    me = o.data
    uv = me.uv_layers.get("UVMap") or me.uv_layers.new(name="UVMap")
    mw = o.matrix_world
    nrm = mw.to_3x3().inverted().transposed()
    for poly in me.polygons:
        n = (nrm @ poly.normal).normalized()
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for li in poly.loop_indices:
            w = mw @ me.vertices[me.loops[li].vertex_index].co
            if az >= ax and az >= ay:
                u, v = w.x, w.y
            elif ax >= ay:
                u, v = (w.z, w.y) if vertical else (w.y, w.z)
            else:
                u, v = (w.z, w.x) if vertical else (w.x, w.z)
            uv.data[li].uv = (u / tile, v / tile)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--textures", help="folder of Poly Haven-style sets: wood/ plywood/ plaster/ concrete/ floor/ metal/")
    ap.add_argument("--ao", type=int, default=2048, help="ambient-occlusion atlas size (px)")
    ap.add_argument("--samples", type=int, default=128)
    ap.add_argument("--ao-distance", type=float, default=4.0, help="metres a surface looks for occluders")
    ap.add_argument("--report")
    args = ap.parse_args()
    t0 = time.time()
    textures = Path(args.textures) if args.textures else None
    report: dict = {"materials": {}, "classes": {}, "ao": None}

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    bpy.ops.import_scene.gltf(filepath=str(args.src))
    meshes = [o for o in scene.objects if o.type == "MESH"]
    if not meshes:
        sys.exit("no meshes imported")
    bpy.ops.object.select_all(action="DESELECT")

    # ---- classes + ground
    classes = {o.name: classify(o) for o in meshes}
    for o in meshes:
        report["classes"].setdefault(classes[o.name], []).append(o.name)
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in meshes:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    span = max(hi.x - lo.x, hi.y - lo.y)
    bpy.ops.mesh.primitive_plane_add(size=span * 4, location=((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z - 0.01))
    ground = bpy.context.active_object
    ground.name = "bake-ground"
    bpy.ops.object.select_all(action="DESELECT")
    log(f"{len(meshes)} nodes · " + ", ".join(f"{k} {len(v)}" for k, v in report["classes"].items()))

    # ---- AO atlas
    ao_image = None
    baked = [o for o in meshes if classes[o.name] != "glass"]
    if args.ao > 0 and baked:
        ao_image = bpy.data.images.new("ao", args.ao, args.ao, alpha=False)
        ao_image.colorspace_settings.name = "Non-Color"

    # ---- materials + UVs
    mats = {cls: build_material(cls, spec, textures, ao_image, report) for cls, spec in CLASSES.items()}
    for o in meshes:
        cls = classes[o.name]
        spec = CLASSES[cls]
        o.data.materials.clear()
        o.data.materials.append(mats[cls])
        for p in o.data.polygons:
            p.use_smooth = False
        box_uvs(o, spec["tile"], spec["vertical"])
        if cls != "glass":
            lm = o.data.uv_layers.get("lightmap") or o.data.uv_layers.new(name="lightmap")
            o.data.uv_layers.active = lm

    # ---- unwrap the lightmap across all baked objects at once, so the
    #      islands pack into ONE atlas
    if ao_image is not None:
        for o in baked:
            o.select_set(True)
        bpy.context.view_layer.objects.active = baked[0]
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.002, correct_aspect=True, scale_to_bounds=False)
        try:
            bpy.ops.uv.pack_islands(rotate=True, margin=0.004)
        except TypeError:
            bpy.ops.uv.pack_islands(margin=0.004)
        bpy.ops.object.mode_set(mode="OBJECT")
        log(f"lightmap unwrapped for {len(baked)} nodes in {time.time() - t0:.0f}s")

        # ---- bake
        for o in meshes:
            if classes[o.name] == "glass":
                o.hide_render = True
                o.select_set(False)
        scene.cycles.samples = args.samples
        scene.cycles.use_denoising = False
        scene.cycles.bake_type = "AO"
        scene.render.bake.margin = 8
        scene.render.bake.use_clear = True
        scene.render.bake.use_selected_to_active = False
        scene.world = scene.world or bpy.data.worlds.new("world")
        scene.world.light_settings.distance = args.ao_distance
        t1 = time.time()
        bpy.ops.object.bake(type="AO")
        ao_path = Path(args.out).with_suffix(".ao.png")
        ao_image.filepath_raw = str(ao_path)
        ao_image.file_format = "PNG"
        ao_image.save()
        report["ao"] = {"size": args.ao, "samples": args.samples, "distance_m": args.ao_distance, "seconds": round(time.time() - t1, 1)}
        log(f"AO {args.ao}px × {args.samples} spp baked in {time.time() - t1:.0f}s")
        for o in meshes:
            o.hide_render = False

    # ---- export (the ground never ships)
    bpy.data.objects.remove(ground, do_unlink=True)
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.export_scene.gltf(
        filepath=str(args.out),
        export_format="GLB",
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_yup=True,
        export_extras=False,
        export_animations=False,
        export_lights=False,
        export_cameras=False,
        export_skins=False,
        export_morph=False,
    )
    report["seconds"] = round(time.time() - t0, 1)
    report["bytes"] = Path(args.out).stat().st_size
    if args.report:
        Path(args.report).write_text(json.dumps(report, indent=2))
    log(f"wrote {args.out} ({report['bytes'] / 1e6:.1f} MB) in {report['seconds']}s")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Offline render of a pipeline GLB with Blender Cycles — the photoreal
layer of the plan viewer (see docs/PROJECT-LOG.md 2026-10-04).

  python3 scripts/model/render-turntable.py <model.raw.glb> <out-dir>
      [--orbit 36] [--plan 24] [--width 1440] [--height 900]
      [--samples 128] [--north 0] [--quick]

Scene, built from scratch each run so results are reproducible:
  - sky:     Blender's Nishita sky (physically based atmosphere) with
             the sun at a late-afternoon PNW angle; no HDRI file needed
  - sun:     a Sun lamp aligned with the sky's sun (soft shadows,
             angular diameter 0.8°)
  - ground:  a lawn disc (hair-particle grass over a grass-coloured
             base) that fades to transparent at its rim; the film is
             transparent so the frames sit on the page surface
  - finish:  by category, from the pipeline's node names
             storeyN_<cat>: grey fibre-cement panels with reveal
             joints (procedural), black standing-seam metal roof
             (procedural ribs + bump), physical glass (transmission,
             IOR 1.52, faint green tint) over a dark interior box so
             reflections read, dark bronze doors/rails, concrete slab
  - camera:  36 orbit frames at 22° elevation, then a 24-frame flight
             to a north-up top view during which the camera's clip
             start descends to 1.2 m above the floor (a true section
             cut — no booleans) and the materials fade to the drawing
             palette (walls dark, floors light)
Output: PNG frames (orbit-NN.png, plan-NN.png) + manifest.json; the
caller encodes AVIF (scripts/model/encode-frames.mjs).

Needs: pip install bpy  (Blender as a Python module; ~300 MB)
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path

import bpy
from mathutils import Vector

CUT_ABOVE_FLOOR = 1.2
CAT_RE = __import__("re").compile(r"^storey(\d+)_(\w+)")
TEXTURES: Path | None = None  # --textures: folder of PBR sets (<set>/diff.jpg, rough.jpg), box-projected


def pbr(nt, set_name: str, scale_m: float):
    """Image-texture sockets for a Poly Haven-style PBR set, box-projected
    from object space (the models have no UVs). Returns {} when the set is
    missing so every material keeps its procedural fallback."""
    if TEXTURES is None:
        return {}
    folder = TEXTURES / set_name
    out = {}
    coord = None
    for key, pattern, colorspace in (("diff", "diff", "sRGB"), ("rough", "rough", "Non-Color")):
        files = sorted(folder.glob(f"*{pattern}*")) if folder.exists() else []
        if not files:
            continue
        if coord is None:
            coord = nt.nodes.new("ShaderNodeTexCoord")
            mapping = nt.nodes.new("ShaderNodeMapping")
            mapping.inputs["Scale"].default_value = (1 / scale_m, 1 / scale_m, 1 / scale_m)
            nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(str(files[0]))
        tex.image.colorspace_settings.name = colorspace
        tex.projection = "BOX"
        tex.projection_blend = 0.25
        nt.links.new(mapping.outputs[0], tex.inputs["Vector"])
        out[key] = tex.outputs["Color"]
    if out:
        log(f"textures: {set_name} ← {folder} ({', '.join(out)})")
    return out


def log(*a):
    print("[render]", *a, flush=True)


# ---------------------------------------------------------------- scene reset
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)


# ---------------------------------------------------------------- materials
def node_tree(mat):
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return nt, bsdf, out


def plan_mix(nt, render_socket, plan_rgb, fade_value):
    """mix a render colour with the flat drawing colour by the global
    plan fade (a Value node keyframed 0→1 over the plan sequence)"""
    mix = nt.nodes.new("ShaderNodeMixRGB")
    mix.blend_type = "MIX"
    plan = nt.nodes.new("ShaderNodeRGB")
    plan.outputs[0].default_value = (*plan_rgb, 1)
    nt.links.new(render_socket, mix.inputs[1])
    nt.links.new(plan.outputs[0], mix.inputs[2])
    nt.links.new(fade_value.outputs[0], mix.inputs[0])
    return mix.outputs[0]


FADE_NODES: list = []


def fade_node(nt, fade_obj=None):
    """the global plan fade (0 = render, 1 = drawing) as a Value node;
    set_fade() writes every one before a frame renders. (A driver on the
    socket was tried first and never evaluated in module mode — the
    nodes sat at the Value node's 0.5 default, which tinted everything.)"""
    v = nt.nodes.new("ShaderNodeValue")
    v.outputs[0].default_value = 0.0
    FADE_NODES.append(v)
    return v


def set_fade(value: float):
    for v in FADE_NODES:
        v.outputs[0].default_value = value


def mat_siding(fade_obj):
    m = bpy.data.materials.new("siding")
    nt, bsdf, out = node_tree(m)
    fade = fade_node(nt, fade_obj)
    # panel grid in object space: 1.2192 wide × 2.4384 tall with a 12 mm
    # reveal. Each face picks its own horizontal axis from its normal:
    # walls facing ±Y use (x, z), walls facing ±X use (y, z), so the
    # panels stand upright on every elevation
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(coord.outputs["Object"], sep.inputs[0])
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    nsep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Normal"], nsep.inputs[0])
    ax = nt.nodes.new("ShaderNodeMath")
    ax.operation = "ABSOLUTE"
    nt.links.new(nsep.outputs["X"], ax.inputs[0])
    ay = nt.nodes.new("ShaderNodeMath")
    ay.operation = "ABSOLUTE"
    nt.links.new(nsep.outputs["Y"], ay.inputs[0])
    facing_x = nt.nodes.new("ShaderNodeMath")
    facing_x.operation = "GREATER_THAN"
    nt.links.new(ax.outputs[0], facing_x.inputs[0])
    nt.links.new(ay.outputs[0], facing_x.inputs[1])
    uv_y = nt.nodes.new("ShaderNodeCombineXYZ")  # for ±Y faces
    nt.links.new(sep.outputs["X"], uv_y.inputs["X"])
    nt.links.new(sep.outputs["Z"], uv_y.inputs["Y"])
    uv_x = nt.nodes.new("ShaderNodeCombineXYZ")  # for ±X faces
    nt.links.new(sep.outputs["Y"], uv_x.inputs["X"])
    nt.links.new(sep.outputs["Z"], uv_x.inputs["Y"])
    comb = nt.nodes.new("ShaderNodeMix")
    comb.data_type = "VECTOR"
    nt.links.new(facing_x.outputs[0], comb.inputs["Factor"])
    nt.links.new(uv_y.outputs[0], comb.inputs[4])  # A (vector)
    nt.links.new(uv_x.outputs[0], comb.inputs[5])  # B (vector)
    brick = nt.nodes.new("ShaderNodeTexBrick")
    brick.offset = 0.0
    brick.inputs["Scale"].default_value = 1.0
    brick.inputs["Mortar Size"].default_value = 0.012
    brick.inputs["Mortar Smooth"].default_value = 0.1
    brick.inputs["Bias"].default_value = 0.0
    brick.inputs["Brick Width"].default_value = 1.2192
    brick.inputs["Row Height"].default_value = 2.4384
    brick.inputs["Color1"].default_value = (0.115, 0.12, 0.126, 1)  # fibre-cement grey (linear ≈ sRGB 38%)
    brick.inputs["Color2"].default_value = (0.1, 0.105, 0.11, 1)
    brick.inputs["Mortar"].default_value = (0.06, 0.062, 0.064, 1)
    nt.links.new(comb.outputs["Result"], brick.inputs["Vector"])
    render_color = brick.outputs["Color"]
    tex = pbr(nt, "siding", 2.4)
    if "diff" in tex:
        # keep our grey, take the texture's surface variation: multiply by
        # the texture normalised around mid-grey
        norm = nt.nodes.new("ShaderNodeMixRGB")
        norm.blend_type = "MULTIPLY"
        norm.inputs["Fac"].default_value = 1.0
        two = nt.nodes.new("ShaderNodeRGB")
        two.outputs[0].default_value = (2.2, 2.2, 2.2, 1)
        nt.links.new(tex["diff"], norm.inputs[1])
        nt.links.new(two.outputs[0], norm.inputs[2])
        mul = nt.nodes.new("ShaderNodeMixRGB")
        mul.blend_type = "MULTIPLY"
        mul.inputs["Fac"].default_value = 1.0
        nt.links.new(brick.outputs["Color"], mul.inputs[1])
        nt.links.new(norm.outputs[0], mul.inputs[2])
        render_color = mul.outputs[0]
    color = plan_mix(nt, render_color, (0.008, 0.008, 0.008), fade)
    nt.links.new(color, bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.6
    if "rough" in tex:
        rr = nt.nodes.new("ShaderNodeMapRange")
        rr.inputs["To Min"].default_value = 0.45
        rr.inputs["To Max"].default_value = 0.75
        nt.links.new(tex["rough"], rr.inputs["Value"])
        nt.links.new(rr.outputs[0], bsdf.inputs["Roughness"])
    # reveal depth as bump
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35
    bump.inputs["Distance"].default_value = 0.01
    nt.links.new(brick.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def mat_roof(fade_obj):
    m = bpy.data.materials.new("roof")
    nt, bsdf, out = node_tree(m)
    fade = fade_node(nt, fade_obj)
    # standing seams every 0.4064 m along X in object space (the sample's
    # ridge runs along X; the rib runs down the slope = along Y)
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(coord.outputs["Object"], sep.inputs[0])
    div = nt.nodes.new("ShaderNodeMath")
    div.operation = "DIVIDE"
    div.inputs[1].default_value = 0.4064
    nt.links.new(sep.outputs["X"], div.inputs[0])
    frac = nt.nodes.new("ShaderNodeMath")
    frac.operation = "FRACT"
    nt.links.new(div.outputs[0], frac.inputs[0])
    # rib = narrow pulse around 0.5
    sub = nt.nodes.new("ShaderNodeMath")
    sub.operation = "SUBTRACT"
    sub.inputs[1].default_value = 0.5
    nt.links.new(frac.outputs[0], sub.inputs[0])
    ab = nt.nodes.new("ShaderNodeMath")
    ab.operation = "ABSOLUTE"
    nt.links.new(sub.outputs[0], ab.inputs[0])
    rib = nt.nodes.new("ShaderNodeMath")
    rib.operation = "LESS_THAN"
    rib.inputs[1].default_value = 0.035  # ≈ 14 mm half-width over 406 mm
    nt.links.new(ab.outputs[0], rib.inputs[0])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.8
    bump.inputs["Distance"].default_value = 0.02
    nt.links.new(rib.outputs[0], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    base = nt.nodes.new("ShaderNodeRGB")
    base.outputs[0].default_value = (0.012, 0.012, 0.013, 1)
    color = plan_mix(nt, base.outputs[0], (0.5, 0.5, 0.48), fade)
    nt.links.new(color, bsdf.inputs["Base Color"])
    # Kynar-painted steel: a dark dielectric paint film — Fresnel sky
    # reflections at grazing angles, near-black face-on
    bsdf.inputs["Metallic"].default_value = 0.0
    # low roughness keeps the sun glint a tight streak; at 0.5 the lobe
    # spread over the whole slope and the roof read silver
    bsdf.inputs["Roughness"].default_value = 0.25
    bsdf.inputs["Specular IOR Level"].default_value = 0.3
    tex = pbr(nt, "roof", 1.6)
    if "rough" in tex:
        # a real coil-coated sheet isn't uniform: the map breaks the glint up
        rr = nt.nodes.new("ShaderNodeMapRange")
        rr.inputs["To Min"].default_value = 0.18
        rr.inputs["To Max"].default_value = 0.4
        nt.links.new(tex["rough"], rr.inputs["Value"])
        nt.links.new(rr.outputs[0], bsdf.inputs["Roughness"])
    return m


def mat_glass(fade_obj):
    m = bpy.data.materials.new("glass")
    nt, bsdf, out = node_tree(m)
    fade = fade_node(nt, fade_obj)
    bsdf.inputs["Base Color"].default_value = (0.86, 0.95, 0.93, 1)
    bsdf.inputs["Roughness"].default_value = 0.02
    bsdf.inputs["IOR"].default_value = 1.52
    # transmission fades to 0 and colour to the plan blue in plan mode
    inv = nt.nodes.new("ShaderNodeMath")
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    nt.links.new(fade.outputs[0], inv.inputs[1])
    nt.links.new(inv.outputs[0], bsdf.inputs["Transmission Weight"])
    tint = nt.nodes.new("ShaderNodeRGB")
    tint.outputs[0].default_value = (0.86, 0.95, 0.93, 1)  # low-iron glass, faint green
    color = plan_mix(nt, tint.outputs[0], (0.33, 0.52, 0.62), fade)
    nt.links.new(color, bsdf.inputs["Base Color"])
    m.blend_method = "HASHED" if hasattr(m, "blend_method") else m.blend_method
    return m


def mat_flat(name, rgb_linear, rough=0.6, metallic=0.0, plan_rgb=None, fade_obj=None):
    m = bpy.data.materials.new(name)
    nt, bsdf, out = node_tree(m)
    if plan_rgb:  # (fade_obj is legacy — the fade is the global Value-node set)
        fade = fade_node(nt, fade_obj)
        base = nt.nodes.new("ShaderNodeRGB")
        base.outputs[0].default_value = (*rgb_linear, 1)
        nt.links.new(plan_mix(nt, base.outputs[0], plan_rgb, fade), bsdf.inputs["Base Color"])
    else:
        bsdf.inputs["Base Color"].default_value = (*rgb_linear, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metallic
    return m


def mat_concrete(fade_obj):
    """slab edge / floors: matte concrete, textured when a set is given"""
    m = mat_flat("floor", (0.42, 0.40, 0.37), 0.9, 0.0, (0.80, 0.80, 0.77), fade_obj)
    nt = m.node_tree
    tex = pbr(nt, "concrete", 3.0)
    if "diff" in tex:
        bsdf = next(n for n in nt.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled")
        mix = next(n for n in nt.nodes if n.bl_idname == "ShaderNodeMixRGB")  # the plan_mix node
        mul = nt.nodes.new("ShaderNodeMixRGB")
        mul.blend_type = "MULTIPLY"
        mul.inputs["Fac"].default_value = 1.0
        base = mix.inputs[1].links[0].from_socket
        nt.links.new(base, mul.inputs[1])
        two = nt.nodes.new("ShaderNodeRGB")
        two.outputs[0].default_value = (2.0, 2.0, 2.0, 1)
        n2 = nt.nodes.new("ShaderNodeMixRGB")
        n2.blend_type = "MULTIPLY"
        n2.inputs["Fac"].default_value = 1.0
        nt.links.new(tex["diff"], n2.inputs[1])
        nt.links.new(two.outputs[0], n2.inputs[2])
        nt.links.new(n2.outputs[0], mul.inputs[2])
        nt.links.new(mul.outputs[0], mix.inputs[1])
        if "rough" in tex:
            rr = nt.nodes.new("ShaderNodeMapRange")
            rr.inputs["To Min"].default_value = 0.7
            rr.inputs["To Max"].default_value = 0.95
            nt.links.new(tex["rough"], rr.inputs["Value"])
            nt.links.new(rr.outputs[0], bsdf.inputs["Roughness"])
    return m


def mat_lawn(radius: float):
    m = bpy.data.materials.new("lawn")
    nt, bsdf, out = node_tree(m)
    coord = nt.nodes.new("ShaderNodeTexCoord")
    # patches: slow noise picks between a darker and a lighter green
    patches = nt.nodes.new("ShaderNodeTexNoise")
    patches.inputs["Scale"].default_value = 0.35
    patches.inputs["Detail"].default_value = 3.0
    nt.links.new(coord.outputs["Object"], patches.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (0.018, 0.05, 0.011, 1)
    ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[1].color = (0.05, 0.105, 0.025, 1)
    nt.links.new(patches.outputs["Fac"], ramp.inputs[0])
    # grain: fine noise modulates brightness ±25% so the lawn has texture
    grain = nt.nodes.new("ShaderNodeTexNoise")
    grain.inputs["Scale"].default_value = 12.0
    grain.inputs["Detail"].default_value = 8.0
    grain.inputs["Roughness"].default_value = 0.7
    nt.links.new(coord.outputs["Object"], grain.inputs["Vector"])
    gmap = nt.nodes.new("ShaderNodeMapRange")
    gmap.inputs["To Min"].default_value = 0.75
    gmap.inputs["To Max"].default_value = 1.25
    nt.links.new(grain.outputs["Fac"], gmap.inputs["Value"])
    mul = nt.nodes.new("ShaderNodeMixRGB")
    mul.blend_type = "MULTIPLY"
    mul.inputs["Fac"].default_value = 1.0
    nt.links.new(ramp.outputs["Color"], mul.inputs[1])
    nt.links.new(gmap.outputs[0], mul.inputs[2])
    nt.links.new(mul.outputs[0], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.95
    bsdf.inputs["Specular IOR Level"].default_value = 0.2
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.3
    bump.inputs["Distance"].default_value = 0.02
    nt.links.new(grain.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    # radial alpha fade to the rim (object coords scaled to the unit disc)
    unit = nt.nodes.new("ShaderNodeVectorMath")
    unit.operation = "SCALE"
    unit.inputs["Scale"].default_value = 1.0 / radius
    nt.links.new(coord.outputs["Object"], unit.inputs[0])
    grad = nt.nodes.new("ShaderNodeTexGradient")
    grad.gradient_type = "SPHERICAL"
    nt.links.new(unit.outputs[0], grad.inputs["Vector"])
    ramp2 = nt.nodes.new("ShaderNodeValToRGB")
    ramp2.color_ramp.elements[0].position = 0.0
    ramp2.color_ramp.elements[0].color = (0, 0, 0, 1)
    ramp2.color_ramp.elements[1].position = 0.65
    ramp2.color_ramp.elements[1].color = (1, 1, 1, 1)
    nt.links.new(grad.outputs["Fac"], ramp2.inputs[0])
    nt.links.new(ramp2.outputs["Color"], bsdf.inputs["Alpha"])
    if hasattr(m, "blend_method"):
        m.blend_method = "HASHED"
    return m


# ---------------------------------------------------------------- scene build
def build(glb: Path, north_deg: float, quick: bool, sky_strength: float = 1.0, exposure: float = -0.8, style: str = "studio", hdri: str | None = None, hdri_rotation: float = 0.0, textures: str | None = None):
    global TEXTURES
    TEXTURES = Path(textures) if textures else None
    reset()
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = exposure
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.compression = 50

    FADE_NODES.clear()
    fade_obj = None

    bpy.ops.import_scene.gltf(filepath=str(glb))
    meshes = [o for o in scene.objects if o.type == "MESH"]
    if not meshes:
        sys.exit("no meshes imported")

    # the GLB is Y-up/centred (glTF importer converts to Blender Z-up)
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in meshes:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    size = hi - lo
    centre = (lo + hi) / 2
    floor_z = lo.z
    log(f"footprint {size.x:.1f} × {size.y:.1f} m, height {size.z:.1f} m")

    # one parent for the north rotation (plan view turns north-up)
    house = bpy.data.objects.new("house", None)
    scene.collection.objects.link(house)
    for o in meshes:
        o.parent = house
    house.location = (-centre.x, -centre.y, -floor_z)

    mats = {
        "wall": mat_siding(fade_obj),
        "roof": mat_roof(fade_obj),
        "glass": mat_glass(fade_obj),
        "door": mat_flat("door", (0.03, 0.025, 0.02), 0.45, 0.2, (0.3, 0.2, 0.13), fade_obj),
        # window frames (the pipeline splits them from the panes): dark
        # bronze anodised aluminium — a satin metal, not matte paint
        "frame": mat_flat("frame", (0.022, 0.02, 0.018), 0.38, 0.6, (0.008, 0.008, 0.008), fade_obj),
        "rail": mat_flat("rail", (0.02, 0.02, 0.02), 0.4, 0.7, (0.02, 0.02, 0.02), fade_obj),
        "floor": mat_concrete(fade_obj),
        "stair": mat_flat("stair", (0.3, 0.28, 0.25), 0.8, 0.0, (0.5, 0.48, 0.45), fade_obj),
        "structure": mat_flat("structure", (0.18, 0.18, 0.17), 0.7, 0.0, (0.008, 0.008, 0.008), fade_obj),
        "misc": mat_flat("misc", (0.4, 0.39, 0.37), 0.8, 0.0, (0.5, 0.5, 0.48), fade_obj),
    }
    storeys: dict[int, list] = {}
    for o in meshes:
        m = CAT_RE.match(o.name)
        cat = m.group(2) if m else "misc"
        storey = int(m.group(1)) if m else 0
        storeys.setdefault(storey, []).append(o)
        o.data.materials.clear()
        o.data.materials.append(mats.get(cat, mats["misc"]))
        for p in o.data.polygons:
            p.use_smooth = False
        o.cycles.is_shadow_catcher = False

    # dark interior box so the glass has something to look into; it must
    # stay under the roof, so it tops out below the lowest roof point
    # (the eaves) — a box to 85% of the height poked through the slopes
    def cat_bounds(cat):
        objs = [o for o in meshes if CAT_RE.match(o.name) and CAT_RE.match(o.name).group(2) == cat]
        if not objs:
            return None
        pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
        return Vector(map(min, *pts)), Vector(map(max, *pts))

    roof_b = cat_bounds("roof")
    wall_b = cat_bounds("wall") or (lo, hi)
    roof_lo = roof_b[0].z if roof_b else hi.z
    box_top = max(floor_z + 1.0, roof_lo - 0.1)
    box_bottom = floor_z + 0.05
    # the box fits inside the WALL bounds (not the overall bbox, which the
    # roof overhang widens past the walls) with a 0.2 m inset
    inset = 0.12  # inside the ~0.3 m wall solids, 0.1 m behind the glass — no sunlit floor strip shows
    bx0, bx1 = wall_b[0].x + inset, wall_b[1].x - inset
    by0, by1 = wall_b[0].y + inset, wall_b[1].y - inset
    bpy.ops.mesh.primitive_cube_add(size=1)
    box = bpy.context.active_object
    box.name = "interior"
    box.parent = house
    box.location = ((bx0 + bx1) / 2, (by0 + by1) / 2, (box_top + box_bottom) / 2)
    box.scale = (bx1 - bx0, by1 - by0, box_top - box_bottom)
    box.data.materials.append(mat_flat("interior", (0.005, 0.005, 0.006), 0.9))
    box.visible_shadow = False

    # ground
    radius = max(size.x, size.y) * 2.0
    if style == "lawn":
        # lawn disc. (Hair-particle grass was tried: 9 cm blades are
        # sub-pixel from the camera's 40 m, so it cost render time and
        # showed nothing — a two-scale shader does the work at this distance.)
        bpy.ops.mesh.primitive_circle_add(vertices=96, radius=radius, fill_type="NGON", location=(0, 0, -0.01))
        lawn = bpy.context.active_object
        lawn.name = "lawn"
        lawn.data.materials.append(mat_lawn(radius))
    else:
        # studio: an invisible shadow catcher — the frame carries only the
        # home and its shadow (alpha), so it sits on the page surface the
        # way a product shot sits on white. Reflections of the ground in the
        # glass still happen because the catcher is a (neutral) surface.
        bpy.ops.mesh.primitive_plane_add(size=radius * 2, location=(0, 0, -0.005))
        ground = bpy.context.active_object
        ground.name = "shadow_catcher"
        ground.is_shadow_catcher = True
        ground.data.materials.append(mat_flat("catcher", (0.45, 0.45, 0.44), 0.9))

    # world: an HDRI when given (accurate sky reflections, soft sun), else
    # Nishita's physical atmosphere
    world = bpy.data.worlds.new("sky")
    scene.world = world
    world.use_nodes = True
    wn = world.node_tree
    for n in list(wn.nodes):
        wn.nodes.remove(n)
    wout = wn.nodes.new("ShaderNodeOutputWorld")
    bg = wn.nodes.new("ShaderNodeBackground")
    sky = None
    if hdri:
        env = wn.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(str(hdri))
        coord = wn.nodes.new("ShaderNodeTexCoord")
        mapping = wn.nodes.new("ShaderNodeMapping")
        mapping.inputs["Rotation"].default_value = (0, 0, math.radians(hdri_rotation))
        wn.links.new(coord.outputs["Generated"], mapping.inputs["Vector"])
        wn.links.new(mapping.outputs[0], env.inputs["Vector"])
        wn.links.new(env.outputs[0], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = sky_strength
        log(f"HDRI {Path(hdri).name} rotation {hdri_rotation}°")
    else:
        sky = wn.nodes.new("ShaderNodeTexSky")
        sky.sky_type = "NISHITA"
        sky.sun_elevation = math.radians(28)
        sky.sun_rotation = math.radians(215)
        sky.sun_intensity = 0.55  # hazier PNW sun: keeps sunlit faces from bleaching under AgX
        sky.sun_size = math.radians(0.8)
        sky.altitude = 60
        sky.air_density = 1.0
        sky.dust_density = 1.0
        sky.ozone_density = 1.0
        bg.inputs["Strength"].default_value = sky_strength
        wn.links.new(sky.outputs[0], bg.inputs["Color"])
    wn.links.new(bg.outputs[0], wout.inputs["Surface"])

    # a top light for the plan cut (an HDRI's sun can't be moved to noon):
    # off during the orbit, faded in with the cut so the opened floors read
    noon_data = bpy.data.lights.new("noon", "SUN")
    noon_data.energy = 0.0
    noon_data.angle = math.radians(3)
    noon = bpy.data.objects.new("noon", noon_data)
    scene.collection.objects.link(noon)
    noon.rotation_euler = (math.radians(4), 0, 0)

    # camera
    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam_data.lens = 40
    cam_data.sensor_width = 36
    cam_data.clip_start = 0.1
    cam_data.clip_end = 1000

    # cycles quality
    scene.cycles.samples = 24 if quick else 96
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.02
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    scene.cycles.max_bounces = 6
    scene.cycles.transparent_max_bounces = 8
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False
    scene.cycles.blur_glossy = 1.0
    scene.render.use_persistent_data = True

    return scene, cam, house, fade_obj, size, storeys


def aim(cam, target: Vector, position: Vector):
    cam.location = position
    direction = target - position
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render(scene, path: Path):
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("glb")
    ap.add_argument("out")
    ap.add_argument("--orbit", type=int, default=36)
    ap.add_argument("--plan", type=int, default=24)
    ap.add_argument("--width", type=int, default=1440)
    ap.add_argument("--height", type=int, default=900)
    ap.add_argument("--samples", type=int)
    ap.add_argument("--north", type=float, default=0.0, help="degrees to turn the model so plan view is north-up")
    ap.add_argument("--cut", type=float, default=CUT_ABOVE_FLOOR)
    ap.add_argument("--storey-z", type=float, default=0.0, help="elevation of the storey to cut (m above the lowest floor)")
    ap.add_argument("--style", choices=["studio", "lawn"], default="studio", help="studio = shadow-catcher ground on the transparent film (product shot); lawn = grass disc")
    ap.add_argument("--hdri", help="equirectangular .hdr/.exr for the world (else Nishita sky)")
    ap.add_argument("--hdri-rotation", type=float, default=0.0, help="degrees to turn the HDRI about Z")
    ap.add_argument("--textures", help="folder of PBR sets: siding/, roof/, concrete/ (Poly Haven-style diff/rough files)")
    ap.add_argument("--sky", type=float, default=1.0, help="world strength (Nishita sky or HDRI)")
    ap.add_argument("--exposure", type=float, default=-0.8, help="view-transform exposure (stops)")
    ap.add_argument("--quick", action="store_true", help="low samples — for checks")
    ap.add_argument("--only", help="render a single frame id (orbit-00 / plan-23) for checks")
    ap.add_argument("--shard", help="k/n: render only every n-th frame starting at k (orbit then plan), for parallel runner jobs; every shard writes the full manifest")
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    shard_k, shard_n = (int(x) for x in args.shard.split("/")) if args.shard else (0, 1)

    def mine(global_index: int, fid: str) -> bool:
        if args.only:
            return args.only == fid
        return global_index % shard_n == shard_k
    scene, cam, house, fade_obj, size, storeys = build(Path(args.glb), args.north, args.quick, args.sky, args.exposure, args.style, args.hdri, args.hdri_rotation, args.textures)
    noon = bpy.data.objects.get("noon")
    scene.render.resolution_x = args.width
    scene.render.resolution_y = args.height
    scene.render.resolution_percentage = 100
    if args.samples:
        scene.cycles.samples = args.samples

    # orbit geometry
    diag = math.hypot(size.x, size.y)
    dist = diag * 1.25 + size.z
    elev = math.radians(26)
    look = Vector((0, 0, size.z * 0.42))
    frames = []

    def orbit_pose(i, n):
        a = math.radians(360 * i / n) + math.radians(35)
        return Vector((math.cos(a) * dist * math.cos(elev), math.sin(a) * dist * math.cos(elev), look.z + dist * math.sin(elev)))

    # ---- orbit frames
    for i in range(args.orbit):
        fid = f"orbit-{i:02d}"
        if not mine(i, fid):
            continue
        set_fade(0.0)
        if noon is not None:
            noon.data.energy = 0.0
        house.rotation_euler = (0, 0, 0)
        cam.data.type = "PERSP"
        cam.data.lens = 40
        cam.data.clip_start = 0.1
        aim(cam, look, orbit_pose(i, args.orbit))
        render(scene, out / f"{fid}.png")
        frames.append(fid)
        log(f"{fid} {time.time()-t0:.0f}s")

    # ---- plan flight: from the last orbit pose to straight above, north-up
    north = math.radians(args.north)
    top_h = diag * 1.3
    start = orbit_pose(0, args.orbit)
    box = bpy.data.objects.get("interior")
    roof_objs = [o for o in bpy.data.objects if o.type == "MESH" and CAT_RE.match(o.name) and CAT_RE.match(o.name).group(2) == "roof"]
    sky = next((n for n in scene.world.node_tree.nodes if n.bl_idname == "ShaderNodeTexSky"), None)
    for j in range(args.plan):
        fid = f"plan-{j:02d}"
        if not mine(args.orbit + j, fid):
            continue
        t = j / max(1, args.plan - 1)
        e = 1 - (1 - t) ** 3  # ease-out
        # camera: lerp position toward the top, lens toward long (≈ ortho)
        pos = start.lerp(Vector((0.0001, 0.0001, top_h + size.z)), e)
        aim(cam, look.lerp(Vector((0, 0, 0)), e), pos)
        cam.data.lens = 40 + (160 - 40) * e
        # with the longer lens the camera must back off to keep framing
        cam.location = cam.location * (1 + 2.6 * e)
        # section cut: once the camera is steep enough (e > 0.6 ≈ 75°) the
        # clip plane descends in WORLD height from just above the ridge to
        # the cut height, so the roof peels away first and the walls open
        # over the last third of the flight. (Expressed as a fraction of the
        # camera distance it only bit in the final two frames.)
        cut_z = args.storey_z + args.cut
        cam_z = cam.location.z
        cut_progress = max(0.0, (e - 0.6) / 0.4)
        if cut_progress > 0:
            plane_z = (size.z + 0.3) - (size.z + 0.3 - cut_z) * cut_progress
            cam.data.clip_start = max(0.1, cam_z - plane_z)
        else:
            cam.data.clip_start = 0.1
        if box is not None:
            box.hide_render = cut_progress > 0  # the dark interior would fill the opened plan
        # the clip plane only hides the roof from the camera — it still
        # blocks light, which left the opened plan black. During the cut
        # the roof stops casting/bouncing and the sun climbs to noon so the
        # exposed floors read evenly, like a drawing
        for o in roof_objs:
            o.visible_shadow = cut_progress <= 0
            o.visible_diffuse = cut_progress <= 0
            o.visible_glossy = cut_progress <= 0
            o.visible_transmission = cut_progress <= 0
        if sky is not None:
            sky.sun_elevation = math.radians(28 + (86 - 28) * cut_progress)
        if noon is not None:
            noon.data.energy = 2.5 * cut_progress  # HDRI worlds: the top light stands in for a noon sun
        house.rotation_euler = (0, 0, north * e)
        set_fade(cut_progress)
        render(scene, out / f"{fid}.png")
        frames.append(fid)
        log(f"{fid} {time.time()-t0:.0f}s")

    manifest = {
        "generator": "method-homes render-turntable (Blender Cycles)",
        "blender": bpy.app.version_string,
        "width": args.width,
        "height": args.height,
        "orbit": [f"orbit-{i:02d}" for i in range(args.orbit)],
        "plan": [f"plan-{j:02d}" for j in range(args.plan)],
        "footprint": {"width_m": round(size.x, 2), "depth_m": round(size.y, 2), "height_m": round(size.z, 2)},
        "northDeg": args.north,
        "cutHeight_m": args.storey_z + args.cut,
        "samples": scene.cycles.samples,
        "seconds": round(time.time() - t0, 1),
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    log(f"done {len(frames)} frames in {time.time()-t0:.0f}s → {out}")


if __name__ == "__main__":
    main()

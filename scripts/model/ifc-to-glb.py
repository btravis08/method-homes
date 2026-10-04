#!/usr/bin/env python3
"""
IFC → web GLB, unattended (the 3D plan viewer pipeline).

  python3 scripts/model/ifc-to-glb.py <in.ifc> <out.glb> [--report out.json]
      [--keep IfcType,...] [--drop IfcType,...] [--min-size 0.3]

What it does, in order (see docs/PROJECT-LOG.md 2026-10-04):
  1. Reads the IFC with IfcOpenShell and walks every IfcProduct.
  2. Keeps architecture by IfcType (walls, slabs, roofs, windows, doors,
     stairs, railings, columns, beams, curtain walls, floor coverings);
     drops furniture, fixtures, services, spaces, openings, annotations,
     site/topography and anything smaller than --min-size metres.
     IfcBuildingElementProxy (untyped Revit "generic models") is kept
     only when it is big enough to be part of the building — the
     report lists every proxy so a human can allow/deny by name.
  3. Re-materials by CATEGORY (wall, floor, roof, glass, door, stair,
     rail, structure, misc): the viewer applies its own palette, so
     source materials, textures and baked light never reach the web.
  4. Groups geometry per storey × category (one mesh each) so the
     viewer can cut and hide storeys independently; records each
     storey's name and elevation.
  5. Normalises: metres, Z-up → Y-up, footprint centred on the origin,
     lowest floor at y = 0; reads the project's TrueNorth and stores
     the rotation (degrees) that makes plan view north-up.
  6. Writes a GLB (trimesh) with the metadata in `extras`, then prints
     a report (kept/dropped per type, triangles, bytes, storeys).

Afterwards run gltf-transform to compress (weld/simplify/meshopt):
  npx @gltf-transform/cli optimize out.glb out.glb --compress meshopt

Dependencies: pip install ifcopenshell trimesh numpy
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

try:
    import ifcopenshell
    import ifcopenshell.geom
    import ifcopenshell.util.element as ifc_element
    import ifcopenshell.util.placement as ifc_placement
    import trimesh
except ImportError as exc:  # pragma: no cover
    sys.exit(f"missing dependency: {exc}. pip install ifcopenshell trimesh numpy")

# ---- categories -----------------------------------------------------------

# IfcType → viewer category. Order matters only for readability.
KEEP: dict[str, str] = {
    "IfcWall": "wall",
    "IfcWallStandardCase": "wall",
    "IfcWallElementedCase": "wall",
    "IfcCurtainWall": "glass",
    "IfcSlab": "floor",            # PredefinedType ROOF → roof (below)
    "IfcRoof": "roof",
    "IfcWindow": "glass",
    "IfcDoor": "door",
    "IfcStair": "stair",
    "IfcStairFlight": "stair",
    "IfcRamp": "stair",
    "IfcRampFlight": "stair",
    "IfcRailing": "rail",
    "IfcColumn": "structure",
    "IfcBeam": "structure",
    "IfcMember": "structure",
    "IfcPlate": "glass",
    "IfcChimney": "wall",
    "IfcShadingDevice": "misc",
    "IfcCovering": "floor",        # FLOORING kept; CEILING/CLADDING dropped (below)
    "IfcBuildingElementProxy": "misc",  # kept only when large (see --min-size)
    "IfcFooting": "structure",
}

# dropped outright — never part of the home's envelope
DROP_PREFIXES = (
    "IfcFurnishing", "IfcFurniture", "IfcSystemFurniture", "IfcFlow", "IfcDistribution",
    "IfcSanitary", "IfcElectrical", "IfcEnergy", "IfcLight", "IfcPipe", "IfcDuct", "IfcCable",
    "IfcSpace", "IfcOpening", "IfcAnnotation", "IfcGrid", "IfcSite", "IfcGeographic",
    "IfcTransport", "IfcVirtual", "IfcBuildingElementPart", "IfcDiscreteAccessory",
    "IfcFastener", "IfcMechanicalFastener", "IfcReinforcing", "IfcTendon", "IfcVibration",
    "IfcCommunications", "IfcAudioVisual", "IfcMedical", "IfcFire", "IfcProtective",
    "IfcSolar", "IfcSensor", "IfcActuator", "IfcAlarm", "IfcController", "IfcUnitaryControl",
)

# palette the viewer expects (sRGB); the names are what matter — the
# viewer swaps colours for plan mode itself
PALETTE = {
    "wall": (0.93, 0.92, 0.89, 1.0),
    "floor": (0.80, 0.78, 0.74, 1.0),
    "roof": (0.36, 0.36, 0.35, 1.0),
    "glass": (0.62, 0.74, 0.80, 0.55),
    "door": (0.55, 0.43, 0.32, 1.0),
    "stair": (0.70, 0.66, 0.60, 1.0),
    "rail": (0.30, 0.30, 0.29, 1.0),
    "structure": (0.60, 0.58, 0.55, 1.0),
    "misc": (0.75, 0.73, 0.70, 1.0),
}


# untyped Revit "generic models" that are never part of the envelope
import re

PROXY_DENY = re.compile(
    r"refrigerator|fridge|freezer|range|cook|oven|stove|dishwasher|washer|dryer|microwave|hood|sink|basin|toilet|wc|bath|tub|shower|"
    r"furniture|chair|table|bed|sofa|couch|desk|shelf|cabinet|casework|counter|vanity|mirror|lamp|light|plant|tree|car|vehicle|person|"
    r"model text|text|tag|label|symbol|annotation",
    re.IGNORECASE,
)


def category_for(element) -> str | None:
    t = element.is_a()
    for prefix in DROP_PREFIXES:
        if t.startswith(prefix):
            return None
    # walk up the IFC inheritance chain to a known type
    cat = None
    for name, c in KEEP.items():
        try:
            if element.is_a(name):
                cat = c
                break
        except Exception:
            continue
    if cat is None:
        return None
    predefined = getattr(element, "PredefinedType", None)
    if element.is_a("IfcSlab") and predefined == "ROOF":
        return "roof"
    if element.is_a("IfcCovering"):
        return "floor" if predefined in ("FLOORING", None) else None
    return cat


# ---- geometry ----------------------------------------------------------------


def bbox_size(verts: np.ndarray) -> float:
    lo, hi = verts.min(axis=0), verts.max(axis=0)
    return float(np.max(hi - lo))


def true_north_degrees(model) -> float:
    """Rotation (degrees, counter-clockwise about +Z) that turns the model
    so its TrueNorth points to +Y. 0 when the project is already north-up."""
    for ctx in model.by_type("IfcGeometricRepresentationContext"):
        tn = getattr(ctx, "TrueNorth", None)
        if tn and tn.DirectionRatios:
            x, y = tn.DirectionRatios[0], tn.DirectionRatios[1]
            # angle from +Y to the TrueNorth vector; rotating the model by
            # -angle brings north to +Y
            ang = math.degrees(math.atan2(x, y))
            return round(-ang, 3)
    return 0.0


def storey_of(element):
    container = ifc_element.get_container(element)
    while container is not None and not container.is_a("IfcBuildingStorey"):
        container = ifc_element.get_container(container) if hasattr(container, "ContainedInStructure") else None
        if container is None:
            break
    return container


def storey_elevation(storey, unit_scale: float) -> float:
    """World-Z of the storey in METRES. The placement matrix is in the
    project's length unit (Revit: millimetres), so it is scaled by the
    project's unit factor; the Elevation attribute is the fallback."""
    try:
        m = ifc_placement.get_local_placement(storey.ObjectPlacement)
        return float(m[2][3]) * unit_scale
    except Exception:
        return float(getattr(storey, "Elevation", 0.0) or 0.0) * unit_scale


def with_extras(glb: bytes, extras: dict) -> bytes:
    """Put `extras` on the glTF root and on scene 0 (three's GLTFLoader
    exposes scene extras as scene.userData)."""
    import struct

    magic, version, _length = struct.unpack_from("<III", glb, 0)
    assert magic == 0x46546C67 and version == 2, "not a GLB v2"
    off = 12
    chunks = []
    while off < len(glb):
        clen, ctype = struct.unpack_from("<II", glb, off)
        chunks.append((ctype, glb[off + 8 : off + 8 + clen]))
        off += 8 + clen
    json_chunk = next(c for c in chunks if c[0] == 0x4E4F534A)
    doc = json.loads(json_chunk[1].decode("utf-8"))
    doc["extras"] = extras
    for sc in doc.get("scenes", []):
        sc["extras"] = extras
    doc.setdefault("asset", {})["generator"] = "method-homes ifc-to-glb (trimesh)"
    body = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    body += b" " * ((4 - len(body) % 4) % 4)
    outb = bytearray()
    outb += struct.pack("<II", len(body), 0x4E4F534A) + body
    for ctype, data in chunks:
        if ctype == 0x4E4F534A:
            continue
        data = data + b"\0" * ((4 - len(data) % 4) % 4)
        outb += struct.pack("<II", len(data), ctype) + data
    return struct.pack("<III", 0x46546C67, 2, 12 + len(outb)) + bytes(outb)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("ifc")
    ap.add_argument("out")
    ap.add_argument("--report")
    ap.add_argument("--keep", default="", help="extra IfcTypes to keep (comma list), e.g. IfcBuildingElementProxy")
    ap.add_argument("--drop", default="", help="IfcTypes to drop regardless (comma list)")
    ap.add_argument("--allow", default="", help="element Names/GlobalIds to keep even if small (comma list)")
    ap.add_argument("--deny", default="", help="element Names/GlobalIds to drop (comma list)")
    ap.add_argument("--min-size", type=float, default=0.3, help="drop kept elements whose bbox is smaller than this (m)")
    ap.add_argument("--proxy-min-size", type=float, default=1.5, help="IfcBuildingElementProxy survives only above this size (m)")
    ap.add_argument("--iterator", action="store_true", help="use the multi-threaded geometry iterator (slower on some Revit exports)")
    ap.add_argument("--cache", help="npz file to cache extracted geometry between runs (export tweaks skip the geometry pass)")
    args = ap.parse_args()

    t0 = time.time()
    model = ifcopenshell.open(args.ifc)
    schema = model.schema
    extra_keep = {t: "misc" for t in filter(None, args.keep.split(","))}
    drop_types = set(filter(None, args.drop.split(",")))
    allow = set(filter(None, args.allow.split(",")))
    deny = set(filter(None, args.deny.split(",")))

    settings = ifcopenshell.geom.settings()
    settings.set("use-world-coords", True)
    settings.set("weld-vertices", True)
    settings.set("apply-default-materials", False)
    # Body only: Revit walls also carry a 2D "Axis" curve representation,
    # and converting the whole product fails on it (found on BasicHouse —
    # every wall was lost until the contexts were restricted)
    body_ctx = [c.id() for c in model.by_type("IfcGeometricRepresentationContext") if (getattr(c, "ContextIdentifier", None) or "") == "Body"]
    if body_ctx:
        settings.set("context-ids", body_ctx)
    # coarser curve tessellation (1 cm / 0.5 rad): door handles and
    # window frames no longer cost hundreds of thousands of triangles
    for name, value in (("mesher-linear-deflection", 0.01), ("mesher-angular-deflection", 0.5)):
        try:
            settings.set(name, value)
        except Exception:
            pass

    # storeys (elevations in metres via the project's unit scale)
    import ifcopenshell.util.unit as ifc_unit

    try:
        unit_scale = float(ifc_unit.calculate_unit_scale(model))
    except Exception:
        unit_scale = 1.0
    storeys = []
    for st in model.by_type("IfcBuildingStorey"):
        storeys.append({"id": st.GlobalId, "name": st.Name or "Storey", "elevation": storey_elevation(st, unit_scale)})
    storeys.sort(key=lambda s: s["elevation"])
    storey_index = {s["id"]: i for i, s in enumerate(storeys)}

    north = true_north_degrees(model)

    kept = Counter()
    dropped = Counter()
    proxies = []
    small = []
    groups: dict[tuple[int, str], list[trimesh.Trimesh]] = defaultdict(list)
    tri_total = 0

    # pass 1: decide by type (cheap) — only kept elements get geometry
    wanted: dict[str, tuple] = {}
    for el in model.by_type("IfcProduct"):
        t = el.is_a()
        if t in drop_types or el.GlobalId in deny or (el.Name and el.Name in deny):
            dropped[t] += 1
            continue
        cat = category_for(el)
        if cat is None and t in extra_keep:
            cat = extra_keep[t]
        if cat is None:
            dropped[t] += 1
            continue
        if not getattr(el, "Representation", None):
            dropped[t] += 1
            continue
        wanted[el.GlobalId] = (el, cat)

    # pass 2: geometry for the kept set, on every core
    import multiprocessing

    shapes: dict[str, tuple] = {}
    elements = [w[0] for w in wanted.values()]
    cache = Path(args.cache) if args.cache else None
    if cache and cache.exists():
        with np.load(cache) as z:
            guids = list(z["guids"])
            for guid in guids:
                shapes[str(guid)] = (z[f"v_{guid}"], z[f"f_{guid}"])
        print(f"  geometry from cache {cache} ({len(shapes)} shapes)")
        elements = [el for el in elements if el.GlobalId not in shapes]
    # NOTE: the multi-threaded iterator with include= ran far slower than
    # one-by-one create_shape on the Revit BasicHouse sample (>20 min vs
    # 3.5 min), so it is opt-in (--iterator) until that is understood.
    try:
        if not args.iterator:
            raise RuntimeError("iterator disabled (pass --iterator to try it)")
        it = ifcopenshell.geom.iterator(settings, model, max(1, multiprocessing.cpu_count()), include=elements)
        if it.initialize():
            while True:
                shape = it.get()
                shapes[shape.guid] = (np.array(shape.geometry.verts, dtype=np.float64).reshape(-1, 3), np.array(shape.geometry.faces, dtype=np.int64).reshape(-1, 3))
                if not it.next():
                    break
    except Exception as exc:  # fall back to one-by-one
        if args.iterator:
            print(f"  iterator unavailable ({exc}); converting one by one", file=sys.stderr)
    for guid, (el, cat) in wanted.items():
        if guid in shapes:
            continue
        try:
            shape = ifcopenshell.geom.create_shape(settings, el)
            shapes[guid] = (np.array(shape.geometry.verts, dtype=np.float64).reshape(-1, 3), np.array(shape.geometry.faces, dtype=np.int64).reshape(-1, 3))
        except Exception:
            dropped[f"{el.is_a()} (geometry failed)"] += 1

    if cache and elements:
        arrays = {"guids": np.array(list(shapes.keys()))}
        for guid, (v, f) in shapes.items():
            arrays[f"v_{guid}"] = v
            arrays[f"f_{guid}"] = f
        cache.parent.mkdir(parents=True, exist_ok=True)
        np.savez(cache, **arrays)

    for guid, (el, cat) in wanted.items():
        t = el.is_a()
        if guid not in shapes:
            continue
        verts, faces = shapes[guid]
        if len(faces) == 0:
            dropped[f"{t} (empty)"] += 1
            continue
        size = bbox_size(verts)
        allowed = el.GlobalId in allow or (el.Name and el.Name in allow)
        if t == "IfcBuildingElementProxy":
            named_out = bool(PROXY_DENY.search(el.Name or "")) and not allowed
            keep_proxy = allowed or (size >= args.proxy_min_size and not named_out)
            proxies.append({"name": el.Name, "id": el.GlobalId, "size_m": round(size, 2), "kept": keep_proxy, **({"reason": "name"} if named_out else {})})
            if not keep_proxy:
                dropped[t] += 1
                continue
        elif size < args.min_size and not allowed:
            small.append({"type": t, "name": el.Name, "id": el.GlobalId, "size_m": round(size, 2)})
            dropped[f"{t} (small)"] += 1
            continue
        st = storey_of(el)
        si = storey_index.get(st.GlobalId, 0) if st is not None else 0
        mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=False)
        groups[(si, cat)].append(mesh)
        kept[t] += 1
        tri_total += len(faces)

    if not groups:
        sys.exit("nothing kept — check the IfcTypes in the file")

    # ---- normalise: centre footprint, floor at 0, Z-up → Y-up
    all_v = np.vstack([m.vertices for ms in groups.values() for m in ms])
    lo, hi = all_v.min(axis=0), all_v.max(axis=0)
    cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
    base_z = min([s["elevation"] for s in storeys] + [lo[2]]) if storeys else lo[2]
    # Z-up (x, y, z) → Y-up (x, z, -y)
    to_yup = np.array([[1, 0, 0, -cx], [0, 0, 1, -base_z], [0, -1, 0, cy], [0, 0, 0, 1]], dtype=np.float64)

    scene = trimesh.Scene()
    scene.metadata["extras"] = {}
    nodes = []
    for (si, cat), meshes in sorted(groups.items()):
        merged = trimesh.util.concatenate(meshes) if len(meshes) > 1 else meshes[0]
        merged.apply_transform(to_yup)
        merged.merge_vertices()
        r, g, b, a = PALETTE[cat]
        merged.visual = trimesh.visual.TextureVisuals(
            material=trimesh.visual.material.PBRMaterial(
                name=f"{cat}",
                baseColorFactor=[int(r * 255), int(g * 255), int(b * 255), int(a * 255)],
                metallicFactor=0.0,
                roughnessFactor=0.9 if cat != "glass" else 0.2,
                alphaMode="BLEND" if a < 1 else "OPAQUE",
                doubleSided=True,
            )
        )
        name = f"storey{si}_{cat}"
        storey = storeys[si] if si < len(storeys) else {"name": "Storey", "elevation": 0.0}
        scene.add_geometry(merged, node_name=name, geom_name=name)
        nodes.append({"node": name, "storey": si, "category": cat, "triangles": int(len(merged.faces))})

    footprint = {"width_m": round(float(hi[0] - lo[0]), 2), "depth_m": round(float(hi[1] - lo[1]), 2), "height_m": round(float(hi[2] - base_z), 2)}
    extras = {
        "generator": "method-homes ifc-to-glb",
        "schema": schema,
        "northDeg": north,
        # habitable = has walls/doors/windows on it (Revit exports its roof
        # level as a storey; the viewer offers only habitable ones)
        "storeys": [
            {"index": i, "name": s["name"], "elevation_m": round(s["elevation"] - base_z, 3), "habitable": any((i, c) in groups for c in ("wall", "door", "glass"))}
            for i, s in enumerate(storeys)
        ],
        "footprint": footprint,
        "nodes": nodes,
    }
    scene.metadata["extras"] = extras

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    glb = with_extras(trimesh.exchange.gltf.export_glb(scene, include_normals=True), extras)
    out.write_bytes(glb)

    report = {
        "input": str(args.ifc),
        "output": str(out),
        "bytes": len(glb),
        "triangles": tri_total,
        "seconds": round(time.time() - t0, 1),
        "schema": schema,
        "northDeg": north,
        "footprint": footprint,
        "storeys": extras["storeys"],
        "kept": dict(kept.most_common()),
        "dropped": dict(dropped.most_common()),
        "proxies": proxies,
        "smallDropped": small[:50],
        "nodes": nodes,
    }
    if args.report:
        Path(args.report).parent.mkdir(parents=True, exist_ok=True)
        Path(args.report).write_text(json.dumps(report, indent=2) + "\n")
    print(f"✓ {out} — {len(glb)/1024/1024:.2f} MB, {tri_total:,} triangles, {sum(kept.values())} elements kept / {sum(dropped.values())} dropped, {len(storeys)} storeys, north {north}°, {report['seconds']}s")
    for k, v in kept.most_common():
        print(f"  keep  {v:4d}  {k}")
    for k, v in dropped.most_common(12):
        print(f"  drop  {v:4d}  {k}")
    if proxies:
        print(f"  proxies ({len(proxies)}): " + ", ".join(f"{p['name'] or p['id']} {p['size_m']}m {'✓' if p['kept'] else '✗'}" for p in proxies[:10]))
    return 0


if __name__ == "__main__":
    sys.exit(main())

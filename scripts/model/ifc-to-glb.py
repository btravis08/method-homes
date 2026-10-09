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
     With --keep-materials (model3d.keepMaterials, 2026-10-09) the WALL
     category is instead split by its source surface style: one node per
     storey × siding material (`storey0_wall__cedar-siding-8a6a4b`), its
     glTF material carrying the IFC's diffuse colour and the element's
     IfcMaterial name, so the viewer shows Method's real siding. Cladding
     coverings (IfcCovering CLADDING) are kept as wall in that mode. The
     report always lists the surface styles seen per category.
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
    "frame": (0.16, 0.15, 0.14, 1.0),   # window/curtain-wall frames (split from the panes by surface-style transparency)
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
    r"furniture|chair|table|bed|sofa|couch|desk|shelf|cabinet|casework|counter|vanity|mirror|lamp|light|plant|tree|car\b|vehicle|person|"
    r"model text|text|tag|label|symbol|annotation|"
    # entourage from the Method sample (2026-10-09): Enscape asset
    # libraries (bushes, trees), RPC trees, cars named after their model
    r"enscape|asset ?definition|\brpc\b|tesla|truck|bush|shrub|grass|hedge",
    re.IGNORECASE,
)
# appliance catalogue numbers exported as proxy families ("T24IF905SP")
CATALOG_RE = re.compile(r"^[A-Z]{1,4}\d{2,}[A-Z0-9-]*$")

# the categories that ARE the home — they define the ground, the
# footprint and the neighbourhood every other kept element must share
ENVELOPE = ("wall", "roof", "floor", "glass", "frame", "door", "stair")
OUTLIER_M = 15.0  # kept elements further than this from the envelope are site context, not the home
# the CORE is the roofs' plan extent (+margin): the Method sample carried
# an 88 m cast-in-place retaining wall as IfcWall segments on the FIRST
# FLOOR storey — same type and storey as the house, so only "is it under
# the roof?" tells them apart. (A length test failed: this home's main
# roof is 49 m long.) Wall/floor meshes entirely below the ground storey
# are the segments running down the slope.
CORE_MARGIN_M = 3.0
BELOW_GROUND_M = 1.5


ROOF_NAME = re.compile(r"roof|\btak\b|plåttak|dach|toit|tetto|cubierta", re.IGNORECASE)


def category_for(element, aggregate_parent=None, keep_materials: bool = False) -> str | None:
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
    if element.is_a("IfcSlab"):
        # Revit exports roofs as IfcSlab NOTDEFINED under an IfcRoof
        # aggregate (BasicHouse: "Basic Roof:Svart plåttak") — the parent
        # or the family name says roof when the type does not
        name = f"{element.Name or ''} {element.ObjectType or ''}"
        if predefined == "ROOF" or (aggregate_parent is not None and aggregate_parent.is_a("IfcRoof")) or ROOF_NAME.search(name):
            return "roof"
    if element.is_a("IfcCovering"):
        if predefined in ("FLOORING", None):
            return "floor"
        # siding modelled as cladding rides with the walls when the source
        # materials are kept (it IS the material we are keeping)
        return "wall" if (keep_materials and predefined == "CLADDING") else None
    return cat


def element_material_name(element) -> str | None:
    """The human name of the element's material: a plain IfcMaterial, the
    OUTER layer of a layer set (Revit lists layers exterior → interior),
    the first of a list, or the first constituent."""
    try:
        mat = ifc_element.get_material(element)
    except Exception:
        return None
    if mat is None:
        return None
    try:
        if mat.is_a("IfcMaterial"):
            return mat.Name
        if mat.is_a("IfcMaterialLayerSetUsage"):
            mat = mat.ForLayerSet
        if mat.is_a("IfcMaterialLayerSet"):
            layers = [l for l in (mat.MaterialLayers or []) if l.Material]
            return (layers[0].Material.Name if layers else None) or mat.LayerSetName
        if mat.is_a("IfcMaterialList"):
            ms = mat.Materials or []
            return ms[0].Name if ms else None
        if mat.is_a("IfcMaterialConstituentSet"):
            cs = mat.MaterialConstituents or []
            return (cs[0].Material.Name if cs and cs[0].Material else None) or mat.Name
        if mat.is_a("IfcMaterialProfileSetUsage"):
            ps = mat.ForProfileSet.MaterialProfiles or []
            return ps[0].Material.Name if ps and ps[0].Material else None
    except Exception:
        return None
    return getattr(mat, "Name", None)


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return s[:40] or "material"


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


# ---------------------------------------------------------------- MODULES
# (Bryce, 2026-10-09: "split into its separate prefab modules and pulled
# apart"). Method's Revit model carries no module tag on elements; what it
# has is an area scheme — IfcSpace objects named "MOD A" … "MOD G" plus
# the site-built pieces ("SITE BUILT LIVING", "UNCOVERED DECK", "GARAGE"),
# all members of one IfcGroup ("Gross Building"). Those footprints decide
# which module every element belongs to; an element that spans a seam (the
# roof, the main floor slab, a long wall) is SLICED along the footprint
# edges and each piece goes with its module. Pieces outside every footprint
# (eave overhangs) ride with the nearest one. The GLB then carries a
# `module<K>` parent node per module (children named `…~m<K>`) and
# `extras.modules` for the viewer's exploded view.
MODULE_NAME_RE = re.compile(r"^\s*(mod(ule)?)\b", re.I)
MODULE_SKIP_RE = re.compile(r"roof|driveway|\blot\b|yard|site\s*$|parking", re.I)


def module_spaces(model) -> list:
    """IfcSpaces that are modules (or their site-built siblings), with a
    `prefab` flag: every space in a group that holds a MOD-named space,
    minus roof/driveway areas; or just the MOD-named spaces when they are
    not grouped."""
    label = lambda sp: (sp.LongName or sp.Name or "").strip()
    mods = [sp for sp in model.by_type("IfcSpace") if MODULE_NAME_RE.match(label(sp))]
    if not mods:
        return []
    chosen: dict[int, object] = {sp.id(): sp for sp in mods}
    for rel in model.by_type("IfcRelAssignsToGroup"):
        members = list(rel.RelatedObjects or [])
        if any(m.id() in chosen for m in members):
            for m in members:
                if m.is_a("IfcSpace") and not MODULE_SKIP_RE.search(label(m)):
                    chosen[m.id()] = m
    out = []
    for sp in chosen.values():
        out.append({"space": sp, "name": label(sp), "prefab": bool(MODULE_NAME_RE.match(label(sp)))})
    out.sort(key=lambda m: (not m["prefab"], m["name"]))
    return out


def footprint_polygon(verts: np.ndarray, faces: np.ndarray):
    """the 2D (x, y) footprint of a mesh: union of its triangles, largest
    part, lightly simplified"""
    from shapely.geometry import Polygon
    from shapely.ops import unary_union

    tris = []
    for f in faces:
        t = verts[f][:, :2]
        if abs((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (t[1][1] - t[0][1])) < 1e-6:
            continue
        tris.append(Polygon(t))
    if not tris:
        return None
    u = unary_union(tris).buffer(0.01).buffer(-0.01)
    if u.geom_type == "MultiPolygon":
        u = max(u.geoms, key=lambda g: g.area)
    if u.is_empty or u.area < 1.0:
        return None
    return u.simplify(0.03)


def module_cells(polys: list, reach_m: float = 30.0) -> list:
    """Nearest-footprint regions: a Voronoi partition of the plane seeded
    by points sampled along every footprint's boundary, so overhangs and
    eaves outside the footprints fall to the module they are nearest."""
    import shapely
    from shapely.geometry import MultiPoint, Point
    from shapely.ops import unary_union

    pts = []
    owner = []
    for k, poly in enumerate(polys):
        # sample just INSIDE each footprint: adjacent modules share their
        # seam, and a shared sample point would hand the seam to either
        inset = poly.buffer(-0.08)
        ring = (inset if not inset.is_empty and inset.geom_type == "Polygon" else poly).exterior
        n = max(8, int(ring.length / 0.25))
        for i in range(n):
            p = ring.interpolate(i / n, normalized=True)
            pts.append((p.x, p.y))
            owner.append(k)
    env = unary_union(polys).envelope.buffer(reach_m)
    cells = shapely.voronoi_polygons(MultiPoint(pts), extend_to=env)
    per: dict[int, list] = {k: [] for k in range(len(polys))}
    tree = shapely.STRtree([Point(p) for p in pts])
    for cell in cells.geoms:
        hit = tree.query(cell.representative_point(), predicate="within")
        if len(hit) == 0:
            hit = tree.query_nearest(cell.representative_point())
        per[owner[int(hit[0])]].append(cell)
    def union(geoms):
        # the Voronoi cells form a valid coverage; plain unary_union can hit
        # a GEOS TopologyException on their shared edges (run 38002125209)
        try:
            return shapely.coverage_union_all(geoms)
        except Exception:
            try:
                return unary_union([shapely.make_valid(g) for g in geoms])
            except Exception:
                return unary_union([g.buffer(1e-3) for g in geoms])

    out = []
    for k in range(len(polys)):
        try:
            cell = shapely.make_valid(union(per[k])).intersection(env)
        except Exception:
            cell = polys[k].buffer(1.0)  # a near-footprint fallback cell
        out.append(cell)
    return out


def clip_solid(mesh: "trimesh.Trimesh", cells: list, hit: list) -> dict:
    """Closed solids are cut with a real boolean (manifold3d) against each
    candidate module's cell prism — every piece stays a closed solid, so
    a roof slab keeps its 400 mm edge at a seam (uncapped slicing left
    two skins with a void between)."""
    v = mesh.vertices
    z0, z1 = float(v[:, 2].min()) - 1.0, float(v[:, 2].max()) - float(v[:, 2].min()) + 2.0
    out = {}
    for k in hit:
        cell = cells[k]
        geoms = list(cell.geoms) if cell.geom_type == "MultiPolygon" else [cell]
        pieces = []
        for g in geoms:
            if g.is_empty or g.area < 0.05:
                continue
            prism = trimesh.creation.extrude_polygon(g, z1)
            prism.apply_translation((0, 0, z0))
            try:
                cut = trimesh.boolean.intersection([mesh, prism], engine="manifold")
            except Exception:
                return {}
            if cut is not None and len(cut.faces):
                pieces.append(cut)
        if pieces:
            out[k] = trimesh.util.concatenate(pieces) if len(pieces) > 1 else pieces[0]
    return out


def partition_mesh(mesh: "trimesh.Trimesh", polys: list, snap_m: float = 1.0, cells: list | None = None):
    """Split a mesh across module footprints. Returns {module index | None:
    Trimesh}. A mesh wholly inside one footprint is returned as is; one
    that straddles seams is sliced along every footprint edge it overlaps
    and its faces are dealt out by centroid (outside faces go to the
    nearest footprint within `snap_m`, else to None)."""
    import shapely

    from shapely.geometry import box as shapely_box

    v = mesh.vertices
    lo, hi = v.min(axis=0), v.max(axis=0)
    # candidates by footprint overlap with the mesh's box — a roof's
    # vertices all sit on its overhang, outside every module
    bbox = shapely_box(lo[0], lo[1], hi[0], hi[1])
    hit = [k for k, poly in enumerate(polys) if poly.intersects(bbox)]
    inside = np.zeros((len(polys), len(v)), dtype=bool)
    for k in hit:
        inside[k] = shapely.contains_xy(polys[k], v[:, 0], v[:, 1])
    if not hit:
        c = shapely.points(v[:, :2].mean(axis=0))
        d = np.array([float(poly.distance(c)) for poly in polys]) if polys else np.array([])
        if d.size and d.min() <= snap_m:
            return {int(d.argmin()): mesh}
        return {None: mesh}
    if len(hit) == 1 and inside[hit[0]].all():
        return {hit[0]: mesh}
    # a closed solid: boolean-cut against the modules' cells (see clip_solid)
    if cells is not None and mesh.is_watertight:
        cut = clip_solid(mesh, cells, hit)
        if cut:
            return cut
    # an open shell (walls split by surface colour): slice along the edges
    # of the footprints this mesh touches and deal the faces out
    m = mesh
    cap = False
    for k in hit:
        xy = np.asarray(polys[k].exterior.coords)
        for a, b in zip(xy[:-1], xy[1:]):
            d = b - a
            L = float(np.hypot(*d))
            if L < 0.05:
                continue
            # skip edges whose line misses the mesh's box entirely
            n = np.array([-d[1] / L, d[0] / L, 0.0])
            corners = np.array([[x, y, 0.0] for x in (lo[0], hi[0]) for y in (lo[1], hi[1])])
            side = (corners - np.array([a[0], a[1], 0.0])) @ n
            if side.min() > 0 or side.max() < 0:
                continue
            o = np.array([a[0], a[1], 0.0])
            try:
                front = trimesh.intersections.slice_mesh_plane(m, n, o, cap=cap)
                back = trimesh.intersections.slice_mesh_plane(m, -n, o, cap=cap)
            except Exception:
                try:
                    front = trimesh.intersections.slice_mesh_plane(m, n, o, cap=False)
                    back = trimesh.intersections.slice_mesh_plane(m, -n, o, cap=False)
                    cap = False
                except Exception:
                    continue
            parts = [p for p in (front, back) if p is not None and len(p.faces)]
            if len(parts) == 2:
                m = trimesh.util.concatenate(parts)
    cent = m.triangles_center
    label = np.full(len(cent), -1, dtype=np.int64)
    pts = shapely.points(cent[:, :2])
    for k, poly in enumerate(polys):
        sel = (label < 0) & shapely.contains_xy(poly, cent[:, 0], cent[:, 1])
        label[sel] = k
    out_sel = label < 0
    if out_sel.any():
        # faces outside every footprint (overhangs, eave corners) belong to
        # the element that touches a module: they go with the nearest one
        dist = np.stack([shapely.distance(poly, pts[out_sel]) for poly in polys], axis=1)
        label[np.flatnonzero(out_sel)] = dist.argmin(axis=1)
    result = {}
    for k in np.unique(label):
        sel = label == k
        sub = trimesh.Trimesh(vertices=m.vertices, faces=m.faces[sel], process=False)
        sub.remove_unreferenced_vertices()
        result[None if k < 0 else int(k)] = sub
    return result


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
    ap.add_argument("--keep-materials", action="store_true", help="split walls by their source surface style and carry the IFC's siding colours + material names into the GLB (model3d.keepMaterials)")
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
    # default materials ON so every face carries a surface style: the pane /
    # frame split below reads each face's transparency (Revit windows carry
    # an opaque frame style and a ~0.75-transparent glazing style)
    settings.set("apply-default-materials", True)
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
    site = []  # single elements too long/tall to be part of the home (retaining walls, site slabs) — allow by name if one is wrong
    groups: dict[tuple[int, str, str | None, int | None], list[trimesh.Trimesh]] = defaultdict(list)  # (storey, category, material key | None, module | None)
    tri_total = 0

    # aggregate parents (IfcRoof → its slabs, stairs → flights…)
    parent_of: dict[int, object] = {}
    for rel in model.by_type("IfcRelAggregates"):
        for child in rel.RelatedObjects or []:
            parent_of[child.id()] = rel.RelatingObject

    # pass 1: decide by type (cheap) — only kept elements get geometry
    wanted: dict[str, tuple] = {}
    for el in model.by_type("IfcProduct"):
        t = el.is_a()
        if t in drop_types or el.GlobalId in deny or (el.Name and el.Name in deny):
            dropped[t] += 1
            continue
        cat = category_for(el, parent_of.get(el.id()), args.keep_materials)
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

    shapes: dict[str, tuple] = {}  # guid → (verts, faces, per-face transparency | None, per-face rgb (n,3) | None)
    elements = [w[0] for w in wanted.values()]
    cache = Path(args.cache) if args.cache else None
    if cache and cache.exists():
        with np.load(cache) as z:
            guids = list(z["guids"])
            for guid in guids:
                # v3 cache entries carry per-face transparency AND colour;
                # older entries are re-extracted so the material split has them
                if f"t_{guid}" in z.files and f"c_{guid}" in z.files:
                    t = z[f"t_{guid}"]
                    c = z[f"c_{guid}"]
                    shapes[str(guid)] = (z[f"v_{guid}"], z[f"f_{guid}"], None if t.size == 0 else t, None if c.size == 0 else c)
        print(f"  geometry from cache {cache} ({len(shapes)} shapes)")
        elements = [el for el in elements if el.GlobalId not in shapes]

    def style_rgb(style):
        """diffuse colour of an IfcOpenShell style as (r, g, b) in 0–1, or None"""
        d = getattr(style, "diffuse", None)
        if d is None:
            return None
        try:
            return (float(d.r()), float(d.g()), float(d.b()))
        except Exception:
            try:
                r, g, b = tuple(d)[:3]
                return (float(r), float(g), float(b))
            except Exception:
                return None

    def face_styles(geometry):
        """per-face (transparency, rgb) from the surface styles, or (None, None)"""
        try:
            mats = geometry.materials
            ids = np.array(geometry.material_ids, dtype=np.int64)
            if len(mats) == 0 or ids.size == 0:
                return None, None
            tr = np.array([float(getattr(m, "transparency", 0.0) or 0.0) for m in mats], dtype=np.float32)
            rgb = np.array([style_rgb(m) or (np.nan, np.nan, np.nan) for m in mats], dtype=np.float32)
            ids = np.clip(ids, 0, len(tr) - 1)
            return tr[ids], rgb[ids]
        except Exception:
            return None, None

    def face_transparency(geometry):
        return face_styles(geometry)[0]
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
                shapes[shape.guid] = (np.array(shape.geometry.verts, dtype=np.float64).reshape(-1, 3), np.array(shape.geometry.faces, dtype=np.int64).reshape(-1, 3), *face_styles(shape.geometry))
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
            shapes[guid] = (np.array(shape.geometry.verts, dtype=np.float64).reshape(-1, 3), np.array(shape.geometry.faces, dtype=np.int64).reshape(-1, 3), *face_styles(shape.geometry))
        except Exception:
            dropped[f"{el.is_a()} (geometry failed)"] += 1

    if cache and elements:
        arrays = {"guids": np.array(list(shapes.keys()))}
        for guid, (v, f, t, c) in shapes.items():
            arrays[f"v_{guid}"] = v
            arrays[f"f_{guid}"] = f
            arrays[f"t_{guid}"] = t if t is not None else np.zeros(0, dtype=np.float32)
            arrays[f"c_{guid}"] = c if c is not None else np.zeros(0, dtype=np.float32)
        cache.parent.mkdir(parents=True, exist_ok=True)
        np.savez(cache, **arrays)

    # the CORE in plan: the roofs' extent (+margin), or the walls of the
    # busiest storey when the model has no IfcRoof — everything kept must
    # touch it, or it is site work (see CORE_MARGIN_M)
    def xy_box(v):
        lo_, hi_ = v.min(axis=0), v.max(axis=0)
        return (lo_[0], lo_[1], hi_[0], hi_[1])

    boxes = [xy_box(shapes[g][0]) for g, (el, cat) in wanted.items() if g in shapes and cat == "roof" and len(shapes[g][1])]
    if not boxes:
        by_storey: Counter = Counter()
        for g, (el, cat) in wanted.items():
            if g in shapes and cat == "wall":
                st_ = storey_of(el)
                by_storey[st_.GlobalId if st_ is not None else None] += len(shapes[g][1])
        top = by_storey.most_common(1)[0][0] if by_storey else None
        for g, (el, cat) in wanted.items():
            if g in shapes and cat == "wall":
                st_ = storey_of(el)
                if (st_.GlobalId if st_ is not None else None) == top:
                    boxes.append(xy_box(shapes[g][0]))
    core = None
    if boxes:
        a = np.array(boxes, dtype=np.float64)
        core = (a[:, 0].min() - CORE_MARGIN_M, a[:, 1].min() - CORE_MARGIN_M, a[:, 2].max() + CORE_MARGIN_M, a[:, 3].max() + CORE_MARGIN_M)

    # module footprints (see MODULES above): IfcSpace areas → polygons
    modules: list[dict] = []
    module_polys: list = []
    for mi, m_ in enumerate(module_spaces(model)):
        sp = m_["space"]
        poly = None
        try:
            if getattr(sp, "Representation", None):
                shp = ifcopenshell.geom.create_shape(settings, sp)
                sv = np.array(shp.geometry.verts, dtype=np.float64).reshape(-1, 3)
                sf = np.array(shp.geometry.faces, dtype=np.int64).reshape(-1, 3)
                poly = footprint_polygon(sv, sf)
        except Exception as exc:
            print(f"  module {m_['name']!r}: no footprint ({exc})", file=sys.stderr)
        if poly is None:
            continue
        modules.append({"index": len(module_polys), "name": m_["name"], "prefab": m_["prefab"], "poly": poly})
        module_polys.append(poly)
    module_cells_: list | None = None
    if module_polys:
        try:
            module_cells_ = module_cells(module_polys)
        except Exception as exc:  # the uncapped slice still works without cells
            print(f"  module cells unavailable ({exc}); seams stay uncapped", file=sys.stderr)
    if modules:
        print(f"  modules: " + ", ".join(f"{m['name']}{'' if m['prefab'] else ' (site-built)'} {m['poly'].area:.0f} m²" for m in modules))
        # which ROOMS each module holds (the other IfcSpaces, by centroid):
        # the viewer's module story opens on "the module with the kitchen"
        import shapely

        chosen_ids = {m_["space"].id() for m_ in module_spaces(model)}
        for m_ in modules:
            m_["rooms"] = []
        for sp in model.by_type("IfcSpace"):
            if sp.id() in chosen_ids or not getattr(sp, "Representation", None):
                continue
            label = (sp.LongName or sp.Name or "").strip()
            if not label:
                continue
            try:
                shp = ifcopenshell.geom.create_shape(settings, sp)
                sv = np.array(shp.geometry.verts, dtype=np.float64).reshape(-1, 3)
                c = shapely.points(sv[:, :2].mean(axis=0))
            except Exception:
                continue
            best = min(modules, key=lambda m: float(m["poly"].distance(c)))
            if float(best["poly"].distance(c)) <= 0.5:
                best["rooms"].append(label)
        print("  rooms: " + "; ".join(f"{m['name']}: {', '.join(m['rooms']) or '—'}" for m in modules))
    module_stats: Counter = Counter()
    # what each module is made of, by IFC type (an element sliced across
    # a seam counts in every module it reaches, and once in `sliced`)
    module_detail: dict = defaultdict(Counter)

    # surface-style inventory per category (always reported) and the
    # per-material wall split (--keep-materials): key → {name, rgb, faces}
    styles_seen: dict[str, dict] = defaultdict(lambda: {"faces": 0, "elements": set()})
    materials: dict[str, dict] = {}

    def material_key(el, rgb) -> str:
        name = element_material_name(el) or (el.ObjectType or el.Name or "wall").split(":")[0]
        hexcol = "%02x%02x%02x" % tuple(int(round(max(0.0, min(1.0, c)) * 255)) for c in rgb)
        key = f"{slugify(name)}-{hexcol}"
        if key not in materials:
            materials[key] = {"name": name, "color": f"#{hexcol}", "rgb": [round(float(c), 4) for c in rgb], "faces": 0, "elements": 0}
        return key

    for guid, (el, cat) in wanted.items():
        t = el.is_a()
        if guid not in shapes:
            continue
        verts, faces, transp, rgb = shapes[guid]
        if len(faces) == 0:
            dropped[f"{t} (empty)"] += 1
            continue
        size = bbox_size(verts)
        allowed = el.GlobalId in allow or (el.Name and el.Name in allow)
        if t == "IfcBuildingElementProxy":
            # Revit names a proxy "Family:Type:Id" — the catalogue-number
            # test runs on the family alone ("T24IF905SP:T24IF905SP:2750684")
            family = (el.Name or "").split(":")[0].strip()
            named_out = (bool(PROXY_DENY.search(el.Name or "")) or bool(CATALOG_RE.match(family))) and not allowed
            keep_proxy = allowed or (size >= args.proxy_min_size and not named_out)
            proxies.append({"name": el.Name, "id": el.GlobalId, "size_m": round(size, 2), "kept": keep_proxy, **({"reason": "name"} if named_out else {})})
            if not keep_proxy:
                dropped[t] += 1
                continue
        elif size < args.min_size and not allowed:
            small.append({"type": t, "name": el.Name, "id": el.GlobalId, "size_m": round(size, 2)})
            dropped[f"{t} (small)"] += 1
            continue
        if core is not None and cat != "roof" and not allowed:
            lo2, hi2 = verts.min(axis=0), verts.max(axis=0)
            if hi2[0] < core[0] or lo2[0] > core[2] or hi2[1] < core[1] or lo2[1] > core[3]:
                site.append({"type": t, "name": el.Name, "id": el.GlobalId, "material": element_material_name(el), "extent_m": [round(float(x), 1) for x in (hi2 - lo2)]})
                dropped[f"{t} (outside the roof footprint)"] += 1
                continue
        st = storey_of(el)
        si = storey_index.get(st.GlobalId, 0) if st is not None else 0
        # pane / frame split: faces whose surface style is transparent are
        # glass; the opaque faces of a window are its FRAME (dark), and the
        # opaque faces of a glazed door stay door. Without styles the whole
        # element keeps its category as before.
        parts: list[tuple[str, np.ndarray, str | None]] = [(cat, faces, None)]
        if cat in ("glass", "door") and transp is not None and len(transp) == len(faces):
            clear = transp > 0.3
            if clear.any() and (~clear).any():
                parts = [("glass", faces[clear], None), ("frame" if cat == "glass" else "door", faces[~clear], None)]
            elif cat == "glass" and not clear.any():
                parts = [("frame", faces, None)]  # a window with no glazing style at all: treat as frame
        elif cat == "wall" and args.keep_materials and rgb is not None and len(rgb) == len(faces):
            # one part per distinct source colour (rounded to 8 bits), so a
            # wall whose faces carry two sidings keeps both
            ok = ~np.isnan(rgb).any(axis=1)
            parts = []
            if (~ok).any():
                parts.append(("wall", faces[~ok], None))
            if ok.any():
                q = np.round(rgb[ok] * 255).astype(np.int32)
                keys = q[:, 0] * 65536 + q[:, 1] * 256 + q[:, 2]
                for k in np.unique(keys):
                    sel = keys == k
                    mkey = material_key(el, rgb[ok][sel][0])
                    materials[mkey]["elements"] += 1
                    parts.append(("wall", faces[ok][sel], mkey))
        # inventory of the surface styles seen, by category
        if rgb is not None and len(rgb) == len(faces):
            ok = ~np.isnan(rgb).any(axis=1)
            if ok.any():
                q = np.round(rgb[ok] * 255).astype(np.int32)
                for k, n in zip(*np.unique(q[:, 0] * 65536 + q[:, 1] * 256 + q[:, 2], return_counts=True)):
                    skey = f"{cat}:#{int(k):06x}"
                    styles_seen[skey]["faces"] += int(n)
                    styles_seen[skey]["elements"].add(el.GlobalId)
        for pcat, pfaces, mkey in parts:
            mesh = trimesh.Trimesh(vertices=verts, faces=pfaces, process=False)
            mesh.remove_unreferenced_vertices()
            if module_polys:
                pieces = partition_mesh(mesh, module_polys, cells=module_cells_)
                if len(pieces) > 1:
                    module_stats["sliced"] += 1
                for mod, piece in pieces.items():
                    groups[(si, pcat, mkey, mod)].append(piece)
                    module_stats[f"m{mod}" if mod is not None else "none"] += 1
                    module_detail[mod][t] += 1
                    if len(pieces) > 1:
                        module_detail[mod]["sliced"] += 1
            else:
                groups[(si, pcat, mkey, None)].append(mesh)
            if mkey:
                materials[mkey]["faces"] += int(len(pfaces))
        kept[t] += 1
        tri_total += len(faces)

    if not groups:
        sys.exit("nothing kept — check the IfcTypes in the file")

    # ---- normalise: centre footprint, floor at 0, Z-up → Y-up
    # the ENVELOPE (everything but misc proxies) defines the footprint and
    # the ground: the Method sample carried its building at +2,036 m (a
    # surveyed site elevation) with an "INTERNAL ORIGIN" storey at 0, so
    # taking the lowest storey of the whole project put the home two
    # kilometres in the air. Only storeys that actually hold envelope
    # geometry count, and the footprint ignores entourage.
    envelope = [m for (si, cat, _, _m), ms in groups.items() if cat in ENVELOPE for m in ms] or [m for ms in groups.values() for m in ms]
    env_v = np.vstack([m.vertices for m in envelope])
    env_lo, env_hi = env_v.min(axis=0), env_v.max(axis=0)
    # anything kept that sits outside the envelope's neighbourhood is
    # context (a column at the Revit internal origin two kilometres
    # below the house, a fence at the lot line): drop it, say so
    outliers = Counter()
    for key in list(groups):
        kept_ms = []
        for m in groups[key]:
            mlo, mhi = m.vertices.min(axis=0), m.vertices.max(axis=0)
            if (mhi < env_lo - OUTLIER_M).any() or (mlo > env_hi + OUTLIER_M).any():
                outliers[key[1]] += 1
                continue
            kept_ms.append(m)
        if kept_ms:
            groups[key] = kept_ms
        else:
            del groups[key]
    for cat_name, n in outliers.items():
        dropped[f"{cat_name} (outlier, >{OUTLIER_M:g} m from the envelope)"] += n
    # the ground: the lowest storey that holds WALLS (foundation walls
    # count; footings below it stay underground, below y = 0)
    wall_storeys = {si for (si, cat, _, _m) in groups if cat == "wall"}
    ground = [s["elevation"] for i, s in enumerate(storeys) if i in wall_storeys]
    base_z = min(ground) if ground else float(env_lo[2])
    # wall/floor meshes entirely below the ground are the retaining-wall
    # segments stepping down the slope, not the home
    for key in list(groups):
        if key[1] in ("wall", "floor"):
            keep_ms = [m for m in groups[key] if float(m.vertices[:, 2].max()) >= base_z - BELOW_GROUND_M]
            n_below = len(groups[key]) - len(keep_ms)
            if n_below:
                dropped[f"{key[1]} (below ground)"] += n_below
            if keep_ms:
                groups[key] = keep_ms
            else:
                del groups[key]
    all_v = np.vstack([m.vertices for ms in groups.values() for m in ms])
    lo, hi = all_v.min(axis=0), all_v.max(axis=0)
    cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
    # Z-up (x, y, z) → Y-up (x, z, -y)
    to_yup = np.array([[1, 0, 0, -cx], [0, 0, 1, -base_z], [0, -1, 0, cy], [0, 0, 0, 1]], dtype=np.float64)

    scene = trimesh.Scene()
    scene.metadata["extras"] = {}
    nodes = []
    # one empty parent node per module (identity transform); the viewer
    # slides these apart. Centres are in the normalised Y-up frame.
    module_nodes: dict[int, str] = {}
    modules_out = []
    for m_ in modules:
        mx, my = m_["poly"].centroid.x, m_["poly"].centroid.y
        b = m_["poly"].bounds
        centre = [round(float(mx - cx), 3), round(float(-(my - cy)), 3)]
        info = {"index": m_["index"], "name": m_["name"], "prefab": m_["prefab"], "centre": centre, "size_m": [round(float(b[2] - b[0]), 2), round(float(b[3] - b[1]), 2)], "rooms": m_.get("rooms", []), "elements": dict(module_detail.get(m_["index"], {}))}
        modules_out.append(info)
        node_name = f"module{m_['index']}"
        module_nodes[m_["index"]] = node_name
        try:
            scene.graph.update(frame_to=node_name, frame_from=scene.graph.base_frame, matrix=np.eye(4), extras=info)
        except TypeError:
            scene.graph.update(frame_to=node_name, frame_from=scene.graph.base_frame, matrix=np.eye(4))
    for (si, cat, mkey, mod), meshes in sorted(groups.items(), key=lambda kv: (kv[0][0], kv[0][1], kv[0][2] or "", -1 if kv[0][3] is None else kv[0][3])):
        merged = trimesh.util.concatenate(meshes) if len(meshes) > 1 else meshes[0]
        merged.apply_transform(to_yup)
        merged.merge_vertices()
        r, g, b, a = PALETTE[cat]
        if mkey:
            r, g, b = materials[mkey]["rgb"]
        merged.visual = trimesh.visual.TextureVisuals(
            material=trimesh.visual.material.PBRMaterial(
                name=f"{cat}__{mkey}" if mkey else f"{cat}",
                baseColorFactor=[int(r * 255), int(g * 255), int(b * 255), int(a * 255)],
                metallicFactor=0.0,
                roughnessFactor=0.9 if cat != "glass" else 0.2,
                alphaMode="BLEND" if a < 1 else "OPAQUE",
                doubleSided=True,
            )
        )
        name = f"storey{si}_{cat}" + (f"__{mkey}" if mkey else "") + (f"~m{mod}" if mod is not None else "")
        storey = storeys[si] if si < len(storeys) else {"name": "Storey", "elevation": 0.0}
        if mod is not None and mod in module_nodes:
            scene.add_geometry(merged, node_name=name, geom_name=name, parent_node_name=module_nodes[mod])
        else:
            scene.add_geometry(merged, node_name=name, geom_name=name)
        node = {"node": name, "storey": si, "category": cat, "triangles": int(len(merged.faces))}
        if mkey:
            node["material"] = {"key": mkey, "name": materials[mkey]["name"], "color": materials[mkey]["color"]}
        if mod is not None:
            node["module"] = mod
        nodes.append(node)

    footprint = {"width_m": round(float(hi[0] - lo[0]), 2), "depth_m": round(float(hi[1] - lo[1]), 2), "height_m": round(float(hi[2] - base_z), 2)}
    extras = {
        "generator": "method-homes ifc-to-glb",
        "schema": schema,
        "northDeg": north,
        # habitable = has walls/doors/windows on it (Revit exports its roof
        # level as a storey; the viewer offers only habitable ones)
        "storeys": [
            # habitable = a level you walk: walls AND an opening (door or
            # window). Walls alone are a foundation or a parapet (the Method
            # sample's FOUNDATION and GARAGE ROOF levels, 2026-10-09)
            {"index": i, "name": s["name"], "elevation_m": round(s["elevation"] - base_z, 3), "habitable": any(k[0] == i and k[1] == "wall" for k in groups) and any(k[0] == i and k[1] in ("door", "glass", "frame") for k in groups)}
            for i, s in enumerate(storeys)
        ],
        "footprint": footprint,
        "nodes": nodes,
        "keepMaterials": bool(args.keep_materials),
        "materials": {k: {"name": v["name"], "color": v["color"]} for k, v in materials.items()},
        "modules": modules_out,
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
        "siteDropped": site,
        "nodes": nodes,
        "keepMaterials": bool(args.keep_materials),
        "modules": modules_out,
        "moduleStats": dict(module_stats),
        "outsideModules": dict(module_detail.get(None, {})),
        # the wall materials carried into the GLB (empty unless --keep-materials)
        "materials": {k: {"name": v["name"], "color": v["color"], "faces": v["faces"], "elements": v["elements"]} for k, v in sorted(materials.items(), key=lambda kv: -kv[1]["faces"])},
        # every surface style seen on kept elements, by category — the
        # diagnostic for "what does this model actually carry?"
        "surfaceStyles": {k: {"faces": v["faces"], "elements": len(v["elements"])} for k, v in sorted(styles_seen.items(), key=lambda kv: -kv[1]["faces"])[:60]},
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
    if materials:
        print(f"  wall materials kept ({len(materials)}): " + ", ".join(f"{v['name']} {v['color']} ({v['faces']} faces)" for v in list(report['materials'].values())[:8]))
    return 0


if __name__ == "__main__":
    sys.exit(main())

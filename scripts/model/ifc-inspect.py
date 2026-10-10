#!/usr/bin/env python
"""
ifc-inspect.py — what structure does an IFC carry beyond storeys and
categories? Written for the exploded-modules view (Bryce, 2026-10-09:
"this model is built from components… split into its separate prefab
modules"): a prefab home's modules may arrive as IfcElementAssembly /
IfcGroup / IfcZone members, as a "Module" (or workset / phase) property
on every element, as one floor slab per module, or not at all (then the
pipeline has to infer them from geometry). Prints a structural digest to
the job log — names and counts only, no coordinates or addresses.

  python scripts/model/ifc-inspect.py model.ifc
"""
from __future__ import annotations

import collections
import re
import sys

import ifcopenshell
import ifcopenshell.util.element as el

MODULE_RE = re.compile(r"\b(mod(ule)?s?|unit|box|volume|pod|assembly|ship(ping)?|crate|section)\b", re.I)


def main(path: str):
    f = ifcopenshell.open(path)
    print(f"schema {f.schema} · {len(f.by_type('IfcProduct'))} products")

    print("\n== storeys")
    for st in f.by_type("IfcBuildingStorey"):
        n = len(el.get_decomposition(st))
        print(f"  {st.Name!r} elev {st.Elevation} · {n} elements")

    print("\n== products by type")
    counts = collections.Counter(p.is_a() for p in f.by_type("IfcProduct"))
    for t, n in counts.most_common(40):
        print(f"  {n:5d} {t}")

    print("\n== groups / zones / systems / assemblies")
    for t in ("IfcGroup", "IfcZone", "IfcSystem", "IfcElementAssembly", "IfcBuildingElementPart"):
        items = f.by_type(t)
        if not items:
            continue
        print(f"  {t}: {len(items)}")
        for g in items[:40]:
            members = []
            for rel in getattr(g, "IsGroupedBy", []) or []:
                members += list(rel.RelatedObjects)
            for rel in getattr(g, "IsDecomposedBy", []) or []:
                members += list(rel.RelatedObjects)
            print(f"    {g.Name!r} ({getattr(g, 'ObjectType', None)!r}) → {len(members)} members: {collections.Counter(m.is_a() for m in members).most_common(6)}")

    print("\n== aggregation parents (IfcRelAggregates whose parent is an element)")
    agg = collections.Counter()
    for rel in f.by_type("IfcRelAggregates"):
        parent = rel.RelatingObject
        if parent.is_a("IfcElement"):
            agg[(parent.is_a(), parent.Name)] += len(rel.RelatedObjects)
    for (t, name), n in agg.most_common(30):
        print(f"  {t} {name!r} → {n} parts")

    print("\n== spaces")
    for sp in f.by_type("IfcSpace")[:60]:
        print(f"  {sp.Name!r} / {sp.LongName!r}")

    print("\n== element names / types that look like modules")
    names = collections.Counter()
    for p in f.by_type("IfcElement"):
        for s in (p.Name, p.ObjectType, getattr(p, "Tag", None)):
            if s and MODULE_RE.search(str(s)):
                names[(p.is_a(), str(s)[:70])] += 1
    for (t, s), n in names.most_common(40):
        print(f"  {n:4d} {t} {s!r}")

    print("\n== property names / values that look like modules (per element type)")
    props = collections.Counter()
    values = collections.defaultdict(collections.Counter)
    sample_psets = collections.Counter()
    for p in f.by_type("IfcElement"):
        try:
            psets = el.get_psets(p)
        except Exception:
            continue
        for pset, kv in psets.items():
            sample_psets[pset] += 1
            for k, v in kv.items():
                if k == "id":
                    continue
                if MODULE_RE.search(str(k)) or (isinstance(v, str) and MODULE_RE.search(v)):
                    props[(p.is_a(), pset, k)] += 1
                    values[(pset, k)][str(v)[:60]] += 1
    for (t, pset, k), n in props.most_common(40):
        print(f"  {n:4d} {t} · {pset} · {k}")
    print("\n== distinct values of those properties")
    for (pset, k), c in list(values.items())[:30]:
        print(f"  {pset} · {k}: {c.most_common(12)}")
    print("\n== property sets seen (top 40)")
    for pset, n in sample_psets.most_common(40):
        print(f"  {n:5d} {pset}")

    print("\n== slabs per storey (floor plates often come one per module)")
    for st in f.by_type("IfcBuildingStorey"):
        slabs = [e for e in el.get_decomposition(st) if e.is_a("IfcSlab")]
        if not slabs:
            continue
        print(f"  {st.Name!r}: {len(slabs)} slabs")
        for s in slabs[:40]:
            print(f"    {s.Name!r} type {getattr(s, 'PredefinedType', None)!r} / {el.get_type(s).Name if el.get_type(s) else None!r}")

    print("\n== roofs")
    for r in f.by_type("IfcRoof"):
        parts = []
        for rel in getattr(r, "IsDecomposedBy", []) or []:
            parts += list(rel.RelatedObjects)
        print(f"  {r.Name!r} → {len(parts)} parts")

    # FIT-OUT (Bryce, 2026-10-10: a stainless refrigerator in the nook,
    # walnut cabinetry with black counters on the kitchen wall): what the
    # model carries for casework, appliances and fixtures, and which
    # module area each sits in — so the pipeline can keep the real ones
    # instead of inventing boxes. Names, sizes and the module only.
    print("\n== fit-out candidates (furnishing / flow terminals / appliance-named proxies / openings) by module")
    try:
        import ifcopenshell.geom as geom
        import numpy as np

        settings = geom.settings()
        settings.set("use-world-coords", True)
        mods = []
        for sp in f.by_type("IfcSpace"):
            nm = (sp.Name or sp.LongName or "")
            if re.match(r"^\s*MOD\s*[A-Z]\b", nm, re.I) or re.search(r"site built|living|garage|deck", nm, re.I):
                try:
                    shp = geom.create_shape(settings, sp)
                    v = np.array(shp.geometry.verts).reshape(-1, 3)
                    mods.append((nm.strip(), v[:, 0].min(), v[:, 0].max(), v[:, 1].min(), v[:, 1].max()))
                except Exception:
                    continue
        print(f"  {len(mods)} module/area spaces resolved")
        appl = re.compile(r"refrig|fridge|freezer|range|cook|oven|stove|dishwasher|microwave|hood|sink|faucet|^[A-Z]{1,4}\d{2,}[A-Z0-9-]*$", re.I)
        rows = []
        for p in f.by_type("IfcProduct"):
            t = p.is_a()
            name = f"{p.Name or ''}"
            fam = (p.ObjectType or "").split(":")[0]
            kind = None
            if t.startswith("IfcFurnishing"):
                kind = "furnishing"
            elif t.startswith("IfcFlowTerminal"):
                kind = "terminal"
            elif t == "IfcOpeningElement":
                kind = "opening"
            elif t == "IfcBuildingElementProxy" and (appl.search(name) or appl.search(fam) or appl.search(name.split(":")[0])):
                kind = "proxy-appliance"
            if not kind or not getattr(p, "Representation", None):
                continue
            try:
                shp = geom.create_shape(settings, p)
                v = np.array(shp.geometry.verts).reshape(-1, 3)
                cx, cy = float(v[:, 0].mean()), float(v[:, 1].mean())
                ext = (v.max(axis=0) - v.min(axis=0)).round(2).tolist()
            except Exception:
                continue
            where = next((nm for nm, x0, x1, y0, y1 in mods if x0 <= cx <= x1 and y0 <= cy <= y1), "-")
            rows.append((where, kind, t, name[:60], fam[:40], ext))
        rows.sort(key=lambda r: (r[0], r[1], r[3]))
        for where, kind, t, name, fam, ext in rows[:500]:
            print(f"  [{where:>18}] {kind:16} {t:24} {name!r} / {fam!r} {ext}")
        print(f"  {len(rows)} candidates")
    except Exception as e:  # noqa: BLE001
        print(f"  (fit-out scan failed: {e})")


if __name__ == "__main__":
    main(sys.argv[1])

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


if __name__ == "__main__":
    main(sys.argv[1])

#!/usr/bin/env python3
"""
MERGE A POLY HAVEN ALPHA MAP INTO ITS DIFFUSE.

Poly Haven's glTF downloads reference a plain RGB JPEG diffuse even for
alpha-masked materials (leaves): the cut-out ships as a SEPARATE map in
files.json ("Alpha" for single-material plants, "<part>_alpha" such as
"leaves_alpha" for multi-part ones) that the glTF never points at. This
fetches that map, writes an RGBA PNG (diffuse RGB + alpha) next to the
original, and repoints the material's baseColor image at it, so
gltf-transform's WebP compression carries the alpha through.

Usage: merge-alpha.py <dir with model.gltf + files.json> <res, e.g. 1k>
Needs Pillow.
"""
import json
import os
import sys
import urllib.request

from PIL import Image

d, res = sys.argv[1], sys.argv[2]
files = json.load(open(os.path.join(d, "files.json")))
gltf_path = os.path.join(d, "model.gltf")
g = json.load(open(gltf_path))
maps = {k.lower(): v for k, v in files.items() if isinstance(v, dict)}


def alpha_url(diff_name: str):
    """diff file name → the matching alpha map's URL, or None"""
    stem = os.path.splitext(os.path.basename(diff_name))[0]  # shrub_02_diff_1k
    stem = stem[: -len(f"_{res}")] if stem.endswith(f"_{res}") else stem
    candidates = []
    if "_diff" in stem:
        # part prefix: <asset>_<part>_diff → <part>_alpha ; <asset>_diff → alpha
        head = stem[: stem.rindex("_diff")]
        parts = head.split("_")
        for i in range(len(parts) + 1):
            part = "_".join(parts[i:])
            candidates.append(f"{part}_alpha" if part else "alpha")
    candidates += ["alpha", "mask"]
    for key in candidates:
        m = maps.get(key.lower())
        if not m:
            continue
        r = m.get(res) or m.get("1k") or next(iter(m.values()))
        for fmt in ("png", "jpg"):
            if fmt in r:
                return key, r[fmt]["url"]
    return None, None


changed = 0
for mat in g.get("materials", []):
    if mat.get("alphaMode", "OPAQUE") == "OPAQUE":
        continue
    tex = (mat.get("pbrMetallicRoughness") or {}).get("baseColorTexture")
    if tex is None:
        continue
    img = g["images"][g["textures"][tex["index"]]["source"]]
    uri = img.get("uri")
    if not uri:
        continue
    key, url = alpha_url(uri)
    if not url:
        print(f"  {mat.get('name')}: no alpha map found for {uri}")
        continue
    ap = os.path.join(d, "textures", f"_alpha_{key}.{url.rsplit('.', 1)[-1]}")
    urllib.request.urlretrieve(url, ap)
    rgb = Image.open(os.path.join(d, uri)).convert("RGB")
    a = Image.open(ap).convert("L").resize(rgb.size)
    rgb.putalpha(a)
    out_rel = os.path.splitext(uri)[0] + "_rgba.png"
    rgb.save(os.path.join(d, out_rel))
    img["uri"] = out_rel
    img["mimeType"] = "image/png"
    # a hard cut-out reads right for leaves; BLEND sorts badly in real time
    mat["alphaMode"] = "MASK"
    mat.setdefault("alphaCutoff", 0.5)
    lo, hi = a.getextrema()
    print(f"  {mat.get('name')}: merged '{key}' alpha into {out_rel} (alpha {lo}..{hi})")
    changed += 1

json.dump(g, open(gltf_path, "w"))
print(f"alpha merged into {changed} material(s)")

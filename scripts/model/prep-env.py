#!/usr/bin/env python3
"""
Prepare a web-sized environment map for the raster plan viewer from the
same HDRI the Cycles turntable renders with, so both viewers share one sky.

  python3 scripts/model/prep-env.py <sky.hdr> <out-dir> [--width 512] [--rotation 120]

Writes <out-dir>/sky.hdr (Radiance RGBE, RLE, <width> × <width>/2 — a
few hundred KB; reflections at the viewer's roughness levels need no
more) and <out-dir>/env.json with the sun direction found in the map
(brightest region after a blur) and the rotation the renders use, so the
viewer's shadow light lines up with the reflections.

numpy only — the Radiance format is simple enough to read and write here
(flat and new-style RLE scanlines), which keeps the Actions job light.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np


# ---------------------------------------------------------------- RGBE i/o
def read_hdr(path: Path) -> np.ndarray:
    data = path.read_bytes()
    pos = data.index(b"\n\n") + 2
    header = data[:pos].decode("ascii", "replace")
    if not header.startswith("#?"):
        sys.exit("not a Radiance HDR")
    end = data.index(b"\n", pos)
    res = data[pos:end].decode().split()
    if res[0] != "-Y" or res[2] != "+X":
        sys.exit(f"unsupported orientation {res}")
    h, w = int(res[1]), int(res[3])
    pos = end + 1
    buf = np.frombuffer(data, dtype=np.uint8)
    out = np.empty((h, w, 4), dtype=np.uint8)
    for y in range(h):
        if w < 8 or w > 0x7FFF or buf[pos] != 2 or buf[pos + 1] != 2 or (buf[pos + 2] & 0x80):
            out[y] = buf[pos : pos + w * 4].reshape(w, 4)  # flat scanline
            pos += w * 4
            continue
        pos += 4
        for c in range(4):
            x = 0
            row = out[y, :, c]
            while x < w:
                count = int(buf[pos])
                pos += 1
                if count > 128:
                    count -= 128
                    row[x : x + count] = buf[pos]
                    pos += 1
                else:
                    row[x : x + count] = buf[pos : pos + count]
                    pos += count
                x += count
    rgbe = out.astype(np.float32)
    scale = np.where(out[..., 3] > 0, np.ldexp(1.0, out[..., 3].astype(np.int32) - 136), 0.0).astype(np.float32)
    return rgbe[..., :3] * scale[..., None]


def write_hdr(path: Path, img: np.ndarray) -> None:
    h, w, _ = img.shape
    m = img.max(axis=2)
    e = np.zeros_like(m, dtype=np.int32)
    nz = m > 1e-32
    mant, exp = np.frexp(m[nz])
    e[nz] = exp
    scale = np.zeros_like(m, dtype=np.float32)
    scale[nz] = (mant * 256.0 / m[nz]).astype(np.float32)
    rgbe = np.zeros((h, w, 4), dtype=np.uint8)
    rgbe[..., :3] = np.clip(img * scale[..., None], 0, 255).astype(np.uint8)
    rgbe[..., 3] = np.where(nz, e + 128, 0).astype(np.uint8)
    out = bytearray(b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n" + f"-Y {h} +X {w}\n".encode())
    for y in range(h):
        out += bytes([2, 2, (w >> 8) & 0xFF, w & 0xFF])
        for c in range(4):
            row = rgbe[y, :, c]
            x = 0
            while x < w:
                # run of identical bytes?
                run = 1
                while x + run < w and run < 127 and row[x + run] == row[x]:
                    run += 1
                if run >= 4:
                    out += bytes([128 + run, int(row[x])])
                    x += run
                    continue
                # literal span up to the next run of ≥4 (or 128 bytes)
                start = x
                while x < w and x - start < 128:
                    r = 1
                    while x + r < w and r < 4 and row[x + r] == row[x]:
                        r += 1
                    if r >= 4:
                        break
                    x += 1
                if x == start:  # (a run begins right here but was <4 above) — emit one literal
                    x += 1
                out += bytes([x - start]) + row[start:x].tobytes()
    path.write_bytes(bytes(out))


# ---------------------------------------------------------------- process
def downsample(img: np.ndarray, width: int) -> np.ndarray:
    h, w, _ = img.shape
    height = width // 2
    fy, fx = h // height, w // width
    if fy < 1 or fx < 1:
        return img
    img = img[: height * fy, : width * fx]
    return img.reshape(height, fy, width, fx, 3).mean(axis=(1, 3)).astype(np.float32)


def sun_direction(img: np.ndarray) -> tuple[float, float, float]:
    """(azimuth°, elevation°, strength) of the brightest region, in the
    equirectangular frame: u=0 at the image's left edge, v=0 at the top"""
    lum = img @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    # 5 × 5 box blur so a single hot pixel doesn't win over the disc
    k = 5
    pad = np.pad(lum, k // 2, mode="wrap")
    blur = sum(pad[i : i + lum.shape[0], j : j + lum.shape[1]] for i in range(k) for j in range(k)) / (k * k)
    y, x = np.unravel_index(int(blur.argmax()), blur.shape)
    h, w = lum.shape
    azimuth = (x + 0.5) / w * 360.0  # degrees around, from the image's left edge
    elevation = 90.0 - (y + 0.5) / h * 180.0
    return round(azimuth, 2), round(elevation, 2), round(float(blur.max()), 2)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("hdr")
    ap.add_argument("out")
    ap.add_argument("--width", type=int, default=512)
    ap.add_argument("--rotation", type=float, default=0.0, help="degrees the renders turn the HDRI about Z (render-turntable --hdri-rotation)")
    ap.add_argument("--name", default="sky")
    args = ap.parse_args()

    img = read_hdr(Path(args.hdr))
    small = downsample(img, args.width)
    # Bake the render's HDRI rotation into the image so the viewer samples
    # it with no rotation of its own. Blender's Mapping node turns the
    # lookup vector by +θ about Z, which shows the sky turned by −θ; in
    # equirectangular u that is u' = u − θ/360, i.e. roll the columns right
    # by θ/360 of the width. (Blender's Z-up equirect lookup and three's
    # Y-up one agree once the GLB's axis swap is applied, so no mirror.)
    if args.rotation:
        shift = int(round(args.rotation / 360.0 * small.shape[1]))
        small = np.roll(small, shift, axis=1)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    write_hdr(out / f"{args.name}.hdr", small)
    az, el, strength = sun_direction(small)
    meta = {
        "file": f"{args.name}.hdr",
        "width": int(small.shape[1]),
        "height": int(small.shape[0]),
        "source": Path(args.hdr).name,
        "rotationDeg": args.rotation,  # already baked into the image; the viewer applies none
        # azimuth from the image's left edge; three's equirect lookup puts
        # the left edge at −X, so the direction is θ = azimuth − 180° in
        # atan2(z, x): (cos θ·cos el, sin el, sin θ·cos el)
        "sun": {"azimuthDeg": az, "elevationDeg": el, "strength": strength},
        "meanLuminance": round(float((small @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)).mean()), 4),
    }
    (out / "env.json").write_text(json.dumps(meta, indent=2) + "\n")
    size = (out / f"{args.name}.hdr").stat().st_size
    print(f"✓ {out / (args.name + '.hdr')} {small.shape[1]}×{small.shape[0]} {size/1024:.0f} KB · sun az {az}° el {el}° · rotation {args.rotation}°")


if __name__ == "__main__":
    main()

"""Web copies of the map images: WebP, stretched to the map's own shape.

Earth Engine exports the study area in plain latitude/longitude, where a pixel is as
tall as it is wide in degrees. The web map uses Web Mercator, which at 13°N draws the
same box about 2.6% taller, so the browser was stretching the images on the fly.
This resizes them once to the shape they are shown at (no new detail; the AI labels
use nearest-neighbour so every square keeps its own label) and saves WebP, which
is much smaller than the JPEG/PNG exports. No Earth Engine calls.

The satellite photos also get a light copy (600 px wide) that the map shows first,
so a phone on a slow connection sees the area in a second or two; the full image
replaces it as soon as it arrives. The year-by-year player uses the light copies.

Usage:  .venv/Scripts/python analysis/web_images.py
Output: docs/app/data/photo_KEY.webp, photo_KEY_light.webp and labels_KEY.webp for every
        season 2018–2026 and for the monsoon image (KEY = 2018 … 2026, monsoon)
"""
import math
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "app" / "data"
BOX = [80.17, 12.86, 80.26, 12.99]  # west, south, east, north (as in app_assets.py)
LIGHT_WIDTH = 600
KEYS = [str(y) for y in range(2018, 2027)] + ["monsoon"]


def mercator_y(lat):
    return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


# width / height of the box as the map draws it
ASPECT = math.radians(BOX[2] - BOX[0]) / (mercator_y(BOX[3]) - mercator_y(BOX[1]))


def save(img, size, resample, out, **opts):
    img.resize(size, resample).save(out, "WEBP", method=6, **opts)
    print(f"  -> {out.name} {size}, {out.stat().st_size // 1024} KB")


for key in KEYS:
    for name, resample, opts in ((f"photo_{key}.jpg", Image.LANCZOS, {"quality": 82}),
                                 (f"labels_{key}.png", Image.NEAREST, {"lossless": True})):
        src = Image.open(DATA / name).convert("RGB")
        print(f"{name} {src.size}, {(DATA / name).stat().st_size // 1024} KB")
        save(src, (src.width, round(src.width / ASPECT)), resample, DATA / (pathlib.Path(name).stem + ".webp"), **opts)
        if name.startswith("photo"):
            save(src, (LIGHT_WIDTH, round(LIGHT_WIDTH / ASPECT)), Image.LANCZOS,
                 DATA / f"photo_{key}_light.webp", quality=72)

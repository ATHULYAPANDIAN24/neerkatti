"""Web copies of the four map images: WebP, stretched to the map's own shape.

Earth Engine exports the study area in plain latitude/longitude, where a pixel is as
tall as it is wide in degrees. The web map uses Web Mercator, which at 13°N draws the
same box about 2.6% taller, so the browser was stretching the images on the fly.
This resizes them once to the shape they are shown at (no new detail; the AI labels
use nearest-neighbour so every square keeps its own label) and saves WebP, which
is much smaller than the JPEG/PNG exports. No Earth Engine calls.

Usage:  .venv/Scripts/python analysis/web_images.py
Output: docs/app/data/photo_YYYY.webp and labels_YYYY.webp
"""
import math
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "app" / "data"
BOX = [80.17, 12.86, 80.26, 12.99]  # west, south, east, north (as in app_assets.py)


def mercator_y(lat):
    return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


# width / height of the box as the map draws it
ASPECT = math.radians(BOX[2] - BOX[0]) / (mercator_y(BOX[3]) - mercator_y(BOX[1]))

for year in (2018, 2026):
    for name, resample, opts in ((f"photo_{year}.jpg", Image.LANCZOS, {"quality": 82, "method": 6}),
                                 (f"labels_{year}.png", Image.NEAREST, {"lossless": True, "method": 6})):
        src = Image.open(DATA / name).convert("RGB")
        size = (src.width, round(src.width / ASPECT))
        out = DATA / (pathlib.Path(name).stem + ".webp")
        src.resize(size, resample).save(out, "WEBP", **opts)
        print(f"{name} {src.size} -> {out.name} {size}, {(DATA / name).stat().st_size // 1024} KB -> {out.stat().st_size // 1024} KB")

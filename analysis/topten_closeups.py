"""Before/after close-ups of the top 10 flagged patches, for checking them by eye.

Reads the ranked patches from docs/app/data/patches.geojson (made by app_assets.py)
and saves one 2018 | 2026 pair per patch, with the patch outlined in red on 2026.
patch_details.py imports close_up() to make the same pair for the other patches.

Usage:  .venv/Scripts/python analysis/topten_closeups.py
Output: outputs/topten/patch_NN.jpg and outputs/topten_grid.jpg
"""
import io
import json
import os
import pathlib
import urllib.request

import ee
from PIL import Image, ImageDraw, ImageEnhance, ImageFont

PROJECT = os.environ.get("EE_PROJECT", "dexathon-athulya")  # set EE_PROJECT to your own Earth Engine Cloud project
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "outputs" / "topten"
SEASON = ("-02-01", "-06-01")
VIS = {"bands": ["B4", "B3", "B2"], "min": 0, "max": 3000}
PX = 420


def photo(year, region):
    return (ee.ImageCollection("COPERNICUS/S2_HARMONIZED").filterBounds(region)
            .filterDate(f"{year}{SEASON[0]}", f"{year}{SEASON[1]}")
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 10)).median())


def fetch(img, region):
    url = img.getThumbURL({"region": region, "dimensions": PX, "format": "png"})
    pic = Image.open(io.BytesIO(urllib.request.urlopen(url, timeout=120).read())).convert("RGB")
    # display stretch only, the same for both years (as in demo_assets.py)
    return ImageEnhance.Color(ImageEnhance.Contrast(pic).enhance(1.15)).enhance(1.15)


def close_up(f):
    """2018 | 2026 pair, 600 m around the patch, with a title strip on top."""
    p = f["properties"]
    region = ee.Geometry.Point([p["lon"], p["lat"]]).buffer(300).bounds()
    outline = ee.Image().paint(ee.FeatureCollection([ee.Feature(ee.Geometry(f["geometry"]))]), 1, 2)
    before = fetch(photo(2018, region).visualize(**VIS), region)
    after = fetch(photo(2026, region).visualize(**VIS).blend(outline.visualize(palette=["ff1a1a"])), region)
    pair = Image.new("RGB", (before.width * 2 + 6, before.height + 34), "white")
    pair.paste(before, (0, 34))
    pair.paste(after, (before.width + 6, 34))
    font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 20)
    ImageDraw.Draw(pair).text((6, 6), f"#{p['rank']}  {p['place'] or p.get('admin_area') or ''}  {p['area_ha']:.2f} ha   2018 | 2026",
                              fill="black", font=font)
    return pair


if __name__ == "__main__":
    ee.Initialize(project=PROJECT)
    OUT.mkdir(parents=True, exist_ok=True)
    patches = json.loads((ROOT / "docs" / "app" / "data" / "patches.geojson").read_text())["features"][:10]
    tiles = []
    for f in patches:
        pair = close_up(f)
        pair.save(OUT / f"patch_{f['properties']['rank']:02d}.jpg", quality=90)
        tiles.append(pair)
        print("saved patch", f["properties"]["rank"])

    w, h = tiles[0].size
    grid = Image.new("RGB", (w * 2 + 10, (h + 10) * 5), "white")
    for i, t in enumerate(tiles):
        grid.paste(t, ((i % 2) * (w + 10), (i // 2) * (h + 10)))
    grid.save(ROOT / "outputs" / "topten_grid.jpg", quality=88)
    print("DONE")

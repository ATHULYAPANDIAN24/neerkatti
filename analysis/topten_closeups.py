"""Before/after close-ups of the top 10 flagged patches, for checking them by eye.

Reads the ranked patches from docs/app/data/patches.geojson (made by app_assets.py)
and saves one 2018 | 2026 pair per patch, with the patch outlined in red on 2026.

Usage:  .venv/Scripts/python analysis/topten_closeups.py
Output: outputs/topten/patch_NN.jpg and outputs/topten_grid.jpg
"""
import io
import json
import pathlib
import urllib.request

import ee
from PIL import Image, ImageDraw, ImageEnhance, ImageFont

PROJECT = "dexathon-athulya"
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "outputs" / "topten"
OUT.mkdir(parents=True, exist_ok=True)
SEASON = ("-02-01", "-06-01")
VIS = {"bands": ["B4", "B3", "B2"], "min": 0, "max": 3000}
PX = 420

ee.Initialize(project=PROJECT)
patches = json.loads((ROOT / "docs" / "app" / "data" / "patches.geojson").read_text())["features"][:10]


def photo(year, region):
    return (ee.ImageCollection("COPERNICUS/S2_HARMONIZED").filterBounds(region)
            .filterDate(f"{year}{SEASON[0]}", f"{year}{SEASON[1]}")
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 10)).median())


def fetch(img, region):
    url = img.getThumbURL({"region": region, "dimensions": PX, "format": "png"})
    pic = Image.open(io.BytesIO(urllib.request.urlopen(url, timeout=120).read())).convert("RGB")
    # display stretch only, the same for both years (as in demo_assets.py)
    return ImageEnhance.Color(ImageEnhance.Contrast(pic).enhance(1.15)).enhance(1.15)


font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 20)
tiles = []
for f in patches:
    p = f["properties"]
    region = ee.Geometry.Point([p["lon"], p["lat"]]).buffer(300).bounds()
    outline = ee.Image().paint(ee.FeatureCollection([ee.Feature(ee.Geometry(f["geometry"]))]), 1, 2)
    before = fetch(photo(2018, region).visualize(**VIS), region)
    after = fetch(photo(2026, region).visualize(**VIS).blend(outline.visualize(palette=["ff1a1a"])), region)
    pair = Image.new("RGB", (before.width * 2 + 6, before.height + 34), "white")
    pair.paste(before, (0, 34))
    pair.paste(after, (before.width + 6, 34))
    d = ImageDraw.Draw(pair)
    d.text((6, 6), f"#{p['rank']}  {p['place'] or ''}  {p['area_ha']:.2f} ha   2018 | 2026", fill="black", font=font)
    pair.save(OUT / f"patch_{p['rank']:02d}.jpg", quality=90)
    tiles.append(pair)
    print("saved patch", p["rank"])

w, h = tiles[0].size
grid = Image.new("RGB", (w * 2 + 10, (h + 10) * 5), "white")
for i, t in enumerate(tiles):
    grid.paste(t, ((i % 2) * (w + 10), (i // 2) * (h + 10)))
grid.save(ROOT / "outputs" / "topten_grid.jpg", quality=88)
print("DONE")

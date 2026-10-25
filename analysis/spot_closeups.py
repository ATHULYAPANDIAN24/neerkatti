"""Before/after close-ups of the biggest changed spots (for checking by eye).

Reads outputs/top_spots.csv, writes outputs/closeups.png:
one row per spot -> 2018 photo | 2026 photo | 2026 photo + change outline.
"""
import csv
import io
import os
import pathlib
import urllib.request

import ee
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "outputs"
ee.Initialize(project=os.environ.get("EE_PROJECT", "dexathon-athulya"))  # set EE_PROJECT to your own Cloud project

SEASON = ("-02-01", "-06-01")
BOX_M = 700          # half-width of each close-up, metres
TILE = 300           # pixels per tile


def photo(year, region):
    return (ee.ImageCollection("COPERNICUS/S2_HARMONIZED")
            .filterBounds(region)
            .filterDate(f"{year}{SEASON[0]}", f"{year}{SEASON[1]}")
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 10))
            .median())


def land_cover(year, region):
    return (ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
            .filterBounds(region)
            .filterDate(f"{year}{SEASON[0]}", f"{year}{SEASON[1]}")
            .select("label").reduce(ee.Reducer.mode()).rename("label"))


def fetch(img, region):
    url = img.getThumbURL({"region": region, "dimensions": TILE, "format": "png"})
    return Image.open(io.BytesIO(urllib.request.urlopen(url).read())).convert("RGB")


vis = {"bands": ["B4", "B3", "B2"], "min": 0, "max": 3000}
rows = list(csv.DictReader(open(OUT / "top_spots.csv")))
sheet = Image.new("RGB", (TILE * 3 + 20, (TILE + 30) * len(rows)), "white")
draw = ImageDraw.Draw(sheet)

for i, r in enumerate(rows):
    pt = ee.Geometry.Point([float(r["lon"]), float(r["lat"])])
    region = pt.buffer(BOX_M).bounds()
    before, after = land_cover(2018, region), land_cover(2026, region)
    after_prev = land_cover(2025, region)
    # same v1 rule as change_map.py: core of 2018 water/marsh -> built in 2025 AND 2026
    wet_core = before.eq(0).Or(before.eq(3)).focalMin(radius=20, units="meters")
    changed = wet_core.And(after.eq(6)).And(after_prev.eq(6)).selfMask()
    outline = ee.Image().paint(changed.reduceToVectors(
        geometry=region, scale=10, maxPixels=1e9), 1, 2)
    tiles = [
        fetch(photo(2018, region).visualize(**vis), region),
        fetch(photo(2026, region).visualize(**vis), region),
        fetch(photo(2026, region).visualize(**vis)
              .blend(outline.visualize(palette=["ff0000"])), region),
    ]
    y = i * (TILE + 30)
    draw.text((4, y + 4), f"#{r['rank']} {r['type']}  {r['area_ha']} ha  "
              f"({r['lat']}, {r['lon']})   2018 | 2026 | 2026+change", fill="black")
    for j, t in enumerate(tiles):
        sheet.paste(t.resize((TILE, TILE)), (j * (TILE + 10), y + 24))
    print("spot", r["rank"], "done")

sheet.save(OUT / "closeups.png")
print("saved closeups.png")

"""Every dry season from 2018 to 2026, and when each flagged patch was built over.

app_assets.py saved the 2018 and 2026 images; this adds the seasons in between, made
the same way (Sentinel-2 median of the clear Feb–May images; Dynamic World's most
common label per square), so the map can play the watershed year by year.

For every flagged patch it adds, per season, the share of the patch the AI labels
water or marsh and the share it labels buildings, and `built_since`: the first season
after which at least half of the patch is labelled buildings in every season through
2026. A square that flickers back to marsh for one season counts as built only from
after the flicker, so the year is a cautious one.

It also splits the 28.1 ha by that same year, square by square, using the v1 rule
exactly as app_assets.py does, so the chart adds up to the headline.

No patch, area or headline number changes.

Usage:  .venv/Scripts/python analysis/year_by_year.py   (after patch_details.py)
Output: docs/app/data/photo_YYYY.jpg and labels_YYYY.png for 2019–2025,
        docs/app/data/patches.geojson and neerkatti_data.js (updated)
Then run web_images.py for the web copies.
"""
import io
import json
import os
import pathlib
import re
import time
import urllib.request

import ee
from PIL import Image, ImageEnhance

PROJECT = os.environ.get("EE_PROJECT", "dexathon-athulya")  # set EE_PROJECT to your own Earth Engine Cloud project
ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "app" / "data"

ee.Initialize(project=PROJECT)

# the same settings as app_assets.py
BOX = [80.17, 12.86, 80.26, 12.99]
AREA = ee.Geometry.Rectangle(BOX)
SEASON = ("-02-01", "-06-01")
PX = 1500
VIS = {"bands": ["B4", "B3", "B2"], "min": 0, "max": 3000}
PALETTE = ["419bdf", "397d49", "88b053", "7a87c6", "e49635", "dfc35a", "8f939c", "cdb88f", "b39fe1"]
YEARS = list(range(2018, 2027))
NEW_YEARS = YEARS[1:-1]   # 2018 and 2026 are app_assets.py's
KEYS = {"wet_by_year", "built_by_year", "built_since"}


def land_cover(year):
    return (ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
            .filterBounds(AREA)
            .filterDate(f"{year}{SEASON[0]}", f"{year}{SEASON[1]}")
            .select("label")
            .reduce(ee.Reducer.mode())
            .rename("label")
            .clip(AREA))


def s2(year):
    return (ee.ImageCollection("COPERNICUS/S2_HARMONIZED")
            .filterBounds(AREA)
            .filterDate(f"{year}{SEASON[0]}", f"{year}{SEASON[1]}")
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 10)))


def clean(mask):
    m = mask.selfMask()
    return m.updateMask(m.connectedPixelCount(100, True).gte(10))


def fetch(url, tries=3):
    for i in range(tries):
        try:
            return urllib.request.urlopen(url, timeout=120).read()
        except OSError:
            if i == tries - 1:
                raise
            time.sleep(5)


def save_photo(img, name):
    url = img.getThumbURL({"region": AREA, "dimensions": PX, "format": "png"})
    pic = Image.open(io.BytesIO(fetch(url))).convert("RGB")
    pic = ImageEnhance.Color(ImageEnhance.Contrast(pic).enhance(1.15)).enhance(1.15)
    pic.save(DATA / name, "JPEG", quality=86, optimize=True, progressive=True)
    print("saved", name, pic.size)


def save_labels(img, name):
    url = img.visualize(min=0, max=8, palette=PALETTE).getThumbURL({"region": AREA, "dimensions": PX, "format": "png"})
    pic = Image.open(io.BytesIO(fetch(url))).convert("RGB")
    pic.quantize(colors=16).save(DATA / name, "PNG", optimize=True)
    print("saved", name, pic.size)


cover = {y: land_cover(y) for y in YEARS}

# 1. The seasons in between, as images
s2_counts = ee.Dictionary({str(y): s2(y).size() for y in YEARS}).getInfo()
for y in NEW_YEARS:
    save_photo(s2(y).median().clip(AREA).visualize(**VIS), f"photo_{y}.jpg")
    save_labels(cover[y], f"labels_{y}.png")

# 2. Built every season from year Y through 2026: the first such Y, square by square
since = ee.Image.constant(2026).updateMask(cover[2026].eq(6))
stays = cover[2026].eq(6)
for y in reversed(YEARS[:-1]):
    stays = stays.And(cover[y].eq(6))
    since = since.where(stays, y)
since = since.rename("since").toInt()

# the v1 rule, exactly as in app_assets.py
wet_core = cover[2018].eq(0).Or(cover[2018].eq(3)).focalMin(radius=20, units="meters")
to_built = clean(wet_core.And(cover[2026].eq(6)).And(cover[2025].eq(6)))
groups = (ee.Image.pixelArea().addBands(since).updateMask(to_built)
          .reduceRegion(reducer=ee.Reducer.sum().group(groupField=1, groupName="year"),
                        geometry=AREA, scale=10, maxPixels=1e10).get("groups").getInfo())
since_ha = {str(g["year"]): round(g["sum"] / 1e4, 2) for g in groups}
print("first built, of the flagged squares (ha):", since_ha, "total", round(sum(since_ha.values()), 1))

# 3. Per patch: water-or-marsh and buildings share each season, and the area by first-built year
geo = json.loads((DATA / "patches.geojson").read_text())
features = geo["features"]
fc = ee.FeatureCollection([ee.Feature(ee.Geometry(f["geometry"]), {"rank": f["properties"]["rank"]})
                           for f in features])
shares = ee.Image.cat([cover[y].eq(0).Or(cover[y].eq(3)).rename(f"wet_{y}") for y in YEARS] +
                      [cover[y].eq(6).rename(f"built_{y}") for y in YEARS])
mean = {f["properties"]["rank"]: f["properties"] for f in
        shares.reduceRegions(collection=fc, reducer=ee.Reducer.mean(), scale=10).getInfo()["features"]}
by_year = {f["properties"]["rank"]: f["properties"] for f in
           ee.Image.pixelArea().addBands(since.unmask(0))
           .reduceRegions(collection=fc, reducer=ee.Reducer.sum().group(groupField=1, groupName="year"), scale=10)
           .getInfo()["features"]}

for f in features:
    p = f["properties"]
    for k in KEYS & set(p):
        del p[k]
    m = mean[p["rank"]]
    groups = sorted(by_year[p["rank"]]["groups"], key=lambda g: g["year"])
    total = sum(g["sum"] for g in groups)
    done, built_since = 0, None
    for g in groups:
        if g["year"] == 0:   # not built every season through 2026
            continue
        done += g["sum"]
        if done >= total / 2:
            built_since = g["year"]
            break
    p.update({
        "wet_by_year": [round(m[f"wet_{y}"], 2) for y in YEARS],
        "built_by_year": [round(m[f"built_{y}"], 2) for y in YEARS],
        "built_since": built_since,
    })
    print(f"#{p['rank']:2d} since {built_since}  built " + " ".join(f"{v:.2f}" for v in p["built_by_year"]))

# 4. Write the data back
(DATA / "patches.geojson").write_text(json.dumps(geo, separators=(",", ":")))
js_path = DATA / "neerkatti_data.js"
meta = json.loads(re.search(r"\{meta: (\{.*?\}),\npatches: ", js_path.read_text(encoding="utf-8"), re.S).group(1))
meta.update({
    "timeline_years": YEARS,
    "s2_images": {y: s2_counts[y] for y in sorted(s2_counts)},
    "built_since_ha": {y: since_ha[y] for y in sorted(since_ha)},
})
js_path.write_text(
    "// Made by analysis/app_assets.py, with patch details from analysis/patch_details.py,\n"
    "// year_by_year.py and context_layers.py. Do not edit by hand.\n"
    f"window.NEERKATTI = {{meta: {json.dumps(meta, ensure_ascii=False)},\n"
    f"patches: {json.dumps(geo, separators=(',', ':'), ensure_ascii=False)}}};\n", encoding="utf-8")
print("DONE")

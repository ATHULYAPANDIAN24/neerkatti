"""NEERKATTI v1: Pallikaranai wetland change, 2018 vs 2026.

Same logic as earthengine/neerkatti_v0.js, but run from Python so it can
save slide images and a list of the biggest changed spots.

Usage:  .venv/Scripts/python analysis/change_map.py
Output: outputs/ (PNG images + top_spots.csv + stats.json)
"""
import csv
import json
import os
import pathlib
import urllib.request

import ee

PROJECT = os.environ.get("EE_PROJECT", "dexathon-athulya")  # set EE_PROJECT to your own Earth Engine Cloud project
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "outputs"
OUT.mkdir(exist_ok=True)

ee.Initialize(project=PROJECT)

# 1. Where: Pallikaranai marsh, lakes around it, and the Sathyabama campus
AREA = ee.Geometry.Rectangle([80.17, 12.86, 80.26, 12.99])
CAMPUS = ee.Geometry.Point([80.2226, 12.8731])

BEFORE_YEAR, AFTER_YEAR = 2018, 2026
SEASON = ("-02-01", "-06-01")  # Feb–May: dry season, few clouds

# Dynamic World labels: 0 water, 1 trees, 2 grass, 3 flooded vegetation (marsh),
# 4 crops, 5 shrub & scrub, 6 built, 7 bare, 8 snow & ice
PALETTE = ["419bdf", "397d49", "88b053", "7a87c6", "e49635",
           "dfc35a", "c4281b", "a59b8f", "b39fe1"]


def land_cover(year):
    return (ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
            .filterBounds(AREA)
            .filterDate(f"{year}{SEASON[0]}", f"{year}{SEASON[1]}")
            .select("label")
            .reduce(ee.Reducer.mode())
            .rename("label")
            .clip(AREA))


def photo(year):
    return (ee.ImageCollection("COPERNICUS/S2_HARMONIZED")
            .filterBounds(AREA)
            .filterDate(f"{year}{SEASON[0]}", f"{year}{SEASON[1]}")
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 10))
            .median()
            .clip(AREA))


def clean(mask):
    """Drop specks: keep patches of at least 10 squares (~0.1 ha)."""
    m = mask.selfMask()
    return m.updateMask(m.connectedPixelCount(100, True).gte(10))


def hectares(mask):
    s = ee.Image.pixelArea().updateMask(mask).reduceRegion(
        reducer=ee.Reducer.sum(), geometry=AREA, scale=10, maxPixels=1e10).get("area")
    return ee.Number(ee.Algorithms.If(s, s, 0)).divide(10000)


before, after = land_cover(BEFORE_YEAR), land_cover(AFTER_YEAR)
after_prev = land_cover(AFTER_YEAR - 1)   # 2025, to confirm the change is stable
wet_before = before.eq(0).Or(before.eq(3))
wet_after = after.eq(0).Or(after.eq(3))

# v1 noise fixes:
#  - ignore the outer ~20 m rim of every 2018 water body (edge pixels mix water
#    with nearby buildings and caused thin false "lines" along lake shores)
#  - count "buildings"/"bare soil" only if the label is the same in 2025 AND 2026
wet_core = wet_before.focalMin(radius=20, units="meters")
to_built = clean(wet_core.And(after.eq(6)).And(after_prev.eq(6)))
to_bare = clean(wet_core.And(after.eq(7)).And(after_prev.eq(7)))

# 2. Numbers
stats = ee.Dictionary({
    "wet_ha_before": hectares(wet_before.selfMask()),
    "wet_ha_after": hectares(wet_after.selfMask()),
    "wet_to_built_ha": hectares(to_built),
    "wet_to_bare_ha": hectares(to_bare),
    "dw_images_before": ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1").filterBounds(AREA)
        .filterDate(f"{BEFORE_YEAR}{SEASON[0]}", f"{BEFORE_YEAR}{SEASON[1]}").size(),
    "dw_images_after": ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1").filterBounds(AREA)
        .filterDate(f"{AFTER_YEAR}{SEASON[0]}", f"{AFTER_YEAR}{SEASON[1]}").size(),
}).getInfo()
(OUT / "stats.json").write_text(json.dumps(stats, indent=2))
print("STATS", json.dumps(stats, indent=2))

# 3. Biggest changed spots (for checking against real photos)
change_class = (ee.Image(0)
                .where(to_bare.unmask(0), 2)
                .where(to_built.unmask(0), 1)
                .selfMask().rename("cls").clip(AREA).toInt())
vectors = change_class.reduceToVectors(
    geometry=AREA, scale=10, geometryType="polygon", eightConnected=True,
    labelProperty="cls", maxPixels=1e10)
vectors = vectors.map(lambda f: f.set({
    "area_ha": f.geometry().area(1).divide(10000),
    "lon": f.geometry().centroid(1).coordinates().get(0),
    "lat": f.geometry().centroid(1).coordinates().get(1),
}))
top = vectors.sort("area_ha", False).limit(10).getInfo()["features"]
with open(OUT / "top_spots.csv", "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["rank", "type", "area_ha", "lat", "lon", "google_maps"])
    for i, f in enumerate(top, 1):
        p = f["properties"]
        kind = "wet->buildings" if p["cls"] == 1 else "wet->bare soil"
        lat, lon = round(p["lat"], 5), round(p["lon"], 5)
        w.writerow([i, kind, round(p["area_ha"], 2), lat, lon,
                    f"https://www.google.com/maps/@{lat},{lon},400m/data=!3m1!1e3"])
        print(f"#{i:2d} {kind:15s} {p['area_ha']:6.2f} ha  {lat},{lon}")

# 4. Images for the slides
DIM = 900
cover_vis = {"min": 0, "max": 8, "palette": PALETTE}
photo_vis = {"bands": ["B4", "B3", "B2"], "min": 0, "max": 3000}
campus_dot = ee.Image().paint(ee.FeatureCollection([ee.Feature(CAMPUS.buffer(120))]), 1)


def save(img, name):
    url = img.getThumbURL({"region": AREA, "dimensions": DIM, "format": "png"})
    urllib.request.urlretrieve(url, OUT / name)
    print("saved", name)


def with_campus(rgb):
    return rgb.blend(campus_dot.visualize(palette=["ffff00"]))


save(with_campus(before.visualize(**cover_vis)), "landcover_2018.png")
save(with_campus(after.visualize(**cover_vis)), "landcover_2026.png")
save(with_campus(photo(BEFORE_YEAR).visualize(**photo_vis)), "photo_2018.png")
change_on_photo = (photo(AFTER_YEAR).visualize(**photo_vis)
                   .blend(to_bare.visualize(palette=["ff9900"]))
                   .blend(to_built.visualize(palette=["ff0000"])))
save(with_campus(change_on_photo), "change_2026_on_photo.png")
change_on_cover = (after.visualize(**cover_vis)
                   .blend(to_bare.visualize(palette=["ff9900"]))
                   .blend(to_built.visualize(palette=["ff0000"])))
save(with_campus(change_on_cover), "change_2026_on_landcover.png")
print("DONE")

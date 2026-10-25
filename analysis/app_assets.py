"""Data for the Round 2 web app (docs/app/), using the same v1 rule as change_map.py.

Earth Engine map-tile URLs expire after a few hours, so this saves everything
the app needs as static files:
  - Sentinel-2 photos of the study area for 2018 and 2026 (JPEG)
  - Dynamic World land labels for 2018 and 2026 (PNG, one colour per label)
  - every changed patch as a polygon (reduceToVectors), ranked by area

Usage:  .venv/Scripts/python analysis/app_assets.py
Output: docs/app/data/ (images, patches.geojson, neerkatti_data.js)
"""
import datetime
import io
import json
import math
import os
import pathlib
import re
import time
import urllib.request

import ee
from PIL import Image, ImageEnhance

PROJECT = os.environ.get("EE_PROJECT", "dexathon-athulya")  # set EE_PROJECT to your own Earth Engine Cloud project
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "app" / "data"
OUT.mkdir(parents=True, exist_ok=True)
PLACES_CACHE = ROOT / "outputs" / "places.json"

ee.Initialize(project=PROJECT)

BOX = [80.17, 12.86, 80.26, 12.99]  # west, south, east, north
AREA = ee.Geometry.Rectangle(BOX)
CAMPUS = (80.2226, 12.8731)
BEFORE_YEAR, AFTER_YEAR = 2018, 2026
SEASON = ("-02-01", "-06-01")  # Feb–May: dry season, few clouds
PX = 1500  # image height; 0.13° of latitude / 1500 px ≈ 9.6 m, close to Sentinel-2's 10 m
VIS = {"bands": ["B4", "B3", "B2"], "min": 0, "max": 3000}

# Dynamic World labels: 0 water, 1 trees, 2 grass, 3 flooded vegetation (marsh),
# 4 crops, 5 shrub & scrub, 6 built, 7 bare, 8 snow & ice.
# Same colours as Dynamic World, except built (dark grey) and bare (sand), so
# that red on the map only ever means a flagged patch.
LABELS = [("water", "419bdf"), ("trees", "397d49"), ("grass", "88b053"),
          ("marsh", "7a87c6"), ("crops", "e49635"), ("shrub & scrub", "dfc35a"),
          ("buildings", "8f939c"), ("bare soil", "cdb88f"), ("snow & ice", "b39fe1")]

# The top 10, checked by eye on the before/after close-ups and on high-resolution
# satellite imagery (outputs/topten_check.md). Sites A–C are the README's.
# Keyed by rank: (site, lon, lat, what the images show). The script stops if a
# patch has moved, so a re-run on changed data can't attach the wrong finding.
CHECKED = {
    1: ("A", 80.22958, 12.96237, "Marsh cleared and built up"),
    2: ("B", 80.20827, 12.88096, "2018 water now under a housing block"),
    3: ("C", 80.20947, 12.90296, "Marsh edge filled"),
    4: (None, 80.19085, 12.94678, "High-rise construction at the lake edge"),
    5: ("B", 80.21025, 12.88213, "Part of the site B housing"),
    6: (None, 80.22750, 12.96723, "Shoreline filled with earth, next to housing"),
    7: (None, 80.24429, 12.94220, "Lake edge filled with earth and debris"),
    8: (None, 80.22116, 12.90880, "2018 pond or marsh now paved over"),
    9: (None, 80.23088, 12.95706, "Change visible, cause unclear"),
    10: (None, 80.23413, 12.88364, "New road and paths along the pond edge"),
}
# Place names already used in Round 1 (README, deck, demo page). Patch 4 sits on
# the Sunnambu Kolathur / Echangadu border; OSM now puts it in Echangadu, but
# we keep the Round 1 name so the two don't disagree. Other patches get their
# OSM suburb.
NAMES = {1: "Perungudi", 2: "Nookampalayam", 3: "Perumbakkam", 4: "Sunnambu Kulathur",
         5: "Nookampalayam", 10: "Panaiyur"}
# Map labels for orientation (OSM Nominatim positions, looked up 20 Oct 2026).
# The app draws these itself, so it needs no labels-only basemap service.
PLACES = [("Velachery", 12.9802, 80.2229), ("Taramani", 12.9849, 80.2404),
          ("Perungudi", 12.9710, 80.2418), ("Thuraipakkam", 12.9492, 80.2407),
          ("Madipakkam", 12.9611, 80.2001), ("Pallikaranai", 12.9305, 80.2078),
          ("Kovilambakkam", 12.9407, 80.1800), ("Medavakkam", 12.9202, 80.1872),
          ("Perumbakkam", 12.9055, 80.1956), ("Sholinganallur", 12.9005, 80.2285),
          ("Nookampalayam", 12.8843, 80.2019)]
MARSH_LABEL = ("Pallikaranai Marsh", 12.9365, 80.2246)


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
    """Drop specks: keep patches of at least 10 squares (~0.1 ha)."""
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
    # display stretch only, same as demo_assets.py (same for both years)
    pic = ImageEnhance.Color(ImageEnhance.Contrast(pic).enhance(1.15)).enhance(1.15)
    pic.save(OUT / name, "JPEG", quality=86, optimize=True, progressive=True)
    print("saved", name, pic.size)
    return pic.size


def save_labels(img, name):
    vis = img.visualize(min=0, max=8, palette=[c for _, c in LABELS])
    url = vis.getThumbURL({"region": AREA, "dimensions": PX, "format": "png"})
    pic = Image.open(io.BytesIO(fetch(url))).convert("RGB")
    pic.quantize(colors=16).save(OUT / name, "PNG", optimize=True)
    print("saved", name, pic.size)


def metres(lon1, lat1, lon2, lat2):
    dx = (lon2 - lon1) * 111320 * math.cos(math.radians(lat1))
    return math.hypot(dx, (lat2 - lat1) * 110570)


def place_name(lon, lat, cache):
    """Area name (suburb level only, never a building or owner) from OSM Nominatim."""
    key = f"{lat:.5f},{lon:.5f}"
    if key not in cache:
        url = ("https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14"
               f"&lat={lat:.5f}&lon={lon:.5f}&accept-language=en")
        req = urllib.request.Request(url, headers={
            "User-Agent": "NEERKATTI/0.2 (DEXATHON 2026 student project; "
                          "github.com/ATHULYAPANDIAN24/neerkatti)"})
        addr = json.loads(urllib.request.urlopen(req, timeout=30).read()).get("address", {})
        cache[key] = next((addr[k] for k in ("suburb", "village", "town", "city_district")
                           if k in addr), None)
        time.sleep(1.2)  # Nominatim allows one request per second
    name = cache[key]
    # Chennai's corporation zones come back as "Zone 14 Perungudi"
    return re.sub(r"^Zone \d+ ", "", name) if name else None


# 1. The v1 rule
before, after = land_cover(BEFORE_YEAR), land_cover(AFTER_YEAR)
after_prev = land_cover(AFTER_YEAR - 1)
wet_before = before.eq(0).Or(before.eq(3))
wet_core = wet_before.focalMin(radius=20, units="meters")
to_built = clean(wet_core.And(after.eq(6)).And(after_prev.eq(6)))

# 2. Changed patches as polygons
vectors = to_built.rename("lost").toInt().reduceToVectors(
    geometry=AREA, scale=10, geometryType="polygon", eightConnected=True,
    labelProperty="lost", maxPixels=1e10)
vectors = vectors.map(lambda f: f.set({
    "area_ha": f.geometry().area(1).divide(10000),
    "lon": f.geometry().centroid(1).coordinates().get(0),
    "lat": f.geometry().centroid(1).coordinates().get(1),
}))
raw = vectors.sort("area_ha", False).getInfo()["features"]
print(len(raw), "patches")

cache = json.loads(PLACES_CACHE.read_text(encoding="utf-8")) if PLACES_CACHE.exists() else {}


def rounded(coords):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], 6), round(coords[1], 6)]
    return [rounded(c) for c in coords]


features = []
for rank, f in enumerate(raw, 1):
    p = f["properties"]
    lon, lat = round(p["lon"], 5), round(p["lat"], 5)
    props = {
        "rank": rank,
        "area_ha": round(p["area_ha"], 2),
        "lat": lat, "lon": lon,
        "change": "water or marsh in 2018 -> buildings in 2025 and 2026",
        "status": "possible change, needs a ground check",
        "place": NAMES.get(rank) or place_name(lon, lat, cache) if rank <= 10 else None,
        "site": None,
        "checked_by_eye": False,
        "finding": None,
    }
    if rank in CHECKED:
        site, slon, slat, finding = CHECKED[rank]
        gap = metres(lon, lat, slon, slat)
        assert gap < 60, f"patch {rank} moved {gap:.0f} m from where it was checked; update CHECKED"
        props.update(site=site, checked_by_eye=True, finding=finding)
    features.append({"type": "Feature", "properties": props,
                     "geometry": {"type": f["geometry"]["type"],
                                  "coordinates": rounded(f["geometry"]["coordinates"])}})
PLACES_CACHE.write_text(json.dumps(cache, indent=2, ensure_ascii=False), encoding="utf-8")

# 3. Numbers for the side panel
stats = ee.Dictionary({
    "wet_ha_before": ee.Image.pixelArea().updateMask(wet_before.selfMask()).reduceRegion(
        reducer=ee.Reducer.sum(), geometry=AREA, scale=10, maxPixels=1e10).get("area"),
    "lost_ha": ee.Image.pixelArea().updateMask(to_built).reduceRegion(
        reducer=ee.Reducer.sum(), geometry=AREA, scale=10, maxPixels=1e10).get("area"),
    "s2_before": s2(BEFORE_YEAR).size(),
    "s2_after": s2(AFTER_YEAR).size(),
}).getInfo()

# 4. Images
w, h = save_photo(s2(BEFORE_YEAR).median().clip(AREA).visualize(**VIS), "photo_2018.jpg")
save_photo(s2(AFTER_YEAR).median().clip(AREA).visualize(**VIS), "photo_2026.jpg")
save_labels(before, "labels_2018.png")
save_labels(after, "labels_2026.png")

# 5. Write the data files
fc = {"type": "FeatureCollection",
      "name": "neerkatti_v1_pallikaranai_2018_2026",
      "description": ("NEERKATTI v1: squares that were water or marsh in 2018 (outer ~20 m rim "
                      "ignored) and are buildings in both 2025 and 2026, Dynamic World labels, "
                      "Feb-May of each year, patches of at least ~0.1 ha. Every patch is a "
                      "possible change that needs a ground check. It says nothing about who "
                      "owns the land."),
      "features": features}
(OUT / "patches.geojson").write_text(json.dumps(fc, separators=(",", ":")))

meta = {
    "box": BOX,
    "campus": CAMPUS,
    "years": [BEFORE_YEAR, AFTER_YEAR],
    "season": "Feb–May",
    "image_size": [w, h],
    "s2_images": {str(BEFORE_YEAR): stats["s2_before"], str(AFTER_YEAR): stats["s2_after"]},
    "wet_ha_before": round(stats["wet_ha_before"] / 10000, 1),
    "lost_ha": round(stats["lost_ha"] / 10000, 1),
    "patch_count": len(features),
    "labels": [{"name": n, "color": "#" + c} for n, c in LABELS[:8]],
    "places": [{"name": n, "lat": la, "lon": lo} for n, la, lo in PLACES],
    "marsh_label": {"name": MARSH_LABEL[0], "lat": MARSH_LABEL[1], "lon": MARSH_LABEL[2]},
    "generated": datetime.date.today().isoformat(),
}
js = ("// Made by analysis/app_assets.py. Do not edit by hand.\n"
      f"window.NEERKATTI = {{meta: {json.dumps(meta, ensure_ascii=False)},\n"
      f"patches: {json.dumps(fc, separators=(',', ':'), ensure_ascii=False)}}};\n")
(OUT / "neerkatti_data.js").write_text(js, encoding="utf-8")

print(json.dumps(meta, indent=2, ensure_ascii=False))
for f in features[:10]:
    p = f["properties"]
    print(f"#{p['rank']:2d} {p['area_ha']:6.2f} ha  {p['lat']},{p['lon']}  "
          f"{p['place']}  {p['site'] or ''}")
print("polygon total", round(sum(f["properties"]["area_ha"] for f in features), 2), "ha")
print("DONE")

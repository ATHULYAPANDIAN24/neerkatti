"""Context for every flagged patch: the protected marsh, the monsoon, and two other datasets.

  - The protected marsh as mapped in OpenStreetMap (relation 15046539: Pallikaranai Marsh,
    tagged Reserve Forest and Ramsar site), and a 1 km zone around it. The National Green
    Tribunal (24 Sep 2025) and then CMDA stopped new building approvals in the Ramsar
    site and a 1 km zone of influence. OSM's outline is volunteer-mapped, not the
    official survey boundary, so the app says so wherever it uses it.
  - The monsoon: the clearest Sentinel-2 image over the study area after the November
    2021 floods (26 Dec 2021, about 7% cloud over the area), with Dynamic World's labels
    for that day. A dry-season map shows the marsh at its smallest; this shows how far
    the water spreads. Squares under cloud have no label (white on the map), and a
    patch entirely under cloud gets no monsoon value.
  - Two independent datasets, as second opinions: JRC Global Surface Water (Landsat,
    1984–2021: was open water ever seen on the patch?) and ESA WorldCover 2021 (a
    separate AI land map, a snapshot halfway through our years).

No patch, area or headline number changes.

Usage:  .venv/Scripts/python analysis/context_layers.py   (after year_by_year.py)
Output: docs/app/data/marsh_boundary.geojson, photo_monsoon.jpg, labels_monsoon.png,
        patches.geojson and neerkatti_data.js (updated); outputs/osm_marsh_boundary.geojson
        (the OSM outline as downloaded, kept so a re-run gives the same answer)
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
OSM_FILE = ROOT / "outputs" / "osm_marsh_boundary.geojson"

ee.Initialize(project=PROJECT)

# the same settings as app_assets.py
BOX = [80.17, 12.86, 80.26, 12.99]
AREA = ee.Geometry.Rectangle(BOX)
PX = 1500
VIS = {"bands": ["B4", "B3", "B2"], "min": 0, "max": 3000}
PALETTE = ["419bdf", "397d49", "88b053", "7a87c6", "e49635", "dfc35a", "8f939c", "cdb88f", "b39fe1"]
OSM_RELATION = 15046539
ZONE_M = 1000
MONSOON = "20211226T050221_20211226T050221_T44PMV"   # 26 Dec 2021; picked by cloud over the study area, not the tile
KEYS = {"marsh_share", "marsh_distance_m", "landsat_water_ever", "wc2021_built", "wc2021_wet", "wet_monsoon"}


def fetch(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "neerkatti/1.0 (github.com/ATHULYAPANDIAN24/neerkatti)"})
            return urllib.request.urlopen(req, timeout=120).read()
        except OSError:
            if i == tries - 1:
                raise
            time.sleep(5)


def rounded(coords, nd=5):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], nd), round(coords[1], nd)]
    return [rounded(c, nd) for c in coords]


# 1. The protected marsh, from OpenStreetMap (downloaded once, then kept)
if not OSM_FILE.exists():
    raw = fetch("https://nominatim.openstreetmap.org/lookup?osm_ids=R%d&format=geojson&polygon_geojson=1" % OSM_RELATION)
    OSM_FILE.write_text(raw.decode("utf-8"), encoding="utf-8")
osm = json.loads(OSM_FILE.read_text(encoding="utf-8"))["features"][0]
marsh = ee.Geometry(osm["geometry"])
zone = marsh.buffer(ZONE_M, 5)
outline = ee.Dictionary({
    "marsh": marsh.simplify(3).coordinates(), "marsh_type": marsh.simplify(3).type(),
    "zone": zone.simplify(5).intersection(AREA.buffer(2000), 5).coordinates(),
    "zone_type": zone.simplify(5).intersection(AREA.buffer(2000), 5).type(),
    "marsh_ha": marsh.area(1).divide(1e4),
}).getInfo()
boundary = {
    "type": "FeatureCollection",
    "description": ("Pallikaranai Marsh as mapped in OpenStreetMap (relation %d, tagged Reserve Forest and "
                    "Ramsar site; © OpenStreetMap contributors, ODbL), and a %d m zone around it. Volunteer-"
                    "mapped, not the official survey boundary." % (OSM_RELATION, ZONE_M)),
    "features": [
        {"type": "Feature", "properties": {"kind": "marsh", "name": osm["properties"].get("name"),
                                           "area_ha": round(outline["marsh_ha"], 1)},
         "geometry": {"type": outline["marsh_type"], "coordinates": rounded(outline["marsh"])}},
        {"type": "Feature", "properties": {"kind": "zone", "metres": ZONE_M},
         "geometry": {"type": outline["zone_type"], "coordinates": rounded(outline["zone"])}},
    ]}
(DATA / "marsh_boundary.geojson").write_text(json.dumps(boundary, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
print("marsh", round(outline["marsh_ha"], 1), "ha")

# 2. The monsoon image and its AI labels
photo = ee.Image("COPERNICUS/S2_HARMONIZED/" + MONSOON)
labels = ee.Image("GOOGLE/DYNAMICWORLD/V1/" + MONSOON).select("label").clip(AREA)
date = ee.Date(photo.get("system:time_start")).format("YYYY-MM-dd").getInfo()
# one image keeps its own UTM grid; ask for plain latitude/longitude like the seasonal composites,
# or it comes out a different shape and sits slightly off the other years on the map
THUMB = {"region": AREA, "dimensions": PX, "format": "png", "crs": "EPSG:4326"}
url = photo.clip(AREA).visualize(**VIS).getThumbURL(THUMB)
pic = Image.open(io.BytesIO(fetch(url))).convert("RGB")
pic = ImageEnhance.Color(ImageEnhance.Contrast(pic).enhance(1.15)).enhance(1.15)   # as app_assets.py
pic.save(DATA / "photo_monsoon.jpg", "JPEG", quality=86, optimize=True, progressive=True)
url = labels.unmask(9).clip(AREA).visualize(min=0, max=9, palette=PALETTE + ["ffffff"]).getThumbURL(THUMB)
Image.open(io.BytesIO(fetch(url))).convert("RGB").quantize(colors=16).save(DATA / "labels_monsoon.png", "PNG", optimize=True)
wet_monsoon = labels.eq(0).Or(labels.eq(3))
monsoon_ha = ee.Image.pixelArea().updateMask(wet_monsoon).reduceRegion(
    reducer=ee.Reducer.sum(), geometry=AREA, scale=10, maxPixels=1e10).get("area").getInfo() / 1e4
print("monsoon", date, round(monsoon_ha), "ha water or marsh")

# 3. Per patch
geo = json.loads((DATA / "patches.geojson").read_text())
features = geo["features"]
fc = ee.FeatureCollection([ee.Feature(ee.Geometry(f["geometry"]), {"rank": f["properties"]["rank"]})
                           for f in features])
world = ee.ImageCollection("ESA/WorldCover/v200").first().select("Map")
jrc = ee.Image("JRC/GSW1_4/GlobalSurfaceWater")
img = (jrc.select("max_extent").unmask(0).rename("landsat_water_ever")
       .addBands(world.eq(50).rename("wc2021_built"))
       .addBands(world.eq(80).Or(world.eq(90)).rename("wc2021_wet"))   # permanent water, herbaceous wetland
       .addBands(wet_monsoon.rename("wet_monsoon")))
rows = img.reduceRegions(collection=fc, reducer=ee.Reducer.mean(), scale=10).map(lambda f: f.set({
    "marsh_share": f.geometry().intersection(marsh, 1).area(1).divide(f.geometry().area(1)),
    "marsh_distance_m": f.geometry().distance(marsh, 1),
})).getInfo()["features"]
rows = {f["properties"]["rank"]: f["properties"] for f in rows}

for f in features:
    p = f["properties"]
    for k in KEYS & set(p):
        del p[k]
    r = rows[p["rank"]]
    p.update({k: round(r[k], 2) for k in ("landsat_water_ever", "wc2021_built", "wc2021_wet", "marsh_share")})
    p["wet_monsoon"] = round(r["wet_monsoon"], 2) if r.get("wet_monsoon") is not None else None
    p["marsh_distance_m"] = round(r["marsh_distance_m"])
    print(f"#{p['rank']:2d} marsh {p['marsh_share']:.2f} {p['marsh_distance_m']:5d} m  landsat {p['landsat_water_ever']:.2f}  "
          f"wc21 built {p['wc2021_built']:.2f} wet {p['wc2021_wet']:.2f}  monsoon {p['wet_monsoon']}")

near = [f["properties"] for f in features if f["properties"]["marsh_distance_m"] <= ZONE_M]
print(len(near), "patches inside the marsh or within", ZONE_M, "m;",
      sum(p["marsh_share"] > 0 for p in near), "overlap the marsh outline")

# 4. Write the data back
(DATA / "patches.geojson").write_text(json.dumps(geo, separators=(",", ":")))
js_path = DATA / "neerkatti_data.js"
meta = json.loads(re.search(r"\{meta: (\{.*?\}),\npatches: ", js_path.read_text(encoding="utf-8"), re.S).group(1))
meta.update({
    "marsh": {"name": osm["properties"].get("name"), "osm_relation": OSM_RELATION, "area_ha": round(outline["marsh_ha"], 1),
              "zone_m": ZONE_M},
    "monsoon": {"date": date, "s2_id": MONSOON, "wet_ha": round(monsoon_ha, 1)},
})
js_path.write_text(
    "// Made by analysis/app_assets.py, with patch details from analysis/patch_details.py,\n"
    "// year_by_year.py and context_layers.py. Do not edit by hand.\n"
    f"window.NEERKATTI = {{meta: {json.dumps(meta, ensure_ascii=False)},\n"
    f"patches: {json.dumps(geo, separators=(',', ':'), ensure_ascii=False)}}};\n", encoding="utf-8")
print("DONE")

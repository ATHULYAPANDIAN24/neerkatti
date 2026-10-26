"""Details for every flagged patch, added to the data that app_assets.py wrote.

For each of the patches in docs/app/data/patches.geojson this adds:
  - its area: the Chennai Corporation zone inside the city, or the village outside it
    (OpenStreetMap Nominatim, which returns zones and wards here rather than suburbs;
    the top 10 also keep their Round 1 place names)
  - how sure the AI was: Dynamic World's own probabilities, averaged over the patch and the
    Feb–May images of each year, for "water or marsh" in 2018 and "built" in 2025 and 2026
  - a 2018 | 2026 close-up (the top 10 already have theirs, made by topten_closeups.py)
and to the page data, the number of Dynamic World images in each Feb–May since 2016,
which is why the comparison starts in 2018.

The AI confidence is the weakest of the three probabilities. The levels were fixed before
the numbers were computed: high if it is at least 0.50 (the model gave every step of the
change at least even odds), medium from 0.35, low below that.

No patch, area or headline number changes: the geometry, ranks and 28.1 ha stay as they are.

Usage:  .venv/Scripts/python analysis/patch_details.py [--skip-closeups]
Output: docs/app/data/patches.geojson and neerkatti_data.js (updated),
        outputs/closeups/patch_NN.jpg for ranks 11 and up
"""
import json
import os
import pathlib
import re
import sys

import ee

from osm_places import area_name, load_cache, save_cache
from topten_closeups import close_up

PROJECT = os.environ.get("EE_PROJECT", "dexathon-athulya")  # set EE_PROJECT to your own Earth Engine Cloud project
ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "app" / "data"
CLOSEUPS = ROOT / "outputs" / "closeups"
CLOSEUPS.mkdir(parents=True, exist_ok=True)

ee.Initialize(project=PROJECT)

BOX = [80.17, 12.86, 80.26, 12.99]
AREA = ee.Geometry.Rectangle(BOX)
SEASON = ("-02-01", "-06-01")
LEVELS = [(0.50, "high"), (0.35, "medium"), (0.0, "low")]
# what app_assets.py writes for each patch; anything else is from an earlier run of this script
BASE = {"rank", "area_ha", "lat", "lon", "change", "status", "place", "site", "checked_by_eye", "finding"}


def dw(year):
    return (ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1").filterBounds(AREA)
            .filterDate(f"{year}{SEASON[0]}", f"{year}{SEASON[1]}"))


geo = json.loads((DATA / "patches.geojson").read_text())
features = geo["features"]
fc = ee.FeatureCollection([ee.Feature(ee.Geometry(f["geometry"]), {"rank": f["properties"]["rank"]})
                           for f in features])

# 1. How sure the AI was, per patch
probs = (dw(2018).select("water").mean().add(dw(2018).select("flooded_vegetation").mean()).rename("wet_2018")
         .addBands(dw(2025).select("built").mean().rename("built_2025"))
         .addBands(dw(2026).select("built").mean().rename("built_2026")))
mean = {f["properties"]["rank"]: f["properties"] for f in
        probs.reduceRegions(collection=fc, reducer=ee.Reducer.mean(), scale=10).getInfo()["features"]}

# 2. Dynamic World images per dry season: few before 2018, when Sentinel-2B joined 2A
per_year = {str(y): dw(y).size() for y in range(2016, 2027)}
dw_images = ee.Dictionary(per_year).getInfo()
print("Dynamic World images, Feb–May:", dw_images)

cache = load_cache()
for f in features:
    p = f["properties"]
    for k in set(p) - BASE:
        del p[k]
    m = mean[p["rank"]]
    p_wet, p25, p26 = (round(m[k], 2) for k in ("wet_2018", "built_2025", "built_2026"))
    weakest = min(p_wet, p25, p26)
    if p["rank"] > 10:
        p["place"] = None   # as app_assets.py writes it: only the top 10 carry a place name
    p.update({
        "p_wet_2018": p_wet, "p_built_2025": p25, "p_built_2026": p26,
        "ai_confidence": next(name for floor, name in LEVELS if weakest >= floor),
        "admin_area": area_name(p["lon"], p["lat"], cache),
    })
    print(f"#{p['rank']:2d} {p['area_ha']:5.2f} ha  {str(p['place'] or p['admin_area']):18s} wet {p_wet:.2f}  "
          f"built {p25:.2f}/{p26:.2f}  {p['ai_confidence']}")
save_cache(cache)

# 3. Close-ups for the patches outside the top 10
for f in [] if "--skip-closeups" in sys.argv else features[10:]:
    out = CLOSEUPS / f"patch_{f['properties']['rank']:02d}.jpg"
    close_up(f).save(out, quality=90)
    print("saved", out.name)

# 4. Write the data back: same geometry and order, more properties
(DATA / "patches.geojson").write_text(json.dumps(geo, separators=(",", ":")))
js_path = DATA / "neerkatti_data.js"
meta = json.loads(re.search(r"\{meta: (\{.*?\}),\npatches: ", js_path.read_text(encoding="utf-8"), re.S).group(1))
meta.update({
    "dw_images_by_year": {y: dw_images[y] for y in sorted(dw_images)},
    "confidence_levels": {name: floor for floor, name in LEVELS},
})
js_path.write_text(
    "// Made by analysis/app_assets.py, with patch details from analysis/patch_details.py. Do not edit by hand.\n"
    f"window.NEERKATTI = {{meta: {json.dumps(meta, ensure_ascii=False)},\n"
    f"patches: {json.dumps(geo, separators=(',', ':'), ensure_ascii=False)}}};\n", encoding="utf-8")
counts = {name: sum(f["properties"]["ai_confidence"] == name for f in features) for _, name in LEVELS}
print("confidence:", counts)
print("DONE")

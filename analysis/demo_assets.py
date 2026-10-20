"""Images for the live demo page (docs/), using the same v1 rule as change_map.py.

Usage:  .venv/Scripts/python analysis/demo_assets.py
Output: docs/img/*.jpg
"""
import io
import pathlib
import urllib.request

import ee
from PIL import Image, ImageEnhance

PROJECT = "dexathon-athulya"
ROOT = pathlib.Path(__file__).resolve().parent.parent
IMG = ROOT / "docs" / "img"
IMG.mkdir(parents=True, exist_ok=True)

ee.Initialize(project=PROJECT)

AREA = ee.Geometry.Rectangle([80.17, 12.86, 80.26, 12.99])
CAMPUS = ee.Geometry.Point([80.2226, 12.8731])
SEASON = ("-02-01", "-06-01")
VIS = {"bands": ["B4", "B3", "B2"], "min": 0, "max": 3000}

# Sites checked by eye (see README): A Perungudi, B Nookampalayam, C Perumbakkam
SITES = {
    "a": (80.22958, 12.96237),
    "b": (80.20827, 12.88096),
    "c": (80.20947, 12.90296),
}


def land_cover(year, region):
    return (ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1").filterBounds(region)
            .filterDate(f"{year}{SEASON[0]}", f"{year}{SEASON[1]}")
            .select("label").reduce(ee.Reducer.mode()).rename("label"))


def photo(year, region):
    return (ee.ImageCollection("COPERNICUS/S2_HARMONIZED").filterBounds(region)
            .filterDate(f"{year}{SEASON[0]}", f"{year}{SEASON[1]}")
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 10)).median())


def lost_to_buildings(region):
    """v1 rule: core of 2018 water/marsh -> built in 2025 AND 2026, patches >= ~0.1 ha."""
    before = land_cover(2018, region)
    wet_core = before.eq(0).Or(before.eq(3)).focalMin(radius=20, units="meters")
    m = wet_core.And(land_cover(2026, region).eq(6)).And(land_cover(2025, region).eq(6)).selfMask()
    return m.updateMask(m.connectedPixelCount(100, True).gte(10))


def save(img, region, name, px):
    url = img.getThumbURL({"region": region, "dimensions": px, "format": "png"})
    pic = Image.open(io.BytesIO(urllib.request.urlopen(url).read())).convert("RGB")
    # display stretch only (same for every year, so comparisons stay fair)
    pic = ImageEnhance.Color(ImageEnhance.Contrast(pic).enhance(1.15)).enhance(1.15)
    pic.save(IMG / name, "JPEG", quality=86, optimize=True, progressive=True)
    print("saved", name, pic.size)


# 1. Whole study area: 2018 photo, 2026 photo, 2026 photo + red loss
campus = ee.Image().paint(ee.FeatureCollection([ee.Feature(CAMPUS.buffer(120))]), 1)
dot = campus.visualize(palette=["ffff00"])
loss = lost_to_buildings(AREA).clip(AREA)
p18 = photo(2018, AREA).clip(AREA).visualize(**VIS)
p26 = photo(2026, AREA).clip(AREA).visualize(**VIS)
save(p18.blend(dot), AREA, "area_2018.jpg", 1500)
save(p26.blend(dot), AREA, "area_2026.jpg", 1500)
save(p26.blend(loss.visualize(palette=["ff1a1a"])).blend(dot), AREA, "area_2026_loss.jpg", 1500)

# 2. Close-ups of the checked sites: 2018 photo | 2026 photo with red outline
for key, (lon, lat) in SITES.items():
    region = ee.Geometry.Point([lon, lat]).buffer(450).bounds()
    outline = ee.Image().paint(
        lost_to_buildings(region).reduceToVectors(geometry=region, scale=10, maxPixels=1e9), 1, 3)
    save(photo(2018, region).visualize(**VIS), region, f"site_{key}_2018.jpg", 640)
    save(photo(2026, region).visualize(**VIS).blend(outline.visualize(palette=["ff1a1a"])),
         region, f"site_{key}_2026.jpg", 640)
print("DONE")

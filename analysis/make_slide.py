"""Build the slide-3 image: overview map + before/after of the top sites.

Needs outputs/change_2026_on_photo.png and outputs/stats.json from change_map.py.
Writes outputs/slide3_neerkatti.png (1600 x 900).
"""
import io
import json
import os
import pathlib
import urllib.request

import ee
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "outputs"
ee.Initialize(project=os.environ.get("EE_PROJECT", "dexathon-athulya"))  # set EE_PROJECT to your own Cloud project

AREA_BOUNDS = (80.17, 12.86, 80.26, 12.99)  # must match change_map.py
SEASON = ("-02-01", "-06-01")
NAVY, GREY, RED = (31, 58, 95), (90, 90, 90), (220, 0, 0)

# Sites checked by eye (see outputs/closeups.png); hectares from the v1 strict count
SITES = [
    ("A", "Perungudi", 12.96237, 80.22958, "≈11 ha of 2018 marsh now cleared / built-up"),
    ("B", "Nookampalayam", 12.88096, 80.20827, "≈4.6 ha of 2018 water now under a housing block"),
    ("C", "Perumbakkam", 12.90296, 80.20947, "≈1 ha strip of marsh edge filled"),
    ("D", "Sunnambu Kulathur", 12.94678, 80.19085, ""),
    ("E", "Panaiyur", 12.88364, 80.23413, ""),
]


def font(size, bold=False):
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    return ImageFont.truetype(f"C:/Windows/Fonts/{name}", size)


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


def fetch(img, region, px):
    url = img.getThumbURL({"region": region, "dimensions": px, "format": "png"})
    return Image.open(io.BytesIO(urllib.request.urlopen(url).read())).convert("RGB")


def site_tiles(lat, lon, px=220, half_m=500):
    region = ee.Geometry.Point([lon, lat]).buffer(half_m).bounds()
    vis = {"bands": ["B4", "B3", "B2"], "min": 0, "max": 3000}
    wet_core = (land_cover(2018, region).eq(0).Or(land_cover(2018, region).eq(3))
                .focalMin(radius=20, units="meters"))
    changed = (wet_core.And(land_cover(2026, region).eq(6))
               .And(land_cover(2025, region).eq(6)).selfMask())
    outline = ee.Image().paint(changed.reduceToVectors(
        geometry=region, scale=10, maxPixels=1e9), 1, 2)
    before = fetch(photo(2018, region).visualize(**vis), region, px)
    after = fetch(photo(2026, region).visualize(**vis)
                  .blend(outline.visualize(palette=["ff0000"])), region, px)
    return before.resize((px, px)), after.resize((px, px))


stats = json.loads((OUT / "stats.json").read_text())
slide = Image.new("RGB", (1600, 900), "white")
d = ImageDraw.Draw(slide)

# Title
d.text((40, 24), "NEERKATTI — the satellite already sees it", font=font(40, True), fill=NAVY)
d.text((40, 78), "Pallikaranai watershed, Chennai · same dry season (Feb–May), 2018 vs 2026",
       font=font(22), fill=GREY)

# Left: overview map with site letters
ov = Image.open(OUT / "change_2026_on_photo.png").convert("RGB")
H = 740
W = round(ov.width * H / ov.height)
ov = ov.resize((W, H))
od = ImageDraw.Draw(ov)
x0, y0, x1, y1 = AREA_BOUNDS
for letter, _, lat, lon, _ in SITES:
    px = (lon - x0) / (x1 - x0) * W
    py = (y1 - lat) / (y1 - y0) * H
    r = 15
    od.ellipse((px + 8, py - r - 8, px + 8 + 2 * r, py + r - 8), fill="white", outline=NAVY, width=2)
    od.text((px + 8 + r, py - 8), letter, font=font(18, True), fill=NAVY, anchor="mm")
slide.paste(ov, (40, 125))
d.rectangle((40, 125, 40 + W, 125 + H), outline=GREY, width=1)
d.text((40, 125 + H + 6), "Red = water/marsh in 2018, built-up in 2025 and 2026 · Yellow dot = Sathyabama",
       font=font(15), fill=GREY)

# Right: headline number + three before/after pairs
rx = 40 + W + 40
d.text((rx, 125), f"{stats['wet_to_built_ha']:.0f} hectares (≈{stats['wet_to_built_ha'] * 2.47105:.0f} acres)", font=font(44, True), fill=RED)
d.text((rx, 180), "of 2018 water & marsh is now built-up (strict count)",
       font=font(22), fill=NAVY)

TILE = 190
for i, (letter, place, lat, lon, note) in enumerate(SITES[:3]):
    y = 232 + i * 205
    before, after = site_tiles(lat, lon, px=TILE)
    slide.paste(before, (rx, y))
    slide.paste(after, (rx + TILE + 10, y))
    d.text((rx + 4, y + 4), "2018", font=font(16, True), fill="white")
    d.text((rx + TILE + 14, y + 4), "2026", font=font(16, True), fill="white")
    tx = rx + 2 * TILE + 30
    d.text((tx, y + 10), f"{letter} · {place}", font=font(26, True), fill=NAVY)
    d.text((tx, y + 50), note, font=font(19), fill=NAVY)
    d.text((tx, y + 80), f"{lat:.4f}, {lon:.4f}", font=font(16), fill=GREY)
    print("site", letter, "done")

d.text((rx, 868),
       "Data: ESA Sentinel-2 · Google/WRI Dynamic World · Every alert needs a ground check before any complaint.",
       font=font(15), fill=GREY)

slide.save(OUT / "slide3_neerkatti.png")
print("saved slide3_neerkatti.png")

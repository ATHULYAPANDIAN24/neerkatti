"""A season-by-season close-up of the biggest flagged patch, for the project page and README.

Every dry season 2018–2026, the same Sentinel-2 median as the live map (the clear
Feb–May images of each year, year_by_year.py), cut out around patch #1 and outlined
in red from its polygon. Earth Engine resamples bicubically, so the 10 m pixels are
smoothed for viewing; no detail is added. Every season gets the same colour stretch,
so a change in colour is a change on the ground, not a change in processing.

It also writes a link-preview image (og.jpg for the project page, og-map.jpg for the
live map) whose numbers are read from the map's data, not typed in.

Usage:  .venv/Scripts/python analysis/patch_timelapse.py   (after year_by_year.py)
Output: docs/img/timelapse/p01_YYYY.jpg (2018–2026), docs/img/timelapse/p01_strip.jpg,
        docs/img/og.jpg and docs/app/og-map.jpg
"""
import io
import json
import math
import os
import pathlib
import re
import time
import urllib.request

import ee
from PIL import Image, ImageDraw, ImageEnhance, ImageFont

PROJECT = os.environ.get("EE_PROJECT", "dexathon-athulya")  # set EE_PROJECT to your own Earth Engine Cloud project
ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "app" / "data"
OUT = ROOT / "docs" / "img" / "timelapse"
OUT.mkdir(parents=True, exist_ok=True)

ee.Initialize(project=PROJECT)

# the same settings as year_by_year.py
BOX = [80.17, 12.86, 80.26, 12.99]
AREA = ee.Geometry.Rectangle(BOX)
SEASON = ("-02-01", "-06-01")
VIS = {"bands": ["B4", "B3", "B2"], "min": 0, "max": 3000}
YEARS = list(range(2018, 2027))
RANK = 1
PX = 640          # each frame, square
MARGIN_M = 260    # ground shown around the patch on each side


def s2(year):
    return (ee.ImageCollection("COPERNICUS/S2_HARMONIZED")
            .filterBounds(AREA)
            .filterDate(f"{year}{SEASON[0]}", f"{year}{SEASON[1]}")
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 10)))


def fetch(url, tries=3):
    for i in range(tries):
        try:
            return urllib.request.urlopen(url, timeout=120).read()
        except OSError:
            if i == tries - 1:
                raise
            time.sleep(5)


R = 6378137.0


def merc(lon, lat):
    return R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def load_data():
    js = (DATA / "neerkatti_data.js").read_text(encoding="utf-8")
    meta = json.loads(re.search(r"\{meta: (\{.*?\}),\npatches: ", js, re.S).group(1))
    patches = json.loads(re.search(r"\npatches: (\{.*\})\};\s*$", js, re.S).group(1))
    return meta, patches["features"]


meta, features = load_data()
patch = features[RANK - 1]
props = patch["properties"]
geom = patch["geometry"]
rings = geom["coordinates"] if geom["type"] == "Polygon" else [r for poly in geom["coordinates"] for r in poly]

# a square in Web Mercator around the patch, so the frames are true to shape
xs, ys = zip(*(merc(lon, lat) for ring in rings for lon, lat in ring))
cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
# Mercator metres at 13°N are about 2.6% longer than ground metres
half = (max(max(xs) - min(xs), max(ys) - min(ys)) / 2 + MARGIN_M / math.cos(math.radians(12.96)))
x0, y0, x1, y1 = cx - half, cy - half, cx + half, cy + half
region = ee.Geometry.Rectangle([x0, y0, x1, y1], "EPSG:3857", False)


def to_px(lon, lat):
    x, y = merc(lon, lat)
    return (x - x0) / (x1 - x0) * PX, (y1 - y) / (y1 - y0) * PX


def outline(pic):
    d = ImageDraw.Draw(pic)
    for ring in rings:
        pts = [to_px(lon, lat) for lon, lat in ring]
        d.line(pts + [pts[0]], fill=(20, 20, 20), width=7, joint="curve")
        d.line(pts + [pts[0]], fill=(255, 40, 40), width=3, joint="curve")
    return pic


frames = {}
for y in YEARS:
    # a median has no grid of its own: give it Sentinel-2's 10 m one, or "bicubic" would smooth 1-degree pixels
    col = s2(y)
    img = col.median().setDefaultProjection(col.first().select("B4").projection()).resample("bicubic").visualize(**VIS)
    url = img.getThumbURL({"region": region, "dimensions": f"{PX}x{PX}", "crs": "EPSG:3857", "format": "png"})
    pic = Image.open(io.BytesIO(fetch(url))).convert("RGB")
    # the map's own enhancement (year_by_year.py save_photo), the same for every season
    pic = ImageEnhance.Color(ImageEnhance.Contrast(pic).enhance(1.15)).enhance(1.15)
    frames[y] = outline(pic)
    frames[y].save(OUT / f"p{RANK:02d}_{y}.jpg", "JPEG", quality=82, optimize=True, progressive=True)
    print("saved", f"p{RANK:02d}_{y}.jpg", pic.size)


def font(size, bold=True):
    for name in (("segoeuib.ttf", "arialbd.ttf") if bold else ("segoeui.ttf", "arial.ttf")):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def tag(pic, text, xy, fill=(37, 60, 109), size=26):
    d = ImageDraw.Draw(pic)
    f = font(size)
    l, t, r, b = d.textbbox((0, 0), text, font=f)
    x, y = xy
    d.rounded_rectangle([x, y, x + r - l + 22, y + b - t + 14], radius=(b - t + 14) // 2, fill=fill)
    d.text((x + 11 - l, y + 7 - t), text, font=f, fill=(255, 255, 255))


# a strip of all nine seasons, for the README
T = 220
strip = Image.new("RGB", (T * len(YEARS) + 8 * (len(YEARS) - 1), T + 44), (246, 248, 251))
d = ImageDraw.Draw(strip)
for i, y in enumerate(YEARS):
    x = i * (T + 8)
    strip.paste(frames[y].resize((T, T), Image.LANCZOS), (x, 0))
    built = props["built_by_year"][i]
    label = f"{y} · {round(built * 100)}% buildings"
    f = font(19)
    w = d.textlength(label, font=f)
    d.text((x + (T - w) / 2, T + 10), label, font=f, fill=(27, 35, 51))
strip.save(OUT / f"p{RANK:02d}_strip.jpg", "JPEG", quality=84, optimize=True, progressive=True)
print("saved strip", strip.size)

# link preview, 1200 x 630: three seasons of patch #1 and the headline numbers, read from the data
recent = sum(meta["built_since_ha"][y] for y in ("2023", "2024", "2025"))
share = round(recent / meta["lost_ha"] * 100)
og = Image.new("RGB", (1200, 630), (37, 60, 109))
d = ImageDraw.Draw(og)
picks = [2018, 2022, 2026]
S = 280
for i, y in enumerate(picks):
    x = 40 + i * (S + 12)
    og.paste(frames[y].resize((S, S), Image.LANCZOS), (x, 262))
    tag(og, str(y), (x + 10, 272), fill=(194, 65, 12) if y == 2026 else (37, 60, 109), size=24)
d.text((40, 34), "NEER", font=font(54), fill=(255, 255, 255))
d.text((40 + d.textlength("NEER", font=font(54)), 34), "KATTI", font=font(54), fill=(242, 132, 47))
d.text((40, 106), "An AI water-keeper for Chennai's wetlands", font=font(30, bold=False), fill=(220, 228, 242))
d.text((40, 160), f"{meta['lost_ha']} ha of 2018 water and marsh flagged as built over,", font=font(28), fill=(255, 255, 255))
d.text((40, 200), f"{share}% of it since 2023. Every dry season, 2018–2026.", font=font(28), fill=(255, 255, 255))
side = 40 + 3 * (S + 12) + 14
f = font(22, bold=False)
lines = [f"Patch #{RANK}, {props['place']}:", f"{props['area_ha']:.2f} ha, marsh", "until 2022, built",
         f"over since {props['built_since']}.", "", "Possible change,", "needs a ground check.", "", "Live map:",
         "athulyapandian24", ".github.io/neerkatti"]
for j, line in enumerate(lines):
    d.text((side, 266 + j * 29), line, font=f, fill=(220, 228, 242))
og.save(ROOT / "docs" / "img" / "og.jpg", "JPEG", quality=86, optimize=True, progressive=True)
og.save(ROOT / "docs" / "app" / "og-map.jpg", "JPEG", quality=86, optimize=True, progressive=True)
print("saved og.jpg and og-map.jpg")
print("DONE")

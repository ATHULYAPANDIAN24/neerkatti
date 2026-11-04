"""Alerts for new changes since the 2026 dry season (final round, P0).

A square raises an alert when the AI labels it water or marsh in the 2026 dry season
(Feb–May, the same summary the map shows, off the outer ~20 m rim of each water body),
and buildings or bare earth in at least two clear Sentinel-2 images taken since then,
and in at least half of the clear looks it got. Groups of fewer than 10 squares (~0.1 ha)
are dropped, as in the v1 rule.

"Clear" is judged over the study area itself, not by the tile's own cloud score (the
README tells why): Google's Cloud Score+ marks each square clear or not, and a day counts
when at least 90% of the area is seen clearly (75% if fewer than two days pass that).

Each alert gets its place (Corporation zone or village, from OpenStreetMap), where it is
against the protected marsh (inside the outline, within the 1 km zone, or outside), the
first and last day it was seen, how many clear looks showed it, and a close-up of the 2026
dry season beside the latest clear image. Every alert is a possible change that needs a
ground check; NEERKATTI never names owners.

Usage:  .venv/Scripts/python analysis/new_changes.py
Output: docs/app/data/alerts.json, docs/app/data/alerts.xml (RSS) and
        docs/app/data/closeups/alert_A*.jpg
"""
import datetime as dt
import email.utils
import io
import json
import os
import pathlib
import time
import urllib.request
from xml.sax.saxutils import escape

import ee
from PIL import Image, ImageEnhance

from osm_places import area_name, load_cache, save_cache

PROJECT = os.environ.get("EE_PROJECT", "dexathon-athulya")  # set EE_PROJECT to your own Earth Engine Cloud project
ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "app" / "data"
SITE = "https://athulyapandian24.github.io/neerkatti/app/"

ee.Initialize(project=PROJECT)

# the same settings as app_assets.py and year_by_year.py
BOX = [80.17, 12.86, 80.26, 12.99]
AREA = ee.Geometry.Rectangle(BOX)
VIS = {"bands": ["B4", "B3", "B2"], "min": 0, "max": 3000}
BASELINE = ("2026-02-01", "2026-06-01")
SINCE = "2026-06-01"
CLEAR_SCORE = 0.6          # Cloud Score+ cs_cdf at or above this: the square is seen clearly
CLEAR_DAY = (0.90, 0.75)   # share of the area seen clearly for a day to count (fallback second)
MAX_ALERTS = 40
MAX_CLOSEUPS = 24
STATUS = "possible change, needs a ground check"
RULE = ("water or marsh in the 2026 dry season (off the 20 m rim), buildings or bare earth "
        "in at least two clear images since June 2026 and in at least half of its clear looks; "
        "groups of 10 or more squares")


def fetch(url, tries=3):
    for i in range(tries):
        try:
            return urllib.request.urlopen(url, timeout=120).read()
        except OSError:
            if i == tries - 1:
                raise
            time.sleep(5)


def clean(mask):
    m = mask.selfMask()
    return m.updateMask(m.connectedPixelCount(100, True).gte(10))


today = dt.date.today()
end = (today + dt.timedelta(days=1)).isoformat()
dw = ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1").filterBounds(AREA)
csp = ee.ImageCollection("GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED").filterBounds(AREA)
s2 = ee.ImageCollection("COPERNICUS/S2_HARMONIZED").filterBounds(AREA)

# 1. The baseline: the 2026 dry season, as on the map, minus the outer rim of each water body
cover26 = dw.filterDate(*BASELINE).select("label").reduce(ee.Reducer.mode()).rename("label").clip(AREA)
wet26 = cover26.eq(0).Or(cover26.eq(3)).focalMin(radius=20, units="meters")


# 2. Every day with images since June, and how much of the area each one sees clearly
def look(day):
    """One day's AI labels, kept only where the square is seen clearly."""
    d0 = ee.Date(day)
    d1 = d0.advance(1, "day")
    labels = dw.filterDate(d0, d1).select("label").mosaic()
    clear = csp.filterDate(d0, d1).select("cs_cdf").mosaic().gte(CLEAR_SCORE)
    return labels.updateMask(clear).clip(AREA)


days = sorted(set(dw.filterDate(SINCE, end).aggregate_array("system:time_start")
                  .map(lambda t: ee.Date(t).format("YYYY-MM-dd")).getInfo()))
shares = ee.FeatureCollection(ee.List(days).map(lambda d: ee.Feature(None, {
    "day": d,
    "clear": look(d).gte(0).unmask(0).reduceRegion(ee.Reducer.mean(), AREA, 60, maxPixels=1e9).get("label"),
}))).getInfo()["features"]
clear_by_day = {f["properties"]["day"]: round(f["properties"]["clear"] or 0, 3) for f in shares}
print("days with images since", SINCE, len(days))
for d in days:
    print(f"  {d}  {clear_by_day[d]:.0%} of the area seen clearly")

threshold = CLEAR_DAY[0]
kept = [d for d in days if clear_by_day[d] >= threshold]
if len(kept) < 2:
    threshold = CLEAR_DAY[1]
    kept = [d for d in days if clear_by_day[d] >= threshold]
print(f"clear days (>= {threshold:.0%} of the area):", kept)

# 3. Square by square: how many clear looks, how many showed buildings or bare earth, and when
jan1 = dt.date(2026, 1, 1)
seen = ee.Image(0)
looks = ee.Image(0)
first = ee.Image(9999)
last = ee.Image(0)
for d in kept:
    n = (dt.date.fromisoformat(d) - jan1).days
    labels = look(d)
    built = labels.eq(6).Or(labels.eq(7)).unmask(0).And(wet26)
    seen = seen.add(built)
    looks = looks.add(labels.gte(0).unmask(0).And(wet26))
    first = first.min(ee.Image.constant(n).updateMask(built).unmask(9999))
    last = last.max(ee.Image.constant(n).updateMask(built).unmask(0))
flag = clean(seen.gte(2).And(seen.multiply(2).gte(looks)).And(wet26))

# 4. Groups of flagged squares become alerts, with what the reader needs to judge each one
marsh_geo = json.loads((DATA / "marsh_boundary.geojson").read_text(encoding="utf-8"))
marsh_parts = marsh_geo["features"] if marsh_geo.get("type") == "FeatureCollection" else [marsh_geo]
marsh = ee.FeatureCollection([ee.Feature(ee.Geometry(f["geometry"])) for f in marsh_parts]).geometry()
vectors = flag.toInt().reduceToVectors(geometry=AREA, scale=10, geometryType="polygon", eightConnected=True,
                                       labelProperty="flag", reducer=ee.Reducer.countEvery(), maxPixels=1e10)
stats = ee.Image.cat([seen.rename("seen"), looks.rename("looks"), last.rename("last")]).reduceRegions(
    collection=vectors, reducer=ee.Reducer.max(), scale=10)
stats = first.rename("first").updateMask(flag).reduceRegions(
    collection=stats, reducer=ee.Reducer.min().setOutputs(["first"]), scale=10)


def describe(f):
    g = f.geometry()
    return f.set({
        "area_m2": g.area(1),
        "centre": g.centroid(1).coordinates(),
        "marsh_distance_m": g.distance(marsh, 1),
        "marsh_overlap_m2": g.intersection(marsh, 1).area(1),
    })


found = stats.map(describe).filter(ee.Filter.gte("area_m2", 1000)).getInfo()["features"] if kept else []
print("alerts found:", len(found))


def day_of(n):
    return (jan1 + dt.timedelta(days=int(n))).isoformat()


ORDER = {"inside": 0, "zone": 1, "outside": 2}
alerts = []
for f in found:
    p = f["properties"]
    status = "inside" if p["marsh_overlap_m2"] > 0 else "zone" if p["marsh_distance_m"] <= 1000 else "outside"
    alerts.append({
        "lat": round(p["centre"][1], 5), "lon": round(p["centre"][0], 5),
        "area_ha": round(p["area_m2"] / 1e4, 2),
        "marsh": status,
        "marsh_distance_m": round(p["marsh_distance_m"]),
        "marsh_share": round(p["marsh_overlap_m2"] / p["area_m2"], 2),
        "first_seen": day_of(p["first"]), "last_seen": day_of(p["last"]),
        "times_seen": int(p["seen"]), "clear_looks": int(p["looks"]),
        "radar": None,
        "status": STATUS,
        "geometry": {"type": "Polygon", "coordinates": [[[round(x, 5), round(y, 5)] for x, y in ring]
                                                         for ring in f["geometry"]["coordinates"]]},
    })
alerts.sort(key=lambda a: (ORDER[a["marsh"]], -a["area_ha"]))
alerts = alerts[:MAX_ALERTS]

cache = load_cache()
for i, a in enumerate(alerts, 1):
    a["id"] = f"A{i}"
    a["place"] = area_name(a["lon"], a["lat"], cache) or "Pallikaranai watershed"
save_cache(cache)


# 5. A close-up of each alert: the 2026 dry season | the last clear day it was seen
def thumb(img, region, px=420):
    url = img.getThumbURL({"region": region, "dimensions": px, "format": "png"})
    pic = Image.open(io.BytesIO(fetch(url))).convert("RGB")
    return ImageEnhance.Color(ImageEnhance.Contrast(pic).enhance(1.15)).enhance(1.15)


before_img = s2.filterDate(*BASELINE).filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 10)).median()
(DATA / "closeups").mkdir(parents=True, exist_ok=True)
for old in (DATA / "closeups").glob("alert_*.jpg"):
    old.unlink()
for a in alerts[:MAX_CLOSEUPS]:
    region = ee.Geometry.Point([a["lon"], a["lat"]]).buffer(300).bounds()
    outline = ee.Image().paint(ee.FeatureCollection([ee.Feature(ee.Geometry(a["geometry"]))]), 1, 2)
    d0 = ee.Date(a["last_seen"])
    after_img = s2.filterDate(d0, d0.advance(1, "day")).mosaic()
    before = thumb(before_img.visualize(**VIS), region)
    after = thumb(after_img.visualize(**VIS).blend(outline.visualize(palette=["ff1a1a"])), region)
    pair = Image.new("RGB", (before.width * 2 + 6, before.height), "white")
    pair.paste(before, (0, 0))
    pair.paste(after, (before.width + 6, 0))
    pair = pair.resize((640, round(pair.height * 640 / pair.width)), Image.LANCZOS)
    name = f"alert_{a['id']}.jpg"
    pair.save(DATA / "closeups" / name, quality=84, optimize=True, progressive=True)
    a["closeup"] = f"data/closeups/{name}"
    print("saved", name)

# 6. Write the data and the RSS feed
made = dt.datetime.now(dt.timezone(dt.timedelta(hours=5, minutes=30))).replace(microsecond=0)
out = {
    "made": made.isoformat(),
    "baseline": "Feb–May 2026",
    "since": SINCE,
    "clear_days": kept,
    "clear_threshold": threshold,
    "days_checked": len(days),
    "rule": RULE,
    "alerts": alerts,
}
(DATA / "alerts.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def rfc822(day):
    d = dt.datetime.fromisoformat(day).replace(hour=12, tzinfo=dt.timezone.utc)
    return email.utils.format_datetime(d)


MARSH_WORDS = {"inside": "inside the protected marsh", "zone": "within 1 km of the protected marsh",
               "outside": "outside the 1 km zone"}
items = []
for a in alerts:
    title = f"{a['id']} · {a['place']} · {a['area_ha']:.2f} ha · {MARSH_WORDS[a['marsh']]}"
    text = (f"Water or marsh in the 2026 dry season; buildings or bare earth in {a['times_seen']} of "
            f"{a['clear_looks']} clear looks since June, first on {a['first_seen']}. {STATUS.capitalize()}.")
    items.append(f"<item><title>{escape(title)}</title><link>{SITE}?final=1#alert-{a['id']}</link>"
                 f"<guid isPermaLink=\"false\">neerkatti-{a['id']}-{a['first_seen']}</guid>"
                 f"<pubDate>{rfc822(a['first_seen'])}</pubDate><description>{escape(text)}</description></item>")
rss = ('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>'
       "<title>NEERKATTI alerts: Pallikaranai watershed, Chennai</title>"
       f"<link>{SITE}?final=1</link>"
       "<description>Possible new changes since the 2026 dry season: water or marsh that shows buildings or "
       "bare earth in clear Sentinel-2 images. Each needs a ground check; owners are never named.</description>"
       f"<lastBuildDate>{email.utils.format_datetime(made)}</lastBuildDate>"
       + "".join(items) + "</channel></rss>\n")
(DATA / "alerts.xml").write_text(rss, encoding="utf-8")
print(f"wrote {len(alerts)} alerts from {len(kept)} clear days; DONE")

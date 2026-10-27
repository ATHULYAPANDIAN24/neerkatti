"""The flagged patches as a spreadsheet: one row per patch, every number the map shows.

The GeoJSON has the outlines; this is the same data for people who work in Excel or
Google Sheets. No Earth Engine calls.

Usage:  .venv/Scripts/python analysis/open_data.py   (after context_layers.py)
Output: docs/app/data/patches.csv
"""
import csv
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "app" / "data"
YEARS = list(range(2018, 2027))

COLUMNS = ["rank", "area_ha", "lat", "lon", "place", "admin_area", "status", "checked_by_eye", "finding",
           "ai_confidence", "p_wet_2018", "p_built_2025", "p_built_2026", "built_since",
           "marsh_share", "marsh_distance_m", "wet_monsoon", "landsat_water_ever", "wc2021_built", "wc2021_wet"]

features = json.loads((DATA / "patches.geojson").read_text())["features"]
with open(DATA / "patches.csv", "w", newline="", encoding="utf-8") as f:
    out = csv.writer(f)
    out.writerow(COLUMNS + [f"built_share_{y}" for y in YEARS] + [f"wet_share_{y}" for y in YEARS])
    for feat in features:
        p = feat["properties"]
        row = ["" if p.get(k) is None else p[k] for k in COLUMNS]
        out.writerow(row + p["built_by_year"] + p["wet_by_year"])
print("wrote", len(features), "rows")

"""Web-sized copies of the patch close-ups, for the live map's popups.

Reads outputs/topten/patch_NN.jpg (made by topten_closeups.py) and
outputs/closeups/patch_NN.jpg (patch_details.py), drops the
title strip (the popup shows its own title) and saves a 640 px wide copy.
No Earth Engine calls and no new numbers: it only crops and resizes.

Usage:  .venv/Scripts/python analysis/app_closeups.py
Output: docs/app/data/closeups/patch_NN.jpg
"""
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCES = [ROOT / "outputs" / "topten", ROOT / "outputs" / "closeups"]
OUT = ROOT / "docs" / "app" / "data" / "closeups"
OUT.mkdir(parents=True, exist_ok=True)
TITLE_STRIP = 34   # height of the text strip topten_closeups.py draws above the pair
WIDTH = 640

for src in sorted(p for d in SOURCES for p in d.glob("patch_*.jpg")):
    pic = Image.open(src).convert("RGB")
    pic = pic.crop((0, TITLE_STRIP, pic.width, pic.height))
    pic = pic.resize((WIDTH, round(pic.height * WIDTH / pic.width)), Image.LANCZOS)
    pic.save(OUT / src.name, quality=84, optimize=True, progressive=True)
    print(src.name, pic.size)

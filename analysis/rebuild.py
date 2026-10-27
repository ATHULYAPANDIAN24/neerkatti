"""Rebuild everything the site shows, in order, then run the tests. Stops at the first failure.

Usage:  .venv/Scripts/python analysis/rebuild.py            all steps (needs Earth Engine, about 15 minutes)
        .venv/Scripts/python analysis/rebuild.py --from 5   start at step 5
        .venv/Scripts/python analysis/rebuild.py --list     show the steps
"""
import pathlib
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PY = sys.executable
STEPS = [
    ("change map, stats.json and top_spots.csv", [PY, "analysis/change_map.py"]),
    ("live map data: photos, AI labels, patches", [PY, "analysis/app_assets.py"]),
    ("zone or village, AI confidence, close-ups 11+", [PY, "analysis/patch_details.py"]),
    ("every dry season 2019-2025, year each patch was built over", [PY, "analysis/year_by_year.py"]),
    ("protected marsh, 2021 floods, Landsat and WorldCover", [PY, "analysis/context_layers.py"]),
    ("top-10 close-ups for the check by eye", [PY, "analysis/topten_closeups.py"]),
    ("web-sized close-ups (no Earth Engine)", [PY, "analysis/app_closeups.py"]),
    ("WebP map images at the map's shape (no Earth Engine)", [PY, "analysis/web_images.py"]),
    ("the patches as a spreadsheet (no Earth Engine)", [PY, "analysis/open_data.py"]),
    ("project page images", [PY, "analysis/demo_assets.py"]),
    ("consistency tests (Python)", [PY, "-m", "unittest", "discover", "-s", "tests"]),
    ("map logic tests (Node)", ["node", "--test", *sorted(str(p.relative_to(ROOT)) for p in (ROOT / "tests").glob("*.test.js"))]),
]


def main():
    if "--list" in sys.argv:
        for i, (what, cmd) in enumerate(STEPS, 1):
            print(f"{i}. {what:45s} {' '.join(pathlib.Path(c).name if c == PY else c for c in cmd)}")
        return
    start = int(sys.argv[sys.argv.index("--from") + 1]) if "--from" in sys.argv else 1
    for i, (what, cmd) in enumerate(STEPS, 1):
        if i < start:
            continue
        if cmd[0] == "node" and not shutil.which("node"):
            print(f"\n== {i}. {what}: skipped, Node.js is not installed")
            continue
        print(f"\n== {i}. {what}", flush=True)
        # the analysis scripts import their neighbours (osm_places, topten_closeups), so run them from analysis/
        cwd = ROOT / "analysis" if cmd[1:2] and cmd[1].startswith("analysis/") else ROOT
        args = [cmd[0], pathlib.Path(cmd[1]).name, *cmd[2:]] if cwd != ROOT else cmd
        if subprocess.run(args, cwd=cwd).returncode:
            sys.exit(f"step {i} failed: {what}")
    print("\nAll steps done.")


if __name__ == "__main__":
    main()

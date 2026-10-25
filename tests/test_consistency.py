"""Consistency checks for NEERKATTI.

The numbers on the live map, the project page and the README must match the
analysis outputs, the shipped data must be well-formed, and the web app must
not depend on a CDN. No Earth Engine login or network is needed.

Run:  .venv/Scripts/python -m unittest discover -s tests -v
"""
import base64
import csv
import hashlib
import json
import os
import pathlib
import re
import unittest
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = ROOT / "docs" / "app"
STATUS = "possible change, needs a ground check"
BOX = (80.17, 12.86, 80.26, 12.99)   # west, south, east, north
# Leaflet 1.9.4 as published on unpkg (the SRI hashes the app used before it was vendored)
LEAFLET_SRI = {"leaflet.js": "20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=",
               "leaflet.css": "p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="}


def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")


def text_of(html):
    """Roughly what a reader sees: no tags, scripts or styles, spaces collapsed."""
    html = re.sub(r"<(script|style)\b.*?</\1>", " ", html, flags=re.S)
    text = re.sub(r"<[^>]+>", " ", html).replace("&nbsp;", " ").replace("&amp;", "&")
    return re.sub(r"\s+", " ", text)


def load_data_js():
    js = read("docs/app/data/neerkatti_data.js")
    meta = re.search(r"\{meta: (\{.*?\}),\npatches: ", js, re.S).group(1)
    patches = re.search(r"\npatches: (\{.*\})\};\s*$", js, re.S).group(1)
    return json.loads(meta), json.loads(patches)


def points(coords):
    if isinstance(coords[0], (int, float)):
        yield coords
    else:
        for c in coords:
            yield from points(c)


class Data(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.geo = json.loads(read("docs/app/data/patches.geojson"))
        cls.features = cls.geo["features"]
        cls.props = [f["properties"] for f in cls.features]
        cls.meta, cls.js_patches = load_data_js()
        cls.stats = json.loads(read("outputs/stats.json"))

    def test_headline_matches_the_analysis(self):
        self.assertEqual(round(self.stats["wet_to_built_ha"], 1), self.meta["lost_ha"])
        self.assertEqual(self.meta["lost_ha"], 28.1)
        self.assertEqual(round(self.stats["wet_ha_before"], 1), self.meta["wet_ha_before"])

    def test_patch_count(self):
        self.assertEqual(len(self.features), self.meta["patch_count"])
        self.assertEqual(len(self.features), 36)

    def test_page_data_is_the_geojson(self):
        self.assertEqual(self.js_patches, self.geo)

    def test_ranked_by_area(self):
        self.assertEqual([p["rank"] for p in self.props], list(range(1, len(self.props) + 1)))
        areas = [p["area_ha"] for p in self.props]
        self.assertEqual(areas, sorted(areas, reverse=True))
        self.assertTrue(all(a >= 0.1 for a in areas), "patches under ~0.1 ha should have been dropped")

    def test_polygons_add_up_to_the_headline(self):
        # the headline is a pixel count; vector areas differ slightly at the edges
        self.assertAlmostEqual(sum(p["area_ha"] for p in self.props), self.meta["lost_ha"], delta=0.5)

    def test_every_patch_is_a_possible_change(self):
        for p in self.props:
            self.assertEqual(p["status"], STATUS, p["rank"])

    def test_inside_the_study_area(self):
        self.assertEqual(tuple(self.meta["box"]), BOX)
        for f in self.features:
            for lon, lat in points(f["geometry"]["coordinates"]):
                self.assertTrue(BOX[0] <= lon <= BOX[2] and BOX[1] <= lat <= BOX[3], f["properties"]["rank"])

    def test_suburb_level_names_only(self):
        allowed = {p["name"] for p in self.meta["places"]} | {"Sunnambu Kulathur", "Panaiyur"}
        keys = {"rank", "area_ha", "lat", "lon", "change", "status", "place", "site", "checked_by_eye", "finding"}
        for p in self.props:
            self.assertLessEqual(set(p), keys, "unexpected property")
            if p["place"] is not None:
                self.assertIn(p["place"], allowed)

    def test_top10_matches_top_spots_csv(self):
        with open(ROOT / "outputs" / "top_spots.csv", newline="", encoding="utf-8") as fh:
            rows = list(csv.DictReader(fh))[:10]
        for row, p in zip(rows, self.props[:10]):
            self.assertEqual(int(row["rank"]), p["rank"])
            self.assertAlmostEqual(float(row["area_ha"]), p["area_ha"], places=2)
            self.assertAlmostEqual(float(row["lat"]), p["lat"], places=4)
            self.assertAlmostEqual(float(row["lon"]), p["lon"], places=4)

    def test_top10_check_is_9_real_1_unclear(self):
        table = re.findall(r"^\| (\d+) \| ([^|]+) \| ([\d.]+) ha \|.*\| ([^|]+) \|$", read("outputs/topten_check.md"), re.M)
        self.assertEqual([int(r[0]) for r in table], list(range(1, 11)))
        results = [r[3].strip() for r in table]
        self.assertEqual(sum(r.startswith("real change") for r in results), 9)
        self.assertEqual(results.count("unclear"), 1)
        for (rank, place, area, result), p in zip(table, self.props[:10]):
            self.assertAlmostEqual(float(area), p["area_ha"], places=2)
            self.assertTrue(p["checked_by_eye"])
            self.assertTrue(place.startswith(p["place"]), rank)
            self.assertEqual("unclear" in result, "unclear" in p["finding"], rank)

    def test_top10_closeups_exist(self):
        for rank in range(1, 11):
            self.assertTrue((APP / "data" / "closeups" / f"patch_{rank:02d}.jpg").is_file(), rank)


class Pages(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.meta, cls.patches = load_data_js()
        cls.app_html = read("docs/app/index.html")
        cls.app = text_of(cls.app_html)
        cls.page_html = read("docs/index.html")
        cls.page = text_of(cls.page_html)
        cls.readme = read("README.md")
        cls.acres = round(cls.meta["lost_ha"] * 2.471)

    def test_app_numbers_before_javascript(self):
        # the page carries the real numbers in its HTML, so they show even without JavaScript
        stat = dict(re.findall(r'data-stat="(\w+)">([^<]+)<', self.app_html))
        self.assertEqual(stat["lost"], f"{self.meta['lost_ha']} ha")
        self.assertEqual(stat["count"], str(self.meta["patch_count"]))
        self.assertEqual(stat["acres"], f"≈{self.acres} acres flagged")
        self.assertIn("9 of 10", self.app)

    def test_project_page_numbers(self):
        self.assertIn(f"{self.meta['lost_ha']} ha", self.page)
        self.assertIn(f"≈{self.acres} acres", self.page)
        self.assertIn(f"{round(self.meta['wet_ha_before']):,} ha", self.page)
        self.assertIn("9 of 10", self.page)
        for stale in ("3 sites", "Not yet checked", "now built over"):
            self.assertNotIn(stale, self.page)

    def test_project_page_table_matches_the_data(self):
        rows = re.findall(r'<tr><td>(\d+)</td><td class="num">([\d.]+) ha</td><td>([^<]+)</td>', self.page_html)
        self.assertEqual(len(rows), 10)
        for rank, area, place in rows:
            p = self.patches["features"][int(rank) - 1]["properties"]
            self.assertAlmostEqual(float(area), p["area_ha"], places=2)
            self.assertEqual(re.sub(r" \([A-C]\)$", "", place), p["place"])

    def test_readme_numbers(self):
        for s in (f"{self.meta['lost_ha']} ha", f"{self.meta['patch_count']} patches", f"≈{self.acres} acres", "9 of the top 10"):
            self.assertIn(s, self.readme)

    def test_final_round_features_are_labelled_as_plans(self):
        self.assertIn("Final round", self.app)
        self.assertIn("Planned, not built yet", self.app)
        self.assertIn("FINAL ROUND", self.page)

    def test_deck_numbers(self):
        deck = pathlib.Path(os.environ.get("NEERKATTI_DECK", ROOT / "deck" / "FINAL_v6.pptx"))
        if not deck.is_file():
            self.skipTest("Round 1 deck not here (deck/ is kept out of git); set NEERKATTI_DECK to check it")
        with zipfile.ZipFile(deck) as z:
            text = " ".join(" ".join(re.findall(r"<a:t>([^<]*)</a:t>", z.read(n).decode("utf-8")))
                            for n in z.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", n))
        self.assertIn(f"{self.meta['lost_ha']} ha flagged", text)
        self.assertIn(f"{self.meta['patch_count']} patches", text)
        self.assertIn("9 real, 1 unclear", text)
        self.assertIn("9 of 10", text)


class StaticSite(unittest.TestCase):
    def test_leaflet_is_the_published_build(self):
        for name, sri in LEAFLET_SRI.items():
            digest = hashlib.sha256((APP / "vendor" / "leaflet" / name).read_bytes()).digest()
            self.assertEqual(base64.b64encode(digest).decode(), sri, name)

    def test_app_loads_no_script_from_a_cdn(self):
        html = read("docs/app/index.html")
        self.assertEqual(re.findall(r'<script[^>]+src="https?://', html), [])

    def test_local_files_exist(self):
        for rel in ("docs/app/index.html", "docs/index.html"):
            html = read(rel)
            base = (ROOT / rel).parent
            for ref in re.findall(r'(?:src|href)="([^"#?]+)', html):
                if re.match(r"(https?:|data:|mailto:)", ref):
                    continue
                target = base / ref
                if ref.endswith("/"):
                    target = target / "index.html"
                self.assertTrue(target.exists(), f"{rel} links to missing {ref}")


if __name__ == "__main__":
    unittest.main()

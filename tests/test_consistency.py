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
        # map labels, the Round 1 names, and the suburbs OpenStreetMap returned (outputs/places.json)
        osm = {re.sub(r"^Zone \d+ ", "", n) for n in json.loads(read("outputs/places.json")).values() if n}
        allowed = {p["name"] for p in self.meta["places"]} | {"Sunnambu Kulathur", "Panaiyur"} | osm
        keys = {"rank", "area_ha", "lat", "lon", "change", "status", "place", "site", "checked_by_eye", "finding",
                "p_wet_2018", "p_built_2025", "p_built_2026", "ai_confidence", "admin_area",
                "wet_by_year", "built_by_year", "built_since",
                "marsh_share", "marsh_distance_m", "wet_monsoon", "landsat_water_ever", "wc2021_built", "wc2021_wet"}
        for p in self.props:
            self.assertLessEqual(set(p), keys, "unexpected property")
            if p["place"] is not None:
                self.assertIn(p["place"], allowed)
            self.assertEqual(p["place"] is not None, p["rank"] <= 10, "only the top 10 carry a place name")
            # a Corporation zone ("Perungudi zone") or an OpenStreetMap village name
            self.assertIn(re.sub(r" zone$", "", p["admin_area"]), osm)

    def test_ai_confidence(self):
        # levels fixed in analysis/patch_details.py before the numbers were computed
        self.assertEqual(self.meta["confidence_levels"], {"high": 0.5, "medium": 0.35, "low": 0.0})
        for p in self.props:
            weakest = min(p["p_wet_2018"], p["p_built_2025"], p["p_built_2026"])
            level = "high" if weakest >= 0.5 else "medium" if weakest >= 0.35 else "low"
            self.assertEqual(p["ai_confidence"], level, p["rank"])

    def test_dynamic_world_images_per_season(self):
        per_year = self.meta["dw_images_by_year"]
        self.assertEqual(sorted(per_year), [str(y) for y in range(2016, 2027)])
        self.assertEqual(per_year["2018"], self.stats["dw_images_before"])
        self.assertEqual(per_year["2026"], self.stats["dw_images_after"])

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

    def test_every_patch_has_a_closeup(self):
        for p in self.props:
            self.assertTrue((APP / "data" / "closeups" / f"patch_{p['rank']:02d}.jpg").is_file(), p["rank"])

    def test_year_by_year(self):
        # analysis/year_by_year.py: every dry season 2018-2026, per patch and square by square
        years = self.meta["timeline_years"]
        self.assertEqual(years, list(range(2018, 2027)))
        for p in self.props:
            for k in ("wet_by_year", "built_by_year"):
                self.assertEqual(len(p[k]), len(years), (p["rank"], k))
                self.assertTrue(all(0 <= v <= 1 for v in p[k]), (p["rank"], k))
            # the rule: water or marsh in 2018, buildings in 2025 and 2026
            self.assertGreaterEqual(p["wet_by_year"][0], 0.9, p["rank"])
            self.assertEqual(p["built_by_year"][0], 0, p["rank"])
            self.assertGreaterEqual(min(p["built_by_year"][-2:]), 0.9, p["rank"])
            self.assertIn(p["built_since"], range(2019, 2026), p["rank"])
        since = self.meta["built_since_ha"]
        self.assertEqual(sorted(since), [str(y) for y in range(2019, 2026)])
        self.assertAlmostEqual(sum(since.values()), self.meta["lost_ha"], delta=0.06)

    def test_every_season_has_its_images(self):
        for key in [str(y) for y in self.meta["timeline_years"]] + ["monsoon"]:
            for name in (f"photo_{key}.jpg", f"photo_{key}.webp", f"photo_{key}_light.webp",
                         f"labels_{key}.png", f"labels_{key}.webp"):
                self.assertTrue((APP / "data" / name).is_file(), name)

    def test_marsh_and_flood_context(self):
        # analysis/context_layers.py
        boundary = json.loads(read("docs/app/data/marsh_boundary.geojson"))
        kinds = {f["properties"]["kind"]: f for f in boundary["features"]}
        self.assertEqual(set(kinds), {"marsh", "zone"})
        self.assertEqual(kinds["marsh"]["properties"]["area_ha"], self.meta["marsh"]["area_ha"])
        self.assertEqual(kinds["zone"]["properties"]["metres"], self.meta["marsh"]["zone_m"])
        self.assertEqual(self.meta["monsoon"]["date"], "2021-12-26")
        self.assertGreater(self.meta["monsoon"]["wet_ha"], self.meta["wet_ha_before"])
        for p in self.props:
            self.assertTrue(0 <= p["marsh_share"] <= 1 and p["marsh_distance_m"] >= 0, p["rank"])
            if p["marsh_share"] > 0:
                self.assertEqual(p["marsh_distance_m"], 0, p["rank"])
            self.assertTrue(p["wet_monsoon"] is None or 0 <= p["wet_monsoon"] <= 1, p["rank"])
            self.assertTrue(0 <= p["landsat_water_ever"] <= 1, p["rank"])

    def test_spreadsheet_matches_the_geojson(self):
        with open(APP / "data" / "patches.csv", newline="", encoding="utf-8") as fh:
            rows = list(csv.DictReader(fh))
        self.assertEqual(len(rows), len(self.props))
        for row, p in zip(rows, self.props):
            self.assertEqual(int(row["rank"]), p["rank"])
            self.assertAlmostEqual(float(row["area_ha"]), p["area_ha"], places=2)
            self.assertEqual(int(row["built_since"]), p["built_since"])
            self.assertEqual(float(row["built_share_2024"]), p["built_by_year"][6])


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
        self.assertIn(f"All {self.meta['patch_count']}", self.app)

    def test_new_numbers_before_javascript(self):
        # the year-by-year, marsh and flood numbers in the HTML match what app.js computes from the data
        props = [f["properties"] for f in self.patches["features"]]
        since = self.meta["built_since_ha"]
        recent = sum(since[y] for y in ("2023", "2024", "2025"))
        share = round(recent / self.meta["lost_ha"] * 100)
        near = sum(p["marsh_share"] > 0 or p["marsh_distance_m"] <= self.meta["marsh"]["zone_m"] for p in props)
        wet = [p for p in props if p["wet_monsoon"] is not None and p["wet_monsoon"] >= 0.5]
        stat = dict(re.findall(r'data-stat="([\w-]+)">([^<]+)<', self.app_html))
        self.assertEqual(stat["recent"], f"{share}%")
        self.assertEqual(stat["near-marsh"], f"{near} of {len(props)}")
        self.assertEqual(stat["flood-wet"], str(len(wet)))
        self.assertIn(f"{recent:.1f} ha, two-thirds of it, in the last three seasons", self.app)
        self.assertIn(f"{share}% of it since 2023", self.app)
        self.assertIn(f"{near} of {len(props)} in or within 1 km of the protected marsh", self.app)
        self.assertIn(f"at least {round(self.meta['monsoon']['wet_ha']):,} ha of the study area water or marsh, "
                      f"against {round(self.meta['wet_ha_before']):,} ha", self.app)
        self.assertIn(f"{len(wet)} of the flagged patches ({sum(p['area_ha'] for p in wet):.1f} ha)", self.app)
        self.assertIn(f"{share}% of it built over in the last three dry seasons", self.page)
        self.assertIn(f"{near} of {len(props)} patches in or within 1 km of the protected marsh", self.page)

    def test_why_these_years_matches_the_data(self):
        n = self.meta["dw_images_by_year"]
        self.assertIn(f"has {n['2018']} images of this area for Feb–May 2018, but only {n['2016']} in 2016 and {n['2017']} in 2017", self.app)

    def test_confidence_claim_about_the_top10(self):
        # "the unclear patch (#9) is medium, like six of the nine confirmed ones"
        top = self.patches["features"][:10]
        unclear = [f["properties"] for f in top if "unclear" in f["properties"]["finding"]]
        confirmed = [f["properties"] for f in top if "unclear" not in f["properties"]["finding"]]
        self.assertEqual([p["rank"] for p in unclear], [9])
        self.assertEqual(unclear[0]["ai_confidence"], "medium")
        self.assertEqual(sum(p["ai_confidence"] == "medium" for p in confirmed), 6)
        self.assertIn("like six of the nine confirmed ones", self.app)

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

    def test_project_page_timelapse_matches_the_data(self):
        # "Watch a marsh disappear": patch #1's seasons (analysis/patch_timelapse.py)
        p1 = self.patches["features"][0]["properties"]
        page = re.sub(r" ([,.:;])", r"\1", self.page)   # "<b>10.92 ha</b>," reads "10.92 ha,"
        fig = re.search(r'data-flip data-years="([^"]+)" data-built="([^"]+)" data-wet="([^"]+)"', self.page_html)
        self.assertEqual(json.loads(fig.group(1)), self.meta["timeline_years"])
        self.assertEqual(json.loads(fig.group(2)), p1["built_by_year"])
        self.assertEqual(json.loads(fig.group(3)), p1["wet_by_year"])
        for y in self.meta["timeline_years"]:
            self.assertTrue((ROOT / "docs" / "img" / "timelapse" / f"p01_{y}.jpg").is_file(), y)
        self.assertIn(f"{p1['area_ha']:.2f} ha, the biggest flagged patch: about {round(p1['area_ha'] * 2.471)} acres", page)
        self.assertIn(f"Built over since {p1['built_since']} by our cautious rule", page)
        self.assertEqual(p1["marsh_share"], 1)
        self.assertIn("Inside the protected marsh outline", page)
        self.assertIn(f"{round(p1['wet_monsoon'] * 100)}% water or marsh on 26 Dec 2021", page)
        self.assertIn(f"Checked by eye: {p1['finding'].lower()}", page)

    def test_readme_numbers(self):
        for s in (f"{self.meta['lost_ha']} ha", f"{self.meta['patch_count']} patches", f"≈{self.acres} acres", "9 of the top 10"):
            self.assertIn(s, self.readme)

    def test_model_card_numbers(self):
        # docs/MODEL_CARD.md: the results table and the failure modes match the data
        card = read("docs/MODEL_CARD.md")
        props = [f["properties"] for f in self.patches["features"]]
        levels = {k: sum(p["ai_confidence"] == k for p in props) for k in ("high", "medium", "low")}
        cut = self.meta["confidence_levels"]
        for s in (f"**{self.meta['lost_ha']} ha**", f"**{self.meta['patch_count']} patches**", "**9 of the top 10**",
                  f"{levels['high']} high, {levels['medium']} medium and {levels['low']} low",
                  f"high from {cut['high']:.2f}, medium from {cut['medium']:.2f}",
                  "**86.7%** user's accuracy", "**36.8%** producer's accuracy",
                  "the unclear patch (#9) is medium, like six of the nine confirmed ones",
                  "(#6 and #7) are earth and debris filling", "possible change that needs a ground check"):
            self.assertIn(s, card)
        self.assertEqual(self.meta["monsoon"]["date"], "2021-12-26")
        self.assertIn("26 Dec 2021", card)
        for rank in (6, 7):
            self.assertIn("filled with earth", props[rank - 1]["finding"])

    def test_judges_reach_everything_in_one_click(self):
        # the submitted URL is the live map: its intro and its panel each link every document a judge needs
        rows = re.findall(r'<nav class="[^"]*\bjudges\b[^"]*" aria-label="For judges">(.*?)</nav>', self.app_html, re.S)
        self.assertEqual(len(rows), 2)
        for row in rows:
            for href in ('href="../#try"', 'href="../"', '/neerkatti#readme"', '/blob/main/docs/FINAL_ROUND_PLAN.md"',
                         '/blob/main/docs/MODEL_CARD.md"', 'href="data/patches.csv"'):
                self.assertIn(href, row)

    def test_who_it_is_for_matches_the_project_page(self):
        # the map's feasibility card and the project page's #use section tell the same plan
        app = re.search(r'<section class="chart-card biz-card".*?</section>', self.app_html, re.S).group(0)
        page = re.search(r'<section id="use">.*?</section>', self.page_html, re.S).group(0)
        for html in (app, page):
            for s in ("Who it is for, and how it pays", "Free for citizens", "Paid dashboard", "agencies, NGOs and insurers",
                      "CSR", "OMR corridor", "Now: ₹0", "Final round, 4–5 Nov", "Chennai pilot", "Tamil Nadu"):
                self.assertIn(s, text_of(html))
            self.assertIn("/blob/main/docs/FINAL_ROUND_PLAN.md", html)

    def test_readme_counts_the_tests(self):
        # "39 consistency tests and 18 map-logic tests": the counts in the README are the real ones
        py = len(re.findall(r"^    def test_", read("tests/test_consistency.py"), re.M))
        js = len(re.findall(r"^test\(", read("tests/core.test.js"), re.M))
        claim = f"{py} consistency tests and {js} map-logic tests"
        self.assertTrue(claim in self.readme, f"README should say: {claim}")

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

    def test_offline_copy_lists_real_files(self):
        sw = read("docs/app/sw.js")
        files = re.findall(r"'([^']+)'", re.search(r"PRECACHE = \[(.*?)\];", sw, re.S).group(1))
        self.assertIn("data/neerkatti_data.js", files)
        for f in files:
            self.assertTrue((APP / (f if f != "./" else "index.html")).is_file(), f)
        manifest = json.loads(read("docs/app/manifest.webmanifest"))
        for icon in manifest["icons"]:
            self.assertTrue((APP / icon["src"]).is_file(), icon["src"])

    def test_offline_copy_has_every_season(self):
        # the year player and "ask the AI about any spot" work offline: every season's light photo and labels
        sw = read("docs/app/sw.js")
        seasons = re.findall(r"'([^']+)'", re.search(r"SEASONS = \[(.*?)\];", sw, re.S).group(1))
        meta, _ = load_data_js()
        self.assertEqual(seasons, [str(y) for y in meta["timeline_years"]] + ["monsoon"])
        for key in seasons:
            for name in (f"photo_{key}_light.webp", f"labels_{key}.webp"):
                self.assertTrue((APP / "data" / name).is_file(), name)

    def test_label_images_are_lossless_at_the_map_shape(self):
        # "ask the AI about any spot" reads a label from the exact colour of one pixel,
        # so the label images must stay lossless (VP8L) and all the same size
        sizes = set()
        for path in sorted((APP / "data").glob("labels_*.webp")):
            head = path.read_bytes()[:25]
            self.assertEqual((head[:4], head[8:12], head[12:16]), (b"RIFF", b"WEBP", b"VP8L"), path.name)
            bits = int.from_bytes(head[21:25], "little")
            sizes.add((1 + (bits & 0x3FFF), 1 + ((bits >> 14) & 0x3FFF)))
        self.assertEqual(sizes, {(1039, 1540)})

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

    def test_github_links_point_to_files_in_the_repo(self):
        # links to files on GitHub (the 24-hour plan, the model card, the top-10 notes) must not break
        for rel in ("docs/app/index.html", "docs/index.html", "README.md", "docs/MODEL_CARD.md", "docs/FINAL_ROUND_PLAN.md"):
            for path in re.findall(r"github\.com/ATHULYAPANDIAN24/neerkatti/blob/main/([^\"'#?)\s>]+)", read(rel)):
                self.assertTrue((ROOT / path).is_file(), f"{rel} links to missing {path}")

    def test_news_links_point_to_an_article(self):
        # a link that stops at a date (".../2026/Oct/13/") opens no article
        for rel in ("docs/app/index.html", "docs/index.html", "README.md", "docs/MODEL_CARD.md"):
            for url in re.findall(r"https?://[^\"'\s)<>]+", read(rel)):
                self.assertNotRegex(url, r"/\d{4}/\w{3}/\d{1,2}/?$", f"{rel}: {url}")

    def test_readme_local_links_exist(self):
        readme = read("README.md")
        refs = re.findall(r"\]\(([^)#\s]+)(?:#[^)]*)?\)", readme) + re.findall(r'<img src="([^"]+)"', readme)
        for ref in refs:
            if not re.match(r"https?:", ref):
                self.assertTrue((ROOT / ref).exists(), f"README.md links to missing {ref}")

    def test_model_card_links_exist(self):
        card = ROOT / "docs" / "MODEL_CARD.md"
        for ref in re.findall(r"\]\(([^)#]+)(?:#[^)]*)?\)", card.read_text(encoding="utf-8")):
            if not re.match(r"https?:", ref):
                self.assertTrue((card.parent / ref).exists(), f"MODEL_CARD.md links to missing {ref}")


if __name__ == "__main__":
    unittest.main()

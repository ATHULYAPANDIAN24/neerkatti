# NEERKATTI

An AI water-keeper for Chennai's wetlands. It catches illegal filling of lakes and marshes from free satellite data, confirms it with photos from citizens, and turns it into a ready-to-send complaint.

DEXATHON 2026 · Track: Sustainability Development · Team: _(your team name)_

![Slide 3](outputs/slide3_neerkatti.png)

## What v1 finds (first real run, 15 Oct 2026)

- **Study area:** Pallikaranai watershed, box `[80.17, 12.86, 80.26, 12.99]` (lon/lat).
- **Dates:** the same dry season (Feb–May) in 2018 and 2026.
- **Water + marsh:** 1,628 ha in 2018 and 1,702 ha in 2026. The total is roughly the same; the 2026 dry season was wetter.
- **Loss (strict count):** 28.1 ha (≈69 acres) of 2018 water/marsh is built-up in **both** 2025 and 2026.
- **Biggest sites, all checked by eye on the before/after photos** (`outputs/closeups.png`):
  - **A · Perungudi:** about 11 ha of marsh is now cleared and built-up.
  - **B · Nookampalayam:** about 4.6 ha of 2018 water is now under a housing block.
  - **C · Perumbakkam:** a strip of marsh edge about 1 ha in size has been filled.
  - **D · Sunnambu Kulathur, E · Panaiyur:** smaller changes, not yet checked.
- **Status of every alert:** "possible change, needs a ground check". Nothing here names or accuses any owner.

## How it works

1. **Satellite labels.** Google/WRI *Dynamic World* labels every 10 m square of Sentinel-2 imagery: water, trees, grass, marsh, crops, shrubs, buildings, bare soil.
2. **Season summary.** For each year, take the most common label for each square during Feb–May.
3. **Change rule (v1).** A square counts as lost if:
   - it was water or marsh in 2018,
   - it is **not** on the outer ~20 m rim of a water body (edge squares mix water with nearby buildings and caused false alarms in v0), and
   - it is labelled buildings in **both** 2025 and 2026.
4. **Noise filter.** Drop patches smaller than about 0.1 ha.

## Run it

**Option A, in the browser.** Paste `earthengine/neerkatti_v1.js` into <https://code.earthengine.google.com> and press **Run**. You get a 2018 | 2026 wipe slider, a legend, and the numbers.

**Option B, from Python.** This saves the images and the list of spots.

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -c "import ee; ee.Authenticate()"
.venv/Scripts/python analysis/change_map.py      # stats.json, top_spots.csv, maps
.venv/Scripts/python analysis/spot_closeups.py   # closeups.png (before/after per spot)
.venv/Scripts/python analysis/make_slide.py      # slide3_neerkatti.png
```

The scripts use the Earth Engine Cloud project `dexathon-athulya` (non-commercial, Community tier).

## Roadmap

- [x] v0/v1: change map + top spots + slide image
- [ ] Round 2 web app: map + year slider + top-10 changed spots (deploy by 29 Oct)
- [ ] Final (24 h): new-change alerts, citizen photo check, complaint PDF, monsoon radar mode

## Sources

- Dynamic World V1: `GOOGLE/DYNAMICWORLD/V1` (Google & World Resources Institute)
- Sentinel-2: `COPERNICUS/S2_HARMONIZED` (ESA Copernicus)
- Place names: OpenStreetMap Nominatim

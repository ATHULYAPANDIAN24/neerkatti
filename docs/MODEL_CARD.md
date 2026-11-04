# NEERKATTI: model and data card

One page on what the AI in NEERKATTI is, what our code adds to it, how well it works and what it must not be used for. Final-round prototype, DEXATHON 2026, Team Sternritters (DEX26302). Live map: <https://athulyapandian24.github.io/neerkatti/app/?final=1>.

## In one paragraph

NEERKATTI flags 2018 water and marsh in Chennai's Pallikaranai watershed that the AI labels as buildings in both 2025 and 2026. We did not train a model. The AI is **Dynamic World**, Google and the World Resources Institute's deep-learning model, which labels every 10 m square of every Sentinel-2 image. Our code turns those labels into seasons, patches, a confidence level, the year each patch was built over and context from other maps. A flag is a **possible change that needs a ground check**, never proof. The optional citizen photo check, added in the final, uses a second AI, Google's Gemini 2.5 Flash-Lite ([below](#the-second-ai-the-citizen-photo-check)).

## Data

| Data | What it gives us | Source and terms |
|---|---|---|
| **Sentinel-2** (`COPERNICUS/S2_HARMONIZED`) | Satellite photos, 10 m, every few days; the Feb–May median of each year 2018–2026 is the photo on the map | European Space Agency, Copernicus; free and open |
| **Dynamic World V1** (`GOOGLE/DYNAMICWORLD/V1`) | The AI labels: water, trees, grass, flooded vegetation (marsh), crops, shrub and scrub, built, bare, snow, with a probability for each, for every 10 m square of every Sentinel-2 image | Google and World Resources Institute; CC BY 4.0 |
| **OpenStreetMap** | The protected-marsh outline (relation 15046539, tagged Reserve Forest and Ramsar site), place names from Nominatim, the base map | © OpenStreetMap contributors; ODbL. Volunteer-mapped, **not the official survey** |
| **JRC Global Surface Water 1.4** (`JRC/GSW1_4/GlobalSurfaceWater`) | Where Landsat saw open water at some time in 1984–2021: a second opinion on "this was water" | EC Joint Research Centre and Google; free with credit |

Study area: 80.17–80.26°E, 12.86–12.99°N. Everything is processed in Google Earth Engine (non-commercial) by the Python scripts in [`analysis/`](../analysis/), and the map shows the exported files: no server, and no API key in the site. The one live API call is the optional photo check, below.

## What the AI does, and what our code adds

**Dynamic World (the AI):** a deep-learning model that reads each Sentinel-2 image and gives every 10 m square a probability for each of the nine land-cover labels. It was trained and validated by its authors, not by us (Brown et al. 2022).

**Our code, on top of it:**

1. **Season summary.** For each year, the most common label of each square in the Feb–May dry season, when there are fewest clouds.
2. **Change rule v1.** A square is flagged if it was water or marsh in 2018, is not on the outer ~20 m rim of a 2018 water body (edge squares mix water and roofs), and is labelled built in **both** 2025 and 2026, so one bad season is not enough.
3. **Patches.** Groups of fewer than 10 connected squares (~0.1 ha) are dropped as noise; the rest become polygons, ranked by area.
4. **AI confidence per patch.** The mean Dynamic World probability of water or marsh in 2018 and of built in 2025 and in 2026; the weakest of the three sets the level: high from 0.50, medium from 0.35, low below. Thresholds were fixed before the numbers were computed.
5. **Year built over.** The first dry season from which a square is labelled built in every season through 2026. A square that flips back to marsh for one season counts only from after the flip, so the year is a cautious one.
6. **Context.** Overlap with the OpenStreetMap marsh outline and our own 1 km buffer of it, the labels on 26 Dec 2021 after the floods, and the JRC Landsat water history.
7. **Ask the AI about any spot.** In the browser, the map reads the lossless label images it already shows and gives one square's label in every season, with what the rule makes of it.
8. **Check by eye.** The top 10 patches were compared on 2018 | 2026 close-ups and on current high-resolution imagery ([`outputs/topten_check.md`](../outputs/topten_check.md)).
9. **Tests.** [`tests/`](../tests/) checks on every push that each number on the map, the project page, the README and this card matches the data.

## The second AI: the citizen photo check

Built in the final; optional, and the one part that needs a connection.

| | |
|---|---|
| **Model** | Google's Gemini 2.5 Flash-Lite (`gemini-2.5-flash-lite`) through the Gemini API. Not deprecated on Google's deprecations page (checked 5 Nov 2026) |
| **Input** | One photo a person takes at a patch or alert. The phone shrinks it to at most 1280 px and re-draws it, which drops its GPS and camera data. Location is sent only if the person taps to add it, and only to measure the distance to the site |
| **Output** | One of five answers about the ground: construction, dumping, sewage, no change or unclear, with a confidence from 0 to 1 and one sentence. The prompt tells it to answer "unclear" rather than guess, and never to describe people, faces, number plates or names |
| **Where it runs** | Our Cloudflare Worker ([`serverless/photo-check`](../serverless/photo-check/src/index.js)) holds the API key as a secret, answers only the NEERKATTI site, allows 8 checks a minute per visitor and stores nothing. It calls Google from eastern North America, because Gemini refused Cloudflare's Singapore location |
| **How well it works** | Not yet measured on Pallikaranai photos. It answers in about 3 seconds. Treat it as a first reading: the result still says it is a possible change that needs a ground check |
| **Privacy** | NEERKATTI keeps no photo and no location. On Google's free tier, Google may use what is sent to improve its products, and human reviewers may read it, so people are asked to leave faces out of the photo |

## Results

| Measure | Value |
|---|---|
| 2018 water and marsh flagged as built over | **28.1 ha**, in **36 patches** of at least ~0.1 ha |
| Check by eye of the top 10 | **9 of the top 10** show building, paving or filling; 1 is unclear |
| AI confidence, all 36 patches | 8 high, 18 medium and 10 low |
| Dynamic World's own accuracy (Brown et al. 2022, Tables 7–8) | **86.7%** user's accuracy for built-up land; **36.8%** producer's accuracy for marsh (flooded vegetation) |

What the accuracy figures mean here: when Dynamic World says "built", it is usually right, so a flag is worth a look. But it finds only about a third of the marsh that is really there, so a lot of 2018 marsh never enters the rule, and **28.1 ha is a cautious count, not the full loss**. AI confidence is the model's certainty, not a measure of truth: the unclear patch (#9) is medium, like six of the nine confirmed ones.

## Known failure modes

- **Labels flicker between seasons.** Some patches read as buildings one season and marsh the next. The map shows each season as it is; the "built over since" year only counts unbroken runs.
- **Missed marsh.** Marsh is the label Dynamic World misses most (36.8% producer's accuracy), so losses of marsh it never saw are not flagged.
- **Filling is labelled as built.** Two of the nine confirmed patches (#6 and #7) are earth and debris filling, not buildings. That is still the change NEERKATTI is meant to catch, but the label is wrong.
- **Patch #9 is unclear.** Change is visible at the marsh edge, but the imagery does not show its cause.
- **The flood image is partly cloudy.** The 26 Dec 2021 image has about 17% of the study area under cloud; those squares stay unlabelled.
- **10 m squares are coarse.** Small dumping, a single building plot or a narrow drain can be missed, and squares at a lake edge mix water with roofs (the 20 m rim rule removes most of these).
- **Dry seasons only.** Monsoon clouds hide the ground for months. A Sentinel-1 radar test on 6 Dec 2015 failed over the marsh, so radar is still to come, not a working layer.
- **The photo check can be wrong.** It is one AI reading of one photo, its accuracy here has not been measured, and it needs a connection.
- **One study area.** The rule has only been run and checked on the Pallikaranai watershed.

## Intended use

- **A screening tool:** where to look first, and when the change happened. Residents' associations, NGOs, journalists, students and agencies can use it to choose which spots to check on the ground.
- **Open data for others to check:** every patch, with every season's shares, is in [`patches.csv`](app/data/patches.csv) and [`patches.geojson`](app/data/patches.geojson).

## Out of scope

- **Not legal proof.** A flag says the AI's land-cover label changed. It does not say anything was illegal, and it is not a survey.
- **Not for naming owners.** NEERKATTI never names owners, builders, companies or buildings, and the data must not be used to target a person.
- **Not the official boundary.** The marsh outline is OpenStreetMap's, not the official Ramsar or Reserve Forest survey, and our 1 km zone is our own buffer of it.
- **Not for single plots** smaller than about 0.1 ha, and not for other areas until the rule has been checked there.

## Ethics

- Every patch is labelled a **possible change that needs a ground check**, on the map, in the data and in every popup.
- Place names stop at suburb, village or Corporation zone.
- All inputs are public and free. The site has no analytics and sets no cookies; "near me" uses the location only inside the browser.
- The photo check keeps nothing. The phone drops the photo's GPS data before sending, and location is shared only if the person taps to add it.
- We report the cautious number: the strict rule (the 20 m rim, two seasons in a row) removed the first version's false alarms along lake shores, and a patch must be built over in both 2025 and 2026.

## Reference

Brown, C.F. et al. (2022). *Dynamic World, near real-time global 10 m land use land cover mapping.* Scientific Data 9, 251. <https://www.nature.com/articles/s41597-022-01307-4>

Method in full: [README, How it works](../README.md#how-it-works). Final-round plan: [`FINAL_ROUND_PLAN.md`](FINAL_ROUND_PLAN.md).

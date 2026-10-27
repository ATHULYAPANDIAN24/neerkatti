# NEERKATTI: the 24-hour final round plan

DEXATHON 2026 final: **Wed 4 Nov 10:30 → Thu 5 Nov 10:30**, Sathyabama (Dr. Remibai Jeppiaar Auditorium, Hall 01). Team Sternritters (DEX26302), four people.

The rules say *major feature development and integration must take place within the 24-hour window*. So the four final-round features below are **not in the Round 2 code**. Round 2 only leaves clean places to plug them in (see [Extension points](#extension-points-already-in-the-round-2-code)).

## What we build in the 24 hours

| Priority | Feature | What a judge sees | Where the code goes |
|---|---|---|---|
| **P0** | **Alerts for new changes**, first inside the protected marsh's 1 km zone | New red-orange "alert" patches on the map, an alert list, and an RSS feed anyone can follow | `analysis/new_changes.py` → `docs/app/data/alerts.json`; `docs/app/final/alerts.js` |
| **P0** | **Complaint letter in Tamil and English** | From any patch: a dated letter with the 2018 \| 2026 close-up, the facts and a request for inspection, saved as PDF | `docs/app/final/complaint.js` + a print stylesheet |
| **P1** | **Citizen photo check by a vision model** | From any patch: take a photo, and the model says *construction / dumping / sewage / no change / unclear*, plus how far the photo is from the patch | `docs/app/final/report.js` + one small serverless function |
| **P2** | **Sentinel-1 radar through monsoon clouds** | Per patch: a radar line that keeps watching through the monsoon, when Sentinel-2 sees only cloud | `analysis/radar.py` → a field in `alerts.json` and the patch card |

P0 must work by the first checkpoint. P1 is the "AI wow". P2 is a stretch: it is only shown if it works, because our Round 2 test on 6 Dec 2015 showed that a plain water threshold fails over the marsh (see the README).

## The team

Names are assigned at hour 0, by skill. One person per area, so nobody edits the same file.

| Role | Owns | Also |
|---|---|---|
| **A · Lead and data** | `analysis/new_changes.py`, `alerts.json`, radar (P2) | Keeps the time, runs the checkpoints, gives the pitch |
| **B · Web** | `final/alerts.js`, loading the `final/*.js` files, offline copy (`sw.js`), tests | Merges, deploys to GitHub Pages |
| **C · AI services** | The serverless function, the vision model prompt and its JSON answer, `final/report.js` | Keeps the API key out of the repo |
| **D · Letters and story** | `final/complaint.js`, print stylesheet, Tamil and English wording | README, demo video, slides, judge Q&A sheet |

## Hour by hour

| Time | A · Lead and data | B · Web | C · AI services | D · Letters and story |
|---|---|---|---|---|
| **10:30–11:00** | Kick-off: read this plan together, create one branch per person, run both test suites, check the live map works offline. | | | |
| 11:00–12:30 | Find the latest clear Sentinel-2 / Dynamic World images since the 2026 dry season; count them | Empty `final/` files load after `app.js`; feature switch `?final=1` | Serverless function returns a fixed answer; front end calls it | Letter template (English) from patch data; print stylesheet |
| 12:30–14:00 | New-change rule on the latest images; first `alerts.json` | Alert layer and list from a hand-made `alerts.json` | Real vision model call with a strict JSON answer; 5 test photos | Tamil template (written and checked by a Tamil speaker); Noto Sans Tamil |
| **14:00–14:30** | **Checkpoint 1** (lunch): every P0 path works end to end with real or sample data. Anything stuck switches to its fallback now. | | | |
| 14:30–17:00 | Alerts inside the 1 km zone first; dates; RSS `alerts.xml` | Real `alerts.json`; "alert" pill in the list; offline copy | `final/report.js`: photo picker, shrink to 1 MB, distance from the patch, result card | Close-up and dates in the letter; "Save as PDF" on a phone |
| 17:00–19:00 | Radar (P2) on the top 10 patches: a VV/VH line per patch | Tests for the new data; keyboard and phone checks | Errors: no network, no GPS, model timeout, a photo of nothing | README "Final round" section; slides outline |
| **19:00–19:30** | **Checkpoint 2**: everything merged behind `?final=1` and deployed to GitHub Pages; both test suites pass. | | | |
| 19:30–23:00 | Check every alert by eye on the images; write down what each shows | Polish; axe in light and dark, desktop and phone | Prompt tuning on the 5 test photos; cost per call written down | Demo script; record a first backup video |
| 23:00–02:00 | Feature freeze for P2 | Bug fixes only | Bug fixes only | Q&A sheet with the answers below |
| 02:00–05:00 | Two sleep while two test on real phones; then swap. | | | |
| 05:00–08:00 | Final data run; numbers on every page match (tests) | Remove `?final=1` once all is stable | Rate limit; key safe in the function only | Final backup video; slides done |
| **08:00** | **Code freeze.** Only fixes to things that are broken. | | | |
| 08:00–10:30 | Rehearse the 3-minute demo three times, with the phone hotspot as the network; time it. | | | |

If the organisers announce mentor or judge rounds at other times, move the checkpoints to just before them.

## Risks and fallbacks

| Risk | What we see | Fallback |
|---|---|---|
| Venue Wi-Fi is poor | Map slow or blank | The map already works offline once opened (every season is saved). Use a phone hotspot. Keep the backup video on two laptops. |
| No clear Sentinel-2 image since May (monsoon clouds over Chennai in Oct–Nov) | `new_changes.py` finds few or no images | Use the latest clear image there is and say its date. This is exactly why radar is on the list; if radar is not ready, say so honestly. |
| Earth Engine slow or over quota | Script runs for minutes | Keep the study box; run once early in the night and commit the result; never run it live on stage. |
| Vision API key, quota or latency fails | Photo check spins or errors | Show the error state we built; then a recorded answer clearly marked "recorded earlier". Never fake a live result. |
| Tamil text breaks in the PDF (conjuncts and vowel signs drawn wrong) | Broken Tamil letters | Use the browser's own "Save as PDF" from an HTML page with Noto Sans Tamil, which shapes Tamil correctly, instead of a PDF library. |
| Two people edit `app.js` | Merge conflicts | Everything new lives in `docs/app/final/*.js` and talks to the map only through `window.NEERKATTI_API`. |
| GitHub Pages takes minutes to update | Old version on the projector | Deploy at each checkpoint; demo from `localhost` if a late fix has not gone live. |
| An alert is a false alarm | A judge spots it | Every alert says "possible change, needs a ground check"; we check each by eye before the demo and say which ones are unclear. |
| Running out of time | P1 or P2 unfinished | P0 first, by checkpoint 1. An unfinished P2 is left out of the demo, not shown half-done. |
| Tired team at 4 am | Mistakes | Sleep in shifts (02:00–05:00); no merges without the tests passing. |

## Data formats

**`docs/app/data/alerts.json`** (written by `analysis/new_changes.py`):

```json
{
  "made": "2026-11-04T18:30:00+05:30",
  "baseline": "Feb–May 2026",
  "latest_images": ["2026-10-21", "2026-10-31"],
  "rule": "water or marsh in the 2026 dry season, buildings or bare soil in the latest clear images",
  "alerts": [
    {
      "id": "A1",
      "lat": 12.95, "lon": 80.22,
      "area_ha": 0.42,
      "marsh": "inside",
      "first_seen": "2026-10-21",
      "times_seen": 2,
      "radar": null,
      "status": "possible change, needs a ground check",
      "geometry": {"type": "Polygon", "coordinates": []}
    }
  ]
}
```

`marsh` is `inside`, `zone` or `outside`, as `core.marshStatus` already returns for the Round 2 patches; `radar` is filled by P2 or left `null`.

**Photo check** (`final/report.js` → serverless function → vision model):

- Request: `{rank, lat, lon, taken_at, photo}`. `photo` is a JPEG shrunk to at most 1 MB with its metadata removed; the location is sent separately and only if the user allows it.
- Answer: `{category, confidence, reason, distance_m, model}`, where `category` is one of `construction`, `dumping`, `sewage`, `no_change` or `unclear`. The model is told to answer `unclear` rather than guess, and never to describe people.
- The function stores nothing. The API key lives only in the function's settings, never in this repository.

**Complaint letter** (`final/complaint.js`), filled from a patch's own data: place (area level only), coordinates, area, the year it was built over, marsh status, the 2018 \| 2026 close-up, and the dates of the images. It asks the relevant authority for an inspection; it never names an owner and never says anything is illegal.

## Extension points already in the Round 2 code

`docs/app/app.js` ends by publishing `window.NEERKATTI_API` (version 1). Final-round files load after it and use only this:

| Call | What it does |
|---|---|
| `api.map`, `api.data`, `api.core`, `api.seasons` | The Leaflet map (add layers to it), the map's data, the helpers in `core.js`, the season keys |
| `api.addPatchAction({id, label, run(patch, api), when(patch)})` | Adds a button to every patch's card, for example "Report what you see" or "Draft a complaint" |
| `api.on('select', fn)`, `api.on('season', fn)` | Runs `fn` when a patch is opened or a season is shown |
| `api.pick(rank)`, `api.showSeason(year)`, `api.askSpot(lat, lon)` | Opens a patch, shows a season, asks the AI about a spot |
| `api.readSpot(lat, lon)` | The AI's label at a spot in every season, without showing anything |
| `api.say(text)` | A short message on the map |

On the analysis side, `analysis/year_by_year.py` already has the pieces an alert script needs: `land_cover(year)`, the cloud filter, and the v1 rule written out next to `clean()`. `new_changes.py` reuses them with the latest images in place of 2025 and 2026.

## The 3-minute demo

1. **The problem (20 s).** Pallikaranai, a Ramsar wetland; the 96% cut to the interim buffer in October 2026; the High Court hearing on 11 Nov.
2. **What the AI sees (40 s).** Live map: the tour's first steps, then tap a spot and show its labels season by season.
3. **Proof (40 s).** Patch #1: *Watch it 2018–2026*. Inside the protected marsh outline; 93% water or marsh after the 2021 floods; buildings by 2025. 28 of 36 patches are in or near the marsh.
4. **New in the final (60 s).** An alert inside the 1 km zone → a photo check on a phone → a complaint letter saved as PDF, in Tamil and English.
5. **Why it can last (20 s).** ₹0 data, no server for the map, open data; free for citizens, a paid dashboard for agencies and CSR lake adoption.

## Judge questions to be ready for

- **"How accurate is the AI?"** Dynamic World's own validation: 86.7% user's accuracy for built-up land, but only 36.8% producer's accuracy for marsh, so 28.1 ha is a cautious count. We checked the top 10 by eye: 9 show real change, 1 is unclear. Every patch says it needs a ground check.
- **"Is this your AI or Google's?"** The land labels are Google and WRI's Dynamic World model. Ours is everything around it: the change rule with the lake-rim and two-year checks, the AI confidence from the model's own probabilities, the year each patch was built over, the marsh and flood context, the spot check, and in the final the alerts, the vision photo check and the letters.
- **"Why not ISRO's atlas or TN-SWIP?"** The atlas compares snapshots ten years apart; we look at every dry season. TN-SWIP sends alerts to officials; NEERKATTI is open to anyone, with open data.
- **"What does it cost to run for all of Chennai?"** The data is free. The map needs no server. A city-wide run is the same code over a bigger box in Earth Engine; beyond non-commercial use it needs a commercial Earth Engine licence or self-hosting, while Sentinel data stays free.
- **"Could this be used to target people?"** We never name owners, only area-level places; every patch is a possible change that needs a ground check; the photo check stores nothing.

## Before the final (preparation, not features)

Ask the coordinators what preparation is allowed. Things that are not feature development:

- Accounts: a serverless host (Cloudflare Workers or Vercel, free tier) and a vision model API key; test that a key works.
- Laptops charged; Node and the Python `.venv` installed; `git pull`; both test suites pass.
- A phone hotspot with data; the live map opened once on every phone (so the offline copy is there).
- The backup video of the Round 2 map on two laptops and a USB stick.
- This plan printed, one copy per person.

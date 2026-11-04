# NEERKATTI: Round 3 Team Guide and Script

**DEXATHON 2026 final · Team Sternritters (DEX26302) · written 4 Nov 2026, 22:30 IST.**
Every number here was checked tonight against the repo, the live site and the web. If a number is
not in this file, say "I'd have to check that." Never guess.

Live: **https://athulyapandian24.github.io/neerkatti/app/?final=1**
(The plain `/app/` link shows the old Round 2 map on any phone that has never opened `?final=1`.)

---

## 0. Read this first

Round 3 is **not a pitch**. It is marked on six things:

1. **Understanding & prioritisation:** did we understand the feedback and rank it?
2. **Measurable quality improvement:** can we show, with numbers, what got better?
3. **High-priority improvements:** did we build what the mentors asked for?
4. **Testing & validation:** did we prove the changes work?
5. **Weakness & risk resolution:** did we close our weak spots and risks?
6. **Ownership, adaptability & justification:** do we own our decisions and explain them?

Every sentence on stage should answer one of these six. Anything else is wasted time.

**Feedback we got.** Round 1: 7/10 on problem and impact. Round 2: **4/10 on technical
architecture.** The judge interrupted and said *"the answer should be clear."*
→ **Before you go on, write any other mentor comments into §2. Do not invent any.**

**Our answer in one line:**
> "You said our architecture and our answers weren't clear. Now the architecture is one picture
> in the app, every number comes from the data, we checked every claim, and we answer in one
> sentence."

---

## 1. Rubric map: what to say and what to point at

| # | Criterion | Say (one line) | Point at |
|---|---|---|---|
| 1 | Understanding & prioritisation | "We ranked feedback by marks lost: architecture first, clarity second, then our own audit." | §2 table |
| 2 | Measurable improvement | "Eight changes, each with a before and after number." | §3 table |
| 3 | High-priority improvements | "The architecture diagram is in the app now, one tap from the map." | **About → How it works** |
| 4 | Testing & validation | "62 tests on every push, live checks tonight, and every alert checked by eye." | §4 |
| 5 | Weakness & risk resolution | "Our limits are on screen, with what we did about each one." | **About → limits** |
| 6 | Ownership & justification | "Every part has a reason, and we changed course where the feedback was right." | the "why this part" rows |

---

## 2. Feedback → priority (criterion 1)

| # | Feedback or finding | From | Priority | Why this order |
|---|---|---|---|---|
| F1 | Architecture not clear; nothing on screen to point at | Round 2 judge (4/10) | **1** | Biggest marks lost |
| F2 | Answers too long: *"the answer should be clear"* | Round 2 judge | **1** | Costs marks on every question |
| F3 | One number (28.1 ha) typed into code beside one computed from data | our own audit | 2 | Broke our claim that every number comes from the data |
| F4 | Deck overclaimed: "5 **real** alerts" (our data: 3 show change, 2 unclear) and "AI **inference** in the browser" (it reads labels computed in advance) | our own audit, tonight | 2 | A judge could catch it in one tap |
| F5 | Photo-check service used a Gemini model Google has deprecated (2.5 Flash, switched off 1 Dec 2026) | our own audit, tonight | 3 | Would fail on first deploy |
| F6 | Live site never tested cold on a phone, offline | our own audit | 2 | Demo-killer if wrong |
| F? | *(other mentor comments: write them here)* | | | |

**What we deliberately did NOT do:** radar, more cities, a backend, training our own model. None of
them answers the feedback, and every one adds risk the night before a final.

---

## 3. What changed, measurably (criteria 2 and 3)

| # | Change | Before | After | Proof |
|---|---|---|---|---|
| 1 | **Architecture made visible:** "How it works" diagram, a "why this part" row for each component, a limits list | No diagram in the app | One-screen data flow, every part with its cost and reason | About → How it works |
| 2 | **Clear answers:** verdict first, then one fact, then stop | Long answers, interrupted | Every answer in §8 reaches its verdict within 20 words | Drill (§11) |
| 3 | **Every number from the data** | 1 number typed into code | 0 (commit `47c0b85`, live) | search + 62 tests |
| 4 | **Claims match the data** | "5 real", "inference in the browser" | "5 possible: 3 show change, 2 unclear"; "labels read in the browser" | by-eye notes in `alerts.json` |
| 5 | **Phone-first interface** | Round 2 layout | Map-first Material 3 layout: 5 sections, links to one alert, search over alerts | works at 360 px wide |
| 6 | **Fast and offline** | n/a | 46 files saved for offline; demo video costs 0 bytes until played; our app code 67 KB over the wire | checked live, 4 Nov |
| 7 | **New in the final:** alerts and letters | n/a | 26 raw detections → **5 alerts** after 3 noise filters (81% rejected); complaint letter in **Tamil and English** to the right authority; RSS feed | live |
| 8 | **AI dependency future-proofed** | deprecated Gemini 2.5 Flash | Gemini 3.8 Flash (released 2 Sep 2026), changed in one line | Google's deprecations page |

Change 8 is **ready, not deployed**. Say "ready to deploy", never "live".

---

## 4. Testing & validation (criterion 4)

**Automated: 62 tests (43 Python + 19 JavaScript), on GitHub Actions, on every push.** Green on
`main` after tonight's push. Name three if asked:
- every number printed on the page matches the analysis output;
- no script loads from a CDN, and the offline list points at real files;
- the label images stay lossless and the same size, because the tap-a-spot AI lookup depends on it.

(Also: places are named only at suburb level, never a person. That rule is tested too.)

**Live checks tonight (4 Nov, on the real site):** the map paints; the numbers are right; About
shows the diagram and limits; Act shows "what happens next"; the letter comes out in Tamil; the
video downloads nothing until played, then plays all 46 s; after a reload the service worker
serves the page; the plain link still shows Round 2 on a fresh device; and we confirmed the fix was
live by reading the deployed file after the build.

**Human checks:** the top 10 patches were checked by eye: **9 real, 1 unclear (#9)**. All 5 alerts
were checked by eye: **3 show change (A2 and A3: water gone; A5: likely), 2 unclear (A1, A4)**. We
publish the unclear ones.

**Still to do before stage (owner: Driver):** an airplane-mode run on the demo phone, and scanning
the handout QR before printing.

---

## 5. Weaknesses & risks, and what we did (criterion 5)

| Weakness / risk | What we did | What's left (say it plainly) |
|---|---|---|
| Dynamic World finds only 36.8% of marsh | We present 28.1 ha as a **floor**; every patch says "possible change, needs a ground check"; checked by eye | Marsh the model never saw is not counted |
| 10 m pixels miss small dumping | Said on screen; photo check designed for ground evidence | Photo check not deployed ("Coming") |
| Venue network fails | Works offline after one visit; video fallback; printed handout | — |
| Deprecated AI model | Switched before it ever broke | Re-check the model list when deploying |
| Overclaims | Removed; hedges everywhere | — |
| Harming or naming people | Suburb-level names only (tested); owners never named; the letter never says "illegal" | — |
| The law is moving: the NGT's 1 km order (24 Sep 2025) is challenged by CREDAI in the Madras High Court; the Wetland Authority proposed a 128.19 ha interim zone (it was 3,358 ha); next hearing listed for **11 Nov 2026** | The letter asks for an **inspection**, which stands whatever the zone | One sentence of the letter may need updating after the ruling |
| Earth Engine is free only for non-commercial use | The citizen tool stays non-commercial | A paid tier needs a commercial licence, or runs on the open data directly |
| No users yet | Live, free, no sign-in | "Not yet." |

---

## 6. Ownership: decisions we stand behind (criterion 6)

| Decision | Why | What we gave up |
|---|---|---|
| No server, no database | ₹0, nothing to crash or hack, works offline | No live queries; we compute in advance |
| Google's validated model, not our own | No ground truth to train on; ours would be weaker | We inherit its limits, and we state them |
| Dry season only (Feb–May), the most common label from 14–22 images | Fewest clouds, a stable baseline | Monsoon changes wait for clear days |
| Flag only if built in **both** 2025 and 2026 | One season can be a mislabel | Slower to flag |
| Label "Coming" instead of faking it | Credibility | Less wow |
| Letters in Tamil | The person next to the marsh must be able to send it | More text to check |
| New layout behind `?final=1` | The working Round 2 map stays safe | Two links to explain |

**Adaptability in one line:** "We stopped pitching and started pointing: every answer now ends at
something on the screen."

---

## 7. THE SCRIPT (3 minutes)

**Driver** holds the phone and taps; says nothing else. **Closer** opens and closes.
**Architect** takes the system. **Impact** takes risk and people.

| Time | Who | Screen | Words |
|---|---|---|---|
| 0:00–0:20 | Closer | Overview | "Round 2 told us two things: our architecture wasn't clear, and our answers weren't. Tonight we fixed both, and then we audited ourselves. Eight changes, each with a number. Interrupt us anywhere." |
| 0:20–0:40 | Closer | Overview | "We ranked the feedback by marks lost. Architecture cost the most, so it came first. Clarity second. Then our own audit found four more problems, and we fixed those too." |
| 0:40–1:15 | Architect | **About → How it works** | "This is the whole system. Earth Engine runs Google's Dynamic World AI over free Sentinel-2 images, once. Our rule turns that into patches. The result is static files on your phone. No server, no database, no API key: ₹0 to run, works offline, nothing to hack." |
| 1:15–1:50 | Architect | scrub **Year by year**; tap patch **#1** | "28.1 hectares of water and marsh became buildings since 2018, two-thirds of it since 2023. Zero numbers typed into code: each one comes from the data, and 62 tests check that on every push. 26 raw alerts filtered down to 5." |
| 1:50–2:10 | Closer | patch #1 card | "We test three ways: 62 automated tests, live checks tonight, and our own eyes. Top 10 patches: 9 real, 1 unclear. Five alerts: 3 show change, 2 unclear, and we publish the unclear ones." |
| 2:10–2:35 | Impact | **Act → Write the letter → தமிழ்** | "Risks we closed tonight: our deck overclaimed twice, so we corrected it. Our photo-check service used an AI model Google is retiring, so we switched it before it broke. The one we can't fix: 10-metre pixels miss small dumping. So every patch says 'possible change, needs a ground check', and the output is this letter, in Tamil, asking an official to inspect." |
| 2:35–3:00 | Closer | Alerts → **A3** | "Why now: the High Court's next hearing on the marsh's protected zone is listed for 11 November. Everyone is arguing about a line on a map. We show what is actually being filled. This alert is about 700 metres from this campus. What would you like us to dig into?" → **STOP.** |

**If the Round 2 judge is on the panel**, the Closer's first words: *"You told us the answer should
be clear. Short answers first, and we'll go deeper wherever you want."* Say it once; never mention
the score.

**60-second cut:** rows 1, 3 and 7 (feedback → diagram → why now).
**30-second cut:** "Round 2 said our architecture wasn't clear. Now it's one picture in the app,
every number comes from the data, 62 tests run on every push, and we fixed every overclaim we
found. 28.1 hectares of wetland became buildings since 2018. What would you like to see?"

---

## 8. Q&A: verdict first, one fact, then silence for two seconds

**About the feedback (Round 3 questions; expect these)**
- *What feedback did you get?* "Architecture unclear, answers too long. The diagram is in the app now, and we answer in one sentence."
- *Most important change?* "The architecture diagram, because that's where we lost the most marks."
- *How do you know it improved?* "Zero typed-in numbers, 62 tests green, two overclaims removed, site checked live tonight."
- *What didn't you change?* "Radar and more cities. They don't answer the feedback, and they'd add risk."
- *One more day?* "Deploy the photo check, which is written and on a supported model, and test it at the alert 700 m from here."
- *Any feedback you disagreed with?* "No. And our own audit found more than the feedback did."

**Technical**
- *Stack?* "Earth Engine and Python for analysis; plain JavaScript and Leaflet for the site. No server."
- *What AI?* "Google's Dynamic World. It labels every 10-metre square as water, marsh, buildings and so on."
- *Does the AI run on the phone?* "No. The model ran once in Earth Engine; the phone reads its labels from images, one pixel at a time."
- *Train your own?* "No ground truth to train on. A validated model is more honest."
- *Accuracy?* "86.7% on buildings, 36.8% on marsh. It misses marsh, so our number is a floor."
- *Precision or recall?* "86.7% is user's accuracy, precision. 36.8% is producer's accuracy, recall."
- *False positives?* "Three filters: seasonal drying, already-built land, moving shorelines. 26 down to 5."
- *Why the dry season?* "Fewest clouds, and water isn't confused with floods."
- *Why two years?* "One season can be a mislabel. Two in a row means it stayed built."
- *How is a season made?* "The most common label for each square across 14 to 22 images, February to May."
- *Why fast?* "Small images first, full ones on zoom, everything cached. After one visit it needs no network."
- *The photo check uses Gemini; where's the key?* "Only inside a Cloudflare Worker as a secret. Never in the site. It's not deployed yet."
- *Security?* "Static files only, no logins, nothing stored. Nothing to hack."

**Impact**
- *Who uses it?* "Residents near the marsh, resident associations, NGOs, and the Corporation."
- *Who gets the letter?* "The State Wetland Authority, the Greater Chennai Corporation, or the Forest Department."
- *Why now?* "The High Court's next hearing on the marsh's protected zone is listed for 11 November."
- *Only 1.7% of the wetland, so what?* "It's the part being filled now, and it's speeding up: 6.95 hectares in the latest season alone."
- *Ninety percent was lost decades ago.* "This is the part still happening, and the part that can still be stopped."
- *What about home-owners near the marsh?* "We never name an owner or a plot. We flag filled water, which is what floods those homes."
- *Different from TN-SWIP?* "Theirs alerts officials. Ours is open to anyone, with open data."
- *Business model?* "Free for citizens; a paid dashboard for agencies; CSR from companies along OMR."
- *Anyone used it?* "Not yet." (Stop there.)
- *Biggest weakness?* "We can't see a single house. Ten-metre pixels miss small dumping."

---

## 9. Numbers card (memorise)

| Number | Meaning |
|---|---|
| **28.1 ha** | 2018 water and marsh now buildings (≈ 69 acres ≈ **1,260 grounds**) |
| **36** | patches. Not the same as the Wetland Authority's "36 survey numbers"; that's a coincidence |
| **65%** | of it since 2023; **6.95 ha** in the 2025 season alone, the highest of any season |
| **28 of 36** | patches in or within 1 km of the protected marsh |
| **18** | patches (17.6 ha) were at least half water after the Dec 2021 floods |
| **#1** | Perungudi, 10.92 ha, inside the marsh outline, 93% water after the 2021 floods |
| **5** | alerts since June 2026: 3 show change, 2 unclear; 1.87 ha; all within 1 km of the marsh |
| **26 → 5** | raw detections → alerts (don't quote any middle number) |
| **9 of 10** | top patches confirmed by eye (1 unclear) |
| **62** | tests: 43 + 19, on every push |
| **86.7% / 36.8%** | Dynamic World: buildings precision / marsh recall |
| **10 m** | one pixel = 100 m² ≈ 1,076 sq ft, about a 2BHK flat |
| **14–22** | AI-labelled images per dry season; 9 seasons, 2018–2026 |
| **1.7%** | 28.1 of 1,628 ha of water and marsh in the study area in 2018 |
| **678 m** | alert A3 (pond now bare earth) from the Sathyabama campus |
| **67 KB** | our app code over the wire (gzipped); Leaflet about 42 KB more |
| **₹0** | to run |
| **24 Sep 2025 / 11 Nov 2026** | NGT 1 km order / next High Court hearing listed |
| **8 Apr 2022** | Pallikaranai named a Ramsar site; it was ~5,500 ha in 1965, ~696 ha in 2021 |

---

## 10. Rules for speaking

- **Start with the noun and the verb.** "The rule rejects three kinds of noise." Not "So basically what we did was…"
- **Never say:** "basically", "actually", "so what we did was", "I was just getting to that", "that's my next slide", "real-time", "revolutionary", "100% accurate", "illegal", "proves".
- **One person answers one question.** Nobody adds to a finished answer. If two start, the owner continues.
- **Interrupted?** Answer the new question at once.
- **Don't know?** "I don't know. Here's what I do know: …"
- **A judge finds a bug?** "Good catch. That's a bug, not a claim." Note it; don't debug on stage.

---

## 11. Drill tonight (40 min, out loud)

1. 10 min: each person says their script lines aloud five times, until they need no thinking.
2. 20 min: one person reads §8 questions at random and **interrupts at 5 seconds**. The answer must land its verdict first. Rotate.
3. 10 min: record one round on a phone and listen once. You'll hear your filler words.
Then run §7 twice on the real phone, the second time in **airplane mode**.

---

## 12. Before you walk in

- [ ] Open the live site **twice** on the demo phone after the last push, then do an airplane-mode run
- [ ] Home-screen shortcut to the `?final=1` link
- [ ] Deck PDF (corrected tonight), `prep/handout.pdf` and `docs/app/final/media/demo.mp4` saved offline on the phone
- [ ] Scan the handout QR, then print 5 copies
- [ ] Other mentor comments written into §2
- [ ] Phones charged; hotspot ready

**If things fail:** no network → "This is running with no network, which is the point." Phone
dead → play `demo.mp4` and narrate. No projector → hand out the handout. A judge opens `/app/` and
sees the old map → "Use the QR on the handout; that's the final version."

---

## 13. The prototype: live, ready, coming

- **Live:** 9-season map (2018–2026), 36 patches, timeline, tap-a-spot AI lookup, 5 alerts + RSS
  feed, complaint letter in Tamil/English, "How it works" + limits, demo video, offline mode.
- **Ready, not deployed:** photo-check service (Cloudflare Worker → Gemini 3.8 Flash; stores
  nothing; 8 checks/min per visitor; key only as a Worker secret). The phone side (`report.js`)
  isn't built yet, so the app honestly says "Coming".
- **Coming:** radar through monsoon clouds.

**To finish the photo check later** (paste into a fresh session when you have limit again):
> Build `docs/app/final/report.js` for NEERKATTI: define `F.report(site)` only when a `PHOTO_URL`
> constant is set; a sheet that picks a photo, shrinks it to ≤1280 px JPEG in the browser (drops
> GPS), optionally adds location on tap, POSTs `{photo, lat, lon, site:{lat,lon}}` to
> `PHOTO_URL + '/check'`, and shows category, confidence, reason and distance with the line
> "One photo, read by an AI: a ground check is still needed." Plain messages for offline, 429, 503
> and timeout; never a fake result. Load it before `final/ui.js`; add it to the `sw.js` PRECACHE
> (no apostrophes in comments) and bump VERSION. Keep 62 tests green. Athulya deploys the Worker
> herself (`npx wrangler login`, `npx wrangler secret put GEMINI_API_KEY`, `npx wrangler deploy`,
> no billing on the key's project) and pastes only the URL. Then update the limits line in
> `arch.js` and rebuild the handout in the same commit. Commit on `final`; push only when Athulya
> says so.

---

**Sources** (checked 4 Nov 2026):
[NGT order and CREDAI challenge, DT Next](https://www.dtnext.in/news/chennai/credai-chennai-challenges-ngts-1-km-construction-restriction-around-pallikaranai-ramsar-site) ·
[High Court bench and zone of influence, DT Next](https://www.dtnext.in/news/tamilnadu/tnswa-told-to-submit-zone-of-influence-around-pallikaranai-marshland) ·
[Hearing adjourned to 11 Nov 2026](https://community.verified.realestate/article/pallikaranai-marsh-case-high-court-adjourns-hearing-to-november-11-2026/) ·
[Gemini model deprecations](https://aistudio.google.com/docs/deprecations) ·
[Pallikaranai Marsh, Wikipedia](https://en.wikipedia.org/wiki/Pallikaranai_Marsh) ·
Dynamic World accuracy: Brown et al. 2022, *Scientific Data*, Tables 7–8 (see `docs/MODEL_CARD.md`).

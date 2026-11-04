# NEERKATTI: Round 3 Team Guide and Script

**DEXATHON 2026 final · Team Sternritters (DEX26302) · updated 5 Nov 2026, 02:00 IST.**
Every number here was checked against the repo, the live site and the web. If a number is
not in this file, say "I'd have to check that." Never guess.

Live: **https://athulyapandian24.github.io/neerkatti/app/?final=1**
(The plain `/app/` link shows the older layout on any phone that has never opened `?final=1`.)

---

## 0. Read this first

Round 3 is **not a pitch**. It is marked on six things:

1. **Understanding & prioritisation:** did we understand the feedback and rank it?
2. **High-priority improvements:** did we build what the mentors asked for?
3. **Measurable quality improvement:** can we show, with numbers, what got better?
4. **Testing & validation:** did we prove the changes work?
5. **Weakness & risk resolution:** did we close our weak spots and risks?
6. **Ownership, adaptability & justification:** do we own our decisions and explain them?

Every sentence on stage should answer one of these six. Anything else is wasted time.

**Feedback we got.** Our mentors: *make the technical architecture clear; make the answers clear.*
A judge also asked three questions: what citizens can do if a complaint is ignored ("most
landowners are politicians"), which AI model we use, and whether it uses any API.
→ **Before you go on, write any other mentor comments into §2. Do not invent any.**
**On stage, never mention earlier rounds or scores.**

**Our answer in one line:**
> "You asked for a clear architecture and clear answers. Now the architecture is one picture in
> the app, every number comes from the data, we checked every claim, and we answer in one
> sentence."

---

## 1. Rubric map: what to say and what to point at

| # | Criterion | Say (one line) | Point at |
|---|---|---|---|
| 1 | Understanding & prioritisation | "We ranked the feedback by impact: architecture first, clarity second, then the judge's questions and our own audit." | §2 table |
| 2 | High-priority improvements | "The architecture diagram is in the app now, one tap from the map." | **About → How it works** |
| 3 | Measurable improvement | "Ten changes, each with a before and after." | §3 table |
| 4 | Testing & validation | "62 tests on every push, live checks of the site and the photo check, and every alert checked by eye." | §4 |
| 5 | Weakness & risk resolution | "Our limits are on screen, with what we did about each one." | **About → limits** |
| 6 | Ownership & justification | "Every part has a reason, and we changed course where the feedback was right." | the "why this part" rows |

---

## 2. Feedback → priority (criterion 1)

| # | Feedback or finding | From | Priority | Why this order |
|---|---|---|---|---|
| F1 | Architecture not clear; nothing on screen to point at | mentors | **1** | Everything else is explained from it |
| F2 | Answers too long: make the answers clear | mentors | **1** | Matters on every question |
| F3 | What can citizens do if a complaint is ignored? | a judge's question | **1** | The first thing a citizen will ask |
| F4 | Which AI model? Does it use any API? | a judge's questions | **1** | Our answer was not clear enough |
| F5 | One number (28.1 ha) typed into code beside one computed from data | our own audit | 2 | Broke our claim that every number comes from the data |
| F6 | Deck overclaimed: "5 **real** alerts" (our data: 3 show change, 2 unclear) and "AI **inference** in the browser" (it reads labels computed in advance) | our own audit | 2 | A judge could catch it in one tap |
| F7 | Live site never tested cold on a phone, offline | our own audit | 2 | Demo-killer if wrong |
| F8 | Photo-check service used a Gemini model Google is retiring (2.5 Flash, switched off 1 Dec 2026) | our own audit | 3 | Would have broken after the final |
| F? | *(other mentor comments: write them here)* | | | |

**What we deliberately did NOT do:** radar, more cities, a database or user accounts, training our
own model. None of them answers the feedback, and every one adds risk the night before a final.

---

## 3. What changed, measurably (criteria 2 and 3)

| # | Change | Before | After | Proof |
|---|---|---|---|---|
| 1 | **Architecture made visible:** "How it works" diagram, a "why this part" row for each component, a limits list | No diagram in the app | One-screen data flow, every part with its cost and reason | About → How it works |
| 2 | **Clear answers:** verdict first, then one fact, then stop | Long answers, interrupted | Every answer in §8 reaches its verdict within 20 words | Drill (§11) |
| 3 | **Every number from the data** | 1 number typed into code | 0 (commit `47c0b85`, live) | search + 62 tests |
| 4 | **Claims match the data** | "5 real", "inference in the browser" | "5 possible: 3 show change, 2 unclear"; "labels read in the browser" | by-eye notes in `alerts.json` |
| 5 | **Phone-first interface** | the earlier layout | Map-first Material 3 layout: 5 sections, links to one alert, search over alerts | works at 360 px wide |
| 6 | **Fast and offline** | n/a | The app and every season's images saved for offline; demo video costs 0 bytes until played; our JavaScript about 70 KB over the wire | checked live, 5 Nov |
| 7 | **New in the final: alerts and letters** | n/a | 26 raw detections → **5 alerts** after 3 noise filters (81% rejected); complaint letter in **Tamil and English** to the right authority; RSS feed | live |
| 8 | **AI dependency future-proofed** | Gemini 2.5 Flash (Google switches it off 1 Dec 2026) | **Gemini 2.5 Flash-Lite**, not deprecated. We tried Gemini 3.8 Flash first, but on the night it answered 503 "high demand"; 2.5 Flash-Lite answered every test in about 3 s | Google's deprecations page, checked 5 Nov; commit `5260702` |
| 9 | **Citizen photo check, live** | "Coming" | The phone shrinks the photo (which drops GPS) → our Cloudflare Worker (key as a secret, stores nothing, 8 checks a minute per visitor) → Gemini 2.5 Flash-Lite: construction, dumping, sewage, no change or unclear, in about 3 s | tested against the live Worker, 5 Nov |
| 10 | **What citizens can do when ignored** | a complaint letter only | **RTI follow-up letter** in Tamil and English (Section 6(1), RTI Act 2005; ₹10 fee; the office must reply within 30 days), then a first appeal | Act → Write the letter → RTI follow-up |

Changes 1 and 3–10 are live at commit `5260702`; change 2 is how we speak.

---

## 4. Testing & validation (criterion 4)

**Automated: 62 tests (43 Python + 19 JavaScript), on GitHub Actions, on every push.** Green on
`main` and `final` at `5260702`. Name three if asked:
- every number printed on the page matches the analysis output;
- no script loads from a CDN, and the offline list points at real files;
- the label images stay lossless and the same size, because the tap-a-spot AI lookup depends on it.

(Also: places are named only at suburb level, never a person. That rule is tested too.)

**Live checks (4 Nov, on the real site):** the map paints; the numbers are right; About shows the
diagram and limits; Act shows "what happens next"; the letter comes out in Tamil; the video
downloads nothing until played, then plays all 46 s; after a reload the service worker serves the
page; the plain link still shows the older layout on a fresh device; and we confirmed the fix was
live by reading the deployed file after the build.

**Photo check (5 Nov, against the live Worker):** a real photo came back in about 3 s with a correct
answer (category, confidence, one sentence). Offline, the app says the photo check needs a
connection instead of failing.

**Human checks:** the top 10 patches were checked by eye: **9 real, 1 unclear (#9)**. All 5 alerts
were checked by eye: **3 show change (A2 and A3: water gone; A5: likely), 2 unclear (A1, A4)**. We
publish the unclear ones.

**Still to do before stage (owner: Driver):** an airplane-mode run on the demo phone, one photo
check on the venue network, and scanning the handout QR before printing.

---

## 5. Weaknesses & risks, and what we did (criterion 5)

| Weakness / risk | What we did | What's left (say it plainly) |
|---|---|---|
| Dynamic World finds only 36.8% of marsh | We present 28.1 ha as a **floor**; every patch says "possible change, needs a ground check"; checked by eye | Marsh the model never saw is not counted |
| 10 m pixels miss small dumping | Said on screen; the photo check, now live, brings evidence from the ground | One AI reading of one photo still needs a ground check |
| Complaints ignored ("most landowners are politicians") | The RTI follow-up letter: by law the office must answer within 30 days; then a first appeal; the evidence is public and dated | NEERKATTI does not yet track what the office does |
| Venue network fails | Works offline after one visit; video fallback; printed handout | The photo check needs a connection, and says so |
| Gemini model being retired | Moved off 2.5 Flash (off 1 Dec 2026) to 2.5 Flash-Lite (not deprecated, checked 5 Nov) | Re-check Google's list after the final |
| Gemini refused Cloudflare's Singapore location ("User location is not supported") | The Worker calls Google from a Durable Object placed in eastern North America | The photo passes through the US on its way to Google; nothing is stored |
| Google's free tier may use photos to improve its AI | The phone strips GPS before sending; the sheet asks people to leave faces out; NEERKATTI stores nothing | A paid key would stop Google using them |
| Overclaims | Removed; hedges everywhere | — |
| Harming or naming people | Suburb-level names only (tested); owners never named; the letter never says "illegal" | — |
| The law is moving: the NGT's 1 km order (24 Sep 2025) is challenged by CREDAI in the Madras High Court; the Wetland Authority proposed a 128.19 ha interim zone (it was 3,358 ha); next hearing listed for **11 Nov 2026** | The letter asks for an **inspection**, which stands whatever the zone | One sentence of the letter may need updating after the ruling |
| Earth Engine is free only for non-commercial use | The citizen tool stays non-commercial | A paid tier needs a commercial licence, or runs on the open data directly |
| No users yet | Live, free, no sign-in | "Not yet." |

---

## 6. Ownership: decisions we stand behind (criterion 6)

| Decision | Why | What we gave up |
|---|---|---|
| No server for the map, no database | ₹0, nothing to crash or hack, works offline | No live queries; we compute in advance |
| One small Worker for the photo check, not a backend | The key must never be in the site; free plan; stores nothing | One live dependency (Cloudflare and Gemini), only for photos |
| Gemini 2.5 Flash-Lite for photos | Answered every test in about 3 s; not deprecated; 3.8 Flash answered "high demand" | Not Google's newest model |
| Google's validated model, not our own | No ground truth to train on; ours would be weaker | We inherit its limits, and we state them |
| Dry season only (Feb–May), the most common label from 14–22 images | Fewest clouds, a stable baseline | Monsoon changes wait for clear days |
| Flag only if built in **both** 2025 and 2026 | One season can be a mislabel | Slower to flag |
| Label "Coming" instead of faking it (radar) | Credibility | Less wow |
| Letters in Tamil | The person next to the marsh must be able to send it | More text to check |
| New layout behind `?final=1` | The earlier working map stays safe | Two links to explain |

**Adaptability in one line:** "We stopped pitching and started pointing: every answer now ends at
something on the screen."

---

## 7. THE SCRIPT (3 minutes)

The same words as `prep/ROUND3_SCRIPT.txt` (about 2 min 30 s spoken). **Driver** holds the phone
and taps; says nothing else. **Closer** opens and closes. **Architect** takes the system.
**Impact** takes the risks, the photo check and the letters.

| Time | Who | Screen | Words |
|---|---|---|---|
| 0:00 | Closer | Overview | "NEERKATTI finds where Chennai's Pallikaranai wetland became buildings, using free satellite images and AI. Our mentors told us two things: make the technical architecture clear, and make every answer clear. We fixed the architecture first, because everything else depends on it." |
| 0:20 | Architect | **About → How it works** | "The architecture is now one screen in the app. Google's Dynamic World AI labels free Sentinel-2 images. Our rule flags water or marsh from 2018 that is buildings in both 2025 and 2026. The AI ran once, through Google Earth Engine's Python API. The website only reads the saved results. The one live API call is the optional photo check, through our Worker, which holds the key." |
| 0:50 | Architect | scrub **Year by year**; tap patch **#1** | "In numbers: every number on screen now comes from the data file, none typed by hand. Our filters cut 26 raw detections to 5 alerts. The result: 28.1 hectares of wetland became buildings since 2018, two-thirds of it since 2023." |
| 1:08 | Closer | patch #1 card | "62 automated tests run on every update, and all pass. We checked the live site and the photo check end to end. By eye, 9 of the top 10 patches are real changes and 1 is unclear, and we show that one too." |
| 1:25 | Impact | **Act** → point at *Report what you see* → **Write the letter** → **தமிழ்** → **RTI follow-up** | "Risks resolved: two overclaims in our slides, corrected. An AI model Google is retiring, replaced before it could break. 10-metre pixels miss small dumping, so now a citizen's photo is read by Gemini in about 3 seconds: construction, dumping, sewage, no change or unclear. We store nothing, and it still says 'needs a ground check'. Then this letter, in Tamil or English. If a complaint is ignored, the app writes an RTI application, and by law the office must answer within 30 days. Then a first appeal. The evidence is public and dated." |
| 2:05 | Closer | close the letter → Alerts → **A3** | "We own our decisions. The map needs no server, so it is free and cannot crash. A proven AI model, because there is no ground truth to train our own. Radar is not built yet, so it says 'Coming'. And it matters now: the High Court is due to hear the marsh case on 11 November. This alert is 700 metres from this campus. Thank you." → **STOP.** |

**If a judge who gave us feedback is on the panel**, the Closer's first words: *"You asked for clear
answers. Short answers first, and we'll go deeper wherever you want."* Say it once; never mention a
score.

**60-second cut:** say part 1, part 2, then the last 4 lines of part 6.
**30-second cut:** "Our mentors asked for a clear architecture. Now it's one picture in the app,
every number comes from the data, and 62 tests run on every push. A citizen can check a photo and
send an RTI follow-up. 28.1 hectares of wetland became buildings since 2018. What would you like
to see?"

---

## 8. Q&A: verdict first, one fact, then silence for two seconds

**About the feedback (Round 3 questions; expect these)**
- *What feedback did you get?* "Make the architecture clear and the answers clear. The diagram is in the app now, and we answer in one sentence."
- *Most important change?* "The architecture diagram, because everything else is explained from it."
- *How do you know it improved?* "Zero typed-in numbers, 62 tests green, two overclaims removed, site checked live."
- *What didn't you change?* "Radar and more cities. They don't answer the feedback, and they'd add risk."
- *One more day?* "Test the photo check with real photos at the alert 700 m from here, and compare it with a ground visit."
- *Any feedback you disagreed with?* "No. And our own audit found more than the feedback did."

**Technical**
- *Stack?* "Earth Engine and Python for analysis; plain JavaScript and Leaflet for the site; one Cloudflare Worker for the photo check. No server for the map."
- *Which AI model?* "Google's Dynamic World V1 for the map: it labels every 10-metre square as water, marsh, buildings and so on. The optional photo check uses Gemini 2.5 Flash-Lite."
- *Does it use any API?* "The AI ran once, through Google Earth Engine's Python API. The website only reads the saved results. The one live API call is the optional photo check, through our Worker, which holds the key."
- *Does the AI run on the phone?* "No. The model ran once in Earth Engine; the phone reads its labels from images, one pixel at a time."
- *How does the photo check work?* "A citizen's photo, read by Gemini in about 3 seconds as construction, dumping, sewage, no change or unclear. We store nothing, and it still says 'needs a ground check'."
- *Where's the Gemini key?* "Only inside our Cloudflare Worker, as a secret. Never in the site or the code."
- *Does Google keep the photo?* "NEERKATTI keeps nothing. On Google's free tier, Google may use it to improve its AI, so the phone strips GPS first, and we ask people to leave faces out."
- *Why does the Worker call Google from the US?* "Gemini refused Cloudflare's Singapore location, so the call goes out from eastern North America. Nothing is stored."
- *Why Flash-Lite, not a bigger model?* "It answered every test in about 3 seconds, and it is not deprecated. Gemini 3.8 Flash answered 'high demand' errors on the night."
- *Train your own?* "No ground truth to train on. A validated model is more honest."
- *Accuracy?* "86.7% on buildings, 36.8% on marsh. It misses marsh, so our number is a floor."
- *Precision or recall?* "86.7% is user's accuracy, precision. 36.8% is producer's accuracy, recall."
- *False positives?* "Three filters: seasonal drying, already-built land, moving shorelines. 26 down to 5."
- *Why the dry season?* "Fewest clouds, and water isn't confused with floods."
- *Why two years?* "One season can be a mislabel. Two in a row means it stayed built."
- *How is a season made?* "The most common label for each square across 14 to 22 images, February to May."
- *Why fast?* "Small images first, full ones on zoom, everything cached. After one visit the map needs no network."
- *Security?* "Static files, no logins, nothing stored. The one key lives in the Worker, which answers only our site and allows 8 checks a minute per visitor."

**Impact**
- *Who uses it?* "Residents near the marsh, resident associations, NGOs, and the Corporation."
- *Who gets the letter?* "The State Wetland Authority, the Greater Chennai Corporation, or the Forest Department."
- *Most landowners are politicians. Even if citizens complain, what can they do?* "If a complaint is ignored, the app writes an RTI application, and by law the office must answer within 30 days. Then a first appeal. The evidence is public and dated."
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
| **about 3 s** | one photo check: our Worker → Gemini 2.5 Flash-Lite → answer |
| **8 a minute** | photo checks allowed per visitor |
| **30 days** | the office's deadline to answer an RTI application; then a first appeal |
| **₹10** | the RTI fee in Tamil Nadu |
| **70 KB** | our JavaScript over the wire (gzipped); Leaflet about 42 KB more |
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

## 11. Drill (40 min, out loud)

1. 10 min: each person says their script lines aloud five times, until they need no thinking.
2. 20 min: one person reads §8 questions at random and **interrupts at 5 seconds**. The answer must land its verdict first. Rotate.
3. 10 min: record one round on a phone and listen once. You'll hear your filler words.
Then run §7 twice on the real phone, the second time in **airplane mode**.

---

## 12. Before you walk in

- [ ] Open the live site **twice** on the demo phone after the last push, then do an airplane-mode run
- [ ] One photo check on the demo phone over the venue network (it needs a connection)
- [ ] Home-screen shortcut to the `?final=1` link
- [ ] Deck PDF, `prep/handout.pdf` and `docs/app/final/media/demo.mp4` saved offline on the phone
- [ ] Scan the handout QR, then print 5 copies
- [ ] Other mentor comments written into §2
- [ ] Phones charged; hotspot ready

**If things fail:** no network → "This is running with no network, which is the point." Photo check
fails → "The photo check needs a connection. The map and the letter don't." Never show an old
result as a live one. Phone dead → play `demo.mp4` and narrate. No projector → hand out the
handout. A judge opens `/app/` and sees the older map → "Use the QR on the handout; that's the
final version."

---

## 13. The prototype: live and coming

- **Live:** 9-season map (2018–2026), 36 patches, timeline, tap-a-spot AI lookup, 5 alerts + RSS
  feed, complaint letter and **RTI follow-up** in Tamil/English with the appeal steps, the
  **citizen photo check**, "How it works" + limits, demo video, offline mode.
- **Photo check, in detail:** the phone shrinks the photo to 1280 px and re-draws it, which drops
  GPS and camera data; location is sent only if the person taps to add it, and only to measure the
  distance to the site. Our Cloudflare Worker (`serverless/photo-check`) holds `GEMINI_API_KEY` as
  a secret, answers only our site, stores nothing and allows 8 checks a minute per visitor. It calls
  Gemini 2.5 Flash-Lite from a Durable Object in eastern North America, because Gemini refused
  Cloudflare's Singapore location. Offline, the app says the check needs a connection.
- **Coming:** radar through monsoon clouds.

---

**Sources** (checked 5 Nov 2026):
[NGT order and CREDAI challenge, DT Next](https://www.dtnext.in/news/chennai/credai-chennai-challenges-ngts-1-km-construction-restriction-around-pallikaranai-ramsar-site) ·
[High Court bench and zone of influence, DT Next](https://www.dtnext.in/news/tamilnadu/tnswa-told-to-submit-zone-of-influence-around-pallikaranai-marshland) ·
[Hearing adjourned to 11 Nov 2026](https://community.verified.realestate/article/pallikaranai-marsh-case-high-court-adjourns-hearing-to-november-11-2026/) (one source only, updated 15 Oct 2026) ·
[Gemini model deprecations](https://aistudio.google.com/docs/deprecations) (2.5 Flash-Lite: no shutdown date) ·
[Gemini API terms](https://aistudio.google.com/docs/terms) (free tier: content may be used to improve Google's products) ·
[Pallikaranai Marsh, Wikipedia](https://en.wikipedia.org/wiki/Pallikaranai_Marsh) ·
Dynamic World accuracy: Brown et al. 2022, *Scientific Data*, Tables 7–8 (see `docs/MODEL_CARD.md`).

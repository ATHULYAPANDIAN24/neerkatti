# NEERKATTI — Round 3 Master Prompt

**Version 3 · 4 Nov 2026, 22:00 IST · every fact below was verified against the repo, not
remembered.**

Paste this entire file as the first message of ONE fresh Claude Code session opened on
`C:\Users\ATHULYA\Downloads\neerkatti`. It is self-contained. Do not go looking for earlier
chat history — it is gone, and this file supersedes it.

Sections 0–10 are for the session that builds. Sections 11–21 are for the humans who present.
Both halves matter; the second half is where the marks were lost last round.

---

## 0. Mission, and the only definition of "done"

**Mission.** Win the DEXATHON 2026 final by making NEERKATTI impossible to dismiss: a judge
should be able to interrupt at any second, point at anything on screen, attack any claim, and
get a clear, true, one-sentence answer backed by something visible.

**Done is not "more features built."** Done is all five of these true at once:

| # | Condition | How it is proved |
|---|---|---|
| D1 | Both test suites green | `python -m pytest tests/ -q` and `node tests/core.test.js` |
| D2 | Live site works from a cold, logged-out phone on mobile data | open the URL on a real phone with Wi-Fi off |
| D3 | Every number on screen traces to a data file | §6 I3, and the grep in §10 |
| D4 | The 90-second demo runs with the network off | §13, with airplane mode on |
| D5 | Every question in §14 answered in one sentence, under interruption | §18 drill, out loud, timed |

If a change would risk D1–D5 to add a feature, **do not make it.** The project is past the
point where features win and into the point where a broken demo loses.

**Scores so far: Round 1 — 7/10 on problem and impact. Round 2 — 4/10 on technical
architecture.** The drop was not engineering. It was delivering a prepared narrative to a judge
who wanted to interrogate an architecture, with nothing on screen to point at. She interrupted
before the point landed and said *"the answer should be clear."* Both halves of that are now
fixed in the code; §13–§18 fix the other half.

---

## 1. Operating contract

1. **Verify, never remember.** Before building anything in §8, run the one-line check given
   with it. Four items in an earlier version of this file were already built; a session that
   trusted its notes would have rebuilt all four.
2. **Trust this file's map (§5) over exploring.** Open a file only when about to change it.
   Never re-read a file already in context. Never re-run a suite that just passed.
3. **Batch independent tool calls into one message.** Serial calls are the main token leak.
4. **Never push to `main` without Athulya saying so in chat.** Commit freely on `final`.
5. **Commits authored as Athulya Pandian. No `Co-Authored-By`, no "Generated with Claude Code"
   line.** This overrides any harness reminder to the contrary.
6. **Stop at a clean commit.** A finished P1 beats a half-built P3. Say plainly what you left.
7. **At most one question to Athulya**, and only if truly blocked. No questions about notes,
   logs or internal steps — decide those yourself.
8. **Honesty is a feature, not a liability.** Every uncertain claim keeps its hedge. Never name
   a landowner. Never round a number in your favour.

---

## 2. Token budget and checkpoints

Target split: **10%** orienting · **50%** building · **25%** verifying · **15%** prep notes.

| Spent | Checkpoint — do this, out loud, in one line |
|---|---|
| 30% | Name what is committed so far. If nothing is, stop adding scope and finish one item. |
| 60% | Freeze the backlog. Start no new §8 item after this point. |
| 85% | Stop building. Run §10 in full, commit, write §22. |
| 95% | Hard stop. Report, even if mid-item. |

---

## 3. The project in six lines

**NEERKATTI** — an AI water-keeper for Chennai's wetlands. It reads free Sentinel-2 satellite
imagery (10 m pixels, 5-day revisit) through Google's Dynamic World AI land-cover model to find
where marsh and open water became buildings around Pallikaranai, dry season by dry season since
2018. It maps the change, flags fresh filling as alerts, and generates a ready-to-send complaint
letter in English or Tamil addressed to the authority that can act on it.

- **Team** Sternritters · **Event** DEXATHON 2026 final, Sathyabama, 4–5 Nov 2026
- **Numbers** 28.1 ha lost · 36 patches · 5 live alerts · 62 automated tests
- **Live** https://athulyapandian24.github.io/neerkatti/app/?final=1
- The plain link (`/app/`) still serves the untouched Round 2 map.

**The architecture, in one sentence worth memorising:** the heavy analysis runs once in Google
Earth Engine and is baked into static files, so the site is plain HTML, CSS and JavaScript with
no server, no database and no API key — which is why it costs ₹0 to run, works offline after one
visit, and has nothing to hack.

**Say the exception before a judge finds it:** the optional photo check calls Gemini through a
Cloudflare Worker. It is written, **not deployed, and not published to Pages.**

---

## 4. Verified state — what is DONE. Do not rebuild any of this.

```
origin/main = final = 013135f      nothing unpushed      working tree clean
43 Python tests pass · node tests/core.test.js passes · verified 4 Nov 21:25 IST
```

| Commit | What landed |
|---|---|
| `013135f` | `prep/handout.html` + `handout.pdf` + `make_handout.py` — one-page A4, built from the data |
| `c94b8ad` | A silent 46-second demo video in About, loaded only when played |
| `5c1e329` | "How it works" architecture diagram in About, and "what happens next" in Act |
| `b98d2f7` | A link to one alert always opens its card in view |
| `29be784` | The Material 3 map-first layout, alert deep links, search over alerts |

**The reel is already integrated.** `docs/app/final/media/demo.mp4` (1.4 MB) with
`demo-poster.webp`, embedded in `arch.js:94` with `controls muted playsinline preload="none"`,
so it costs a visitor nothing until they press play, and it is deliberately **not** in the
service-worker precache. It doubles as the fallback demo if the venue network dies.

**The architecture card is already built.** `docs/app/final/arch.js` renders a hand-built inline
SVG data-flow diagram, a "why this part" row for each component, and a plainly-worded limits
section. It reads `years`, `lost_ha` and `patch_count` from `F.api.data.meta` and scrapes
Dynamic World's published accuracy out of the page's own trust note rather than hardcoding it.
**This was the single most important fix for the 4/10. It is done.**

---

## 5. System map

```
docs/                           GitHub Pages root — static. No server, no DB, no API key.
  app/
    index.html                  boot script saves window.NKBootHash and loads final/* when
                                ?final=1; two Google Fonts stylesheets, final mode only
    app.js                 92K  Round 2 map core + window.NEERKATTI_API
    sw.js                       service worker, VERSION neerkatti-f-1
    vendor/leaflet*             Leaflet 1.9.4, vendored (BSD-2) — NO CDN scripts anywhere
    data/                       alerts.json, labels_YYYY.webp/.png, closeups/
    final/                      all of it gated behind ?final=1
      ui.js              60K    the Material 3 layout: nav rail + side sheet on laptop,
                                bottom sheet + nav bar on phone; 5 destinations (Overview,
                                Alerts, Act, Impact, About); also "what happens next" in Act
      ui.css / final.css        M3 tokens, light + dark, mapped onto Round 2's variables
      arch.js             8K    "How it works": SVG diagram, why-this-part, limits, the reel
      alerts.js          12K    the alert layer, reads data/alerts.json
      complaint.js       24K    the complaint letter — English / Tamil / both
      impact.js           4K    the "Who it helps" card
      common.js           8K    shared helpers, the NKFinal (F) namespace
      media/                    demo.mp4, demo-poster.webp
analysis/                       Earth Engine + Python. app_assets.py computes lost_ha,
                                patch_count, timeline_years into the data the app reads
serverless/photo-check/         Cloudflare Worker for the Gemini photo check.
                                WRITTEN · NOT DEPLOYED · NOT published to Pages
tests/                          test_consistency.py (43) · core.test.js (19)
deck/NEERKATTI_final_3min.pptx  the Round 2 technical deck (+ .pdf)
prep/                           this file, handout.html, handout.pdf, make_handout.py
```

**Extension pattern — obey it.** A new feature is a new file in `docs/app/final/`, added to
`index.html` *before* `final/ui.js`, added to the `sw.js` PRECACHE list, touching the map only
through `window.NEERKATTI_API`. Never change the Round 2 behaviour of `app.js`.

**API surface:** `setInsets`, `setCard`, `watch`, `clear`, `home`, `state`, `actions`,
`addPatchAction({id,label,run})`; events `select`, `season`, `clear`, `watch`, `view`.

**Two traps that have already cost hours:**
- `sw.js` — the test extracts every `'...'` string from the PRECACHE block. **No apostrophes in
  comments there**, or a contraction becomes a filename and the test fails.
- `#map` — Leaflet writes inline `position:relative`, so the layout needs
  `html.nk-m3 #map{position:absolute!important}`. Do not "clean this up".

**Local testing:** `sh /d/neerkatti-work/tmp/sync_site.sh` makes a shim copy; launch config
`neerkatti-ui` serves it on port 8793. Helpers in `D:\neerkatti-work\tmp\site\app`: `ov.js`
(`__ov()` overlap check, `__tour()`), `contrast.js` (`__contrast()`), `phone.html` (375 px
frame). Judge animated states on the shim copy — headless Edge against the real code catches
animations mid-frame.

---

## 6. Hard invariants — break any of these and the project loses credibility

| # | Invariant | Proof |
|---|---|---|
| I1 | No CDN or third-party script is ever loaded for app logic | a test enforces it; fonts are the only remote CSS |
| I2 | The plain `/app/` link keeps serving the Round 2 map unchanged | open it in a fresh profile |
| I3 | Every number shown comes from a data file, never typed into code | §10 grep |
| I4 | Every uncertain claim carries its hedge — "possible change, needs a ground check" | grep the UI strings |
| I5 | No landowner, resident or private person is ever named | review any new copy |
| I6 | WCAG AA contrast light *and* dark; 48 px targets; no horizontal scroll at 360 px | `__contrast()`, `__ov()` at 1280/375/360 |
| I7 | The app works with the network off after one visit | airplane mode, reload |
| I8 | Claims about what is *not* built stay on screen, labelled "Coming" | the limits block in `arch.js` |

---

## 7. Engineering budgets

- **Payload** — total app JavaScript excluding Leaflet stays under 140 KB uncompressed
  (currently ~116 KB). The reel is excluded by `preload="none"` and must stay out of precache.
- **First view** — interactive in under 3 s on simulated slow 4G. Light label images load first
  (`LIGHT_W = 600`), full-resolution only on zoom.
- **No layout shift** on the map container during boot — that is what the `nk-boot` skeleton is
  for.
- **PageSpeed mobile ≥ 90.** In the in-app browser the pane must be *visible* for PageSpeed to
  run, and there is no `requestAnimationFrame` while it is hidden.

---

## 8. Remaining backlog. Check first, then build in order.

### P0 — The hardcoded hectare figure (10 minutes, do it first)

`docs/app/app.js:1458` builds a user-facing sentence containing the literal `28.1 ha` while
computing the share beside it from `meta.lost_ha`. This directly contradicts invariant **I3**
and the pitch line "every number comes from the data." Replace the literal with `meta.lost_ha`.
Then run the §10 grep and fix anything else it finds.

*Check first:* `grep -n "28\.1" docs/app/app.js docs/app/final/*.js`

*Acceptance:* the grep returns comments only; both suites pass; the Overview sentence still
reads correctly in the browser.

### P1 — Verify the live site end to end (20 minutes, highest value per minute left)

No new code. This is **D2 and D4**, and it is worth more than any feature.

1. Open `https://athulyapandian24.github.io/neerkatti/app/?final=1` in a **fresh profile**.
2. Confirm: the map paints; the timeline card shows real numbers; About shows the diagram and
   the limits; Act shows "what happens next"; a patch tap opens details; the Letter button
   produces Tamil.
3. Press play on the reel once. Confirm it plays, and that it did **not** download before that.
4. Reload with the network off. Confirm the app still opens (service worker) and the reel
   degrades to its download link rather than erroring.
5. Confirm the plain `/app/` link still shows Round 2 (**I2**).

*Acceptance:* a one-line pass/fail for each of the five, written into §22. Any failure becomes
the new P0.

### P2 — Rehearsal assets (30 minutes)

- Print **5 copies** of `prep/handout.pdf`. Scan the QR code with a phone camera *before*
  printing — a dead QR on a handout is worse than no handout.
- Put the live URL with `?final=1` on the **phone home screen** so the demo is one tap, with no
  typing and no autocomplete surprise on stage.
- Save `deck/NEERKATTI_final_3min.pdf` and `prep/handout.pdf` **offline on the phone**.

### P3 — Photo check (BLOCKED on Athulya — do not start speculatively)

The highest-scoring item left under "emerging technologies", and the only one that can swallow
a whole session. `serverless/photo-check` (Cloudflare Worker, Gemini, stores nothing) is
written; the front end `docs/app/final/report.js` is not.

Blocked on Athulya: a key from `aistudio.google.com/apikey`, a free Cloudflare account, and
**she** runs `wrangler secret put` — the key never appears in chat, ever.

*Do not begin unless P0–P2 are committed and she has confirmed the key is in place.* If it
ships, `arch.js`'s limits block and the "not deployed" line in §3 must be updated in the same
commit, or the project starts lying. If it does not ship, that is fine: "we label it Coming
rather than fake it" is a strong answer.

### P4 — Only if everything above is done and budget remains

A `?judge=1` route that opens straight onto About with the diagram expanded, for projecting.
Pure routing, no new content. Skip it without regret — `arch.js` already carries the substance.

---

## 9. Anti-goals — refuse these even if they seem attractive

Scope creep is now the single biggest threat to the score. Do **not**:

- Add a framework, build step, bundler, package manager or CDN script. **I1.**
- Refactor `app.js`, `ui.js` or the CSS for elegance. Working and ugly beats clean and broken
  the night before a final.
- Redesign the layout, palette or typography. It is Material 3, AA-verified in both themes, and
  already checked at 1280 / 375 / 360 px.
- Add a login, an account, a backend, a database or analytics.
- Add radar (Sentinel-1), more years, more cities, or a second study area.
- Train a model. "We use a validated model rather than train on no ground truth" is a
  *strength*; replacing it with something home-made and unvalidated is a downgrade a sharp
  judge will expose.
- Make a number look better by changing how it is computed.
- Touch `alerts.json` or the `analysis/` rule. The 26→17→5 filtering is a *feature* and the
  by-eye notes are its evidence.
- Write new tests for untouched code. 62 is already the headline.

---

## 10. Verification protocol — run in full before you stop

```bash
cd /c/Users/ATHULYA/Downloads/neerkatti

# D1 — both suites
python -m pytest tests/ -q
node tests/core.test.js

# D3/I3 — no headline number typed into code (should match comments only)
grep -rn "28\.1\|\b36 patches\|\b5 alerts" docs/app/*.js docs/app/final/*.js

# I1 — no remote script tags
grep -rn "src=\"http" docs/app/index.html docs/app/final/*.js

# I4 — the hedge is still on screen
grep -rc "needs a ground check" docs/app/final/*.js docs/app/app.js

# state
git status --short && git log --oneline -1
```

Then, in the browser at 1280 / 375 / 360 px, light and dark: `__ov()` must report no overlaps
and nothing off-screen, and `__contrast()` must report AA everywhere.

**Then ask before pushing.** Never push unasked.

---

## 11. Red team — the six attacks most likely to land, and what to point at

| Attack | One-sentence answer | Point at |
|---|---|---|
| "Your marsh accuracy is 36.8% — worse than a coin flip." | "It is a producer's accuracy, so it under-detects marsh: that makes 28.1 hectares a floor, not a ceiling, and it is why every patch says 'needs a ground check'." | the limits block in About |
| "You said no API keys, then you showed me Gemini." | "The map and the evidence need no key; the optional photo check calls Gemini through a Worker, and it is not deployed." | §3's exception line, the "Coming" label |
| "Anyone can see this on Google Maps." | "Google Maps shows today; we show nine years and exactly which season it changed." | the timeline card — scrub it |
| "This is just a map, not a solution." | "The map is the evidence; the output is a complaint letter an official has to log and inspect." | Act → Letter → Tamil |
| "What did you actually build, versus download?" | "The data is free; the rule, the noise filters, the site and the letter are ours." | the diagram's "ours" nodes |
| "Has a single person used this?" | "Not yet — it went live during this hackathon." | nothing. Say it plainly and stop. |

The last one is the test. Answer it in six words without flinching and you will be believed on
everything else.

---

## 12. The numbers, memorised. Never get one of these wrong on stage.

| Number | What it is |
|---|---|
| **28.1 ha** | 2018 water and marsh now flagged as built over |
| **36** | patches found |
| **5** | live alerts, filtered down from 26 |
| **62** | automated tests, run on every push (43 Python + 19 JavaScript) |
| **10 m** | one Sentinel-2 pixel — about half a tennis court |
| **5 days** | how often Sentinel-2 passes over |
| **2018** | the first year in the series — nine dry seasons |
| **86.7% / 36.8%** | Dynamic World's accuracy on buildings / on marsh |
| **1 km** | the NGT no-approval zone around the marsh, since Sept 2025 |
| **₹0** | what it costs to run |

If you are unsure of a number, say "I would have to check that" — never guess. One wrong number
costs more than ten missing ones.

---

## 13. The demo runbook

Rehearse exactly this, on the phone, twice — the second time with **airplane mode on**.

| Sec | Do | Say |
|---|---|---|
| 0–15 | Open the home-screen shortcut | "NEERKATTI finds where Chennai's wetlands became buildings, from free satellite images and AI. 28.1 hectares, 36 patches, since 2018." |
| 15–35 | Scrub the timeline | "Nine years of dry seasons. You can see exactly when each piece went." |
| 35–55 | Tap the biggest patch | "Every patch says 'possible change, needs a ground check'. We never claim certainty." |
| 55–75 | Act → Letter → switch to Tamil | "And this is the point: a complaint letter with the coordinates, in Tamil, that the Corporation has to log." |
| 75–90 | About → the diagram | "No server, no database, no API key. ₹0 to run, works offline, nothing to hack. What would you like me to dig into?" |

Then **stop talking.** Ending on a question hands them the wheel — exactly what the Round 2
judge wanted and did not get.

**The 60-second cut** (if they say "be quick"): rows 1, 4, 5. Map → letter → architecture.
**The 30-second cut** (if they cut you off at the start): "Wetlands became buildings — 28.1
hectares since 2018, from free satellite images. We show which season it happened and we
generate the complaint letter in Tamil. It is live, no server, ₹0 to run. What would you like
to see?"

---

## 14. Question bank — memorise the verdict, then stop

**Verdict in one sentence → one supporting fact → silence for two full seconds.** Most marks
are lost in the nervous sentence after the answer.

**Technical**

- *Tech stack?* — "Earth Engine and Python for the analysis, plain JavaScript and Leaflet for the site. No server, no framework."
- *Why no backend?* — "Everything is pre-computed. Nothing to run, nothing to crash, ₹0 to host."
- *What AI?* — "Google's Dynamic World. It labels every 10-metre square as water, marsh or built."
- *Did you train a model?* — "No, we use a validated one. Training our own with no ground truth would be weaker, and we would rather be right than impressive."
- *Accuracy?* — "86.7% on buildings, 36.8% on marsh. It under-detects marsh, so our number is a floor."
- *What is 10 metres?* — "One pixel covers 10 by 10 metres, about half a tennis court."
- *How do you know it is right?* — "62 automated tests on every push, and we checked the top ten by eye: nine real, one unclear."
- *What if it is wrong?* — "Every patch says 'possible change, needs a ground check'."
- *Why is it fast?* — "Small images first, full ones only on zoom, and a service worker caches it. After one visit it needs no network."
- *How do you avoid false positives?* — "Three filters: seasonal flooding, dry-season shadow, and moving shorelines within 30 metres of water. They cut 26 alerts to 5."
- *Why Leaflet?* — "42 kilobytes, and it runs on a cheap phone."
- *Why WebP label images?* — "Lossless, one exact colour per class, so the phone can read the class back from the pixel with no server call."

**Product and impact**

- *Who uses it?* — "Residents near the marsh, resident associations, NGOs, and the Corporation."
- *Who do you report to?* — "The Tamil Nadu State Wetland Authority, the Greater Chennai Corporation, or the Forest Department. The letter asks for an inspection and gives them the coordinates."
- *It is already approved, so why bother?* — "Most filling has no approval at all, and since September 2025 the NGT bars approvals within one kilometre of the marsh."
- *How is this different from TN-SWIP?* — "Theirs reports to officials. Ours is open to anyone, and we publish the data."
- *Business model?* — "Free for citizens. A paid dashboard for agencies and insurers. CSR from the OMR companies sitting on that water."
- *Why only Pallikaranai?* — "So every result could be checked by eye. The rule runs on any water body."
- *What happens after the letter?* — "The office has to log and inspect it, and you follow up with the reference number. We do not yet track what they do next — that is the honest gap."
- *Biggest weakness?* — "We cannot see a single house. Ten-metre pixels miss small dumping."
- *What is not built?* — "The photo check and the radar layer. We label them 'Coming' rather than fake them."
- *Why should we back you?* — "₹0 to run. Covering all of Tamil Nadu costs almost nothing."
- *Why Tamil?* — "The person who lives next to the marsh is the one who should be able to send the letter."

---

## 15. Phrases that are banned on stage

This is the direct fix for *"the answer should be clear."* Every phrase below delays the answer
or weakens it. Cut all of them.

**Never open an answer with:** "So what we did was…" · "Basically…" · "Actually…" · "The thing
is…" · "Let me explain…" · "To give you some background…" · "As I mentioned earlier…"

**Never say when interrupted:** "I was just getting to that" · "If you let me finish" · "That's
my next slide."

**Never hedge a fact you are sure of:** "I think it's around…" · "kind of" · "sort of" ·
"maybe" · "probably." You either know the number (§12) or you say "I would have to check."

**Never inflate:** "revolutionary" · "game-changing" · "disrupting" · "world-first" · "fully
automated" · "100% accurate." Judges discount everything after a word like that, and you have
real numbers that do the work better.

**Instead:** start with the noun and the verb. "The rule rejects three kinds of noise." "The
letter goes to the Wetland Authority." "It costs nothing to run." Short sentences are read as
confidence; long ones are read as hedging.

---

## 16. Who answers what

Round 2's visible failure was the team all reaching for the same question. Assign these before
you walk in, and write the names on the handout you keep.

| Role | Owns | Answers |
|---|---|---|
| **Driver** | the phone, the demo | runs §13, taps everything, says nothing else while others answer |
| **Architect** | §3, §11, §14 technical | stack, no-server, accuracy, false positives, Gemini |
| **Impact** | §14 product | who uses it, the authorities, the NGT rule, business model, Tamil |
| **Closer** | §12, the handout | numbers, limits, "what's not built", and hands over the page at the end |

**Rules:** one person answers one question. Nobody adds to a finished answer unless the judge
asks. If a question lands on the wrong person, the owner answers it — do not pass it around
verbally ("maybe you should take this"), just answer.

---

## 17. If the Round 2 judge is on the panel

Name it in the first fifteen seconds, once, and then never again:

> "You told us last round our answers should be clearer. So — short answers first, and I'll go
> deeper wherever you want."

Then do exactly that. This is a strong move, not a weak one: it shows you took feedback and
acted on it in a day, and it pre-commits you publicly to the brevity she asked for. Do not
apologise, do not explain Round 2, do not mention the score. One sentence, then get to work.

---

## 18. Practice protocol — 40 minutes, tonight, out loud

1. **10 min** — each person writes their own 0–15 s opener by hand, then says it aloud five
   times until it needs no thinking.
2. **20 min** — one person reads §14 at random and **deliberately interrupts at five seconds**.
   The answerer must land the verdict before being cut off. Rotate. This is the whole fix for
   Round 2.
3. **10 min** — record one round on a phone and listen back once. You will hear your own filler
   words from §15 immediately. That is the exercise.

Then run §13 twice on the real phone, the second time in airplane mode.

**Delivery mechanics, briefly:** stand still, speak to the judge who asked rather than to the
room, let the pause after your answer sit, and never read from the screen you are showing —
point at it and talk to them.

---

## 19. Contingency matrix

| If | Then |
|---|---|
| Venue Wi-Fi is dead | The service worker already cached it — open the shortcut anyway, and say "this is running with no network, which is the point." |
| The phone will not load at all | Play `demo.mp4` from local storage. It is 46 seconds and silent, so narrate it live. |
| The projector fails | Hand over the printed handout and talk to it. |
| The judge interrupts at 5 seconds | Answer the new question immediately. §15 applies. |
| The judge is silent and just stares | Ask: "Would you like the architecture or the impact first?" Do not fill silence with filler. |
| A judge finds a bug live | "Good catch — that is a bug, not a claim." Note it. Do not debug on stage. |
| You do not know an answer | "I do not know. Here is what I do know: …" Never invent a number. |
| Two of you start answering at once | The §16 owner continues. The other stops mid-word. |

---

## 20. Scoring map — what to point at for each published criterion

| Criterion | Point at | Say |
|---|---|---|
| Technical architecture & system design | About → the SVG diagram | "Heavy analysis once in the cloud, static files on the phone." |
| Component selection & justification | the why-this-part rows | "Free, validated, and the finest free optical resolution." |
| Implementation depth & integration | the Tamil letter, alert deep links, offline reload | "Every feature plugs into one documented API." |
| Technical efficiency & resource optimisation | the offline reload; 116 KB of JS | "₹0 to run, and it works with the network off." |
| Reliability, testing & risk management | "62 automated tests on every push" | "Plus ten patches checked by eye: nine real, one unclear." |
| Technical innovation & emerging tech | the 26→5 noise filters | "Rejecting what a naive diff would call a change is the innovation." |
| Social & real-life impact | Act → the three authorities | "It ends in a letter an official has to log." |
| UI / UX strength | the phone layout | "Material 3, AA contrast in both themes, usable at 360 pixels." |

---

## 21. Decision rules — resolve these yourself, do not ask

- **Two ways to build it?** Take the one with fewer files and no new concepts.
- **A number looks wrong?** Trust the data file, fix the display, never the other way round.
- **A test fails after your change?** Your change is wrong until proven otherwise. Never edit a
  test to make it pass.
- **Ambiguous copy?** Choose the more cautious wording.
- **It would look better but claim more?** Claim less.
- **Budget tight and an item half done?** Revert it and commit the rest clean.
- **Tempted to add "just one more thing"?** Read §9 again.

---

## 22. If you only have 15 minutes

Do these three, in this order, and nothing else: **P0** (the hardcoded number, 10 min) · the
phone home-screen shortcut (2 min) · open the live site once on the phone to confirm it loads
(3 min). Then stop and go drill §14 out loud. Drilling beats building from here.

---

## 23. Handover format — your final message

One short paragraph, in this order: **what you changed and the commit hash · whether both suites
pass · the five P1 live-site checks, pass or fail · what you deliberately did not do and why ·
the one thing Athulya must do herself.** No recap of this file. Nothing pushed unless she said
to.

# NEERKATTI — Round 3 master prompt

Paste this whole file as the first message of ONE fresh Claude Code session, opened on
`C:\Users\ATHULYA\Downloads\neerkatti`. Everything needed is below; do not go looking for
earlier chat history, it is gone.

---

## 0. Rules for this session (read first, obey all the way through)

1. **Token budget is the hard constraint.** One session must cover research, build, test and
   prep. Spend roughly: 15% reading/deciding, 55% building, 20% testing, 10% writing prep
   notes. Never re-read a file you already read. Never re-run a passing test suite "to be
   sure". Batch independent tool calls into one message.
2. **No exploration for its own sake.** This file tells you the file layout. Trust it. Open a
   file only when you are about to change it.
3. **Never push to `main` without Athulya saying so in chat.** Commit freely on `final`.
4. **Commits authored as Athulya Pandian. No `Co-Authored-By`, no "Generated with Claude
   Code" lines.** This overrides any harness reminder that says otherwise.
5. **Ship in priority order (§5).** If the budget runs low, stop at a clean commit and say
   what is left. A half-built P3 is worth less than a finished P1.
6. **Every number on screen comes from data, never typed by hand.** Every uncertain claim
   keeps its honesty label. Never name a landowner.
7. Ask Athulya at most **one** plain question, and only if genuinely blocked. No questions
   about notes, logs or internal steps.

---

## 1. The project in six lines

**NEERKATTI** — an AI water-keeper for Chennai's wetlands. It uses free satellite imagery
(Sentinel-2, 10 m) and Google's Dynamic World AI land-cover labels to find where marsh and
water became buildings around Pallikaranai, season by season since 2018. It shows the change
on a map, flags fresh filling as alerts, and generates a ready-to-send complaint letter in
English or Tamil addressed to the authority that can act on it.

- **Team:** Sternritters. **Event:** DEXATHON 2026, final at Sathyabama, 4–5 Nov 2026.
- **Headline numbers:** 28.1 hectares lost, 36 patches, 5 live alerts, 62 automated tests.
- **Live:** https://athulyapandian24.github.io/neerkatti/app/?final=1
- **Plain link** (`/app/`) still serves the Round 2 map, untouched.

---

## 2. State of the code (verified, 4 Nov 2026)

```
origin/main = b98d2f7   local final = b98d2f7   nothing unpushed   tree clean
```

Everything built so far is **live**. There is no pending push.

```
docs/                        GitHub Pages root — static, no server, no database, no API key
  app/
    index.html               boot script saves window.NKBootHash, loads final/* when ?final=1
    app.js                   Round 2 map core + window.NEERKATTI_API (setInsets, setCard,
                             watch, clear, home, state, actions; events select/season/clear/
                             watch/view)
    sw.js                    service worker, VERSION neerkatti-f-1, precaches final/*
                             !! the test extracts every '...' string here — no apostrophes
                                inside comments in the PRECACHE block
    vendor/leaflet*          Leaflet 1.9.4, vendored (BSD-2). No CDN scripts anywhere —
                             a test enforces this
    final/
      ui.js  ui.css          the Material 3 map-first layout (nav rail + side sheet on
                             laptop, bottom sheet + nav bar on phone; 5 destinations:
                             Overview, Alerts, Act, Impact, About)
      alerts.js              the alert layer, reads alerts.json
      complaint.js           the complaint letter, English / Tamil / both
      impact.js              the "Who it helps" card
      common.js              shared helpers, the NKFinal (F) namespace
    data/ alerts.json        5 alerts, each with a checked_by_eye note
analysis/                    Earth Engine + Python: the rule that produces the patches
serverless/photo-check/      Cloudflare Worker for the Gemini photo check — WRITTEN, NOT
                             DEPLOYED, and not published to Pages
deck/NEERKATTI_final_3min.pptx (+ .pdf)   the Round 2 technical deck
prep/                        this file
```

**Architecture in one sentence, memorise it:** the heavy analysis runs once in Google Earth
Engine and is baked into static files, so the site itself is plain HTML, CSS and JavaScript
with no server, no database and no API key — which is why it costs ₹0 to run, works offline
after one visit, and has nothing to hack. *(The one exception: the optional photo check calls
Gemini through a Cloudflare Worker. It is not deployed and not published. Say this out loud
before a judge finds it.)*

**Tests:** 43 Python + 19 JavaScript = 62, run on every push by GitHub Actions.
Run them with the scripts in `D:\neerkatti-work`. Local test server: launch config
`neerkatti-ui`, port 8793, from a shim copy made by `sh /d/neerkatti-work/tmp/sync_site.sh`.

---

## 3. The scores, and the real reason for the drop

| Round | Score | What it graded | What happened |
|---|---|---|---|
| 1 | **7/10** | problem, impact, pitch | Went well. The story landed. |
| 2 | **4/10** | technical architecture & innovation | Went badly. |

Round 2 did **not** go badly because the engineering is weak. It is not weak: no server, 62
tests, a rule that rejects false positives, offline support, a Tamil letter. It went badly
because of **how it was delivered**:

- The team presented a prepared 3-minute narrative. The judge wanted to **interrogate an
  architecture**. Those are different performances.
- The judge **interrupted before the point landed** and then said *"the answer should be
  clear"*. That is the single most useful sentence anyone said all day: it means the answers
  were built as explanation-then-conclusion, so when she cut in at five seconds she heard
  only preamble.
- Nothing was **on screen** for her to point at. A technical round scored on architecture
  with no architecture diagram visible is scored on vibes, and vibes lost.

So Round 3 has exactly three jobs, in this order: **be interruptible**, **be visible**,
**be honest**. Building more features is a distant fourth. A judge who interrupts is engaged —
the ones who have written you off let you finish politely.

---

## 4. What Round 3 is, and the format to run

Final round, bigger panel, demo plus questions. Assume **no uninterrupted monologue will be
possible**. So do not plan one.

**Open in 20 seconds, then hand them the wheel:**

> "NEERKATTI finds where Chennai's wetlands became buildings, from free satellite images and
> AI. 28.1 hectares, 36 patches, since 2018. It's live, on my phone, right now — and it writes
> the complaint letter. What would you like me to show you?"

Then every answer is three parts: **verdict in one sentence → one supporting fact → stop.**
Two full seconds of silence after the answer. Most marks are lost in the nervous sentence
afterwards. If interrupted: answer the new question immediately. Never *"I was just getting to
that."* Never restart from the top.

---

## 5. Build order for this session (stop wherever the budget runs out)

### P1 — An architecture view inside the app (the direct fix for the 4/10)

Add `docs/app/final/arch.js` (+ styles in `ui.css`), shown as a new card at the top of the
**About** destination, titled **"How it works"**.

- A **hand-built inline SVG** data-flow diagram, legible on a 360 px phone and on a projector,
  in the existing Material 3 tokens, working in light and dark:
  `Sentinel-2 (free, 10 m, every 5 days)` → `Dynamic World AI labels each 10 m square` →
  `Earth Engine: 9 years of dry-season composites` → `the rule: marsh→built, and reject
  seasonal/shadow/shoreline noise` → `static WebP label images + JSON` → `the phone: plain JS
  + Leaflet, offline after one visit` → `complaint letter (EN/TA)`.
- Under it, four one-line **"why this component"** rows, because Round 2 graded component
  justification: *Dynamic World — validated, so we do not train on no ground truth.
  Sentinel-2 — free and 5-daily, 10 m is the finest free optical. No server — nothing to run,
  nothing to hack, ₹0. Leaflet — 42 KB, works on a cheap phone.*
- A **"Limits"** row in the same card, stated plainly: 10 m pixels cannot see one house;
  Dynamic World detects marsh at 36.8% and buildings at 86.7%, so 28.1 ha is a floor, not a
  ceiling; the photo check and radar are not built.

Why this is P1: it puts the architecture **on screen** so a judge can point at it, it answers
"component selection & justification" without a speech, and the Limits row buys credibility
cheaply. Rule: no new dependency, no CDN, extend only through `window.NEERKATTI_API`.

### P2 — "What happens next" on the Act screen

Three numbered steps under the letter button: **you send it → the office has to log and
inspect it → you follow up with the reference number.** Plus one honest line: *we do not yet
track what the office does next.* Name the authorities: the Tamil Nadu State Wetland
Authority, the Greater Chennai Corporation, the Forest Department. This closes the "so what?"
loop that a judge will probe, and the honesty line pre-empts the question.

### P3 — The reel / demo video

**Athulya: confirm in one line what the reel is — my notes on it were lost on 29 Oct.**
Assuming it is a short screen-recorded demo video, integrate it as:
a 45-second silent MP4 at `docs/app/final/media/demo.mp4`, played in the About card behind a
poster image, `preload="none"` so it never costs a visitor bandwidth, with a text fallback.
Keep it under 4 MB and do **not** add it to the service worker precache. It doubles as the
demo if the venue Wi-Fi dies — which is its real value.

### P4 — A one-page handout

`prep/handout.pdf`, A4, one side: the diagram, the four numbers, the three authorities, the
limits, the live URL and a QR code to it. Print 5 copies. A judge who leaves holding your page
scores you again later, on their own.

### P5 — Photo check (only if Athulya supplies a Gemini key)

Blocked on her: a key from aistudio.google.com/apikey and a free Cloudflare account, pasted
into `wrangler secret put` by her, **never into chat**. `serverless/photo-check` is written.
The front end `final/report.js` is not. Do not start P5 before P1–P4 are committed — it is the
only item that can swallow a whole session.

### Always, before you stop

Run both suites, confirm 62 pass, check the layout at 1280 / 375 / 360 px and in dark mode,
commit on `final` with a plain message, and **ask before pushing**.

---

## 6. Question bank — memorise the verdict only

**Technical**

- *Tech stack?* — "Earth Engine and Python for the analysis, plain JavaScript and Leaflet for
  the site. No server, no framework."
- *Why no backend?* — "Everything is pre-computed. Nothing to run, nothing to crash, ₹0 to
  host."
- *What AI?* — "Google's Dynamic World. It labels every 10-metre square as water, marsh or
  buildings."
- *Did you train a model?* — "No — we use a validated one. Training our own with no ground
  truth would be weaker, and we would rather be right than impressive."
- *Accuracy?* — "86.7% on buildings, 36.8% on marsh. It under-detects marsh, so 28.1 hectares
  is a floor, not a ceiling."
- *What is 10 metres?* — "One pixel covers 10 by 10 metres, about half a tennis court."
- *How do you know it is right?* — "62 automated tests on every push. And we checked the top
  ten by eye: nine real, one unclear."
- *What if it is wrong?* — "Every patch says 'possible change, needs a ground check'. We never
  claim certainty."
- *You said no API keys, but you use Gemini?* — "The map and the evidence need no key. The
  optional photo check calls Gemini through a Cloudflare Worker — and it is not deployed yet."
- *Why is it fast?* — "Small images load first, full ones only on zoom, and a service worker
  caches it. After one visit it works with no network."

**Product and impact**

- *Who uses it?* — "Residents near the marsh, resident associations, NGOs, and the
  Corporation."
- *Who do you report to?* — "The State Wetland Authority, the Corporation, or the Forest
  Department. The letter asks for an inspection and gives them the coordinates."
- *It is already approved, so why bother?* — "Most filling has no approval at all. And since
  September 2025 the NGT bars approvals within one kilometre of the marsh."
- *Has anyone used it?* — "Not yet. It went live during this hackathon." *(Say it plainly.)*
- *How is this different from the government's TN-SWIP?* — "Theirs reports to officials. Ours
  is open to anyone, and we publish the data."
- *Business model?* — "Free for citizens. A paid dashboard for agencies and insurers. CSR from
  the OMR companies sitting on that water."
- *Why only Pallikaranai?* — "So every result could be verified by eye. The rule runs on any
  water body."

**Hostile**

- *Isn't this just a map?* — "The map is the evidence. The output is a complaint letter an
  official has to act on."
- *Google Maps shows this already.* — "Google Maps shows today. We show nine years, and
  exactly when it changed."
- *What is actually new?* — "Alerts within weeks of fresh filling, and a Tamil complaint
  letter. Both built for this final."
- *What did you build versus download?* — "The data is free. The rule, the filters, the site
  and the letter are ours."
- *Biggest weakness?* — "We cannot see a single house. Ten-metre pixels miss small dumping."
- *What is not built?* — "The photo check and the radar layer. We label them 'Coming' rather
  than fake them."
- *Why should we back you?* — "₹0 to run. Covering all of Tamil Nadu costs almost nothing."

Admitting a limit fast and without flinching reads as confidence. Judges remember it.

---

## 7. How to practise (40 minutes, do it tonight)

1. **10 min** — each person writes the 20-second opener by hand and says it aloud five times,
   until it needs no thinking.
2. **20 min** — one person reads questions from §6 at random and **deliberately interrupts at
   five seconds**. The answerer must land the verdict before being cut off. Rotate.
3. **10 min** — record one round on a phone and listen back once. You will hear your own
   filler words immediately. That is the whole exercise.

Also drill the demo on the actual phone, on mobile data, twice: open the link, tap one patch,
tap Letter, show the Tamil. If that is smooth, the round is already half won.

---

## 8. First message back to Athulya

One short paragraph: what you built, the commit, whether the tests pass, what you skipped and
why. No recap of this file.

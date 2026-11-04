"""Build prep/handout.pdf: one A4 side for the judges.

Every number comes from the data (docs/app/data), the tests, or the page's own accuracy note,
and the diagram is drawn by docs/app/final/arch.js itself, so the handout cannot drift from the site.
Needs: the qrcode package and Microsoft Edge. Run: .venv/Scripts/python.exe prep/make_handout.py
"""
import io, json, pathlib, re, shutil, subprocess, time

import qrcode
import qrcode.image.svg

ROOT = pathlib.Path(__file__).resolve().parents[1]
APP = ROOT / "docs" / "app"
URL = "https://athulyapandian24.github.io/neerkatti/app/?final=1"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

read = lambda p: (ROOT / p).read_text(encoding="utf-8")
data_js = read("docs/app/data/neerkatti_data.js")
alerts = json.loads(read("docs/app/data/alerts.json"))["alerts"]
py = len(re.findall(r"^    def test_", read("tests/test_consistency.py"), re.M))
js = len(re.findall(r"^test\(", read("tests/core.test.js"), re.M))
acc = re.search(r"[\d.]+% user's accuracy for buildings but only [\d.]+% producer's accuracy for marsh",
                read("docs/app/index.html")).group(0)

buf = io.BytesIO()
qrcode.make(URL, image_factory=qrcode.image.svg.SvgPathImage, box_size=10, border=0).save(buf)
qr = re.sub(r"^<\?xml[^>]*>", "", buf.getvalue().decode())

html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>NEERKATTI handout</title>
<style>
@page{{size:A4;margin:12mm}}
:root{{--md-font:"Segoe UI",Roboto,Arial,sans-serif;--md-surface-container-highest:#DCE4E4;--md-outline-variant:#B7CACA;
--md-primary-container:#ABEFED;--md-on-surface:#171D1C;--md-on-surface-variant:#394A49;--md-on-primary-container:#002020;
--md-outline:#687B7A;--md-primary:#006A69}}
body{{margin:0;font:400 10.5pt/1.4 var(--md-font);color:var(--md-on-surface)}}
h1{{margin:0;font:700 22pt/1.1 var(--md-font);color:var(--md-primary);letter-spacing:.5px}}
.tag{{margin:2px 0 10px;font-size:11.5pt}}
.grid{{display:grid;grid-template-columns:86mm 1fr;gap:7mm}}
.nums{{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin:0 0 6mm}}
.nums div{{background:#E9F1F0;border-radius:3mm;padding:2.5mm 3mm}}
.nums b{{display:block;font-size:17pt;color:var(--md-primary)}}
h2{{margin:4mm 0 1.5mm;font:600 11pt var(--md-font);color:var(--md-primary);text-transform:uppercase;letter-spacing:.6px}}
ul{{margin:0;padding-left:4.5mm}} li{{margin:0 0 1.2mm}}
.qr{{display:flex;gap:4mm;align-items:center;margin-top:5mm}} .qr svg{{width:30mm;height:30mm}}
.foot{{margin-top:4mm;font-size:8.5pt;color:var(--md-on-surface-variant)}}
.nk-arch-svg{{width:100%;height:auto;font-family:var(--md-font)}}
.nk-a-node rect{{fill:var(--md-surface-container-highest);stroke:var(--md-outline-variant)}}
.nk-a-node.ours rect{{fill:var(--md-primary-container);stroke:none}}
.nk-a-t{{font-size:14px;font-weight:600;fill:var(--md-on-surface)}} .nk-a-s{{font-size:12px;fill:var(--md-on-surface-variant)}}
.nk-a-who{{font-size:11px;fill:var(--md-on-surface-variant)}}
.nk-a-node.ours text{{fill:var(--md-on-primary-container)}}
.nk-a-arrow{{stroke:var(--md-outline);stroke-width:1.5}} .nk-a-arrow.net{{stroke-dasharray:4 3}} .nk-a-head{{fill:var(--md-outline)}}
.nk-a-cut{{stroke:var(--md-primary);stroke-width:1.5;stroke-dasharray:5 4}}
.nk-a-band{{font-size:10.5px;font-weight:600;letter-spacing:.8px;fill:var(--md-primary)}}
#src,.nk-arch>:not(.nk-arch-fig),.nk-demo{{display:none}}
.nk-arch-fig{{margin:0}} .nk-arch-key{{display:flex;gap:2mm;align-items:center;justify-content:center;margin-top:2mm;font-size:8.5pt;color:var(--md-on-surface-variant)}}
.nk-arch-key .k{{width:3mm;height:3mm;border-radius:1mm;background:var(--md-surface-container-highest);border:1px solid var(--md-outline-variant);margin-left:2mm}} .nk-arch-key .k.ours{{background:var(--md-primary-container);border-color:transparent;margin-left:0}}
.url{{white-space:nowrap;font-size:9.5pt}}
</style>
<script>{data_js}</script></head><body>
<h1>NEERKATTI</h1>
<p class="tag">An AI water-keeper for Chennai's wetlands · Team Sternritters · DEXATHON 2026</p>
<div class="nums" id="nums"></div>
<div class="grid">
  <div class="m3-view" data-view="about"><p id="src">{acc}</p></div>
  <div>
    <h2>What it does</h2>
    <p>Finds where Pallikaranai's marsh and water became buildings, season by season since <span id="y0"></span>,
    from free Sentinel-2 images and Google's Dynamic World AI. Flags fresh filling as alerts, and writes a complaint
    letter in English or Tamil to the office that can act, then an RTI follow-up if it is ignored. A citizen's photo
    from the site can be checked by Gemini 2.5 Flash-Lite.</p>
    <h2>Who the letter goes to</h2>
    <ul><li>Tamil Nadu State Wetland Authority</li><li>Greater Chennai Corporation</li><li>Tamil Nadu Forest Department</li></ul>
    <h2>Why it costs ₹0</h2>
    <p>The AI ran once, through Google Earth Engine's Python API. The website only reads the saved results: HTML, CSS
    and JavaScript, no server, no database. It works offline after one visit. The one live API call is the optional
    photo check, through our Worker, which holds the key.</p>
    <h2>Limits, said plainly</h2>
    <ul><li>A 10 m pixel cannot see one house; small dumping is missed.</li>
    <li id="acc"></li>
    <li>Every patch is a possible change that needs a ground check. NEERKATTI never names an owner.</li>
    <li>The photo check needs a connection, and one photo read by an AI is not proof.</li>
    <li>The radar layer is not built yet.</li></ul>
    <div class="qr">{qr}<div><b>Try it live</b><br><span class="url">{URL.replace("https://", "")}</span><br>Open on any phone. No sign-in.</div></div>
  </div>
</div>
<p class="foot">{py + js} automated tests run on every push · data: Copernicus Sentinel-2, Dynamic World (Brown et al. 2022), OpenStreetMap ·
code: github.com/ATHULYAPANDIAN24/neerkatti</p>
<script>
var m = window.NEERKATTI.meta, esc = function (s) {{ return String(s).replace(/[&<>"]/g, function (c) {{ return '&#' + c.charCodeAt(0) + ';'; }}); }};
window.NKFinal = {{ on: true, api: {{ data: window.NEERKATTI }}, esc: esc }};
document.getElementById('nums').innerHTML = [[m.lost_ha + ' ha', 'of marsh and water lost'], [m.patch_count, 'patches flagged'],
  [{len(alerts)}, 'live alerts'], [{py + js}, 'automated tests']].map(function (n) {{ return '<div><b>' + n[0] + '</b>' + n[1] + '</div>'; }}).join('');
document.getElementById('y0').textContent = m.timeline_years[0];
var a = document.getElementById('src').textContent.match(/([\\d.]+)%[^\\d]+([\\d.]+)%/);
document.getElementById('acc').textContent = 'Dynamic World is right about buildings ' + a[1] + '% of the time but catches only ' + a[2] +
  '% of marsh, so ' + m.lost_ha + ' ha is a floor, not a ceiling.';
</script>
<script>{read("docs/app/final/arch.js")}</script>
</body></html>"""

out = ROOT / "prep" / "handout.html"
out.write_text(html, encoding="utf-8")
pdf = ROOT / "prep" / "handout.pdf"
pdf.unlink(missing_ok=True)
subprocess.run([EDGE, "--headless=new", "--disable-gpu", "--user-data-dir=" + str(ROOT / ".edge-print"), "--virtual-time-budget=3000", "--no-pdf-header-footer", f"--print-to-pdf={pdf}", out.as_uri()], check=True)
for _ in range(40):  # Edge hands the job to a background process and returns at once
    if pdf.is_file() and pdf.stat().st_size:
        break
    time.sleep(0.5)
time.sleep(1)
shutil.rmtree(ROOT / ".edge-print", ignore_errors=True)
print("wrote", pdf, pdf.stat().st_size, "bytes")

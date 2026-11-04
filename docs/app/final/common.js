// NEERKATTI final round (DEXATHON 2026, 4–5 Nov): what the files in final/ share.
// Each final-round feature lives in its own file and talks to the map only through
// window.NEERKATTI_API (app.js), as docs/FINAL_ROUND_PLAN.md says. Until they are
// stable they are switched on with ?final=1 (remembered on this device; ?final=0 turns
// them off again), so the published Round 2 map stays as it was judged.
(function () {
  var api = window.NEERKATTI_API;
  var params = new URLSearchParams(location.search);

  function store(key, value) {
    try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); } catch (e) { return null; }
  }
  if (params.get('final') === '1') store('neerkatti-final', '1');
  if (params.get('final') === '0') store('neerkatti-final', '0');
  var on = !!api && store('neerkatti-final') === '1';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pct(x) { return Math.round(x * 100) + '%'; }
  function acres(x) { var a = x * 2.471; return a >= 10 ? String(Math.round(a)) : a.toFixed(1); }

  // The map's own address, so a letter or an alert can link back to one patch
  var base = location.origin + location.pathname;

  // A patch from the map, as the letter and the photo check need it
  function siteOfPatch(p) {
    var core = api.core;
    var zone = api.data.meta.marsh.zone_m;
    return {
      kind: 'patch',
      id: String(p.rank),
      label: 'patch ' + p.rank,
      place: core.nameOf(p),
      lat: p.lat, lon: p.lon,
      area_ha: p.area_ha,
      since: core.builtFrom(p),
      marsh: core.marshStatus(p, zone),
      marsh_share: p.marsh_share,
      marsh_distance_m: p.marsh_distance_m,
      wet_monsoon: p.wet_monsoon,
      checked: !!p.checked_by_eye,
      closeup: 'data/closeups/patch_' + (p.rank < 10 ? '0' : '') + p.rank + '.jpg',
      link: base + '#patch-' + p.rank
    };
  }

  // Load a web font only when a feature needs it (Tamil for the letter); the offline copy keeps it
  var fonts = {};
  function font(href) {
    if (fonts[href]) return;
    fonts[href] = true;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  var F = window.NKFinal = { on: on, api: api, store: store, esc: esc, pct: pct, acres: acres, base: base, siteOfPatch: siteOfPatch, font: font };
  if (!on) return;
  document.documentElement.classList.add('nk-final');

  // The panel and the intro say what the final round has built so far, feature by feature.
  // Each feature's file marks itself live (F.live) once it has loaded.
  var FEATURES = [
    { id: 'alerts', text: 'Alerts for new changes, first inside the protected zone', go: '#alerts' },
    { id: 'letter', text: 'Complaint letter in Tamil and English, from any patch or alert' },
    { id: 'photo', text: 'Citizen photo check by a vision model' },
    { id: 'radar', text: 'Sentinel-1 radar through monsoon clouds' }
  ];
  var live = {};
  function phaseHtml() {
    return FEATURES.map(function (f) {
      return '<li class="' + (live[f.id] ? 'nk-live' : 'nk-soon') + '"><span class="nk-mark" aria-hidden="true">' + (live[f.id] ? '✓' : '…') + '</span>' +
        (live[f.id] && f.go ? '<a href="' + f.go + '">' + esc(f.text) + '</a>' : esc(f.text)) +
        '<span class="sr">' + (live[f.id] ? ' (working now)' : ' (being built)') + '</span></li>';
    }).join('');
  }
  function paint() {
    var col = document.querySelector('.phase .phase-col:last-child');
    if (col) col.innerHTML = '<span class="st final">Final round · built 4–5 Nov</span><ul class="nk-phase">' + phaseHtml() + '</ul>';
    var intro = document.querySelector('.intro-cols > div:last-child');
    if (intro) intro.innerHTML = '<span class="st final">Final round · built 4–5 Nov</span><ul class="nk-phase">' + phaseHtml() + '</ul>' +
      '<p class="tiny">Built during the 24-hour final, as the rules ask. Ticked features work now; the others are on the way.</p>';
    var tag = document.querySelector('.bar-tag');
    if (tag) tag.textContent = "AI water-keeper for Chennai's wetlands · Final round prototype";
    var kick = document.querySelector('.intro .kicker');
    if (kick) kick.textContent = 'DEXATHON 2026 · Team Sternritters · Final round prototype';
  }
  F.live = function (id) { live[id] = true; paint(); };
  paint();
})();

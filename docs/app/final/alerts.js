// NEERKATTI final round: alerts for new changes, first inside the protected marsh's 1 km zone.
// data/alerts.json is written by analysis/new_changes.py: water or marsh in the 2026 dry
// season that shows buildings or bare earth in clear satellite images since June. Each alert
// is drawn on the map, listed in the panel with what it is next to, and can be turned into a
// complaint letter or a photo check. data/alerts.xml is the same list as an RSS feed.
(function () {
  var F = window.NKFinal;
  if (!F || !F.on) return;
  var api = F.api, map = api.map, esc = F.esc;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MONTHS_TA = ['ஜனவரி', 'பிப்ரவரி', 'மார்ச்', 'ஏப்ரல்', 'மே', 'ஜூன்', 'ஜூலை', 'ஆகஸ்ட்', 'செப்டம்பர்', 'அக்டோபர்', 'நவம்பர்', 'டிசம்பர்'];
  function parts(iso) { var d = iso.split('-'); return { y: d[0], m: +d[1] - 1, d: +d[2] }; }
  function short(iso) { var p = parts(iso); return p.d + ' ' + MONTHS[p.m]; }
  function long(iso, ta) { var p = parts(iso); return p.d + ' ' + (ta ? MONTHS_TA : MONTHS_LONG)[p.m] + ' ' + p.y; }
  var WHERE = { inside: 'Inside the protected marsh', zone: 'Within 1 km of the marsh', outside: 'Outside the 1 km zone' };
  var STYLE = { color: '#F2842F', weight: 2.5, fillColor: '#F2842F', fillOpacity: 0.35, dashArray: '5 4' };
  var ON = { color: '#FFD400', weight: 3, fillColor: '#F2842F', fillOpacity: 0.55, dashArray: null };

  var data = null, byId = {}, layer = null, pins = null, popup = L.popup({ maxWidth: 310, minWidth: 260, autoPanPadding: [16, 16] });

  // ---- the panel card: how many, where, and the list -----------------------------------
  var card = document.createElement('section');
  card.className = 'chart-card nk-alerts';
  card.id = 'alerts';
  card.setAttribute('aria-labelledby', 'nk-alerts-title');
  card.innerHTML = '<p class="kicker">New in the final · alerts</p><h2 id="nk-alerts-title">Possible new changes since May 2026</h2>' +
    '<p class="small" id="nk-alerts-lead">Checking the newest satellite images…</p><ol class="nk-alert-list" id="nk-alert-list"></ol>' +
    '<p class="small nk-alerts-foot" id="nk-alerts-foot" hidden></p>';
  var panel = document.getElementById('panel');
  var after = panel.querySelector('.caveat');
  panel.insertBefore(card, after ? after.nextSibling : panel.firstChild);

  // a toolbar switch beside "Flagged", so alerts can be hidden like the patches
  var checks = document.querySelector('.toolbar .checks');
  var toggle = document.createElement('label');
  toggle.className = 'chk nk-chk';
  toggle.innerHTML = '<input type="checkbox" id="show-alerts" checked> Alerts';
  if (checks) checks.insertBefore(toggle, checks.children[1] || null);

  function siteOf(a) {
    return {
      kind: 'alert', id: a.id, label: 'alert ' + a.id, place: a.place, lat: a.lat, lon: a.lon,
      area_ha: a.area_ha, marsh: a.marsh, marsh_share: a.marsh_share, marsh_distance_m: a.marsh_distance_m,
      wet_monsoon: null, checked: false, closeup: a.closeup || null, after: a.last_seen,
      link: F.base + '?final=1#alert-' + a.id,
      seen_text: a.times_seen + ' of ' + a.clear_looks + ' clear satellite images taken since June 2026, the first on ' + long(a.first_seen),
      seen_text_ta: 'ஜூன் 2026 முதல் எடுக்கப்பட்ட ' + a.clear_looks + ' தெளிவான செயற்கைக்கோள் படங்களில் ' + a.times_seen + ' படங்களில் (முதலில் ' + long(a.first_seen, true) + ')',
      after_text: long(a.last_seen), after_text_ta: long(a.last_seen, true)
    };
  }
  F.siteOfAlert = siteOf;

  function popupHtml(a) {
    return '<div class="pop nk-alert-pop">' +
      '<div class="pop-title"><span class="nk-alert-tag">Alert ' + esc(a.id) + '</span> ' + esc(a.place) + '</div>' +
      '<div class="pop-ha">' + a.area_ha.toFixed(2) + ' ha <span>≈ ' + F.acres(a.area_ha) + ' acres</span></div>' +
      (a.closeup ? '<figure class="pop-fig"><a href="' + esc(a.closeup) + '" target="_blank" rel="noopener" title="Open the close-up full size">' +
        '<img src="' + esc(a.closeup) + '" width="640" height="317" alt="Alert ' + esc(a.id) + ' close-up: the 2026 dry season on the left, ' + esc(long(a.last_seen)) + ' on the right with the alert outlined in red">' +
        '<span class="year-tag before">Feb–May 2026</span><span class="year-tag after">' + esc(short(a.last_seen)) + '</span></a>' +
        '<figcaption>600&nbsp;m around the alert, outlined in red</figcaption></figure>' : '') +
      '<p>Water or marsh in the 2026 dry season → buildings or bare earth in <b>' + a.times_seen + ' of ' + a.clear_looks + '</b> clear looks since June, first on <b>' + esc(long(a.first_seen)) + '</b>.</p>' +
      '<ul class="ctx"><li class="marsh ' + a.marsh + '">' + (a.marsh === 'inside' ? '<b>' + (a.marsh_share >= 0.99 ? 'Inside' : F.pct(a.marsh_share) + ' inside') + '</b> the protected marsh outline'
        : a.marsh === 'zone' ? '<b>' + api.core.formatDistance(a.marsh_distance_m) + '</b> from the protected marsh, inside the 1 km zone' : api.core.formatDistance(a.marsh_distance_m) + ' from the protected marsh') + '</li></ul>' +
      '<div class="pop-acts"><button type="button" class="btn ghost pop-act nk-act" data-nk="letter" data-id="' + esc(a.id) + '">Draft a complaint letter</button>' +
      (F.report ? '<button type="button" class="btn ghost pop-act nk-act" data-nk="report" data-id="' + esc(a.id) + '">Report what you see</button>' : '') + '</div>' +
      '<div class="pop-foot"><span class="pill check">Possible change, needs a ground check</span>' +
      '<a href="https://www.google.com/maps/@' + a.lat + ',' + a.lon + ',400m/data=!3m1!1e3" target="_blank" rel="noopener">Google Maps (satellite) →</a></div></div>';
  }

  var current = null;
  function restyle() {
    if (!layer) return;
    layer.eachLayer(function (l) { l.setStyle(l.feature.properties.id === current ? ON : STYLE); });
  }
  function show(id, fly) {
    var a = byId[id];
    if (!a) return;
    current = id;
    restyle();
    markList();
    popup.setLatLng([a.lat, a.lon]).setContent(popupHtml(a));
    var open = function () { popup.openOn(map); };
    if (fly) {
      map.flyTo([a.lat, a.lon], Math.max(map.getZoom(), 16), { duration: 0.8 });
      map.once('moveend', open);
    } else open();
  }
  map.on('popupclose', function (e) { if (e.popup === popup) { current = null; restyle(); markList(); } });
  popup.on('add', function () {
    var el = popup.getElement();
    if (!el || el.nkWired) return;
    el.nkWired = true;
    el.addEventListener('click', function (ev) {
      var b = ev.target.closest('.nk-act');
      if (!b) return;
      var a = byId[b.dataset.id];
      if (b.dataset.nk === 'letter' && F.letter) F.letter(siteOf(a));
      if (b.dataset.nk === 'report' && F.report) F.report(siteOf(a));
    });
  });

  function markList() {
    document.querySelectorAll('.nk-alert-row').forEach(function (b) { b.setAttribute('aria-current', String(b.dataset.id === current)); });
  }
  function listHtml(list) {
    return list.map(function (a) {
      return '<li><button type="button" class="nk-alert-row" data-id="' + esc(a.id) + '" aria-current="false">' +
        '<span class="nk-alert-id">' + esc(a.id) + '</span><span class="nk-alert-place">' + esc(a.place) + '</span>' +
        '<span class="nk-alert-ha">' + a.area_ha.toFixed(2) + ' ha</span>' +
        '<span class="nk-alert-meta"><span class="pill nk-where ' + a.marsh + '">' + WHERE[a.marsh] + '</span>' +
        '<span>First seen ' + esc(short(a.first_seen)) + ' · ' + a.times_seen + ' of ' + a.clear_looks + ' clear looks</span></span></button></li>';
    }).join('');
  }

  function draw(d) {
    data = d;
    var list = d.alerts || [];
    list.forEach(function (a) { byId[a.id] = a; });
    var inZone = list.filter(function (a) { return a.marsh !== 'outside'; }).length;
    var days = d.clear_days || [];
    var lastDay = days.length ? days[days.length - 1] : null;
    var checked = days.length + ' clear day' + (days.length === 1 ? '' : 's') + ' of images since June' + (lastDay ? ', the latest on ' + long(lastDay) : '');
    document.getElementById('nk-alerts-lead').innerHTML = list.length
      ? '<b>' + list.length + ' possible new change' + (list.length === 1 ? '' : 's') + '</b>, <b>' + inZone + '</b> of them in or within 1&nbsp;km of the protected marsh. Checked in ' + esc(checked) + '. Tap one to see it, then draft a complaint or report what you see.'
      : 'No new changes found in ' + esc(checked) + '. Monsoon clouds hide the ground for weeks at a time, so the next clear day may still show one.';
    document.getElementById('nk-alert-list').innerHTML = listHtml(list);
    var foot = document.getElementById('nk-alerts-foot');
    foot.hidden = false;
    foot.innerHTML = 'The rule: ' + esc(d.rule) + '. Every alert is a possible change that needs a ground check. ' +
      '<a href="data/alerts.xml">Follow the alerts (RSS)</a> · <a href="data/alerts.json">Data (JSON)</a> · made ' + esc(long(d.made.slice(0, 10))) + '.';

    layer = L.geoJSON({ type: 'FeatureCollection', features: list.map(function (a) { return { type: 'Feature', properties: { id: a.id }, geometry: a.geometry }; }) }, {
      style: function () { return STYLE; },
      onEachFeature: function (f, l) { l.on('click', function (e) { L.DomEvent.stop(e); show(f.properties.id, false); }); }
    }).addTo(map);
    pins = L.layerGroup(list.map(function (a) {
      var pin = L.marker([a.lat, a.lon], {
        icon: L.divIcon({ className: 'nk-alert-pin', html: '<span>' + esc(a.id) + '</span>', iconSize: [30, 22], iconAnchor: [15, 26] }),
        title: 'Alert ' + a.id + ', ' + a.place + ', ' + a.area_ha.toFixed(2) + ' ha', alt: 'Alert ' + a.id, riseOnHover: true
      });
      pin.on('click', function () { show(a.id, true); });
      return pin;
    })).addTo(map);

    var m = /^#alert-(A\d+)$/.exec(location.hash);
    if (m && byId[m[1]]) setTimeout(function () { show(m[1], true); }, 400);
  }

  document.getElementById('nk-alert-list').addEventListener('click', function (e) {
    var b = e.target.closest('.nk-alert-row');
    if (!b) return;
    document.getElementById('map-wrap').scrollIntoView({ block: 'start' });
    show(b.dataset.id, true);
  });
  document.getElementById('show-alerts').addEventListener('change', function (e) {
    [layer, pins].forEach(function (l) { if (l) { if (e.target.checked) l.addTo(map); else map.removeLayer(l); } });
  });

  fetch('data/alerts.json', { cache: 'no-cache' }).then(function (r) {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }).then(draw).catch(function () {
    document.getElementById('nk-alerts-lead').textContent = 'The alert list could not be loaded. Check the connection and reload the page.';
  });
  F.showAlert = show;
  F.live('alerts');
})();

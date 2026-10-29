// NEERKATTI live map (Round 2 prototype).
// Data comes from data/neerkatti_data.js (analysis/app_assets.py, patch_details.py,
// year_by_year.py and context_layers.py); plain helpers are in core.js, which
// tests/core.test.js checks.
(function () {
  var D = window.NEERKATTI;
  var core = window.NKCore;
  var meta = D.meta;
  var all = D.patches.features.map(function (f) { return f.properties; });
  var top10 = D.patches.features.slice(0, 10);
  var YEARS = meta.timeline_years.map(String);   // '2018' … '2026', every dry season on the map
  var FIRST = YEARS[0], LAST = YEARS[YEARS.length - 1];
  var ZONE = meta.marsh.zone_m;
  var narrow = window.matchMedia('(max-width: 899px)');
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  var params = new URLSearchParams(location.search);
  // mode 'compare': `left` | `right` either side of the divider; mode 'single': one season, `year`
  var state = { mode: 'compare', left: FIRST, right: LAST, year: LAST, view: 'photo', pos: 0.5, patches: true, marsh: false };
  var map = null;
  var mapApi = null;   // set once the map has started: pick, fitRanks, showYou, showYear, showMarsh, showFlood

  // Keep a copy on the device, so the map opens without a connection (sw.js)
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }

  // ---- helpers ------------------------------------------------------------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ha(x) { return x.toFixed(2); }
  function ha1(x) { return x.toFixed(1); }
  function pct(x) { return Math.round(x * 100) + '%'; }
  function acres(x) { var a = x * 2.471; return a >= 10 ? Math.round(a) : a.toFixed(1); }
  function gmaps(p) { return 'https://www.google.com/maps/@' + p.lat + ',' + p.lon + ',400m/data=!3m1!1e3'; }
  function placeOf(p) { return esc(core.nameOf(p)); }
  function closeup(rank) { return 'data/closeups/patch_' + (rank < 10 ? '0' : '') + rank + '.jpg'; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function $(id) { return document.getElementById(id); }
  function sum(list) { return list.reduce(function (s, p) { return s + p.area_ha; }, 0); }
  function store(key, value) {
    try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); } catch (e) { return null; }
  }
  function scrollToEl(el) { el.scrollIntoView({ behavior: calm.matches ? 'auto' : 'smooth', block: 'start' }); }

  // The images on the map: a dry season ('2018' … '2026') or the day after the floods ('monsoon')
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var floodDay = (function (d) { return +d[2] + ' ' + MONTHS[+d[1] - 1] + ' ' + d[0]; })(meta.monsoon.date.split('-'));
  function isKey(k) { return k === 'monsoon' || YEARS.indexOf(k) >= 0; }
  function keyName(k) { return k === 'monsoon' ? floodDay : k; }
  function keyLong(k) { return k === 'monsoon' ? floodDay + ', after the floods' : 'Feb–May ' + k; }

  // Flagged hectares built over for good by the end of each season (square by square, year_by_year.py)
  var builtBy = {};
  YEARS.reduce(function (acc, y) { builtBy[y] = acc + (meta.built_since_ha[y] || 0); return builtBy[y]; }, 0);

  // ---- side panel (filled first, so it works even if the map cannot start) --
  function setText(key, text) {
    document.querySelectorAll('[data-stat="' + key + '"]').forEach(function (el) { el.textContent = text; });
  }
  var recentHa = ['2023', '2024', '2025'].reduce(function (s, y) { return s + (meta.built_since_ha[y] || 0); }, 0);
  var nearMarsh = all.filter(function (p) { return core.marshStatus(p, ZONE) !== 'outside'; });
  var floodWet = all.filter(function (p) { return p.wet_monsoon !== null && p.wet_monsoon >= 0.5; });
  setText('lost', meta.lost_ha.toFixed(1) + ' ha');
  setText('acres', '≈' + Math.round(meta.lost_ha * 2.471) + ' acres flagged');
  setText('count', String(meta.patch_count));
  setText('recent', Math.round(recentHa / meta.lost_ha * 100) + '%');
  setText('near-marsh', nearMarsh.length + ' of ' + all.length);
  setText('flood-wet', String(floodWet.length));
  document.querySelector('[data-meta="photos"]').textContent =
    'Sentinel-2 photos: median of the clear Feb–May images of each year (' + YEARS.map(function (y) { return meta.s2_images[y]; }).join(', ') +
    ' images, ' + FIRST + '–' + LAST + '), and one image from ' + floodDay + '.';

  var note = $('map-note');
  function setNote(text, isError) {
    note.textContent = text;
    note.hidden = !text;
    note.classList.toggle('error', !!isError);
  }
  function connection() {
    if (!navigator.onLine) setNote('Offline: showing the copy saved on this device.');
    else if (/^Offline/.test(note.textContent)) setNote('');
  }
  window.addEventListener('online', connection);
  window.addEventListener('offline', connection);

  // ---- the patch list: top 10 or all, sorted, filtered, or nearest first --------
  var list = $('spots');
  // filter: null, {kind: 'area', value: 'Perungudi zone'} or {kind: 'marsh', value: 'inside' | 'zone' | 'outside'}
  var listState = { scope: 'top', sort: 'size', filter: null, from: null };
  var current = -1;   // rank of the selected patch
  var MARSH_TEXT = { inside: 'Overlap the outline', zone: 'Within 1 km', outside: 'Farther away' };
  var MARSH_TITLE = {
    inside: 'Patches overlapping the protected marsh',
    zone: 'Patches within 1 km of the protected marsh',
    outside: 'Patches farther than 1 km from the marsh'
  };

  function confPill(p, short) {
    var level = p.ai_confidence;
    return '<span class="pill conf ' + level + '">' + cap(level) + (short ? '' : ' AI confidence') + '</span>';
  }
  function away(p) {
    return core.formatDistance(core.distance(listState.from.lat, listState.from.lon, p.lat, p.lon)) + ' away';
  }
  function rowHtml(p) {
    return '<button type="button" class="spot" data-rank="' + p.rank + '" aria-current="false">' +
      '<span class="rank' + (p.rank > 10 ? ' minor' : '') + '">' + p.rank + '</span>' +
      '<span class="name">' + placeOf(p) + '</span>' +
      '<span class="ha">' + ha(p.area_ha) + ' ha</span>' +
      '<span class="meta">' + (p.site ? '<span class="pill site">Site ' + p.site + '</span>' : '') +
      '<span>' + (p.finding ? esc(p.finding) : 'Not checked by eye yet') + '</span>' + confPill(p) +
      '<span class="since">Built over since ' + core.builtFrom(p) + '</span>' +
      (listState.from ? '<span class="dist">' + away(p) + '</span>' : '') + '</span>' +
      '</button>';
  }
  function markList(rank) {
    current = rank;
    list.querySelectorAll('.spot').forEach(function (b) {
      b.setAttribute('aria-current', String(+b.dataset.rank === rank));
    });
  }
  function pick(p) {
    if (!mapApi) { window.open(gmaps(p), '_blank', 'noopener'); return; }
    mapApi.pick(p.rank);
  }
  function passes(p, f) {
    if (!f) return true;
    if (f.kind === 'area') return (p.admin_area || 'Unnamed area') === f.value;
    return core.marshStatus(p, ZONE) === f.value;
  }
  var SORTS = { since: function (items) {
    return items.slice().sort(function (a, b) { return core.builtFrom(b) - core.builtFrom(a) || a.rank - b.rank; });
  } };
  function renderList() {
    var f = listState.filter;
    var items = all.filter(function (p) { return f ? passes(p, f) : listState.scope === 'all' || p.rank <= 10; });
    items = SORTS[listState.sort] ? SORTS[listState.sort](items) : core.sortPatches(items, listState.sort, listState.from);
    list.innerHTML = '';
    items.forEach(function (p) {
      var li = document.createElement('li');
      li.innerHTML = rowHtml(p);
      li.firstChild.addEventListener('click', function () { pick(p); });
      list.appendChild(li);
    });
    $('list-title').textContent = f ? (f.kind === 'area' ? 'Flagged patches in ' + f.value : MARSH_TITLE[f.value])
      : listState.scope === 'all' ? 'All ' + all.length + ' flagged patches' : 'Top 10 flagged patches';
    $('filter').hidden = !f;
    if (f) $('filter-text').textContent = items.length + (items.length === 1 ? ' patch, ' : ' patches, ') + ha(sum(items)) + ' ha in all. ';
    document.querySelectorAll('.hbar').forEach(function (b) {
      b.setAttribute('aria-pressed', String(!!f && b.dataset.kind === f.kind && b.dataset.value === f.value));
    });
    markList(current);
  }
  function setScope(scope) {
    listState.scope = scope;
    var input = document.querySelector('input[name="scope"][value="' + scope + '"]');
    if (input) input.checked = true;
  }
  document.querySelectorAll('input[name="scope"]').forEach(function (r) {
    r.addEventListener('change', function () { listState.scope = r.value; listState.filter = null; renderList(); });
  });
  $('sort').addEventListener('change', function (e) { listState.sort = e.target.value; renderList(); });
  $('filter-clear').addEventListener('click', function () { listState.filter = null; renderList(); });
  renderList();

  // ---- bar charts that filter the list: by zone or village, by distance to the marsh --
  function hbarsHtml(kind, groups, cls) {
    var most = Math.max.apply(null, groups.map(function (g) { return g.ha; }));
    return groups.map(function (g) {
      var n = g.ranks.length;
      return '<button type="button" class="hbar' + (cls ? ' ' + cls : '') + '" data-kind="' + kind + '" data-value="' + esc(g.value) + '" aria-pressed="false">' +
        '<span class="hbar-name">' + esc(g.label) + '<small>' + n + (n === 1 ? ' patch' : ' patches') + '</small></span>' +
        '<span class="hbar-track" aria-hidden="true"><i style="width:' + (g.ha / most * 100).toFixed(1) + '%"></i></span>' +
        '<span class="hbar-val">' + ha(g.ha) + ' ha</span></button>';
    }).join('');
  }
  function wireBars(box, fit) {
    box.querySelectorAll('.hbar').forEach(function (b) {
      b.addEventListener('click', function () {
        var f = listState.filter;
        var same = f && f.kind === b.dataset.kind && f.value === b.dataset.value;
        listState.filter = same ? null : { kind: b.dataset.kind, value: b.dataset.value };
        if (listState.filter) setScope('all');   // a filter lists all of its patches, not just its top-10 ones
        renderList();
        if (!listState.filter) return;
        scrollToEl($('list-title'));
        if (mapApi) fit(all.filter(function (p) { return passes(p, listState.filter); }).map(function (p) { return p.rank; }));
      });
    });
  }
  var areas = core.byArea(all).map(function (a) { return { value: a.area, label: a.area, ha: a.ha, ranks: a.ranks }; });
  $('areas').innerHTML = hbarsHtml('area', areas);
  wireBars($('areas'), function (ranks) { mapApi.fitRanks(ranks); });

  // inside the outline counts the flagged land inside it; the other rows count whole patches
  var marshGroups = ['inside', 'zone', 'outside'].map(function (k) {
    var ps = all.filter(function (p) { return core.marshStatus(p, ZONE) === k; });
    return { value: k, label: MARSH_TEXT[k], ha: sum(ps), ranks: ps.map(function (p) { return p.rank; }) };
  });
  $('marsh-bars').innerHTML = hbarsHtml('marsh', marshGroups, 'marsh-bar');
  wireBars($('marsh-bars'), function (ranks) { mapApi.showMarsh(ranks); });

  // ---- when the 28.1 ha was built over: hectares per season, tap to see it ----------
  var sinceYears = YEARS.slice(1, -1);   // 2019 … 2025: 2018 is the baseline, and 2026 adds none by the rule
  var sinceMost = Math.max.apply(null, sinceYears.map(function (y) { return meta.built_since_ha[y] || 0; }));
  var sinceChart = $('since-chart');
  sinceChart.innerHTML = sinceYears.map(function (y) {
    var v = meta.built_since_ha[y] || 0, recent = +y >= 2023;
    return '<button type="button" class="col' + (recent ? ' on' : '') + '" data-year="' + y + '" aria-label="' + y + ': ' + v.toFixed(1) +
      ' ha first built over. Show this season on the map">' +
      '<span class="col-val">' + v.toFixed(1) + '</span>' +
      '<span class="col-bar" style="height:' + (v / sinceMost * 80).toFixed(1) + 'px"></span>' +
      '<span class="col-year">' + y + '</span></button>';
  }).join('');
  sinceChart.querySelectorAll('.col').forEach(function (b) {
    b.addEventListener('click', function () { if (mapApi) mapApi.showYear(b.dataset.year); });
  });
  $('since-take').innerHTML = '<b>' + recentHa.toFixed(1) + '&nbsp;ha, ' + Math.round(recentHa / meta.lost_ha * 100) +
    '% of it, in the last three seasons (2023–2025).</b> The filling is speeding up.';

  // ---- after the floods -------------------------------------------------------
  $('flood-text').innerHTML = 'A dry-season image shows the marsh at its smallest. On <b>' + floodDay + '</b>, the clearest image after ' +
    'Chennai\'s November 2021 floods, the AI labels at least <b>' + Math.round(meta.monsoon.wet_ha).toLocaleString('en-IN') +
    '&nbsp;ha</b> of the study area water or marsh, against ' + Math.round(meta.wet_ha_before).toLocaleString('en-IN') +
    '&nbsp;ha in the 2018 dry season. <b>' + floodWet.length + ' of the flagged patches</b> (' + ha1(sum(floodWet)) +
    '&nbsp;ha) were still at least half water or marsh that day. All of them are buildings now.';

  // ---- what the lost marsh could hold: a what-if with a depth the reader picks ------
  var depth = $('depth');
  function storageText() {
    var d = +depth.value, s = core.storage(meta.lost_ha, d);
    $('depth-out').textContent = d + ' m';
    $('calc-litres').textContent = core.indianLitres(s.litres);
    $('calc-pools').textContent = 'about ' + Math.round(s.pools).toLocaleString('en-IN') + ' Olympic swimming pools, over ' + meta.lost_ha + ' ha at ' + d + ' m';
  }
  depth.addEventListener('input', storageText);
  storageText();

  // ---- why these years: Dynamic World images per dry season --------------------
  var perYear = meta.dw_images_by_year || {};
  var used = [meta.years[0], meta.years[1] - 1, meta.years[1]].map(String);
  var yearKeys = Object.keys(perYear);
  var most = Math.max.apply(null, yearKeys.map(function (y) { return perYear[y]; }));
  var fewest = Math.min.apply(null, yearKeys.map(function (y) { return perYear[y]; }));
  var chart = $('years-chart');
  chart.setAttribute('role', 'img');
  chart.setAttribute('aria-label', 'Dynamic World images of the study area, Feb–May: ' +
    yearKeys.map(function (y) { return y + ': ' + perYear[y]; }).join(', ') + '. The rule uses ' + used.join(', ') + '.');
  chart.innerHTML = yearKeys.map(function (y) {
    var n = perYear[y], on = used.indexOf(y) >= 0;
    // values are written on the seasons used and on the thin ones; the rest are in the tooltip and the label above
    return '<div class="col' + (on ? ' on' : '') + '" title="' + y + ': ' + n + ' images">' +
      '<span class="col-val">' + (on || n === fewest ? n : '') + '</span>' +
      '<span class="col-bar" style="height:' + (n / most * 70).toFixed(1) + 'px"></span>' +
      '<span class="col-year">’' + y.slice(2) + '</span></div>';
  }).join('');

  // ---- near me: nearest patches first; the location never leaves the device --
  var nearBtn = $('near-me');
  // the full message goes under the list heading; a short one also shows on the map
  function listNote(text, short) {
    var el = $('list-note');
    el.textContent = text || '';
    el.hidden = !text;
    if (short && mapApi) mapApi.say(short);
  }
  nearBtn.addEventListener('click', function () {
    if (!navigator.geolocation) { listNote('This browser cannot share a location. Tap an area in the chart below instead.', 'Location not available'); return; }
    listNote('Finding your location…');
    nearBtn.disabled = true;
    navigator.geolocation.getCurrentPosition(function (pos) {
      nearBtn.disabled = false;
      var here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      var gap = core.distance(here.lat, here.lon, (meta.box[1] + meta.box[3]) / 2, (meta.box[0] + meta.box[2]) / 2);
      if (gap > 30000) {
        listNote('You are about ' + core.formatDistance(gap) + ' from the study area, so no flagged patch is near you yet. NEERKATTI covers the Pallikaranai watershed for now.',
          'No patch near you: ' + core.formatDistance(gap) + ' away');
        return;
      }
      var option = $('sort').querySelector('option[value="distance"]');
      option.hidden = option.disabled = false;
      $('sort').value = listState.sort = 'distance';
      listState.from = here;
      listState.filter = null;
      setScope('all');
      renderList();
      var nearest = core.sortPatches(all, 'distance', here)[0];
      listNote('Nearest flagged patch: #' + nearest.rank + ', ' + core.nameOf(nearest) + ', ' + away(nearest) +
        '. The list now shows the nearest first. Your location stays on this device.', 'Nearest patch: #' + nearest.rank + ', ' + away(nearest));
      if (mapApi) mapApi.showYou(here, nearest.rank);
    }, function (err) {
      nearBtn.disabled = false;
      listNote(err.code === 1 ? 'Location not shared. Tap an area in the chart below instead.'
        : 'Could not find your location. Try again, or tap an area in the chart below.', 'Location not found');
    }, { timeout: 10000, maximumAge: 60000 });
  });

  // Without the map library (a blocked script, a very old browser) the list
  // above still works: each row opens the patch in Google Maps instead.
  if (!window.L) {
    setNote('The map could not start. The patch list still works, and the project page shows the same results.', true);
    return;
  }

  // ---- map and layers -----------------------------------------------------
  var box = L.latLngBounds([meta.box[1], meta.box[0]], [meta.box[3], meta.box[2]]);
  map = L.map('map', {
    zoomControl: false, zoomSnap: 0.25, zoomDelta: 0.5, minZoom: 11, maxZoom: 16,
    maxBounds: box.pad(0.8), maxBoundsViscosity: 0.7
  });
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  L.control.zoom({ position: 'topright' }).addTo(map);

  // Stacking: basemap (tilePane) < right / single season < left season < place names < marsh outline < patches (overlayPane)
  map.createPane('after').style.zIndex = 240;
  map.createPane('before').style.zIndex = 250;
  map.createPane('names').style.zIndex = 350;
  map.createPane('marsh').style.zIndex = 380;
  map.getPane('names').style.pointerEvents = 'none';
  map.getPane('marsh').style.pointerEvents = 'none';
  var paneBefore = map.getPane('before');

  // A page opened in a hidden tab or pane has a 0 × 0 map, and fitting the
  // study area into that zooms all the way in. Until the map has a real size,
  // keep refitting whenever it gets one.
  var fitted = false;
  function home(animate) {
    var size = map.getSize();
    if (!size.x || !size.y) { map.setView(box.getCenter(), 12); return; }
    fitted = true;
    if (animate) map.flyToBounds(box, { padding: [8, 8], duration: 0.8 });
    else map.fitBounds(box, { padding: [8, 8] });
  }
  home(false);

  // OpenStreetMap around the study area (CSS dims it, and darkens it in dark mode).
  // Tiles are fetched with CORS so the offline copy can keep the ones already seen.
  // The street map only frames the satellite images, so it waits until they have
  // loaded (or 4 s): on a slow phone the images then get the whole connection first.
  var basemap = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, crossOrigin: true,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  });
  function addBasemap() { if (!map.hasLayer(basemap)) basemap.addTo(map); }
  setTimeout(addBasemap, 4000);

  // Our own place labels (positions from OpenStreetMap), drawn over the satellite images
  function label(p, cls) {
    return L.marker([p.lat, p.lon], {
      pane: 'names', interactive: false, keyboard: false,
      icon: L.divIcon({ className: 'place-label' + (cls ? ' ' + cls : ''), html: '<span>' + esc(p.name) + '</span>', iconSize: [0, 0] })
    });
  }
  // the marsh first: when two labels collide, the earlier one keeps its place
  var names = L.layerGroup([label(meta.marsh_label, 'water')].concat(meta.places.map(function (p) { return label(p); }))).addTo(map);
  function fitLabels() {
    map.getPane('names').style.display = map.getZoom() < 12 ? 'none' : '';
  }

  // ---- the images: one per side of the divider and per layer type --------------------
  // Each is pointed at whichever season is shown. Photos show their light copy first
  // (analysis/web_images.py); the full image replaces it once loaded, except while the
  // years are playing, when the light copies keep up. The browser keeps the old picture
  // on screen until the new one is ready, so switching seasons never flashes.
  var imgAttr = 'Contains modified Copernicus Sentinel data · Dynamic World';
  function src(view, key, full) {
    return 'data/' + (view === 'labels' ? 'labels_' + key : 'photo_' + key + (full ? '' : '_light')) + '.webp';
  }
  function altFor(view, key) {
    return (view === 'labels' ? 'AI land labels, ' : 'Sentinel-2 satellite image, ') + keyLong(key);
  }
  var slots = {};
  var noFull = {};       // seasons whose full photo failed (offline, say): their light copy stays
  var imageError = '';   // the season whose image is missing, while its note is up
  function slot(view, pane) {
    var k = view + '-' + pane;
    if (!slots[k]) slots[k] = { view: view, pane: pane, key: null, layer: null, ready: false, full: false };
    return slots[k];
  }
  function upgrade(s) {
    var full = src('photo', s.key, true);
    if (s.layer._url !== full) s.layer.setUrl(full);
  }
  function loaded(s) {
    s.ready = true;
    s.failed = false;
    s.layer.setOpacity(1);
    if (s.full) upgrade(s);
    checkLoaded();
  }
  function failed(s) {
    // a full photo that fails falls back to its light copy, which is already on screen or saved
    if (s.view === 'photo' && s.layer._url === src('photo', s.key, true)) {
      noFull[s.key] = true;
      s.full = false;
      s.layer.setUrl(src('photo', s.key, false));
      return;
    }
    // hide the broken picture (the street map shows through) and say which season is missing
    s.failed = true;
    s.layer.setOpacity(0);
    imageError = s.key;
    var labels = s.view === 'labels';
    setNote((labels ? 'The AI labels for ' : 'The satellite image for ') + keyLong(s.key) +
      (navigator.onLine ? ' did not load. Check the connection; it retries when you change season.'
        : (labels ? ' are' : ' is') + ' not saved on this device yet. ' + (labels ? 'They load' : 'It loads') + ' when you are back online.'), true);
  }
  function point(s, key, full) {
    s.full = full && s.view === 'photo' && !noFull[key];
    if (s.key === key && !s.failed) { if (s.full && s.ready) upgrade(s); return; }
    s.key = key;
    s.ready = false;
    // a full photo the player has already fetched goes straight up; otherwise the light copy first
    var url = src(s.view, key, s.full && preloaded[src('photo', key, true)] === 'ok');
    if (!s.layer) {
      s.layer = L.imageOverlay(url, box, { pane: s.pane, alt: altFor(s.view, key), attribution: imgAttr, className: s.view === 'labels' ? 'dw-img' : '' });
      s.layer.on('load', function () { loaded(s); });
      s.layer.on('error', function () { failed(s); });
    } else {
      s.layer.setUrl(url);
      if (s.layer.getElement()) s.layer.getElement().alt = altFor(s.view, key);
    }
  }
  // back online: fetch whatever failed, and try the full photos again
  window.addEventListener('online', function () {
    noFull = {};
    Object.keys(slots).forEach(function (k) {
      var s = slots[k];
      if (s.failed && s.layer) { s.failed = false; s.layer.setUrl(src(s.view, s.key, false)); }
    });
    applyLayers();
  });
  function shown() {
    return Object.keys(slots).map(function (k) { return slots[k]; }).filter(function (s) { return s.layer && map.hasLayer(s.layer); });
  }
  // a small status line until the images on screen have loaded
  function checkLoaded() {
    // the missing-image note goes once no image on screen is missing
    if (imageError && !shown().some(function (s) { return s.failed; })) { imageError = ''; setNote(''); }
    if (note.classList.contains('error') || playing) return;
    var done = shown().every(function (s) { return s.ready; });
    setNote(done ? '' : (state.view === 'labels' ? 'Loading AI labels…' : 'Loading satellite images…'));
    if (done) { connection(); addBasemap(); }
  }
  // The year player shows every season in turn, so it fetches their images first:
  // the light copies, or the full ones when `full` (zoomed in on one patch).
  // preloaded[url] is 'loading', 'ok' or 'error'.
  var preloaded = {};
  function preload(view, full, done) {
    var urls = YEARS.map(function (y) { return src(view, y, full); });
    var left = 0, called = false;
    function finish() { if (!called) { called = true; done(); } }
    urls.forEach(function (url) {
      if (preloaded[url] === 'ok' || preloaded[url] === 'loading') return;
      left++;
      preloaded[url] = 'loading';
      var img = new Image();
      img.onload = function () { preloaded[url] = 'ok'; if (--left === 0) finish(); };
      img.onerror = function () { preloaded[url] = 'error'; if (--left === 0) finish(); };
      img.src = url;
    });
    // start once the first season is in; the player waits for each later one in turn (tick)
    var first = urls[YEARS.indexOf(state.year)] || urls[0];
    (function wait(t) {
      if (called) return;
      if (preloaded[first] !== 'loading' || t > 8000) finish();
      else setTimeout(function () { wait(t + 150); }, 150);
    })(0);
  }

  // ---- compare two seasons -------------------------------------------------
  // The divider lives in its own pane (above the pins, below popups), so it is
  // placed in layer coordinates and moved along with the map. Only its knob takes
  // the pointer (app.css), so the pins and patches under the line stay tappable.
  var container = map.getContainer();
  map.createPane('swipe').style.zIndex = 660;
  var swipe = L.DomUtil.create('div', 'swipe', map.getPane('swipe'));
  swipe.innerHTML = '<span class="year-tag before"></span><span class="year-tag after"></span>' +
    '<div class="knob" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">⇔</div>';
  var knob = swipe.querySelector('.knob');
  var singleTag = L.DomUtil.create('div', 'single-tag', container);
  L.DomEvent.disableClickPropagation(swipe);
  L.DomEvent.disableScrollPropagation(swipe);

  function clip() {
    if (state.mode !== 'compare') { paneBefore.style.clip = ''; return; }
    var size = map.getSize();
    var nw = map.containerPointToLayerPoint([0, 0]);
    var se = map.containerPointToLayerPoint(size);
    var x = nw.x + size.x * state.pos;
    paneBefore.style.clip = 'rect(' + nw.y + 'px,' + x + 'px,' + se.y + 'px,' + nw.x + 'px)';
    swipe.style.left = x + 'px';
    swipe.style.top = nw.y + 'px';
    swipe.style.height = size.y + 'px';
  }
  function knobText() {
    var pct = Math.round(state.pos * 100);
    knob.setAttribute('aria-label', 'Compare: ' + keyLong(state.left) + ' on the left, ' + keyLong(state.right) + ' on the right');
    knob.setAttribute('aria-valuenow', pct);
    knob.setAttribute('aria-valuetext', pct + '% of the map shows ' + keyName(state.left));
  }
  function setPos(p) {
    state.pos = Math.max(0.02, Math.min(0.98, p));
    knobText();
    clip();
  }
  var dragging = false;
  function dragTo(e) {
    var r = container.getBoundingClientRect();
    setPos((e.clientX - r.left) / r.width);
  }
  swipe.addEventListener('pointerdown', function (e) {
    stopSweep(); dragging = true; swipe.setPointerCapture(e.pointerId); e.preventDefault(); dragTo(e);
  });
  swipe.addEventListener('pointermove', function (e) { if (dragging) dragTo(e); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) {
    swipe.addEventListener(t, function () { if (dragging) { dragging = false; declutter(); } });
  });
  knob.addEventListener('keydown', function (e) {
    var step = { ArrowLeft: -0.05, ArrowDown: -0.05, ArrowRight: 0.05, ArrowUp: 0.05 }[e.key];
    if (step) { stopSweep(); setPos(state.pos + step); e.preventDefault(); }
    if (e.key === 'Home') { setPos(0); e.preventDefault(); }
    if (e.key === 'End') { setPos(1); e.preventDefault(); }
  });
  knob.addEventListener('keyup', declutter);
  map.on('move zoom zoomend resize viewreset', clip);

  // the tour sweeps the divider once to show what it does
  var sweepId = null;
  function stopSweep() { if (sweepId) cancelAnimationFrame(sweepId); sweepId = null; }
  function sweep() {
    stopSweep();
    if (calm.matches) return;
    var keys = [0.5, 0.18, 0.82, 0.5], t0 = null, leg = 900;
    function frame(t) {
      if (t0 === null) t0 = t;
      var i = Math.floor((t - t0) / leg);
      if (i >= keys.length - 1) { setPos(0.5); sweepId = null; declutter(); return; }
      var k = ((t - t0) % leg) / leg;
      k = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;   // ease in-out
      setPos(keys[i] + (keys[i + 1] - keys[i]) * k);
      sweepId = requestAnimationFrame(frame);
    }
    sweepId = requestAnimationFrame(frame);
  }

  // the two seasons to compare: every dry season, and the day after the floods
  ['left', 'right'].forEach(function (side) {
    var sel = $(side);
    sel.innerHTML = '<optgroup label="Dry season (Feb–May)">' + YEARS.map(function (y) { return '<option value="' + y + '">' + y + '</option>'; }).join('') +
      '</optgroup><optgroup label="After the floods"><option value="monsoon">' + floodDay + '</option></optgroup>';
    sel.addEventListener('change', function () { endTour(); state[side] = sel.value; applyLayers(); writeHash(); });
  });

  // ---- year by year ---------------------------------------------------------------
  var range = $('year-range');
  range.min = FIRST;
  range.max = LAST;
  $('tb-ticks').innerHTML = YEARS.map(function (y) { return '<span>’' + y.slice(2) + '</span>'; }).join('');
  var playBtn = $('play');
  var playing = false, playTimer = null;
  var playFull = false;    // zoomed in on one patch: play the full images, the light ones would be a blur
  var scrubbing = false;   // dragging the year slider: light copies until it is let go
  var onSeason = null;     // called with each season the player shows (the open popup's bars follow it)
  function yearText() {
    var y = state.year;
    $('year-out').innerHTML = '<b>' + y + '</b><span>' + ha1(builtBy[y]) + ' of ' + meta.lost_ha + ' ha built over</span>';
    range.value = y;
    range.setAttribute('aria-valuetext', y + ': ' + ha1(builtBy[y]) + ' of ' + meta.lost_ha + ' hectares built over');
  }
  // opts.full: play the full images; opts.from: the season to start at
  function setPlaying(on, opts) {
    opts = opts || {};
    var was = playing;
    playing = on;
    clearTimeout(playTimer);
    playBtn.classList.toggle('on', on);
    playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play the dry seasons ' + FIRST + ' to ' + LAST);
    if (!on) {
      playFull = false;
      if (was && !imageError) { setNote(''); checkLoaded(); }
      applyLayers();   // stopped: the full image of this season
      if (was && onSeason) onSeason(null);
      return;
    }
    playFull = !!opts.full;
    if (opts.from) state.year = opts.from;
    else if (state.year === LAST) state.year = FIRST;
    setNote('Loading the seasons…');
    preload(state.view, playFull, function () {
      if (!playing) return;
      setNote('');
      showSeason(state.year);
      tick();
    });
  }
  // the next season is shown only once its image is in, so the year on screen always
  // matches the picture; on a slow connection the player waits (and says so)
  function tick(waited) {
    playTimer = setTimeout(function () {
      if (!playing) return;
      if (state.year === LAST) { setPlaying(false); return; }
      var next = String(+state.year + 1);
      var status = preloaded[src(state.view, next, playFull)];
      if (status === 'error' && playFull && state.view === 'photo') status = 'ok';   // its light copy stands in (failed())
      if (status === 'loading' && (waited || 0) < 10000) {
        setNote('Loading ' + next + '…');
        tick((waited || 0) + 300);
        return;
      }
      setNote(status === 'error' ? (navigator.onLine ? 'The ' + next + ' image did not load.' : 'The ' + next + ' image is not saved on this device yet.') : '');
      showSeason(next);
      tick();
    }, waited ? 300 : calm.matches ? 1600 : 1100);
  }
  function showSeason(y) {
    state.year = y;
    emit('season', y);
    if (state.mode !== 'single') { state.mode = 'single'; check('mode', 'single'); }
    applyLayers();
    writeHash();
    if (playing && onSeason) onSeason(y);
  }
  playBtn.addEventListener('click', function () {
    endTour();
    if (state.mode !== 'single') showSeason(state.year);
    setPlaying(!playing);
  });
  // read the new season first: stopping the player redraws the bar, which puts the slider back on the old one
  range.addEventListener('input', function () { var y = range.value; endTour(); setPlaying(false); scrubbing = true; showSeason(y); });
  range.addEventListener('change', function () { scrubbing = false; applyLayers(); });

  // ---- legend ---------------------------------------------------------------
  // Starts folded on phones, where it would cover a third of the map;
  // opens by itself when the AI labels are switched on, since their colours need the key.
  var legend = L.control({ position: 'bottomright' });
  legend.onAdd = function () {
    var div = L.DomUtil.create('div', 'legend');
    div.innerHTML = '<button type="button" class="legend-btn" aria-expanded="true" aria-controls="legend-body">Legend</button>' +
      '<div class="legend-body" id="legend-body"></div>';
    this._div = div;
    this._btn = div.firstChild;
    this._body = div.lastChild;
    this._btn.addEventListener('click', function () { legend.setOpen(legend._btn.getAttribute('aria-expanded') !== 'true'); });
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    return div;
  };
  legend.setOpen = function (open) {
    this._btn.setAttribute('aria-expanded', String(open));
    L.DomUtil[open ? 'removeClass' : 'addClass'](this._div, 'closed');
  };
  legend.update = function () {
    var html = '';
    var flood = state.mode === 'compare' && (state.left === 'monsoon' || state.right === 'monsoon');
    if (state.patches) {
      if (state.mode === 'single') {
        html += '<div class="row"><i class="patch"></i><span>Flagged, built over by ' + state.year + '</span></div>' +
          '<div class="row"><i class="patch later"></i><span>Flagged, built over later</span></div>';
      } else {
        html += '<div class="row"><i class="patch"></i><span class="long">Flagged: water or marsh in 2018 → buildings in 2025 and 2026</span>' +
          '<span class="short">Flagged patch</span></div>';
      }
    }
    if (state.marsh) {
      html += '<div class="row"><i class="marsh"></i><span>Protected marsh (OpenStreetMap outline)</span></div>' +
        '<div class="row"><i class="marsh zone"></i><span>1 km zone around it</span></div>';
    }
    if (state.view === 'labels') {
      html += '<div class="grid">' + meta.labels.map(function (l) {
        return '<div class="row"><i style="background:' + l.color + '"></i>' + esc(l.name) + '</div>';
      }).join('') + (flood ? '<div class="row"><i class="cloud"></i>cloud, no label</div>' : '') + '</div>';
    }
    html += '<div class="row"><i class="dot"></i><span>Sathyabama (DEXATHON venue)</span></div>';
    html += '<div class="src">' + (state.view === 'labels'
      ? 'AI labels: Dynamic World, most common label in Feb–May' + (flood ? '; one image on ' + floodDay : '')
      : 'Sentinel-2, median of Feb–May' + (flood ? '; one image on ' + floodDay : '')) + '</div>';
    this._body.innerHTML = html;
  };
  legend.addTo(map);
  legend.setOpen(!narrow.matches);

  // ---- flagged patches ------------------------------------------------------
  var STYLE = { color: '#ff1a1a', weight: 1.5, opacity: 1, fillColor: '#ff1a1a', fillOpacity: 0.35, dashArray: null, className: 'nk-patch' };
  // year by year: a patch not yet built over in the season shown is only outlined
  var LATER = { color: '#ff1a1a', weight: 1.5, opacity: 0.95, fillColor: '#ff1a1a', fillOpacity: 0, dashArray: '3 3', className: 'nk-patch' };
  var HOVER = { weight: 3, fillOpacity: 0.55 };
  var ON = { color: '#FFD400', weight: 3, fillColor: '#ff1a1a', fillOpacity: 0.5, dashArray: null };
  var byRank = {};
  var selected = null;
  function styleOf(p) {
    return state.mode === 'single' && +state.year < core.builtFrom(p) ? LATER : STYLE;
  }
  function restyle() {
    Object.keys(byRank).forEach(function (r) {
      var hit = byRank[r];
      if (hit !== selected) hit.layer.setStyle(styleOf(hit.feature.properties));
    });
  }

  // 2018 | 2026 close-up (analysis/topten_closeups.py and patch_details.py → app_closeups.py)
  function figureHtml(p) {
    return '<figure class="pop-fig"><a href="' + closeup(p.rank) + '" target="_blank" rel="noopener" title="Open the close-up full size">' +
      '<img src="' + closeup(p.rank) + '" width="640" height="312" alt="Patch ' + p.rank + ' close-up: Sentinel-2, 2018 on the left, 2026 on the right with the patch outlined in red">' +
      '<span class="year-tag before">2018</span><span class="year-tag after">2026</span></a>' +
      '<figcaption>600&nbsp;m around the patch, outlined in red</figcaption></figure>';
  }
  // What the AI saw on the patch each dry season: buildings (bottom), other, water or marsh (top)
  function timelineHtml(p) {
    var since = core.builtFrom(p);
    var cols = YEARS.map(function (y, i) {
      var wet = p.wet_by_year[i], built = p.built_by_year[i], other = Math.max(0, 1 - wet - built);
      return '<span class="tl-col' + (+y === since ? ' since' : '') + '" data-year="' + y + '" title="' + y + ': ' + pct(built) + ' buildings, ' + pct(wet) + ' water or marsh">' +
        '<span class="tl-bar"><i class="w" style="height:' + pct(wet) + '"></i><i class="o" style="height:' + pct(other) + '"></i>' +
        '<i class="b" style="height:' + pct(built) + '"></i></span><span class="tl-y">’' + y.slice(2) + '</span></span>';
    }).join('');
    var said = YEARS.map(function (y, i) { return y + ' ' + pct(p.built_by_year[i]); }).join(', ');
    return '<div class="tl"><div class="tl-head"><span>Year by year</span><b>' +
      (since >= 2025 ? 'Built over in 2025 and 2026' : 'Built over every season since ' + since) + '</b></div>' +
      '<div class="tl-cols" role="img" aria-label="Share of the patch the AI labels buildings each dry season: ' + said + '">' + cols + '</div>' +
      '<div class="tl-key" aria-hidden="true"><span><i class="w"></i>water or marsh</span><span><i class="o"></i>other</span><span><i class="b"></i>buildings</span></div>' +
      '<div class="tl-act"><button type="button" class="tl-play" data-rank="' + p.rank + '" aria-label="Watch this patch season by season, ' + FIRST + ' to ' + LAST + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="i-play" d="M8 5v14l11-7z"/><path class="i-pause" d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>' +
      '<span>Watch it ' + FIRST + '–' + LAST + '</span></button><span class="tl-now" aria-live="polite"></span></div></div>';
  }
  // How sure the AI was: the three probabilities, the weakest of which sets the level
  function confHtml(p) {
    var low = core.weakest(p);
    function row(text, v) {
      return '<div class="conf-row' + (v === low ? ' weak' : '') + '"><span>' + text + '</span>' +
        '<span class="meter" aria-hidden="true"><i style="width:' + pct(v) + '"></i></span><b>' + pct(v) + '</b></div>';
    }
    // folded, so the popup fits a short map; it grows upwards when opened
    return '<details class="conf"><summary class="conf-head"><span>AI confidence</span>' + confPill(p, true) + '<span class="conf-why">why?</span></summary>' +
      row('Water or marsh, 2018', p.p_wet_2018) + row('Buildings, 2025', p.p_built_2025) + row('Buildings, 2026', p.p_built_2026) +
      '<div class="conf-src">Dynamic World\'s average probability over the patch and season. The lowest sets the level.</div></details>';
  }
  // The patch against the protected marsh, the 2021 floods and Landsat's water history
  function contextHtml(p) {
    var rows = [];
    var st = core.marshStatus(p, ZONE);
    rows.push(['marsh ' + st, st === 'inside'
      ? '<b>' + (p.marsh_share >= 0.99 ? 'Inside' : pct(p.marsh_share) + ' inside') + '</b> the protected marsh outline'
      : st === 'zone' ? '<b>' + core.formatDistance(p.marsh_distance_m) + '</b> from the protected marsh, inside the 1 km zone'
        : core.formatDistance(p.marsh_distance_m) + ' from the protected marsh']);
    if (p.wet_monsoon === null) rows.push(['flood', 'Under cloud on ' + floodDay + ', after the floods']);
    else rows.push(['flood', '<b>' + pct(p.wet_monsoon) + '</b> water or marsh on ' + floodDay + ', after the floods']);
    if (p.landsat_water_ever >= 0.1) rows.push(['sat', 'Landsat saw open water on <b>' + pct(p.landsat_water_ever) + '</b> of it, 1984–2021']);
    return '<ul class="ctx">' + rows.map(function (r) { return '<li class="' + r[0] + '">' + r[1] + '</li>'; }).join('') + '</ul>';
  }
  // Buttons added by extensions (window.NEERKATTI_API.addPatchAction), under the AI confidence
  var patchActions = [];
  function actionsHtml(p) {
    var list = patchActions.filter(function (a) { return !a.when || a.when(p); });
    if (!list.length) return '';
    return '<div class="pop-acts">' + list.map(function (a) {
      return '<button type="button" class="btn ghost pop-act" data-action="' + esc(a.id) + '" data-rank="' + p.rank + '">' + esc(a.label) + '</button>';
    }).join('') + '</div>';
  }
  function popupHtml(p) {
    return '<div class="pop">' +
      '<div class="pop-title">#' + p.rank + ' · ' + placeOf(p) + '</div>' +
      '<div class="pop-ha">' + ha(p.area_ha) + ' ha <span>≈ ' + acres(p.area_ha) + ' acres</span>' +
      (p.site ? ' <span class="pill site">Site ' + p.site + '</span>' : '') + '</div>' +
      figureHtml(p) +
      '<p>' + (p.finding ? '<b>Checked by eye:</b> ' + esc(p.finding) + '.' : 'Water or marsh in 2018 → buildings in 2025 and 2026. Not checked by eye yet.') + '</p>' +
      timelineHtml(p) +
      contextHtml(p) +
      confHtml(p) +
      actionsHtml(p) +
      '<div class="pop-foot"><span class="pill check">Possible change, needs a ground check</span>' +
      '<a href="' + gmaps(p) + '" target="_blank" rel="noopener">Google Maps (satellite) →</a></div>' +
      '</div>';
  }

  var patches = L.geoJSON(D.patches, {
    style: function (f) { return styleOf(f.properties); },
    onEachFeature: function (f, layer) {
      var rank = f.properties.rank;
      byRank[rank] = { feature: f, layer: layer };
      layer.on('click', function (e) { L.DomEvent.stop(e); endTour(); select(rank, { latlng: e.latlng }); });
      layer.on('mouseover', function () { if (!selected || selected.layer !== layer) layer.setStyle(HOVER); });
      layer.on('mouseout', function () { if (!selected || selected.layer !== layer) layer.setStyle(styleOf(f.properties)); });
    }
  }).addTo(map);

  var pins = L.layerGroup().addTo(map);
  top10.forEach(function (f) {
    var p = f.properties;
    var pin = L.marker(byRank[p.rank].layer.getBounds().getNorthEast(), {
      icon: L.divIcon({ className: 'rank-pin', html: '<span>' + p.rank + '</span>', iconSize: [24, 24], iconAnchor: [2, 22] }),
      title: '#' + p.rank + ' ' + core.nameOf(p) + ', ' + ha(p.area_ha) + ' ha',
      alt: 'Patch ' + p.rank,
      riseOnHover: true
    });
    pin.on('click', function () { endTour(); select(p.rank, { fly: true }); });
    pins.addLayer(pin);
    // Leaflet opens only a bound popup on Enter; the pin is a button, so Enter and Space open its patch
    pin.getElement().addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      endTour(); select(p.rank, { fly: true });
    });
    byRank[p.rank].pin = pin;
  });

  L.circleMarker([meta.campus[1], meta.campus[0]], {
    radius: 6, color: '#1B2333', weight: 2, fillColor: '#FFD400', fillOpacity: 1
  }).bindTooltip('Sathyabama · DEXATHON venue').addTo(map);

  // ---- the protected marsh (analysis/context_layers.py), loaded when first shown ------
  var marshLayer = null, marshLoading = null;
  function loadMarsh() {
    if (marshLoading) return marshLoading;
    marshLoading = fetch('data/marsh_boundary.geojson').then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }).then(function (geo) {
      marshLayer = L.geoJSON(geo, {
        pane: 'marsh', interactive: false,
        style: function (f) {
          return f.properties.kind === 'zone'
            ? { color: '#00E0C6', weight: 2, opacity: 0.95, dashArray: '6 5', fill: false }
            : { color: '#00E0C6', weight: 3, opacity: 1, fillColor: '#00E0C6', fillOpacity: 0.08 };
        }
      });
      return marshLayer;
    });
    marshLoading.catch(function () { marshLoading = null; });
    return marshLoading;
  }
  function setMarsh(on) {
    state.marsh = on;
    $('show-marsh').checked = on;
    legend.update();
    writeHash();
    if (!on) { if (marshLayer) map.removeLayer(marshLayer); return Promise.resolve(); }
    return loadMarsh().then(function (layer) {
      if (state.marsh && !map.hasLayer(layer)) layer.addTo(map);
    }, function () {
      setMarsh(false);
      say('The marsh outline did not load. Check the connection.');
    });
  }

  // Neighbouring patches put their pins on top of each other at the opening zoom
  // (#1 and #6, #2 and #5): nudge the later one aside. Only zooming changes this.
  var PIN = 24;
  function pinPoints() {
    return top10.map(function (f) {
      var pt = map.latLngToContainerPoint(byRank[f.properties.rank].pin.getLatLng());
      return [pt.x - 2, pt.y - 22];   // the pin's top-left corner (iconAnchor 2, 22)
    });
  }
  var pinShift = [];
  function spreadPins() {
    pinShift = core.spread(pinPoints(), PIN + 2);
    top10.forEach(function (f, i) {
      var el = byRank[f.properties.rank].pin.getElement();
      if (el) el.firstChild.style.transform = pinShift[i][0] || pinShift[i][1] ? 'translate(' + pinShift[i][0] + 'px,' + pinShift[i][1] + 'px)' : '';
    });
  }

  // Keep place names off the rank pins, the divider knob and each other: try the label
  // where OpenStreetMap puts it, then a little below, above or to one side; hide it if all collide.
  function declutter() {
    var boxes = [];
    if (state.patches) {
      pinPoints().forEach(function (pt, i) {
        var s = pinShift[i] || [0, 0];
        boxes.push([pt[0] + s[0] - 2, pt[1] + s[1] - 2, pt[0] + s[0] + PIN + 2, pt[1] + s[1] + PIN + 2]);
      });
    }
    if (state.mode === 'compare') {
      var size = map.getSize(), kx = size.x * state.pos, ky = size.y / 2;
      boxes.push([kx - 26, ky - 26, kx + 26, ky + 26]);
    }
    names.eachLayer(function (m) {
      var el = m.getElement();
      var span = el && el.firstChild;
      if (!span) return;
      span.style.visibility = '';
      if (!span.offsetWidth) return;
      var pt = map.latLngToContainerPoint(m.getLatLng());
      var w = span.offsetWidth / 2 + 3, h = 8;
      var spot = core.freeSpot(pt.x, pt.y, w, h, boxes,
        [[0, 0], [0, 15], [0, -15], [0, 28], [0, -28], [w, 0], [-w, 0], [w, 15], [-w, 15], [w, -15], [-w, -15]]);
      if (!spot) { span.style.visibility = 'hidden'; return; }
      boxes.push(spot.box);
      span.style.marginLeft = spot.offset[0] + 'px';
      span.style.marginTop = spot.offset[1] + 'px';
    });
  }
  map.on('zoomend', function () { fitLabels(); spreadPins(); declutter(); });
  map.on('moveend resize', declutter);

  // the top padding keeps popups clear of the season tag (year by year), the bottom one
  // of the credits line; the legend steps aside while a popup covers it (tagClear)
  var popup = L.popup({ autoPanPaddingTopLeft: [10, 44], autoPanPaddingBottomRight: [10, 28] });
  // the tallest a popup's content may be: with the paddings, its frame and its tip (137 px)
  // the whole popup fits the map, and on a short phone map it scrolls rather than running off it
  function popupRoom() { return Math.max(150, map.getSize().y - 137); }

  function unmark(hit) {
    hit.layer.setStyle(styleOf(hit.feature.properties));
    if (hit.pin && hit.pin.getElement()) L.DomUtil.removeClass(hit.pin.getElement(), 'on');
  }
  function clearSelection() {
    if (!selected) return;
    unmark(selected);
    selected = null;
    markList(-1);
    writeHash();
  }
  map.on('popupclose', function (e) { if (e.popup === popup) clearSelection(); });
  map.on('popupopen', function (e) {
    if (narrow.matches || map.getSize().y < 760) legend.setOpen(false);   // it would cover the popup's foot
    // the close-up has a fixed shape, but re-place the popup once it arrives in case the font changed its height
    var img = e.popup.getElement().querySelector('.pop-fig img');
    if (img && !img.complete) img.addEventListener('load', function () { if (map.hasLayer(e.popup)) e.popup.update(); });
  });

  // Fly so the patch sits in the strip left free between `top` and `bottom`
  // (pixels kept clear for the popup above and the tour card below). On a short
  // phone map that strip can be thin, so it never shrinks below 60 px.
  function flyInto(b, top, bottom) {
    var size = map.getSize();
    var room = Math.max(60, size.y - top - bottom);
    var z = Math.min(16, map.getBoundsZoom(b, false, L.point(80, size.y - room)));
    var c = map.unproject(map.project(b.getCenter(), z).add([0, (bottom - top) / 2]), z);
    map.flyTo(c, z, { duration: calm.matches ? 0 : 0.9 });
    return { center: c, zoom: z };
  }
  // Run `then` once the map has arrived. A resize during the flight (the web font
  // arriving and changing the toolbar's height, say) also ends with a moveend, so
  // check where the map is rather than trusting the first one. After a pan the map
  // reports its centre to the nearest pixel, so "there" means within 2 px.
  var arriving = null;
  function whenThere(to, then) {
    if (arriving) map.off('moveend', arriving);
    arriving = function () {
      if (Math.abs(map.getZoom() - to.zoom) > 0.01 || map.project(map.getCenter()).distanceTo(map.project(to.center)) > 2) return;
      map.off('moveend', arriving);
      arriving = null;
      then();
    };
    map.on('moveend', arriving);
  }
  map.on('dragstart', function () { if (arriving) { map.off('moveend', arriving); arriving = null; } });

  function select(rank, opts) {
    var hit = byRank[rank];
    if (!hit) return;
    emit('select', hit.feature.properties);
    opts = opts || {};
    map.closePopup();
    if (selected) unmark(selected);   // a selection made without a popup has no popupclose to clear it
    if (!state.patches) setPatches(true);
    selected = hit;
    hit.layer.setStyle(ON).bringToFront();
    if (hit.pin && hit.pin.getElement()) L.DomUtil.addClass(hit.pin.getElement(), 'on');
    markList(rank);
    var p = hit.feature.properties;
    var b = hit.layer.getBounds();
    var width = narrow.matches ? 260 : 310;
    popup.options.maxWidth = popup.options.minWidth = width;
    popup.options.maxHeight = popupRoom();
    // from the list, the popup sits on the patch's top edge so it doesn't cover it
    popup.setLatLng(opts.latlng || [b.getNorth(), b.getCenter().lng]).setContent(popupHtml(p));
    if (opts.fly) {
      var noPopup = opts.popup === false;
      // room above the patch for the popup and its tip
      var to = flyInto(b, noPopup ? 50 : popupRoom() + 40, opts.padBottom || 30);
      whenThere(to, function () {
        if (selected !== hit) return;
        if (!noPopup) popup.openOn(map);
        if (opts.then) opts.then();
      });
    } else {
      popup.openOn(map);
      if (opts.then) opts.then();
    }
    writeHash();
  }

  // ---- watch one patch: zoom in and play its seasons, the popup's bars following --------
  var watching = null;   // the patch being watched
  function watchSeason(y) {
    var hit = watching && byRank[watching];
    if (!hit) return;
    var p = hit.feature.properties, el = popup.getElement();
    if (el) {
      el.querySelectorAll('.tl-col').forEach(function (c) { c.classList.toggle('now', c.dataset.year === y); });
      var btn = el.querySelector('.tl-play');
      if (btn) { btn.classList.toggle('on', !!y); btn.setAttribute('aria-label', y ? 'Pause' : 'Watch this patch season by season, ' + FIRST + ' to ' + LAST); }
      var i = YEARS.indexOf(y), now = el.querySelector('.tl-now');
      if (now) now.textContent = y ? y + ': ' + pct(p.built_by_year[i]) + ' buildings, ' + pct(p.wet_by_year[i]) + ' water or marsh' : '';
    }
    if (y) hit.layer.setStyle({ fillOpacity: 0 });   // outline only, so the ground shows through
    else {
      if (selected === hit) hit.layer.setStyle(ON);
      unwatch();
    }
  }
  function unwatch() {
    watching = null;
    onSeason = null;
    var el = popup.getElement();
    if (el && L.DomUtil.hasClass(el, 'watching')) { L.DomUtil.removeClass(el, 'watching'); if (map.hasLayer(popup)) popup.update(); }
  }
  // the popup folds down to its season bars and the map zooms in close under it, then the seasons play
  function watchPatch(rank) {
    if (playing && watching === rank) { setPlaying(false); return; }
    var hit = byRank[rank];
    function start() {
      watching = rank;
      onSeason = watchSeason;
      var el = popup.getElement();
      L.DomUtil.addClass(el, 'watching');
      popup.update();
      var to = flyInto(hit.layer.getBounds(), el.offsetHeight + 30, 30);
      whenThere(to, function () { if (watching === rank) setPlaying(true, { full: true, from: FIRST }); });
    }
    if (selected === hit && map.hasLayer(popup)) start();
    else select(rank, { fly: true, then: start });
  }
  // one listener on the popup itself: its content is redrawn (when the close-up arrives, say), its box is not
  var popupWired = false;
  map.on('popupopen', function (e) {
    if (e.popup !== popup || popupWired) return;
    popupWired = true;
    popup.getElement().addEventListener('click', function (ev) {
      var act = ev.target.closest('.pop-act');
      if (act) {
        var a = patchActions.filter(function (x) { return x.id === act.dataset.action; })[0];
        if (a) a.run(byRank[act.dataset.rank].feature.properties, api);
        return;
      }
      var btn = ev.target.closest('.tl-play');
      if (!btn) return;
      // the popup is redrawn next, which would leave the map unable to tell this click came from inside it
      ev.stopPropagation();
      endTour();
      setTimeout(function () { watchPatch(+btn.dataset.rank); }, 0);
    });
  });
  // closing the popup stops the watching (the selection is cleared just before, so every patch is restyled)
  map.on('popupclose', function (e) {
    if (e.popup === popup && watching) { unwatch(); if (playing) setPlaying(false); }
  });

  // ---- ask the AI about any spot -----------------------------------------------------
  // A tap anywhere off the patches reads the AI label images the map already shows
  // (one per dry season, and the day after the floods) at that spot: about one 10 m
  // square. No server: the pixels are read in the browser.
  var SPOT_LABELS = meta.labels.concat([{ name: 'snow & ice', color: '#b39fe1' }]);   // a mislabel here, but name it
  var SPOT_KEYS = YEARS.concat(['monsoon']);
  var labelImgs = {};   // key -> Promise of a decoded image
  var spotCanvas = null;
  function labelImg(key) {
    if (!labelImgs[key]) {
      labelImgs[key] = new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { delete labelImgs[key]; reject(new Error(key)); };
        img.src = src('labels', key);
      });
    }
    return labelImgs[key];
  }
  function readPixel(img, x, y) {
    if (!spotCanvas) { spotCanvas = document.createElement('canvas'); spotCanvas.width = spotCanvas.height = 1; }
    var ctx = spotCanvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 1, 1);
    ctx.drawImage(img, x, y, 1, 1, 0, 0, 1, 1);
    return ctx.getImageData(0, 0, 1, 1).data;
  }
  var spotPopup = L.popup({ autoPanPaddingTopLeft: [10, 44], autoPanPaddingBottomRight: [10, 28], className: 'spot-pop' });
  // Near the edge of the study area the map cannot pan a popup clear of the season tag
  // (year by year), so the tag steps aside while a popup sits under it. So does the
  // legend: on a short phone map a popup reaches down to it.
  function tagClear() {
    var tag = singleTag.getBoundingClientRect(), key = legend._div.getBoundingClientRect();
    var hideTag = false, hideKey = false;
    [popup, spotPopup].forEach(function (p) {
      if (!map.hasLayer(p) || !p.getElement()) return;
      var a = p.getElement().getBoundingClientRect();
      function over(b) { return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }
      if (over(tag)) hideTag = true;
      if (over(key)) hideKey = true;
    });
    singleTag.classList.toggle('covered', hideTag);
    legend._div.classList.toggle('covered', hideKey);
  }
  map.on('popupopen popupclose moveend', function () { setTimeout(tagClear, 0); });
  [popup, spotPopup].forEach(function (p) { p.on('contentupdate', function () { setTimeout(tagClear, 0); }); });
  var spotMark = null;
  function spotName(i) { return i === 'cloud' ? 'cloud' : i < 0 ? 'unknown' : SPOT_LABELS[i].name; }
  // the season strip: one coloured square per season, then a key for the colours it shows
  function spotCells(names) {
    var cells = SPOT_KEYS.map(function (k) {
      var i = names['#' + k], color = i === 'cloud' ? '#ffffff' : i < 0 ? 'transparent' : SPOT_LABELS[i].color;
      return '<span class="sp-cell' + (k === 'monsoon' ? ' flood' : '') + '" title="' + keyName(k) + ': ' + esc(names[k]) + '">' +
        '<i style="background:' + color + '"></i><span>' + (k === 'monsoon' ? 'Dec' : '’' + k.slice(2)) + '</span></span>';
    }).join('');
    // a key for the colours this spot shows
    var seen = [];
    SPOT_KEYS.forEach(function (k) { var i = names['#' + k]; if (seen.indexOf(i) < 0) seen.push(i); });
    var key = seen.map(function (i) {
      var color = i === 'cloud' ? '#ffffff' : i < 0 ? 'transparent' : SPOT_LABELS[i].color;
      return '<span><i style="background:' + color + '"></i>' + esc(spotName(i)) + '</span>';
    }).join('');
    var said = SPOT_KEYS.map(function (k) { return (k === 'monsoon' ? floodDay : k) + ' ' + names[k]; }).join(', ');
    return '<div class="sp-cells" role="img" aria-label="AI label each season: ' + esc(said) + '">' + cells + '</div>' +
      '<div class="sp-key" aria-hidden="true">' + key + '</div>';
  }
  function spotHtml(at, names) {
    var byYear = {};
    YEARS.forEach(function (y) { byYear[y] = names[y]; });
    var v = core.spotVerdict(byYear, +FIRST, +LAST);
    var inPatch = D.patches.features.filter(function (f) { return core.inPolygon(at.lat, at.lng, f.geometry); })[0];
    var rank = inPatch && inPatch.properties.rank;
    var verdict = {
      passes: '<b>Water or marsh in ' + FIRST + ', buildings in ' + (+LAST - 1) + ' and ' + LAST + '</b>' +
        (v.since && v.since < +LAST - 1 ? ', and every season since ' + v.since : '') + '. That is the change the rule looks for. ' +
        (rank ? 'This spot is part of <b>flagged patch #' + rank + '</b>.'
          : 'The map flags a spot only when it is also off the outer 20&nbsp;m rim of the 2018 water, inside a group of at least 10 such squares.'),
      wet: '<b>Still ' + esc(names[LAST]) + ' in ' + LAST + '.</b> Water or marsh then and now: no change to flag.',
      changed: '<b>Water or marsh in ' + FIRST + ', ' + esc(names[LAST]) + ' in ' + LAST + '.</b> It changed, but it is not buildings in both ' +
        (+LAST - 1) + ' and ' + LAST + ', so the rule does not flag it.',
      dry: '<b>' + cap(esc(names[FIRST])) + ' in ' + FIRST + ', not water or marsh</b>, so the rule does not look at it.'
    }[v.kind];
    if ([FIRST, String(+LAST - 1), LAST].some(function (y) { return names[y] === 'not loaded'; })) {
      verdict = 'Some seasons the rule needs did not load, so it cannot be applied here.';
      v.kind = 'missing';
    }
    // the answer first: on a short phone map the popup scrolls, and the seasons behind it follow
    return '<div class="pop sp">' +
      '<div class="pop-title">What the AI saw on this spot</div>' +
      '<p class="sp-verdict ' + v.kind + '">' + verdict + '</p>' +
      '<p class="sp-sub">About one 10&nbsp;m square, at ' + at.lat.toFixed(5) + ', ' + at.lng.toFixed(5) + '. The most common Dynamic World label each dry season.</p>' +
      spotCells(names) +
      '<div class="sp-when">’18–’26: Feb–May of each year · Dec: ' + floodDay + ', after the floods</div>' +
      (rank ? '<p class="sp-open"><button type="button" class="btn ghost sp-patch" data-rank="' + rank + '">Open patch #' + rank + '</button></p>' : '') +
      '<div class="pop-foot"><span class="sp-note">Labels can flicker from season to season.</span>' +
      '<a href="https://www.google.com/maps/@' + at.lat.toFixed(5) + ',' + at.lng.toFixed(5) + ',300m/data=!3m1!1e3" target="_blank" rel="noopener">Google Maps (satellite) →</a></div></div>';
  }
  // Every season's label at `at`: names[key] ('water' …) and names['#' + key] (its index),
  // and the 10 m cell read; null if no label image could be loaded
  function readSpot(at) {
    return Promise.all(SPOT_KEYS.map(function (k) {
      return labelImg(k).then(function (img) { return img; }, function () { return null; });
    })).then(function (imgs) {
      var names = {}, cell = null;
      imgs.forEach(function (img, n) {
        var k = SPOT_KEYS[n];
        if (!img) { names[k] = 'not loaded'; names['#' + k] = -1; return; }
        var size = [img.naturalWidth, img.naturalHeight], px = core.pixelAt(meta.box, size, at.lat, at.lng);
        var i = core.labelOf(readPixel(img, px.x, px.y), SPOT_LABELS);
        names['#' + k] = i;
        names[k] = spotName(i);
        cell = cell || core.pixelBounds(meta.box, size, px.x, px.y);
      });
      return cell ? { names: names, cell: cell } : null;
    });
  }
  function markSpot(cell) {
    if (!spotMark) spotMark = L.rectangle(cell, { color: '#FFD400', weight: 2, fill: false, interactive: false, pane: 'marsh' });
    else spotMark.setBounds(cell);
    spotMark.addTo(map);
  }
  function askSpot(latlng, inTour) {
    var at = L.latLng(latlng);
    if (!box.contains(at)) { say('Tap inside the satellite image: that is the study area'); return; }
    if (!inTour) { endTour(); store('neerkatti-asked', 'yes'); }
    hideHint();
    map.closePopup();
    var width = narrow.matches ? 260 : 290;
    spotPopup.options.maxWidth = spotPopup.options.minWidth = width;
    spotPopup.options.maxHeight = popupRoom();
    spotPopup.setLatLng(at).setContent('<div class="pop sp"><div class="pop-title">What the AI saw on this spot</div><p class="sp-sub">Reading the AI labels…</p></div>').openOn(map);
    readSpot(at).then(function (spot) {
      if (!map.hasLayer(spotPopup) || !spotPopup.getLatLng().equals(at)) return;   // another tap came first
      if (!spot) {
        spotPopup.setContent('<div class="pop sp"><div class="pop-title">What the AI saw on this spot</div><p class="sp-sub">The AI label images did not load. ' +
          (navigator.onLine ? 'Check the connection and tap again.' : 'Open the map once while online to save them on this device.') + '</p></div>');
        return;
      }
      spotPopup.setContent(spotHtml(at, spot.names));
      markSpot(spot.cell);
    });
  }
  // a tap that only closes a patch's popup does just that
  var patchPopupWasOpen = false;
  map.on('preclick', function () { patchPopupWasOpen = map.hasLayer(popup); hideHint(); });
  map.on('click', function (e) { if (!patchPopupWasOpen) askSpot(e.latlng); });
  var spotWired = false;
  map.on('popupopen', function (e) {
    if (e.popup !== spotPopup || spotWired) return;
    spotWired = true;
    spotPopup.getElement().addEventListener('click', function (ev) {
      var btn = ev.target.closest('.sp-patch');
      if (!btn) return;
      ev.stopPropagation();   // the spot popup closes next; the map must not take this as its own click
      setTimeout(function () { mapApi.pick(+btn.dataset.rank); }, 0);
    });
  });
  map.on('popupclose', function (e) { if (e.popup === spotPopup && spotMark) map.removeLayer(spotMark); });
  // the keyboard way: Enter on the map asks about the spot at its centre
  container.addEventListener('keydown', function (e) {
    if (e.target === container && e.key === 'Enter') { e.preventDefault(); askSpot(map.getCenter()); }
  });

  // ---- the link that reopens a view ------------------------------------------
  function writeHash() {
    var h = core.hashFor({
      patch: selected && selected.feature.properties.rank,
      year: state.mode === 'single' ? state.year : 'compare', left: state.left, right: state.right,
      layer: state.view, marsh: state.marsh
    });
    if (h !== location.hash) history.replaceState(null, '', location.pathname + location.search + h);
  }
  function applyHash(fly) {
    var h = core.readHash(location.hash);
    setPlaying(false);
    state.left = isKey(h.left) ? h.left : FIRST;
    state.right = isKey(h.right) ? h.right : LAST;
    if (YEARS.indexOf(h.year) >= 0) { state.mode = 'single'; state.year = h.year; } else state.mode = 'compare';
    check('mode', state.mode);
    setView(h.layer === 'labels' ? 'labels' : 'photo');
    if ((h.marsh === '1') !== state.marsh) setMarsh(h.marsh === '1');
    if (h.patch && byRank[h.patch]) select(h.patch, { fly: fly });
    else if (selected) map.closePopup();
  }
  window.addEventListener('hashchange', function () { applyHash(true); });

  // ---- toolbar ------------------------------------------------------------
  function applyLayers() {
    var sides = state.mode === 'compare' ? { before: state.left, after: state.right } : { after: state.year };
    ['photo', 'labels'].forEach(function (v) {
      ['before', 'after'].forEach(function (pane) {
        var s = slot(v, pane);
        var key = v === state.view && sides[pane];
        if (key) {
          point(s, key, playFull || (!playing && !scrubbing));
          if (!map.hasLayer(s.layer)) s.layer.addTo(map);
        } else if (s.layer && map.hasLayer(s.layer)) {
          map.removeLayer(s.layer);
        }
      });
    });
    var compare = state.mode === 'compare';
    paneBefore.style.display = compare ? '' : 'none';
    swipe.hidden = !compare;
    singleTag.hidden = compare;
    swipe.firstChild.textContent = keyName(state.left);
    swipe.childNodes[1].textContent = keyName(state.right);
    singleTag.innerHTML = '<span class="year-tag after">' + esc(keyLong(state.year)) + '</span>';
    $('left').value = state.left;
    $('right').value = state.right;
    $('tb-compare').hidden = !compare;
    $('tb-single').hidden = compare;
    yearText();
    knobText();
    restyle();
    clip();
    legend.update();
    checkLoaded();
    declutter();
  }
  function check(name, value) {
    var input = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (input) input.checked = true;
  }
  function setMode(m) {
    if (m === 'compare') setPlaying(false);
    state.mode = m; check('mode', m); applyLayers(); writeHash();
  }
  function setView(v) {
    state.view = v; check('view', v); applyLayers(); writeHash();
    if (v === 'labels') legend.setOpen(true);
    if (playing) preload(v, playFull, function () {});
  }
  function setPatches(on) {
    state.patches = on;
    $('show-patches').checked = on;
    [patches, pins].forEach(function (l) { if (on) l.addTo(map); else map.removeLayer(l); });
    if (!on) map.closePopup();
    legend.update();
    if (on) spreadPins();
    declutter();
  }
  document.querySelectorAll('input[name="mode"]').forEach(function (r) {
    r.addEventListener('change', function () { endTour(); setMode(r.value); });
  });
  document.querySelectorAll('input[name="view"]').forEach(function (r) {
    r.addEventListener('change', function () { setView(r.value); });
  });
  $('show-patches').addEventListener('change', function (e) { setPatches(e.target.checked); });
  $('show-marsh').addEventListener('change', function (e) { setMarsh(e.target.checked); });
  $('show-names').addEventListener('change', function (e) {
    if (e.target.checked) { names.addTo(map); declutter(); } else map.removeLayer(names);
  });

  var toast = $('toast'), toastTimer = null;
  function say(text) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.hidden = true; }, 2600);
  }
  $('share').addEventListener('click', function () {
    var url = location.href;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(function () { say('Link copied. It reopens this exact view.'); },
        function () { window.prompt('Copy this link:', url); });
    } else {
      window.prompt('Copy this link:', url);
    }
  });

  function showMap() {
    if (narrow.matches) scrollToEl($('map-wrap'));
  }
  $('reset').addEventListener('click', function () {
    endTour();
    map.closePopup();
    showMap();
    home(true);
  });

  // ---- hooks for the panel: list rows, charts, cards and "near me" -------------------
  var you = null;
  function fitRanks(ranks, pad) {
    var b = L.latLngBounds([]);
    ranks.forEach(function (r) { b.extend(byRank[r].layer.getBounds()); });
    map.closePopup();
    showMap();
    map.flyToBounds(b, { padding: [pad || 40, pad || 40], maxZoom: 16, duration: calm.matches ? 0 : 0.9 });
  }
  function compareFlood() {
    setPlaying(false);
    state.mode = 'compare'; state.left = 'monsoon'; state.right = LAST;
    check('mode', 'compare');
    setView('photo');
    setPos(0.5);
  }
  mapApi = {
    say: say,
    pick: function (rank) { endTour(); showMap(); select(rank, { fly: true }); },
    fitRanks: fitRanks,
    showYou: function (here, rank) {
      var at = [here.lat, here.lon];
      if (!you) {
        you = L.circleMarker(at, { radius: 7, color: '#fff', weight: 3, fillColor: '#1A73E8', fillOpacity: 1 })
          .bindTooltip('You are here (only on this device)').addTo(map);
      } else you.setLatLng(at);
      map.closePopup();
      showMap();
      map.flyToBounds(L.latLngBounds([at]).extend(byRank[rank].layer.getBounds()), { padding: [50, 50], maxZoom: 16, duration: calm.matches ? 0 : 0.9 });
    },
    showYear: function (y) {
      endTour();
      setPlaying(false);
      map.closePopup();
      showSeason(y);
      showMap();
      say(y + ': ' + ha1(meta.built_since_ha[y] || 0) + ' ha first built over this season');
    },
    showMarsh: function (ranks) {
      endTour();
      setMarsh(true);
      if (ranks) fitRanks(ranks);
      else { map.closePopup(); showMap(); home(true); }
    },
    showFlood: function () {
      endTour();
      map.closePopup();
      compareFlood();
      showMap();
      home(true);
    }
  };
  $('marsh-show').addEventListener('click', function () { mapApi.showMarsh(); });
  $('flood-show').addEventListener('click', function () { mapApi.showFlood(); });

  // ---- guided tour: six steps over the real map ---------------------------
  var coach = $('coach');
  var tourStep = -1;
  var marshNear = nearMarsh.length + ' of ' + all.length;
  // each step starts clean: no popup, and no patch left selected by step 4 (on a phone it has no popup to close)
  function fresh() { map.closePopup(); clearSelection(); if (spotMark) map.removeLayer(spotMark); }
  // a square on patch #1 the AI saw as water from 2018 to 2023 and as buildings in 2025 and 2026
  var DEMO_SPOT = [12.96236, 80.22955];
  var TOUR = [
    {
      title: 'Compare 2018 and 2026',
      text: 'Drag the ⇔ handle on the white divider. Left of it is the 2018 dry season, right of it is 2026: real Sentinel-2 satellite images of the same ground.',
      short: 'Drag the ⇔ handle: 2018 on the left, 2026 on the right. Real satellite images of the same ground.',
      run: function () { fresh(); setPlaying(false); state.left = FIRST; state.right = LAST; setMode('compare'); setView('photo'); home(true); setTimeout(sweep, calm.matches ? 0 : 900); }
    },
    {
      title: 'Watch it year by year',
      text: 'Every dry season from 2018 to 2026 plays in turn. A dashed patch is still water or marsh that season; it fills red from the year it was built over. ' +
        Math.round(recentHa / meta.lost_ha * 100) + '% of the 28.1 ha went in the last three seasons.',
      short: 'Every dry season, 2018 to 2026. Dashed patches fill red from the year they were built over. ' +
        Math.round(recentHa / meta.lost_ha * 100) + '% of it went in the last three seasons.',
      run: function () { stopSweep(); fresh(); setView('photo'); state.year = FIRST; setMode('single'); setTimeout(function () { if (tourStep === 1) setPlaying(true); }, calm.matches ? 0 : 700); }
    },
    {
      title: 'See what the AI sees',
      text: 'Dynamic World, an AI model, labels every 10 m square: blue is water, purple is marsh, grey is buildings. Tap any spot to see its label in every season, as here. Where blue or purple turned grey and stayed grey in 2025 and 2026, we flag it in red.',
      short: 'An AI model labels every 10 m square: blue water, purple marsh, grey buildings. Tap any spot to see its label every season, as here.',
      run: function () {
        setPlaying(false); fresh(); state.left = FIRST; state.right = LAST; setMode('compare'); setView('labels');
        // Close in, so the 10 m squares show. On a wide screen the spot sits low and to the right
        // of this card, with its popup above it; on a phone this card would cover a popup, so
        // the card itself shows the spot's seasons and the spot sits just above it.
        var at = L.latLng(DEMO_SPOT), z = 15.5;
        function flyToSpot(then) {
          var size = map.getSize();
          var dy = narrow.matches ? -(coach.offsetHeight + 20) / 2 : Math.min(size.y / 2 - 40, 150);
          var dx = narrow.matches ? 0 : Math.min(size.x / 4, (coach.offsetWidth + 14) / 2);
          var to = { center: map.unproject(map.project(at, z).subtract([dx, dy]), z), zoom: z };
          map.flyTo(to.center, z, { duration: calm.matches ? 0 : 0.9 });
          whenThere(to, then);
        }
        if (!narrow.matches) { flyToSpot(function () { if (tourStep === 2) askSpot(DEMO_SPOT, true); }); return; }
        readSpot(at).then(function (spot) {
          if (tourStep !== 2) return;
          if (spot) {
            $('coach-fig').innerHTML = '<div class="sp sp-coach">' + spotCells(spot.names) + '</div>';
            markSpot(spot.cell);
          }
          flyToSpot(function () {});
        });
      }
    },
    {
      title: 'Open the biggest patch',
      text: 'Patch #1, Perungudi: 10.92 ha of marsh until 2022, cleared from 2023, built over since 2024. The bars show what the AI saw there each season. Like every patch, it needs a ground check.',
      short: 'Patch #1, Perungudi: 10.92 ha of marsh until 2022, built over since 2024. A possible change that needs a ground check.',
      // on a phone the popup would sit under this card, so the card carries the close-up instead
      figure: 1,
      run: function () {
        setView('photo');
        if (narrow.matches) select(1, { fly: true, popup: false, padBottom: coach.offsetHeight + 20 });
        else select(1, { fly: true });
      }
    },
    {
      title: 'The protected marsh',
      text: marshNear + ' patches lie inside the protected marsh outline or within 1 km of it, the zone where the National Green Tribunal stopped new approvals in Sep 2025. Patch #1 lies inside the outline.',
      short: marshNear + ' patches lie inside the protected marsh or within 1 km of it, where the Green Tribunal stopped new approvals in 2025.',
      run: function () { fresh(); setView('photo'); setMarsh(true).then(function () { if (tourStep === 4) home(true); }); }
    },
    {
      title: 'After the 2021 floods',
      text: 'Left: ' + floodDay + ', after Chennai\'s November 2021 floods. Right: 2026. ' + floodWet.length + ' flagged patches were still water or marsh that day; all are buildings now. In the final round: alerts, citizen photo checks and complaint letters.',
      short: 'Left: ' + floodDay + ', after the 2021 floods. Right: 2026. ' + floodWet.length + ' flagged patches held water that day; all are buildings now.',
      run: function () { setMarsh(false); fresh(); compareFlood(); home(true); setTimeout(sweep, calm.matches ? 0 : 900); }
    }
  ];
  // The tour plays itself (Pause stops it; Next and Back still work). Each step stays up
  // long enough to read, and the year-by-year step until the seasons have played.
  var auto = false, autoTimer = null;
  var autoBtn = $('coach-auto'), bar = $('coach-bar'), barFill = bar.firstChild;
  function dwell(text) { return Math.max(7000, Math.min(10000, text.split(' ').length * 250)); }
  function stepTime(i) {
    var s = TOUR[i];
    return dwell(narrow.matches ? s.short : s.text) + (i === 1 ? 3500 : 0);
  }
  function runBar(ms) {
    barFill.style.transition = 'none';
    barFill.style.width = '0';
    void barFill.offsetWidth;   // restart the fill from empty
    barFill.style.transition = 'width ' + ms + 'ms linear';
    barFill.style.width = '100%';
  }
  function stopBar() {
    barFill.style.width = getComputedStyle(barFill).width;
    barFill.style.transition = 'none';
  }
  function scheduleNext(ms) {
    clearTimeout(autoTimer);
    runBar(ms);
    var step = tourStep, t0 = Date.now();
    (function wait() {
      autoTimer = setTimeout(function () {
        if (!auto || tourStep !== step) return;
        if (playing && Date.now() - t0 < 25000) { wait(); return; }   // let the seasons finish
        next(false);
      }, Math.max(300, ms - (Date.now() - t0)));
    })();
  }
  function setAuto(on) {
    auto = on;
    autoBtn.textContent = on ? 'Pause' : 'Auto-play';
    autoBtn.setAttribute('aria-label', on ? 'Pause the tour' : 'Play the tour by itself');
    bar.hidden = !on;
    if (!on) { clearTimeout(autoTimer); stopBar(); }
    else if (tourStep >= 0) scheduleNext(stepTime(tourStep));
  }
  function showStep(i, byHand) {
    tourStep = i;
    var s = TOUR[i];
    coach.hidden = false;
    $('coach-step').textContent = (i + 1) + ' of ' + TOUR.length;
    $('coach-title').textContent = s.title;
    $('coach-text').textContent = narrow.matches ? s.short : s.text;
    $('coach-fig').innerHTML = s.figure && narrow.matches ? figureHtml(byRank[s.figure].feature.properties) : '';
    $('coach-back').hidden = i === 0;
    $('coach-next').textContent = i === TOUR.length - 1 ? 'Done' : 'Next';
    autoBtn.hidden = false;
    s.run();
    if (auto) scheduleNext(stepTime(i));
    // playing by itself, the focus stays put (on Pause, say); stepping by hand, it moves to the new step
    if (byHand || !auto) $('coach-title').focus({ preventScroll: true });
  }
  function next(byHand) {
    if (tourStep >= TOUR.length - 1) {
      endTour();
      say('Tour done. Tap any patch, row or spot to explore.');
    }
    else showStep(tourStep + 1, byHand);
  }
  function startTour(withAuto) {
    closeIntro();
    hideHint();
    showMap();
    setAuto(withAuto !== false);
    showStep(0);
    if (auto) autoBtn.focus({ preventScroll: true });
  }
  function endTour() {
    if (tourStep < 0) return;
    tourStep = -1;
    coach.hidden = true;
    clearTimeout(autoTimer);
    stopSweep();
  }
  autoBtn.addEventListener('click', function () { setAuto(!auto); });
  $('coach-next').addEventListener('click', function () { next(true); });
  $('coach-back').addEventListener('click', function () { if (tourStep > 0) showStep(tourStep - 1, true); });
  $('coach-x').addEventListener('click', endTour);
  // Escape ends the tour; otherwise it closes an open card wherever the focus is (Leaflet
  // only listens while the map itself has focus, not a pin). An open dialog takes it first.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    if (tourStep >= 0) endTour();
    else if (map.hasLayer(popup) || map.hasLayer(spotPopup)) map.closePopup();
  });
  L.DomEvent.disableClickPropagation(coach);
  L.DomEvent.disableScrollPropagation(coach);
  $('start-tour').addEventListener('click', function () { startTour(true); });
  $('bar-tour').addEventListener('click', function () { startTour(true); });

  // ---- first look: what to tap ----------------------------------------------
  // Once the map is in view, the flagged patches and their pins pulse a few times
  // (not with reduced motion), and a hint says to tap any spot until the first
  // spot question (remembered on this device).
  var hint = $('map-hint');
  var looked = false;
  function hideHint() { if (hint) hint.hidden = true; }
  function firstLook() {
    if (looked || tourStep >= 0) return;
    looked = true;
    if (store('neerkatti-asked') !== 'yes') hint.hidden = false;
    if (calm.matches) return;
    container.classList.add('pulse');
    setTimeout(function () { container.classList.remove('pulse'); }, 3500);
  }

  // ---- intro: what this is, what works now, what comes in the final ---------
  var intro = $('intro');
  function openIntro() {
    if (intro.open) return;
    if (intro.showModal) intro.showModal(); else intro.setAttribute('open', '');
  }
  function closeIntro() {
    store('neerkatti-intro', 'seen');
    if (!intro.open) return;
    if (intro.close) intro.close(); else intro.removeAttribute('open');
  }
  intro.addEventListener('close', function () { store('neerkatti-intro', 'seen'); });
  // a click on the backdrop closes it; a click on the card's own padding also targets the dialog, so check where it landed
  intro.addEventListener('click', function (e) {
    if (e.target !== intro) return;
    var r = intro.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { closeIntro(); firstLook(); }
  });
  // the first look also follows the dialog's close event (its × and Esc), which some browsers send a frame later
  $('intro-close').addEventListener('click', function () { closeIntro(); firstLook(); });
  $('intro-tour').addEventListener('click', function () { startTour(true); });
  $('open-intro').addEventListener('click', function () { endTour(); openIntro(); });

  // ---- extension points for the final round ------------------------------------------
  // The 24-hour features (alerts, citizen photo check, complaint PDF, radar) are to be built
  // as separate files that load after this one and use only this API, so four people can
  // work at once without editing this file. docs/FINAL_ROUND_PLAN.md has the plan and the
  // data formats. Nothing in the Round 2 map uses it yet.
  var listeners = { select: [], season: [] };
  function emit(name, value) {
    ((listeners && listeners[name]) || []).forEach(function (fn) { try { fn(value); } catch (e) { if (window.console) console.error(e); } });
  }
  var api = {
    version: 1,
    map: map,                     // the Leaflet map, for new layers
    data: D,                      // {meta, patches}, as in data/neerkatti_data.js
    core: core,                   // the plain helpers in core.js
    seasons: SPOT_KEYS.slice(),   // '2018' … '2026', 'monsoon'
    pick: function (rank) { mapApi.pick(rank); },
    showSeason: function (y) { mapApi.showYear(String(y)); },
    askSpot: function (lat, lon) { askSpot([lat, lon]); },
    readSpot: function (lat, lon) { return readSpot(L.latLng(lat, lon)); },
    say: say,
    // {id, label, run(patch, api), when(patch) optional}: a button in every patch's card
    addPatchAction: function (action) {
      patchActions = patchActions.filter(function (a) { return a.id !== action.id; }).concat([action]);
      if (selected && map.hasLayer(popup)) popup.setContent(popupHtml(selected.feature.properties));
    },
    // 'select' (a patch's properties) or 'season' ('2018' …)
    on: function (name, fn) { if (listeners[name]) listeners[name].push(fn); }
  };
  window.NEERKATTI_API = api;

  // ---- start ----------------------------------------------------------------
  map.on('resize', function () {
    if (fitted) return;
    home(false);
    if (fitted && core.readHash(location.hash).patch) applyHash(true);
  });
  // Leaflet only watches the window; this also catches the map box changing size on its own.
  if (window.ResizeObserver) new ResizeObserver(function () { map.invalidateSize(); }).observe(container);

  applyLayers();
  fitLabels();
  spreadPins();
  declutter();
  applyHash(true);
  // first visit without a shared view: explain the map; ?tour=1 starts the tour, ?intro=0 skips both.
  // The first look follows once the map is in view (not under a shared patch's card).
  var sharedPatch = core.readHash(location.hash).patch;
  if (params.get('tour') === '1') startTour(params.get('auto') !== '0');
  else if (params.get('intro') !== '0' && !sharedPatch && store('neerkatti-intro') !== 'seen') {
    openIntro();
    intro.addEventListener('close', function once() { intro.removeEventListener('close', once); firstLook(); });
  }
  else if (!sharedPatch) firstLook();
})();

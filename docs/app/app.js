// NEERKATTI live map (Round 2 prototype).
// Data comes from data/neerkatti_data.js (analysis/app_assets.py + patch_details.py);
// plain helpers are in core.js, which tests/core.test.js checks.
(function () {
  var D = window.NEERKATTI;
  var core = window.NKCore;
  var meta = D.meta;
  var all = D.patches.features.map(function (f) { return f.properties; });
  var top10 = D.patches.features.slice(0, 10);
  var narrow = window.matchMedia('(max-width: 899px)');
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  var params = new URLSearchParams(location.search);
  var state = { year: 'compare', view: 'photo', pos: 0.5, patches: true };
  var map = null;
  var mapApi = null;   // set once the map has started: pick, fitRanks, showYou, home

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
  function acres(x) { var a = x * 2.471; return a >= 10 ? Math.round(a) : a.toFixed(1); }
  function gmaps(p) { return 'https://www.google.com/maps/@' + p.lat + ',' + p.lon + ',400m/data=!3m1!1e3'; }
  function placeOf(p) { return esc(core.nameOf(p)); }
  function closeup(rank) { return 'data/closeups/patch_' + (rank < 10 ? '0' : '') + rank + '.jpg'; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function $(id) { return document.getElementById(id); }
  function store(key, value) {
    try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); } catch (e) { return null; }
  }
  function scrollToEl(el) { el.scrollIntoView({ behavior: calm.matches ? 'auto' : 'smooth', block: 'start' }); }

  // ---- side panel (filled first, so it works even if the map cannot start) --
  function setText(key, text) {
    document.querySelectorAll('[data-stat="' + key + '"]').forEach(function (el) { el.textContent = text; });
  }
  setText('lost', meta.lost_ha.toFixed(1) + ' ha');
  setText('acres', '≈' + Math.round(meta.lost_ha * 2.471) + ' acres flagged');
  setText('count', String(meta.patch_count));
  document.querySelector('[data-meta="photos"]').textContent =
    'Sentinel-2 photos: median of ' + meta.s2_images[meta.years[0]] + ' clear images (' + meta.years[0] + ') and ' +
    meta.s2_images[meta.years[1]] + ' (' + meta.years[1] + '), ' + meta.season + '.';

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

  // ---- the patch list: top 10 or all, sorted, filtered by area, or nearest first
  var list = $('spots');
  var listState = { scope: 'top', sort: 'size', area: null, from: null };
  var current = -1;   // rank of the selected patch

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
  function renderList() {
    var items = all.filter(function (p) {
      if (listState.area) return (p.admin_area || 'Unnamed area') === listState.area;
      return listState.scope === 'all' || p.rank <= 10;
    });
    items = core.sortPatches(items, listState.sort, listState.from);
    list.innerHTML = '';
    items.forEach(function (p) {
      var li = document.createElement('li');
      li.innerHTML = rowHtml(p);
      li.firstChild.addEventListener('click', function () { pick(p); });
      list.appendChild(li);
    });
    $('list-title').textContent = listState.area ? 'Flagged patches in ' + listState.area
      : listState.scope === 'all' ? 'All ' + all.length + ' flagged patches' : 'Top 10 flagged patches';
    $('filter').hidden = !listState.area;
    if (listState.area) {
      var sum = items.reduce(function (s, p) { return s + p.area_ha; }, 0);
      $('filter-text').textContent = items.length + (items.length === 1 ? ' patch, ' : ' patches, ') + ha(sum) + ' ha in all. ';
    }
    document.querySelectorAll('.hbar').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.area === listState.area));
    });
    markList(current);
  }
  function setScope(scope) {
    listState.scope = scope;
    var input = document.querySelector('input[name="scope"][value="' + scope + '"]');
    if (input) input.checked = true;
  }
  document.querySelectorAll('input[name="scope"]').forEach(function (r) {
    r.addEventListener('change', function () { listState.scope = r.value; listState.area = null; renderList(); });
  });
  $('sort').addEventListener('change', function (e) { listState.sort = e.target.value; renderList(); });
  $('filter-clear').addEventListener('click', function () { listState.area = null; renderList(); });
  renderList();

  // ---- flagged area by zone or village: one bar each, tap to list its patches --
  var areas = core.byArea(all);
  $('areas').innerHTML = areas.map(function (a) {
    var n = a.ranks.length;
    return '<button type="button" class="hbar" data-area="' + esc(a.area) + '" aria-pressed="false">' +
      '<span class="hbar-name">' + esc(a.area) + '<small>' + n + (n === 1 ? ' patch' : ' patches') + '</small></span>' +
      '<span class="hbar-track" aria-hidden="true"><i style="width:' + (a.ha / areas[0].ha * 100).toFixed(1) + '%"></i></span>' +
      '<span class="hbar-val">' + ha(a.ha) + ' ha</span></button>';
  }).join('');
  $('areas').querySelectorAll('.hbar').forEach(function (b) {
    b.addEventListener('click', function () {
      var a = areas.filter(function (x) { return x.area === b.dataset.area; })[0];
      listState.area = listState.area === a.area ? null : a.area;
      if (listState.area) setScope('all');   // an area lists all of its patches, not just its top-10 ones
      renderList();
      if (listState.area) {
        scrollToEl($('list-title'));
        if (mapApi) mapApi.fitRanks(a.ranks);
      }
    });
  });

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
      listState.area = null;
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

  // Stacking: basemap (tilePane) < 2026 < 2018 < place names < patches (overlayPane)
  map.createPane('after').style.zIndex = 240;
  map.createPane('before').style.zIndex = 250;
  map.createPane('names').style.zIndex = 350;
  map.getPane('names').style.pointerEvents = 'none';
  var paneBefore = map.getPane('before');
  var paneAfter = map.getPane('after');

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

  var imgAttr = 'Contains modified Copernicus Sentinel data · Dynamic World';
  // `full`: a light copy (analysis/web_images.py) shows first, then the full image
  // replaces it; the browser keeps the light one on screen until the full one is ready.
  function overlay(file, pane, alt, cls, full) {
    var layer = L.imageOverlay('data/' + file, box, { pane: pane, alt: alt, attribution: imgAttr, className: cls || '' });
    if (full) layer.once('load', function () { layer.setUrl('data/' + full); });
    return layer;
  }
  var images = {
    photo: {
      before: overlay('photo_2018_light.webp', 'before', 'Sentinel-2 satellite image, Feb–May 2018', '', 'photo_2018.webp'),
      after: overlay('photo_2026_light.webp', 'after', 'Sentinel-2 satellite image, Feb–May 2026', '', 'photo_2026.webp')
    },
    labels: {
      before: overlay('labels_2018.webp', 'before', 'AI land labels, 2018', 'dw-img'),
      after: overlay('labels_2026.webp', 'after', 'AI land labels, 2026', 'dw-img')
    }
  };
  // a small status line until the images on screen have loaded
  var loaded = {};
  function trackLoad(layer, key) {
    layer.on('load', function () { loaded[key] = true; checkLoaded(); });
    layer.on('error', function () { setNote('A satellite image did not load. Check the connection and reload the page.', true); });
  }
  Object.keys(images).forEach(function (v) {
    Object.keys(images[v]).forEach(function (y) { trackLoad(images[v][y], v + y); });
  });
  function checkLoaded() {
    if (note.classList.contains('error')) return;
    var need = [state.view + 'before', state.view + 'after'];
    var done = need.every(function (k) { return loaded[k]; });
    setNote(done ? '' : (state.view === 'labels' ? 'Loading AI labels…' : 'Loading satellite images…'));
    if (done) { connection(); addBasemap(); }
  }

  // ---- 2018 / 2026 compare ------------------------------------------------
  // The divider lives in its own pane (above the pins, below popups), so it is
  // placed in layer coordinates and moved along with the map.
  var container = map.getContainer();
  map.createPane('swipe').style.zIndex = 660;
  var swipe = L.DomUtil.create('div', 'swipe', map.getPane('swipe'));
  swipe.innerHTML = '<span class="year-tag before">2018</span><span class="year-tag after">2026</span>' +
    '<div class="knob" role="slider" tabindex="0" aria-label="Compare years: 2018 on the left, 2026 on the right"' +
    ' aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" aria-valuetext="50% of the map shows 2018">⇔</div>';
  var knob = swipe.querySelector('.knob');
  var singleTag = L.DomUtil.create('div', 'single-tag', container);
  L.DomEvent.disableClickPropagation(swipe);
  L.DomEvent.disableScrollPropagation(swipe);

  function clip() {
    if (state.year !== 'compare') { paneBefore.style.clip = ''; return; }
    var size = map.getSize();
    var nw = map.containerPointToLayerPoint([0, 0]);
    var se = map.containerPointToLayerPoint(size);
    var x = nw.x + size.x * state.pos;
    paneBefore.style.clip = 'rect(' + nw.y + 'px,' + x + 'px,' + se.y + 'px,' + nw.x + 'px)';
    swipe.style.left = x + 'px';
    swipe.style.top = nw.y + 'px';
    swipe.style.height = size.y + 'px';
  }
  function setPos(p) {
    state.pos = Math.max(0.02, Math.min(0.98, p));
    var pct = Math.round(state.pos * 100);
    knob.setAttribute('aria-valuenow', pct);
    knob.setAttribute('aria-valuetext', pct + '% of the map shows 2018');
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
    if (state.patches) {
      html += '<div class="row"><i class="patch"></i><span class="long">Flagged: water or marsh in 2018 → buildings in 2025 and 2026</span>' +
        '<span class="short">Flagged patch</span></div>';
    }
    if (state.view === 'labels') {
      html += '<div class="grid">' + meta.labels.map(function (l) {
        return '<div class="row"><i style="background:' + l.color + '"></i>' + esc(l.name) + '</div>';
      }).join('') + '</div>';
    }
    html += '<div class="row"><i class="dot"></i><span>Sathyabama (DEXATHON venue)</span></div>';
    html += '<div class="src">' + (state.view === 'labels'
      ? 'AI labels: Dynamic World, most common label in Feb–May'
      : 'Sentinel-2, median of Feb–May') + '</div>';
    this._body.innerHTML = html;
  };
  legend.addTo(map);
  legend.setOpen(!narrow.matches);

  // ---- flagged patches ------------------------------------------------------
  var STYLE = { color: '#ff1a1a', weight: 1.5, opacity: 1, fillColor: '#ff1a1a', fillOpacity: 0.35 };
  var HOVER = { weight: 3, fillOpacity: 0.55 };
  var ON = { color: '#FFD400', weight: 3, fillColor: '#ff1a1a', fillOpacity: 0.5 };
  var byRank = {};
  var selected = null;

  // 2018 | 2026 close-up (analysis/topten_closeups.py and patch_details.py → app_closeups.py)
  function figureHtml(p) {
    return '<figure class="pop-fig"><a href="' + closeup(p.rank) + '" target="_blank" rel="noopener" title="Open the close-up full size">' +
      '<img src="' + closeup(p.rank) + '" width="640" height="312" alt="Patch ' + p.rank + ' close-up: Sentinel-2, 2018 on the left, 2026 on the right with the patch outlined in red">' +
      '<span class="year-tag before">2018</span><span class="year-tag after">2026</span></a>' +
      '<figcaption>600&nbsp;m around the patch, outlined in red</figcaption></figure>';
  }
  // How sure the AI was: the three probabilities, the weakest of which sets the level
  function confHtml(p) {
    var low = core.weakest(p);
    function row(text, v) {
      var pct = Math.round(v * 100);
      return '<div class="conf-row' + (v === low ? ' weak' : '') + '"><span>' + text + '</span>' +
        '<span class="meter" aria-hidden="true"><i style="width:' + pct + '%"></i></span><b>' + pct + '%</b></div>';
    }
    return '<div class="conf"><div class="conf-head"><span>AI confidence</span>' + confPill(p, true) + '</div>' +
      row('Water or marsh, 2018', p.p_wet_2018) + row('Buildings, 2025', p.p_built_2025) + row('Buildings, 2026', p.p_built_2026) +
      '<div class="conf-src">Dynamic World\'s average probability over the patch and season. The lowest sets the level.</div></div>';
  }
  function popupHtml(p) {
    return '<div class="pop">' +
      '<div class="pop-title">#' + p.rank + ' · ' + placeOf(p) + '</div>' +
      '<div class="pop-ha">' + ha(p.area_ha) + ' ha <span>≈ ' + acres(p.area_ha) + ' acres</span>' +
      (p.site ? ' <span class="pill site">Site ' + p.site + '</span>' : '') + '</div>' +
      figureHtml(p) +
      '<p>' + (p.finding ? '<b>Checked by eye:</b> ' + esc(p.finding) + '.' : 'Water or marsh in 2018 → buildings in 2025 and 2026. Not checked by eye yet.') + '</p>' +
      confHtml(p) +
      '<div class="pills"><span class="pill check">Possible change, needs a ground check</span></div>' +
      '<a href="' + gmaps(p) + '" target="_blank" rel="noopener">Open in Google Maps (satellite) →</a>' +
      '</div>';
  }

  var patches = L.geoJSON(D.patches, {
    style: function () { return STYLE; },
    onEachFeature: function (f, layer) {
      var rank = f.properties.rank;
      byRank[rank] = { feature: f, layer: layer };
      layer.on('click', function (e) { L.DomEvent.stop(e); endTour(); select(rank, { latlng: e.latlng }); });
      layer.on('mouseover', function () { if (!selected || selected.layer !== layer) layer.setStyle(HOVER); });
      layer.on('mouseout', function () { if (!selected || selected.layer !== layer) layer.setStyle(STYLE); });
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
    byRank[p.rank].pin = pin;
  });

  L.circleMarker([meta.campus[1], meta.campus[0]], {
    radius: 6, color: '#1B2333', weight: 2, fillColor: '#FFD400', fillOpacity: 1
  }).bindTooltip('Sathyabama · DEXATHON venue').addTo(map);

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
    if (state.year === 'compare') {
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

  // the bottom padding keeps popups clear of the legend button and the credits line
  var popup = L.popup({ autoPanPaddingTopLeft: [10, 50], autoPanPaddingBottomRight: [10, 48] });

  function unmark(hit) {
    hit.layer.setStyle(STYLE);
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
    if (narrow.matches) legend.setOpen(false);
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
    var c = map.project(b.getCenter(), z).add([0, (bottom - top) / 2]);
    map.flyTo(map.unproject(c, z), z, { duration: calm.matches ? 0 : 0.9 });
  }

  function select(rank, opts) {
    var hit = byRank[rank];
    if (!hit) return;
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
    var width = narrow.matches ? 250 : 300;
    popup.options.maxWidth = popup.options.minWidth = width;
    // from the list, the popup sits on the patch's top edge so it doesn't cover it
    popup.setLatLng(opts.latlng || [b.getNorth(), b.getCenter().lng]).setContent(popupHtml(p));
    if (opts.fly) {
      var noPopup = opts.popup === false;
      map.once('moveend', function () { if (selected === hit && !noPopup) popup.openOn(map); });
      // room above the patch for the popup with its close-up and the AI confidence
      flyInto(b, noPopup ? 50 : narrow.matches ? 330 : 430, opts.padBottom || 40);
    } else {
      popup.openOn(map);
    }
    writeHash();
  }

  // ---- year, layer and the link that reopens them ---------------------------
  var YEAR_IN = { '2018': 'before', compare: 'compare', '2026': 'after' };
  var YEAR_OUT = { before: '2018', compare: 'compare', after: '2026' };
  function writeHash() {
    var h = core.hashFor({ patch: selected && selected.feature.properties.rank, year: YEAR_OUT[state.year], layer: state.view });
    if (h !== location.hash) history.replaceState(null, '', location.pathname + location.search + h);
  }
  function applyHash(fly) {
    var h = core.readHash(location.hash);
    setYear(YEAR_IN[h.year] || 'compare');
    setView(h.layer === 'labels' ? 'labels' : 'photo');
    if (h.patch && byRank[h.patch]) select(h.patch, { fly: fly });
    else if (selected) map.closePopup();
  }
  window.addEventListener('hashchange', function () { applyHash(true); });

  // ---- toolbar ------------------------------------------------------------
  function applyLayers() {
    ['photo', 'labels'].forEach(function (v) {
      ['before', 'after'].forEach(function (y) {
        var layer = images[v][y];
        if (v === state.view && !map.hasLayer(layer)) layer.addTo(map);
        if (v !== state.view && map.hasLayer(layer)) map.removeLayer(layer);
      });
    });
    paneBefore.style.display = state.year === 'after' ? 'none' : '';
    paneAfter.style.display = state.year === 'before' ? 'none' : '';
    swipe.hidden = state.year !== 'compare';
    singleTag.hidden = state.year === 'compare';
    singleTag.innerHTML = state.year === 'before'
      ? '<span class="year-tag before">2018</span>' : '<span class="year-tag after">2026</span>';
    clip();
    legend.update();
    checkLoaded();
    declutter();
  }
  function check(name, value) {
    var input = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (input) input.checked = true;
  }
  function setYear(y) { state.year = y; check('year', y); applyLayers(); writeHash(); }
  function setView(v) {
    state.view = v; check('view', v); applyLayers(); writeHash();
    if (v === 'labels') legend.setOpen(true);
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
  document.querySelectorAll('input[name="year"]').forEach(function (r) {
    r.addEventListener('change', function () { setYear(r.value); });
  });
  document.querySelectorAll('input[name="view"]').forEach(function (r) {
    r.addEventListener('change', function () { setView(r.value); });
  });
  $('show-patches').addEventListener('change', function (e) { setPatches(e.target.checked); });
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

  // ---- hooks for the panel: list rows, area bars and "near me" ------------------
  var you = null;
  mapApi = {
    say: say,
    pick: function (rank) { endTour(); showMap(); select(rank, { fly: true }); },
    fitRanks: function (ranks) {
      var b = L.latLngBounds([]);
      ranks.forEach(function (r) { b.extend(byRank[r].layer.getBounds()); });
      map.closePopup();
      showMap();
      map.flyToBounds(b, { padding: [40, 40], maxZoom: 16, duration: calm.matches ? 0 : 0.9 });
    },
    showYou: function (here, rank) {
      var at = [here.lat, here.lon];
      if (!you) {
        you = L.circleMarker(at, { radius: 7, color: '#fff', weight: 3, fillColor: '#1A73E8', fillOpacity: 1 })
          .bindTooltip('You are here (only on this device)').addTo(map);
      } else you.setLatLng(at);
      map.closePopup();
      showMap();
      map.flyToBounds(L.latLngBounds([at]).extend(byRank[rank].layer.getBounds()), { padding: [50, 50], maxZoom: 16, duration: calm.matches ? 0 : 0.9 });
    }
  };

  // ---- guided tour: three steps over the real map ---------------------------
  var coach = $('coach');
  var tourStep = -1;
  var TOUR = [
    {
      title: 'Compare 2018 and 2026',
      text: 'Drag the white divider. Left of it is the 2018 dry season, right of it is 2026: real Sentinel-2 satellite images of the same ground.',
      short: 'Drag the white divider: 2018 on the left, 2026 on the right. Real satellite images of the same ground.',
      run: function () { map.closePopup(); setView('photo'); setYear('compare'); home(true); setTimeout(sweep, calm.matches ? 0 : 900); }
    },
    {
      title: 'See what the AI sees',
      text: 'Dynamic World, an AI model, labels every 10 m square: blue is water, purple is marsh, grey is buildings. Where blue or purple turned grey and stayed grey in 2025 and 2026, we flag it in red.',
      short: 'An AI model labels every 10 m square: blue water, purple marsh, grey buildings. Blue or purple that turned grey in 2025 and 2026 is flagged red.',
      run: function () { stopSweep(); map.closePopup(); setView('labels'); setYear('compare'); }
    },
    {
      title: 'Open the biggest patch',
      text: 'Patch #1, Perungudi: 10.92 ha of 2018 marsh, now cleared and built up. The close-up shows 2018 beside 2026. Like every patch, it is a possible change that needs a ground check.',
      short: 'Patch #1, Perungudi: 10.92 ha of 2018 marsh, now cleared and built up. A possible change that needs a ground check.',
      // on a phone the popup would sit under this card, so the card carries the close-up instead
      figure: 1,
      run: function () {
        setView('photo');
        if (narrow.matches) select(1, { fly: true, popup: false, padBottom: coach.offsetHeight + 20 });
        else select(1, { fly: true });
      }
    }
  ];
  function showStep(i) {
    tourStep = i;
    var s = TOUR[i];
    coach.hidden = false;
    $('coach-step').textContent = (i + 1) + ' of ' + TOUR.length;
    $('coach-title').textContent = s.title;
    $('coach-text').textContent = narrow.matches ? s.short : s.text;
    $('coach-fig').innerHTML = s.figure && narrow.matches ? figureHtml(byRank[s.figure].feature.properties) : '';
    $('coach-back').hidden = i === 0;
    $('coach-next').textContent = i === TOUR.length - 1 ? 'Done' : 'Next';
    s.run();
    $('coach-title').focus({ preventScroll: true });
  }
  function startTour() {
    closeIntro();
    showMap();
    showStep(0);
  }
  function endTour() {
    if (tourStep < 0) return;
    tourStep = -1;
    coach.hidden = true;
    stopSweep();
  }
  $('coach-next').addEventListener('click', function () {
    if (tourStep >= TOUR.length - 1) {
      endTour();
      if (selected && !map.hasLayer(popup)) popup.openOn(map);   // the phone tour showed the close-up in its card
      say('Tour done. Tap any patch or row to explore.');
    }
    else showStep(tourStep + 1);
  });
  $('coach-back').addEventListener('click', function () { if (tourStep > 0) showStep(tourStep - 1); });
  $('coach-x').addEventListener('click', endTour);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && tourStep >= 0) endTour(); });
  L.DomEvent.disableClickPropagation(coach);
  L.DomEvent.disableScrollPropagation(coach);
  $('start-tour').addEventListener('click', startTour);

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
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeIntro();
  });
  $('intro-close').addEventListener('click', closeIntro);
  $('intro-tour').addEventListener('click', startTour);
  $('open-intro').addEventListener('click', function () { endTour(); openIntro(); });

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
  // first visit without a shared view: explain the map; ?tour=1 starts the tour, ?intro=0 skips both
  if (params.get('tour') === '1') startTour();
  else if (params.get('intro') !== '0' && !core.readHash(location.hash).patch && store('neerkatti-intro') !== 'seen') openIntro();
})();

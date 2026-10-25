// NEERKATTI live map (Round 2 prototype).
// Data comes from data/neerkatti_data.js, made by analysis/app_assets.py.
(function () {
  var D = window.NEERKATTI;
  var meta = D.meta;
  var top10 = D.patches.features.slice(0, 10);
  var narrow = window.matchMedia('(max-width: 899px)');
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  var params = new URLSearchParams(location.search);
  var state = { year: 'compare', view: 'photo', pos: 0.5, patches: true };
  var map = null;

  // ---- helpers ------------------------------------------------------------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ha(x) { return x.toFixed(2); }
  function acres(x) { var a = x * 2.471; return a >= 10 ? Math.round(a) : a.toFixed(1); }
  function gmaps(p) { return 'https://www.google.com/maps/@' + p.lat + ',' + p.lon + ',400m/data=!3m1!1e3'; }
  function placeOf(p) { return p.place ? esc(p.place) : 'Unnamed area'; }
  function closeup(rank) { return 'data/closeups/patch_' + (rank < 10 ? '0' : '') + rank + '.jpg'; }
  function $(id) { return document.getElementById(id); }
  function store(key, value) {
    try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); } catch (e) { return null; }
  }

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

  var list = $('spots');
  top10.forEach(function (f) {
    var p = f.properties;
    var li = document.createElement('li');
    li.innerHTML = '<button type="button" class="spot" data-rank="' + p.rank + '" aria-current="false">' +
      '<span class="rank">' + p.rank + '</span>' +
      '<span class="name">' + placeOf(p) + '</span>' +
      '<span class="ha">' + ha(p.area_ha) + ' ha</span>' +
      '<span class="meta">' + (p.site ? '<span class="pill site">Site ' + p.site + '</span>' : '') +
      '<span>' + (p.finding ? esc(p.finding) : 'Not yet checked by eye') + '</span>' +
      '<span class="pill check">Possible change, needs a ground check</span></span>' +
      '</button>';
    li.firstChild.addEventListener('click', function () {
      if (!map) { window.open(gmaps(p), '_blank', 'noopener'); return; }
      endTour();
      showMap();
      select(p.rank, { fly: true });
    });
    list.appendChild(li);
  });

  var note = $('map-note');
  function setNote(text, isError) {
    note.textContent = text;
    note.hidden = !text;
    note.classList.toggle('error', !!isError);
  }

  // Without the map library (a blocked script, a very old browser) the list
  // above still works: each row opens the patch in Google Maps instead.
  if (!window.L) {
    setNote('The map could not start. The top 10 list still works, and the project page shows the same results.', true);
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

  // OpenStreetMap around the study area (CSS dims it, and darkens it in dark mode)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  // Our own place labels (positions from OpenStreetMap), drawn over the satellite images
  function label(p, cls) {
    return L.marker([p.lat, p.lon], {
      pane: 'names', interactive: false, keyboard: false,
      icon: L.divIcon({ className: 'place-label' + (cls ? ' ' + cls : ''), html: '<span>' + esc(p.name) + '</span>', iconSize: [0, 0] })
    });
  }
  var names = L.layerGroup(meta.places.map(function (p) { return label(p); }).concat(label(meta.marsh_label, 'water'))).addTo(map);
  function fitLabels() {
    map.getPane('names').style.display = map.getZoom() < 12 ? 'none' : '';
  }

  var imgAttr = 'Contains modified Copernicus Sentinel data · Dynamic World';
  function overlay(file, pane, alt, cls) {
    return L.imageOverlay('data/' + file, box, { pane: pane, alt: alt, attribution: imgAttr, className: cls || '' });
  }
  var images = {
    photo: {
      before: overlay('photo_2018.jpg', 'before', 'Sentinel-2 satellite image, Feb–May 2018'),
      after: overlay('photo_2026.jpg', 'after', 'Sentinel-2 satellite image, Feb–May 2026')
    },
    labels: {
      before: overlay('labels_2018.png', 'before', 'AI land labels, 2018', 'dw-img'),
      after: overlay('labels_2026.png', 'after', 'AI land labels, 2026', 'dw-img')
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
    swipe.addEventListener(t, function () { dragging = false; });
  });
  knob.addEventListener('keydown', function (e) {
    var step = { ArrowLeft: -0.05, ArrowDown: -0.05, ArrowRight: 0.05, ArrowUp: 0.05 }[e.key];
    if (step) { stopSweep(); setPos(state.pos + step); e.preventDefault(); }
    if (e.key === 'Home') { setPos(0); e.preventDefault(); }
    if (e.key === 'End') { setPos(1); e.preventDefault(); }
  });
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
      if (i >= keys.length - 1) { setPos(0.5); sweepId = null; return; }
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

  // 2018 | 2026 close-up of a top-10 patch (analysis/topten_closeups.py → app_closeups.py)
  function figureHtml(p) {
    return '<figure class="pop-fig"><a href="' + closeup(p.rank) + '" target="_blank" rel="noopener" title="Open the close-up full size">' +
      '<img src="' + closeup(p.rank) + '" width="640" height="312" alt="Patch ' + p.rank + ' close-up: Sentinel-2, 2018 on the left, 2026 on the right with the patch outlined in red">' +
      '<span class="year-tag before">2018</span><span class="year-tag after">2026</span></a>' +
      '<figcaption>600&nbsp;m around the patch, outlined in red</figcaption></figure>';
  }
  function popupHtml(p) {
    var top = p.rank <= 10;
    return '<div class="pop">' +
      '<div class="pop-title">' + (top ? '#' + p.rank + ' · ' + placeOf(p) : 'Patch #' + p.rank) + '</div>' +
      '<div class="pop-ha">' + ha(p.area_ha) + ' ha <span>≈ ' + acres(p.area_ha) + ' acres</span>' +
      (p.site ? ' <span class="pill site">Site ' + p.site + '</span>' : '') + '</div>' +
      (top ? figureHtml(p) : '<p>Water or marsh in 2018 → buildings in 2025 and 2026.</p>') +
      '<p>' + (p.finding ? '<b>Checked by eye:</b> ' + esc(p.finding) + '.' : 'Not yet checked by eye.') + '</p>' +
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
      icon: L.divIcon({ className: 'rank-pin', html: '<span>' + p.rank + '</span>', iconSize: [22, 22], iconAnchor: [2, 20] }),
      title: '#' + p.rank + ' ' + (p.place || '') + ', ' + ha(p.area_ha) + ' ha',
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

  // Keep place names off the rank pins: try the label where OpenStreetMap puts it,
  // then a little below, above or to one side. Only zooming changes how they overlap.
  function declutter() {
    var boxes = state.patches ? top10.map(function (f) {
      var pt = map.latLngToContainerPoint(byRank[f.properties.rank].pin.getLatLng());
      return [pt.x - 4, pt.y - 22, pt.x + 22, pt.y + 4];
    }) : [];
    names.eachLayer(function (m) {
      var el = m.getElement();
      var span = el && el.firstChild;
      if (!span || !span.offsetWidth) return;
      var pt = map.latLngToContainerPoint(m.getLatLng());
      var w = span.offsetWidth / 2 + 2, h = 8;
      var tries = [[0, 0], [0, 15], [0, -15], [0, 28], [0, -28], [w, 0], [-w, 0], [w, 15], [-w, 15]], pick = tries[0];
      for (var i = 0; i < tries.length; i++) {
        var x = pt.x + tries[i][0], y = pt.y + tries[i][1];
        var hit = boxes.some(function (b) { return x + w > b[0] && x - w < b[2] && y + h > b[1] && y - h < b[3]; });
        if (!hit) { pick = tries[i]; break; }
      }
      span.style.marginLeft = pick[0] + 'px';
      span.style.marginTop = pick[1] + 'px';
    });
  }
  map.on('zoomend', function () { fitLabels(); declutter(); });

  var popup = L.popup({ autoPanPaddingTopLeft: [10, 50], autoPanPaddingBottomRight: [10, 10] });

  function markList(rank) {
    document.querySelectorAll('.spot').forEach(function (b) {
      b.setAttribute('aria-current', String(+b.dataset.rank === rank));
    });
  }
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
    var wide = p.rank <= 10;   // top-10 popups carry the close-up, so they get a fixed width
    var width = narrow.matches ? 250 : 300;
    popup.options.maxWidth = width;
    popup.options.minWidth = wide ? width : 190;
    // from the list, the popup sits on the patch's top edge so it doesn't cover it
    popup.setLatLng(opts.latlng || [b.getNorth(), b.getCenter().lng]).setContent(popupHtml(p));
    if (opts.fly) {
      var noPopup = opts.popup === false;
      map.once('moveend', function () { if (selected === hit && !noPopup) popup.openOn(map); });
      // room above the patch for the popup with its close-up
      flyInto(b, noPopup ? 50 : wide ? (narrow.matches ? 300 : 340) : 190, opts.padBottom || 40);
    } else {
      popup.openOn(map);
    }
    writeHash();
  }

  // ---- year, layer and the link that reopens them ---------------------------
  // The address keeps the view: #patch-4&year=2018&layer=labels (defaults are left out).
  var YEAR_IN = { '2018': 'before', compare: 'compare', '2026': 'after' };
  var YEAR_OUT = { before: '2018', compare: 'compare', after: '2026' };
  function readHash() {
    var out = {};
    location.hash.replace(/^#/, '').split('&').forEach(function (part) {
      var m = /^patch-(\d+)$/.exec(part);
      if (m) { out.patch = +m[1]; return; }
      var kv = part.split('=');
      if (kv.length === 2) out[kv[0]] = decodeURIComponent(kv[1]);
    });
    return out;
  }
  function writeHash() {
    var parts = [];
    if (selected) parts.push('patch-' + selected.feature.properties.rank);
    if (state.year !== 'compare') parts.push('year=' + YEAR_OUT[state.year]);
    if (state.view !== 'photo') parts.push('layer=labels');
    var h = parts.length ? '#' + parts.join('&') : '';
    if (h !== location.hash) history.replaceState(null, '', location.pathname + location.search + h);
  }
  function applyHash(fly) {
    var h = readHash();
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
    if (narrow.matches) $('map-wrap').scrollIntoView({ behavior: calm.matches ? 'auto' : 'smooth', block: 'start' });
  }
  $('reset').addEventListener('click', function () {
    endTour();
    map.closePopup();
    showMap();
    home(true);
  });

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
    if (fitted && readHash().patch) applyHash(true);
  });
  // Leaflet only watches the window; this also catches the map box changing size on its own.
  if (window.ResizeObserver) new ResizeObserver(function () { map.invalidateSize(); }).observe(container);

  applyLayers();
  fitLabels();
  declutter();
  applyHash(true);
  // first visit without a shared view: explain the map; ?tour=1 starts the tour, ?intro=0 skips both
  if (params.get('tour') === '1') startTour();
  else if (params.get('intro') !== '0' && !readHash().patch && store('neerkatti-intro') !== 'seen') openIntro();
})();

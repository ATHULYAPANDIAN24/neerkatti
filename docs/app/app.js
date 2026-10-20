// NEERKATTI live map (Round 2 prototype).
// Data comes from data/neerkatti_data.js, made by analysis/app_assets.py.
(function () {
  var D = window.NEERKATTI;
  var meta = D.meta;
  var top10 = D.patches.features.slice(0, 10);
  var box = L.latLngBounds([meta.box[1], meta.box[0]], [meta.box[3], meta.box[2]]);
  var narrow = window.matchMedia('(max-width: 899px)');
  var state = { year: 'compare', view: 'photo', pos: 0.5, patches: true };

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

  // ---- map and layers -----------------------------------------------------
  var map = L.map('map', {
    zoomControl: false, zoomSnap: 0.25, zoomDelta: 0.5, minZoom: 11, maxZoom: 17,
    maxBounds: box.pad(0.8), maxBoundsViscosity: 0.7
  });
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  L.control.zoom({ position: 'topright' }).addTo(map);
  map.fitBounds(box, { padding: [8, 8] });

  // Stacking: basemap (tilePane) < 2026 < 2018 < place names < patches (overlayPane)
  map.createPane('after').style.zIndex = 240;
  map.createPane('before').style.zIndex = 250;
  map.createPane('names').style.zIndex = 350;
  map.getPane('names').style.pointerEvents = 'none';
  var paneBefore = map.getPane('before');
  var paneAfter = map.getPane('after');

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
  map.on('zoomend', fitLabels);

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

  // ---- 2018 / 2026 compare ------------------------------------------------
  // The divider lives in its own pane (above the pins, below popups), so it is
  // placed in layer coordinates and moved along with the map.
  var container = map.getContainer();
  map.createPane('swipe').style.zIndex = 660;
  var swipe = L.DomUtil.create('div', 'swipe', map.getPane('swipe'));
  swipe.innerHTML = '<span class="year-tag before">2018</span><span class="year-tag after">2026</span>' +
    '<div class="knob" role="slider" tabindex="0" aria-label="Compare years: 2018 on the left, 2026 on the right"' +
    ' aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">⇔</div>';
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
    knob.setAttribute('aria-valuenow', Math.round(state.pos * 100));
    clip();
  }
  var dragging = false;
  function dragTo(e) {
    var r = container.getBoundingClientRect();
    setPos((e.clientX - r.left) / r.width);
  }
  swipe.addEventListener('pointerdown', function (e) {
    dragging = true; swipe.setPointerCapture(e.pointerId); e.preventDefault(); dragTo(e);
  });
  swipe.addEventListener('pointermove', function (e) { if (dragging) dragTo(e); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) {
    swipe.addEventListener(t, function () { dragging = false; });
  });
  knob.addEventListener('keydown', function (e) {
    var step = { ArrowLeft: -0.05, ArrowDown: -0.05, ArrowRight: 0.05, ArrowUp: 0.05 }[e.key];
    if (step) { setPos(state.pos + step); e.preventDefault(); }
    if (e.key === 'Home') { setPos(0); e.preventDefault(); }
    if (e.key === 'End') { setPos(1); e.preventDefault(); }
  });
  map.on('move zoom zoomend resize viewreset', clip);

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

  function popupHtml(p) {
    var title = p.rank <= 10 ? '#' + p.rank + ' · ' + placeOf(p) : 'Patch #' + p.rank;
    return '<div class="pop">' +
      '<div class="pop-title">' + title + '</div>' +
      '<div class="pop-ha">' + ha(p.area_ha) + ' ha <span>≈ ' + acres(p.area_ha) + ' acres</span></div>' +
      '<p>Water or marsh in 2018 → buildings in 2025 and 2026.</p>' +
      '<div class="pills"><span class="pill check">Possible change, needs a ground check</span>' +
      (p.site ? '<span class="pill seen">Site ' + p.site + ' · checked by eye</span>' : '') + '</div>' +
      (p.site ? '' : '<p>Not yet checked by eye.</p>') +
      '<a href="' + gmaps(p) + '" target="_blank" rel="noopener">Open in Google Maps (satellite) →</a>' +
      '</div>';
  }

  var patches = L.geoJSON(D.patches, {
    style: function () { return STYLE; },
    onEachFeature: function (f, layer) {
      var rank = f.properties.rank;
      byRank[rank] = { feature: f, layer: layer };
      layer.on('click', function (e) { L.DomEvent.stop(e); select(rank, { latlng: e.latlng }); });
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
      riseOnHover: true
    });
    pin.on('click', function () { select(p.rank, { fly: true }); });
    pins.addLayer(pin);
    byRank[p.rank].pin = pin;
  });

  L.circleMarker([meta.campus[1], meta.campus[0]], {
    radius: 6, color: '#1B2333', weight: 2, fillColor: '#FFD400', fillOpacity: 1
  }).bindTooltip('Sathyabama · DEXATHON venue').addTo(map);

  var popup = L.popup({ maxWidth: narrow.matches ? 220 : 280, autoPanPaddingTopLeft: [10, 50], autoPanPaddingBottomRight: [10, 10] });

  function markList(rank) {
    document.querySelectorAll('.spot').forEach(function (b) {
      b.setAttribute('aria-current', String(+b.dataset.rank === rank));
    });
  }
  function clearSelection() {
    if (!selected) return;
    selected.layer.setStyle(STYLE);
    if (selected.pin) L.DomUtil.removeClass(selected.pin.getElement(), 'on');
    selected = null;
    markList(-1);
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  }
  map.on('popupclose', function (e) { if (e.popup === popup) clearSelection(); });
  map.on('popupopen', function () { if (narrow.matches) legend.setOpen(false); });

  function select(rank, opts) {
    var hit = byRank[rank];
    if (!hit) return;
    opts = opts || {};
    map.closePopup();
    if (!state.patches) setPatches(true);
    selected = hit;
    hit.layer.setStyle(ON).bringToFront();
    if (hit.pin) L.DomUtil.addClass(hit.pin.getElement(), 'on');
    markList(rank);
    var p = hit.feature.properties;
    var b = hit.layer.getBounds();
    // from the list, the popup sits on the patch's top edge so it doesn't cover it
    popup.setLatLng(opts.latlng || [b.getNorth(), b.getCenter().lng]).setContent(popupHtml(p));
    if (opts.fly) {
      map.once('moveend', function () { if (selected === hit) popup.openOn(map); });
      map.flyToBounds(b, { paddingTopLeft: [40, 200], paddingBottomRight: [40, 40], maxZoom: 16, duration: 0.9 });
    } else {
      popup.openOn(map);
    }
    history.replaceState(null, '', '#patch-' + rank);
  }

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
  }
  function setPatches(on) {
    state.patches = on;
    document.getElementById('show-patches').checked = on;
    [patches, pins].forEach(function (l) { if (on) l.addTo(map); else map.removeLayer(l); });
    if (!on) map.closePopup();
    legend.update();
  }
  document.querySelectorAll('input[name="year"]').forEach(function (r) {
    r.addEventListener('change', function () { state.year = r.value; applyLayers(); });
  });
  document.querySelectorAll('input[name="view"]').forEach(function (r) {
    r.addEventListener('change', function () {
      state.view = r.value;
      applyLayers();
      if (state.view === 'labels') legend.setOpen(true);
    });
  });
  document.getElementById('show-patches').addEventListener('change', function (e) { setPatches(e.target.checked); });
  document.getElementById('show-names').addEventListener('change', function (e) {
    if (e.target.checked) names.addTo(map); else map.removeLayer(names);
  });

  // ---- side panel -----------------------------------------------------------
  function setText(key, text) {
    document.querySelectorAll('[data-stat="' + key + '"]').forEach(function (el) { el.textContent = text; });
  }
  setText('lost', meta.lost_ha.toFixed(1) + ' ha');
  setText('acres', '≈' + Math.round(meta.lost_ha * 2.471) + ' acres flagged');
  setText('count', String(meta.patch_count));
  document.querySelector('[data-meta="photos"]').textContent =
    'Sentinel-2 photos: median of ' + meta.s2_images[meta.years[0]] + ' clear images (' + meta.years[0] + ') and ' +
    meta.s2_images[meta.years[1]] + ' (' + meta.years[1] + '), ' + meta.season + '.';

  function showMap() {
    if (narrow.matches) document.getElementById('map-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  var list = document.getElementById('spots');
  top10.forEach(function (f) {
    var p = f.properties;
    var li = document.createElement('li');
    li.innerHTML = '<button type="button" class="spot" data-rank="' + p.rank + '" aria-current="false">' +
      '<span class="rank">' + p.rank + '</span>' +
      '<span class="name">' + placeOf(p) + '</span>' +
      '<span class="ha">' + ha(p.area_ha) + ' ha</span>' +
      '<span class="meta">' +
      (p.site ? '<span class="pill site">Site ' + p.site + '</span><span class="pill seen">Checked by eye</span>'
        : '<span>Not yet checked by eye</span>') +
      '<span class="pill check">Possible change, needs a ground check</span></span>' +
      '</button>';
    li.firstChild.addEventListener('click', function () { showMap(); select(p.rank, { fly: true }); });
    list.appendChild(li);
  });
  document.getElementById('reset').addEventListener('click', function () {
    map.closePopup();
    showMap();
    map.flyToBounds(box, { padding: [8, 8], duration: 0.8 });
  });

  applyLayers();
  fitLabels();
  var m =/^#patch-(\d+)$/.exec(location.hash);
  if (m && byRank[+m[1]]) select(+m[1], { fly: true });
})();

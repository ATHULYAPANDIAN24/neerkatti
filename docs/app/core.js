// Plain helpers for the NEERKATTI live map: no page, no map library, so
// tests/core.test.js runs them in Node. The page loads this before app.js.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NKCore = factory();
})(this, function () {
  // ---- distances ------------------------------------------------------------
  function distance(lat1, lon1, lat2, lon2) {   // metres, great circle
    var r = Math.PI / 180;
    var a = Math.pow(Math.sin((lat2 - lat1) * r / 2), 2) +
      Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.pow(Math.sin((lon2 - lon1) * r / 2), 2);
    return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  function formatDistance(m) {
    if (m < 1000) return Math.max(10, Math.round(m / 10) * 10) + ' m';
    if (m < 10000) return (m / 1000).toFixed(1) + ' km';
    return Math.round(m / 1000).toLocaleString('en-IN') + ' km';
  }

  // ---- patches --------------------------------------------------------------
  // The AI confidence level is set by the weakest of the three probabilities
  // (analysis/patch_details.py): water or marsh in 2018, built in 2025 and in 2026.
  function weakest(p) { return Math.min(p.p_wet_2018, p.p_built_2025, p.p_built_2026); }
  var LEVEL = { high: 0, medium: 1, low: 2 };
  // the top 10 have Round 1 place names; the rest are named by their zone or village
  function nameOf(p) { return p.place || p.admin_area || 'Unnamed area'; }

  // Sort patch properties for the list; `from` ({lat, lon}) is needed for 'distance'.
  function sortPatches(props, key, from) {
    var bySize = function (a, b) { return a.rank - b.rank; };
    var cmp = {
      confidence: function (a, b) { return LEVEL[a.ai_confidence] - LEVEL[b.ai_confidence] || weakest(b) - weakest(a) || bySize(a, b); },
      place: function (a, b) { return nameOf(a).localeCompare(nameOf(b)) || bySize(a, b); },
      distance: function (a, b) {
        return distance(from.lat, from.lon, a.lat, a.lon) - distance(from.lat, from.lon, b.lat, b.lon) || bySize(a, b);
      }
    }[key] || bySize;
    return props.slice().sort(cmp);
  }

  // Flagged hectares per area (Chennai Corporation zone, or village outside the city), largest first.
  function byArea(props) {
    var sums = {};
    props.forEach(function (p) {
      var k = p.admin_area || 'Unnamed area';
      sums[k] = sums[k] || { area: k, ha: 0, ranks: [] };
      sums[k].ha += p.area_ha;
      sums[k].ranks.push(p.rank);
    });
    return Object.keys(sums).map(function (k) { sums[k].ha = Math.round(sums[k].ha * 100) / 100; return sums[k]; })
      .sort(function (a, b) { return b.ha - a.ha || a.area.localeCompare(b.area); });
  }

  // ---- year by year (analysis/year_by_year.py) ----------------------------------
  // From which season the map draws a patch as built over (every patch is built in 2025 and 2026)
  function builtFrom(p) { return p.built_since || 2025; }

  // ---- the protected marsh (analysis/context_layers.py) --------------------------
  // 'inside' the mapped outline (even partly), in the 'zone' of `zoneM` metres around it, or 'outside'
  function marshStatus(p, zoneM) {
    if (p.marsh_share > 0) return 'inside';
    return p.marsh_distance_m <= zoneM ? 'zone' : 'outside';
  }

  // ---- what the lost marsh could hold -----------------------------------------------
  // Water over `ha` hectares at `depth` metres, in litres and Olympic pools (2,500 m³ each)
  function storage(ha, depth) {
    var m3 = ha * 10000 * depth;
    return { m3: m3, litres: m3 * 1000, pools: m3 / 2500 };
  }
  // Litres the Indian way: 28.1 crore, 45 lakh
  function indianLitres(l) {
    if (l >= 1e7) return (l / 1e7).toFixed(l < 1e9 ? 1 : 0) + ' crore litres';
    if (l >= 1e5) return (l / 1e5).toFixed(l < 1e6 ? 1 : 0) + ' lakh litres';
    return Math.round(l).toLocaleString('en-IN') + ' litres';
  }

  // ---- ask the AI about any spot: read the label images the map already shows ----------
  // The label images cover `box` ([west, south, east, north]) and are stretched to Web
  // Mercator (analysis/web_images.py). Which pixel of a `size` = [w, h] image is at lat, lon?
  function mercY(lat) { return Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)); }
  function pixelAt(box, size, lat, lon) {
    if (lon < box[0] || lon > box[2] || lat < box[1] || lat > box[3]) return null;
    var top = mercY(box[3]), span = top - mercY(box[1]);
    return {
      x: Math.min(size[0] - 1, Math.floor((lon - box[0]) / (box[2] - box[0]) * size[0])),
      y: Math.min(size[1] - 1, Math.floor((top - mercY(lat)) / span * size[1]))
    };
  }
  // The corners of that pixel, [[south, west], [north, east]], to outline it on the map
  function pixelBounds(box, size, x, y) {
    var top = mercY(box[3]), span = top - mercY(box[1]);
    function lat(py) { var m = top - py / size[1] * span; return (2 * Math.atan(Math.exp(m)) - Math.PI / 2) * 180 / Math.PI; }
    var west = box[0] + x / size[0] * (box[2] - box[0]), east = box[0] + (x + 1) / size[0] * (box[2] - box[0]);
    return [[lat(y + 1), west], [lat(y), east]];
  }
  // The label whose colour this pixel has (the label images are lossless, one colour
  // per label): its index in `labels` ([{name, color: '#419bdf'}]), 'cloud' for white
  // (no label: under cloud that day), or -1 for anything else
  function labelOf(rgb, labels) {
    if (rgb[0] === 255 && rgb[1] === 255 && rgb[2] === 255) return 'cloud';
    for (var i = 0; i < labels.length; i++) {
      var c = parseInt(labels[i].color.slice(1), 16);
      if (Math.abs((c >> 16) - rgb[0]) + Math.abs(((c >> 8) & 255) - rgb[1]) + Math.abs((c & 255) - rgb[2]) <= 6) return i;
    }
    return -1;
  }
  // What the change rule makes of one spot, from its label name in each dry season
  // ({'2018': 'water', … '2026': 'buildings'}): the rule's label test is water or marsh
  // in 2018 and buildings in both 2025 and 2026. `since` is the first season from which
  // it is buildings every season through 2026 (as in analysis/year_by_year.py).
  function spotVerdict(byYear, first, last) {
    var wet = function (n) { return n === 'water' || n === 'marsh'; };
    var a = byYear[String(first)], z = byYear[String(last)], z1 = byYear[String(last - 1)];
    var since = null;
    for (var y = last; y >= first && byYear[String(y)] === 'buildings'; y--) since = y;
    if (!wet(a)) return { kind: 'dry', since: since };
    if (z === 'buildings' && z1 === 'buildings') return { kind: 'passes', since: since };
    if (wet(z)) return { kind: 'wet', since: null };
    return { kind: 'changed', since: since };
  }

  // Is lat, lon inside a GeoJSON Polygon or MultiPolygon (holes respected)? Ray casting.
  function inRing(lat, lon, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function inPolygon(lat, lon, geometry) {
    var polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
    return polys.some(function (rings) {
      return inRing(lat, lon, rings[0]) && !rings.slice(1).some(function (hole) { return inRing(lat, lon, hole); });
    });
  }

  // ---- keeping marks apart on screen ------------------------------------------
  function overlaps(a, b) { return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]; }

  // Nudge markers of `size` px so they don't sit on each other. `points` are screen
  // positions in priority order (the first never moves); returns an offset for each.
  function spread(points, size) {
    var tries = [[0, 0], [size, 0], [-size, 0], [0, -size], [0, size], [size, -size], [-size, -size], [size, size], [-size, size]];
    var boxes = [];
    return points.map(function (pt) {
      for (var i = 0; i < tries.length; i++) {
        var x = pt[0] + tries[i][0], y = pt[1] + tries[i][1];
        var box = [x, y, x + size, y + size];
        if (!boxes.some(function (b) { return overlaps(box, b); })) { boxes.push(box); return tries[i]; }
      }
      boxes.push([pt[0], pt[1], pt[0] + size, pt[1] + size]);
      return [0, 0];
    });
  }

  // First offset in `tries` where a label of half-size (w, h) centred near (x, y)
  // hits none of `boxes` ([left, top, right, bottom]); null if every try collides.
  function freeSpot(x, y, w, h, boxes, tries) {
    for (var i = 0; i < tries.length; i++) {
      var cx = x + tries[i][0], cy = y + tries[i][1];
      var box = [cx - w, cy - h, cx + w, cy + h];
      if (!boxes.some(function (b) { return overlaps(box, b); })) return { offset: tries[i], box: box };
    }
    return null;
  }

  // ---- the address that reopens a view: #patch-4&year=2021&layer=labels&marsh=1 ---
  function readHash(hash) {
    var out = {};
    String(hash || '').replace(/^#/, '').split('&').forEach(function (part) {
      var m = /^patch-(\d+)$/.exec(part);
      if (m) { out.patch = +m[1]; return; }
      var kv = part.split('=');
      if (kv.length === 2 && kv[0]) {
        try { out[kv[0]] = decodeURIComponent(kv[1]); } catch (e) { /* a broken %-escape is ignored */ }
      }
    });
    return out;
  }
  // view: {patch, year: 'compare' or one season ('2021'), left and right: the two sides of
  // the compare ('2018', 'monsoon'…), layer: 'photo' | 'labels', marsh: true}; defaults are left out
  function hashFor(view) {
    var parts = [];
    if (view.patch) parts.push('patch-' + view.patch);
    if (view.year && view.year !== 'compare') parts.push('year=' + view.year);
    else {
      if (view.left && view.left !== '2018') parts.push('left=' + view.left);
      if (view.right && view.right !== '2026') parts.push('right=' + view.right);
    }
    if (view.layer === 'labels') parts.push('layer=labels');
    if (view.marsh) parts.push('marsh=1');
    return parts.length ? '#' + parts.join('&') : '';
  }

  return {
    distance: distance, formatDistance: formatDistance, weakest: weakest, sortPatches: sortPatches,
    nameOf: nameOf, byArea: byArea, builtFrom: builtFrom,
    marshStatus: marshStatus, storage: storage, indianLitres: indianLitres,
    pixelAt: pixelAt, pixelBounds: pixelBounds, labelOf: labelOf, spotVerdict: spotVerdict, inPolygon: inPolygon,
    overlaps: overlaps, spread: spread, freeSpot: freeSpot, readHash: readHash, hashFor: hashFor
  };
});

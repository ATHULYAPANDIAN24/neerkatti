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

  // ---- the address that reopens a view: #patch-4&year=2018&layer=labels ---------
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
  // view: {patch, year: '2018' | 'compare' | '2026', layer: 'photo' | 'labels'}; defaults are left out
  function hashFor(view) {
    var parts = [];
    if (view.patch) parts.push('patch-' + view.patch);
    if (view.year && view.year !== 'compare') parts.push('year=' + view.year);
    if (view.layer === 'labels') parts.push('layer=labels');
    return parts.length ? '#' + parts.join('&') : '';
  }

  return {
    distance: distance, formatDistance: formatDistance, weakest: weakest, sortPatches: sortPatches,
    nameOf: nameOf, byArea: byArea, overlaps: overlaps, spread: spread, freeSpot: freeSpot, readHash: readHash, hashFor: hashFor
  };
});

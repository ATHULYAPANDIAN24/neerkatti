// NEERKATTI offline copy. The map's own files are saved when the page is first
// opened, so it still works with no connection (a venue with poor Wi-Fi, say).
// Online, every request still goes to the network first, so a new version shows
// at once; the saved copy is only the fallback. tests/ checks the list below.
var VERSION = 'neerkatti-r2-3';
var SHELL = VERSION + '-shell';
var TILES = VERSION + '-tiles';
var MAX_TILES = 400;
var PRECACHE = [
  './', 'index.html', 'app.css', 'core.js', 'app.js', 'manifest.webmanifest',
  'vendor/leaflet/leaflet.css', 'vendor/leaflet/leaflet.js',
  'data/neerkatti_data.js', 'data/patches.geojson',
  'data/photo_2018_light.webp', 'data/photo_2026_light.webp',
  'data/photo_2018.webp', 'data/photo_2026.webp', 'data/labels_2018.webp', 'data/labels_2026.webp',
  'icons/icon-192.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(PRECACHE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf(VERSION) !== 0; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Same site: network first, saved copy if offline (or after 4 s of waiting with a copy in hand).
function networkFirst(request) {
  // ask the server every time (a quick 304 when nothing changed), so a new version is never hidden by the browser cache
  var fresh = request.mode === 'navigate' ? request : new Request(request, { cache: 'no-cache' });
  return caches.open(SHELL).then(function (cache) {
    var fromNet = fetch(fresh).then(function (res) {
      if (res.ok && res.status === 200) cache.put(request, res.clone()).catch(function () {});
      return res;
    });
    return cache.match(request, { ignoreSearch: request.mode === 'navigate' }).then(function (saved) {
      if (!saved) return fromNet;
      var slow = new Promise(function (resolve) { setTimeout(function () { resolve(saved); }, 4000); });
      return Promise.race([fromNet.catch(function () { return saved; }), slow]);
    });
  });
}

// Map tiles and the web font: the saved copy at once, refreshed in the background.
function savedFirst(request) {
  return caches.open(TILES).then(function (cache) {
    return cache.match(request).then(function (saved) {
      var fromNet = fetch(request).then(function (res) {
        if (res.ok && res.status === 200) cache.put(request, res.clone()).then(function () { trim(cache); }, function () {});
        return res;
      });
      if (saved) { fromNet.catch(function () {}); return saved; }
      return fromNet;
    });
  });
}
function trim(cache) {
  cache.keys().then(function (keys) {
    for (var i = 0; i < keys.length - MAX_TILES; i++) cache.delete(keys[i]);
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin === self.location.origin) event.respondWith(networkFirst(req));
  else if (url.hostname === 'tile.openstreetmap.org' || /^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) event.respondWith(savedFirst(req));
});

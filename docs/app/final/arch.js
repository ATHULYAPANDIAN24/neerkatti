// NEERKATTI final round: "How it works", the architecture card at the top of About (final/ui.css).
// One hand-built SVG data-flow diagram, why each part was picked, and the limits, said plainly.
// Every number comes from the data file or from the page's own accuracy note, never typed here.
// Needs the layout from final/ui.js; on with ?final=1, like the other files here.
(function () {
  var F = window.NKFinal;
  var about = document.querySelector('.m3-view[data-view="about"]');
  if (!F || !F.on || !F.api || !about) return;
  var meta = F.api.data.meta, esc = F.esc;
  var years = meta.timeline_years.length, ha = meta.lost_ha, n = meta.patch_count;

  // Dynamic World's published accuracy, as the page's "How far to trust it" note cites it
  var acc = (document.body.textContent.replace(/\s+/g, ' ')
    .match(/([\d.]+)% user's accuracy for buildings but only ([\d.]+)% producer's accuracy for marsh/) || []);

  function icon(name) { return '<span class="msr" aria-hidden="true">' + name + '</span>'; }

  // the diagram: boxes top to bottom, a dashed line where the work moves from the cloud to the phone
  var W = 320, X = 8, BW = 304;
  var nodes = [
    { t: 'Sentinel-2 satellite', s: ['free · 10 m pixels · every 5 days'], who: 'ESA · free' },
    { t: 'Dynamic World AI', s: ['labels each 10 m square: water, marsh, built'], who: 'Google · free' },
    { t: 'Google Earth Engine', s: [years + ' years of dry-season (' + meta.season + ') composites'], who: 'Google · free' },
    { t: 'Our rule', s: ['marsh or water → built', 'rejects seasonal, shadow, shoreline noise'], who: 'ours', ours: 1 },
    { t: 'Static files', s: ['WebP label images + JSON · ' + n + ' patches · ' + ha + ' ha'], who: 'ours', ours: 1, cut: 1 },
    { t: 'Your phone', s: ['plain JS + Leaflet · offline after one visit'], who: 'ours', ours: 1 },
    { t: 'Complaint letter', s: ['English or Tamil, to the office that can act'], who: 'ours', ours: 1 }
  ];
  var y = 22, parts = [], prevBottom = null;
  parts.push('<text class="nk-a-band" x="' + X + '" y="14">ONCE, IN THE CLOUD</text>');
  nodes.forEach(function (d) {
    if (d.cut) {
      y += 14;
      parts.push('<line class="nk-a-cut" x1="0" x2="' + W + '" y1="' + (y - 8) + '" y2="' + (y - 8) + '"/>' +
        '<text class="nk-a-band" x="' + X + '" y="' + (y + 8) + '">ON THE PHONE · NO SERVER · NO API KEY</text>');
      y += 18;
    }
    var h = 32 + 16 * d.s.length;
    if (prevBottom != null) {
      var mx = W / 2;
      parts.push('<line class="nk-a-arrow" x1="' + mx + '" x2="' + mx + '" y1="' + (prevBottom + 2) + '" y2="' + (y - 7) + '"/>' +
        '<path class="nk-a-head" d="M' + (mx - 5) + ' ' + (y - 8) + 'h10l-5 7z"/>');
    }
    parts.push('<g class="nk-a-node' + (d.ours ? ' ours' : '') + '"><rect x="' + X + '" y="' + y + '" width="' + BW + '" height="' + h + '" rx="12"/>' +
      '<text class="nk-a-t" x="' + (X + 12) + '" y="' + (y + 21) + '">' + esc(d.t) + '</text>' +
      '<text class="nk-a-who" x="' + (X + BW - 12) + '" y="' + (y + 20) + '" text-anchor="end">' + esc(d.who) + '</text>' +
      d.s.map(function (s, i) { return '<text class="nk-a-s" x="' + (X + 12) + '" y="' + (y + 40 + 16 * i) + '">' + esc(s) + '</text>'; }).join('') +
      '</g>');
    prevBottom = y + h;
    y += h + 22;
  });
  var H = prevBottom + 4;
  var desc = nodes.map(function (d) { return d.t + ': ' + d.s.join(', '); }).join('. Then ') + '.';
  var svg = '<svg class="nk-arch-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-labelledby="nk-arch-t nk-arch-d">' +
    '<title id="nk-arch-t">How NEERKATTI works, from satellite to complaint letter</title><desc id="nk-arch-d">' + esc(desc) + '</desc>' +
    parts.join('') + '</svg>';

  var card = document.createElement('section');
  card.className = 'm3-card nk-arch';
  card.setAttribute('aria-labelledby', 'nk-arch-h');
  card.innerHTML =
    '<div class="nk-arch-head"><h3 id="nk-arch-h">How it works</h3>' +
    '<button type="button" class="m3-btn text nk-arch-full">' + icon('zoom_out_map') + 'Full screen</button></div>' +
    '<p class="small">The heavy analysis runs once in Google Earth Engine and is saved as plain files. The site is only HTML, CSS and JavaScript: ' +
    'no server, no database, no API key, ₹0 to run.</p>' +
    '<figure class="nk-arch-fig">' + svg +
    '<figcaption class="nk-arch-key"><span class="k ours"></span>built by us <span class="k"></span>free data and tools</figcaption></figure>' +
    '<h4 class="nk-arch-sub">Why each part</h4><ul class="m3-bullets">' +
    '<li>' + icon('auto_awesome') + '<span><b>Dynamic World.</b> Already validated by Google and WRI, so we do not train a model with no ground truth.</span></li>' +
    '<li>' + icon('satellite_alt') + '<span><b>Sentinel-2.</b> Free and every 5 days; 10 m is the finest free optical image.</span></li>' +
    '<li>' + icon('cloud_off') + '<span><b>No server.</b> Nothing to run, nothing to hack, ₹0.</span></li>' +
    '<li>' + icon('map') + '<span><b>Leaflet.</b> About 42 KB compressed, so it runs on a cheap phone.</span></li></ul>' +
    '<h4 class="nk-arch-sub">Limits</h4><ul class="m3-bullets nk-arch-lim">' +
    '<li>' + icon('visibility') + '<span>A 10 m pixel cannot see one house; small dumping is missed.</span></li>' +
    (acc[1] ? '<li>' + icon('info') + '<span>Dynamic World is right about buildings ' + acc[1] + '% of the time but catches only ' + acc[2] +
      '% of marsh, so ' + ha + ' ha is a floor, not a ceiling.</span></li>' : '') +
    '<li>' + icon('schedule') + '<span>The photo check and the radar layer are not built yet.</span></li></ul>';

  var head = about.querySelector('.m3-vhead');
  about.insertBefore(card, head ? head.nextSibling : about.firstChild);

  // the demo video: loads nothing until it is played, and is not in the offline copy (sw.js)
  var vid = document.createElement('section');
  vid.className = 'm3-card nk-demo';
  vid.setAttribute('aria-labelledby', 'nk-demo-h');
  vid.innerHTML = '<h3 id="nk-demo-h">Watch the map in use</h3>' +
    '<p class="small">A silent 46-second screen recording of the live map, made on 25 Oct 2026 with the Round 2 layout.</p>' +
    '<video class="nk-demo-v" controls muted playsinline preload="none" poster="final/media/demo-poster.webp" width="1280" height="720">' +
    '<source src="final/media/demo.mp4" type="video/mp4">' +
    '<p class="small">This browser cannot play the video. <a href="final/media/demo.mp4">Download it (MP4)</a>.</p></video>';
  card.parentNode.insertBefore(vid, card.nextSibling);

  // full screen, for a projector: the figure alone, as large as the screen allows
  var fig = card.querySelector('.nk-arch-fig'), full = card.querySelector('.nk-arch-full');
  if (!fig.requestFullscreen) full.hidden = true;
  else full.addEventListener('click', function () { fig.requestFullscreen().catch(function () {}); });
})();

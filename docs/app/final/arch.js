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

  // the diagram: boxes top to bottom, a dashed line where the work moves from the cloud to the phone,
  // and a second one above the only online part, the photo check. Its arrow runs from the phone down
  // the right edge, past the letter (which needs no connection), with a head at each end: the photo
  // goes out and the answer comes back.
  var W = 320, X = 8, BW = 304, LANE = 44;
  var nodes = [
    { t: 'Sentinel-2 satellite', s: ['free · 10 m pixels · every 5 days'], who: 'ESA · free' },
    { t: 'Dynamic World AI', s: ['labels each 10 m square: water, marsh, built'], who: 'Google · free' },
    { t: 'Google Earth Engine', s: [years + ' years of dry-season (' + meta.season + ') composites'], who: 'Google · free' },
    { t: 'Our rule', s: ['marsh or water → built', 'rejects seasonal, shadow, shoreline noise'], who: 'ours', ours: 1 },
    { t: 'Static files', s: ['WebP label images + JSON · ' + n + ' patches · ' + ha + ' ha'], who: 'ours', ours: 1, cut: 1 },
    { t: 'Your phone', s: ['plain JS + Leaflet · offline after one visit'], who: 'ours', ours: 1, phone: 1 },
    { t: 'Complaint letter', s: ['then an RTI follow-up if ignored', 'English or Tamil · works offline'], who: 'ours', ours: 1, lane: 1 },
    { t: 'Cloudflare Worker', s: ['holds the Gemini key as a secret', 'stores nothing'], who: 'ours', ours: 1, net: 1 },
    { t: 'Gemini 2.5 Flash-Lite', s: ['says what one photo shows: construction,', 'dumping, sewage, no change or unclear'], who: 'Google · free', net: 2, join: ' ' }
  ];
  var y = 22, parts = [], prevBottom = null, cutY = null, phoneBottom = null;
  function cut(label) {
    y += 14;
    parts.push('<line class="nk-a-cut" x1="0" x2="' + W + '" y1="' + (y - 8) + '" y2="' + (y - 8) + '"/>' +
      '<text class="nk-a-band" x="' + X + '" y="' + (y + 8) + '">' + label + '</text>');
    cutY = y - 8;
    y += 30;
  }
  function line(x, y1, y2, cls) { return '<line class="nk-a-arrow' + (cls || '') + '" x1="' + x + '" x2="' + x + '" y1="' + y1 + '" y2="' + y2 + '"/>'; }
  function headDown(x, tip) { return '<path class="nk-a-head" d="M' + (x - 5) + ' ' + (tip - 7) + 'h10l-5 7z"/>'; }
  function headUp(x, tip) { return '<path class="nk-a-head" d="M' + (x - 5) + ' ' + (tip + 7) + 'h10l-5 -7z"/>'; }
  // a dashed link with a head at each end, for the online calls
  function both(x, top, bottom) { return line(x, top + 7, bottom - 7, ' net') + headUp(x, top) + headDown(x, bottom); }
  parts.push('<text class="nk-a-band" x="' + X + '" y="14">ONCE, IN THE CLOUD</text>');
  nodes.forEach(function (d) {
    if (d.cut) cut('ON THE PHONE · NO SERVER · NO API KEY');
    if (d.net === 1) cut('ONLINE · ONLY THE PHOTO CHECK');
    var bw = d.lane ? BW - LANE : BW, h = 32 + 16 * d.s.length, mx = X + bw / 2;
    if (d.net === 1) parts.push(both(X + BW - LANE / 2, phoneBottom + 1, y - 1));
    else if (d.net === 2) parts.push(both(mx, prevBottom + 1, y - 1));
    else if (prevBottom != null) {
      // across the cut, the arrow stops at the line and starts again under its label
      if (d.cut) {
        parts.push(line(mx, prevBottom + 2, cutY - 3));
        prevBottom = cutY + 18;
      }
      parts.push(line(mx, prevBottom + 2, y - 7) + headDown(mx, y - 1));
    }
    parts.push('<g class="nk-a-node' + (d.ours ? ' ours' : '') + '"><rect x="' + X + '" y="' + y + '" width="' + bw + '" height="' + h + '" rx="12"/>' +
      '<text class="nk-a-t" x="' + (X + 12) + '" y="' + (y + 21) + '">' + esc(d.t) + '</text>' +
      '<text class="nk-a-who" x="' + (X + bw - 12) + '" y="' + (y + 20) + '" text-anchor="end">' + esc(d.who) + '</text>' +
      d.s.map(function (s, i) { return '<text class="nk-a-s" x="' + (X + 12) + '" y="' + (y + 40 + 16 * i) + '">' + esc(s) + '</text>'; }).join('') +
      '</g>');
    prevBottom = y + h;
    if (d.phone) phoneBottom = prevBottom;
    y += h + (d.net === 1 ? 30 : 22);
  });
  var H = prevBottom + 4;
  function says(d) { return d.t + ' (' + d.s.join(d.join || ', ') + ')'; }
  var desc = nodes.filter(function (d) { return !d.net; }).map(function (d) { return d.t + ': ' + d.s.join(', '); }).join('. Then ') +
    '. Online, only for the photo check: the phone sends one photo to ' +
    nodes.filter(function (d) { return d.net; }).map(says).join(', which asks ') + ', and the answer comes back to the phone.';
  var svg = '<svg class="nk-arch-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-labelledby="nk-arch-t nk-arch-d">' +
    '<title id="nk-arch-t">How NEERKATTI works, from satellite to complaint letter, and the online photo check</title><desc id="nk-arch-d">' + esc(desc) + '</desc>' +
    parts.join('') + '</svg>';

  var card = document.createElement('section');
  card.className = 'm3-card nk-arch';
  card.setAttribute('aria-labelledby', 'nk-arch-h');
  card.innerHTML =
    '<div class="nk-arch-head"><h3 id="nk-arch-h">How it works</h3>' +
    '<button type="button" class="m3-btn text nk-arch-full">' + icon('zoom_out_map') + 'Full screen</button></div>' +
    '<p class="small">The AI ran once, through Google Earth Engine\'s Python API, and its results are saved as plain files. ' +
    'The website only reads them: HTML, CSS and JavaScript, with no server and no database, ₹0 to run. ' +
    'The one live API call is the optional photo check, through our Worker, which holds the key.</p>' +
    '<figure class="nk-arch-fig">' + svg +
    '<figcaption class="nk-arch-key"><span class="k ours"></span>built by us <span class="k"></span>free data and tools</figcaption></figure>' +
    '<h4 class="nk-arch-sub">Why each part</h4><ul class="m3-bullets">' +
    '<li>' + icon('auto_awesome') + '<span><b>Dynamic World.</b> Already validated by Google and WRI, so we do not train a model with no ground truth.</span></li>' +
    '<li>' + icon('satellite_alt') + '<span><b>Sentinel-2.</b> Free and every 5 days; 10 m is the finest free optical image.</span></li>' +
    '<li>' + icon('cloud_off') + '<span><b>No server.</b> Nothing to run, nothing to hack, ₹0.</span></li>' +
    '<li>' + icon('map') + '<span><b>Leaflet.</b> About 42 KB compressed, so it runs on a cheap phone.</span></li>' +
    '<li>' + icon('link') + '<span><b>A Cloudflare Worker.</b> The photo check goes through it, so the Gemini key stays a secret there and never reaches the site. It stores nothing.</span></li>' +
    '<li>' + icon('photo_camera') + '<span><b>Gemini 2.5 Flash-Lite.</b> Reads a photo in seconds, and Google has announced no shutdown date for it. It only suggests; a ground check decides.</span></li></ul>' +
    '<h4 class="nk-arch-sub">Limits</h4><ul class="m3-bullets nk-arch-lim">' +
    '<li>' + icon('visibility') + '<span>A 10 m pixel cannot see one house; small dumping is missed.</span></li>' +
    (acc[1] ? '<li>' + icon('info') + '<span>Dynamic World is right about buildings ' + acc[1] + '% of the time but catches only ' + acc[2] +
      '% of marsh, so ' + ha + ' ha is a floor, not a ceiling.</span></li>' : '') +
    '<li>' + icon('photo_camera') + '<span>The photo check needs a connection, and one photo read by an AI is not proof. On Google\'s free tier, Google may keep the photo to improve its AI.</span></li>' +
    '<li>' + icon('schedule') + '<span>The radar layer is not built yet.</span></li></ul>';

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

  // Questions people ask: short, plain answers, the first words answer the question. Numbers come
  // from the data file, or from the page's own notes (accuracy, the check by eye), never typed here.
  var text = document.body.textContent.replace(/\s+/g, ' ');
  var eye = text.match(/top (\d+) by eye[^:]*: (\d+) show building, paving or filling, and (\d+) is unclear/) || [];
  var first = meta.years[0], last = meta.years[1], since = meta.built_since_ha || {};
  var recent = 0, worstYr = null;
  Object.keys(since).forEach(function (yr) {
    if (+yr >= last - 3) recent += since[yr];
    if (worstYr == null || since[yr] > since[worstYr]) worstYr = yr;
  });
  var share = meta.wet_ha_before ? (100 * ha / meta.wet_ha_before).toFixed(1) : null;
  var zone = meta.marsh && meta.marsh.zone_m ? (meta.marsh.zone_m >= 1000 ? meta.marsh.zone_m / 1000 + ' km' : meta.marsh.zone_m + ' m') : null;
  var faq = [
    ['Which AI does it use?',
      'Two, both Google\'s. Dynamic World V1, by Google and WRI, labels every 10 m square as water, marsh, buildings and so on. ' +
      'Gemini 2.5 Flash-Lite reads a citizen\'s photo. The change rule on top of them is ours.'],
    ['How do you avoid false alarms?',
      'A patch counts only if it was water or marsh in ' + first + ' and is built in both ' + (last - 1) + ' and ' + last +
      ', because one season can be a mislabel. The lake rim and tiny specks are ignored. New alerts also drop a lake drying in summer, land already built, and a moving shoreline.'],
    ['How accurate is it?',
      (acc[1] ? 'Dynamic World is right about buildings ' + acc[1] + '% of the time (precision) but finds only ' + acc[2] +
        '% of marsh (recall), so ' + ha + ' ha is a floor. ' : '') +
      (eye[1] ? 'We checked the top ' + eye[1] + ' patches by eye: ' + eye[2] + ' show building, paving or filling, and ' + eye[3] + ' is unclear.' : '')],
    [share ? 'It is only ' + share + '% of the ' + first + ' water and marsh. Why does it matter?' : 'Why does it matter?',
      'Because it is speeding up: ' + Math.round(100 * recent / ha) + '% of it since ' + (last - 3) + ', and ' + worstYr +
      ' lost the most of any season (' + since[worstYr] + ' ha). It is also a floor, because the AI misses marsh.'],
    ['My complaint was ignored. What now?',
      'Choose RTI follow-up in the letter: by law the office must reply within 30 days, and then comes a first appeal. ' +
      'The evidence is public and dated, so it can also go to NGOs, the press or a lawyer.'],
    ['Does Google keep my photo?',
      'It may. NEERKATTI stores nothing, and your phone removes the photo\'s location before sending it. ' +
      'On its free tier Google may keep photos to improve its AI, so leave people out of the photo.'],
    ['Why does the photo check call Google from North America?',
      'Gemini refused our Worker\'s Singapore location ("User location is not supported"), so the Worker calls from eastern North America. It still stores nothing.'],
    ['Could this be used against someone?',
      'It never names an owner or says who is at fault. Every patch is a possible change that needs a ground check, from satellite data that is already free and public.'],
    ['What if the AI is wrong about a plot?',
      'Then an inspection shows it. The letter asks only for an inspection and accuses no one, so a wrong patch costs one visit.'],
    [zone ? 'If the court changes the ' + zone + ' rule, is this still useful?' : 'If the court changes the rules, is this still useful?',
      'Yes. Whatever the court decides, the map still shows what changed, and the letter\'s request for an inspection still stands.'],
    ['Why not an app-store app?',
      'It installs from the browser to your home screen and works offline after one visit, so no app store is needed.']
  ];
  var qa = document.createElement('details');
  qa.className = 'about nk-faq';
  qa.innerHTML = '<summary>Questions people ask</summary><dl>' + faq.filter(function (f) { return f[1]; }).map(function (f) {
    return '<dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd>';
  }).join('') + '</dl>';
  vid.parentNode.insertBefore(qa, vid.nextSibling);

  // full screen, for a projector: the figure alone, as large as the screen allows
  var fig = card.querySelector('.nk-arch-fig'), full = card.querySelector('.nk-arch-full');
  if (!fig.requestFullscreen) full.hidden = true;
  else full.addEventListener('click', function () { fig.requestFullscreen().catch(function () {}); });
})();

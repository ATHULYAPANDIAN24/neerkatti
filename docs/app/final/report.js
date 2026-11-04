// NEERKATTI final round: the citizen photo check. A person at a patch or alert takes a photo;
// the browser shrinks and re-draws it (which drops its hidden GPS and camera data), and the
// NEERKATTI Worker (serverless/photo-check) asks Google's Gemini model what the ground shows:
// construction, dumping, sewage, no change, or unclear. The Worker holds the API key and
// stores nothing. Location is sent only if the person taps to add it, and only to measure the
// distance to the site. Off until PHOTO_URL is set, so the app says "Coming" until then.
(function () {
  var F = window.NKFinal;
  if (!F || !F.on) return;
  var PHOTO_URL = '';   // the Worker address, e.g. https://neerkatti-photo-check.NAME.workers.dev
  if (!PHOTO_URL) return;
  var esc = F.esc;

  var WORDS = {
    construction: 'Construction', dumping: 'Dumping or filling', sewage: 'Sewage',
    no_change: 'No sign of filling', unclear: 'Unclear'
  };
  var site = null, here = null, busy = false;

  var sheet = document.createElement('dialog');
  sheet.className = 'nk-sheet';
  sheet.id = 'nk-photo';
  sheet.setAttribute('aria-labelledby', 'nk-photo-title');
  sheet.innerHTML =
    '<div class="nk-sheet-top"><div><p class="kicker">Final round · ground check</p><h2 id="nk-photo-title" tabindex="-1">Check a photo</h2><p class="nk-sub" id="nk-photo-sub"></p></div>' +
    '<button type="button" class="nk-x" id="nk-photo-x" aria-label="Close the photo check">×</button></div>' +
    '<div class="nk-sheet-body"><div class="nk-form">' +
    '<p class="nk-note">Your photo is sent to Google\'s Gemini model to be read. NEERKATTI keeps nothing. Please leave people out of the photo.</p>' +
    '<div class="nk-btns"><button type="button" class="btn primary" id="nk-photo-pick">Take or choose a photo</button>' +
    '<button type="button" class="btn ghost" id="nk-photo-here">Add where I am</button></div>' +
    '<input type="file" id="nk-photo-file" accept="image/*" hidden>' +
    '<p class="nk-status" id="nk-photo-status" role="status" aria-live="polite"></p>' +
    '<p class="nk-note">One photo, read by an AI, is not proof. A ground check by an official is still needed.</p>' +
    '</div><div class="nk-preview" id="nk-photo-out" aria-label="Photo and result"></div></div>';
  document.body.appendChild(sheet);

  function $(id) { return document.getElementById(id); }
  function say(t) { $('nk-photo-status').textContent = t; }

  // Long side at most 1280 px, JPEG: small enough to send, and re-drawing drops EXIF and GPS
  function shrink(file) {
    return new Promise(function (ok, no) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k));
        c.height = Math.max(1, Math.round(img.naturalHeight * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        ok(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = function () { URL.revokeObjectURL(url); no(new Error('This browser cannot read that file as a photo.')); };
      img.src = url;
    });
  }

  function away(m) { return m < 1000 ? m + ' m' : (m / 1000).toFixed(1) + ' km'; }

  function show(a, dataUrl) {
    var where = a.distance_m === null || a.distance_m === undefined ? 'No location shared.'
      : 'Taken about ' + away(a.distance_m) + ' from the site.';
    $('nk-photo-out').innerHTML =
      '<figure class="nk-fig"><img src="' + dataUrl + '" alt="The photo you sent"></figure>' +
      '<p><b>' + esc(WORDS[a.category] || 'Unclear') + '</b> · the AI is ' + Math.round((a.confidence || 0) * 100) + '% sure</p>' +
      '<p>' + esc(a.reason || '') + '</p>' +
      '<p class="nk-note">' + esc(where) + ' Read by ' + esc(a.model || 'Gemini') + ', ' + esc(new Date().toLocaleString('en-IN')) +
      '. Possible change, needs a ground check.</p>';
  }

  function send(dataUrl) {
    if (!navigator.onLine) { say('The photo check needs a connection. The map and the letter work offline.'); return; }
    busy = true;
    say('Checking the photo…');
    $('nk-photo-out').innerHTML = '<figure class="nk-fig"><img src="' + dataUrl + '" alt="The photo you sent"></figure>';
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 30000);
    fetch(PHOTO_URL.replace(/\/$/, '') + '/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photo: dataUrl.split(',')[1], lat: here ? here.lat : undefined, lon: here ? here.lon : undefined, site: { lat: site.lat, lon: site.lon } }),
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, j: j }; }, function () { return { ok: false, j: {} }; });
    }).then(function (x) {
      if (!x.ok || x.j.error) { say(x.j.error || 'The photo check did not answer. Try again.'); return; }
      say('');
      show(x.j, dataUrl);
    }).catch(function (e) {
      say(e && e.name === 'AbortError' ? 'The photo check took too long. Try again.' : 'Could not reach the photo check. Try again.');
    }).then(function () { clearTimeout(timer); busy = false; });
  }

  $('nk-photo-pick').addEventListener('click', function () { if (!busy) $('nk-photo-file').click(); });
  $('nk-photo-file').addEventListener('change', function () {
    var file = this.files && this.files[0];
    if (!file) return;
    shrink(file).then(send, function (e) { say(e.message); });
  });
  $('nk-photo-here').addEventListener('click', function () {
    if (!navigator.geolocation) { say('This device cannot share its location. The check works without it.'); return; }
    say('Finding where you are…');
    navigator.geolocation.getCurrentPosition(function (p) {
      here = { lat: p.coords.latitude, lon: p.coords.longitude };
      say('Location added. It is used only to measure the distance to the site.');
    }, function () { say('Location not shared. The check works without it.'); }, { enableHighAccuracy: true, timeout: 15000 });
  });
  $('nk-photo-x').addEventListener('click', function () { sheet.close(); });
  sheet.addEventListener('click', function (e) {
    if (e.target !== sheet) return;
    var r = sheet.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) sheet.close();
  });

  // Called by the patch card, the Act page and the alert cards (they look for F.report)
  F.report = function (s) {
    site = s;
    here = null;
    $('nk-photo-sub').textContent = [s.label, s.place].filter(Boolean).join(' · ');
    $('nk-photo-out').innerHTML = '';
    $('nk-photo-file').value = '';
    say('');
    sheet.showModal();
    $('nk-photo-title').focus();
  };
})();

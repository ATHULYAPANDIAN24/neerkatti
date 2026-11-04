// NEERKATTI final round: the map-first layout, in the Material Design 3 manner (final/ui.css).
// The map fills the screen. A laptop gets a navigation rail and a floating side sheet with the
// search bar on top; a phone gets a bottom sheet over a navigation bar. Filter chips, a Layers
// button, a timeline card, zoom and My location float over the map. It moves the page's own
// parts into place (every button, chart and list keeps the code in app.js that drives it) and
// talks to the map only through window.NEERKATTI_API. On with ?final=1, like the other files here.
(function () {
  var F = window.NKFinal;
  var html = document.documentElement;
  if (!F || !F.on || !F.api || !F.api.setInsets) { html.classList.remove('nk-boot'); return; }

  var api = F.api, map = api.map, core = api.core, D = api.data, meta = D.meta, esc = F.esc;
  var phone = window.matchMedia('(max-width: 899px)');
  var all = D.patches.features.map(function (f) { return f.properties; });
  var byRank = {};
  all.forEach(function (p) { byRank[p.rank] = p; });
  var YEARS = meta.timeline_years.map(String), FIRST = YEARS[0], LAST = YEARS[YEARS.length - 1];
  var ZONE = meta.marsh.zone_m, ZONE_TEXT = (ZONE >= 1000 ? ZONE / 1000 + ' km' : ZONE + ' m');
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var floodDay = (function (d) { return +d[2] + ' ' + MONTHS[+d[1] - 1] + ' ' + d[0]; })(meta.monsoon.date.split('-'));

  function $(id) { return document.getElementById(id); }
  function make(tag, cls, inner) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (inner != null) el.innerHTML = inner;
    return el;
  }
  // a Material Symbol; `fb` is a plain sign shown if the icon font cannot load
  function icon(name, fb, cls) {
    return '<span class="msr' + (cls ? ' ' + cls : '') + '" aria-hidden="true"' + (fb ? ' data-fb="' + fb + '"' : '') + '>' + name + '</span>';
  }
  function pct(x) { return Math.round(x * 100) + '%'; }
  function where(p) {
    var st = core.marshStatus(p, ZONE);
    return st === 'inside' ? (p.marsh_share >= 0.99 ? 'inside the protected marsh' : pct(p.marsh_share) + ' inside the protected marsh')
      : st === 'zone' ? 'within ' + ZONE_TEXT + ' of the protected marsh' : core.formatDistance(p.marsh_distance_m) + ' from the protected marsh';
  }
  function closeup(rank) { return 'data/closeups/patch_' + (rank < 10 ? '0' : '') + rank + '.jpg'; }
  var say = api.say;

  // the page's own parts, before anything moves
  var app = document.querySelector('.app');
  var panel = $('panel'), mapWrap = $('map-wrap');
  var toolbar = mapWrap.querySelector('.toolbar');
  var segs = toolbar.querySelectorAll(':scope > fieldset.seg');
  var modeSeg = segs[0], viewSeg = segs[1];
  var timebar = toolbar.querySelector('.timebar');
  var namesChk = toolbar.querySelector('.chk-names');
  var nearBtn = $('near-me'), shareBtn = $('share');
  var legendEl = mapWrap.querySelector('.legend');
  var coach = $('coach'), note = $('map-note');

  // ---- navigation: a rail on a laptop, a bar on a phone ----------------------------------------
  var DEST = [
    { id: 'explore', label: 'Explore', icon: 'explore' },
    { id: 'alerts', label: 'Alerts', icon: 'notifications' },
    { id: 'act', label: 'Act', icon: 'campaign' },
    { id: 'impact', label: 'Impact', icon: 'eco' },
    { id: 'about', label: 'About', icon: 'info', end: true }
  ];
  var nav = make('nav', 'm3-nav');
  nav.setAttribute('aria-label', 'Sections');
  nav.innerHTML = '<a class="m3-brand" href="../" title="NEERKATTI project page" aria-label="NEERKATTI project page">' + icon('water_drop', 'N', 'fill') + '</a>' +
    '<div class="m3-dests">' + DEST.filter(function (d) { return !d.end; }).map(destHtml).join('') + '</div>' +
    DEST.filter(function (d) { return d.end; }).map(destHtml).join('');
  function destHtml(d) {
    return '<button type="button" class="m3-dest' + (d.end ? ' m3-dest-end' : '') + '" data-dest="' + d.id + '">' +
      '<span class="m3-dest-ind">' + icon(d.icon) + (d.id === 'alerts' ? '<b class="m3-badge" id="m3-alert-badge" hidden></b>' : '') + '</span>' +
      '<span class="m3-dest-label">' + d.label + '</span></button>';
  }
  app.insertBefore(nav, app.firstChild);

  // ---- search: a place, a patch, an area or an alert -------------------------------------------
  var search = make('div', 'm3-search');
  search.setAttribute('role', 'search');
  search.innerHTML = '<div class="m3-search-bar">' + icon('search') +
    '<input id="m3-q" type="search" role="combobox" aria-expanded="false" aria-controls="m3-results" aria-autocomplete="list" autocomplete="off" spellcheck="false"' +
    ' placeholder="Search a place, patch or alert" aria-label="Search a place, patch or alert">' +
    '<button type="button" class="m3-icon-btn" id="m3-q-clear" aria-label="Clear the search" hidden>' + icon('close', '×') + '</button>' +
    '<button type="button" class="m3-icon-btn" id="m3-q-about" aria-label="About NEERKATTI">' + icon('info', 'i') + '</button></div>' +
    '<div class="m3-results" id="m3-results" role="listbox" aria-label="Suggestions" hidden></div>';
  app.insertBefore(search, mapWrap);   // reading order: navigation, search, the panel, then the map
  var q = $('m3-q'), results = $('m3-results');

  // ---- the sheet: #panel holds every view ----------------------------------------------------
  panel.classList.add('m3-sheet');
  panel.setAttribute('aria-label', 'NEERKATTI panel');
  var kids = Array.prototype.slice.call(panel.children);
  var handle = make('button', 'm3-handle');
  handle.type = 'button';
  var scroller = make('div', 'm3-scroll');
  panel.appendChild(handle);
  panel.appendChild(scroller);
  var fold = make('button', 'm3-fold', icon('chevron_left', '‹'));
  fold.type = 'button';
  fold.setAttribute('aria-label', 'Hide the side panel');
  app.insertBefore(panel, mapWrap);
  app.insertBefore(fold, mapWrap);

  var views = {};
  function addView(id, label) {
    var v = make('section', 'm3-view');
    v.dataset.view = id;
    v.hidden = true;
    v.tabIndex = -1;
    if (label) v.setAttribute('aria-label', label);
    scroller.appendChild(v);
    views[id] = v;
    return v;
  }
  function pick(sel) { return panel.querySelector(sel); }

  // Explore: the headline, three numbers, the caveat, the tour, the list, deeper looks
  var ex = addView('explore', 'Explore');
  var exHead = make('div', 'm3-vhead');
  var exTitle = make('div', 'm3-vhead-t');
  var kick = pick(':scope > .kicker'), h1 = pick(':scope > h1');
  kick.textContent = 'Pallikaranai marsh, Chennai · ' + FIRST + ' → ' + LAST;
  h1.textContent = 'Where wetland became buildings';   // short, so the smallest sheet on a phone shows all of it
  exTitle.appendChild(kick);
  exTitle.appendChild(h1);
  exHead.appendChild(exTitle);
  shareBtn.className = 'm3-icon-btn';
  shareBtn.innerHTML = icon('share', '↗');
  exHead.appendChild(shareBtn);
  ex.appendChild(exHead);
  var lead = pick(':scope > .lead');
  lead.innerHTML = 'An AI model, Dynamic World, labels free Sentinel-2 satellite images square by square, every dry season since ' + FIRST +
    '. <b>Red patches</b> were water or marsh in ' + FIRST + ' and are buildings in both ' + (+LAST - 1) + ' and ' + LAST + '.';
  ex.appendChild(lead);
  ex.appendChild(pick(':scope > .stats'));
  ex.appendChild(pick(':scope > .caveat'));
  var cta = make('div', 'm3-cta');
  var tourBtn = $('bar-tour');
  tourBtn.className = 'm3-btn filled';
  tourBtn.innerHTML = icon('play_circle', '▶') + 'Take the 1-minute tour';
  cta.appendChild(tourBtn);
  ex.appendChild(cta);
  ex.appendChild(pick(':scope > .list'));
  var INSIGHTS = [
    { id: 'since', sel: '[aria-labelledby="since-title"]', icon: 'bar_chart', title: 'When it was built over', sub: 'Season by season, ' + FIRST + ' to ' + LAST },
    { id: 'marsh', sel: '[aria-labelledby="marsh-title"]', icon: 'forest', title: 'The protected marsh', sub: 'Its ' + ZONE_TEXT + ' zone, where approvals stopped' },
    { id: 'flood', sel: '[aria-labelledby="flood-title"]', icon: 'flood', title: 'After the 2021 floods', sub: 'What the AI saw on ' + floodDay },
    { id: 'areas', sel: '[aria-labelledby="areas-title"]', icon: 'map', title: 'By zone or village', sub: 'Tap an area to list its patches' }
  ];
  ex.appendChild(make('h2', 'm3-sec', 'Look closer'));
  var insightList = make('div', 'm3-list');
  INSIGHTS.forEach(function (it) {
    var b = make('button', 'm3-item', icon(it.icon) + '<span class="m3-item-t"><b>' + it.title + '</b><span>' + esc(it.sub) + '</span></span>' + icon('chevron_right', '›'));
    b.type = 'button';
    b.dataset.sub = it.id;
    insightList.appendChild(b);
    var v = addView('sub-' + it.id, it.title);
    v.appendChild(backHead('Explore'));
    var card = pick(it.sel);
    if (card) v.appendChild(card);
  });
  ex.appendChild(insightList);
  function backHead(over, title) {
    var h = make('div', 'm3-vhead');
    h.innerHTML = '<button type="button" class="m3-icon-btn m3-back" aria-label="Back">' + icon('arrow_back', '←') + '</button>' +
      '<div class="m3-vhead-t"><p class="m3-over">' + esc(over) + '</p>' + (title ? '<h2 class="m3-h1">' + esc(title) + '</h2>' : '') + '</div>';
    return h;
  }

  // Patch details: filled in on each selection
  var det = addView('details', 'Patch details');

  // Alerts: the alert card from final/alerts.js, or what is coming
  var al = addView('alerts', 'Alerts');
  al.innerHTML = '<div class="m3-vhead"><div class="m3-vhead-t"><p class="m3-over">New in the final</p><h1 class="m3-h1">Alerts</h1>' +
    '<p class="m3-sub" id="m3-al-sub">Possible new changes since the ' + LAST + ' dry season</p></div></div>' +
    '<div class="m3-empty" id="m3-al-empty"><span class="m3-empty-ic">' + icon('satellite_alt') + '</span><h2 class="m3-h2" id="m3-al-empty-t">Checking the newest images</h2>' +
    '<p class="small">NEERKATTI looks at every clear satellite image since the ' + LAST + ' dry season for water or marsh turning into buildings or bare earth, ' +
    'first inside the protected marsh\'s ' + ZONE_TEXT + ' zone. Alerts appear here once they pass the checks.</p></div>';
  var alertCard = $('alerts');
  if (alertCard) al.appendChild(alertCard);
  var follow = make('p', 'm3-cta', '<a class="m3-btn outlined" id="m3-rss" href="data/alerts.xml">' + icon('rss_feed') + 'Follow the alerts (RSS)</a>');
  follow.hidden = true;
  al.appendChild(follow);

  // Act: a letter, a photo, new changes
  var act = addView('act', 'Act');
  var options = all.map(function (p) {
    return '<option value="' + p.rank + '">#' + p.rank + ' · ' + esc(core.nameOf(p)) + ' · ' + p.area_ha.toFixed(2) + ' ha</option>';
  }).join('');
  act.innerHTML = '<div class="m3-vhead"><div class="m3-vhead-t"><p class="m3-over">Act on it</p><h1 class="m3-h1">What you can do</h1>' +
    '<p class="m3-sub">Every patch and alert is a possible change that needs a ground check. These turn what the map shows into a request an official can act on.</p></div></div>' +
    '<section class="m3-card m3-act" aria-labelledby="m3-act-letter"><span class="m3-act-ic">' + icon('mail') + '</span><div>' +
    '<h3 id="m3-act-letter">Send a complaint letter</h3><p class="small">A dated letter in Tamil and English with the satellite close-up, asking for an inspection. It never names an owner.</p>' +
    '<label class="sr" for="m3-act-patch">Patch</label><select class="m3-select" id="m3-act-patch">' + options + '</select>' +
    '<button type="button" class="m3-btn filled" id="m3-act-go">' + icon('mail') + 'Write the letter</button>' +
    '<h4 class="m3-next-h">What happens next</h4><ol class="m3-next">' +
    '<li><b>You send it</b> to the Tamil Nadu State Wetland Authority, the Greater Chennai Corporation or the Forest Department, whichever the letter is addressed to.</li>' +
    '<li><b>The office logs it and inspects</b> the coordinates in the letter, and gives you a reference number.</li>' +
    '<li><b>You follow up</b> with that reference number until there is an answer.</li>' +
    '<li><b>No action in 30 days?</b> Choose <i>RTI follow-up</i> in the letter. By law the office must reply within 30 days.</li>' +
    '<li><b>Still no answer?</b> File a first appeal with the senior officer, and share the evidence with NGOs, the press or a lawyer.</li></ol>' +
    '<p class="small m3-next-note">' + icon('info') + 'NEERKATTI does not yet track what the office does next.</p></div></section>' +
    '<section class="m3-card m3-act" aria-labelledby="m3-act-photo"><span class="m3-act-ic">' + icon('photo_camera') + '</span><div>' +
    '<h3 id="m3-act-photo">Report what you see <span class="m3-soon-tag" id="m3-photo-soon">' + icon('schedule') + 'Coming</span></h3>' +
    '<p class="small" id="m3-photo-text">At a patch, take a photo and an AI checks it for construction, dumping or sewage. Being built in this final.</p>' +
    '<button type="button" class="m3-btn tonal" id="m3-act-photo-go" hidden>' + icon('photo_camera') + 'Check a photo</button></div></section>' +
    '<section class="m3-card m3-act" aria-labelledby="m3-act-follow"><span class="m3-act-ic">' + icon('notifications') + '</span><div>' +
    '<h3 id="m3-act-follow">Follow new changes</h3><p class="small">Alerts for new filling, first inside the protected marsh\'s ' + ZONE_TEXT + ' zone, here and as a feed any news app can follow.</p>' +
    '<button type="button" class="m3-btn text" id="m3-act-alerts">See the alerts' + icon('chevron_right', '›') + '</button></div></section>' +
    '<section class="m3-card m3-act" aria-labelledby="m3-act-radar"><span class="m3-act-ic">' + icon('radar') + '</span><div>' +
    '<h3 id="m3-act-radar">See through monsoon clouds <span class="m3-soon-tag">' + icon('schedule') + 'Coming</span></h3>' +
    '<p class="small">Sentinel-1 radar sees the ground through clouds, so changes in the rains show up too.</p></div></section>';

  // Impact: who it helps, how it pays, sustainability, UN goals, the water what-if
  var im = addView('impact', 'Impact');
  im.innerHTML = '<div class="m3-vhead"><div class="m3-vhead-t"><p class="m3-over">Why it matters</p><h1 class="m3-h1">Impact</h1>' +
    '<p class="m3-sub">Who it helps, how it pays for itself, and why it lasts.</p></div></div>';
  var impactCard = pick('.nk-impact');
  var sdg = impactCard && impactCard.querySelector('.nk-sdg');
  if (impactCard) im.appendChild(impactCard);
  var biz = pick('.biz-card');
  if (biz) im.appendChild(biz);
  var lasts = make('section', 'm3-card');
  lasts.setAttribute('aria-labelledby', 'm3-sus');
  lasts.innerHTML = '<h3 id="m3-sus">Built to last</h3><ul class="m3-bullets">' +
    '<li>' + icon('satellite_alt') + '<span><b>Free, open data.</b> Sentinel-2 images and Dynamic World labels cost nothing and keep coming every few days.</span></li>' +
    '<li>' + icon('cloud_off') + '<span><b>No server to run.</b> A static site on free hosting that keeps working offline once opened.</span></li>' +
    '<li>' + icon('waves') + '<span><b>Light on data.</b> Small images first, the sharp ones only when you zoom in, for cheap phones on slow 4G.</span></li>' +
    '<li>' + icon('public') + '<span><b>Same rule anywhere.</b> It runs on any lake or marsh in Tamil Nadu without new data costs.</span></li></ul>';
  im.appendChild(lasts);
  if (sdg) {
    var goals = make('section', 'm3-card');
    goals.setAttribute('aria-labelledby', 'm3-goals');
    goals.innerHTML = '<h3 id="m3-goals">UN Sustainable Development Goals</h3>';
    goals.appendChild(sdg);
    im.appendChild(goals);
  }
  var calc = pick('.calc');
  if (calc) im.appendChild(calc);

  // About: method, accuracy and limits, data and licences, team
  var ab = addView('about', 'About');
  ab.innerHTML = '<div class="m3-vhead"><div class="m3-vhead-t"><p class="m3-over">NEERKATTI</p><h1 class="m3-h1">About</h1>' +
    '<p class="m3-sub">An AI water-keeper for Chennai\'s wetlands, by Team Sternritters for DEXATHON 2026.</p></div></div>';
  ['How a patch gets flagged', 'How far to trust it', 'Cost and data', 'What\'s different', 'Why this area and these years'].forEach(function (t) {
    panel.querySelectorAll('details.about').forEach(function (d) {
      var s = d.querySelector('summary');
      if (s && s.textContent.trim() === t) ab.appendChild(d);
    });
  });
  panel.querySelectorAll('details.about').forEach(function (d) { if (!ab.contains(d)) ab.appendChild(d); });
  var TITLES = { 'How a patch gets flagged': 'Method: how a patch gets flagged', 'How far to trust it': 'Accuracy and limits',
    'Cost and data': 'Data, cost and licences' };
  ab.querySelectorAll('details.about > summary').forEach(function (s) { var t = TITLES[s.textContent.trim()]; if (t) s.textContent = t; });
  var phase = pick('.phase');
  if (phase) ab.appendChild(phase);
  var abBtns = make('p', 'm3-cta');
  var introBtn = $('open-intro');
  introBtn.className = 'm3-btn outlined';
  introBtn.innerHTML = icon('help') + 'Show the welcome';
  abBtns.appendChild(introBtn);
  abBtns.insertAdjacentHTML('beforeend', '<a class="m3-btn text" href="https://github.com/ATHULYAPANDIAN24/neerkatti#readme">' + icon('open_in_new') + 'Code and README</a>');
  ab.appendChild(abBtns);
  var judges = pick('nav.judges');
  if (judges) ab.appendChild(judges);
  var credits = pick('footer.credits');
  if (credits) ab.appendChild(credits);
  // anything left over stays reachable, at the foot of Explore
  kids.forEach(function (k) { if (k.parentNode === panel && k !== handle && k !== scroller) ex.appendChild(k); });

  // ---- over the map: chips, Layers, the timeline card, zoom and My location ----------------------
  var CHIPS = [
    { id: 'patches', label: 'Flagged', swatch: '#ff1a1a' },
    { id: 'alerts', label: 'Alerts', swatch: 'var(--md-alert)' },
    { id: 'marsh', label: 'Protected marsh', icon: 'forest' },
    { id: 'flood', label: '2021 floods', icon: 'flood' },
    { id: 'labels', label: 'AI labels', icon: 'auto_awesome' }
  ];
  var chips = make('div', 'm3-chips');
  chips.setAttribute('role', 'toolbar');
  chips.setAttribute('aria-label', 'Show on the map');
  chips.innerHTML = CHIPS.map(function (c) {
    return '<button type="button" class="m3-chip" data-chip="' + c.id + '" aria-pressed="false">' +
      (c.swatch ? '<span class="m3-swatch" style="background:' + c.swatch + '" aria-hidden="true"></span>' : icon(c.icon, '', 'fill-on')) + c.label + '</button>';
  }).join('');
  var mapEl = $('map');
  mapWrap.insertBefore(chips, mapEl);   // the map's own controls come before its fifteen pins

  var layers = make('div', 'm3-layers');
  layers.innerHTML = '<button type="button" class="m3-square" id="m3-layers-btn" aria-expanded="false" aria-controls="m3-layers-pop" aria-label="Map type and details">' + icon('layers', '≡') + '</button>' +
    '<div class="m3-pop" id="m3-layers-pop" role="group" aria-label="Map type and details" hidden><p class="m3-pop-h">Map type</p></div>';
  var pop = layers.querySelector('.m3-pop');
  pop.appendChild(viewSeg);
  pop.insertAdjacentHTML('beforeend', '<p class="m3-pop-h">Map details</p>');
  if (namesChk) pop.appendChild(namesChk);
  mapWrap.insertBefore(layers, mapEl);
  var layersBtn = $('m3-layers-btn');

  var timeline = make('div', 'm3-timeline');
  timeline.setAttribute('role', 'group');
  timeline.setAttribute('aria-label', 'Years on the map');
  var cmpLbl = modeSeg.querySelector('input[value="compare"] + span'), yearsLbl = modeSeg.querySelector('input[value="single"] + span');
  if (cmpLbl) cmpLbl.innerHTML = '<b class="msr m3-seg-ic" aria-hidden="true">compare</b><b class="m3-seg-t">Compare</b>';
  if (yearsLbl) yearsLbl.innerHTML = '<b class="msr m3-seg-ic" aria-hidden="true">calendar_month</b><b class="m3-seg-t">Year by year</b>';
  timeline.appendChild(modeSeg);
  timeline.appendChild(timebar);
  mapWrap.insertBefore(timeline, mapEl);

  var fabs = make('div', 'm3-fabs');
  if (legendEl) fabs.appendChild(legendEl);
  nearBtn.className = 'm3-square';
  nearBtn.title = 'My location: the patches nearest to you. Your location stays on this device.';
  nearBtn.innerHTML = icon('my_location', '◎');
  fabs.appendChild(nearBtn);
  var zoom = make('div', 'm3-zoom', '<button type="button" id="m3-zoom-in" aria-label="Zoom in">' + icon('add', '+') + '</button>' +
    '<button type="button" id="m3-zoom-out" aria-label="Zoom out">' + icon('remove', '−') + '</button>');
  fabs.appendChild(zoom);
  mapWrap.insertBefore(fabs, mapEl);
  L.DomEvent.disableClickPropagation(fabs);
  L.DomEvent.disableScrollPropagation(fabs);
  $('m3-zoom-in').addEventListener('click', function () { map.zoomIn(); });
  $('m3-zoom-out').addEventListener('click', function () { map.zoomOut(); });

  // ---- which view the sheet shows --------------------------------------------------------------
  var current = null, dest = 'explore', detailsFrom = 'explore', booted = false, popping = false, depth = 0;
  function isSub(id) { return /^sub-/.test(id); }
  function show(id, opts) {
    opts = opts || {};
    if (!views[id]) id = 'explore';
    var was = current;
    current = id;
    Object.keys(views).forEach(function (k) { views[k].hidden = k !== id; });
    html.classList.toggle('m3-details', id === 'details');
    var v = views[id];
    if (was !== id && booted) {
      v.classList.remove('m3-view-in');
      void v.offsetWidth;
      v.classList.add('m3-view-in');
    }
    if (!opts.keepScroll) scroller.scrollTop = 0;
    var d = id === 'details' || isSub(id) ? (id === 'details' ? dest : 'explore') : id;
    if (!isSub(id) && id !== 'details') dest = id;
    nav.querySelectorAll('.m3-dest').forEach(function (b) {
      if (b.dataset.dest === d) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (opts.focus) {
      var h = v.querySelector('h1, h2, .m3-dtitle h2');
      (h || v).setAttribute('tabindex', '-1');
      (h || v).focus({ preventScroll: true });
    }
    if (booted && !isSub(id) && id !== 'details') viewParam(id);
    if (phone.matches) setStop(stop, true);
  }
  function viewParam(id) {
    var s = new URLSearchParams(location.search);
    if (id === 'explore') s.delete('view'); else s.set('view', id);
    var str = s.toString();
    history.replaceState(history.state, '', location.pathname + (str ? '?' + str : '') + location.hash);
  }
  function pushNav() { history.pushState(null, '', location.href); depth++; }
  // Back (the arrow, Escape or the phone's own Back): one level up
  function up() {
    if (current === 'details') {
      api.clear();
      if (current === 'details') show(detailsFrom);
    } else if (isSub(current)) show('explore', { focus: true });
  }
  function back() { if (depth) history.back(); else up(); }
  window.addEventListener('popstate', function () {
    if (!depth) return;
    depth--;
    // the entry we return to may hold an older view of the map: keep the one on screen
    var v = api.state();
    var h = core.hashFor({ patch: null, year: v.mode === 'single' ? v.year : 'compare', left: v.left, right: v.right, layer: v.layer, marsh: v.marsh });
    history.replaceState(null, '', location.pathname + location.search + h);
    popping = true;
    try { up(); } finally { popping = false; }
  });

  nav.addEventListener('click', function (e) {
    var b = e.target.closest('.m3-dest');
    if (!b) return;
    var id = b.dataset.dest;
    if (current === 'details') api.clear();
    show(id, { focus: false });
    if (phone.matches && stop === 'peek') setStop('half');
    if (!phone.matches && collapsed) setCollapsed(false);
  });
  scroller.addEventListener('click', function (e) {
    var b = e.target.closest('.m3-back');
    if (b) { back(); return; }
    var sub = e.target.closest('[data-sub]');
    if (sub) {
      if (!popping) pushNav();
      show('sub-' + sub.dataset.sub, { focus: true });
      return;
    }
    // a bar that filters the list: show the list it filtered (app.js has done the rest)
    var bar = e.target.closest('.hbar');
    if (bar && isSub(current)) {
      setTimeout(function () {
        if (depth && !popping) { history.back(); } else show('explore');
        setTimeout(function () { var t = $('list-title'); if (t) t.scrollIntoView({ block: 'start' }); }, 60);
      }, 0);
    }
  });
  $('m3-q-about').addEventListener('click', function () { show('about', { focus: true }); if (phone.matches && stop !== 'full') setStop('half'); });

  // ---- the bottom sheet's three stops (phone) and the side sheet's fold (laptop) ------------------
  var stop = 'peek', tourOn = false, collapsed = false;
  function navH() { return nav.offsetHeight || 64; }
  function stops() {
    var vh = window.innerHeight, avail = vh - navH();
    var head = views[current] && views[current].querySelector('.m3-vhead, .m3-dtitle');
    var peek = Math.round(Math.min(avail * 0.42, Math.max(116, 28 + (head ? head.offsetHeight : 72) + 16)));
    var full = Math.round(avail - (search.offsetTop + search.offsetHeight + 8));
    return { peek: peek, half: Math.round(Math.min(full, Math.max(peek + 96, avail * 0.52))), full: full };
  }
  function setStop(s, quiet) {
    stop = s;
    if (!phone.matches) return;
    var h = stops()[s];
    html.style.setProperty('--sheet-h', h + 'px');
    html.classList.toggle('m3-tall', s !== 'peek');
    html.classList.toggle('m3-full', s === 'full');
    handle.setAttribute('aria-label', 'Panel: ' + (s === 'peek' ? 'small' : s === 'half' ? 'half the screen' : 'full screen') + '. Tap to ' + (s === 'full' ? 'make it small' : 'make it bigger'));
    scroller.style.overflowY = s === 'peek' ? 'hidden' : '';
    layout();
  }
  handle.addEventListener('click', function () {
    if (dragMoved) return;
    setStop(stop === 'peek' ? 'half' : stop === 'half' ? 'full' : 'peek');
  });
  handle.addEventListener('keydown', function (e) {
    var order = ['peek', 'half', 'full'], i = order.indexOf(stop);
    if (e.key === 'ArrowUp' && i < 2) { setStop(order[i + 1]); e.preventDefault(); }
    if (e.key === 'ArrowDown' && i > 0) { setStop(order[i - 1]); e.preventDefault(); }
  });
  // dragging the handle or the title moves the sheet; at its smallest, the whole sheet does
  var drag = null, dragMoved = false;
  panel.addEventListener('pointerdown', function (e) {
    if (!phone.matches || tourOn || (e.pointerType === 'mouse' && e.button !== 0)) return;
    var onGrip = e.target.closest('.m3-handle, .m3-vhead, .m3-dtitle');
    if (!onGrip && stop !== 'peek') return;
    if (!e.target.closest('.m3-handle') && e.target.closest('button, a, input, select, textarea, label, summary')) return;
    var h0 = panel.getBoundingClientRect().height;
    drag = { y: e.clientY, h0: h0, h: h0, t: performance.now(), v: 0, id: e.pointerId };
    dragMoved = false;
  });
  panel.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dy = drag.y - e.clientY;
    if (!dragMoved && Math.abs(dy) < 6) return;
    if (!dragMoved) { dragMoved = true; panel.classList.add('m3-dragging'); try { panel.setPointerCapture(e.pointerId); } catch (x) { /* already gone */ } }
    var s = stops(), h = Math.max(s.peek - 40, Math.min(s.full, drag.h0 + dy)), now = performance.now();
    drag.v = (h - drag.h) / Math.max(1, now - drag.t);
    drag.h = h;
    drag.t = now;
    html.style.setProperty('--sheet-h', h + 'px');
    e.preventDefault();
  });
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    var d = drag;
    drag = null;
    panel.classList.remove('m3-dragging');
    if (!dragMoved) return;
    var s = stops(), aim = d.h + d.v * 180;
    var best = ['peek', 'half', 'full'].reduce(function (a, k) { return Math.abs(s[k] - aim) < Math.abs(s[a] - aim) ? k : a; }, 'peek');
    setStop(best);
    setTimeout(function () { dragMoved = false; }, 0);
  }
  panel.addEventListener('pointerup', endDrag);
  panel.addEventListener('pointercancel', endDrag);

  function setCollapsed(on) {
    var before = parseFloat(html.style.getPropertyValue('--in-l')) || 0;
    collapsed = on;
    html.classList.toggle('m3-collapsed', on);
    fold.setAttribute('aria-label', on ? 'Show the side panel' : 'Hide the side panel');
    fold.setAttribute('aria-expanded', String(!on));
    layout();
    // the map slides with the free part, so what was in its middle (and under the divider) stays there
    var after = parseFloat(html.style.getPropertyValue('--in-l')) || 0;
    if (before !== after) map.panBy([(before - after) / 2, 0], { duration: 0.35 });
  }
  fold.addEventListener('click', function () { setCollapsed(!collapsed); });

  // What the panels cover, for the map's flights and for the notes, snackbar and tour card
  function layout() {
    var t, r, b, l;
    if (phone.matches) {
      t = chips.offsetTop + chips.offsetHeight + 2;
      l = 0;
      r = 0;
      var sheetH = tourOn ? 0 : stops()[stop];
      if (tourOn) html.style.setProperty('--sheet-h', '0px');   // the sheet steps aside for the tour card
      var tl = !tourOn && stop === 'peek' ? timeline.offsetHeight + 8 : 0;
      html.style.setProperty('--tl-h', tl + 'px');
      var attr = mapWrap.querySelector('.leaflet-control-attribution');
      b = navH() + sheetH + tl + (attr ? attr.offsetHeight : 0) + 8;
    } else {
      t = Math.max(chips.offsetTop + chips.offsetHeight, collapsed ? search.offsetTop + search.offsetHeight + 8 : 0) + 2;
      l = collapsed ? 0 : panel.offsetLeft + panel.offsetWidth - mapWrap.offsetLeft + 12;
      r = 72;
      b = timeline.offsetHeight + 24 + 8;
    }
    html.style.setProperty('--in-t', t + 'px');
    html.style.setProperty('--in-r', r + 'px');
    html.style.setProperty('--in-b', b + 'px');
    html.style.setProperty('--in-l', l + 'px');
    // on a phone the tour card sits at the bottom: the compare handle centres in what is left above it
    if (phone.matches && tourOn) html.style.setProperty('--knob-b', (b + coach.offsetHeight + 8) + 'px');
    else html.style.removeProperty('--knob-b');
    api.setInsets({ top: t, right: r, bottom: b, left: l });
    L.Popup.prototype.options.autoPanPaddingTopLeft = [l + 12, t + 8];
    L.Popup.prototype.options.autoPanPaddingBottomRight = [r + 12, b + 8];
    // and no taller than that free part (its tip, frame and the padding take about 80 px): a long card scrolls
    L.Popup.prototype.options.maxHeight = Math.max(160, mapWrap.offsetHeight - t - b - 80);
  }
  window.addEventListener('resize', function () { setStop(stop, true); layout(); });
  phone.addEventListener('change', function () {
    if (!phone.matches) { html.style.removeProperty('--sheet-h'); html.classList.remove('m3-tall'); scroller.style.overflowY = ''; }
    setStop(phone.matches ? 'peek' : stop, true);
    layout();
  });

  // ---- the tour: on a phone the sheet steps aside, so the tour card and the map have the room -----
  function tourWatch() {
    var on = !coach.hidden;
    if (on === tourOn) return;
    tourOn = on;
    html.classList.toggle('m3-tour', on);
    if (!on && phone.matches) setStop('peek');
    layout();
  }
  new MutationObserver(tourWatch).observe(coach, { attributes: true, attributeFilter: ['hidden'] });
  if (window.ResizeObserver) new ResizeObserver(function () { if (tourOn) layout(); }).observe(coach);

  // ---- chips and Layers follow what the map shows ---------------------------------------------------
  function chip(id) { return chips.querySelector('[data-chip="' + id + '"]'); }
  function press(id, on) { var c = chip(id); if (c) c.setAttribute('aria-pressed', String(!!on)); }
  function sync(v) {
    v = v || api.state();
    press('patches', v.patches);
    press('marsh', v.marsh);
    press('labels', v.layer === 'labels');
    press('flood', v.mode === 'compare' && (v.left === 'monsoon' || v.right === 'monsoon'));
    var a = $('show-alerts');
    press('alerts', alertsReady() && a && a.checked);
  }
  function toggle(input) {
    if (!input) return;
    input.checked = !input.checked;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function radio(name, value) {
    var r = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (!r || r.checked) return;
    r.checked = true;
    r.dispatchEvent(new Event('change', { bubbles: true }));
  }
  chips.addEventListener('click', function (e) {
    var c = e.target.closest('.m3-chip');
    if (!c) return;
    var id = c.dataset.chip, v = api.state();
    if (id === 'patches') toggle($('show-patches'));
    else if (id === 'marsh') toggle($('show-marsh'));
    else if (id === 'labels') radio('view', v.layer === 'labels' ? 'photo' : 'labels');
    else if (id === 'flood') {
      if (c.getAttribute('aria-pressed') === 'true') {
        var left = $('left');
        left.value = FIRST;
        left.dispatchEvent(new Event('change', { bubbles: true }));
        if (v.right === 'monsoon') { var right = $('right'); right.value = LAST; right.dispatchEvent(new Event('change', { bubbles: true })); }
      } else $('flood-show').click();
    } else if (id === 'alerts') {
      if (alertsReady()) { toggle($('show-alerts')); sync(); } else { show('alerts', { focus: true }); if (phone.matches && stop === 'peek') setStop('half'); }
    }
    sync();
  });
  api.on('view', sync);
  document.addEventListener('change', function (e) { if (e.target.closest && e.target.closest('.m3-pop, .toolbar, .m3-timeline')) sync(); });

  function openLayers(on) {
    pop.hidden = !on;
    layersBtn.setAttribute('aria-expanded', String(on));
    if (on) { var c = pop.querySelector('input:checked') || pop.querySelector('input'); if (c) c.focus({ preventScroll: true }); }
  }
  layersBtn.addEventListener('click', function (e) { e.stopPropagation(); openLayers(pop.hidden); });
  document.addEventListener('click', function (e) { if (!pop.hidden && !layers.contains(e.target)) openLayers(false); });
  L.DomEvent.disableClickPropagation(layers);
  L.DomEvent.disableScrollPropagation(layers);
  L.DomEvent.disableClickPropagation(chips);
  L.DomEvent.disableClickPropagation(timeline);
  L.DomEvent.disableScrollPropagation(timeline);

  // ---- alerts: the badge, the list, the empty state ------------------------------------------------
  function alertRows() { return alertCard ? Array.prototype.slice.call(alertCard.querySelectorAll('.nk-alert-row')) : []; }
  function alertsReady() { return !!alertCard && !alertCard.hidden && alertRows().length > 0; }
  function syncAlerts() {
    var rows = alertRows(), ready = alertsReady();
    $('m3-al-empty').hidden = ready;
    $('m3-al-empty-t').textContent = alertCard && alertCard.hidden ? 'No alerts to show yet' : 'Checking the newest images';
    follow.hidden = !ready;
    var badge = $('m3-alert-badge');
    badge.hidden = !ready;
    badge.textContent = ready ? String(rows.length) : '';
    var c = chip('alerts');
    if (c) {
      c.querySelectorAll('.m3-soon').forEach(function (x) { x.remove(); });
      if (!ready && alertCard && alertCard.hidden) c.insertAdjacentHTML('beforeend', '<span class="m3-soon">soon</span>');
    }
    var sub = $('m3-al-sub');
    if (ready) sub.textContent = rows.length + ' possible new change' + (rows.length === 1 ? '' : 's') + ', each needing a ground check';
    nav.querySelector('[data-dest="alerts"]').setAttribute('aria-label', 'Alerts' + (ready ? ', ' + rows.length + ' new' : ''));
    sync();
    buildIndex();   // the alerts arrive after the page: search learns them now
    openWanted();
  }
  // A link to one alert (#alert-A2, as the letter and the feed write it). app.js rewrites the address on
  // load, before the alerts arrive, so the boot script in index.html keeps the hash; open it once they are in.
  var wantAlert = (/^#alert-(A\d+)$/.exec(window.NKBootHash || '') || [])[1] || null;
  function openWanted() {
    if (!wantAlert || !alertsReady() || !F.showAlert) return;
    var id = wantAlert;
    wantAlert = null;
    if (current !== 'alerts') show('alerts');
    if (phone.matches) setStop('peek');
    // alerts.js opens the card on the next 'moveend': let the map settle first, so that is its own flight's
    setTimeout(function () { F.showAlert(id, true); }, 300);
  }
  // the address follows an open alert, so it can be shared, and goes back to the map's own when it closes
  function alertOf(popup) {
    var el = popup.getElement(), b = el && el.querySelector('.nk-alert-pop .nk-act[data-id]');
    return b ? b.dataset.id : null;
  }
  map.on('popupopen', function (e) {
    var id = alertOf(e.popup);
    if (!id) return;
    history.replaceState(history.state, '', location.pathname + location.search + '#alert-' + id);
    hideHint();
    // if the card opened before its flight landed, slide it into view once the map is still (not after a drag)
    var t0 = Date.now();
    map.once('moveend', function () {
      if (Date.now() - t0 < 2000 && map.hasLayer(e.popup) && !(map.dragging && map.dragging.moved())) e.popup.update();
    });
  });
  // on a phone a map card is as wide as the screen: the buttons over the map step aside while one is open
  var openCards = 0;
  map.on('popupopen', function () { openCards++; html.classList.add('m3-card-open'); });
  map.on('popupclose', function () { openCards = Math.max(0, openCards - 1); html.classList.toggle('m3-card-open', openCards > 0); });
  map.on('popupclose', function (e) {
    if (!alertOf(e.popup) || !/^#alert-/.test(location.hash)) return;
    var v = api.state();
    history.replaceState(history.state, '', location.pathname + location.search +
      core.hashFor({ patch: v.patch, year: v.mode === 'single' ? v.year : 'compare', left: v.left, right: v.right, layer: v.layer, marsh: v.marsh }));
  });
  if (alertCard) new MutationObserver(syncAlerts).observe(alertCard, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true });
  if (alertCard) alertCard.addEventListener('click', function (e) {
    if (!e.target.closest('.nk-alert-row')) return;
    if (phone.matches) setStop('peek');
  });

  // ---- Act -------------------------------------------------------------------------------------
  function patchOf(sel) { return byRank[+sel.value]; }
  $('m3-act-go').addEventListener('click', function () {
    var p = patchOf($('m3-act-patch'));
    if (p && F.letter) F.letter(F.siteOfPatch(p));
  });
  $('m3-act-alerts').addEventListener('click', function () { show('alerts', { focus: true }); });
  function photoReady() {
    var ok = !!F.report;
    $('m3-photo-soon').hidden = ok;
    $('m3-act-photo-go').hidden = !ok;
    $('m3-photo-text').textContent = ok ? 'At a patch, take a photo and an AI checks it for construction, dumping or sewage.'
      : 'At a patch, take a photo and an AI checks it for construction, dumping or sewage. Being built in this final.';
  }
  $('m3-act-photo-go').addEventListener('click', function () {
    var p = patchOf($('m3-act-patch'));
    if (p && F.report) F.report(F.siteOfPatch(p));
  });

  // ---- patch details ----------------------------------------------------------------------------
  var shown = null, watching = null;
  function barsHtml(p) {
    var since = core.builtFrom(p);
    var said = YEARS.map(function (y, i) { return y + ' ' + pct(p.built_by_year[i]); }).join(', ');
    return '<div class="m3-bars" role="img" aria-label="Share of the patch the AI labels buildings each dry season: ' + said + '">' +
      YEARS.map(function (y, i) {
        var w = p.wet_by_year[i], b = p.built_by_year[i], o = Math.max(0, 1 - w - b);
        return '<span class="m3-bar' + (+y === since ? ' since' : '') + '" data-year="' + y + '" title="' + y + ': ' + pct(b) + ' buildings, ' + pct(w) + ' water or marsh">' +
          '<i><b class="w" style="height:' + pct(w) + '"></b><b class="o" style="height:' + pct(o) + '"></b><b class="b" style="height:' + pct(b) + '"></b></i>' +
          '<span>’' + y.slice(2) + '</span></span>';
      }).join('') + '</div>';
  }
  function detailsHtml(p) {
    var since = core.builtFrom(p), low = core.weakest(p);
    var ctx = [];
    if (p.finding) ctx.push(['verified', '<b>Checked by eye:</b> ' + esc(p.finding) + '. A look at satellite imagery, not a ground survey.']);
    else ctx.push(['visibility', 'Not checked by eye yet. The AI confidence below says how sure the model was.']);
    var st = core.marshStatus(p, ZONE);
    ctx.push(['forest', st === 'inside' ? '<b>' + (p.marsh_share >= 0.99 ? 'Inside' : pct(p.marsh_share) + ' inside') + '</b> the protected marsh outline'
      : st === 'zone' ? '<b>' + core.formatDistance(p.marsh_distance_m) + '</b> from the protected marsh, inside its ' + ZONE_TEXT + ' zone'
        : core.formatDistance(p.marsh_distance_m) + ' from the protected marsh']);
    ctx.push(['flood', p.wet_monsoon === null ? 'Under cloud on ' + floodDay + ', after the floods'
      : '<b>' + pct(p.wet_monsoon) + '</b> water or marsh on ' + floodDay + ', after the floods']);
    if (p.landsat_water_ever >= 0.1) ctx.push(['satellite_alt', 'Landsat saw open water on <b>' + pct(p.landsat_water_ever) + '</b> of it, 1984–2021']);
    function meter(text, v) {
      return '<div class="m3-meter' + (v === low ? ' weak' : '') + '"><span>' + text + '</span><i aria-hidden="true"><b style="width:' + pct(v) + '"></b></i><b>' + pct(v) + '</b></div>';
    }
    var extra = api.actions().filter(function (a) { return a.id !== 'letter' && a.id !== 'report' && (!a.when || a.when(p)); });
    var photo = !!F.report;
    return '<div class="m3-dtitle"><button type="button" class="m3-icon-btn m3-back" aria-label="Back to the list">' + icon('arrow_back', '←') + '</button>' +
      '<div><h2 class="m3-h1" tabindex="-1">#' + p.rank + ' · ' + esc(core.nameOf(p)) + '</h2>' +
      '<p class="m3-sub">' + p.area_ha.toFixed(2) + ' ha · ' + where(p) + '</p></div>' +
      '<button type="button" class="m3-icon-btn" id="m3-d-close" aria-label="Close the patch">' + icon('close', '×') + '</button></div>' +
      '<a class="m3-hero" href="' + closeup(p.rank) + '" target="_blank" rel="noopener" title="Open the close-up full size">' +
      '<img src="' + closeup(p.rank) + '" width="640" height="312" alt="Patch ' + p.rank + ' close-up: Sentinel-2, ' + FIRST + ' on the left, ' + LAST + ' on the right with the patch outlined in red">' +
      '<span class="year-tag before">' + FIRST + '</span><span class="year-tag after">' + LAST + '</span></a>' +
      '<div class="m3-actions">' +
      '<button type="button" class="m3-action primary" data-do="watch"><span class="m3-action-ic">' + icon('play_arrow', '▶') + '</span><span class="m3-action-l">Watch<small>' + FIRST + '–' + LAST + '</small></span></button>' +
      '<button type="button" class="m3-action" data-do="letter"><span class="m3-action-ic">' + icon('mail', '✉') + '</span>Letter<small>Tamil · English</small></button>' +
      '<button type="button" class="m3-action" data-do="photo"' + (photo ? '' : ' aria-describedby="m3-d-photo-soon"') + '><span class="m3-action-ic">' + icon('photo_camera', '◉') + '</span>Photo' +
      '<small id="m3-d-photo-soon">' + (photo ? 'Report' : 'Coming') + '</small></button>' +
      '<button type="button" class="m3-action" data-do="share"><span class="m3-action-ic">' + icon('share', '↗') + '</span>Share<small>Link</small></button></div>' +
      (extra.length ? '<div class="m3-extra">' + extra.map(function (a) { return '<button type="button" class="m3-btn outlined" data-extra="' + esc(a.id) + '">' + esc(a.label) + '</button>'; }).join('') + '</div>' : '') +
      '<section class="m3-dcard" aria-label="Year by year"><h3>Year by year</h3><p class="m3-sub m3-dsub">' + (since >= +LAST - 1 ? 'Built over in ' + (+LAST - 1) + ' and ' + LAST : 'Built over every season since ' + since) + '</p>' +
      barsHtml(p) +
      '<div class="m3-key" aria-hidden="true"><span><i class="w"></i>water or marsh</span><span><i class="o"></i>other</span><span><i class="b"></i>buildings</span></div>' +
      '<p class="m3-now" id="m3-d-now" aria-live="polite"></p></section>' +
      '<section class="m3-dcard" aria-label="What we know"><h3>What we know</h3><ul class="m3-ctx">' +
      ctx.map(function (c) { return '<li>' + icon(c[0]) + '<span>' + c[1] + '</span></li>'; }).join('') + '</ul></section>' +
      '<section class="m3-dcard" aria-label="AI confidence"><h3>AI confidence<span class="pill conf ' + p.ai_confidence + '">' + p.ai_confidence.charAt(0).toUpperCase() + p.ai_confidence.slice(1) + '</span></h3>' +
      meter('Water or marsh, ' + FIRST, p.p_wet_2018) + meter('Buildings, ' + (+LAST - 1), p.p_built_2025) + meter('Buildings, ' + LAST, p.p_built_2026) +
      '<p class="small" style="margin:8px 0 0">Dynamic World\'s average probability over the patch and season. The lowest of the three sets the level; low ones are the ones to check first.</p></section>' +
      '<div class="m3-foot"><span class="m3-check">' + icon('fact_check') + 'Possible change, needs a ground check</span>' +
      '<a class="m3-btn text" href="https://www.google.com/maps/@' + p.lat + ',' + p.lon + ',400m/data=!3m1!1e3" target="_blank" rel="noopener" title="Opens a satellite map of this spot">' + icon('open_in_new') + 'Satellite view</a></div>';
  }
  function renderDetails(p) {
    shown = p;
    det.innerHTML = detailsHtml(p);
    var hero = det.querySelector('.m3-hero'), img = hero.querySelector('img');
    function ready() { hero.classList.add('ready'); }
    if (img.complete) ready(); else { img.addEventListener('load', ready); img.addEventListener('error', ready); }
    markWatch();
  }
  function markWatch() {
    if (!shown) return;
    var on = watching && watching.rank === shown.rank;
    var btn = det.querySelector('[data-do="watch"]');
    if (btn) {
      btn.classList.toggle('on', !!on);
      btn.querySelector('.msr').textContent = on ? 'pause' : 'play_arrow';
      btn.querySelector('.msr').setAttribute('data-fb', on ? 'II' : '▶');
      btn.querySelector('.m3-action-l').innerHTML = on ? 'Pause<small>' + watching.year + '</small>' : 'Watch<small>' + FIRST + '–' + LAST + '</small>';
      btn.setAttribute('aria-label', on ? 'Pause' : 'Watch this patch season by season, ' + FIRST + ' to ' + LAST);
    }
    det.querySelectorAll('.m3-bar').forEach(function (b) { b.classList.toggle('now', !!on && b.dataset.year === watching.year); });
    var now = $('m3-d-now');
    if (now) {
      var i = on ? YEARS.indexOf(watching.year) : -1;
      now.textContent = on ? watching.year + ': ' + pct(shown.built_by_year[i]) + ' buildings, ' + pct(shown.wet_by_year[i]) + ' water or marsh' : '';
    }
  }
  function shareLink(p) {
    var url = F.base + '?final=1#patch-' + p.rank;
    var text = 'NEERKATTI: patch #' + p.rank + ', ' + core.nameOf(p) + ', ' + p.area_ha.toFixed(2) + ' ha, a possible change that needs a ground check';
    if (navigator.share) {
      navigator.share({ title: 'NEERKATTI', text: text, url: url }).catch(function () {});
      return;
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(function () { say('Link copied. It opens this patch.'); },
        function () { say('Copy the link in the address bar: it opens this patch.'); });
    } else say('Copy the link in the address bar: it opens this patch.');
  }
  det.addEventListener('click', function (e) {
    if (e.target.closest('#m3-d-close')) { back(); return; }
    var a = e.target.closest('[data-do]');
    var p = shown;
    if (a && p) {
      var what = a.dataset.do;
      if (what === 'watch') {
        if (phone.matches) setStop('peek');
        api.watch(p.rank);
      } else if (what === 'letter') { if (F.letter) F.letter(F.siteOfPatch(p)); }
      else if (what === 'photo') {
        if (F.report) F.report(F.siteOfPatch(p));
        else say('The photo check is coming: it is being built in this final.');
      } else if (what === 'share') shareLink(p);
      return;
    }
    var x = e.target.closest('[data-extra]');
    if (x && p) {
      var act = api.actions().filter(function (y) { return y.id === x.dataset.extra; })[0];
      if (act) act.run(p, api);
    }
  });
  function hideHint() { var hint = $('map-hint'); if (hint) hint.hidden = true; }
  api.on('select', function (p) {
    hideHint();
    renderDetails(p);
    if (current !== 'details') {
      detailsFrom = isSub(current) ? current : dest;
      if (booted && !tourOn && !popping) pushNav();
      show('details');
    } else scroller.scrollTop = 0;
    if (tourOn) return;
    if (phone.matches) { if (stop === 'peek') setStop('half'); }
    else if (collapsed) setCollapsed(false);
  });
  api.on('clear', function () {
    shown = null;
    if (current === 'details') show(detailsFrom, { keepScroll: false });
  });
  api.on('watch', function (w) { watching = w; markWatch(); });

  // ---- search --------------------------------------------------------------------------------------
  var index = [];
  function buildIndex() {
    index = [];
    all.forEach(function (p) {
      index.push({ kind: 'patch', icon: 'flag', title: '#' + p.rank + ' · ' + core.nameOf(p), sub: p.area_ha.toFixed(2) + ' ha · ' + where(p),
        keys: ['#' + p.rank, String(p.rank), core.nameOf(p), p.admin_area || '', p.place || ''].join(' ').toLowerCase(), rank: p.rank });
    });
    core.byArea(all).forEach(function (a) {
      index.push({ kind: 'area', icon: 'map', title: a.area, sub: a.ranks.length + (a.ranks.length === 1 ? ' patch, ' : ' patches, ') + a.ha.toFixed(2) + ' ha', keys: a.area.toLowerCase(), area: a.area });
    });
    [meta.marsh_label].concat(meta.places).forEach(function (pl) {
      index.push({ kind: 'place', icon: 'location_on', title: pl.name, sub: 'Place on the map', keys: pl.name.toLowerCase(), lat: pl.lat, lon: pl.lon });
    });
    alertRows().forEach(function (r) {
      var place = r.querySelector('.nk-alert-place'), ha = r.querySelector('.nk-alert-ha'), eye = r.querySelector('.nk-alert-eye');
      index.push({ kind: 'alert', icon: 'notifications', title: 'Alert ' + r.dataset.id + ' · ' + (place ? place.textContent : ''),
        sub: (ha ? ha.textContent + ' · ' : '') + (eye ? eye.textContent + ' · ' : '') + 'possible change, needs a ground check',
        keys: ('alert ' + r.dataset.id + ' ' + (place ? place.textContent : '') + ' ' + (eye ? eye.textContent : '')).toLowerCase(), id: r.dataset.id });
    });
  }
  var hits = [], active = -1;
  function find(text) {
    var t = text.trim().toLowerCase();
    if (!t) return index.filter(function (x) { return x.kind === 'patch' && x.rank <= 3; })
      .concat(index.filter(function (x) { return x.kind === 'alert'; }).slice(0, 2))
      .concat(index.filter(function (x) { return x.kind === 'place'; }).slice(0, 3));
    var n = /^#?(\d+)$/.exec(t);
    var out = n ? index.filter(function (x) { return x.kind === 'patch' && x.rank === +n[1]; }) : [];
    var words = t.split(/\s+/);
    index.forEach(function (x) {
      if (out.indexOf(x) >= 0) return;
      if (words.every(function (w) { return x.keys.indexOf(w) >= 0 || x.title.toLowerCase().indexOf(w) >= 0; })) out.push(x);
    });
    var order = { alert: 0, patch: 1, place: 2, area: 3 };
    return out.sort(function (a, b) {
      var sa = a.title.toLowerCase().indexOf(t) === 0 ? 0 : 1, sb = b.title.toLowerCase().indexOf(t) === 0 ? 0 : 1;
      return sa - sb || order[a.kind] - order[b.kind];
    }).slice(0, 8);
  }
  var KIND = { patch: 'Flagged patches', alert: 'Alerts', place: 'Places', area: 'Zones and villages' };
  function renderResults() {
    hits = find(q.value);
    active = -1;
    var head = '';
    results.innerHTML = hits.length ? hits.map(function (x, i) {
      var h = '';
      if (!q.value.trim() && x.kind !== head) { head = x.kind; h = '<p class="m3-res-h" role="presentation">' + (KIND[x.kind] || '') + '</p>'; }
      return h + '<button type="button" class="m3-res" role="option" id="m3-res-' + i + '" data-i="' + i + '" aria-selected="false" tabindex="-1">' + icon(x.icon) +
        '<span class="m3-res-t"><b>' + esc(x.title) + '</b><span>' + esc(x.sub) + '</span></span></button>';
    }).join('') : '<p class="m3-res-empty">No patch, place or alert called “' + esc(q.value.trim()) + '”. Try a number like #3, or Velachery.</p>';
    openResults(true);
  }
  function openResults(on) {
    results.hidden = !on;
    q.setAttribute('aria-expanded', String(on));
    if (!on) q.removeAttribute('aria-activedescendant');
  }
  function setActive(i) {
    var opts = results.querySelectorAll('.m3-res');
    if (!opts.length) return;
    active = (i + opts.length) % opts.length;
    opts.forEach(function (o, k) { o.setAttribute('aria-selected', String(k === active)); });
    q.setAttribute('aria-activedescendant', opts[active].id);
    opts[active].scrollIntoView({ block: 'nearest' });
  }
  function choose(x) {
    if (!x) return;
    openResults(false);
    q.blur();
    if (x.kind === 'patch') api.pick(x.rank);
    else if (x.kind === 'alert') {
      if (current !== 'alerts') show('alerts');
      if (phone.matches) setStop('peek');
      if (F.showAlert) F.showAlert(x.id, true);
    } else if (x.kind === 'place') {
      api.clear();
      map.flyTo([x.lat, x.lon], 15, { duration: 0.8 });
      say(x.title + ': tap any spot to see what the AI saw there');
      if (phone.matches) setStop('peek');
    } else if (x.kind === 'area') {
      var bar = document.querySelector('.hbar[data-kind="area"][data-value="' + (window.CSS && CSS.escape ? CSS.escape(x.area) : x.area) + '"]');
      show('explore');
      if (bar && bar.getAttribute('aria-pressed') !== 'true') bar.click();
      setTimeout(function () { var t = $('list-title'); if (t) t.scrollIntoView({ block: 'start' }); }, 60);
      if (phone.matches && stop === 'peek') setStop('half');
    }
  }
  q.addEventListener('input', function () { $('m3-q-clear').hidden = !q.value; renderResults(); });
  q.addEventListener('focus', function () { if (!index.length) buildIndex(); renderResults(); });
  q.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { setActive(active + 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { setActive(active - 1); e.preventDefault(); }
    else if (e.key === 'Enter') { choose(hits[active >= 0 ? active : 0]); e.preventDefault(); }
    else if (e.key === 'Escape') { if (!results.hidden) { openResults(false); e.stopPropagation(); } else q.blur(); }
  });
  results.addEventListener('mousedown', function (e) { e.preventDefault(); });
  results.addEventListener('click', function (e) {
    var b = e.target.closest('.m3-res');
    if (b) choose(hits[+b.dataset.i]);
  });
  $('m3-q-clear').addEventListener('click', function () { q.value = ''; $('m3-q-clear').hidden = true; q.focus(); renderResults(); });
  document.addEventListener('click', function (e) { if (!results.hidden && !search.contains(e.target)) openResults(false); });
  q.addEventListener('blur', function () { setTimeout(function () { if (!search.contains(document.activeElement)) openResults(false); }, 120); });

  // ---- keys: / to search, Escape closes the newest thing --------------------------------------------
  window.addEventListener('keydown', function (e) {
    if (e.key === '/' && !e.target.closest('input, textarea, select, [contenteditable]') && !document.querySelector('dialog[open]')) {
      q.focus();
      e.preventDefault();
      return;
    }
    if (e.key !== 'Escape' || document.querySelector('dialog[open]') || search.contains(e.target)) return;
    if (!pop.hidden) { openLayers(false); layersBtn.focus(); e.stopPropagation(); return; }
    // app.js closes the tour and the map's popups first; the panel steps back only when neither is up
    if (!coach.hidden || document.querySelector('.leaflet-popup')) return;
    if (current === 'details' || isSub(current)) { back(); e.stopPropagation(); }
  }, true);

  // ---- the snackbar: on a phone the buttons above the sheet rise while it shows --------------------
  var toastEl = $('toast');
  function snack() {
    var on = !toastEl.hidden && phone.matches;
    html.classList.toggle('m3-snack', on);
    if (on) html.style.setProperty('--snack-h', (toastEl.offsetHeight + 8) + 'px');
  }
  new MutationObserver(snack).observe(toastEl, { attributes: true, attributeFilter: ['hidden'], childList: true, characterData: true, subtree: true });

  // ---- notes: the offline one gets its own look -----------------------------------------------------
  function noteKind() { note.classList.toggle('m3-offline', /^Offline/.test(note.textContent)); }
  new MutationObserver(noteKind).observe(note, { childList: true, characterData: true, subtree: true });
  noteKind();

  // ---- the welcome: shorter, its numbers from the data ------------------------------------------
  var intro = $('intro');
  if (intro) {
    var p0 = intro.querySelector(':scope > p:not(.kicker):not(.tiny)');
    if (p0) p0.innerHTML = 'An AI reads free satellite images of Chennai\'s Pallikaranai marsh, every dry season since ' + FIRST +
      ', and shows where its water and marsh became buildings. Then it helps anyone act: a <b>complaint letter in Tamil and English</b> and <b>alerts</b> for fresh filling.';
    var cells = intro.querySelectorAll('.intro-stats > div');
    var recent = ['2023', '2024', '2025'].reduce(function (s, y) { return s + (meta.built_since_ha[y] || 0); }, 0);
    var near = all.filter(function (p) { return core.marshStatus(p, ZONE) !== 'outside'; }).length;
    if (cells.length === 3) {
      cells[0].innerHTML = '<b>' + meta.lost_ha.toFixed(1) + '&nbsp;ha</b><span>flagged (≈' + Math.round(meta.lost_ha * 2.471) + ' acres) in ' + meta.patch_count + ' patches</span>';
      cells[1].innerHTML = '<b>' + Math.round(recent / meta.lost_ha * 100) + '%</b><span>of it built over since 2023</span>';
      cells[2].innerHTML = '<b>' + near + ' of ' + all.length + '</b><span>in or within ' + ZONE_TEXT + ' of the protected marsh</span>';
    }
    var go = $('intro-tour');
    if (go) go.textContent = 'Watch the 1-minute tour';
  }
  var themeMeta = document.querySelector('meta[name="theme-color"]');
  function theme() {
    if (themeMeta) themeMeta.setAttribute('content', getComputedStyle(html).getPropertyValue('--md-surface').trim() || '#F2FBFB');
  }

  // ---- start ------------------------------------------------------------------------------------
  api.setCard('panel');
  // app.js keeps the view within the study area and 80% around it; a wide screen with a panel over
  // its left side needs more room than that to put the study area in the part left free
  var box = L.latLngBounds([meta.box[1], meta.box[0]], [meta.box[3], meta.box[2]]);
  map.setMaxBounds(box.pad(2));
  html.classList.add('nk-m3');
  html.classList.remove('nk-boot');
  theme();
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', theme);
  photoReady();
  syncAlerts();
  // the legend starts folded (the chips name the layers); app.js opens it with the AI labels, whose colours need it
  var legendBtn = legendEl && legendEl.querySelector('.legend-btn');
  if (legendBtn && legendBtn.getAttribute('aria-expanded') === 'true' && api.state().layer !== 'labels') legendBtn.click();
  buildIndex();
  var first = wantAlert ? 'alerts' : new URLSearchParams(location.search).get('view');
  show(first && views[first] && !isSub(first) && first !== 'details' ? first : 'explore');
  setStop('peek', true);
  tourWatch();
  map.invalidateSize({ pan: false });
  layout();
  var sel = api.state().patch;
  if (sel) api.pick(sel);   // a shared link to a patch: fly again now the panels are in place, and show its card
  else api.home(false);
  sync();
  booted = true;
  // the web font changes heights a little when it arrives
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { setStop(stop, true); layout(); });
})();

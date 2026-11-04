// NEERKATTI final round: a calmer layout. The side panel becomes five tabs (Overview, Alerts,
// Act, Impact, About) instead of one long scroll, and the map's switches fold into one
// Layers menu. It only moves the page's own parts into place, so every button, chart and
// list keeps the code that already drives it.
(function () {
  var F = window.NKFinal;
  if (!F || !F.on) return;
  var api = F.api, esc = F.esc;
  var panel = document.getElementById('panel');
  if (!panel) return;
  document.documentElement.classList.add('nk-shell');

  function $(id) { return document.getElementById(id); }
  function first(sel) { return panel.querySelector(sel); }
  function all(sel) { return Array.prototype.slice.call(panel.querySelectorAll(sel)); }

  // ---- the tabs ------------------------------------------------------------------------
  var TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'alerts', label: 'Alerts' },
    { id: 'act', label: 'Act' },
    { id: 'impact', label: 'Impact' },
    { id: 'about', label: 'About' }
  ];
  var tabs = document.createElement('div');
  tabs.className = 'nk-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Sections');
  var panes = {};
  TABS.forEach(function (t) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'nk-tab';
    b.id = 'nk-tab-' + t.id;
    b.dataset.tab = t.id;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', 'nk-pane-' + t.id);
    b.innerHTML = '<span>' + t.label + '</span>' + (t.id === 'alerts' ? '<b class="nk-badge" id="nk-alert-badge" hidden></b>' : '');
    tabs.appendChild(b);
    var pane = document.createElement('div');
    pane.className = 'nk-pane';
    pane.id = 'nk-pane-' + t.id;
    pane.dataset.tab = t.id;
    pane.setAttribute('role', 'tabpanel');
    pane.setAttribute('aria-labelledby', 'nk-tab-' + t.id);
    pane.tabIndex = -1;
    panes[t.id] = pane;
  });

  // What goes where. Anything not named stays in Overview, so nothing gets lost.
  var place = [
    ['overview', [':scope > .kicker', ':scope > h1', ':scope > .lead', ':scope > .stats', ':scope > .caveat', ':scope > .list', '[aria-labelledby="since-title"]']],
    ['alerts', ['#alerts']],
    ['impact', ['.nk-impact', '.biz-card', '.calc', '[aria-labelledby="flood-title"]', '[aria-labelledby="marsh-title"]', '[aria-labelledby="areas-title"]']],
    ['about', [':scope > .phase', 'details.about', 'nav.judges', 'footer.credits']]
  ];
  var leftovers = Array.prototype.slice.call(panel.children);
  place.forEach(function (row) {
    row[1].forEach(function (sel) {
      all(sel).forEach(function (el) {
        panes[row[0]].appendChild(el);
        leftovers = leftovers.filter(function (x) { return x !== el; });
      });
    });
  });
  leftovers.forEach(function (el) { panes.overview.appendChild(el); });
  panel.appendChild(tabs);
  TABS.forEach(function (t) { panel.appendChild(panes[t.id]); });

  // ---- the Act tab: what a person can do about a patch ------------------------------------
  var patches = api.data.patches.features.map(function (f) { return f.properties; });
  var act = panes.act;
  act.innerHTML =
    '<p class="kicker">Act on it</p><h2 class="nk-pane-title">What you can do</h2>' +
    '<p class="small">Every patch and alert is a possible change that needs a ground check. These turn what the map shows into a request an official can act on.</p>' +
    '<section class="chart-card nk-do" aria-labelledby="nk-do-letter">' +
    '<span class="nk-do-step">1</span><div><h3 id="nk-do-letter">Send a complaint letter</h3>' +
    '<p class="small">A dated letter in Tamil and English with the satellite close-up, asking for an inspection. It never names an owner.</p>' +
    '<label class="nk-do-pick"><span class="sr">Patch</span><select id="nk-act-patch">' +
    patches.map(function (p) { return '<option value="' + p.rank + '">#' + p.rank + ' · ' + esc(api.core.nameOf(p)) + ' · ' + p.area_ha.toFixed(2) + ' ha</option>'; }).join('') +
    '</select></label><button type="button" class="btn primary" id="nk-act-letter">Write the letter</button></div></section>' +
    '<section class="chart-card nk-do" aria-labelledby="nk-do-photo">' +
    '<span class="nk-do-step">2</span><div><h3 id="nk-do-photo">Report what you see</h3>' +
    '<p class="small" id="nk-do-photo-text">At a patch, take a photo and an AI checks it for construction, dumping or sewage. Being built in this final.</p>' +
    '<button type="button" class="btn ghost" id="nk-act-photo" hidden>Check a photo</button></div></section>' +
    '<section class="chart-card nk-do" aria-labelledby="nk-do-follow">' +
    '<span class="nk-do-step">3</span><div><h3 id="nk-do-follow">Follow new changes</h3>' +
    '<p class="small" id="nk-do-follow-text">Alerts for new filling, first inside the protected marsh\'s 1&nbsp;km zone, in the Alerts tab and as a feed any news app can follow.</p>' +
    '<button type="button" class="btn ghost" id="nk-act-alerts">See the alerts</button></div></section>';
  $('nk-act-letter').addEventListener('click', function () {
    var rank = +$('nk-act-patch').value;
    var p = patches.filter(function (x) { return x.rank === rank; })[0];
    if (p && F.letter) F.letter(F.siteOfPatch(p));
  });
  $('nk-act-alerts').addEventListener('click', function () { show('alerts', true); });
  if (F.report) { $('nk-act-photo').hidden = false; $('nk-do-photo-text').textContent = 'At a patch, take a photo and an AI checks it for construction, dumping or sewage.'; }
  $('nk-act-photo').addEventListener('click', function () {
    var rank = +$('nk-act-patch').value;
    var p = patches.filter(function (x) { return x.rank === rank; })[0];
    if (p && F.report) F.report(F.siteOfPatch(p));
  });

  // ---- the Alerts tab when there is nothing to show yet -----------------------------------
  var empty = document.createElement('section');
  empty.className = 'chart-card nk-empty';
  empty.innerHTML = '<p class="kicker">New in the final · alerts</p><h2 class="nk-pane-title">Alerts for new changes</h2>' +
    '<p class="small">NEERKATTI checks every clear satellite image since the 2026 dry season for water or marsh turning into buildings or bare earth, first inside the protected marsh\'s 1&nbsp;km zone. ' +
    'The first run is being checked against the same months last year, so that a lake drying out in summer is not reported as filling. The alerts appear here once they pass.</p>';
  panes.alerts.insertBefore(empty, panes.alerts.firstChild);
  var card = $('alerts');
  function syncAlerts() {
    var ready = card && !card.hidden && card.querySelectorAll('.nk-alert-row').length;
    empty.hidden = !!ready;
    var badge = $('nk-alert-badge');
    badge.hidden = !ready;
    badge.textContent = ready ? String(ready) : '';
  }
  if (card) new MutationObserver(syncAlerts).observe(card, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true });
  syncAlerts();

  // ---- switching tabs ----------------------------------------------------------------------
  var current = null;
  function show(id, focus) {
    if (!panes[id]) id = 'overview';
    current = id;
    TABS.forEach(function (t) {
      var on = t.id === id;
      panes[t.id].hidden = !on;
      var b = $('nk-tab-' + t.id);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    F.store('neerkatti-tab', id);
    panel.scrollTop = 0;
    if (focus) panes[id].focus({ preventScroll: true });
  }
  tabs.addEventListener('click', function (e) {
    var b = e.target.closest('.nk-tab');
    if (b) show(b.dataset.tab, false);
  });
  tabs.addEventListener('keydown', function (e) {
    var i = TABS.map(function (t) { return t.id; }).indexOf(current);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      i = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
      show(TABS[i].id, false);
      $('nk-tab-' + TABS[i].id).focus();
      e.preventDefault();
    }
  });
  // the map scrolls to a part of the panel now and then (the list, say): open its tab first
  var nativeScroll = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function () {
    var pane = this.closest && this.closest('.nk-pane');
    if (pane && pane.hidden) show(pane.dataset.tab, false);
    return nativeScroll.apply(this, arguments);
  };
  var start = /^#alert-/.test(location.hash) ? 'alerts' : (F.store('neerkatti-tab') || 'overview');
  show(start, false);

  // ---- the map's switches, folded into one Layers menu -------------------------------------
  var toolbar = document.querySelector('.toolbar');
  var segs = toolbar ? toolbar.querySelectorAll(':scope > fieldset.seg') : [];
  var checks = toolbar && toolbar.querySelector('.checks');
  if (toolbar && segs.length > 1 && checks) {
    var tools = checks.querySelector('.tool-group');
    var wrap = document.createElement('div');
    wrap.className = 'nk-layers';
    wrap.innerHTML = '<button type="button" class="nk-layers-btn" id="nk-layers-btn" aria-expanded="false" aria-controls="nk-layers-pop">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 8l10 5 10-5-10-5zM2 13l10 5 10-5M2 17.5l10 5 10-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg><span>Layers</span></button>' +
      '<div class="nk-layers-pop" id="nk-layers-pop" hidden role="group" aria-label="Map layers"><p class="nk-layers-h">Show the map as</p></div>';
    var pop = wrap.querySelector('.nk-layers-pop');
    pop.appendChild(segs[1]);                              // Satellite | AI labels
    var h = document.createElement('p');
    h.className = 'nk-layers-h';
    h.textContent = 'On the map';
    pop.appendChild(h);
    pop.appendChild(checks);                               // Flagged, Alerts, Protected marsh, Names
    if (tools) { tools.classList.add('nk-tools'); toolbar.insertBefore(tools, segs[0].nextSibling); }
    toolbar.insertBefore(wrap, tools || segs[0].nextSibling);
    var btn = wrap.querySelector('.nk-layers-btn');
    function openPop(on) {
      pop.hidden = !on;
      btn.setAttribute('aria-expanded', String(on));
    }
    btn.addEventListener('click', function (e) { e.stopPropagation(); openPop(pop.hidden); });
    document.addEventListener('click', function (e) { if (!pop.hidden && !wrap.contains(e.target)) openPop(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pop.hidden) { openPop(false); btn.focus(); } });
  }

  // ---- a shorter welcome: what it is, three numbers, two buttons ---------------------------
  var intro = document.querySelector('.intro');
  if (intro) {
    var lead = intro.querySelector(':scope > p:not(.kicker):not(.tiny)');
    if (lead) lead.innerHTML = 'An AI reads free satellite images of Chennai\'s Pallikaranai marsh, every dry season since 2018, and shows where its water and marsh became buildings. New in this final: a <b>complaint letter in Tamil and English</b> from any patch, with <b>alerts</b> for fresh filling on the way.';
  }
})();

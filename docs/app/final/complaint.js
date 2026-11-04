// NEERKATTI final round: a complaint letter in English and Tamil, from any patch (or alert).
// It asks the authority for an inspection; it never names an owner and never says that
// anything is illegal. The browser's own "Save as PDF" draws Tamil correctly with Noto Sans
// Tamil (or the system's Tamil font), so no PDF library is needed. What the person types
// stays on their device.
(function () {
  var F = window.NKFinal;
  if (!F || !F.on) return;
  var api = F.api, core = api.core, esc = F.esc, pct = F.pct;

  var MONTHS = {
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    ta: ['ஜனவரி', 'பிப்ரவரி', 'மார்ச்', 'ஏப்ரல்', 'மே', 'ஜூன்', 'ஜூலை', 'ஆகஸ்ட்', 'செப்டம்பர்', 'அக்டோபர்', 'நவம்பர்', 'டிசம்பர்']
  };
  function day(d, lang) { return d.getDate() + ' ' + MONTHS[lang][d.getMonth()] + ' ' + d.getFullYear(); }
  function dist(m, lang) {
    var s = core.formatDistance(m);
    return lang === 'ta' ? s.replace(' km', ' கி.மீ.').replace(' m', ' மீ.') : s;
  }

  // Who the letter goes to. The person can also type another office.
  var OFFICES = [
    { id: 'wetland', en: ['Tamil Nadu State Wetland Authority', 'Chennai'], ta: ['தமிழ்நாடு மாநில ஈரநில ஆணையம்', 'சென்னை'] },
    { id: 'gcc', en: ['The Commissioner', 'Greater Chennai Corporation', 'Ripon Buildings, Chennai 600 003'], ta: ['ஆணையர்', 'பெருநகர சென்னை மாநகராட்சி', 'ரிப்பன் மாளிகை, சென்னை 600 003'] },
    { id: 'forest', en: ['Tamil Nadu Forest Department', 'Chennai'], ta: ['தமிழ்நாடு வனத்துறை', 'சென்னை'] }
  ];
  var BLANK = '____________________';

  // ---- the words, in both languages -----------------------------------------------
  var T = {
    en: {
      date: 'Date', from: 'From', to: 'To', subject: 'Subject',
      subj: function (s) { return 'Request for an inspection: possible filling of wetland at ' + s.place + ' (NEERKATTI ' + s.label + ')'; },
      dear: 'Sir/Madam,',
      ask: function (s) { return 'I request an inspection of a site in ' + s.place + ', at ' + s.lat.toFixed(5) + '° N, ' + s.lon.toFixed(5) + '° E.'; },
      seen: function (s) {
        if (s.kind === 'alert') return 'Free Copernicus Sentinel-2 satellite images, labelled by Google and WRI\'s Dynamic World AI, show about ' + s.area_ha.toFixed(2) + ' ha (' + F.acres(s.area_ha) + ' acres) here that was water or marsh in the 2026 dry season (February–May) and shows buildings or bare earth in ' + s.seen_text + '.';
        return 'Free Copernicus Sentinel-2 satellite images, labelled by Google and WRI\'s Dynamic World AI, show about ' + s.area_ha.toFixed(2) + ' ha (' + F.acres(s.area_ha) + ' acres) here that was water or marsh in the 2018 dry season (February–May) and is built-up in the 2025 and 2026 dry seasons. At least half of it has been built-up in every dry season since ' + s.since + '.';
      },
      marsh: function (s) {
        if (s.marsh === 'inside') return (s.marsh_share >= 0.99 ? 'The site lies' : pct(s.marsh_share) + ' of the site lies') + ' inside Pallikaranai Marsh as mapped on OpenStreetMap, where it is tagged Reserve Forest and Ramsar site.';
        if (s.marsh === 'zone') return 'The site is about ' + dist(s.marsh_distance_m, 'en') + ' from Pallikaranai Marsh, inside the 1 km zone around the Ramsar site, where the National Green Tribunal\'s order of 24 September 2025 bars new approvals.';
        return 'The site is about ' + dist(s.marsh_distance_m, 'en') + ' from Pallikaranai Marsh.';
      },
      flood: function (s) { return 'On 26 December 2021, after the November floods, the AI labelled ' + pct(s.wet_monsoon) + ' of it water or marsh.'; },
      checked: 'The NEERKATTI team has checked this site by eye on satellite images.',
      caveat: 'This is a possible change seen from space, and it needs a check on the ground. I do not claim that anything here is illegal.',
      request: 'I request that your office inspect the site, record what it finds, and let me know the outcome.',
      thanks: 'Thank you.', close: 'Yours faithfully,',
      fig: function (s) {
        return s.kind === 'alert' ? 'Satellite close-up of the site: the 2026 dry season on the left, ' + s.after_text + ' on the right. The red outline marks the alert.'
          : 'Satellite close-up of the site: 2018 on the left, 2026 on the right. The red outline marks the flagged area.';
      },
      src: function (s) { return 'Sources: Copernicus Sentinel-2 (European Space Agency); Dynamic World V1 (Google and World Resources Institute); NEERKATTI open data, ' + s.label + ': ' + s.link; }
    },
    ta: {
      date: 'தேதி', from: 'அனுப்புநர்', to: 'பெறுநர்', subject: 'பொருள்',
      subj: function (s) { return s.place + ' பகுதியில் ஈரநிலம் நிரப்பப்பட்டிருக்கக்கூடிய இடத்தைக் கள ஆய்வு செய்யக் கோரிக்கை (NEERKATTI ' + (s.kind === 'alert' ? 'எச்சரிக்கை ' : 'பகுதி ') + s.id + ')'; },
      dear: 'மதிப்பிற்குரிய ஐயா/அம்மா,',
      ask: function (s) { return s.place + ' பகுதியில், ' + s.lat.toFixed(5) + '° வடக்கு, ' + s.lon.toFixed(5) + '° கிழக்கு என்ற இடத்தில் உள்ள நிலத்தைக் கள ஆய்வு செய்யுமாறு கேட்டுக்கொள்கிறேன்.'; },
      seen: function (s) {
        var lead = 'இலவச Copernicus Sentinel-2 செயற்கைக்கோள் படங்களை Google மற்றும் WRI-இன் Dynamic World AI வகைப்படுத்தியதில், இங்கு சுமார் ' + s.area_ha.toFixed(2) + ' ஹெக்டேர் (' + F.acres(s.area_ha) + ' ஏக்கர்) நிலம் ';
        if (s.kind === 'alert') return lead + '2026 வறண்ட பருவத்தில் (பிப்ரவரி–மே) நீர் அல்லது சதுப்புநிலமாக இருந்தது; ' + s.seen_text_ta + ' அது கட்டடங்களாகவோ வெற்று மண்ணாகவோ தெரிகிறது.';
        return lead + '2018 வறண்ட பருவத்தில் (பிப்ரவரி–மே) நீர் அல்லது சதுப்புநிலமாக இருந்தது; 2025, 2026 வறண்ட பருவங்களில் அது கட்டடப் பகுதியாக உள்ளது. அதில் குறைந்தது பாதி ' + s.since + ' முதல் ஒவ்வொரு வறண்ட பருவத்திலும் கட்டடப் பகுதியாகவே உள்ளது.';
      },
      marsh: function (s) {
        if (s.marsh === 'inside') return (s.marsh_share >= 0.99 ? 'இந்த இடம்' : 'இந்த இடத்தின் ' + pct(s.marsh_share) + ' பகுதி') + ' OpenStreetMap வரைபடத்தில் காப்புக்காடு, ராம்சார் தளம் எனக் குறிக்கப்பட்டுள்ள பள்ளிக்கரணை சதுப்புநிலத்தின் எல்லைக்குள் உள்ளது.';
        if (s.marsh === 'zone') return 'இந்த இடம் பள்ளிக்கரணை சதுப்புநிலத்திலிருந்து சுமார் ' + dist(s.marsh_distance_m, 'ta') + ' தொலைவில், ராம்சார் தளத்தைச் சுற்றியுள்ள 1 கி.மீ. மண்டலத்திற்குள் உள்ளது. அந்த மண்டலத்தில் புதிய அனுமதிகள் வழங்கக் கூடாது என்று தேசிய பசுமைத் தீர்ப்பாயம் 24 செப்டம்பர் 2025 அன்று உத்தரவிட்டுள்ளது.';
        return 'இந்த இடம் பள்ளிக்கரணை சதுப்புநிலத்திலிருந்து சுமார் ' + dist(s.marsh_distance_m, 'ta') + ' தொலைவில் உள்ளது.';
      },
      flood: function (s) { return 'நவம்பர் 2021 வெள்ளத்திற்குப் பின், 26 டிசம்பர் 2021 அன்று, இதில் ' + pct(s.wet_monsoon) + ' பகுதியை AI நீர் அல்லது சதுப்புநிலமாகக் காட்டியது.'; },
      checked: 'NEERKATTI குழு இந்த இடத்தைச் செயற்கைக்கோள் படங்களில் கண்ணால் சரிபார்த்துள்ளது.',
      caveat: 'இது விண்ணிலிருந்து காணப்பட்ட ஒரு சாத்தியமான மாற்றம் மட்டுமே; இதைக் கள ஆய்வு மூலம் உறுதிப்படுத்த வேண்டும். இங்கு எதுவும் சட்டவிரோதமானது என்று நான் கூறவில்லை.',
      request: 'எனவே, தங்கள் அலுவலகம் இந்த இடத்தைக் கள ஆய்வு செய்து, கண்டறிந்தவற்றைப் பதிவு செய்து, அதன் முடிவை எனக்குத் தெரிவிக்குமாறு பணிவுடன் கேட்டுக்கொள்கிறேன்.',
      thanks: 'நன்றி.', close: 'இப்படிக்கு,',
      fig: function (s) {
        return s.kind === 'alert' ? 'பெரிதாக்கப்பட்ட செயற்கைக்கோள் படம்: இடதுபுறம் 2026 வறண்ட பருவம், வலதுபுறம் ' + s.after_text_ta + '. சிவப்புக் கோட்டுக்குள் இருப்பது எச்சரிக்கைப் பகுதி.'
          : 'பெரிதாக்கப்பட்ட செயற்கைக்கோள் படம்: இடதுபுறம் 2018, வலதுபுறம் 2026. சிவப்புக் கோட்டுக்குள் இருப்பது குறிக்கப்பட்ட பகுதி.';
      },
      src: function (s) { return 'ஆதாரங்கள்: Copernicus Sentinel-2 (ஐரோப்பிய விண்வெளி நிறுவனம்); Dynamic World V1 (Google, உலக வள நிறுவனம்); NEERKATTI திறந்த தரவு, ' + (s.kind === 'alert' ? 'எச்சரிக்கை ' : 'பகுதி ') + s.id + ': ' + s.link; }
    }
  };

  // The paragraphs of one letter, as plain strings (the page and the copied text use the same ones)
  // RTI follow-up: the same page, asking the office what it did about the complaint (RTI Act 2005)
  function at(s, n, e) { return s.lat.toFixed(5) + '° ' + n + ', ' + s.lon.toFixed(5) + '° ' + e; }
  var R = {
    en: {
      pio: 'The Public Information Officer',
      subj: function (s) { return 'Application under Section 6(1) of the Right to Information Act, 2005: action taken on a complaint about ' + s.place + ' (NEERKATTI ' + s.label + ')'; },
      paras: function (s) {
        return ['Under Section 6(1) of the Right to Information Act, 2005, I request the following information about a complaint I sent to your office about possible filling of wetland in ' + s.place + ', at ' + at(s, 'N', 'E') + ' (complaint dated ' + BLANK + ', reference number ' + BLANK + ').',
          '1. The action taken on that complaint, with dates.',
          '2. A copy of any inspection report or site-visit note about this site.',
          '3. The name and designation of the officer responsible for acting on the complaint.',
          '4. If no action has been taken, the reason, as recorded in the file.',
          'I have paid the application fee of ₹10 by ' + BLANK + '. Please send the information within 30 days, as Section 7(1) of the Act requires.',
          'If the information is not given, I may file a first appeal under Section 19(1) of the Act.'];
      }
    },
    ta: {
      pio: 'பொதுத் தகவல் அலுவலர்',
      subj: function (s) { return 'தகவல் அறியும் உரிமைச் சட்டம், 2005, பிரிவு 6(1)-ன் கீழ் விண்ணப்பம்: ' + s.place + ' பகுதி குறித்த புகாரின் மீது எடுக்கப்பட்ட நடவடிக்கை (NEERKATTI ' + s.id + ')'; },
      paras: function (s) {
        return ['தகவல் அறியும் உரிமைச் சட்டம், 2005, பிரிவு 6(1)-ன் கீழ், ' + s.place + ' பகுதியில், ' + at(s, 'வடக்கு', 'கிழக்கு') + ' என்ற இடத்தில் ஈரநிலம் நிரப்பப்பட்டிருக்கக்கூடும் என்பது குறித்து உங்கள் அலுவலகத்திற்கு நான் அனுப்பிய புகார் (தேதி: ' + BLANK + ', பதிவு எண்: ' + BLANK + ') தொடர்பான பின்வரும் தகவல்களைக் கோருகிறேன்.',
          '1. அந்தப் புகாரின் மீது எடுக்கப்பட்ட நடவடிக்கை, தேதிகளுடன்.',
          '2. இந்த இடம் குறித்த ஆய்வு அறிக்கை அல்லது கள ஆய்வுக் குறிப்பின் நகல்.',
          '3. அந்தப் புகாரின் மீது நடவடிக்கை எடுக்கப் பொறுப்பான அலுவலரின் பெயர் மற்றும் பதவி.',
          '4. நடவடிக்கை எதுவும் எடுக்கப்படவில்லை எனில், கோப்பில் பதிவு செய்யப்பட்டுள்ள காரணம்.',
          'விண்ணப்பக் கட்டணம் ₹10 ' + BLANK + ' மூலம் செலுத்தியுள்ளேன். சட்டத்தின் பிரிவு 7(1)-ன்படி 30 நாட்களுக்குள் தகவல்களை அனுப்புமாறு கேட்டுக்கொள்கிறேன்.',
          'தகவல் வழங்கப்படாவிட்டால், சட்டத்தின் பிரிவு 19(1)-ன் கீழ் முதல் மேல்முறையீடு செய்யலாம் என்பதைத் தெரிவித்துக்கொள்கிறேன்.'];
      }
    }
  };
  function tx(lang) { return form.kind === 'rti' ? Object.assign({}, T[lang], R[lang]) : T[lang]; }

  // The citizen's own photo check of this site on this visit (final/report.js keeps it in memory
  // only, in F.photos): one sentence in the complaint, only when the AI saw one of these three
  var PHOTO = {
    en: { construction: 'construction', dumping: 'dumping or filling', sewage: 'sewage' },
    ta: { construction: 'கட்டுமானப் பணிக்கான', dumping: 'மண் அல்லது கழிவுகளைக் கொட்டி நிரப்பியதற்கான', sewage: 'கழிவுநீருக்கான' }
  };
  function photoOf(s) {
    var p = F.photos && F.photos[s.kind + ':' + s.id];
    return p && PHOTO.en[p.category] ? p : null;
  }
  function photoLine(p, lang) {
    if (lang === 'ta') return day(p.when, 'ta') + ' அன்று, இந்த இடத்தில் நான் எடுத்த புகைப்படத்தை NEERKATTI வழியாக Google-இன் Gemini AI சோதித்து, அதில் ' +
      PHOTO.ta[p.category] + ' அறிகுறிகள் தெரிவதாகக் கூறியது; இதைக் கள ஆய்வு மட்டுமே உறுதிப்படுத்த முடியும்.';
    return 'On ' + day(p.when, 'en') + ', Google\'s Gemini AI, through NEERKATTI, checked a photo I took at this site and said it shows signs of ' +
      PHOTO.en[p.category] + '; only an inspection can confirm this.';
  }

  function body(s, lang) {
    if (form.kind === 'rti') return R[lang].paras(s);
    var t = T[lang], p = form.photo ? photoOf(s) : null;
    var out = [t.ask(s), t.seen(s), t.marsh(s)];
    if (s.wet_monsoon !== null && s.wet_monsoon !== undefined) out.push(t.flood(s));
    if (s.checked) out.push(t.checked);
    if (p) out.push(photoLine(p, lang));
    out.push(t.caveat, t.request);
    return out;
  }
  function office(lang) {
    var o;
    if (form.to === 'other') o = form.other ? form.other.split('\n') : [BLANK];
    else o = (OFFICES.filter(function (x) { return x.id === form.to; })[0] || OFFICES[0])[lang];
    return form.kind === 'rti' ? [R[lang].pio].concat(o) : o;
  }
  function sender() {
    var lines = [form.name || BLANK].concat(form.addr ? form.addr.split('\n') : [BLANK]);
    if (form.contact) lines.push(form.contact);
    return lines;
  }
  function lines(list) { return list.map(esc).join('<br>'); }

  function pageHtml(s, lang) {
    var t = tx(lang), today = new Date();
    return '<article class="nk-page" lang="' + lang + '">' +
      '<p class="nk-date">' + t.date + ': ' + day(today, lang) + '</p>' +
      '<div class="nk-addrs"><div><p class="nk-lbl">' + t.from + '</p><p>' + lines(sender()) + '</p></div>' +
      '<div><p class="nk-lbl">' + t.to + '</p><p>' + lines(office(lang)) + '</p></div></div>' +
      '<p class="nk-subj"><b>' + t.subject + ':</b> ' + esc(t.subj(s)) + '</p>' +
      '<p>' + t.dear + '</p>' +
      body(s, lang).map(function (para) { return '<p>' + esc(para) + '</p>'; }).join('') +
      '<p>' + t.thanks + '</p>' +
      '<p class="nk-close">' + t.close + '<br><span class="nk-sign">' + esc(form.name || BLANK) + '</span></p>' +
      (s.closeup ? '<figure class="nk-fig"><img src="' + esc(s.closeup) + '" alt="' + esc(t.fig(s)) + '"><figcaption>' + esc(t.fig(s)) + '</figcaption></figure>' : '') +
      '<p class="nk-src">' + esc(t.src(s)) + '</p>' +
      '</article>';
  }
  function plainText(s, lang) {
    var t = tx(lang);
    return [t.date + ': ' + day(new Date(), lang), '', t.from + ':'].concat(sender(), ['', t.to + ':'], office(lang),
      ['', t.subject + ': ' + t.subj(s), '', t.dear, ''], body(s, lang).join('\n\n'), ['', t.thanks, '', t.close, form.name || BLANK, '', t.src(s)]).join('\n');
  }
  function langs() { return form.lang === 'both' ? ['en', 'ta'] : [form.lang]; }

  // ---- the sheet ------------------------------------------------------------------
  var saved = {};
  try { saved = JSON.parse(F.store('neerkatti-letter-me') || '{}') || {}; } catch (e) { saved = {}; }
  var form = { kind: 'complaint', lang: 'both', to: 'wetland', other: '', name: saved.name || '', addr: saved.addr || '', contact: saved.contact || '', photo: true };
  var site = null;

  var sheet = document.createElement('dialog');
  sheet.className = 'nk-sheet';
  sheet.id = 'nk-letter';
  sheet.setAttribute('aria-labelledby', 'nk-letter-title');
  sheet.innerHTML =
    '<div class="nk-sheet-top"><div><p class="kicker">Final round · act on a patch</p><h2 id="nk-letter-title" tabindex="-1">Complaint letter</h2><p class="nk-sub" id="nk-letter-sub"></p></div>' +
    '<button type="button" class="nk-x" id="nk-letter-x" aria-label="Close the letter">×</button></div>' +
    '<div class="nk-sheet-body">' +
    '<form class="nk-form" id="nk-letter-form" autocomplete="on">' +
    '<div class="nk-field"><span class="nk-flbl" id="nk-kind-lbl">Letter</span><fieldset class="seg" aria-labelledby="nk-kind-lbl">' +
    '<label><input type="radio" name="nk-kind" value="complaint" checked><span>Complaint</span></label>' +
    '<label><input type="radio" name="nk-kind" value="rti"><span>RTI follow-up</span></label></fieldset></div>' +
    '<p class="nk-note" id="nk-rti-note" hidden>Send this if your complaint gets no action in 30 days. Under the RTI Act 2005 the office must reply within 30 days. The fee in Tamil Nadu is ₹10.</p>' +
    '<label class="nk-field nk-check" id="nk-photo-wrap" hidden><input type="checkbox" id="nk-photo-on" checked><span id="nk-photo-lbl"></span></label>' +
    '<div class="nk-field"><span class="nk-flbl" id="nk-lang-lbl">Language</span><fieldset class="seg" aria-labelledby="nk-lang-lbl">' +
    '<label><input type="radio" name="nk-lang" value="en"><span>English</span></label>' +
    '<label><input type="radio" name="nk-lang" value="ta"><span lang="ta">தமிழ்</span></label>' +
    '<label><input type="radio" name="nk-lang" value="both" checked><span>Both</span></label></fieldset></div>' +
    '<label class="nk-field"><span class="nk-flbl">Send to</span><select id="nk-to">' +
    '<option value="wetland">Tamil Nadu State Wetland Authority</option>' +
    '<option value="gcc">Greater Chennai Corporation (Commissioner)</option>' +
    '<option value="forest">Tamil Nadu Forest Department</option>' +
    '<option value="other">Another office (type it)</option></select></label>' +
    '<label class="nk-field" id="nk-other-wrap" hidden><span class="nk-flbl">Office name and address</span><textarea id="nk-other" rows="3"></textarea></label>' +
    '<label class="nk-field"><span class="nk-flbl">Your name</span><input id="nk-name" autocomplete="name"></label>' +
    '<label class="nk-field"><span class="nk-flbl">Your area or address</span><textarea id="nk-addr" rows="2" autocomplete="street-address"></textarea></label>' +
    '<label class="nk-field"><span class="nk-flbl">Phone or email <i>(optional)</i></span><input id="nk-contact" autocomplete="tel"></label>' +
    '<p class="nk-note">What you type stays on this device. Blank fields print as lines to fill in by hand.</p>' +
    '<div class="nk-btns"><button type="button" class="btn primary" id="nk-pdf">Save as PDF</button>' +
    '<button type="button" class="btn ghost" id="nk-copy">Copy text</button>' +
    '<a class="btn ghost" id="nk-mail" href="mailto:">Email it</a></div>' +
    '<p class="nk-status" id="nk-status" role="status" aria-live="polite"></p>' +
    '<p class="nk-note">The letter never names an owner and never says anything is illegal.</p>' +
    '</form>' +
    '<div class="nk-preview" id="nk-preview" aria-label="Letter preview"></div></div>';
  document.body.appendChild(sheet);
  var printBox = document.createElement('div');
  printBox.id = 'nk-print';
  document.body.appendChild(printBox);

  function $(id) { return document.getElementById(id); }
  function remember() {
    F.store('neerkatti-letter-me', JSON.stringify({ name: form.name, addr: form.addr, contact: form.contact }));
  }
  function render() {
    if (!site) return;
    var ls = langs();
    $('nk-letter-title').textContent = form.kind === 'rti' ? 'RTI follow-up letter' : 'Complaint letter';
    $('nk-rti-note').hidden = form.kind !== 'rti';
    var p = photoOf(site);
    $('nk-photo-wrap').hidden = form.kind === 'rti' || !p;
    if (p) $('nk-photo-lbl').textContent = 'Mention my photo check of ' + day(p.when, 'en') + ': signs of ' + PHOTO.en[p.category];
    $('nk-preview').innerHTML = ls.map(function (l) { return pageHtml(site, l); }).join('');
    var text = ls.map(function (l) { return plainText(site, l); }).join('\n\n----------\n\n');
    $('nk-mail').href = 'mailto:?subject=' + encodeURIComponent(tx(ls[0]).subj(site)) + '&body=' + encodeURIComponent(text);
  }
  function fill() {
    sheet.querySelectorAll('input[name="nk-lang"]').forEach(function (r) { r.checked = r.value === form.lang; });
    sheet.querySelectorAll('input[name="nk-kind"]').forEach(function (r) { r.checked = r.value === form.kind; });
    $('nk-to').value = form.to;
    $('nk-other-wrap').hidden = form.to !== 'other';
    $('nk-other').value = form.other;
    $('nk-name').value = form.name;
    $('nk-addr').value = form.addr;
    $('nk-contact').value = form.contact;
    $('nk-photo-on').checked = form.photo;
  }

  sheet.addEventListener('input', function (e) {
    var el = e.target;
    if (el.name === 'nk-lang') form.lang = el.value;
    else if (el.name === 'nk-kind') form.kind = el.value;
    else if (el.id === 'nk-to') { form.to = el.value; $('nk-other-wrap').hidden = form.to !== 'other'; }
    else if (el.id === 'nk-other') form.other = el.value;
    else if (el.id === 'nk-name') form.name = el.value.trim();
    else if (el.id === 'nk-addr') form.addr = el.value.trim();
    else if (el.id === 'nk-contact') form.contact = el.value.trim();
    else if (el.id === 'nk-photo-on') form.photo = el.checked;
    if (/^nk-(name|addr|contact)$/.test(el.id)) remember();
    render();
  });
  $('nk-letter-form').addEventListener('submit', function (e) { e.preventDefault(); });
  $('nk-letter-x').addEventListener('click', function () { sheet.close(); });
  sheet.addEventListener('click', function (e) {
    if (e.target !== sheet) return;
    var r = sheet.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) sheet.close();
  });

  // Save as PDF: print only the letter, through the browser's own print dialog
  $('nk-pdf').addEventListener('click', function () {
    printBox.innerHTML = $('nk-preview').innerHTML;
    document.documentElement.classList.add('nk-printing');
    var done = function () { document.documentElement.classList.remove('nk-printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    // wait for the close-up to load, so it is on the page
    var img = printBox.querySelector('img');
    var go = function () { window.print(); setTimeout(done, 1000); };
    if (img && !img.complete) { img.addEventListener('load', go); img.addEventListener('error', go); } else go();
  });
  $('nk-copy').addEventListener('click', function () {
    var text = langs().map(function (l) { return plainText(site, l); }).join('\n\n----------\n\n');
    var ok = function () { status('Copied. Paste it into an email or a message.'); };
    var no = function () { status('This browser would not copy. Use Save as PDF or Email it instead.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, no);
    else no();
  });
  var statusTimer = null;
  function status(text) {
    $('nk-status').textContent = text;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { $('nk-status').textContent = ''; }, 4000);
  }

  // kind: 'complaint' or 'rti' to choose the letter (the photo check asks for the complaint)
  function open(s, kind) {
    site = s;
    if (kind) form.kind = kind;
    form.photo = true;
    if (form.to === 'wetland' && s.marsh === 'outside' && /zone$/.test(s.place)) form.to = 'gcc';
    F.font('https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;600;700&display=swap');
    $('nk-letter-sub').textContent = (s.kind === 'alert' ? 'Alert ' + s.id : 'Patch #' + s.id) + ' · ' + s.place + ' · ' + s.area_ha.toFixed(2) + ' ha';
    fill();
    render();
    if (!sheet.open) { if (sheet.showModal) sheet.showModal(); else sheet.setAttribute('open', ''); }
    $('nk-letter-title').focus();
  }

  api.addPatchAction({ id: 'letter', label: 'Draft a complaint letter', run: function (p) { open(F.siteOfPatch(p)); } });
  F.letter = open;
  F.live('letter');
})();

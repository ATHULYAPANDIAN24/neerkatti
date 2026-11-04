// NEERKATTI final round: who the map helps and how, in one card under the headline numbers.
(function () {
  var F = window.NKFinal;
  if (!F || !F.on) return;
  var meta = F.api.data.meta;
  var lost = meta.lost_ha.toFixed(1);
  var litres = F.api.core.indianLitres(F.api.core.storage(meta.lost_ha, 1).litres);

  var card = document.createElement('section');
  card.className = 'chart-card nk-impact';
  card.setAttribute('aria-labelledby', 'nk-impact-title');
  card.innerHTML =
    '<p class="kicker">Social impact</p>' +
    '<h2 id="nk-impact-title">Who it helps, and how</h2>' +
    '<p class="small">Free on any phone, with no login and no tracking. It turns satellite evidence into steps people can take.</p>' +
    '<ul class="nk-impact-list">' +
    '<li><b>Families near the marsh</b><span>See where the flood sponge near them was filled, and when. Send a complaint letter in Tamil or English in one tap.</span></li>' +
    '<li><b>Residents\' associations and NGOs</b><span>Dated satellite close-ups and open data to back a complaint or a petition, instead of word of mouth.</span></li>' +
    '<li><b>Officials</b><span>The Greater Chennai Corporation and the State Wetlands Authority get a ranked list of places to inspect first, and alerts while new filling is still bare earth.</span></li>' +
    '<li><b>Everyone downstream</b><span>Wetlands hold floodwater. If the ' + lost + '&nbsp;ha we flagged were still marsh, 1&nbsp;m of water over it would be ' + F.esc(litres) + '.</span></li>' +
    '</ul>' +
    '<p class="nk-impact-fair">For everyone: letters in Tamil and English · works offline · no login, no cookies · owners are never named</p>' +
    '<p class="nk-sdg" aria-label="UN Sustainable Development Goals">' +
    '<span class="nk-sdg-lbl">UN goals</span><span class="nk-chip">6 Clean water</span><span class="nk-chip">11 Sustainable cities</span>' +
    '<span class="nk-chip">13 Climate action</span><span class="nk-chip">15 Life on land</span></p>';
  var stats = document.querySelector('#panel .stats');
  if (stats) stats.parentNode.insertBefore(card, stats.nextSibling);
})();

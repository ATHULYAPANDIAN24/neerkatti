// NEERKATTI v1 — Pallikaranai marsh: 2018 vs 2026
// Paste into https://code.earthengine.google.com and press Run.
//
// Idea: Google's Dynamic World dataset labels every 10 m x 10 m square of
// Sentinel-2 satellite photos as water / trees / grass / marsh / crops /
// shrubs / buildings / bare soil. We take the same season in 2018 and 2026,
// and look for squares that were WET in 2018 but are BUILDINGS or BARE SOIL now.

// ---------------------------------------------------------------------------
// 1. Where to look: Pallikaranai marsh, the lakes around it, and our campus
// ---------------------------------------------------------------------------
var area = ee.Geometry.Rectangle([80.17, 12.86, 80.26, 12.99]);
var campus = ee.Geometry.Point([80.2226, 12.8731]);  // Sathyabama (approx.)

// ---------------------------------------------------------------------------
// 2. When to look: Feb–May (dry season, few clouds) in both years,
//    so monsoon water doesn't fool the comparison
// ---------------------------------------------------------------------------
var BEFORE_YEAR = 2018;
var AFTER_YEAR = 2026;

function landCover(year) {
  return ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
    .filterBounds(area)
    .filterDate(year + '-02-01', year + '-06-01')
    .select('label')
    .reduce(ee.Reducer.mode())   // most common label for each square that season
    .rename('label')
    .clip(area);
}

function photo(year) {
  return ee.ImageCollection('COPERNICUS/S2_HARMONIZED')
    .filterBounds(area)
    .filterDate(year + '-02-01', year + '-06-01')
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
    .median()
    .clip(area);
}

var before = landCover(BEFORE_YEAR);
var after = landCover(AFTER_YEAR);
var afterPrev = landCover(AFTER_YEAR - 1);  // 2025, to confirm the change is stable

// Dynamic World label numbers:
// 0 water, 1 trees, 2 grass, 3 flooded vegetation (marsh), 4 crops,
// 5 shrub & scrub, 6 built (buildings), 7 bare soil, 8 snow & ice
var wetBefore = before.eq(0).or(before.eq(3));
var wetAfter = after.eq(0).or(after.eq(3));

// ---------------------------------------------------------------------------
// 3. What changed
//    RED    = was wet, now BUILDINGS  -> strong sign of encroachment
//    ORANGE = was wet, now BARE SOIL  -> could be filling with earth, OR just a
//             lake bed that dried up this summer -> "needs checking on the ground"
//    Noise fixes (v1): ignore the outer ~20 m rim of 2018 water bodies (edge
//    pixels mix water with nearby buildings), and only count a change if the
//    new label is the same in 2025 AND 2026.
// ---------------------------------------------------------------------------
function clean(mask) {
  // drop tiny specks: keep patches of at least 10 squares (~0.1 hectare)
  var m = mask.selfMask();
  return m.updateMask(m.connectedPixelCount(100, true).gte(10));
}

var wetCore = wetBefore.focalMin({radius: 20, units: 'meters'});
var toBuilt = clean(wetCore.and(after.eq(6)).and(afterPrev.eq(6)));
var toBare = clean(wetCore.and(after.eq(7)).and(afterPrev.eq(7)));

function hectares(mask) {
  var sum = ee.Image.pixelArea().updateMask(mask).reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: area,
    scale: 10,
    maxPixels: 1e10
  }).get('area');
  // if nothing matched, the sum can come back empty: treat that as 0
  return ee.Number(ee.Algorithms.If(sum, sum, 0)).divide(10000);
}

// ---------------------------------------------------------------------------
// 4. Show it: a wipe slider with 2018 on the left, 2026 on the right
// ---------------------------------------------------------------------------
var palette = ['419bdf', '397d49', '88b053', '7a87c6', 'e49635',
               'dfc35a', 'c4281b', 'a59b8f', 'b39fe1'];
var coverVis = {min: 0, max: 8, palette: palette};
var photoVis = {bands: ['B4', 'B3', 'B2'], min: 0, max: 3000};

var leftMap = ui.Map();
var rightMap = ui.Map();

leftMap.addLayer(photo(BEFORE_YEAR), photoVis, BEFORE_YEAR + ' satellite photo', false);
leftMap.addLayer(before, coverVis, BEFORE_YEAR + ' land cover');
leftMap.addLayer(campus, {color: 'yellow'}, 'Sathyabama (our campus)');
leftMap.add(ui.Label('BEFORE: ' + BEFORE_YEAR + ' (Feb–May)',
  {position: 'top-left', fontSize: '18px', fontWeight: 'bold'}));

rightMap.addLayer(photo(AFTER_YEAR), photoVis, AFTER_YEAR + ' satellite photo', false);
rightMap.addLayer(after, coverVis, AFTER_YEAR + ' land cover');
rightMap.addLayer(toBare, {min: 0, max: 1, palette: ['ff9900']}, 'Wet → bare soil (check)');
rightMap.addLayer(toBuilt, {min: 0, max: 1, palette: ['ff0000']}, 'Wet → buildings');
rightMap.addLayer(campus, {color: 'yellow'}, 'Sathyabama (our campus)');
rightMap.add(ui.Label('AFTER: ' + AFTER_YEAR + ' (Feb–May)',
  {position: 'top-right', fontSize: '18px', fontWeight: 'bold'}));

// Legend
var names = ['Water', 'Trees', 'Grass', 'Marsh (flooded vegetation)', 'Crops',
             'Shrubs', 'Buildings', 'Bare soil'];
var legend = ui.Panel({style: {position: 'bottom-left', padding: '6px 8px'}});
legend.add(ui.Label('NEERKATTI v1 — land cover', {fontWeight: 'bold'}));
function legendRow(color, text, bold) {
  return ui.Panel([
    ui.Label('', {backgroundColor: '#' + color, padding: '8px', margin: '0 6px 4px 0'}),
    ui.Label(text, {margin: '0 0 4px 0', fontWeight: bold ? 'bold' : 'normal'})
  ], ui.Panel.Layout.Flow('horizontal'));
}
for (var i = 0; i < names.length; i++) {
  legend.add(legendRow(palette[i], names[i], false));
}
legend.add(legendRow('ff0000', 'LOST: wet → buildings', true));
legend.add(legendRow('ff9900', 'Wet → bare soil (needs checking)', true));
legend.add(legendRow('ffff00', 'Sathyabama (our campus)', false));
leftMap.add(legend);   // left side, so the wipe slider never hides it

// Numbers (also printed in the Console tab on the right)
var stats = ee.Dictionary({
  wetBefore: hectares(wetBefore.selfMask()),
  wetAfter: hectares(wetAfter.selfMask()),
  toBuilt: hectares(toBuilt),
  toBare: hectares(toBare)
});
print('NEERKATTI v1 numbers (hectares):', stats);

stats.evaluate(function (r) {
  var acres = function (ha) { return (ha * 2.47105).toFixed(1); };
  var text =
    'Wet land: ' + r.wetBefore.toFixed(0) + ' ha (' + BEFORE_YEAR + ') → ' +
    r.wetAfter.toFixed(0) + ' ha (' + AFTER_YEAR + ')\n' +
    'Wet → buildings: ' + r.toBuilt.toFixed(1) + ' ha (' + acres(r.toBuilt) + ' acres)\n' +
    'Wet → bare soil: ' + r.toBare.toFixed(1) + ' ha (' + acres(r.toBare) + ' acres)';
  rightMap.add(ui.Label(text, {
    position: 'bottom-right', whiteSpace: 'pre', fontWeight: 'bold', padding: '6px 8px'
  }));
});

// Link the two maps and put a wipe slider between them
ui.Map.Linker([leftMap, rightMap]);
var split = ui.SplitPanel({
  firstPanel: leftMap,
  secondPanel: rightMap,
  wipe: true,
  style: {stretch: 'both'}
});
ui.root.widgets().reset([split]);
leftMap.setCenter(80.215, 12.925, 13);
rightMap.setCenter(80.215, 12.925, 13);

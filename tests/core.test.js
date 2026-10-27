// Checks for docs/app/core.js, the map's plain helpers. Node's own test runner, no packages.
// Run:  node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../docs/app/core.js');

// the same data the page loads
const js = fs.readFileSync(path.join(__dirname, '..', 'docs', 'app', 'data', 'neerkatti_data.js'), 'utf8');
const window = {};
new Function('window', js)(window);
const patches = window.NEERKATTI.patches.features.map((f) => f.properties);

test('distance: one degree of latitude is about 111 km', () => {
  assert.ok(Math.abs(core.distance(12, 80, 13, 80) - 111195) < 50);
  assert.equal(core.distance(12.9, 80.2, 12.9, 80.2), 0);
});

test('formatDistance reads well at every scale', () => {
  assert.equal(core.formatDistance(3), '10 m');
  assert.equal(core.formatDistance(704), '700 m');
  assert.equal(core.formatDistance(2345), '2.3 km');
  assert.equal(core.formatDistance(1772300), '1,772 km');
});

test('every patch has the AI probabilities and a level that matches the weakest one', () => {
  for (const p of patches) {
    for (const k of ['p_wet_2018', 'p_built_2025', 'p_built_2026']) assert.ok(p[k] >= 0 && p[k] <= 1, `${p.rank} ${k}`);
    const w = core.weakest(p);
    const level = w >= 0.5 ? 'high' : w >= 0.35 ? 'medium' : 'low';
    assert.equal(p.ai_confidence, level, `patch ${p.rank}`);
  }
});

test('sort by size keeps the rank order, by confidence puts high first', () => {
  assert.deepEqual(core.sortPatches(patches, 'size').map((p) => p.rank), patches.map((p) => p.rank));
  const byConf = core.sortPatches(patches, 'confidence');
  const order = { high: 0, medium: 1, low: 2 };
  for (let i = 1; i < byConf.length; i++) assert.ok(order[byConf[i - 1].ai_confidence] <= order[byConf[i].ai_confidence]);
  assert.equal(patches[0].rank, 1, 'sorting must not reorder the data itself');
});

test('sort by distance puts the nearest first', () => {
  const venue = { lat: 12.8731, lon: 80.2226 };
  const near = core.sortPatches(patches, 'distance', venue);
  const d = near.map((p) => core.distance(venue.lat, venue.lon, p.lat, p.lon));
  for (let i = 1; i < d.length; i++) assert.ok(d[i - 1] <= d[i]);
});

test('zone and village totals add up to the patch areas, largest first', () => {
  const groups = core.byArea(patches);
  const total = groups.reduce((s, g) => s + g.ha, 0);
  const direct = patches.reduce((s, p) => s + p.area_ha, 0);
  assert.ok(Math.abs(total - direct) < 0.05);
  assert.equal(groups.reduce((n, g) => n + g.ranks.length, 0), patches.length);
  for (let i = 1; i < groups.length; i++) assert.ok(groups[i - 1].ha >= groups[i].ha);
});

test('spread moves overlapping pins apart and leaves lone ones alone', () => {
  const offsets = core.spread([[100, 100], [104, 102], [300, 300]], 24);
  assert.deepEqual(offsets[0], [0, 0]);
  assert.notDeepEqual(offsets[1], [0, 0]);
  assert.deepEqual(offsets[2], [0, 0]);
  const a = [100, 100], b = [104 + offsets[1][0], 102 + offsets[1][1]];
  assert.ok(!core.overlaps([a[0], a[1], a[0] + 24, a[1] + 24], [b[0], b[1], b[0] + 24, b[1] + 24]));
});

test('freeSpot finds a clear place or gives up', () => {
  const tries = [[0, 0], [0, 20]];
  assert.deepEqual(core.freeSpot(50, 50, 10, 5, [], tries).offset, [0, 0]);
  assert.deepEqual(core.freeSpot(50, 50, 10, 5, [[40, 40, 60, 60]], tries).offset, [0, 20]);
  assert.equal(core.freeSpot(50, 50, 10, 5, [[0, 0, 100, 100]], tries), null);
});

test('the address round-trips a view and ignores junk', () => {
  const view = { patch: 4, year: '2018', layer: 'labels' };
  assert.equal(core.hashFor(view), '#patch-4&year=2018&layer=labels');
  assert.deepEqual(core.readHash('#patch-4&year=2018&layer=labels'), { patch: 4, year: '2018', layer: 'labels' });
  assert.equal(core.hashFor({ year: 'compare', layer: 'photo' }), '');
  assert.deepEqual(core.readHash('#year=%E0%A4'), {});
  assert.deepEqual(core.readHash(''), {});
});

test('the address keeps the compared seasons, one season, and the marsh outline', () => {
  assert.equal(core.hashFor({ year: 'compare', left: 'monsoon', right: '2026', layer: 'photo' }), '#left=monsoon');
  assert.equal(core.hashFor({ year: 'compare', left: '2018', right: '2022', marsh: true }), '#right=2022&marsh=1');
  // one season: the compare sides are not written
  assert.equal(core.hashFor({ patch: 1, year: '2021', left: '2019', right: '2024', layer: 'labels' }), '#patch-1&year=2021&layer=labels');
  assert.deepEqual(core.readHash('#left=monsoon&marsh=1'), { left: 'monsoon', marsh: '1' });
});

test('the year a patch is drawn as built over', () => {
  assert.equal(core.builtFrom({ built_since: 2021 }), 2021);
  assert.equal(core.builtFrom({}), 2025, 'every flagged patch is built in 2025 and 2026');
  for (const p of patches) assert.ok(core.builtFrom(p) >= 2019 && core.builtFrom(p) <= 2025, `patch ${p.rank}`);
});

test('marsh status follows the outline and the 1 km zone', () => {
  assert.equal(core.marshStatus({ marsh_share: 0.2, marsh_distance_m: 0 }, 1000), 'inside');
  assert.equal(core.marshStatus({ marsh_share: 0, marsh_distance_m: 1000 }, 1000), 'zone');
  assert.equal(core.marshStatus({ marsh_share: 0, marsh_distance_m: 1001 }, 1000), 'outside');
  const near = patches.filter((p) => core.marshStatus(p, 1000) !== 'outside').length;
  assert.equal(near, 28);
});

test('storage: hectares times depth, in Indian units', () => {
  const s = core.storage(28.1, 1);
  assert.equal(Math.round(s.m3), 281000);
  assert.equal(Math.round(s.pools), 112);
  assert.equal(core.indianLitres(s.litres), '28.1 crore litres');
  assert.equal(core.indianLitres(4.5e6), '45 lakh litres');
  assert.equal(core.indianLitres(250000), '2.5 lakh litres');
  assert.equal(core.indianLitres(12345), '12,345 litres');
  assert.equal(core.indianLitres(2.81e9), '281 crore litres');
});

/**
 * engine.test.js — 赌徒错觉模拟器单元测试
 * 运行: cd numfeel-site && node pages/gamblers-fallacy/engine.test.js
 */
var engine = require('./engine.js');

var passed = 0;
var failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log('  \u2705 ' + msg); }
  else { failed++; console.error('  \u274C ' + msg); }
}
function assertClose(actual, expected, tol, msg) {
  var ok = Math.abs(actual - expected) <= (tol || 0.001);
  if (ok) { passed++; console.log('  \u2705 ' + msg + ' (actual=' + actual.toFixed(4) + ')'); }
  else { failed++; console.error('  \u274C ' + msg + ' (expected=' + expected + ', actual=' + actual + ')'); }
}

function seededRng(seed) {
  return function () { seed = (seed * 1664525 + 1013904223) % 4294967296; return (seed >>> 0) / 4294967296; };
}

// ============================================================
console.log('\n=== simulateOne ===');

(function () {
  var rng = seededRng(42);
  var result = engine.simulateOne(100, 0, 1.5, 0.5, rng);
  assert(result.history.length === 1, '0 rounds: history has 1 entry');
  assert(result.finalCapital === 100, '0 rounds: capital unchanged');
  assert(result.wins === 0 && result.losses === 0, '0 rounds: no wins/losses');
})();

(function () {
  var rng = seededRng(42);
  var result = engine.simulateOne(100, 10, 1.5, 0.5, rng);
  assert(result.history.length === 11, '10 rounds: history has 11 entries');
  assert(result.history[0] === 100, '10 rounds: starts with initial capital');
  assert(result.wins + result.losses === 10, '10 rounds: wins+losses=10');
  for (var i = 1; i < result.history.length; i++) {
    var ratio = result.history[i] / result.history[i - 1];
    assert(ratio === 1.5 || ratio === 0.5, 'Round ' + i + ': ratio is 1.5 or 0.5');
  }
})();

(function () {
  var rng = seededRng(12345);
  var r1 = engine.simulateOne(100, 50, 1.5, 0.5, rng);
  // same seed = same result
  var rng2 = seededRng(12345);
  var r2 = engine.simulateOne(100, 50, 1.5, 0.5, rng2);
  assert(r1.finalCapital === r2.finalCapital, '50 rounds seeded: same seed = same result');
  assert(r1.wins === r2.wins, '50 rounds seeded: same wins');
  assert(r1.finalCapital >= 0, '50 rounds: non-negative');
})();

// ============================================================
console.log('\n=== simulatePopulation ===');

(function () {
  var rng = seededRng(99);
  var pop = engine.simulatePopulation(5000, 20, 1.5, 0.5, rng);
  assert(pop.results.length === 5000, '5000 gamblers: correct size');
  assert(pop.size === 5000, '5000 gamblers: size field');
  assert(pop.rounds === 20, '5000 gamblers: rounds field');
  assertClose(pop.mean, 1.0, 0.25, '5000 gamblers: mean close to 1');
  assert(pop.geoMean < 0.1, '5000 gamblers: geometric mean < 0.1');
  assert(pop.median < 0.1, '5000 gamblers: median < 0.1');
  assert(pop.lost > pop.gained, '5000 gamblers: more losers than winners');
  assert(pop.lost + pop.gained + pop.even === 5000, 'Population total conserved');
})();

(function () {
  var rng = seededRng(99);
  var pop = engine.simulatePopulation(5000, 20, 2.0, 0.5, rng);
  assert(pop.mean > 10, 'Modified game: mean > 10');
  assertClose(pop.median, 1.0, 0.15, 'Modified game: median close to 1');
  assertClose(pop.geoMean, 1.0, 0.15, 'Modified game: geoMean close to 1');
})();

// ============================================================
console.log('\n=== buildHistogram ===');

(function () {
  var results = [1, 2, 3, 4, 5, 6, 7];
  var hist = engine.buildHistogram(results, 5);
  assert(hist.buckets.length === 5, 'Histogram: 5 buckets');
  assert(hist.total === 7, 'Histogram: total preserved');
  var totalCount = 0;
  for (var i = 0; i < hist.buckets.length; i++) totalCount += hist.buckets[i].count;
  assert(totalCount === 7, 'Histogram: all data assigned');
  assert(hist.maxCount > 0, 'Histogram: maxCount > 0');
})();

// ============================================================
console.log('\n=== computeTheoretical ===');

(function () {
  var t = engine.computeTheoretical(1, 1.5, 0.5);
  assertClose(t.arithPerRound, 1.0, 0.0001, '1 round: arith per round = 1');
  assertClose(t.geoPerRound, Math.sqrt(0.75), 0.001, '1 round: geo per round = sqrt(0.75)');
  assert(t.geoPerRound < 1, '1 round: geo per round < 1');
})();

(function () {
  var t = engine.computeTheoretical(20, 1.5, 0.5);
  assertClose(t.arithTotal, 1.0, 0.0001, '20 rounds: arith total = 1');
  assert(t.geoTotal < 0.1, '20 rounds: geo total < 0.1');
})();

(function () {
  var t = engine.computeTheoretical(20, 2.0, 0.5);
  assert(t.arithTotal > 50, '20 rounds modified: arith total > 50');
  assertClose(t.geoTotal, 1.0, 0.001, '20 rounds modified: geo total = 1');
})();

// ============================================================
console.log('\n=== Edge cases ===');

(function () {
  var rng = seededRng(1);
  var result = engine.simulateOne(1, 200, 1.5, 0.5, rng);
  assert(result.finalCapital >= 0, '200 rounds: final capital non-negative');
  assert(result.history.length === 201, '200 rounds: correct history length');
})();

(function () {
  var pop = engine.simulatePopulation(0, 10, 1.5, 0.5);
  assert(pop.results.length === 0, '0 gamblers: empty results');
})();

// ============================================================
console.log('\n=== Result ===');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
if (failed > 0) process.exit(1);

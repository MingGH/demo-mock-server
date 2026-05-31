'use strict';

var lib = require('./engine.js');
var GameOfLife = lib.GameOfLife;
var PATTERNS = lib.PATTERNS;

// ── Test 1: Blinker should be detected as period 2 ──
console.log('Test 1: Blinker period detection');
var sim1 = new GameOfLife(20, 10);
sim1.placePattern('blinker', 5, 3);
for (var i = 0; i < 10; i++) {
  sim1.step();
}
// Blinker oscillates (always changes), so stable=false, but period should be 2
console.log('  periodDetected:', sim1.periodDetected, 'stable:', sim1.stable);
console.assert(sim1.periodDetected === 2, 'FAIL: Blinker should be period 2');
console.log(sim1.periodDetected === 2 ? '  PASS' : '  FAIL');

// ── Test 2: Same population, different grid → no false period (regression test) ──
// The old pop-based detector would incorrectly flag a period when population was
// stable (e.g. a moving spaceship always has 5 cells). The hash-based fix must
// return 0 because the grid state actually changes every generation.
console.log('Test 2: Same population, different grid → no false period');
var sim2 = new GameOfLife(40, 25);
sim2.placePattern('glider', 5, 5);
// A glider always has 5 live cells, and it moves so the grid hash changes.
// Step enough times to build history for _detectPeriod() (requires >= 10 entries).
for (var j = 0; j < 24; j++) {
  sim2.step();
}
// The old pop-based detector would see population=5 every generation and
// incorrectly report period 2 or 4. The hash-based fix correctly returns 0.
console.log('  periodDetected:', sim2.periodDetected, '(expected 0 — moving glider with stable pop should not be detected as periodic)');
console.assert(sim2.periodDetected === 0, 'FAIL: moving glider with constant population should not be detected as period');
console.log(sim2.periodDetected === 0 ? '  PASS' : '  FAIL');

// ── Test 3: Random fill with high density, should NOT false-positive period ──
console.log('Test 3: Random fill, rapid evolution → no premature period');
var sim3 = new GameOfLife(40, 25);
sim3.randomFill(0.5);
for (var k = 0; k < 30; k++) {
  sim3.step();
}
// At generation 30, population may fluctuate but grid shouldn't repeat exactly
// unless it stabilized (unlikely with 50% density)
var earlyPeriod = sim3.periodDetected;
console.log('  periodDetected at gen 30:', earlyPeriod, '(0 = no false period, good)');
console.assert(earlyPeriod === 0, 'FAIL: Random fill should not detect period at gen 30');
console.log(earlyPeriod === 0 ? '  PASS' : '  FAIL');

// ── Test 4: Beacon (period 2, 8 cells) ──
console.log('Test 4: Beacon period detection');
var sim4 = new GameOfLife(20, 10);
sim4.placePattern('beacon', 5, 3);
for (var m = 0; m < 10; m++) {
  sim4.step();
}
// Beacon oscillates, so stable=false, but period should be 2
console.log('  periodDetected:', sim4.periodDetected, 'stable:', sim4.stable);
console.assert(sim4.periodDetected === 2, 'FAIL: Beacon should be period 2');
console.log(sim4.periodDetected === 2 ? '  PASS' : '  FAIL');

// ── Test 5: Toggle resets state ──
console.log('Test 5: Toggle resets history state');
var sim5 = new GameOfLife(20, 10);
sim5.placePattern('blinker', 5, 3);
for (var n = 0; n < 10; n++) {
  sim5.step();
}
console.assert(sim5.generation === 10, 'FAIL: generation should be 10');
sim5.setCell(5, 5, 1);
console.log('  generation after setCell:', sim5.generation, '(should be 0)');
console.assert(sim5.generation === 0, 'FAIL: setCell should reset generation to 0');
console.assert(sim5.populationHistory.length === 0, 'FAIL: history should be empty after setCell');
console.assert(sim5.stable === false, 'FAIL: stable should be false after setCell');
console.assert(sim5.periodDetected === 0, 'FAIL: periodDetected should be 0 after setCell');
console.log('  PASS');

// ── Test 6: Grid hash is deterministic ──
console.log('Test 6: Grid hash reproducibility');
var sim6a = new GameOfLife(10, 5);
sim6a.grid[2][3] = 1;
sim6a.grid[2][4] = 1;
var h1 = sim6a.gridHash();

var sim6b = new GameOfLife(10, 5);
sim6b.grid[2][3] = 1;
sim6b.grid[2][4] = 1;
var h2 = sim6b.gridHash();
console.assert(h1 === h2, 'FAIL: Same grid should produce same hash');
console.log('  PASS (hash matches)');

sim6b.grid[2][3] = 0;
var h3 = sim6b.gridHash();
console.assert(h1 !== h3, 'FAIL: Different grid should produce different hash');
console.log('  PASS (hash differs)');

console.log('\nAll tests completed.');

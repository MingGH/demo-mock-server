/**
 * engine.test.js — JS 二进制实验室 engine 单元测试
 * 用法: node pages/js-binary-lab/engine.test.js
 */
(function () {
    'use strict';

    var passed = 0;
    var failed = 0;

    function assert(cond, msg) {
        if (cond) { passed++; console.log('  ✅ ' + msg); }
        else { failed++; console.error('  ❌ ' + msg); }
    }

    function assertClose(actual, expected, tol, msg) {
        if (Math.abs(actual - expected) <= tol) { passed++; console.log('  ✅ ' + msg); }
        else { failed++; console.error('  ❌ ' + msg + ' (expected ~' + expected + ', got ' + actual + ')'); }
    }

    var eng;
    try {
        eng = require('./engine.js');
    } catch (e) {
        console.error('Failed to load engine.js: ' + e.message);
        process.exit(1);
    }

    console.log('\n=== formatSize ===');
    assert(eng.formatSize(0) === '0 B', '0 bytes');
    assert(eng.formatSize(512) === '512 B', '512 bytes');
    assert(eng.formatSize(1536) === '1.5 KB', '1.5 KB');
    assert(eng.formatSize(1048576) === '1.0 MB', '1 MB');
    assert(eng.formatSize(1572864) === '1.5 MB', '1.5 MB');

    console.log('\n=== sortByMetric ===');
    var data = [
        { tool: 'A', size: 300, coldStartMs: 100, peakMemKb: 50 },
        { tool: 'B', size: 100, coldStartMs: 200, peakMemKb: 30 },
        { tool: 'C', size: 200, coldStartMs: 50, peakMemKb: 100 }
    ];
    var sorted = eng.sortByMetric(data, 'size');
    assert(sorted[0].tool === 'B', 'sort by size: smallest first');
    assert(sorted[2].tool === 'A', 'sort by size: largest last');
    sorted = eng.sortByMetric(data, 'coldStartMs');
    assert(sorted[0].coldStartMs === 50, 'sort by coldStartMs: fastest first');

    console.log('\n=== segmentColor ===');
    assert(eng.segmentColor('text') === '#90caf9', 'text → blue');
    assert(eng.segmentColor('data') === '#ce93d8', 'data → purple');
    assert(eng.segmentColor('code') === '#81c784', 'code → green');
    assert(eng.segmentColor('zero') === '#2a2a3e', 'zero → dark');
    assert(eng.segmentColor('unknown') === '#666', 'unknown → gray');

    console.log('\n=== totalSize ===');
    var segs = [{ offset: 0, size: 100, type: 'text' }, { offset: 100, size: 50, type: 'zero' }];
    assert(eng.totalSize(segs) === 150, 'total size = sum of segments');

    console.log('\n=== segmentTypeStats ===');
    var stats = eng.segmentTypeStats(segs);
    assert(stats.text === 100, 'text: 100 bytes');
    assert(stats.zero === 50, 'zero: 50 bytes');
    assert(stats.code === 0, 'code: 0 bytes');

    console.log('\n=== getScenarios ===');
    var scenarios = eng.getScenarios();
    assert(scenarios.length === 3, '3 scenarios');
    assert(scenarios[0].id === 'fib', 'first is fib');
    assert(typeof scenarios[0].code === 'string' && scenarios[0].code.length > 0, 'fib has code');
    assert(typeof scenarios[1].code === 'string' && scenarios[1].code.length > 0, 'sort has code');

    console.log('\n' + '='.repeat(40));
    console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
    if (failed > 0) process.exit(1);
})();

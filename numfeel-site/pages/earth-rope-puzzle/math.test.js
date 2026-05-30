/**
 * math.js 独立测试
 * 运行方式: node math.test.js
 * 无需任何测试框架依赖
 */
var m = require('./math.js');
var failed = 0;
var passed = 0;

function assert(condition, label) {
  if (condition) {
    console.log('\u2713 ' + label);
    passed++;
  } else {
    console.log('\u2717 ' + label);
    failed++;
  }
}

function approx(a, b, epsilon) {
  epsilon = epsilon || 0.0001;
  return Math.abs(a - b) < epsilon;
}

// 1. calculateGap(1) ≈ 0.15915
assert(approx(m.calculateGap(1), 0.15915, 0.0001), 'calculateGap(1) ≈ 0.1592');

// 2. calculateGap(0) === 0
assert(m.calculateGap(0) === 0, 'calculateGap(0) = 0');

// 3. calculateGap(2*Math.PI) ≈ 1
assert(approx(m.calculateGap(2 * Math.PI), 1, 0.0001), 'calculateGap(2π) ≈ 1 (增加2π米，间隙恰好1米)');

// 4. calculateRequiredLength(1) ≈ 6.2832
assert(approx(m.calculateRequiredLength(1), 6.2832, 0.0001), 'calculateRequiredLength(1) ≈ 6.2832');

// 5. calculateRequiredLength(0) === 0
assert(m.calculateRequiredLength(0) === 0, 'calculateRequiredLength(0) = 0');

// 6. verifyIndependence: 不同半径得到相同 gap
var earthGap = m.verifyIndependence(6371000, 1).gap;
var bballGap = m.verifyIndependence(0.12, 1).gap;
assert(approx(earthGap, bballGap, 0.0001), 'verifyIndependence: 地球 vs 篮球间隙相同');

// 7. formatLength 单位切换
assert(m.formatLength(0.001) === '1.00 毫米', 'formatLength(0.001m) → 1.00 毫米');
assert(m.formatLength(0.15) === '15.00 厘米', 'formatLength(0.15m) → 15.00 厘米');
assert(m.formatLength(1500) === '1.50 公里', 'formatLength(1500m) → 1.50 公里');

console.log('');
if (failed === 0) {
  console.log('All ' + passed + ' tests passed!');
  process.exit(0);
} else {
  console.log(passed + ' passed, ' + failed + ' failed');
  process.exit(1);
}

// 暴击率 vs 暴击伤害 - 测试套件
var eng = require('./engine');

var passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { console.log('✅ ' + msg); passed++; }
  else { console.error('❌ ' + msg); failed++; }
}
function assertClose(actual, expected, tol, msg) {
  tol = tol == null ? 1e-6 : tol;
  var ok = Math.abs(actual - expected) <= tol;
  if (ok) { console.log('✅ ' + msg + ' (got ' + actual.toFixed(4) + ', want ' + expected.toFixed(4) + ')'); passed++; }
  else { console.error('❌ ' + msg + ' (got ' + actual + ', want ' + expected + ')'); failed++; }
}

console.log('\n=== 期望伤害公式 ===');
assertClose(eng.expectedDamage(100, 0, 1.0), 100, 1e-9, '0%暴击率时期望=base');
assertClose(eng.expectedDamage(100, 1.0, 1.0), 200, 1e-9, '100%暴击率,暴伤+100%时期望=2*base');
assertClose(eng.expectedDamage(100, 0.5, 1.0), 150, 1e-9, '50%暴击,+100%暴伤期望=150');
assertClose(eng.expectedDamage(100, 0.3, 1.5), 145, 1e-9, '30%/150%期望=145');

console.log('\n=== 边际收益 ===');
assertClose(eng.marginalGainRate(100, 0.2, 1.0, 0.05), 5, 1e-9, '+5%暴击率, cd=1 → +5');
assertClose(eng.marginalGainDamage(100, 0.2, 1.0, 0.10), 2, 1e-9, '+10%暴伤, cr=0.2 → +2');
assertClose(eng.marginalGainRate(100, 0.5, 2.0, 0.05), 10, 1e-9, '+5%暴击率, cd=2 → +10');
assertClose(eng.marginalGainDamage(100, 0.5, 2.0, 0.10), 5, 1e-9, '+10%暴伤, cr=0.5 → +5');

console.log('\n=== 暴击率溢出 ===');
assertClose(eng.marginalGainRate(100, 0.98, 2.0, 0.05), 4, 1e-9, '98%+5% 只能涨2% → 100*0.02*2=4');
assertClose(eng.marginalGainRate(100, 1.0, 2.0, 0.05), 0, 1e-9, '满暴击率时+5%率毫无收益');

console.log('\n=== 推荐函数 ===');
var r1 = eng.recommend(100, 0.1, 0.5, 0.05, 0.10);
assert(r1.choice === 'rate', '低暴击低暴伤 → 选暴击率');
// cr=0.6, cd=0.8 → cd/cr=1.33 < 2, 暴伤滞后, 该补暴伤
var r2 = eng.recommend(100, 0.6, 0.8, 0.05, 0.10);
assert(r2.choice === 'damage', '暴伤滞后于1:2比例 → 选暴击伤害');
var r3 = eng.recommend(100, 0.5, 1.0, 0.05, 0.10);
assert(r3.choice === 'equal', 'cd=2*cr 且 dCd=2*dCr → 等价');

console.log('\n=== 1:2 黄金比例（dCr=5%, dCd=10%）===');
assertClose(eng.equalRatio(0.05, 0.10), 2.0, 1e-9, 'dCd/dCr=2');
assertClose(eng.crossoverCd(0.3, 0.05, 0.10), 0.6, 1e-9, 'cr=30%时, 临界cd=60%');
assertClose(eng.crossoverCd(0.5, 0.05, 0.10), 1.0, 1e-9, 'cr=50%时, 临界cd=100%');

console.log('\n=== 蒙特卡洛 vs 理论 ===');
// 固定种子的简易 LCG
function seededRng(seed) {
  var s = seed;
  return function() { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}
var rng = seededRng(42);
var hits = eng.simulateHits(100, 0.3, 1.5, 100000, rng);
var mean = eng.arrayMean(hits);
var theoExp = eng.expectedDamage(100, 0.3, 1.5); // 145
assertClose(mean, theoExp, 1.5, '10万次模拟均值收敛到理论值145');

var std = eng.arrayStd(hits);
var theoStd = eng.damageStd(100, 0.3, 1.5); // 100*1.5*sqrt(0.3*0.7) ≈ 68.7
assertClose(std, theoStd, 1.0, '10万次模拟标准差收敛到理论值68.7');

console.log('\n=== 同期望、不同方差 ===');
// 方案A: 50%/100%, 方案B: 25%/200%, 期望都是 150
var stdA = eng.damageStd(100, 0.5, 1.0);  // = 50
var stdB = eng.damageStd(100, 0.25, 2.0); // = 100*2*sqrt(0.1875) ≈ 86.6
assertClose(eng.expectedDamage(100, 0.5, 1.0), eng.expectedDamage(100, 0.25, 2.0), 1e-9, '两方案期望相等');
assert(stdB > stdA * 1.5, '高暴伤低暴击的方案方差显著更大');

console.log('\n=== Boss 战模拟 ===');
var rngBoss = seededRng(7);
// 期望相同时，谁更稳？跑 1000 局看击杀次数的标准差
var killsA = [], killsB = [];
for (var i = 0; i < 500; i++) killsA.push(eng.hitsToKill(100, 0.5, 1.0, 1500, rngBoss));
for (var j = 0; j < 500; j++) killsB.push(eng.hitsToKill(100, 0.25, 2.0, 1500, rngBoss));
var meanA = eng.arrayMean(killsA), meanB = eng.arrayMean(killsB);
assert(Math.abs(meanA - meanB) < 1, '两方案平均击杀次数接近(' + meanA.toFixed(2) + ' vs ' + meanB.toFixed(2) + ')');
var stdKillsA = eng.arrayStd(killsA), stdKillsB = eng.arrayStd(killsB);
assert(stdKillsB > stdKillsA, '高方差方案的击杀次数波动更大(' + stdKillsA.toFixed(2) + ' vs ' + stdKillsB.toFixed(2) + ')');

console.log('\n=== 直方图 ===');
var hist = eng.histogram([100, 100, 100, 250, 250], 5);
assert(hist.counts.length === 5, '5个桶');
var total = hist.counts.reduce(function(a,b){return a+b;}, 0);
assert(total === 5, '所有样本被计入');

console.log('\n=== 第 4 关页面数据准确性 ===');
// 用固定种子跑模拟器用的同一个函数，对照页面显示的数字
function seededRng2(seed) {
  var s = seed;
  return function() { s = (s * 1664525 + 1013904223) & 0xffffffff; return ((s >>> 0) / 0xffffffff); };
}
var rngPage = seededRng2(2024);
var pageA = eng.simulateHits(100, 0.5, 1.0, 10000, rngPage);
var pageB = eng.simulateHits(100, 0.25, 2.0, 10000, rngPage);
var pageExpA = eng.arrayMean(pageA);
var pageExpB = eng.arrayMean(pageB);
var pageStdA = eng.arrayStd(pageA);
var pageStdB = eng.arrayStd(pageB);
assertClose(pageExpA, 150, 1.5, '方案A 1万次模拟均值 ≈ 150（页面展示数字）');
assertClose(pageExpB, 150, 1.5, '方案B 1万次模拟均值 ≈ 150');
assertClose(pageStdA, 50, 1.5, '方案A 1万次模拟标准差 ≈ 50');
assertClose(pageStdB, 86.6, 2.0, '方案B 1万次模拟标准差 ≈ 86.6');
var ratioV = (pageStdB * pageStdB) / (pageStdA * pageStdA);
assertClose(ratioV, 3.0, 0.4, 'B/A 方差比 ≈ 3.0');

// 直方图边界与桶数
var histA = eng.histogram(pageA, 16);
var histB = eng.histogram(pageB, 16);
assert(histA.counts.length === 16, '方案A直方图 16 个桶');
assert(histB.counts.length === 16, '方案B直方图 16 个桶');
assertClose(histA.min, 100, 1e-9, '方案A 直方图 min = 100');
assertClose(histA.max, 200, 1e-9, '方案A 直方图 max = 200');
assertClose(histB.min, 100, 1e-9, '方案B 直方图 min = 100');
assertClose(histB.max, 300, 1e-9, '方案B 直方图 max = 300');
// 方案A只在100/200两个值上有样本，所以直方图两侧桶应有大计数，中间桶应为 0
var peakA = Math.max.apply(null, histA.counts);
var midA = 0;
for (var i = 3; i < 13; i++) midA += histA.counts[i];
assert(peakA > 4000, '方案A 直方图峰值 > 4000（100 或 200 附近 5000 次）');
assert(midA === 0, '方案A 直方图中间桶全为 0（伤害只取 100 或 200）');
var peakB = Math.max.apply(null, histB.counts);
var midB = 0;
for (var j = 3; j < 13; j++) midB += histB.counts[j];
assert(peakB > 6000, '方案B 直方图峰值 > 6000（100 附近 7500 次）');
assert(midB === 0, '方案B 直方图中间桶全为 0（伤害只取 100 或 300）');

console.log('\n=== 决策网格 ===');
var grid = eng.decisionGrid(0.1, 3.0, 0.5, 0.05, 0.10);
assert(grid.crs.length > 5 && grid.cds.length > 5, '网格有效');
// 0% 暴击率时，加暴伤毫无意义，必选暴击率
assert(grid.choices[0][grid.cds.indexOf(0.5)] === 'rate', '0%暴击率时必选暴击率');
// 100% 暴击率时，暴击率溢出归零，必选暴伤（除非 dCd=0）
var lastRow = grid.choices[grid.choices.length - 1];
assert(lastRow[lastRow.length - 1] === 'damage', '满暴击高暴伤时必选暴伤');

console.log('\n=========================');
console.log('Passed: ' + passed + ' | Failed: ' + failed);
console.log('=========================');
if (failed > 0) process.exit(1);

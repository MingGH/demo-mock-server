// ========== 选择过载实验室 — 单元测试 ==========
// 运行：node pages/choice-overload/choice-overload.test.js

var engine = require('./engine.js');
var passed = 0;
var failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log('  ✅ ' + msg);
  } else {
    failed++;
    console.log('  ❌ ' + msg);
  }
}

function approxEqual(a, b, eps) {
  if (typeof eps === 'undefined') eps = 0.01;
  return Math.abs(a - b) < eps;
}

// ── hickPredict ──
console.log('\n🧪 hickPredict');
assert(approxEqual(engine.hickPredict(1, 200, 150), 200 + 150 * Math.log2(2), 0.1), 'n=1 → RT ≈ 350');
assert(approxEqual(engine.hickPredict(3, 200, 150), 200 + 150 * Math.log2(4), 0.1), 'n=3 → RT ≈ 500');
assert(approxEqual(engine.hickPredict(7, 200, 150), 200 + 150 * Math.log2(8), 0.1), 'n=7 → RT ≈ 650');
assert(engine.hickPredict(0, 200, 150) === 200, 'n=0 → RT = a');
assert(engine.hickPredict(1) > 0, '默认参数正常工作');

// ── hickFit ──
console.log('\n🧪 hickFit');
// 完美数据
var perfectData = [2, 4, 8, 16, 32].map(function(n) {
  return { n: n, rt: 200 + 150 * Math.log2(n + 1) };
});
var fit = engine.hickFit(perfectData);
assert(fit.r2 > 0.99, '完美数据 R² > 0.99，实际 ' + fit.r2.toFixed(4));
assert(approxEqual(fit.a, 200, 1), '拟合 a ≈ 200，实际 ' + fit.a.toFixed(1));
assert(approxEqual(fit.b, 150, 1), '拟合 b ≈ 150，实际 ' + fit.b.toFixed(1));

// 不足数据
var emptyFit = engine.hickFit([]);
assert(emptyFit.r2 === 0, '空数据返回 r2=0');
var singleFit = engine.hickFit([{ n: 2, rt: 300 }]);
assert(singleFit.r2 === 0, '单点数据返回 r2=0');

// ── fatigueQuality ──
console.log('\n🧪 fatigueQuality');
assert(engine.fatigueQuality(0, 10) === 1, '第 0 轮质量 = 1');
assert(engine.fatigueQuality(10, 10) <= 0.5, '最后一轮质量 ≤ 0.5');
assert(engine.fatigueQuality(5, 10) > engine.fatigueQuality(8, 10), '第 5 轮质量 > 第 8 轮');
assert(engine.fatigueQuality(1, 10) > 0.9, '第 1 轮质量 > 0.9');

// ── isImpulsive ──
console.log('\n🧪 isImpulsive');
assert(engine.isImpulsive(200) === true, '200ms 是冲动选择');
assert(engine.isImpulsive(500) === false, '500ms 不是冲动选择');
assert(engine.isImpulsive(400) === false, '400ms 边界不算冲动');
assert(engine.isImpulsive(399) === true, '399ms 算冲动');

// ── isTimeout ──
console.log('\n🧪 isTimeout');
assert(engine.isTimeout(5000, 5000) === true, '刚好超时');
assert(engine.isTimeout(4999, 5000) === false, '差 1ms 不超时');
assert(engine.isTimeout(6000, 5000) === true, '超时');

// ── choiceOverloadIndex ──
console.log('\n🧪 choiceOverloadIndex');
assert(engine.choiceOverloadIndex({ hickScore: 100, fatigueScore: 100, jamScore: 100 }) === 100, '全满 = 100');
assert(engine.choiceOverloadIndex({ hickScore: 0, fatigueScore: 0, jamScore: 0 }) === 0, '全零 = 0');
var mid = engine.choiceOverloadIndex({ hickScore: 50, fatigueScore: 50, jamScore: 50 });
assert(mid === 50, '均 50 = 50，实际 ' + mid);

// ── overloadGrade ──
console.log('\n🧪 overloadGrade');
assert(engine.overloadGrade(85).grade === 'S', '85 → S');
assert(engine.overloadGrade(65).grade === 'A', '65 → A');
assert(engine.overloadGrade(45).grade === 'B', '45 → B');
assert(engine.overloadGrade(20).grade === 'C', '20 → C');
assert(engine.overloadGrade(0).grade === 'C', '0 → C');
assert(engine.overloadGrade(100).grade === 'S', '100 → S');

// ── generateHickRound ──
console.log('\n🧪 generateHickRound');
var round2 = engine.generateHickRound(2);
assert(round2.options.length === 2, '2 个选项');
assert(round2.targetIndex >= 0 && round2.targetIndex < 2, '目标索引合法');

var round32 = engine.generateHickRound(32);
assert(round32.options.length === 32, '32 个选项');
assert(round32.targetIndex >= 0 && round32.targetIndex < 32, '目标索引合法');

// 每个选项有 color 和 label
assert(round2.options[0].color && round2.options[0].label, '选项有 color 和 label');

// ── shuffleArray ──
console.log('\n🧪 shuffleArray');
var arr = [1, 2, 3, 4, 5];
var shuffled = engine.shuffleArray(arr);
assert(shuffled.length === 5, '长度不变');
assert(arr.join(',') === '1,2,3,4,5', '原数组不变');
var sorted = shuffled.slice().sort(function(a, b) { return a - b; });
assert(sorted.join(',') === '1,2,3,4,5', '元素不变');

// ── generateJamShelf ──
console.log('\n🧪 generateJamShelf');
var shelf6 = engine.generateJamShelf(6);
assert(shelf6.length === 6, '6 种果酱');
assert(shelf6[0].name && shelf6[0].color && shelf6[0].desc, '果酱有 name/color/desc');

var shelf24 = engine.generateJamShelf(24);
assert(shelf24.length === 24, '24 种果酱');

// 名称不重复
var names = shelf24.map(function(j) { return j.name; });
var unique = names.filter(function(n, i) { return names.indexOf(n) === i; });
assert(unique.length === 24, '24 种果酱名称不重复');

// ── 总结 ──
console.log('\n' + '='.repeat(40));
console.log('通过: ' + passed + '  失败: ' + failed);
if (failed > 0) process.exit(1);
console.log('✅ 全部通过');

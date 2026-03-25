// 贝叶斯猜数字 — 单元测试
var logic = require('./bayes-guess-logic.js');
var passed = 0, failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log('  ✅ ' + msg); }
  else { failed++; console.log('  ❌ ' + msg); }
}

function approx(a, b, eps) { return Math.abs(a - b) < (eps || 0.01); }

console.log('\n=== 贝叶斯猜数字 测试 ===\n');

// 1. createGame
console.log('--- createGame ---');
var g = logic.createGame(10, 0.2);
assert(g.N === 10, 'N = 10');
assert(g.lieProb === 0.2, 'lieProb = 0.2');
assert(g.secret >= 1 && g.secret <= 10, 'secret in [1,10]');
assert(g.prior.length === 10, 'prior length = 10');
assert(approx(g.prior[0], 0.1), '均匀先验 = 0.1');
var sum = 0; for (var i = 0; i < 10; i++) sum += g.prior[i];
assert(approx(sum, 1.0), '先验概率之和 = 1');

// 2. generateHint
console.log('\n--- generateHint ---');
var g2 = logic.createGame(10, 0);
g2.secret = 5;
var h1 = logic.generateHint(g2, 5);
assert(h1.hint === 'correct', '猜中返回 correct');
assert(h1.truthful === true, '猜中时 truthful = true');
var h2 = logic.generateHint(g2, 3);
assert(h2.hint === 'low', 'lieProb=0 时猜低了返回 low');
var h3 = logic.generateHint(g2, 8);
assert(h3.hint === 'high', 'lieProb=0 时猜高了返回 high');

// lieProb=1 时总是说谎
var g3 = logic.createGame(10, 1.0);
g3.secret = 5;
var lieCount = 0;
for (var i = 0; i < 100; i++) {
  var h = logic.generateHint(g3, 3);
  if (h.hint === 'high') lieCount++;
}
assert(lieCount === 100, 'lieProb=1 时 100% 说谎');

// 3. getLikelihood
console.log('\n--- getLikelihood ---');
// secret=5, guess=3, hint=low (真话), lieProb=0.2
assert(approx(logic.getLikelihood(5, 3, 'low', 0.2), 0.8), 'P(low|secret=5,guess=3) = 0.8');
assert(approx(logic.getLikelihood(5, 3, 'high', 0.2), 0.2), 'P(high|secret=5,guess=3) = 0.2');
// secret=2, guess=3, hint=high (真话)
assert(approx(logic.getLikelihood(2, 3, 'high', 0.2), 0.8), 'P(high|secret=2,guess=3) = 0.8');
assert(approx(logic.getLikelihood(2, 3, 'low', 0.2), 0.2), 'P(low|secret=2,guess=3) = 0.2');
// secret=guess, hint=correct
assert(logic.getLikelihood(3, 3, 'correct', 0.2) === 1, 'P(correct|secret=guess) = 1');
assert(logic.getLikelihood(3, 3, 'high', 0.2) === 0, 'P(high|secret=guess) = 0');
// secret!=guess, hint=correct
assert(logic.getLikelihood(5, 3, 'correct', 0.2) === 0, 'P(correct|secret!=guess) = 0');

// 4. bayesUpdate
console.log('\n--- bayesUpdate ---');
var prior = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
// 猜 5，提示 low（猜低了），lieProb=0
var updated = logic.bayesUpdate(prior, 10, 5, 'low', 0);
// 无谎言时，low 意味着 secret > 5，所以 6-10 概率应该均分
var sumLow = 0, sumHigh = 0;
for (var i = 0; i < 5; i++) sumLow += updated[i]; // 1-5
for (var i = 5; i < 10; i++) sumHigh += updated[i]; // 6-10
assert(approx(sumLow, 0, 0.01), 'lieProb=0, low提示: 1-5 概率归零');
assert(approx(sumHigh, 1, 0.01), 'lieProb=0, low提示: 6-10 概率为1');

// 有谎言时，概率不完全归零
var updated2 = logic.bayesUpdate(prior, 10, 5, 'low', 0.2);
var sumLow2 = 0;
for (var i = 0; i < 4; i++) sumLow2 += updated2[i]; // 1-4 (not 5, since 5=guess → P=0 for non-correct)
assert(sumLow2 > 0, 'lieProb=0.2 时低区间仍有概率');
assert(sumLow2 < 0.5, '但概率较小');

// 归一化检查
var s = 0; for (var i = 0; i < 10; i++) s += updated2[i];
assert(approx(s, 1.0), '更新后概率之和 = 1');

// 5. getMapEstimate
console.log('\n--- getMapEstimate ---');
var p = [0, 0, 0, 0.7, 0.1, 0.1, 0.05, 0.03, 0.01, 0.01];
var map = logic.getMapEstimate(p);
assert(map.value === 4, 'MAP = 4');
assert(approx(map.prob, 0.7), 'MAP prob = 0.7');

// 6. getEntropy
console.log('\n--- getEntropy ---');
var uniform = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
var H = logic.getEntropy(uniform);
assert(approx(H, Math.log2(10), 0.01), '均匀分布熵 = log2(10) ≈ 3.32');
var certain = [0, 0, 0, 1, 0, 0, 0, 0, 0, 0];
assert(approx(logic.getEntropy(certain), 0), '确定分布熵 = 0');

// 7. playStep 集成测试
console.log('\n--- playStep ---');
var g4 = logic.createGame(10, 0);
g4.secret = 7;
var r = logic.playStep(g4, 3);
assert(r.hint === 'low', '猜3 secret=7 → low');
assert(r.won === false, '未猜中');
assert(g4.history.length === 1, '历史记录 +1');
var r2 = logic.playStep(g4, 7);
assert(r2.hint === 'correct', '猜中');
assert(r2.won === true, 'won = true');

// 8. 收敛性测试：多次更新后应收敛到真实值（跑多次取最好结果避免随机性）
console.log('\n--- 收敛性测试 ---');
var converged = false;
for (var trial = 0; trial < 5; trial++) {
  var g5 = logic.createGame(20, 0.2);
  g5.secret = 13;
  var prior5 = g5.prior.slice();
  for (var step = 0; step < 40; step++) {
    var guess = logic.getBestGuess(prior5, 20, 0.2);
    var hint = logic.generateHint(g5, guess);
    if (hint.hint === 'correct') break;
    prior5 = logic.bayesUpdate(prior5, 20, guess, hint.hint, 0.2);
  }
  var finalMap = logic.getMapEstimate(prior5);
  if (Math.abs(finalMap.value - 13) <= 3 && finalMap.prob > 0.05) { converged = true; break; }
}
assert(converged, '40步后MAP收敛到真实值附近(5次机会)');

// 9. simulateAIGame
console.log('\n--- AI模拟 ---');
var steps = logic.simulateAIGame(20, 0.2);
assert(steps > 0 && steps <= 200, 'AI在200步内猜中(N=20): ' + steps + '步');

var steps2 = logic.simulateAIGame(50, 0);
assert(steps2 <= 20, 'lieProb=0, N=50 应在20步内: ' + steps2 + '步');

console.log('\n=============================');
console.log('通过: ' + passed + '  失败: ' + failed);
console.log('=============================\n');
process.exit(failed > 0 ? 1 : 0);

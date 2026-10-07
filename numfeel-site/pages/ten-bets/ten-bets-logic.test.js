/**
 * 十连注 逻辑层单元测试（node 直跑，全过 exit 0）
 * 覆盖：开局随机位、条件概率、下注结算、非法输入、
 *       四种流派的解析基准（保底 / 期望 / 拉平）逐位复算。
 */
'use strict';
var L = require('./ten-bets-logic.js');

var passed = 0;
var failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('✅ ' + msg); }
  else { failed++; console.error('❌ ' + msg); }
}
function assertClose(actual, expected, tol, msg) {
  var ok = Math.abs(actual - expected) <= tol;
  if (ok) { passed++; console.log('✅ ' + msg + ' (' + actual + ')'); }
  else { failed++; console.error('❌ ' + msg + ' 期望 ' + expected + ' 实际 ' + actual); }
}
/** 固定中签位的局（用于逐位复算） */
function gameAt(winner) {
  var g = L.createGame(function () { return 0.123456; });
  g.winner = winner;
  return g;
}
function throwCheck(fn, msg) {
  try { fn(); failed++; console.error('❌ ' + msg + '（未抛异常）'); }
  catch (e) { passed++; console.log('✅ ' + msg + ' → ' + e.message); }
}

// ── 开局 ──
var g = L.createGame(function () { return 0.42; });
assert(g.winner === 5, 'rng=0.42 → 中签位 = 5');
assert(g.round === 1 && g.capital === 100 && !g.over, '初始态：第 1 注 / 100 元 / 未结束');

// ── 条件概率 ──
assertClose(L.nextWinProbability(1), 0.1, 1e-12, '第 1 注中签概率 10%');
assertClose(L.nextWinProbability(9), 0.5, 1e-12, '第 9 注（前 8 空）中签概率 50%');
assertClose(L.nextWinProbability(10), 1, 1e-12, '第 10 注（前 9 空）必中');
assert(L.nextWinProbability(11) === 0, '越界轮次概率 0');

// ── 下注结算：输 ──
var s1 = L.placeBet(gameAt(3), 30);
assert(s1.capital === 70 && s1.round === 2 && !s1.over, '押 30 未中 → 剩 70，进第 2 注');
var s2 = L.placeBet(s1, 70);
assert(s2.capital === 0 && s2.over && !s2.won, '再押 70 归零 → 提前结束，未中签');
assert(s2.history.length === 2 && s2.history[1].capitalAfter === 0, '历史记录资金轨迹正确');
assert(s1.capital === 70, 'placeBet 不可变：旧状态未被修改');

// ── 下注结算：赢 ──
var g2 = gameAt(2);
var w1 = L.placeBet(g2, 40);            // 第 1 注未中 → 剩 60
var w = L.placeBet(w1, 40);             // 第 2 注中签
assert(w.capital === 100 - 40 - 40 + 400 && w.over && w.won, '第 2 注中签：两注各 40，收 400，结算 420');
assert(w.history[1].won === true && w.history[0].won === false, '历史记录中签标记正确');

// ── 非法输入 ──
throwCheck(function () { L.placeBet(w, 10); }, '结束局再押 → 抛异常');
throwCheck(function () { L.placeBet(gameAt(1), 0); }, '押 0 元 → 抛异常');
throwCheck(function () { L.placeBet(gameAt(1), -5); }, '押负数 → 抛异常');
throwCheck(function () { L.placeBet(gameAt(1), 999); }, '押超资金 → 抛异常');
throwCheck(function () { L.placeBet(gameAt(1), NaN); }, '押 NaN → 抛异常');

// ── 计划生成 ──
var up = L.uniformPlan(100);
assertClose(up.reduce(function (a, b) { return a + b; }, 0), 100, 1e-9, '固定注计划总额 = 100');
assertClose(up[0], 10, 1e-9, '固定注每注 10 元');
var pp = L.probePlan(100);
assertClose(pp[0], 1, 1e-12, '探针流首注 1 元');
assertClose(pp[9], 91, 1e-9, '探针流第 10 注全押 91 元');
throwCheck(function () { L.probePlan(5); }, '资金不足 10 元时探针流 → 抛异常');
var ep = L.equalizePlan(100);
assertClose(ep.reduce(function (a, b) { return a + b; }, 0), 100, 1e-9, '均注流计划总额 = 100');
assertClose(ep[0], 5.948, 0.001, '均注流首注 ≈ 5.948 元');
assertClose(ep[1] / ep[0], 10 / 9, 1e-9, '均注流相邻注额比 = 10/9');

// ── 梭哈派逐位复算 ──
var allIn = [];
for (var k = 1; k <= 10; k++) allIn.push(L.autoPlay(gameAt(k), L.allInPlan(100)).capital);
assert(allIn[0] === 1000, '梭哈派中在第 1 注 → 1000');
assert(allIn.slice(1).every(function (c) { return c === 0; }), '梭哈派中在其余位 → 归零');
assertClose(allIn.reduce(function (a, b) { return a + b; }, 0) / 10, L.BENCHMARKS.allInEV, 1e-9, '梭哈派期望 = 100');

// ── 固定注逐位复算 ──
var uni = [];
for (var k2 = 1; k2 <= 10; k2++) uni.push(L.autoPlay(gameAt(k2), L.uniformPlan(100)).capital);
assertClose(Math.min.apply(null, uni), 100, 1e-9, '固定注保底 = 100（中在第 10 注）');
assertClose(uni[0], 190, 1e-9, '固定注中在第 1 注 → 190');
assertClose(uni.reduce(function (a, b) { return a + b; }, 0) / 10, L.BENCHMARKS.uniformEV, 1e-9, '固定注期望 = 145');

// ── 探针流逐位复算 ──
var pro = [];
for (var k3 = 1; k3 <= 10; k3++) pro.push(L.autoPlay(gameAt(k3), L.probePlan(100)).capital);
assertClose(pro[9], 910, 1e-9, '探针流中在第 10 注 → 910');
assertClose(Math.min.apply(null, pro), 101, 1e-9, '探针流保底 = 101（中在第 9 注）');
assertClose(pro.reduce(function (a, b) { return a + b; }, 0) / 10, L.BENCHMARKS.probeEV, 1e-9, '探针流期望 = 185.5');

// ── 均注流逐位复算：所有结局拉平 ──
var eq = [];
for (var k4 = 1; k4 <= 10; k4++) eq.push(L.autoPlay(gameAt(k4), L.equalizePlan(100)).capital);
var eqMin = Math.min.apply(null, eq);
var eqMax = Math.max.apply(null, eq);
assertClose(eqMax - eqMin, 0, 0.01, '均注流：10 个中签位结局全部拉平（极差 ≈ 0）');
assertClose(eqMin, L.BENCHMARKS.equalize, 0.01, '均注流保底 = 期望 ≈ 153.53');
assertClose(L.BENCHMARKS.equalize, 153.53, 0.01, '保底天花板解析值 ≈ 153.53');

// ── 批量模拟 ──
function seqRng(vals) {          // 依次吐出中签位用的随机数
  var i = 0;
  return function () { return vals[i++ % vals.length]; };
}
var b1 = L.simulateBatch(100, 5, seqRng([0.05]));      // 每局中签位=1
assert(b1.games === 5 && b1.wins === 5 && b1.busts === 0, '押 100 且中在第 1 位：5 局全胜');
assertClose(b1.avg, 1000, 1e-9, '全胜平均结算 = 1000');
assertClose(b1.max, 1000, 1e-9, '最高 1000');
var b2 = L.simulateBatch(100, 5, seqRng([0.5]));       // 每局中签位=6
assert(b2.wins === 0 && b2.busts === 5, '押 100 中签位=6：第 1 注就爆仓，5 局全归零');
assertClose(b2.avg, 0, 1e-9, '全爆仓平均结算 = 0');
var b3 = L.simulateBatch(60, 4, seqRng([0.25]));       // 中签位=3：押 60 后剩 40，第 2 注押 40 爆仓
assert(b3.busts === 4 && b3.min === 0, '押 60 中签位=3：第 2 注押剩余 40 打水漂归零');
var b4 = L.simulateBatch(60, 4, seqRng([0.15]));       // 中签位=2：第 2 注押 40 中 10 倍
assertClose(b4.max, 400, 1e-9, '押 60 中签位=2：第 2 注押 40 中 400');
var b5 = L.simulateBatch(10, 2000, seqRng([0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95]));
assert(b5.busts === 0, '押 10 元永不爆仓（2000 局）');
assertClose(b5.avg, L.BENCHMARKS.uniformEV, 0.5, '押 10 元平均结算 ≈ 固定注期望 145');
assert(b5.wins + b5.busts === 2000, '局数守恒');
var histSum = b5.hist.reduce(function (a, h) { return a + h.count; }, 0);
assert(histSum === 2000, '直方图分桶总数 = 局数');
throwCheck(function () { L.simulateBatch(0, 10); }, '批量模拟押 0 元 → 抛异常');
throwCheck(function () { L.simulateBatch(10, 0); }, '批量模拟 0 局 → 抛异常');

// ── autoPlay 稳健性 ──
var stubborn = L.autoPlay(gameAt(6), function (round, st) { return st.capital / 3; });
assert(stubborn.won, '函数式计划（每注 1/3 资金）能正常打完并中签');
assertClose(stubborn.capital, 100 * Math.pow(2 / 3, 5) * 4, 1e-9, '每注 1/3 资金：中在第 6 注结算 = 100×(2/3)^5×4 ≈ 52.67（温和均摊会摊薄收益）');
throwCheck(function () { L.autoPlay(gameAt(6), function () { return 0; }); }, '计划给出非正金额 → 抛异常');

console.log('');
console.log('通过 ' + passed + ' / 失败 ' + failed);
if (failed > 0) { process.exit(1); }

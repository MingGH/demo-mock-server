// 黑白棋核心算法测试
// 运行: node pages/black-white-stones/black-white-stones.test.js

const {
  calcWinProb, simulateDraw, monteCarlo, calcAllProbs, findOptimal,
  TOTAL_BLACK, TOTAL_WHITE, TOTAL
} = require('./engine.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log('  \u2713 ' + msg); }
  else { failed++; console.log('  \u2717 ' + msg); }
}

function assertEqual(actual, expected, msg) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log('  \u2713 ' + msg); }
  else { failed++; console.log('  \u2717 ' + msg + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')'); }
}

function assertClose(actual, expected, epsilon, msg) {
  const ok = Math.abs(actual - expected) <= epsilon;
  if (ok) { passed++; console.log('  \u2713 ' + msg); }
  else { failed++; console.log('  \u2717 ' + msg + ' (expected ~' + expected + ', got ' + actual + ')'); }
}

// ── calcWinProb ──
console.log('\n[calcWinProb]');

const r1 = calcWinProb(25, 25);
assertClose(r1.winProb, 0.5, 0.0001, '公平分配(25,25) 胜率 = 50%');
assert(r1.valid, '公平分配(25,25) 合法');
assertEqual(r1.t1, 50, '碗A合计 = 50');
assertEqual(r1.t2, 50, '碗B合计 = 50');

const r2 = calcWinProb(1, 0);
assertClose(r2.winProb, 0.5 * 1 + 0.5 * (49/99), 0.0001, '最优分配(1,0) 胜率 = 74.747%');
assert(r2.valid, '最优分配(1,0) 合法');

const r3 = calcWinProb(50, 0);
assertClose(r3.winProb, 0.5 * 1 + 0.5 * 0, 0.0001, '极端(50,0) 胜率 = 50%');
assert(r3.valid, '极端(50,0) 合法');

const r4 = calcWinProb(25, 0);
assertClose(r4.winProb, 0.5 * 1 + 0.5 * (25/75), 0.0001, '(25,0) 胜率 = 66.67%');

const r5 = calcWinProb(25, 50);
assertClose(r5.winProb, 0.5 * (25/75) + 0.5 * (25/25), 0.0001, '(25,50) 胜率 = 66.67%');

// 边界：某碗为空（valid=false 时胜率公式为 fallback 值，不参与游戏）
const r6 = calcWinProb(50, 50);
assert(!r6.valid, '(50,50) 碗B为空 → invalid');

const r7 = calcWinProb(0, 0);
assert(!r7.valid, '(0,0) 碗A为空 → invalid');

// 边界：某碗全白
const r8 = calcWinProb(0, 50);
assert(r8.valid, '(0,50) 两碗都有棋子 → valid');
assertClose(r8.probA, 0, 0.0001, '(0,50) probA = 0/50 = 0');
assertClose(r8.probB, 1, 0.0001, '(0,50) probB = 50/50 = 1 (B全是黑子)');

// 边界：某碗全黑
const r9 = calcWinProb(50, 0);
assertClose(r9.probA, 1, 0.0001, '(50,0) probA = 1 (A全是黑子)');
assertClose(r9.probB, 0, 0.0001, '(50,0) probB = 0 (B全是白子)');

// ── simulateDraw ──
console.log('\n[simulateDraw]');

const s1 = simulateDraw(25, 25);
assert(s1.valid, '公平分配 抽棋合法');
assert(['A', 'B'].includes(s1.bowl), '碗是A或B');
assert(['black', 'white'].includes(s1.stone), '棋子是黑或白');
assertEqual(typeof s1.win, 'boolean', 'win是布尔值');

const s2 = simulateDraw(50, 50);
assert(!s2.valid, '(50,50) 碗B为空 抽棋不合法');
assertEqual(s2.bowl, null, '不合法时 bowl = null');

// 纯黑碗必赢
let wins = 0;
for (let i = 0; i < 100; i++) {
  if (simulateDraw(1, 0).win) wins++;
}
assert(wins >= 50, '最优(1,0) 100次至少赢50次 (理论~74.7)');
assert(wins <= 95, '最优(1,0) 100次不会全赢');

// ── monteCarlo ──
console.log('\n[monteCarlo]');

const mc1 = monteCarlo(25, 25, 10000);
assert(mc1.valid, 'MC 公平分配 合法');
assertClose(mc1.rate, 0.5, 0.03, 'MC 公平分配 10000次 胜率 ≈ 50% (±3%)');

const mc2 = monteCarlo(1, 0, 10000);
assert(mc2.valid, 'MC 最优分配 合法');
assertClose(mc2.rate, 0.74747, 0.03, 'MC 最优分配 10000次 胜率 ≈ 74.7% (±3%)');

const mc3 = monteCarlo(50, 50, 1000);
assert(!mc3.valid, 'MC 碗为空 → invalid');
assertEqual(mc3.rate, 0, 'MC invalid 时 rate = 0');

// ── calcAllProbs ──
console.log('\n[calcAllProbs]');

const grid = calcAllProbs();
assertEqual(grid.length, TOTAL_BLACK + 1, '网格行数 = 51');
assertEqual(grid[0].length, TOTAL_WHITE + 1, '网格列数 = 51');
assertClose(grid[25][25], 0.5, 0.0001, 'grid[25][25] (公平) = 50%');
assertClose(grid[1][0], 0.74747, 0.0001, 'grid[1][0] (最优) = 74.7%');
assertClose(grid[0][1], 0.2525, 0.001, 'grid[0][1] (0黑1白) 很低');
assertClose(grid[50][0], 0.5, 0.0001, 'grid[50][0] (极端) = 50%');

// ── findOptimal ──
console.log('\n[findOptimal]');

const opt = findOptimal();
assertEqual(opt.b1, 1, '最优 b1 = 1');
assertEqual(opt.w1, 0, '最优 w1 = 0');
assertClose(opt.winProb, 0.74747, 0.0001, '最优胜率 = 74.747%');

// ── 结果 ──
console.log('\n' + '='.repeat(40));
console.log('PASS ' + passed + ' / ' + (passed + failed));
if (failed > 0) {
  console.log('FAIL ' + failed);
  process.exit(1);
} else {
  console.log('All tests passed!');
}

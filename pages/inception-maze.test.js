// inception-maze.test.js — 筑梦师测试核心算法单元测试
// 运行: node pages/inception-maze.test.js

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'inception-maze.html'), 'utf-8');
const scriptMatch = html.match(/\/\/ ── 核心算法（可独立测试） ──([\s\S]*?)\/\/ 导出给测试用/);
if (!scriptMatch) {
  console.error('❌ 无法从 HTML 中提取核心算法代码');
  process.exit(1);
}

const code = scriptMatch[1] + '\nreturn { createGrid, bfsSolve, calcMazeStats, countPassable, calcDetourRatio, calcDreamLevel };';
const { createGrid, bfsSolve, calcMazeStats, countPassable, calcDetourRatio, calcDreamLevel } = new Function(code)();

let passed = 0, failed = 0;

function assert(condition, msg) {
  if (condition) { console.log('  ✅ ' + msg); passed++; }
  else { console.error('  ❌ ' + msg); failed++; }
}
function assertEq(a, b, msg) {
  assert(a === b, msg + ' (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')');
}
function assertClose(a, b, eps, msg) {
  assert(Math.abs(a - b) <= eps, msg + ' (got ' + a.toFixed(4) + ', expected ~' + b + ')');
}

// ── createGrid ──
console.log('\n📦 createGrid');
(function() {
  const g = createGrid(5);
  assertEq(g.length, 5, '5行');
  assertEq(g[0].length, 5, '5列');
  assertEq(g[2][3], 0, '初始值为0（通路）');
})();
(function() {
  const g = createGrid(1);
  assertEq(g[0][0], 0, '1×1单格为通路');
})();

// ── bfsSolve ──
console.log('\n🔍 bfsSolve');

(function() {
  const g = createGrid(5);
  const r = bfsSolve(g, 0, 0, 4, 4);
  assert(r.found === true, '空5×5：能找到路径');
  assertEq(r.path.length, 9, '空5×5最短路径长度=9');
  assertEq(r.path[0][0], 0, '路径起点行=0');
  assertEq(r.path[r.path.length-1][0], 4, '路径终点行=4');
})();

(function() {
  const g = createGrid(5);
  g[0][0] = 1;
  const r = bfsSolve(g, 0, 0, 4, 4);
  assert(r.found === false, '起点是墙：找不到路径');
  assertEq(r.path.length, 0, '无路径时path为空数组');
})();

(function() {
  const g = createGrid(5);
  g[4][4] = 1;
  const r = bfsSolve(g, 0, 0, 4, 4);
  assert(r.found === false, '终点是墙：找不到路径');
})();

(function() {
  const g = createGrid(5);
  for (let c = 0; c < 5; c++) g[2][c] = 1;
  const r = bfsSolve(g, 0, 0, 4, 4);
  assert(r.found === false, '中间一行全墙：找不到路径');
  assert(r.visited.length > 0, '仍然有搜索过的节点');
})();

(function() {
  const g = createGrid(5);
  for (let r = 1; r < 5; r++) for (let c = 0; c < 4; c++) g[r][c] = 1;
  const r = bfsSolve(g, 0, 0, 4, 4);
  assert(r.found === true, '窄路：能找到路径');
  assertEq(r.path.length, 9, '窄路路径长度=9');
})();

(function() {
  const g = createGrid(30);
  const start = Date.now();
  const r = bfsSolve(g, 0, 0, 29, 29);
  const elapsed = Date.now() - start;
  assert(r.found === true, '30×30空网格：能找到路径');
  assert(elapsed < 100, '30×30搜索耗时<100ms (实际' + elapsed + 'ms)');
})();

// ── calcMazeStats ──
console.log('\n📊 calcMazeStats');

(function() {
  const g = createGrid(5);
  const s = calcMazeStats(g, 5);
  assertEq(s.wallCount, 0, '空网格墙数=0');
  assertEq(s.passable, 25, '可通行格子=25');
})();

(function() {
  const g = createGrid(4);
  g[1][1] = 1; g[2][2] = 1; g[3][0] = 1;
  const s = calcMazeStats(g, 4);
  assertEq(s.wallCount, 3, '3面墙');
  assertEq(s.passable, 13, '可通行格子=13');
})();

// ── calcDetourRatio ──
console.log('\n📐 calcDetourRatio');

// 5×5 空迷宫：最短路径=9，理论最短=(5-1)*2+1=9，倍数=1.0
assertClose(calcDetourRatio(9, 5), 1.0, 0.001, '5×5空迷宫倍数=1.0');
// 20×20：理论最短=(20-1)*2+1=39
assertClose(calcDetourRatio(39, 20), 1.0, 0.001, '20×20直线倍数=1.0');
assertClose(calcDetourRatio(78, 20), 2.0, 0.001, '20×20路径=78时倍数=2.0');
assertClose(calcDetourRatio(156, 20), 4.0, 0.001, '20×20路径=156时倍数=4.0');
// 空迷宫不应该得高分
assert(calcDetourRatio(9, 5) < 1.2, '空5×5迷宫倍数<1.2（不应得高分）');

// ── calcDreamLevel ──
console.log('\n🌟 calcDreamLevel');

assertEq(calcDreamLevel(1.0),  0, '倍数1.0=等级0（空迷宫）');
assertEq(calcDreamLevel(1.19), 0, '倍数1.19=等级0');
assertEq(calcDreamLevel(1.2),  1, '倍数1.2=等级1');
assertEq(calcDreamLevel(1.49), 1, '倍数1.49=等级1');
assertEq(calcDreamLevel(1.5),  2, '倍数1.5=等级2');
assertEq(calcDreamLevel(1.99), 2, '倍数1.99=等级2');
assertEq(calcDreamLevel(2.0),  3, '倍数2.0=等级3');
assertEq(calcDreamLevel(2.99), 3, '倍数2.99=等级3');
assertEq(calcDreamLevel(3.0),  4, '倍数3.0=等级4');
assertEq(calcDreamLevel(3.99), 4, '倍数3.99=等级4');
assertEq(calcDreamLevel(4.0),  5, '倍数4.0=等级5（Ariadne级）');
assertEq(calcDreamLevel(10.0), 5, '倍数10.0=等级5');

// 关键验证：空迷宫得0分，不是满分
console.log('\n🎯 关键验证：空迷宫不得高分');
(function() {
  const g = createGrid(20);
  const r = bfsSolve(g, 0, 0, 19, 19);
  const ratio = calcDetourRatio(r.path.length, 20);
  const level = calcDreamLevel(ratio);
  assertEq(level, 0, '空20×20迷宫等级=0（不画墙不得分）');
  assert(ratio < 1.01, '空迷宫绕路倍数≈1.0 (got ' + ratio.toFixed(3) + ')');
})();

// 连通性保证验证
console.log('\n🔒 连通性保证');

(function() {
  const g = createGrid(5);
  g[0][1] = 1;
  const r = bfsSolve(g, 0, 0, 4, 4);
  assert(r.found === true, '堵住(0,1)后仍有解');
})();

(function() {
  const g = createGrid(5);
  g[2][2] = 1;
  const r = bfsSolve(g, 0, 0, 4, 4);
  assert(r.found === true, '空迷宫中堵住中间格仍有解');
})();

// ── 汇总 ──
console.log('\n' + '─'.repeat(40));
console.log('通过: ' + passed + '  失败: ' + failed);
if (failed > 0) {
  console.error('\n❌ 有测试失败');
  process.exit(1);
} else {
  console.log('\n✅ 全部通过');
}

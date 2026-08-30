/**
 * SQL 图灵完备实验室 — 引擎单元测试
 * 运行：node pages/sql-turing-lab/sql-turing-lab.test.js
 */
'use strict';

const path = require('path');
const E = require(path.join(__dirname, 'engine.js'));

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('✅ ' + msg);
  } else {
    failed++;
    console.error('❌ ' + msg);
  }
}

function assertEq(actual, expected, msg) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log('✅ ' + msg);
  } else {
    failed++;
    console.error('❌ ' + msg + ' —— 期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual));
  }
}

// ── Demo 1：递归计数 ──
(function testCounter() {
  const sql = E.buildCounterSQL(5);
  assert(sql.includes('WITH RECURSIVE'), '计数 SQL 包含 WITH RECURSIVE');
  assert(sql.includes('i < 5'), '计数 SQL 终止条件为 i < 5');
  assertEq(E.parseCounterRows([{ i: 1 }, { i: 2 }, { i: 3 }]), [1, 2, 3], '解析计数结果');
  assertEq(E.parseCounterRows([]), [], '空结果返回空数组');
  assert(E.buildCounterSQL(0).includes('i < 1'), 'n=0 时退化为 1');
  assert(E.buildCounterSQL(-3).includes('i < 1'), '负数输入退化为 1');
  assert(!Number.isNaN(Number('1')), '数字转换正常');
})();

// ── Demo 2：曼德博集合 ──
(function testMandelbrotMath() {
  assertEq(E.mandelbrotIterations(0, 0, 50), 50, '原点属于集合，跑满迭代');
  assertEq(E.mandelbrotIterations(2, 0, 50), 2, 'c=2 快速逃逸（2 次迭代）');
  assertEq(E.mandelbrotIterations(0, 1, 50), 50, 'c=i 属于集合');
  const e = E.mandelbrotIterations(1, 1, 50);
  assert(e > 0 && e < 50, 'c=1+i 会逃逸（迭代数 ' + e + '）');
})();

(function testMandelbrotSQL() {
  const sql = E.buildMandelbrotSQL(20, 10, 30, -2, 1, -1.2, 1.2);
  assert(sql.includes('WITH RECURSIVE'), '曼德博 SQL 包含 WITH RECURSIVE');
  assert(sql.includes('zr * zr - zi * zi + cr'), '曼德博 SQL 含 z^2+c 迭代');
  assert(sql.includes('range(0, 20)'), '曼德博 SQL 宽度为 20');
  assert(sql.includes('range(0, 10)'), '曼德博 SQL 高度为 10');
  assert(sql.includes('iter < 30'), '曼德博 SQL 迭代上限 30');
  assert(sql.includes('GROUP BY px, py'), '曼德博 SQL 按像素聚合');
  const sql2 = E.buildMandelbrotSQL(1, 1, 30, -2, 1, -1.2, 1.2);
  assert(sql2.includes('range(0, 2)'), '宽度 <2 时退化为 2');
})();

(function testParseMandelbrotRows() {
  const rows = [
    { px: 0, py: 0, it: 5 },
    { px: 1, py: 0, it: 7 },
    { px: 0, py: 1, it: 9 },
    { px: 9, py: 9, it: 99 }, // 越界，应被丢弃
  ];
  const out = E.parseMandelbrotRows(rows, 2, 2);
  assertEq(out.length, 4, '输出长度为 w*h');
  assertEq(Array.from(out), [5, 7, 9, 0], '按 py*width+px 展开，越界丢弃');
})();

(function testEscapeColor() {
  const inSet = E.escapeColor(50, 50);
  assertEq(inSet, [6, 8, 26], '集合内部为深色');
  const start = E.escapeColor(0, 50);
  assertEq(start, [10, 22, 64], '逃逸起点颜色为第一个色标');
  const mid = E.escapeColor(25, 50);
  assert(mid.length === 3 && mid.every((v) => v >= 0 && v <= 255), '颜色分量都在 0..255');
})();

// ── Demo 3：生命游戏 ──
(function testLifeNext() {
  const blinker = [{ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }];
  const next = E.lifeNext(blinker);
  assertEq(next, [{ x: 0, y: -1 }, { x: 0, y: 0 }, { x: 0, y: 1 }], '闪烁器水平→垂直');
  const back = E.lifeNext(next);
  assertEq(back, blinker, '闪烁器垂直→水平（回到原状）');

  const glider = E.LIFE_PRESETS.glider;
  assertEq(glider.length, 5, '滑翔机由 5 个细胞组成');
  const g1 = E.lifeNext(glider);
  assertEq(g1.length, 5, '滑翔机演化一代仍是 5 个细胞');
  assert(g1.length === 5 && E.lifeNext(g1).length === 5, '滑翔机连续两代保持 5 个细胞');

  assertEq(E.lifeNext([]), [], '空棋盘演化仍为空');

  const pulsar = E.LIFE_PRESETS.pulsar;
  assertEq(pulsar.length, 48, '脉冲星由 48 个细胞组成');
  assertEq(new Set(pulsar.map((c) => c.x + ',' + c.y)).size, 48, '脉冲星无重复细胞');
  const pKey = (arr) => arr.map((c) => c.x + ',' + c.y).sort().join(';');
  assertEq(E.lifeNext(pulsar).length, 56, '脉冲星一代 56 细胞');
  assertEq(pKey(E.lifeNext(E.lifeNext(E.lifeNext(pulsar)))), pKey(pulsar), '脉冲星周期为 3');

  const dup = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
  assertEq(E.lifeNext(dup), [{ x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 }], '重复输入按去重后的棋盘演化');
  assertEq(E.dedupeCells(dup).length, 3, 'dedupeCells 去除重复坐标');
  assertEq(E.buildLifeSetupSQL(dup), E.buildLifeSetupSQL([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]), '建表 SQL 自动去重');
})();

(function testLifeSQL() {
  const setup = E.buildLifeSetupSQL([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
  assert(setup.includes('CREATE OR REPLACE TABLE board'), '棋盘初始化 SQL 建表');
  assert(setup.includes('(0, 0)') && setup.includes('(1, 1)'), '棋盘初始化 SQL 含活细胞');
  const emptySetup = E.buildLifeSetupSQL([]);
  assert(emptySetup.includes('WHERE false'), '空棋盘退化 SQL 不产生行');

  const next = E.buildLifeNextSQL();
  assert(next.includes('CROSS JOIN (VALUES (-1::INTEGER), (0), (1))'), '邻居展开含 8 方向');
  assert(next.includes('count(*)'), '邻居计数');
  assert(next.includes('c.n = 3'), '出生规则：恰好 3 个邻居');
  assert(next.includes('c.n = 2'), '存活规则：2 个邻居');
  assertEq(E.parseLifeRows([{ x: 1, y: 2 }]), [{ x: 1, y: 2 }], '解析生命游戏结果');
})();

// ── 汇总 ──
console.log('\n' + (failed === 0 ? '全部通过' : '存在失败') + `：${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

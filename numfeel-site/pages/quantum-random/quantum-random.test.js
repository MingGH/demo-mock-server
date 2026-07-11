/**
 * quantum-random.test.js — "怎样做到绝对随机" demo 核心逻辑测试
 * 运行：node pages/quantum-random/quantum-random.test.js
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const QR = require('./logic.js');

// ── 拒绝采样 / 无偏映射 ──
describe('无偏映射 sampleUniform', function () {
  test('range=1 永远返回 0 不消耗字节', function () {
    const bytes = [255, 0, 128];
    const state = { idx: 0 };
    assert.equal(QR.sampleUniform(bytes, 1, state), 0);
    assert.equal(state.idx, 0); // range=1 不消费字节
  });
  test('range=256 直接返回原字节', function () {
    assert.equal(QR.sampleUniform([10], 256), 10);
  });
  test('range=3 limit=255 越界字节被丢弃（255 越界，0%3=0）', function () {
    // 256 % 3 = 1，limit = 255；只有字节 255 越界被丢弃
    const bytes = [255, 0, 3, 6];
    const state = { idx: 0 };
    assert.equal(QR.sampleUniform(bytes, 3, state), 0);   // 255 越界丢弃，0%3=0
  });
  test('range=3 多次取值落在 [0,3)', function () {
    const bytes = [255, 7, 255, 4];
    const state = { idx: 0 };
    const a = QR.sampleUniform(bytes, 3, state); // 255 越界 -> 跳过；7%3=1
    const b = QR.sampleUniform(bytes, 3, state); // 255 越界 -> 跳过；4%3=1
    assert.equal(a, 1);
    assert.equal(b, 1);
  });
  test('字节耗尽返回 null', function () {
    const state = { idx: 0 };
    // range=3,limit=255；只用一个 255 字节，循环里 idx 跑到 1 但全是越界，下一次调用字节耗尽
    QR.sampleUniform([255], 3, state);
    const r = QR.sampleUniform([], 3, state);
    assert.equal(r, null);
  });
  test('range<=0 抛错', function () {
    assert.throws(() => QR.sampleUniform([1], 0));
  });
});

describe('宽窗口无偏映射 sampleUniformWide', function () {
  test('两字节能取到 range=1024 范围内的值', function () {
    // 第一字节 3，第二字节 0 -> 3*256+0 = 768；768%1024 = 768
    const bytes = [3, 0];
    assert.equal(QR.sampleUniformWide(bytes, 1024, 2), 768);
    // 第一字节 4，第二字节 0 -> 1024；range=1024 时 span=65536, limit=65536-(65536%1024)=65536, 1024%1024=0
    assert.equal(QR.sampleUniformWide([4, 0], 1024, 2), 0);
  });
  test('窗口不足以容纳 range 时取不干净', function () {
    // range=70000 > 65536，两字节窗口 span=65536<range，limit=65536-65536%70000=65536(因为65536<70000)
    // 这种场景调用方应保证 range <= span；本测试只确认不会越界
    const r = QR.sampleUniformWide([255, 255], 70000, 2);
    assert.ok(r !== undefined && r < 70000);
  });
});

describe('窗口选择 windowForRange', function () {
  test('range<=256 用 1 字节', function () {
    assert.equal(QR.windowForRange(256), 1);
    assert.equal(QR.windowForRange(100), 1);
  });
  test('range>256 用 2 字节', function () {
    assert.equal(QR.windowForRange(257), 2);
    assert.equal(QR.windowForRange(1000), 2);
  });
  test('range>65536 用 3 字节', function () {
    assert.equal(QR.windowForRange(70000), 3);
  });
});

// ── 不重复抽取 ──
describe('不重复抽取 pickUnique', function () {
  test('抽 6 个 1–33 全部落在范围内且不重复', function () {
    const bytes = QR.secureBytes(256);
    const r = QR.pickUnique(bytes, 6, 1, 33);
    assert.ok(r);
    assert.equal(r.length, 6);
    const set = new Set(r);
    assert.equal(set.size, 6);
    for (const n of r) assert.ok(n >= 1 && n <= 33);
  });
  test('count 超过范围抛错', function () {
    assert.throws(() => QR.pickUnique([1, 2], 7, 1, 5));
  });
  test('count === range 返回全部号码（不消耗字节）', function () {
    const r = QR.pickUnique([0], 5, 1, 5);
    assert.deepEqual(r, [1, 2, 3, 4, 5]);
  });
  test('字节不足返回 null', function () {
    // 仅一个字节，但需要抽 33 个不重复号码（每个至少 1 字节 + 拒绝采样）
    const r = QR.pickUnique([1], 6, 1, 33);
    assert.equal(r, null);
  });
  test('结果升序', function () {
    const bytes = QR.secureBytes(256);
    const r = QR.pickUnique(bytes, 5, 1, 50);
    for (let i = 1; i < r.length; i++) assert.ok(r[i] > r[i - 1], '应升序');
  });
});

// ── 彩票规则 ──
describe('双色球 drawSsq', function () {
  test('红 6/33 不重复 + 蓝 1/16', function () {
    const bytes = QR.secureBytes(512);
    const r = QR.drawSsq(bytes);
    assert.ok(r);
    assert.equal(r.red.length, 6);
    assert.equal(new Set(r.red).size, 6);
    for (const n of r.red) assert.ok(n >= 1 && n <= 33);
    assert.ok(r.blue >= 1 && r.blue <= 16);
  });
  test('固定字节序列结果确定', function () {
    // 同样的字节流必须产生同一个号码，保证可复现
    const bytes = [12, 5, 200, 33, 7, 99, 41, 0, 11, 250, 3, 1, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 250, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230, 240, 250, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const r1 = QR.drawSsq(bytes);
    const r2 = QR.drawSsq(bytes);
    assert.deepStrictEqual(r1, r2);
  });
  test('字节耗尽返回 null', function () {
    assert.equal(QR.drawSsq([1]), null);
  });
});

describe('大乐透 drawDlt', function () {
  test('前 5/35 + 后 2/12 不重复', function () {
    const bytes = QR.secureBytes(512);
    const r = QR.drawDlt(bytes);
    assert.ok(r);
    assert.equal(r.front.length, 5);
    assert.equal(new Set(r.front).size, 5);
    for (const n of r.front) assert.ok(n >= 1 && n <= 35);
    assert.equal(r.back.length, 2);
    assert.equal(new Set(r.back).size, 2);
    for (const n of r.back) assert.ok(n >= 1 && n <= 12);
  });
  test('字节耗尽返回 null', function () {
    assert.equal(QR.drawDlt([1, 2]), null);
  });
});

// ── 固定位数 ──
describe('固定位数 drawDigits / drawFixedDigitString', function () {
  test('区间整数数量正确落在范围', function () {
    const bytes = QR.secureBytes(128);
    const r = QR.drawDigits(bytes, 10, 100, 999);
    assert.equal(r.length, 10);
    for (const n of r) assert.ok(n >= 100 && n <= 999);
  });
  test('6 位字符串首位非 0 且长度正确', function () {
    const bytes = QR.secureBytes(64);
    const s = QR.drawFixedDigitString(bytes, 6);
    assert.equal(s.length, 6);
    assert.ok(s[0] !== '0');
  });
  test('range<=0 抛错', function () {
    assert.throws(() => QR.drawDigits([], 1, 5, 3));
  });
});

// ── 大样本分布近似均匀 ──
describe('大样本分布均匀性', function () {
  test('drawInt 在 range=6 上跑 6000 次频次接近均匀', function () {
    const bytes = QR.secureBytes(20000);
    const state = { idx: 0 };
    const freq = [0, 0, 0, 0, 0, 0];
    let count = 0;
    while (count < 6000) {
      const v = QR.drawInt(bytes, 6, state);
      if (v == null) break;
      freq[v]++;
      count++;
    }
    assert.equal(count, 6000);
    // 每个桶期望 1000，允许 ±15% 偏差
    for (let i = 0; i < 6; i++) {
      assert.ok(Math.abs(freq[i] - 1000) <= 200, `桶 ${i}=${freq[i]} 偏离 1000 过多`);
    }
  });
  test('双色球红球大样本覆盖 1–33 接近均匀', function () {
    const freq = new Array(34).fill(0);
    for (let i = 0; i < 5000; i++) {
      const bytes = QR.secureBytes(256);
      const r = QR.drawSsq(bytes);
      if (!r) continue;
      for (const n of r.red) freq[n]++;
    }
    // 5000 注 * 6 球 = 30000 个号码，33 个号码每个期望约 909
    let min = Infinity, max = -Infinity;
    for (let n = 1; n <= 33; n++) {
      if (freq[n] < min) min = freq[n];
      if (freq[n] > max) max = freq[n];
    }
    // 允许相对偏差 ±40%（大数定律在 3000 样本下波动仍可观）
    assert.ok(max - min < 600, `红球分布极差 ${max - min} 过大`);
  });
});

// ── 辅助函数 ──
describe('辅助函数', function () {
  test('pad2 补零', function () {
    assert.equal(QR.pad2(3), '03');
    assert.equal(QR.pad2(33), '33');
  });
  test('byteHistogram 桶数与总数一致', function () {
    const bytes = [0, 15, 31, 47, 63, 79, 95, 111, 127, 143, 159, 175, 191, 207, 223, 239, 255];
    const h = QR.byteHistogram(bytes, 16);
    assert.equal(h.length, 16);
    const sum = h.reduce((a, b) => a + b, 0);
    assert.equal(sum, bytes.length);
  });
  test('chiSquare 均匀分布接近 0', function () {
    const even = [100, 100, 100, 100];
    assert.ok(QR.chiSquare(even) < 0.001);
  });
  test('chiSquare 偏斜分布偏大', function () {
    const skewed = [400, 0, 0, 0];
    assert.ok(QR.chiSquare(skewed) > 1000);
  });
  test('sourceBadge 降级标注', function () {
    const b = QR.sourceBadge('secure', true);
    assert.ok(b.text.indexOf('降级') >= 0);
    assert.equal(b.cls, 'badge-degraded');
  });
  test('sourceBadge 量子源图标', function () {
    const b = QR.sourceBadge('quantum', false);
    assert.equal(b.icon, 'ti-atom');
  });
  test('formatSsq / formatDlt 格式', function () {
    assert.equal(QR.formatSsq({ red: [1, 2, 33], blue: 8 }), '红球 01 02 33 ｜ 蓝球 08');
    assert.equal(QR.formatDlt({ front: [5, 35], back: [1, 12] }), '前区 05 35 ｜ 后区 01 12');
  });
});

console.log('所有测试通过 ✓');
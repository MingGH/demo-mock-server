/**
 * 访问轨迹监控实验室 - 单元测试
 * 运行: node pages/tracking-heatmap/tracking-heatmap.test.js
 */

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

// ── 模拟 tracker 核心逻辑（不依赖 DOM） ──

class MockBehaviorTracker {
  constructor() {
    this.startTime = Date.now();
    this.mousePositions = [];
    this.clicks = [];
    this.scrollEvents = [];
    this.hoverZones = new Map();
    this.maxScrollDepth = 0;
    this.totalMouseDist = 0;
    this.speeds = [];
    this.events = [];
    this.lastMousePos = null;
    this.lastMoveTime = 0;
  }

  recordMove(x, y) {
    const now = Date.now();
    const t = now - this.startTime;

    if (this.lastMousePos) {
      const dx = x - this.lastMousePos.x;
      const dy = y - this.lastMousePos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      this.totalMouseDist += dist;

      const dt = now - this.lastMoveTime;
      if (dt > 0) {
        this.speeds.push(dist / dt * 1000);
      }
    }
    this.lastMousePos = { x, y };
    this.lastMoveTime = now;
    this.mousePositions.push({ x, y, t });
  }

  recordClick(x, y, target) {
    const t = Date.now() - this.startTime;
    this.clicks.push({ x, y, t, target });
    this.events.push({ type: 'click', t, desc: `点击了「${target}」` });
  }

  recordScroll(depth) {
    const t = Date.now() - this.startTime;
    if (depth > this.maxScrollDepth) this.maxScrollDepth = depth;
    this.scrollEvents.push({ depth, t });
    this.events.push({ type: 'scroll', t, desc: `滚动到 ${depth}% 深度` });
  }

  recordHover(zone, duration) {
    const prev = this.hoverZones.get(zone) || 0;
    this.hoverZones.set(zone, prev + duration);
  }

  getReport() {
    const duration = (Date.now() - this.startTime) / 1000;
    const avgSpeed = this.speeds.length > 0
      ? Math.round(this.speeds.reduce((a, b) => a + b, 0) / this.speeds.length)
      : 0;
    return {
      duration: Math.round(duration),
      totalMouseDist: Math.round(this.totalMouseDist),
      clicks: this.clicks,
      clickCount: this.clicks.length,
      scrollDepth: this.maxScrollDepth,
      hoverZones: Object.fromEntries(this.hoverZones),
      hoverZoneCount: this.hoverZones.size,
      avgSpeed,
      mousePositions: this.mousePositions,
      events: this.events,
      scrollEvents: this.scrollEvents
    };
  }
}

// ── 画像推断逻辑（从 app.js 提取核心） ──

function inferTags(report) {
  const tags = [];
  const zones = report.hoverZones;
  const priceTime = zones['价格区域'] || 0;
  const reviewTime = zones['评价区域'] || 0;
  const specTime = zones['规格区域'] || 0;

  if (priceTime > 2000) {
    tags.push({ label: '价格敏感型', level: 'high' });
  } else if (priceTime > 500) {
    tags.push({ label: '价格关注', level: 'medium' });
  }

  if (reviewTime > 3000) {
    tags.push({ label: '评价驱动型决策', level: 'high' });
  } else if (reviewTime > 1000) {
    tags.push({ label: '参考评价', level: 'medium' });
  }

  if (specTime > 2000) {
    tags.push({ label: '参数研究型', level: 'high' });
  }

  const hasClickBuy = report.clicks.some(c => c.target === '立即购买');
  const hasClickCart = report.clicks.some(c => c.target === '加入购物车');
  if (hasClickBuy) {
    tags.push({ label: '冲动购买倾向', level: 'high' });
  } else if (hasClickCart) {
    tags.push({ label: '购物车囤货型', level: 'medium' });
  } else if (report.duration > 30 && !hasClickBuy && !hasClickCart) {
    tags.push({ label: '犹豫型/仅浏览', level: 'low' });
  }

  if (report.scrollDepth > 80) {
    tags.push({ label: '深度浏览者', level: 'medium' });
  } else if (report.scrollDepth < 30) {
    tags.push({ label: '浅层浏览', level: 'low' });
  }

  if (report.clickCount > 5) {
    tags.push({ label: '高活跃用户', level: 'medium' });
  }

  if (report.avgSpeed > 800) {
    tags.push({ label: '快速扫描型', level: 'low' });
  } else if (report.avgSpeed > 0 && report.avgSpeed < 300) {
    tags.push({ label: '仔细阅读型', level: 'medium' });
  }

  if (tags.length === 0) {
    tags.push({ label: '新访客', level: 'low' });
  }

  return tags;
}

// ═══════ 测试 ═══════

console.log('\n── 追踪引擎测试 ──');

(function testMouseDistance() {
  const t = new MockBehaviorTracker();
  t.recordMove(0, 0);
  t.recordMove(3, 4); // 距离 5
  t.recordMove(6, 8); // 距离 5
  const r = t.getReport();
  assert(r.totalMouseDist === 10, `鼠标距离计算：期望 10，得到 ${r.totalMouseDist}`);
})();

(function testClickRecord() {
  const t = new MockBehaviorTracker();
  t.recordClick(100, 200, '立即购买');
  t.recordClick(150, 300, '加入购物车');
  const r = t.getReport();
  assert(r.clickCount === 2, `点击记录数：期望 2，得到 ${r.clickCount}`);
  assert(r.clicks[0].target === '立即购买', '第一次点击目标正确');
})();

(function testScrollDepth() {
  const t = new MockBehaviorTracker();
  t.recordScroll(30);
  t.recordScroll(75);
  t.recordScroll(50); // 不应覆盖最大值
  const r = t.getReport();
  assert(r.scrollDepth === 75, `最大滚动深度：期望 75，得到 ${r.scrollDepth}`);
})();

(function testHoverZones() {
  const t = new MockBehaviorTracker();
  t.recordHover('价格区域', 1000);
  t.recordHover('价格区域', 1500);
  t.recordHover('评价区域', 800);
  const r = t.getReport();
  assert(r.hoverZones['价格区域'] === 2500, `价格区域停留：期望 2500，得到 ${r.hoverZones['价格区域']}`);
  assert(r.hoverZoneCount === 2, `悬停区域数：期望 2，得到 ${r.hoverZoneCount}`);
})();

(function testEmptyReport() {
  const t = new MockBehaviorTracker();
  const r = t.getReport();
  assert(r.clickCount === 0, '空报告：点击数为 0');
  assert(r.totalMouseDist === 0, '空报告：鼠标距离为 0');
  assert(r.avgSpeed === 0, '空报告：平均速度为 0');
  assert(r.scrollDepth === 0, '空报告：滚动深度为 0');
})();

console.log('\n── 画像推断测试 ──');

(function testPriceSensitive() {
  const report = {
    duration: 45,
    clicks: [],
    clickCount: 0,
    scrollDepth: 50,
    hoverZones: { '价格区域': 3000 },
    avgSpeed: 400
  };
  const tags = inferTags(report);
  const labels = tags.map(t => t.label);
  assert(labels.includes('价格敏感型'), '长时间看价格 → 价格敏感型');
  assert(labels.includes('犹豫型/仅浏览'), '长时间无购买行为 → 犹豫型');
})();

(function testImpulseBuyer() {
  const report = {
    duration: 10,
    clicks: [{ target: '立即购买' }],
    clickCount: 1,
    scrollDepth: 20,
    hoverZones: {},
    avgSpeed: 500
  };
  const tags = inferTags(report);
  const labels = tags.map(t => t.label);
  assert(labels.includes('冲动购买倾向'), '快速点击购买 → 冲动购买');
  assert(labels.includes('浅层浏览'), '滚动少 → 浅层浏览');
})();

(function testDeepBrowser() {
  const report = {
    duration: 60,
    clicks: [{ target: '加入购物车' }],
    clickCount: 6,
    scrollDepth: 95,
    hoverZones: { '评价区域': 5000, '规格区域': 3000 },
    avgSpeed: 200
  };
  const tags = inferTags(report);
  const labels = tags.map(t => t.label);
  assert(labels.includes('评价驱动型决策'), '长时间看评价 → 评价驱动');
  assert(labels.includes('参数研究型'), '长时间看规格 → 参数研究');
  assert(labels.includes('深度浏览者'), '滚动深 → 深度浏览');
  assert(labels.includes('高活跃用户'), '点击多 → 高活跃');
  assert(labels.includes('仔细阅读型'), '速度慢 → 仔细阅读');
  assert(labels.includes('购物车囤货型'), '加购物车 → 囤货型');
})();

(function testNewVisitor() {
  const report = {
    duration: 5,
    clicks: [],
    clickCount: 0,
    scrollDepth: 50,
    hoverZones: {},
    avgSpeed: 0
  };
  const tags = inferTags(report);
  const labels = tags.map(t => t.label);
  assert(labels.includes('新访客'), '无有效行为 → 新访客');
})();

(function testFastScanner() {
  const report = {
    duration: 8,
    clicks: [],
    clickCount: 0,
    scrollDepth: 90,
    hoverZones: {},
    avgSpeed: 1200
  };
  const tags = inferTags(report);
  const labels = tags.map(t => t.label);
  assert(labels.includes('快速扫描型'), '高速鼠标 → 快速扫描');
  assert(labels.includes('深度浏览者'), '滚动深 → 深度浏览');
})();

// ── 结果 ──
console.log(`\n══ 结果：${passed} 通过，${failed} 失败 ══\n`);
process.exit(failed > 0 ? 1 : 0);

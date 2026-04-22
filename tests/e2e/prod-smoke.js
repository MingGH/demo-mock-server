const { chromium } = require('playwright-core');

const BASE = process.env.BASE_URL || 'https://numfeel.996.ninja';
const API = process.env.API_URL || 'https://numfeel-api.996.ninja';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const results = [];

  async function test(name, fn) {
    try {
      await fn();
      results.push({ name, ok: true });
      console.log(`✓ ${name}`);
    } catch (e) {
      results.push({ name, ok: false, err: e.message });
      console.log(`✗ ${name}: ${e.message}`);
    }
  }

  // ========== 首页 ==========

  await test('首页加载', async () => {
    const res = await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
    if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
    const title = await page.title();
    if (!title.includes('数字直觉')) throw new Error(`Title: ${title}`);
  });

  await test('卡片渲染 (demos.json 数据驱动)', async () => {
    const count = await page.locator('.card').count();
    if (count < 90) throw new Error(`Only ${count} cards`);
    console.log(`  → ${count} cards`);
  });

  await test('分类标签渲染', async () => {
    const count = await page.locator('.filter-tag').count();
    if (count < 8) throw new Error(`Only ${count} tags`);
  });

  await test('搜索功能', async () => {
    await page.fill('#searchInput', '概率');
    await page.waitForTimeout(300);
    const visible = await page.locator('.card:not(.hidden)').count();
    if (visible < 5) throw new Error(`Only ${visible} results`);
    console.log(`  → ${visible} results for "概率"`);
    await page.fill('#searchInput', '');
  });

  await test('分类筛选', async () => {
    await page.locator('.filter-tag[data-category="gambling"]').click();
    await page.waitForTimeout(300);
    const hidden = await page.locator('.category-section.hidden').count();
    if (hidden < 5) throw new Error(`Only ${hidden} sections hidden`);
    await page.locator('.filter-tag[data-category="all"]').click();
    await page.waitForTimeout(200);
  });

  await test('无结果提示', async () => {
    await page.fill('#searchInput', 'zzzznotexist');
    await page.waitForTimeout(300);
    const shown = await page.locator('#noResults.show').count();
    if (!shown) throw new Error('No results message not shown');
    await page.fill('#searchInput', '');
  });

  // ========== 子页面 ==========

  const subPages = [
    { path: '/pages/monty-hall-simulator.html', name: '蒙提霍尔' },
    { path: '/pages/kelly-criterion.html', name: '凯利公式' },
    { path: '/pages/braess-paradox.html', name: '布雷斯悖论' },
    { path: '/pages/browser-fingerprint.html', name: '浏览器指纹' },
    { path: '/pages/session-replay-lab/', name: '会话回放实验室' },
    { path: '/pages/image-retro-lab.html', name: '图片做旧实验室' },
    { path: '/pages/right-hand-maze.html', name: '右转迷宫' },
    { path: '/pages/subscription-ownership.html', name: '订阅拥有感' },
    { path: '/pages/predict-100ms.html', name: '预知0.1秒' },
  ];

  for (const p of subPages) {
    await test(`子页面: ${p.name}`, async () => {
      const res = await page.goto(BASE + p.path, { waitUntil: 'domcontentloaded', timeout: 15000 });
      if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
    });
  }

  // ========== Chart.js ==========

  await test('Chart.js 加载', async () => {
    await page.goto(BASE + '/pages/kelly-criterion.html', { waitUntil: 'networkidle', timeout: 15000 });
    const has = await page.evaluate(() => typeof Chart !== 'undefined');
    if (!has) throw new Error('Chart not loaded');
  });

  // ========== 后端 API ==========

  await test('后端 API /chinese-names', async () => {
    const res = await page.goto(API + '/chinese-names?n=1', { timeout: 10000 });
    if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
  });

  await test('后端 API /word-cloud', async () => {
    const res = await page.goto(API + '/word-cloud', { timeout: 10000 });
    if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
  });

  // ========== Service Worker ==========

  await test('Service Worker 注册', async () => {
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    const sw = await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => !!r));
    if (!sw) throw new Error('SW not registered');
  });

  // ========== 汇总 ==========

  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${'='.repeat(40)}`);
  console.log(`${passed} passed, ${failed} failed`);
  if (failed) {
    console.log('\nFailed tests:');
    results.filter(r => !r.ok).forEach(r => console.log(`  ✗ ${r.name}: ${r.err}`));
  }

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();

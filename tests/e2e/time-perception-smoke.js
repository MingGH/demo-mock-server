const { chromium } = require('playwright-core');

const BASE = process.env.BASE_URL || 'http://localhost:3999';

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

  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`  [browser error] ${msg.text()}`);
  });
  page.on('pageerror', err => console.log(`  [page error] ${err.message}`));

  // ========== 时间感知扭曲实验室 ==========

  await test('页面加载', async () => {
    const res = await page.goto(BASE + '/pages/time-perception/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
    const title = await page.title();
    if (!title.includes('时间感知扭曲')) throw new Error(`Title: ${title}`);
  });

  await test('核心 UI 元素渲染', async () => {
    const h1 = await page.locator('h1').textContent();
    if (!h1.includes('时间感知扭曲实验室')) throw new Error(`h1: ${h1}`);

    const intro = await page.locator('#introSection');
    if (!(await intro.isVisible())) throw new Error('introSection not visible');

    const startBtn = await page.locator('button:has-text("开始实验")');
    if (!(await startBtn.isVisible())) throw new Error('start button not visible');
  });

  await test('实验说明区渲染正确', async () => {
    const phases = await page.locator('.phase-intro').count();
    if (phases < 3) throw new Error(`Only ${phases} phase-intro blocks`);
  });

  await test('chart.js 已加载', async () => {
    const hasChart = await page.evaluate(() => typeof Chart !== 'undefined');
    if (!hasChart) throw new Error('Chart not loaded');
  });

  await test('engine.js 暴露全局函数', async () => {
    const fns = await page.evaluate(() => ({
      trials: Array.isArray(typeof TRIALS !== 'undefined' ? TRIALS : null),
      computeDistortion: typeof computeDistortion === 'function',
    }));
    if (!fns.trials) throw new Error('TRIALS not defined');
    if (!fns.computeDistortion) throw new Error('computeDistortion not defined');
  });

  await test('TRIALS 共 8 轮', async () => {
    const count = await page.evaluate(() => TRIALS.length);
    if (count !== 8) throw new Error(`Expected 8 trials, got ${count}`);
  });

  // ── 交互测试 ──

  await test('点击开始实验 → 实验界面出现', async () => {
    await page.locator('button:has-text("开始实验")').click();
    await page.waitForTimeout(500);
    const visible = await page.locator('#trialSection').isVisible();
    if (!visible) throw new Error('trialSection not visible');
  });

  await test('点击开始计时 → stopBtn 出现', async () => {
    await page.locator('#startBtn').click();
    await page.waitForTimeout(300);
    const visible = await page.locator('#stopBtn').isVisible();
    if (!visible) throw new Error('stopBtn not visible');
  });

  await test('点击停止 → roundResult 显示', async () => {
    await page.waitForTimeout(2000);
    await page.locator('#stopBtn').click();
    await page.waitForTimeout(1000);

    // Debug: check trialActive and roundResult state
    const debug = await page.evaluate(() => ({
      trialActive: trialActive,
      trialResultsLength: trialResults.length,
      roundResultDisplay: document.getElementById('roundResult').style.display,
      resDistortion: document.getElementById('resDistortion').textContent,
    }));
    console.log(`  → debug: trialActive=${debug.trialActive}, results=${debug.trialResultsLength}, display=${debug.roundResultDisplay}, dist="${debug.resDistortion}"`);

    const display = await page.locator('#roundResult').evaluate(el => window.getComputedStyle(el).display);
    if (display === 'none') throw new Error(`roundResult display is none (debug: ${JSON.stringify(debug)})`);
    if (debug.resDistortion === '—') throw new Error('distortion not set');
    console.log(`  → distortion: ${debug.resDistortion}`);
  });

  await test('点击下一轮 → 进入第2轮', async () => {
    await page.locator('#nextBtn').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('#nextBtn').click();
    await page.waitForTimeout(500);
    const num = await page.locator('#roundNum').textContent();
    if (num !== '2') throw new Error(`Expected 2, got ${num}`);
  });

  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${'='.repeat(40)}`);
  console.log(`${passed} passed, ${failed} failed`);
  if (failed) {
    console.log('\nFailed:');
    results.filter(r => !r.ok).forEach(r => console.log(`  ✗ ${r.name}: ${r.err}`));
  }

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();

/**
 * SQL 图灵完备实验室 — 交互逻辑（DOM 绑定 + DuckDB-WASM 驱动）
 * 纯计算逻辑在 engine.js；本文件只做 UI 编排。
 */
(function () {
  'use strict';

  const Engine = window.SQLTuringEngine;
  if (!Engine) {
    console.error('[sql-turing-lab] engine.js 未加载');
    return;
  }

  const DUCKDB_ESM_URL = 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.32.0/+esm';

  // ── DuckDB 连接（懒加载 + 单例） ──
  let db = null;
  let conn = null;
  let initPromise = null;

  async function initDuckDB() {
    if (conn) return conn;
    if (initPromise) return initPromise;
    initPromise = (async () => {
      let duckdb;
      try {
        duckdb = await import(DUCKDB_ESM_URL);
      } catch (e) {
        throw new Error('DuckDB-WASM 加载失败：' + e.message);
      }
      const bundles = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(bundles);
      const workerUrl = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
      );
      const worker = new Worker(workerUrl);
      const logger = new duckdb.ConsoleLogger();
      db = new duckdb.AsyncDuckDB(logger, worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      conn = await db.connect();
      return conn;
    })();
    return initPromise;
  }

  async function runSQL(sql) {
    const c = await initDuckDB();
    const result = await c.query(sql);
    return result.toArray();
  }

  /** 把任意值转成可显示字符串（处理 BigInt） */
  function stringifyValue(v) {
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'number' && !Number.isInteger(v)) return parseFloat(v.toPrecision(10)).toString();
    if (v === null || v === undefined) return 'NULL';
    return String(v);
  }

  // ── 通用：复制代码块 ──
  function setupCopyButtons() {
    document.querySelectorAll('.copy-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-copy');
        const el = document.getElementById(targetId);
        const text = el ? el.innerText : '';
        const done = () => {
          const old = btn.innerHTML;
          btn.innerHTML = '<i class="ti ti-check"></i> 已复制';
          setTimeout(() => { btn.innerHTML = old; }, 1500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
        } else {
          fallbackCopy(text, done);
        }
      });
    });
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
    done();
  }

  // ── 埋点（安全调用） ──
  function track(event, props) {
    try {
      if (window.NFTrack && typeof window.NFTrack.track === 'function') {
        window.NFTrack.track(event, props || {});
      }
    } catch (e) { /* 埋点失败不影响页面 */ }
  }

  function setBusy(btn, busy, busyText) {
    if (!btn) return;
    if (busy) {
      btn.dataset.originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<i class="ti ti-loader-2"></i> ${busyText || '执行中…'}`;
    } else {
      btn.disabled = false;
      if (btn.dataset.originalHtml) btn.innerHTML = btn.dataset.originalHtml;
    }
  }

  // ══════════════ Demo 1：递归计数 ══════════════
  const counterN = document.getElementById('counterN');
  const counterNVal = document.getElementById('counterNVal');
  const counterRunBtn = document.getElementById('counterRunBtn');
  const counterOutput = document.getElementById('counterOutput');
  const counterSqlCode = document.getElementById('counterSqlCode');

  function refreshCounterSQL() {
    const n = Number(counterN.value);
    counterNVal.textContent = n;
    counterSqlCode.textContent = Engine.buildCounterSQL(n);
  }

  async function runCounter() {
    const n = Number(counterN.value);
    refreshCounterSQL();
    setBusy(counterRunBtn, true, '数据库计算中…');
    try {
      const rows = await runSQL(Engine.buildCounterSQL(n));
      const nums = Engine.parseCounterRows(rows);
      counterOutput.innerHTML = nums
        .map((v) => `<span class="counter-num">${v}</span>`)
        .join('');
      track('run_counter', { n });
    } catch (e) {
      counterOutput.innerHTML = `<span class="placeholder" style="color:#ff6b6b">${escapeHtml(e.message)}</span>`;
    } finally {
      setBusy(counterRunBtn, false);
    }
  }

  counterN.addEventListener('input', refreshCounterSQL);
  counterRunBtn.addEventListener('click', runCounter);

  // ══════════════ Demo 2：曼德博集合 ══════════════
  const mandelCanvas = document.getElementById('mandelCanvas');
  const mandelLoading = document.getElementById('mandelLoading');
  const mandelRunBtn = document.getElementById('mandelRunBtn');
  const mandelRes = document.getElementById('mandelRes');
  const mandelIter = document.getElementById('mandelIter');
  const mandelTime = document.getElementById('mandelTime');
  const mandelSqlCode = document.getElementById('mandelSqlCode');

  const mandelParams = { w: 120, h: 80, iter: 50 };
  let mandelFailed = false;

  function refreshMandelSQL() {
    mandelSqlCode.textContent = Engine.buildMandelbrotSQL(
      mandelParams.w, mandelParams.h, mandelParams.iter, -2.0, 1.0, -1.2, 1.2
    );
  }

  function renderMandelbrot(grid, w, h, maxIter) {
    mandelCanvas.width = w;
    mandelCanvas.height = h;
    const ctx = mandelCanvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const data = img.data;
    for (let i = 0; i < w * h; i++) {
      const [r, g, b] = Engine.escapeColor(grid[i], maxIter);
      data[i * 4] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  async function runMandelbrot() {
    refreshMandelSQL();
    mandelFailed = false;
    mandelLoading.style.display = 'flex';
    mandelLoading.style.color = '#90caf9';
    mandelLoading.textContent = 'SQL 正在迭代计算…';
    setBusy(mandelRunBtn, true, '迭代中…');
    const t0 = performance.now();
    try {
      const rows = await runSQL(Engine.buildMandelbrotSQL(
        mandelParams.w, mandelParams.h, mandelParams.iter, -2.0, 1.0, -1.2, 1.2
      ));
      const grid = Engine.parseMandelbrotRows(rows, mandelParams.w, mandelParams.h);
      renderMandelbrot(grid, mandelParams.w, mandelParams.h, mandelParams.iter);
      mandelRes.textContent = `${mandelParams.w} × ${mandelParams.h}`;
      mandelIter.textContent = mandelParams.iter;
      mandelTime.textContent = Math.round(performance.now() - t0) + ' ms';
      track('run_mandelbrot', { w: mandelParams.w, h: mandelParams.h, iter: mandelParams.iter });
    } catch (e) {
      mandelFailed = true;
      mandelLoading.style.color = '#ff6b6b';
      mandelLoading.textContent = '加载失败：' + e.message;
    } finally {
      if (!mandelFailed) mandelLoading.style.display = 'none';
      setBusy(mandelRunBtn, false);
    }
  }

  document.querySelectorAll('.mandel-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      mandelParams.w = Number(btn.dataset.w);
      mandelParams.h = Number(btn.dataset.h);
      mandelParams.iter = Number(btn.dataset.it);
      document.querySelectorAll('.mandel-preset').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      refreshMandelSQL();
      runMandelbrot();
    });
  });
  mandelRunBtn.addEventListener('click', runMandelbrot);

  // ══════════════ Demo 3：生命游戏 ══════════════
  const lifeCanvas = document.getElementById('lifeCanvas');
  const lifeStepBtn = document.getElementById('lifeStepBtn');
  const lifeAutoBtn = document.getElementById('lifeAutoBtn');
  const lifeClearBtn = document.getElementById('lifeClearBtn');
  const lifeGenEl = document.getElementById('lifeGen');
  const lifeSqlCode = document.getElementById('lifeSqlCode');

  const GRID_W = 44;
  const GRID_H = 32;
  const CELL = 16;

  let lifeCells = [];
  let lifeGen = 0;
  let autoTimer = null;
  let lifeBusy = false;

  function centerCells(cells) {
    if (!cells.length) return [];
    const xs = cells.map((c) => c.x);
    const ys = cells.map((c) => c.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const dx = Math.floor((GRID_W - (maxX - minX + 1)) / 2) - minX;
    const dy = Math.floor((GRID_H - (maxY - minY + 1)) / 2) - minY;
    return cells.map((c) => ({ x: c.x + dx, y: c.y + dy }));
  }

  function randomCells() {
    const cells = [];
    for (let y = 8; y < 24; y++) {
      for (let x = 12; x < 32; x++) {
        if (Math.random() < 0.28) cells.push({ x, y });
      }
    }
    return cells;
  }

  function renderLife() {
    lifeCanvas.width = GRID_W * CELL;
    lifeCanvas.height = GRID_H * CELL;
    const ctx = lifeCanvas.getContext('2d');
    ctx.clearRect(0, 0, lifeCanvas.width, lifeCanvas.height);
    // 网格线
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= GRID_W; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL, 0);
      ctx.lineTo(x * CELL, lifeCanvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= GRID_H; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL);
      ctx.lineTo(lifeCanvas.width, y * CELL);
      ctx.stroke();
    }
    // 活细胞
    ctx.fillStyle = '#81c784';
    for (const c of lifeCells) {
      if (c.x >= 0 && c.x < GRID_W && c.y >= 0 && c.y < GRID_H) {
        ctx.fillRect(c.x * CELL + 1, c.y * CELL + 1, CELL - 2, CELL - 2);
      }
    }
    lifeGenEl.textContent = lifeGen;
  }

  function loadPreset(preset) {
    stopAuto();
    let cells;
    if (preset === 'random') {
      cells = randomCells();
    } else {
      cells = centerCells(Engine.LIFE_PRESETS[preset] || []);
    }
    lifeCells = cells;
    lifeGen = 0;
    renderLife();
  }

  function stopAuto() {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
    lifeAutoBtn.innerHTML = '<i class="ti ti-player-play"></i> 自动播放';
    lifeAutoBtn.classList.remove('active');
  }

  async function stepLife() {
    if (lifeBusy) return;
    lifeBusy = true;
    setBusy(lifeStepBtn, true, '演化中…');
    try {
      await runSQL(Engine.buildLifeSetupSQL(lifeCells));
      const rows = await runSQL(Engine.buildLifeNextSQL());
      lifeCells = Engine.parseLifeRows(rows);
      lifeGen++;
      lifeSqlCode.textContent = Engine.buildLifeNextSQL();
      renderLife();
      track('life_step', { gen: lifeGen });
    } catch (e) {
      stopAuto();
      lifeSqlCode.textContent = 'SQL 执行出错：' + e.message;
    } finally {
      lifeBusy = false;
      setBusy(lifeStepBtn, false);
    }
  }

  lifeCanvas.addEventListener('click', (e) => {
    const rect = lifeCanvas.getBoundingClientRect();
    const scaleX = lifeCanvas.width / rect.width;
    const scaleY = lifeCanvas.height / rect.height;
    const gx = Math.floor((e.clientX - rect.left) * scaleX / CELL);
    const gy = Math.floor((e.clientY - rect.top) * scaleY / CELL);
    if (gx < 0 || gx >= GRID_W || gy < 0 || gy >= GRID_H) return;
    const key = gx + ',' + gy;
    const idx = lifeCells.findIndex((c) => c.x === gx && c.y === gy);
    if (idx >= 0) {
      lifeCells.splice(idx, 1);
    } else {
      lifeCells.push({ x: gx, y: gy });
    }
    renderLife();
  });

  document.querySelectorAll('.life-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.life-preset').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      loadPreset(btn.dataset.preset);
    });
  });
  lifeStepBtn.addEventListener('click', stepLife);
  lifeClearBtn.addEventListener('click', () => {
    stopAuto();
    lifeCells = [];
    lifeGen = 0;
    renderLife();
  });
  lifeAutoBtn.addEventListener('click', () => {
    if (autoTimer) {
      stopAuto();
    } else {
      lifeAutoBtn.innerHTML = '<i class="ti ti-player-pause"></i> 暂停';
      lifeAutoBtn.classList.add('active');
      autoTimer = setInterval(stepLife, 400);
    }
  });

  // ══════════════ 自由查询台 ══════════════
  const freeSql = document.getElementById('freeSql');
  const freeRunBtn = document.getElementById('freeRunBtn');
  const freeStatus = document.getElementById('freeStatus');
  const freeResult = document.getElementById('freeResult');

  async function runFreeSQL() {
    const sql = freeSql.value.trim();
    if (!sql) return;
    setBusy(freeRunBtn, true, '执行中…');
    freeStatus.textContent = '';
    freeStatus.classList.remove('error');
    try {
      const rows = await runSQL(sql);
      renderFreeResult(rows);
      freeStatus.textContent = `返回 ${rows.length} 行`;
      track('run_free_sql', { rows: rows.length });
    } catch (e) {
      freeStatus.textContent = e.message;
      freeStatus.classList.add('error');
      freeResult.innerHTML = '';
    } finally {
      setBusy(freeRunBtn, false);
    }
  }

  function renderFreeResult(rows) {
    if (!rows || !rows.length) {
      freeResult.innerHTML = '<div class="empty">（查询成功，但没有返回行）</div>';
      return;
    }
    const cols = Object.keys(rows[0]);
    const limit = 200;
    const shown = rows.slice(0, limit);
    let html = '<table><thead><tr>' + cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('') + '</tr></thead><tbody>';
    for (const row of shown) {
      html += '<tr>' + cols.map((c) => `<td>${escapeHtml(stringifyValue(row[c]))}</td>`).join('') + '</tr>';
    }
    html += '</tbody></table>';
    if (rows.length > limit) {
      html += `<div class="empty">（仅显示前 ${limit} 行，共 ${rows.length} 行）</div>`;
    }
    freeResult.innerHTML = html;
  }

  freeRunBtn.addEventListener('click', runFreeSQL);

  // ── 工具：转义 HTML ──
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  // ══════════════ 初始化 ══════════════
  function init() {
    setupCopyButtons();
    refreshCounterSQL();
    refreshMandelSQL();
    lifeSqlCode.textContent = Engine.buildLifeNextSQL();
    document.querySelector('.life-preset[data-preset="glider"]').classList.add('active');
    loadPreset('glider');

    // GSAP 入场动画（若可用）
    if (window.gsap) {
      gsap.from('.section', {
        y: 28,
        opacity: 0,
        duration: 0.6,
        stagger: 0.08,
        ease: 'power2.out',
      });
    }

    // 零门槛启动：自动跑「计数」和「快速分形」
    track('session_start', {});
    runCounter();
    mandelParams.w = 60;
    mandelParams.h = 40;
    mandelParams.iter = 30;
    document.querySelector('.mandel-preset[data-w="60"]').classList.add('active');
    runMandelbrot();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

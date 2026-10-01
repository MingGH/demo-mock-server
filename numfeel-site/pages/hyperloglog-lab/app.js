/* HyperLogLog 实验室 - 交互层：只做 DOM 与状态展示，公式全部在 hyperloglog-logic.js */
(function () {
  'use strict';
  var L = window.HLLLib;

  // ---------- 状态 ----------
  var state = {
    target: 100000000,
    strategy: 'hashset',
    totalRequests: 0,
    uniqueCount: 0,
    hll: null,
    oom: false,
    streaming: false,
    seq: 0,
    chartPoints: []
  };
  var coinSession = { flips: 0, best: 0, run: 0 };
  var feedItems = [];
  var chart = null;
  var SAMPLE_N = 128;

  // ---------- DOM ----------
  function $(id) { return document.getElementById(id); }
  var el = {
    presetRow: $('presetRow'), strategyRow: $('strategyRow'),
    pour1w: $('pour1w'), pour10w: $('pour10w'), autoBtn: $('autoBtn'),
    dupBtn: $('dupBtn'), resetBtn: $('resetBtn'),
    floodStatus: $('floodStatus'), streamFeed: $('streamFeed'),
    statTotal: $('statTotal'), statDistinct: $('statDistinct'),
    statEstimate: $('statEstimate'), statErr: $('statErr'),
    memHashset: $('mem-hashset'), memBitmap: $('mem-bitmap'), memHll: $('mem-hll'),
    fillHashset: $('fill-hashset'), fillBitmap: $('fill-bitmap'), fillHll: $('fill-hll'),
    rowHashset: $('row-hashset'), rowBitmap: $('row-bitmap'), rowHll: $('row-hll'),
    labelHashset: $('label-hashset'), labelBitmap: $('label-bitmap'), labelHll: $('label-hll'),
    marginalTicker: $('marginalTicker'), verdict: $('verdict'),
    regGrid: $('regGrid'), regDetail: $('regDetail'),
    coinFlip1: $('coinFlip1'), coinReset: $('coinReset'),
    coin100: $('coin100'), coin10k: $('coin10k'), coin1m: $('coin1m'),
    coinActual: $('coinActual'), coinBest: $('coinBest'),
    coinEstimate: $('coinEstimate'), coinLog: $('coinLog'), coinAutoLog: $('coinAutoLog'),
    chartFallback: $('chartFallback')
  };

  // ---------- 展示格式化 ----------
  function fmtInt(n) {
    if (n >= 1e8) return trim(n / 1e8) + ' 亿';
    if (n >= 1e4) return trim(n / 1e4) + ' 万';
    return String(Math.round(n));
  }
  function trim(x) {
    var s = x >= 100 ? x.toFixed(0) : x.toFixed(2);
    if (s.indexOf('.') !== -1) {
      s = s.replace(/0+$/, '').replace(/\.$/, '');
    }
    return s;
  }
  function fmtBytes(b) {
    if (b >= 1e9) return trim(b / 1e9) + ' GB';
    if (b >= 1e6) return trim(b / 1e6) + ' MB';
    if (b >= 1e3) return trim(b / 1e3) + ' KB';
    return b + ' B';
  }
  function fmtPct(x) { return (x * 100).toFixed(2) + '%'; }
  function axisFmt(v) {
    if (v >= 1e8) return trim(v / 1e8) + ' 亿';
    if (v >= 1e4) return trim(v / 1e4) + ' 万';
    return String(v);
  }

  // ---------- 寄存器显微镜 ----------
  var regCells = [];
  function buildRegGrid() {
    el.regGrid.innerHTML = '';
    regCells = [];
    for (var i = 0; i < SAMPLE_N; i++) {
      (function (idx) {
        var cell = document.createElement('div');
        cell.className = 'reg-cell';
        cell.textContent = '0';
        cell.addEventListener('click', function () { showRegDetail(idx); });
        el.regGrid.appendChild(cell);
        regCells.push(cell);
      })(i);
    }
  }
  function updateRegGrid() {
    for (var i = 0; i < SAMPLE_N; i++) {
      var v = state.hll.registers[i * 128];
      var c = regCells[i];
      c.textContent = String(v);
      c.title = '桶 #' + (i * 128);
      if (v > 0) {
        c.classList.add('hot');
        c.style.background = 'rgba(240,136,62,' + Math.min(0.9, 0.15 + v * 0.05) + ')';
      } else {
        c.classList.remove('hot');
        c.style.background = '';
      }
    }
  }
  function showRegDetail(sampleIdx) {
    var regIdx = sampleIdx * 128;
    var v = state.hll.registers[regIdx];
    el.regDetail.textContent = '桶 #' + regIdx + '：最长连击 ρ=' + v +
      (v > 0 ? '，对应量级 2^' + v + ' ≈ ' + fmtInt(Math.pow(2, v)) + ' 个元素。' : '（还没见过任何元素）。') +
      ' 全部 16384 个桶加起来 12KB。';
  }

  // ---------- 数据流 ----------
  function pushFeed(html) {
    feedItems.unshift(html);
    if (feedItems.length > 14) feedItems.pop();
    el.streamFeed.innerHTML = feedItems.join('<br>');
  }

  // ---------- 灌数据 ----------
  function pour(k, isDup) {
    var beforeUnique = state.uniqueCount;
    var beforeHs = L.hashSetBytes(beforeUnique);
    var sampleIds = [];
    if (isDup) {
      var dupId = 'visitor_42';
      for (var i = 0; i < k; i++) L.hllAdd(state.hll, dupId);
      state.totalRequests += k;
      pushFeed('<span class="dup">' + dupId + ' ×' + fmtInt(k) + ' 重复请求…</span>');
      el.marginalTicker.textContent = '重复访客炸弹：同一个 ID 灌 ' + fmtInt(k) +
        ' 遍，HLL 寄存器纹丝不动（它根本不存访客）。真实 UV 仍是 ' + fmtInt(state.uniqueCount) + '。';
    } else {
      var start = state.seq;
      for (var j = 0; j < k; j++) {
        var id = 'u' + (state.seq++);
        L.hllAdd(state.hll, id);
      }
      state.uniqueCount = state.seq;
      state.totalRequests += k;
      for (var s = 0; s < 3; s++) {
        sampleIds.push('u' + (start + Math.floor(Math.random() * k)));
      }
      pushFeed('<span class="fresh">' + sampleIds.join('</span> <span class="fresh">') + '</span> …');
    }
    var afterHs = L.hashSetBytes(state.uniqueCount);
    var est = L.hllEstimate(state.hll);
    if (!isDup && state.uniqueCount > 0) {
      state.chartPoints.push({ x: state.uniqueCount, truth: state.uniqueCount, est: est });
      if (state.chartPoints.length > 800) state.chartPoints.shift();
    }
    if (!isDup) {
      var delta = afterHs - beforeHs;
      var err = state.uniqueCount > 0 ? Math.abs(est - state.uniqueCount) / state.uniqueCount : 0;
      el.marginalTicker.textContent = '刚才这一下：+' + fmtInt(k) + ' 名访客 ｜ HashSet +' +
        fmtBytes(delta) + ' ｜ HLL +0 字节 ｜ 当前偏差 ' + (state.uniqueCount > 0 ? fmtPct(err) : '—');
    }
    if (afterHs > L.budgetBytes() && !state.oom) {
      state.oom = true;
    }
    if (state.uniqueCount >= state.target && state.streaming) {
      stopStream();
    }
    renderAll();
  }

  // ---------- 全速灌满 ----------
  function startStream() {
    state.streaming = true;
    el.autoBtn.textContent = '⏸ 暂停';
    stepStream();
  }
  function stopStream() {
    state.streaming = false;
    el.autoBtn.textContent = '全速灌满';
    updateButtons();
    el.floodStatus.textContent = streamStatusText() + '（已停止）';
  }
  function stepStream() {
    if (!state.streaming) return;
    if (state.uniqueCount >= state.target) { stopStream(); return; }
    if (state.strategy === 'hashset' && state.oom) {
      stopStream();
      return;
    }
    var remain = state.target - state.uniqueCount;
    var chunk = Math.min(200000, remain);
    pour(chunk);
    if (state.strategy === 'hashset' && state.oom) { stopStream(); return; }
    if (state.streaming) setTimeout(stepStream, 30);
  }

  // ---------- 判词系统 ----------
  function currentVerdict() {
    var n = state.uniqueCount;
    var budget = L.budgetBytes();
    var hs = L.hashSetBytes(n);
    var cap = L.hashSetCapacity();
    var est = n > 0 ? L.hllEstimate(state.hll) : 0;
    var errTxt = n > 0 ? fmtPct(Math.abs(est - n) / n) : '—';
    if (state.strategy === 'hashset') {
      if (hs > budget) {
        return { cls: 'bad', text: '💥 撞墙：64MB 预算在第 ' + fmtInt(cap) + ' 个访客处用完，门外还有 ' +
          fmtInt(Math.max(0, state.target - cap)) + ' 人没数进去。每个 ID 固定吃 72 字节，没有商量余地。换 HyperLogLog 再来一次。' };
      }
      if (n >= state.target) {
        return { cls: 'good', text: 'HashSet 活到了最后：' + fmtBytes(hs) + '，答案精确。这个规模它确实又便宜又准——' +
          'HLL 的 12KB 优势要到几十万访客以上才明显，小数据用精确结构没问题。' };
      }
      return { cls: '', text: '还在装：已用 ' + fmtBytes(hs) + ' / 64MB，每个新访客固定 +72 字节，增速不变。' +
        '按这个账单，第 ' + fmtInt(cap) + ' 位访客会让它爆掉。目标可是 ' + fmtInt(state.target) + ' 人。' };
    }
    if (state.strategy === 'bitmap') {
      var bm = L.bitmapBytes(Math.max(0, n - 1));
      if (n >= state.target) {
        return { cls: 'good', text: 'Bitmap 装下了：' + fmtBytes(bm) + '。前提是 ID 真是连续整数。' +
          '真实访客 ID 是任意字符串——给字符串发号得先记住谁领过号，那本账又回到 HashSet。' };
      }
      return { cls: '', text: 'Bitmap 运行中：' + fmtBytes(bm) + '。看起来很省，但它有个前提：ID 必须是 0,1,2… 这样的连续整数。' +
        '你的访客 ID 是 u0、u1 这样的字符串——谁给他们发号？发号表本身就是另一个"记住所有见过的 ID"的问题。' };
    }
    if (n >= state.target) {
      return { cls: 'good', text: '目标达成：' + fmtInt(n) + ' 名访客，HLL 全程 12KB，估计 ' + fmtInt(est) +
        '，偏差 ' + errTxt + '（理论标准差 0.81%）。同样的活，HashSet 要 ' + fmtBytes(hs) + '。' };
    }
    return { cls: '', text: 'HLL 运行中：内存钉死 12.29 KB，第 ' + fmtInt(n) + ' 位访客进来，它一个字节都没多花。' +
      '误差由 16384 个桶摊平，看下方曲线就知道它有多稳。' };
  }

  // ---------- 渲染 ----------
  function barPct(bytes) {
    if (bytes <= 0) return 0;
    return Math.min(100, bytes / L.budgetBytes() * 100); // 线性：小到看不见正是重点
  }
  function memLabel(bytes) {
    var over = bytes > L.budgetBytes();
    var base = fmtBytes(bytes);
    return over ? base + '（预算 ×' + trim(bytes / L.budgetBytes()) + '）' : base;
  }
  function renderMemory() {
    var hs = L.hashSetBytes(state.uniqueCount);
    var bm = L.bitmapBytes(Math.max(0, state.uniqueCount - 1));
    var hll = L.hllMemoryBytes(state.hll);
    el.fillHashset.style.width = barPct(hs) + '%';
    el.fillBitmap.style.width = barPct(bm) + '%';
    el.fillHll.style.width = barPct(hll) + '%';
    el.fillHashset.style.minWidth = hs > 0 ? '2px' : '0';
    el.fillBitmap.style.minWidth = bm > 0 ? '2px' : '0';
    el.fillHll.style.minWidth = '2px';
    el.labelHashset.textContent = memLabel(hs);
    el.labelBitmap.textContent = memLabel(bm);
    el.labelHll.textContent = memLabel(hll);
    el.rowHashset.classList.toggle('over', hs > L.budgetBytes());
    el.rowBitmap.classList.toggle('over', bm > L.budgetBytes());
    el.rowHll.classList.toggle('over', hll > L.budgetBytes());
    el.memHashset.textContent = memLabel(hs);
    el.memBitmap.textContent = memLabel(bm);
    el.memHll.textContent = memLabel(hll);
  }
  function renderStats() {
    var est = state.uniqueCount > 0 ? L.hllEstimate(state.hll) : 0;
    el.statTotal.textContent = fmtInt(state.totalRequests);
    el.statDistinct.textContent = fmtInt(state.uniqueCount);
    el.statEstimate.textContent = fmtInt(est);
    el.statErr.textContent = state.uniqueCount > 0 ? fmtPct(Math.abs(est - state.uniqueCount) / state.uniqueCount) : '—';
  }
  function streamStatusText() {
    return '目标 ' + fmtInt(state.target) + ' 访客 ｜ 已接待 ' + fmtInt(state.totalRequests) +
      ' ｜ 真实 UV ' + fmtInt(state.uniqueCount);
  }
  function updateButtons() {
    var blocked = state.streaming || (state.strategy === 'hashset' && state.oom);
    el.pour1w.disabled = blocked;
    el.pour10w.disabled = blocked;
    el.dupBtn.disabled = state.streaming;
    el.autoBtn.disabled = state.strategy === 'hashset' && state.oom && !state.streaming;
  }
  function renderAll() {
    renderStats();
    renderMemory();
    updateRegGrid();
    updateChart();
    var v = currentVerdict();
    el.verdict.textContent = v.text;
    el.verdict.className = 'verdict ' + v.cls;
    el.floodStatus.textContent = streamStatusText() + (state.streaming ? '（灌水中…）' : '');
    updateButtons();
  }

  // ---------- 图表 ----------
  function initChart() {
    var canvas = document.getElementById('chart');
    if (!window.Chart || !canvas) {
      el.chartFallback.hidden = false;
      return;
    }
    chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { datasets: [
        { label: '真实 UV', data: [], borderColor: '#58a6ff', pointRadius: 0, tension: 0 },
        { label: 'HLL 估计', data: [], borderColor: '#f0883e', pointRadius: 0, tension: 0 }
      ] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
        scales: {
          x: { type: 'logarithmic', min: 1000, max: 200000000,
               title: { display: true, text: '真实访客数（对数）', color: '#8b949e' },
               ticks: { color: '#8b949e', maxRotation: 0, autoSkip: true, maxTicksLimit: 5,
                        callback: function (v) { return axisFmt(v); } },
               grid: { color: '#21262d' } },
          y: { type: 'logarithmic', min: 1, max: 1000000000,
               title: { display: true, text: 'UV（对数）', color: '#8b949e' },
               ticks: { color: '#8b949e', maxRotation: 0, autoSkip: true, maxTicksLimit: 6,
                        callback: function (v) { return axisFmt(v); } },
               grid: { color: '#21262d' } }
        },
        plugins: { legend: { labels: { color: '#e6edf3' } } }
      }
    });
  }
  function updateChart() {
    if (!chart) return;
    chart.data.datasets[0].data = state.chartPoints.map(function (p) { return { x: p.x, y: p.truth }; });
    chart.data.datasets[1].data = state.chartPoints.map(function (p) { return { x: p.x, y: p.est }; });
    chart.update('none');
  }

  // ---------- 重置 ----------
  function resetState(keepPreset) {
    state.hll = L.createHll();
    state.totalRequests = 0;
    state.uniqueCount = 0;
    state.seq = 0;
    state.oom = false;
    state.chartPoints = [];
    feedItems = [];
    el.streamFeed.innerHTML = '';
    if (chart) {
      chart.data.datasets[0].data = [];
      chart.data.datasets[1].data = [];
      chart.update('none');
    }
    if (!keepPreset) stopStream();
    el.marginalTicker.textContent = '灌一次试试：每一步的内存账单会出现在这里。';
    renderAll();
  }

  // ---------- 抛硬币 ----------
  function renderCoin() {
    el.coinActual.textContent = fmtInt(coinSession.flips);
    el.coinBest.textContent = String(coinSession.best);
    el.coinEstimate.textContent = fmtInt(Math.pow(2, coinSession.best));
  }

  // ---------- 事件 ----------
  el.presetRow.addEventListener('click', function (e) {
    var btn = e.target.closest('.preset-btn');
    if (!btn) return;
    Array.prototype.forEach.call(el.presetRow.children, function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    state.target = parseInt(btn.getAttribute('data-target'), 10);
    resetState();
  });
  el.strategyRow.addEventListener('click', function (e) {
    var btn = e.target.closest('.strategy-btn');
    if (!btn) return;
    Array.prototype.forEach.call(el.strategyRow.children, function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    state.strategy = btn.getAttribute('data-strategy');
    renderAll();
  });
  el.pour1w.addEventListener('click', function () { pour(10000); });
  el.pour10w.addEventListener('click', function () { pour(100000); });
  el.dupBtn.addEventListener('click', function () { pour(10000, true); });
  el.autoBtn.addEventListener('click', function () {
    if (state.streaming) { stopStream(); return; }
    startStream();
  });
  el.resetBtn.addEventListener('click', function () { resetState(); });
  el.coinFlip1.addEventListener('click', function () {
    var heads = Math.random() < 0.5;
    coinSession.flips++;
    if (heads) {
      coinSession.run++;
      if (coinSession.run > coinSession.best) {
        coinSession.best = coinSession.run;
        el.coinLog.textContent = '第 ' + coinSession.flips + ' 次：正面，连击 ' + coinSession.run +
          '！新纪录 → 2^' + coinSession.best + ' = ' + fmtInt(Math.pow(2, coinSession.best));
      } else {
        el.coinLog.textContent = '第 ' + coinSession.flips + ' 次：正面，连击 ' + coinSession.run;
      }
    } else {
      coinSession.run = 0;
      el.coinLog.textContent = '第 ' + coinSession.flips + ' 次：反面，连击清零。';
    }
    renderCoin();
  });
  el.coinReset.addEventListener('click', function () {
    coinSession = { flips: 0, best: 0, run: 0 };
    el.coinLog.textContent = '手动抛，看看连击纪录怎么爬。';
    renderCoin();
  });
  function coinAuto(k) {
    var s = L.coinFlipStats(k);
    el.coinActual.textContent = fmtInt(s.flips);
    el.coinBest.textContent = String(s.longestRun);
    el.coinEstimate.textContent = fmtInt(s.estimate);
    var logEl = el.coinAutoLog;
    logEl.textContent = '连抛 ' + fmtInt(k) + ' 次（全新一局）：最长连击 ' + s.longestRun +
      '，反推 2^' + s.longestRun + ' ≈ ' + fmtInt(s.estimate) + '，真实 ' + fmtInt(k) +
      '。多按几次，感受单局运气的波动——HLL 用 16384 个桶把这种波动摊平。';
  }
  el.coin100.addEventListener('click', function () { coinAuto(100); });
  el.coin10k.addEventListener('click', function () { coinAuto(10000); });
  el.coin1m.addEventListener('click', function () { coinAuto(1000000); });

  // ---------- 启动 ----------
  buildRegGrid();
  initChart();
  resetState(true);
})();

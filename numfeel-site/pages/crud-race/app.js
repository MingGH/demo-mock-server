/**
 * 增删改查引擎大赛 — DOM 交互 / 动画 / 编排 / 图表。
 * 依赖：engine.js（window.CR）、Chart.js（经 header.js 的 loadChartJS）
 */
(function () {
  'use strict';

  var CR = window.CR;
  var $ = function (id) { return document.getElementById(id); };

  // ========== 行为埋点（NFTrack，见 components/track.js） ==========
  // 事件清单：
  //   session_start (trackOnce) 页面加载
  //   race_run      跑完一次四引擎大赛（低频里程碑，镜像 umami）
  //   session_end   (force) 真正离页 pagehide
  if (typeof window !== 'undefined') {
    window.NF_TRACK_UMAMI_MIRROR = ['race_run', 'session_end'];
  }
  function nfTrack(name, props, opts) {
    try {
      if (window.NFTrack && typeof window.NFTrack.track === 'function') {
        window.NFTrack.track(name, props, opts);
      }
    } catch (e) { /* 埋点失败不影响功能 */ }
  }
  // 注意：header.js 是 defer 加载、track.js 由它异步注入，因此本脚本同步执行时
  // window.NFTrack 必然尚未就绪——session_start 不能在这里同步发，改到 init() 里
  // 轮询等 SDK 就绪后补发一次（trackOnce 保证同标签页只记一次）。
  var sessionStartAttempts = 0;
  function ensureSessionStart() {
    if (sessionStartAttempts < 0) return;
    if (window.NFTrack && typeof window.NFTrack.trackOnce === 'function') {
      try {
        window.NFTrack.trackOnce('session_start', {});
      } catch (e) { /* ignore */ }
      sessionStartAttempts = -1;
      return;
    }
    if (++sessionStartAttempts > 25) return; // 最多等 5 秒
    setTimeout(ensureSessionStart, 200);
  }
  window.addEventListener('pagehide', function () {
    nfTrack('session_end', { reason: 'leave' }, { force: true });
  });

  // ══════════════════════════════════════════════════════════
  // 模块一：文本文件数据库
  // ══════════════════════════════════════════════════════════

  var textEngine = CR.createTextFileEngine();
  var VISIBLE = 20;          // 文件视图渲染的前 N 行（更多用省略号 + 末尾两行）
  var currentOp = 'get';
  var insertSeq = 0;         // 插入操作的新 key 序号（k1000001 起）
  var busy = false;          // 动画进行中，防连点

  function pad7(n) { return String(n).padStart(7, '0'); }
  function randomValidKey() {
    var n = textEngine.size();
    return n === 0 ? 'k0000000' : 'k' + pad7(Math.floor(Math.random() * n));
  }

  // ── 文件视图渲染 ──

  function renderFileView() {
    var lines = textEngine.getAll();
    var n = lines.length;
    var box = $('fileBox');
    box.innerHTML = '';

    var showRows = Math.min(n, VISIBLE);
    for (var i = 0; i < showRows; i++) box.appendChild(makeRow(i, lines[i]));
    if (n > VISIBLE) {
      // 尾部展示 2 行（不够 2 行就展示 1 行），剩余的用省略行表示；
      // hidden 为 0 时不渲染 gap，避免 n=21/22 时边界行静默丢失
      var tailRows = Math.min(2, n - VISIBLE);
      var hidden = n - showRows - tailRows;
      if (hidden > 0) {
        box.appendChild(makeGapRow('… 中间 ' + hidden.toLocaleString() + ' 行未展示 …'));
      }
      for (i = n - tailRows; i < n; i++) box.appendChild(makeRow(i, lines[i]));
    }

    updateFileStats();
  }

  function makeRow(idx, line) {
    var row = document.createElement('div');
    row.className = 'file-row';
    row.dataset.idx = idx;
    var sep = line.indexOf('|');
    var key = line.substring(0, sep);
    var val = line.substring(sep + 1);
    row.innerHTML =
      '<span class="ln">' + String(idx + 1).padStart(2, '0') + '</span>' +
      '<span class="kv"><span class="key-part">' + escapeHtml(key) + '</span>|' +
      '<span class="val-part">' + escapeHtml(val) + '</span></span>';
    return row;
  }

  function makeGapRow(text) {
    var row = document.createElement('div');
    row.className = 'file-row gap';
    row.textContent = text;
    return row;
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** 全文件重写的可视化：所有可见行短暂变绿，表示「整个文件刚被重写」。 */
  function flashWholeFile() {
    var rows = document.querySelectorAll('#fileBox .file-row[data-idx]');
    rows.forEach(function (row) { row.classList.add('written'); });
    setTimeout(function () {
      rows.forEach(function (row) { row.classList.remove('written'); });
    }, 1100);
  }

  function updateFileStats() {
    $('fsRows').textContent = textEngine.size().toLocaleString();
    $('fsBytes').textContent = CR.formatBytes(textEngine.bytes());
    $('fsWritten').textContent = textEngine.writtenCount().toLocaleString();
  }

  // ── 操作台 ──

  var OP_LABELS = {
    get: '要查的 key',
    update: '要改的 key',
    delete: '要删的 key',
    insert: '新行自动生成 key'
  };

  function setOp(op) {
    if (busy) return; // 动画期间锁定操作台，防 setTimeout 回调交叉污染
    currentOp = op;
    document.querySelectorAll('.op-tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.op === op);
    });
    var input = $('keyInput');
    $('keyLabel').textContent = OP_LABELS[op];
    if (op === 'insert') {
      input.value = 'k' + pad7(1000000 + insertSeq + 1);
      input.disabled = true;
      input.dataset.auto = '1';
    } else {
      input.disabled = false;
      if (!isValidKeyFormat(input.value) || input.dataset.auto === '1') {
        input.value = randomValidKey();
        input.dataset.auto = '1';
      }
    }
  }

  function isValidKeyFormat(s) { return /^k\d{1,7}$/.test(s); }

  function clearResult() {
    $('opResult').innerHTML = '';
  }

  function resultStep(cls, icon, text) {
    var div = document.createElement('div');
    div.className = 'step ' + cls;
    div.innerHTML = '<i class="ti ti-' + icon + '"></i><span>' + text + '</span>';
    $('opResult').appendChild(div);
    return div;
  }

  function resultHitLine(text) {
    var div = document.createElement('div');
    div.className = 'hit-line';
    div.textContent = text;
    $('opResult').appendChild(div);
  }

  // ── 查询：逐行扫描动画 ──

  function runGet(key) {
    var r = textEngine.get(key);
    var rows = [];
    document.querySelectorAll('#fileBox .file-row[data-idx]').forEach(function (row) {
      var idx = parseInt(row.dataset.idx, 10);
      if (idx < r.scanned) rows.push(row);
    });

    // 行号一律取元素自身 dataset.idx + 1：带省略号时 DOM 末尾两行是真实行号
    // n-1/n，按元素序号数会显示成第 21/22 行
    function rowNo(row) { return parseInt(row.dataset.idx, 10) + 1; }
    var scanStep = resultStep('step-reading', 'scan-eye', '逐行扫描中…');
    var i = 0;

    function step() {
      if (i > 0) rows[i - 1].classList.remove('scanning');
      if (i < rows.length) {
        rows[i].classList.add('scanning');
        i++;
        scanStep.querySelector('span').textContent =
          '逐行扫描中… 第 ' + rowNo(rows[i - 1]).toLocaleString() + ' 行';
        setTimeout(step, i < 6 ? 50 : 16);
      } else if (rows.length > 0 && r.scanned > rowNo(rows[rows.length - 1])) {
        // 命中行在未渲染区域：从最后可见行的真实行号快进
        raceNumber(rowNo(rows[rows.length - 1]), r.scanned, 550, function (v) {
          scanStep.querySelector('span').textContent = '快进扫描中… ' + v.toLocaleString() + ' / ' + r.scanned.toLocaleString() + ' 行';
        }, function () { finishGet(r, key); });
      } else {
        finishGet(r, key);
      }
    }
    step();
  }

  /** 清掉所有可见行上的扫描高亮。 */
  function clearScanning() {
    document.querySelectorAll('#fileBox .file-row.scanning').forEach(function (row) {
      row.classList.remove('scanning');
    });
  }

  function finishGet(r, key) {
    clearScanning();
    if (r.found) {
      var hitRow = document.querySelector('#fileBox .file-row[data-idx="' + (r.scanned - 1) + '"]');
      if (hitRow) hitRow.classList.add('hit');
      resultStep('step-done', 'circle-check', '命中！本次查询扫描了 <b class="hl-red">' + r.scanned.toLocaleString() + '</b> 行');
      resultHitLine(key + ' → ' + r.value);
    } else {
      resultStep('step-done', 'circle-x', '未命中：扫完全部 <b class="hl-red">' + r.scanned.toLocaleString() + '</b> 行，没有这个 key');
    }
    busy = false;
  }

  // ── 插入：追加一行 ──

  function runInsert() {
    var key = 'k' + pad7(1000000 + (++insertSeq));
    var value = CR.valueOf(Math.floor(Math.random() * 1000000));
    resultStep('step-writing', 'arrow-down-to-line', '在文件末尾追加 1 行（不用动其他行）');
    setTimeout(function () {
      textEngine.insert(key, value);
      renderFileView();
      var lastRow = document.querySelector('#fileBox .file-row[data-idx]:last-of-type');
      if (lastRow) lastRow.classList.add('written');
      resultStep('step-done', 'circle-check', '插入完成：只写了 <b class="hl-green">1</b> 行 —— 追加是文本文件最友好的操作');
      resultHitLine(key + ' → ' + value);
      $('keyInput').value = 'k' + pad7(1000000 + insertSeq + 1);
      busy = false;
    }, 450);
  }

  // ── 更新 / 删除：读全文件 → 定位 → 全量重写 ──

  function runRewrite(op, key) {
    var size = textEngine.size();
    var reading = resultStep('step-reading', 'file-scan', '读整个文件（' + size.toLocaleString() + ' 行）找目标行…');
    var rows = document.querySelectorAll('#fileBox .file-row[data-idx]');
    var i = 0;

    function step() {
      if (i > 0) rows[i - 1].classList.remove('scanning');
      if (i < rows.length) {
        rows[i].classList.add('scanning');
        i++;
        setTimeout(step, 14);
      } else {
        clearScanning();
        reading.querySelector('span').textContent = '读完了整个文件（' + size.toLocaleString() + ' 行）';
        doRewrite();
      }
    }

    function doRewrite() {
      if (op === 'update') {
        var newValue = CR.valueOf(Math.floor(Math.random() * 1000000));
        var ok = textEngine.update(key, newValue);
        if (!ok) {
          resultStep('step-done', 'circle-x', '目标行不存在，文件原样写回');
          busy = false;
          return;
        }
        var after = textEngine.size();
        resultStep('step-writing', 'file-symlink',
          '改了 1 行，但要<b class="hl-red">整个文件重写</b>：' + after.toLocaleString() + ' 行');
        setTimeout(function () {
          renderFileView();
          flashWholeFile();
          resultStep('step-done', 'circle-check',
            '更新完成：写放大 ×<b class="hl-red">' + after.toLocaleString() + '</b>（改 1 行 = 写 ' + after.toLocaleString() + ' 行）');
          resultHitLine(key + ' → ' + newValue);
          busy = false;
        }, 600);
      } else {
        var existed = textEngine.remove(key);
        if (!existed) {
          resultStep('step-done', 'circle-x', '目标行不存在，文件原样写回');
          busy = false;
          return;
        }
        var afterDel = textEngine.size();
        resultStep('step-writing', 'file-symlink',
          '删了 1 行，但要<b class="hl-red">整个文件重写</b>：' + afterDel.toLocaleString() + ' 行');
        setTimeout(function () {
          renderFileView();
          flashWholeFile();
          resultStep('step-done', 'circle-check',
            '删除完成：改 1 行 = 写 ' + afterDel.toLocaleString() + ' 行');
          busy = false;
        }, 600);
      }
    }

    step();
  }

  // ── 执行入口 ──

  function runOp() {
    if (busy) return;
    busy = true;
    clearResult();
    var key = $('keyInput').value.trim();
    if (currentOp === 'insert') {
      runInsert();
      return;
    }
    if (!isValidKeyFormat(key)) {
      resultStep('step-done', 'alert-circle', 'key 格式应为 k + 数字（如 k0000042）');
      busy = false;
      return;
    }
    if (currentOp === 'get') runGet(key);
    else runRewrite(currentOp, key);
  }

  // ── 数据量切换 ──

  function loadDataset(n) {
    if (busy) return; // 动画期间禁止重载：insert/update 的延时回调会写到新数据上
    textEngine.loadSeed(n);
    renderFileView();
    var input = $('keyInput');
    input.value = randomValidKey();
    input.dataset.auto = '1';
    document.querySelectorAll('.load-preset').forEach(function (b) {
      b.classList.toggle('active', parseInt(b.dataset.n, 10) === n);
    });
    var notes = {
      8: '文件很小，怎么玩都快',
      100: '100 行：查询平均扫 50 行',
      1000: '1,000 行：每次更新要重写 1,000 行',
      10000: '10,000 行：查询最坏扫 10,000 行，更新重写 10,000 行'
    };
    $('loadNote').textContent = notes[n] || '';
  }

  // ── 数字快进动画（供扫描计数用） ──

  function raceNumber(from, to, duration, onTick, onDone) {
    var start = null;
    function frame(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      onTick(Math.round(from + (to - from) * eased));
      if (p < 1) requestAnimationFrame(frame);
      else onDone();
    }
    requestAnimationFrame(frame);
  }

  // ══════════════════════════════════════════════════════════
  // 模块二：四引擎大赛
  // ══════════════════════════════════════════════════════════

  var raceScale = 100;
  var raceOp = 'get';
  var raceBusy = false;
  var idbSupported = typeof indexedDB !== 'undefined';
  var lastResults = null;   // 最近一次大赛结果（数组，按引擎顺序）
  var barChart = null;
  var curveChart = null;
  var curveData = null;     // { scales: [..], byEngine: { text: [..], ... } }
  var OP_CN = { get: '查询', update: '更新', insert: '插入', delete: '删除' };

  var BACKEND_ENGINES = ['text', 'mysql', 'caffeine'];

  // ── IndexedDB 引擎（跑在用户浏览器里） ──

  function idbOpen() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open('crud-race', 1);
      req.onupgradeneeded = function () {
        req.result.createObjectStore('kv', { keyPath: 'k' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('IndexedDB open failed')); };
    });
  }

  /** 重建数据：清空 store 后在单个事务里灌入 count 条 seed（同一份 keyOf/valueOf 数据）。 */
  function idbReset(db, count) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('kv', 'readwrite');
      var store = tx.objectStore('kv');
      store.clear();
      for (var i = 0; i < count; i++) {
        store.put({ k: CR.keyOf(i), v: CR.valueOf(i) });
      }
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error || new Error('IndexedDB reset failed')); };
    });
  }

  function idbSingleOp(db, op, count, i) {
    return new Promise(function (resolve) {
      var mode = (op === 'get') ? 'readonly' : 'readwrite';
      var tx = db.transaction('kv', mode);
      var store = tx.objectStore('kv');
      var req;
      if (op === 'get') {
        req = store.get(CR.keyOf(Math.floor(Math.random() * count)));
        req.onsuccess = function () { resolve(!!req.result); };
      } else if (op === 'update') {
        // IndexedDB 的 put 是盲写（不返回受影响行数），按命中计
        req = store.put({ k: CR.keyOf(Math.floor(Math.random() * count)), v: CR.valueOf(Math.floor(Math.random() * 1000000)) });
        req.onsuccess = function () { resolve(true); };
      } else if (op === 'insert') {
        req = store.put({ k: CR.keyOf(1000000 + i), v: CR.valueOf(Math.floor(Math.random() * 1000000)) });
        req.onsuccess = function () { resolve(true); };
      } else {
        req = store.delete(CR.keyOf(Math.floor(Math.random() * count)));
        req.onsuccess = function () { resolve(true); };
      }
      req.onerror = function () { resolve(false); };
    });
  }

  /** IndexedDB 一轮基准：结构对齐后端 RunResult。跑完立即关闭连接，避免泄漏。 */
  function idbRun(count, op, ops) {
    var db = null;
    var t0 = performance.now();
    function closeDb() { try { if (db) db.close(); } catch (e) { /* ignore */ } }
    return idbOpen()
      .then(function (d) {
        db = d;
        return idbReset(db, count);
      })
      .then(function () {
        var resetMs = performance.now() - t0;
        var t1 = performance.now();
        var ok = 0;
        var seq = Promise.resolve();
        for (var i = 0; i < ops; i++) {
          (function (idx) {
            seq = seq.then(function () {
              return idbSingleOp(db, op, count, idx).then(function (hit) {
                if (hit) ok++;
              });
            });
          })(i);
        }
        return seq.then(function () {
          var totalMs = performance.now() - t1;
          var result = {
            engine: 'indexeddb', op: op, count: count, ops: ops, okCount: ok,
            resetMs: resetMs, totalMs: totalMs,
            avgUs: totalMs * 1000 / ops,
            qps: ops / (totalMs / 1000),
            dataSizeBytes: null
          };
          closeDb();
          return result;
        });
      })
      .catch(function (err) {
        closeDb();
        throw err;
      });
  }

  // ── 大赛编排 ──

  function setProgress(pct, text) {
    $('raceProgress').style.display = 'block';
    $('raceProgressFill').style.width = pct + '%';
    $('raceProgressText').textContent = text;
  }

  function hideProgress() {
    $('raceProgress').style.display = 'none';
  }

  function setRaceButtons(disabled) {
    $('raceRunBtn').disabled = disabled;
    $('curveBtn').disabled = disabled;
  }

  /**
   * 跑一轮大赛：后端三引擎串行 → IndexedDB。
   * @param {number} count 数据量
   * @param {string} op 操作
   * @param {number} ops 操作次数
   * @returns {Promise<Array>} 结果数组（每个引擎一项）
   */
  function runRace(count, op, ops) {
    var results = [];
    var steps = [];
    BACKEND_ENGINES.forEach(function (engine) {
      steps.push({
        name: CR.ENGINE_META[engine].name,
        fn: function () {
          return CR.postRun(engine, count, op, ops).then(function (r) { results.push(r); });
        }
      });
    });
    if (idbSupported) {
      steps.push({
        name: 'IndexedDB（你的浏览器）',
        fn: function () {
          return idbRun(count, op, ops).then(function (r) { results.push(r); });
        }
      });
    }
    var total = steps.length;

    var chain = Promise.resolve();
    steps.forEach(function (step, i) {
      chain = chain.then(function () {
        setProgress(i / total * 100, '正在跑 ' + step.name + '（' + (i + 1) + '/' + total + '）…');
        return step.fn();
      });
    });
    return chain.then(function () {
      setProgress(100, '完成');
      return results;
    });
  }

  function startRace() {
    if (raceBusy) return;
    raceBusy = true;
    setRaceButtons(true);
    $('raceResult').style.display = 'none';
    var count = raceScale;
    var op = raceOp;
    var ops = 200;

    runRace(count, op, ops)
      .then(function (results) {
        lastResults = results;
        renderRaceResults(results, count, op, ops);
        var textResult = results.filter(function (r) { return r.engine === 'text'; })[0];
        nfTrack('race_run', {
          count: count,
          op: op,
          engines: results.length,
          text_ms: Math.round(textResult ? textResult.totalMs : 0),
          best_engine: fastestEngine(results)
        });
        raceBusy = false;
        setRaceButtons(false);
        hideProgress();
      })
      .catch(function (err) {
        raceBusy = false;
        setRaceButtons(false);
        hideProgress();
        $('apiError').style.display = 'flex';
        $('apiErrorText').textContent = '大赛没跑完：' + (err && err.message ? err.message : '未知错误') + '。稍等一会儿再试。';
      });
  }

  function fastestEngine(results) {
    var best = '';
    var bestMs = Infinity;
    results.forEach(function (r) {
      if (r.totalMs < bestMs) { bestMs = r.totalMs; best = r.engine; }
    });
    return best;
  }

  // ── 结果渲染 ──

  /** 比赛视图与增长曲线视图互斥：比赛视图显示柱状图 + 表格。 */
  function showRaceView() {
    $('curveBlock').style.display = 'none';
    if (curveChart) { curveChart.destroy(); curveChart = null; }
    $('barBlock').style.display = 'block';
    $('tableBlock').style.display = 'block';
  }

  /** 比赛视图与增长曲线视图互斥：曲线视图显示折线图。 */
  function showCurveView() {
    $('barBlock').style.display = 'none';
    $('tableBlock').style.display = 'none';
    $('curveBlock').style.display = 'block';
  }

  function renderRaceResults(results, count, op, ops) {
    $('raceResult').style.display = 'block';
    showRaceView();

    var textResult = results.filter(function (r) { return r.engine === 'text'; })[0];
    var ratioParts = [];
    results.forEach(function (r) {
      if (r.engine === 'text') return;
      ratioParts.push(CR.ENGINE_META[r.engine].name + ' <b class="hl-green">' +
        CR.ratioText(textResult.totalMs, r.totalMs) + '</b>');
    });
    $('ratioLine').innerHTML = '「' + OP_CN[op] + ' ' + count.toLocaleString() +
      ' 条数据 × ' + ops + ' 次」：文本文件耗时 <b class="hl-red">' + CR.formatMs(textResult.totalMs) +
      '</b>，' + ratioParts.join('，') + '。';

    renderBarChart(results);
    renderResultTable(results);
  }

  /** 图表组件加载失败时的降级提示（数字结果不受影响）。 */
  function showChartFallback(containerId) {
    var wrap = $(containerId);
    if (!wrap) return;
    var canvasWrap = wrap.querySelector('.chart-canvas-wrap');
    if (canvasWrap) {
      canvasWrap.innerHTML =
        '<div style="color:#888;font-size:0.82rem;text-align:center;padding:44px 10px;">' +
        '图表组件加载失败，数字结果以表格和上方结论为准。</div>';
    }
  }

  function renderBarChart(results) {
    loadChartJS().then(function () {
      var labels = results.map(function (r) { return CR.ENGINE_META[r.engine].name; });
      var data = results.map(function (r) { return Math.max(r.totalMs, 0.01); });
      var colors = results.map(function (r) { return CR.ENGINE_META[r.engine].color; });

      if (barChart) barChart.destroy();
      barChart = new Chart($('barChart'), {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: '总耗时 (ms)',
            data: data,
            backgroundColor: colors.map(function (c) { return c + 'cc'; }),
            borderColor: colors,
            borderWidth: 1.5,
            borderRadius: 6
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              type: 'logarithmic',
              title: { display: true, text: '总耗时（毫秒，对数刻度）', color: '#888', font: { size: 11 } },
              ticks: { color: '#aaa' },
              grid: { color: 'rgba(255,255,255,0.06)' }
            },
            y: { ticks: { color: '#e4e4e4', font: { size: 12 } }, grid: { display: false } }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  var r = results[ctx.dataIndex];
                  return ' ' + CR.formatMs(r.totalMs) + '（单次 ' + CR.formatMs(r.avgUs / 1000) + '）';
                }
              }
            }
          }
        }
      });
    }).catch(function () {
      showChartFallback('barBlock');
    });
  }

  function renderResultTable(results) {
    var tbody = $('resultTable').querySelector('tbody');
    tbody.innerHTML = '';
    var textMs = null;
    results.forEach(function (r) { if (r.engine === 'text') textMs = r.totalMs; });
    var best = fastestEngine(results);

    results.forEach(function (r) {
      var meta = CR.ENGINE_META[r.engine];
      var tr = document.createElement('tr');
      if (r.engine === best) tr.className = 'winner';
      tr.innerHTML =
        '<td class="engine-name" style="color:' + meta.color + '">' + meta.name +
        (r.engine === best ? ' <i class="ti ti-crown" style="color:#ffd700"></i>' : '') + '</td>' +
        '<td><span class="where">' + meta.where + '</span>' + escapeHtml(meta.what) + '</td>' +
        '<td class="hl-gold">' + CR.formatMs(r.totalMs) +
        (r.resetMs > 5 ? '<span class="reset-note">（准备数据 ' + CR.formatMs(r.resetMs) + '，另计）</span>' : '') + '</td>' +
        '<td>' + CR.formatMs(r.avgUs / 1000) + '</td>' +
        '<td>' + CR.formatQps(r.qps) + '</td>' +
        '<td>' + (r.engine === 'text' ? '基准' : CR.ratioText(textMs, r.totalMs)) + '</td>';
      tbody.appendChild(tr);
    });
  }

  // ── 全规模增长曲线 ──

  function startCurve() {
    if (raceBusy) return;
    raceBusy = true;
    setRaceButtons(true);
    $('raceResult').style.display = 'none';

    var scales = [100, 1000, 10000, 100000];
    var op = raceOp;
    var ops = 100;
    curveData = { scales: scales, byEngine: {} };
    BACKEND_ENGINES.forEach(function (e) { curveData.byEngine[e] = []; });
    if (idbSupported) curveData.byEngine.indexeddb = [];

    var totalRuns = scales.length * (BACKEND_ENGINES.length + (idbSupported ? 1 : 0));
    var doneRuns = 0;

    var chain = Promise.resolve();
    scales.forEach(function (count) {
      BACKEND_ENGINES.forEach(function (engine) {
        chain = chain.then(function () {
          doneRuns++;
          setProgress(doneRuns / totalRuns * 100,
            '增长曲线：' + count.toLocaleString() + ' 条 · ' + CR.ENGINE_META[engine].name + '…');
          return CR.postRun(engine, count, op, ops).then(function (r) {
            curveData.byEngine[engine].push(r.totalMs);
          });
        });
      });
      if (idbSupported) {
        chain = chain.then(function () {
          doneRuns++;
          setProgress(doneRuns / totalRuns * 100,
            '增长曲线：' + count.toLocaleString() + ' 条 · IndexedDB…');
          return idbRun(count, op, ops).then(function (r) {
            curveData.byEngine.indexeddb.push(r.totalMs);
          });
        });
      }
    });

    chain.then(function () {
      hideProgress();
      setRaceButtons(false);
      raceBusy = false;
      renderCurve(op, ops);
    }).catch(function (err) {
      hideProgress();
      setRaceButtons(false);
      raceBusy = false;
      $('apiError').style.display = 'flex';
      $('apiErrorText').textContent = '增长曲线没跑完：' + (err && err.message ? err.message : '未知错误') + '。稍等一会儿再试。';
    });
  }

  function renderCurve(op, ops) {
    $('raceResult').style.display = 'block';
    showCurveView();
    $('ratioLine').innerHTML = '这是「' + OP_CN[op] + '」操作随数据量增长的真实曲线（每档 100 次操作）。' +
      '文本文件的线越来越陡——它每次都要扫全表；其他引擎靠索引/内存基本走平。';

    loadChartJS().then(function () {
      var labels = curveData.scales.map(function (s) { return s.toLocaleString(); });
      var datasets = [];
      Object.keys(curveData.byEngine).forEach(function (engine) {
        var meta = CR.ENGINE_META[engine];
        datasets.push({
          label: meta.name,
          data: curveData.byEngine[engine].map(function (ms) { return Math.max(ms, 0.01); }),
          borderColor: meta.color,
          backgroundColor: meta.color,
          tension: 0.25,
          pointRadius: 4
        });
      });
      if (curveChart) curveChart.destroy();
      curveChart = new Chart($('curveChart'), {
        type: 'line',
        data: { labels: labels, datasets: datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              type: 'logarithmic',
              title: { display: true, text: '100 次操作总耗时（毫秒，对数刻度）', color: '#888', font: { size: 11 } },
              ticks: { color: '#aaa' },
              grid: { color: 'rgba(255,255,255,0.06)' }
            },
            x: {
              title: { display: true, text: '数据量（条）', color: '#888', font: { size: 11 } },
              ticks: { color: '#aaa' },
              grid: { color: 'rgba(255,255,255,0.06)' }
            }
          },
          plugins: {
            legend: { labels: { color: '#e4e4e4' } },
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  return ' ' + ctx.dataset.label + '：' + CR.formatMs(ctx.parsed.y);
                }
              }
            }
          }
        }
      });
    }).catch(function () {
      showChartFallback('curveBlock');
    });
  }

  // ── 复制结果 ──

  function copyResults() {
    if (!lastResults) return;
    var lines = ['增删改查引擎大赛 · ' + lastResults[0].op + ' × ' + lastResults[0].count.toLocaleString() + ' 条 × ' + lastResults[0].ops + ' 次'];
    lastResults.forEach(function (r) {
      lines.push(CR.ENGINE_META[r.engine].name + '：' + CR.formatMs(r.totalMs) + '（单次 ' + CR.formatMs(r.avgUs / 1000) + '，' + CR.formatQps(r.qps) + '）');
    });
    lines.push('https://numfeel.996.ninja/pages/crud-race/');
    var text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        flashCopyBtn();
      }, function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); flashCopyBtn(); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }

  var COPY_BTN_HTML = '<i class="ti ti-copy"></i> 复制比赛结果';
  var copyBtnTimer = null;
  function flashCopyBtn() {
    // 用固定文案恢复 + 清掉旧定时器，避免连点时把「已复制」快照当成原始文案
    if (copyBtnTimer) clearTimeout(copyBtnTimer);
    $('copyBtn').innerHTML = '<i class="ti ti-check"></i> 已复制';
    copyBtnTimer = setTimeout(function () {
      $('copyBtn').innerHTML = COPY_BTN_HTML;
      copyBtnTimer = null;
    }, 1500);
  }

  // ══════════════════════════════════════════════════════════
  // 初始化
  // ══════════════════════════════════════════════════════════

  function bindEvents() {
    document.querySelectorAll('.op-tab').forEach(function (t) {
      t.addEventListener('click', function () { setOp(t.dataset.op); });
    });
    $('opRunBtn').addEventListener('click', runOp);
    $('keyInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') runOp();
    });
    $('keyInput').addEventListener('input', function () {
      $('keyInput').dataset.auto = '0';
    });
    document.querySelectorAll('.load-preset').forEach(function (b) {
      b.addEventListener('click', function () { loadDataset(parseInt(b.dataset.n, 10)); });
    });

    document.querySelectorAll('#scalePresets .scale-preset').forEach(function (b) {
      b.addEventListener('click', function () {
        raceScale = parseInt(b.dataset.count, 10);
        document.querySelectorAll('#scalePresets .scale-preset').forEach(function (x) {
          x.classList.toggle('active', x === b);
        });
      });
    });
    document.querySelectorAll('#raceOpTabs .scale-preset').forEach(function (b) {
      b.addEventListener('click', function () {
        raceOp = b.dataset.op;
        document.querySelectorAll('#raceOpTabs .scale-preset').forEach(function (x) {
          x.classList.toggle('active', x === b);
        });
      });
    });
    $('raceRunBtn').addEventListener('click', startRace);
    $('curveBtn').addEventListener('click', startCurve);
    $('copyBtn').addEventListener('click', copyResults);
  }

  function init() {
    // session_start 埋点：SDK 由 defer 的 header.js 异步注入，等它就绪后补发
    ensureSessionStart();

    // 模块一：零门槛启动
    loadDataset(8);
    setOp('get');
    bindEvents();

    // 模块二：先探活，再自动跑一轮小规模大赛
    CR.fetchStatus().then(function (status) {
      var engines = BACKEND_ENGINES.filter(function (e) {
        return !status || !status[e] || status[e].available !== false;
      });
      if (engines.length < BACKEND_ENGINES.length) {
        BACKEND_ENGINES = engines;
      }
      startRace();
    }).catch(function () {
      $('apiError').style.display = 'flex';
      $('apiErrorText').textContent = '后端暂时连不上，大赛跑不了。模块一不受影响，可以先玩上面的。';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

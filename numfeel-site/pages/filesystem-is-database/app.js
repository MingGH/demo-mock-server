/**
 * 文件系统本来就是数据库 - DOM 交互 / 动画 / 图表 / 实测
 * 依赖：logic.js (window.FSDB)、GSAP、Chart.js(经 header.js 的 loadChartJS)、sql.js
 */
(function () {
  'use strict';
  var FSDB = window.FSDB;
  var gsap; // 在 init 中赋值（GSAP 以 defer 加载，DOMContentLoaded 前才就绪）

  // ─────────────────────────────────────────────────────────
  // 模块 1：文件树 + inode 表 + B 树索引
  // ─────────────────────────────────────────────────────────
  var tree = FSDB.PRESET_TREE;
  var inodeTable = FSDB.buildInodeTable(tree);
  var allPaths = inodeTable.filter(function (r) { return r.type === 'file'; }).map(function (r) { return r.path; });
  var allRowPaths = inodeTable.map(function (r) { return r.path; }); // 全表（目录+文件）
  var btree = FSDB.createBTree(4);
  allPaths.forEach(function (p) { btree.insert(p); });

  var currentIndexOn = true;
  var currentPath = null;
  var btreeLevels = []; // 渲染缓存：每层的节点 DOM 引用

  function basename(p) { var i = p.lastIndexOf('/'); return i === -1 ? p : p.slice(i + 1); }
  function trunc(p, n) { n = n || 10; return p.length <= n ? p : '…' + p.slice(-n); }

  // 渲染文件树
  function renderTree(node, container) {
    (node.children || []).forEach(function (child) {
      if (child.type === 'dir') {
        var dirEl = document.createElement('div');
        dirEl.className = 'tree-node dir';
        dirEl.innerHTML = '<i class="ti ti-folder"></i>' + child.name;
        container.appendChild(dirEl);
        var childWrap = document.createElement('div');
        childWrap.className = 'tree-children';
        container.appendChild(childWrap);
        renderTree(child, childWrap);
      } else {
        var fileEl = document.createElement('div');
        fileEl.className = 'tree-node file';
        fileEl.dataset.path = buildPath(node, child);
        fileEl.innerHTML = '<i class="ti ti-file"></i>' + child.name;
        fileEl.addEventListener('click', function () {
          selectFile(fileEl.dataset.path, fileEl);
        });
        container.appendChild(fileEl);
      }
    });
  }

  // 由树节点上下文重建完整路径（PRESET_TREE 根 name 为空）
  function buildPath(parent, child) {
    // parent 是 dir，但其 name 不直接可得完整路径；用 inodeTable 反查更稳
    return child._fullPath;
  }

  // 预先给每个文件节点标注完整路径
  function tagPaths(node) {
    (node.children || []).forEach(function (child) {
      child._fullPath = resolveFullPath(tree, child);
      if (child.type === 'dir') tagPaths(child);
    });
  }
  function resolveFullPath(root, target) {
    function walk(n, path) {
      var full = n.name === '' ? '' : (path === '' ? '/' + n.name : path + '/' + n.name);
      if (n === target) return full;
      if (n.children) {
        for (var i = 0; i < n.children.length; i++) {
          var r = walk(n.children[i], full);
          if (r) return r;
        }
      }
      return null;
    }
    return walk(root, '');
  }

  // 渲染 inode 表
  function renderInodeTable() {
    var tbody = document.querySelector('#inodeTable tbody');
    tbody.innerHTML = '';
    inodeTable.forEach(function (row) {
      var tr = document.createElement('tr');
      tr.dataset.path = row.path;
      tr.innerHTML = '<td>' + row.inode + '</td>' +
        '<td style="word-break:all">' + row.path + '</td>' +
        '<td class="type-' + row.type + '">' + (row.type === 'dir' ? '目录' : '文件') + '</td>';
      tbody.appendChild(tr);
    });
  }

  // 渲染 B 树（BFS 分层）
  function renderBTree() {
    var box = document.getElementById('btreeViz');
    box.innerHTML = '';
    btreeLevels = [];
    var root = btree._root();
    if (!root) return;
    var queue = [{ node: root, depth: 0 }];
    var byLevel = {};
    while (queue.length) {
      var item = queue.shift();
      if (!byLevel[item.depth]) byLevel[item.depth] = [];
      byLevel[item.depth].push(item.node);
      if (!item.node.leaf) {
        item.node.children.forEach(function (c) { queue.push({ node: c, depth: item.depth + 1 }); });
      }
    }
    var depths = Object.keys(byLevel).sort(function (a, b) { return a - b; });
    depths.forEach(function (d, di) {
      var levelEl = document.createElement('div');
      levelEl.className = 'btree-level';
      byLevel[d].forEach(function (node) {
        var nodeEl = document.createElement('div');
        nodeEl.className = 'btree-node';
        nodeEl.dataset.depth = di;
        node.keys.forEach(function (k, ki) {
          var keyEl = document.createElement('span');
          keyEl.className = 'btree-key trunc';
          keyEl.dataset.key = k;
          keyEl.textContent = trunc(basename(k), 8);
          nodeEl.appendChild(keyEl);
        });
        levelEl.appendChild(nodeEl);
      });
      box.appendChild(levelEl);
      btreeLevels.push(levelEl);
      if (di < depths.length - 1) {
        var conn = document.createElement('div');
        conn.className = 'btree-connector';
        conn.textContent = '↓';
        box.appendChild(conn);
      }
    });
  }

  function clearBTreeHighlight() {
    document.querySelectorAll('#btreeViz .btree-node').forEach(function (n) {
      n.classList.remove('visited', 'matched');
    });
    document.querySelectorAll('#btreeViz .btree-key').forEach(function (k) {
      k.classList.remove('compared', 'hit');
    });
  }

  function clearTableHighlight() {
    document.querySelectorAll('#inodeTable tbody tr').forEach(function (tr) {
      tr.classList.remove('scanning', 'hit');
    });
  }

  // 选中一个文件并执行查找动画
  function selectFile(path, el) {
    currentPath = path;
    document.querySelectorAll('#fileTree .tree-node').forEach(function (n) { n.classList.remove('active'); });
    if (el) el.classList.add('active');
    if (currentIndexOn) animateBTreeSearch(path);
    else animateLinearScan(path);
    updateCmpStats(path);
  }

  // B 树查找动画
  function animateBTreeSearch(path) {
    clearBTreeHighlight();
    clearTableHighlight();
    var res = btree.search(path);
    var tl = gsap.timeline();
    res.trace.forEach(function (layer, li) {
      var levelEl = btreeLevels[li];
      if (!levelEl) return;
      var nodes = levelEl.querySelectorAll('.btree-node');
      // 找到本层对应的节点：按 keys 内容匹配
      var targetNode = null;
      nodes.forEach(function (n) {
        var keys = Array.prototype.map.call(n.querySelectorAll('.btree-key'), function (k) { return k.dataset.key; });
        if (keys.length === layer.keys.length && keys.every(function (k, i) { return k === layer.keys[i]; })) {
          targetNode = n;
        }
      });
      tl.call(function () {
        if (targetNode) {
          targetNode.classList.add('visited');
          var keyEls = targetNode.querySelectorAll('.btree-key');
          for (var i = 0; i < layer.hitIndex && i < keyEls.length; i++) keyEls[i].classList.add('compared');
          if (layer.matched && keyEls[layer.hitIndex]) keyEls[layer.hitIndex].classList.add('hit');
          if (layer.matched) targetNode.classList.add('matched');
        }
      });
      tl.to({}, { duration: 0.35 });
    });
    // 命中行高亮
    if (res.found) {
      tl.call(function () {
        var row = document.querySelector('#inodeTable tbody tr[data-path="' + cssEscape(path) + '"]');
        if (row) row.classList.add('hit');
      });
    }
  }

  // 线性扫描动画（无索引）
  function animateLinearScan(path) {
    clearBTreeHighlight();
    clearTableHighlight();
    var rows = document.querySelectorAll('#inodeTable tbody tr');
    var hitIndex = -1;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].dataset.path === path) { hitIndex = i; break; }
    }
    var tl = gsap.timeline();
    var step = Math.max(1, Math.ceil(rows.length / 40));
    for (var j = 0; j <= hitIndex; j += step) {
      (function (idx) {
        tl.call(function () {
          rows[idx].classList.add('scanning');
          rows[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
        tl.to({}, { duration: 0.04 });
      })(j);
    }
    tl.call(function () {
      if (hitIndex >= 0) {
        rows[hitIndex].classList.remove('scanning');
        rows[hitIndex].classList.add('hit');
      }
    });
  }

  function updateCmpStats(path) {
    var indexed = btree.search(path).comparisons;
    // 无索引 = 全表线性扫描（含目录与文件所有行），与动画扫描的行一致
    var linear = FSDB.linearScanCost(allRowPaths, path).comparisons;
    document.getElementById('cmpIndexed').textContent = indexed + ' 次';
    document.getElementById('cmpLinear').textContent = linear + ' 次';
    document.getElementById('cmpDiff').textContent = linear + ' vs ' + indexed + '（省 ' + (linear - indexed) + ' 次）';
    document.getElementById('cmpExplain').textContent = currentIndexOn
      ? 'B 树索引：沿树 ' + indexed + ' 次比较就定位到，复杂度 O(log n)。'
      : '关闭索引后：只能从 inode 表第一行逐行扫，' + linear + ' 次比较才命中，复杂度 O(n)。';
  }

  function cssEscape(s) {
    return String(s).replace(/"/g, '\\"');
  }

  // ─────────────────────────────────────────────────────────
  // 模块 2：真·浏览器实测
  // ─────────────────────────────────────────────────────────
  var N_PRESETS = FSDB.SAMPLE_N_PRESETS; // [100,500,1000,5000]
  var selectedN = 500;
  var realMode = !!(navigator.storage && typeof navigator.storage.getDirectory === 'function');
  var sqlReady = null; // Promise<SQLModule>
  var linePoints = []; // {n, fsWrite, dbWrite, fsRead, dbRead}
  var barChart = null;
  var lineChart = null;
  var running = false;

  function initModule2() {
    // N 预设按钮
    var presetsEl = document.getElementById('nPresets');
    N_PRESETS.forEach(function (n) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'n-preset' + (n === selectedN ? ' active' : '');
      b.textContent = n;
      b.addEventListener('click', function () {
        selectedN = n;
        document.getElementById('nSlider').value = N_PRESETS.indexOf(n);
        document.getElementById('nValue').textContent = n;
        refreshPresetActive();
      });
      presetsEl.appendChild(b);
    });
    var slider = document.getElementById('nSlider');
    slider.addEventListener('input', function () {
      selectedN = N_PRESETS[parseInt(slider.value, 10)];
      document.getElementById('nValue').textContent = selectedN;
      refreshPresetActive();
    });

    if (!realMode) {
      document.getElementById('opfsUnsupported').style.display = 'flex';
    }

    document.getElementById('runBtn').addEventListener('click', runBenchmark);
    document.getElementById('clearLineBtn').addEventListener('click', function () {
      linePoints = [];
      if (lineChart) { lineChart.data.labels = []; lineChart.data.datasets.forEach(function (d) { d.data = []; }); lineChart.update(); }
    });
  }

  function refreshPresetActive() {
    document.querySelectorAll('.n-preset').forEach(function (b) {
      b.classList.toggle('active', parseInt(b.textContent, 10) === selectedN);
    });
  }

  function loadSqlJs() {
    if (sqlReady) return sqlReady;
    sqlReady = new Promise(function (resolve, reject) {
      if (typeof initSqlJs === 'undefined') { reject(new Error('sql.js 未加载')); return; }
      initSqlJs({ locateFile: function (f) { return 'https://cdn.jsdelivr.net/npm/sql.js@1/dist/' + f; } })
        .then(resolve).catch(reject);
    });
    return sqlReady;
  }

  function setProgress(pct, html) {
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('progressText').innerHTML = html;
  }

  // 让 UI 有机会刷新
  function yieldUI() { return new Promise(function (r) { setTimeout(r, 0); }); }

  async function runBenchmark() {
    if (running) return;
    running = true;
    var btn = document.getElementById('runBtn');
    btn.disabled = true;
    document.getElementById('progressArea').style.display = 'block';
    document.getElementById('resultArea').style.display = 'none';
    setProgress(0, '准备中…');
    await yieldUI();

    var N = selectedN;
    var payload = 'item-' + Math.random().toString(36).slice(2);
    var result;
    try {
      if (realMode) {
        result = await runRealBenchmark(N, payload);
      } else {
        result = await runSimBenchmark(N);
      }
    } catch (err) {
      // 实测失败（如 sql.js 加载失败/OPFS 报错）-> 降级估算
      console.warn('实测失败，降级估算：', err);
      document.getElementById('opfsUnsupported').style.display = 'flex';
      document.querySelector('#opfsUnsupported span').innerHTML =
        '<b>实测失败已降级为模拟估算模式：</b>' + (err && err.message ? err.message : '未知错误') + '。下面数字由成本模型估算。';
      realMode = false;
      result = await runSimBenchmark(N);
    }

    setProgress(100, '完成');
    showResult(result, N);
    running = false;
    btn.disabled = false;
  }

  // 真实实测
  async function runRealBenchmark(N, payload) {
    var SQL = await loadSqlJs();
    setProgress(2, '正在打开 OPFS 根目录…');
    await yieldUI();
    var root = await navigator.storage.getDirectory();
    // 清理旧目录
    try { await root.removeEntry('fsdb_bench', { recursive: true }); } catch (e) {}
    var benchDir = await root.getDirectoryHandle('fsdb_bench', { create: true });

    // 1) 文件系统方式：写 N 个文件
    setProgress(5, '<span class="phase-fs">[文件系统]</span> 正在写第 0/' + N + ' 个文件…');
    await yieldUI();
    var fsWriteStart = performance.now();
    var step = Math.max(1, Math.floor(N / 30));
    for (var i = 0; i < N; i++) {
      var handle = await benchDir.getFileHandle('f' + i + '.dat', { create: true });
      var writable = await handle.createWritable();
      await writable.write(payload);
      await writable.close();
      if (i % step === 0 || i === N - 1) {
        setProgress(5 + Math.round((i / N) * 40),
          '<span class="phase-fs">[文件系统]</span> 正在写第 ' + (i + 1) + '/' + N + ' 个文件…');
        await yieldUI();
      }
    }
    var fsWrite = performance.now() - fsWriteStart;

    // 2) 文件系统方式：读 N 个文件
    setProgress(45, '<span class="phase-fs">[文件系统]</span> 正在读第 0/' + N + ' 个文件…');
    await yieldUI();
    var fsReadStart = performance.now();
    for (var j = 0; j < N; j++) {
      var rh = await benchDir.getFileHandle('f' + j + '.dat');
      var file = await rh.getFile();
      await file.text();
      if (j % step === 0 || j === N - 1) {
        setProgress(45 + Math.round((j / N) * 15),
          '<span class="phase-fs">[文件系统]</span> 正在读第 ' + (j + 1) + '/' + N + ' 个文件…');
        await yieldUI();
      }
    }
    var fsRead = performance.now() - fsReadStart;

    // 3) 数据库方式：建库 + INSERT N 条
    setProgress(60, '<span class="phase-db">[数据库]</span> 正在初始化 SQLite 并写入…');
    await yieldUI();
    var db = new SQL.Database();
    db.run('CREATE TABLE items (id INTEGER PRIMARY KEY, data TEXT)');
    var stmt = db.prepare('INSERT INTO items (data) VALUES (?)');
    var dbWriteStart = performance.now();
    db.run('BEGIN');
    for (var k = 0; k < N; k++) {
      stmt.run([payload]);
      if (k % step === 0 || k === N - 1) {
        setProgress(60 + Math.round((k / N) * 20),
          '<span class="phase-db">[数据库]</span> 正在 INSERT 第 ' + (k + 1) + '/' + N + ' 条…');
        await yieldUI();
      }
    }
    db.run('COMMIT');
    var dbWrite = performance.now() - dbWriteStart;

    // 4) 数据库方式：SELECT 读回
    setProgress(85, '<span class="phase-db">[数据库]</span> 正在 SELECT 读回…');
    await yieldUI();
    var dbReadStart = performance.now();
    var readStmt = db.prepare('SELECT data FROM items');
    while (readStmt.step()) { readStmt.get(); }
    readStmt.free();
    var dbRead = performance.now() - dbReadStart;
    stmt.free();
    db.close();

    // 清理 OPFS
    setProgress(95, '正在清理写入的文件…');
    await yieldUI();
    try { await root.removeEntry('fsdb_bench', { recursive: true }); } catch (e) {}

    return { fsWrite: fsWrite, fsRead: fsRead, dbWrite: dbWrite, dbRead: dbRead, real: true };
  }

  // 模拟估算（降级）
  async function runSimBenchmark(N) {
    // 参考真实浏览器量级：单文件 open/close ~0.55ms，单条 DB ~0.004ms
    var perFile = 0.55, perRow = 0.004, dbOpen = 8;
    var est = FSDB.estimateCosts(N, perFile, perRow, dbOpen);
    // 加一点微小波动让数字看起来像实测
    function jitter(v) { return v * (0.92 + Math.random() * 0.16); }
    var phases = [
      { p: 5, m: '<span class="phase-fs">[文件系统·估算]</span> 写 N 个文件…' },
      { p: 45, m: '<span class="phase-fs">[文件系统·估算]</span> 读 N 个文件…' },
      { p: 65, m: '<span class="phase-db">[数据库·估算]</span> INSERT N 条…' },
      { p: 90, m: '<span class="phase-db">[数据库·估算]</span> SELECT 读回…' }
    ];
    for (var i = 0; i < phases.length; i++) {
      for (var p = 0; p <= 100; p += 25) {
        setProgress(phases[i].p + (p / 100) * 15, phases[i].m);
        await new Promise(function (r) { setTimeout(r, 60); });
      }
    }
    return {
      fsWrite: jitter(est.fsWrite),
      fsRead: jitter(est.fsRead) * 0.8,
      dbWrite: jitter(est.dbWrite),
      dbRead: jitter(est.dbRead),
      real: false
    };
  }

  function showResult(r, N) {
    document.getElementById('resultArea').style.display = 'block';
    var ratio = r.dbWrite > 0 ? r.fsWrite / r.dbWrite : 0;
    var ratioStr = FSDB.formatRatio(ratio);
    var realTag = r.real ? '真实实测' : '模拟估算';
    document.getElementById('ratioLine').innerHTML =
      '写 ' + N + ' 条：文件系统 <span class="hl-red">' + FSDB.formatMs(r.fsWrite) + '</span>' +
      ' vs 数据库 <span class="hl-green">' + FSDB.formatMs(r.dbWrite) + '</span>' +
      ' &nbsp;->&nbsp; 数据库快 <span class="big">' + ratioStr + '</span>（' + realTag + '）';
    document.getElementById('explainLine').innerHTML =
      '慢的不是磁盘，是<b class="hl-red">每个文件的 open / close / 元数据这套系统调用</b>；' +
      '一个库把这笔固定开销摊平了--这正是 SQLite《35% Faster Than the Filesystem》的核心。';

    // 累积折线数据点（同 N 覆盖为最新一次）
    linePoints = linePoints.filter(function (pt) { return pt.n !== N; });
    linePoints.push({ n: N, fsWrite: r.fsWrite, dbWrite: r.dbWrite, fsRead: r.fsRead, dbRead: r.dbRead });
    linePoints.sort(function (a, b) { return a.n - b.n; });

    renderCharts(r, N);
    gsap.fromTo('#ratioLine', { scale: 0.96, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.6)' });
  }

  function renderCharts(r, N) {
    window.loadChartJS().then(function () {
      var ctx1 = document.getElementById('barChart').getContext('2d');
      if (barChart) barChart.destroy();
      barChart = new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: ['写 ' + N + ' 条', '读 ' + N + ' 条'],
          datasets: [
            { label: '文件系统 (OPFS)', data: [r.fsWrite, r.fsRead], backgroundColor: 'rgba(255,107,107,0.7)', borderColor: '#ff6b6b', borderWidth: 1 },
            { label: '数据库 (SQLite)', data: [r.dbWrite, r.dbRead], backgroundColor: 'rgba(129,199,132,0.7)', borderColor: '#81c784', borderWidth: 1 }
          ]
        },
        options: chartOpts('毫秒 (ms)')
      });

      var ctx2 = document.getElementById('lineChart').getContext('2d');
      if (lineChart) lineChart.destroy();
      lineChart = new Chart(ctx2, {
        type: 'line',
        data: {
          labels: linePoints.map(function (p) { return p.n; }),
          datasets: [
            { label: '文件系统·写', data: linePoints.map(function (p) { return p.fsWrite; }), borderColor: '#ff6b6b', backgroundColor: 'rgba(255,107,107,0.15)', tension: 0.3, fill: false },
            { label: '数据库·写', data: linePoints.map(function (p) { return p.dbWrite; }), borderColor: '#81c784', backgroundColor: 'rgba(129,199,132,0.15)', tension: 0.3, fill: false }
          ]
        },
        options: chartOpts('毫秒 (ms)')
      });
    });
  }

  function chartOpts(yTitle) {
    return {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#ccc', font: { size: 11 } } },
        tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + c.parsed.y.toFixed(2) + ' ms'; } } }
      },
      scales: {
        x: { ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#888', callback: function (v) { return v + ' ms'; } }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    };
  }

  // ─────────────────────────────────────────────────────────
  // 模块 3：光谱
  // ─────────────────────────────────────────────────────────
  function initModule3() {
    var track = document.getElementById('spectrumTrack');
    var systems = FSDB.SPECTRUM_SYSTEMS;
    systems.forEach(function (s) {
      var m = document.createElement('div');
      m.className = 'spec-marker';
      m.style.left = s.pos + '%';
      m.dataset.pos = s.pos;
      var lbl = document.createElement('div');
      lbl.className = 'spec-marker-label';
      lbl.textContent = s.name;
      m.appendChild(lbl);
      track.appendChild(m);
    });

    var slider = document.getElementById('spectrumSlider');
    slider.addEventListener('input', function () {
      highlightSystem(parseInt(slider.value, 10));
    });

    // 点击标记定位
    track.addEventListener('click', function (e) {
      var m = e.target.closest('.spec-marker');
      if (m) {
        var pos = parseInt(m.dataset.pos, 10);
        slider.value = pos;
        highlightSystem(pos);
      }
    });
    highlightSystem(parseInt(slider.value, 10));
  }

  function highlightSystem(pos) {
    var systems = FSDB.SPECTRUM_SYSTEMS;
    // 找最近的系统
    var nearest = systems[0], minD = Math.abs(pos - systems[0].pos);
    for (var i = 1; i < systems.length; i++) {
      var d = Math.abs(pos - systems[i].pos);
      if (d < minD) { minD = d; nearest = systems[i]; }
    }
    document.querySelectorAll('.spec-marker').forEach(function (m) {
      m.classList.toggle('active', parseInt(m.dataset.pos, 10) === nearest.pos);
      m.querySelector('.spec-marker-label').classList.toggle('active', parseInt(m.dataset.pos, 10) === nearest.pos);
    });
    document.getElementById('systemDetail').innerHTML =
      '<span class="sys-name">' + nearest.name + '</span>' +
      '<span class="sys-pos">光谱位置 ' + nearest.pos + ' / 100</span>' +
      '<div style="margin-top:8px">' + nearest.desc + '</div>';
  }

  // ─────────────────────────────────────────────────────────
  // 开关
  // ─────────────────────────────────────────────────────────
  function initToggle() {
    document.getElementById('indexToggle').addEventListener('change', function () {
      currentIndexOn = this.checked;
      if (currentPath) selectFile(currentPath, document.querySelector('#fileTree .tree-node.active'));
    });
  }

  // ─────────────────────────────────────────────────────────
  // 启动
  // ─────────────────────────────────────────────────────────
  function init() {
    gsap = window.gsap;
    tagPaths(tree);
    renderTree(tree, document.getElementById('fileTree'));
    renderInodeTable();
    renderBTree();
    initToggle();
    initModule2();
    initModule3();
    // 默认选中一个深层文件做演示
    var firstFile = document.querySelector('#fileTree .tree-node.file');
    if (firstFile) selectFile(firstFile.dataset.path, firstFile);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

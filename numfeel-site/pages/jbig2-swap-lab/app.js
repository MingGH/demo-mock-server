/**
 * app.js - JBIG2 模板匹配替换事故演示页面（仅 DOM 绑定与渲染）
 * 纯原生 ES5，依赖 jbig2.js（算法）、pako（deflate）、Chart.js（经 header.js 懒加载）。
 */
(function () {
  'use strict';

  var JBIG2 = window.JBIG2;
  var pako = window.pako;

  // ────────────────────────────────────────────────────────────
  // 0. 全局状态与常量
  // ────────────────────────────────────────────────────────────
  var CHAR_W = 25, CHAR_H = 35, GAP = 10, T = 5;

  var SCENE_SEEDS = { floor: 1001, invoice: 2002, rx: 3003 };
  var DPI_OPTS = {
    75: { dpiScale: 0.5, noise: 0.07 },
    150: { dpiScale: 0.73, noise: 0.05 },
    300: { dpiScale: 0.9, noise: 0.04 }
  };
  var M4_AGG = 1; // m4 固定高激进度，展示整串替换
  var M5_AGG = 0.8; // m5 固定，保证 PM&S 有明显错误

  var state = {
    scene: 'floor',
    agg: 55,
    granMode: 'char',
    dictStep: 1,
    sceneData: null,
    sweepCache: null,
    chart: null,
    rafPending: false
  };

  var $ = function (id) { return document.getElementById(id); };

  // ────────────────────────────────────────────────────────────
  // 1. 字形与场景构建（与校准脚本一致，运行时复算）
  // ────────────────────────────────────────────────────────────

  function drawDigit(digit, w, h) {
    var bmp = JBIG2.createBitmap(w, h);
    var ctx = {
      fillRect: function (x, y, rw, rh) {
        for (var yy = y; yy < y + rh; yy++)
          for (var xx = x; xx < x + rw; xx++) JBIG2.setPixel(bmp, xx, yy, 1);
      }
    };
    var pad = 4, mw = w - pad * 2, mh = h - pad * 2;
    var x0 = pad, y0 = pad, x1 = x0 + mw - 1, y1 = y0 + mh - 1;
    var xm = Math.floor((x0 + x1) / 2), ym = Math.floor((y0 + y1) / 2);
    var t = T;
    function top() { ctx.fillRect(x0, y0, mw, t); }
    function upperLeft() { ctx.fillRect(x0, y0, t, Math.ceil(mh / 2)); }
    function upperRight() { ctx.fillRect(x1 - t + 1, y0, t, Math.ceil(mh / 2)); }
    function middle() { ctx.fillRect(x0, ym, mw, t); }
    function lowerLeft() { ctx.fillRect(x0, ym, t, Math.floor(mh / 2)); }
    function lowerRight() { ctx.fillRect(x1 - t + 1, ym, t, Math.floor(mh / 2)); }
    function bottom() { ctx.fillRect(x0, y1 - t + 1, mw, t); }
    function rightBar() { ctx.fillRect(x1 - t + 1, y0, t, mh); }
    switch (digit) {
      case '0': top(); upperLeft(); upperRight(); lowerLeft(); lowerRight(); bottom(); break;
      case '1': rightBar(); break;
      case '2': top(); upperRight(); middle(); lowerLeft(); bottom(); break;
      case '3': top(); upperRight(); middle(); lowerRight(); bottom(); break;
      case '4': upperLeft(); upperRight(); middle(); lowerRight(); break;
      case '5': top(); upperLeft(); middle(); lowerRight(); bottom(); break;
      case '6': top(); upperLeft(); middle(); lowerLeft(); lowerRight(); bottom(); break;
      case '7': top(); rightBar(); break;
      case '8': top(); upperLeft(); upperRight(); middle(); lowerLeft(); lowerRight(); bottom(); break;
      case '9': top(); upperLeft(); upperRight(); middle(); lowerRight(); bottom(); break;
      case '.': ctx.fillRect(x0, y1 - 9, 10, 9); break;
    }
    return bmp;
  }

  function drawText(bmp, text, x, y) {
    var gt = [];
    var cx = x;
    for (var i = 0; i < text.length; i++) {
      var d = drawDigit(text[i], CHAR_W, CHAR_H);
      for (var yy = 0; yy < CHAR_H; yy++)
        for (var xx = 0; xx < CHAR_W; xx++)
          if (JBIG2.getPixel(d, xx, yy)) JBIG2.setPixel(bmp, cx + xx, y + yy, 1);
      gt.push({ x: cx, y: y, w: CHAR_W, h: CHAR_H, label: text[i] });
      cx += CHAR_W + GAP;
    }
    return gt;
  }

  function fillRect(bmp, x, y, w, h) {
    for (var yy = y; yy < y + h; yy++)
      for (var xx = x; xx < x + w; xx++) JBIG2.setPixel(bmp, xx, yy, 1);
  }
  function vWall(bmp, x, y0, y1, skipA, skipB) {
    for (var y = y0; y <= y1; y++) {
      if (skipA !== undefined && y >= skipA && y <= skipB) continue;
      JBIG2.setPixel(bmp, x, y, 1);
    }
  }
  function hWall(bmp, y, x0, x1, skipA, skipB) {
    for (var x = x0; x <= x1; x++) {
      if (skipA !== undefined && x >= skipA && x <= skipB) continue;
      JBIG2.setPixel(bmp, x, y, 1);
    }
  }

  function buildFloor() {
    var W = 760, H = 520;
    var bmp = JBIG2.createBitmap(W, H);
    var gt = [];
    hWall(bmp, 12, 12, W - 13); hWall(bmp, H - 13, 12, W - 13);
    vWall(bmp, 12, 12, H - 13); vWall(bmp, W - 13, 12, H - 13);
    vWall(bmp, 70, 70, 300, 180, 230); vWall(bmp, 320, 70, 300);
    hWall(bmp, 70, 70, 320); hWall(bmp, 300, 70, 320);
    vWall(bmp, 360, 70, 300); vWall(bmp, 690, 70, 300, 470, 520);
    hWall(bmp, 70, 360, 690); hWall(bmp, 300, 360, 690);
    vWall(bmp, 70, 340, 490); vWall(bmp, 690, 340, 490, 570, 620);
    hWall(bmp, 340, 70, 690); hWall(bmp, 490, 70, 690);
    gt = gt.concat(drawText(bmp, '01', 92, 96));
    gt = gt.concat(drawText(bmp, '14.13', 120, 265));
    gt = gt.concat(drawText(bmp, '02', 382, 96));
    gt = gt.concat(drawText(bmp, '21.11', 470, 265));
    gt = gt.concat(drawText(bmp, '03', 92, 366));
    gt = gt.concat(drawText(bmp, '17.42', 460, 456));
    return { bmp: bmp, gt: gt, name: '建筑平面图' };
  }

  function buildInvoice() {
    var W = 460, H = 380;
    var bmp = JBIG2.createBitmap(W, H);
    var gt = [];
    fillRect(bmp, 34, 52, W - 68, 6);
    fillRect(bmp, 34, 74, W - 68, 2);
    var amounts = ['19.99', '24.50', '88.00', '120.40', '68.50', '321.39'];
    var rightX = W - 64;
    for (var i = 0; i < amounts.length; i++) {
      var y = 108 + i * 42;
      var textW = amounts[i].length * CHAR_W + (amounts[i].length - 1) * GAP;
      var x = rightX - textW;
      gt = gt.concat(drawText(bmp, amounts[i], x, y));
      if (i < amounts.length - 1) {
        for (var dx = 34; dx < W - 34; dx += 14) JBIG2.setPixel(bmp, dx, y + 31, 1);
      }
    }
    return { bmp: bmp, gt: gt, name: '发票金额' };
  }

  function buildRx() {
    var W = 460, H = 380;
    var bmp = JBIG2.createBitmap(W, H);
    var gt = [];
    fillRect(bmp, 34, 48, W - 68, 4);
    var rows = [
      { num: '250', x: 250, drugW: 130 },
      { num: '500', x: 250, drugW: 130 },
      { num: '0.5', x: 270, drugW: 150 },
      { num: '12.5', x: 270, drugW: 150 },
      { num: '8', x: 320, drugW: 150 },
      { num: '2', x: 320, drugW: 150 }
    ];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var y = 92 + i * 42;
      fillRect(bmp, 54, y + 5, r.drugW, 8);
      gt = gt.concat(drawText(bmp, r.num, r.x, y));
    }
    return { bmp: bmp, gt: gt, name: '处方剂量' };
  }

  var SCENE_BUILDERS = {
    floor: buildFloor,
    invoice: buildInvoice,
    rx: buildRx
  };

  // ────────────────────────────────────────────────────────────
  // 2. 扫描管线：模拟扫描 + 连通域切分 + 标签匹配
  // ────────────────────────────────────────────────────────────

  function pipeline(scene, scanOpts) {
    var scanned = JBIG2.simulateScan(scene.bmp, scanOpts);
    var segs = JBIG2.segment(scanned, { mode: 'char' });
    segs = segs.filter(function (s) {
      return s.w >= 4 && s.h >= 4 && JBIG2.countForeground(s.bitmap) >= 12;
    });
    var scale = scanOpts.dpiScale || 1;
    var labeled = [];
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      var cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      var best = null, bestD = 1e9;
      for (var j = 0; j < scene.gt.length; j++) {
        var g = scene.gt[j];
        var d = Math.abs((g.x + g.w / 2) * scale - cx) + Math.abs((g.y + g.h / 2) * scale - cy);
        if (d < bestD) { bestD = d; best = g; }
      }
      if (best && bestD < 10) {
        s.label = best.label;
        labeled.push(s);
      }
    }
    return { scanned: scanned, segs: labeled };
  }

  function loadScene(sceneId) {
    var scene = SCENE_BUILDERS[sceneId]();
    var opts = {
      dpiScale: 0.73,
      blur: 0,
      noise: 0.05,
      seed: SCENE_SEEDS[sceneId],
      threshold: 0.45
    };
    var p = pipeline(scene, opts);
    return { scene: scene, scanOpts: opts, scanned: p.scanned, segs: p.segs };
  }

  // ────────────────────────────────────────────────────────────
  // 3. 体积计算（deflate 注入）
  // ────────────────────────────────────────────────────────────

  function deflateFn(buf) { return pako.deflateRaw(buf); }
  function calc() { return JBIG2.createSizeCalculator(deflateFn); }

  // ────────────────────────────────────────────────────────────
  // 4. 渲染工具：二值位图 → canvas（纸感），红框定位
  // ────────────────────────────────────────────────────────────

  var INK = [28, 28, 34];
  var PAPER = [244, 241, 232];

  function drawPage(canvas, bmp) {
    canvas.width = bmp.w;
    canvas.height = bmp.h;
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(bmp.w, bmp.h);
    var d = img.data;
    for (var i = 0; i < bmp.w * bmp.h; i++) {
      var o = i * 4;
      if (bmp.data[i]) { d[o] = INK[0]; d[o + 1] = INK[1]; d[o + 2] = INK[2]; }
      else { d[o] = PAPER[0]; d[o + 1] = PAPER[1]; d[o + 2] = PAPER[2]; }
      d[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  function clearLayer(layer) {
    if (layer) layer.innerHTML = '';
  }

  /** 在 subst-layer 里按百分比坐标画红框 */
  function drawSubstBoxes(layer, subs, bmpW, bmpH) {
    clearLayer(layer);
    for (var i = 0; i < subs.length; i++) {
      var sub = subs[i];
      var el = document.createElement('div');
      el.className = 'subst-box';
      el.style.left = (sub.x / bmpW * 100) + '%';
      el.style.top = (sub.y / bmpH * 100) + '%';
      el.style.width = (sub.w / bmpW * 100) + '%';
      el.style.height = (sub.h / bmpH * 100) + '%';
      el.title = '原本 ' + sub.from + ' → 被替换成 ' + sub.to;
      el.dataset.from = sub.from;
      el.dataset.to = sub.to;
      var tip = document.createElement('span');
      tip.className = 'subst-tip';
      tip.textContent = sub.from + ' → ' + sub.to;
      el.appendChild(tip);
      layer.appendChild(el);
    }
  }

  // ────────────────────────────────────────────────────────────
  // 5. 模块一 · 犯罪现场
  // ────────────────────────────────────────────────────────────

  function encodeFor(segs, agg, refine) {
    return JBIG2.encode(segs, { aggressiveness: agg, refine: !!refine });
  }

  function renderScene() {
    var data = state.sceneData;
    var agg = state.agg / 100;
    var enc = encodeFor(data.segs, agg, false);
    var diff = JBIG2.diffSemantics(data.segs, enc);
    var recon = JBIG2.reconstruct(enc, { w: data.scanned.w, h: data.scanned.h });
    var c = calc();

    drawPage($('canvas-original'), data.scanned);
    drawPage($('canvas-decoded'), recon);
    drawSubstBoxes($('subst-layer'), diff.substitutions, data.scanned.w, data.scanned.h);

    $('meta-original').textContent = '实例 ' + data.segs.length + ' 个 · 页面 ' + data.scanned.w + '×' + data.scanned.h;
    $('meta-decoded').textContent = '体积 ' + c.jbig2Bytes(enc) + ' B · 错误 ' + diff.errorCount + ' 个';

    var alert = $('scene-alert');
    var alertText = $('scene-alert-text');
    if (diff.errorCount > 0) {
      alert.hidden = false;
      var parts = [];
      for (var i = 0; i < Math.min(diff.substitutions.length, 3); i++) {
        var s = diff.substitutions[i];
        parts.push('实例 #' + (s.index + 1) + '：' + s.from + ' → ' + s.to);
      }
      if (diff.substitutions.length > 3) parts.push('…共 ' + diff.substitutions.length + ' 处');
      alertText.textContent = parts.join('　');
    } else {
      alert.hidden = true;
      alertText.textContent = '';
    }

    if (window.gsap) {
      gsap.fromTo('#canvas-decoded', { opacity: 0.35 }, { opacity: 1, duration: 0.4 });
    }
  }

  // ────────────────────────────────────────────────────────────
  // 6. 模块二 · 滑块与指标
  // ────────────────────────────────────────────────────────────

  /** 同体积 JPEG：把页面渲染到离屏 canvas，二分找质量 q 使 JPEG 字节 ≈ target */
  function findJpegQuality(pageBmp, targetBytes) {
    var off = document.createElement('canvas');
    drawPage(off, pageBmp);
    var lo = 0.02, hi = 0.95;
    for (var i = 0; i < 10; i++) {
      var mid = (lo + hi) / 2;
      var url = off.toDataURL('image/jpeg', mid);
      var bytes = Math.round(url.length * 0.75); // base64 → 字节
      if (bytes > targetBytes) hi = mid; else lo = mid;
    }
    var q = (lo + hi) / 2;
    var finalUrl = off.toDataURL('image/jpeg', q);
    return { q: q, url: finalUrl, bytes: Math.round(finalUrl.length * 0.75) };
  }

  function renderM2() {
    var data = state.sceneData;
    var agg = state.agg / 100;
    var enc = encodeFor(data.segs, agg, false);
    var diff = JBIG2.diffSemantics(data.segs, enc);
    var recon = JBIG2.reconstruct(enc, { w: data.scanned.w, h: data.scanned.h });
    var c = calc();

    var jbBytes = c.jbig2Bytes(enc);
    var generic = c.genericRegionBytes(data.scanned);

    $('m-size').textContent = jbBytes + ' B';
    $('m-size-sub').textContent = '通用区域：' + generic + ' B';

    var jq = findJpegQuality(data.scanned, jbBytes);
    $('m-jpeg').textContent = jq.bytes + ' B';
    $('m-jpeg-sub').textContent = '质量系数 q ≈ ' + Math.round(jq.q * 100) + '%';

    $('m-errors').textContent = diff.errorCount;
    $('m-errors-sub').textContent = '被替换的实例';

    drawPage($('jpeg-jbig2'), recon);
    var img = new Image();
    img.onload = function () {
      var cv = $('jpeg-jpeg');
      cv.width = img.width;
      cv.height = img.height;
      cv.getContext('2d').drawImage(img, 0, 0);
    };
    img.src = jq.url;

    $('aggValue').textContent = state.agg + '%';
    var equiv = 1 - state.agg / 100 * JBIG2.AGGRESSIVENESS_MAX_DISTANCE;
    $('aggEquiv').textContent = equiv.toFixed(2);

    updateChartPoint();
  }

  /** 预计算 0..100 全曲线的体积/错误，供 sweepChart 使用 */
  function buildSweep() {
    var data = state.sceneData;
    var c = calc();
    var labels = [], bytes = [], errors = [];
    for (var agg = 0; agg <= 100; agg += 2) {
      var enc = encodeFor(data.segs, agg / 100, false);
      var diff = JBIG2.diffSemantics(data.segs, enc);
      labels.push(agg);
      bytes.push(c.jbig2Bytes(enc));
      errors.push(diff.errorCount);
    }
    state.sweepCache = { labels: labels, bytes: bytes, errors: errors };
    if (state.chart) {
      state.chart.data.labels = labels;
      state.chart.data.datasets[0].data = bytes;
      state.chart.data.datasets[1].data = errors;
      state.chart.update('none');
    }
  }

  function updateChartPoint() {
    if (!state.chart) return;
    var idx = Math.round(state.agg / 2);
    state.chart.setActiveElements([
      { datasetIndex: 0, index: idx },
      { datasetIndex: 1, index: idx }
    ]);
    state.chart.update('none');
  }

  function initChart() {
    if (state.chart) return;
    window.loadChartJS().then(function () {
      if (!window.Chart || state.chart) return;
      var cv = $('sweepChart');
      if (!cv) return;
      state.chart = new Chart(cv.getContext('2d'), {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'JBIG2 体积 (B)',
              data: [],
              borderColor: '#ffd700',
              backgroundColor: 'rgba(255,215,0,0.08)',
              yAxisID: 'y',
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.3
            },
            {
              label: '语义错误数',
              data: [],
              borderColor: '#ff6b6b',
              backgroundColor: 'rgba(255,107,107,0.08)',
              yAxisID: 'y1',
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.3
            }
          ]
        },
        options: {
          responsive: true,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { labels: { color: '#c9c9c9', font: { size: 12 } } }
          },
          scales: {
            x: {
              title: { display: true, text: '激进度 (%)', color: '#888' },
              ticks: { color: '#888' },
              grid: { color: 'rgba(255,255,255,0.05)' }
            },
            y: {
              type: 'linear',
              position: 'left',
              title: { display: true, text: 'JBIG2 体积 (B)', color: '#ffd700' },
              ticks: { color: '#888' },
              grid: { color: 'rgba(255,255,255,0.05)' },
              beginAtZero: true
            },
            y1: {
              type: 'linear',
              position: 'right',
              title: { display: true, text: '语义错误数', color: '#ff6b6b' },
              ticks: { color: '#888', stepSize: 1 },
              grid: { drawOnChartArea: false },
              beginAtZero: true
            }
          }
        }
      });
      buildSweep();
      updateChartPoint();
    });
  }

  // ────────────────────────────────────────────────────────────
  // 7. 模块三 · 字典解剖
  // ────────────────────────────────────────────────────────────

  function renderDictStep(step) {
    state.dictStep = step;
    var btns = document.querySelectorAll('.btn-step');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var s = parseInt(b.dataset.step, 10);
      b.classList.toggle('is-active', s === step);
      b.disabled = s > step + 1; // 允许逐步解锁：点完上一步才放开下一步
    }

    var data = state.sceneData;
    var grid = $('dict-grid');
    var canvas = $('dict-page-canvas');
    var hint = $('dict-hover-hint');
    // 移除上次叠加的 subst-layer（重建步骤）
    var wrap = canvas.parentNode;
    var oldLayers = wrap.querySelectorAll('.dict-stage-layer');
    for (var ol = 0; ol < oldLayers.length; ol++) oldLayers[ol].parentNode.removeChild(oldLayers[ol]);

    if (step === 1) {
      drawPage(canvas, data.scanned);
      var ctx = canvas.getContext('2d');
      ctx.strokeStyle = 'rgba(255,107,107,0.55)';
      ctx.lineWidth = 1;
      for (var i2 = 0; i2 < data.segs.length; i2++) {
        var s2 = data.segs[i2];
        ctx.strokeRect(s2.x + 0.5, s2.y + 0.5, s2.w - 1, s2.h - 1);
      }
      grid.innerHTML = '<p class="dict-placeholder">切分完成：' + data.segs.length + ' 个字符块，点击「匹配模板」看归类</p>';
      hint.textContent = '共 ' + data.segs.length + ' 个实例';
      return;
    }

    var agg = state.agg / 100;
    var enc = encodeFor(data.segs, agg, false);
    var diff = JBIG2.diffSemantics(data.segs, enc);

    if (step === 2) {
      renderDictGrid(grid, enc, data.segs, data.scanned, canvas, hint, false);
    } else {
      var recon = JBIG2.reconstruct(enc, { w: data.scanned.w, h: data.scanned.h });
      drawPage(canvas, recon);
      var layer = document.createElement('div');
      layer.className = 'subst-layer dict-stage-layer';
      wrap.appendChild(layer);
      drawSubstBoxes(layer, diff.substitutions, data.scanned.w, data.scanned.h);
      hint.textContent = '重建完成 · ' + diff.errorCount + ' 个错误';
      renderDictGrid(grid, enc, data.segs, null, null, true);
    }
  }

  /** 渲染字典缩略图网格，点击模板高亮页面实例 */
  function renderDictGrid(grid, enc, segs, scanned, canvas, hint, readonly) {
    var dict = enc.dictionary;
    var counts = [];
    for (var i = 0; i < dict.length; i++) counts.push(0);
    for (var j = 0; j < enc.assignments.length; j++) counts[enc.assignments[j]]++;

    var html = '<div class="dict-grid-inner">';
    for (var k = 0; k < dict.length; k++) {
      html += '<div class="dict-tile" data-dict="' + k + '">' +
        '<canvas class="dict-tile-canvas" data-dict="' + k + '"></canvas>' +
        '<span class="dict-tile-count">×' + counts[k] + '</span>' +
        '</div>';
    }
    html += '</div>';
    grid.innerHTML = html;

    var tiles = grid.querySelectorAll('.dict-tile-canvas');
    for (var t = 0; t < tiles.length; t++) {
      drawPage(tiles[t], dict[parseInt(tiles[t].dataset.dict, 10)].bitmap);
    }

    if (readonly || !canvas) return;
    var tileEls = grid.querySelectorAll('.dict-tile');
    for (var e = 0; e < tileEls.length; e++) {
      (function (di) {
        tileEls[e].addEventListener('click', function () {
          drawPage(canvas, scanned);
          var ctx = canvas.getContext('2d');
          ctx.strokeStyle = 'rgba(255,215,0,0.9)';
          ctx.lineWidth = 1.5;
          for (var i3 = 0; i3 < segs.length; i3++) {
            if (enc.assignments[i3] === di) {
              var s3 = segs[i3];
              ctx.strokeRect(s3.x + 0.5, s3.y + 0.5, s3.w - 1, s3.h - 1);
            }
          }
          if (hint) hint.textContent = '模板 #' + (di + 1) + ' 的实例（金色）';
        });
      })(parseInt(tileEls[e].dataset.dict, 10));
    }
  }

  // ────────────────────────────────────────────────────────────
  // 8. 模块四 · 分割粒度
  // ────────────────────────────────────────────────────────────

  /** 按 gt 文本串分组构建块实例（整串数字当一个大符号） */
  function buildBlockInstances(scene) {
    var blocks = [];
    var cur = null;
    for (var i = 0; i < scene.gt.length; i++) {
      var g = scene.gt[i];
      if (cur && g.y === cur.y && g.x - (cur.x + cur.w) <= GAP + 2) {
        cur.text += g.label;
        cur.w = (g.x + g.w) - cur.x;
        cur.h = Math.max(cur.h, g.h);
      } else {
        cur = { x: g.x, y: g.y, w: g.w, h: g.h, text: g.label };
        blocks.push(cur);
      }
    }
    return blocks.map(function (b) {
      var bmp = JBIG2.createBitmap(b.w, b.h);
      for (var y = 0; y < b.h; y++)
        for (var x = 0; x < b.w; x++)
          if (JBIG2.getPixel(scene.bmp, b.x + x, b.y + y)) JBIG2.setPixel(bmp, x, y, 1);
      return { x: b.x, y: b.y, w: b.w, h: b.h, bitmap: bmp, label: b.text };
    });
  }

  /** char 模式：对原始位图做单字符切分（干净、稳定） */
  function charInstancesFromClean(scene) {
    var segs = JBIG2.segment(scene.bmp, { mode: 'char' }).filter(function (s) {
      return s.w >= 4 && s.h >= 4 && JBIG2.countForeground(s.bitmap) >= 12;
    });
    var labeled = [];
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      var cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      var best = null, bestD = 1e9;
      for (var j = 0; j < scene.gt.length; j++) {
        var g = scene.gt[j];
        var d = Math.abs(g.x + g.w / 2 - cx) + Math.abs(g.y + g.h / 2 - cy);
        if (d < bestD) { bestD = d; best = g; }
      }
      if (best && bestD < 10) { s.label = best.label; labeled.push(s); }
    }
    return labeled;
  }

  function renderM4() {
    var scene = SCENE_BUILDERS.floor();
    var mode = state.granMode;
    var insts = mode === 'char' ? charInstancesFromClean(scene) : buildBlockInstances(scene);
    var enc = encodeFor(insts, M4_AGG, false);
    var diff = JBIG2.diffSemantics(insts, enc);
    var recon = JBIG2.reconstruct(enc, { w: scene.bmp.w, h: scene.bmp.h });
    var c = calc();

    drawPage($('gran-original'), scene.bmp);
    drawPage($('gran-decoded'), recon);

    $('gran-mode-label').textContent = mode === 'char' ? '单字符' : '整块数字';
    $('gran-errors').textContent = diff.errorCount + ' 处';
    $('gran-dict').textContent = enc.dictionary.length + ' 个';

    var btns = document.querySelectorAll('.btn-tab');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('is-active', btns[i].dataset.mode === mode);
    }
  }

  // ────────────────────────────────────────────────────────────
  // 9. 模块五 · SPM 修正开关
  // ────────────────────────────────────────────────────────────

  function renderM5() {
    var data = state.sceneData;
    var on = $('spmCheck').checked;
    var c = calc();

    var encOff = encodeFor(data.segs, M5_AGG, false);
    var reconOff = JBIG2.reconstruct(encOff, { w: data.scanned.w, h: data.scanned.h });
    var diffOff = JBIG2.diffSemantics(data.segs, encOff);
    drawPage($('spm-off-canvas'), reconOff);
    $('spm-off-meta').textContent = '体积 ' + c.jbig2Bytes(encOff) + ' B · 错误 ' + diffOff.errorCount + ' 个' + (on ? '' : '（当前）');

    var encOn = encodeFor(data.segs, M5_AGG, true);
    var reconOn = JBIG2.reconstruct(encOn, { w: data.scanned.w, h: data.scanned.h });
    var diffOn = JBIG2.diffSemantics(data.segs, encOn);
    drawPage($('spm-on-canvas'), reconOn);
    $('spm-on-meta').textContent = '体积 ' + c.jbig2Bytes(encOn) + ' B · 错误 ' + diffOn.errorCount + ' 个' + (on ? '（当前）' : '');

    var offWrap = $('spm-off-canvas').parentNode;
    var onWrap = $('spm-on-canvas').parentNode;
    offWrap.classList.toggle('spm-dim', on);
    onWrap.classList.toggle('spm-dim', !on);
    offWrap.classList.toggle('spm-current', !on);
    onWrap.classList.toggle('spm-current', on);

    var offLayer = offWrap.querySelector('.subst-layer');
    var onLayer = onWrap.querySelector('.subst-layer');
    if (offLayer) clearLayer(offLayer);
    if (onLayer) clearLayer(onLayer);
    if (!on) {
      if (!offLayer) {
        offLayer = document.createElement('div');
        offLayer.className = 'subst-layer';
        offWrap.appendChild(offLayer);
      }
      drawSubstBoxes(offLayer, diffOff.substitutions, data.scanned.w, data.scanned.h);
    }
  }

  // ────────────────────────────────────────────────────────────
  // 10. 模块六 · 自定义输入
  // ────────────────────────────────────────────────────────────

  function renderCustom() {
    var text = $('customText').value.trim() || '1234567890';
    var dpi = parseInt($('customDpi').value, 10) || 150;
    var dopts = DPI_OPTS[dpi] || DPI_OPTS[150];

    var W = text.length * (CHAR_W + GAP) + GAP * 2 + 40;
    var H = CHAR_H + GAP * 2 + 20;
    var bmp = JBIG2.createBitmap(W, H);
    var gt = drawText(bmp, text, GAP + 20, GAP + 10);

    var scene = { bmp: bmp, gt: gt, name: '自定义' };
    var p = pipeline(scene, {
      dpiScale: dopts.dpiScale,
      blur: 0,
      noise: dopts.noise,
      seed: 4242,
      threshold: 0.45
    });

    var enc = encodeFor(p.segs, 0.7, false);
    var diff = JBIG2.diffSemantics(p.segs, enc);
    var recon = JBIG2.reconstruct(enc, { w: p.scanned.w, h: p.scanned.h });
    var c = calc();

    drawPage($('custom-original'), p.scanned);
    drawPage($('custom-decoded'), recon);
    drawSubstBoxes($('custom-subst-layer'), diff.substitutions, p.scanned.w, p.scanned.h);

    $('custom-size').textContent = c.jbig2Bytes(enc) + ' B';
    $('custom-errors').textContent = diff.errorCount + ' 处';
    $('custom-dict').textContent = enc.dictionary.length + ' 个';
  }

  /** 上传图片：缩放到合理尺寸 → 灰度 → Otsu 二值化 → 走同样管线 */
  function handleUpload(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var MAXW = 560;
        var scale = Math.min(1, MAXW / img.width);
        var w = Math.round(img.width * scale);
        var h = Math.round(img.height * scale);
        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        var imgData = ctx.getImageData(0, 0, w, h);
        var gray = new Uint8Array(w * h);
        var d = imgData.data;
        for (var i = 0; i < w * h; i++) {
          var o = i * 4;
          var lum = 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
          gray[i] = lum;
        }
        var th = otsuThreshold(gray);
        var bmp = JBIG2.binarize(gray, w, h, th);

        var dpi = parseInt($('customDpi').value, 10) || 150;
        var dopts = DPI_OPTS[dpi] || DPI_OPTS[150];
        var p = pipeline({ bmp: bmp, gt: [], name: '上传' }, {
          dpiScale: dopts.dpiScale,
          blur: 0,
          noise: dopts.noise,
          seed: 777,
          threshold: 0.45
        });

        // 无真值标签：用像素差异代替语义错误
        var enc = encodeFor(p.segs, 0.7, false);
        var recon = JBIG2.reconstruct(enc, { w: p.scanned.w, h: p.scanned.h });
        var c = calc();
        var pd = JBIG2.pixelDiff(p.scanned, recon);

        drawPage($('custom-original'), p.scanned);
        drawPage($('custom-decoded'), recon);
        clearLayer($('custom-subst-layer'));

        $('custom-size').textContent = c.jbig2Bytes(enc) + ' B';
        $('custom-errors').textContent = Math.round(pd.ratio * 100) + '%';
        $('custom-dict').textContent = enc.dictionary.length + ' 个';
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function otsuThreshold(gray) {
    var hist = new Array(256);
    for (var i = 0; i < 256; i++) hist[i] = 0;
    for (var j = 0; j < gray.length; j++) {
      var v = Math.min(255, Math.max(0, Math.round(gray[j])));
      hist[v]++;
    }
    var total = gray.length;
    var sum = 0;
    for (var t = 0; t < 256; t++) sum += t * hist[t];
    var sumB = 0, wB = 0, maxVar = 0, threshold = 128;
    for (var t2 = 0; t2 < 256; t2++) {
      wB += hist[t2];
      if (wB === 0) continue;
      var wF = total - wB;
      if (wF === 0) break;
      sumB += t2 * hist[t2];
      var mB = sumB / wB;
      var mF = (sum - sumB) / wF;
      var between = wB * wF * (mB - mF) * (mB - mF);
      if (between > maxVar) { maxVar = between; threshold = t2; }
    }
    return threshold;
  }

  // ────────────────────────────────────────────────────────────
  // 11. 分享
  // ────────────────────────────────────────────────────────────

  function showToast(msg) {
    var toast = $('copyToast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('is-visible');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 1800);
  }

  function copyLink() {
    var url = location.href;
    function done() { showToast('链接已复制'); }
    function fail() {
      var ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { showToast('复制失败，请手动复制地址栏'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, fail);
    } else {
      fail();
    }
  }

  // ────────────────────────────────────────────────────────────
  // 12. 事件绑定与初始化
  // ────────────────────────────────────────────────────────────

  function bindEvents() {
    var tabs = document.querySelectorAll('.scene-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        var id = this.dataset.scene;
        for (var j = 0; j < tabs.length; j++) tabs[j].classList.toggle('is-active', tabs[j] === this);
        state.scene = id;
        state.sceneData = loadScene(id);
        renderScene();
        buildSweep();
        renderM2();
        renderDictStep(1);
        renderM5();
      });
    }

    var slider = $('aggSlider');
    slider.addEventListener('input', function () {
      state.agg = parseInt(this.value, 10) || 0;
      if (state.rafPending) return;
      state.rafPending = true;
      requestAnimationFrame(function () {
        state.rafPending = false;
        renderScene();
        renderM2();
        renderDictStep(state.dictStep);
      });
    });

    var steps = document.querySelectorAll('.btn-step');
    for (var k = 0; k < steps.length; k++) {
      steps[k].addEventListener('click', function () {
        renderDictStep(parseInt(this.dataset.step, 10));
      });
    }

    var granBtns = document.querySelectorAll('.btn-tab');
    for (var g = 0; g < granBtns.length; g++) {
      granBtns[g].addEventListener('click', function () {
        state.granMode = this.dataset.mode;
        renderM4();
      });
    }

    $('spmCheck').addEventListener('change', renderM5);

    $('customRunBtn').addEventListener('click', renderCustom);
    var fileInput = $('customFile');
    fileInput.addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      $('uploadName').textContent = f.name.length > 18 ? f.name.slice(0, 15) + '…' : f.name;
      handleUpload(f);
    });

    $('shareBtn').addEventListener('click', copyLink);

    document.addEventListener('click', function (e) {
      var box = e.target && e.target.closest ? e.target.closest('.subst-box') : null;
      if (box) {
        showToast('原本 ' + box.dataset.from + '，被替换成 ' + box.dataset.to);
      }
    });

    window.addEventListener('resize', function () {
      if (state.chart) state.chart.resize();
    });
  }

  function init() {
    if (!JBIG2 || !pako) return;
    state.sceneData = loadScene(state.scene);
    renderScene();
    renderM2();
    initChart();
    renderDictStep(1);
    renderM4();
    renderM5();

    bindEvents();

    if (window.gsap) {
      gsap.from('.hero-title', { y: 24, opacity: 0, duration: 0.7, ease: 'power2.out' });
      gsap.from('.hero-lead', { y: 18, opacity: 0, duration: 0.7, delay: 0.15, ease: 'power2.out' });
      gsap.from('.hero-cta', { y: 14, opacity: 0, duration: 0.6, delay: 0.3, ease: 'power2.out' });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

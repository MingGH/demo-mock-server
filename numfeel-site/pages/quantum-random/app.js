/* app.js — "怎样做到绝对随机" demo 交互层。核心逻辑走 window.QuantumRandom（见 logic.js）。 */
(function () {
  'use strict';
  var QR = window.QuantumRandom;
  var $ = function (id) { return document.getElementById(id); };
  var hasGsap = function () { return typeof window.gsap !== 'undefined'; };

  var currentPreset = 'ssq';
  var currentSource = QR.SOURCE_QUANTUM;
  var lastResult = null;       // 最近一次摇号结果，用于复制
  var lastBytes = null;        // 最近一次取到的原始字节，用于原始字节折叠 + 体检面板
  var lastEntropy = null;      // 最近一次熵源信息 { source, provider, degraded }
  var sampleBytes = [];        // 体检面板已采集的真随机字节（累加）
  var prngChart = null;
  var trChart = null;

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 1600);
  }

  function pop(el) {
    if (!el) return;
    if (hasGsap()) {
      window.gsap.fromTo(el, { scale: 0.92, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(2)' });
    } else { el.style.opacity = 1; }
  }

  // ── 熵源选择器 ──
  function renderSourceExplain() {
    var explain = $('sourceExplain');
    var label = QR.SOURCE_LABELS[currentSource] || currentSource;
    var note = QR.SOURCE_NOTES[currentSource] || '';
    explain.innerHTML = '当前：<b>' + label + '</b>。' + note;
  }

  function selectSource(src) {
    currentSource = src;
    var chips = $('sourcePick').children;
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('active', chips[i].getAttribute('data-source') === src);
    }
    renderSourceExplain();
  }

  // ── 玩法切换 ──
  function selectPreset(preset) {
    currentPreset = preset;
    var cards = $('presetRow').children;
    for (var i = 0; i < cards.length; i++) {
      cards[i].classList.toggle('active', cards[i].getAttribute('data-preset') === preset);
    }
    $('digitsPanel').hidden = preset !== 'digits';
    $('ballRow').innerHTML = '';
    $('drawResult').textContent = '';
    $('drawStatus').textContent = preset === 'ssq' ? '点「摇一注」开始双色球。' :
      preset === 'dlt' ? '点「摇一注」开始大乐透。' : '点「摇一注」生成固定位数随机数。';
    var hint = $('drawHint');
    hint.textContent = preset === 'digits'
      ? '设好位数或区间，点摇一注。固定位数首位不为 0，区间模式每个数都走拒绝采样。'
      : '点摇一注，号码逐个揭晓——每颗球落定都有反馈，不是一次性蹦出来。';
    $('copyBtn').hidden = true;
    $('rawToggle').hidden = true;
    $('rawStream').hidden = true;
    $('sourceBadgeWrap').innerHTML = '';
    lastResult = null;
  }

  // ── 渲染球位占位 ──
  function renderPlaceholders(balls) {
    var row = $('ballRow');
    row.innerHTML = '';
    balls.forEach(function (b, i) {
      if (b.divider) {
        var d = document.createElement('div');
        d.className = 'ball-divider';
        row.appendChild(d);
        return;
      }
      var el = document.createElement('div');
      el.className = 'ball placeholder ' + b.cls;
      el.textContent = '?';
      el.dataset.cls = b.cls;
      el.dataset.value = b.value != null ? b.value : '';
      row.appendChild(el);
    });
  }

  // 把一颗球从占位揭晓
  function revealBall(idx, value, cls, label) {
    var row = $('ballRow');
    var cell = row.children[idx];
    if (!cell) return;
    cell.classList.remove('placeholder');
    cell.classList.add(cls, 'show');
    cell.textContent = QR.pad2(value);
    if (hasGsap()) {
      window.gsap.fromTo(cell, { scale: 0.3, opacity: 0, y: -22 },
        { scale: 1, opacity: 1, y: 0, duration: 0.55, ease: 'back.out(2.2)', delay: 0.05 * idx });
    }
  }

  // ── 徽章 ──
  function renderBadge(entropy) {
    var b = QR.sourceBadge(entropy.source, entropy.degraded);
    var html = '<span class="source-badge ' + b.cls + '"><i class="ti ' + b.icon + '"></i> ' + b.text + '</span>' +
      '<div class="source-prov">提供方：' + (entropy.provider || '—') + '</div>';
    $('sourceBadgeWrap').innerHTML = html;
  }

  // ── 原始字节流 ──
  function renderRawStream(bytes) {
    var el = $('rawStream');
    var html = '<span class="row-label">本次从熵源取到的 ' + bytes.length + ' 个原始字节（hex）：</span>';
    html += bytes.map(function (b) {
      var h = (b & 0xff).toString(16);
      return h.length < 2 ? '0' + h : h;
    }).join(' ');
    el.innerHTML = html;
  }

  // ── 摇号主流程 ──
  function roll() {
    var btn = $('rollBtn');
    btn.disabled = true;
    $('drawStatus').textContent = '正在从熵源取真随机字节…';
    $('ballRow').innerHTML = '';
    $('drawResult').textContent = '';
    $('sourceBadgeWrap').innerHTML = '';
    $('copyBtn').hidden = true;
    $('rawToggle').hidden = true;
    $('rawStream').hidden = true;
    $('rawToggle').innerHTML = '<i class="ti ti-code"></i> 查看原始随机字节';

    // 需要多少字节
    var need;
    if (currentPreset === 'ssq') need = QR.estimateBytes(QR.SSQ);
    else if (currentPreset === 'dlt') need = QR.estimateBytesDlt();
    else need = 128;

    QR.fetchBytes(need, currentSource).then(function (entropy) {
      lastBytes = entropy.bytes.slice();
      lastEntropy = entropy;
      $('drawStatus').textContent = '取到 ' + entropy.bytes.length + ' 字节，开始摇号…';

      if (currentPreset === 'ssq') rollSsq(entropy.bytes, entropy);
      else if (currentPreset === 'dlt') rollDlt(entropy.bytes, entropy);
      else rollDigits(entropy.bytes, entropy);
    });
  }

  function rollSsq(bytes, entropy) {
    var r = QR.drawSsq(bytes);
    if (!r) { $('drawStatus').textContent = '字节不足，请重试一次。'; enableRoll(); return; }
    lastResult = { type: 'ssq', value: r };

    var cells = [];
    for (var i = 0; i < 6; i++) cells.push({ cls: 'red' });
    cells.push({ divider: true });
    cells.push({ cls: 'blue' });
    renderPlaceholders(cells);

    // 逐球揭晓
    $('drawStatus').textContent = '逐球揭晓…';
    var seq = [];
    r.red.forEach(function (v, i) { seq.push({ kind: 'red', idx: i, value: v }); });
    seq.push({ kind: 'blue', idx: 6 /* divider 后 */, value: r.blue });
    var childIdx = 0;
    seq.forEach(function (item, order) {
      setTimeout(function () {
        var targetIdx = item.kind === 'red' ? order : 6 + 1; // 占位里 red 0-5, divider=6, blue=7
        revealBall(targetIdx, item.value, item.cls || item.kind);
      }, order * 380);
    });
    setTimeout(function () {
      $('drawResult').innerHTML = QR.formatSsq(r);
      $('drawStatus').textContent = '摇号完成。';
      renderBadge(entropy);
      $('copyBtn').hidden = false;
      $('rawToggle').hidden = false;
      enableRoll();
      pop($('sourceBadgeWrap'));
    }, seq.length * 380 + 200);
  }

  function rollDlt(bytes, entropy) {
    var r = QR.drawDlt(bytes);
    if (!r) { $('drawStatus').textContent = '字节不足，请重试一次。'; enableRoll(); return; }
    lastResult = { type: 'dlt', value: r };

    var cells = [];
    for (var i = 0; i < 5; i++) cells.push({ cls: 'front' });
    cells.push({ divider: true });
    for (var j = 0; j < 2; j++) cells.push({ cls: 'back' });
    renderPlaceholders(cells);

    $('drawStatus').textContent = '逐球揭晓…';
    var order = 0;
    r.front.forEach(function (v, i) {
      setTimeout(function () { revealBall(i, v, 'front'); }, i * 360);
      order++;
    });
    r.back.forEach(function (v, j) {
      var idx = order + 1; // front 5 + divider 后的第 1、2 个
      setTimeout(function () { revealBall(idx, v, 'back'); }, order * 360);
      order++;
    });
    setTimeout(function () {
      $('drawResult').innerHTML = QR.formatDlt(r);
      $('drawStatus').textContent = '摇号完成。';
      renderBadge(entropy);
      $('copyBtn').hidden = false;
      $('rawToggle').hidden = false;
      enableRoll();
      pop($('sourceBadgeWrap'));
    }, order * 360 + 200);
  }

  function rollDigits(bytes, entropy) {
    var minVal = $('digitMin').value;
    var maxVal = $('digitMax').value;
    var len = parseInt($('digitLength').value, 10) || 6;
    var cnt = parseInt($('digitCount').value, 10) || 1;
    var out = $('digitOutput');
    out.textContent = '生成中…';

    var resultStr;
    if (minVal !== '' && maxVal !== '') {
      var mn = parseInt(minVal, 10);
      var mx = parseInt(maxVal, 10);
      if (mn > mx) { out.textContent = '最小值要小于等于最大值'; enableRoll(); return; }
      var arr = QR.drawDigits(bytes, cnt, mn, mx);
      if (!arr) { out.textContent = '字节不足，请重试'; enableRoll(); return; }
      resultStr = arr.map(String).join('   ');
      lastResult = { type: 'digits', value: arr };
    } else {
      len = Math.max(1, Math.min(20, len));
      var s = QR.drawFixedDigitString(bytes, len);
      if (!s) { out.textContent = '字节不足，请重试'; enableRoll(); return; }
      resultStr = s;
      lastResult = { type: 'digits', value: s };
    }
    out.textContent = resultStr;
    $('ballRow').innerHTML = '';
    $('drawStatus').textContent = '生成完成。';
    renderBadge(entropy);
    $('copyBtn').hidden = false;
    $('rawToggle').hidden = false;
    enableRoll();
    pop(out);
  }

  function enableRoll() {
    var btn = $('rollBtn');
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-bolt"></i> 再摇一注';
  }

  // ── 复制 ──
  function copyResult() {
    if (!lastResult) return;
    var text;
    var srcLabel = lastEntropy ? QR.SOURCE_LABELS[lastEntropy.source] : '';
    if (lastResult.type === 'ssq') text = QR.formatSsq(lastResult.value);
    else if (lastResult.type === 'dlt') text = QR.formatDlt(lastResult.value);
    else text = String(lastResult.value);
    text = text + '   (熵源：' + srcLabel + ')   来自「怎样做到绝对随机」👉 https://numfeel.996.ninja/pages/quantum-random/';
    var done = function () { toast('已复制本注号码'); };
    var fail = function () { toast('复制失败，请手动选'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fail);
    } else {
      var ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { fail(); }
      document.body.removeChild(ta);
    }
  }

  // ── 原始字节折叠 ──
  function toggleRaw() {
    var el = $('rawStream');
    var btn = $('rawToggle');
    if (el.hidden) {
      if (lastBytes) renderRawStream(lastBytes);
      el.hidden = false;
      btn.innerHTML = '<i class="ti ti-code-dots"></i> 收起原始字节';
      pop(el);
    } else {
      el.hidden = true;
      btn.innerHTML = '<i class="ti ti-code"></i> 查看原始随机字节';
    }
  }

  // ── 体检面板 ──
  function resample() {
    var btn = $('resampleBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader"></i> 采集中…';
    QR.fetchBytes(4096, currentSource).then(function (entropy) {
      sampleBytes = entropy.bytes.slice();
      lastEntropy = entropy;
      var b = QR.sourceBadge(entropy.source, entropy.degraded);
      $('healthBadge').className = 'source-badge ' + b.cls;
      $('healthBadge').innerHTML = '<i class="ti ' + b.icon + '"></i> ' + b.text;
      $('trSourceLabel').textContent = QR.SOURCE_LABELS[entropy.source] || entropy.source;
      renderHealthCharts();
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-refresh"></i> 再采 4096 字节';
    });
  }

  function buildChart(canvasId, bytes, color) {
    if (!window.loadChartJS) return null;
    return window.loadChartJS().then(function () {
      var hist = QR.byteHistogram(bytes, 16);
      var chi = QR.chiSquare(hist).toFixed(1);
      var labels = [];
      for (var i = 0; i < 16; i++) labels.push(String(i));
      if (canvasId === 'prngChart') {
        if (prngChart) prngChart.destroy();
        prngChart = new window.Chart($(canvasId).getContext('2d'), barConfig(labels, hist, color));
        $('prngMeta').innerHTML = '<span>样本：' + bytes.length + ' 字节</span><span>χ² = <span class="hl">' + chi + '</span></span>';
      } else {
        if (trChart) trChart.destroy();
        trChart = new window.Chart($(canvasId).getContext('2d'), barConfig(labels, hist, color));
        $('trMeta').innerHTML = '<span>样本：' + bytes.length + ' 字节</span><span>χ² = <span class="hl">' + chi + '</span></span>';
      }
    });
  }

  function barConfig(labels, data, color) {
    return {
      type: 'bar',
      data: { labels: labels, datasets: [{ data: data, backgroundColor: color, borderRadius: 6 }] },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#888', font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.06)' } },
        },
      },
    };
  }

  function renderHealthCharts() {
    if (!sampleBytes.length) return;
    var prngBytes = QR.pseudoBytes(sampleBytes.length);
    buildChart('prngChart', prngBytes, 'rgba(244,114,182,0.75)');
    buildChart('trChart', sampleBytes, 'rgba(0,212,255,0.75)');
  }

  // 自动采集一批用于初始展示
  function autoSample() {
    QR.fetchBytes(4096, currentSource).then(function (entropy) {
      sampleBytes = entropy.bytes.slice();
      var b = QR.sourceBadge(entropy.source, entropy.degraded);
      $('healthBadge').className = 'source-badge ' + b.cls;
      $('healthBadge').innerHTML = '<i class="ti ' + b.icon + '"></i> ' + b.text;
      $('trSourceLabel').textContent = QR.SOURCE_LABELS[entropy.source] || entropy.source;
      renderHealthCharts();
    });
  }

  // ── 绑定 ──
  function bind() {
    var cards = $('presetRow').children;
    for (var i = 0; i < cards.length; i++) {
      (function (c) {
        c.addEventListener('click', function () { selectPreset(c.getAttribute('data-preset')); });
      })(cards[i]);
    }
    var chips = $('sourcePick').children;
    for (var j = 0; j < chips.length; j++) {
      (function (c2) {
        c2.addEventListener('click', function () {
          var src = c2.getAttribute('data-source');
          selectSource(src);
          toast('已切到 ' + QR.SOURCE_LABELS[src]);
        });
      })(chips[j]);
    }

    $('heroBtn').addEventListener('click', function () {
      $('drawSection').scrollIntoView({ behavior: 'smooth' });
      setTimeout(roll, 500);
    });
    $('rollBtn').addEventListener('click', roll);
    $('copyBtn').addEventListener('click', copyResult);
    $('rawToggle').addEventListener('click', toggleRaw);
    $('resampleBtn').addEventListener('click', resample);
    $('topBtn').addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });

    renderSourceExplain();
    autoSample();

    if (hasGsap()) {
      window.gsap.from('.hero-copy > *', { y: 18, opacity: 0, duration: 0.5, stagger: 0.12, ease: 'power2.out' });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
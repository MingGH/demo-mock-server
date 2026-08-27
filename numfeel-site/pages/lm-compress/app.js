/**
 * LMCompress 演示 — DOM/交互层
 * 核心逻辑见 engine.js（纯函数，不碰 DOM）。
 */

(function () {
  'use strict';

  var PREDICT_ORDERS = [1, 3, 5];
  var CURVE_BUCKETS = 16;
  var DATA_SIZES = [1000, 2000, 3000, 4000, 5000, 5307];
  var dataChart = null;
  var orderChart = null;
  var curveChart = null;
  var tradeoffChart = null;
  var currentPreset = 'zh';
  var lastReport = null;

  // ══════════════════════════════════════════════════════════
  // 行为埋点（NFTrack，见 components/track.js）
  // 事件清单：
  //   session_start → 会话开始（trackOnce）
  //   lm_predict    → 修改预测演示输入 {len}
  //   lm_preset     → 选择预设 {key}
  //   lm_compress   → 执行压缩 {saved, order}（回答"压缩率分布"）
  //   lm_data       → 调整训练数据量 {size}
  //   lm_decode     → 观看解压对决
  //   session_end   → 离页（pagehide, force）
  // ══════════════════════════════════════════════════════════
  function nfTrack(name, props, opts) {
    try {
      if (window.NFTrack && typeof window.NFTrack.track === 'function') {
        window.NFTrack.track(name, props, opts);
      }
    } catch (e) {}
  }
  var trackSessionStarted = false;
  function trackSessionStart() {
    if (trackSessionStarted) return;
    trackSessionStarted = true;
    nfTrack('session_start', {});
  }
  window.addEventListener('pagehide', function () {
    nfTrack('session_end', { reason: 'leave' }, { force: true });
  });

  function $(id) { return document.getElementById(id); }

  // ══════════════════════════════════════════════════════════
  // 模块一：预测演示
  // ══════════════════════════════════════════════════════════
  var predictModels = {};
  var predictTimer = null;

  function buildPredictModels() {
    for (var i = 0; i < PREDICT_ORDERS.length; i++) {
      var order = PREDICT_ORDERS[i];
      if (!predictModels[order]) {
        predictModels[order] = buildModel(TRAINING_CORPUS, order);
      }
    }
  }

  function renderPrediction(order, dist) {
    var box = $('pred' + order);
    if (!box) return;
    var html = '';
    var maxProb = dist.length > 0 ? dist[0].prob : 0;
    if (dist.length === 0) {
      html = '<div class="pred-empty">先输入几个字，让模型猜下一个</div>';
    } else {
      for (var i = 0; i < Math.min(5, dist.length); i++) {
        var item = dist[i];
        var pct = maxProb > 0 ? (item.prob / maxProb * 100) : 0;
        html += '<div class="pred-row">' +
          '<span class="pred-char">' + esc(item.char) + '</span>' +
          '<div class="pred-bar-wrap"><div class="pred-bar" data-w="' + pct + '"></div></div>' +
          '<span class="pred-prob">' + (item.prob * 100).toFixed(1) + '%</span>' +
          '</div>';
      }
    }
    box.innerHTML = html;
    // GSAP 动画概率条
    if (typeof gsap !== 'undefined') {
      var bars = box.querySelectorAll('.pred-bar');
      for (var j = 0; j < bars.length; j++) {
        gsap.fromTo(bars[j], { width: '0%' }, { width: bars[j].getAttribute('data-w') + '%', duration: 0.5, ease: 'power2.out' });
      }
    } else {
      var bars2 = box.querySelectorAll('.pred-bar');
      for (var k = 0; k < bars2.length; k++) {
        bars2[k].style.width = bars2[k].getAttribute('data-w') + '%';
      }
    }
  }

  function updatePredictions() {
    var input = $('predictInput').value;
    if (!input) {
      for (var i = 0; i < PREDICT_ORDERS.length; i++) {
        $('pred' + PREDICT_ORDERS[i]).innerHTML = '<div class="pred-empty">先输入几个字，让模型猜下一个</div>';
      }
      return;
    }
    for (var j = 0; j < PREDICT_ORDERS.length; j++) {
      var order = PREDICT_ORDERS[j];
      var dist = predictDist(predictModels[order], input, order, 5);
      renderPrediction(order, dist);
    }
    nfTrack('lm_predict', { len: input.length });
  }

  function onPredictInput() {
    if (predictTimer) clearTimeout(predictTimer);
    predictTimer = setTimeout(updatePredictions, 160);
  }

  // ══════════════════════════════════════════════════════════
  // 模块二：压缩实验
  // ══════════════════════════════════════════════════════════
  function selectPreset(key) {
    currentPreset = key;
    $('compressText').value = PRESETS[key].text;
    var cards = document.querySelectorAll('.preset-card');
    for (var i = 0; i < cards.length; i++) {
      cards[i].classList.toggle('active', cards[i].getAttribute('data-key') === key);
    }
    nfTrack('lm_preset', { key: key });
  }

  function runCompress(noScroll) {
    var text = $('compressText').value;
    if (!text.trim()) {
      flashButton($('runCompressBtn'), '先粘贴点内容再压');
      return;
    }

    // 进入"正在压缩"状态
    $('compressResult').classList.add('hidden');
    var btn = $('runCompressBtn');
    btn.disabled = true;
    var btnOrigin = btn.innerHTML;
    btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> 压缩中…';

    var progressEl = $('compressProgress');
    var fill = $('progressFill');
    var progressText = $('progressText');
    progressEl.classList.remove('hidden');
    fill.style.width = '0%';
    var chars = text.length;
    var steps = [
      '正在构建预测模型…',
      '正在逐字符编码（共 ' + chars + ' 个字符）…',
      '正在对比 1~5 阶模型…',
      '正在绘制结果…'
    ];

    // 先让浏览器渲染出 loading 状态，再把瞬时计算包进进度条动画里
    setTimeout(function () {
      var duration = 900;
      var start = null;
      function stepFrame(ts) {
        if (!start) start = ts;
        var p = Math.min(1, (ts - start) / duration);
        fill.style.width = (p * 100) + '%';
        var si = Math.min(steps.length - 1, Math.floor(p * steps.length));
        progressText.textContent = steps[si];
        if (p < 1) {
          window.requestAnimationFrame(stepFrame);
        } else {
          fill.style.width = '100%';
          progressText.textContent = '完成：压缩前后每个字符都分毫不差';
          finish();
        }
      }
      window.requestAnimationFrame(stepFrame);
    }, 60);
  }

  function finish() {
    var text = $('compressText').value;
    var reports = sweepOrders(text, TRAINING_CORPUS, MAX_ORDER);
    lastReport = reports[reports.length - 1];

    // 统计卡：数字滚动到目标值
    animateNumber($('statOriginal'), lastReport.originalBytes, formatBytes, 500);
    animateNumber($('statCompressed'), lastReport.compressedBytes, formatBytes, 500);
    animateNumber($('statSaved'), lastReport.savedPercent, function (v) { return '-' + v.toFixed(1) + '%'; }, 500);
    $('statBpc').textContent = lastReport.bitsPerChar.toFixed(2) + ' bits/字符';

    // 洞察文案
    var best = reports[0];
    for (var i = 1; i < reports.length; i++) {
      if (reports[i].savedPercent > best.savedPercent) best = reports[i];
    }
    var insight = '最高阶模型把这份 ' + formatBytes(lastReport.originalBytes) + ' 的文件压到了 ' +
      formatBytes(lastReport.compressedBytes) + '，省了 ' + lastReport.savedPercent.toFixed(1) + '%。' +
      '压缩前后逐字节比对分毫不差——这就是无损。';
    if (best.order > 1 && best.order < MAX_ORDER) {
      insight += '最佳阶数是 ' + best.order + '-gram（' + best.savedPercent.toFixed(1) + '%）。';
    }
    if (currentPreset === 'zh') {
      insight += '换个「服务器日志」试试：模型完全陌生的文本，学习曲线会很陡。';
    }
    $('compressInsightText').textContent = insight;
    nfTrack('lm_compress', { saved: Math.round(lastReport.savedPercent), order: lastReport.order });

    renderOrderChart(reports);
    renderCurveChart(lastReport.perCharBits);

    // 进度条停一瞬，再让位给结果卡片
    setTimeout(function () {
      $('compressProgress').classList.add('hidden');
      var resultEl = $('compressResult');
      resultEl.classList.remove('hidden');
      resultEl.classList.remove('pop-in');
      void resultEl.offsetWidth;
      resultEl.classList.add('pop-in');
      var runBtn = $('runCompressBtn');
      runBtn.disabled = false;
      runBtn.innerHTML = '<i class="ti ti-player-play"></i> 再压一次';
      if (!noScroll) {
        resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 420);
  }

  function animateNumber(el, target, fmt, duration) {
    var startTime = null;
    function frame(ts) {
      if (!startTime) startTime = ts;
      var p = Math.min(1, (ts - startTime) / duration);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(target * eased);
      if (p < 1) window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame(frame);
  }

  function flashButton(btn, msg) {
    var origin = btn.innerHTML;
    btn.textContent = msg;
    btn.classList.add('btn-warn');
    setTimeout(function () {
      btn.innerHTML = origin;
      btn.classList.remove('btn-warn');
    }, 1200);
  }

  function renderOrderChart(reports) {
    if (typeof Chart === 'undefined') return;
    var canvas = $('orderChart');
    if (orderChart) orderChart.destroy();
    orderChart = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: reports.map(function (r) { return r.order + '-gram'; }),
        datasets: [{
          label: '压缩后体积',
          data: reports.map(function (r) { return r.compressedBytes; }),
          backgroundColor: reports.map(function (r) {
            return r.order === reports.length ? 'rgba(255,215,0,0.85)' : 'rgba(144,202,249,0.65)';
          }),
          borderColor: reports.map(function (r) {
            return r.order === reports.length ? '#ffd700' : '#90caf9';
          }),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                var r = reports[ctx.dataIndex];
                return '压缩后 ' + ctx.parsed.y + ' B（省 ' + r.savedPercent.toFixed(1) + '%）';
              }
            }
          }
        },
        scales: {
          x: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.06)' } }
        }
      }
    });
  }

  function renderCurveChart(perCharBits) {
    if (typeof Chart === 'undefined') return;
    var curve = learningCurve(perCharBits, CURVE_BUCKETS);
    var canvas = $('curveChart');
    if (curveChart) curveChart.destroy();
    curveChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: curve.map(function (c) {
          return c.bucket === 1 ? '开头' : (c.bucket === curve.length ? '结尾' : c.bucket + '/' + curve.length);
        }),
        datasets: [{
          label: '每字符比特数',
          data: curve.map(function (c) { return c.bitsPerChar; }),
          borderColor: '#81c784',
          backgroundColor: 'rgba(129,199,132,0.15)',
          fill: true,
          tension: 0.35,
          pointRadius: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) { return ctx.parsed.y.toFixed(2) + ' bits/字符'; }
            }
          }
        },
        scales: {
          x: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.06)' } }
        }
      }
    });
  }

  function copyResult() {
    if (!lastReport) {
      flashButton($('copyResultBtn'), '先压一次再复制');
      return;
    }
    var text = '【LMCompress 压缩实验】' +
      '原始 ' + formatBytes(lastReport.originalBytes) +
      ' → ' + lastReport.order + '-gram 压后 ' + formatBytes(lastReport.compressedBytes) +
      '，省 ' + lastReport.savedPercent.toFixed(1) + '%' +
      '，' + lastReport.bitsPerChar.toFixed(2) + ' bits/字符。压缩的本质是预测。';

    function showToast() {
      var toast = $('copyToast');
      toast.classList.remove('hidden');
      toast.classList.remove('toast-up');
      void toast.offsetWidth;
      toast.classList.add('toast-up');
      setTimeout(function () { toast.classList.add('hidden'); }, 1800);
    }

    var done = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done = true; showToast(); }).catch(function () {
        fallbackCopy();
      });
    } else {
      fallbackCopy();
    }

    function fallbackCopy() {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      showToast();
    }
  }

  // ══════════════════════════════════════════════════════════
  // 模块三：训练数据量
  // ══════════════════════════════════════════════════════════
  function refreshDataValue() {
    var v = parseInt($('dataSlider').value, 10);
    $('dataValue').textContent = v.toLocaleString() + ' 字';
  }

  function runDataSweep() {
    var current = parseInt($('dataSlider').value, 10);
    var text = PRESETS.zh.text;
    var points = [];
    for (var i = 0; i < DATA_SIZES.length; i++) {
      var size = DATA_SIZES[i];
      var r = compressReport(text, TRAINING_CORPUS, 4, size);
      points.push({ size: size, saved: r.savedPercent });
    }
    renderDataChart(points, current);
    var cur = compressReport(text, TRAINING_CORPUS, 4, current);
    nfTrack('lm_data', { size: current });
  }

  function renderDataChart(points, current) {
    if (typeof Chart === 'undefined') return;
    var canvas = $('dataChart');
    if (dataChart) dataChart.destroy();
    dataChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: points.map(function (p) { return p.size.toLocaleString(); }),
        datasets: [{
          label: '压缩率',
          data: points.map(function (p) { return p.saved; }),
          borderColor: '#90caf9',
          backgroundColor: 'rgba(144,202,249,0.15)',
          fill: true,
          tension: 0.3,
          pointRadius: points.map(function (p) { return p.size === current ? 7 : 3; }),
          pointBackgroundColor: points.map(function (p) { return p.size === current ? '#ffd700' : '#90caf9'; })
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) { return '省 ' + ctx.parsed.y.toFixed(1) + '%'; }
            }
          }
        },
        scales: {
          x: { title: { display: true, text: '预训练数据量', color: '#889' }, ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { title: { display: true, text: '压缩率 (%)', color: '#889' }, ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.06)' } }
        }
      }
    });
  }

  // ══════════════════════════════════════════════════════════
  // 模块四：解压成本对决
  // ══════════════════════════════════════════════════════════
  var decodeStarted = false;

  function buildDecodeRace() {
    var list = decodeComparison(1024 * 1024);
    var html = '';
    for (var i = 0; i < list.length; i++) {
      html += '<div class="decode-row" data-key="' + list[i].key + '">' +
        '<div class="decode-head">' +
        '<span class="decode-name">' + list[i].label + '</span>' +
        '<span class="decode-time" data-time>0</span>' +
        '</div>' +
        '<div class="decode-track"><div class="decode-fill" style="background:' + list[i].color + '"></div></div>' +
        '<div class="decode-status" data-status>等待开始…</div>' +
        '</div>';
    }
    $('decodeRace').innerHTML = html;
  }

  function runDecodeRace() {
    if (decodeStarted) return;
    decodeStarted = true;
    nfTrack('lm_decode', {});
    var list = decodeComparison(1024 * 1024);
    var DURATION = 4; // 动画总时长（秒）
    var llm = list[3];

    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var row = document.querySelector('.decode-row[data-key="' + item.key + '"]');
      var fill = row.querySelector('.decode-fill');
      var timeEl = row.querySelector('[data-time]');
      var statusEl = row.querySelector('[data-status]');

      if (item.ms <= 100) {
        // gzip / n-gram：毫秒级，瞬间完成
        gsap.to(fill, { width: '100%', duration: 0.9, ease: 'power2.out', delay: 0.2 });
        gsap.to(timeEl, { duration: 0.9, delay: 0.2, onUpdate: function () {
          timeEl.textContent = item.ms.toFixed(1) + ' ms';
        } });
        statusEl.textContent = '完成：' + item.human;
      } else {
        // LLM：分钟级，动画只演示前几秒
        var llmMs = item.ms;
        gsap.to(fill, { width: (DURATION / (llmMs / 1000)) * 100 + '%', duration: DURATION, ease: 'none' });
        var startTime = Date.now();
        var ticker = setInterval(function () {
          var elapsed = (Date.now() - startTime) / 1000;
          var totalSec = llmMs / 1000;
          timeEl.textContent = '已过 ' + elapsed.toFixed(1) + ' s / 预计 ' + llm.human;
          if (elapsed >= DURATION) {
            clearInterval(ticker);
            timeEl.textContent = '预计总耗时 ' + llm.human;
          }
        }, 200);
      }
    }

    var verdict = $('decodeVerdict');
    setTimeout(function () {
      verdict.classList.remove('hidden');
      verdict.innerHTML = '<i class="ti ti-alert-triangle"></i> <strong>LMCompress 压掉 75% 的代价</strong>：' +
        'gzip 解压同一份文件只要几毫秒，而 LMCompress 需要 ' + llm.human + '——' +
        '每还原一个字符都要让 80 亿参数的模型推理一次。这就是它没人用的根本原因。';
    }, (DURATION + 0.5) * 1000);
  }

  // ══════════════════════════════════════════════════════════
  // 模块五：三角权衡图
  // ══════════════════════════════════════════════════════════
  function renderTradeoffChart() {
    if (typeof Chart === 'undefined') return;
    var matrix = tradeoffMatrix(1024 * 1024);
    var canvas = $('tradeoffChart');
    if (tradeoffChart) tradeoffChart.destroy();
    var bubbleSize = matrix.map(function (m) {
      return Math.max(6, Math.min(40, Math.log10(m.decodeMs + 1) * 6));
    });
    tradeoffChart = new Chart(canvas.getContext('2d'), {
      type: 'bubble',
      data: {
        datasets: [{
          label: '方案',
          data: matrix.map(function (m, i) {
            return { x: Math.log10(m.params), y: m.savedPercent, r: bubbleSize[i], name: m.name };
          }),
          backgroundColor: ['rgba(129,199,132,0.7)', 'rgba(144,202,249,0.7)', 'rgba(255,183,77,0.7)', 'rgba(255,107,107,0.75)']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                var d = ctx.raw;
                var label = d.name + '：';
                label += '参数 10^' + d.x.toFixed(1) + '，省 ' + d.y + '%';
                var m = matrix[ctx.dataIndex];
                label += '，解压 ' + m.decodeHuman;
                return label;
              }
            }
          }
        },
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: '模型规模（参数，对数刻度）', color: '#889' },
            min: 4,
            max: 10.5,
            ticks: {
              color: '#aaa',
              callback: function (v) {
                var labels = { 5: '0.1M', 6: '1M', 7: '10M', 8: '1亿', 9: '10亿', 10: '100亿' };
                return labels[v] || '';
              }
            },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y: {
            title: { display: true, text: '压缩率 (%)', color: '#889' },
            min: 30,
            max: 80,
            ticks: { color: '#aaa' },
            grid: { color: 'rgba(255,255,255,0.06)' }
          }
        }
      }
    });
  }

  // ══════════════════════════════════════════════════════════
  // 工具
  // ══════════════════════════════════════════════════════════
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ══════════════════════════════════════════════════════════
  // 初始化
  // ══════════════════════════════════════════════════════════
  document.addEventListener('DOMContentLoaded', function () {
    trackSessionStart();
    buildPredictModels();
    selectPreset('zh');
    // 零门槛：打开页面即有示例在跑
    $('predictInput').value = '压缩的本质是';
    updatePredictions();
    runCompress(true);

    // 模块一
    $('predictInput').addEventListener('input', onPredictInput);
    var presetBtns = document.querySelectorAll('.preset-btn');
    for (var i = 0; i < presetBtns.length; i++) {
      presetBtns[i].addEventListener('click', function () {
        $('predictInput').value = this.getAttribute('data-val');
        updatePredictions();
      });
    }

    // 模块二
    var presetCards = document.querySelectorAll('.preset-card');
    for (var j = 0; j < presetCards.length; j++) {
      presetCards[j].addEventListener('click', function () {
        selectPreset(this.getAttribute('data-key'));
      });
    }
    $('runCompressBtn').addEventListener('click', runCompress);
    $('copyResultBtn').addEventListener('click', copyResult);

    // 模块三
    $('dataSlider').addEventListener('input', refreshDataValue);
    $('runDataBtn').addEventListener('click', runDataSweep);
    refreshDataValue();
    runDataSweep();

    // 模块四
    buildDecodeRace();
    $('runDecodeBtn').addEventListener('click', runDecodeRace);

    // 模块五
    renderTradeoffChart();
  });

})();
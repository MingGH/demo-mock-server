/**
 * RPC 链路计时器 — DOM 交互 / 图表渲染。
 * 依赖：engine.js（window.RPC）、Chart.js（经 header.js 的 loadChartJS）。
 * 注意：本文件不做任何计时，只把服务端返回的真实数字画出来。
 */
(function () {
  'use strict';

  var RPC = window.RPC;
  var $ = function (id) { return document.getElementById(id); };

  // ========== 行为埋点（NFTrack，见 components/track.js） ==========
  // 事件清单：
  //   session_start (trackOnce) 页面加载
  //   chain_run     跑完一次链路（低频里程碑，镜像 umami）
  //   session_end   (force) 真正离页 pagehide
  if (typeof window !== 'undefined') {
    window.NF_TRACK_UMAMI_MIRROR = ['chain_run', 'session_end'];
  }
  function nfTrack(name, props, opts) {
    try {
      if (window.NFTrack && typeof window.NFTrack.track === 'function') {
        window.NFTrack.track(name, props, opts);
      }
    } catch (e) { /* 埋点失败不影响功能 */ }
  }
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

  var busy = false;
  var lastReport = null;
  var lastSummary = null;
  var lastScenario = null;   // 最近一次跑的 { hops, delayMs }
  var mainChart = null;
  var hopChart = null;

  // ── 场景预设 ──

  function currentParams() {
    return {
      hops: parseInt($('hopsRange').value, 10),
      delayMs: parseInt($('delayRange').value, 10)
    };
  }

  function setScenario(btn) {
    document.querySelectorAll('.scenario').forEach(function (b) {
      b.classList.toggle('active', b === btn);
    });
    var hops = parseInt(btn.dataset.hops, 10);
    var delay = parseInt(btn.dataset.delay, 10);
    $('hopsRange').value = hops;
    $('delayRange').value = delay;
    syncParamLabels();
  }

  function syncParamLabels() {
    $('hopsVal').textContent = $('hopsRange').value;
    $('delayVal').textContent = $('delayRange').value;
  }

  /** 手动改滑杆后，场景卡片不再处于选中态。 */
  function clearScenarioActive() {
    document.querySelectorAll('.scenario').forEach(function (b) {
      b.classList.remove('active');
    });
  }

  // ── 主流程 ──

  function setRunButtons(disabled) {
    $('runBtn').disabled = disabled;
  }

  function setStatus(text) {
    $('runStatus').textContent = text || '';
  }

  function startRun() {
    if (busy) return;
    busy = true;
    setRunButtons(true);
    $('result').style.display = 'none';
    $('apiError').style.display = 'none';

    var params = currentParams();
    setStatus('链路跑动中：' + params.hops + ' 跳 × 每跳注入 ' + params.delayMs + ' ms…');

    RPC.fetchChain(params.hops, params.delayMs)
      .then(function (report) {
        lastReport = report;
        lastSummary = RPC.summarize(report);
        lastScenario = { hops: params.hops, delayMs: params.delayMs };
        renderResult(report, lastSummary);
        nfTrack('chain_run', {
          hops: report.hops,
          delay_ms: report.delayMs,
          total_ms: Math.round(report.totalMillis),
          overhead_orders: lastSummary.orders
        });
        busy = false;
        setRunButtons(false);
        setStatus('');
      })
      .catch(function (err) {
        busy = false;
        setRunButtons(false);
        setStatus('');
        $('apiError').style.display = 'flex';
        $('apiErrorText').textContent = '链路没跑完：' +
          (err && err.message ? err.message : '未知错误') + '。稍等一会儿再试。';
      });
  }

  // ── 结果渲染 ──

  function renderResult(report, s) {
    $('result').style.display = 'block';

    var ratioText = '这条 ' + report.hops + ' 跳链路的纯 RPC 机制开销 <b class="hl-red">' + RPC.formatMs(s.overheadMs) + '</b>' +
      '（每跳 ' + RPC.formatMs(s.avgHopOverheadMs) + '，网络往返 + 双向序列化 + 框架调度），' +
      '同样的 ' + report.hops + ' 次方法调用在同一个 JVM 里连续做完合计只要 <b class="hl-green">' +
      RPC.formatNanos(s.baselineChainMs * 1e6) + '</b>，相差 <b class="hl-gold">' +
      RPC.formatRatio(s.taxRatio) + '</b>（' + s.taxOrders + ' 个数量级）。' +
      '两边都不含业务工作量，比的就是「把调用送出去」这件事本身有多贵。';

    if (report.delayMs > 0) {
      ratioText += '本轮还往每跳注入了 ' + report.delayMs + ' ms 业务时间，链路总耗时被抬到 <b class="hl-gold">' +
        RPC.formatMs(s.totalMillis) + '</b>，其中业务时间占 ' + s.upstreamPct.toFixed(1) +
        '%。这部分在单体里同样要花，不算分布式的账；但注意机制开销纹丝不动，它是按跳收的固定税，你越慢的业务只会让这笔税摊得越不显眼。';
    }

    $('ratioLine').innerHTML = ratioText;

    renderMainChart(s);
    renderHopChart(report);
    renderHopTable(report);
  }

  /** 图表组件加载失败时的降级提示（表格数字不受影响）。 */
  function showChartFallback(blockEl) {
    var wrap = blockEl.querySelector('.chart-canvas-wrap');
    if (wrap) {
      wrap.innerHTML =
        '<div style="color:#888;font-size:0.82rem;text-align:center;padding:44px 10px;">' +
        '图表组件加载失败，数字以下方表格为准。</div>';
    }
  }

  function renderMainChart(s) {
    var d = RPC.methodVsRpcChart(s, window.innerWidth < 600);
    loadChartJS().then(function () {
      if (mainChart) mainChart.destroy();
      mainChart = new Chart($('mainChart'), {
        type: 'bar',
        data: {
          labels: d.labels,
          datasets: [{
            label: '耗时 (ms，对数刻度)',
            data: d.values,
            backgroundColor: d.colors.map(function (c) { return c + 'cc'; }),
            borderColor: d.colors,
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
              title: { display: true, text: '毫秒（对数刻度）', color: '#888', font: { size: 11 } },
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
                  return ' ' + (ctx.dataIndex === 1
                    ? RPC.formatNanos(ctx.parsed.x * 1e6)
                    : RPC.formatMs(ctx.parsed.x));
                }
              }
            }
          }
        }
      });
    }).catch(function () {
      showChartFallback($('mainChart').closest('.chart-block'));
    });
  }

  function renderHopChart(report) {
    var d = RPC.perHopChart(report);
    loadChartJS().then(function () {
      if (hopChart) hopChart.destroy();
      hopChart = new Chart($('hopChart'), {
        type: 'bar',
        data: {
          labels: d.labels,
          datasets: [{
            label: '端到端 (ms，对数刻度)',
            data: d.values,
            backgroundColor: d.colors.map(function (c) { return c + '99'; }),
            borderColor: d.colors,
            borderWidth: 1.5,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              type: 'logarithmic',
              title: { display: true, text: '毫秒（对数刻度）', color: '#888', font: { size: 11 } },
              ticks: { color: '#aaa' },
              grid: { color: 'rgba(255,255,255,0.06)' }
            },
            x: { ticks: { color: '#aaa' }, grid: { display: false } }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  var hop = report.hopTimings[ctx.dataIndex];
                  return ' 端到端 ' + RPC.formatMs(hop.millis) +
                    '（下游业务 ' + RPC.formatMicros(hop.upstreamUs) + '）';
                }
              }
            }
          }
        }
      });
    }).catch(function () {
      showChartFallback($('hopChart').closest('.chart-block'));
    });
  }

  function renderHopTable(report) {
    var tbody = $('hopTable').querySelector('tbody');
    tbody.innerHTML = '';
    report.hopTimings.forEach(function (h) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="hop-no">第 ' + h.hop + ' 跳</td>' +
        '<td class="total-cell">' + RPC.formatMs(h.millis) + '</td>' +
        '<td class="biz-cell">' + RPC.formatMicros(h.upstreamUs) + '</td>' +
        '<td class="oh-cell">' + RPC.formatMs(RPC.hopOverheadMs(h)) + '</td>';
      tbody.appendChild(tr);
    });
  }

  // ── 复制结果 ──

  function copyResults() {
    if (!lastReport || !lastSummary) return;
    var s = lastSummary;
    var lines = ['RPC 链路计时器 · ' + lastScenario.hops + ' 跳 × 每跳注入 ' + lastScenario.delayMs + ' ms'];
    lines.push('每跳端到端均值：' + RPC.formatMs(s.avgHopMs));
    lines.push('RPC 机制开销/跳（扣业务时间）：' + RPC.formatMs(s.avgHopOverheadMs));
    lines.push('同 JVM 方法调用（' + s.iterations.toLocaleString() + ' 次均值）：' + RPC.formatNanos(lastReport.methodCallBaseline.avgNanos));
    lines.push('相差：' + RPC.formatRatio(s.ratio) + '（' + s.orders + ' 个数量级）');
    lines.push('总耗时 ' + RPC.formatMs(s.totalMillis) + '，业务时间占 ' + s.upstreamPct.toFixed(1) + '%');
    lines.push('https://numfeel.996.ninja/pages/rpc-chain/');
    var text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(flashCopyBtn, function () { fallbackCopy(text); });
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

  var COPY_BTN_HTML = '<i class="ti ti-copy"></i> 复制本次结果';
  var copyBtnTimer = null;
  function flashCopyBtn() {
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
    document.querySelectorAll('.scenario').forEach(function (b) {
      b.addEventListener('click', function () { setScenario(b); });
    });
    $('hopsRange').addEventListener('input', function () {
      syncParamLabels();
      clearScenarioActive();
    });
    $('delayRange').addEventListener('input', function () {
      syncParamLabels();
      clearScenarioActive();
    });
    $('runBtn').addEventListener('click', startRun);
    $('copyBtn').addEventListener('click', copyResults);
  }

  function init() {
    ensureSessionStart();
    bindEvents();
    syncParamLabels();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

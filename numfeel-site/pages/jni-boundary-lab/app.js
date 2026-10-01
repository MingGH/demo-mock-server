/**
 * 跨界收费站 - UI 交互层
 * 数据全部来自后端 /jni-boundary 真实测量，页面不做任何模拟。
 * 本地联调可用 ?api=http://localhost:8080 覆盖（与 java-agent-lab 同约定）。
 */
(function () {
  'use strict';

  var L = window.JniBoundaryLogic;

  var qs = new URLSearchParams(location.search);
  var API_BASE = qs.get('api') || 'https://numfeel-api.996.ninja';

  var LANES = ['noop', 'java', 'native-percall', 'native-batch'];
  var LANE_LABEL = {
    'noop': '纯过路费（noop）',
    'java': 'Java JIT 循环',
    'native-percall': 'C++ 单次过境',
    'native-batch': 'C++ 攒批过境'
  };

  // ===== 状态 =====
  var state = {
    count: 1000000,
    running: false,
    results: {},  // lane -> {medianNs, perOpNs, count, reps, ...}
    curve: null   // [{batch, perOpNs}...] 逐档实测，/curve 失败时保持 null 走推演兜底
  };

  // ===== DOM =====
  var $ = function (id) { return document.getElementById(id); };
  var els = {
    statusChip: $('status-chip'), statusText: $('status-text'),
    scaleGroup: $('scale-group'), fire: $('fire'),
    progressFill: $('progress-fill'), deckNote: $('deck-note'),
    numJava: $('num-java'), numNative: $('num-native'),
    speedJava: $('speed-java'), speedNative: $('speed-native'),
    tableBody: $('table-body'), verdict: $('verdict'),
    chart: $('chart'), term: $('term'), envInfo: $('env-info')
  };

  var t0 = Date.now();

  function log(msg, cls) {
    var line = document.createElement('div');
    line.className = 'term-line' + (cls ? ' ' + cls : '');
    var ts = ((Date.now() - t0) / 1000).toFixed(1);
    line.innerHTML = '<span class="t">[' + ts + 's]</span> ' + msg;
    els.term.appendChild(line);
    els.term.scrollTop = els.term.scrollHeight;
  }

  function setProgress(pct) {
    els.progressFill.style.width = pct + '%';
  }

  // ===== 状态灯 =====
  function loadStatus() {
    fetch(API_BASE + '/jni-boundary/status')
      .then(function (r) { return r.json(); })
      .then(function (body) {
        var d = body.data || {};
        if (d.available) {
          els.statusChip.classList.add('online');
          els.statusText.textContent = '后端在线 · ' + d.osName + ' ' + d.osArch + ' · Java ' + d.javaVersion + ' · C++ 库已挂载';
          els.envInfo.textContent = d.osName + ' ' + d.osArch + ' / Java ' + d.javaVersion;
        } else {
          els.statusChip.classList.add('offline');
          els.statusText.textContent = '后端在线，但 C++ 库不可用：' + (d.error || '未知原因');
        }
      })
      .catch(function () {
        els.statusChip.classList.add('offline');
        els.statusText.textContent = '后端离线（可用 ?api= 指向本地服务）';
        log('后端连接失败，数字测不了——检查 numfeel-api 是否活着', 'err');
      });
  }

  // ===== 跑基准 =====
  function runLane(lane, count) {
    return fetch(API_BASE + '/jni-boundary/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lane: lane, count: count })
    }).then(function (r) {
      return r.json().then(function (body) {
        if (body.status !== 200) {
          throw new Error(body.message || ('HTTP ' + r.status));
        }
        return body.data;
      });
    });
  }

  function laneLabelHtml(lane) {
    var cls = lane.indexOf('java') === 0 ? 'lane-java' : 'lane-native';
    return '<span class="' + cls + '">' + LANE_LABEL[lane] + '</span>';
  }

  function runAll() {
    if (state.running) return;
    state.running = true;
    state.results = {};
    state.curve = null;
    els.fire.disabled = true;
    els.verdict.textContent = '实测中，各车道依次发车…';
    els.verdict.className = 'verdict';
    els.numJava.textContent = '—';
    els.numNative.textContent = '—';
    els.speedJava.innerHTML = '&nbsp;';
    els.speedNative.innerHTML = '&nbsp;';
    Array.prototype.forEach.call(els.tableBody.querySelectorAll('tr'), function (tr) {
      tr.querySelectorAll('td').forEach(function (td, i) {
        if (i > 0) td.textContent = '—';
        td.className = '';
      });
    });

    log('发车：规模 ' + L.fmtCount(state.count) + ' 次操作，每车道 5 轮取中位数', 'info');

    var idx = 0;
    function next() {
      if (idx >= LANES.length) {
        loadCurve().then(finish);
        return;
      }
      var lane = LANES[idx];
      setProgress((idx / LANES.length) * 100);
      log('车道 ' + lane + ' 预热 + 测量中…');
      runLane(lane, state.count).then(function (data) {
        state.results[lane] = data;
        log(laneLabelHtml(lane) + '：总 ' + L.fmtNs(data.medianNs) +
            '，每次 ' + L.fmtNs(data.perOpNs) + '（5 轮中位数）', 'ok');
        updateTable(lane, data);
        updateCrashScreen();
        idx++;
        next();
      }).catch(function (e) {
        log(laneLabelHtml(lane) + ' 失败：' + e.message, 'err');
        log('基准中止。稍后重试，或看后端日志。', 'err');
        resetButton();
      });
    }
    next();
  }

  /** 逐档实测攒批曲线：每个点都是一次真实测量（一批 B 次操作，B 从 1 到整轮） */
  function loadCurve() {
    log('逐档实测曲线：13 档批量，从一批 1 次到整轮一批…');
    return fetch(API_BASE + '/jni-boundary/curve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: state.count })
    }).then(function (r) {
      return r.json().then(function (body) {
        if (body.status !== 200) throw new Error(body.message || ('HTTP ' + r.status));
        state.curve = body.data;
        var min = state.curve.reduce(function (a, p) { return p.perOpNs < a.perOpNs ? p : a; });
        log('曲线实测完成：13 档，最快一批 ' + L.fmtCount(min.batch) + ' 次（' +
            L.fmtNs(min.perOpNs) + '/次操作）', 'ok');
      });
    }).catch(function (e) {
      state.curve = null;
      log('逐档实测失败（' + e.message + '），曲线退回公式推演', 'err');
    });
  }

  function updateTable(lane, data) {
    var tr = els.tableBody.querySelector('tr[data-lane="' + lane + '"]');
    if (!tr) return;
    var tds = tr.querySelectorAll('td');
    tds[1].textContent = L.fmtNs(data.medianNs);
    tds[2].textContent = L.fmtNs(data.perOpNs);
    if (lane === 'java') {
      tr.classList.add('hot');
      return;
    }
    if (lane === 'noop' || !state.results.java) {
      // 纯过路费没有"对比 Java"的意义，Java 车道自己就是基准
      tds[3].textContent = lane === 'noop' ? '—' : '—';
      return;
    }
    var s = L.speedup(state.results.java.perOpNs, data.perOpNs);
    if (s > 1) {
      tds[3].textContent = '快 ' + s.toFixed(1) + ' 倍';
      tds[3].className = 'win';
    } else {
      tds[3].textContent = '慢 ' + (1 / s).toFixed(1) + ' 倍';
      tds[3].className = 'lose';
    }
  }

  function updateCrashScreen() {
    var j = state.results.java, b = state.results['native-batch'];
    if (j) els.numJava.textContent = L.fmtNs(j.perOpNs);
    if (b) els.numNative.textContent = L.fmtNs(b.perOpNs);
    if (j && b) {
      var s = L.speedup(j.perOpNs, b.perOpNs);
      if (s > 1) {
        els.speedNative.textContent = '▲ 快 ' + s.toFixed(1) + ' 倍';
        els.speedNative.style.color = '#4ade80';
        els.speedJava.textContent = '▼ 被 C++ 攒批反超';
        els.speedJava.style.color = '#f87171';
      } else {
        els.speedJava.textContent = '▲ 快 ' + (1 / s).toFixed(1) + ' 倍';
        els.speedJava.style.color = '#4ade80';
        els.speedNative.textContent = '▼ JIT 没给 C++ 留活路';
        els.speedNative.style.color = '#f87171';
      }
    }
  }

  function finish() {
    setProgress(100);
    var v = L.verdict({
      toll: state.results.noop ? state.results.noop.perOpNs : null,
      java: state.results.java,
      percall: state.results['native-percall'],
      batch: state.results['native-batch'],
      curve: state.curve
    });
    els.verdict.textContent = v.text;
    els.verdict.className = ('verdict ' + v.cls).trim();
    buildChart();
    resetButton();
  }

  function resetButton() {
    state.running = false;
    els.fire.disabled = false;
    els.fire.textContent = '▶ 再测一轮';
  }

  // ===== 图表（由实测值推导） =====
  var chart = null;

  function buildChart() {
    var j = state.results.java, b = state.results['native-batch'];
    var n = state.results.noop;
    if (!j || !b || !n) return;

    var measured = Array.isArray(state.curve) && state.curve.length > 0;
    var cross = measured
      ? L.measuredCrossover(j.perOpNs, state.curve)
      : L.crossoverBatch(j.perOpNs, b.perOpNs, n.perOpNs);
    var javaData, nativeData;
    if (measured) {
      javaData = state.curve.map(function (p) { return { x: p.batch, y: j.perOpNs }; });
      nativeData = state.curve.map(function (p) { return { x: p.batch, y: p.perOpNs }; });
    } else {
      var curve = L.measuredCurve(j.perOpNs, b.perOpNs, n.perOpNs, state.count);
      javaData = curve.batches.map(function (x) { return { x: x, y: j.perOpNs }; });
      nativeData = curve.batches.map(function (x, i) { return { x: x, y: curve.nativePerOp[i] }; });
    }

    var cfg = {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Java（实测，恒定）',
            data: javaData,
            borderColor: '#60a5fa',
            pointRadius: measured ? 3 : 0,
            pointBackgroundColor: '#60a5fa',
            borderWidth: 2.5,
            tension: 0
          },
          {
            label: measured ? 'C++ 攒批（逐档实测）' : 'C++ 攒批（过路费 ÷ N + 实测 v，推演）',
            data: nativeData,
            borderColor: '#fb923c',
            pointRadius: measured ? 3 : 0,
            pointBackgroundColor: '#fb923c',
            borderWidth: 2.5,
            tension: 0.15
          },
          {
            label: cross ? (measured ? '实测交叉点：一批 ' + L.fmtCount(cross) + ' 次' : '推演交叉点 N* ≈ ' + L.fmtCount(Math.ceil(cross))) : '',
            data: cross ? [{ x: Math.max(1, cross), y: j.perOpNs }] : [],
            borderColor: 'transparent',
            pointStyle: 'rectRot',
            pointRadius: 8,
            pointBackgroundColor: '#f87171',
            pointBorderColor: '#fca5a5',
            showLine: false
          },
          {
            label: '实测单次过境（b + v）',
            data: [{ x: 1, y: n.perOpNs + b.perOpNs }],
            borderColor: 'transparent',
            pointStyle: 'circle',
            pointRadius: 5,
            pointBackgroundColor: 'rgba(251,146,60,0.6)',
            showLine: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: {
            labels: {
              color: 'rgba(255,255,255,0.6)', font: { size: 11 }, boxWidth: 14,
              filter: function (item) { return item.text !== ''; }
            }
          },
          tooltip: {
            callbacks: {
              title: function (items) { return '批量 ' + Number(items[0].parsed.x).toLocaleString('zh-CN') + ' 次'; },
              label: function (item) { return ' ' + item.dataset.label.split('（')[0] + '：' + L.fmtNs(item.parsed.y) + '/次'; }
            }
          }
        },
        scales: {
          x: {
            type: 'logarithmic', min: 1, max: state.count,
            title: { display: true, text: '批量大小（一次过境带多少次操作）', color: 'rgba(255,255,255,0.45)', font: { size: 11 } },
            ticks: { color: 'rgba(255,255,255,0.45)', font: { size: 10 }, maxTicksLimit: 6, maxRotation: 0 },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y: {
            type: 'logarithmic',
            title: { display: true, text: '均摊到每次操作的耗时', color: 'rgba(255,255,255,0.45)', font: { size: 11 } },
            ticks: { color: 'rgba(255,255,255,0.45)', font: { size: 10 }, callback: function (val) { return L.fmtNs(Number(val)); } },
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        }
      }
    };

    if (chart) {
      chart.data = cfg.data;
      chart.update('none');
    } else {
      chart = new Chart(els.chart.getContext('2d'), cfg);
    }
  }

  // ===== 事件 =====
  els.scaleGroup.addEventListener('click', function (e) {
    var btn = e.target.closest('.seg-btn');
    if (!btn || state.running) return;
    els.scaleGroup.querySelectorAll('.seg-btn').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    state.count = Number(btn.dataset.count);
  });

  els.fire.addEventListener('click', runAll);

  // ===== 启动 =====
  loadStatus();
})();

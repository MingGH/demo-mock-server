/* app.js — "π 能当随机源吗" demo 交互层。核心逻辑走 window.PiRandomEngine（见 engine.js）。 */
(function () {
  'use strict';
  var E = window.PiRandomEngine;
  var $ = function (id) { return document.getElementById(id); };
  var hasGsap = function () { return typeof window.gsap !== 'undefined'; };
  var API_BASE = 'https://numfeel-api.996.ninja';

  // ── 行为埋点（通用埋点 SDK，见 components/track.js）──
  // session_start / session_end(pagehide) 低频镜像；其余高频事件不镜像。
  window.NF_TRACK_UMAMI_MIRROR = ['session_end'];
  var trackActive = false;
  function nfTrack(name, props, opts) {
    try { if (window.NFTrack) window.NFTrack.track(name, props, opts); } catch (e) {}
  }
  function trackSessionStart() {
    if (trackActive) return;
    trackActive = true;
    nfTrack('session_start', {});
  }
  function trackSessionEnd() {
    if (!trackActive) return;
    trackActive = false;
    nfTrack('session_end', {}, { force: true });
  }
  window.addEventListener('pagehide', function () { trackSessionEnd(); });
  trackSessionStart();

  var piDigits = '';
  var piReady = false;
  var normChart = null;
  var rollStart = 1;         // 模块 A：这次会话固定的 π 起点
  var bStart = 314150;       // 模块 B：密钥起点

  function toast(msg) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 1600);
  }

  // 把起点夹到合法范围，避免短数据（fallback）时超界抛错
  function safeSlice(start, length) {
    var max = Math.max(1, piDigits.length - length + 1);
    var s = Math.max(1, Math.min(start || 1, max));
    return E.takePiSlice(piDigits, s, length);
  }

  function pop(el) {
    if (!el) return;
    if (hasGsap()) {
      window.gsap.fromTo(el, { scale: 0.96, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(2)' });
    } else { el.style.opacity = 1; }
  }

  function fadeIn(el) {
    if (!el) return;
    if (hasGsap()) {
      window.gsap.to(el, { opacity: 1, duration: 0.5, ease: 'power2.out' });
    } else { el.style.opacity = 1; }
  }

  // ── 模块 A：掷色子 ──
  function renderPiStream() {
    var slice = safeSlice(rollStart, 20);
    $('piStream').textContent = E.joinDigits(slice).split('').join(' ');
    $('piStreamNote').textContent = '第 ' + E.formatBig(rollStart) + ' 位起 · 每次都一样';
  }

  function renderQuantumStream(digits) {
    $('qStream').textContent = digits.map(String).join(' ');
    $('qStreamNote').textContent = '每一次都不同';
  }

  function roll() {
    nfTrack('roll', {});
    renderPiStream();
    pop($('piStream'));
    // 量子真随机：后端取数，失败则本地兜底 + 诚实标注
    var btn = $('rollBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader"></i> 取量子真随机…';
    var finish = function () {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-bolt"></i> 再掷一次';
      fadeIn($('piAlwaysSame'));
    };
    fetch(API_BASE + '/quantum/numbers?count=20&min=0&max=9')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.status === 200 && j.data && j.data.length) {
          renderQuantumStream(j.data);
          $('qStreamNote').textContent = '每一次都不同（真随机）';
        } else {
          renderQuantumStream(E.takePiSlice('14159265358979323846', 1, 20));
          $('qStreamNote').textContent = '后端不可达，已回退演示数据';
        }
        pop($('qStream'));
        finish();
      })
      .catch(function () {
        renderQuantumStream(E.takePiSlice('14159265358979323846', 5, 20));
        $('qStreamNote').textContent = '后端不可达，已回退演示数据';
        pop($('qStream'));
        finish();
      });
  }

  function resetStart() {
    // 换个固定起点，让观众看到"换段"后依然每次都一致
    rollStart = 100 + Math.floor(Math.random() * Math.max(1, piDigits.length - 120));
    nfTrack('reset_start', {});
    renderPiStream();
    pop($('piStream'));
  }

  // ── 模块 B：密钥 / 黑客 ──
  function renderKeys() {
    $('bStartShow').textContent = E.formatBig(bStart);
    $('bStartVal').textContent = String(bStart);
    var key = E.joinDigits(safeSlice(bStart, 20));
    $('keyA').textContent = key;
    $('keyB').textContent = '点击「黑客复原」…';
  }

  function hack() {
    nfTrack('hack', {});
    var key = E.joinDigits(safeSlice(bStart, 20));
    $('keyB').textContent = key;
    pop($('keyB'));
    fadeIn($('hackInsight'));
  }

  // ── 模块 C：正规数分布 ──
  function normCount() {
    return Math.pow(10, parseInt($('cCount').value, 10) || 4);
  }

  function renderNorm() {
    var n = normCount();
    $('cCountVal').textContent = E.formatBig(n);
    var slice = safeSlice(1, n);
    var hist = E.digitHistogram(slice);
    var chi = E.chiSquare(hist);
    var sum = E.chiSummary(chi);

    var pct = hist.map(function (c) { return (c / n * 100); });
    var labels = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

    if (!window.loadChartJS) return;
    window.loadChartJS().then(function () {
      if (normChart) normChart.destroy();
      normChart = new window.Chart($('normChart').getContext('2d'), {
        type: 'bar',
        data: { labels: labels, datasets: [{ data: pct, backgroundColor: 'rgba(255,215,0,0.75)', borderRadius: 6 }] },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: function (c) { return c.parsed.y.toFixed(2) + '%'; } } },
          },
          scales: {
            y: { min: 0, max: 14, ticks: { color: '#888', callback: function (v) { return v + '%'; } }, grid: { color: 'rgba(255,255,255,0.06)' } },
            x: { ticks: { color: '#888' }, grid: { display: false } },
          },
        },
      });
    });

    $('cMeta').innerHTML = '取前 ' + E.formatBig(n) + ' 位 · χ² = <span class="hl">' + chi.toFixed(2) + '</span> · <span class="' + sum.cls + '">' + sum.label + '</span>';
  }

  // ── 模块 D：成本 ──
  function renderCost() {
    var start = parseInt($('dStart').value, 10) || 1;
    var len = parseInt($('dLen').value, 10) || 1;
    $('dStartVal').textContent = String(start);
    $('dLenVal').textContent = String(len);
    var needed = E.neededDigits(start, len);
    $('dNeeded').textContent = E.formatBig(needed);
    var sev = E.costSeverity(needed);
    $('dFill').style.width = (sev * 100).toFixed(1) + '%';
    $('dFill').style.background = sev < 0.4
      ? 'linear-gradient(90deg,#81c784,#a5d6a7)'
      : sev < 0.75
        ? 'linear-gradient(90deg,#ffd700,#ffb74d)'
        : 'linear-gradient(90deg,#ffb74d,#ff6b6b)';
  }

  // ── 复制结论 ──
  function copyConclusion() {
    nfTrack('copy', {});
    var text = 'π 不是随机源——它是一张确定的、公开的、无限长的表。它最多是个特定的伪随机源，前提是你不介意它的可复现性。来自「π 能当随机源吗」👉 https://numfeel.996.ninja/pages/pi-as-random-source/';
    var done = function () { toast('已复制结论'); };
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

  // ── 初始化 ──
  function boot() {
    if (typeof window.PI_1M === 'string' && window.PI_1M.length) {
      piDigits = window.PI_1M;
      piReady = true;
      $('piStatus').textContent = '已就绪 · ' + E.formatBig(piDigits.length) + ' 位';
    } else {
      // 兜底：data 未加载时用内置短串，保证页面可玩
      piDigits = '1415926535897932384626433832795028841971693993751058209749445923078164062862089986280348253421170679821480865132823066470938446095505822317253594081284811174502841027019385211055596446229489549303819644288109756659334461284756482337867831652712019091456485669234603486104543';
      piReady = true;
      $('piStatus').textContent = '内置演示数据（完整数据未加载）';
    }
    rollStart = 100 + Math.floor(Math.random() * Math.max(1, piDigits.length - 120));

    $('rollBtn').addEventListener('click', roll);
    $('resetStartBtn').addEventListener('click', resetStart);
    $('heroBtn').addEventListener('click', function () {
      $('sectionA').scrollIntoView({ behavior: 'smooth' });
      setTimeout(roll, 400);
    });

    $('bStart').addEventListener('input', function () { bStart = parseInt($('bStart').value, 10) || 1; renderKeys(); });
    $('hackBtn').addEventListener('click', hack);

    $('cCount').addEventListener('input', renderNorm);

    $('dStart').addEventListener('input', renderCost);
    $('dLen').addEventListener('input', renderCost);

    $('copyBtn').addEventListener('click', copyConclusion);
    $('topBtn').addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });

    renderPiStream();
    renderKeys();
    renderNorm();
    renderCost();
    roll();

    if (hasGsap()) {
      window.gsap.from('.header > *', { y: 16, opacity: 0, duration: 0.5, stagger: 0.1, ease: 'power2.out' });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
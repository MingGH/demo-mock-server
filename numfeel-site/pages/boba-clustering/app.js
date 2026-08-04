/**
 * 奶茶店扎堆：霍特林线性城市模型 - 交互逻辑
 * 依赖：engine.js, gsap, Chart.js (经 header.js 的 loadChartJS)
 */
(function () {
  'use strict';

  // ── 颜色与店名 ──
  var SHOP_COLORS = ['#ec4899', '#0ea5e9', '#4ade80', '#a855f7', '#fb923c'];
  var SHOP_NAMES = ['喜啡', '茶颜', '蜜雪', '书亦', '古茗'];

  // ══════════════════════════════════════
  // Card 1：拖动街道
  // ══════════════════════════════════════
  var street = document.getElementById('street');
  var shopA = document.getElementById('shopA');
  var shopB = document.getElementById('shopB');
  var divider = document.getElementById('divider');
  var dividerLabel = document.getElementById('dividerLabel');
  var shareA = document.getElementById('shareA');
  var shareB = document.getElementById('shareB');
  var posA = document.getElementById('posA');
  var posB = document.getElementById('posB');
  var avgDist = document.getElementById('avgDist');
  var whoWin = document.getElementById('whoWin');
  var dragInsight = document.getElementById('dragInsight');

  var state = { positions: [0.25, 0.75] }; // 初始为社会最优

  // ══════════════════════════════════════════════════════════
  // 行为埋点（NFTrack，见 components/track.js）
  // 事件清单：
  //   session_start → 会话开始（trackOnce）
  //   nash_click / social_click / reset_click → 街道视图按钮
  //   play_conv / step_conv / conv_reset → 收敛动画控制
  //   n_select { n } / play_n / n_reset → N 家店控制
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
  trackSessionStart();

  function toMeter(p) { return Math.round(p * 1000) + 'm'; }

  function updateStreet() {
    var pos = state.positions;
    shopA.style.left = (pos[0] * 100) + '%';
    shopB.style.left = (pos[1] * 100) + '%';
    var mid = (pos[0] + pos[1]) / 2;
    divider.style.left = (mid * 100) + '%';
    dividerLabel.textContent = '中点 ' + toMeter(mid);

    var shares = window.marketShares(pos);
    shareA.style.width = (shares[0] * 100) + '%';
    shareB.style.width = (shares[1] * 100) + '%';
    shareA.textContent = Math.round(shares[0] * 100) + '%';
    shareB.textContent = Math.round(shares[1] * 100) + '%';

    posA.textContent = toMeter(pos[0]);
    posB.textContent = toMeter(pos[1]);

    var d = window.avgCustomerDistance(pos, 2000);
    avgDist.textContent = toMeter(d);

    if (Math.abs(shares[0] - shares[1]) < 0.005) {
      whoWin.textContent = '平局';
      whoWin.style.color = '#fbbf24';
    } else if (shares[0] > shares[1]) {
      whoWin.textContent = '喜啡';
      whoWin.style.color = '#f472b6';
    } else {
      whoWin.textContent = '茶颜';
      whoWin.style.color = '#38bdf8';
    }
    updateDragInsight(pos, shares);
  }

  function updateDragInsight(pos, shares) {
    var d = window.avgCustomerDistance(pos, 2000);
    var isClustered = Math.abs(pos[0] - pos[1]) < 0.05;
    var isSocial = Math.abs(pos[0] - 0.25) < 0.02 && Math.abs(pos[1] - 0.75) < 0.02;
    if (isClustered) {
      dragInsight.innerHTML = '<strong>扎堆了。</strong>两家店几乎贴在一起，市场份额各 50% 平分，' +
        '但顾客平均要走 <span class="red">' + toMeter(d) + '</span>，是社会最优的 2 倍。' +
        '老板没多赚，顾客多走路--这就是纳什均衡的代价。';
    } else if (isSocial) {
      dragInsight.innerHTML = '<strong>这是社会最优。</strong>两家店分散在 250m 和 750m，' +
        '顾客平均只走 <span class="green">' + toMeter(d) + '</span>。' +
        '但这种状态不稳定--把任一家拖向对手，立刻能抢到更多市场。';
    } else if (Math.abs(shares[0] - shares[1]) > 0.05) {
      var who = shares[0] > shares[1] ? '喜啡' : '茶颜';
      dragInsight.innerHTML = '<strong>' + who + '占了便宜。</strong>靠对手更近的那家吃掉了超过一半的市场。' +
        '另一家不会坐视不管，它一定会往对手身边挪--这就是扎堆的开始。';
    } else {
      dragInsight.innerHTML = '把一家店拖到对手旁边试试，看市场份额如何瞬间被吃掉。';
    }
  }

  function makeDraggable(shopEl, idx) {
    shopEl.addEventListener('pointerdown', function (e) {
      shopEl.classList.add('dragging');
      shopEl.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    shopEl.addEventListener('pointermove', function (e) {
      if (!shopEl.classList.contains('dragging')) return;
      var rect = street.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var p = Math.max(0.02, Math.min(0.98, x / rect.width));
      state.positions[idx] = p;
      updateStreet();
    });
    function endDrag(e) {
      shopEl.classList.remove('dragging');
      if (e && e.pointerId !== undefined) {
        try { shopEl.releasePointerCapture(e.pointerId); } catch (err) {}
      }
    }
    shopEl.addEventListener('pointerup', endDrag);
    shopEl.addEventListener('pointercancel', endDrag);
  }

  function animateTo(target, msg) {
    if (window.gsap) {
      window.gsap.to(state.positions, {
        0: target[0], 1: target[1], duration: 0.8, ease: 'power2.inOut',
        onUpdate: updateStreet, onComplete: updateStreet
      });
    } else {
      state.positions = target.slice();
      updateStreet();
    }
  }

  document.getElementById('btnNash').addEventListener('click', function () {
    nfTrack('nash_click', {});
    animateTo([0.5, 0.5]);
  });
  document.getElementById('btnSocial').addEventListener('click', function () {
    nfTrack('social_click', {});
    animateTo([0.25, 0.75]);
  });
  document.getElementById('btnReset').addEventListener('click', function () {
    nfTrack('reset_click', {});
    animateTo([0.25, 0.75]);
  });

  // 初始化消费者小点（装饰）
  function initCustomerDots() {
    for (var i = 1; i < 20; i++) {
      var dot = document.createElement('div');
      dot.className = 'customer-dot';
      dot.style.left = (i / 20 * 100) + '%';
      street.appendChild(dot);
    }
  }

  // ══════════════════════════════════════
  // Card 2：自私的老板收敛动画
  // ══════════════════════════════════════
  var convStage = document.getElementById('convStage');
  var convA = document.getElementById('convA');
  var convB = document.getElementById('convB');
  var convStep = document.getElementById('convStep');
  var convPosA = document.getElementById('convPosA');
  var convPosB = document.getElementById('convPosB');
  var convDist = document.getElementById('convDist');
  var convLoss = document.getElementById('convLoss');
  var convInsight = document.getElementById('convInsight');

  var convHistory = null;
  var convIdx = 0;
  var convTimer = null;
  var CONV_INITIAL = [0.1, 0.9];

  function buildConvHistory() {
    var r = window.simulateConvergence(2, 24, CONV_INITIAL.slice(), 0.7);
    convHistory = r.history;
  }

  function showConvStep(i) {
    var pos = convHistory[i];
    convA.style.left = (pos[0] * 100) + '%';
    convB.style.left = (pos[1] * 100) + '%';
    convPosA.textContent = toMeter(pos[0]);
    convPosB.textContent = toMeter(pos[1]);
    var d = window.avgCustomerDistance(pos, 2000);
    convDist.textContent = toMeter(d);
    convLoss.textContent = '+' + Math.round((d - 0.125) * 1000) + 'm';

    var label;
    if (i === 0) label = '第 0 轮 · 初始：分散在两头，看起来挺和谐';
    else if (i >= convHistory.length - 1) label = '第 ' + i + ' 轮 · 收敛：都挤到正中央';
    else label = '第 ' + i + ' 轮 · 又往中间蹭了一步';
    convStep.innerHTML = '<strong>' + label + '</strong>';

    if (i === 0) {
      convInsight.innerHTML = '初始：喜啡在 ' + toMeter(pos[0]) + '，茶颜在 ' + toMeter(pos[1]) +
        '，各占一半，顾客平均走 ' + toMeter(d) + '。<strong>看似平衡，但有人马上要动歪心思。</strong>';
    } else if (i >= convHistory.length - 1) {
      var initDist = window.avgCustomerDistance(convHistory[0], 2000);
      convInsight.innerHTML = '<strong>结局：两家都到了 ' + toMeter(pos[0]) + '，紧挨着。</strong>市场份额还是各 50%，' +
        '没人多赚一分钱，但顾客平均走路从 ' + toMeter(initDist) + ' 涨到 <span class="red">' + toMeter(d) + '</span>。' +
        '<span class="red">贪心没让老板更富，只让所有人更累。</span>';
    } else {
      convInsight.innerHTML = '第 ' + i + ' 轮：靠边的那家发现「贴向对手」能抢市场，于是往中间挪。对手立刻跟进。两人互相逼近。';
    }
  }

  function stepConv() {
    if (convIdx >= convHistory.length - 1) return false;
    convIdx++;
    var pos = convHistory[convIdx];
    if (window.gsap) {
      window.gsap.to(convA, { left: (pos[0] * 100) + '%', duration: 0.45, ease: 'power2.out' });
      window.gsap.to(convB, { left: (pos[1] * 100) + '%', duration: 0.45, ease: 'power2.out' });
      window.gsap.delayedCall(0.45, function () { showConvStep(convIdx); });
    } else {
      showConvStep(convIdx);
    }
    return true;
  }

  function playConv() {
    nfTrack('play_conv', {});
    if (convTimer) { clearInterval(convTimer); convTimer = null; return; }
    if (convIdx >= convHistory.length - 1) { resetConv(); }
    convTimer = setInterval(function () {
      var hasMore = stepConv();
      if (!hasMore) { clearInterval(convTimer); convTimer = null; }
    }, 750);
  }

  function resetConv() {
    if (convTimer) { clearInterval(convTimer); convTimer = null; }
    convIdx = 0;
    showConvStep(0);
  }

  document.getElementById('btnPlay').addEventListener('click', playConv);
  document.getElementById('btnStep').addEventListener('click', function () { nfTrack('step_conv', {}); stepConv(); });
  document.getElementById('btnConvReset').addEventListener('click', function () { nfTrack('conv_reset', {}); resetConv(); });

  // ══════════════════════════════════════
  // Card 3：扎堆 vs 分散对比图
  // ══════════════════════════════════════
  function initCompareChart() {
    var cmp = window.compareStrategies(2);
    document.getElementById('cmpNashDist').textContent = toMeter(cmp.nash.avgDistance);
    document.getElementById('cmpSocDist').textContent = toMeter(cmp.social.avgDistance);
    document.getElementById('cmpLoss').textContent = cmp.welfareLoss.toFixed(1) + '×';

    function draw() {
      if (!window.Chart) return;
      new window.Chart(document.getElementById('cmpChart').getContext('2d'), {
        type: 'bar',
        data: {
          labels: ['顾客平均走路', '顾客最远走路', '两家店距离'],
          datasets: [
            {
              label: '扎堆·纳什均衡',
              data: [
                Math.round(cmp.nash.avgDistance * 1000),
                500,
                Math.round(Math.abs(cmp.nash.positions[0] - cmp.nash.positions[1]) * 1000)
              ],
              backgroundColor: 'rgba(248,113,113,0.7)', borderColor: '#f87171', borderWidth: 1.5
            },
            {
              label: '分散·社会最优',
              data: [
                Math.round(cmp.social.avgDistance * 1000),
                250,
                Math.round(Math.abs(cmp.social.positions[0] - cmp.social.positions[1]) * 1000)
              ],
              backgroundColor: 'rgba(74,222,128,0.7)', borderColor: '#4ade80', borderWidth: 1.5
            }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: 'rgba(255,255,255,0.65)', font: { size: 12 } } },
            tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + c.parsed.y + 'm'; } } }
          },
          scales: {
            x: { ticks: { color: 'rgba(255,255,255,0.55)', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: {
              beginAtZero: true,
              title: { display: true, text: '距离 (米)', color: 'rgba(255,255,255,0.4)' },
              ticks: { color: 'rgba(255,255,255,0.45)' }, grid: { color: 'rgba(255,255,255,0.05)' }
            }
          }
        }
      });
    }
    if (window.loadChartJS) {
      window.loadChartJS().then(draw).catch(function () { draw(); });
    } else {
      draw();
    }
  }

  // ══════════════════════════════════════
  // Card 4：N 家店
  // ══════════════════════════════════════
  var nStage = document.getElementById('nStage');
  var nStep = document.getElementById('nStep');
  var nSocDist = document.getElementById('nSocDist');
  var nNashDist = document.getElementById('nNashDist');
  var nLoss = document.getElementById('nLoss');
  var nEq = document.getElementById('nEq');
  var nInsight = document.getElementById('nInsight');

  var nState = { n: 2, history: null, idx: 0, shops: [], timer: null };

  function clearNShops() {
    nState.shops.forEach(function (s) { s.remove(); });
    nState.shops = [];
  }

  function makeNShop(i) {
    var el = document.createElement('div');
    el.style.cssText = 'position:absolute;top:50%;transform:translate(-50%,-50%);width:38px;height:38px;border-radius:50%;' +
      'display:flex;align-items:center;justify-content:center;font-size:18px;color:#fff;z-index:3;' +
      'background:linear-gradient(135deg,' + SHOP_COLORS[i % SHOP_COLORS.length] + ',' +
      SHOP_COLORS[i % SHOP_COLORS.length] + ');' +
      'box-shadow:0 3px 10px ' + SHOP_COLORS[i % SHOP_COLORS.length] + '88;';
    el.innerHTML = '<i class="ti ti-cup-soda"></i>';
    nStage.appendChild(el);
    return el;
  }

  function initN(n) {
    if (nState.timer) { clearInterval(nState.timer); nState.timer = null; }
    nState.n = n;
    clearNShops();
    var init = [];
    for (var i = 0; i < n; i++) init.push((i + 0.5) / n);
    // 打乱初始位置，让博弈有看头
    init.sort(function () { return 0.5 - Math.random(); });
    var r = window.simulateConvergence(n, 30, init, 0.55);
    nState.history = r.history;
    nState.idx = 0;
    for (var k = 0; k < n; k++) nState.shops.push(makeNShop(k));
    showNStep(0);

    var cmp = window.compareStrategies(n);
    nSocDist.textContent = toMeter(cmp.social.avgDistance);
    nNashDist.textContent = toMeter(cmp.nash.avgDistance);
    nLoss.textContent = cmp.welfareLoss.toFixed(1) + '×';
    var hasEq = window.hasPureNashEquilibrium(n);
    nEq.textContent = hasEq ? '有' : '无';
    nEq.style.color = hasEq ? '#4ade80' : '#f87171';

    if (n === 2) {
      nInsight.innerHTML = '<strong>2 家店：有均衡。</strong>两家都会被吸引到正中央 500m，各占 50%。' +
        '虽然顾客平均走 <span class="red">' + toMeter(cmp.nash.avgDistance) + '</span>（社会最优只要 ' +
        toMeter(cmp.social.avgDistance) + '），但谁先散开谁吃亏。';
    } else if (n === 3) {
      nInsight.innerHTML = '<strong>3 家店：无纯策略均衡。</strong>点开始看，三家会持续互相追逐，停不下来。' +
        '任一时刻都有店能通过贴向邻居抢市场--这就是「不存在稳定点」的数学含义。' +
        '现实中三条奶茶街往往靠差异化（产品、装修、价格）打破模型假设来稳住。';
    } else {
      nInsight.innerHTML = '<strong>' + n + ' 家店：同样无纯策略均衡。</strong>店越多，扎堆越疯狂，' +
        '福利损失涨到 <span class="red">' + cmp.welfareLoss.toFixed(1) + ' 倍</span>。' +
        '点开始看它们互相追逐的混乱场面。';
    }
  }

  function showNStep(i) {
    var pos = nState.history[i];
    for (var k = 0; k < pos.length; k++) {
      nState.shops[k].style.left = (pos[k] * 100) + '%';
    }
    var label;
    if (i === 0) label = '第 0 轮 · 初始';
    else if (i >= nState.history.length - 1) label = '第 ' + i + ' 轮 · 终点';
    else label = '第 ' + i + ' 轮';
    nStep.innerHTML = '<strong>' + label + '</strong>';
  }

  function stepN() {
    if (nState.idx >= nState.history.length - 1) return false;
    nState.idx++;
    var pos = nState.history[nState.idx];
    for (var k = 0; k < pos.length; k++) {
      if (window.gsap) {
        window.gsap.to(nState.shops[k], { left: (pos[k] * 100) + '%', duration: 0.4, ease: 'power2.out' });
      } else {
        nState.shops[k].style.left = (pos[k] * 100) + '%';
      }
    }
    if (window.gsap) {
      window.gsap.delayedCall(0.4, function () { showNStep(nState.idx); });
    } else {
      showNStep(nState.idx);
    }
    return true;
  }

  function playN() {
    if (nState.timer) { clearInterval(nState.timer); nState.timer = null; return; }
    if (nState.idx >= nState.history.length - 1) { nState.idx = 0; showNStep(0); }
    nState.timer = setInterval(function () {
      var hasMore = stepN();
      if (!hasMore) { clearInterval(nState.timer); nState.timer = null; }
    }, 650);
  }

  document.getElementById('shopSelector').addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    var nn = parseInt(btn.dataset.n, 10);
    nfTrack('n_select', { n: nn });
    document.querySelectorAll('#shopSelector button').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    initN(nn);
  });
  document.getElementById('btnNPlay').addEventListener('click', function () { nfTrack('play_n', {}); playN(); });
  document.getElementById('btnNReset').addEventListener('click', function () {
    nfTrack('n_reset', {});
    if (nState.timer) { clearInterval(nState.timer); nState.timer = null; }
    nState.idx = 0; showNStep(0);
  });

  // ══════════════════════════════════════
  // 初始化
  // ══════════════════════════════════════
  function init() {
    initCustomerDots();
    makeDraggable(shopA, 0);
    makeDraggable(shopB, 1);
    updateStreet();

    buildConvHistory();
    showConvStep(0);

    initCompareChart();
    initN(2);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

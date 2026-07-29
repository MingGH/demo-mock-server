/**
 * app.js - 马斯克财富烧钱模拟器 · DOM 交互层
 * 依赖：engine.js（全局 MuskBurner）、Chart.js
 */
/* global MuskBurner, Chart */
(function () {
  'use strict';
  var E = MuskBurner;

  // ── 图片：按需图片 API（无水印）────────────────────────
  var IMG_BASE = 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?image_size=';
  function img(prompt, size) {
    return IMG_BASE + (size || 'landscape_4_3') + '&prompt=' + encodeURIComponent(prompt);
  }
  var IMAGES = {
    hero: img('opulent Macau VIP casino baccarat lounge at night, dark emerald green felt table with gold trim, golden chandelier glow, champagne, moody luxurious, photorealistic, cinematic', 'landscape_16_9'),
    baccarat: img('baccarat casino table green felt golden chips playing cards close up dark luxurious moody photorealistic'),
    yacht: img('sleek white mega yacht in turquoise tropical sea at golden hour aerial drone view photorealistic luxurious'),
    island: img('private tropical island with luxury villa white sand beach turquoise lagoon aerial photorealistic paradise'),
    rocket: img('stainless steel starship rocket lifting off at dusk bright orange flame white smoke photorealistic cinematic'),
    skyline: img('futuristic global financial district skyline at night glowing glass skyscrapers deep blue teal tones photorealistic')
  };

  // ── 状态 ───────────────────────────────────────────────
  var state = {
    wealth: E.START_WEALTH,
    startTime: Date.now(),
    owned: {},          // id -> 拥有数量
    handsPlayed: 0,
    wins: 0,
    gamblingNet: 0,     // 赌博净盈亏
    biggestBuy: { name: '无', amount: 0 },
    wealthHistory: [E.START_WEALTH],
    bet: E.TABLE_MAX_BET,
    settled: false
  };

  // ── DOM 缓存 ───────────────────────────────────────────
  var $ = function (id) { return document.getElementById(id); };
  var chart = null;

  // ── 工具：上标数字 ─────────────────────────────────────
  var SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  function sup(s) {
    return String(s).split('').map(function (c) { return SUP[c] || c; }).join('');
  }

  // ── 仪表盘渲染 ─────────────────────────────────────────
  function burned() {
    return Math.max(0, E.START_WEALTH - state.wealth);
  }
  function renderDash() {
    var wEl = $('wealth');
    wEl.textContent = E.formatMoney(state.wealth);
    wEl.classList.toggle('broke', state.wealth <= 0);
    wEl.classList.add('bump');
    setTimeout(function () { wEl.classList.remove('bump'); }, 250);

    var b = burned();
    $('spent').textContent = E.formatMoney(b);
    var pct = (b / E.START_WEALTH) * 100;
    $('spentPct').textContent = pct.toFixed(pct < 1 ? 3 : 1) + '%';
    $('wealthBar').style.width = pct + '%';
  }

  function tickClock() {
    var elapsed = (Date.now() - state.startTime) / 1000;
    $('elapsed').textContent = elapsed < 60
      ? Math.round(elapsed) + ' 秒'
      : (elapsed / 60).toFixed(1) + ' 分钟';
    var b = burned();
    if (b > 0 && elapsed > 0) {
      var rate = b / elapsed;
      $('rate').textContent = E.formatMoney(rate) + '/秒';
      var secs = state.wealth / rate;
      $('countdown').textContent = secs < 60
        ? Math.round(secs) + ' 秒'
        : E.formatDuration(secs / 60);
    } else {
      $('rate').textContent = '$0/秒';
      $('countdown').textContent = '∞';
    }
  }

  // ── 赌桌：下注滑块（对数刻度）─────────────────────────
  function betFromSlider(val) {
    var lo = Math.min(E.TABLE_MAX_BET, state.wealth);
    var hi = Math.max(lo, state.wealth);
    if (hi <= lo) return hi;
    return lo * Math.pow(hi / lo, val / 100);
  }
  function sliderFromBet(bet) {
    var lo = Math.min(E.TABLE_MAX_BET, state.wealth);
    var hi = Math.max(lo, state.wealth);
    if (hi <= lo) return 0;
    var t = Math.log(bet / lo) / Math.log(hi / lo);
    return Math.max(0, Math.min(100, t * 100));
  }

  function renderBet() {
    var bet = state.bet;
    $('betAmount').textContent = E.formatMoney(bet);
    var slider = $('betSlider');
    var v = sliderFromBet(bet);
    slider.value = v;
    slider.style.setProperty('--pct', v + '%');

    // 破产概率
    var exponent = -2 * E.BACCARAT_EDGE * state.wealth / bet;
    var p = E.ruinProbability(state.wealth, bet);
    var pTxt;
    if (p < 1e-6 && exponent < -10) {
      pTxt = 'e' + sup(exponent.toFixed(0)) + ' ≈ 0';
    } else if (p < 0.01) {
      pTxt = p.toExponential(1);
    } else {
      pTxt = (p * 100).toFixed(p < 0.1 ? 3 : 1) + '%';
    }
    $('ruinP').textContent = pTxt;

    // 期望续航
    var mins = E.expectedDurationMinutes(state.wealth, bet);
    $('expDur').textContent = isFinite(mins) ? E.formatDuration(mins) : '∞';

    // 每手期望亏损
    $('lossHand').textContent = E.formatMoney(E.lossPerHand(bet));

    // 危险阈值（与下注无关，随财富变）
    $('crossover').textContent = E.formatMoney(E.crossoverBet(state.wealth, 0.5));

    // 对比
    var annual = E.annualLoss(bet);
    var teslaH = annual / E.TESLA_HOURLY_SWING;
    $('compare').innerHTML = '此下注下，一年期望亏 <b>' + E.formatMoney(annual) +
      '</b>，仅相当于马斯克 <b>' + teslaH.toFixed(3) + '</b> 小时的身家波动（他一天有 24 小时）。';
  }

  // 预设下注
  var PRESETS = [
    { name: '台面顶限', val: function () { return Math.min(E.TABLE_MAX_BET, state.wealth); } },
    { name: '$1亿', val: function () { return 1e8; } },
    { name: '$10亿', val: function () { return 1e9; } },
    { name: '$100亿', val: function () { return 1e10; } },
    { name: '$1000亿', val: function () { return 1e11; } },
    { name: '梭哈', val: function () { return state.wealth; } }
  ];
  function renderPresets() {
    var box = $('betPresets');
    box.innerHTML = '';
    PRESETS.forEach(function (p) {
      var b = document.createElement('button');
      b.className = 'btn btn-ghost btn-sm';
      b.textContent = p.name;
      b.onclick = function () {
        state.bet = Math.min(p.val(), state.wealth);
        if (state.bet <= 0) state.bet = state.wealth;
        renderBet();
      };
      box.appendChild(b);
    });
  }

  // ── 博弈 ───────────────────────────────────────────────
  function pushHistory(w) {
    state.wealthHistory.push(w);
    if (state.wealthHistory.length > 20000) {
      // 抽稀：每两个保留一个
      var nh = [state.wealthHistory[0]];
      for (var i = 1; i < state.wealthHistory.length; i += 2) nh.push(state.wealthHistory[i]);
      state.wealthHistory = nh;
    }
  }

  function playOnce() {
    if (state.settled || state.wealth <= 0) return;
    var bet = Math.min(state.bet, state.wealth);
    if (bet <= 0) return;
    var r = E.playHand(bet);
    state.wealth = Math.max(0, state.wealth + r.delta);
    state.handsPlayed++;
    if (r.win) state.wins++;
    state.gamblingNet += r.delta;
    pushHistory(state.wealth);

    var rl = $('resultLine');
    if (r.win) {
      rl.innerHTML = '<span style="color:var(--green)">赢 +' + E.formatMoney(bet) + '</span> <span class="cnt">第 ' + state.handsPlayed + ' 手 · 胜率 ' + pct(state.wins, state.handsPlayed) + '</span>';
      rl.className = 'result-line win';
    } else {
      rl.innerHTML = '<span style="color:var(--red)">输 -' + E.formatMoney(bet) + '</span> <span class="cnt">第 ' + state.handsPlayed + ' 手 · 胜率 ' + pct(state.wins, state.handsPlayed) + '</span>';
      rl.className = 'result-line lose';
    }
    renderDash();
    renderBet();
    redrawChart();
    if (state.wealth <= 0) settle(true);
  }

  function pct(a, b) { return b > 0 ? (a / b * 100).toFixed(1) + '%' : '-'; }

  function play100() {
    if (state.settled || state.wealth <= 0) return;
    var bet = Math.min(state.bet, state.wealth);
    if (bet <= 0) return;
    var net = 0;
    var wins = 0;
    for (var i = 0; i < 100; i++) {
      if (state.wealth <= 0) break;
      var b = Math.min(bet, state.wealth);
      var r = E.playHand(b);
      state.wealth = Math.max(0, state.wealth + r.delta);
      state.handsPlayed++;
      if (r.win) { state.wins++; wins++; }
      state.gamblingNet += r.delta;
      net += r.delta;
      pushHistory(state.wealth);
    }
    var rl = $('resultLine');
    var sign = net >= 0 ? '+' : '';
    rl.innerHTML = '100 手：净 <span style="color:' + (net >= 0 ? 'var(--green)' : 'var(--red)') + '">' + sign + E.formatMoney(net) + '</span> <span class="cnt">胜 ' + wins + '/100 · 累计 ' + state.handsPlayed + ' 手</span>';
    rl.className = 'result-line ' + (net >= 0 ? 'win' : 'lose');
    renderDash();
    renderBet();
    redrawChart();
    if (state.wealth <= 0) settle(true);
  }

  function playRuin() {
    if (state.settled || state.wealth <= 0) return;
    var bet = Math.min(state.bet, state.wealth);
    if (bet <= 0) return;
    var expected = E.expectedHandsToRuin(state.wealth, bet);
    var cap = Math.min(1000000, Math.max(2000, Math.round(expected * 2)));
    var before = state.wealth;
    var sim = E.simulateHands(before, bet, cap);
    state.wealth = sim.finalWealth;
    state.handsPlayed += sim.handsPlayed;
    state.wins += sim.wins;
    state.gamblingNet += (sim.finalWealth - before);
    // 用轨迹续接历史（trajectory[0] == before，与当前末尾一致，从 1 开始）
    for (var i = 1; i < sim.trajectory.length; i++) pushHistory(sim.trajectory[i]);

    var rl = $('resultLine');
    if (sim.busted) {
      rl.innerHTML = '<span style="color:var(--red)">赌了 ' + sim.handsPlayed.toLocaleString() + ' 手，归零了</span>';
      rl.className = 'result-line lose';
    } else {
      rl.innerHTML = '<span style="color:var(--gold)">赌了 ' + sim.handsPlayed.toLocaleString() + ' 手，还剩 ' + E.formatMoney(sim.finalWealth) + '</span> <span class="cnt">按公式要 ' + E.formatCount(expected) + ' 手才可能光</span>';
      rl.className = 'result-line win';
    }
    renderDash();
    renderBet();
    redrawChart();
    if (state.wealth <= 0) settle(true);
  }

  // ── 图表 ───────────────────────────────────────────────
  function downsample(arr, n) {
    if (arr.length <= n) return arr.slice();
    var step = arr.length / n;
    var out = [];
    for (var i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
    out.push(arr[arr.length - 1]);
    return out;
  }
  function redrawChart() {
    var ctx = $('wealthChart');
    if (!ctx) return;
    var data = downsample(state.wealthHistory, 400);
    if (chart) {
      chart.data.labels = data.map(function (_, i) { return i; });
      chart.data.datasets[0].data = data;
      chart.update('none');
      return;
    }
    chart = new Chart(ctx.getContext('2d'), {
      type: 'line',
      data: {
        labels: data.map(function (_, i) { return i; }),
        datasets: [{
          data: data,
          borderColor: '#ffd700',
          backgroundColor: 'rgba(255,215,0,0.08)',
          fill: true,
          tension: 0.2,
          pointRadius: 0,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false },
          y: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: 'rgba(255,255,255,0.4)', callback: function (v) { return E.formatMoney(v); } }
          }
        }
      }
    });
  }

  // ── 商店 ───────────────────────────────────────────────
  function renderShop() {
    var grid = $('shopGrid');
    grid.innerHTML = '';
    E.CATALOG.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'shop-card';
      card.dataset.id = item.id;
      card.innerHTML =
        '<div class="shop-img" style="background-image:url(' + IMAGES[item.img] + ')">' +
          '<div class="shop-own" id="own-' + item.id + '">0</div>' +
        '</div>' +
        '<div class="shop-body">' +
          '<div class="name">' + item.name + '</div>' +
          '<div class="desc">' + item.desc + '</div>' +
          '<div class="price">' + E.formatMoney(item.price) + '</div>' +
          '<button class="btn btn-gold buy"><i class="ti ti-shopping-cart-plus"></i> 买一架</button>' +
        '</div>';
      card.querySelector('.buy').addEventListener('click', function (ev) { buy(item, ev); });
      grid.appendChild(card);
    });

    var qr = $('quickRow');
    qr.innerHTML = '';
    E.QUICK_BURNS.forEach(function (item) {
      var b = document.createElement('button');
      b.className = 'btn btn-ghost btn-sm';
      b.innerHTML = item.name + ' · ' + E.formatMoney(item.price);
      b.addEventListener('click', function (ev) { quickBurn(item, ev); });
      qr.appendChild(b);
    });
  }

  function refreshShopState() {
    var cards = document.querySelectorAll('.shop-card');
    cards.forEach(function (c) {
      var id = c.dataset.id;
      var item = E.CATALOG.filter(function (x) { return x.id === id; })[0];
      var afford = state.wealth >= item.price;
      c.classList.toggle('disabled', !afford);
      var own = state.owned[id] || 0;
      var ownEl = $('own-' + id);
      if (ownEl) ownEl.textContent = '×' + own;
    });
  }

  function buy(item, ev) {
    if (state.settled) return;
    if (state.wealth < item.price) { toast('买不起「' + item.name + '」了', true); return; }
    state.wealth = E.spend(state.wealth, item.price);
    state.owned[item.id] = (state.owned[item.id] || 0) + 1;
    if (item.price > state.biggestBuy.amount) state.biggestBuy = { name: item.name, amount: item.price };
    pushHistory(state.wealth);
    floatNum('-' + E.formatMoney(item.price), ev, 'neg');
    toast('入手「' + item.name + '」 -' + E.formatMoney(item.price));
    renderDash();
    renderBet();
    refreshShopState();
    redrawChart();
    if (state.wealth <= 0) settle(true);
  }

  function quickBurn(item, ev) {
    if (state.settled) return;
    if (state.wealth < item.price) { toast('不够钱「' + item.name + '」', true); return; }
    state.wealth = E.spend(state.wealth, item.price);
    state.owned[item.id] = (state.owned[item.id] || 0) + 1;
    if (item.price > state.biggestBuy.amount) state.biggestBuy = { name: item.name, amount: item.price };
    pushHistory(state.wealth);
    floatNum('-' + E.formatMoney(item.price), ev, 'neg');
    renderDash();
    renderBet();
    refreshShopState();
    redrawChart();
    if (state.wealth <= 0) settle(true);
  }

  // ── 结算 / 重置 ────────────────────────────────────────
  function settle(broke) {
    if (state.settled) return;
    state.settled = true;
    var elapsed = (Date.now() - state.startTime) / 1000;
    var b = burned();
    var owned = Object.keys(state.owned).reduce(function (s, k) { return s + (state.owned[k] || 0); }, 0);

    $('modalIcon').textContent = broke ? '💀' : '🏁';
    $('modalTitle').textContent = broke ? '真给烧光了！' : '结算';
    $('modalMsg').innerHTML = broke
      ? '你居然真的把 <b>$1.3万亿</b> 烧光了。在澳门赌桌上这几乎不可能--除非你一直梭哈。'
      : '你还有 <b>' + E.formatMoney(state.wealth) + '</b> 没花完。概率论说：按台面上限，你永远花不光。';

    var stats = [
      { k: '烧掉总额', v: E.formatMoney(b) },
      { k: '本局耗时', v: elapsed < 60 ? Math.round(elapsed) + ' 秒' : (elapsed / 60).toFixed(1) + ' 分钟' },
      { k: '赌博手数', v: state.handsPlayed.toLocaleString() },
      { k: '赌博净盈亏', v: (state.gamblingNet >= 0 ? '+' : '') + E.formatMoney(state.gamblingNet) },
      { k: '入手物件', v: owned + ' 件' },
      { k: '最大单笔', v: state.biggestBuy.name + ' ' + E.formatMoney(state.biggestBuy.amount) }
    ];
    $('modalStats').innerHTML = stats.map(function (s) {
      return '<div class="ms"><div class="mv">' + s.v + '</div><div class="mk">' + s.k + '</div></div>';
    }).join('');
    $('modal').classList.add('show');
  }

  function reset() {
    state = {
      wealth: E.START_WEALTH,
      startTime: Date.now(),
      owned: {},
      handsPlayed: 0,
      wins: 0,
      gamblingNet: 0,
      biggestBuy: { name: '无', amount: 0 },
      wealthHistory: [E.START_WEALTH],
      bet: E.TABLE_MAX_BET,
      settled: false
    };
    $('modal').classList.remove('show');
    $('resultLine').textContent = '点「赌一把」开始，看看概率站在谁那边';
    $('resultLine').className = 'result-line';
    renderDash();
    renderBet();
    refreshShopState();
    redrawChart();
  }

  // ── 反馈：飘字 / Toast ─────────────────────────────────
  function floatNum(text, ev, cls) {
    var el = document.createElement('div');
    el.className = 'float-num ' + (cls || '');
    el.textContent = text;
    var x = ev ? ev.clientX : window.innerWidth / 2;
    var y = ev ? ev.clientY : window.innerHeight / 2;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 1000);
  }
  var toastTimer = null;
  function toast(msg, neg) {
    var t = $('toast');
    t.innerHTML = msg;
    t.classList.toggle('neg', !!neg);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2000);
  }

  // ── 背景图 ─────────────────────────────────────────────
  function applyImages() {
    $('dashBg').style.backgroundImage = 'url(' + IMAGES.hero + ')';
    $('feltImg').style.backgroundImage = 'url(' + IMAGES.baccarat + ')';
  }

  // ── 绑定 ───────────────────────────────────────────────
  function bind() {
    $('betSlider').addEventListener('input', function () {
      state.bet = betFromSlider(parseFloat(this.value));
      renderBet();
    });
    $('playBtn').addEventListener('click', playOnce);
    $('play100Btn').addEventListener('click', play100);
    $('playRuinBtn').addEventListener('click', playRuin);
    $('resetBtn').addEventListener('click', reset);
    $('settleBtn').addEventListener('click', function () { settle(false); });
    $('modalReset').addEventListener('click', reset);
  }

  // ── 初始化 ─────────────────────────────────────────────
  function init() {
    applyImages();
    renderPresets();
    renderShop();
    bind();
    renderDash();
    renderBet();
    refreshShopState();
    redrawChart();
    setInterval(tickClock, 1000);
    tickClock();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

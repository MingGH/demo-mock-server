/**
 * 十连注 交互层（只做 DOM 与图表，业务公式全部在 ten-bets-logic.js）
 *
 * 埋点：components/track.js 的 NFTrack（未加载时静默跳过）
 * 事件：session_start / bet / game_end(force) / reset / undo / discover / share_card
 */
(function () {
  'use strict';
  var L = window.TenBets;
  if (!L) return;

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    capital: $('capital'), roundNo: $('roundNo'), prob: $('prob'), probFill: $('probFill'),
    excluded: $('excluded'), bet: $('bet'), betVal: $('betVal'), betHint: $('betHint'),
    betPanel: $('betPanel'), betTip: $('betTip'),
    go: $('go'), reset: $('reset'), undo: $('undo'),
    track: $('track'), verdict: $('verdict'), canvas: $('curve'),
    stGames: $('stGames'), stWins: $('stWins'), stBest: $('stBest'), stBestEver: $('stBestEver'),
    shareRow: $('shareRow'), cardHolder: $('cardHolder'),
    batchBet: $('batchBet'), batchCount: $('batchCount'), batchCountCustom: $('batchCountCustom'),
    batchRun: $('batchRun'), batchResult: $('batchResult'),
    lbTop: $('lbTop'), lbModes: $('lbModes'), lbOpen: $('lbOpen'), lbRefresh: $('lbRefresh'),
    lbNote: $('lbNote'), lbModal: $('lbModal'), lbUsername: $('lbUsername'),
    lbStatus: $('lbStatus'), lbSubmit: $('lbSubmit'), lbClose: $('lbClose'),
    turnstileWidget: $('turnstileWidget')
  };

  var PLANS = {
    allin: L.allInPlan,
    uniform: L.uniformPlan,
    probe: L.probePlan,
    equalize: L.equalizePlan
  };
  var MODE_NAMES = {
    manual: '手动操盘', allin: '梭哈派', uniform: '固定注',
    probe: '探针流', equalize: '均注流'
  };

  var state = null;
  var chart = null;
  var chartLoading = false;
  var chartFailed = false;

  /* ── 对局运行时 ── */
  var gameMode = 'manual';      // manual | allin | uniform | probe | equalize
  var undoStock = 0;            // 每局一次悔棋
  var lastManualPrev = null;    // 最后一注手动押注前的状态快照
  var guidedOnce = false;       // 首局引导只出现一次

  /* ── 战绩 ── */
  var gameLog = [];             // 本会话每局终局 {won, capital}
  var bestEver = 0;
  try {
    bestEver = parseFloat(window.localStorage.getItem('nf_ten_bets_best')) || 0;
  } catch (e) { /* 存储不可用则退化为本会话战绩 */ }
  function bestEverSave(v) {
    try { window.localStorage.setItem('nf_ten_bets_best', String(v)); } catch (e) { /* 同上 */ }
  }

  /* ── 埋点 ── */
  function round2(x) { return Math.round(x * 100) / 100; }
  function track(name, props, opts) {
    if (window.NFTrack) window.NFTrack.track(name, props, opts);
  }
  function trackOnce(name, props) {
    if (window.NFTrack) window.NFTrack.trackOnce(name, props);
  }

  function fmt(x) { return String(Math.round(x * 100) / 100); }

  /* ── 图表（懒加载：首次交互后才拉取 Chart.js） ── */
  function ensureChart() {
    if (chart || chartFailed) return;
    if (typeof Chart !== 'undefined') {
      try { initChart(); } catch (e) { chartFailed = true; }
      return;
    }
    if (chartLoading) return;
    chartLoading = true;
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    s.onload = function () {
      chartLoading = false;
      try { initChart(); renderChart(); } catch (e) { chartFailed = true; }
    };
    s.onerror = function () {
      chartLoading = false;
      chartFailed = true; // 不清面板：简笔兜底曲线继续工作
    };
    document.head.appendChild(s);
  }

  function initChart() {
    var labels = [], i;
    for (i = 0; i <= L.ROUND_COUNT; i++) labels.push(String(i));
    function flat(v) {
      var a = [];
      for (i = 0; i <= L.ROUND_COUNT; i++) a.push(v);
      return a;
    }
    chart = new Chart(els.canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: '我的资金', data: [L.START_CAPITAL],
            borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,.10)',
            fill: true, tension: .25, borderWidth: 2,
            pointRadius: 3, pointBackgroundColor: '#22c55e', spanGaps: false
          },
          {
            label: '均注流保底 153.5', data: flat(L.BENCHMARKS.equalize),
            borderColor: '#eab308', borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, fill: false
          },
          {
            label: '本金 100', data: flat(L.START_CAPITAL),
            borderColor: '#3f4f5f', borderDash: [4, 4], borderWidth: 1, pointRadius: 0, fill: false
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {
          legend: { labels: { color: '#5b6b7c', boxWidth: 16, font: { size: 11 } } },
          tooltip: { titleFont: { size: 11 }, bodyFont: { size: 11 } }
        },
        scales: {
          x: {
            ticks: { color: '#5b6b7c', font: { size: 10 }, maxRotation: 0 },
            grid: { color: '#141c26' },
            title: { display: true, text: '第 N 注后（0 = 开局）', color: '#3f4f5f', font: { size: 10 } }
          },
          y: {
            ticks: { color: '#5b6b7c', font: { size: 10 } },
            grid: { color: '#141c26' },
            suggestedMin: 0
          }
        }
      }
    });
  }

  /** Chart.js 就位前的简笔兜底：真实资金轨迹 + 两条基准，避免首屏/离线时面板空死 */
  function drawFallbackCurve() {
    if (chart || chartFailed) return;
    var c = els.canvas;
    if (!c || typeof c.getContext !== 'function') return;
    var box = c.parentNode;
    var w = (box && box.clientWidth) || 600;
    var h = (box && box.clientHeight) || 260;
    var dpr = window.devicePixelRatio || 1;
    c.width = w * dpr; c.height = h * dpr;
    var g = c.getContext('2d');
    if (!g) return;
    g.scale(dpr, dpr);
    var vals = [L.START_CAPITAL], i;
    for (i = 0; i < state.history.length; i++) vals.push(state.history[i].capitalAfter);
    var maxV = L.BENCHMARKS.equalize;
    for (i = 0; i < vals.length; i++) if (vals[i] > maxV) maxV = vals[i];
    var pad = 14;
    function px(idx) { return (idx / L.ROUND_COUNT) * (w - pad * 2) + pad; }
    function py(v) { return h - pad - (v / maxV) * (h - pad * 2); }
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#141c26'; g.lineWidth = 1;
    for (i = 0; i <= 4; i++) {
      var gy = pad + (h - pad * 2) * i / 4;
      g.beginPath(); g.moveTo(pad, gy); g.lineTo(w - pad, gy); g.stroke();
    }
    g.setLineDash([6, 4]);
    g.strokeStyle = '#eab308';
    g.beginPath(); g.moveTo(pad, py(L.BENCHMARKS.equalize)); g.lineTo(w - pad, py(L.BENCHMARKS.equalize)); g.stroke();
    g.strokeStyle = '#3f4f5f';
    g.beginPath(); g.moveTo(pad, py(L.START_CAPITAL)); g.lineTo(w - pad, py(L.START_CAPITAL)); g.stroke();
    g.setLineDash([]);
    g.strokeStyle = '#22c55e'; g.lineWidth = 2; g.beginPath();
    for (i = 0; i < vals.length; i++) {
      if (i === 0) g.moveTo(px(i), py(vals[i])); else g.lineTo(px(i), py(vals[i]));
    }
    g.stroke();
    g.fillStyle = '#22c55e';
    for (i = 0; i < vals.length; i++) {
      g.beginPath(); g.arc(px(i), py(vals[i]), 3.5, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#3f4f5f'; g.font = '10px Menlo, monospace';
    g.fillText(vals.length === 1 ? '开局 100 · 曲线从第一注开始记录' : '当前 ' + fmt(state.capital), pad + 4, pad + 10);
    g.fillStyle = '#5b6b7c';
    g.fillText('保底 153.5', w - 80, py(L.BENCHMARKS.equalize) - 5);
  }

  function renderChart() {
    if (!chart) { drawFallbackCurve(); return; }
    var data = [L.START_CAPITAL], i;
    for (i = 0; i < state.history.length; i++) data.push(state.history[i].capitalAfter);
    while (data.length <= L.ROUND_COUNT) data.push(null);
    chart.data.datasets[0].data = data;
    chart.update('none');
  }

  /* ── 渲染 ── */
  function curBet() {
    return Math.max(1, Math.min(parseFloat(els.bet.value) || 10, state.capital));
  }

  function setBetControls(enabled) {
    els.bet.disabled = !enabled;
    els.go.disabled = !enabled;
  }

  function renderStats() {
    els.stGames.textContent = String(gameLog.length);
    var wins = 0, i;
    for (i = 0; i < gameLog.length; i++) if (gameLog[i].won) wins++;
    els.stWins.textContent = String(wins);
    var best = 0;
    for (i = 0; i < gameLog.length; i++) if (gameLog[i].capital > best) best = gameLog[i].capital;
    els.stBest.textContent = gameLog.length ? fmt(best) : '—';
    els.stBestEver.textContent = bestEver > 0 ? fmt(bestEver) : '—';
  }

  function renderLog() {
    var html = '';
    for (var i = 1; i <= L.ROUND_COUNT; i++) {
      var h = null;
      for (var j = 0; j < state.history.length; j++) {
        if (state.history[j].round === i) { h = state.history[j]; break; }
      }
      var bet = '·', res, cap = '—', rowCls = '';
      if (h) {
        bet = fmt(h.bet) + ' 元';
        res = h.won ? '<td class="win">中签 ×10</td>' : '<td class="lose">打水漂</td>';
        cap = fmt(h.capitalAfter);
      } else if (!state.over && i === state.round) {
        res = '<td class="pend">当前</td>';
        cap = fmt(state.capital);
        rowCls = ' class="now"';
      } else {
        res = '<td class="pend">待押</td>';
      }
      html += '<tr' + rowCls + '><td>#' + i + '</td><td>' + bet + '</td>' + res + '<td>' + cap + '</td></tr>';
    }
    els.track.innerHTML = html;
  }

  function render() {
    ensureChart();
    els.capital.textContent = fmt(state.capital);
    els.roundNo.textContent = Math.min(state.round, L.ROUND_COUNT);
    var p = state.over ? (state.won ? 1 : 0) : L.nextWinProbability(state.round);
    els.prob.textContent = (Math.round(p * 1000) / 10) + '%';
    els.probFill.style.width = (p * 100) + '%';
    els.excluded.textContent = state.over
      ? '本局已结束'
      : '已排除 ' + (state.round - 1) + ' 个位置 · 剩余 ' + (L.ROUND_COUNT - state.round + 1) + ' 个';

    // 下注面板：对局中可用；结束后置灰为结算态，不再显示无意义的"1 元"
    els.bet.max = Math.max(state.capital, 1);
    if (state.over) {
      els.betVal.textContent = '—';
      els.betHint.textContent = ' · 本局已结算，点「重开一局」再来';
      els.betPanel.classList.add('done');
    } else {
      if (parseFloat(els.bet.value) > state.capital) els.bet.value = Math.max(state.capital, 1);
      els.betVal.textContent = fmt(curBet());
      els.betHint.textContent = '元 · 下注后剩余资金 ≥ 0';
      els.betPanel.classList.remove('done');
    }
    setBetControls(!state.over);

    // 悔棋：仅手动局、每局一次、确有一注可撤
    els.undo.disabled = !(gameMode === 'manual' && undoStock > 0 && lastManualPrev && lastManualPrev !== state);

    // 结果卡按钮：仅局终可见
    if (state.over) els.shareRow.classList.add('show');
    else els.shareRow.classList.remove('show');
    // 上传按钮：仅局终可用（需要完整策略）
    els.lbOpen.disabled = !state.over;

    renderStats();
    renderLog();
    renderChart();
  }

  function showVerdict(text) {
    els.verdict.textContent = '> ' + text;
    els.verdict.classList.add('show');
  }
  function showLive(text) {
    els.verdict.textContent = '> ' + text;
    els.verdict.classList.add('show');
  }

  /* ── 判词 / 终局 ── */
  function scrollToCurve() {
    try {
      if (window.innerWidth > 860) return; // 桌面双栏，曲线始终可见
      var target = document.getElementById('curveSection');
      if (target && typeof target.scrollIntoView === 'function') {
        var smooth = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
      }
    } catch (e) { /* 滚动失败不影响主流程 */ }
  }

  function finalVerdict(mode) {
    var c = state.capital;
    if (state.won) {
      var last = state.history[state.history.length - 1];
      var t = '第 ' + last.round + ' 注中签：押 ' + fmt(last.bet) + ' 元，收回 ' + fmt(last.bet * L.PAYOUT) + ' 元，结算 ' + fmt(c) + ' 元。';
      if (c >= L.BENCHMARKS.equalize - 0.5) t += '跑平均注流保底 153.5，这一局数学满分。';
      else if (c >= L.BENCHMARKS.uniformEV) t += '超过固定注的期望 145，但没摸到均注流保底 153.5。';
      else if (c > L.START_CAPITAL) t += '赚了，但固定注闭着眼都能拿到期望 145。';
      else t += '中了也白中：探路注太大，把中奖收益填回去了。';
      showVerdict(t);
    } else {
      var l = state.history[state.history.length - 1];
      showVerdict('第 ' + l.round + ' 注押 ' + fmt(l.bet) + ' 元归零，提前离场。中签位可能还在后面等着——这就是梭哈派 90% 的下场。');
    }
    // 战绩入账（悔棋会弹出对应记录）
    gameLog.push({ won: state.won, capital: c });
    if (c > bestEver) { bestEver = c; bestEverSave(c); }
    // 里程碑事件：一局终了。force 上报，防止会话事件超限丢失
    track('ten_bets_game_end', {
      mode: mode,
      won: state.won,
      rounds: state.history.length,
      capital: round2(c)
    }, { force: true });
    scrollToCurve();
  }

  /* ── 动作 ── */
  function onGo() {
    if (state.over) return;
    try {
      var b = curBet();
      var before = state.capital;
      lastManualPrev = state;
      state = L.placeBet(state, b);
      var placed = state.history[state.history.length - 1];
      track('ten_bets_bet', { round: placed.round, bet: round2(placed.bet), capital: round2(placed.capitalAfter) });
      // 发现指标：用户在第 10 注押出过半资金（意识到"第 10 注必中"）
      if (placed.round === L.ROUND_COUNT && b >= before / 2) {
        track('ten_bets_discover', { bet: round2(b), capital: round2(before) });
      }
      els.betTip.textContent = '';
      if (state.over) {
        finalVerdict('manual');
      } else {
        // 大额亏损后回退保守默认注额，防连点误全押
        if (parseFloat(els.bet.value) > state.capital / 2) {
          els.bet.value = Math.max(1, Math.floor(state.capital / 10));
        }
        showLive('第 ' + placed.round + ' 注 ' + fmt(placed.bet) + ' 元打水漂。换来一条信息：中签位又往后挪了一位，下一注中签概率 ' + (Math.round(L.nextWinProbability(state.round) * 1000) / 10) + '%。');
      }
      render();
    } catch (e) {
      showVerdict(e.message);
    }
  }

  function onUndo() {
    if (gameMode !== 'manual' || undoStock <= 0 || !lastManualPrev) return;
    var ended = state.over;
    state = lastManualPrev;
    lastManualPrev = null;
    undoStock = 0;
    if (ended) { gameLog.pop(); renderStats(); }
    track('ten_bets_undo', { round: state.round });
    showLive('已悔棋：撤回最后一注（每局限一次）。想清楚这一注该怎么改。');
    render();
  }

  function onAuto(planKey) {
    var planFn = PLANS[planKey];
    if (!planFn) return;
    try {
      var fresh = L.createGame(Math.random);
      state = L.autoPlay(fresh, planFn(L.START_CAPITAL));
      gameMode = planKey;
      lastManualPrev = null;
      els.bet.max = Math.max(state.capital, 1);   // 先抬上限，再赋值，避免被旧 max 钳制
      els.bet.value = Math.max(state.capital, 1);
      els.betTip.textContent = '';
      finalVerdict(planKey);
      render();
    } catch (e) {
      showVerdict(e.message);
    }
  }

  /* ── 结果卡 ── */
  function drawCard() {
    var c = document.createElement('canvas');
    c.width = 900; c.height = 1200;
    var g = c.getContext('2d');
    var font = '"SF Mono",Menlo,Consolas,"PingFang SC","Microsoft YaHei",monospace';
    g.fillStyle = '#0d1219'; g.fillRect(0, 0, 900, 1200);
    g.strokeStyle = '#1f2b38'; g.lineWidth = 2; g.strokeRect(24, 24, 852, 1152);

    g.fillStyle = '#22c55e'; g.font = '600 52px ' + font;
    g.fillText('十连注', 60, 116);
    g.fillStyle = '#5b6b7c'; g.font = '24px ' + font;
    g.fillText('// 100 元 · 10 注 · 随机 1 注中 10 倍 · 其余必打水漂', 60, 164);

    g.fillStyle = '#eab308'; g.font = '30px ' + font;
    g.fillText('流派：' + (MODE_NAMES[gameMode] || gameMode), 60, 240);

    var last = state.history[state.history.length - 1];
    g.fillStyle = state.won ? '#22c55e' : '#ef4444';
    g.font = '600 110px ' + font;
    g.fillText(fmt(state.capital), 56, 380);
    g.fillStyle = '#9fb4c8'; g.font = '28px ' + font;
    g.fillText(state.won
      ? '第 ' + last.round + ' 注中签（押 ' + fmt(last.bet) + ' 元）· 共 ' + state.history.length + ' 注'
      : '第 ' + last.round + ' 注押 ' + fmt(last.bet) + ' 元归零', 60, 440);

    // 迷你资金曲线
    var x0 = 60, y0 = 540, w = 780, h = 400;
    var vals = [L.START_CAPITAL], i;
    for (i = 0; i < state.history.length; i++) vals.push(state.history[i].capitalAfter);
    var maxV = L.BENCHMARKS.equalize;
    for (i = 0; i < vals.length; i++) if (vals[i] > maxV) maxV = vals[i];
    g.strokeStyle = '#141c26'; g.lineWidth = 1;
    for (i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(x0, y0 + h * i / 4); g.lineTo(x0 + w, y0 + h * i / 4); g.stroke();
    }
    function px(idx) { return x0 + (idx / L.ROUND_COUNT) * w; }
    function py(v) { return y0 + h - (v / maxV) * h; }
    g.setLineDash([8, 6]); g.strokeStyle = '#eab308';
    g.beginPath(); g.moveTo(x0, py(L.BENCHMARKS.equalize)); g.lineTo(x0 + w, py(L.BENCHMARKS.equalize)); g.stroke();
    g.strokeStyle = '#3f4f5f';
    g.beginPath(); g.moveTo(x0, py(L.START_CAPITAL)); g.lineTo(x0 + w, py(L.START_CAPITAL)); g.stroke();
    g.setLineDash([]);
    g.strokeStyle = '#22c55e'; g.lineWidth = 4; g.beginPath();
    for (i = 0; i < vals.length; i++) {
      if (i === 0) g.moveTo(px(i), py(vals[i])); else g.lineTo(px(i), py(vals[i]));
    }
    g.stroke();
    g.fillStyle = '#22c55e';
    for (i = 0; i < vals.length; i++) {
      g.beginPath(); g.arc(px(i), py(vals[i]), 6, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#3f4f5f'; g.font = '22px ' + font;
    g.fillText('资金曲线 · 黄线 = 均注流保底 153.5 · 灰线 = 本金 100', x0, y0 + h + 44);

    g.fillStyle = '#5b6b7c'; g.font = '24px ' + font;
    g.fillText('中签位开局预定 · 中签即停 · 条件概率站在坚持到最后的人那边', 60, 1078);
    g.fillStyle = '#3f4f5f';
    g.fillText('tenbets.996.ninja/pages/ten-bets · 数字直觉', 60, 1130);
    return c;
  }

  function onMakeCard() {
    try {
      var c = drawCard();
      els.cardHolder.innerHTML = '';
      els.cardHolder.appendChild(c);
      var a = document.createElement('a');
      a.download = 'ten-bets-结果卡.png';
      a.href = c.toDataURL('image/png');
      a.click();
      track('ten_bets_share_card', { mode: gameMode, capital: round2(state.capital) });
    } catch (e) { /* 结果卡失败不影响主流程 */ }
  }

  /* ── 批量模拟 ── */
  function runBatch() {
    var bet = parseFloat(els.batchBet.value);
    var count;
    if (els.batchCount.value === 'custom') {
      count = parseInt(els.batchCountCustom.value, 10);
    } else {
      count = parseInt(els.batchCount.value, 10);
    }
    if (!(bet > 0)) { els.batchResult.innerHTML = '<div class="pnote">每注金额必须是正数</div>'; return; }
    if (!(count > 0) || count > 100000) { els.batchResult.innerHTML = '<div class="pnote">次数需在 1 ~ 100000 之间</div>'; return; }
    var res;
    try { res = L.simulateBatch(bet, count); }
    catch (e) { els.batchResult.innerHTML = '<div class="pnote">' + e.message + '</div>'; return; }
    var bustRate = (res.busts / res.games * 100);
    function cell(label, value, warn) {
      return '<div class="stat-cell' + (warn ? ' warn' : '') + '"><small>' + label + '</small><b>' + value + '</b></div>';
    }
    var maxCount = 1;
    res.hist.forEach(function (h) { if (h.count > maxCount) maxCount = h.count; });
    var histHtml = '<div class="hist">' + res.hist.map(function (h) {
      var barLen = h.count > 0 ? Math.max(1, Math.round(h.count / maxCount * 22)) : 0;
      return '<div class="hist-row"><span class="hist-label">' + h.label + '</span>' +
        '<span class="hist-bars">' + '▇'.repeat(barLen) + '</span>' +
        '<span class="hist-count">' + h.count + '</span></div>';
    }).join('') + '</div>';
    els.batchResult.innerHTML =
      '<div class="stat-grid">' +
      cell('局数', res.games) +
      cell('中签', res.wins) +
      cell('爆仓', res.busts, res.busts > 0) +
      cell('爆仓率', bustRate.toFixed(1) + '%', res.busts > 0) +
      cell('平均结算', fmt(res.avg)) +
      cell('最高', fmt(res.max)) +
      cell('最低', fmt(res.min)) +
      cell('平均轮次', res.avgRounds.toFixed(1)) +
      '</div>' + histHtml;
    track('ten_bets_batch_run', {
      bet: round2(bet), games: count,
      bustRate: Math.round(bustRate * 10) / 10,
      avg: round2(res.avg)
    });
  }

  /* ── 排行榜 ── */
  var API_BASE = 'https://numfeel-api.996.ninja';
  var TURNSTILE_SITE_KEY = '0x4AAAAAADsMioJW-WyC3Fwm';
  var turnstileId = null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function modeName(key) { return MODE_NAMES[key] || key; }

  function loadLeaderboard() {
    if (typeof fetch !== 'function') { els.lbNote.textContent = '榜单暂不可用（离线）'; return; }
    els.lbNote.textContent = '榜单加载中…';
    fetch(API_BASE + '/ten-bets/leaderboard?limit=10')
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (json.status === 200 && json.data) {
          renderLeaderboard(json.data);
          els.lbNote.textContent = '共 ' + json.data.totalGames + ' 局 · ' + json.data.totalPlayers + ' 位玩家';
        } else {
          els.lbNote.textContent = json.message || '榜单暂不可用';
        }
      })
      .catch(function () {
        els.lbNote.textContent = '榜单暂不可用（本地预览或离线）';
      });
  }

  function renderLeaderboard(data) {
    var modeRows = (data.byMode || []).map(function (m) {
      var busts = m.games - m.wins;
      return '<div class="mode-row' + (m.avgCapital >= 140 ? ' hot' : '') + '"><b>' +
        escapeHtml(modeName(m.mode)) + '</b><span>' + m.games + ' 局</span>' +
        '<span>平均 ' + fmt(m.avgCapital) + '</span>' +
        '<span>最佳 ' + fmt(m.bestCapital) + '</span>' +
        '<span>爆仓 ' + (m.games ? Math.round(busts / m.games * 100) : 0) + '%</span></div>';
    }).join('');
    els.lbModes.innerHTML = modeRows || '<div class="pnote">还没有数据——来交第一份战绩</div>';

    if (!data.top || data.top.length === 0) {
      els.lbTop.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:16px">暂无数据</td></tr>';
      return;
    }
    els.lbTop.innerHTML = data.top.map(function (item) {
      var rank = item.rank <= 3 ? ['🥇', '🥈', '🥉'][item.rank - 1] : '#' + item.rank;
      return '<tr><td>' + rank + '</td><td>' + escapeHtml(item.username) + '</td>' +
        '<td>' + escapeHtml(modeName(item.mode)) + '</td>' +
        '<td class="' + (item.finalCapital > 0 ? 'win' : 'lose') + '">' + fmt(item.finalCapital) + '</td>' +
        '<td>' + item.rounds + '</td></tr>';
    }).join('');
  }

  // ── 上传 modal ──
  function openLbModal() {
    if (!state.over) return;
    els.lbStatus.textContent = '';
    els.lbModal.classList.add('show');
    renderTurnstile();
  }
  function closeLbModal() {
    els.lbModal.classList.remove('show');
    resetTurnstile();
  }
  function renderTurnstile() {
    if (!els.turnstileWidget || typeof turnstile === 'undefined') return;
    resetTurnstile();
    turnstileId = turnstile.render(els.turnstileWidget, {
      sitekey: TURNSTILE_SITE_KEY,
      action: 'ten-bets-submit',
      theme: 'auto'
    });
  }
  function resetTurnstile() {
    if (turnstileId !== null && typeof turnstile !== 'undefined') {
      turnstile.reset(turnstileId);
      turnstileId = null;
    }
  }
  function getTurnstileToken() {
    if (typeof turnstile === 'undefined') return null;
    return turnstile.getResponse(turnstileId) || null;
  }

  function sha256Hex(message) {
    var msgBuffer = new TextEncoder().encode(message);
    return crypto.subtle.digest('SHA-256', msgBuffer).then(function (hashBuffer) {
      var arr = Array.from(new Uint8Array(hashBuffer));
      return arr.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
  }
  function computePoW(payload, difficulty) {
    difficulty = difficulty || 4;
    var nonce = 0;
    function step() {
      while (true) {
        var nonceStr = String(nonce);
        nonce++;
        return sha256Hex(payload + nonceStr).then(function (hash) {
          if (hash.substring(0, difficulty) === '0'.repeat(difficulty)) {
            return { hash: hash, nonce: nonceStr };
          }
          if (nonce % 500 === 0) { return new Promise(function (r) { setTimeout(r, 0); }).then(step); }
          return step();
        });
      }
    }
    return step();
  }

  function submitToLeaderboard() {
    if (typeof fetch !== 'function') { els.lbStatus.textContent = '当前环境无法提交（离线）'; return; }
    var username = (els.lbUsername.value || '').trim();
    var statusEl = els.lbStatus;
    function setStatus(text, cls) { statusEl.textContent = text; statusEl.className = cls || ''; }
    if (!username) { setStatus('请输入用户名', 'lb-err'); return; }
    if (username.length > 50) { setStatus('用户名最多 50 个字符', 'lb-err'); return; }
    if (!state.over || state.bets.length === 0) { setStatus('先打完一局再提交', 'lb-err'); return; }

    var betsString = state.bets.map(function (b) { return fmt(b); }).join(',');
    els.lbSubmit.disabled = true;
    setStatus('正在申请挑战…');
    fetch(API_BASE + '/ten-bets/leaderboard/challenge')
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (json.status !== 200 || !json.data) throw new Error(json.message || '获取挑战失败');
        var challenge = json.data;
        setStatus('正在计算工作量证明…');
        var payload = challenge.challengeId + '|' + username + '|' + gameMode + '|' + betsString;
        return computePoW(payload, challenge.difficulty || 4).then(function (pow) {
          setStatus('正在提交…');
          return fetch(API_BASE + '/ten-bets/leaderboard/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: username,
              mode: gameMode,
              bets: betsString,
              challengeId: challenge.challengeId,
              powHash: pow.hash,
              powNonce: pow.nonce,
              cfTurnstileToken: getTurnstileToken() || ''
            })
          }).then(function (r) { return r.json(); });
        });
      })
      .then(function (json) {
        if (json.status === 200 && json.data) {
          var d = json.data;
          setStatus('服务器抽签：中签位 #' + d.winnerPos + '，你的策略结算 ' + fmt(d.finalCapital) +
            ' 元（' + (d.won ? '中签' : '爆仓') + '）· 榜单第 ' + d.rank + ' 名 / 共 ' + d.total + ' 人', 'lb-ok');
          track('ten_bets_lb_submit', {
            mode: gameMode, capital: round2(d.finalCapital), rank: d.rank, won: d.won
          });
          loadLeaderboard();
          setTimeout(closeLbModal, 3500);
        } else {
          setStatus(json.message || '提交失败', 'lb-err');
        }
      })
      .catch(function (e) {
        setStatus('网络错误：' + (e && e.message ? e.message : '请重试'), 'lb-err');
      })
      .finally(function () { els.lbSubmit.disabled = false; });
  }

  function newGame() {
    state = L.createGame(Math.random);
    gameMode = 'manual';
    undoStock = 1;
    lastManualPrev = null;
    els.verdict.classList.remove('show');
    els.verdict.textContent = '';
    els.cardHolder.innerHTML = '';
    if (!guidedOnce) {
      guidedOnce = true;
      els.bet.value = 1;
      els.betTip.textContent = '首局建议：先押 1 元探路——每一注打水漂都在排雷，越往后中签概率越高，第 10 注若前 9 注全空则必中。';
    } else {
      els.bet.value = 10;
      els.betTip.textContent = '';
    }
    render();
  }

  function onReset() {
    track('ten_bets_reset', {
      round: state && !state.over ? state.round : 0,
      over: state ? state.over : false
    });
    newGame();
  }

  /* ── 绑定 ── */
  els.bet.addEventListener('input', function () { els.betVal.textContent = fmt(curBet()); });
  els.go.addEventListener('click', onGo);
  els.reset.addEventListener('click', onReset);
  els.undo.addEventListener('click', onUndo);
  els.batchRun.addEventListener('click', runBatch);
  els.batchCount.addEventListener('change', function () {
    els.batchCountCustom.style.display = els.batchCount.value === 'custom' ? 'block' : 'none';
  });
  els.lbOpen.addEventListener('click', openLbModal);
  els.lbRefresh.addEventListener('click', loadLeaderboard);
  els.lbClose.addEventListener('click', closeLbModal);
  els.lbSubmit.addEventListener('click', submitToLeaderboard);
  loadLeaderboard();
  var makeBtn = $('makeCard');
  if (makeBtn) makeBtn.addEventListener('click', onMakeCard);

  var chips = document.querySelectorAll('.chips button');
  for (var i = 0; i < chips.length; i++) {
    (function (el) {
      el.addEventListener('click', function () {
        if (state.over) return;
        var v = el.getAttribute('data-v');
        els.bet.value = v === 'all' ? Math.max(state.capital, 1) : v;
        els.betVal.textContent = fmt(curBet());
      });
    })(chips[i]);
  }

  var autos = document.querySelectorAll('.strat-c .auto');
  for (var j = 0; j < autos.length; j++) {
    (function (el) {
      el.addEventListener('click', function () { onAuto(el.getAttribute('data-plan')); });
    })(autos[j]);
  }

  newGame();
  trackOnce('ten_bets_session_start', { w: window.innerWidth || 0 });
})();

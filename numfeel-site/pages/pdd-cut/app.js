/**
 * app.js — 拼多多砍一刀模拟器 UI 层
 * 依赖：engine.js（同目录 <script> 引入）、Chart.js UMD
 */
(function () {
  'use strict';

  // ══════════ 状态 ══════════
  var state = {
    target: 100,
    remain: 100,
    cuts: [],
    friends: [],       // [{type:'new'|'old'|'bot', used:false}]
    egg99Shown: false, // 99% 彩蛋是否已触发
    // 用户为"你自己这一局"注入的随机种子（每次重置刷新）
    seed: Math.floor(Math.random() * 1e9)
  };

  var els = {};
  var decayChart = null;

  // ══════════ DOM 缓存 ══════════
  function cacheDom() {
    els.progress = document.getElementById('pdd-progress');
    els.progressLabel = document.getElementById('pdd-progress-label');
    els.metaCuts = document.getElementById('pdd-meta-cuts');
    els.metaRemain = document.getElementById('pdd-meta-remain');
    els.cta = document.getElementById('pdd-cta');
    els.ctaHint = document.getElementById('pdd-cta-hint');

    els.newCount = document.getElementById('pdd-new-count');
    els.oldCount = document.getElementById('pdd-old-count');
    els.botCount = document.getElementById('pdd-bot-count');
    els.newVal = document.getElementById('pdd-new-val');
    els.oldVal = document.getElementById('pdd-old-val');
    els.botVal = document.getElementById('pdd-bot-val');
    els.pool = document.getElementById('pdd-friend-pool');
    els.resetBtn = document.getElementById('pdd-reset');

    els.magShown = document.getElementById('pdd-mag-shown');
    els.magReal = document.getElementById('pdd-mag-real');
    els.magDigits = document.getElementById('pdd-mag-digits');
    els.magRange = document.getElementById('pdd-mag-range');

    els.attackCost = document.getElementById('pdd-attack-cost');
    els.attackCac = document.getElementById('pdd-attack-cac');
    els.attackCount = document.getElementById('pdd-attack-count');
    els.attackBtn = document.getElementById('pdd-attack-btn');
    els.attackResult = document.getElementById('pdd-attack-result');

    els.copyBtn = document.getElementById('pdd-copy-btn');
    els.toast = document.getElementById('pdd-toast');
    els.chartCanvas = document.getElementById('pdd-decay-chart');
  }

  // ══════════ 工具 ══════════
  function toast(msg, ms) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      els.toast.classList.remove('show');
    }, ms || 2400);
  }

  var pddRng = window.PddEngine ? window.PddEngine.makeRng(state.seed) : null;
  function refreshRng() {
    state.seed = Math.floor(Math.random() * 1e9);
    pddRng = window.PddEngine.makeRng(state.seed);
  }

  // ══════════ 好友池 ══════════
  function rebuildFriends() {
    var n = parseInt(els.newCount.value, 10) || 0;
    var o = parseInt(els.oldCount.value, 10) || 0;
    var b = parseInt(els.botCount.value, 10) || 0;
    els.newVal.textContent = n;
    els.oldVal.textContent = o;
    els.botVal.textContent = b;

    state.friends = [];
    for (var i = 0; i < n; i++) state.friends.push({ type: 'new', used: false });
    for (var j = 0; j < o; j++) state.friends.push({ type: 'old', used: false });
    for (var k = 0; k < b; k++) state.friends.push({ type: 'bot', used: false });
    renderPool();
    updateCta();
  }

  function renderPool() {
    els.pool.innerHTML = '';
    var frag = document.createDocumentFragment();
    for (var i = 0; i < state.friends.length; i++) {
      var f = state.friends[i];
      var el = document.createElement('div');
      el.className = 'pdd-friend-avatar' + (f.used ? ' used' : '');
      el.textContent = f.type === 'new' ? '🆕' : f.type === 'old' ? '👴' : '🤖';
      el.title = ({ 'new': '新用户 · 权重 5.0', 'old': '老用户 · 权重 0.3', 'bot': '黑产 · 权重 0.0001' })[f.type];
      frag.appendChild(el);
    }
    els.pool.appendChild(frag);
  }

  // ══════════ Hero 更新 ══════════
  function updateHero() {
    var progress = 1 - state.remain / state.target;
    els.progress.style.width = (progress * 100).toFixed(4) + '%';
    var leftPct = (state.remain / state.target) * 100;
    els.progressLabel.textContent = '仅差 ' + formatPct(leftPct, leftPct < 1 ? 1 : 0);
    els.metaCuts.textContent = '已砍 ' + state.cuts.length + ' 刀';
    els.metaRemain.textContent = '剩余 ¥' + state.remain.toFixed(2);
    // 99% 彩蛋
    if (!state.egg99Shown && progress > 0.99) {
      state.egg99Shown = true;
      var realPct = leftPct.toFixed(8);
      els.magReal.textContent = realPct + '%';
      toast('🔍 App 显示"仅差 0.9%"，实际是 ' + realPct + '%', 4000);
    }
  }

  function formatPct(v, digits) {
    if (v <= 0) return '0%';
    if (v >= 1) return v.toFixed(digits || 0) + '%';
    // 小于 1% 时保留 1 位有效小数供 hero 展示
    return v.toFixed(1) + '%';
  }

  function updateCta() {
    var remaining = state.friends.filter(function (f) { return !f.used; }).length;
    if (state.remain <= 0.01) {
      els.cta.disabled = true;
      els.ctaHint.textContent = '砍到 0 元啦（但你现实里做不到）';
    } else if (remaining === 0) {
      els.cta.disabled = true;
      els.ctaHint.textContent = '好友用完了，砍价失败。拉滑块加更多好友再试';
    } else {
      els.cta.disabled = false;
      els.ctaHint.textContent = '剩余 ' + remaining + ' 个好友';
    }
  }

  // ══════════ 单次砍 ══════════
  function doCut() {
    var idx = -1;
    for (var i = 0; i < state.friends.length; i++) {
      if (!state.friends[i].used) { idx = i; break; }
    }
    if (idx === -1) return;
    var f = state.friends[idx];
    f.used = true;
    var w = window.PddEngine.WEIGHTS[f.type];
    var progress = 1 - state.remain / state.target;
    var amount = window.PddEngine.cutOnce(state.remain, w, progress, pddRng());
    state.remain -= amount;
    if (state.remain < 0) state.remain = 0;
    state.cuts.push({ type: f.type, amount: amount, remainAfter: state.remain });

    // DOM 反馈
    var avatarEls = els.pool.querySelectorAll('.pdd-friend-avatar');
    if (avatarEls[idx]) avatarEls[idx].classList.add('used');
    renderPool.currentIdx = idx;
    updateHero();
    updateCta();

    // 前几刀给一点触感提示（rand 大的时候多砍了很多）
    if (state.cuts.length <= 3 && amount / state.target > 0.15) {
      toast('砍掉 ¥' + amount.toFixed(2) + '！剩下的越来越难砍');
    }
  }

  function resetRun() {
    state.remain = state.target;
    state.cuts = [];
    state.egg99Shown = false;
    refreshRng();
    for (var i = 0; i < state.friends.length; i++) state.friends[i].used = false;
    renderPool();
    updateHero();
    updateCta();
    els.magReal.textContent = '0.99964272%'; // 恢复文案里的样例数字
  }

  // ══════════ 预设场景 & 图表 ══════════
  var PRESETS = {
    lucky: { label: '全新用户',    composition: [{ type: 'new', count: 500 }],                                       color: '#81c784' },
    dumb:  { label: '全老用户',    composition: [{ type: 'old', count: 500 }],                                       color: '#90caf9' },
    bot:   { label: '全黑产',      composition: [{ type: 'bot', count: 500 }],                                       color: '#ff6b6b' },
    real:  { label: '朋友圈日常',  composition: [{ type: 'new', count: 50 }, { type: 'old', count: 400 }, { type: 'bot', count: 50 }], color: '#ffd700' }
  };

  function runAllPresets() {
    var datasets = [];
    Object.keys(PRESETS).forEach(function (key) {
      var p = PRESETS[key];
      var curve = window.PddEngine.buildDecayCurve(100, p.composition, 42 + key.length);
      datasets.push({
        label: p.label,
        data: curve.map(function (v, i) { return { x: i, y: Math.max(v, 0.001) }; }),
        borderColor: p.color,
        backgroundColor: p.color + '20',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.15
      });
    });

    if (decayChart) decayChart.destroy();
    decayChart = new Chart(els.chartCanvas.getContext('2d'), {
      type: 'line',
      data: { datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: '砍价次数', color: '#a0aec0' },
            ticks: { color: '#a0aec0' },
            grid: { color: 'rgba(255,255,255,0.06)' }
          },
          y: {
            type: 'logarithmic',
            title: { display: true, text: '剩余金额（对数）', color: '#a0aec0' },
            ticks: {
              color: '#a0aec0',
              callback: function (v) {
                if (v === 100) return '¥100';
                if (v === 10) return '¥10';
                if (v === 1) return '¥1';
                if (v === 0.1) return '¥0.1';
                if (v === 0.01) return '¥0.01';
                return '';
              }
            },
            grid: { color: 'rgba(255,255,255,0.06)' }
          }
        },
        plugins: {
          legend: { labels: { color: '#e0e0e0', usePointStyle: true } },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ctx.dataset.label + ': ¥' + ctx.parsed.y.toFixed(4) + '（第 ' + ctx.parsed.x + ' 刀）';
              }
            }
          }
        }
      }
    });
  }

  function highlightPreset(btn) {
    document.querySelectorAll('.pdd-preset').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
  }

  // ══════════ 百分比放大镜 ══════════
  function updateMagnifier() {
    var digits = parseInt(els.magRange.value, 10);
    els.magDigits.textContent = digits;
    // 样例：0.9996427218% 之类的数字。用一个稳定的样例值
    var real = 0.99964272185;
    els.magReal.textContent = real.toFixed(digits) + '%';
    // "屏幕显示"取整或1位
    els.magShown.textContent = '仅差 ' + real.toFixed(digits >= 2 ? 1 : 0) + '%';
  }

  // ══════════ 破产测试 ══════════
  function runAttack() {
    var cost = parseFloat(els.attackCost.value) || 2000;
    var cac = parseFloat(els.attackCac.value) || 200;
    var count = Math.max(10, Math.min(100000, parseInt(els.attackCount.value, 10) || 1000));
    var r = window.PddEngine.simulateBotAttack(cost, count, cac, 20240101);
    var msg = ''
      + '<div>目标 <strong>¥' + cost + '</strong>，可接受 CAC <strong>¥' + cac + '</strong></div>'
      + '<div>' + count + ' 个黑产号总砍价 = <strong>¥' + r.totalCut.toFixed(4) + '</strong></div>'
      + '<div>只占 CAC 的 <strong>' + (r.ratio * 100).toFixed(2) + '%</strong></div>';
    if (r.safe) {
      msg += '<div class="verdict safe">✅ 平台安全 · 一根毛都没伤到</div>';
    } else {
      msg += '<div class="verdict danger">⚠️ 黑产薅穿了 CAC · 得赶紧调权重</div>';
    }
    els.attackResult.innerHTML = msg;
    els.attackResult.classList.add('show');
  }

  // ══════════ 复制结论 ══════════
  function copyConclusion() {
    var text = '拼多多砍一刀不是随机，是给你打分。新用户权重 5.0，老用户 0.3，黑产 0.0001。'
      + '前段砍得爽是为了套住你，99% 之后单刀不到 0.001 元。'
      + 'App 上"仅差 0.9%"实际是 0.99964272%，因为"显示位数有限"。'
      + '亲手试试：https://numfeel.996.ninja/pages/pdd-cut/';
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () {
        toast('已复制，粘到知乎回答里');
      }, function () {
        toast('复制失败，请手动选择');
      });
    } else {
      toast('浏览器不支持自动复制');
    }
  }

  // ══════════ 事件绑定 ══════════
  function bind() {
    els.cta.addEventListener('click', doCut);
    els.resetBtn.addEventListener('click', function () {
      resetRun();
      toast('已重置这一局');
    });
    els.newCount.addEventListener('input', rebuildFriends);
    els.oldCount.addEventListener('input', rebuildFriends);
    els.botCount.addEventListener('input', rebuildFriends);

    document.querySelectorAll('.pdd-preset').forEach(function (btn) {
      btn.addEventListener('click', function () {
        highlightPreset(btn);
        var key = btn.getAttribute('data-preset');
        var p = PRESETS[key];
        var curve = window.PddEngine.buildDecayCurve(100, p.composition, 42 + key.length);
        var finalRemain = curve[curve.length - 1];
        var pct = (finalRemain / 100) * 100;
        toast(p.label + '：最终剩余 ¥' + finalRemain.toFixed(4) + '（差 ' + pct.toFixed(4) + '%）', 3200);
      });
    });

    els.magRange.addEventListener('input', updateMagnifier);
    els.attackBtn.addEventListener('click', runAttack);
    els.copyBtn.addEventListener('click', copyConclusion);
  }

  // ══════════ 启动 ══════════
  document.addEventListener('DOMContentLoaded', function () {
    cacheDom();
    if (!window.PddEngine) {
      console.error('PddEngine not loaded');
      return;
    }
    pddRng = window.PddEngine.makeRng(state.seed);
    rebuildFriends();
    updateHero();
    updateMagnifier();
    runAllPresets();
    bind();
  });
})();

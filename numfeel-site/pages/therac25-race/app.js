/**
 * Therac-25 复现操作台 · DOM / 交互层
 * 依赖：chart.js, Therac25Logic（window 键）
 */
'use strict';

(function () {
  var logic = window.Therac25Logic;
  if (!logic || !logic.evalShot || !logic.generateTimingProfile || !logic.getTimeline) {
    // 逻辑脚本加载失败时不再用空对象假装正常，而是给出可见错误
    document.addEventListener('DOMContentLoaded', function () {
      var c = document.querySelector('.container');
      if (c) c.insertAdjacentHTML('afterbegin',
        '<div class="outcome boom"><div class="o-head"><i class="ti ti-alert-triangle"></i> 脚本加载失败</div>' +
        '<div class="o-body">therac25-logic.js 未能加载，复现操作台无法初始化。请刷新或检查网络。</div></div>');
    });
    return;
  }

  // ── 常量 ──────────────────────────────
  var PRESETS = [
    { id: 'legacy', name: '祖传固件', windowMs: 260, code: 'fw v1.4', danger: '大敞口', desc: '检查和开火之间留了一条极宽的空当。', icon: 'ti-details' },
    { id: 'normal', name: '标准固件', windowMs: 58, code: 'fw v2.0', danger: '要手速', desc: '窗口被压到几十毫秒，命令挤一挤仍能滑进去。', icon: 'ti-speedometer' },
    { id: 'fixed', name: '加互斥锁', windowMs: 0, code: 'fw v2.1 · LOCK', danger: '已缝死', desc: '验证与开火被原子化，任何手速都打不穿。', icon: 'ti-lock' }
  ];
  var DOSE_SETTING = 200;
  var DOSE_SAFE = 2;
  var DOSE_LETHAL = 25;

  // ── 状态 ──────────────────────────────
  var state = {
    presetId: 'normal',
    armed: true,
    tA: null,         // Q 按下时刻
    tB: null,         // E 按下时刻
    windowMs: 58,
    score: 0,
    stageMode: 'idle', // idle | safe | boom
    boomAt: 0,
    flashCmd: null,    // 'A' | 'B' | null，最近一次命令的徽标反馈
    flashAt: 0
  };

  var els = {};
  var chart = null;

  // ── 初始化 ────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheEls();
    preloadImages();
    renderPresets();
    bindStageEvents();
    buildFlightRows();
    buildChart();
    renderTimeline();
    bindSupplement();
    drawStage(0);
  }

  function cacheEls() {
    els.stage = document.getElementById('stage');
    els.ctx = els.stage.getContext('2d');
    els.presetRow = document.getElementById('presetRow');
    els.monBlocker = document.getElementById('monBlocker');
    els.monDose = document.getElementById('monDose');
    els.monStatus = document.getElementById('monStatus');
    els.readDt = document.getElementById('readDt');
    els.readWindow = document.getElementById('readWindow');
    els.readScore = document.getElementById('readScore');
    els.outcome = document.getElementById('outcome');
    els.rearmBtn = document.getElementById('rearmBtn');
    els.flightViz = document.getElementById('raceViz');
    els.winSlider = document.getElementById('winSlider');
    els.winRead = document.getElementById('winRead');
    els.timingChart = document.getElementById('timingChart');
    els.timelineList = document.getElementById('timelineList');
    els.goFixedBtn = document.getElementById('goFixedBtn');
    els.tapA = document.getElementById('tapA');
    els.tapB = document.getElementById('tapB');
  }

  // ── 竞态窗口统一入口：状态 / 滑块 / 读数 / 时序图 / 图表 全部同步 ──
  function setWindowMs(ms) {
    state.windowMs = ms;
    els.winSlider.value = ms;
    els.winRead.textContent = ms + ' ms';
    els.readWindow.textContent = ms + ' ms';
    renderFlight();
    redrawChart();
    syncPresetHighlight(ms);
  }

  // 卡片高亮跟随窗口值：匹配到固件就点亮，自定义值则全部熄灭
  function syncPresetHighlight(ms) {
    var match = PRESETS.filter(function (p) { return p.windowMs === ms; })[0];
    els.presetRow.querySelectorAll('.preset').forEach(function (c) {
      c.classList.toggle('active', !!match && c.dataset.id === match.id);
    });
  }

  // ── 固件卡片 ──────────────────────────
  function renderPresets() {
    els.presetRow.innerHTML = PRESETS.map(function (p) {
      var dangerCls = p.windowMs >= 200 ? '高' : (p.windowMs === 0 ? '无' : '中');
      var dangerColor = p.windowMs >= 200 ? 'var(--red)' : (p.windowMs === 0 ? 'var(--green)' : 'var(--gold)');
      return '<div class="preset" role="button" tabindex="0" data-id="' + p.id + '" style="' +
        (p.windowMs >= 200 ? 'border-color:rgba(255,107,107,.4)' : '') + '">' +
        '<span class="p-danger" style="color:' + dangerColor + ';background:' +
          (p.windowMs === 0 ? 'rgba(129,199,132,.14)' : 'rgba(255,107,107,.14)') + '">' +
          '<i class="ti ti-flag"></i> ' + dangerCls + ' 危险度</span>' +
        '<div class="p-name"><i class="ti ' + p.icon + '"></i> ' + p.name + '</div>' +
        '<div class="p-code">' + p.code + '</div>' +
        '<div class="p-window">竞态窗口 ' + p.windowMs + ' ms</div>' +
        '<div class="p-desc">' + p.desc + '</div>' +
      '</div>';
    }).join('');

    els.presetRow.querySelectorAll('.preset').forEach(function (card) {
      card.addEventListener('click', function () { selectPreset(card.dataset.id); });
      card.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectPreset(card.dataset.id); }
      });
    });
    selectPreset('normal', true);
  }

  function selectPreset(id, silent, label) {
    var p = PRESETS.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    state.presetId = p.id;
    setWindowMs(p.windowMs);
    if (!silent) rearm(label || ('载入固件 ' + p.name));
    else resetAll();
  }

  // ── 舞台交互 ──────────────────────────
  function bindStageEvents() {
    // 键盘：Q → E 连打
    document.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      var k = e.key.toLowerCase();
      if (k === 'q') onKeyA();
      else if (k === 'e') onKeyB();
    });

    els.rearmBtn.addEventListener('click', function () { rearm(); });

    // 触屏大按钮（移动端替代键盘）
    els.tapA.addEventListener('pointerdown', function (e) { if (e.button !== 0) return; e.preventDefault(); onKeyA(); });
    els.tapB.addEventListener('pointerdown', function (e) { if (e.button !== 0) return; e.preventDefault(); onKeyB(); });
  }

  function flashTap(btn) {
    btn.classList.remove('pressed');
    void btn.offsetWidth;
    btn.classList.add('pressed');
    if (btn._flashTimer) clearTimeout(btn._flashTimer);
    btn._flashTimer = setTimeout(function () {
      btn.classList.remove('pressed');
      btn._flashTimer = null;
    }, 170);
  }

  function onKeyA() {
    if (!state.armed) return;
    state.tA = performance.now();
    flashFlank('A');
  }

  function onKeyB() {
    if (!state.armed) return;
    flashFlank('B');
    if (state.tA == null) { settleSkip(); return; }
    state.tB = performance.now();
    resolveShot();
  }

  // 命令即时反馈：画布徽标 + 对应按钮闪烁
  function flashFlank(which) {
    state.stageMode = 'idle';
    state.flashCmd = which;
    state.flashAt = performance.now();
    flashTap(which === 'A' ? els.tapA : els.tapB);
    drawStage(0);
    loopFlash();
  }

  // ── 结算一次射击 ──────────────────────
  function resolveShot() {
    var res = logic.evalShot(state.tA, state.tB, state.windowMs);
    var dose = logic.settleDose(res.raced, DOSE_SETTING, DOSE_LETHAL, DOSE_SAFE);
    settle(res, dose);
  }

  function settle(res, dose) {
    state.armed = false;
    if (res.raced) state.score++;
    if (res.raced) ensureBoomImage();

    // 监护仪
    els.monBlocker.textContent = res.raced ? '未就位（已覆盖）' : '已就位';
    els.monDose.textContent = dose.received + ' Gy';
    els.monStatus.textContent = res.raced ? 'MALFUNCTION 54' : 'TREATMENT OK';
    els.monStatus.className = 'mon-val ' + (res.raced ? 'boom' : 'ok');

    // 手速读数
    els.readDt.textContent = res.dt + ' ms';
    els.readDt.className = 's-val mono ' + (res.raced ? 'warn' : 'good');
    els.readWindow.textContent = state.windowMs + ' ms';
    els.readScore.textContent = state.score;

    // 场景
    state.stageMode = res.raced ? 'boom' : 'safe';
    state.boomAt = performance.now();

    // 结果横幅
    var fb = logic.shotFeedback(res);
    renderOutcome(res, fb);

    drawStage(1);
  }

  // 跳过第一道命令直接开火：不算竞态，判未授权操作
  function settleSkip() {
    state.armed = false;
    els.monBlocker.textContent = '未检查';
    els.monDose.textContent = '0 Gy';
    els.monStatus.textContent = '未授权操作';
    els.readDt.textContent = '– ms';
    els.readDt.className = 's-val mono';
    var fb = logic.skipFeedback();
    renderOutcome(null, fb);
    drawStage(0);
  }

  function renderOutcome(res, fb) {
    var o = els.outcome;
    o.hidden = false;
    o.className = 'outcome ' + fb.tone;
    if (fb.tone === 'invalid') {
      o.innerHTML =
        '<div class="o-head"><i class="ti ti-ban"></i> ' + fb.head + '</div>' +
        '<div class="o-body">' + fb.body + '</div>';
    } else if (fb.tone === 'boom') {
      o.innerHTML =
        '<div class="o-head"><i class="ti ti-alert-triangle"></i> oh no！这个 bug 发生了！患者因为过量辐射死亡了</div>' +
        '<div class="o-body">MALFUNCTION 54 · 你两键间隔 ' + res.dt +
        ' ms，小于竞态窗口 ' + state.windowMs + ' ms。第二道命令覆盖了刚验证过的挡板设置，' +
        '挡板未来得及就位，' + DOSE_SETTING + ' Gy 的全功率 X 射线直接打进患者胸腔。</div>';
    } else {
      o.innerHTML =
        '<div class="o-head" style="color:var(--green)"><i class="ti ti-check"></i> 挡板就位 · 剂量正常</div>' +
        '<div class="o-body">你两键间隔 ' + res.dt + ' ms，落在竞态窗口 ' + state.windowMs +
        ' ms 之外，第二道命令没有插进「检查→开火」的空当。</div>';
    }
    o.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function rearm(label) {
    state.armed = true;
    state.tA = null; state.tB = null;
    state.stageMode = 'idle';
    state.flashCmd = null;
    els.monStatus.className = 'mon-val';
    els.monBlocker.textContent = '中位';
    els.monDose.textContent = '0 Gy';
    els.monStatus.textContent = '待命';
    els.readDt.textContent = '– ms';
    els.readDt.className = 's-val mono';
    els.readScore.textContent = state.score;
    els.outcome.hidden = true;
    els.outcome.className = 'outcome';
    if (label) {
      els.monStatus.textContent = label;
    }
    drawStage(0);
  }

  function resetAll() {
    state.score = 0;
    rearm();
  }

  var imgs = { room: { el: new Image(), ok: false }, boom: { el: new Image(), ok: false } };

  // ── 画布场景（贴图：AI 生成的胶片质感病房） ──
  function drawStage(anim) {
    var cv = els.stage;
    var ctx = els.ctx;
    var W = cv.width, H = cv.height;

    // 用 AI 贴图打底；未加载完成时退回程序化背景
    var tex = state.stageMode === 'boom' ? imgs.boom : imgs.room;
    if (tex.el.complete && tex.el.naturalWidth > 0) {
      drawCover(ctx, tex.el, W, H);
      if (!tex.ok) tex.ok = true;
    } else {
      drawProceduralBG(ctx, W, H);
    }

    if (state.stageMode === 'boom') {
      drawBeamPulse(ctx, W, H);
      drawOhNo(ctx, W, H);
    }

    // 顶部警灯
    drawLamp(ctx, W);

    // 命令徽标反馈（最后画，保证 boom 黑幕也盖不住）
    drawCmdFlash(ctx);

    if (anim) {
      loopBoom();
    }
  }

  // cover 式绘制：按 canvas 宽高比居中裁切，避免贴图被拉伸变形
  function drawCover(ctx, img, W, H) {
    var iw = img.naturalWidth, ih = img.naturalHeight;
    var scale = Math.max(W / iw, H / ih);
    var sw = W / scale, sh = H / scale;
    ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, W, H);
  }

  // 兜底的程序化背景（贴图未就绪时）
  function drawProceduralBG(ctx, W, H) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#221a1a');
    g.addColorStop(0.55, '#1a1412');
    g.addColorStop(1, '#120e0c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(242,228,207,0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, H - 52); ctx.lineTo(W, H - 52); ctx.stroke();
  }

  // 事故时叠加的红色射线脉冲
  function drawBeamPulse(ctx, W, H) {
    var flick = 0.5 + 0.5 * Math.sin(performance.now() / 40);
    var grad = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, Math.max(W, H) * 0.55);
    grad.addColorStop(0, 'rgba(255,60,40,' + (0.28 * flick) + ')');
    grad.addColorStop(1, 'rgba(255,60,40,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  function preloadImages() {
    imgs.room.el.src = 'images/bg-room.png?v=2';
    imgs.room.el.onload = function () { imgs.room.ok = true; drawStage(0); };
  }

  // boom 贴图约 4MB，首次触发事故时才加载
  function ensureBoomImage() {
    if (imgs.boom.el.src) return;
    imgs.boom.el.src = 'images/boom-room.png?v=2';
    imgs.boom.el.onload = function () { imgs.boom.ok = true; drawStage(0); };
  }

  var boomLoopId = null;
  function loopBoom() {
    if (state.stageMode !== 'boom') return;
    if (boomLoopId) cancelAnimationFrame(boomLoopId);
    var last = performance.now();
    function tick(now) {
      if (state.stageMode !== 'boom') { boomLoopId = null; return; }
      if (now - last > 90) { drawStage(0); last = now; }
      boomLoopId = requestAnimationFrame(tick);
    }
    boomLoopId = requestAnimationFrame(tick);
  }

  function drawLamp(ctx, W) {
    var boom = state.stageMode === 'boom';
    ctx.fillStyle = boom ? '#ff6b6b' : '#2e2a26';
    ctx.beginPath();
    ctx.arc(W - 26, 26, 9, 0, Math.PI * 2);
    ctx.fill();
    if (boom) {
      ctx.fillStyle = 'rgba(255,107,107,0.25)';
      ctx.beginPath();
      ctx.arc(W - 26, 26, 16, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 画布上的命令徽标：350ms 内淡出
  function drawCmdFlash(ctx) {
    if (!state.flashCmd) return;
    var age = performance.now() - state.flashAt;
    if (age > 360) { state.flashCmd = null; return; }
    var a = 1 - age / 360;
    var isA = state.flashCmd === 'A';
    var label = isA ? 'CMD · 设置挡板' : 'CMD · 开火';
    var color = isA ? '#ffd166' : '#ff6b6b';
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = '700 15px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    var wpx = ctx.measureText(label).width + 28;
    roundRect(ctx, 18, 18, wpx, 34, 10);
    ctx.fillStyle = 'rgba(20,16,23,.72)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(label, 32, 36);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 徽标淡出动画：400ms 内重绘，结束后停帧
  var flashLoopId = null;
  function loopFlash() {
    if (flashLoopId) cancelAnimationFrame(flashLoopId);
    var start = performance.now();
    function tick(now) {
      if (now - start > 400) {
        // 显式清理：RAF 被节流时不能依赖下一帧的 drawCmdFlash 自行过期
        state.flashCmd = null;
        drawStage(0);
        flashLoopId = null;
        return;
      }
      drawStage(0);
      flashLoopId = requestAnimationFrame(tick);
    }
    flashLoopId = requestAnimationFrame(tick);
  }

  function drawOhNo(ctx, W, H) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ff6b6b';
    ctx.font = '900 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OH NO!', W / 2, H / 2 - 6);
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(242,228,207,0.9)';
    ctx.fillText('过量辐射 · 患者死亡', W / 2, H / 2 + 26);
  }

  // ── 时序放大镜 ────────────────────────
  function buildFlightRows() {
    renderFlight();
  }

  function renderFlight() {
    var w = state.windowMs;
    // 把窗口宽度映射成条上的空当宽度（px 语义）
    var gap = profilW(w);          // 空当（竞态窗口）占比 %
    var readEnd = 30;              // READ 段终点 %
    var fireLeft = readEnd + gap;  // FIRE 段起点 %

    var html = '';
    html +=
      '<div class="flight-row">' +
        '<div class="fl-row-label">主线</div>' +
        '<div class="fl-track">' +
          seg('检查挡板 READ', 4, readEnd - 4, '#53627a') +
          windowGap(readEnd, gap) +
          seg('使能射线 FIRE', fireLeft, Math.max(20, 96 - fireLeft), '#7a5a53') +
        '</div>' +
      '</div>';

    // 第二道命令落点：把「典型快速连打约 120ms」与窗口对照
    var hit = w > 0 && 120 < w;
    var markerLeft = hit ? readEnd + gap * 0.4 : fireLeft;
    html +=
      '<div class="flight-row">' +
        '<div class="fl-row-label">第二道命令</div>' +
        '<div class="fl-track">' +
          '<div class="fl-seg" id="cmdMarker" style="left:' + markerLeft + '%;width:76px;background:' +
            (hit ? 'rgba(255,107,107,.9)' : 'rgba(129,199,132,.85)') + '">' +
            (hit ? '挤进窗口' : '排在窗口后') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<p class="chart-caption">以 120 ms 典型连打为示例：窗口越宽（' + w + ' ms），第二道命令越容易在「检查挡板 READ」完成后、' +
      '「使能射线 FIRE」前插进来，把刚验证的挡板设置覆盖掉。</p>';

    els.flightViz.innerHTML = html;
  }

  function seg(label, leftPct, widthPct, color) {
    return '<div class="fl-seg" style="left:' + leftPct + '%;width:' + widthPct + '%;background:' + color + '">' + label + '</div>';
  }
  // 窗口宽度 ms → 条上空当占比 %
  function profilW(w) {
    if (w <= 0) return 0;
    return Math.max(3, Math.min(26, w / 9));
  }
  function windowGap(leftPct, widthPct) {
    if (widthPct <= 0) return '';
    return '<div class="fl-window" style="left:' + leftPct + '%;width:' + widthPct + '%"><span>竞态窗口</span></div>';
  }

  // ── 图表 ──
  function buildChart() {
    if (typeof Chart === 'undefined') { return; }
    var profile = logic.generateTimingProfile(state.windowMs, 0, 300, 60);
    var labels = profile.map(function (p) { return p.dt; });
    var hits = profile.map(function (p) { return p.hit ? 1 : 0; });
    chart = new Chart(els.timingChart, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: '能否命中竞态窗口',
          data: hits,
          backgroundColor: function (ctx) {
            return hits[ctx.dataIndex] ? 'rgba(255,107,107,0.55)' : 'rgba(129,199,132,0.12)';
          },
          borderWidth: 0,
          barPercentage: 1.02,
          categoryPercentage: 1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                var dt = labels[ctx.dataIndex];
                return '间隔 ' + dt + 'ms → ' + (hits[ctx.dataIndex] ? '命中窗口（MALFUNCTION 54）' : '安全');
              }
            }
          }
        },
        scales: {
          x: { title: { display: true, color: '#888', text: '两键连打间隔 (ms)' }, ticks: { color: '#999' }, grid: { color: 'rgba(242,228,207,0.05)' } },
          y: { min: 0, max: 1.3, display: false, grid: { display: false } }
        }
      }
    });
  }

  function redrawChart() {
    if (!chart) return;
    var profile = logic.generateTimingProfile(state.windowMs, 0, 300, 60);
    var hits = profile.map(function (p) { return p.hit ? 1 : 0; });
    chart.data.datasets[0].data = hits;
    chart.data.datasets[0].backgroundColor = function (ctx) {
      return hits[ctx.dataIndex] ? 'rgba(255,107,107,0.5)' : 'rgba(129,199,132,0.06)';
    };
    chart.data.datasets[0].borderColor = state.windowMs === 0 ? 'rgba(129,199,132,0.9)' : 'rgba(255,209,102,0.9)';
    chart.update();
  }

  // ── 时间轴 ──
  function renderTimeline() {
    var tl = logic.getTimeline();
    els.timelineList.innerHTML = tl.map(function (t) {
      return '<div class="tl-row"><div class="tl-year">' + t.year + '</div><div class="tl-event">' + t.event + '</div></div>';
    }).join('');
  }

  // ── 补充绑定 ──
  function bindSupplement() {
    els.winSlider.addEventListener('input', function () {
      setWindowMs(parseInt(els.winSlider.value, 10));
    });

    els.goFixedBtn.addEventListener('click', function () {
      selectPreset('fixed', false, '已切到加锁固件 —— 怎么连打都安全了');
    });
  }

  // ── 暴露给 header/测试 ──
  window.TheracDemo = {
    state: state,
    onKeyA: onKeyA,
    onKeyB: onKeyB,
    resolveShot: resolveShot,
    rearm: rearm,
    selectPreset: selectPreset,
    _logic: logic
  };
})();

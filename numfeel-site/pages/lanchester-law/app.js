/* app.js — 兰彻斯特平方律演示
 * PixiJS 渲染战斗（单位 / 血条 / 集火光束 / 粒子 / 屏幕震动）
 * + Chart.js 兵力曲线与蒙特卡洛分布
 * 依赖：lanchester.js（window.Lanchester）、PixiJS v7（window.PIXI）
 */
(function () {
  'use strict';

  var L = window.Lanchester;
  var A_COLOR = 0x90caf9;   // 我方 蓝
  var B_COLOR = 0xff6b6b;   // 对面 红
  var GOLD = 0xffd700;

  var STEP_MS = 32;         // 每个模拟 tick 对应的真实毫秒
  var BATTLE_OPTS = { hp: 100, dpsA: 20, dpsB: 20, dt: 0.05 };

  // ── 状态 ──────────────────────────────────────────────
  var app, unitLayer, beamLayer, particleLayer;
  var bgSprite, spriteContainer, soldierTex, arenaTex;
  var sprites = {};         // id -> { x, y, displayHp, spr }
  var state = null;         // 当前 battle
  var running = false;
  var simAccum = 0;
  var particles = [];
  var R = 14;
  var shakeUntil = 0;
  var mode = 'pure';
  var teamA = 5, teamB = 5;
  var curveChart = null, mcChart = null;
  var heroUnlocked = false;
  var pixiReady = false;

  // ── DOM ───────────────────────────────────────────────
  var $ = function (id) { return document.getElementById(id); };
  var wrap = $('battleWrap');
  var overlay = $('battleOverlay');

  // ── Pixi 初始化 ───────────────────────────────────────
  function initPixi() {
    var w = wrap.clientWidth || 800;
    var h = wrap.clientHeight || Math.round(w * 9 / 16);
    app = new PIXI.Application({
      width: w, height: h,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true
    });
    wrap.appendChild(app.view);

    arenaTex = PIXI.Texture.from('assets/arena.jpg');
    soldierTex = PIXI.Texture.from('assets/soldier.png');

    bgSprite = new PIXI.Sprite(arenaTex);
    bgSprite.alpha = 0.85;
    beamLayer = new PIXI.Graphics();
    spriteContainer = new PIXI.Container();
    unitLayer = new PIXI.Graphics();
    particleLayer = new PIXI.Graphics();
    app.stage.addChild(bgSprite, beamLayer, spriteContainer, unitLayer, particleLayer);

    app.ticker.add(loop);
    coverBackground(w, h);

    if (window.ResizeObserver) {
      var ro = new ResizeObserver(debounce(resize, 120));
      ro.observe(wrap);
    } else {
      window.addEventListener('resize', debounce(resize, 120));
    }
  }

  function resize() {
    if (!app) return;
    var w = wrap.clientWidth || 800;
    var h = wrap.clientHeight || Math.round(w * 9 / 16);
    app.renderer.resize(w, h);
    coverBackground(w, h);
    layout();
  }

  // 让背景图等比铺满画布（cover）
  function coverBackground(w, h) {
    if (!bgSprite || !bgSprite.texture) return;
    var tw = bgSprite.texture.width || 1600;
    var th = bgSprite.texture.height || 900;
    var scale = Math.max(w / tw, h / th);
    bgSprite.scale.set(scale);
    bgSprite.x = (w - tw * scale) / 2;
    bgSprite.y = (h - th * scale) / 2;
  }

  // ── 构建一场战斗（不开打，先静态预览）──────────────────
  function buildBattle(a, b) {
    teamA = a; teamB = b;
    state = L.createBattle({
      a: a, b: b,
      hp: BATTLE_OPTS.hp, dpsA: BATTLE_OPTS.dpsA, dpsB: BATTLE_OPTS.dpsB,
      dt: BATTLE_OPTS.dt, mode: mode, seed: (Date.now() & 0xffffff) >>> 0
    });
    sprites = {};
    if (spriteContainer) spriteContainer.removeChildren();
    state.units.forEach(function (u) {
      var spr = null;
      if (spriteContainer && soldierTex) {
        spr = new PIXI.Sprite(soldierTex);
        spr.anchor.set(0.5, 0.55);
        spriteContainer.addChild(spr);
      }
      sprites[u.id] = { x: 0, y: 0, displayHp: u.maxHp, spr: spr };
    });
    layout();
    updateScoreboard();
    updateResultPanel(a, b);
    setStatus('准备就绪');
    hideOverlay();
    particles = [];
  }

  function layout() {
    if (!state || !app) return;
    var W = app.screen.width, H = app.screen.height;
    var maxN = Math.max(teamA, teamB);
    var spacing = Math.min((H - 40) / (maxN), 52);
    R = Math.max(8, Math.min(16, spacing * 0.32));
    var spriteH = R * 3.2;
    var scale = spriteH / 256; // soldier.png 高 256
    ['A', 'B'].forEach(function (team) {
      var list = state.units.filter(function (u) { return u.team === team; });
      var n = list.length;
      var x = team === 'A' ? W * 0.2 : W * 0.8;
      list.forEach(function (u, i) {
        var sp = sprites[u.id];
        sp.x = x;
        sp.y = H / 2 + (i - (n - 1) / 2) * spacing;
        if (sp.spr) {
          sp.spr.x = sp.x;
          sp.spr.y = sp.y;
          // A 队朝右、B 队朝左（镜像）
          sp.spr.scale.set(team === 'A' ? scale : -scale, scale);
        }
      });
    });
  }

  // ── 主循环 ────────────────────────────────────────────
  function loop() {
    var dtMS = app.ticker.deltaMS;

    if (running && state) {
      simAccum += dtMS;
      while (simAccum >= STEP_MS && !L.isOver(state)) {
        simAccum -= STEP_MS;
        var events = L.stepBattle(state);
        processEvents(events);
        updateScoreboard();
      }
      if (L.isOver(state)) endFight();
    }

    // 血条平滑过渡
    if (state) {
      state.units.forEach(function (u) {
        var sp = sprites[u.id];
        sp.displayHp += (u.hp - sp.displayHp) * 0.35;
      });
    }

    redrawBeams();
    redrawUnits();
    updateParticles(dtMS);

    if (performance.now() > shakeUntil) {
      wrap.classList.remove('shaking');
    }
  }

  function processEvents(events) {
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (e.type === 'death') {
        var sp = sprites[e.unit];
        if (sp) {
          spawnDeath(sp.x, sp.y, e.team === 'A' ? A_COLOR : B_COLOR);
          triggerShake();
        }
      }
    }
  }

  // ── 渲染：单位 + 血条 ─────────────────────────────────
  function redrawUnits() {
    if (!state) return;
    unitLayer.clear();
    state.units.forEach(function (u) {
      var sp = sprites[u.id];
      var col = u.team === 'A' ? A_COLOR : B_COLOR;
      // 驱动 sprite 的着色与存亡
      if (sp.spr) {
        if (u.alive) {
          sp.spr.tint = col;
          sp.spr.alpha = 1;
        } else {
          sp.spr.tint = 0x444a55;
          sp.spr.alpha = 0.28;
        }
      }
      if (!u.alive) return;
      // 脚下站位光圈
      unitLayer.beginFill(col, 0.12);
      unitLayer.drawEllipse(sp.x, sp.y + R * 1.5, R * 0.9, R * 0.32);
      unitLayer.endFill();
      // 血条（头顶）
      var frac = Math.max(0, Math.min(1, sp.displayHp / u.maxHp));
      var bw = R * 2.2, bh = 4;
      var bx = sp.x - bw / 2, by = sp.y - R * 1.9;
      unitLayer.beginFill(0x000000, 0.55);
      unitLayer.drawRoundedRect(bx - 1, by - 1, bw + 2, bh + 2, 2);
      unitLayer.endFill();
      var hpcol = frac > 0.5 ? 0x81c784 : (frac > 0.25 ? GOLD : 0xff6b6b);
      unitLayer.beginFill(hpcol, 1);
      unitLayer.drawRoundedRect(bx, by, bw * frac, bh, 2);
      unitLayer.endFill();
    });
  }

  // ── 渲染：集火光束 ─────────────────────────────────────
  function redrawBeams() {
    beamLayer.clear();
    if (!running || !state) return;
    drawTeamBeams('A', state.targetA, A_COLOR);
    drawTeamBeams('B', state.targetB, B_COLOR);
  }

  function drawTeamBeams(team, targetId, color) {
    if (targetId == null) return;
    var tgt = sprites[targetId];
    if (!tgt) return;
    var shooters = state.units.filter(function (u) { return u.team === team && u.alive; });
    var flicker = 0.55 + Math.random() * 0.35;
    shooters.forEach(function (u) {
      var sp = sprites[u.id];
      // 外层辉光
      beamLayer.lineStyle(5, color, 0.08);
      beamLayer.moveTo(sp.x, sp.y);
      beamLayer.lineTo(tgt.x, tgt.y);
      // 核心束
      beamLayer.lineStyle(1.6, color, flicker);
      beamLayer.moveTo(sp.x, sp.y);
      beamLayer.lineTo(tgt.x, tgt.y);
    });
    // 命中点闪光
    beamLayer.beginFill(0xffffff, 0.5 * flicker);
    beamLayer.drawCircle(tgt.x, tgt.y, R * 0.5);
    beamLayer.endFill();
  }

  // ── 粒子 ──────────────────────────────────────────────
  function spawnDeath(x, y, color) {
    for (var i = 0; i < 16; i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 1.2 + Math.random() * 3.2;
      particles.push({
        x: x, y: y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        life: 420 + Math.random() * 360, maxLife: 780,
        size: 2 + Math.random() * 3, color: color
      });
    }
  }

  function updateParticles(dtMS) {
    particleLayer.clear();
    var step = dtMS / 16;
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dtMS;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.vy += 0.12 * step;
      p.vx *= 0.97;
      var a = Math.max(0, p.life / p.maxLife);
      particleLayer.beginFill(p.color, a);
      particleLayer.drawCircle(p.x, p.y, p.size * a);
      particleLayer.endFill();
    }
  }

  function triggerShake() {
    var now = performance.now();
    if (now > shakeUntil - 80) {
      wrap.classList.remove('shaking');
      void wrap.offsetWidth; // 强制重绘以重启动画
      wrap.classList.add('shaking');
      shakeUntil = now + 160;
    }
  }

  // ── 战斗控制 ──────────────────────────────────────────
  function startFight() {
    // 重建一局干净的战斗
    buildBattle(teamA, teamB);
    if (!pixiReady) { finishInstantly(); return; }
    running = true;
    simAccum = 0;
    setStatus('交火中…');
    hideOverlay();
    $('chartSection').classList.add('hidden');
  }

  // WebGL 不可用时的降级：不做动画，直接算完整场结果
  function finishInstantly() {
    var res = L.runBattle({
      a: teamA, b: teamB,
      hp: BATTLE_OPTS.hp, dpsA: BATTLE_OPTS.dpsA, dpsB: BATTLE_OPTS.dpsB,
      dt: BATTLE_OPTS.dt, mode: mode, seed: (Date.now() & 0xffff) >>> 0
    });
    // 把存活情况映射回 state 以复用展示逻辑
    state.history = res.history;
    var aliveA = res.survivorsA, aliveB = res.survivorsB;
    $('scoreA').textContent = aliveA;
    $('scoreB').textContent = aliveB;
    if (aliveA === 0 && aliveB === 0) setStatus('两败俱伤');
    else if (aliveA > 0) setStatus('我方剩 ' + aliveA + ' 人，对面团灭');
    else setStatus('对面剩 ' + aliveB + ' 人，我方团灭');
    updateActualResult(aliveA, aliveB);
    renderCurve();
  }

  function endFight() {
    if (!running) return;
    running = false;
    var aliveA = L.countAlive(state.units, 'A');
    var aliveB = L.countAlive(state.units, 'B');
    updateScoreboard();
    var win = aliveA > 0 && aliveB === 0;
    var draw = aliveA === 0 && aliveB === 0;
    if (draw) {
      showOverlay('同归于尽', 'lose');
      setStatus('两败俱伤');
    } else if (win) {
      showOverlay('我方获胜', 'win');
      setStatus('我方剩 ' + aliveA + ' 人，对面团灭');
    } else {
      showOverlay('我方团灭', 'lose');
      setStatus('对面剩 ' + aliveB + ' 人，我方团灭');
    }
    updateActualResult(aliveA, aliveB);
    renderCurve();

    // Hero 流程：5v5 打完后解锁「拖走队友」
    if (!heroUnlocked && teamA === 5 && teamB === 5) {
      heroUnlocked = true;
      var pull = $('heroPullBtn');
      pull.disabled = false;
      $('heroTip').innerHTML = '看到了吗？5v5 打得有多惨烈。现在<strong>点上面红色按钮</strong>，只拖走一个队友，再看一次。';
    }
  }

  function setStatus(t) { $('battleStatus').textContent = t; }

  function showOverlay(text, cls) {
    overlay.textContent = text;
    overlay.className = 'battle-overlay show ' + cls;
  }
  function hideOverlay() { overlay.className = 'battle-overlay'; }

  function updateScoreboard() {
    if (!state) return;
    $('scoreA').textContent = L.countAlive(state.units, 'A');
    $('scoreB').textContent = L.countAlive(state.units, 'B');
  }

  // ── 结果面板 ──────────────────────────────────────────
  function fmt(x) {
    var r = Math.round(x * 10) / 10;
    return (r % 1 === 0) ? String(r) : r.toFixed(1);
  }

  function updateResultPanel(a, b) {
    $('resultSection').classList.remove('hidden');
    var sq = L.predictSquare(a, b);
    var ln = L.predictLinear(a, b);
    $('resMatchup').textContent = a + 'v' + b;

    $('squareSurv').textContent = sq.winner === 'draw' ? '0' : fmt(sq.survivors);
    $('linearSurv').textContent = ln.winner === 'draw' ? '0' : fmt(ln.survivors);

    // 公式盒
    var k = a * a - b * b;
    $('formulaEq').textContent = a + '² − ' + b + '² = ' + k;
    var explain;
    if (k === 0) {
      explain = '两边平方相等，谁都剩不下，同归于尽。';
    } else if (k > 0) {
      explain = '我方平方占优 ' + k + '，开方 ≈ ' + fmt(Math.sqrt(k)) + ' 人幸存，对面团灭。';
    } else {
      explain = '对面平方占优 ' + (-k) + '，开方 ≈ ' + fmt(Math.sqrt(-k)) + ' 人幸存，我方注定团灭。';
    }
    $('formulaExplain').textContent = explain;

    // 实战结果先清空
    $('actualSurv').textContent = '—';
    $('actualNote').textContent = '点「开打」看真实结果。';
    $('actualSubLabel').textContent = '赢家幸存';
  }

  function updateActualResult(aliveA, aliveB) {
    var el = $('actualSurv'), note = $('actualNote'), sub = $('actualSubLabel');
    if (aliveA === 0 && aliveB === 0) {
      el.textContent = '0'; el.style.color = '#ff6b6b';
      sub.textContent = '同归于尽'; note.textContent = '两边都没了。';
    } else if (aliveA > 0) {
      el.textContent = aliveA; el.style.color = '#81c784';
      sub.textContent = '我方幸存'; note.textContent = '对面团灭，我方剩 ' + aliveA + ' 人。';
    } else {
      el.textContent = aliveB; el.style.color = '#ff6b6b';
      sub.textContent = '对面幸存'; note.textContent = '我方团灭，对面剩 ' + aliveB + ' 人。';
    }
  }

  // ── 兵力曲线（Chart.js）───────────────────────────────
  function renderCurve() {
    if (!state || !state.history) return;
    window.loadChartJS().then(function () {
      var hist = state.history;
      var labels = hist.map(function (h) { return h.t.toFixed(2); });
      var dataA = hist.map(function (h) { return h.a; });
      var dataB = hist.map(function (h) { return h.b; });
      $('chartSection').classList.remove('hidden');
      var ctx = $('curveChart').getContext('2d');
      if (curveChart) curveChart.destroy();
      curveChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            { label: '我方', data: dataA, borderColor: '#90caf9', backgroundColor: 'rgba(144,202,249,0.1)', stepped: true, fill: true, pointRadius: 0, borderWidth: 2.5 },
            { label: '对面', data: dataB, borderColor: '#ff6b6b', backgroundColor: 'rgba(255,107,107,0.1)', stepped: true, fill: true, pointRadius: 0, borderWidth: 2.5 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { intersect: false, mode: 'index' },
          scales: {
            x: { title: { display: true, text: '战斗时间', color: '#888' }, ticks: { color: '#888', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { title: { display: true, text: '存活人数', color: '#888' }, beginAtZero: true, ticks: { color: '#888', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.05)' } }
          },
          plugins: { legend: { labels: { color: '#ccc' } } }
        }
      });
    });
  }

  // ── 蒙特卡洛 ──────────────────────────────────────────
  function runMonteCarlo() {
    var mc = L.monteCarlo({
      a: teamA, b: teamB,
      hp: BATTLE_OPTS.hp, dpsA: BATTLE_OPTS.dpsA, dpsB: BATTLE_OPTS.dpsB,
      dt: BATTLE_OPTS.dt, seed: 12345
    }, 200);

    $('mcSection').classList.remove('hidden');
    var pa = Math.round(mc.aWins / mc.runs * 100);
    var pb = Math.round(mc.bWins / mc.runs * 100);
    $('mcSummary').innerHTML =
      '<div class="mc-stat a"><div class="v">' + pa + '%</div><div class="l">我方获胜</div></div>' +
      '<div class="mc-stat b"><div class="v">' + pb + '%</div><div class="l">对面获胜</div></div>' +
      '<div class="mc-stat"><div class="v">' + mc.draws + '</div><div class="l">同归于尽（场）</div></div>';

    var keys = Object.keys(mc.survivorDist).map(Number).sort(function (x, y) { return x - y; });
    var labels = keys.map(function (k) { return k + ' 人'; });
    var data = keys.map(function (k) { return mc.survivorDist[k]; });

    window.loadChartJS().then(function () {
      var ctx = $('mcChart').getContext('2d');
      if (mcChart) mcChart.destroy();
      mcChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{ label: '出现场次', data: data, backgroundColor: 'rgba(255,215,0,0.6)', borderColor: '#ffd700', borderWidth: 1 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            x: { title: { display: true, text: '赢家幸存人数', color: '#888' }, ticks: { color: '#888' }, grid: { display: false } },
            y: { title: { display: true, text: '场次', color: '#888' }, beginAtZero: true, ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } }
          },
          plugins: { legend: { display: false } }
        }
      });
    });
  }

  // ── 交互绑定 ──────────────────────────────────────────
  function clampTeam(n) { return Math.max(1, Math.min(8, n)); }

  function bindEvents() {
    $('fightBtn').addEventListener('click', startFight);
    $('resetBtn').addEventListener('click', function () {
      running = false;
      buildBattle(teamA, teamB);
      $('chartSection').classList.add('hidden');
    });

    // 步进器
    document.querySelectorAll('.step-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (running) return;
        var team = btn.getAttribute('data-team');
        var dir = parseInt(btn.getAttribute('data-dir'), 10);
        if (team === 'a') teamA = clampTeam(teamA + dir);
        else teamB = clampTeam(teamB + dir);
        $('teamAVal').textContent = teamA;
        $('teamBVal').textContent = teamB;
        buildBattle(teamA, teamB);
      });
    });

    // 预设卡
    document.querySelectorAll('.preset-card').forEach(function (card) {
      card.addEventListener('click', function () {
        teamA = clampTeam(parseInt(card.getAttribute('data-a'), 10));
        teamB = clampTeam(parseInt(card.getAttribute('data-b'), 10));
        $('teamAVal').textContent = teamA;
        $('teamBVal').textContent = teamB;
        buildBattle(teamA, teamB);
        startFight();
        scrollToEl(wrap);
      });
    });

    // 模式切换
    document.querySelectorAll('.mode-pill').forEach(function (pill) {
      pill.addEventListener('click', function () {
        document.querySelectorAll('.mode-pill').forEach(function (p) { p.classList.remove('active'); });
        pill.classList.add('active');
        mode = pill.getAttribute('data-mode');
        $('mcRow').classList.toggle('hidden', mode !== 'random');
        if (mode !== 'random') $('mcSection').classList.add('hidden');
        if (!running) buildBattle(teamA, teamB);
      });
    });

    $('mcBtn').addEventListener('click', runMonteCarlo);

    // Hero 按钮
    $('heroFightBtn').addEventListener('click', function () {
      teamA = 5; teamB = 5;
      $('teamAVal').textContent = 5; $('teamBVal').textContent = 5;
      buildBattle(5, 5);
      startFight();
      scrollToEl(wrap);
    });
    $('heroPullBtn').addEventListener('click', function () {
      teamA = 4; teamB = 5;
      $('teamAVal').textContent = 4; $('teamBVal').textContent = 5;
      buildBattle(4, 5);
      startFight();
      scrollToEl(wrap);
    });
  }

  // ── 工具 ──────────────────────────────────────────────
  function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }
  function scrollToEl(el) {
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ── 启动 ──────────────────────────────────────────────
  function boot() {
    bindEvents();
    try {
      if (!window.PIXI) throw new Error('PIXI not loaded');
      initPixi();
      pixiReady = true;
    } catch (err) {
      pixiReady = false;
      wrap.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;text-align:center;padding:24px;font-size:0.9rem;">你的浏览器没开启 WebGL，战斗动画无法显示。<br>但下方的「直觉 vs 现实」和兵力曲线照常可用。</div>';
    }
    buildBattle(5, 5);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

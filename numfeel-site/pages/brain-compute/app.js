/* app.js — "人脑算力" demo 交互层。核心计算走 window.BrainCompute（见 logic.js）。 */
(function () {
  'use strict';
  var BC = window.BrainCompute;
  var $ = function (id) { return document.getElementById(id); };
  var hasGsap = function () { return typeof window.gsap !== 'undefined'; };

  var API_BASE = 'https://numfeel-api.996.ninja';
  var TURNSTILE_SITE_KEY = '0x4AAAAAADsMioJW-WyC3Fwm';
  var turnstileId = null;
  var lastSubmittedName = null;

  // 成绩收集，用于"复制成绩"
  var scores = {
    mathHardMs: null,
    mathGaveUp: false,
    reactionAvg: null,
    reactionHz: null,
    catMs: null,
    ballScore: null,
  };

  // 轻量动画封装：没有 GSAP 时降级为直接设值
  function pop(el) {
    if (!el) return;
    if (hasGsap()) {
      window.gsap.fromTo(el, { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(2)' });
    } else {
      el.style.opacity = 1;
    }
  }
  function shake(el) {
    if (!el || !hasGsap()) return;
    window.gsap.fromTo(el, { x: -8 }, { x: 0, duration: 0.4, ease: 'elastic.out(1,0.3)' });
  }
  function countUp(el, to, suffix, decimals) {
    suffix = suffix || '';
    decimals = decimals || 0;
    if (!el) return;
    if (!hasGsap()) { el.textContent = to.toFixed(decimals) + suffix; return; }
    var obj = { v: 0 };
    window.gsap.to(obj, {
      v: to, duration: 0.8, ease: 'power2.out',
      onUpdate: function () { el.textContent = obj.v.toFixed(decimals) + suffix; },
    });
  }

  // ══════════════════════ 心算竞速 ══════════════════════
  var mathState = { idx: 0, roundStart: 0, running: false, giveupBtn: null };

  function startMath() {
    mathState.idx = 0;
    mathState.running = true;
    $('mathStart').disabled = true;
    $('mathStart').textContent = '进行中…';
    nextMathRound();
  }

  function nextMathRound() {
    if (mathState.idx >= BC.MATH_ROUNDS.length) { finishMath(); return; }
    var r = BC.MATH_ROUNDS[mathState.idx];
    var prompt = $('mathPrompt');
    prompt.textContent = r.a + ' ' + r.op + ' ' + r.b + ' = ?';
    prompt.classList.toggle('hard', !!r.hard);
    $('mathProgress').textContent = '第 ' + (mathState.idx + 1) + ' / ' + BC.MATH_ROUNDS.length + ' 题' + (r.hard ? ' · 深呼吸' : '');
    $('mathFeedback').textContent = '\u00a0';
    $('mathFeedback').className = 'math-feedback';
    var input = $('mathInput');
    input.value = '';
    input.disabled = false;
    $('mathSubmit').disabled = false;
    input.focus();
    pop(prompt);

    // 电脑"瞬间"给出答案，制造落差
    var answer = BC.computeAnswer(r.a, r.b, r.op);
    mathState.currentAnswer = answer;
    var comp = $('mathComputer');
    comp.textContent = '计算中…';
    setTimeout(function () {
      comp.textContent = r.hard ? '0.0000031 秒' : '瞬间';
    }, 140);

    // 计时
    mathState.roundStart = performance.now();
    mathState.running = true;
    tickMathTimer();

    // 难题给一个"放弃看答案"的出口
    ensureGiveup(r.hard);
  }

  function tickMathTimer() {
    if (!mathState.running) return;
    var ms = performance.now() - mathState.roundStart;
    $('mathTimer').textContent = BC.formatSeconds(ms);
    requestAnimationFrame(tickMathTimer);
  }

  function ensureGiveup(isHard) {
    if (!mathState.giveupBtn) {
      var b = document.createElement('button');
      b.className = 'btn btn-secondary';
      b.style.marginTop = '10px';
      b.innerHTML = '<i class="ti ti-flag"></i> 算不动了，看答案';
      b.addEventListener('click', function () {
        if (!mathState.running) return;
        scores.mathGaveUp = true;
        var fb = $('mathFeedback');
        fb.className = 'math-feedback bad';
        fb.textContent = '正确答案是 ' + mathState.currentAnswer.toLocaleString() + '。别自责，这就是重点。';
        shake($('mathPrompt'));
        advanceMath();
      });
      mathState.giveupBtn = b;
      $('mathGame').insertBefore(b, $('mathStart'));
    }
    mathState.giveupBtn.style.display = isHard ? 'inline-flex' : 'none';
  }

  function submitMath() {
    if (!mathState.running) return;
    var r = BC.MATH_ROUNDS[mathState.idx];
    var answer = BC.computeAnswer(r.a, r.b, r.op);
    var input = $('mathInput');
    var fb = $('mathFeedback');
    if (BC.checkMathAnswer(input.value, answer)) {
      var ms = performance.now() - mathState.roundStart;
      if (r.hard) scores.mathHardMs = ms;
      fb.className = 'math-feedback ok';
      fb.textContent = '对！用了 ' + BC.formatSeconds(ms) + (r.hard ? '。而电脑早在百万分之一秒前就算完了。' : '。');
      advanceMath();
    } else {
      fb.className = 'math-feedback bad';
      fb.textContent = '不对，再试试。';
      shake(input);
    }
  }

  function advanceMath() {
    mathState.running = false;
    $('mathInput').disabled = true;
    $('mathSubmit').disabled = true;
    mathState.idx++;
    setTimeout(nextMathRound, 900);
  }

  function finishMath() {
    $('mathProgress').textContent = '心算结束';
    $('mathPrompt').textContent = '👇 往下测反应';
    $('mathPrompt').classList.remove('hard');
    if (mathState.giveupBtn) mathState.giveupBtn.style.display = 'none';
    $('mathStart').disabled = false;
    $('mathStart').innerHTML = '<i class="ti ti-rotate"></i> 再算一次';
    maybeVerdict1();
  }

  // ══════════════════════ 反应时间 ══════════════════════
  var reactState = { attempt: 0, total: 3, phase: 'idle', goTime: 0, timer: null, times: [] };

  function renderDots() {
    var wrap = $('reactionDots');
    wrap.innerHTML = '';
    for (var i = 0; i < reactState.total; i++) {
      var d = document.createElement('span');
      d.className = 'reaction-dot' + (reactState.times[i] != null ? ' filled' : '');
      d.textContent = reactState.times[i] != null ? Math.round(reactState.times[i]) + ' ms' : '第 ' + (i + 1) + ' 次';
      wrap.appendChild(d);
    }
  }

  function startReaction() {
    reactState.attempt = 0;
    reactState.times = [];
    $('reactionStart').disabled = true;
    $('reactionSummary').textContent = '';
    renderDots();
    armReaction();
  }

  function armReaction() {
    var box = $('reactionBox');
    box.className = 'reaction-box ready';
    box.querySelector('span').textContent = '等待变绿… 别急';
    reactState.phase = 'ready';
    var delay = 1200 + Math.random() * 2600;
    reactState.timer = setTimeout(function () {
      box.className = 'reaction-box go';
      box.querySelector('span').textContent = '点！';
      reactState.phase = 'go';
      reactState.goTime = performance.now();
    }, delay);
  }

  function clickReaction() {
    var box = $('reactionBox');
    if (reactState.phase === 'ready') {
      // 抢跳
      clearTimeout(reactState.timer);
      box.className = 'reaction-box early';
      box.querySelector('span').textContent = '抢跳了！等它变绿再点';
      reactState.phase = 'idle';
      setTimeout(armReaction, 900);
      return;
    }
    if (reactState.phase === 'go') {
      var ms = performance.now() - reactState.goTime;
      reactState.times[reactState.attempt] = ms;
      reactState.attempt++;
      reactState.phase = 'idle';
      renderDots();
      box.className = 'reaction-box result';
      box.querySelector('span').textContent = Math.round(ms) + ' ms';
      if (reactState.attempt < reactState.total) {
        setTimeout(armReaction, 800);
      } else {
        finishReaction();
      }
    }
  }

  function finishReaction() {
    var r = BC.summarizeReaction(reactState.times);
    scores.reactionAvg = r.avg;
    scores.reactionHz = r.hz;
    var box = $('reactionBox');
    box.className = 'reaction-box result';
    box.querySelector('span').textContent = '平均 ' + Math.round(r.avg) + ' ms';
    var summary = $('reactionSummary');
    summary.innerHTML = '你的平均反应约 <span class="hl">' + Math.round(r.avg) + ' 毫秒</span>，' +
      '换算成节奏差不多是 <span class="hl">' + r.hz.toFixed(1) + ' 次/秒</span>。' +
      '一颗普通 CPU 每秒能跑几十亿个节拍（GHz 级），比你快了上亿倍。';
    pop(summary);
    $('reactionStart').disabled = false;
    $('reactionStart').innerHTML = '<i class="ti ti-rotate"></i> 再测一次';
    maybeVerdict1();
    updateLeaderboardState();
  }

  function maybeVerdict1() {
    if ((scores.mathHardMs != null || scores.mathGaveUp) && scores.reactionAvg != null) {
      var v = $('verdict1');
      if (v.hidden) { v.hidden = false; pop(v); }
    }
  }

  // ══════════════════════ 找猫 ══════════════════════
  var catState = { start: 0, target: -1, done: false };
  var CAT_ROWS = 5, CAT_COLS = 8;

  function startCat() {
    var grid = BC.buildGrid(CAT_ROWS, CAT_COLS);
    catState.target = grid.targetIndex;
    catState.done = false;
    var el = $('catGrid');
    el.innerHTML = '';
    var cells = [];
    grid.cells.forEach(function (kind, i) {
      var cell = document.createElement('div');
      cell.className = 'cat-cell';
      var img = document.createElement('img');
      img.src = '../../images/brain-compute/' + (kind === 'cat' ? 'cat.png' : 'dog.png');
      img.alt = kind === 'cat' ? '猫' : '狗';
      // 干扰项随机翻转/旋转，让搜索不至于太机械
      if (kind === 'dog') {
        var rot = (Math.random() * 16 - 8).toFixed(1);
        var flip = Math.random() < 0.5 ? -1 : 1;
        img.style.transform = 'rotate(' + rot + 'deg) scaleX(' + flip + ')';
      }
      cell.appendChild(img);
      cell.addEventListener('click', function () { clickCat(i); });
      el.appendChild(cell);
      cells.push(cell);
    });
    $('catStatus').textContent = '找到那只猫，点它！';
    $('catStart').disabled = true;

    // 铺满动画结束后开始计时
    if (hasGsap()) {
      window.gsap.to(cells, { opacity: 1, duration: 0.25, stagger: { each: 0.008, from: 'random' },
        onComplete: function () { catState.start = performance.now(); } });
    } else {
      cells.forEach(function (c) { c.style.opacity = 1; });
      catState.start = performance.now();
    }
  }

  function clickCat(i) {
    if (catState.done || !catState.start) return;
    var cells = $('catGrid').children;
    if (BC.isHit(i, catState.target)) {
      catState.done = true;
      var ms = performance.now() - catState.start;
      scores.catMs = ms;
      cells[i].classList.add('hit');
      pop(cells[i]);
      $('catStatus').innerHTML = '抓到了！用了 <span class="hl">' + BC.formatSeconds(ms) + '</span>。' +
        '这一眼扫过 40 个目标只挑出唯一的猫——这种"视觉搜索"，正是计算机曾经最头疼的活。';
      $('catStart').disabled = false;
      $('catStart').innerHTML = '<i class="ti ti-rotate"></i> 再找一次';
      maybeVerdict2();
      updateLeaderboardState();
    } else {
      cells[i].classList.add('miss');
      setTimeout(function () { cells[i].classList.remove('miss'); }, 400);
    }
  }

  // ══════════════════════ 接球预测 ══════════════════════
  var ballCanvas, ballCtx;
  var ballState = { running: false, params: null, guessX: null, actualX: null, t: 0, trail: [] };
  // 从「手」的高度(离地 40px)抛出，避免起点恰好在地面导致第一帧就判定落地
  var G = 500, GROUND_Y = 320, X0 = 70, Y0 = 280;

  function initBall() {
    ballCanvas = $('ballCanvas');
    ballCtx = ballCanvas.getContext('2d');
    drawBallScene();
    ballCanvas.addEventListener('click', function (e) {
      if (!ballState.running || ballState.guessX != null) return;
      var rect = ballCanvas.getBoundingClientRect();
      var x = (e.clientX - rect.left) * (ballCanvas.width / rect.width);
      ballState.guessX = x;
      $('ballStatus').textContent = '已锁定你的预测，等球落地…';
    });
  }

  function drawBallScene() {
    var c = ballCtx, w = ballCanvas.width, h = ballCanvas.height;
    c.clearRect(0, 0, w, h);
    // 地面
    c.strokeStyle = 'rgba(255,255,255,0.25)';
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, GROUND_Y + 6); c.lineTo(w, GROUND_Y + 6); c.stroke();
    // 待发射：静止时在起点画一个可见的球，提示这里有东西可以发射
    if (!ballState.running && ballState.trail.length === 0) {
      c.fillStyle = '#ffec8b';
      c.beginPath(); c.arc(X0, Y0, 11, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,236,139,0.35)';
      c.font = '13px -apple-system, sans-serif';
      c.fillText('待发射', X0 - 18, Y0 - 20);
    }
    // 轨迹
    if (ballState.trail.length > 1) {
      c.strokeStyle = 'rgba(144,202,249,0.5)'; c.lineWidth = 2;
      c.beginPath();
      ballState.trail.forEach(function (p, i) { i === 0 ? c.moveTo(p.x, p.y) : c.lineTo(p.x, p.y); });
      c.stroke();
    }
    // 猜测线
    if (ballState.guessX != null) {
      c.strokeStyle = '#ffd700'; c.setLineDash([6, 6]); c.lineWidth = 2;
      c.beginPath(); c.moveTo(ballState.guessX, 0); c.lineTo(ballState.guessX, GROUND_Y + 6); c.stroke();
      c.setLineDash([]);
    }
    // 真实落点：只有球落地后才揭晓，飞行途中不能剧透，否则预判就没意义了
    if (ballState.actualX != null && !ballState.running) {
      c.fillStyle = '#81c784';
      c.beginPath(); c.arc(ballState.actualX, GROUND_Y + 6, 7, 0, Math.PI * 2); c.fill();
    }
  }

  function launchBall() {
    // 先定飞行时长（1.4~1.9 秒，留足预判时间），反推向上初速，保证弧顶不出画布
    var flight = 1.4 + Math.random() * 0.5;
    var vy = -(G * flight / 2);
    var vx = 90 + Math.random() * 170;     // 水平速度，落点控制在画布内
    ballState.params = { vx: vx, vy: vy };
    ballState.actualX = BC.landingX(X0, Y0, vx, vy, G, GROUND_Y);
    ballState.guessX = null;
    ballState.t = 0;
    ballState.trail = [];
    ballState.lastT = 0; // 每次发射都重置计时基准，保证第一帧 dt=0，不会误判落地
    ballState.running = true;
    $('ballLaunch').disabled = true;
    $('ballStatus').textContent = '球飞出去了——趁它没落地，点你觉得的落点！';
    animateBall(performance.now());
  }

  function animateBall(now) {
    if (!ballState.lastT) ballState.lastT = now;
    var dt = Math.min(0.032, (now - ballState.lastT) / 1000);
    ballState.lastT = now;
    ballState.t += dt;
    var p = ballState.params;
    var x = X0 + p.vx * ballState.t;
    var y = Y0 + p.vy * ballState.t + 0.5 * G * ballState.t * ballState.t;
    // 必须已经飞起来(t>0)才判定落地，否则第一帧 t=0 会误判
    if (ballState.t > 0 && y >= GROUND_Y) { landBall(); return; }
    ballState.trail.push({ x: x, y: y });
    drawBallScene();
    // 当前球
    ballCtx.fillStyle = '#ffec8b';
    ballCtx.beginPath(); ballCtx.arc(x, y, 10, 0, Math.PI * 2); ballCtx.fill();
    requestAnimationFrame(animateBall);
  }

  function landBall() {
    ballState.running = false;
    ballState.lastT = 0;
    drawBallScene();
    $('ballLaunch').disabled = false;
    $('ballLaunch').innerHTML = '<i class="ti ti-player-play"></i> 再发射一球';
    if (ballState.guessX == null) {
      $('ballStatus').textContent = '这次没预测。再发一球，趁它在空中点一下落点。';
      return;
    }
    var err = BC.predictionError(ballState.guessX, ballState.actualX);
    var res = BC.scoreLanding(err, 220);
    scores.ballScore = res.score;
    var words = { perfect: '几乎分毫不差', great: '相当准', ok: '差不多', miss: '差了点' };
    $('ballStatus').innerHTML = '你的预判' + words[res.rating] + '，得分 <span class="hl">' + res.score +
      '</span>（偏差 ' + Math.round(err) + ' 像素）。你根本没列公式，大脑却在几百毫秒里把这条抛物线解完了。';
    maybeVerdict2();
    updateLeaderboardState();
  }

  function maybeVerdict2() {
    if (scores.catMs != null && scores.ballScore != null) {
      var v = $('verdict2');
      if (v.hidden) { v.hidden = false; pop(v); }
    }
  }

  // ══════════════════════ 能效对比图 ══════════════════════
  function renderEffStats() {
    var brainEff = BC.efficiency(BC.BRAIN.flops, BC.BRAIN.powerW);
    var chipEff = BC.efficiency(BC.FRONTIER.flops, BC.FRONTIER.powerW);
    var stats = [
      { cls: 'brain', v: '860 亿', l: '大脑神经元' },
      { cls: 'brain', v: '约 20 瓦', l: '大脑功耗（一只灯泡）' },
      { cls: 'chip', v: '约 21 兆瓦', l: 'Frontier 超算功耗' },
      { cls: 'chip', v: '≈ 1 EFLOP', l: '两者算力同一量级' },
    ];
    var wrap = $('effStats');
    wrap.innerHTML = '';
    stats.forEach(function (s) {
      var d = document.createElement('div');
      d.className = 'eff-stat ' + s.cls;
      d.innerHTML = '<div class="v">' + s.v + '</div><div class="l">' + s.l + '</div>';
      wrap.appendChild(d);
    });
    var ratio = BC.efficiencyRatio(BC.BRAIN, BC.FRONTIER);
    $('ratioText').textContent = Math.round(ratio / 1e4) + ' 万';
    return { brainEff: brainEff, chipEff: chipEff };
  }

  function renderChart(eff) {
    if (!window.loadChartJS) return;
    window.loadChartJS().then(function () {
      var ctx = $('effChart').getContext('2d');
      // 用对数刻度展示每瓦算力差距
      new window.Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['人脑', 'Frontier 超算'],
          datasets: [{
            label: '每瓦算力（FLOPS/W，对数刻度）',
            data: [eff.brainEff, eff.chipEff],
            backgroundColor: ['rgba(255,215,0,0.75)', 'rgba(144,202,249,0.75)'],
            borderColor: ['#ffd700', '#90caf9'],
            borderWidth: 1,
            borderRadius: 8,
          }],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { labels: { color: '#ccc' } },
            tooltip: { callbacks: { label: function (c) { return c.parsed.y.toExponential(1) + ' FLOPS/W'; } } },
          },
          scales: {
            y: { type: 'logarithmic', ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.08)' } },
            x: { ticks: { color: '#ccc', font: { size: 14 } }, grid: { display: false } },
          },
        },
      });
    });
  }

  // ══════════════════════ 排行榜 ══════════════════════
  // 三项是否都完成（反应必须有有效均值）
  function scoresReady() {
    return scores.reactionAvg != null && scores.reactionAvg > 0 &&
      scores.catMs != null && scores.ballScore != null;
  }

  function updateLeaderboardState() {
    var pending = $('scorePending');
    var ready = $('scoreReady');
    var box = $('submitBox');
    if (!scoresReady()) {
      pending.hidden = false;
      ready.hidden = true;
      box.hidden = true;
      return;
    }
    var reactionMs = Math.round(scores.reactionAvg);
    var catMs = Math.round(scores.catMs);
    var ballScore = scores.ballScore;
    var total = BC.computeScore(reactionMs, catMs, ballScore);
    var parts = BC.scoreBreakdown(reactionMs, catMs, ballScore);
    var grade = BC.gradeOf(total);
    countUp($('scoreValue'), total, '', 0);
    $('scoreGrade').textContent = '评级：' + grade.label;
    $('scoreParts').innerHTML =
      '<span class="score-part">反应 <b>' + parts.reaction + '</b></span>' +
      '<span class="score-part">找猫 <b>' + parts.cat + '</b></span>' +
      '<span class="score-part">接球 <b>' + parts.ball + '</b></span>';
    if (pending.hidden === false) { pending.hidden = true; ready.hidden = false; pop(ready); }
    if (box.hidden) { box.hidden = false; renderTurnstile(); }
  }

  function renderTurnstile() {
    var container = $('turnstileWidget');
    if (!container) return;
    // 脚本可能还没加载完，稍后重试
    if (typeof turnstile === 'undefined') { setTimeout(renderTurnstile, 300); return; }
    if (turnstileId !== null) return; // 已渲染，避免重复
    turnstileId = turnstile.render(container, {
      sitekey: TURNSTILE_SITE_KEY,
      action: 'brain-compute-submit',
      theme: 'auto',
    });
  }
  function resetTurnstile() {
    if (turnstileId !== null && typeof turnstile !== 'undefined') {
      turnstile.reset(turnstileId);
    }
  }
  function getTurnstileToken() {
    if (typeof turnstile === 'undefined' || turnstileId === null) return null;
    return turnstile.getResponse(turnstileId) || null;
  }

  function submitScore() {
    if (!scoresReady()) return;
    var status = $('lbStatus');
    var name = ($('lbName').value || '').trim();
    if (!name) { status.className = 'lb-status error'; status.textContent = '先起个昵称吧'; return; }
    var token = getTurnstileToken();
    if (!token) { status.className = 'lb-status error'; status.textContent = '请先完成上方的人机验证'; return; }
    var btn = $('lbSubmit');
    btn.disabled = true;
    status.className = 'lb-status loading';
    status.textContent = '正在提交…';
    var body = {
      name: name,
      reactionMs: Math.round(scores.reactionAvg),
      catMs: Math.round(scores.catMs),
      ballScore: scores.ballScore,
      cfTurnstileToken: token,
    };
    fetch(API_BASE + '/brain-compute/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json().then(function (j) { return { http: r.status, json: j }; }); })
      .then(function (res) {
        var j = res.json;
        if (j.status === 200 && j.data) {
          lastSubmittedName = name;
          status.className = 'lb-status success';
          status.textContent = '提交成功！你是第 ' + j.data.rank + ' 名（共 ' + j.data.total + ' 人）';
          loadLeaderboard();
        } else if (res.http === 429 || j.status === 429) {
          status.className = 'lb-status error';
          status.textContent = '提交太频繁了，歇会儿再来';
        } else {
          status.className = 'lb-status error';
          status.textContent = j.message || '提交失败，检查下网络';
        }
      })
      .catch(function () {
        status.className = 'lb-status error';
        status.textContent = '网络错误，稍后重试';
      })
      .finally(function () {
        btn.disabled = false;
        resetTurnstile();
      });
  }

  function loadLeaderboard() {
    fetch(API_BASE + '/brain-compute/leaderboard?limit=20')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.status === 200 && j.data) { renderLeaderboard(j.data); }
        else { renderLeaderboard({ leaders: [], total: 0 }); }
      })
      .catch(function () {
        $('lbBody').innerHTML = '<tr><td colspan="7" class="lb-empty">榜单加载失败，点刷新重试</td></tr>';
      });
  }

  function renderLeaderboard(data) {
    var body = $('lbBody');
    var leaders = data.leaders || [];
    if (leaders.length === 0) {
      body.innerHTML = '<tr><td colspan="7" class="lb-empty">还没有人上榜，来当第一个</td></tr>';
      $('lbTotal').textContent = '';
      return;
    }
    body.innerHTML = leaders.map(function (d) {
      var rankCls = d.rank <= 3 ? ' class="lb-rank-' + d.rank + '"' : '';
      var meCls = (lastSubmittedName && d.name === lastSubmittedName) ? ' class="lb-me"' : '';
      return '<tr' + meCls + '>' +
        '<td' + rankCls + '>' + d.rank + '</td>' +
        '<td>' + escapeHtml(d.name) + '</td>' +
        '<td class="lb-score">' + d.score + '</td>' +
        '<td>' + d.reactionMs + ' ms</td>' +
        '<td>' + (d.catMs / 1000).toFixed(2) + ' s</td>' +
        '<td>' + d.ballScore + '</td>' +
        '<td>' + escapeHtml(d.grade) + '</td>' +
        '</tr>';
    }).join('');
    $('lbTotal').textContent = '共 ' + data.total + ' 人参与';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ══════════════════════ 复制成绩 / 重开 ══════════════════════
  function copyScore() {
    var lines = ['我在「人脑算力」实验里的成绩：'];
    if (scores.mathGaveUp) lines.push('· 大乘法心算：举白旗了 😅');
    else if (scores.mathHardMs != null) lines.push('· 大乘法心算：' + BC.formatSeconds(scores.mathHardMs));
    if (scores.reactionAvg != null) lines.push('· 反应延迟：约 ' + Math.round(scores.reactionAvg) + ' ms');
    if (scores.catMs != null) lines.push('· 一堆狗里找猫：' + BC.formatSeconds(scores.catMs));
    if (scores.ballScore != null) lines.push('· 接球预判：' + scores.ballScore + ' 分');
    lines.push('结论：论死算被芯片碾压，论感知反手教做人。来试试 👉 https://numfeel.996.ninja/pages/brain-compute/');
    var text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { flashCopy('已复制成绩'); }, function () { flashCopy('复制失败'); });
    } else {
      flashCopy('请手动复制');
    }
  }
  function flashCopy(msg) {
    var b = $('copyBtn');
    var old = b.innerHTML;
    b.innerHTML = '<i class="ti ti-check"></i> ' + msg;
    setTimeout(function () { b.innerHTML = old; }, 1600);
  }

  function restart() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ══════════════════════ 绑定 ══════════════════════
  function bind() {
    $('startBtn').addEventListener('click', function () {
      $('round1').scrollIntoView({ behavior: 'smooth' });
    });
    $('mathStart').addEventListener('click', startMath);
    $('mathSubmit').addEventListener('click', submitMath);
    $('mathInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') submitMath(); });

    $('reactionStart').addEventListener('click', startReaction);
    $('reactionBox').addEventListener('click', clickReaction);
    renderDots();

    $('catStart').addEventListener('click', startCat);

    initBall();
    $('ballLaunch').addEventListener('click', launchBall);

    var eff = renderEffStats();
    renderChart(eff);

    $('lbSubmit').addEventListener('click', submitScore);
    $('lbRefresh').addEventListener('click', loadLeaderboard);
    loadLeaderboard();

    $('copyBtn').addEventListener('click', copyScore);
    $('restartBtn').addEventListener('click', restart);

    if (hasGsap()) {
      window.gsap.from('.hero-copy > *', { y: 16, opacity: 0, duration: 0.5, stagger: 0.12, ease: 'power2.out' });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();

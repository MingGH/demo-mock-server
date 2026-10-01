/**
 * app.js - gps-time 演示页交互逻辑
 *
 * 依赖：engine.js（window 全局，经 <script> 引入）、GSAP（可选）、Chart.js（loadChartJS）。
 * 逻辑分五块模块 A–E，含 NFTrack 通用埋点。
 */
(function () {
  'use strict';

  var API = 'https://numfeel-api.996.ninja';
  var SPEED_OF_LIGHT = window.GPS_ENGINE.SPEED_OF_LIGHT;

  // ── 行为埋点：见 AGENTS.md。只镜像低频收尾事件 session_end。 ──
  window.NF_TRACK_UMAMI_MIRROR = ['session_end'];
  var trackSessionActive = false;
  function nfTrack(name, props, opts) {
    try { if (window.NFTrack) window.NFTrack.track(name, props, opts); } catch (e) {}
  }
  function trackSessionStart() {
    if (trackSessionActive) return;
    trackSessionActive = true;
    nfTrack('session_start', {});
  }
  function trackSessionEnd() {
    if (!trackSessionActive) return;
    trackSessionActive = false;
    nfTrack('session_end', {}, { force: true });
  }

  function $(id) { return document.getElementById(id); }
  function showToast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2000);
  }

  // ════════════════════════════════════════════════════════════════
  // 模块 A：三个圆，一个交点（三步渐进：定位 → 表慢 → GPS 的解法）
  // ════════════════════════════════════════════════════════════════
  var solveState = {
    cv: null, ctx: null,
    cssW: 560, cssH: 420,   // 画布的逻辑像素尺寸，世界坐标映射用
    dpr: 1,
    scale: 0.006,           // px 每米，自动适配内容
    sats: [   // 卫星平面坐标（米），围绕画布中心分布
      { x: 15000, y: 2000 },
      { x: -13000, y: 6000 },
      { x: 4000, y: -16000 },
      { x: -9000, y: -11000 }
    ],
    truePos: { x: 200, y: -150 },   // 真实接收机位置
    step: 1,                // 当前步骤 1/2/3
    userBiasUs: 100,        // 步骤 2/3 里"你的表慢了多少"（微秒），滑块可调
    assumeKnown: false,     // 步骤 3 的开关：假装表很准
    animT: 1,               // 步骤 3 收缩动画进度 0→1
    animRaf: null,
    dragging: false
  };

  var GUIDE = {
    1: '每颗卫星都带着原子钟，不停广播「现在是几点」。信号跑到你手机要花一点时间——<b>路上花的时间 × 光速 = 你离它多远</b>。以卫星为圆心、这个距离为半径画个圆：两个圆交出两个点，三个圆只剩一个交点。那个交点，就是你在哪。',
    2: '麻烦来了：你的手机里没有原子钟，只有几块钱的石英表。假设它慢了 100 微秒——信号「在路上花的时间」就被你量多了 100 微秒，<b>每个距离都虚胖了同一段</b>。三个圆各自胖了一圈，再也凑不出一个公共的交点。你的位置，卡在了几条弧线中间的空地里。',
    3: '三颗卫星量的是同一块慢表，所以三个圆多出来的长度是<b>同一个数</b>。GPS 的解法：与其猜表慢多少，干脆把它当成第三个未知数——<b>让三个圆一起缩小同样的长度</b>，什么时候重新交于一点，缩掉的长度就是你的表慢了多少。位置和钟差，一次全出来。（真实 GPS 在三维空间：位置 3 个数 + 钟差 = 4 个未知数，所以手机要同时看到 4 颗星；这里是平面版，3 颗就够。）'
  };

  var NEXT_BTN = {
    1: '下一步：如果表慢了呢 →',
    2: '下一步：看 GPS 怎么救场 →',
    3: '← 再从第一步看一遍'
  };

  // 世界坐标(米) ↔ 画布坐标(px)；全部用 cssW/cssH（逻辑像素），与事件坐标一致。
  function worldToCanvas(p) {
    var scale = solveState.scale;
    var cx = solveState.cssW / 2, cy = solveState.cssH / 2;
    return { x: cx + p.x * scale, y: cy - p.y * scale };
  }
  function canvasToWorld(px, py) {
    var scale = solveState.scale;
    var cx = solveState.cssW / 2, cy = solveState.cssH / 2;
    return { x: (px - cx) / scale, y: (cy - py) / scale };
  }

  // 按当前内容自适应缩放；留出余量给步骤 2/3 里鼓出来的圆弧。
  function fitSolveView() {
    var maxX = 1, maxY = 1;
    solveState.sats.forEach(function (p) {
      maxX = Math.max(maxX, Math.abs(p.x));
      maxY = Math.max(maxY, Math.abs(p.y));
    });
    var sx = (solveState.cssW / 2 - 40) / maxX;
    var sy = (solveState.cssH / 2 - 40) / maxY;
    solveState.scale = Math.max(1e-9, Math.min(sx, sy) * 0.8);
  }

  // 当前假设的钟差（秒）。步骤 1 是"表很准"的世界，步骤 2/3 用滑块值。
  function currentBiasSeconds() {
    return solveState.step === 1 ? 0 : solveState.userBiasUs * 1e-6;
  }

  function prsFor(biasSeconds) {
    return solveState.sats.map(function (s) {
      return window.GPS_ENGINE.pseudorange(window.GPS_ENGINE.dist2d(solveState.truePos, s), biasSeconds);
    });
  }

  function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function startShrinkAnim() {
    if (solveState.animRaf) { cancelAnimationFrame(solveState.animRaf); solveState.animRaf = null; }
    solveState.animT = 0;
    var start = performance.now();
    var dur = 1600;
    (function frame(now) {
      solveState.animT = Math.min(1, (now - start) / dur);
      drawSolve();
      if (solveState.animT < 1) {
        solveState.animRaf = requestAnimationFrame(frame);
      } else {
        solveState.animRaf = null;
      }
    })(start);
  }

  function stopShrinkAnim() {
    if (solveState.animRaf) { cancelAnimationFrame(solveState.animRaf); solveState.animRaf = null; }
    solveState.animT = 1;
  }

  function drawCircleAt(sat, radiusM, style, width, dashed) {
    var ctx = solveState.ctx;
    var c = worldToCanvas(sat);
    ctx.beginPath();
    ctx.arc(c.x, c.y, Math.max(1, radiusM * solveState.scale), 0, Math.PI * 2);
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    if (dashed) ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawSolve() {
    var ctx = solveState.ctx;
    var W = solveState.cssW, H = solveState.cssH;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, W, H);

    // 网格
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (var g = 0; g <= W; g += 40) { ctx.beginPath(); ctx.moveTo(g, 0); ctx.lineTo(g, H); ctx.stroke(); }
    for (var g2 = 0; g2 <= H; g2 += 40) { ctx.beginPath(); ctx.moveTo(0, g2); ctx.lineTo(W, g2); ctx.stroke(); }

    var step = solveState.step;
    var biasS = currentBiasSeconds();
    var biasM = biasS * window.GPS_ENGINE.SPEED_OF_LIGHT;   // 表慢带来的"虚胖"（米）
    var E = window.GPS_ENGINE;

    var solved = null;
    if (step === 3 && !solveState.assumeKnown) {
      solved = E.solvePosition(solveState.sats, prsFor(biasS), {});
      if (solved) {
        var shrinkTarget = solved.clockBiasSeconds * E.SPEED_OF_LIGHT; // 应该缩掉的长度
        var e = easeInOut(solveState.animT);
        // 圆：从"虚胖"半径收缩到"重新交于一点"的半径
        solveState.sats.forEach(function (s) {
          var rho = E.dist2d(solveState.truePos, s) + biasM;
          var r = rho - shrinkTarget * e;
          drawCircleAt(s, r, 'rgba(129,199,132,0.55)', 2, false);
        });
        // 收缩完成：高亮交点
        if (solveState.animT >= 1) {
          var ip = worldToCanvas({ x: solved.x, y: solved.y });
          ctx.beginPath(); ctx.arc(ip.x, ip.y, 14, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(129,199,132,0.9)'; ctx.lineWidth = 2; ctx.stroke();
        }
      }
    } else if (step === 3 && solveState.assumeKnown) {
      // 假装表准：拒绝收缩，圆停在虚胖状态
      solveState.sats.forEach(function (s) {
        drawCircleAt(s, E.dist2d(solveState.truePos, s) + biasM, 'rgba(255,107,107,0.5)', 2, false);
      });
    } else if (step === 2) {
      // 灰色虚线：真实距离的圆（三条本应交于一点）
      solveState.sats.forEach(function (s) {
        drawCircleAt(s, E.dist2d(solveState.truePos, s), 'rgba(144,202,249,0.25)', 1.5, true);
      });
      // 红色实线：按慢表量出来的圆（全部虚胖，交不上）
      solveState.sats.forEach(function (s) {
        drawCircleAt(s, E.dist2d(solveState.truePos, s) + biasM, 'rgba(255,107,107,0.55)', 2, false);
      });
    } else {
      // 步骤 1：干净的三(四)个圆，全部穿过接收机
      solveState.sats.forEach(function (s) {
        drawCircleAt(s, E.dist2d(solveState.truePos, s), 'rgba(144,202,249,0.5)', 2, false);
      });
    }

    // 卫星（蓝点）
    solveState.sats.forEach(function (s) {
      var p = worldToCanvas(s);
      ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#90caf9'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    });

    // 真实接收机（金色）
    var tp = worldToCanvas(solveState.truePos);
    ctx.beginPath(); ctx.arc(tp.x, tp.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd700'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif';
    ctx.fillText(step === 1 ? '你 = 交点' : '你的真实位置', tp.x + 12, tp.y - 12);

    // 步骤 3 + 假装表准：画出被推走的位置
    var errKm = 0;
    if (step === 3 && solveState.assumeKnown) {
      var bad = E.solvePosition(solveState.sats, prsFor(biasS), { assumeClockKnown: true });
      if (bad) {
        errKm = Math.hypot(bad.x - solveState.truePos.x, bad.y - solveState.truePos.y) / 1000;
        var sp = worldToCanvas({ x: bad.x, y: bad.y });
        var inV = sp.x > 10 && sp.x < W - 10 && sp.y > 10 && sp.y < H - 10;
        if (inV) {
          ctx.beginPath(); ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#ff6b6b'; ctx.fill();
          ctx.fillStyle = '#ff6b6b'; ctx.font = '11px sans-serif';
          ctx.fillText('被推到这 (' + errKm.toFixed(0) + ' km)', sp.x + 10, sp.y + 4);
        } else {
          var dx = sp.x - W / 2, dy = sp.y - H / 2;
          var len = Math.hypot(dx, dy) || 1;
          var ex = W / 2 + (dx / len) * (Math.min(W, H) / 2 - 14);
          var ey = H / 2 + (dy / len) * (Math.min(W, H) / 2 - 14);
          ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.lineTo(ex, ey);
          ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 2; ctx.stroke();
          ctx.beginPath(); ctx.arc(ex, ey, 6, 0, Math.PI * 2); ctx.fillStyle = '#ff6b6b'; ctx.fill();
          ctx.fillStyle = '#ff6b6b'; ctx.font = '11px sans-serif';
          ctx.fillText('偏了 ' + errKm.toFixed(0) + ' km ↑', ex, ey - 12);
        }
      }
    }

    updateSolveUI(solved, errKm);
  }

  function updateSolveUI(solved, errKm) {
    var step = solveState.step;
    var biasUs = solveState.userBiasUs;
    var biasKm = (solveState.userBiasUs * 1e-6 * window.GPS_ENGINE.SPEED_OF_LIGHT) / 1000;
    var errEl = $('solveError'), joinEl = $('solveJoin'), biasEl = $('solveBias'), noteEl = $('solveNote');
    var noteText, warn = false;

    if (step === 1) {
      errEl.textContent = '✓ 找到你了';
      joinEl.textContent = '交于一点';
      biasEl.textContent = '0（假设表很准）';
      noteText = '位置就是这么「解」出来的：它压根不需要解方程——三颗卫星各给一个距离，三个圆在图上自己交出那个点。你要的信息，全在卫星广播的时间和信号路上花掉的时间里。';
    } else if (step === 2) {
      errEl.textContent = '✗ 卡在缝隙里';
      joinEl.textContent = '没有公共交点';
      biasEl.textContent = '你拨的 ' + biasUs + ' µs';
      noteText = '三个红圆各自多出了同一段（' + biasKm.toFixed(0) + ' km），谁也不肯和别人交在一点。灰虚线是本该有的圆。你的位置信息没有被算错——是数据本身带着同一个错误，交点从图上消失了。';
      warn = true;
    } else if (!solveState.assumeKnown) {
      var solvedUs = solved ? solved.clockBiasSeconds * 1e6 : biasUs;
      errEl.textContent = '✓ 找回你的位置';
      joinEl.textContent = '缩小 ' + (solvedUs * 1e-6 * window.GPS_ENGINE.SPEED_OF_LIGHT / 1000).toFixed(0) + ' km 后交于一点';
      biasEl.textContent = '≈ ' + solvedUs.toFixed(0) + ' µs（算出来的）';
      noteText = '算法做的事：让三个圆一起缩小同样的长度，直到重新交于一点。刚才缩掉的那段 ≈' + (solvedUs * 1e-6 * window.GPS_ENGINE.SPEED_OF_LIGHT / 1000).toFixed(0) + ' km，除以光速 ≈ ' + solvedUs.toFixed(0) + ' µs——这就是你的表慢了多少。没拨表、没对时，纯靠「三个圆必须交于一点」这一个条件，钟差自己冒了出来。这就是「GPS 主业是授时」：定位的过程顺手把时间也修好了。';
    } else {
      errEl.textContent = '✗ 偏了 ' + errKm.toFixed(0) + ' km';
      joinEl.textContent = '拒绝缩小，没有交点';
      biasEl.textContent = '被假装成 0';
      noteText = '你打开了「假装我的表很准」：圆一步都不许缩。三个圆永远交不上，算法只能硬把位置推到 ' + errKm.toFixed(0) + ' 公里外去凑答案。错误不会消失，只会被摊进位置里——这就是漏掉「钟差」这个未知数的代价。';
      warn = true;
    }
    noteEl.textContent = noteText;
    noteEl.className = 'solve-note' + (warn ? ' warn' : '');
    $('solveSats').textContent = '4（3 颗就够，多 1 颗防错）';
  }

  function setStep(n) {
    solveState.step = n;
    document.querySelectorAll('.step-tab').forEach(function (t) {
      t.classList.toggle('active', Number(t.dataset.step) === n);
    });
    $('stepGuide').innerHTML = GUIDE[n];
    $('step2Controls').style.display = n === 2 ? '' : 'none';
    $('step3Toggle').style.display = n === 3 ? '' : 'none';
    $('nextStepBtn').textContent = NEXT_BTN[n];
    nfTrack('solve_step', { step: n });
    if (n === 3 && !solveState.assumeKnown) startShrinkAnim();
    else { stopShrinkAnim(); drawSolve(); }
  }

  function initSolve() {
    solveState.cv = $('solveCanvas');
    solveState.ctx = solveState.cv.getContext('2d');

    // 以布局逻辑尺寸为准，backing store 按 dpr 放大；用 setTransform 让后续绘制在逻辑像素坐标下进行。
    var rect = solveState.cv.getBoundingClientRect();
    var cssW = Math.max(320, rect.width || 560);
    var cssH = Math.max(280, rect.height || Math.round(cssW * 0.75));
    var dpr = window.devicePixelRatio || 1;
    solveState.cssW = cssW;
    solveState.cssH = cssH;
    solveState.dpr = dpr;
    solveState.cv.width = Math.round(cssW * dpr);
    solveState.cv.height = Math.round(cssH * dpr);
    solveState.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fitSolveView();

    // 步骤切换
    document.querySelectorAll('.step-tab').forEach(function (t) {
      t.addEventListener('click', function () { setStep(Number(t.dataset.step)); });
    });
    $('nextStepBtn').addEventListener('click', function () {
      setStep(solveState.step % 3 + 1);
    });

    // 步骤 2 滑块：把表拨慢
    $('biasSlider').addEventListener('input', function () {
      solveState.userBiasUs = Number(this.value);
      var km = solveState.userBiasUs * 1e-6 * window.GPS_ENGINE.SPEED_OF_LIGHT / 1000;
      $('biasVal').textContent = solveState.userBiasUs + ' µs';
      $('biasSub').textContent = solveState.userBiasUs === 0 ? '（表很准，圆能交上）' : '（每个距离虚胖 ' + km.toFixed(0) + ' km）';
      drawSolve();
    });

    // 步骤 3 开关：假装表准
    $('assumeClockKnown').addEventListener('change', function () {
      solveState.assumeKnown = this.checked;
      $('assumeLabel').textContent = this.checked ? '假装我的表很准' : '让圆一起缩小（GPS 的做法）';
      nfTrack('solve_run', { assumeClockKnown: this.checked ? 1 : 0 });
      if (!this.checked) startShrinkAnim();
      else { stopShrinkAnim(); drawSolve(); }
    });

    // 拖拽接收机
    function pos(evt) {
      var r = solveState.cv.getBoundingClientRect();
      return { x: evt.clientX - r.left, y: evt.clientY - r.top };
    }
    solveState.cv.addEventListener('pointerdown', function (e) {
      var p = pos(e);
      var tp = worldToCanvas(solveState.truePos);
      if (Math.hypot(p.x - tp.x, p.y - tp.y) < 20) {
        solveState.dragging = true;
        solveState.cv.setPointerCapture(e.pointerId);
        solveState.cv.classList.add('placed');
      }
    });
    solveState.cv.addEventListener('pointermove', function (e) {
      if (!solveState.dragging) return;
      var p = pos(e);
      solveState.truePos = canvasToWorld(p.x, p.y);
      if (solveState.step === 3) stopShrinkAnim(); // 拖动时跳到终态，松手再播动画
      drawSolve();
    });
    solveState.cv.addEventListener('pointerup', function () {
      if (solveState.dragging) {
        solveState.dragging = false;
        solveState.cv.classList.remove('placed');
        if (solveState.step === 3 && !solveState.assumeKnown) startShrinkAnim();
      }
    });

    setStep(1);
  }

  // ════════════════════════════════════════════════════════════════
  // 模块 B：1 纳秒 = 30 厘米（对数滑块 + 代价图）
  // ════════════════════════════════════════════════════════════════
  var errChart = null;
  function initErrSlider() {
    var slider = $('errSlider');
    function update() {
      var exp = parseFloat(slider.value);
      var dt = Math.pow(10, exp); // 秒
      var meters = window.GPS_ENGINE.clockErrorToRange(dt);
      var flavor = window.GPS_ENGINE.errorToRealWorld(dt);
      $('errVal').textContent = window.GPS_ENGINE.formatTime(dt);
      $('errRange').textContent = window.GPS_ENGINE.formatRange(meters);
      if (flavor) {
        $('errReal').textContent = flavor.label;
        $('errRealDetail').textContent = flavor.detail;
      }
      nfTrack('error_slider', { exp: exp });
    }
    slider.addEventListener('input', function () {
      update();
      drawErrChart(slider.value);
    });
    update();
  }

  function drawErrChart(currentExp) {
    if (typeof Chart === 'undefined') return;
    loadChartJS().then(function () {
      var labels = [], data = [];
      for (var e = -9; e <= 0; e += 0.5) {
        var dt = Math.pow(10, e);
        labels.push(window.GPS_ENGINE.formatTime(dt));
        data.push(Math.log10(window.GPS_ENGINE.clockErrorToRange(dt)));
      }
      if (errChart) errChart.destroy();
      errChart = new Chart($('errChart').getContext('2d'), {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: '位置误差 log10(米)',
            data: data,
            borderColor: '#ffd700', backgroundColor: 'rgba(255,215,0,0.1)',
            fill: true, tension: 0, pointRadius: 0, borderWidth: 2
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { title: { display: true, text: '时钟误差', color: '#888', font: { size: 12 } }, ticks: { color: '#888', maxTicksLimit: 8 } },
            y: { title: { display: true, text: 'log10(误差/米)', color: '#888', font: { size: 12 } }, ticks: { color: '#888' } }
          }
        }
      });
    });
  }

  // ════════════════════════════════════════════════════════════════
  // 模块 C：测量浏览器时钟精度（performance.now 量化台阶）
  // ════════════════════════════════════════════════════════════════
  function measureQuantizationLive() {
    var samples = [];
    var start = performance.now();
    var n = 200000;
    for (var i = 0; i < n; i++) {
      var t = performance.now();
      if (samples[samples.length - 1] !== t) samples.push(t);
      if (performance.now() - start > 120) break; // 最多采样 120ms，防止卡顿
    }
    var step = window.GPS_ENGINE.measureQuantization(samples) * 1000; // → µs
    var stepMs = step / 1000;
    var el = $('quantResult');
    nfTrack('measure_browser_clock', { stepUs: Math.round(step) });

    var html;
    if (step > 0) {
      var grade;
      if (step >= 1000) grade = '很钝：毫秒级';
      else if (step >= 100) grade = '钝：百微秒级';
      else if (step >= 1) grade = '微秒级——几乎没被削';
      else grade = '亚微秒，很锐';
      html = '<div class="result-box ok">你的浏览器把 <code>performance.now()</code> 的最小步进削到了<br>' +
        '<span class="big">' + stepMs.toFixed(stepMs < 1 ? 3 : 2) + ' ms</span>' +
        ' <span style="color:#90caf9;font-size:.85rem">（' + grade + '）</span>' +
        '<p style="margin-top:10px;font-size:.82rem;color:#aaa">这就是防 Spectre 侧信道攻击的代价：CPU 越怕你偷看时间，浏览器就越把时钟藏起来。</p></div>';
    } else {
      html = '<div class="result-box fail">在这台设备/浏览器上 <code>performance.now()</code> 的台阶测不出来（<span class="big">&lt; 1 µs</span>）。' +
        '<p style="margin-top:10px;font-size:.82rem;color:#aaa">「测不出来」本身也是结论：有些环境精度很高，反而证明了这套时钟的重要性。</p></div>';
    }
    el.innerHTML = html;
    $('quantNote').textContent = '提醒：模块四要测量「设备离真实时间多远」，靠的正是这类高精度时钟——被削钝的浏览器做不了，所以要请服务器帮忙。';
  }

  // ════════════════════════════════════════════════════════════════
  // 模块 D：测量设备时钟偏差（HTTP 近似 NTP，走 /time/sync）
  // ════════════════════════════════════════════════════════════════
  function measureDeviceOffset() {
    var btn = $('syncBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader"></i> 测量中…';
    $('syncResult').innerHTML = '<p style="color:#888;font-size:.9rem">连打 7 个样本，挑网络抖动最小的那次…</p>';
    $('syncLayers').innerHTML = '';

    var SAMPLES = 7;
    var timeOrigin = performance.timeOrigin || 0;
    function wallNow() {
      return timeOrigin + performance.now();
    }

    // 串行发 7 个样本；每个样本记录 t1/t4（客户端）与服务端返回的 t2/t3。
    var results = [];
    function sendSample(i) {
      if (i >= SAMPLES) { finish(); return; }
      var t1 = wallNow();
      fetch(API + '/time/sync')
        .then(function (r) {
          if (r.status === 429) throw { code: 429, msg: '限流，稍后再试' };
          return r.json();
        })
        .then(function (json) {
          if (!json || json.status !== 200 || !json.data) throw { code: -1, msg: '响应格式异常' };
          var t4 = wallNow();
          var d = json.data;
          results.push({ t1: t1, t2: d.recvEpochMillis, t3: d.sendEpochMillis, t4: t4, source: d.source, ntp: d.ntp, reason: d.unavailableReason });
          sendSample(i + 1);
        })
        .catch(function (err) {
          if (err && err.code === 429) { showToast('请求太快了，稍后再试'); btn.disabled = false; btn.innerHTML = '<i class="ti ti-clock-pin"></i> 测量我的设备时钟偏差'; return; }
          // 单样本失败可接受，继续打剩余样本
          sendSample(i + 1);
        });
    }

    function finish() {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-clock-pin"></i> 测量我的设备时钟偏差';
      $('retrySyncBtn').classList.remove('hidden');

      // 只看 source=ntp 的样本；都拿不到（unavailable）就诚实说搞不定
      var ntpSamples = results.filter(function (s) { return s.source === 'ntp' && s.ntp; });
      var firstNtp = results.find(function (s) { return s.source === 'ntp' && s.ntp; });

      var el = $('syncResult');

      if (ntpSamples.length === 0) {
        nfTrack('device_offset', { source: 'unavailable', samples: results.length });
        // 服务端在 unavailable 时会给具体原因，取第一个带 reason 的样本，不要笼统带过
        var failSample = results.find(function (s) { return s.reason; });
        var reason = (failSample && failSample.reason) || '拿不到上游时间';
        el.innerHTML = '<div class="result-box fail"><span class="big">搞不定</span> — ' + reason +
          '<p style="margin-top:8px;font-size:.82rem;color:#aaa">咱们不硬拗一个数字出来冒充结果。真实原因：浏览器发不了 UDP/123，只能走 HTTP 近似；如果服务器也暂时连不上上游 NTP，就测不了。</p></div>';
        return;
      }

      var filtered = window.GPS_ENGINE.clockFilter(ntpSamples);
      var offsetMs = filtered.offsetMillis;
      var uncertMs = filtered.uncertaintyMillis;

      nfTrack('device_offset', { source: 'ntp', offsetMs: Math.round(offsetMs * 100) / 100, delayMs: Math.round(filtered.delayMillis * 100) / 100 });

      // 符号语义：offset(θ)=((t2-t1)+(t3-t4))/2，θ>0 表示设备时钟偏慢（需往前调）。
      // 别把偏慢写成偏快——这是本 demo 的核心卖点，方向不能错。
      var direction;
      if (Math.abs(offsetMs) <= uncertMs) direction = '你的设备时钟与真实时间基本对得上（在测量误差内）';
      else if (offsetMs > 0) direction = '你的设备时钟<b>偏慢</b>了约 ' + Math.abs(offsetMs).toFixed(1) + ' ms';
      else direction = '你的设备时钟<b>偏快</b>了约 ' + Math.abs(offsetMs).toFixed(1) + ' ms';

      el.innerHTML = '<div class="result-box ok">你这台设备离真实时间，大约差<br>' +
        '<span class="big">' + Math.abs(offsetMs).toFixed(1) + ' ms</span>' +
        ' <span style="color:#90caf9;font-size:.85rem">± ' + Math.max(uncertMs, 0.1).toFixed(1) + ' ms（HTTP 近似测得）</span>' +
        '<p style="margin-top:10px;font-size:.9rem;color:#ccc">' + direction + '</p>' +
        '<p style="margin-top:6px;font-size:.72rem;color:#666">（此处 offset 按 NTP 语义：正 = 你的设备偏慢）</p>';

      // 诚实分层展示
      var layers = '';
      if (firstNtp && firstNtp.ntp) {
        var n = firstNtp.ntp;
        layers += '<p><span class="hl">服务端↔上游：这是真正的 NTP</span>（UDP/123）当前同步<br>' +
          '· 服务器地址 ' + (n.server || '-') + '，stratum ' + (n.stratum != null ? n.stratum : '-') + '<br>' +
          '· 上游 offset ' + (n.offsetMillis != null ? n.offsetMillis.toFixed(2) + ' ms' : '-') +
          '，delay ' + (n.delayMillis != null ? n.delayMillis.toFixed(1) + ' ms' : '-') + '</p>';
      }
      layers += '<p><span class="blue">浏览器→服务端：这只是 HTTP 近似（伪 NTP）</span><br>' +
        '浏览器发不了 UDP/123，所以这个「设备偏差」的极限精度被网络抖动压在 ±10~50 ms。真 NTP 走 UDP 能到亚毫秒——这就是为什么专业设备要装时钟卡而不是开个网页测。' +
        '我们为了诚实，也没把这个数字叫「真 NTP」。</p>';
      $('syncLayers').innerHTML = layers;
    }

    sendSample(0);
  }

  // ════════════════════════════════════════════════════════════════
  // 模块 E：闰秒 / 多出来的一秒（静态时间线 + 小动画）
  // ════════════════════════════════════════════════════════════════
  var leapState = { t: 59, playing: false, timer: null };
  function renderLeapClock() {
    var s = leapState.t;
    var clock = $('leapClock');
    clock.textContent = '23:59:' + (s < 10 ? '0' : '') + s;
    if (s >= 60) clock.classList.add('wrap');
    else clock.classList.remove('wrap');
  }
  function playLeap() {
    if (leapState.playing) return;
    leapState.playing = true;
    leapState.t = 59;
    var btn = $('leapPlay');
    btn.textContent = '播放中…';
    renderLeapClock();
    leapState.timer = setInterval(function () {
      leapState.t += 1;
      if (leapState.t >= 61) {  // 60 = 插进去的闰秒，61 后正常回 59
        clearInterval(leapState.timer);
        leapState.t = 59;
        leapState.playing = false;
        btn.innerHTML = '<i class="ti ti-player-play"></i> 再播一次';
      }
      renderLeapClock();
    }, 60);
  }

  // ════════════════════════════════════════════════════════════════
  // Hero 动画 + 导航
  // ════════════════════════════════════════════════════════════════
  function drawHero() {
    var cv = $('heroCanvas');
    var ctx = cv.getContext('2d');
    var W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    var now = Date.now();
    // 一颗脉冲星形象：简化成绕圈的卫星
    var sats = [
      { a: 0, r: 0.35 }, { a: Math.PI / 2, r: 0.42 }, { a: Math.PI, r: 0.3 }, { a: Math.PI * 3 / 2, r: 0.4 }
    ];
    var cx = W / 2, cy = H / 2;
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fillStyle = '#ffd700'; ctx.fill();
    ctx.fillStyle = '#90caf9';
    sats.forEach(function (s, i) {
      var ang = s.a + now / 1800;
      var px = cx + Math.cos(ang) * W * s.r;
      var py = cy + Math.sin(ang) * W * s.r;
      ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py);
      ctx.strokeStyle = 'rgba(144,202,249,0.3)'; ctx.stroke();
    });
  }

  function init() {
    trackSessionStart();
    initSolve();
    initErrSlider();
    drawErrChart('-3');

    $('heroBtn').addEventListener('click', function () { $('solveSection').scrollIntoView({ behavior: 'smooth' }); });
    $('topBtn').addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    $('measureBtn').addEventListener('click', measureQuantizationLive);
    $('syncBtn').addEventListener('click', measureDeviceOffset);
    $('retrySyncBtn').addEventListener('click', measureDeviceOffset);
    $('leapPlay').addEventListener('click', playLeap);
    $('copyResult').addEventListener('click', function () {
      var txt = $('syncResult').textContent.trim();
      if (!txt || txt.indexOf('搞不定') >= 0 || txt.indexOf('点「测量」') >= 0) {
        showToast('先把设备偏差测出来再复制');
        return;
      }
      var full = '我用「GPS 的真正产品是时间」这个 demo 测的：「' + txt + '」(\n' + $('syncLayers').textContent.trim().replace(/\s+/g, ' ') + ')';
      navigator.clipboard && navigator.clipboard.writeText(full)
        .then(function () { showToast('已复制'); })
        .catch(function () { showToast('复制失败，请手动选择'); });
    });

    drawHero();
    setInterval(drawHero, 150);

    window.addEventListener('pagehide', trackSessionEnd);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
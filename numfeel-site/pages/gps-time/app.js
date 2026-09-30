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
  // 模块 A：四颗星，四个未知数（2D 定位解算 + 可拖拽接收机）
  // ════════════════════════════════════════════════════════════════
  var solveState = {
    cv: null, ctx: null,
    cssW: 560, cssH: 420,   // 画布的逻辑(物理像素)尺寸，世界坐标映射用
    dpr: 1,
    scale: 0.006,           // px 每米，自动适配内容
    sats: [   // 卫星平面坐标（米），围绕画布中心分布
      { x: 15000, y: 2000 },
      { x: -13000, y: 6000 },
      { x: 4000, y: -16000 },
      { x: -9000, y: -11000 }
    ],
    truePos: { x: 200, y: -150 },   // 真实接收机位置
    clockBias: 1e-4,                // 100µs = 29.98 km
    dragging: false
  };

  // 世界坐标(米) ↔ 画布坐标(px) 的缩放；全部用 cssW/cssH（逻辑像素），与事件坐标一致。
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

  // 按当前内容(卫星 + 接收机)自适应缩放，保证全部可见。
  function fitSolveView() {
    var maxX = 1, maxY = 1;
    var pts = solveState.sats.concat([solveState.truePos]);
    pts.forEach(function (p) {
      maxX = Math.max(maxX, Math.abs(p.x));
      maxY = Math.max(maxY, Math.abs(p.y));
    });
    var sx = (solveState.cssW / 2 - 30) / maxX;
    var sy = (solveState.cssH / 2 - 30) / maxY;
    solveState.scale = Math.max(1e-9, Math.min(sx, sy));
  }

  function solvePseudoranges(useBias) {
    return solveState.sats.map(function (s) {
      return window.GPS_ENGINE.pseudorange(window.GPS_ENGINE.dist2d(solveState.truePos, s),
        useBias ? solveState.clockBias : 0);
    });
  }

  function drawSolve() {
    var cv = solveState.cv, ctx = solveState.ctx;
    var W = solveState.cssW, H = solveState.cssH;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, W, H);

    // 网格
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (var g = 0; g <= W; g += 40) { ctx.beginPath(); ctx.moveTo(g, 0); ctx.lineTo(g, H); ctx.stroke(); }
    for (var g2 = 0; g2 <= H; g2 += 40) { ctx.beginPath(); ctx.moveTo(0, g2); ctx.lineTo(W, g2); ctx.stroke(); }

    var assumeKnown = $('assumeClockKnown').checked;
    var prs = solvePseudoranges(true);

    // 卫星
    solveState.sats.forEach(function (s) {
      var p = worldToCanvas(s);
      ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#90caf9'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      // 卫星到接收机的伪距连线
      var tp = worldToCanvas(solveState.truePos);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tp.x, tp.y);
      ctx.strokeStyle = 'rgba(144,202,249,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    });

    // 真实接收机（金色）
    var tp2 = worldToCanvas(solveState.truePos);
    ctx.beginPath(); ctx.arc(tp2.x, tp2.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd700'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif';
    ctx.fillText('你的接收机', tp2.x + 12, tp2.y - 12);

    // 解算结果
    var solve = window.GPS_ENGINE.solvePosition(solveState.sats, prs, { assumeClockKnown: assumeKnown });
    var errText, noteText, noteCls;

    if (!solve) {
      errText = '无解';
      noteText = '卫星太少或几何退化，解不出来。';
      noteCls = 'warn';
      $('solveBias').textContent = '—';
      $('solveResidual').textContent = '—';
    } else {
      var errM = Math.hypot(solve.x - solveState.truePos.x, solve.y - solveState.truePos.y);
      var biasUs = solve.clockBiasSeconds * 1e6;

      if (assumeKnown) {
        noteText = '你把「钟差」当已知、直接摁掉了这个未知数。可真实伪距里其实藏着 ' +
          (solveState.clockBias * 1e6).toFixed(0) + ' µs 的钟差，被系统强行摊进了位置——' +
          '这就偏了 ' + (errM / 1000).toFixed(1) + ' 公里。';
        noteCls = 'warn';
        // 画一个偏离的标记（超出画布时画在边缘箭头）
        var sp = worldToCanvas({ x: solve.x, y: solve.y });
        var inV = sp.x > 10 && sp.x < W - 10 && sp.y > 10 && sp.y < H - 10;
        if (inV) {
          ctx.beginPath(); ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#ff6b6b'; ctx.fill();
          ctx.fillStyle = '#ff6b6b'; ctx.font = '11px sans-serif';
          ctx.fillText('错误解(' + (errM / 1000).toFixed(0) + 'km)', sp.x + 10, sp.y + 4);
        } else {
          // 画向偏离方向的箭头
          var dx = sp.x - W / 2, dy = sp.y - H / 2;
          var len = Math.hypot(dx, dy) || 1;
          var ex = W / 2 + (dx / len) * (Math.min(W, H) / 2 - 14);
          var ey = H / 2 + (dy / len) * (Math.min(W, H) / 2 - 14);
          ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.lineTo(ex, ey);
          ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 2; ctx.stroke();
          ctx.beginPath(); ctx.arc(ex, ey, 6, 0, Math.PI * 2); ctx.fillStyle = '#ff6b6b'; ctx.fill();
          ctx.fillStyle = '#ff6b6b'; ctx.font = '11px sans-serif';
          ctx.fillText('偏了 ' + (errM / 1000).toFixed(0) + ' km ↑', ex, ey - 12);
        }
        errText = (errM / 1000).toFixed(1) + ' km ×';
      } else {
        noteText = '你把「钟差 b」也当成未知数一起解——4 颗卫星、2 个位置 + 1 个钟差 = 3 个未知数。' +
          '位置收敛回几米，还顺手解出了接收机时钟比真时间慢 ' + biasUs.toFixed(1) + ' µs。' +
          '「GPS 主业是授时」：定位只负责兑换时间误差。';
        noteCls = '';
        errText = errM < 1 ? '≈ 0 m' : errM.toFixed(0) + ' m';
      }
      $('solveBias').textContent = assumeKnown ? '已忽略' :
        (solve.clockBiasSeconds === 0 ? '0 µs' : solve.clockBiasSeconds * 1e6).toString() + ' µs';
      $('solveResidual').textContent = (solve.residual / 1000).toFixed(2) + ' km';
    }

    $('solveError').textContent = errText;
    $('solveNote').textContent = noteText;
    $('solveNote').className = 'solve-note' + (noteCls === 'warn' ? ' warn' : '');
    $('solveSats').textContent = solveState.sats.length;
    $('assumeLabel').textContent = assumeKnown ? '把时钟偏差当已知（漏掉未知数）' : '把时钟偏差当未知数（正确）';
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

    $('assumeClockKnown').addEventListener('change', function () {
      var assume = $('assumeClockKnown').checked;
      nfTrack('solve_run', { assumeClockKnown: assume ? 1 : 0 });
      drawSolve();
    });

    // 拖拽接收机
    var dragging = false;
    function pos(evt) {
      var r = solveState.cv.getBoundingClientRect();
      return { x: evt.clientX - r.left, y: evt.clientY - r.top };
    }
    solveState.cv.addEventListener('pointerdown', function (e) {
      var p = pos(e);
      var tp = worldToCanvas(solveState.truePos);
      if (Math.hypot(p.x - tp.x, p.y - tp.y) < 16) {
        dragging = true;
        solveState.cv.setPointerCapture(e.pointerId);
        solveState.cv.classList.add('placed');
      }
    });
    solveState.cv.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var p = pos(e);
      solveState.truePos = canvasToWorld(p.x, p.y);
      drawSolve();
    });
    solveState.cv.addEventListener('pointerup', function () {
      if (dragging) {
        dragging = false;
        solveState.cv.classList.remove('placed');
        nfTrack('solve_run', { assumeClockKnown: $('assumeClockKnown').checked ? 1 : 0 });
      }
    });

    drawSolve();
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
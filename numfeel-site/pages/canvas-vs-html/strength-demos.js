/**
 * Canvas 主场 - 五个交互式迷你 Demo
 * 1. 粒子系统 (点击/移动释放粒子)
 * 2. 数据可视化 (动态散点图)
 * 3. 游戏 (弹球)
 * 4. 图像处理 (像素操作)
 * 5. 绘图白板 (自由涂鸦)
 */
(function () {
  'use strict';

  var canvas = document.getElementById('strengthDemoCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var instructions = document.getElementById('demoInstructions');
  var tabs = document.getElementById('demoTabs');

  var W = canvas.width;
  var H = canvas.height;
  var currentDemo = 'particles';
  var animId = null;
  var mouseX = W / 2, mouseY = H / 2;
  var mouseDown = false;

  // ── 通用工具 ───────────────────────────────────────────
  function clear() {
    ctx.fillStyle = 'rgba(10, 14, 28, 1)';
    ctx.fillRect(0, 0, W, H);
  }

  function stopAnim() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
  }

  function getMousePos(e) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = W / rect.width;
    var scaleY = H / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  // ── 1. 粒子系统 ───────────────────────────────────────
  var particles = [];

  function spawnParticles(x, y, count) {
    for (var i = 0; i < count; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 1 + Math.random() * 4;
      var hue = Math.random() * 60 + 20; // 金色~橙色
      particles.push({
        x: x, y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.008 + Math.random() * 0.015,
        size: 2 + Math.random() * 3,
        hue: hue
      });
    }
  }

  function tickParticles() {
    ctx.fillStyle = 'rgba(10, 14, 28, 0.15)';
    ctx.fillRect(0, 0, W, H);

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05; // 重力
      p.life -= p.decay;
      if (p.life <= 0) { particles.splice(i, 1); continue; }

      ctx.globalAlpha = p.life;
      ctx.fillStyle = 'hsl(' + p.hue + ', 100%, 60%)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 自动生成一些粒子保持画面活跃
    if (particles.length < 50) {
      spawnParticles(W / 2 + (Math.random() - 0.5) * 200, H / 2, 3);
    }

    animId = requestAnimationFrame(tickParticles);
  }

  function startParticles() {
    particles = [];
    spawnParticles(W / 2, H / 2, 80);
    tickParticles();
    instructions.innerHTML = '<i class="ti ti-mouse"></i> 点击或移动鼠标释放粒子 · 上千粒子同时运动，DOM 做不到这个帧率';
  }

  // ── 2. 数据可视化 ──────────────────────────────────────
  var chartPoints = [];

  function genChartData() {
    chartPoints = [];
    for (var i = 0; i < 2000; i++) {
      chartPoints.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 1.5 + Math.random() * 2.5,
        hue: Math.random() * 360,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5
      });
    }
  }

  function tickChart() {
    clear();

    // 网格
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (var gx = 0; gx < W; gx += 80) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (var gy = 0; gy < H; gy += 80) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }

    // 绘制 2000 个点
    for (var i = 0; i < chartPoints.length; i++) {
      var p = chartPoints[i];
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;

      ctx.fillStyle = 'hsla(' + p.hue + ', 80%, 60%, 0.7)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 实时 FPS
    ctx.fillStyle = '#ffd700';
    ctx.font = '13px system-ui';
    ctx.fillText('2000 个动态数据点 · 60fps', 12, 22);

    animId = requestAnimationFrame(tickChart);
  }

  function startChart() {
    genChartData();
    tickChart();
    instructions.innerHTML = '<i class="ti ti-chart-dots-3"></i> 2000 个数据点实时运动 · 用 DOM 创建 2000 个 div 试试？';
  }

  // ── 3. 游戏 (弹球) ─────────────────────────────────────
  var ball, paddle, bricks, gameScore;

  function initGame() {
    ball = { x: W / 2, y: H - 50, r: 6, vx: 3, vy: -3 };
    paddle = { x: W / 2 - 40, y: H - 25, w: 80, h: 10 };
    bricks = [];
    gameScore = 0;
    for (var row = 0; row < 4; row++) {
      for (var col = 0; col < 10; col++) {
        bricks.push({
          x: 20 + col * 76, y: 30 + row * 28,
          w: 70, h: 22, alive: true,
          hue: row * 30 + col * 10
        });
      }
    }
  }

  function tickGame() {
    clear();

    // 挡板跟随鼠标
    paddle.x = Math.max(0, Math.min(W - paddle.w, mouseX - paddle.w / 2));

    // 球运动
    ball.x += ball.vx;
    ball.y += ball.vy;

    // 边界反弹
    if (ball.x - ball.r < 0 || ball.x + ball.r > W) ball.vx *= -1;
    if (ball.y - ball.r < 0) ball.vy *= -1;

    // 掉落重置
    if (ball.y > H + 20) {
      ball.x = paddle.x + paddle.w / 2;
      ball.y = H - 50;
      ball.vy = -3;
    }

    // 挡板碰撞
    if (ball.y + ball.r >= paddle.y && ball.y + ball.r <= paddle.y + paddle.h + 4 &&
        ball.x >= paddle.x && ball.x <= paddle.x + paddle.w) {
      ball.vy = -Math.abs(ball.vy);
      ball.vx += (ball.x - (paddle.x + paddle.w / 2)) * 0.05;
    }

    // 砖块碰撞
    for (var i = 0; i < bricks.length; i++) {
      var b = bricks[i];
      if (!b.alive) continue;
      if (ball.x + ball.r > b.x && ball.x - ball.r < b.x + b.w &&
          ball.y + ball.r > b.y && ball.y - ball.r < b.y + b.h) {
        b.alive = false;
        ball.vy *= -1;
        gameScore++;
        break;
      }
    }

    // 绘制砖块
    for (var j = 0; j < bricks.length; j++) {
      var br = bricks[j];
      if (!br.alive) continue;
      ctx.fillStyle = 'hsl(' + br.hue + ', 70%, 55%)';
      ctx.fillRect(br.x, br.y, br.w, br.h);
    }

    // 绘制挡板
    ctx.fillStyle = '#90caf9';
    ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);

    // 绘制球
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();

    // 分数
    ctx.fillStyle = '#ffd700';
    ctx.font = '14px system-ui';
    ctx.fillText('Score: ' + gameScore, 12, 22);

    // 全消重置
    if (gameScore >= bricks.length) initGame();

    animId = requestAnimationFrame(tickGame);
  }

  function startGame() {
    initGame();
    tickGame();
    instructions.innerHTML = '<i class="ti ti-device-gamepad-2"></i> 移动鼠标控制挡板 · 弹球打砖块——逐帧渲染 + 碰撞检测，Canvas 的典型战场';
  }

  // ── 4. 图像处理 ────────────────────────────────────────
  function startImageProc() {
    stopAnim();
    clear();

    // 生成一个渐变图案，然后做像素操作演示
    var imgData = ctx.createImageData(W, H);
    var d = imgData.data;
    for (var i = 0; i < d.length; i += 4) {
      var px = (i / 4) % W;
      var py = Math.floor((i / 4) / W);
      d[i] = Math.floor((px / W) * 255);     // R
      d[i + 1] = Math.floor((py / H) * 255); // G
      d[i + 2] = 128;                         // B
      d[i + 3] = 255;                         // A
    }
    ctx.putImageData(imgData, 0, 0);

    // 叠加文字说明
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(W / 2 - 180, H / 2 - 40, 360, 80);
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('280,000 像素逐个写入 · putImageData', W / 2, H / 2 - 8);
    ctx.font = '13px system-ui';
    ctx.fillStyle = '#ccc';
    ctx.fillText('点击任意位置应用反色/灰度/模糊滤镜', W / 2, H / 2 + 20);
    ctx.textAlign = 'left';

    instructions.innerHTML = '<i class="ti ti-photo-edit"></i> 点击画布应用像素滤镜 · getImageData / putImageData 逐像素操作，CSS 做不到';
  }

  var filterIndex = 0;
  var filterNames = ['反色', '灰度', '高对比度'];

  function applyFilter() {
    var imgData = ctx.getImageData(0, 0, W, H);
    var d = imgData.data;
    var filter = filterIndex % 3;

    for (var i = 0; i < d.length; i += 4) {
      if (filter === 0) {
        // 反色
        d[i] = 255 - d[i];
        d[i + 1] = 255 - d[i + 1];
        d[i + 2] = 255 - d[i + 2];
      } else if (filter === 1) {
        // 灰度
        var avg = (d[i] + d[i + 1] + d[i + 2]) / 3;
        d[i] = d[i + 1] = d[i + 2] = avg;
      } else {
        // 高对比度
        d[i] = d[i] > 128 ? 255 : 0;
        d[i + 1] = d[i + 1] > 128 ? 255 : 0;
        d[i + 2] = d[i + 2] > 128 ? 255 : 0;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    filterIndex++;

    // 标注当前滤镜
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(10, 10, 180, 30);
    ctx.fillStyle = '#ffd700';
    ctx.font = '13px system-ui';
    ctx.fillText('已应用: ' + filterNames[filter], 20, 30);
  }

  // ── 5. 绘图白板 ────────────────────────────────────────
  var drawing = false;
  var lastDrawX = 0, lastDrawY = 0;
  var drawHue = 0;

  function startDrawing() {
    stopAnim();
    clear();

    // 画一些提示文字
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = 'bold 48px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('在这里涂鸦', W / 2, H / 2);
    ctx.textAlign = 'left';

    instructions.innerHTML = '<i class="ti ti-pencil"></i> 按住鼠标拖动涂鸦 · 自由曲线渲染，HTML 元素无法表达连续笔触';
  }

  function drawStroke(x1, y1, x2, y2) {
    ctx.strokeStyle = 'hsl(' + drawHue + ', 80%, 60%)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    drawHue = (drawHue + 1) % 360;
  }

  // ── 事件处理 ───────────────────────────────────────────
  canvas.addEventListener('mousemove', function (e) {
    var pos = getMousePos(e);
    mouseX = pos.x;
    mouseY = pos.y;

    if (currentDemo === 'particles') {
      spawnParticles(pos.x, pos.y, 5);
    }
    if (currentDemo === 'drawing' && mouseDown) {
      drawStroke(lastDrawX, lastDrawY, pos.x, pos.y);
      lastDrawX = pos.x;
      lastDrawY = pos.y;
    }
  });

  canvas.addEventListener('mousedown', function (e) {
    mouseDown = true;
    var pos = getMousePos(e);

    if (currentDemo === 'particles') {
      spawnParticles(pos.x, pos.y, 40);
    }
    if (currentDemo === 'imageproc') {
      applyFilter();
    }
    if (currentDemo === 'drawing') {
      lastDrawX = pos.x;
      lastDrawY = pos.y;
    }
  });

  canvas.addEventListener('mouseup', function () {
    mouseDown = false;
  });

  canvas.addEventListener('mouseleave', function () {
    mouseDown = false;
  });

  // Touch 支持
  canvas.addEventListener('touchstart', function (e) {
    e.preventDefault();
    var touch = e.touches[0];
    var pos = getMousePos(touch);
    mouseDown = true;
    mouseX = pos.x;
    mouseY = pos.y;

    if (currentDemo === 'particles') spawnParticles(pos.x, pos.y, 40);
    if (currentDemo === 'imageproc') applyFilter();
    if (currentDemo === 'drawing') { lastDrawX = pos.x; lastDrawY = pos.y; }
  }, { passive: false });

  canvas.addEventListener('touchmove', function (e) {
    e.preventDefault();
    var touch = e.touches[0];
    var pos = getMousePos(touch);
    mouseX = pos.x;
    mouseY = pos.y;

    if (currentDemo === 'particles') spawnParticles(pos.x, pos.y, 5);
    if (currentDemo === 'drawing' && mouseDown) {
      drawStroke(lastDrawX, lastDrawY, pos.x, pos.y);
      lastDrawX = pos.x;
      lastDrawY = pos.y;
    }
  }, { passive: false });

  canvas.addEventListener('touchend', function () { mouseDown = false; });

  // ── Tab 切换 ───────────────────────────────────────────
  function switchDemo(name) {
    stopAnim();
    currentDemo = name;
    particles = [];
    filterIndex = 0;

    tabs.querySelectorAll('.demo-tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.demo === name);
    });

    switch (name) {
      case 'particles': startParticles(); break;
      case 'chart': startChart(); break;
      case 'game': startGame(); break;
      case 'imageproc': startImageProc(); break;
      case 'drawing': startDrawing(); break;
    }
  }

  tabs.addEventListener('click', function (e) {
    var tab = e.target.closest('.demo-tab');
    if (tab && tab.dataset.demo) {
      switchDemo(tab.dataset.demo);
    }
  });

  // 初始化
  switchDemo('particles');

})();

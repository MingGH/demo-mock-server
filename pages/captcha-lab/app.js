"use strict";

/* ============================================================
   CAPTCHA 攻防实验室 — 8 关验证码挑战
   纯前端实现，Canvas 生成所有验证码
   ============================================================ */

// ── 关卡定义 ──────────────────────────────────────────────
const LEVELS = [
  { id: 'text',     name: '扭曲文字',       year: '2000', diff: 1, desc: '识别扭曲变形的字母数字' },
  { id: 'math',     name: '数学运算',       year: '2005', diff: 1, desc: '算出简单的数学题' },
  { id: 'slider',   name: '滑块拼图',       year: '2012', diff: 2, desc: '拖动滑块对齐缺口' },
  { id: 'grid',     name: '九宫格图片选择', year: '2014', diff: 2, desc: '选出包含目标物体的图片' },
  { id: 'click',    name: '文字点选',       year: '2017', diff: 3, desc: '按顺序点击指定文字' },
  { id: 'rotate',   name: '旋转对齐',       year: '2019', diff: 2, desc: '旋转图片到正确角度' },
  { id: 'spatial',  name: '空间推理',       year: '2021', diff: 3, desc: '判断哪个物体离你最近' },
  { id: 'behavior', name: '行为验证',       year: '2023', diff: 3, desc: '你的鼠标轨迹像人类吗？' },
];

// ── 全局状态 ──────────────────────────────────────────────
let currentLevel = 0;
let results = [];       // { levelId, passed, timeMs }
let levelStartTime = 0;

// ── 入口 ──────────────────────────────────────────────────
function showIntro() {
  document.getElementById('introSection').style.display = '';
  document.getElementById('gameSection').style.display = 'none';
  document.getElementById('resultSection').style.display = 'none';
}

function startGame() {
  currentLevel = 0;
  results = [];
  document.getElementById('introSection').style.display = 'none';
  document.getElementById('gameSection').style.display = '';
  document.getElementById('resultSection').style.display = 'none';
  loadLevel();
}

function loadLevel() {
  const lv = LEVELS[currentLevel];
  const total = LEVELS.length;
  document.getElementById('levelNum').textContent = currentLevel + 1;
  document.getElementById('totalLevels').textContent = total;
  document.getElementById('progressFill').style.width = ((currentLevel) / total * 100) + '%';

  const area = document.getElementById('gameArea');
  area.innerHTML = '';

  // banner
  const banner = document.createElement('div');
  banner.className = 'level-banner';
  banner.innerHTML =
    '<span class="era-tag">' + lv.year + ' 年代</span>' +
    '<h3>第 ' + (currentLevel + 1) + ' 关：' + lv.name + '</h3>' +
    '<div class="hint">' + lv.desc + '</div>';
  area.appendChild(banner);

  levelStartTime = Date.now();

  // dispatch
  switch (lv.id) {
    case 'text':     renderTextCaptcha(area); break;
    case 'math':     renderMathCaptcha(area); break;
    case 'slider':   renderSliderCaptcha(area); break;
    case 'grid':     renderGridCaptcha(area); break;
    case 'click':    renderClickCaptcha(area); break;
    case 'rotate':   renderRotateCaptcha(area); break;
    case 'spatial':  renderSpatialCaptcha(area); break;
    case 'behavior': renderBehaviorCaptcha(area); break;
  }
}

function completeLevel(passed) {
  var timeMs = Date.now() - levelStartTime;
  results.push({ levelId: LEVELS[currentLevel].id, passed: passed, timeMs: timeMs });

  // show feedback overlay (full-screen)
  var overlay = document.createElement('div');
  overlay.className = 'feedback-overlay ' + (passed ? 'success' : 'fail');
  overlay.innerHTML =
    '<div class="fb-card">' +
      '<div class="icon">' + (passed ? '<i class="ti ti-circle-check"></i>' : '<i class="ti ti-circle-x"></i>') + '</div>' +
      '<div class="msg">' + (passed ? '验证通过！' : '验证失败') + '</div>' +
      '<div class="time">用时 ' + (timeMs / 1000).toFixed(1) + ' 秒</div>' +
    '</div>';
  document.body.appendChild(overlay);

  setTimeout(function() {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    currentLevel++;
    if (currentLevel < LEVELS.length) {
      loadLevel();
    } else {
      showResults();
    }
  }, 1200);
}


// ══════════════════════════════════════════════════════════
// 第 1 关：扭曲文字 CAPTCHA
// ══════════════════════════════════════════════════════════
function renderTextCaptcha(area) {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var answer = '';
  for (var i = 0; i < 5; i++) answer += chars[Math.floor(Math.random() * chars.length)];

  var box = document.createElement('div');
  box.className = 'captcha-box';

  var canvas = document.createElement('canvas');
  canvas.width = 240; canvas.height = 80;
  var ctx = canvas.getContext('2d');

  // background noise
  ctx.fillStyle = '#2a2a4a';
  ctx.fillRect(0, 0, 240, 80);
  for (var i = 0; i < 120; i++) {
    ctx.fillStyle = 'rgba(' + rand(100,200) + ',' + rand(100,200) + ',' + rand(100,200) + ',0.3)';
    ctx.fillRect(rand(0,240), rand(0,80), 2, 2);
  }
  // lines
  for (var i = 0; i < 5; i++) {
    ctx.strokeStyle = 'rgba(' + rand(100,200) + ',' + rand(100,200) + ',' + rand(100,200) + ',0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rand(0,240), rand(0,80));
    ctx.lineTo(rand(0,240), rand(0,80));
    ctx.stroke();
  }
  // draw chars
  var colors = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#ff922b','#cc5de8'];
  for (var i = 0; i < answer.length; i++) {
    ctx.save();
    ctx.font = (rand(28,36)) + 'px "Courier New", monospace';
    ctx.fillStyle = colors[i % colors.length];
    ctx.translate(30 + i * 40, 50 + rand(-8,8));
    ctx.rotate((rand(-25,25)) * Math.PI / 180);
    ctx.fillText(answer[i], 0, 0);
    ctx.restore();
  }

  var input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 5;
  input.placeholder = '输入上方字符';
  input.autocomplete = 'off';

  var btn = document.createElement('button');
  btn.className = 'btn btn-primary btn-full';
  btn.innerHTML = '<i class="ti ti-check"></i> 提交';

  btn.onclick = function() {
    completeLevel(input.value.toUpperCase() === answer);
  };
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') btn.click();
  });

  box.appendChild(canvas);
  box.appendChild(input);
  box.appendChild(btn);
  area.appendChild(box);
  input.focus();
}

// ══════════════════════════════════════════════════════════
// 第 2 关：数学运算 CAPTCHA
// ══════════════════════════════════════════════════════════
function renderMathCaptcha(area) {
  var ops = ['+', '-', '×'];
  var op = ops[Math.floor(Math.random() * ops.length)];
  var a, b, answer;
  if (op === '+') { a = rand(10,50); b = rand(10,50); answer = a + b; }
  else if (op === '-') { a = rand(30,80); b = rand(10, a); answer = a - b; }
  else { a = rand(2,12); b = rand(2,12); answer = a * b; }

  var box = document.createElement('div');
  box.className = 'captcha-box';

  var display = document.createElement('div');
  display.className = 'math-display';
  display.textContent = a + ' ' + op + ' ' + b + ' = ?';

  var input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 4;
  input.placeholder = '输入答案';
  input.autocomplete = 'off';
  input.inputMode = 'numeric';

  var btn = document.createElement('button');
  btn.className = 'btn btn-primary btn-full';
  btn.innerHTML = '<i class="ti ti-check"></i> 提交';

  btn.onclick = function() {
    completeLevel(parseInt(input.value, 10) === answer);
  };
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') btn.click();
  });

  box.appendChild(display);
  box.appendChild(input);
  box.appendChild(btn);
  area.appendChild(box);
  input.focus();
}


// ══════════════════════════════════════════════════════════
// 第 3 关：滑块拼图
// ══════════════════════════════════════════════════════════
function renderSliderCaptcha(area) {
  var W = 320, H = 200, pieceSize = 44;
  var targetX = rand(100, W - pieceSize - 20);
  var targetY = rand(30, H - pieceSize - 30);
  var tolerance = 6;

  var box = document.createElement('div');
  box.className = 'captcha-box';

  // main canvas with pattern
  var wrap = document.createElement('div');
  wrap.className = 'slider-captcha-wrap';
  wrap.style.width = W + 'px';
  wrap.style.height = H + 'px';

  var bgCanvas = document.createElement('canvas');
  bgCanvas.width = W; bgCanvas.height = H;
  var bgCtx = bgCanvas.getContext('2d');
  drawPatternBg(bgCtx, W, H);

  // draw hole
  bgCtx.save();
  bgCtx.globalCompositeOperation = 'destination-out';
  bgCtx.fillStyle = 'rgba(0,0,0,1)';
  roundRect(bgCtx, targetX, targetY, pieceSize, pieceSize, 6);
  bgCtx.fill();
  bgCtx.restore();
  // hole border
  bgCtx.strokeStyle = 'rgba(255,255,255,0.5)';
  bgCtx.lineWidth = 2;
  roundRect(bgCtx, targetX, targetY, pieceSize, pieceSize, 6);
  bgCtx.stroke();

  // piece canvas (slides horizontally)
  var pieceCanvas = document.createElement('canvas');
  pieceCanvas.width = pieceSize + 4; pieceCanvas.height = H;
  pieceCanvas.style.position = 'absolute';
  pieceCanvas.style.top = '0';
  pieceCanvas.style.left = '0';
  var pCtx = pieceCanvas.getContext('2d');

  // draw piece from pattern
  var tempCanvas = document.createElement('canvas');
  tempCanvas.width = W; tempCanvas.height = H;
  var tCtx = tempCanvas.getContext('2d');
  drawPatternBg(tCtx, W, H);

  pCtx.save();
  roundRect(pCtx, 2, targetY, pieceSize, pieceSize, 6);
  pCtx.clip();
  pCtx.drawImage(tempCanvas, targetX, 0, pieceSize + 4, H, 0, 0, pieceSize + 4, H);
  pCtx.restore();
  pCtx.strokeStyle = 'rgba(255,215,0,0.8)';
  pCtx.lineWidth = 2;
  roundRect(pCtx, 2, targetY, pieceSize, pieceSize, 6);
  pCtx.stroke();

  wrap.appendChild(bgCanvas);
  wrap.appendChild(pieceCanvas);

  // slider track
  var track = document.createElement('div');
  track.className = 'slider-track';
  var thumb = document.createElement('div');
  thumb.className = 'slider-thumb';
  thumb.innerHTML = '<i class="ti ti-arrows-horizontal"></i>';
  track.appendChild(thumb);

  var dragging = false, startX = 0, thumbLeft = 0;

  function onStart(e) {
    dragging = true;
    startX = (e.touches ? e.touches[0].clientX : e.clientX) - thumbLeft;
    e.preventDefault();
  }
  function onMove(e) {
    if (!dragging) return;
    var cx = (e.touches ? e.touches[0].clientX : e.clientX);
    var newLeft = Math.max(0, Math.min(W - 44, cx - startX));
    thumbLeft = newLeft;
    thumb.style.left = newLeft + 'px';
    pieceCanvas.style.left = newLeft + 'px';
    e.preventDefault();
  }
  function onEnd() {
    if (!dragging) return;
    dragging = false;
    completeLevel(Math.abs(thumbLeft - targetX) <= tolerance);
  }

  thumb.addEventListener('mousedown', onStart);
  thumb.addEventListener('touchstart', onStart, { passive: false });
  document.addEventListener('mousemove', onMove);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('mouseup', onEnd);
  document.addEventListener('touchend', onEnd);

  box.appendChild(wrap);
  box.appendChild(track);
  area.appendChild(box);
}

function drawPatternBg(ctx, w, h) {
  // gradient background with geometric shapes
  var grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#2d3561');
  grad.addColorStop(0.5, '#1e3a5f');
  grad.addColorStop(1, '#0b2545');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  for (var i = 0; i < 15; i++) {
    ctx.fillStyle = 'rgba(' + rand(60,180) + ',' + rand(60,180) + ',' + rand(100,220) + ',0.15)';
    ctx.beginPath();
    ctx.arc(rand(0,w), rand(0,h), rand(10,40), 0, Math.PI * 2);
    ctx.fill();
  }
  for (var i = 0; i < 8; i++) {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = rand(1,3);
    ctx.beginPath();
    ctx.moveTo(rand(0,w), rand(0,h));
    ctx.lineTo(rand(0,w), rand(0,h));
    ctx.stroke();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}


// ══════════════════════════════════════════════════════════
// 第 4 关：九宫格图片选择
// ══════════════════════════════════════════════════════════
function renderGridCaptcha(area) {
  var categories = [
    { name: '红绿灯', draw: drawTrafficLight, color: '#ff6b6b' },
    { name: '汽车',   draw: drawCar,          color: '#4d96ff' },
    { name: '树木',   draw: drawTree,         color: '#6bcb77' },
    { name: '房屋',   draw: drawHouse,        color: '#ffd93d' },
  ];
  var target = categories[Math.floor(Math.random() * categories.length)];
  // decide which cells have target (3-4 cells)
  var targetCount = rand(3, 4);
  var indices = shuffle9();
  var targetCells = indices.slice(0, targetCount);
  var selected = {};

  var box = document.createElement('div');
  box.className = 'captcha-box';

  var prompt = document.createElement('div');
  prompt.style.cssText = 'color:#a0a0a0; font-size:0.92rem; margin-bottom:12px; text-align:center;';
  prompt.innerHTML = '请选出所有包含 <strong style="color:#ffd700">' + target.name + '</strong> 的图片';

  var grid = document.createElement('div');
  grid.className = 'grid-captcha';

  for (var i = 0; i < 9; i++) {
    var cell = document.createElement('div');
    cell.className = 'grid-cell';
    cell.dataset.idx = i;

    var c = document.createElement('canvas');
    c.width = 100; c.height = 100;
    var ctx = c.getContext('2d');

    // background
    ctx.fillStyle = 'rgba(' + rand(20,40) + ',' + rand(25,45) + ',' + rand(40,70) + ',1)';
    ctx.fillRect(0, 0, 100, 100);

    if (targetCells.indexOf(i) !== -1) {
      target.draw(ctx, 100, 100);
      // add some noise objects too
      var other = categories.filter(function(c) { return c !== target; });
      if (Math.random() > 0.5) other[0].draw(ctx, 100, 100, true);
    } else {
      var others = categories.filter(function(c) { return c !== target; });
      others[rand(0, others.length - 1)].draw(ctx, 100, 100);
      if (Math.random() > 0.4) others[rand(0, others.length - 1)].draw(ctx, 100, 100, true);
    }

    cell.appendChild(c);
    (function(idx, el) {
      el.onclick = function() {
        if (selected[idx]) { delete selected[idx]; el.classList.remove('selected'); }
        else { selected[idx] = true; el.classList.add('selected'); }
      };
    })(i, cell);
    grid.appendChild(cell);
  }

  var btn = document.createElement('button');
  btn.className = 'btn btn-primary btn-full';
  btn.innerHTML = '<i class="ti ti-check"></i> 验证';
  btn.style.marginTop = '12px';
  btn.onclick = function() {
    var sel = Object.keys(selected).map(Number).sort().join(',');
    var ans = targetCells.slice().sort().join(',');
    completeLevel(sel === ans);
  };

  box.appendChild(prompt);
  box.appendChild(grid);
  box.appendChild(btn);
  area.appendChild(box);
}

function drawTrafficLight(ctx, w, h, small) {
  var s = small ? 0.5 : 1;
  var x = small ? rand(10, w - 30) : w / 2 - 10;
  var y = small ? rand(10, h - 50) : h / 2 - 25;
  ctx.fillStyle = '#333';
  ctx.fillRect(x, y, 20 * s, 50 * s);
  var colors = ['#ff4444', '#ffd700', '#4CAF50'];
  for (var i = 0; i < 3; i++) {
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.arc(x + 10 * s, y + 8 * s + i * 16 * s, 5 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCar(ctx, w, h, small) {
  var s = small ? 0.5 : 1;
  var x = small ? rand(5, w - 50) : w / 2 - 25;
  var y = small ? rand(30, h - 30) : h / 2;
  ctx.fillStyle = '#4d96ff';
  ctx.fillRect(x, y, 50 * s, 18 * s);
  ctx.fillStyle = '#3a7bd5';
  ctx.fillRect(x + 10 * s, y - 12 * s, 30 * s, 14 * s);
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(x + 12 * s, y + 18 * s, 6 * s, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 38 * s, y + 18 * s, 6 * s, 0, Math.PI * 2); ctx.fill();
}

function drawTree(ctx, w, h, small) {
  var s = small ? 0.5 : 1;
  var x = small ? rand(15, w - 20) : w / 2;
  var y = small ? rand(40, h - 10) : h / 2 + 20;
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(x - 4 * s, y - 20 * s, 8 * s, 22 * s);
  ctx.fillStyle = '#2d8a4e';
  ctx.beginPath();
  ctx.moveTo(x, y - 50 * s);
  ctx.lineTo(x - 18 * s, y - 18 * s);
  ctx.lineTo(x + 18 * s, y - 18 * s);
  ctx.closePath();
  ctx.fill();
}

function drawHouse(ctx, w, h, small) {
  var s = small ? 0.5 : 1;
  var x = small ? rand(10, w - 40) : w / 2 - 20;
  var y = small ? rand(30, h - 40) : h / 2 - 10;
  ctx.fillStyle = '#c0392b';
  ctx.fillRect(x, y, 40 * s, 30 * s);
  // roof
  ctx.fillStyle = '#7f1d1d';
  ctx.beginPath();
  ctx.moveTo(x - 5 * s, y);
  ctx.lineTo(x + 20 * s, y - 20 * s);
  ctx.lineTo(x + 45 * s, y);
  ctx.closePath();
  ctx.fill();
  // door
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(x + 15 * s, y + 12 * s, 10 * s, 18 * s);
  // window
  ctx.fillStyle = '#ffd700';
  ctx.fillRect(x + 5 * s, y + 6 * s, 8 * s, 8 * s);
}

function shuffle9() {
  var a = [0,1,2,3,4,5,6,7,8];
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}


// ══════════════════════════════════════════════════════════
// 第 5 关：文字点选
// ══════════════════════════════════════════════════════════
function renderClickCaptcha(area) {
  var pool = '鱼马树花鸟山水月星云风雨雪石竹梅兰菊松柳桃杏梨枫荷莲';
  var chars = [];
  while (chars.length < 3) {
    var c = pool[Math.floor(Math.random() * pool.length)];
    if (chars.indexOf(c) === -1) chars.push(c);
  }
  // place 8 total chars on canvas, 3 are targets
  var allChars = chars.slice();
  while (allChars.length < 8) {
    var c = pool[Math.floor(Math.random() * pool.length)];
    if (allChars.indexOf(c) === -1) allChars.push(c);
  }
  // shuffle positions
  var positions = [];
  for (var i = 0; i < allChars.length; i++) {
    var tries = 0, px, py;
    do {
      px = rand(30, 280); py = rand(30, 170);
      tries++;
    } while (tries < 50 && positions.some(function(p) {
      return Math.abs(p.x - px) < 36 && Math.abs(p.y - py) < 36;
    }));
    positions.push({ x: px, y: py, ch: allChars[i] });
  }

  var box = document.createElement('div');
  box.className = 'captcha-box';

  var prompt = document.createElement('div');
  prompt.style.cssText = 'color:#a0a0a0; font-size:0.92rem; margin-bottom:12px; text-align:center;';
  prompt.innerHTML = '按顺序点击：<strong style="color:#ffd700">' + chars.join(' → ') + '</strong>';

  var wrap = document.createElement('div');
  wrap.className = 'click-captcha-wrap';

  var canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 200;
  var ctx = canvas.getContext('2d');

  // bg
  drawPatternBg(ctx, 320, 200);

  // draw chars
  var colors = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#ff922b','#cc5de8','#20c997','#f06595'];
  for (var i = 0; i < positions.length; i++) {
    var p = positions[i];
    ctx.save();
    ctx.font = 'bold ' + rand(22, 28) + 'px sans-serif';
    ctx.fillStyle = colors[i % colors.length];
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.translate(p.x, p.y);
    ctx.rotate((rand(-20, 20)) * Math.PI / 180);
    ctx.fillText(p.ch, 0, 0);
    ctx.restore();
  }

  wrap.appendChild(canvas);

  var clickOrder = [];
  var markerCount = 0;

  wrap.onclick = function(e) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = 320 / rect.width;
    var scaleY = 200 / rect.height;
    var mx = (e.clientX - rect.left) * scaleX;
    var my = (e.clientY - rect.top) * scaleY;

    // find closest char
    var closest = null, minDist = 30;
    for (var i = 0; i < positions.length; i++) {
      var dx = positions[i].x - mx, dy = positions[i].y - my;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) { minDist = dist; closest = positions[i]; }
    }
    if (!closest) return;
    if (clickOrder.indexOf(closest.ch) !== -1) return;

    clickOrder.push(closest.ch);
    markerCount++;

    var marker = document.createElement('div');
    marker.className = 'click-marker';
    marker.textContent = markerCount;
    marker.style.left = (closest.x / 320 * 100) + '%';
    marker.style.top = (closest.y / 200 * 100) + '%';
    wrap.appendChild(marker);

    if (clickOrder.length === chars.length) {
      var passed = clickOrder.join('') === chars.join('');
      setTimeout(function() { completeLevel(passed); }, 300);
    }
  };

  box.appendChild(prompt);
  box.appendChild(wrap);
  area.appendChild(box);
}

// ══════════════════════════════════════════════════════════
// 第 6 关：旋转对齐
// ══════════════════════════════════════════════════════════
function renderRotateCaptcha(area) {
  var targetAngle = rand(30, 330);
  var currentAngle = 0;
  var tolerance = 10;

  var box = document.createElement('div');
  box.className = 'captcha-box';

  var wrap = document.createElement('div');
  wrap.className = 'rotate-captcha-wrap';

  var imgBox = document.createElement('div');
  imgBox.className = 'rotate-image-box';

  var canvas = document.createElement('canvas');
  canvas.width = 200; canvas.height = 200;
  var ctx = canvas.getContext('2d');

  function drawRotated(angle) {
    ctx.clearRect(0, 0, 200, 200);
    ctx.save();
    ctx.translate(100, 100);
    ctx.rotate(angle * Math.PI / 180);
    ctx.translate(-100, -100);

    // draw a recognizable scene (house with chimney)
    var grad = ctx.createLinearGradient(0, 0, 200, 200);
    grad.addColorStop(0, '#1a3a5c');
    grad.addColorStop(1, '#0d2137');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 200, 200);

    // ground
    ctx.fillStyle = '#2d5a27';
    ctx.fillRect(0, 140, 200, 60);

    // house
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(60, 80, 80, 60);
    // roof
    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath();
    ctx.moveTo(50, 80); ctx.lineTo(100, 40); ctx.lineTo(150, 80);
    ctx.closePath(); ctx.fill();
    // door
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(90, 110, 20, 30);
    // windows
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(68, 92, 14, 14);
    ctx.fillRect(118, 92, 14, 14);
    // chimney
    ctx.fillStyle = '#555';
    ctx.fillRect(120, 42, 12, 30);
    // sun
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(30, 30, 16, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  drawRotated(targetAngle);

  imgBox.appendChild(canvas);

  var slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'rotate-slider';
  slider.min = 0; slider.max = 360; slider.value = 0;

  var angleLabel = document.createElement('div');
  angleLabel.className = 'rotate-angle';
  angleLabel.textContent = '旋转角度：0°';

  slider.oninput = function() {
    currentAngle = parseInt(slider.value);
    angleLabel.textContent = '旋转角度：' + currentAngle + '°';
    drawRotated(targetAngle - currentAngle);
  };

  var btn = document.createElement('button');
  btn.className = 'btn btn-primary btn-full';
  btn.innerHTML = '<i class="ti ti-check"></i> 确认';
  btn.onclick = function() {
    var diff = Math.abs(currentAngle - targetAngle);
    if (diff > 180) diff = 360 - diff;
    completeLevel(diff <= tolerance);
  };

  wrap.appendChild(imgBox);
  wrap.appendChild(slider);
  wrap.appendChild(angleLabel);

  box.appendChild(wrap);
  box.appendChild(btn);
  area.appendChild(box);
}


// ══════════════════════════════════════════════════════════
// 第 7 关：空间推理
// ══════════════════════════════════════════════════════════
function renderSpatialCaptcha(area) {
  var objects = [
    { name: '红色球体', color: '#ff4444', z: 0 },
    { name: '蓝色方块', color: '#4d96ff', z: 0 },
    { name: '绿色圆柱', color: '#4CAF50', z: 0 },
    { name: '黄色三角', color: '#ffd700', z: 0 },
  ];
  // assign random z-depths (lower z = closer)
  var zValues = [1, 2, 3, 4];
  for (var i = zValues.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = zValues[i]; zValues[i] = zValues[j]; zValues[j] = t;
  }
  for (var i = 0; i < objects.length; i++) objects[i].z = zValues[i];

  var closest = objects.reduce(function(a, b) { return a.z < b.z ? a : b; });

  var box = document.createElement('div');
  box.className = 'captcha-box';

  var spatial = document.createElement('div');
  spatial.className = 'spatial-captcha';

  var prompt = document.createElement('div');
  prompt.style.cssText = 'color:#a0a0a0; font-size:0.92rem; text-align:center;';
  prompt.innerHTML = '哪个物体离你<strong style="color:#ffd700">最近</strong>？';

  var scene = document.createElement('div');
  scene.className = 'spatial-scene';
  var canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 220;
  var ctx = canvas.getContext('2d');

  // draw 3D-ish scene
  var grad = ctx.createLinearGradient(0, 0, 0, 220);
  grad.addColorStop(0, '#0a1628');
  grad.addColorStop(1, '#1a2a4a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 320, 220);

  // floor grid
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  for (var i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 120 + i * 12);
    ctx.lineTo(320, 120 + i * 12);
    ctx.stroke();
  }

  // sort by z (far first)
  var sorted = objects.slice().sort(function(a, b) { return b.z - a.z; });
  var xPositions = [60, 140, 210, 270];
  for (var k = xPositions.length - 1; k > 0; k--) {
    var j2 = Math.floor(Math.random() * (k + 1));
    var tmp = xPositions[k]; xPositions[k] = xPositions[j2]; xPositions[j2] = tmp;
  }

  for (var i = 0; i < sorted.length; i++) {
    var obj = sorted[i];
    var scale = 0.4 + (1 - obj.z / 5) * 0.6; // closer = bigger
    var yBase = 130 + (4 - obj.z) * 18;       // closer (z=1) → lower on screen (yBase=184), farther (z=4) → higher (yBase=130)
    var x = xPositions[objects.indexOf(obj)];

    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, yBase + 20 * scale, 22 * scale, 6 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = obj.color;
    if (obj.name.indexOf('球') !== -1) {
      ctx.beginPath();
      ctx.arc(x, yBase - 15 * scale, 20 * scale, 0, Math.PI * 2);
      ctx.fill();
      // highlight
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.arc(x - 6 * scale, yBase - 22 * scale, 6 * scale, 0, Math.PI * 2);
      ctx.fill();
    } else if (obj.name.indexOf('方') !== -1) {
      ctx.fillRect(x - 18 * scale, yBase - 36 * scale, 36 * scale, 36 * scale);
    } else if (obj.name.indexOf('圆柱') !== -1) {
      ctx.fillRect(x - 12 * scale, yBase - 36 * scale, 24 * scale, 36 * scale);
      ctx.beginPath();
      ctx.ellipse(x, yBase - 36 * scale, 12 * scale, 5 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = lighten(obj.color, 20);
      ctx.beginPath();
      ctx.ellipse(x, yBase - 36 * scale, 12 * scale, 5 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
    } else { // triangle
      ctx.beginPath();
      ctx.moveTo(x, yBase - 40 * scale);
      ctx.lineTo(x - 20 * scale, yBase);
      ctx.lineTo(x + 20 * scale, yBase);
      ctx.closePath();
      ctx.fill();
    }
  }

  scene.appendChild(canvas);

  var options = document.createElement('div');
  options.className = 'spatial-options';
  var selectedOpt = null;

  objects.forEach(function(obj) {
    var opt = document.createElement('div');
    opt.className = 'spatial-opt';
    opt.textContent = obj.name;
    opt.onclick = function() {
      options.querySelectorAll('.spatial-opt').forEach(function(o) { o.classList.remove('selected'); });
      opt.classList.add('selected');
      selectedOpt = obj;
    };
    options.appendChild(opt);
  });

  var btn = document.createElement('button');
  btn.className = 'btn btn-primary btn-full';
  btn.innerHTML = '<i class="ti ti-check"></i> 确认';
  btn.style.marginTop = '8px';
  btn.onclick = function() {
    if (!selectedOpt) return;
    completeLevel(selectedOpt === closest);
  };

  spatial.appendChild(prompt);
  spatial.appendChild(scene);
  spatial.appendChild(options);
  spatial.appendChild(btn);
  box.appendChild(spatial);
  area.appendChild(box);
}

function lighten(hex, pct) {
  var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  r = Math.min(255, r + pct); g = Math.min(255, g + pct); b = Math.min(255, b + pct);
  return '#' + [r,g,b].map(function(v) { return v.toString(16).padStart(2,'0'); }).join('');
}


// ══════════════════════════════════════════════════════════
// 第 8 关：行为验证（鼠标轨迹分析）
// ══════════════════════════════════════════════════════════
function renderBehaviorCaptcha(area) {
  var box = document.createElement('div');
  box.className = 'captcha-box';

  var prompt = document.createElement('div');
  prompt.style.cssText = 'color:#a0a0a0; font-size:0.92rem; margin-bottom:12px; text-align:center;';
  prompt.innerHTML = '在下方区域内<strong style="color:#ffd700">随意移动鼠标</strong>（或手指滑动），系统将分析你的行为模式';

  var behaviorArea = document.createElement('div');
  behaviorArea.className = 'behavior-area';
  var canvas = document.createElement('canvas');
  canvas.width = 400; canvas.height = 300;
  var ctx = canvas.getContext('2d');

  // dark bg
  ctx.fillStyle = 'rgba(10,15,30,1)';
  ctx.fillRect(0, 0, 400, 300);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('在此区域移动鼠标 / 滑动手指', 200, 150);

  behaviorArea.appendChild(canvas);

  var metrics = document.createElement('div');
  metrics.className = 'behavior-metrics';
  metrics.innerHTML =
    '<div class="behavior-metric"><div class="val" id="bm-points">0</div><div class="lbl">采集点数</div></div>' +
    '<div class="behavior-metric"><div class="val" id="bm-speed">0</div><div class="lbl">平均速度</div></div>' +
    '<div class="behavior-metric"><div class="val" id="bm-curve">0</div><div class="lbl">曲率变化</div></div>' +
    '<div class="behavior-metric"><div class="val" id="bm-score">—</div><div class="lbl">人类概率</div></div>';

  var points = [];
  var lastTime = 0;
  var speeds = [];
  var angles = [];

  function recordPoint(x, y) {
    var now = Date.now();
    var rect = canvas.getBoundingClientRect();
    var px = (x - rect.left) / rect.width * 400;
    var py = (y - rect.top) / rect.height * 300;

    if (points.length > 0) {
      var prev = points[points.length - 1];
      var dx = px - prev.x, dy = py - prev.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var dt = now - prev.t;
      if (dt > 0) speeds.push(dist / dt * 1000);
      if (points.length > 1) {
        var pp = points[points.length - 2];
        var a1 = Math.atan2(prev.y - pp.y, prev.x - pp.x);
        var a2 = Math.atan2(py - prev.y, px - prev.x);
        angles.push(Math.abs(a2 - a1));
      }

      // draw trail
      ctx.strokeStyle = 'rgba(255,215,0,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(px, py);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,215,0,0.8)';
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    points.push({ x: px, y: py, t: now });

    // update metrics
    document.getElementById('bm-points').textContent = points.length;
    if (speeds.length > 0) {
      var avgSpeed = speeds.reduce(function(a, b) { return a + b; }, 0) / speeds.length;
      document.getElementById('bm-speed').textContent = avgSpeed.toFixed(0) + ' px/s';
    }
    if (angles.length > 0) {
      var avgCurve = angles.reduce(function(a, b) { return a + b; }, 0) / angles.length;
      document.getElementById('bm-curve').textContent = (avgCurve * 180 / Math.PI).toFixed(1) + '°';
    }
  }

  behaviorArea.addEventListener('mousemove', function(e) { recordPoint(e.clientX, e.clientY); });
  behaviorArea.addEventListener('touchmove', function(e) {
    e.preventDefault();
    recordPoint(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });

  var btn = document.createElement('button');
  btn.className = 'btn btn-primary btn-full';
  btn.innerHTML = '<i class="ti ti-scan"></i> 分析行为';
  btn.style.marginTop = '12px';
  btn.onclick = function() {
    if (points.length < 15) {
      alert('请多移动一些鼠标，至少采集 15 个点');
      return;
    }
    // compute "human score"
    var score = computeHumanScore(points, speeds, angles);
    document.getElementById('bm-score').textContent = score + '%';
    document.getElementById('bm-score').style.color = score >= 60 ? '#4CAF50' : '#ff4444';
    setTimeout(function() { completeLevel(score >= 50); }, 800);
  };

  box.appendChild(prompt);
  box.appendChild(behaviorArea);
  box.appendChild(metrics);
  box.appendChild(btn);
  area.appendChild(box);
}

function computeHumanScore(points, speeds, angles) {
  // Heuristics:
  // 1. Speed variance (humans have variable speed, bots are constant)
  // 2. Angle variance (humans have curved paths, bots go straight)
  // 3. Point count (enough data)
  // 4. Speed not too uniform

  var score = 50; // base

  if (speeds.length > 5) {
    var avgSpeed = speeds.reduce(function(a,b){return a+b;},0) / speeds.length;
    var speedVar = speeds.reduce(function(a,b){return a + (b-avgSpeed)*(b-avgSpeed);},0) / speeds.length;
    var speedCV = Math.sqrt(speedVar) / (avgSpeed + 0.01);
    // humans typically have CV > 0.3
    if (speedCV > 0.3) score += 15;
    else if (speedCV > 0.15) score += 8;
    else score -= 10;
  }

  if (angles.length > 5) {
    var avgAngle = angles.reduce(function(a,b){return a+b;},0) / angles.length;
    // humans have varied angles
    if (avgAngle > 0.15 && avgAngle < 1.5) score += 15;
    else if (avgAngle > 0.05) score += 8;
    else score -= 5;

    var angleVar = angles.reduce(function(a,b){return a + (b-avgAngle)*(b-avgAngle);},0) / angles.length;
    if (angleVar > 0.05) score += 10;
  }

  if (points.length > 50) score += 5;
  if (points.length > 100) score += 5;

  return Math.max(0, Math.min(100, score));
}


// ══════════════════════════════════════════════════════════
// 结果页
// ══════════════════════════════════════════════════════════
function showResults() {
  document.getElementById('introSection').style.display = 'none';
  document.getElementById('gameSection').style.display = 'none';
  document.getElementById('resultSection').style.display = '';
  document.getElementById('progressFill').style.width = '100%';

  var passed = results.filter(function(r) { return r.passed; }).length;
  var totalTime = results.reduce(function(a, r) { return a + r.timeMs; }, 0);
  var avgTime = totalTime / results.length;
  var fastest = results.reduce(function(a, r) { return r.timeMs < a.timeMs ? r : a; });
  var slowest = results.reduce(function(a, r) { return r.timeMs > a.timeMs ? r : a; });

  // stats
  var statsHtml =
    '<div class="stat-card"><div class="val">' + passed + '/' + LEVELS.length + '</div><div class="lbl">通过关卡</div></div>' +
    '<div class="stat-card"><div class="val">' + (totalTime / 1000).toFixed(1) + 's</div><div class="lbl">总用时</div></div>' +
    '<div class="stat-card"><div class="val">' + (avgTime / 1000).toFixed(1) + 's</div><div class="lbl">平均用时</div></div>' +
    '<div class="stat-card"><div class="val">' + (fastest.timeMs / 1000).toFixed(1) + 's</div><div class="lbl">最快关卡</div></div>';
  document.getElementById('statsGrid').innerHTML = statsHtml;

  // level-by-level results
  var levelsHtml = '';
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    var lv = LEVELS[i];
    levelsHtml +=
      '<div class="result-level ' + (r.passed ? 'pass' : 'fail') + '">' +
        '<div class="rl-num">' + (i + 1) + '</div>' +
        '<div class="rl-info">' +
          '<div class="rl-name">' + lv.name + '</div>' +
          '<div class="rl-detail">' + lv.year + ' · ' + lv.desc + '</div>' +
        '</div>' +
        '<div class="rl-time">' + (r.passed ? '<i class="ti ti-check" style="color:#4CAF50"></i> ' : '<i class="ti ti-x" style="color:#ff4444"></i> ') + (r.timeMs / 1000).toFixed(1) + 's</div>' +
      '</div>';
  }
  document.getElementById('resultLevels').innerHTML = levelsHtml;

  // grade
  var grade, gradeColor, gradeDesc;
  if (passed === 8) { grade = 'S'; gradeColor = '#ffd700'; gradeDesc = '完美通关！你比 99% 的人类更像人类。'; }
  else if (passed >= 6) { grade = 'A'; gradeColor = '#4CAF50'; gradeDesc = '优秀！大部分验证码难不倒你。'; }
  else if (passed >= 4) { grade = 'B'; gradeColor = '#4d96ff'; gradeDesc = '还行，但有些验证码确实在为难人类。'; }
  else if (passed >= 2) { grade = 'C'; gradeColor = '#ff922b'; gradeDesc = '机器人嫌疑！你确定不是 bot？'; }
  else { grade = 'D'; gradeColor = '#ff4444'; gradeDesc = '验证码赢了。你可能需要证明自己是人类。'; }

  document.getElementById('gradeBox').innerHTML =
    '<div class="insight-box">' +
      '<h3><i class="ti ti-award"></i> 评级：<span style="color:' + gradeColor + '; font-size:1.4rem;">' + grade + '</span></h3>' +
      '<p>' + gradeDesc + '</p>' +
      '<p style="margin-top:8px; font-size:0.85rem; color:#888;">通过 ' + passed + ' / ' + LEVELS.length + ' 关 · 总用时 ' + (totalTime / 1000).toFixed(1) + ' 秒</p>' +
    '</div>';

  // insight
  var insightHtml = '<div class="insight-box">' +
    '<h3><i class="ti ti-bulb"></i> 你知道吗</h3>' +
    '<p>验证码（CAPTCHA）全称是 "Completely Automated Public Turing test to tell Computers and Humans Apart"——' +
    '一个完全自动化的公开图灵测试。讽刺的是，reCAPTCHA 让你标注的红绿灯和路牌，正在训练 Google 的自动驾驶 AI。' +
    '你每次证明自己是人类，都在免费帮机器变得更聪明。</p>' +
    '</div>';
  document.getElementById('insightBox').innerHTML = insightHtml;

  // chart
  renderResultChart();

  // submit to backend
  submitToBackend();
}

function renderResultChart() {
  var canvas = document.getElementById('resultChart');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  if (window._resultChart) window._resultChart.destroy();

  var labels = LEVELS.map(function(lv) { return lv.name; });
  var times = results.map(function(r) { return (r.timeMs / 1000).toFixed(1); });
  var bgColors = results.map(function(r) {
    return r.passed ? 'rgba(76,175,80,0.7)' : 'rgba(255,68,68,0.7)';
  });
  var borderColors = results.map(function(r) {
    return r.passed ? 'rgba(76,175,80,1)' : 'rgba(255,68,68,1)';
  });

  window._resultChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '用时（秒）',
        data: times,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 1,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          ticks: { color: '#888', font: { size: 11 } },
          grid: { display: false },
        },
        y: {
          ticks: { color: '#888', callback: function(v) { return v + 's'; } },
          grid: { color: 'rgba(255,255,255,0.05)' },
        }
      }
    }
  });
}

// ── 工具函数 ──────────────────────────────────────────────
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}


// ══════════════════════════════════════════════════════════
// 后端统计集成
// ══════════════════════════════════════════════════════════
var API_BASE = 'https://numfeel-api.996.ninja';

function submitToBackend() {
  var passed = results.filter(function(r) { return r.passed; }).length;
  var totalTime = results.reduce(function(a, r) { return a + r.timeMs; }, 0);

  var grade;
  if (passed === 8) grade = 'S';
  else if (passed >= 6) grade = 'A';
  else if (passed >= 4) grade = 'B';
  else if (passed >= 2) grade = 'C';
  else grade = 'D';

  var levels = {};
  var levelIds = ['text','math','slider','grid','click','rotate','spatial','behavior'];
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    levels[r.levelId] = r.passed ? 1 : 0;
    levels['time' + r.levelId.charAt(0).toUpperCase() + r.levelId.slice(1)] = r.timeMs;
  }

  var payload = {
    passedCount: passed,
    totalTimeMs: totalTime,
    grade: grade,
    levels: levels
  };

  fetch(API_BASE + '/captcha/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.status === 200 && data.data) {
      var d = data.data;
      var submitBox = document.getElementById('submitBox');
      if (submitBox) {
        submitBox.innerHTML =
          '<div class="insight-box green" style="border-left-color:#4CAF50;">' +
            '<h3 style="color:#81c784;"><i class="ti ti-trophy"></i> 你的排名</h3>' +
            '<p>在 <strong style="color:#ffd700">' + d.totalSessions + '</strong> 位挑战者中排名第 <strong style="color:#ffd700">' + d.rank + '</strong>，' +
            '超过了 <strong style="color:#ffd700">' + d.percentile + '%</strong> 的人。</p>' +
          '</div>';
      }
    }
  })
  .catch(function() { /* silent */ });
}

function loadCommunityStats() {
  var loading = document.getElementById('communityLoading');
  var content = document.getElementById('communityContent');
  var error   = document.getElementById('communityError');

  fetch(API_BASE + '/captcha/stats')
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.status !== 200 || !data.data || !data.data.global) {
      throw new Error('no data');
    }
    loading.style.display = 'none';
    content.style.display = '';

    var g = data.data.global;
    var gd = data.data.gradeDist || {};

    // stats cards
    document.getElementById('communityStats').innerHTML =
      '<div class="stat-card"><div class="val">' + (g.totalSessions || 0) + '</div><div class="lbl">总挑战次数</div></div>' +
      '<div class="stat-card"><div class="val">' + (g.avgPassed != null ? g.avgPassed.toFixed(1) : '-') + '/8</div><div class="lbl">平均通过</div></div>' +
      '<div class="stat-card"><div class="val">' + (g.avgTotalSec != null ? g.avgTotalSec + 's' : '-') + '</div><div class="lbl">平均总用时</div></div>';

    // pass rate chart
    renderPassRateChart(g.passRates || {});

    // grade dist chart
    renderGradeDistChart(gd);

    // insight
    if (g.passRates) {
      var rates = g.passRates;
      var hardest = 'text', lowest = 100;
      var names = { text:'扭曲文字', math:'数学运算', slider:'滑块拼图', grid:'九宫格选择',
                    click:'文字点选', rotate:'旋转对齐', spatial:'空间推理', behavior:'行为验证' };
      Object.keys(rates).forEach(function(k) {
        if (rates[k] != null && rates[k] < lowest) { lowest = rates[k]; hardest = k; }
      });
      document.getElementById('communityInsight').innerHTML =
        '<div class="insight-box">' +
          '<h3><i class="ti ti-chart-dots-3"></i> 社区洞察</h3>' +
          '<p>最难的关卡是「' + names[hardest] + '」，通过率仅 ' + lowest.toFixed(1) + '%。' +
          '共有 ' + g.totalSessions + ' 人完成了挑战。</p>' +
        '</div>';
    }
  })
  .catch(function() {
    loading.style.display = 'none';
    error.style.display = '';
  });
}

function renderPassRateChart(rates) {
  var canvas = document.getElementById('passRateChart');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  if (window._passRateChart) window._passRateChart.destroy();

  var labels = ['扭曲文字','数学运算','滑块拼图','九宫格','文字点选','旋转对齐','空间推理','行为验证'];
  var keys = ['text','math','slider','grid','click','rotate','spatial','behavior'];
  var data = keys.map(function(k) { return rates[k] != null ? rates[k] : 0; });

  window._passRateChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '通过率 %',
        data: data,
        backgroundColor: data.map(function(v) {
          return v >= 80 ? 'rgba(76,175,80,0.7)' : v >= 50 ? 'rgba(255,152,0,0.7)' : 'rgba(255,68,68,0.7)';
        }),
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#888', font: { size: 10 } }, grid: { display: false } },
        y: { min: 0, max: 100, ticks: { color: '#888', callback: function(v) { return v + '%'; } }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

function renderGradeDistChart(gd) {
  var canvas = document.getElementById('gradeDistChart');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  if (window._gradeDistChart) window._gradeDistChart.destroy();

  var grades = ['S','A','B','C','D'];
  var colors = ['#ffd700','#4CAF50','#4d96ff','#ff922b','#ff4444'];
  var data = grades.map(function(g) { return gd[g] || 0; });

  window._gradeDistChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: grades,
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderWidth: 0,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#aaa', font: { size: 12 }, padding: 12 } }
      }
    }
  });
}

// ── 页面加载时拉取社区数据 ──
document.addEventListener('DOMContentLoaded', function() {
  loadCommunityStats();
});

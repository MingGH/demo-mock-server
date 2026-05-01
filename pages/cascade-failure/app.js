// ===== 级联故障模拟器 v3 =====
const API_BASE = 'https://numfeel-api.996.ninja';
const NODE_COUNT = 80;
const CANVAS_W = 900;
const CANVAS_H = 520;

let nodes = [];
let edges = [];
let canvas, ctx;
let particleCanvas, pCtx;
let animTimer = null;
let isAnimating = false;
let hoveredNode = -1;

// ── 模式状态 ──
let currentMode = 'achilles'; // achilles | architect | sandbox
let challengeState = null;    // 挑战模式状态

// ── 时间线回放 ──
let timelineSnapshots = [];
let timelineIdx = 0;
let timelinePlaying = false;
let timelineTimer = null;

// ── 粒子系统 ──
let particles = [];
let shockwaves = [];
let particleAnimId = null;

// ── 真实案例库 ──
const REAL_WORLD_CASES = [
  { minFailed: 0.7, type: 'hub', title: '2003 北美大停电',
    desc: '俄亥俄州一条输电线碰到树枝，触发连锁反应，5500万人断电55小时。一个节点的故障，通过电网的紧密耦合传遍了整个东北部。' },
  { minFailed: 0.5, type: 'any', title: '2008 全球金融危机',
    desc: '雷曼兄弟倒闭后，信用违约互换的连锁反应让全球金融系统几近崩溃。金融网络的高度耦合让「大而不能倒」成为现实。' },
  { minFailed: 0.3, type: 'any', title: '2021 Facebook 全球宕机',
    desc: 'BGP 配置错误导致 Facebook、Instagram、WhatsApp 同时下线6小时。一个路由变更引发的级联故障，影响了35亿用户。' },
  { minFailed: 0.15, type: 'any', title: '苏伊士运河堵塞 2021',
    desc: '一艘货轮搁浅6天，堵住了全球12%的贸易通道。供应链的级联延迟持续了数月，揭示了全球化网络的脆弱性。' },
  { minFailed: 0.05, type: 'any', title: '局部可控',
    desc: '这次故障被成功隔离。就像2017年亚马逊S3宕机——虽然影响了大量网站，但核心基础设施的冗余设计阻止了全面崩溃。' }
];


// ===== 初始化 =====
function initCanvas() {
  canvas = document.getElementById('networkCanvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  ctx = canvas.getContext('2d');

  // 粒子层
  particleCanvas = document.createElement('canvas');
  particleCanvas.className = 'particle-layer';
  particleCanvas.width = CANVAS_W;
  particleCanvas.height = CANVAS_H;
  pCtx = particleCanvas.getContext('2d');
  canvas.parentElement.appendChild(particleCanvas);

  function resize() {
    var wrap = canvas.parentElement;
    var scale = Math.min(1, wrap.clientWidth / CANVAS_W);
    canvas.style.width = (CANVAS_W * scale) + 'px';
    canvas.style.height = (CANVAS_H * scale) + 'px';
    particleCanvas.style.width = (CANVAS_W * scale) + 'px';
    particleCanvas.style.height = (CANVAS_H * scale) + 'px';
  }
  window.addEventListener('resize', resize);
  resize();

  canvas.addEventListener('click', onCanvasClick);
  canvas.addEventListener('mousemove', onCanvasMove);
  canvas.addEventListener('mouseleave', onCanvasLeave);
}

// ===== 拓扑生成 =====
function generateNetwork(topology, coupling) {
  nodes = [];
  edges = [];
  var p = coupling / 100;

  for (var i = 0; i < NODE_COUNT; i++) {
    nodes.push({ id: i, x: 0, y: 0, load: 0, capacity: 0, alive: true, neighbors: [], degree: 0 });
  }

  if (topology === 'random') {
    for (var i = 0; i < NODE_COUNT; i++) {
      for (var j = i + 1; j < NODE_COUNT; j++) {
        if (Math.random() < p) addEdge(i, j);
      }
    }
    for (var n of nodes) {
      n.x = Math.random() * (CANVAS_W - 80) + 40;
      n.y = Math.random() * (CANVAS_H - 80) + 40;
    }
  } else if (topology === 'scale-free') {
    var m = Math.max(1, Math.floor(p * 4));
    for (var i = 0; i < Math.min(m, NODE_COUNT); i++) {
      for (var j = i + 1; j < Math.min(m, NODE_COUNT); j++) addEdge(i, j);
    }
    for (var i = m; i < NODE_COUNT; i++) {
      var targets = [];
      var attempts = 0;
      while (targets.length < m && attempts < 200) {
        var totalDeg = edges.length * 2;
        if (totalDeg === 0) break;
        var r = Math.random() * totalDeg;
        var cum = 0, pick = -1;
        for (var j = 0; j < i; j++) {
          cum += nodes[j].degree;
          if (r <= cum) { pick = j; break; }
        }
        if (pick !== -1 && !targets.includes(pick) && pick !== i) targets.push(pick);
        attempts++;
      }
      for (var t of targets) addEdge(i, t);
    }
    layoutScaleFree();
  } else if (topology === 'grid') {
    var cols = Math.ceil(Math.sqrt(NODE_COUNT));
    for (var i = 0; i < NODE_COUNT; i++) {
      var row = Math.floor(i / cols), col = i % cols;
      nodes[i].x = 50 + col * ((CANVAS_W - 100) / (cols - 1 || 1));
      nodes[i].y = 50 + row * ((CANVAS_H - 100) / (Math.ceil(NODE_COUNT / cols) - 1 || 1));
      if (col > 0) addEdge(i, i - 1);
      if (row > 0 && i - cols >= 0) addEdge(i, i - cols);
      for (var j = i + 1; j < NODE_COUNT; j++) {
        if (Math.random() < p * 0.02) addEdge(i, j);
      }
    }
  } else if (topology === 'modular') {
    var groups = 4;
    var perGroup = Math.floor(NODE_COUNT / groups);
    var centers = [
      [CANVAS_W * 0.25, CANVAS_H * 0.28],
      [CANVAS_W * 0.75, CANVAS_H * 0.28],
      [CANVAS_W * 0.25, CANVAS_H * 0.72],
      [CANVAS_W * 0.75, CANVAS_H * 0.72]
    ];
    for (var g = 0; g < groups; g++) {
      for (var i = 0; i < perGroup; i++) {
        var idx = g * perGroup + i;
        if (idx >= NODE_COUNT) break;
        nodes[idx].x = centers[g][0] + (Math.random() - 0.5) * CANVAS_W * 0.3;
        nodes[idx].y = centers[g][1] + (Math.random() - 0.5) * CANVAS_H * 0.3;
      }
    }
    for (var g = 0; g < groups; g++) {
      var start = g * perGroup;
      var end = Math.min(start + perGroup, NODE_COUNT);
      for (var i = start; i < end; i++) {
        for (var j = i + 1; j < end; j++) {
          if (Math.random() < p * 0.4) addEdge(i, j);
        }
      }
    }
    for (var i = 0; i < NODE_COUNT; i++) {
      for (var j = i + 1; j < NODE_COUNT; j++) {
        if (Math.floor(i / perGroup) !== Math.floor(j / perGroup)) {
          if (Math.random() < p * 0.02) addEdge(i, j);
        }
      }
    }
  }

  // 确保无孤立节点
  for (var n of nodes) {
    if (n.degree === 0) {
      var pick = Math.floor(Math.random() * NODE_COUNT);
      if (pick !== n.id) addEdge(n.id, pick);
    }
  }
}

function addEdge(a, b) {
  if (a === b) return;
  for (var e of edges) if ((e[0] === a && e[1] === b) || (e[0] === b && e[1] === a)) return;
  edges.push([a, b]);
  nodes[a].neighbors.push(b);
  nodes[b].neighbors.push(a);
  nodes[a].degree++;
  nodes[b].degree++;
}

function layoutScaleFree() {
  var order = nodes.map(function(n, i) { return { i: i, d: n.degree }; }).sort(function(a, b) { return b.d - a.d; });
  var centerX = CANVAS_W / 2, centerY = CANVAS_H / 2;
  for (var k = 0; k < order.length; k++) {
    var idx = order[k].i;
    var angle = (k / order.length) * Math.PI * 2;
    var radius = 40 + (k / order.length) * (Math.min(CANVAS_W, CANVAS_H) / 2 - 70);
    nodes[idx].x = centerX + Math.cos(angle) * radius;
    nodes[idx].y = centerY + Math.sin(angle) * radius;
  }
}

// ===== 负载与容量初始化 =====
function initLoads(capacityMargin, strategy) {
  for (var n of nodes) {
    var baseLoad = 30 + n.degree * 5;
    n.load = baseLoad * (0.88 + Math.random() * 0.09);
    var capMult = 1 + capacityMargin / 100;
    if (strategy === 'hub' && n.degree >= 6) capMult += 0.5;
    if (strategy === 'hub' && n.degree < 6) capMult -= 0.05;
    if (strategy === 'distributed') capMult += 0.2;
    n.capacity = baseLoad * Math.max(1.02, capMult);
    n.alive = true;
  }
}

// ===== 渲染 =====
function drawNetwork(highlightIds, pulseIds) {
  highlightIds = highlightIds || new Set();
  pulseIds = pulseIds || new Set();
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // 边
  for (var e of edges) {
    var na = nodes[e[0]], nb = nodes[e[1]];
    if (!na.alive && !nb.alive) {
      ctx.strokeStyle = 'rgba(80,80,80,0.06)';
      ctx.lineWidth = 0.5;
    } else if (!na.alive || !nb.alive) {
      ctx.strokeStyle = 'rgba(248,113,113,0.12)';
      ctx.lineWidth = 0.8;
    } else {
      // 边的亮度反映两端负载
      var maxRatio = Math.max(na.load / na.capacity, nb.load / nb.capacity);
      if (maxRatio > 0.85) {
        ctx.strokeStyle = 'rgba(251,191,36,0.15)';
        ctx.lineWidth = 1.2;
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 0.8;
      }
    }
    ctx.beginPath();
    ctx.moveTo(na.x, na.y);
    ctx.lineTo(nb.x, nb.y);
    ctx.stroke();
  }

  // 节点
  var now = Date.now();
  for (var n of nodes) {
    var baseR = 4 + Math.min(n.degree, 12) * 0.7;
    var r = baseR;

    if (pulseIds.has(n.id)) {
      r = baseR * 1.8;
    } else if (n.alive) {
      // 高负载节点微微脉动
      var ratio = n.load / n.capacity;
      if (ratio > 0.85) {
        var pulse = 1 + Math.sin(now / 200 + n.id) * 0.12;
        r = baseR * pulse;
      }
    }

    // 悬停高亮
    if (n.id === hoveredNode && n.alive && !isAnimating) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,215,0,0.08)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,215,0,0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);

    if (highlightIds.has(n.id)) {
      // 当前波次崩溃的节点 — 红色发光
      ctx.fillStyle = '#ef4444';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (!n.alive) {
      ctx.fillStyle = '#333';
      ctx.fill();
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    } else {
      var ratio = n.load / n.capacity;
      if (ratio > 0.95) {
        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 6;
      } else if (ratio > 0.85) {
        ctx.fillStyle = '#f87171';
        ctx.shadowColor = '#f87171';
        ctx.shadowBlur = 4;
      } else if (ratio > 0.7) {
        ctx.fillStyle = '#fbbf24';
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = '#60a5fa';
        ctx.shadowBlur = 0;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

// ===== 粒子系统 =====
function spawnExplosion(x, y, count) {
  for (var i = 0; i < count; i++) {
    var angle = Math.random() * Math.PI * 2;
    var speed = 1 + Math.random() * 3;
    particles.push({
      x: x, y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.015 + Math.random() * 0.02,
      size: 1.5 + Math.random() * 2,
      color: Math.random() > 0.5 ? '#f87171' : '#fbbf24'
    });
  }
}

function spawnShockwave(x, y) {
  shockwaves.push({ x: x, y: y, radius: 5, maxRadius: 120, life: 1 });
}

function updateParticles() {
  pCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // 粒子
  for (var i = particles.length - 1; i >= 0; i--) {
    var p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.97;
    p.vy *= 0.97;
    p.life -= p.decay;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    pCtx.globalAlpha = p.life;
    pCtx.fillStyle = p.color;
    pCtx.beginPath();
    pCtx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    pCtx.fill();
  }

  // 冲击波
  for (var i = shockwaves.length - 1; i >= 0; i--) {
    var sw = shockwaves[i];
    sw.radius += 3;
    sw.life -= 0.025;
    if (sw.life <= 0 || sw.radius > sw.maxRadius) { shockwaves.splice(i, 1); continue; }
    pCtx.globalAlpha = sw.life * 0.4;
    pCtx.strokeStyle = '#f87171';
    pCtx.lineWidth = 2;
    pCtx.beginPath();
    pCtx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
    pCtx.stroke();
  }

  pCtx.globalAlpha = 1;

  if (particles.length > 0 || shockwaves.length > 0) {
    particleAnimId = requestAnimationFrame(updateParticles);
  } else {
    particleAnimId = null;
  }
}

function startParticleLoop() {
  if (!particleAnimId) {
    particleAnimId = requestAnimationFrame(updateParticles);
  }
}

function triggerShake() {
  var el = document.getElementById('shakeOverlay');
  el.classList.remove('shaking');
  void el.offsetWidth; // force reflow
  el.classList.add('shaking');
}

// ===== 级联故障模拟（纯计算，不修改 nodes） =====
function simulateCascade(startId) {
  var failed = new Set();
  var queue = [startId];
  failed.add(startId);
  var step = 0;
  var stepLog = [];
  var snapshots = [];

  var loads = nodes.map(function(n) { return n.load; });
  snapshots.push({
    failed: new Set(failed), newly: new Set([startId]), step: 0,
    loads: loads.slice(), triggerNode: startId
  });

  while (queue.length > 0 && step < 200) {
    var batchNewly = new Set();
    var nextQueue = [];

    // 处理当前队列中所有节点（同一波次）
    for (var qi = 0; qi < queue.length; qi++) {
      var current = queue[qi];
      var n = nodes[current];
      var livingNeighbors = n.neighbors.filter(function(nb) { return !failed.has(nb); });

      if (livingNeighbors.length > 0) {
        var transfer = loads[current] / livingNeighbors.length;
        for (var nb of livingNeighbors) {
          loads[nb] += transfer;
        }
      }
    }

    // 检查哪些节点超载
    for (var ni = 0; ni < nodes.length; ni++) {
      if (!failed.has(ni) && loads[ni] > nodes[ni].capacity) {
        failed.add(ni);
        nextQueue.push(ni);
        batchNewly.add(ni);
      }
    }

    if (batchNewly.size > 0) {
      step++;
      stepLog.push({ step: step, count: batchNewly.size, ids: Array.from(batchNewly) });
      snapshots.push({
        failed: new Set(failed), newly: new Set(batchNewly), step: step,
        loads: loads.slice()
      });
    }

    queue = nextQueue;
    if (nextQueue.length === 0) break;
  }

  var aliveCount = NODE_COUNT - failed.size;
  var survivalRate = aliveCount / NODE_COUNT;
  var maxComp = largestComponent(failed);

  return {
    startId: startId,
    failed: failed,
    step: step,
    survivalRate: survivalRate,
    maxComponent: maxComp,
    totalFailed: failed.size,
    stepLog: stepLog,
    snapshots: snapshots,
    loads: loads
  };
}

function largestComponent(failedSet) {
  var visited = new Set();
  var max = 0;
  for (var n of nodes) {
    if (failedSet.has(n.id) || visited.has(n.id)) continue;
    var size = 0;
    var stack = [n.id];
    visited.add(n.id);
    while (stack.length) {
      var cur = stack.pop();
      size++;
      for (var nb of nodes[cur].neighbors) {
        if (!failedSet.has(nb) && !visited.has(nb)) {
          visited.add(nb);
          stack.push(nb);
        }
      }
    }
    max = Math.max(max, size);
  }
  return max;
}

// ===== 动画播放 =====
function playAnimation(result, onDone) {
  var snapshots = result.snapshots;
  var idx = 0;
  isAnimating = true;

  function frame() {
    if (idx >= snapshots.length) {
      // 最终状态
      for (var n of nodes) {
        n.alive = !result.failed.has(n.id);
        n.load = result.loads[n.id];
      }
      drawNetwork();
      isAnimating = false;
      onDone();
      return;
    }
    var snap = snapshots[idx];

    // 更新节点状态
    for (var n of nodes) {
      n.alive = !snap.failed.has(n.id);
      n.load = snap.loads[n.id];
    }

    // 为新崩溃的节点生成特效
    if (idx > 0) {
      for (var nid of snap.newly) {
        spawnExplosion(nodes[nid].x, nodes[nid].y, 8 + Math.floor(nodes[nid].degree * 1.5));
        spawnShockwave(nodes[nid].x, nodes[nid].y);
      }
      startParticleLoop();

      // 大规模崩溃时震动
      if (snap.newly.size >= 3) {
        triggerShake();
      }
    } else {
      // 引爆瞬间
      var trigger = nodes[result.startId];
      spawnExplosion(trigger.x, trigger.y, 20);
      spawnShockwave(trigger.x, trigger.y);
      startParticleLoop();
      triggerShake();
    }

    drawNetwork(snap.newly, snap.newly);
    idx++;

    var delay = idx === 1 ? 600 : Math.max(200, 450 - idx * 20);
    animTimer = setTimeout(function() { requestAnimationFrame(frame); }, delay);
  }
  frame();
}

// ===== 鼠标交互 =====
function getCanvasCoords(e) {
  var rect = canvas.getBoundingClientRect();
  var scaleX = CANVAS_W / rect.width;
  var scaleY = CANVAS_H / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

function findClosestNode(mx, my, maxDist) {
  var closest = -1, bestDist = 1e9;
  for (var n of nodes) {
    var d = (n.x - mx) * (n.x - mx) + (n.y - my) * (n.y - my);
    if (d < bestDist) { bestDist = d; closest = n.id; }
  }
  if (closest >= 0 && bestDist < (maxDist || 900)) return closest;
  return -1;
}

function onCanvasMove(e) {
  if (isAnimating) return;
  var coords = getCanvasCoords(e);
  var nodeId = findClosestNode(coords.x, coords.y, 400);

  if (nodeId !== hoveredNode) {
    hoveredNode = nodeId;
    drawNetwork();
    updateTooltip(e, nodeId);
  } else if (nodeId >= 0) {
    positionTooltip(e);
  }
}

function onCanvasLeave() {
  hoveredNode = -1;
  hideTooltip();
  if (!isAnimating) drawNetwork();
}

function updateTooltip(e, nodeId) {
  var tt = document.getElementById('nodeTooltip');
  if (nodeId < 0 || !nodes[nodeId].alive) {
    tt.classList.remove('visible');
    return;
  }

  var n = nodes[nodeId];
  var ratio = n.load / n.capacity;
  var badge = n.degree >= 6 ? '枢纽' : (n.degree <= 2 ? '边缘' : '普通');
  var badgeClass = n.degree >= 6 ? '' : (n.degree <= 2 ? 'safe' : 'mid');

  tt.querySelector('.tt-id').textContent = '节点 #' + nodeId;
  tt.querySelector('.tt-badge').textContent = badge;
  tt.querySelector('.tt-badge').className = 'tt-badge ' + badgeClass;

  var vals = tt.querySelectorAll('.tt-val');
  vals[0].textContent = n.load.toFixed(1);
  vals[1].textContent = n.capacity.toFixed(1);
  vals[2].textContent = n.degree;

  var barFill = tt.querySelector('.tt-bar-fill');
  barFill.style.width = Math.min(100, ratio * 100) + '%';
  barFill.style.background = ratio > 0.85 ? '#f87171' : (ratio > 0.7 ? '#fbbf24' : '#60a5fa');

  tt.classList.add('visible');
  positionTooltip(e);
}

function positionTooltip(e) {
  var tt = document.getElementById('nodeTooltip');
  var wrap = document.getElementById('canvasWrap');
  var wrapRect = wrap.getBoundingClientRect();
  var x = e.clientX - wrapRect.left + 16;
  var y = e.clientY - wrapRect.top - 10;

  // 防止溢出右侧
  if (x + 180 > wrapRect.width) x = e.clientX - wrapRect.left - 190;
  if (y + 160 > wrapRect.height) y = wrapRect.height - 170;
  if (y < 0) y = 10;

  tt.style.left = x + 'px';
  tt.style.top = y + 'px';
}

function hideTooltip() {
  document.getElementById('nodeTooltip').classList.remove('visible');
}

function onCanvasClick(e) {
  if (isAnimating) return;
  var coords = getCanvasCoords(e);
  var nodeId = findClosestNode(coords.x, coords.y, 900);
  if (nodeId >= 0 && nodes[nodeId].alive) {
    triggerNode(nodeId);
  }
}

// ===== 引爆节点（不重新生成网络！） =====
function triggerNode(nodeId) {
  if (isAnimating) return;
  hideTooltip();

  // 保存当前网络状态用于回放
  var savedLoads = nodes.map(function(n) { return n.load; });
  var savedAlive = nodes.map(function(n) { return n.alive; });

  var result = simulateCascade(nodeId);
  var triggerPos = nodes[nodeId].degree >= 6 ? 'hub' : (nodes[nodeId].degree <= 2 ? 'edge' : 'mid');

  // 设置时间线
  timelineSnapshots = result.snapshots;
  timelineIdx = 0;

  playAnimation(result, function() {
    showResult(result, triggerPos);
    setupTimeline(result);

    // 挑战模式处理
    if (currentMode === 'achilles' && challengeState) {
      handleAchillesAttempt(result);
    } else if (currentMode === 'architect' && challengeState) {
      handleArchitectAttempt(result);
    }

    // 提交到后端
    submitResult({
      topology: document.getElementById('topology').value,
      coupling: parseInt(document.getElementById('coupling').value),
      capacity: parseInt(document.getElementById('capacity').value),
      strategy: document.getElementById('strategy').value,
      triggerPos: triggerPos,
      survivalRate: result.survivalRate,
      cascadeSteps: result.step,
      maxComponent: result.maxComponent,
      totalNodes: NODE_COUNT,
      score: Math.round(result.survivalRate * 100)
    });
  });
}

// ===== 时间线回放 =====
function setupTimeline(result) {
  var panel = document.getElementById('timelinePanel');
  panel.classList.remove('hidden');

  var slider = document.getElementById('tlSlider');
  slider.max = timelineSnapshots.length - 1;
  slider.value = timelineSnapshots.length - 1;
  timelineIdx = timelineSnapshots.length - 1;

  updateTimelineDisplay();
}

function timelineSeek(idx) {
  idx = parseInt(idx);
  if (idx < 0 || idx >= timelineSnapshots.length) return;
  timelineIdx = idx;

  var snap = timelineSnapshots[idx];
  for (var n of nodes) {
    n.alive = !snap.failed.has(n.id);
    n.load = snap.loads[n.id];
  }
  drawNetwork(snap.newly, snap.newly);
  updateTimelineDisplay();
}

function timelineStep(dir) {
  var newIdx = timelineIdx + dir;
  if (newIdx < 0 || newIdx >= timelineSnapshots.length) return;
  document.getElementById('tlSlider').value = newIdx;
  timelineSeek(newIdx);
}

function timelineTogglePlay() {
  if (timelinePlaying) {
    clearInterval(timelineTimer);
    timelinePlaying = false;
    document.querySelector('#tlPlay i').className = 'ti ti-player-play';
    return;
  }

  timelinePlaying = true;
  document.querySelector('#tlPlay i').className = 'ti ti-player-pause';

  // 从头开始
  if (timelineIdx >= timelineSnapshots.length - 1) {
    timelineIdx = 0;
    document.getElementById('tlSlider').value = 0;
    timelineSeek(0);
  }

  timelineTimer = setInterval(function() {
    if (timelineIdx >= timelineSnapshots.length - 1) {
      clearInterval(timelineTimer);
      timelinePlaying = false;
      document.querySelector('#tlPlay i').className = 'ti ti-player-play';
      return;
    }
    timelineIdx++;
    document.getElementById('tlSlider').value = timelineIdx;
    timelineSeek(timelineIdx);
  }, 600);
}

function updateTimelineDisplay() {
  var snap = timelineSnapshots[timelineIdx];
  var label = document.getElementById('tlLabel');
  var narrative = document.getElementById('tlNarrative');

  if (timelineIdx === 0) {
    label.textContent = '引爆瞬间';
    var trigger = nodes[snap.triggerNode];
    narrative.innerHTML = '<strong style="color:#f87171">节点 #' + snap.triggerNode + '</strong>（连接数 ' + trigger.degree + '）被引爆。' +
      '它承载的 ' + trigger.load.toFixed(1) + ' 单位负载即将涌向 ' + trigger.neighbors.length + ' 个邻居……';
  } else {
    label.textContent = '第 ' + snap.step + ' 波 — ' + snap.newly.size + ' 个节点崩溃';
    var ids = Array.from(snap.newly).slice(0, 5);
    var idStr = ids.map(function(id) { return '#' + id; }).join('、');
    if (snap.newly.size > 5) idStr += ' 等';
    narrative.innerHTML = '负载冲击波到达 ' + idStr + '，<strong style="color:#f87171">' + snap.newly.size + ' 个节点</strong>超过容量极限崩溃。' +
      '累计已有 <strong>' + snap.failed.size + '/' + NODE_COUNT + '</strong> 个节点失效。';
  }
}

// ===== 结果展示 =====
function showResult(r, triggerPos) {
  document.getElementById('resultPanel').classList.remove('hidden');
  document.getElementById('res-survival').textContent = (r.survivalRate * 100).toFixed(1) + '%';
  document.getElementById('res-steps').textContent = r.step;
  document.getElementById('res-failed').textContent = r.totalFailed;
  document.getElementById('res-component').textContent = r.maxComponent;

  var score = Math.round(r.survivalRate * 100);
  document.getElementById('res-score').textContent = score;

  // 洞察文案
  var insight = document.getElementById('resultInsight');
  var txt = '';
  if (r.totalFailed <= 1) {
    txt = '引爆未引发级联。节点 #' + r.startId + ' 的负载被邻居顺利吸收，网络纹丝不动。试试找一个连接更多的枢纽节点，或者降低容量余量再来。';
  } else if (r.survivalRate < 0.2) {
    txt = '灾难性崩溃。从节点 #' + r.startId + ' 开始，负载像海啸一样席卷了整个网络。' + r.step + ' 波冲击后，' + r.totalFailed + ' 个节点全部阵亡。这个网络没有任何缓冲区。';
  } else if (r.survivalRate < 0.5) {
    txt = '严重级联。' + r.totalFailed + ' 个节点在 ' + r.step + ' 波冲击中倒下，网络损失过半。最大连通分量只剩 ' + r.maxComponent + ' 个节点，功能严重退化。';
  } else if (r.survivalRate < 0.8) {
    txt = '局部崩溃。级联在 ' + r.step + ' 步后被阻断，' + (NODE_COUNT - r.totalFailed) + ' 个节点幸存。网络受损但仍在运转——这就是冗余设计的价值。';
  } else {
    txt = '影响可控。仅 ' + r.totalFailed + ' 个节点失效，网络保持了 ' + (r.survivalRate * 100).toFixed(0) + '% 的完整性。';
    if (document.getElementById('strategy').value !== 'none') {
      txt += '防御策略功不可没。';
    } else {
      txt += '这得益于网络自身的拓扑冗余。';
    }
  }
  insight.innerHTML = txt;

  // 真实案例映射
  var rwBox = document.getElementById('realWorldBox');
  var failedRatio = r.totalFailed / NODE_COUNT;
  var matchedCase = null;
  for (var c of REAL_WORLD_CASES) {
    if (failedRatio >= c.minFailed && (c.type === 'any' || c.type === triggerPos)) {
      matchedCase = c;
      break;
    }
  }
  if (!matchedCase && failedRatio < 0.15) {
    matchedCase = REAL_WORLD_CASES[REAL_WORLD_CASES.length - 1];
  }
  if (matchedCase) {
    rwBox.innerHTML = '<div class="rw-title"><i class="ti ti-world"></i> 真实世界的回响：' + matchedCase.title + '</div>' + matchedCase.desc;
  } else {
    rwBox.innerHTML = '';
  }
}

// ===== 模式切换 =====
function switchMode(mode) {
  currentMode = mode;
  challengeState = null;

  // 更新 tab 样式
  document.querySelectorAll('.mode-tab').forEach(function(tab) {
    tab.classList.toggle('active', tab.dataset.mode === mode);
  });

  // 隐藏所有可选面板
  document.getElementById('challengeBanner').classList.add('hidden');
  document.getElementById('settingsPanel').classList.add('hidden');
  document.getElementById('resultPanel').classList.add('hidden');
  document.getElementById('timelinePanel').classList.add('hidden');
  document.getElementById('challengeResult').classList.add('hidden');

  if (mode === 'achilles') {
    document.getElementById('challengeBanner').classList.remove('hidden');
    startAchillesChallenge();
  } else if (mode === 'architect') {
    document.getElementById('challengeBanner').classList.remove('hidden');
    document.getElementById('settingsPanel').classList.remove('hidden');
    startArchitectChallenge();
  } else {
    document.getElementById('settingsPanel').classList.remove('hidden');
    regenerate();
  }
}

// ===== 阿喀琉斯之踵模式 =====
function startAchillesChallenge() {
  // 随机生成一个网络（固定参数，让挑战公平）
  var topos = ['scale-free', 'random', 'modular', 'grid'];
  var topo = topos[Math.floor(Math.random() * topos.length)];
  var coupling = 40 + Math.floor(Math.random() * 30);
  var capacity = 8 + Math.floor(Math.random() * 15);

  document.getElementById('topology').value = topo;
  document.getElementById('coupling').value = coupling;
  document.getElementById('capacity').value = capacity;
  document.getElementById('couplingVal').textContent = coupling + '%';
  document.getElementById('capacityVal').textContent = capacity + '%';
  document.getElementById('strategy').value = 'none';

  generateNetwork(topo, coupling);
  initLoads(capacity, 'none');
  drawNetwork();
  updateTopologyHint(topo);

  // 预计算所有节点的破坏力
  var damages = [];
  for (var i = 0; i < NODE_COUNT; i++) {
    // 保存状态
    var savedLoads = nodes.map(function(n) { return n.load; });
    var result = simulateCascade(i);
    damages.push({ id: i, failed: result.totalFailed });
    // 恢复状态
    for (var j = 0; j < nodes.length; j++) {
      nodes[j].load = savedLoads[j];
      nodes[j].alive = true;
    }
  }
  damages.sort(function(a, b) { return b.failed - a.failed; });

  // 深度保存整个网络拓扑和状态
  var savedEdges = edges.map(function(e) { return [e[0], e[1]]; });
  var savedNodeData = nodes.map(function(n) {
    return {
      id: n.id, x: n.x, y: n.y, load: n.load, capacity: n.capacity,
      alive: true, neighbors: n.neighbors.slice(), degree: n.degree
    };
  });

  challengeState = {
    type: 'achilles',
    maxAttempts: 3,
    attempts: 0,
    bestDamage: 0,
    bestNodeId: -1,
    optimalDamage: damages[0].failed,
    optimalNodeId: damages[0].id,
    damages: damages,
    topo: topo,
    coupling: coupling,
    capacity: capacity,
    savedEdges: savedEdges,
    savedNodeData: savedNodeData
  };

  document.getElementById('attemptsLeft').textContent = '3';
  document.getElementById('bestDamage').textContent = '--';
  document.getElementById('challengeTitle').textContent = '找出阿喀琉斯之踵';
  document.getElementById('challengeDesc').innerHTML = '这个 <strong>' + topo + '</strong> 网络有一个致命弱点。你有 <strong id="attemptsLeft">3</strong> 次机会，找到引爆后造成最大破坏的节点。鼠标悬停查看节点信息，想好了再点。';
  document.querySelector('.challenge-icon i').className = 'ti ti-target-arrow';
  document.getElementById('challengeScoreBox').querySelector('.cs-label').textContent = '当前最佳破坏';

  var canvasHint = document.getElementById('canvasHint');
  canvasHint.innerHTML = '<i class="ti ti-target-arrow"></i> 剩余 <strong>3</strong> 次机会 — 找出引爆后破坏最大的节点';
}

function handleAchillesAttempt(result) {
  if (!challengeState || challengeState.type !== 'achilles') return;

  challengeState.attempts++;
  if (result.totalFailed > challengeState.bestDamage) {
    challengeState.bestDamage = result.totalFailed;
    challengeState.bestNodeId = result.startId;
  }

  document.getElementById('bestDamage').textContent = challengeState.bestDamage + '/' + NODE_COUNT;

  var remaining = challengeState.maxAttempts - challengeState.attempts;

  if (remaining > 0) {
    // 恢复网络到初始状态（完整恢复拓扑+负载）
    setTimeout(function() {
      edges = challengeState.savedEdges.map(function(e) { return [e[0], e[1]]; });
      nodes = challengeState.savedNodeData.map(function(d) {
        return {
          id: d.id, x: d.x, y: d.y, load: d.load, capacity: d.capacity,
          alive: true, neighbors: d.neighbors.slice(), degree: d.degree
        };
      });
      drawNetwork();

      var canvasHint = document.getElementById('canvasHint');
      canvasHint.innerHTML = '<i class="ti ti-target-arrow"></i> 剩余 <strong>' + remaining + '</strong> 次机会 — 当前最佳破坏: ' + challengeState.bestDamage + '/' + NODE_COUNT;
    }, 2000);
  } else {
    // 挑战结束
    setTimeout(function() { showAchillesResult(); }, 1500);
  }
}

function showAchillesResult() {
  var cs = challengeState;
  var accuracy = cs.bestDamage / cs.optimalDamage;
  var panel = document.getElementById('challengeResult');
  panel.classList.remove('hidden');

  var icon = document.getElementById('crIcon');
  var title = document.getElementById('crTitle');
  var desc = document.getElementById('crDesc');
  var stats = document.getElementById('crStats');

  if (accuracy >= 0.95) {
    icon.innerHTML = '<i class="ti ti-trophy" style="color:#ffd700"></i>';
    title.textContent = '精准打击！';
    desc.textContent = '你找到了这个网络最致命的弱点，破坏力达到了理论最优的 ' + (accuracy * 100).toFixed(0) + '%。你天生适合做渗透测试。';
  } else if (accuracy >= 0.7) {
    icon.innerHTML = '<i class="ti ti-flame" style="color:#f87171"></i>';
    title.textContent = '不错的直觉';
    desc.textContent = '你造成了相当大的破坏，但还不是最优解。最致命的节点是 #' + cs.optimalNodeId + '（连接数 ' + nodes[cs.optimalNodeId].degree + '），能摧毁 ' + cs.optimalDamage + ' 个节点。';
  } else {
    icon.innerHTML = '<i class="ti ti-shield-check" style="color:#60a5fa"></i>';
    title.textContent = '网络比你想的更坚韧';
    desc.textContent = '你的攻击只造成了有限破坏。最致命的节点是 #' + cs.optimalNodeId + '（连接数 ' + nodes[cs.optimalNodeId].degree + '），能摧毁 ' + cs.optimalDamage + ' 个节点。下次试试找那些连接最多的枢纽。';
  }

  stats.innerHTML =
    '<div class="cr-stat"><div class="cr-stat-val">' + cs.bestDamage + '/' + NODE_COUNT + '</div><div class="cr-stat-lbl">你的最佳破坏</div></div>' +
    '<div class="cr-stat"><div class="cr-stat-val">' + cs.optimalDamage + '/' + NODE_COUNT + '</div><div class="cr-stat-lbl">理论最大破坏</div></div>' +
    '<div class="cr-stat"><div class="cr-stat-val">' + (accuracy * 100).toFixed(0) + '%</div><div class="cr-stat-lbl">精准度</div></div>';
}

// ===== 韧性建筑师模式 =====
function startArchitectChallenge() {
  challengeState = {
    type: 'architect',
    attempts: 0,
    maxAttempts: 5,
    bestSurvival: 0,
    results: []
  };

  document.getElementById('challengeTitle').textContent = '韧性建筑师';
  document.getElementById('challengeDesc').innerHTML = '调整网络参数，设计一个尽可能坚韧的网络。系统会随机引爆一个节点，你有 <strong>5</strong> 次机会优化配置，追求最高存活率。';
  document.querySelector('.challenge-icon i').className = 'ti ti-shield-check';
  document.getElementById('challengeScoreBox').querySelector('.cs-label').textContent = '最佳存活率';
  document.getElementById('bestDamage').textContent = '--';

  regenerate();
}

function handleArchitectAttempt(result) {
  if (!challengeState || challengeState.type !== 'architect') return;

  challengeState.attempts++;
  challengeState.results.push({
    survivalRate: result.survivalRate,
    topology: document.getElementById('topology').value,
    strategy: document.getElementById('strategy').value
  });

  if (result.survivalRate > challengeState.bestSurvival) {
    challengeState.bestSurvival = result.survivalRate;
  }

  document.getElementById('bestDamage').textContent = (challengeState.bestSurvival * 100).toFixed(1) + '%';

  var remaining = challengeState.maxAttempts - challengeState.attempts;
  if (remaining <= 0) {
    setTimeout(function() { showArchitectResult(); }, 1500);
  } else {
    var canvasHint = document.getElementById('canvasHint');
    canvasHint.innerHTML = '<i class="ti ti-shield-check"></i> 剩余 <strong>' + remaining + '</strong> 次机会 — 调整参数后点击节点或「随机引爆」';
  }
}

function showArchitectResult() {
  var cs = challengeState;
  var panel = document.getElementById('challengeResult');
  panel.classList.remove('hidden');

  var icon = document.getElementById('crIcon');
  var title = document.getElementById('crTitle');
  var desc = document.getElementById('crDesc');
  var stats = document.getElementById('crStats');

  var best = cs.bestSurvival;
  if (best >= 0.95) {
    icon.innerHTML = '<i class="ti ti-trophy" style="color:#ffd700"></i>';
    title.textContent = '铜墙铁壁！';
    desc.textContent = '你设计的网络几乎无法被摧毁。' + (best * 100).toFixed(1) + '% 的存活率，堪比 Google 的基础设施冗余标准。';
  } else if (best >= 0.7) {
    icon.innerHTML = '<i class="ti ti-shield-check" style="color:#60a5fa"></i>';
    title.textContent = '韧性不错';
    desc.textContent = '你的网络在攻击下保持了 ' + (best * 100).toFixed(1) + '% 的完整性。试试「加固枢纽」策略配合「小圈子型」拓扑，可能会更好。';
  } else {
    icon.innerHTML = '<i class="ti ti-alert-triangle" style="color:#fbbf24"></i>';
    title.textContent = '还需加固';
    desc.textContent = '最佳存活率只有 ' + (best * 100).toFixed(1) + '%。提高容量余量和使用防御策略是关键。真实世界中，这样的网络会让运维团队彻夜难眠。';
  }

  var avgSurvival = cs.results.reduce(function(s, r) { return s + r.survivalRate; }, 0) / cs.results.length;
  stats.innerHTML =
    '<div class="cr-stat"><div class="cr-stat-val">' + (best * 100).toFixed(1) + '%</div><div class="cr-stat-lbl">最佳存活率</div></div>' +
    '<div class="cr-stat"><div class="cr-stat-val">' + (avgSurvival * 100).toFixed(1) + '%</div><div class="cr-stat-lbl">平均存活率</div></div>' +
    '<div class="cr-stat"><div class="cr-stat-val">' + cs.attempts + '</div><div class="cr-stat-lbl">尝试次数</div></div>';
}

function startNewChallenge() {
  document.getElementById('challengeResult').classList.add('hidden');
  document.getElementById('resultPanel').classList.add('hidden');
  document.getElementById('timelinePanel').classList.add('hidden');
  switchMode(currentMode);
}

// ===== 全局操作 =====
function onSettingChange() {
  if (currentMode === 'achilles') return; // 阿喀琉斯模式不允许改参数
  regenerate();
}

function regenerate() {
  if (animTimer) clearTimeout(animTimer);
  if (timelineTimer) clearInterval(timelineTimer);
  isAnimating = false;
  timelinePlaying = false;
  particles = [];
  shockwaves = [];

  var topo = document.getElementById('topology').value;
  var coupling = parseInt(document.getElementById('coupling').value);
  var capacity = parseInt(document.getElementById('capacity').value);
  var strategy = document.getElementById('strategy').value;

  generateNetwork(topo, coupling);
  initLoads(capacity, strategy);

  document.getElementById('resultPanel').classList.add('hidden');
  document.getElementById('timelinePanel').classList.add('hidden');
  updateTopologyHint(topo);
  drawNetwork();

  // 清除粒子层
  if (pCtx) pCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
}

function updateTopologyHint(topo) {
  var el = document.getElementById('topologyHint');
  var hints = {
    random: '每个人随机认识几个朋友，大家的朋友数量差不多。炸掉一个对整体影响不大。',
    'scale-free': '少数「大V」连接了绝大多数人。炸掉大V全网崩溃，炸掉边缘人可能毫无反应。',
    grid: '节点排成方格，只和上下左右相连。故障会沿着格子一步步传播。',
    modular: '全网分成4个小组，组内很熟，组间偶尔连。故障通常被困在一个部门里。'
  };
  el.textContent = hints[topo] || '';
}

function randomTrigger() {
  if (isAnimating) return;
  var aliveNodes = nodes.filter(function(n) { return n.alive; });
  if (aliveNodes.length === 0) return;
  var pick = aliveNodes[Math.floor(Math.random() * aliveNodes.length)];
  triggerNode(pick.id);
}

// ===== 后端数据 =====
async function submitResult(data) {
  try {
    var resp = await fetch(API_BASE + '/cascade-failure/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    var json = await resp.json();
    if (json.status === 200) {
      var el = document.getElementById('totalRuns');
      if (el) el.textContent = json.data.totalRuns + '次全局模拟';
    }
  } catch (e) { console.error('submit failed', e); }
}

async function loadStats() {
  var el = document.getElementById('globalStats');
  try {
    var resp = await fetch(API_BASE + '/cascade-failure/stats');
    var json = await resp.json();
    if (json.status !== 200 || !json.data || !json.data.global) {
      el.innerHTML = '<span style="opacity:0.6">数据加载失败，请刷新重试。</span>';
      return;
    }
    var g = json.data.global;
    if (g.totalRuns === 0) {
      el.innerHTML = '<span style="opacity:0.6">暂无全局数据，完成一次模拟并提交后即可查看统计。</span>';
      return;
    }
    el.innerHTML = '已收集 <strong>' + g.totalRuns + '</strong> 次模拟 | 平均存活率 <strong>' + (g.avgSurvival * 100).toFixed(1) + '%</strong> | 平均级联步数 <strong>' + g.avgSteps + '</strong> | 高存活率占比 <strong>' + (g.highSurvivalRate * 100).toFixed(1) + '%</strong>';
  } catch (e) {
    console.error('stats load failed', e);
    el.innerHTML = '<span style="opacity:0.6">数据加载失败，请刷新重试。</span>';
  }
}

async function loadLeaderboard() {
  var container = document.getElementById('lbList');
  try {
    var resp = await fetch(API_BASE + '/cascade-failure/leaderboard?limit=10');
    var json = await resp.json();
    if (json.status !== 200 || !json.data) {
      container.innerHTML = '<div class="lb-loading">数据加载失败</div>';
      return;
    }
    var list = json.data.leaders;
    if (!list || list.length === 0) {
      container.innerHTML = '<div class="lb-loading">暂无数据</div>';
      return;
    }
    container.innerHTML = list.map(function(r) {
      return '<div class="lb-row">' +
        '<span class="lb-rank">#' + r.rank + '</span>' +
        '<span class="lb-info">' + r.topology + ' / ' + r.strategy + ' / 存活' + (r.survivalRate * 100).toFixed(0) + '%</span>' +
        '<span class="lb-score">' + r.score + '分</span>' +
      '</div>';
    }).join('');
  } catch (e) {
    console.error('lb load failed', e);
    container.innerHTML = '<div class="lb-loading">数据加载失败</div>';
  }
}

// ===== 高负载节点脉动动画 =====
var pulseAnimId = null;
function startPulseAnimation() {
  function tick() {
    if (!isAnimating && nodes.some(function(n) { return n.alive && n.load / n.capacity > 0.85; })) {
      drawNetwork();
    }
    pulseAnimId = requestAnimationFrame(tick);
  }
  if (!pulseAnimId) pulseAnimId = requestAnimationFrame(tick);
}

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', function() {
  initCanvas();
  switchMode('achilles');
  loadStats();
  loadLeaderboard();
  startPulseAnimation();
});

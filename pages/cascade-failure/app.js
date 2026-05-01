// ===== 级联故障模拟器 =====
const NODE_COUNT = 80;
const CANVAS_W = 900;
const CANVAS_H = 500;

let nodes = [];
let edges = [];
let simState = null; // { animating }
let canvas, ctx;
let animTimer = null;

function initCanvas() {
  canvas = document.getElementById('networkCanvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  ctx = canvas.getContext('2d');

  function resize() {
    const wrap = canvas.parentElement;
    const scale = Math.min(1, wrap.clientWidth / CANVAS_W);
    canvas.style.width = (CANVAS_W * scale) + 'px';
    canvas.style.height = (CANVAS_H * scale) + 'px';
  }
  window.addEventListener('resize', resize);
  resize();

  canvas.addEventListener('click', onCanvasClick);
}

// ===== 拓扑生成 =====
function generateNetwork(topology, coupling) {
  nodes = [];
  edges = [];
  const p = coupling / 100;

  for (let i = 0; i < NODE_COUNT; i++) {
    nodes.push({ id: i, x: 0, y: 0, load: 0, capacity: 0, alive: true, neighbors: [], degree: 0 });
  }

  if (topology === 'random') {
    for (let i = 0; i < NODE_COUNT; i++) {
      for (let j = i + 1; j < NODE_COUNT; j++) {
        if (Math.random() < p) addEdge(i, j);
      }
    }
    for (let n of nodes) {
      n.x = Math.random() * (CANVAS_W - 60) + 30;
      n.y = Math.random() * (CANVAS_H - 60) + 30;
    }
  } else if (topology === 'scale-free') {
    const m = Math.max(1, Math.floor(p * 4));
    for (let i = 0; i < Math.min(m, NODE_COUNT); i++) {
      for (let j = i + 1; j < Math.min(m, NODE_COUNT); j++) addEdge(i, j);
    }
    for (let i = m; i < NODE_COUNT; i++) {
      let targets = [];
      let attempts = 0;
      while (targets.length < m && attempts < 200) {
        let totalDeg = edges.length * 2;
        if (totalDeg === 0) break;
        let r = Math.random() * totalDeg;
        let cum = 0, pick = -1;
        for (let j = 0; j < i; j++) {
          cum += nodes[j].degree;
          if (r <= cum) { pick = j; break; }
        }
        if (pick !== -1 && !targets.includes(pick) && pick !== i) targets.push(pick);
        attempts++;
      }
      for (let t of targets) addEdge(i, t);
    }
    layoutScaleFree();
  } else if (topology === 'grid') {
    const cols = Math.ceil(Math.sqrt(NODE_COUNT));
    for (let i = 0; i < NODE_COUNT; i++) {
      const row = Math.floor(i / cols), col = i % cols;
      nodes[i].x = 40 + col * ((CANVAS_W - 80) / (cols - 1 || 1));
      nodes[i].y = 40 + row * ((CANVAS_H - 80) / (Math.ceil(NODE_COUNT / cols) - 1 || 1));
      if (col > 0) addEdge(i, i - 1);
      if (row > 0) addEdge(i, i - cols);
      for (let j = i + 1; j < NODE_COUNT; j++) {
        if (Math.random() < p * 0.02) addEdge(i, j);
      }
    }
  } else if (topology === 'modular') {
    const groups = 4;
    const perGroup = Math.floor(NODE_COUNT / groups);
    for (let g = 0; g < groups; g++) {
      const cx = CANVAS_W * (0.2 + 0.6 * ((g % 2) / 1));
      const cy = CANVAS_H * (0.25 + 0.5 * (Math.floor(g / 2) / 1));
      for (let i = 0; i < perGroup; i++) {
        const idx = g * perGroup + i;
        if (idx >= NODE_COUNT) break;
        nodes[idx].x = cx + (Math.random() - 0.5) * CANVAS_W * 0.25;
        nodes[idx].y = cy + (Math.random() - 0.5) * CANVAS_H * 0.25;
      }
    }
    for (let g = 0; g < groups; g++) {
      const start = g * perGroup;
      const end = Math.min(start + perGroup, NODE_COUNT);
      for (let i = start; i < end; i++) {
        for (let j = i + 1; j < end; j++) {
          if (Math.random() < p * 0.4) addEdge(i, j);
        }
      }
    }
    for (let i = 0; i < NODE_COUNT; i++) {
      for (let j = i + 1; j < NODE_COUNT; j++) {
        if (Math.floor(i / perGroup) !== Math.floor(j / perGroup)) {
          if (Math.random() < p * 0.02) addEdge(i, j);
        }
      }
    }
  }

  // 确保无孤立节点
  for (let n of nodes) {
    if (n.degree === 0) {
      let pick = Math.floor(Math.random() * NODE_COUNT);
      if (pick !== n.id) addEdge(n.id, pick);
    }
  }
}

function addEdge(a, b) {
  if (a === b) return;
  for (let e of edges) if ((e[0] === a && e[1] === b) || (e[0] === b && e[1] === a)) return;
  edges.push([a, b]);
  nodes[a].neighbors.push(b);
  nodes[b].neighbors.push(a);
  nodes[a].degree++;
  nodes[b].degree++;
}

function layoutScaleFree() {
  const order = nodes.map((n, i) => ({ i, d: n.degree })).sort((a, b) => b.d - a.d);
  const centerX = CANVAS_W / 2, centerY = CANVAS_H / 2;
  for (let k = 0; k < order.length; k++) {
    const idx = order[k].i;
    const angle = (k / order.length) * Math.PI * 2;
    const radius = 40 + (k / order.length) * (Math.min(CANVAS_W, CANVAS_H) / 2 - 60);
    nodes[idx].x = centerX + Math.cos(angle) * radius;
    nodes[idx].y = centerY + Math.sin(angle) * radius;
  }
}

// ===== 负载与容量初始化 =====
function initLoads(capacityMargin, strategy) {
  for (let n of nodes) {
    const baseLoad = 30 + n.degree * 5;
    n.load = baseLoad * (0.88 + Math.random() * 0.09);
    let capMult = 1 + capacityMargin / 100;
    if (strategy === 'hub' && n.degree >= 6) capMult += 0.5;
    if (strategy === 'hub' && n.degree < 6) capMult -= 0.05;
    if (strategy === 'distributed') capMult += 0.2;
    n.capacity = baseLoad * Math.max(1.02, capMult);
    n.alive = true;
  }
}

// ===== 渲染 =====
function drawNetwork(highlightIds = new Set(), pulseIds = new Set()) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // 边
  ctx.lineWidth = 1;
  for (let [a, b] of edges) {
    const na = nodes[a], nb = nodes[b];
    if (!na.alive || !nb.alive) {
      ctx.strokeStyle = 'rgba(100,100,100,0.12)';
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    }
    ctx.beginPath();
    ctx.moveTo(na.x, na.y);
    ctx.lineTo(nb.x, nb.y);
    ctx.stroke();
  }

  // 节点
  for (let n of nodes) {
    const baseR = 4 + Math.min(n.degree, 10) * 0.6;
    const r = pulseIds.has(n.id) ? baseR * 1.6 : baseR;

    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);

    if (highlightIds.has(n.id)) {
      ctx.fillStyle = '#f87171';
      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (!n.alive) {
      ctx.fillStyle = '#444';
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      const ratio = n.load / n.capacity;
      if (ratio > 0.95) ctx.fillStyle = '#ef4444';
      else if (ratio > 0.85) ctx.fillStyle = '#f87171';
      else if (ratio > 0.7) ctx.fillStyle = '#fbbf24';
      else ctx.fillStyle = '#60a5fa';
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.fill();
  }
}

// ===== 级联故障模拟 =====
function simulateCascade(startId) {
  const failed = new Set();
  const queue = [startId];
  failed.add(startId);
  let step = 0;
  const stepLog = [];
  const snapshots = [];

  const loads = nodes.map(n => n.load);
  snapshots.push({ failed: new Set(failed), newly: new Set([startId]), step: 0, loads: [...loads] });

  while (queue.length > 0 && step < 200) {
    const current = queue.shift();
    const n = nodes[current];
    const livingNeighbors = n.neighbors.filter(nb => !failed.has(nb));

    if (livingNeighbors.length > 0) {
      const transfer = loads[current] / livingNeighbors.length;
      for (let nb of livingNeighbors) {
        loads[nb] += transfer;
      }
    }

    const newly = new Set();
    for (let nb of livingNeighbors) {
      if (!failed.has(nb) && loads[nb] > nodes[nb].capacity) {
        failed.add(nb);
        queue.push(nb);
        newly.add(nb);
      }
    }

    if (newly.size > 0) {
      step++;
      stepLog.push('第' + step + '步: ' + newly.size + '个节点超载崩溃');
      snapshots.push({ failed: new Set(failed), newly: new Set(newly), step, loads: [...loads] });
    }
  }

  const aliveCount = NODE_COUNT - failed.size;
  const survivalRate = aliveCount / NODE_COUNT;
  const maxComp = largestComponent(failed);

  return {
    startId,
    failed,
    step,
    survivalRate,
    maxComponent: maxComp,
    totalFailed: failed.size,
    stepLog,
    snapshots,
    loads
  };
}

function largestComponent(failedSet) {
  const visited = new Set();
  let max = 0;
  for (let n of nodes) {
    if (failedSet.has(n.id) || visited.has(n.id)) continue;
    let size = 0;
    const stack = [n.id];
    visited.add(n.id);
    while (stack.length) {
      const cur = stack.pop();
      size++;
      for (let nb of nodes[cur].neighbors) {
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
  const snapshots = result.snapshots;
  let idx = 0;

  function frame() {
    if (idx >= snapshots.length) {
      for (let n of nodes) {
        n.alive = !result.failed.has(n.id);
        n.load = result.loads[n.id];
      }
      drawNetwork();
      onDone();
      return;
    }
    const snap = snapshots[idx];

    for (let n of nodes) {
      n.alive = !snap.failed.has(n.id);
      n.load = snap.loads[n.id];
    }

    drawNetwork(snap.newly, snap.newly);
    idx++;
    animTimer = setTimeout(() => requestAnimationFrame(frame), idx === 1 ? 700 : 500);
  }
  frame();
}

// ===== 点击引爆 =====
function onCanvasClick(e) {
  if (simState && simState.animating) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_W / rect.width;
  const scaleY = CANVAS_H / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top) * scaleY;

  let closest = -1, bestDist = 1e9;
  for (let n of nodes) {
    const d = (n.x - mx) ** 2 + (n.y - my) ** 2;
    if (d < bestDist) { bestDist = d; closest = n.id; }
  }
  if (closest >= 0 && bestDist < 900) {
    triggerNode(closest);
  }
}

function triggerNode(nodeId) {
  if (simState && simState.animating) return;

  const topo = document.getElementById('topology').value;
  const coupling = parseInt(document.getElementById('coupling').value);
  const capacity = parseInt(document.getElementById('capacity').value);
  const strategy = document.getElementById('strategy').value;

  generateNetwork(topo, coupling);
  initLoads(capacity, strategy);
  simState = { animating: true };

  // 视觉反馈：先闪烁被点击的节点
  nodes[nodeId].alive = false;
  drawNetwork(new Set([nodeId]));

  setTimeout(() => {
    const result = simulateCascade(nodeId);
    const triggerPos = nodes[nodeId].degree >= 6 ? 'hub' : (nodes[nodeId].degree <= 2 ? 'edge' : 'mid');

    playAnimation(result, () => {
      simState.animating = false;
      showResult(result, triggerPos);
    });
  }, 300);
}

// ===== 结果展示 =====
function showResult(r, triggerPos) {
  document.getElementById('resultPanel').classList.remove('hidden');
  document.getElementById('res-survival').textContent = (r.survivalRate * 100).toFixed(1) + '%';
  document.getElementById('res-steps').textContent = r.step;
  document.getElementById('res-failed').textContent = r.totalFailed;
  document.getElementById('res-component').textContent = r.maxComponent;

  const score = Math.round(r.survivalRate * 100);
  document.getElementById('res-score').textContent = score;

  const insight = document.getElementById('resultInsight');
  let txt = '';
  if (r.totalFailed <= 1) {
    txt = '本次引爆未引发级联。该节点负载被邻居顺利吸收，网络保持完整。尝试降低容量余量、提高耦合度，或切换到更稀疏的拓扑。';
  } else if (r.survivalRate < 0.3) {
    if (triggerPos === 'hub') {
      txt = '级联大爆发。你炸掉了一个枢纽，负载顺着连线向外冲击，最终' + r.totalFailed + '个节点全部歼灭。';
    } else {
      txt = '级联大爆发。虽然只是一个边缘节点，但网络太脆弱，仍然引发了大规模崩溃。';
    }
  } else if (r.survivalRate < 0.7) {
    txt = '局部崩溃。' + r.totalFailed + '个节点失去连接，最大连通分量还剩' + r.maxComponent + '个节点。网络没有完全断裂，但性能已经严重受损。';
  } else {
    const strat = document.getElementById('strategy').value;
    txt = '影响可控。级联被成功阻断在' + r.step + '步之内，网络保持了' + (r.survivalRate * 100).toFixed(0) + '%的存活。' + (strat !== 'none' ? '防御策略发挥了作用。' : '这还得益于网络自身的冗余度。');
  }
  insight.innerHTML = txt;

  submitResult({
    topology: document.getElementById('topology').value,
    coupling: parseInt(document.getElementById('coupling').value),
    capacity: parseInt(document.getElementById('capacity').value),
    strategy: document.getElementById('strategy').value,
    triggerPos,
    survivalRate: r.survivalRate,
    cascadeSteps: r.step,
    maxComponent: r.maxComponent,
    totalNodes: NODE_COUNT,
    score
  });
}

async function submitResult(data) {
  try {
    const resp = await fetch('/cascade-failure/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await resp.json();
    if (json.status === 200) {
      document.getElementById('totalRuns') && (document.getElementById('totalRuns').textContent = json.data.totalRuns + '次全局模拟');
    }
  } catch (e) { console.error('submit failed', e); }
}

// ===== 全局操作 =====
function regenerate() {
  if (animTimer) clearTimeout(animTimer);
  const topo = document.getElementById('topology').value;
  const coupling = parseInt(document.getElementById('coupling').value);
  const capacity = parseInt(document.getElementById('capacity').value);
  const strategy = document.getElementById('strategy').value;
  generateNetwork(topo, coupling);
  initLoads(capacity, strategy);
  document.getElementById('resultPanel').classList.add('hidden');
  drawNetwork();
}

function randomTrigger() {
  const id = Math.floor(Math.random() * NODE_COUNT);
  triggerNode(id);
}

// ===== 后端数据加载 =====
async function loadStats() {
  try {
    const resp = await fetch('/cascade-failure/stats');
    const json = await resp.json();
    if (json.status !== 200) return;
    const g = json.data.global;
    const el = document.getElementById('globalStats');
    if (g.totalRuns === 0) {
      el.innerHTML = '<span style="opacity:0.6">暂无全局数据，完成一次模拟并提交后即可查看统计。</span>';
      return;
    }
    el.innerHTML = '已收集 <strong>' + g.totalRuns + '</strong> 次模拟 | 平均存活率 <strong>' + (g.avgSurvival * 100).toFixed(1) + '%</strong> | 平均级联步数 <strong>' + g.avgSteps + '</strong> | 高存活率占比 <strong>' + (g.highSurvivalRate * 100).toFixed(1) + '%</strong>';
  } catch (e) { console.error('stats load failed', e); }
}

async function loadLeaderboard() {
  try {
    const resp = await fetch('/cascade-failure/leaderboard?limit=10');
    const json = await resp.json();
    if (json.status !== 200) return;
    const list = json.data.leaders;
    const container = document.getElementById('lbList');
    if (!list || list.length === 0) {
      container.innerHTML = '<div class="lb-loading">暂无数据</div>';
      return;
    }
    container.innerHTML = list.map((r, i) =>
      '<div class="lb-row">' +
        '<span class="lb-rank">#' + r.rank + '</span>' +
        '<span class="lb-info">' + r.topology + ' / ' + r.strategy + ' / 存活' + (r.survivalRate * 100).toFixed(0) + '%</span>' +
        '<span class="lb-score">' + r.score + '分</span>' +
      '</div>'
    ).join('');
  } catch (e) { console.error('lb load failed', e); }
}

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  initCanvas();
  regenerate();
  loadStats();
  loadLeaderboard();
});

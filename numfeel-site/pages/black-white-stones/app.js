// ========== UI 层（依赖 engine.js 和 DOM） ==========
// 运行: 在浏览器中打开 index.html
// engine.js 通过 <script> 在全局作用域声明了:
// calcWinProb, simulateDraw, monteCarlo, calcAllProbs, findOptimal, TOTAL_BLACK, TOTAL_WHITE, TOTAL

// ========== DOM refs ==========
const $ = id => document.getElementById(id);

// ========== 更新 UI ==========
function updateUI() {
  const b1 = parseInt($('blackInA').value);
  const w1 = parseInt($('whiteInA').value);
  const { winProb, probA, probB, b2, w2, t1, t2, valid } = calcWinProb(b1, w1);

  // 滑块值
  $('blackInAVal').textContent = b1;
  $('whiteInAVal').textContent = w1;

  // 碗A
  $('bowlABlackCount').textContent = b1;
  $('bowlAWhiteCount').textContent = w1;
  $('bowlATotal').textContent = t1;

  // 碗B
  $('bowlBBlackCount').textContent = b2;
  $('bowlBWhiteCount').textContent = w2;
  $('bowlBTotal').textContent = t2;

  // 可视化
  updateBowlViz('bowlAViz', b1, w1, t1);
  updateBowlViz('bowlBViz', b2, w2, t2);

  // 胜率
  $('winProb').textContent = (winProb * 100).toFixed(1) + '%';
  $('probA').textContent = (probA * 100).toFixed(1);
  $('probB').textContent = (probB * 100).toFixed(1);

  // 按钮状态 + 警告
  const btns = [$('drawOnceBtn'), $('simManyBtn')];
  btns.forEach(b => { if (b) b.disabled = !valid; });
  $('probWarning').style.display = valid ? 'none' : '';
}

function updateBowlViz(bowlId, blackCount, whiteCount, total) {
  const bowl = $(bowlId);
  const blackEl = bowl.querySelector('.black-pile');
  const whiteEl = bowl.querySelector('.white-pile');

  if (total === 0) {
    blackEl.style.height = '0px';
    whiteEl.style.height = '0px';
    return;
  }
  const maxH = 90;
  blackEl.style.height = Math.max(2, (blackCount / TOTAL) * maxH * 2) + 'px';
  whiteEl.style.height = Math.max(2, (whiteCount / TOTAL) * maxH * 2) + 'px';
}

// ========== 滑块事件 ==========
$('blackInA').addEventListener('input', updateUI);
$('whiteInA').addEventListener('input', updateUI);

// ========== 快捷预设 ==========
function applyPreset(type) {
  const blackSlider = $('blackInA');
  const whiteSlider = $('whiteInA');
  const opts = { naive: [25, 25], optimal: [1, 0], extreme: [50, 0] };
  const [b, w] = opts[type] || [25, 25];
  blackSlider.value = b;
  whiteSlider.value = w;
  updateUI();
}

// ========== 摸一次 ==========
function drawOnce() {
  const b1 = parseInt($('blackInA').value);
  const w1 = parseInt($('whiteInA').value);
  const result = simulateDraw(b1, w1);

  const div = $('drawResult');
  const icon = $('resultIcon');
  const msg = $('resultMsg');
  div.style.display = 'flex';

  if (!result.valid) {
    div.className = 'draw-result invalid';
    icon.textContent = '⚠️';
    msg.innerHTML = '每个碗至少要有 1 颗棋子才能抽。请调整分配。';
    return;
  }

  if (result.win) {
    div.className = 'draw-result win';
    icon.textContent = '⬛';
    msg.innerHTML = '摸到了 <strong>黑子</strong> — 你赢了！&nbsp;&nbsp;(选中了碗' + result.bowl + ')';
  } else {
    div.className = 'draw-result lose';
    icon.textContent = '⬜';
    msg.innerHTML = '摸到了 <strong>白子</strong> — 输了。&nbsp;&nbsp;(选中了碗' + result.bowl + ')';
  }
}

// ========== 蒙特卡洛批量模拟 ==========
let mcChart = null;
function runMonteCarlo() {
  const b1 = parseInt($('blackInA').value);
  const w1 = parseInt($('whiteInA').value);
  const { winProb: theoretical, valid } = calcWinProb(b1, w1);
  if (!valid) return;

  const n = Math.min(Math.max(parseInt($('simCount').value) || 1000, 10), 100000);
  $('simCount').value = n;

  const batchSize = Math.max(10, Math.floor(n / 200));
  let done = 0;
  let wins = 0;
  const history = [];

  $('simManyBtn').disabled = true;
  $('simManyBtn').textContent = '模拟中...';

  function runBatch() {
    const remaining = n - done;
    const thisBatch = Math.min(batchSize, remaining);
    for (let i = 0; i < thisBatch; i++) {
      if (simulateDraw(b1, w1).win) wins++;
      done++;
      if (done % Math.max(1, Math.floor(n / 100)) === 0 || done === n) {
        history.push({ trial: done, rate: wins / done });
      }
    }
    updateMCChart(history, theoretical, n);

    if (done < n) {
      requestAnimationFrame(runBatch);
    } else {
      $('simManyBtn').disabled = false;
      $('simManyBtn').innerHTML = '<i class="ti ti-chart-histogram"></i> 批量模拟';
      $('mcSummary').style.display = '';
      $('mcSummary').innerHTML =
        '≤ ' + n + ' 次模拟：赢了 <strong>' + wins + '</strong> 次，胜率 <strong>' +
        (wins / n * 100).toFixed(2) + '%</strong>' +
        '&nbsp;&nbsp;(理论值 <strong>' + (theoretical * 100).toFixed(1) + '%</strong>)';
    }
  }

  $('mcChartWrap').style.display = '';
  $('mcSummary').style.display = 'none';
  if (mcChart) mcChart.destroy();
  runBatch();
}

function updateMCChart(history, theoretical, n) {
  const ctx = $('mcChart').getContext('2d');
  if (mcChart) mcChart.destroy();

  // 动态 Y 轴范围：以理论值为中心，上下 20%
  const theoPct = theoretical * 100;
  const yMin = Math.max(0, theoPct - 20);
  const yMax = Math.min(100, theoPct + 20);

  mcChart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: '实际胜率',
          data: history.map(h => ({ x: h.trial, y: h.rate * 100 })),
          borderColor: '#ffd700',
          backgroundColor: 'rgba(255,215,0,0.08)',
          fill: true, pointRadius: 0, borderWidth: 2, tension: 0.1,
        },
        {
          label: '理论胜率',
          data: history.length > 0
            ? [{ x: history[0].trial, y: theoPct }, { x: history[history.length - 1].trial, y: theoPct }]
            : [{ x: 0, y: theoPct }, { x: n, y: theoPct }],
          borderColor: '#888', borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, fill: false,
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      scales: {
        x: { type: 'linear', title: { display: true, text: '试验次数', color: '#888' }, ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { title: { display: true, text: '胜率 (%)', color: '#888' }, min: yMin, max: yMax, ticks: { color: '#888', callback: v => v.toFixed(0) + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      },
      plugins: { legend: { labels: { color: '#aaa', boxWidth: 20 } } }
    }
  });
}

// ========== 热力图（Canvas 手绘） ==========
// 颜色方案：深蓝(低) → 青 → 绿 → 黄 → 金(高)
function probToColor(prob) {
  // prob 范围大约 0.25 ~ 0.75，映射到 0~1
  const minP = 0.25, maxP = 0.75;
  const t = Math.max(0, Math.min(1, (prob - minP) / (maxP - minP)));

  // 5段渐变色带
  let r, g, b;
  if (t < 0.25) {
    const s = t / 0.25;
    r = Math.round(20 + s * 0);    // 20 → 20
    g = Math.round(30 + s * 80);   // 30 → 110
    b = Math.round(80 + s * 80);   // 80 → 160
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25;
    r = Math.round(20 + s * 20);   // 20 → 40
    g = Math.round(110 + s * 60);  // 110 → 170
    b = Math.round(160 - s * 80);  // 160 → 80
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25;
    r = Math.round(40 + s * 180);  // 40 → 220
    g = Math.round(170 + s * 30);  // 170 → 200
    b = Math.round(80 - s * 60);   // 80 → 20
  } else {
    const s = (t - 0.75) / 0.25;
    r = Math.round(220 + s * 35);  // 220 → 255
    g = Math.round(200 + s * 15);  // 200 → 215
    b = Math.round(20 - s * 20);   // 20 → 0
  }
  return `rgb(${r},${g},${b})`;
}

function drawHeatmap() {
  const canvas = $('heatmapCanvas');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const totalH = 400;
  canvas.width = rect.width * dpr;
  canvas.height = totalH * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = totalH + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const W = rect.width, H = totalH;
  const pad = { top: 20, right: 80, bottom: 50, left: 56 };
  const pw = W - pad.left - pad.right;
  const ph = H - pad.top - pad.bottom;

  const allProbs = calcAllProbs();
  const optimal = findOptimal();
  const N = TOTAL_BLACK + 1; // 51
  const cellW = pw / N;
  const cellH = ph / N;

  ctx.clearRect(0, 0, W, H);

  // 画格子
  for (let b = 0; b < N; b++) {
    for (let w = 0; w < N; w++) {
      const p = allProbs[b][w];
      ctx.fillStyle = probToColor(p);
      ctx.fillRect(
        pad.left + b * cellW,
        pad.top + (N - 1 - w) * cellH,
        Math.ceil(cellW),
        Math.ceil(cellH)
      );
    }
  }

  // 标记最优点 — 大圆 + 指引线
  const ox = pad.left + optimal.b1 * cellW + cellW / 2;
  const oy = pad.top + (N - 1 - optimal.w1) * cellH + cellH / 2;
  // 外圈
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(ox, oy, 12, 0, Math.PI * 2);
  ctx.stroke();
  // 内圈
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(ox, oy, 5, 0, Math.PI * 2);
  ctx.fill();
  // 标签（偏移到右上方）
  const labelX = ox + 18;
  const labelY = oy - 18;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('最优 ' + (optimal.winProb * 100).toFixed(1) + '%', labelX, labelY);
  // 连线
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ox + 10, oy - 6);
  ctx.lineTo(labelX - 2, labelY + 2);
  ctx.stroke();

  // 坐标轴
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + ph);
  ctx.lineTo(pad.left + pw, pad.top + ph);
  ctx.stroke();

  // X轴标签
  ctx.fillStyle = '#999';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let b = 0; b <= TOTAL_BLACK; b += 10) {
    const x = pad.left + b * cellW + cellW / 2;
    ctx.fillText(b, x, pad.top + ph + 6);
  }
  ctx.fillStyle = '#bbb';
  ctx.font = '12px sans-serif';
  ctx.fillText('碗A黑子数', pad.left + pw / 2, H - 10);

  // Y轴标签
  ctx.fillStyle = '#999';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let w = 0; w <= TOTAL_WHITE; w += 10) {
    const y = pad.top + (N - 1 - w) * cellH + cellH / 2;
    ctx.fillText(w, pad.left - 8, y);
  }
  ctx.save();
  ctx.translate(14, pad.top + ph / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#bbb';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('碗A白子数', 0, 0);
  ctx.restore();

  // 色条图例（右侧）
  const legendX = W - pad.right + 20;
  const legendW = 16;
  const legendH = ph;
  const legendY = pad.top;
  const steps = 60;
  const stepH = legendH / steps;
  for (let i = 0; i < steps; i++) {
    const prob = 0.75 - (i / steps) * 0.5; // 从上到下: 75% → 25%
    ctx.fillStyle = probToColor(prob);
    ctx.fillRect(legendX, legendY + i * stepH, legendW, Math.ceil(stepH));
  }
  // 图例边框
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.strokeRect(legendX, legendY, legendW, legendH);
  // 图例标签
  ctx.fillStyle = '#999';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const legendLabels = [
    { pct: '75%', y: legendY },
    { pct: '62%', y: legendY + legendH * 0.25 },
    { pct: '50%', y: legendY + legendH * 0.5 },
    { pct: '37%', y: legendY + legendH * 0.75 },
    { pct: '25%', y: legendY + legendH },
  ];
  legendLabels.forEach(l => {
    ctx.fillText(l.pct, legendX + legendW + 4, l.y);
  });
}

// ========== 初始化 ==========
function init() {
  updateUI();
  drawHeatmap();

  // 窗口大小变化时重绘热力图
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawHeatmap, 200);
  });
}

// 暴露到全局给 HTML onclick
window.applyPreset = applyPreset;
window.drawOnce = drawOnce;
window.runMonteCarlo = runMonteCarlo;

init();

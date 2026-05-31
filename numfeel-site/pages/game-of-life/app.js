'use strict';

var canvas = document.getElementById('lifeCanvas');
var ctx = canvas.getContext('2d');
var DPR = window.devicePixelRatio || 1;

var btnPlay = document.getElementById('btnPlay');
var btnStep = document.getElementById('btnStep');
var btnClear = document.getElementById('btnClear');
var btnRandom = document.getElementById('btnRandom');
var btnFaster = document.getElementById('btnFaster');
var selectPattern = document.getElementById('selectPattern');
var sliderCols = document.getElementById('sliderCols');
var sliderRows = document.getElementById('sliderRows');
var sliderDensity = document.getElementById('sliderDensity');
var lblCols = document.getElementById('lblCols');
var lblRows = document.getElementById('lblRows');
var lblGen = document.getElementById('lblGen');
var lblPop = document.getElementById('lblPop');
var lblDensity = document.getElementById('lblDensity');
var lblStable = document.getElementById('lblStable');
var lblPeriod = document.getElementById('lblPeriod');
var lblPeriodValue = document.getElementById('lblPeriodValue');

var sim;
var animId = null;
var running = false;
var speedMult = 1;
var BaseMsPerGen = 100;
var lastTimestamp = 0;
var genAccumulator = 0;
var stepCount = 0;
var cellSize = 0;
var offsetX = 0;
var offsetY = 0;
var popChart = null;

var ALIVE_COLOR = '#ffd700';
var DEAD_COLOR = 'rgba(15, 15, 35, 0.95)';
var GRID_COLOR = 'rgba(255,255,255,0.06)';

function initSim() {
  var cols = parseInt(sliderCols.value, 10);
  var rows = parseInt(sliderRows.value, 10);
  if (!sim) {
    sim = new GameOfLife(cols, rows);
    sim.randomFill(0.2);
  } else {
    sim.resize(cols, rows);
  }
  lblCols.textContent = cols;
  lblRows.textContent = rows;
  cellSize = 0;
  resizeCanvas();
  draw();
  updateStats();
  updateChart();
}

function resizeCanvas() {
  if (!sim) return;
  var rect = canvas.parentElement.getBoundingClientRect();
  var w = rect.width;
  canvas.width = w * DPR;
  var aspect = sim.rows / sim.cols;
  canvas.height = w * aspect * DPR;
  canvas.style.width = w + 'px';
  canvas.style.height = (w * aspect) + 'px';
  cellSize = canvas.width / sim.cols;
}

function draw() {
  if (!sim) return;
  var w = canvas.width;
  var h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = DEAD_COLOR;
  ctx.fillRect(0, 0, w, h);

  var cs = w / sim.cols;

  for (var r = 0; r < sim.rows; r++) {
    for (var c = 0; c < sim.cols; c++) {
      if (sim.grid[r][c] === 0) continue;
      var x = c * cs;
      var y = r * cs;
      if (cs > 6) {
        var grad = ctx.createRadialGradient(x + cs / 2, y + cs / 2, 0, x + cs / 2, y + cs / 2, cs * 0.7);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(0.3, ALIVE_COLOR);
        grad.addColorStop(1, 'rgba(255,215,0,0)');
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = ALIVE_COLOR;
      }
      ctx.fillRect(x + 0.5, y + 0.5, cs - 1, cs - 1);
    }
  }

  if (cs > 5) {
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.3 * DPR;
    ctx.beginPath();
    for (var r = 0; r <= sim.rows; r++) {
      var y = r * cs;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    for (var c = 0; c <= sim.cols; c++) {
      var x = c * cs;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    ctx.stroke();
  }
}

function updateStats() {
  if (!sim) return;
  var pop = sim.population();
  var density = sim.density();
  lblGen.textContent = formatLargeNum(sim.generation);
  lblPop.textContent = formatLargeNum(pop);
  lblDensity.textContent = formatPercent(density);

  if (running) {
    lblStable.textContent = '运行中';
    lblStable.style.color = '#ffd700';
  } else if (sim.stable) {
    lblStable.textContent = pop === 0 ? '已灭绝' : (sim.periodDetected > 0 ? '稳定周期=' + sim.periodDetected : '已稳定');
    lblStable.style.color = pop === 0 ? '#ff6b6b' : '#51cf66';
  } else if (sim.generation === 0) {
    lblStable.textContent = '已就绪';
    lblStable.style.color = '#ffd700';
  } else {
    lblStable.textContent = '已暂停';
    lblStable.style.color = '#ffd700';
  }

  if (sim.periodDetected > 0) {
    lblPeriodValue.textContent = '周期 ' + sim.periodDetected;
    lblPeriod.style.display = '';
  } else {
    lblPeriod.style.display = 'none';
  }
}

function buildChart() {
  var ctx2 = document.getElementById('popChart').getContext('2d');
  popChart = new Chart(ctx2, {
    type: 'line',
    data: {
      datasets: [{
        label: '细胞数量',
        borderColor: '#ffd700',
        backgroundColor: 'rgba(255,215,0,0.08)',
        borderWidth: 1.5,
        pointRadius: 0,
        fill: true,
        tension: 0.3,
        data: []
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: '代数', color: '#a0a0a0' },
          ticks: { color: '#888', maxTicksLimit: 6 },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        y: {
          min: 0,
          title: { display: true, text: '细胞数', color: '#a0a0a0' },
          ticks: { color: '#888' },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

function updateChart() {
  if (!popChart || !sim) return;
  var data = sim.populationHistory;
  popChart.data.labels = data.map(function (d) { return d.gen; });
  popChart.data.datasets[0].data = data.map(function (d) { return d.pop; });
  popChart.update('none');
}

function loop(timestamp) {
  if (!running) return;

  if (!lastTimestamp) lastTimestamp = timestamp;
  var elapsed = timestamp - lastTimestamp;
  lastTimestamp = timestamp;
  if (elapsed > 500) elapsed = 500;

  var msPerGen = BaseMsPerGen / speedMult;
  genAccumulator += elapsed;

  while (genAccumulator >= msPerGen) {
    sim.step();
    stepCount++;
    genAccumulator -= msPerGen;
  }

  draw();
  updateStats();

  if (stepCount >= 5) {
    updateChart();
    stepCount = 0;
  }

  if (sim.stable) { pause(); updateChart(); return; }
  animId = requestAnimationFrame(loop);
}

function start() {
  if (running) return;
  running = true;
  lastTimestamp = 0;
  genAccumulator = 0;
  stepCount = 0;
  btnPlay.textContent = '⏸ 暂停';
  btnPlay.classList.add('paused');
  animId = requestAnimationFrame(loop);
}

function pause() {
  running = false;
  btnPlay.textContent = '▶ 开始';
  btnPlay.classList.remove('paused');
  if (animId) { cancelAnimationFrame(animId); animId = null; }
  updateChart();
}

function togglePlay() {
  if (running) pause(); else start();
}

function reset() {
  pause();
  initSim();
  draw();
  updateStats();
  updateChart();
}

function placePattern() {
  var key = selectPattern.value;
  if (!key) return;
  pause();
  var ox = Math.floor(sim.cols / 2 - 8);
  var oy = Math.floor(sim.rows / 2 - 5);
  sim.placePattern(key, ox, oy);
  draw();
  updateStats();
  updateChart();
  submitPattern(key);
}

canvas.addEventListener('click', function (e) {
  var rect = canvas.getBoundingClientRect();
  var cs = rect.width / sim.cols;
  var x = Math.floor((e.clientX - rect.left) / cs);
  var y = Math.floor((e.clientY - rect.top) / cs);
  if (x >= 0 && x < sim.cols && y >= 0 && y < sim.rows) {
    sim.setCell(x, y, 1);
    draw();
    updateStats();
    updateChart();
  }
});

// Mouse drag to paint
var isDragging = false;
canvas.addEventListener('mousedown', function (e) {
  isDragging = true;
  var rect = canvas.getBoundingClientRect();
  var cs = rect.width / sim.cols;
  var x = Math.floor((e.clientX - rect.left) / cs);
  var y = Math.floor((e.clientY - rect.top) / cs);
  if (x >= 0 && x < sim.cols && y >= 0 && y < sim.rows) {
    sim.setCell(x, y, 1);
    draw();
    updateStats();
    updateChart();
  }
});
canvas.addEventListener('mousemove', function (e) {
  if (!isDragging) return;
  var rect = canvas.getBoundingClientRect();
  var cs = rect.width / sim.cols;
  var x = Math.floor((e.clientX - rect.left) / cs);
  var y = Math.floor((e.clientY - rect.top) / cs);
  if (x >= 0 && x < sim.cols && y >= 0 && y < sim.rows) {
    sim.setCell(x, y, 1);
    draw();
    updateStats();
  }
});
canvas.addEventListener('mouseup', function () { isDragging = false; updateChart(); });
canvas.addEventListener('mouseleave', function () { isDragging = false; updateChart(); });

// Touch support
canvas.addEventListener('touchstart', function (e) {
  e.preventDefault();
  isDragging = true;
  var rect = canvas.getBoundingClientRect();
  var cs = rect.width / sim.cols;
  for (var i = 0; i < e.touches.length; i++) {
    var x = Math.floor((e.touches[i].clientX - rect.left) / cs);
    var y = Math.floor((e.touches[i].clientY - rect.top) / cs);
    if (x >= 0 && x < sim.cols && y >= 0 && y < sim.rows) {
      sim.setCell(x, y, 1);
    }
  }
  draw();
  updateStats();
});
canvas.addEventListener('touchmove', function (e) {
  e.preventDefault();
  if (!isDragging) return;
  var rect = canvas.getBoundingClientRect();
  var cs = rect.width / sim.cols;
  for (var i = 0; i < e.touches.length; i++) {
    var x = Math.floor((e.touches[i].clientX - rect.left) / cs);
    var y = Math.floor((e.touches[i].clientY - rect.top) / cs);
    if (x >= 0 && x < sim.cols && y >= 0 && y < sim.rows) {
      sim.setCell(x, y, 1);
    }
  }
  draw();
  updateStats();
});
canvas.addEventListener('touchend', function () { isDragging = false; updateChart(); });

btnPlay.addEventListener('click', togglePlay);
btnStep.addEventListener('click', function () {
  pause();
  sim.step();
  draw();
  updateStats();
  updateChart();
});
btnClear.addEventListener('click', function () {
  pause();
  sim.clear();
  draw();
  updateStats();
  updateChart();
});
btnRandom.addEventListener('click', function () {
  pause();
  var density = parseFloat(sliderDensity.value);
  sim.randomFill(density);
  draw();
  updateStats();
  updateChart();
  submitPattern('random');
});
btnFaster.addEventListener('click', function () {
  speedMult = speedMult >= 16 ? 1 : speedMult * 2;
  var genPerSec = 10 * speedMult;
  btnFaster.textContent = genPerSec + '代/秒';
  lastTimestamp = 0;
  genAccumulator = 0;
});
selectPattern.addEventListener('change', placePattern);

sliderCols.addEventListener('input', function () {
  lblCols.textContent = sliderCols.value;
});
sliderCols.addEventListener('change', reset);

sliderRows.addEventListener('input', function () {
  lblRows.textContent = sliderRows.value;
});
sliderRows.addEventListener('change', reset);

sliderDensity.addEventListener('input', function () {
  document.getElementById('lblDensityVal').textContent = Math.round(sliderDensity.value * 100) + '%';
});

window.addEventListener('resize', function () {
  resizeCanvas();
  draw();
});

// Keyboard shortcuts
document.addEventListener('keydown', function (e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  switch (e.key) {
    case ' ': e.preventDefault(); togglePlay(); break;
    case 'ArrowRight': e.preventDefault(); if (!running) { sim.step(); draw(); updateStats(); updateChart(); } break;
  }
});

initSim();
resizeCanvas();
buildChart();
draw();
updateStats();
updateChart();

// ========== 后端 API ==========
var API_BASE = 'https://numfeel-api.996.ninja/game-of-life';

function submitPattern(patternKey) {
  fetch(API_BASE + '/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      patternKey: patternKey,
      gridData: '[]',
      gridCols: sim.cols,
      gridRows: sim.rows,
      description: ''
    })
  }).then(function (r) { return r.json(); })
    .then(function () { loadGlobalStats(); })
    .catch(function () {});
}

function loadGlobalStats() {
  var section = document.getElementById('globalStatsSection');
  fetch(API_BASE + '/stats')
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (res.status !== 200) return;
      var d = res.data;
      section.style.display = '';
      document.getElementById('globalTotal').textContent = d.total.toLocaleString();
      document.getElementById('globalGlider').textContent = (d.patternCounts.glider || 0).toLocaleString();
      document.getElementById('globalAcorn').textContent = (d.patternCounts.acorn || 0).toLocaleString();
      document.getElementById('globalRandom').textContent = (d.patternCounts.random || 0).toLocaleString();
      var other = 0;
      Object.keys(d.patternCounts).forEach(function (k) {
        if (k !== 'glider' && k !== 'acorn' && k !== 'random') other += d.patternCounts[k];
      });
      document.getElementById('globalOther').textContent = other.toLocaleString();
      document.getElementById('globalStatsHint').textContent = '';
    })
    .catch(function () {
      document.getElementById('globalStatsHint').textContent = '统计加载失败';
    });
}

loadGlobalStats();

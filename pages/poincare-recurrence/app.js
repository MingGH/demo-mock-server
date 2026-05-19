'use strict';

// ── DOM refs
var canvas = document.getElementById('simCanvas');
var ctx = canvas.getContext('2d');
var btnPlay    = document.getElementById('btnPlay');
var btnReset   = document.getElementById('btnReset');
var btnFaster  = document.getElementById('btnFaster');
var btnStrict  = document.getElementById('btnStrict');
var sliderN    = document.getElementById('sliderN');
var lblN       = document.getElementById('lblN');
var lblSteps   = document.getElementById('lblSteps');
var lblRecur   = document.getElementById('lblRecur');
var lblConc    = document.getElementById('lblConc');
var lblPeriod  = document.getElementById('lblPeriod');
var lblObsPeriod  = document.getElementById('lblObsPeriod');
var lblRecurRegion = document.getElementById('lblRecurRegion');
var concLabel       = document.getElementById('concLabel');
var regionRadios  = document.getElementsByName('region');
var recurrenceLabel = document.getElementById('recurrenceLabel');
var recurrenceHint  = document.getElementById('recurrenceHint');

// ── Box dimensions (logical)
var BOX_W = 500;
var BOX_H = 340;
var DPR = window.devicePixelRatio || 1;

// ── Simulation & state
var sim;
var animId = null;
var running = false;
var speedMult = 1;
var strictMode = false;

// ── Chart
var concChart;

// ── Colors
var PARTICLE_COLORS = [
  '#ff6b6b', '#51cf66', '#339af0', '#fcc419', '#cc5de8',
  '#ff922b', '#20c997', '#f06595', '#748ffc', '#fcc419',
  '#ff6b6b', '#94d82d', '#4dabf7', '#f783ac', '#ffd43b',
  '#63e6be', '#da77f2', '#ffa94d', '#69db7c', '#e599f7'
];

function getRegionKey() {
  for (var i = 0; i < regionRadios.length; i++) {
    if (regionRadios[i].checked) return regionRadios[i].value;
  }
  return 'left-half';
}

function numParticles() {
  return parseInt(sliderN.value, 10);
}

function buildSim() {
  var n = numParticles();
  var region = getRegionKey();
  sim = new ParticleSimulation(n, region, BOX_W, BOX_H);
  sim.strictMode = strictMode;
  lblN.textContent = n;
  updateStrictUI();
}

// ── Canvas sizing
function resizeCanvas() {
  var rect = canvas.parentElement.getBoundingClientRect();
  var w = rect.width;
  canvas.width = w * DPR;
  canvas.height = (BOX_H / BOX_W) * w * DPR;
  canvas.style.width = w + 'px';
  canvas.style.height = ((BOX_H / BOX_W) * w) + 'px';
}

// ── Drawing
function draw() {
  var w = canvas.width;
  var h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  var sx = w / BOX_W;
  var sy = h / BOX_H;

  // Box background
  ctx.fillStyle = 'rgba(15, 15, 35, 0.95)';
  ctx.fillRect(0, 0, w, h);

  // Box border
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5 * DPR;
  ctx.strokeRect(2, 2, w - 4, h - 4);

  // Initial region highlight (always show)
  var b = regionBounds(sim.regionKey, BOX_W, BOX_H);
  ctx.fillStyle = 'rgba(251, 191, 36, 0.08)';
  ctx.fillRect(b.xMin * sx, b.yMin * sy, (b.xMax - b.xMin) * sx, (b.yMax - b.yMin) * sy);
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.35)';
  ctx.setLineDash([6 * DPR, 4 * DPR]);
  ctx.lineWidth = 1 * DPR;
  ctx.strokeRect(b.xMin * sx + 1, b.yMin * sy + 1, (b.xMax - b.xMin) * sx - 2, (b.yMax - b.yMin) * sy - 2);
  ctx.setLineDash([]);

  // Region label
  var rPreset = REGION_PRESETS[sim.regionKey];
  ctx.font = (11 * DPR) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillStyle = 'rgba(251,191,36,0.55)';
  ctx.textAlign = 'center';
  ctx.fillText('初始区域 ' + rPreset.label, (b.xMin + b.xMax) / 2 * sx, (b.yMin - 6) * sy);

  // Strict mode: draw initial position markers
  if (strictMode) {
    var epsPx = sim.epsilon * sx;
    for (var i = 0; i < sim.particles.length; i++) {
      var pi = sim.particles[i];
      var ix = pi.x0 * sx;
      var iy = pi.y0 * sy;
      // Epsilon circle
      ctx.beginPath();
      ctx.arc(ix, iy, epsPx, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 0.5 * DPR;
      ctx.setLineDash([3 * DPR, 3 * DPR]);
      ctx.stroke();
      ctx.setLineDash([]);
      // Small dot at initial position
      ctx.beginPath();
      ctx.arc(ix, iy, 2.5 * DPR, 0, Math.PI * 2);
      ctx.fillStyle = PARTICLE_COLORS[i % PARTICLE_COLORS.length];
      ctx.globalAlpha = 0.4;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // Particles
  var baseR = Math.max(5, 25 / Math.sqrt(sim.numParticles)) * DPR;
  for (var i = 0; i < sim.particles.length; i++) {
    var p = sim.particles[i];
    var px = p.x * sx;
    var py = p.y * sy;

    // Determine if particle is "home"
    var isHome;
    if (strictMode) {
      var dx = p.x - p.x0;
      var dy = p.y - p.y0;
      isHome = (dx * dx + dy * dy) <= (sim.epsilon * sim.epsilon);
    } else {
      isHome = (p.x >= b.xMin && p.x <= b.xMax && p.y >= b.yMin && p.y <= b.yMax);
    }

    var color = PARTICLE_COLORS[i % PARTICLE_COLORS.length];

    if (isHome) {
      // Glow
      ctx.beginPath();
      ctx.arc(px, py, baseR * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(251,191,36,0.18)';
      ctx.fill();
    }

    // Core
    var grad = ctx.createRadialGradient(px, py, 0, px, py, baseR);
    grad.addColorStop(0, isHome ? '#fff' : color);
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(px, py, baseR, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Border
    ctx.beginPath();
    ctx.arc(px, py, baseR, 0, Math.PI * 2);
    ctx.strokeStyle = isHome ? 'rgba(251,191,36,0.8)' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.7 * DPR;
    ctx.stroke();
  }
}

// ── Stats update
function updateStats() {
  var conc = sim.getConcentration();
  lblSteps.textContent = sim.step.toLocaleString();
  lblRecur.textContent = sim.currentRecurrenceSteps().length;
  lblConc.textContent = formatPercent(conc);
  lblPeriod.textContent = formatLarge(sim.theoreticalPeriod());
  var obs = sim.observedAvgPeriod();
  lblObsPeriod.textContent = obs ? formatLarge(Math.round(obs)) : '尚无';
  // Also show region recurrences as secondary info
  if (lblRecurRegion) {
    lblRecurRegion.textContent = sim.regionRecurrenceSteps.length;
  }
}

// ── Strict mode toggle
function toggleStrict() {
  strictMode = !strictMode;
  sim.strictMode = strictMode;
  updateStrictUI();
  draw();
  updateStats();
}

function updateStrictUI() {
  if (strictMode) {
    btnStrict.textContent = '⏺ 精确模式';
    btnStrict.style.background = 'rgba(251,191,36,0.18)';
    btnStrict.style.border = '1px solid rgba(251,191,36,0.5)';
    btnStrict.style.color = '#fbbf24';
    recurrenceLabel.textContent = '回归次数 (精确)';
    recurrenceHint.textContent = '回到初始位置 ε=' + sim.epsilon + ' 内';
    concLabel.textContent = '精确回归占比';
  } else {
    btnStrict.textContent = '◯ 区域模式';
    btnStrict.style.background = 'rgba(255,255,255,0.08)';
    btnStrict.style.border = '1px solid rgba(255,255,255,0.18)';
    btnStrict.style.color = '#e8e8e8';
    recurrenceLabel.textContent = '回归次数 (区域)';
    recurrenceHint.textContent = '所有粒子回到初始区域';
    concLabel.textContent = '区域占比';
  }
}

// ── Chart
function buildChart() {
  var ctx2 = document.getElementById('concChart').getContext('2d');
  concChart = new Chart(ctx2, {
    type: 'line',
    data: {
      datasets: [{
        label: '初始区域占比',
        borderColor: '#fbbf24',
        backgroundColor: 'rgba(251,191,36,0.08)',
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
          title: { display: true, text: '步数', color: '#a0a0a0' },
          ticks: { color: '#888', maxTicksLimit: 6 },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        y: {
          min: 0, max: 1,
          title: { display: true, text: '占比', color: '#a0a0a0' },
          ticks: { color: '#888', callback: function (v) { return (v * 100).toFixed(0) + '%'; } },
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
  if (!concChart) return;
  var data = sim.history;
  concChart.data.labels = data.map(function (d) { return d.step; });
  // Chart always shows region concentration for visual consistency
  concChart.data.datasets[0].data = data.map(function (d) { return d.regionConc; });
  concChart.data.datasets[0].label = '区域浓度 (参考)';
  concChart.update('none');
}

// ── Animation loop
function loop() {
  if (!running) return;
  sim.stepMany(speedMult);
  draw();
  updateStats();
  if (sim.step % Math.max(3, speedMult) === 0) updateChart();
  animId = requestAnimationFrame(loop);
}

function start() {
  if (running) return;
  running = true;
  btnPlay.textContent = '⏸ 暂停';
  animId = requestAnimationFrame(loop);
}

function pause() {
  running = false;
  btnPlay.textContent = '▶ 开始';
  if (animId) { cancelAnimationFrame(animId); animId = null; }
  updateChart();
}

function togglePlay() {
  if (running) pause(); else start();
}

function reset() {
  pause();
  buildSim();
  draw();
  updateStats();
  updateChart();
}

function changeParticles() {
  pause();
  buildSim();
  draw();
  updateStats();
  updateChart();
}

// ── Event bindings
btnPlay.addEventListener('click', togglePlay);
btnReset.addEventListener('click', reset);
btnStrict.addEventListener('click', toggleStrict);
btnFaster.addEventListener('click', function () {
  speedMult = speedMult >= 16 ? 1 : speedMult * 2;
  btnFaster.textContent = speedMult + 'x';
});
sliderN.addEventListener('input', changeParticles);

for (var i = 0; i < regionRadios.length; i++) {
  regionRadios[i].addEventListener('change', function () {
    pause();
    buildSim();
    draw();
    updateStats();
    updateChart();
  });
}

window.addEventListener('resize', function () {
  resizeCanvas();
  draw();
});

// ── Init
resizeCanvas();
buildChart();
buildSim();
draw();
updateStats();

// Start animation automatically
start();

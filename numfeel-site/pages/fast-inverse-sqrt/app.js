// ========== 平方根倒数速算法 - 页面交互逻辑 ==========

// ── 状态 ──
var currentX = 2;
var currentStep = 0;
var stepData = [];
var isPlaying = false;
var playTimer = null;
var accuracyChart = null;
var constScanChart = null;
var activeIters = { 0: true, 1: true, 2: false };

// ── 对数滑块映射 (0~1000 -> 0.01~1000) ──
var SLIDER_MAX = 1000;

function sliderToX(val) {
  return Math.pow(10, -2 + 5 * val / SLIDER_MAX);
}

function xToSlider(x) {
  if (x <= 0) return 0;
  var v = SLIDER_MAX * (Math.log10(x) + 2) / 5;
  return Math.max(0, Math.min(SLIDER_MAX, Math.round(v)));
}

// ── 初始化 ──
document.addEventListener('DOMContentLoaded', function() {
  initBitDisplay();
  initStepDots();
  attachEvents();
  updateX(2, true);
  evalCustomConstant();
  var defaultChip = document.querySelector('.chip[data-x="2"]');
  if (defaultChip) defaultChip.classList.add('active');
  ensureChartJS(function() {
    renderAccuracyChart();
    renderConstScanChart();
  });
});

// ── 预设值高亮 ──
function setActiveChip(chip) {
  document.querySelectorAll('.chip').forEach(function(c) { c.classList.remove('active'); });
  chip.classList.add('active');
}

function clearActiveChips() {
  document.querySelectorAll('.chip').forEach(function(c) { c.classList.remove('active'); });
}

// ── 事件绑定 ──
function attachEvents() {
  // 滑块
  var slider = document.getElementById('xSlider');
  slider.addEventListener('input', function() {
    var x = sliderToX(parseFloat(slider.value));
    clearActiveChips();
    updateX(x, false);
  });

  // 精确输入
  var input = document.getElementById('xInput');
  input.addEventListener('input', function() {
    var v = parseFloat(input.value);
    if (v > 0) {
      clearActiveChips();
      updateX(v, true);
    }
  });

  // 预设值
  var chips = document.querySelectorAll('.chip');
  chips.forEach(function(chip) {
    chip.addEventListener('click', function() {
      var x = parseFloat(chip.dataset.x);
      setActiveChip(chip);
      updateX(x, true);
    });
  });

  // 分解控制
  document.getElementById('playBtn').addEventListener('click', togglePlay);
  document.getElementById('prevBtn').addEventListener('click', function() {
    stopPlay();
    goToStep(Math.max(0, currentStep - 1));
  });
  document.getElementById('nextBtn').addEventListener('click', function() {
    stopPlay();
    goToStep(Math.min(5, currentStep + 1));
  });

  // 精度扫描开关
  var toggles = document.querySelectorAll('.toggle-btn');
  toggles.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var iter = parseInt(btn.dataset.iter);
      activeIters[iter] = !activeIters[iter];
      btn.classList.toggle('active');
      updateAccuracyChart();
    });
  });

  // 常数评估
  document.getElementById('evalConstBtn').addEventListener('click', evalCustomConstant);
  document.getElementById('constInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') evalCustomConstant();
  });
}

// ── 更新 x 值（核心联动）──
function updateX(x, syncSlider) {
  stopPlay();
  currentX = x;
  stepData = decomposeSteps(x);

  // 同步滑块和输入框
  if (syncSlider) {
    document.getElementById('xSlider').value = xToSlider(x);
  }
  document.getElementById('xSliderVal').textContent = formatValue(x, 2);
  document.getElementById('xInput').value = parseFloat(x.toFixed(6));

  // 更新结果卡片
  updateResultCards(x);

  // 更新分解显示（不动画，直接跳到当前步）
  goToStep(currentStep, true);

  // 更新牛顿对比
  renderNewtonBars(x);

  // 更新精度图表的当前点标记
  if (accuracyChart) {
    accuracyChart.update('none');
  }
}

// ── 结果卡片 ──
function updateResultCards(x) {
  var exact = exactInverseSqrt(x);
  var fast = fastInverseSqrt(x, 1);
  var err = relativeError(fast, exact);
  var level = errorLevel(err);

  document.getElementById('exactValue').textContent = formatValue(exact, 6);
  document.getElementById('fastValue').textContent = formatValue(fast, 6);
  document.getElementById('errorValue').textContent = err.toFixed(4) + '%';

  // 误差卡片颜色
  var card = document.getElementById('errorCard');
  card.className = 'result-card error level-' + level;

  var badge = document.getElementById('errorBadge');
  badge.className = 'card-badge ' + level;
  badge.textContent = level;

  // 数值变化时的微闪动画
  if (window.gsap) {
    gsap.fromTo('#fastValue', { scale: 1.08 }, { scale: 1, duration: 0.25, ease: 'power2.out' });
    gsap.fromTo('#errorValue', { scale: 1.08 }, { scale: 1, duration: 0.25, ease: 'power2.out' });
  }
}

// ── 比特显示初始化 ──
function initBitDisplay() {
  var display = document.getElementById('bitDisplay');
  display.innerHTML = '';
  for (var i = 0; i < 32; i++) {
    var cell = document.createElement('div');
    cell.className = 'bit-cell bit-0';
    if (i === 0) cell.classList.add('sgn');
    else if (i >= 1 && i <= 8) cell.classList.add('exp');
    else cell.classList.add('mnt');
    if (i === 0 || i === 8) cell.classList.add('sep');
    cell.textContent = '0';
    display.appendChild(cell);
  }
}

// ── 步骤圆点初始化 ──
function initStepDots() {
  var container = document.getElementById('stepDots');
  container.innerHTML = '';
  for (var i = 0; i <= 5; i++) {
    var dot = document.createElement('div');
    dot.className = 'step-dot';
    dot.dataset.step = i;
    dot.addEventListener('click', function() {
      stopPlay();
      goToStep(parseInt(this.dataset.step));
    });
    container.appendChild(dot);
  }
}

// ── 更新比特显示 ──
function updateBitDisplay(binary, animate) {
  var cells = document.querySelectorAll('.bit-cell');
  for (var i = 0; i < 32; i++) {
    var cell = cells[i];
    var newVal = binary[i];
    var oldVal = cell.textContent;

    if (newVal !== oldVal) {
      cell.textContent = newVal;
      cell.classList.remove('bit-0', 'bit-1');
      cell.classList.add('bit-' + newVal);
      if (animate && window.gsap) {
        cell.classList.add('changed');
        gsap.fromTo(cell,
          { scale: 0.3, opacity: 0.2 },
          { scale: 1.15, opacity: 1, duration: 0.35, delay: i * 0.012, ease: 'back.out(2.5)',
            onComplete: (function(c) {
              return function() {
                gsap.to(c, { scale: 1, duration: 0.2, ease: 'power2.out' });
                c.classList.remove('changed');
              };
            })(cell)
          }
        );
      }
    }
  }
}

// ── 跳转到指定步骤 ──
function goToStep(step, instant) {
  currentStep = step;
  var data = stepData[step];
  if (!data) return;

  // 更新步骤信息
  document.getElementById('stepNumber').textContent = 'Step ' + step;
  document.getElementById('stepTitle').textContent = data.title;
  document.getElementById('stepDesc').textContent = data.description;
  document.getElementById('stepFloat').textContent = formatValue(data.floatVal, 6);
  document.getElementById('stepInt').textContent = data.intVal.toLocaleString();
  document.getElementById('stepHex').textContent = data.hex;
  document.getElementById('stepIndicator').textContent = step + ' / 5';

  // 误差框（仅步骤4和5显示）
  var errBox = document.getElementById('stepErrorBox');
  if (step >= 4) {
    var exact = exactInverseSqrt(currentX);
    var err = relativeError(data.floatVal, exact);
    errBox.style.display = 'block';
    document.getElementById('stepError').textContent = err.toFixed(4) + '%';
  } else {
    errBox.style.display = 'none';
  }

  // 更新比特
  updateBitDisplay(data.binary, !instant);

  // 更新步骤圆点
  var dots = document.querySelectorAll('.step-dot');
  dots.forEach(function(dot, idx) {
    dot.className = 'step-dot';
    if (idx === step) dot.classList.add('active');
    else if (idx < step) dot.classList.add('done');
  });

  // 步骤标题动画
  if (!instant && window.gsap) {
    gsap.fromTo('#stepTitle', { y: -8, opacity: 0.5 }, { y: 0, opacity: 1, duration: 0.3, ease: 'power2.out' });
    gsap.fromTo('#stepDesc', { y: -5, opacity: 0.3 }, { y: 0, opacity: 1, duration: 0.3, delay: 0.05, ease: 'power2.out' });
  }
}

// ── 播放控制 ──
function togglePlay() {
  if (isPlaying) {
    stopPlay();
  } else {
    startPlay();
  }
}

function startPlay() {
  isPlaying = true;
  var btn = document.getElementById('playBtn');
  btn.innerHTML = '<i class="ti ti-player-pause"></i> 暂停';

  // 如果在最后一步，从头开始
  if (currentStep >= 5) {
    goToStep(0);
  }

  playTimer = setInterval(function() {
    if (currentStep >= 5) {
      stopPlay();
      return;
    }
    goToStep(currentStep + 1);
  }, 1800);
}

function stopPlay() {
  if (!isPlaying && !playTimer) return;
  isPlaying = false;
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
  var btn = document.getElementById('playBtn');
  btn.innerHTML = '<i class="ti ti-player-play"></i> 播放';
}

// ── 牛顿迭代对比条 ──
function renderNewtonBars(x) {
  var exact = exactInverseSqrt(x);
  var y0 = fastInverseSqrtBitOnly(x);
  var y1 = newtonStep(x, y0);
  var y2 = newtonStep(x, y1);
  var err0 = relativeError(y0, exact);
  var err1 = relativeError(y1, exact);
  var err2 = relativeError(y2, exact);
  var maxErr = Math.max(err0, 0.001);

  var bars = [
    { label: '仅位运算', err: err0, cls: 'f0' },
    { label: '+1次牛顿', err: err1, cls: 'f1' },
    { label: '+2次牛顿', err: err2, cls: 'f2' }
  ];

  var container = document.getElementById('newtonBars');
  container.innerHTML = '';
  bars.forEach(function(bar) {
    var width = Math.max(1, (bar.err / maxErr) * 100);
    var row = document.createElement('div');
    row.className = 'newton-bar';
    row.innerHTML =
      '<span class="nb-label">' + bar.label + '</span>' +
      '<div class="nb-track">' +
        '<div class="nb-fill ' + bar.cls + '" style="width:' + width.toFixed(1) + '%">' +
          bar.err.toFixed(4) + '%' +
        '</div>' +
      '</div>';
    container.appendChild(row);

    // 动画
    if (window.gsap) {
      var fill = row.querySelector('.nb-fill');
      gsap.fromTo(fill, { width: '0%' }, { width: width.toFixed(1) + '%', duration: 0.6, ease: 'power2.out' });
    }
  });
}

// ── 精度扫描图表 ──
function renderAccuracyChart() {
  var ctx = document.getElementById('accuracyChart').getContext('2d');
  var samples = batchAccuracy(0.01, 1000, 200, 0);
  var samples1 = batchAccuracy(0.01, 1000, 200, 1);
  var samples2 = batchAccuracy(0.01, 1000, 200, 2);

  var labels = samples.map(function(s) { return s.x; });

  accuracyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: '仅位运算',
          data: samples.map(function(s) { return s.error; }),
          borderColor: 'rgba(255,107,107,0.8)',
          backgroundColor: 'rgba(255,107,107,0.1)',
          borderWidth: 1.5, pointRadius: 0, tension: 0.3,
          hidden: !activeIters[0]
        },
        {
          label: '+1次牛顿',
          data: samples1.map(function(s) { return s.error; }),
          borderColor: 'rgba(255,193,7,0.8)',
          backgroundColor: 'rgba(255,193,7,0.1)',
          borderWidth: 1.5, pointRadius: 0, tension: 0.3,
          hidden: !activeIters[1]
        },
        {
          label: '+2次牛顿',
          data: samples2.map(function(s) { return s.error; }),
          borderColor: 'rgba(129,199,132,0.8)',
          backgroundColor: 'rgba(129,199,132,0.1)',
          borderWidth: 1.5, pointRadius: 0, tension: 0.3,
          hidden: !activeIters[2]
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#a0a0a0', usePointStyle: true, pointStyle: 'circle' } },
        tooltip: {
          callbacks: {
            title: function(items) { return 'x = ' + parseFloat(items[0].label).toFixed(4); },
            label: function(item) { return item.dataset.label + ': ' + item.raw.toFixed(4) + '%'; }
          }
        }
      },
      scales: {
        x: {
          type: 'logarithmic',
          title: { display: true, text: 'x 值（对数轴）', color: '#666' },
          ticks: { color: '#666' },
          grid: { color: 'rgba(255,255,255,0.04)' }
        },
        y: {
          type: 'logarithmic',
          title: { display: true, text: '相对误差 %（对数轴）', color: '#666' },
          ticks: { color: '#666', callback: function(v) { return v.toFixed(2) + '%'; } },
          grid: { color: 'rgba(255,255,255,0.04)' }
        }
      }
    }
  });

  updateScanStats(samples, samples1, samples2);
}

function updateAccuracyChart() {
  if (!accuracyChart) return;
  accuracyChart.data.datasets[0].hidden = !activeIters[0];
  accuracyChart.data.datasets[1].hidden = !activeIters[1];
  accuracyChart.data.datasets[2].hidden = !activeIters[2];
  accuracyChart.update();
}

function updateScanStats(s0, s1, s2) {
  var max0 = Math.max.apply(null, s0.map(function(s) { return s.error; }));
  var max1 = Math.max.apply(null, s1.map(function(s) { return s.error; }));
  var max2 = Math.max.apply(null, s2.map(function(s) { return s.error; }));
  var avg0 = s0.reduce(function(a, b) { return a + b.error; }, 0) / s0.length;
  var avg1 = s1.reduce(function(a, b) { return a + b.error; }, 0) / s1.length;

  var container = document.getElementById('scanStats');
  container.innerHTML =
    '<div class="scan-stat"><div class="ss-val">' + max0.toFixed(3) + '%</div><div class="ss-lbl">仅位运算 最大误差</div></div>' +
    '<div class="scan-stat"><div class="ss-val">' + max1.toFixed(4) + '%</div><div class="ss-lbl">+1次牛顿 最大误差</div></div>' +
    '<div class="scan-stat"><div class="ss-val">' + max2.toFixed(6) + '%</div><div class="ss-lbl">+2次牛顿 最大误差</div></div>' +
    '<div class="scan-stat"><div class="ss-val">' + avg0.toFixed(3) + '%</div><div class="ss-lbl">位运算 平均误差</div></div>' +
    '<div class="scan-stat"><div class="ss-val">' + avg1.toFixed(4) + '%</div><div class="ss-lbl">+1牛顿 平均误差</div></div>';
}

// ── 魔法常数扫描图表 ──
function renderConstScanChart() {
  var scanData = scanConstants(MAGIC_CONSTANT, 128);
  var ctx = document.getElementById('constScanChart').getContext('2d');

  var labels = scanData.map(function(s) { return s.offset; });
  var data = scanData.map(function(s) { return s.maxError; });
  var colors = scanData.map(function(s) {
    return s.offset === 0 ? 'rgba(255,215,0,0.9)' : 'rgba(144,202,249,0.5)';
  });
  var borderColors = scanData.map(function(s) {
    return s.offset === 0 ? '#ffd700' : 'rgba(144,202,249,0.7)';
  });

  constScanChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '最大误差 %',
        data: data,
        backgroundColor: colors,
        borderColor: borderColors,
        borderWidth: 1
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function(items) {
              var off = parseInt(items[0].label);
              var hex = '0x' + (MAGIC_CONSTANT + off >>> 0).toString(16);
              return '偏移 ' + (off >= 0 ? '+' : '') + off + '  (' + hex + ')';
            },
            label: function(item) { return '最大误差: ' + item.raw.toFixed(4) + '%'; }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: '相对 0x5f3759df 的偏移', color: '#666' },
          ticks: { color: '#666', maxTicksLimit: 12 },
          grid: { display: false }
        },
        y: {
          title: { display: true, text: '最大误差 %', color: '#666' },
          ticks: { color: '#666', callback: function(v) { return v.toFixed(2) + '%'; } },
          grid: { color: 'rgba(255,255,255,0.04)' }
        }
      }
    }
  });
}

// ── 评估自定义常数 ──
function evalCustomConstant() {
  var input = document.getElementById('constInput');
  var hexStr = input.value.trim().replace(/^0x/i, '');
  var constant = parseInt(hexStr, 16);
  if (isNaN(constant)) {
    showConstResult(null, '无效的十六进制值');
    return;
  }

  var result = evaluateConstant(constant, 200);
  var magicResult = evaluateConstant(MAGIC_CONSTANT, 200);

  var comparison = '';
  if (constant === MAGIC_CONSTANT) {
    comparison = '这就是 Quake III 原版魔法常数';
  } else if (result.maxError < magicResult.maxError) {
    comparison = '比原版常数更优！';
  } else if (result.maxError < magicResult.maxError * 1.2) {
    comparison = '与原版常数接近';
  } else {
    comparison = '比原版常数差 ' + (result.maxError / magicResult.maxError).toFixed(1) + ' 倍';
  }

  showConstResult({
    constant: constant,
    hex: '0x' + (constant >>> 0).toString(16),
    maxError: result.maxError,
    avgError: result.avgError,
    comparison: comparison
  }, null);
}

function showConstResult(data, error) {
  var container = document.getElementById('constResult');
  if (error) {
    container.innerHTML = '<div class="const-stat"><div class="cs-val" style="color:#ff6b6b">' + error + '</div></div>';
    return;
  }
  container.innerHTML =
    '<div class="const-stat"><div class="cs-val">' + data.hex + '</div><div class="cs-lbl">当前常数</div></div>' +
    '<div class="const-stat"><div class="cs-val">' + data.maxError.toFixed(4) + '%</div><div class="cs-lbl">最大误差</div></div>' +
    '<div class="const-stat"><div class="cs-val">' + data.avgError.toFixed(4) + '%</div><div class="cs-lbl">平均误差</div></div>' +
    '<div class="const-stat"><div class="cs-val" style="font-size:0.95rem">' + data.comparison + '</div><div class="cs-lbl">对比原版</div></div>';

  if (window.gsap) {
    gsap.fromTo(container.children, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, stagger: 0.05, ease: 'power2.out' });
  }
}

// ── Chart.js 加载保障 ──
function ensureChartJS(callback) {
  if (window.Chart) {
    callback();
    return;
  }
  if (window.loadChartJS) {
    window.loadChartJS().then(callback);
  } else {
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    script.onload = callback;
    document.head.appendChild(script);
  }
}

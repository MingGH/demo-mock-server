(function() {
  'use strict';

  var API_BASE = 'https://numfeel-api.996.ninja';
  var IMG_SIZE = 64;

  // ══════ State ══════
  var sandStep = 0;
  var sandVotes = [];       // {grains, confidence}
  var colorBoundary = 50;
  var pixelRound = 0;
  var pixelScore = 0;
  var pixelRounds = [];     // {perturbCount, perturbAmount, correct}
  var sCurveChart = null;
  var crowdData = null;      // 全站每步数据（预加载）

  // ══════ Particle system ══════
  var particles = [];
  var canvas, ctx;
  var animId = null;
  var targetCount = SAND_CONFIG.startGrains;
  var currentVisualCount = SAND_CONFIG.startGrains;

  function initCanvas() {
    canvas = document.getElementById('sandCanvas');
    ctx = canvas.getContext('2d');
    canvas.width = 500;
    canvas.height = 300;
    spawnParticles(300); // 初始粒子数（视觉上的，不是真实数量）
    animLoop();
  }

  function spawnParticles(count) {
    particles = [];
    for (var i = 0; i < count; i++) {
      particles.push(createParticle());
    }
  }

  function createParticle() {
    // 堆形分布：底部宽，顶部窄
    var angle = Math.random() * Math.PI;
    var radius = Math.random();
    var x = 250 + Math.cos(angle) * radius * 160;
    var baseY = 260;
    var y = baseY - Math.sin(angle) * radius * 140;
    var hue = 35 + Math.random() * 15;
    var light = 45 + Math.random() * 20;
    return {
      x: x, y: y, baseX: x, baseY: y,
      size: 1.5 + Math.random() * 2.5,
      color: 'hsl(' + hue + ',70%,' + light + '%)',
      vx: 0, vy: 0,
      alive: true,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.02 + Math.random() * 0.03
    };
  }

  function animLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 地面线
    ctx.strokeStyle = 'rgba(255,215,0,0.1)';
    ctx.beginPath();
    ctx.moveTo(50, 270);
    ctx.lineTo(450, 270);
    ctx.stroke();

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      if (!p.alive) {
        // 飞走动画
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15; // 重力
        p.size *= 0.97;
        if (p.size < 0.3 || p.y > 350) {
          particles.splice(i, 1);
          continue;
        }
      } else {
        // 微小晃动
        p.wobble += p.wobbleSpeed;
        p.x = p.baseX + Math.sin(p.wobble) * 0.5;
        p.y = p.baseY + Math.cos(p.wobble) * 0.3;
      }

      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    animId = requestAnimationFrame(animLoop);
  }

  function removeParticles(fraction) {
    // 从顶部移除一定比例的粒子（飞散效果）
    var toRemove = Math.max(1, Math.round(particles.filter(function(p) { return p.alive; }).length * fraction));
    var alive = particles.filter(function(p) { return p.alive; });
    // 优先移除顶部的
    alive.sort(function(a, b) { return a.y - b.y; });
    for (var i = 0; i < Math.min(toRemove, alive.length); i++) {
      alive[i].alive = false;
      alive[i].vx = (Math.random() - 0.5) * 8;
      alive[i].vy = -(2 + Math.random() * 5);
    }
  }

  // ══════ Init ══════
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  function boot() {
    initCanvas();
    initSCurve();
    preloadCrowdData();
    updateSandDisplay();
  }

  // ══════ S-Curve chart ══════
  function initSCurve() {
    var el = document.getElementById('sCurveChart');
    if (!el) return;
    sCurveChart = new Chart(el.getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: '你的信心',
          data: [],
          borderColor: '#ffd700',
          backgroundColor: 'rgba(255,215,0,0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: '#ffd700',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(c) { return c.parsed.y + '% 信心'; }
            }
          }
        },
        scales: {
          y: {
            min: 0, max: 100,
            ticks: { color: '#666', callback: function(v) { return v + '%'; } },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          x: {
            ticks: { color: '#666', maxRotation: 45, font: { size: 9 } },
            grid: { display: false }
          }
        }
      }
    });
  }

  function updateSCurve() {
    if (!sCurveChart) return;
    sCurveChart.data.labels = sandVotes.map(function(v) { return v.grains.toLocaleString(); });
    sCurveChart.data.datasets[0].data = sandVotes.map(function(v) { return v.confidence; });
    // 动态颜色：根据信心值
    sCurveChart.data.datasets[0].pointBackgroundColor = sandVotes.map(function(v) {
      if (v.confidence >= 70) return '#2ecc71';
      if (v.confidence >= 40) return '#f39c12';
      return '#e74c3c';
    });
    sCurveChart.update('none');
  }

  // ══════ Preload crowd data ══════
  function preloadCrowdData() {
    fetch(API_BASE + '/sorites/stats')
      .then(function(r) { return r.json(); })
      .then(function(resp) {
        if (resp.status === 200 && resp.data) crowdData = resp.data;
      })
      .catch(function() {});
  }

  function showCrowdComparison(stepIndex) {
    var wrap = document.getElementById('crowdBarWrap');
    if (!crowdData || !crowdData.stepConfidence || stepIndex < 1) {
      wrap.classList.remove('visible');
      return;
    }
    var prevStep = stepIndex - 1;
    var pct = crowdData.stepConfidence[prevStep];
    if (pct === undefined || pct === null) {
      wrap.classList.remove('visible');
      return;
    }
    document.getElementById('crowdPct').textContent = pct + '%';
    document.getElementById('crowdFill').style.width = pct + '%';
    wrap.classList.add('visible');
  }

  // ══════ Sand experiment ══════
  function updateSandDisplay() {
    var grains = SAND_CONFIG.steps[sandStep];
    var formatted = grains.toLocaleString();

    document.getElementById('grainNum').textContent = formatted;
    document.getElementById('stepLabel').textContent = sandStep + 1;
    document.getElementById('sandQuestion').innerHTML =
      '你有多确定 <strong>' + formatted + '</strong> 粒沙子算「一堆」？';

    var pct = sandStep / SAND_CONFIG.totalSteps * 100;
    document.getElementById('sandProgress').style.width = pct + '%';

    // 提示
    var hint = '';
    if (sandStep === 0) hint = '从 100% 开始拖';
    else if (sandStep === 5) hint = '注意你的信心变化';
    else if (sandStep === 15) hint = '开始犹豫了吗？';
    else if (sandStep === 25) hint = '快到底了';
    document.getElementById('stepHint').textContent = hint;

    // 默认信心值：基于上一步递减
    var defaultConf = 95;
    if (sandVotes.length > 0) {
      var last = sandVotes[sandVotes.length - 1].confidence;
      defaultConf = Math.max(0, last - Math.round(Math.random() * 3));
    }
    document.getElementById('confidenceSlider').value = defaultConf;
    updateConfidenceDisplay();

    showCrowdComparison(sandStep);
  }

  window.updateConfidenceDisplay = function() {
    var val = parseInt(document.getElementById('confidenceSlider').value);
    document.getElementById('confidenceVal').textContent = val + '%';
  };

  window.confirmStep = function() {
    var grains = SAND_CONFIG.steps[sandStep];
    var confidence = parseInt(document.getElementById('confidenceSlider').value);

    sandVotes.push({ grains: grains, confidence: confidence });
    updateSCurve();

    // 粒子动画
    var prevGrains = sandStep > 0 ? SAND_CONFIG.steps[sandStep - 1] : SAND_CONFIG.startGrains;
    var fraction = prevGrains > 0 ? (prevGrains - grains) / prevGrains : 0;
    if (fraction > 0) removeParticles(fraction);

    sandStep++;

    if (sandStep >= SAND_CONFIG.totalSteps) {
      showSandResult();
      return;
    }

    updateSandDisplay();
  };

  function showSandResult() {
    document.getElementById('confidenceArea').style.display = 'none';
    document.getElementById('sandResult').style.display = 'block';
    document.getElementById('crowdBarWrap').classList.remove('visible');

    var result = findBoundaryFromConfidence(sandVotes);

    // 找到最低信心值
    var minConf = 100;
    sandVotes.forEach(function(v) { if (v.confidence < minConf) minConf = v.confidence; });

    // 构建结果摘要 HTML
    var summaryHTML = '<div class="result-card" style="margin-bottom:16px;">';
    summaryHTML += '<h3 style="color:#ffd700;margin-bottom:12px;"><i class="ti ti-chart-line"></i> 你的信心曲线分析</h3>';

    if (result.sharpness === 'cliff') {
      summaryHTML += '<div style="font-size:2rem;font-weight:800;color:#ffd700;margin-bottom:8px;">' + result.boundary.toLocaleString() + ' 粒</div>';
      summaryHTML += '<div style="color:#a0a0a0;">你的信心在这里断崖式下降——你内心有一条比较清晰的分界线。</div>';
    } else if (result.sharpness === 'gradual') {
      summaryHTML += '<div style="font-size:2rem;font-weight:800;color:#f39c12;margin-bottom:8px;">没有明确边界</div>';
      summaryHTML += '<div style="color:#a0a0a0;">你的信心是缓慢下降的，始终没有突然的转折。这正是悖论的体现——你画不出那条线。</div>';
    } else if (result.sharpness === 'extreme-yes') {
      summaryHTML += '<div style="font-size:2rem;font-weight:800;color:#2ecc71;margin-bottom:8px;">全程 ≥ 50%</div>';
      summaryHTML += '<div style="color:#a0a0a0;">你到最后都觉得算一堆。哲学家体质。</div>';
    } else if (result.sharpness === 'extreme-no') {
      summaryHTML += '<div style="font-size:2rem;font-weight:800;color:#e74c3c;margin-bottom:8px;">一开始就不确定</div>';
      summaryHTML += '<div style="color:#a0a0a0;">你从第一步就信心不足。严格派。</div>';
    } else {
      summaryHTML += '<div style="font-size:2rem;font-weight:800;color:#ffd700;margin-bottom:8px;">' + result.boundary.toLocaleString() + ' 粒附近</div>';
      summaryHTML += '<div style="color:#a0a0a0;">你的信心下降较快，边界比较明确。</div>';
    }

    // 小数据条
    summaryHTML += '<div style="display:flex;gap:16px;margin-top:12px;flex-wrap:wrap;">';
    summaryHTML += '<div style="text-align:center;"><div style="font-size:1.2rem;font-weight:700;color:#ffd700;">' + sandVotes[0].confidence + '%</div><div style="font-size:0.75rem;color:#666;">起始信心</div></div>';
    summaryHTML += '<div style="text-align:center;"><div style="font-size:1.2rem;font-weight:700;color:#e74c3c;">' + minConf + '%</div><div style="font-size:0.75rem;color:#666;">最低信心</div></div>';
    summaryHTML += '<div style="text-align:center;"><div style="font-size:1.2rem;font-weight:700;color:#fff;">' + sandVotes.length + '</div><div style="font-size:0.75rem;color:#666;">总步数</div></div>';
    summaryHTML += '</div>';
    summaryHTML += '</div>';

    document.getElementById('sandResultContent').innerHTML = summaryHTML;

    var hint = document.getElementById('stepHint');
    hint.textContent = '实验一完成';
  }

  // ══════ Color experiment ══════
  window.startColorExperiment = function() {
    document.getElementById('colorSection').style.display = 'block';
    document.getElementById('colorSection').scrollIntoView({ behavior: 'smooth' });
  };

  window.updateColorMarker = function() {
    var val = parseInt(document.getElementById('colorSlider').value);
    colorBoundary = val;
    document.getElementById('gradientMarker').style.left = val + '%';
    var name = colorName(val / 100);
    document.getElementById('colorLabel').textContent = val + '% — ' + name;
  };

  // ══════ Pixel challenge ══════
  window.startPixelExperiment = function() {
    document.getElementById('pixelSection').style.display = 'block';
    document.getElementById('pixelSection').scrollIntoView({ behavior: 'smooth' });
    setupPixelRound();
  };

  // 5 轮，扰动从大到小（确保每轮肉眼可辨）
  var PIXEL_LEVELS = [
    { count: 2000, amount: 120, label: '大面积篡改' },
    { count: 600,  amount: 80,  label: '明显扰动' },
    { count: 200,  amount: 60,  label: '中等扰动' },
    { count: 80,   amount: 45,  label: '轻微扰动' },
    { count: 30,   amount: 35,  label: '微小扰动' }
  ];

  function setupPixelRound() {
    var level = PIXEL_LEVELS[pixelRound];
    document.getElementById('pixelRound').textContent = pixelRound + 1;
    document.getElementById('pixelChanged').textContent = level.count;
    document.getElementById('pixelResult').style.display = 'none';
    document.getElementById('pixelNextBtn').style.display = 'none';

    var seed = 42 + pixelRound * 1000;
    var baseData = generateBaseImage(IMG_SIZE, seed);
    var perturbedData = perturbImage(baseData, IMG_SIZE, level.count, level.amount, seed + 7);

    // 随机左右位置
    var originalOnLeft = Math.random() > 0.5;
    var leftData = originalOnLeft ? baseData : perturbedData;
    var rightData = originalOnLeft ? perturbedData : baseData;

    var pair = document.getElementById('pixelPair');
    pair.innerHTML = '';

    var leftCard = makePixelCard(leftData, 'A', function() { pickPixel('A', originalOnLeft ? 'original' : 'perturbed'); });
    var rightCard = makePixelCard(rightData, 'B', function() { pickPixel('B', originalOnLeft ? 'perturbed' : 'original'); });

    pair.appendChild(leftCard);
    pair.appendChild(rightCard);

    // 存储当前轮信息
    pixelRounds[pixelRound] = {
      level: level,
      originalOnLeft: originalOnLeft,
      diff: imageDiffPercent(baseData, perturbedData, IMG_SIZE),
      picked: null
    };
  }

  function makePixelCard(imageData, label, onClick) {
    var card = document.createElement('div');
    card.className = 'pixel-card';
    card.setAttribute('data-label', label);

    var cvs = document.createElement('canvas');
    cvs.width = IMG_SIZE;
    cvs.height = IMG_SIZE;
    cvs.style.width = '128px';
    cvs.style.height = '128px';
    var c = cvs.getContext('2d');
    var imgData = c.createImageData(IMG_SIZE, IMG_SIZE);
    imgData.data.set(imageData);
    c.putImageData(imgData, 0, 0);

    var lbl = document.createElement('div');
    lbl.className = 'pixel-label';
    lbl.textContent = '图 ' + label;

    card.appendChild(cvs);
    card.appendChild(lbl);
    card.addEventListener('click', onClick);
    return card;
  }

  function pickPixel(label, type) {
    if (pixelRounds[pixelRound].picked !== null) return;
    pixelRounds[pixelRound].picked = label;

    var isCorrect = type === 'perturbed';
    if (isCorrect) pixelScore++;

    // 高亮选中
    var cards = document.querySelectorAll('.pixel-card');
    cards.forEach(function(c) {
      if (c.getAttribute('data-label') === label) c.classList.add('selected');
    });

    var result = document.getElementById('pixelResult');
    var diff = pixelRounds[pixelRound].diff;
    // 智能格式化：确保显示有意义的数字
    var diffStr;
    if (diff >= 1) diffStr = diff.toFixed(1) + '%';
    else if (diff >= 0.01) diffStr = diff.toFixed(2) + '%';
    else if (diff >= 0.001) diffStr = diff.toFixed(3) + '%';
    else diffStr = diff.toFixed(4) + '%';
    // 同时显示实际改动的像素数占总像素的比例
    var totalPixels = IMG_SIZE * IMG_SIZE;
    var changedPct = (pixelRounds[pixelRound].level.count / totalPixels * 100).toFixed(1);

    if (isCorrect) {
      result.className = 'pixel-result correct';
      result.innerHTML = '<i class="ti ti-check"></i> 正确！改了 ' + pixelRounds[pixelRound].level.count + '/' + totalPixels + ' 个像素（' + changedPct + '%），色差 ' + diffStr;
    } else {
      result.className = 'pixel-result wrong';
      result.innerHTML = '<i class="ti ti-x"></i> 选反了。改了 ' + pixelRounds[pixelRound].level.count + '/' + totalPixels + ' 个像素（' + changedPct + '%），色差 ' + diffStr;
    }
    result.style.display = 'block';

    pixelRound++;
    if (pixelRound >= 5) {
      document.getElementById('pixelDone').style.display = 'block';
      document.getElementById('pixelNextBtn').style.display = 'none';
    } else {
      document.getElementById('pixelNextBtn').style.display = 'inline-flex';
    }
  }

  window.nextPixelRound = function() {
    setupPixelRound();
  };

  // ══════ Submit all ══════
  window.submitAllResults = function() {
    var sandResult = findBoundaryFromConfidence(sandVotes);
    var userType = classifyUser(sandResult.boundary, colorBoundary, pixelScore);

    // Show final section
    document.getElementById('finalSection').style.display = 'block';
    document.getElementById('finalSection').scrollIntoView({ behavior: 'smooth' });

    // Share card
    document.getElementById('cardHeadline').textContent = userType.emoji + ' ' + userType.type;
    document.getElementById('cardSand').textContent = sandResult.boundary.toLocaleString() + ' 粒';
    document.getElementById('cardColor').textContent = colorBoundary + '%';
    document.getElementById('cardPixel').textContent = pixelScore + '/5';
    document.getElementById('cardType').textContent = userType.desc;

    // Insight
    var lines = [];
    if (sandResult.sharpness === 'cliff') {
      lines.push('你的信心曲线有一个明显的断崖，说明你内心有一条比较清晰的分界线。');
    } else if (sandResult.sharpness === 'gradual') {
      lines.push('你的信心是缓慢下降的，没有突然的转折——你天然地感受到了边界的模糊性。');
    } else {
      lines.push('你的信心下降比较快，但不是断崖式的。');
    }

    if (pixelScore >= 4) {
      lines.push('像素挑战你答对了 ' + pixelScore + '/5，眼力不错。但最后几轮的差异已经小到 AI 也会犯错的程度。');
    } else if (pixelScore >= 2) {
      lines.push('像素挑战 ' + pixelScore + '/5，扰动越小越难分辨——这就是对抗样本攻击的原理。');
    } else {
      lines.push('像素挑战只对了 ' + pixelScore + '/5，别担心，人类在微小像素差异上本来就不如算法。');
    }

    lines.push(userType.desc);
    document.getElementById('personalInsightText').textContent = lines.join(' ');

    // Final curve chart
    drawFinalCurve();

    // Submit to backend
    var payload = {
      sandBoundary: sandResult.boundary,
      sandSharpness: sandResult.sharpness,
      baldBoundary: 0,
      colorBoundary: colorBoundary
    };

    fetch(API_BASE + '/sorites/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function() { loadGlobalStats(); })
      .catch(function() { loadGlobalStats(); });
  };

  function drawFinalCurve() {
    var el = document.getElementById('finalCurveChart');
    if (!el) return;
    new Chart(el.getContext('2d'), {
      type: 'line',
      data: {
        labels: sandVotes.map(function(v) { return v.grains.toLocaleString(); }),
        datasets: [{
          label: '你的信心曲线',
          data: sandVotes.map(function(v) { return v.confidence; }),
          borderColor: '#ffd700',
          backgroundColor: 'rgba(255,215,0,0.08)',
          fill: true,
          tension: 0.4,
          pointRadius: 5,
          pointBackgroundColor: sandVotes.map(function(v) {
            if (v.confidence >= 70) return '#2ecc71';
            if (v.confidence >= 40) return '#f39c12';
            return '#e74c3c';
          }),
          borderWidth: 2
        }, {
          label: '50% 线（说不清）',
          data: sandVotes.map(function() { return 50; }),
          borderColor: 'rgba(255,255,255,0.2)',
          borderDash: [5, 5],
          borderWidth: 1,
          pointRadius: 0,
          fill: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#a0a0a0' } },
          title: { display: true, text: '你的「堆」信心衰减曲线', color: '#ffd700', font: { size: 14 } }
        },
        scales: {
          y: {
            min: 0, max: 100,
            ticks: { color: '#666', callback: function(v) { return v + '%'; } },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          x: {
            ticks: { color: '#666', maxRotation: 45, font: { size: 9 } },
            grid: { display: false },
            title: { display: true, text: '沙粒数', color: '#666' }
          }
        }
      }
    });
  }

  // ══════ Global stats ══════
  function loadGlobalStats() {
    fetch(API_BASE + '/sorites/stats')
      .then(function(r) { return r.json(); })
      .then(function(resp) {
        if (resp.status !== 200 || !resp.data) throw new Error('bad');
        renderGlobalStats(resp.data);
      })
      .catch(function() {
        document.getElementById('globalLoading').textContent = '暂无全站数据，你是先驱！';
      });
  }

  function renderGlobalStats(data) {
    document.getElementById('globalLoading').style.display = 'none';
    document.getElementById('globalCharts').style.display = 'block';

    document.getElementById('globalSummary').innerHTML =
      '<div class="stat-item"><div class="num">' + (data.totalCount || 0) + '</div><div class="desc">参与人数</div></div>' +
      '<div class="stat-item"><div class="num">' + (data.sandMedian || '—') + '</div><div class="desc">沙堆边界中位数</div></div>' +
      '<div class="stat-item"><div class="num">' + (data.colorMedian || '—') + '%</div><div class="desc">蓝绿边界中位数</div></div>';

    if (data.sandDistribution) drawDistChart('globalSandChart', '沙堆边界分布（全站）', data.sandDistribution, '#ffd700');
    if (data.colorDistribution) drawDistChart('globalColorChart', '蓝绿边界分布（全站）', data.colorDistribution, '#3498db');
  }

  function drawDistChart(canvasId, title, dist, color) {
    var el = document.getElementById(canvasId);
    if (!el) return;
    new Chart(el.getContext('2d'), {
      type: 'bar',
      data: {
        labels: dist.map(function(d) { return d.label; }),
        datasets: [{
          label: title,
          data: dist.map(function(d) { return d.count; }),
          backgroundColor: color + '55',
          borderColor: color,
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: { display: true, text: title, color: '#ffd700', font: { size: 13 } }
        },
        scales: {
          y: { ticks: { color: '#666' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          x: { ticks: { color: '#666', maxRotation: 45, font: { size: 9 } }, grid: { display: false } }
        }
      }
    });
  }

  // ══════ Restart ══════
  window.restartAll = function() {
    sandStep = 0; sandVotes = [];
    colorBoundary = 50;
    pixelRound = 0; pixelScore = 0; pixelRounds = [];

    document.getElementById('confidenceArea').style.display = 'block';
    document.getElementById('sandResult').style.display = 'none';
    document.getElementById('colorSection').style.display = 'none';
    document.getElementById('pixelSection').style.display = 'none';
    document.getElementById('pixelDone').style.display = 'none';
    document.getElementById('finalSection').style.display = 'none';
    document.getElementById('colorSlider').value = 50;
    document.getElementById('gradientMarker').style.left = '50%';
    document.getElementById('crowdBarWrap').classList.remove('visible');

    // Reset particles
    spawnParticles(300);

    // Reset S-curve
    if (sCurveChart) {
      sCurveChart.data.labels = [];
      sCurveChart.data.datasets[0].data = [];
      sCurveChart.update('none');
    }

    updateSandDisplay();
    document.getElementById('sandSection').scrollIntoView({ behavior: 'smooth' });
  };

})();

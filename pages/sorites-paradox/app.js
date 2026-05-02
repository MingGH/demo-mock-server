/**
 * 沙堆悖论 — 前端交互
 */
(function() {
  'use strict';

  var API_BASE = 'https://numfeel-api.996.ninja';

  // ── 沙堆实验状态 ──
  var sandStep = 0;
  var sandVotes = [];
  var sandDone = false;

  // ── 秃头实验状态 ──
  var baldStep = 0;
  var baldVotes = [];
  var baldDone = false;

  // ── 颜色实验状态 ──
  var colorBoundary = 50;

  // ── Charts ──
  var sandVoteChart = null;
  var globalSandChart = null;
  var globalBaldChart = null;
  var globalColorChart = null;

  // ── 初始化 ──
  updateSandDisplay();

  // ── 沙堆投票 ──
  window.voteSand = function(isHeap) {
    if (sandDone) return;

    var grains = SAND_CONFIG.steps[sandStep];
    sandVotes.push({ grains: grains, isHeap: isHeap });

    // 高亮选中按钮
    var btns = document.querySelectorAll('#sandVoteArea .vote-btn');
    btns.forEach(function(b) { b.classList.remove('selected'); });
    btns[isHeap ? 0 : 1].classList.add('selected');

    sandStep++;

    if (sandStep >= SAND_CONFIG.totalSteps) {
      sandDone = true;
      showSandResult();
      return;
    }

    // 短暂延迟后更新
    setTimeout(function() {
      btns.forEach(function(b) { b.classList.remove('selected'); });
      updateSandDisplay();
    }, 300);
  };

  function updateSandDisplay() {
    var grains = SAND_CONFIG.steps[sandStep];
    var formatted = grains.toLocaleString();

    document.getElementById('sandCount').innerHTML = formatted + '<small> 粒</small>';
    document.getElementById('grainLabel').textContent = formatted + ' 粒';
    document.getElementById('stepLabel').textContent = (sandStep + 1) + ' / ' + SAND_CONFIG.totalSteps;
    document.getElementById('sandQuestion').innerHTML =
      '这 <strong style="color:#ffd700;">' + formatted + '</strong> 粒沙子，算「一堆」吗？';

    var pct = sandStep / SAND_CONFIG.totalSteps * 100;
    document.getElementById('sandProgress').style.width = pct + '%';

    // 更新沙堆形状
    var h = sandHeightPercent(grains, SAND_CONFIG.startGrains);
    var w = sandWidthPercent(grains, SAND_CONFIG.startGrains);
    var shape = document.getElementById('sandShape');
    shape.style.height = Math.max(h, 2) + '%';
    shape.style.width = w + '%';
    shape.style.opacity = grains === 0 ? '0' : '1';
  }

  function showSandResult() {
    document.getElementById('sandVoteArea').style.display = 'none';
    document.getElementById('sandResult').style.display = 'block';

    var result = findBoundary(sandVotes);
    document.getElementById('sandBoundary').textContent = result.boundary.toLocaleString() + ' 粒';

    var sharpnessText = {
      'sharp': '你的判断很果断，有一条清晰的分界线',
      'moderate': '你有些犹豫，边界区域有来回',
      'fuzzy': '你的边界很模糊，反复切换了好几次',
      'extreme-yes': '你认为即使 0 粒也算一堆（哲学家体质）',
      'extreme-no': '你从一开始就觉得不算一堆（严格派）',
      'unknown': '—'
    };
    document.getElementById('sandBoundarySub').textContent = sharpnessText[result.sharpness] || '';

    // 画投票时间线
    drawSandVoteChart();
  }

  function drawSandVoteChart() {
    var ctx = document.getElementById('sandVoteChart').getContext('2d');
    var labels = sandVotes.map(function(v) { return v.grains.toLocaleString(); });
    var data = sandVotes.map(function(v) { return v.isHeap ? 1 : 0; });
    var colors = sandVotes.map(function(v) {
      return v.isHeap ? 'rgba(46,204,113,0.7)' : 'rgba(231,76,60,0.7)';
    });

    if (sandVoteChart) sandVoteChart.destroy();
    sandVoteChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: '你的判断',
          data: data,
          backgroundColor: colors,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(c) { return c.raw === 1 ? '算一堆' : '不算了'; }
            }
          }
        },
        scales: {
          y: {
            display: false, min: 0, max: 1.2
          },
          x: {
            ticks: { color: '#a0a0a0', maxRotation: 45, font: { size: 10 } },
            grid: { display: false }
          }
        }
      }
    });
  }

  // ── 秃头实验 ──
  window.startBaldExperiment = function() {
    document.getElementById('baldSection').style.display = 'block';
    document.getElementById('baldSection').scrollIntoView({ behavior: 'smooth' });
    updateBaldDisplay();
  };

  window.voteBald = function(isBald) {
    if (baldDone) return;

    var hairs = BALD_CONFIG.steps[baldStep];
    baldVotes.push({ grains: hairs, isHeap: !isBald }); // isHeap = "还有头发"

    var btns = document.querySelectorAll('#baldVoteArea .vote-btn');
    btns.forEach(function(b) { b.classList.remove('selected'); });
    btns[isBald ? 0 : 1].classList.add('selected');

    baldStep++;

    if (baldStep >= BALD_CONFIG.totalSteps) {
      baldDone = true;
      showBaldResult();
      return;
    }

    setTimeout(function() {
      btns.forEach(function(b) { b.classList.remove('selected'); });
      updateBaldDisplay();
    }, 300);
  };

  function updateBaldDisplay() {
    var hairs = BALD_CONFIG.steps[baldStep];
    var formatted = hairs.toLocaleString();

    document.getElementById('hairCount').innerHTML = formatted + '<small> 根</small>';
    document.getElementById('hairLabel').textContent = formatted + ' 根';
    document.getElementById('baldStepLabel').textContent = (baldStep + 1) + ' / ' + BALD_CONFIG.totalSteps;
    document.getElementById('baldQuestion').innerHTML =
      '还剩 <strong style="color:#ffd700;">' + formatted + '</strong> 根头发，算「秃」吗？';

    var pct = baldStep / BALD_CONFIG.totalSteps * 100;
    document.getElementById('baldProgress').style.width = pct + '%';

    // 更新头发图标
    var icon = document.getElementById('hairIcon');
    if (hairs < 1000) { icon.textContent = '👴'; icon.classList.add('bald'); }
    else if (hairs < 10000) { icon.textContent = '👨‍🦲'; icon.classList.remove('bald'); }
    else { icon.textContent = '👨'; icon.classList.remove('bald'); }
  }

  function showBaldResult() {
    document.getElementById('baldVoteArea').style.display = 'none';
    document.getElementById('baldResult').style.display = 'block';

    // 秃头边界：找到第一个"算秃"的位置
    var baldBoundary = -1;
    for (var i = 0; i < baldVotes.length; i++) {
      if (!baldVotes[i].isHeap) { // isHeap=false 表示"算秃了"
        baldBoundary = baldVotes[i].grains;
        break;
      }
    }
    if (baldBoundary === -1) baldBoundary = 0;

    document.getElementById('baldBoundary').textContent = baldBoundary.toLocaleString() + ' 根';
    document.getElementById('baldBoundarySub').textContent =
      baldBoundary > 50000 ? '你对秃头的标准很严格' :
      baldBoundary > 10000 ? '中等标准' :
      baldBoundary > 1000 ? '你觉得头发少于这个数就算秃了' :
      '你的标准很宽松，要几乎没头发才算秃';
  }

  // ── 颜色实验 ──
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

  // ── 提交全部结果 ──
  window.submitAllResults = function() {
    var sandResult = findBoundary(sandVotes);

    var baldBoundary = -1;
    for (var i = 0; i < baldVotes.length; i++) {
      if (!baldVotes[i].isHeap) { baldBoundary = baldVotes[i].grains; break; }
    }
    if (baldBoundary === -1) baldBoundary = 0;

    // 显示最终结果
    document.getElementById('finalSection').style.display = 'block';
    document.getElementById('finalSection').scrollIntoView({ behavior: 'smooth' });

    document.getElementById('finalSandBoundary').textContent = sandResult.boundary.toLocaleString();
    document.getElementById('finalBaldBoundary').textContent = baldBoundary.toLocaleString();
    document.getElementById('finalColorBoundary').textContent = colorBoundary + '%';

    // 个人分析
    generatePersonalInsight(sandResult, baldBoundary, colorBoundary);

    // 提交到后端
    var payload = {
      sandBoundary: sandResult.boundary,
      sandSharpness: sandResult.sharpness,
      baldBoundary: baldBoundary,
      colorBoundary: colorBoundary
    };

    fetch(API_BASE + '/sorites/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function() {
      loadGlobalStats();
    }).catch(function() {
      loadGlobalStats();
    });
  };

  function generatePersonalInsight(sandResult, baldBoundary, colorVal) {
    var lines = [];

    // 沙堆分析
    if (sandResult.boundary > 5000) {
      lines.push('你对「堆」的标准很高，超过一半的沙子拿走了你才开始犹豫。');
    } else if (sandResult.boundary > 1000) {
      lines.push('你的沙堆边界在千粒级别，属于中间派。');
    } else if (sandResult.boundary > 100) {
      lines.push('你觉得几百粒就不太算一堆了，标准偏严格。');
    } else {
      lines.push('你的沙堆边界非常低，几乎要见底才觉得不算堆。');
    }

    // 秃头分析
    if (baldBoundary > 30000) {
      lines.push('秃头标准上，你属于「头发稍微少一点就算秃」的严格派。');
    } else if (baldBoundary > 5000) {
      lines.push('你觉得头发少于几千根才算秃，标准适中。');
    } else {
      lines.push('你对秃头很宽容，要几乎光头才算。');
    }

    // 颜色分析
    if (colorVal < 35) {
      lines.push('颜色边界偏蓝侧，你对蓝色的容忍度较低。');
    } else if (colorVal > 65) {
      lines.push('颜色边界偏绿侧，你觉得很大范围都还算蓝色。');
    } else {
      lines.push('颜色边界在中间，和大多数人差不多。');
    }

    // 一致性分析
    var sandNorm = sandResult.boundary / SAND_CONFIG.startGrains;
    var baldNorm = baldBoundary / BALD_CONFIG.startHairs;
    var colorNorm = colorVal / 100;
    var avg = (sandNorm + baldNorm + colorNorm) / 3;
    var variance = ((sandNorm - avg) * (sandNorm - avg) +
                    (baldNorm - avg) * (baldNorm - avg) +
                    (colorNorm - avg) * (colorNorm - avg)) / 3;

    if (variance < 0.02) {
      lines.push('三个实验的边界位置很一致，说明你有一套稳定的「模糊判断标准」。');
    } else {
      lines.push('三个实验的边界差异较大，说明你的判断标准因场景而异——这其实很正常，因为「堆」「秃」「蓝色」本来就是不同的概念。');
    }

    document.getElementById('personalInsightText').textContent = lines.join(' ');
  }

  // ── 加载全站数据 ──
  function loadGlobalStats() {
    fetch(API_BASE + '/sorites/stats')
      .then(function(r) { return r.json(); })
      .then(function(resp) {
        if (resp.status !== 200 || !resp.data) throw new Error('bad response');
        renderGlobalStats(resp.data);
      })
      .catch(function() {
        document.getElementById('globalLoading').textContent = '暂无全站数据，你是第一个参与者！';
      });
  }

  function renderGlobalStats(data) {
    document.getElementById('globalLoading').style.display = 'none';
    document.getElementById('globalCharts').style.display = 'block';

    // 摘要
    document.getElementById('globalSummary').innerHTML =
      '<div class="stat-item"><div class="num">' + (data.totalCount || 0) + '</div><div class="desc">参与人数</div></div>' +
      '<div class="stat-item"><div class="num">' + (data.sandMedian || '—') + '</div><div class="desc">沙堆边界中位数</div></div>' +
      '<div class="stat-item"><div class="num">' + (data.baldMedian || '—') + '</div><div class="desc">秃头边界中位数</div></div>';

    // 沙堆分布图
    if (data.sandDistribution) {
      drawDistChart('globalSandChart', '沙堆边界分布', data.sandDistribution, '#ffd700');
    }
    if (data.baldDistribution) {
      drawDistChart('globalBaldChart', '秃头边界分布', data.baldDistribution, '#e74c3c');
    }
    if (data.colorDistribution) {
      drawDistChart('globalColorChart', '蓝绿边界分布', data.colorDistribution, '#3498db');
    }
  }

  function drawDistChart(canvasId, title, dist, color) {
    var ctx = document.getElementById(canvasId).getContext('2d');
    var labels = dist.map(function(d) { return d.label; });
    var counts = dist.map(function(d) { return d.count; });

    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: title,
          data: counts,
          backgroundColor: color + '66',
          borderColor: color,
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#a0a0a0' } },
          title: { display: true, text: title, color: '#ffd700', font: { size: 14 } }
        },
        scales: {
          y: { ticks: { color: '#a0a0a0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          x: { ticks: { color: '#a0a0a0', maxRotation: 45, font: { size: 10 } }, grid: { display: false } }
        }
      }
    });
  }

  // ── 重新开始 ──
  window.restartAll = function() {
    sandStep = 0; sandVotes = []; sandDone = false;
    baldStep = 0; baldVotes = []; baldDone = false;
    colorBoundary = 50;

    document.getElementById('sandVoteArea').style.display = 'flex';
    document.getElementById('sandResult').style.display = 'none';
    document.getElementById('baldSection').style.display = 'none';
    document.getElementById('baldVoteArea').style.display = 'flex';
    document.getElementById('baldResult').style.display = 'none';
    document.getElementById('colorSection').style.display = 'none';
    document.getElementById('finalSection').style.display = 'none';
    document.getElementById('colorSlider').value = 50;
    document.getElementById('gradientMarker').style.left = '50%';

    updateSandDisplay();
    document.getElementById('sandSection').scrollIntoView({ behavior: 'smooth' });
  };

})();

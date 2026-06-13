/**
 * 信息茧房模拟器 - 主交互逻辑
 */

let engine;
let weightChart, entropyChart, pieChart;
let autoEntropyChart, greedyChart, exploreChart;
const MAX_ROUNDS = 10;

// ── 初始化 ──
function init() {
  engine = new RecommendEngine({ epsilon: 0, feedSize: 6 });
  initCharts();
  renderFeed();
  updateMetrics();
}

// ── 渲染推荐列表 ──
function renderFeed() {
  const feed = engine.generateFeed();
  const container = document.getElementById('feedList');

  container.innerHTML = feed.map(item => `
    <div class="feed-item" onclick="handleClick('${item.catId}')" data-cat="${item.catId}">
      <span class="cat-dot" style="background:${item.catColor}"></span>
      <span class="feed-title">${item.title}</span>
      <span class="feed-tag" style="color:${item.catColor}">${item.catName}</span>
      <span class="feed-score">匹配 ${item.score}%</span>
    </div>
  `).join('');
}

// ── 处理用户点击 ──
function handleClick(catId) {
  engine.recordClick(catId);

  // 更新 UI
  document.getElementById('roundNum').textContent = Math.min(engine.round + 1, MAX_ROUNDS);
  document.getElementById('progressFill').style.width = `${(engine.round / MAX_ROUNDS) * 100}%`;

  updateMetrics();
  updateCharts();

  if (engine.round >= MAX_ROUNDS) {
    showResult();
  } else {
    renderFeed();
  }
}

// ── 更新指标 ──
function updateMetrics() {
  const entropy = engine.calcEntropy();
  const maxEntropy = Math.log2(CATEGORIES.length);
  const diversity = (entropy / maxEntropy * 100).toFixed(0);

  document.getElementById('currentEntropy').textContent = entropy.toFixed(2);
  document.getElementById('diversityPercent').textContent = diversity + '%';

  // 颜色指示
  const entropyEl = document.getElementById('currentEntropy');
  if (entropy < maxEntropy * 0.4) {
    entropyEl.style.color = '#ff6b6b';
  } else if (entropy < maxEntropy * 0.7) {
    entropyEl.style.color = '#ffb74d';
  } else {
    entropyEl.style.color = '#ffd700';
  }
}

// ── 初始化图表 ──
function initCharts() {
  // 权重柱状图
  const weightCtx = document.getElementById('weightChart').getContext('2d');
  weightChart = new Chart(weightCtx, {
    type: 'bar',
    data: {
      labels: CATEGORIES.map(c => c.name),
      datasets: [{
        label: '兴趣权重',
        data: CATEGORIES.map(() => 10),
        backgroundColor: CATEGORIES.map(c => c.color + '99'),
        borderColor: CATEGORIES.map(c => c.color),
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          ticks: { color: '#888', font: { size: 10 } },
          grid: { display: false }
        },
        y: {
          ticks: { color: '#888' },
          grid: { color: 'rgba(255,255,255,0.05)' },
          title: { display: true, text: '权重（%）', color: '#888' }
        }
      }
    }
  });

  // 信息熵折线图
  const entropyCtx = document.getElementById('entropyChart').getContext('2d');
  entropyChart = new Chart(entropyCtx, {
    type: 'line',
    data: {
      labels: ['初始'],
      datasets: [{
        label: '信息熵 (bits)',
        data: [engine.entropyLog[0]],
        borderColor: '#ffd700',
        backgroundColor: 'rgba(255,215,0,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: '#ffd700'
      }, {
        label: '最大熵（均匀分布）',
        data: [Math.log2(CATEGORIES.length)],
        borderColor: 'rgba(255,255,255,0.2)',
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#888' } }
      },
      scales: {
        x: {
          ticks: { color: '#888' },
          grid: { display: false }
        },
        y: {
          min: 0,
          max: Math.log2(CATEGORIES.length) + 0.3,
          ticks: { color: '#888' },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });
}

// ── 更新图表 ──
function updateCharts() {
  // 更新权重图
  const dist = engine.getDistribution();
  weightChart.data.datasets[0].data = CATEGORIES.map(c => (dist[c.id] * 100).toFixed(1));
  weightChart.update('none');

  // 更新熵曲线
  entropyChart.data.labels = engine.entropyLog.map((_, i) => i === 0 ? '初始' : `第${i}轮`);
  entropyChart.data.datasets[0].data = [...engine.entropyLog];
  entropyChart.data.datasets[1].data = engine.entropyLog.map(() => Math.log2(CATEGORIES.length));
  entropyChart.update('none');
}

// ── 显示最终结果 ──
function showResult() {
  document.getElementById('feedList').innerHTML = `
    <div style="text-align:center;padding:40px;color:#888;">
      <i class="ti ti-check" style="font-size:2rem;color:#81c784;"></i>
      <p style="margin-top:8px;">10 轮点击完成，查看下方结果</p>
    </div>
  `;

  const summary = engine.getSummary();
  document.getElementById('resEntropyDrop').textContent = summary.entropyDrop;
  document.getElementById('resDominant').textContent = summary.dominantPercent;
  document.getElementById('resConvergeRound').textContent = summary.convergeRound;

  // 生成洞察文字
  const dropNum = parseFloat(summary.entropyDrop);
  let insight = '';
  if (dropNum > 60) {
    insight = `你的信息流多样性下降了 ${summary.entropyDrop}，推荐内容已经高度集中在「${summary.dominantName}」类别。如果这是你日常使用的短视频或新闻App，意味着算法已经给你建了一个相当厚实的信息茧房——你看到的内容中超过 ${summary.dominantPercent} 来自同一类型。`;
  } else if (dropNum > 30) {
    insight = `信息熵下降了 ${summary.entropyDrop}，「${summary.dominantName}」已经占据你推荐流的 ${summary.dominantPercent}。茧房初步形成——如果继续保持同样的点击偏好，再过几轮推荐列表会进一步收窄。`;
  } else {
    insight = `你的点击相对分散，信息熵只下降了 ${summary.entropyDrop}。这说明如果用户主动点击不同类型的内容，可以一定程度上抵抗算法的收窄趋势——但现实中大多数人做不到这一点。`;
  }
  document.getElementById('resultInsight').textContent = insight;

  // 饼图
  renderPieChart();

  document.getElementById('resultSection').style.display = 'block';
  document.getElementById('resultSection').scrollIntoView({ behavior: 'smooth' });

  // 提交结果到后端
  submitResult();
}

// ── 饼图 ──
function renderPieChart() {
  const dist = engine.getDistribution();
  const ctx = document.getElementById('pieChart').getContext('2d');

  if (pieChart) pieChart.destroy();

  pieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: CATEGORIES.map(c => c.name),
      datasets: [{
        data: CATEGORIES.map(c => (dist[c.id] * 100).toFixed(1)),
        backgroundColor: CATEGORIES.map(c => c.color + 'cc'),
        borderColor: 'rgba(0,0,0,0.3)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#ccc', font: { size: 11 } }
        }
      }
    }
  });
}

// ── 重新开始 ──
function restart() {
  document.getElementById('resultSection').style.display = 'none';
  document.getElementById('autoSimSection').style.display = 'none';
  document.getElementById('roundNum').textContent = '1';
  document.getElementById('progressFill').style.width = '0%';

  if (weightChart) weightChart.destroy();
  if (entropyChart) entropyChart.destroy();
  if (pieChart) pieChart.destroy();

  init();
}

// ── 自动模拟 100 轮 ──
function runAutoSim() {
  const result = autoSimulate(100, 0);
  const section = document.getElementById('autoSimSection');
  section.style.display = 'block';

  // 熵曲线
  const ctx = document.getElementById('autoEntropyChart').getContext('2d');
  if (autoEntropyChart) autoEntropyChart.destroy();

  autoEntropyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: result.entropyLog.map((_, i) => i),
      datasets: [{
        label: '信息熵 (bits)',
        data: result.entropyLog,
        borderColor: '#ffd700',
        backgroundColor: 'rgba(255,215,0,0.08)',
        fill: true,
        tension: 0.2,
        pointRadius: 0
      }, {
        label: '最大熵',
        data: result.entropyLog.map(() => Math.log2(CATEGORIES.length)),
        borderColor: 'rgba(255,255,255,0.15)',
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#888' } } },
      scales: {
        x: {
          ticks: { color: '#888', maxTicksLimit: 10 },
          grid: { display: false },
          title: { display: true, text: '轮次', color: '#888' }
        },
        y: {
          min: 0,
          ticks: { color: '#888' },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });

  // 统计
  const summary = result.getSummary();
  document.getElementById('autoStats').innerHTML = `
    <div class="stat-item">
      <div class="stat-val">${summary.finalEntropy}</div>
      <div class="stat-label">最终信息熵</div>
    </div>
    <div class="stat-item">
      <div class="stat-val">${summary.entropyDrop}</div>
      <div class="stat-label">熵下降幅度</div>
    </div>
    <div class="stat-item">
      <div class="stat-val">${summary.dominantName}</div>
      <div class="stat-label">主导类型</div>
    </div>
    <div class="stat-item">
      <div class="stat-val">${summary.dominantPercent}</div>
      <div class="stat-label">主导占比</div>
    </div>
    <div class="stat-item">
      <div class="stat-val">${summary.convergeRound}</div>
      <div class="stat-label">收敛轮次</div>
    </div>
  `;

  section.scrollIntoView({ behavior: 'smooth' });
}

// ── 对比模拟：贪心 vs 探索 ──
function runCompare() {
  document.getElementById('compareBtn').style.display = 'none';
  document.getElementById('compareGrid').style.display = 'grid';

  const rounds = 50;
  const greedyResult = autoSimulate(rounds, 0);
  const exploreResult = autoSimulate(rounds, 0.15);

  // 贪心图
  const greedyCtx = document.getElementById('greedyChart').getContext('2d');
  if (greedyChart) greedyChart.destroy();
  greedyChart = new Chart(greedyCtx, {
    type: 'line',
    data: {
      labels: greedyResult.entropyLog.map((_, i) => i),
      datasets: [{
        label: '信息熵',
        data: greedyResult.entropyLog,
        borderColor: '#ff6b6b',
        backgroundColor: 'rgba(255,107,107,0.08)',
        fill: true,
        tension: 0.2,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#888', maxTicksLimit: 5 }, grid: { display: false } },
        y: { min: 0, max: Math.log2(CATEGORIES.length) + 0.3, ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });

  // 探索图
  const exploreCtx = document.getElementById('exploreChart').getContext('2d');
  if (exploreChart) exploreChart.destroy();
  exploreChart = new Chart(exploreCtx, {
    type: 'line',
    data: {
      labels: exploreResult.entropyLog.map((_, i) => i),
      datasets: [{
        label: '信息熵',
        data: exploreResult.entropyLog,
        borderColor: '#81c784',
        backgroundColor: 'rgba(129,199,132,0.08)',
        fill: true,
        tension: 0.2,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#888', maxTicksLimit: 5 }, grid: { display: false } },
        y: { min: 0, max: Math.log2(CATEGORIES.length) + 0.3, ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });

  // 统计文字
  const gSummary = greedyResult.getSummary();
  const eSummary = exploreResult.getSummary();

  document.getElementById('greedyStat').innerHTML = `
    最终熵: <strong style="color:#ff6b6b">${gSummary.finalEntropy} bits</strong>，
    主导类型占 <strong>${gSummary.dominantPercent}</strong>
  `;
  document.getElementById('exploreStat').innerHTML = `
    最终熵: <strong style="color:#81c784">${eSummary.finalEntropy} bits</strong>，
    主导类型占 <strong>${eSummary.dominantPercent}</strong>
  `;
}

// ── 页面加载 ──
document.addEventListener('DOMContentLoaded', () => {
  init();
  loadGlobalStats();
});

// ── 后端统计 ──
const API_BASE = 'https://numfeel-api.996.ninja';

function submitResult() {
  const summary = engine.getSummary();
  const convergeNum = summary.convergeRound.startsWith('第')
    ? parseInt(summary.convergeRound.replace(/[^0-9]/g, ''))
    : -1;

  const payload = {
    entropyDrop: parseFloat(summary.entropyDrop),
    dominantCat: engine.history.reduce((acc, cat) => {
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {}),
    dominantPct: parseFloat(summary.dominantPercent),
    convergeRound: convergeNum,
    totalRounds: engine.round,
    clickSequence: JSON.stringify(engine.history)
  };
  // dominantCat should be a string
  payload.dominantCat = Object.entries(payload.dominantCat)
    .sort((a, b) => b[1] - a[1])[0][0];

  fetch(`${API_BASE}/filter-bubble/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(() => {
    loadGlobalStats();
  }).catch(() => {});
}

function loadGlobalStats() {
  fetch(`${API_BASE}/filter-bubble/stats`)
    .then(r => r.json())
    .then(res => {
      if (res.status === 200 && res.data && res.data.totalSessions > 0) {
        renderGlobalStats(res.data);
      }
    })
    .catch(() => {});
}

function renderGlobalStats(data) {
  const section = document.getElementById('globalStatsSection');
  if (!section) return;
  section.style.display = 'block';

  document.getElementById('gsTotalSessions').textContent = data.totalSessions;
  document.getElementById('gsAvgDrop').textContent = data.avgEntropyDrop + '%';
  document.getElementById('gsAvgPct').textContent = data.avgDominantPct + '%';
  document.getElementById('gsAvgConverge').textContent =
    data.avgConvergeRound > 0 ? `第 ${data.avgConvergeRound} 轮` : '—';

  // 主导类型分布
  const catNames = {
    tech: '科技数码', entertain: '娱乐八卦', finance: '财经理财',
    food: '美食生活', sports: '体育运动', science: '科学探索',
    history: '历史人文', game: '游戏电竞', travel: '旅行户外', emotion: '情感心理'
  };
  const distEl = document.getElementById('gsCatDist');
  if (data.dominantCatDist && distEl) {
    const sorted = Object.entries(data.dominantCatDist).sort((a, b) => b[1] - a[1]);
    distEl.innerHTML = sorted.slice(0, 5).map(([cat, count]) => `
      <span class="gs-tag">${catNames[cat] || cat}: ${count}人</span>
    `).join('');
  }
}

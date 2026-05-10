// ========== 卡池配置 ==========
const POOLS = [
  {
    id: 'genshin',
    name: '原神模型',
    icon: '',
    logo: 'https://img.996.ninja/ninjutsu/135a16eb63664017c2baa01ac6f417c7.png',
    desc: '0.6% + 软保底74 + 硬保底90 + 50/50',
    baseRate: 0.006,
    softPity: 73,
    hardPity: 90,
    softPityRate: 0.06,
    fiftyFifty: true
  },
  {
    id: 'starrail',
    name: '星铁模型',
    icon: '',
    logo: 'https://img.996.ninja/ninjutsu/7c44490758f10af06e1445b08a69b5cb.png',
    desc: '0.6% + 软保底73 + 硬保底90 + 50/50',
    baseRate: 0.006,
    softPity: 72,
    hardPity: 90,
    softPityRate: 0.06,
    fiftyFifty: true
  },
  {
    id: 'generic3',
    name: '3%无保底',
    icon: 'ti-diamond',
    logo: '',
    desc: '3%概率，无保底机制',
    baseRate: 0.03,
    softPity: 9999,
    hardPity: 9999,
    softPityRate: 0,
    fiftyFifty: false
  },
  {
    id: 'generous',
    name: '良心池(2.5%+50保底)',
    icon: 'ti-heart',
    logo: '',
    desc: '2.5% + 硬保底50，无50/50',
    baseRate: 0.025,
    softPity: 40,
    hardPity: 50,
    softPityRate: 0.05,
    fiftyFifty: false
  }
];

let currentPool = POOLS[0];
let histChart = null;
let cdfChart = null;
let strategyChart = null;
let fallacyChart = null;
let pityCompareChart = null;

// ========== 初始化 ==========
function init() {
  renderPoolSelector();
  updateConfigDisplay();
  updateFallacy();
  updateExpectedStats();
}

// ========== Tab 切换 ==========
function switchTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${tabId}"]`).classList.add('active');
  document.getElementById('tab-' + tabId).classList.add('active');
}

// ========== 卡池选择 ==========
function renderPoolSelector() {
  const container = document.getElementById('poolSelector');
  container.innerHTML = POOLS.map(p => {
    const iconHtml = p.logo
      ? `<img src="${p.logo}" alt="${p.name}" style="width:48px;height:48px;object-fit:contain;">`
      : `<i class="ti ${p.icon}"></i>`;
    return `
    <div class="pool-card ${p.id === currentPool.id ? 'active' : ''}" onclick="selectPool('${p.id}')">
      <div class="pool-icon">${iconHtml}</div>
      <div class="pool-name">${p.name}</div>
      <div class="pool-rate">${p.desc}</div>
    </div>`;
  }).join('');
}

function selectPool(id) {
  currentPool = POOLS.find(p => p.id === id);
  renderPoolSelector();
  updateConfigDisplay();
  updateExpectedStats();
  resetPull();
  // 隐藏旧结果
  document.getElementById('simResults').style.display = 'none';
  document.getElementById('strategyResults').style.display = 'none';
  document.getElementById('pityCompareResults').style.display = 'none';
}

function updateConfigDisplay() {
  document.getElementById('cfgRate').textContent = (currentPool.baseRate * 100).toFixed(1) + '%';
  document.getElementById('cfgPity').textContent = currentPool.hardPity >= 9999 ? '无' : currentPool.hardPity + '抽';
  document.getElementById('cfgFifty').textContent = currentPool.fiftyFifty ? '是' : '否';
  document.getElementById('pityMax').textContent = currentPool.hardPity >= 9999 ? '∞' : currentPool.hardPity;
}

// ========== 模拟抽卡 ==========
function runSimulation() {
  const times = parseInt(document.getElementById('simCount').value);
  const btn = document.getElementById('runSimBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader"></i> 模拟中…';

  setTimeout(() => {
    const results = batchSimulate(currentPool, times);
    const stats = calcStats(results);
    displaySimResults(results, stats, times);
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-player-play"></i> 开始模拟';
  }, 50);
}

function displaySimResults(results, stats, times) {
  document.getElementById('simResults').style.display = '';

  // 统计卡片
  document.getElementById('simStats').innerHTML = `
    <div class="stat-card highlight"><div class="val">${Math.round(stats.mean)}</div><div class="lbl">平均抽数</div></div>
    <div class="stat-card"><div class="val">${stats.median}</div><div class="lbl">中位数</div></div>
    <div class="stat-card"><div class="val">${stats.p25}-${stats.p75}</div><div class="lbl">50%玩家区间</div></div>
    <div class="stat-card red"><div class="val">${stats.p90}</div><div class="lbl">90%在此之前出</div></div>
    <div class="stat-card green"><div class="val">${stats.min}</div><div class="lbl">最幸运</div></div>
    <div class="stat-card red"><div class="val">${stats.max}</div><div class="lbl">最倒霉</div></div>
  `;

  // 直方图
  const binSize = currentPool.hardPity >= 9999 ? 10 : 5;
  const hist = histogram(results, binSize);
  drawHistogram(hist);

  // CDF
  const maxVal = Math.min(stats.max, currentPool.hardPity >= 9999 ? 300 : currentPool.hardPity * 2 + 20);
  const cdf = cumulativeProb(results, maxVal);
  drawCDF(cdf);

  // 洞察
  const costPer = 160; // 假设每抽160日元/1.6元
  const avgCost = Math.round(stats.mean * costPer);
  const p90Cost = Math.round(stats.p90 * costPer);
  let insightHtml = `模拟 ${times.toLocaleString()} 次的结果：平均需要 <strong>${Math.round(stats.mean)} 抽</strong>出货`;
  insightHtml += `（约 ¥${avgCost}）。`;
  insightHtml += `<br>50%的玩家在 ${stats.p25}~${stats.p75} 抽之间出货，`;
  insightHtml += `但有10%的人需要超过 ${stats.p90} 抽（约 ¥${p90Cost}）。`;
  if (stats.max > stats.mean * 2) {
    insightHtml += `<br>最倒霉的情况需要 ${stats.max} 抽——这就是为什么要按P90而非均值准备预算。`;
  }
  document.getElementById('simInsightText').innerHTML = insightHtml;
}

function drawHistogram(hist) {
  if (histChart) { histChart.destroy(); histChart = null; }
  const ctx = document.getElementById('histChart').getContext('2d');

  histChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: hist.labels,
      datasets: [{
        label: '频率',
        data: hist.freqs.map(f => (f * 100).toFixed(1)),
        backgroundColor: hist.freqs.map((f, i) => {
          const peak = Math.max(...hist.freqs);
          const ratio = f / peak;
          return `rgba(255,215,0,${0.2 + ratio * 0.6})`;
        }),
        borderColor: '#ffd700',
        borderWidth: 1,
        borderRadius: 3
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ctx.raw + '% 的人在此区间出货' } }
      },
      scales: {
        x: { ticks: { color: '#888', maxRotation: 45, font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: '#888', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

function drawCDF(cdf) {
  if (cdfChart) { cdfChart.destroy(); cdfChart = null; }
  const ctx = document.getElementById('cdfChart').getContext('2d');

  // 每隔几个点取一个label
  const step = Math.max(1, Math.floor(cdf.x.length / 30));
  const labels = cdf.x.map((v, i) => i % step === 0 ? v : '');

  cdfChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: cdf.x,
      datasets: [{
        label: '累积出货概率',
        data: cdf.y.map(v => (v * 100).toFixed(1)),
        borderColor: '#81c784',
        backgroundColor: 'rgba(129,199,132,0.08)',
        fill: true, pointRadius: 0, tension: 0.3, borderWidth: 2.5
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.raw}% 的人在 ${ctx.label} 抽内出货` } }
      },
      scales: {
        x: {
          ticks: { color: '#888', maxTicksLimit: 10, font: { size: 10 } },
          grid: { display: false },
          title: { display: true, text: '抽数', color: '#666' }
        },
        y: {
          ticks: { color: '#888', callback: v => v + '%' },
          grid: { color: 'rgba(255,255,255,0.05)' },
          title: { display: true, text: '累积概率', color: '#666' },
          min: 0, max: 100
        }
      }
    }
  });
}

// ========== 亲手抽卡 ==========
let pullState = { count: 0, pity: 0, hits: [], dots: [] };

function pullOnce() {
  const result = simulatePull(
    currentPool.baseRate, pullState.pity,
    currentPool.softPity, currentPool.hardPity, currentPool.softPityRate
  );
  pullState.count++;
  pullState.pity = result.newPity;
  pullState.dots.push(result.hit);

  updatePullDisplay();

  if (result.hit) {
    pullState.hits.push(pullState.count);
    showHitMessage();
  }
}

function pullTen() {
  for (let i = 0; i < 10; i++) {
    const result = simulatePull(
      currentPool.baseRate, pullState.pity,
      currentPool.softPity, currentPool.hardPity, currentPool.softPityRate
    );
    pullState.count++;
    pullState.pity = result.newPity;
    pullState.dots.push(result.hit);
    if (result.hit) {
      pullState.hits.push(pullState.count);
    }
  }
  updatePullDisplay();
  if (pullState.hits.length > 0) {
    showHitMessage();
  }
}

function resetPull() {
  pullState = { count: 0, pity: 0, hits: [], dots: [] };
  updatePullDisplay();
  document.getElementById('pullHitMsg').style.display = 'none';
}

function updatePullDisplay() {
  document.getElementById('pullCounter').textContent = pullState.count;
  document.getElementById('pityDisplay').innerHTML =
    `当前垫刀：${pullState.pity} / <span id="pityMax">${currentPool.hardPity >= 9999 ? '∞' : currentPool.hardPity}</span>`;

  // 只显示最近50个点
  const recent = pullState.dots.slice(-50);
  document.getElementById('pullDots').innerHTML = recent.map(hit =>
    `<div class="pull-dot ${hit ? 'hit' : 'miss'}"></div>`
  ).join('');
}

function showHitMessage() {
  const lastHit = pullState.hits[pullState.hits.length - 1];
  document.getElementById('hitPulls').textContent = lastHit;
  document.getElementById('pullHitMsg').style.display = '';
}

// ========== 策略对比 ==========
function runStrategy() {
  const budget = parseInt(document.getElementById('budgetSlider').value);
  const times = 5000;

  const results = { yolo: [], save: [], discount: [] };

  for (let i = 0; i < times; i++) {
    results.yolo.push(strategySimulate(currentPool, budget, 'yolo').characters);
    results.save.push(strategySimulate(currentPool, budget, 'save').characters);
    results.discount.push(strategySimulate(currentPool, budget, 'discount').characters);
  }

  const avg = {
    yolo: (results.yolo.reduce((a, b) => a + b, 0) / times).toFixed(2),
    save: (results.save.reduce((a, b) => a + b, 0) / times).toFixed(2),
    discount: (results.discount.reduce((a, b) => a + b, 0) / times).toFixed(2)
  };

  const zero = {
    yolo: ((results.yolo.filter(v => v === 0).length / times) * 100).toFixed(1),
    save: ((results.save.filter(v => v === 0).length / times) * 100).toFixed(1),
    discount: ((results.discount.filter(v => v === 0).length / times) * 100).toFixed(1)
  };

  displayStrategyResults(avg, zero, results, budget);
}

function displayStrategyResults(avg, zero, results, budget) {
  document.getElementById('strategyResults').style.display = '';

  const vals = [parseFloat(avg.yolo), parseFloat(avg.save), parseFloat(avg.discount)];
  const maxIdx = vals.indexOf(Math.max(...vals));
  const minIdx = vals.indexOf(Math.min(...vals));

  const cards = [
    { name: '随缘抽', key: 'yolo', desc: '有石头就抽，不攒' },
    { name: '攒保底', key: 'save', desc: '攒够保底再抽' },
    { name: '只抽半价', key: 'discount', desc: '只在优惠活动时抽' }
  ];

  document.getElementById('strategyGrid').innerHTML = cards.map((c, i) => `
    <div class="strategy-card ${i === maxIdx ? 'best' : i === minIdx ? 'worst' : ''}">
      <h4>${c.name}</h4>
      <div class="sub">${c.desc}</div>
      <div class="big">${avg[c.key]}</div>
      <div class="sub">平均获得角色数</div>
      <div class="sub" style="margin-top:8px;color:#ef9a9a;">${zero[c.key]}% 概率颗粒无收</div>
    </div>
  `).join('');

  // 分布图
  drawStrategyChart(results);

  // 洞察
  let text = `预算 ${budget} 抽的情况下：`;
  text += `「只抽半价」平均获得 ${avg.discount} 个角色（因为等效预算翻倍），`;
  text += `「随缘抽」平均 ${avg.yolo} 个，「攒保底」平均 ${avg.save} 个。`;
  if (parseFloat(zero.yolo) > 10) {
    text += `<br>注意：随缘抽有 ${zero.yolo}% 的概率一个都抽不到——预算不够时，攒保底至少保证能拿到一个。`;
  }
  text += `<br><br>结论：如果你是月卡/小月卡玩家（资源有限），等半价活动是数学最优解。如果你追求确定性，攒够保底再出手。`;
  document.getElementById('strategyInsightText').innerHTML = text;
}

function drawStrategyChart(results) {
  if (strategyChart) { strategyChart.destroy(); strategyChart = null; }
  const ctx = document.getElementById('strategyChart').getContext('2d');

  const maxChars = Math.max(
    Math.max(...results.yolo),
    Math.max(...results.save),
    Math.max(...results.discount)
  );

  const bins = maxChars + 1;
  const dist = { yolo: new Array(bins).fill(0), save: new Array(bins).fill(0), discount: new Array(bins).fill(0) };

  results.yolo.forEach(v => dist.yolo[v]++);
  results.save.forEach(v => dist.save[v]++);
  results.discount.forEach(v => dist.discount[v]++);

  const n = results.yolo.length;
  const labels = Array.from({ length: bins }, (_, i) => i);

  strategyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: '随缘抽', data: dist.yolo.map(v => (v / n * 100).toFixed(1)), backgroundColor: 'rgba(255,215,0,0.5)', borderColor: '#ffd700', borderWidth: 1, borderRadius: 3 },
        { label: '攒保底', data: dist.save.map(v => (v / n * 100).toFixed(1)), backgroundColor: 'rgba(100,181,246,0.5)', borderColor: '#64b5f6', borderWidth: 1, borderRadius: 3 },
        { label: '只抽半价', data: dist.discount.map(v => (v / n * 100).toFixed(1)), backgroundColor: 'rgba(129,199,132,0.5)', borderColor: '#81c784', borderWidth: 1, borderRadius: 3 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#c0c0c0' } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw}%` } }
      },
      scales: {
        x: { ticks: { color: '#888' }, grid: { display: false }, title: { display: true, text: '获得角色数', color: '#666' } },
        y: { ticks: { color: '#888', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

// ========== 期望花费 ==========
function updateExpectedStats() {
  const results = batchSimulate(currentPool, 10000);
  const stats = calcStats(results);
  document.getElementById('expMean').textContent = Math.round(stats.mean);
  document.getElementById('expMedian').textContent = stats.median;
  document.getElementById('expP90').textContent = stats.p90;
  document.getElementById('expWorst').textContent = stats.max;
}

// ========== 赌徒谬误 ==========
function updateFallacy() {
  const rate = parseFloat(document.getElementById('fallacyRate').value) / 100;
  document.getElementById('fallacyRateVal').textContent = (rate * 100).toFixed(1) + '%';

  const streaks = [10, 20, 30, 50, 80, 100, 150, 200];
  const probs = streaks.map(s => streakProbability(rate, s));

  // 显示关键数据
  const display = document.getElementById('streakDisplay');
  display.innerHTML = streaks.slice(0, 4).map((s, i) => {
    const p = (probs[i] * 100).toFixed(2);
    return `<span class="streak-box cold">${s}连不出: ${p}%</span>`;
  }).join('');

  // 图表
  drawFallacyChart(streaks, probs, rate);
}

function drawFallacyChart(streaks, probs, rate) {
  if (fallacyChart) { fallacyChart.destroy(); fallacyChart = null; }
  const ctx = document.getElementById('fallacyChart').getContext('2d');

  // 生成更细的数据
  const xData = [];
  const yData = [];
  for (let i = 1; i <= 200; i++) {
    xData.push(i);
    yData.push((streakProbability(rate, i) * 100).toFixed(2));
  }

  fallacyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: xData,
      datasets: [{
        label: '连续不出的概率',
        data: yData,
        borderColor: '#64b5f6',
        backgroundColor: 'rgba(100,181,246,0.08)',
        fill: true, pointRadius: 0, tension: 0.3, borderWidth: 2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `连续 ${ctx.label} 次不出的概率: ${ctx.raw}%` } }
      },
      scales: {
        x: { ticks: { color: '#888', maxTicksLimit: 10 }, grid: { display: false }, title: { display: true, text: '连续不出次数', color: '#666' } },
        y: { ticks: { color: '#888', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: '发生概率', color: '#666' } }
      }
    }
  });
}

// ========== 保底 vs 无保底对比 ==========
function runPityComparison() {
  const times = 10000;

  // 有保底
  const withPity = batchSimulate(currentPool, times);
  const statsWithPity = calcStats(withPity);

  // 无保底（同概率）
  const noPityConfig = { ...currentPool, softPity: 9999, hardPity: 9999, softPityRate: 0 };
  const noPity = batchSimulate(noPityConfig, times);
  const statsNoPity = calcStats(noPity);

  document.getElementById('pityCompareResults').style.display = '';

  document.getElementById('pityCompareStats').innerHTML = `
    <div class="stat-card green"><div class="val">${Math.round(statsWithPity.mean)}</div><div class="lbl">有保底-平均</div></div>
    <div class="stat-card red"><div class="val">${Math.round(statsNoPity.mean)}</div><div class="lbl">无保底-平均</div></div>
    <div class="stat-card green"><div class="val">${statsWithPity.max}</div><div class="lbl">有保底-最坏</div></div>
    <div class="stat-card red"><div class="val">${statsNoPity.max}</div><div class="lbl">无保底-最坏</div></div>
  `;

  // 对比CDF
  const maxVal = Math.min(statsNoPity.p99, 500);
  const cdfWith = cumulativeProb(withPity, maxVal);
  const cdfNo = cumulativeProb(noPity, maxVal);

  drawPityCompareChart(cdfWith, cdfNo, maxVal);

  const text = `同样 ${(currentPool.baseRate * 100).toFixed(1)}% 的基础概率：`
    + `有保底平均 ${Math.round(statsWithPity.mean)} 抽出货，最坏 ${statsWithPity.max} 抽；`
    + `无保底平均 ${Math.round(statsNoPity.mean)} 抽，最坏 ${statsNoPity.max} 抽。`
    + `<br>保底机制把「最坏情况」从 ${statsNoPity.max} 压缩到 ${statsWithPity.max}，`
    + `这就是确定性的价值——你知道最多花多少一定能拿到。`;
  document.getElementById('pityCompareText').innerHTML = text;
}

function drawPityCompareChart(cdfWith, cdfNo, maxVal) {
  if (pityCompareChart) { pityCompareChart.destroy(); pityCompareChart = null; }
  const ctx = document.getElementById('pityCompareChart').getContext('2d');

  pityCompareChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: cdfWith.x,
      datasets: [
        {
          label: '有保底',
          data: cdfWith.y.map(v => (v * 100).toFixed(1)),
          borderColor: '#81c784', backgroundColor: 'rgba(129,199,132,0.05)',
          fill: false, pointRadius: 0, tension: 0.3, borderWidth: 2.5
        },
        {
          label: '无保底',
          data: cdfNo.y.map(v => (v * 100).toFixed(1)),
          borderColor: '#ef9a9a', backgroundColor: 'rgba(239,154,154,0.05)',
          fill: false, pointRadius: 0, tension: 0.3, borderWidth: 2.5, borderDash: [5, 3]
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#c0c0c0' } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw}% 在 ${ctx.label} 抽内出货` } }
      },
      scales: {
        x: { ticks: { color: '#888', maxTicksLimit: 10 }, grid: { display: false }, title: { display: true, text: '抽数', color: '#666' } },
        y: { ticks: { color: '#888', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' }, min: 0, max: 100, title: { display: true, text: '累积出货概率', color: '#666' } }
      }
    }
  });
}

// ========== 启动 ==========
init();

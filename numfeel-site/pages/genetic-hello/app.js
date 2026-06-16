// ========== 状态 ==========
let target = 'hello world';
let population = [];
let generation = 0;
let running = false;
let timer = null;
let fitnessHistory = []; // [{gen, best, avg}]
let fitnessChart = null;
let experimentChart = null;

// ========== 参数读取 ==========
function getParams() {
  return {
    popSize: parseInt(document.getElementById('popSize').value),
    mutRate: parseFloat(document.getElementById('mutRate').value) / 100,
    crossRate: parseFloat(document.getElementById('crossRate').value) / 100,
    elite: parseInt(document.getElementById('elite').value),
    tournamentSize: 5
  };
}

function getSpeed() {
  return parseInt(document.getElementById('speedSelect').value);
}

// ========== 参数显示更新 ==========
function updateParam(id) {
  const el = document.getElementById(id);
  switch (id) {
    case 'popSize': document.getElementById('popSizeVal').textContent = el.value; break;
    case 'mutRate': document.getElementById('mutRateVal').textContent = parseFloat(el.value).toFixed(1) + '%'; break;
    case 'crossRate': document.getElementById('crossRateVal').textContent = el.value + '%'; break;
    case 'elite': document.getElementById('eliteVal').textContent = el.value; break;
  }
}

// ========== 预设选择 ==========
document.getElementById('presetGrid').addEventListener('click', function(e) {
  const card = e.target.closest('.preset-card');
  if (!card) return;
  document.querySelectorAll('.preset-card').forEach(c => c.classList.remove('active'));
  card.classList.add('active');
  target = card.dataset.target;
  document.getElementById('targetDisplay').textContent = target;
  document.getElementById('customTarget').value = '';
  resetEvolution();
});

function setCustomTarget() {
  const val = document.getElementById('customTarget').value.trim();
  if (!val) return;
  target = val;
  document.getElementById('targetDisplay').textContent = target;
  document.querySelectorAll('.preset-card').forEach(c => c.classList.remove('active'));
  resetEvolution();
}

// ========== 进化控制 ==========
function startEvolution() {
  if (running) return;
  const params = getParams();

  if (generation === 0) {
    population = initPopulation(params.popSize, target.length);
    fitnessHistory = [];
    clearLog();
    log('种群初始化完成，共 ' + params.popSize + ' 个个体', 'info');
  }

  running = true;
  document.getElementById('startBtn').disabled = true;
  document.getElementById('pauseBtn').disabled = false;
  document.getElementById('stepBtn').disabled = true;

  const speed = getSpeed();
  if (speed === 0) {
    // 全速模式：同步执行直到完成
    runFullSpeed(params);
  } else {
    timer = setInterval(() => tick(params), speed);
  }
}

function pauseEvolution() {
  running = false;
  if (timer) { clearInterval(timer); timer = null; }
  document.getElementById('startBtn').disabled = false;
  document.getElementById('pauseBtn').disabled = true;
  document.getElementById('stepBtn').disabled = false;
}

function stepEvolution() {
  const params = getParams();
  if (generation === 0) {
    population = initPopulation(params.popSize, target.length);
    fitnessHistory = [];
    clearLog();
    log('种群初始化完成', 'info');
  }
  tick(params);
}

function resetEvolution() {
  running = false;
  if (timer) { clearInterval(timer); timer = null; }
  generation = 0;
  population = [];
  fitnessHistory = [];

  document.getElementById('startBtn').disabled = false;
  document.getElementById('pauseBtn').disabled = true;
  document.getElementById('stepBtn').disabled = false;

  document.getElementById('genNum').textContent = '0';
  document.getElementById('bestFit').textContent = '0%';
  document.getElementById('avgFit').textContent = '0%';
  document.getElementById('diversity').textContent = '0%';
  document.getElementById('bestDisplay').innerHTML = '<span style="color:#666;">点击「开始进化」启动</span>';
  document.getElementById('popViewer').innerHTML = '';
  clearLog();
  updateFitnessChart();
}

// ========== 单步进化 ==========
function tick(params) {
  population = evolveOneGeneration(population, target, params.mutRate, params.crossRate, params.elite, params.tournamentSize);
  generation++;

  const best = getBest(population, target);
  const avg = getAvgFitness(population, target);
  const div = getDiversity(population);

  fitnessHistory.push({ gen: generation, best: best.fitness, avg: avg });

  // 更新 UI
  document.getElementById('genNum').textContent = generation;
  document.getElementById('bestFit').textContent = (best.fitness * 100).toFixed(1) + '%';
  document.getElementById('avgFit').textContent = (avg * 100).toFixed(1) + '%';
  document.getElementById('diversity').textContent = (div * 100).toFixed(0) + '%';
  renderBest(best.individual);
  renderPopViewer();

  // 每 10 代或完成时刷新图表
  if (generation % 10 === 0 || best.fitness === 1) {
    updateFitnessChart();
  }

  // 成功
  if (best.fitness === 1) {
    running = false;
    if (timer) { clearInterval(timer); timer = null; }
    document.getElementById('startBtn').disabled = false;
    document.getElementById('pauseBtn').disabled = true;
    document.getElementById('stepBtn').disabled = false;
    log('🎉 第 ' + generation + ' 代找到目标！', 'success');
    updateFitnessChart();
  }

  // 防止无限循环
  if (generation > 10000 && best.fitness < 1) {
    pauseEvolution();
    log('⚠️ 超过 10000 代未收敛，已暂停。试试增大种群或调高变异率。', 'info');
  }
}

function runFullSpeed(params) {
  const startTime = performance.now();
  while (running && generation < 10000) {
    population = evolveOneGeneration(population, target, params.mutRate, params.crossRate, params.elite, params.tournamentSize);
    generation++;
    const best = getBest(population, target);
    const avg = getAvgFitness(population, target);
    fitnessHistory.push({ gen: generation, best: best.fitness, avg: avg });
    if (best.fitness === 1) {
      running = false;
      break;
    }
  }
  const elapsed = (performance.now() - startTime).toFixed(0);
  running = false;

  const best = getBest(population, target);
  const avg = getAvgFitness(population, target);
  const div = getDiversity(population);

  document.getElementById('genNum').textContent = generation;
  document.getElementById('bestFit').textContent = (best.fitness * 100).toFixed(1) + '%';
  document.getElementById('avgFit').textContent = (avg * 100).toFixed(1) + '%';
  document.getElementById('diversity').textContent = (div * 100).toFixed(0) + '%';
  renderBest(best.individual);
  renderPopViewer();
  updateFitnessChart();

  document.getElementById('startBtn').disabled = false;
  document.getElementById('pauseBtn').disabled = true;
  document.getElementById('stepBtn').disabled = false;

  if (best.fitness === 1) {
    log('🎉 全速模式：第 ' + generation + ' 代找到目标，耗时 ' + elapsed + 'ms', 'success');
  } else {
    log('⚠️ 全速模式：10000 代未收敛（' + elapsed + 'ms）', 'info');
  }
}

// ========== 渲染最优个体（逐字符着色） ==========
function renderBest(individual) {
  let html = '';
  for (let i = 0; i < individual.length; i++) {
    const cls = individual[i] === target[i] ? 'char-correct' : 'char-wrong';
    const ch = individual[i] === ' ' ? '&nbsp;' : escHtml(individual[i]);
    html += '<span class="' + cls + '">' + ch + '</span>';
  }
  document.getElementById('bestDisplay').innerHTML = html;
}

// ========== 种群查看器 ==========
function renderPopViewer() {
  const viewer = document.getElementById('popViewer');
  const sorted = population.map(ind => ({ ind, fit: fitness(ind, target) }));
  sorted.sort((a, b) => b.fit - a.fit);
  const top10 = sorted.slice(0, 10);

  viewer.innerHTML = top10.map((item, i) => {
    let strHtml = '';
    for (let j = 0; j < item.ind.length; j++) {
      const cls = item.ind[j] === target[j] ? 'char-correct' : 'char-wrong';
      const ch = item.ind[j] === ' ' ? '&nbsp;' : escHtml(item.ind[j]);
      strHtml += '<span class="' + cls + '">' + ch + '</span>';
    }
    return '<div class="pop-row"><span class="pop-rank">' + (i + 1) +
      '</span><span class="pop-str">' + strHtml +
      '</span><span class="pop-fit">' + (item.fit * 100).toFixed(0) + '%</span></div>';
  }).join('');
}

// ========== 适应度曲线图 ==========
function updateFitnessChart() {
  if (fitnessChart) { fitnessChart.destroy(); fitnessChart = null; }
  const ctx = document.getElementById('fitnessChart').getContext('2d');

  // 采样以避免数据量太大
  const data = fitnessHistory.length > 500
    ? fitnessHistory.filter((_, i) => i % Math.ceil(fitnessHistory.length / 500) === 0 || i === fitnessHistory.length - 1)
    : fitnessHistory;

  fitnessChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => d.gen),
      datasets: [
        {
          label: '最优适应度',
          data: data.map(d => d.best * 100),
          borderColor: '#ffd700', backgroundColor: 'rgba(255,215,0,0.08)',
          fill: true, pointRadius: 0, tension: 0.3, borderWidth: 2.5
        },
        {
          label: '平均适应度',
          data: data.map(d => d.avg * 100),
          borderColor: '#64b5f6', backgroundColor: 'rgba(100,181,246,0.05)',
          fill: true, pointRadius: 0, tension: 0.3, borderWidth: 1.5
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#c0c0c0', font: { size: 12 } } },
        tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(1) + '%' } }
      },
      scales: {
        x: { title: { display: true, text: '代数', color: '#888' }, ticks: { color: '#888', maxTicksLimit: 10 }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { title: { display: true, text: '适应度 %', color: '#888' }, min: 0, max: 100, ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

// ========== 参数对比实验 ==========
function runExperiment(paramName) {
  const btn = event.target.closest('.btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader"></i> 运行中…';

  setTimeout(() => {
    const results = [];
    let configs, labelName;

    switch (paramName) {
      case 'mutRate':
        configs = [0.005, 0.01, 0.02, 0.05, 0.1];
        labelName = '变异率';
        break;
      case 'popSize':
        configs = [50, 100, 200, 500, 1000];
        labelName = '种群大小';
        break;
      case 'crossRate':
        configs = [0, 0.3, 0.5, 0.7, 0.9];
        labelName = '交叉率';
        break;
    }

    const testTarget = 'hello world';
    const runs = 10;

    for (const val of configs) {
      let totalGens = 0;
      for (let r = 0; r < runs; r++) {
        const ps = paramName === 'popSize' ? val : 200;
        const mr = paramName === 'mutRate' ? val : 0.01;
        const cr = paramName === 'crossRate' ? val : 0.7;
        let pop = initPopulation(ps, testTarget.length);
        let gen = 0;
        while (gen < 5000) {
          pop = evolveOneGeneration(pop, testTarget, mr, cr, 2, 5);
          gen++;
          if (getBest(pop, testTarget).fitness === 1) break;
        }
        totalGens += gen;
      }
      results.push({ label: val, avgGen: totalGens / runs });
    }

    drawExperimentChart(results, paramName, labelName);
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-flask"></i> ' + labelName + '对比';

    // 显示结论
    const bestConfig = results.reduce((a, b) => a.avgGen < b.avgGen ? a : b);
    const worstConfig = results.reduce((a, b) => a.avgGen > b.avgGen ? a : b);
    let resultText = '';
    switch (paramName) {
      case 'mutRate':
        resultText = '变异率 ' + (bestConfig.label * 100).toFixed(1) + '% 平均 ' + Math.round(bestConfig.avgGen) + ' 代收敛（最优）。' +
          '变异率 ' + (worstConfig.label * 100).toFixed(1) + '% 平均 ' + Math.round(worstConfig.avgGen) + ' 代（最慢）。' +
          '变异率太低找不到新解，太高破坏好基因。';
        break;
      case 'popSize':
        resultText = '种群 ' + bestConfig.label + ' 平均 ' + Math.round(bestConfig.avgGen) + ' 代收敛（最优）。' +
          '种群 ' + worstConfig.label + ' 平均 ' + Math.round(worstConfig.avgGen) + ' 代（最慢）。' +
          '种群大意味着更多搜索能力，但每代计算更贵。';
        break;
      case 'crossRate':
        resultText = '交叉率 ' + (bestConfig.label * 100) + '% 平均 ' + Math.round(bestConfig.avgGen) + ' 代收敛（最优）。' +
          '交叉率 ' + (worstConfig.label * 100) + '% 平均 ' + Math.round(worstConfig.avgGen) + ' 代（最慢）。' +
          '交叉帮助组合不同个体的优势片段。';
        break;
    }
    document.getElementById('experimentResult').textContent = '📊 ' + resultText;
  }, 50);
}

function drawExperimentChart(results, paramName, labelName) {
  if (experimentChart) { experimentChart.destroy(); experimentChart = null; }
  const ctx = document.getElementById('experimentChart').getContext('2d');

  const labels = results.map(r => {
    if (paramName === 'mutRate' || paramName === 'crossRate') return (r.label * 100) + '%';
    return r.label;
  });

  experimentChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '平均收敛代数',
        data: results.map(r => Math.round(r.avgGen)),
        backgroundColor: results.map((r, i) => {
          const minGen = Math.min(...results.map(x => x.avgGen));
          return r.avgGen === minGen ? 'rgba(129,199,132,0.7)' : 'rgba(255,215,0,0.5)';
        }),
        borderColor: results.map((r, i) => {
          const minGen = Math.min(...results.map(x => x.avgGen));
          return r.avgGen === minGen ? '#81c784' : '#ffd700';
        }),
        borderWidth: 1, borderRadius: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => '平均 ' + ctx.parsed.y + ' 代' } }
      },
      scales: {
        x: { title: { display: true, text: labelName, color: '#888' }, ticks: { color: '#888' }, grid: { display: false } },
        y: { title: { display: true, text: '收敛代数（越低越好）', color: '#888' }, ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

// ========== 日志 ==========
function log(msg, type) {
  const el = document.getElementById('logConsole');
  const cls = type === 'success' ? 'log-success' : type === 'info' ? 'log-info' : '';
  el.innerHTML += '<div class="log-line ' + cls + '">[Gen ' + generation + '] ' + msg + '</div>';
  el.scrollTop = el.scrollHeight;
}

function clearLog() {
  document.getElementById('logConsole').innerHTML = '';
}

// ========== 工具 ==========
function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 初始化图表
updateFitnessChart();

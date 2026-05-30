// ========== Collatz 猜想 — 页面交互逻辑 ==========

let singleChart = null;
let batchChart = null;
let distChart = null;
let animTimer = null;

// ── 经典难缠数字 ──
const FAMOUS_NUMBERS = [7, 9, 27, 97, 171, 231, 703, 871, 6171, 77031];

// ── 初始化 ──
document.addEventListener('DOMContentLoaded', () => {
  // 回车触发运行
  document.getElementById('inputN').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runSingle();
  });

  // 渲染不依赖 Chart.js 的部分
  renderFamousTable();

  // 确保 Chart.js 加载后再渲染图表
  ensureChartJS(() => {
    runBatch();
    renderDistribution();
  });
});

// ── 单数探索 ──
function runSingle() {
  clearAnimation();
  const n = parseInt(document.getElementById('inputN').value);
  if (!n || n < 1 || n > 99999999) {
    alert('请输入 1~99999999 之间的正整数');
    return;
  }

  const seq = collatzSequence(n);
  const steps = seq.length - 1;
  const maxVal = Math.max(...seq);
  const ratio = (maxVal / n).toFixed(1);

  // 显示统计
  document.getElementById('singleStats').style.display = 'flex';
  document.getElementById('statSteps').textContent = steps;
  document.getElementById('statMax').textContent = formatNumber(maxVal);
  document.getElementById('statRatio').textContent = ratio + '×';

  // 渲染序列
  renderSequence(seq);

  // 渲染折线图
  ensureChartJS(() => renderSingleChart(seq, n));
}

function runAnimated() {
  clearAnimation();
  const n = parseInt(document.getElementById('inputN').value);
  if (!n || n < 1 || n > 99999999) {
    alert('请输入 1~99999999 之间的正整数');
    return;
  }

  const seq = collatzSequence(n);
  const steps = seq.length - 1;
  const maxVal = Math.max(...seq);
  const ratio = (maxVal / n).toFixed(1);

  document.getElementById('singleStats').style.display = 'flex';
  document.getElementById('statSteps').textContent = steps;
  document.getElementById('statMax').textContent = formatNumber(maxVal);
  document.getElementById('statRatio').textContent = ratio + '×';

  // 动画逐步展示序列
  const container = document.getElementById('seqContainer');
  const flow = document.getElementById('seqFlow');
  container.style.display = 'block';
  flow.innerHTML = '';

  // 限制动画长度
  const showSeq = seq.length > 200 ? seq.slice(0, 200) : seq;
  let idx = 0;
  const speed = Math.max(20, Math.min(150, 3000 / showSeq.length));

  animTimer = setInterval(() => {
    if (idx >= showSeq.length) {
      clearInterval(animTimer);
      animTimer = null;
      if (seq.length > 200) {
        const more = document.createElement('span');
        more.className = 'seq-num odd';
        more.textContent = `...还有${seq.length - 200}步`;
        flow.appendChild(more);
      }
      return;
    }
    const val = showSeq[idx];
    if (idx > 0) {
      const arrow = document.createElement('span');
      arrow.className = 'seq-arrow';
      arrow.textContent = '→';
      flow.appendChild(arrow);
    }
    const span = document.createElement('span');
    if (idx === 0) span.className = 'seq-num start';
    else if (val === 1) span.className = 'seq-num end';
    else if (val % 2 === 0) span.className = 'seq-num even';
    else span.className = 'seq-num odd';
    span.textContent = formatNumber(val);
    flow.appendChild(span);
    container.scrollTop = container.scrollHeight;
    idx++;
  }, speed);

  // 渲染折线图
  ensureChartJS(() => renderSingleChart(seq, n));
}

function clearAnimation() {
  if (animTimer) {
    clearInterval(animTimer);
    animTimer = null;
  }
}

function renderSequence(seq) {
  const container = document.getElementById('seqContainer');
  const flow = document.getElementById('seqFlow');
  container.style.display = 'block';
  flow.innerHTML = '';

  const showSeq = seq.length > 200 ? seq.slice(0, 200) : seq;

  showSeq.forEach((val, idx) => {
    if (idx > 0) {
      const arrow = document.createElement('span');
      arrow.className = 'seq-arrow';
      arrow.textContent = '→';
      flow.appendChild(arrow);
    }
    const span = document.createElement('span');
    if (idx === 0) span.className = 'seq-num start';
    else if (val === 1) span.className = 'seq-num end';
    else if (val % 2 === 0) span.className = 'seq-num even';
    else span.className = 'seq-num odd';
    span.textContent = formatNumber(val);
    flow.appendChild(span);
  });

  if (seq.length > 200) {
    const more = document.createElement('span');
    more.className = 'seq-num odd';
    more.textContent = `...还有${seq.length - 200}步`;
    flow.appendChild(more);
  }
}

function renderSingleChart(seq, n) {
  const wrap = document.getElementById('singleChartWrap');
  wrap.style.display = 'block';

  if (singleChart) singleChart.destroy();
  const ctx = document.getElementById('singleChart').getContext('2d');

  // 对长序列采样
  let labels, data;
  if (seq.length > 500) {
    const step = Math.ceil(seq.length / 500);
    labels = []; data = [];
    for (let i = 0; i < seq.length; i += step) {
      labels.push(i);
      data.push(seq[i]);
    }
    if (labels[labels.length - 1] !== seq.length - 1) {
      labels.push(seq.length - 1);
      data.push(1);
    }
  } else {
    labels = seq.map((_, i) => i);
    data = seq;
  }

  singleChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `n=${n} 的 Collatz 轨迹`,
        data,
        borderColor: '#ffd700',
        backgroundColor: 'rgba(255,215,0,0.1)',
        fill: true,
        pointRadius: seq.length > 100 ? 0 : 2,
        borderWidth: 1.5,
        tension: 0.1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#a0a0a0' } },
        tooltip: {
          callbacks: {
            title: (items) => `第 ${items[0].label} 步`,
            label: (item) => `值: ${Number(item.raw).toLocaleString()}`
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: '步数', color: '#666' },
          ticks: { color: '#666', maxTicksLimit: 10 },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        y: {
          title: { display: true, text: '值', color: '#666' },
          ticks: { color: '#666', callback: v => formatNumber(v) },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });
}

// ── 经典数字表格 ──
function renderFamousTable() {
  const tbody = document.getElementById('famousBody');
  tbody.innerHTML = '';
  FAMOUS_NUMBERS.forEach(n => {
    const steps = collatzSteps(n);
    const max = collatzMax(n);
    const ratio = (max / n).toFixed(1);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="clickable" onclick="loadFamous(${n})">${n.toLocaleString()}</td>
      <td>${steps}</td>
      <td>${formatNumber(max)}</td>
      <td>${ratio}×</td>
    `;
    tbody.appendChild(tr);
  });
}

function loadFamous(n) {
  document.getElementById('inputN').value = n;
  runSingle();
  document.querySelector('.section').scrollIntoView({ behavior: 'smooth' });
}

// ── 批量散点图 ──
function runBatch() {
  const maxN = parseInt(document.getElementById('rangeSelect').value);

  requestAnimationFrame(() => {
    const data = batchSteps(maxN);
    const longest = findLongest(maxN);
    const highest = findHighest(maxN);

    document.getElementById('recLongestN').textContent = longest.n.toLocaleString();
    document.getElementById('recLongestSteps').textContent = longest.steps;
    document.getElementById('recHighestN').textContent = highest.n.toLocaleString();
    document.getElementById('recHighestVal').textContent = formatNumber(highest.max);

    renderBatchChart(data, maxN);
  });
}

function renderBatchChart(data, maxN) {
  if (batchChart) batchChart.destroy();
  const ctx = document.getElementById('batchChart').getContext('2d');

  // 采样以保证性能
  let plotData;
  if (data.length > 3000) {
    const step = Math.ceil(data.length / 3000);
    plotData = data.filter((_, i) => i % step === 0);
  } else {
    plotData = data;
  }

  batchChart = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: `1~${maxN.toLocaleString()} 的步数`,
        data: plotData.map(d => ({ x: d.n, y: d.steps })),
        backgroundColor: 'rgba(255,215,0,0.4)',
        pointRadius: maxN > 10000 ? 1 : 1.5,
        pointHoverRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#a0a0a0' } },
        tooltip: {
          callbacks: {
            label: (item) => `n=${item.raw.x.toLocaleString()}, 步数=${item.raw.y}`
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: '起始值 n', color: '#666' },
          ticks: { color: '#666' },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        y: {
          title: { display: true, text: '步数', color: '#666' },
          ticks: { color: '#666' },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });
}

// ── 步数频率分布 ──
function renderDistribution() {
  const dist = stepsDistribution(10000);
  const maxSteps = Math.max(...dist.keys());

  const labels = [];
  const data = [];
  for (let s = 0; s <= maxSteps; s++) {
    labels.push(s);
    data.push(dist.get(s) || 0);
  }

  const ctx = document.getElementById('distChart').getContext('2d');
  distChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '频次（1~10000中有多少个数需要该步数）',
        data,
        backgroundColor: 'rgba(33,150,243,0.5)',
        borderColor: 'rgba(33,150,243,0.8)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#a0a0a0' } },
        tooltip: {
          callbacks: {
            title: (items) => `步数: ${items[0].label}`,
            label: (item) => `有 ${item.raw} 个数需要这么多步`
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: '步数', color: '#666' },
          ticks: { color: '#666', maxTicksLimit: 20 },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        y: {
          title: { display: true, text: '频次', color: '#666' },
          ticks: { color: '#666' },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });
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
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    script.onload = callback;
    document.head.appendChild(script);
  }
}

// ========== 斯特鲁普效应 — 前端交互 ==========

const API_BASE = 'https://numfeel-api.996.ninja';

let trials = [];
let currentIdx = 0;
let results = [];
let trialStartTime = 0;
let gameActive = false;
let rtChart = null;
let gradeDistChart = null;

const KEY_MAP = ['1', '2', '3', '4', '5', '6'];

// ========== 初始化 ==========
function showIntro() {
  document.getElementById('introSection').style.display = '';
  document.getElementById('gameSection').style.display = 'none';
  document.getElementById('resultSection').style.display = 'none';
}

function startGame() {
  const totalCount = parseInt(document.getElementById('trialCountSelect').value);
  const half = Math.floor(totalCount / 2);
  trials = generateTrialSequence(half, totalCount - half);
  // 标记每道题的类型
  trials.forEach(t => {
    t.type = t.text === t.textColorName ? 'congruent' : 'incongruent';
  });

  currentIdx = 0;
  results = [];
  gameActive = false;

  document.getElementById('introSection').style.display = 'none';
  document.getElementById('gameSection').style.display = '';
  document.getElementById('resultSection').style.display = 'none';

  document.getElementById('totalTrials').textContent = trials.length;
  document.getElementById('correctCount').textContent = '0';
  updateProgress();

  buildColorButtons();
  countdown(3);
}

// ========== 倒计时 ==========
function countdown(n) {
  const area = document.getElementById('gameArea');
  document.getElementById('colorButtons').style.display = 'none';
  document.getElementById('keyboardHint').style.display = 'none';

  if (n <= 0) {
    gameActive = true;
    showTrial();
    return;
  }
  area.innerHTML = `<div class="countdown">${n}</div>`;
  setTimeout(() => countdown(n - 1), 700);
}

// ========== 生成颜色按钮 ==========
function buildColorButtons() {
  const container = document.getElementById('colorButtons');
  const hintContainer = document.getElementById('keyboardHint');
  container.innerHTML = '';
  hintContainer.innerHTML = '';

  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  COLORS.forEach((c, i) => {
    const btn = document.createElement('button');
    btn.className = 'color-btn';
    btn.style.background = c.css;
    btn.textContent = c.name;
    btn.dataset.color = c.name;

    if (isTouchDevice) {
      // 用 touchstart 替代 click，消除 300ms 延迟
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleAnswer(c.name, btn);
      }, { passive: false });
    } else {
      btn.onclick = () => handleAnswer(c.name, btn);
    }

    container.appendChild(btn);

    const hint = document.createElement('span');
    hint.className = 'key-hint';
    hint.innerHTML = `<span class="key-cap">${KEY_MAP[i]}</span><span style="color:${c.css}">${c.name}</span>`;
    hintContainer.appendChild(hint);
  });
}

// ========== 显示题目 ==========
function showTrial() {
  if (currentIdx >= trials.length) {
    endGame();
    return;
  }
  const trial = trials[currentIdx];
  const area = document.getElementById('gameArea');
  area.innerHTML = `
    <div class="stimulus-word" style="color:${trial.textColor}">${trial.text}</div>
    <div class="prompt-text">说出墨水颜色，不是文字内容</div>
  `;
  document.getElementById('colorButtons').style.display = 'flex';
  document.getElementById('keyboardHint').style.display = 'flex';
  document.getElementById('trialNum').textContent = currentIdx + 1;
  updateProgress();

  // 启用按钮
  document.querySelectorAll('.color-btn').forEach(b => b.disabled = false);
  trialStartTime = performance.now();
}

// ========== 处理回答 ==========
function handleAnswer(answer, btnEl) {
  if (!gameActive) return;

  const rt = performance.now() - trialStartTime;
  const trial = trials[currentIdx];
  const correct = isCorrect(trial, answer);

  results.push({
    correct,
    rt: Math.round(rt),
    type: trial.type,
    text: trial.text,
    textColor: trial.textColorName,
    answer,
  });

  // 视觉反馈
  if (btnEl) {
    btnEl.classList.add(correct ? 'correct-flash' : 'wrong-flash');
    setTimeout(() => btnEl.classList.remove('correct-flash', 'wrong-flash'), 400);
  }
  showFeedback(correct, rt);

  document.getElementById('correctCount').textContent =
    results.filter(r => r.correct).length;

  // 禁用按钮防止重复点击
  document.querySelectorAll('.color-btn').forEach(b => b.disabled = true);

  currentIdx++;
  setTimeout(showTrial, 500);
}

function showFeedback(correct, rt) {
  const el = document.createElement('div');
  el.className = `feedback ${correct ? 'correct' : 'wrong'}`;
  el.textContent = correct ? `✓ ${Math.round(rt)}ms` : '✗ 错误';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

function updateProgress() {
  const pct = trials.length > 0 ? (currentIdx / trials.length * 100) : 0;
  document.getElementById('progressFill').style.width = pct + '%';
}

// ========== 键盘支持 ==========
document.addEventListener('keydown', (e) => {
  if (!gameActive) return;
  const idx = KEY_MAP.indexOf(e.key);
  if (idx >= 0 && idx < COLORS.length) {
    const btns = document.querySelectorAll('.color-btn');
    if (btns[idx] && !btns[idx].disabled) {
      handleAnswer(COLORS[idx].name, btns[idx]);
    }
  }
});

// ========== 结束游戏 ==========
function endGame() {
  gameActive = false;
  document.getElementById('gameSection').style.display = 'none';
  document.getElementById('resultSection').style.display = '';

  const stats = computeStats(results);
  renderStats(stats);
  renderCompare(stats);
  renderGrade(stats);
  renderTimeline();
  renderRTChart(stats);
  renderInsight(stats);
  submitResult(stats);
}

// ========== 渲染统计 ==========
function renderStats(stats) {
  const grid = document.getElementById('statsGrid');
  const items = [
    { val: stats.total, lbl: '总题数' },
    { val: stats.correctCount, lbl: '正确数' },
    { val: (stats.accuracy * 100).toFixed(0) + '%', lbl: '正确率' },
    { val: stats.avgRT.toFixed(0) + 'ms', lbl: '平均反应时间' },
    { val: stats.stroopEffect.toFixed(0) + 'ms', lbl: '斯特鲁普效应量' },
  ];
  grid.innerHTML = items.map(i =>
    `<div class="stat-card"><div class="val">${i.val}</div><div class="lbl">${i.lbl}</div></div>`
  ).join('');
}

function renderCompare(stats) {
  const el = document.getElementById('resultCompare');
  el.innerHTML = `
    <div class="result-card green">
      <span class="tag">一致条件</span>
      <div class="big">${stats.congruent.avgRT.toFixed(0)}ms</div>
      <div class="sub">正确率 ${(stats.congruent.accuracy * 100).toFixed(0)}% · ${stats.congruent.count} 题</div>
    </div>
    <div class="result-card gold">
      <span class="tag">不一致条件</span>
      <div class="big">${stats.incongruent.avgRT.toFixed(0)}ms</div>
      <div class="sub">正确率 ${(stats.incongruent.accuracy * 100).toFixed(0)}% · ${stats.incongruent.count} 题</div>
    </div>
    <div class="result-card blue">
      <span class="tag">斯特鲁普效应</span>
      <div class="big">${stats.stroopEffect.toFixed(0)}ms</div>
      <div class="sub">不一致 − 一致 的差值</div>
    </div>
  `;
}

function renderGrade(stats) {
  const grade = getStroopGrade(stats.stroopEffect);
  const el = document.getElementById('gradeBox');
  const boxClass = stats.stroopEffect < 100 ? 'green' : stats.stroopEffect > 300 ? 'red' : '';
  el.innerHTML = `
    <div class="insight-box ${boxClass}">
      <h3><i class="ti ti-award"></i> 你的评级：${grade.grade}</h3>
      <p>${grade.desc}。你的斯特鲁普效应量为 <strong>${stats.stroopEffect.toFixed(0)}ms</strong>，
      经典实验中大多数人在 100~300ms 之间。</p>
    </div>
  `;
}

// ========== RT 时间线 ==========
function renderTimeline() {
  const container = document.getElementById('rtTimeline');
  const maxRT = Math.max(...results.map(r => r.rt), 500);
  container.innerHTML = results.map(r => {
    const h = Math.max(4, (r.rt / maxRT) * 76);
    let cls = r.correct ? r.type : 'wrong';
    return `<div class="rt-bar ${cls}" style="height:${h}px" title="${r.rt}ms ${r.correct ? '✓' : '✗'}"></div>`;
  }).join('');
}

// ========== RT 分布图 ==========
function renderRTChart(stats) {
  if (rtChart) rtChart.destroy();

  const conRTs = results.filter(r => r.correct && r.type === 'congruent').map(r => r.rt);
  const incRTs = results.filter(r => r.correct && r.type === 'incongruent').map(r => r.rt);

  // 构建直方图
  const allRTs = conRTs.concat(incRTs);
  if (allRTs.length === 0) return;
  const minRT = Math.min(...allRTs);
  const maxRT = Math.max(...allRTs);
  const binSize = Math.max(50, Math.round((maxRT - minRT) / 10));
  const binStart = Math.floor(minRT / binSize) * binSize;
  const binEnd = Math.ceil(maxRT / binSize) * binSize;
  const labels = [];
  const conBins = [];
  const incBins = [];

  for (let b = binStart; b < binEnd; b += binSize) {
    labels.push(`${b}-${b + binSize}`);
    conBins.push(conRTs.filter(rt => rt >= b && rt < b + binSize).length);
    incBins.push(incRTs.filter(rt => rt >= b && rt < b + binSize).length);
  }

  const ctx = document.getElementById('rtChart').getContext('2d');
  rtChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '一致条件',
          data: conBins,
          backgroundColor: 'rgba(76,175,80,0.6)',
          borderColor: 'rgba(76,175,80,0.8)',
          borderWidth: 1,
        },
        {
          label: '不一致条件',
          data: incBins,
          backgroundColor: 'rgba(255,152,0,0.6)',
          borderColor: 'rgba(255,152,0,0.8)',
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#a0a0a0', font: { size: 12 } } },
        title: {
          display: true,
          text: '反应时间分布 (ms)',
          color: '#ffd700',
          font: { size: 14 },
        },
      },
      scales: {
        x: {
          ticks: { color: '#666', font: { size: 10 } },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
        y: {
          ticks: { color: '#666', stepSize: 1 },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
      },
    },
  });
}

// ========== 洞察 ==========
function renderInsight(stats) {
  const el = document.getElementById('insightBox');
  const lines = [];

  if (stats.stroopEffect > 0) {
    lines.push(`不一致条件下你平均慢了 <strong>${stats.stroopEffect.toFixed(0)}ms</strong>，这就是你的大脑在「自动阅读」和「识别颜色」之间打架的时间。`);
  } else {
    lines.push(`你在不一致条件下反而更快，这很少见。可能是你已经适应了反向思维，或者样本量较小导致的波动。`);
  }

  const accDiff = stats.congruent.accuracy - stats.incongruent.accuracy;
  if (accDiff > 0.05) {
    lines.push(`不一致条件的正确率低了 ${(accDiff * 100).toFixed(0)} 个百分点，说明干扰不仅让你变慢，还让你更容易出错。`);
  }

  lines.push(`1935 年 Stroop 的原始实验中，被试在不一致条件下平均多花 74% 的时间。你的干扰比例是 ${stats.congruent.avgRT > 0 ? ((stats.stroopEffect / stats.congruent.avgRT) * 100).toFixed(0) : 0}%。`);

  el.innerHTML = `
    <div class="insight-box">
      <h3><i class="ti ti-bulb"></i> 数据解读</h3>
      <p>${lines.join('<br><br>')}</p>
    </div>
  `;
}

// ========== 提交结果到后端 ==========
function submitResult(stats) {
  const grade = getStroopGrade(stats.stroopEffect);
  const payload = {
    total: stats.total,
    correctCount: stats.correctCount,
    accuracy: parseFloat(stats.accuracy.toFixed(4)),
    avgRT: parseFloat(stats.avgRT.toFixed(1)),
    conAvgRT: parseFloat(stats.congruent.avgRT.toFixed(1)),
    incAvgRT: parseFloat(stats.incongruent.avgRT.toFixed(1)),
    stroopEffect: parseFloat(stats.stroopEffect.toFixed(1)),
    grade: grade.grade,
  };

  const box = document.getElementById('submitBox');
  box.innerHTML = '<div style="color:#666; font-size:0.88rem; margin-top:12px;">正在提交结果...</div>';

  fetch(API_BASE + '/stroop/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then(r => r.json())
    .then(res => {
      if (res.status === 200 && res.data) {
        const d = res.data;
        box.innerHTML = `
          <div class="insight-box green" style="margin-top:16px;">
            <h3><i class="ti ti-chart-arrows-vertical"></i> 你的排名</h3>
            <p>在 <strong>${d.totalSessions}</strong> 位挑战者中，你的斯特鲁普效应量排名第 <strong>${d.rank}</strong>（效应越小越好），超过了 <strong>${d.percentile}%</strong> 的人。</p>
          </div>
        `;
      } else {
        box.innerHTML = '';
      }
      loadCommunityStats();
    })
    .catch(() => {
      box.innerHTML = '';
      loadCommunityStats();
    });
}

// ========== 社区统计 ==========
function loadCommunityStats() {
  const loading = document.getElementById('communityLoading');
  const content = document.getElementById('communityContent');
  const error = document.getElementById('communityError');

  loading.style.display = '';
  content.style.display = 'none';
  error.style.display = 'none';

  fetch(API_BASE + '/stroop/stats')
    .then(r => r.json())
    .then(res => {
      loading.style.display = 'none';
      if (res.status === 200 && res.data && res.data.global && res.data.global.totalSessions > 0) {
        content.style.display = '';
        renderCommunityStats(res.data);
      } else {
        error.style.display = '';
      }
    })
    .catch(() => {
      loading.style.display = 'none';
      error.style.display = '';
    });
}

function renderCommunityStats(data) {
  const g = data.global;
  const grid = document.getElementById('communityStats');
  const items = [
    { val: g.totalSessions, lbl: '总挑战次数' },
    { val: (g.avgStroopEffect || 0).toFixed(0) + 'ms', lbl: '平均斯特鲁普效应' },
    { val: (g.avgRT || 0).toFixed(0) + 'ms', lbl: '平均反应时间' },
    { val: (g.avgAccuracyPct || 0).toFixed(0) + '%', lbl: '平均正确率' },
    { val: (g.avgConRT || 0).toFixed(0) + 'ms', lbl: '一致条件平均 RT' },
    { val: (g.avgIncRT || 0).toFixed(0) + 'ms', lbl: '不一致条件平均 RT' },
  ];
  grid.innerHTML = items.map(i =>
    `<div class="stat-card"><div class="val">${i.val}</div><div class="lbl">${i.lbl}</div></div>`
  ).join('');

  // 评级分布图
  renderGradeDistChart(data.gradeDist || {});

  // 洞察
  const insight = document.getElementById('communityInsight');
  const effectDiff = ((g.avgIncRT || 0) - (g.avgConRT || 0)).toFixed(0);
  insight.innerHTML = `
    <div class="insight-box" style="margin-top:16px;">
      <h3><i class="ti ti-chart-pie"></i> 社区洞察</h3>
      <p>所有挑战者的平均斯特鲁普效应为 <strong>${(g.avgStroopEffect || 0).toFixed(0)}ms</strong>，
      不一致条件比一致条件平均慢 <strong>${effectDiff}ms</strong>。
      这与经典实验中 100~300ms 的干扰范围一致。</p>
    </div>
  `;
}

function renderGradeDistChart(gradeDist) {
  if (gradeDistChart) gradeDistChart.destroy();

  const gradeOrder = ['认知忍者', '冷静选手', '正常水平', '容易被带偏', '文字奴隶'];
  const gradeColors = ['#4CAF50', '#8BC34A', '#ffd700', '#FF9800', '#ff4444'];
  const labels = [];
  const values = [];
  const colors = [];

  gradeOrder.forEach((g, i) => {
    const cnt = gradeDist[g] || 0;
    if (cnt > 0) {
      labels.push(g);
      values.push(cnt);
      colors.push(gradeColors[i]);
    }
  });

  // 处理可能存在的未知评级
  Object.keys(gradeDist).forEach(k => {
    if (!gradeOrder.includes(k) && gradeDist[k] > 0) {
      labels.push(k);
      values.push(gradeDist[k]);
      colors.push('#888');
    }
  });

  if (values.length === 0) return;

  const ctx = document.getElementById('gradeDistChart').getContext('2d');
  gradeDistChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: 'rgba(0,0,0,0.3)',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#a0a0a0', font: { size: 12 }, padding: 16 },
        },
        title: {
          display: true,
          text: '评级分布',
          color: '#ffd700',
          font: { size: 14 },
        },
      },
    },
  });
}

// ========== 页面加载时获取社区统计 ==========
document.addEventListener('DOMContentLoaded', loadCommunityStats);

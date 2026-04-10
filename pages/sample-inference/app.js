// ========== 游戏状态 ==========
let currentRound = 0;
let totalScore = 0;
let roundHistory = [];
let currentScenario = null;
let allSamples = [];
let revealedCount = 0;
let revealPenalty = 0;
const MAX_REVEAL = 10;

let clueChart = null;
let guessChart = null;
let resultChart = null;
let finalChart = null;
let shuffledScenarios = [];

// ========== 初始化 ==========
function initGame() {
  currentRound = 0;
  totalScore = 0;
  roundHistory = [];
  shuffledScenarios = shuffleArray(SCENARIOS);

  document.getElementById('totalRounds').textContent = shuffledScenarios.length;
  document.getElementById('gameSection').style.display = '';
  document.getElementById('finalSection').style.display = 'none';
  startRound();
}

function startRound() {
  currentScenario = shuffledScenarios[currentRound];
  const s = currentScenario;

  allSamples = generateSamples(s.mean, s.std, 20, s.minVal);
  revealedCount = 3;
  revealPenalty = 0;

  // UI 更新
  document.getElementById('roundNum').textContent = currentRound + 1;
  document.getElementById('totalScore').textContent = totalScore;
  document.getElementById('progressFill').style.width =
    (currentRound / shuffledScenarios.length * 100) + '%';
  document.getElementById('scenarioTitle').textContent = s.title;
  document.getElementById('scenarioDesc').textContent = s.desc;
  document.getElementById('roundResult').style.display = 'none';
  document.getElementById('submitBtn').disabled = false;
  document.getElementById('revealBtn').disabled = false;

  // 只设置均值滑块
  const avgSlider = document.getElementById('guessAvg');
  avgSlider.min = s.sliderMin; avgSlider.max = s.sliderMax;
  avgSlider.step = s.sliderStep; avgSlider.value = s.defaultGuess;

  renderDataPoints();
  updateGuessDisplay();
  updateClueChart();
}

// ========== 数据点渲染 ==========
function renderDataPoints() {
  const container = document.getElementById('dataPoints');
  container.innerHTML = '';
  for (let i = 0; i < revealedCount; i++) {
    const dp = document.createElement('span');
    dp.className = 'data-point';
    dp.textContent = formatVal(allSamples[i], currentScenario);
    dp.style.animationDelay = (i * 0.06) + 's';
    container.appendChild(dp);
  }
  document.getElementById('revealCount').textContent =
    '已看 ' + revealedCount + ' / ' + MAX_REVEAL;
}

function revealNext() {
  if (revealedCount >= MAX_REVEAL) return;
  revealedCount++;
  revealPenalty += 5;
  renderDataPoints();
  updateClueChart();
  if (revealedCount >= MAX_REVEAL) {
    document.getElementById('revealBtn').disabled = true;
  }
}

// ========== 线索图（散点 + 均值线） ==========
function updateClueChart() {
  const revealed = allSamples.slice(0, revealedCount);
  const s = currentScenario;
  if (clueChart) { clueChart.destroy(); clueChart = null; }

  const ctx = document.getElementById('clueChart').getContext('2d');
  const mean = sampleMean(revealed);

  // y 轴范围：基于数据，留 20% 余量
  const minV = Math.min(...revealed);
  const maxV = Math.max(...revealed);
  const pad = (maxV - minV) * 0.35 || Math.abs(mean) * 0.2 || 1;
  const yMin = minV - pad;
  const yMax = maxV + pad;

  clueChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: revealed.map((_, i) => '#' + (i + 1)),
      datasets: [
        {
          type: 'bar',
          label: '数据点',
          data: revealed,
          backgroundColor: revealed.map((_, i) => {
            const alpha = 0.5 + (i / revealed.length) * 0.35;
            return `rgba(255,215,0,${alpha.toFixed(2)})`;
          }),
          borderColor: '#ffd700',
          borderWidth: 1,
          borderRadius: 5,
          barPercentage: 0.55,
          categoryPercentage: 0.65
        },
        {
          type: 'line',
          label: '样本均值',
          data: revealed.map(() => mean),
          borderColor: 'rgba(255,100,100,0.7)',
          borderWidth: 1.5,
          borderDash: [4, 3],
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (ctx.datasetIndex === 1) return '样本均值: ' + formatNum(mean, s);
              return formatVal(ctx.raw, s);
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#888', font: { size: 11 } },
          grid: { display: false }
        },
        y: {
          min: yMin, max: yMax,
          ticks: {
            color: '#888', font: { size: 10 }, maxTicksLimit: 5,
            callback: (v) => s.sliderStep >= 1 ? Math.round(v).toLocaleString() : v.toFixed(1)
          },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });
}

// ========== 猜测滑块显示（只有均值） ==========
function updateGuessDisplay() {
  const avg = parseFloat(document.getElementById('guessAvg').value);
  const s = currentScenario;

  document.getElementById('guessAvgVal').textContent =
    s.sliderStep >= 1 ? Math.round(avg).toLocaleString() : avg.toFixed(1);

  // 用真实 std 画预览曲线，让用户感受数据形状
  if (guessChart) { guessChart.destroy(); guessChart = null; }
  const ctx = document.getElementById('guessChart').getContext('2d');
  const std = s.std;
  const lo = avg - 3.5 * std, hi = avg + 3.5 * std;
  const step = (hi - lo) / 80;
  const labels = [], data = [];
  for (let x = lo; x <= hi; x += step) {
    labels.push(s.sliderStep >= 1 ? Math.round(x).toLocaleString() : x.toFixed(1));
    data.push(gaussianPDF(x, avg, std));
  }

  guessChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data, fill: true,
        backgroundColor: 'rgba(255,215,0,0.1)',
        borderColor: '#ffd700', borderWidth: 2.5,
        pointRadius: 0, tension: 0.4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { ticks: { color: '#888', maxTicksLimit: 5, font: { size: 10 } }, grid: { display: false } },
        y: { display: false }
      }
    }
  });
}

// ========== 提交猜测（只用均值评分） ==========
function submitGuess() {
  const guessAvg = parseFloat(document.getElementById('guessAvg').value);
  const s = currentScenario;
  const revealed = allSamples.slice(0, revealedCount);
  const mleAvg = sampleMean(revealed);

  // 只按均值误差评分，误差在1个std内满分，线性衰减
  const scoreByAvg = (guess, trueAvg, trueStd) => {
    const err = Math.abs(guess - trueAvg) / trueStd;
    return Math.max(0, Math.round(100 - err * 35));
  };

  let score = scoreByAvg(guessAvg, s.mean, s.std);
  score = Math.max(0, score - revealPenalty);
  const mleScore = scoreByAvg(mleAvg, s.mean, s.std);

  totalScore += score;
  roundHistory.push({ scenario: s.title, guessAvg, mleAvg, trueAvg: s.mean, trueStd: s.std, score, mleScore, revealed: revealedCount });

  document.getElementById('submitBtn').disabled = true;
  document.getElementById('revealBtn').disabled = true;
  document.getElementById('roundResult').style.display = '';
  document.getElementById('totalScore').textContent = totalScore;

  // 填充结果卡片
  const fmt = (v) => s.sliderStep >= 1 ? Math.round(v).toLocaleString() : v.toFixed(1);
  document.getElementById('resYouAvg').textContent = fmt(guessAvg);
  document.getElementById('resMleAvg').textContent = fmt(mleAvg);
  document.getElementById('resTrueAvg').textContent = fmt(s.mean);

  // 误差百分比
  const youErrPct = ((Math.abs(guessAvg - s.mean) / s.mean) * 100).toFixed(1);
  const mleErrPct = ((Math.abs(mleAvg - s.mean) / s.mean) * 100).toFixed(1);
  document.getElementById('resYouSub').textContent = '误差 ' + youErrPct + '%';
  document.getElementById('resMleSub').textContent = '误差 ' + mleErrPct + '%';
  document.getElementById('resTrueSub').textContent = '标准差 ±' + fmt(s.std);

  drawResultChart(guessAvg, mleAvg, s.mean, s.std, s);

  // 洞察
  const youErr = Math.abs(guessAvg - s.mean);
  const mleErr = Math.abs(mleAvg - s.mean);
  const youBetter = youErr < mleErr;
  const insightEl = document.getElementById('roundInsight');
  insightEl.className = 'insight-box ' + (score >= 70 ? 'green' : score >= 40 ? '' : 'red');

  let txt = youBetter
    ? `你猜的比纯数据平均更准！你的误差 ${fmt(youErr)}，MLE 误差 ${fmt(mleErr)}。说明你对这个领域有感觉，先验知识帮了你。`
    : `这轮 MLE 更准。MLE 误差 ${fmt(mleErr)}，你的误差 ${fmt(youErr)}。有时候几个数据点已经够用了，直觉反而带偏了方向。`;
  txt += `<br>本轮得分：<strong>${score} 分</strong>` + (revealPenalty > 0 ? `（多看数据扣 -${revealPenalty}）` : '');
  document.getElementById('roundInsightText').innerHTML = txt;

  if (currentRound >= shuffledScenarios.length - 1) {
    document.getElementById('nextBtn').innerHTML = '<i class="ti ti-flag"></i> 查看最终成绩';
  }
}

// ========== 结果对比图（竖线标注三个均值） ==========
function drawResultChart(gAvg, mAvg, tAvg, tStd, s) {
  if (resultChart) { resultChart.destroy(); resultChart = null; }
  const ctx = document.getElementById('resultChart').getContext('2d');

  // 以真实分布为基础画曲线，用竖线标注三个均值
  const lo = tAvg - 4 * tStd, hi = tAvg + 4 * tStd;
  const step = (hi - lo) / 120;
  const labels = [], dTrue = [];
  for (let x = lo; x <= hi; x += step) {
    labels.push(s.sliderStep >= 1 ? Math.round(x).toLocaleString() : x.toFixed(1));
    dTrue.push(gaussianPDF(x, tAvg, tStd));
  }

  // 找最近的 label index 用于竖线
  const findIdx = (val) => {
    let best = 0, bestDist = Infinity;
    for (let i = lo, idx = 0; i <= hi; i += step, idx++) {
      const d = Math.abs(i - val);
      if (d < bestDist) { bestDist = d; best = idx; }
    }
    return best;
  };

  resultChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '真实分布',
          data: dTrue,
          borderColor: '#81c784', backgroundColor: 'rgba(129,199,132,0.08)',
          fill: true, pointRadius: 0, tension: 0.4, borderWidth: 2.5
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        annotation: {
          annotations: {
            lineTrue: { type: 'line', xMin: findIdx(tAvg), xMax: findIdx(tAvg), borderColor: '#81c784', borderWidth: 2, label: { display: true, content: '真实', color: '#81c784', backgroundColor: 'rgba(0,0,0,0.6)', font: { size: 11 } } },
            lineYou:  { type: 'line', xMin: findIdx(gAvg), xMax: findIdx(gAvg), borderColor: '#ffd700', borderWidth: 2, borderDash: [4,3], label: { display: true, content: '你猜', color: '#ffd700', backgroundColor: 'rgba(0,0,0,0.6)', font: { size: 11 } } },
            lineMle:  { type: 'line', xMin: findIdx(mAvg), xMax: findIdx(mAvg), borderColor: '#64b5f6', borderWidth: 2, borderDash: [4,3], label: { display: true, content: 'MLE', color: '#64b5f6', backgroundColor: 'rgba(0,0,0,0.6)', font: { size: 11 } } }
          }
        }
      },
      scales: {
        x: { ticks: { color: '#888', maxTicksLimit: 7, font: { size: 10 } }, grid: { display: false } },
        y: { display: false }
      }
    }
  });
}

// ========== 下一关 ==========
function nextRound() {
  currentRound++;
  if (currentRound >= shuffledScenarios.length) {
    showFinalResults();
    return;
  }
  startRound();
  window.scrollTo({ top: document.getElementById('gameSection').offsetTop - 20, behavior: 'smooth' });
}

// ========== 最终结果 ==========
function showFinalResults() {
  document.getElementById('gameSection').style.display = 'none';
  document.getElementById('finalSection').style.display = '';

  const avgScore = Math.round(totalScore / roundHistory.length);
  const wins = roundHistory.filter(r => Math.abs(r.guessAvg - r.trueAvg) < Math.abs(r.mleAvg - r.trueAvg)).length;

  document.getElementById('finalStats').innerHTML = `
    <div class="stat-card"><div class="val">${totalScore}</div><div class="lbl">总分</div></div>
    <div class="stat-card"><div class="val">${avgScore}</div><div class="lbl">平均每轮</div></div>
    <div class="stat-card"><div class="val">${wins}/${roundHistory.length}</div><div class="lbl">打败 MLE</div></div>
    <div class="stat-card"><div class="val">${getGrade(avgScore)}</div><div class="lbl">段位</div></div>
  `;

  // 历史表格
  const tbody = document.getElementById('historyBody');
  tbody.innerHTML = '';
  roundHistory.forEach((r, i) => {
    const s = shuffledScenarios[i];
    const youErr = Math.abs(r.guessAvg - r.trueAvg);
    const mleErr = Math.abs(r.mleAvg - r.trueAvg);
    const youWon = youErr < mleErr;
    tbody.innerHTML += `<tr>
      <td>${i + 1}</td>
      <td>${r.scenario}</td>
      <td class="${youWon ? 'winner' : ''}">${formatNum(r.guessAvg, s)}</td>
      <td>${formatNum(r.trueAvg, s)}</td>
      <td class="col-std">${formatNum(youErr, s)}</td>
      <td>${r.score}</td>
    </tr>`;
  });

  // 最终图表
  if (finalChart) { finalChart.destroy(); finalChart = null; }
  const ctx = document.getElementById('finalChart').getContext('2d');
  finalChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: roundHistory.map((_, i) => '第' + (i + 1) + '关'),
      datasets: [
        { label: '你的得分', data: roundHistory.map(r => r.score), backgroundColor: 'rgba(255,215,0,0.65)', borderColor: '#ffd700', borderWidth: 1, borderRadius: 5, barPercentage: 0.6 },
        { label: 'MLE 得分', data: roundHistory.map(r => r.mleScore), backgroundColor: 'rgba(100,181,246,0.45)', borderColor: '#64b5f6', borderWidth: 1, borderRadius: 5, barPercentage: 0.6 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#c0c0c0', font: { size: 12 } } } },
      scales: {
        x: { ticks: { color: '#888' }, grid: { display: false } },
        y: { ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' }, min: 0, max: 100 }
      }
    }
  });

  // 总评
  let finalText = '';
  if (avgScore >= 80) finalText = '你的统计直觉非常强！能从少量数据中准确推断总体，说明你有丰富的先验知识储备，善于将经验与数据结合。';
  else if (avgScore >= 60) finalText = '不错的表现！大多数场景都能给出合理估计，有些场景你的直觉甚至比纯数据分析更准。';
  else if (avgScore >= 40) finalText = '中规中矩。对熟悉领域判断更准，对陌生领域容易被少量数据误导。多接触不同领域的数据，直觉会慢慢校准。';
  else finalText = '统计直觉还需要训练。关键是：多看数据、多做预测、多对比结果。每一次「打脸」都是校准直觉的机会。';
  finalText += `<br><br>${roundHistory.length} 轮中有 ${wins} 轮打败了 MLE，说明你的经验判断${wins > roundHistory.length / 2 ? '总体上比纯数据分析更有价值' : '在某些领域还需要更多积累'}。`;
  document.getElementById('finalInsightText').innerHTML = finalText;

  // 重置提交区域
  document.getElementById('playerName').value = '';
  document.getElementById('submitScoreBtn').disabled = false;
  document.getElementById('submitScoreBtn').innerHTML = '<i class="ti ti-send"></i> 提交';
  document.getElementById('submitResult').style.display = 'none';
  document.getElementById('submitArea').style.opacity = '1';
  loadLeaderboard(null);

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function restartGame() {
  initGame();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ========== 排行榜 ==========
const API = 'https://numfeel-api.996.ninja/inference/leaderboard';
let myRank = null;

function submitScore() {
  const name = document.getElementById('playerName').value.trim();
  if (!name) { showSubmitResult('请输入名字', false); return; }

  const last = roundHistory[roundHistory.length - 1];
  const avgScore = Math.round(totalScore / roundHistory.length);
  const wins = roundHistory.filter(r => Math.abs(r.guessAvg - r.trueAvg) < Math.abs(r.mleAvg - r.trueAvg)).length;
  const grade = getGrade(avgScore);

  document.getElementById('submitScoreBtn').disabled = true;
  document.getElementById('submitScoreBtn').innerHTML = '<i class="ti ti-loader"></i> 提交中…';

  fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, score: totalScore, rounds: roundHistory.length, wins, grade })
  })
    .then(r => r.json())
    .then(res => {
      if (res.status === 200) {
        myRank = res.data.rank;
        showSubmitResult(`提交成功！你的排名：第 ${myRank} 名`, true);
        document.getElementById('submitArea').style.opacity = '0.6';
        document.getElementById('submitScoreBtn').disabled = true;
        loadLeaderboard(name);
      } else {
        showSubmitResult('提交失败：' + (res.message || '未知错误'), false);
        document.getElementById('submitScoreBtn').disabled = false;
        document.getElementById('submitScoreBtn').innerHTML = '<i class="ti ti-send"></i> 提交';
      }
    })
    .catch(() => {
      showSubmitResult('网络错误，请稍后重试', false);
      document.getElementById('submitScoreBtn').disabled = false;
      document.getElementById('submitScoreBtn').innerHTML = '<i class="ti ti-send"></i> 提交';
    });
}

function showSubmitResult(msg, ok) {
  const el = document.getElementById('submitResult');
  el.style.display = '';
  el.className = 'submit-result ' + (ok ? 'ok' : 'err');
  el.textContent = msg;
}

function loadLeaderboard(myName) {
  fetch(API + '?limit=20')
    .then(r => r.json())
    .then(res => {
      if (res.status !== 200) return;
      const { leaders, total } = res.data;
      document.getElementById('lbTotal').textContent = '共 ' + total + ' 人参与';
      const list = document.getElementById('lbList');
      if (!leaders || leaders.length === 0) {
        list.innerHTML = '<div class="lb-loading">还没有人上榜，你是第一个！</div>';
        return;
      }
      list.innerHTML = leaders.map(r => {
        const rankClass = r.rank === 1 ? 'top1' : r.rank === 2 ? 'top2' : r.rank === 3 ? 'top3' : '';
        const rankIcon = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : r.rank;
        const isMe = myName && r.name === myName;
        return `<div class="lb-row${isMe ? ' me' : ''}">
          <span class="lb-rank ${rankClass}">${rankIcon}</span>
          <span class="lb-name">${escHtml(r.name)}${isMe ? ' 👈' : ''}</span>
          <span class="lb-score">${r.score}</span>
          <span class="lb-grade">${r.grade}</span>
        </div>`;
      }).join('');
    })
    .catch(() => {
      document.getElementById('lbList').innerHTML = '<div class="lb-loading">排行榜加载失败</div>';
    });
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// 启动
initGame();

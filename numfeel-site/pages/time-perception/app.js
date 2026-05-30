// ============================================================
// 时间感知扭曲实验室 — 交互逻辑
// ============================================================
var currentTrialIdx = 0;
var trialResults = [];
var trialTimerStart = null;
var trialActive = false;
var loadTaskState = null;

var API_BASE = 'https://numfeel-api.996.ninja';
var distortionChart = null;
var scoreChart = null;

// ── 实验初始化 ──
function initExperiment() {
  currentTrialIdx = 0;
  trialResults = [];
  document.getElementById('introSection').classList.add('hidden');
  document.getElementById('trialSection').classList.remove('hidden');
  document.getElementById('finalSection').classList.add('hidden');
  document.getElementById('totalRounds').textContent = TRIALS.length;
  startTrial();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── 开始单轮 ──
function startTrial() {
  var trial = TRIALS[currentTrialIdx];
  document.getElementById('roundNum').textContent = currentTrialIdx + 1;
  document.getElementById('progressFill').style.width = (currentTrialIdx / TRIALS.length * 100) + '%';
  document.getElementById('roundResult').style.display = 'none';

  // 阶段标识
  var phaseNames = { blank: '环节一：空白等待', load: '环节二：认知负荷', emotion: '环节三：情绪唤醒' };
  var badge = document.getElementById('phaseBadge');
  badge.textContent = phaseNames[trial.phase] || '';
  badge.className = 'phase-badge ' + trial.phase;
  document.getElementById('phaseLabel').textContent = phaseNames[trial.phase] || '';

  // 计时区
  var timerArea = document.getElementById('timerArea');
  timerArea.className = 'timer-area ' + trial.phase + ' ' + (trial.condition || '');
  document.getElementById('timerLabel').innerHTML = trial.desc;
  document.getElementById('taskArea').style.display = 'none';
  document.getElementById('taskArea').innerHTML = '';
  document.getElementById('stopBtn').classList.add('hidden');
  document.getElementById('startBtn').classList.remove('hidden');
  document.getElementById('startBtn').disabled = false;

  trialActive = false;
  trialTimerStart = null;
  loadTaskState = null;

  // 隐藏急迫条
  var urgencyBar = document.getElementById('urgencyBar');
  if (urgencyBar) urgencyBar.classList.remove('active');

  setupTrialEnvironment(trial);
  window.scrollTo({ top: document.getElementById('trialSection').offsetTop - 20, behavior: 'smooth' });
}

// ── 设置本轮环境（任务、情绪） ──
function setupTrialEnvironment(trial) {
  var taskArea = document.getElementById('taskArea');

  if (trial.phase === 'load') {
    taskArea.style.display = 'block';
    if (trial.condition === 'low') {
      taskArea.innerHTML = '<div class="color-flash" id="colorFlash" style="background:#1a1a2e;"></div>';
    } else if (trial.condition === 'mid') {
      taskArea.innerHTML = '<div class="color-flash" id="colorFlash" style="background:#1a1a2e;"></div><p style="color:#8b949e;margin-top:8px;font-size:0.88rem;">已变色 <strong id="colorCount" style="color:#d2a800;">0</strong> 次</p>';
      loadTaskState = { colorCount: 0, flashInterval: null };
    } else if (trial.condition === 'high') {
      loadTaskState = { score: 0, total: 0, currentAnswer: null };
      generateMathProblem();
    }
  }

  if (trial.phase === 'emotion' && trial.condition === 'urgent') {
    var urgencyHtml = '<div class="urgency-bar active" id="urgencyBar"><div class="urgency-fill" id="urgencyFill" style="animation-duration:' + trial.actualSec + 's;"></div></div>';
    document.getElementById('timerArea').insertAdjacentHTML('beforeend', urgencyHtml);
  }
}

// ── 生成心算题目 ──
function generateMathProblem() {
  var a = Math.floor(Math.random() * 90) + 10;
  var b = Math.floor(Math.random() * 90) + 10;
  var ops = ['+', '-', '\u00d7'];
  var op = ops[Math.floor(Math.random() * 3)];
  var correct;
  if (op === '+') correct = a + b;
  else if (op === '-') correct = a - b;
  else correct = a * b;

  var wrong = correct + (Math.random() > 0.5 ? 1 : -1) * (Math.floor(Math.random() * 20) + 3);
  if (wrong === correct) wrong += 1;
  var answers = [correct, wrong];
  if (Math.random() > 0.5) answers.reverse();

  loadTaskState.currentAnswer = correct;
  document.getElementById('taskArea').style.display = 'block';
  document.getElementById('taskArea').innerHTML =
    '<div class="math-problem">' + a + ' ' + op + ' ' + b + ' = ?</div>' +
    '<div class="math-btns">' +
      '<button onclick="handleMathAnswer(' + answers[0] + ')">' + answers[0] + '</button>' +
      '<button onclick="handleMathAnswer(' + answers[1] + ')">' + answers[1] + '</button>' +
    '</div>' +
    '<div class="math-feedback" id="mathFeedback"></div>' +
    '<p style="color:#6e7681;margin-top:8px;font-size:0.8rem;">已答对 <strong style="color:#3fb950;" id="mathScore">' + loadTaskState.score + '</strong> / ' + loadTaskState.total + '</p>';
}

function handleMathAnswer(chosen) {
  if (!trialActive) return;
  var fb = document.getElementById('mathFeedback');
  loadTaskState.total++;
  if (chosen === loadTaskState.currentAnswer) {
    loadTaskState.score++;
    fb.textContent = '\u2714 正确';
    fb.style.color = '#3fb950';
  } else {
    fb.textContent = '\u2718 答案是 ' + loadTaskState.currentAnswer;
    fb.style.color = '#f85149';
  }
  document.getElementById('mathScore').textContent = loadTaskState.score;
  setTimeout(function () {
    if (trialActive) generateMathProblem();
  }, 600);
}

// ── 开始计时 ──
function handleStart() {
  var trial = TRIALS[currentTrialIdx];
  trialTimerStart = performance.now();
  trialActive = true;

  document.getElementById('startBtn').classList.add('hidden');
  document.getElementById('stopBtn').classList.remove('hidden');
  document.getElementById('timerLabel').innerHTML = '<span style="color:#8b949e;">计时中…凭感觉在 <strong>' + trial.actualSec + ' 秒</strong>时点击停止</span>';

  var timerArea = document.getElementById('timerArea');
  timerArea.classList.add('active');

  // 急迫条
  var urgencyBar = document.getElementById('urgencyBar');
  if (urgencyBar) urgencyBar.classList.add('active');

  // 认知负荷任务
  if (trial.phase === 'load' && (trial.condition === 'low' || trial.condition === 'mid')) {
    startColorFlashTask(trial);
  }

  if (trial.phase === 'load' && trial.condition === 'high') {
    document.getElementById('taskArea').style.display = 'block';
    loadTaskState.score = 0;
    loadTaskState.total = 0;
    generateMathProblem();
  }
}

// ── 颜色闪烁任务 ──
function startColorFlashTask(trial) {
  var colors = ['#f85149', '#d2a800', '#3fb950', '#58a6ff', '#bc8cff', '#ff7b72', '#a5d6ff', '#ffa198'];
  var flashEl = document.getElementById('colorFlash');
  var nextFlash = function () {
    if (!trialActive) return;
    var c = colors[Math.floor(Math.random() * colors.length)];
    flashEl.style.backgroundColor = c;
    flashEl.style.transform = 'scale(1.15)';
    if (trial.condition === 'mid' && loadTaskState) {
      loadTaskState.colorCount++;
      document.getElementById('colorCount').textContent = loadTaskState.colorCount;
    }
    setTimeout(function () {
      flashEl.style.transform = 'scale(1)';
    }, 200);
    var delay = 800 + Math.random() * 1600;
    loadTaskState.flashTimeout = setTimeout(nextFlash, delay);
  };
  nextFlash();
}

// ── 停止计时 ──
function handleStop() {
  if (!trialActive) return;
  trialActive = false;
  var estimatedMs = performance.now() - trialTimerStart;
  var trial = TRIALS[currentTrialIdx];
  var actualMs = trial.actualSec * 1000;

  // 清理
  var timerArea = document.getElementById('timerArea');
  timerArea.classList.remove('active');
  document.getElementById('stopBtn').classList.add('hidden');
  document.getElementById('taskArea').style.display = 'none';
  if (loadTaskState && loadTaskState.flashTimeout) {
    clearTimeout(loadTaskState.flashTimeout);
  }
  var urgencyBar = document.getElementById('urgencyBar');
  if (urgencyBar) urgencyBar.parentNode.removeChild(urgencyBar);

  // 计算
  var distortion = computeDistortion(estimatedMs, actualMs);
  var absDist = Math.abs(distortion);
  var roundScore = computeSingleRoundScore(absDist, trial.phase);

  trialResults.push({
    phase: trial.phase,
    condition: trial.condition,
    label: trial.label,
    actualSec: trial.actualSec,
    actualMs: actualMs,
    estimatedMs: Math.round(estimatedMs),
    distortion: distortion,
    roundScore: roundScore
  });

  showRoundResult(estimatedMs, actualMs, distortion, roundScore, trial);
}

function computeSingleRoundScore(absDistortion, phase) {
  var weight = phase === 'load' ? 1.2 : 1.0;
  var raw;
  if (absDistortion < 0.08) raw = 100;
  else if (absDistortion > 0.50) raw = Math.max(0, 100 - (absDistortion - 0.08) * 130);
  else raw = Math.max(15, 100 - (absDistortion - 0.08) * 180);
  return Math.min(100, Math.round(raw * weight));
}

// ── 显示本轮结果 ──
function showRoundResult(estimatedMs, actualMs, distortion, roundScore, trial) {
  document.getElementById('roundResult').style.display = 'block';

  var estSec = (estimatedMs / 1000).toFixed(1);
  var actSec = (actualMs / 1000).toFixed(1);
  var distPct = (distortion * 100).toFixed(1);

  var distClass = Math.abs(distortion) < 0.08 ? 'perfect' : distortion > 0 ? 'over' : 'under';
  document.getElementById('resEstimated').innerHTML = estSec + '<span style="font-size:0.7em;"> 秒</span>';
  document.getElementById('resEstimated').className = 'val ' + distClass;
  document.getElementById('resActual').textContent = actSec + ' 秒';
  document.getElementById('resActual').className = 'val';
  document.getElementById('resDistortion').textContent = (distortion > 0 ? '+' : '') + distPct + '%';
  document.getElementById('resDistortion').className = 'val ' + distClass;
  document.getElementById('resScore').textContent = roundScore;
  document.getElementById('resScore').className = 'val';

  var insight = '';
  if (distortion > 0.15) {
    insight = '你<strong class="em">高估</strong>了这段时间。在<strong class="em">无聊或焦虑</strong>状态下，大脑的节拍器会加速，让你觉得时间变慢了。';
  } else if (distortion < -0.15) {
    insight = '你<strong class="em">低估</strong>了这段时间。注意资源被占用时，累加器会「漏数」，让你觉得时间一眨眼就过去了。';
  } else if (Math.abs(distortion) <= 0.08) {
    insight = '<strong class="em">相当精准！</strong>偏差不到 8%。你的时间感知在这个条件下非常准，接近专业音乐家的水平。';
  } else {
    insight = '偏差在正常范围内。大多数人的时间估计误差在 8-20%，你的表现属于平均水平。';
  }
  document.getElementById('roundInsight').innerHTML = insight;

  // 下一轮按钮
  var isLast = currentTrialIdx >= TRIALS.length - 1;
  document.getElementById('nextBtnText').textContent = isLast ? '查看最终结果' : '下一轮';
}

// ── 下一轮 ──
function nextTrial() {
  currentTrialIdx++;
  if (currentTrialIdx >= TRIALS.length) {
    showFinalResults();
    return;
  }
  startTrial();
}

// ── 最终结果 ──
function showFinalResults() {
  document.getElementById('trialSection').classList.add('hidden');
  document.getElementById('finalSection').classList.remove('hidden');

  var totalScore = computeTotalScore(trialResults);
  var weber = computeWeberScore(trialResults);
  var bias = getBiasDirection(trialResults);
  var grade = getGrade(totalScore);
  var avgAbsDist = 0;
  for (var i = 0; i < trialResults.length; i++) {
    avgAbsDist += Math.abs(trialResults[i].distortion);
  }
  avgAbsDist = avgAbsDist / trialResults.length;

  // 总览卡片
  document.getElementById('finalStats').innerHTML =
    '<div class="stat-card">' +
      '<div class="val">' + totalScore + '</div>' +
      '<div class="lbl">总分 / 100</div>' +
      '<div class="sub">综合时间感知能力</div>' +
    '</div>' +
    '<div class="stat-card">' +
      '<div class="val">' + (avgAbsDist * 100).toFixed(1) + '%</div>' +
      '<div class="lbl">平均偏差</div>' +
      '<div class="sub">韦伯分数 ' + weber.toFixed(3) + '</div>' +
    '</div>' +
    '<div class="stat-card">' +
      '<div class="val">' + (bias === 'overestimator' ? '\u2191 高估' : bias === 'underestimator' ? '\u2193 低估' : '\u2194 均衡') + '</div>' +
      '<div class="lbl">偏差方向</div>' +
      '<div class="sub">' + (bias === 'overestimator' ? '你倾向于觉得时间过得慢' : bias === 'underestimator' ? '你倾向于觉得时间过得快' : '高估和低估大致平衡') + '</div>' +
    '</div>' +
    '<div class="stat-card">' +
      '<div class="val">' + grade + '</div>' +
      '<div class="lbl">评级</div>' +
    '</div>';

  // 评级展示
  var gradeIcons = { '时间大师': '\ud83c\udfc6', '良好时感': '\ud83d\udd5a', '略有偏差': '\u23f0', '时感模糊': '\ud83e\uddd0', '时感崩坏': '\ud83c\udf00' };
  var gradeTexts = {
    '时间大师': '你的内置时钟非常精准，偏差控制在 8% 以内。这种水平接近训练有素的音乐家。',
    '良好时感': '你的时间感知相当不错，多数场景下偏差在合理范围内。日常中的时间判断基本可信。',
    '略有偏差': '你的时间感知有时会漂移。在紧张或忙碌的时候，偏差会明显放大。可以试试用心读秒来训练。',
    '时感模糊': '你的时间感知不太稳定，不同场景下偏差差异很大。注意力和情绪对你的判断影响明显。',
    '时感崩坏': '你对时间的判断经常大幅偏离实际。这没关系——时间感知可以通过专注训练来改善，比如不看表的倒计时练习。'
  };
  document.getElementById('gradeDisplay').innerHTML =
    '<div class="grade-icon">' + (gradeIcons[grade] || '\u23f0') + '</div>' +
    '<div class="grade-text">' + grade + '</div>' +
    '<div class="grade-sub">' + (gradeTexts[grade] || '') + '</div>';

  // 偏差图
  drawDistortionChart();

  // 历史表
  var tbody = document.getElementById('historyBody');
  tbody.innerHTML = '';
  for (var j = 0; j < trialResults.length; j++) {
    var r = trialResults[j];
    var phaseLabel = r.phase === 'blank' ? '空白等待' : r.phase === 'load' ? '认知负荷' : '情绪唤醒';
    var distClass2 = Math.abs(r.distortion) < 0.08 ? 'td-good' : r.distortion > 0 ? 'td-over' : 'td-under';
    tbody.innerHTML += '<tr>' +
      '<td>' + (j + 1) + '</td>' +
      '<td class="td-phase">' + phaseLabel + '</td>' +
      '<td>' + r.label + '</td>' +
      '<td>' + (r.estimatedMs / 1000).toFixed(1) + 's</td>' +
      '<td>' + r.actualSec + 's</td>' +
      '<td class="' + distClass2 + '">' + (r.distortion > 0 ? '+' : '') + (r.distortion * 100).toFixed(1) + '%</td>' +
      '<td>' + r.roundScore + '</td>' +
    '</tr>';
  }

  // 得分图
  drawScoreChart();

  // 加载社区统计
  loadCommunityStats();

  // 加载排行榜
  loadLeaderboard(null);

  // 重置提交
  document.getElementById('playerName').value = '';
  document.getElementById('submitScoreBtn').disabled = false;
  document.getElementById('submitScoreBtn').innerHTML = '<i class="ti ti-send"></i> 提交';
  document.getElementById('submitResult').style.display = 'none';
  document.getElementById('submitArea').style.opacity = '1';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── 图表：偏差图 ──
function drawDistortionChart() {
  if (distortionChart) { distortionChart.destroy(); distortionChart = null; }
  var ctx = document.getElementById('distortionChart').getContext('2d');
  var labels = trialResults.map(function (_, i) { return '第' + (i + 1) + '轮'; });
  var data = trialResults.map(function (r) { return r.distortion * 100; });
  var bgColors = data.map(function (v) {
    return v > 5 ? 'rgba(248,81,73,0.6)' : v < -5 ? 'rgba(210,168,0,0.6)' : 'rgba(63,185,80,0.6)';
  });

  distortionChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '偏差 (%)',
        data: data,
        backgroundColor: bgColors,
        borderColor: bgColors.map(function (c) { return c.replace('0.6', '1'); }),
        borderWidth: 1,
        borderRadius: 6,
        barPercentage: 0.7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) { return '偏差: ' + (ctx.raw > 0 ? '+' : '') + ctx.raw.toFixed(1) + '%'; }
          }
        }
      },
      scales: {
        x: { ticks: { color: '#8b949e', font: { size: 11 } }, grid: { display: false } },
        y: {
          ticks: { color: '#8b949e', callback: function (v) { return v + '%'; } },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });
}

// ── 图表：得分图 ──
function drawScoreChart() {
  if (scoreChart) { scoreChart.destroy(); scoreChart = null; }
  var ctx = document.getElementById('scoreChart').getContext('2d');
  var labels = trialResults.map(function (_, i) { return '第' + (i + 1) + '轮'; });
  var data = trialResults.map(function (r) { return r.roundScore; });

  scoreChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: '得分',
        data: data,
        borderColor: '#58a6ff',
        backgroundColor: 'rgba(88,166,255,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 5,
        pointBackgroundColor: '#58a6ff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { ticks: { color: '#8b949e' }, grid: { display: false } },
        y: {
          min: 0, max: 100,
          ticks: { color: '#8b949e' },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });
}

// ── 社区统计 ──
function loadCommunityStats() {
  fetch(API_BASE + '/time-perception/stats')
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (res.status !== 200) return;
      var data = res.data;
      if (!data || !data.global || data.global.totalSessions < 1) return;

      document.getElementById('communitySection').style.display = '';
      document.getElementById('communityCount').textContent = '(共 ' + data.global.totalSessions + ' 人参与)';

      document.getElementById('communityGrid').innerHTML =
        '<div class="community-card">' +
          '<div class="title">社区平均分</div>' +
          '<div class="big-num">' + (data.global.avgScore || 0).toFixed(0) + '</div>' +
          '<div class="sub-num">满分 100</div>' +
        '</div>' +
        '<div class="community-card">' +
          '<div class="title">平均偏差</div>' +
          '<div class="big-num">' + (data.global.avgAbsDistortion ? (data.global.avgAbsDistortion * 100).toFixed(1) + '%' : '--') + '</div>' +
          '<div class="sub-num">绝对值</div>' +
        '</div>' +
        '<div class="community-card">' +
          '<div class="title">高估者占比</div>' +
          '<div class="big-num">' + (data.global.overRatio ? (data.global.overRatio * 100).toFixed(0) + '%' : '--') + '</div>' +
          '<div class="sub-num">倾向觉得时间变慢</div>' +
        '</div>';

      if (data.gradeDist) {
        var gradeHtml = '<div class="community-card"><div class="title">评级分布</div>';
        Object.keys(data.gradeDist).forEach(function (g) {
          gradeHtml += '<div class="sub-num" style="margin-top:2px;">' + g + ': ' + data.gradeDist[g] + ' 人</div>';
        });
        gradeHtml += '</div>';
        document.getElementById('communityGrid').innerHTML += gradeHtml;
      }
    })
    .catch(function () {});
}

// ── 排行榜 ──
var myRank = null;

function submitScore() {
  var name = document.getElementById('playerName').value.trim();
  if (!name) { showSubmitToast('\u8bf7\u8f93\u5165\u540d\u5b57', false); return; }

  var totalScore = computeTotalScore(trialResults);
  var weber = computeWeberScore(trialResults);
  var avgAbsDist = 0;
  for (var i = 0; i < trialResults.length; i++) {
    avgAbsDist += Math.abs(trialResults[i].distortion);
  }
  avgAbsDist = avgAbsDist / trialResults.length;
  var grade = getGrade(totalScore);
  var bias = getBiasDirection(trialResults);

  // 各阶段偏差
  var blankDist = 0, blankN = 0, loadDist = 0, loadN = 0, emotionDist = 0, emotionN = 0;
  for (var j = 0; j < trialResults.length; j++) {
    var d = Math.abs(trialResults[j].distortion);
    if (trialResults[j].phase === 'blank') { blankDist += d; blankN++; }
    else if (trialResults[j].phase === 'load') { loadDist += d; loadN++; }
    else { emotionDist += d; emotionN++; }
  }

  var payload = {
    name: name,
    totalScore: totalScore,
    weberScore: parseFloat(weber.toFixed(4)),
    avgAbsDistortion: parseFloat(avgAbsDist.toFixed(4)),
    blankAvgDistortion: blankN > 0 ? parseFloat((blankDist / blankN).toFixed(4)) : 0,
    loadAvgDistortion: loadN > 0 ? parseFloat((loadDist / loadN).toFixed(4)) : 0,
    emotionAvgDistortion: emotionN > 0 ? parseFloat((emotionDist / emotionN).toFixed(4)) : 0,
    biasDirection: bias,
    grade: grade
  };

  document.getElementById('submitScoreBtn').disabled = true;
  document.getElementById('submitScoreBtn').innerHTML = '<i class="ti ti-loader"></i> \u63d0\u4ea4\u4e2d\u2026';

  fetch(API_BASE + '/time-perception/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (res.status === 200) {
        myRank = res.data.rank;
        showSubmitToast('\u63d0\u4ea4\u6210\u529f\uff01\u4f60\u7684\u6392\u540d\uff1a\u7b2c ' + myRank + ' \u540d', true);
        document.getElementById('submitArea').style.opacity = '0.6';
        document.getElementById('submitScoreBtn').disabled = true;
        loadLeaderboard(name);
      } else {
        showSubmitToast('\u63d0\u4ea4\u5931\u8d25\uff1a' + (res.message || '\u672a\u77e5\u9519\u8bef'), false);
        document.getElementById('submitScoreBtn').disabled = false;
        document.getElementById('submitScoreBtn').innerHTML = '<i class="ti ti-send"></i> \u63d0\u4ea4';
      }
    })
    .catch(function () {
      showSubmitToast('\u7f51\u7edc\u9519\u8bef\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5', false);
      document.getElementById('submitScoreBtn').disabled = false;
      document.getElementById('submitScoreBtn').innerHTML = '<i class="ti ti-send"></i> \u63d0\u4ea4';
    });
}

function showSubmitToast(msg, ok) {
  var el = document.getElementById('submitResult');
  el.style.display = '';
  el.className = 'submit-result ' + (ok ? 'ok' : 'err');
  el.textContent = msg;
}

function loadLeaderboard(myName) {
  var list = document.getElementById('lbList');
  list.innerHTML = '<div class="lb-loading">\u52a0\u8f7d\u4e2d\u2026</div>';

  fetch(API_BASE + '/time-perception/leaderboard?limit=20')
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (res.status !== 200) {
        list.innerHTML = '<div class="lb-loading">\u6392\u884c\u699c\u52a0\u8f7d\u5931\u8d25</div>';
        return;
      }
      renderLbRows(res.data.leaders, myName, list, document.getElementById('lbTotal'), res.data.total);
    })
    .catch(function () {
      list.innerHTML = '<div class="lb-loading">\u6392\u884c\u699c\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u5237\u65b0\u91cd\u8bd5</div>';
    });
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderLbRows(leaders, myName, listEl, totalEl, total) {
  if (totalEl) totalEl.textContent = total > 0 ? '\u5171 ' + total + ' \u4eba\u53c2\u4e0e' : '';
  if (!leaders || leaders.length === 0) {
    listEl.innerHTML = '<div class="lb-loading" style="color:#58a6ff;">\u8fd8\u6ca1\u6709\u4eba\u4e0a\u699c\uff0c\u4f60\u6765\u5f53\u7b2c\u4e00\u4e2a\uff01</div>';
    return;
  }
  listEl.innerHTML = leaders.map(function (r) {
    var rankClass = r.rank === 1 ? 'top1' : r.rank === 2 ? 'top2' : r.rank === 3 ? 'top3' : '';
    var rankIcon = r.rank === 1 ? '\ud83e\udd47' : r.rank === 2 ? '\ud83e\udd48' : r.rank === 3 ? '\ud83e\udd49' : r.rank;
    var isMe = myName && r.name === myName;
    return '<div class="lb-row' + (isMe ? ' me' : '') + '">' +
      '<span class="lb-rank ' + rankClass + '">' + rankIcon + '</span>' +
      '<span class="lb-name">' + escHtml(r.name) + (isMe ? ' \ud83d\udc48' : '') + '</span>' +
      '<span class="lb-score">' + r.score + '</span>' +
      '<span class="lb-grade">' + r.grade + '</span>' +
    '</div>';
  }).join('');
}

// ── 重新测试 ──
function restartExperiment() {
  currentTrialIdx = 0;
  trialResults = [];
  if (distortionChart) { distortionChart.destroy(); distortionChart = null; }
  if (scoreChart) { scoreChart.destroy(); scoreChart = null; }
  myRank = null;
  document.getElementById('introSection').classList.remove('hidden');
  document.getElementById('trialSection').classList.add('hidden');
  document.getElementById('finalSection').classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

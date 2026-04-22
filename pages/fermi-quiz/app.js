"use strict";

/* ============================================================
   费米估算挑战 — 主逻辑
   ============================================================ */

var currentQ = 0;
var answers = [];   // { qIndex, guess, answer, errorFactor }
var shuffled = [];  // shuffled question indices

// ── 入口 ──
function showIntro() {
  document.getElementById('introSection').style.display = '';
  document.getElementById('quizSection').style.display = 'none';
  document.getElementById('resultSection').style.display = 'none';
}

function startQuiz() {
  currentQ = 0;
  answers = [];
  // shuffle 10 questions from pool
  shuffled = [];
  var indices = [];
  for (var i = 0; i < FERMI_QUESTIONS.length; i++) indices.push(i);
  for (var i = indices.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = indices[i]; indices[i] = indices[j]; indices[j] = t;
  }
  shuffled = indices.slice(0, 10);

  document.getElementById('introSection').style.display = 'none';
  document.getElementById('quizSection').style.display = '';
  document.getElementById('resultSection').style.display = 'none';
  document.getElementById('totalError').textContent = '0';
  loadQuestion();
}

function loadQuestion() {
  var q = FERMI_QUESTIONS[shuffled[currentQ]];
  document.getElementById('qNum').textContent = currentQ + 1;
  document.getElementById('progressFill').style.width = (currentQ / 10 * 100) + '%';
  document.getElementById('questionText').textContent = q.question;
  document.getElementById('questionHint').textContent = q.hint;
  document.getElementById('inputUnit').textContent = q.unit;

  var input = document.getElementById('guessInput');
  input.value = '';
  input.disabled = false;

  document.getElementById('questionArea').style.display = '';
  document.getElementById('revealArea').style.display = 'none';
  document.getElementById('submitBtn').disabled = false;

  input.focus();
}

function submitGuess() {
  var input = document.getElementById('guessInput');
  var raw = input.value.trim().replace(/,/g, '').replace(/，/g, '');
  var guess = parseNumber(raw);

  if (guess === null || guess <= 0) {
    input.style.borderColor = '#ff4444';
    setTimeout(function() { input.style.borderColor = ''; }, 1000);
    return;
  }

  input.disabled = true;
  document.getElementById('submitBtn').disabled = true;

  var q = FERMI_QUESTIONS[shuffled[currentQ]];
  var errorFactor = guess >= q.answer
    ? guess / q.answer
    : q.answer / guess;

  answers.push({
    qIndex: shuffled[currentQ],
    guess: guess,
    answer: q.answer,
    errorFactor: errorFactor
  });

  // update cumulative error
  var totalErr = answers.reduce(function(s, a) { return s + Math.log10(a.errorFactor); }, 0);
  document.getElementById('totalError').textContent = totalErr.toFixed(1) + ' OOM';

  showReveal(q, guess, errorFactor);
}

function showReveal(q, guess, errorFactor) {
  document.getElementById('questionArea').style.display = 'none';
  document.getElementById('revealArea').style.display = '';

  var oomError = Math.log10(errorFactor);
  var rating, ratingColor;
  if (oomError < 0.15) { rating = '精准命中'; ratingColor = '#4CAF50'; }
  else if (oomError < 0.5) { rating = '非常接近'; ratingColor = '#8BC34A'; }
  else if (oomError < 1) { rating = '同一数量级'; ratingColor = '#ffd700'; }
  else if (oomError < 2) { rating = '差了一个数量级'; ratingColor = '#ff922b'; }
  else { rating = '差了 ' + oomError.toFixed(1) + ' 个数量级'; ratingColor = '#ff4444'; }

  document.getElementById('revealCompare').innerHTML =
    '<div class="compare-row">' +
      '<div class="compare-item">' +
        '<div class="compare-label">你的估算</div>' +
        '<div class="compare-value">' + formatNumber(guess) + ' ' + q.unit + '</div>' +
      '</div>' +
      '<div class="compare-vs">vs</div>' +
      '<div class="compare-item">' +
        '<div class="compare-label">真实答案</div>' +
        '<div class="compare-value gold">' + formatNumber(q.answer) + ' ' + q.unit + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="compare-result">' +
      '<span class="error-badge" style="background:' + ratingColor + '20; color:' + ratingColor + '; border:1px solid ' + ratingColor + '40;">' +
        rating + '（误差 ' + errorFactor.toFixed(1) + ' 倍）' +
      '</span>' +
    '</div>';

  document.getElementById('revealSource').innerHTML =
    '<div class="source-box"><i class="ti ti-file-text"></i> ' + q.source + '</div>';

  document.getElementById('revealExplain').innerHTML =
    '<div class="explain-box"><i class="ti ti-bulb"></i> <strong>拆解思路：</strong>' + q.explain + '</div>';

  // last question?
  if (currentQ >= 9) {
    document.getElementById('nextBtn').innerHTML = '<i class="ti ti-chart-bar"></i> 查看结果';
  } else {
    document.getElementById('nextBtn').innerHTML = '<i class="ti ti-arrow-right"></i> 下一题';
  }
}

function nextQuestion() {
  currentQ++;
  if (currentQ >= 10) {
    showResults();
  } else {
    loadQuestion();
  }
}

// ── Enter 键提交 ──
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    var quizVisible = document.getElementById('quizSection').style.display !== 'none';
    if (!quizVisible) return;

    var questionVisible = document.getElementById('questionArea').style.display !== 'none';
    if (questionVisible) {
      submitGuess();
    } else {
      nextQuestion();
    }
  }
});


// ══════════════════════════════════════════════════════════
// 结果页
// ══════════════════════════════════════════════════════════
function showResults() {
  document.getElementById('introSection').style.display = 'none';
  document.getElementById('quizSection').style.display = 'none';
  document.getElementById('resultSection').style.display = '';

  var totalOOM = answers.reduce(function(s, a) { return s + Math.log10(a.errorFactor); }, 0);
  var avgOOM = totalOOM / answers.length;
  var bestQ = answers.reduce(function(a, b) { return a.errorFactor < b.errorFactor ? a : b; });
  var worstQ = answers.reduce(function(a, b) { return a.errorFactor > b.errorFactor ? a : b; });
  var withinOOM = answers.filter(function(a) { return Math.log10(a.errorFactor) < 1; }).length;

  // stats
  document.getElementById('statsGrid').innerHTML =
    '<div class="stat-card"><div class="val">' + avgOOM.toFixed(2) + '</div><div class="lbl">平均 OOM 误差</div></div>' +
    '<div class="stat-card"><div class="val">' + withinOOM + '/10</div><div class="lbl">数量级命中</div></div>' +
    '<div class="stat-card"><div class="val">' + bestQ.errorFactor.toFixed(1) + 'x</div><div class="lbl">最小误差</div></div>' +
    '<div class="stat-card"><div class="val">' + worstQ.errorFactor.toFixed(1) + 'x</div><div class="lbl">最大误差</div></div>';

  // grade
  var grade, gradeColor, gradeDesc;
  if (avgOOM < 0.3) {
    grade = 'S'; gradeColor = '#ffd700';
    gradeDesc = '费米本人级别。你的数量级直觉极其精准。';
  } else if (avgOOM < 0.6) {
    grade = 'A'; gradeColor = '#4CAF50';
    gradeDesc = '咨询公司合伙人水平。大部分估算都在正确数量级内。';
  } else if (avgOOM < 1.0) {
    grade = 'B'; gradeColor = '#4d96ff';
    gradeDesc = '数量级基本靠谱。日常决策够用了。';
  } else if (avgOOM < 1.5) {
    grade = 'C'; gradeColor = '#ff922b';
    gradeDesc = '经常差一个数量级。建议多练习拆解问题。';
  } else {
    grade = 'D'; gradeColor = '#ff4444';
    gradeDesc = '数量级感觉需要校准。好消息是，这个能力可以练。';
  }

  document.getElementById('gradeBox').innerHTML =
    '<div class="insight-box">' +
      '<h3><i class="ti ti-award"></i> 费米直觉指数：<span style="color:' + gradeColor + '; font-size:1.4rem;">' + grade + '</span></h3>' +
      '<p>' + gradeDesc + '</p>' +
      '<p style="margin-top:8px; font-size:0.85rem; color:#888;">平均 OOM 误差 ' + avgOOM.toFixed(2) + ' · 数量级命中 ' + withinOOM + '/10</p>' +
    '</div>';

  // per-question results
  var qHtml = '';
  for (var i = 0; i < answers.length; i++) {
    var a = answers[i];
    var q = FERMI_QUESTIONS[a.qIndex];
    var oom = Math.log10(a.errorFactor);
    var dotColor = oom < 0.5 ? '#4CAF50' : oom < 1 ? '#ffd700' : '#ff4444';
    qHtml +=
      '<div class="rq-item">' +
        '<div class="rq-dot" style="background:' + dotColor + '"></div>' +
        '<div class="rq-body">' +
          '<div class="rq-question">' + q.question + '</div>' +
          '<div class="rq-detail">你猜 ' + formatNumber(a.guess) + ' · 答案 ' + formatNumber(a.answer) + ' · 误差 ' + a.errorFactor.toFixed(1) + 'x</div>' +
        '</div>' +
      '</div>';
  }
  document.getElementById('resultQuestions').innerHTML = qHtml;

  // insight
  document.getElementById('insightBox').innerHTML =
    '<div class="insight-box">' +
      '<h3><i class="ti ti-bulb"></i> OOM 是什么</h3>' +
      '<p>OOM = Order of Magnitude，数量级。误差 1 OOM 表示你的估算和真实值差了 10 倍（比如猜 1000，答案是 10000）。' +
      '费米估算的目标是把 OOM 误差控制在 1 以内——也就是说，至少猜对"几个零"。</p>' +
    '</div>';

  // chart
  renderErrorChart();

  // submit to backend
  submitToBackend();
}

function renderErrorChart() {
  var canvas = document.getElementById('errorChart');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  if (window._errorChart) window._errorChart.destroy();

  var labels = answers.map(function(a, i) { return '第' + (i + 1) + '题'; });
  var data = answers.map(function(a) { return Math.log10(a.errorFactor).toFixed(2); });
  var colors = answers.map(function(a) {
    var oom = Math.log10(a.errorFactor);
    return oom < 0.5 ? 'rgba(76,175,80,0.7)' : oom < 1 ? 'rgba(255,215,0,0.7)' : 'rgba(255,68,68,0.7)';
  });

  window._errorChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'OOM 误差',
        data: data,
        backgroundColor: colors,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        annotation: undefined
      },
      scales: {
        x: { ticks: { color: '#888', font: { size: 11 } }, grid: { display: false } },
        y: {
          min: 0,
          ticks: { color: '#888', callback: function(v) { return v + ' OOM'; } },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });
}

// ── 数字解析与格式化 ──
function parseNumber(str) {
  if (!str) return null;
  // support 万/亿 suffix
  str = str.replace(/\s/g, '');
  var multiplier = 1;
  if (/亿/.test(str)) { multiplier = 100000000; str = str.replace(/亿/, ''); }
  else if (/万/.test(str)) { multiplier = 10000; str = str.replace(/万/, ''); }
  else if (/[kK]$/.test(str)) { multiplier = 1000; str = str.replace(/[kK]$/, ''); }
  else if (/[mM]$/.test(str)) { multiplier = 1000000; str = str.replace(/[mM]$/, ''); }
  else if (/[bB]$/.test(str)) { multiplier = 1000000000; str = str.replace(/[bB]$/, ''); }

  var num = parseFloat(str);
  if (isNaN(num)) return null;
  return num * multiplier;
}

function formatNumber(n) {
  if (n >= 100000000) return (n / 100000000).toFixed(n % 100000000 === 0 ? 0 : 1) + ' 亿';
  if (n >= 10000) return (n / 10000).toFixed(n % 10000 === 0 ? 0 : 1) + ' 万';
  if (n >= 1000) return n.toLocaleString('zh-CN');
  return String(n);
}


// ══════════════════════════════════════════════════════════
// 后端统计集成
// ══════════════════════════════════════════════════════════
var API_BASE = 'https://numfeel-api.996.ninja';

function submitToBackend() {
  var totalOOM = answers.reduce(function(s, a) { return s + Math.log10(a.errorFactor); }, 0);
  var avgOOM = totalOOM / answers.length;
  var withinOOM = answers.filter(function(a) { return Math.log10(a.errorFactor) < 1; }).length;

  var grade;
  if (avgOOM < 0.3) grade = 'S';
  else if (avgOOM < 0.6) grade = 'A';
  else if (avgOOM < 1.0) grade = 'B';
  else if (avgOOM < 1.5) grade = 'C';
  else grade = 'D';

  var perQuestion = answers.map(function(a) {
    return {
      qIndex: a.qIndex,
      guess: a.guess,
      answer: a.answer,
      errorFactor: Math.round(a.errorFactor * 100) / 100
    };
  });

  var payload = {
    avgOOM: Math.round(avgOOM * 100) / 100,
    withinOOM: withinOOM,
    grade: grade,
    perQuestion: perQuestion
  };

  fetch(API_BASE + '/fermi/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.status === 200 && data.data) {
      var d = data.data;
      var submitBox = document.getElementById('submitBox');
      if (submitBox) {
        submitBox.innerHTML =
          '<div class="insight-box" style="border-left-color:#4CAF50;">' +
            '<h3 style="color:#81c784;"><i class="ti ti-trophy"></i> 你的排名</h3>' +
            '<p>在 <strong style="color:#ffd700">' + d.totalSessions + '</strong> 位挑战者中排名第 <strong style="color:#ffd700">' + d.rank + '</strong>，' +
            '超过了 <strong style="color:#ffd700">' + d.percentile + '%</strong> 的人。</p>' +
          '</div>';
      }
    }
  })
  .catch(function() { /* silent */ });
}

function loadCommunityStats() {
  var loading = document.getElementById('communityLoading');
  var content = document.getElementById('communityContent');
  var error   = document.getElementById('communityError');

  fetch(API_BASE + '/fermi/stats')
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.status !== 200 || !data.data || !data.data.global) throw new Error('no data');
    loading.style.display = 'none';
    content.style.display = '';

    var g = data.data.global;
    var gd = data.data.gradeDist || {};

    document.getElementById('communityStats').innerHTML =
      '<div class="stat-card"><div class="val">' + (g.totalSessions || 0) + '</div><div class="lbl">总挑战次数</div></div>' +
      '<div class="stat-card"><div class="val">' + (g.avgOOM != null ? g.avgOOM.toFixed(2) : '-') + '</div><div class="lbl">平均 OOM 误差</div></div>' +
      '<div class="stat-card"><div class="val">' + (g.avgWithinOOM != null ? g.avgWithinOOM.toFixed(1) : '-') + '/10</div><div class="lbl">平均命中数</div></div>';

    renderGradeDistChart(gd);

    if (g.totalSessions > 0) {
      document.getElementById('communityInsight').innerHTML =
        '<div class="insight-box">' +
          '<h3><i class="ti ti-chart-dots-3"></i> 社区洞察</h3>' +
          '<p>共 ' + g.totalSessions + ' 人完成了费米估算挑战，平均 OOM 误差为 ' + (g.avgOOM || 0).toFixed(2) + '。' +
          '大部分人的数量级直觉比自己想象的要好。</p>' +
        '</div>';
    }
  })
  .catch(function() {
    loading.style.display = 'none';
    error.style.display = '';
  });
}

function renderGradeDistChart(gd) {
  var canvas = document.getElementById('gradeDistChart');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  if (window._gradeDistChart) window._gradeDistChart.destroy();

  var grades = ['S','A','B','C','D'];
  var colors = ['#ffd700','#4CAF50','#4d96ff','#ff922b','#ff4444'];
  var data = grades.map(function(g) { return gd[g] || 0; });

  window._gradeDistChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: grades,
      datasets: [{ data: data, backgroundColor: colors, borderWidth: 0 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { color: '#aaa', font: { size: 12 }, padding: 12 } } }
    }
  });
}

document.addEventListener('DOMContentLoaded', function() {
  loadCommunityStats();
});

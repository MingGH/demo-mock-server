/**
 * 合取谬误（Conjunction Fallacy）— DOM/交互层
 * 核心逻辑见 engine.js（纯函数，不碰 DOM）。
 */

var currentIndex = 0;
var answers = [];
var submitted = false;
var answered = false;
var distChart = null;

/** 后端基址（与 numfeel-site/AGENTS.md 约定一致）。 */
var API_BASE = 'https://numfeel-api.996.ninja';

// ══════════════════════════════════════════════════════════
// 行为埋点（NFTrack，见 components/track.js）
// 事件清单：
//   session_start → 会话开始（trackOnce）
//   cf_choice     → 选择某题 { q, choice, correct }（回答"踩坑率与题目的关系"）
//   cf_finish     → 完成测试 { correct }（回答"全站得分分布"）
//   session_end   → 离页（pagehide, force）
// ══════════════════════════════════════════════════════════
function nfTrack(name, props, opts) {
  try {
    if (window.NFTrack && typeof window.NFTrack.track === 'function') {
      window.NFTrack.track(name, props, opts);
    }
  } catch (e) {}
}
var trackSessionStarted = false;
function trackSessionStart() {
  if (trackSessionStarted) return;
  trackSessionStarted = true;
  try {
    if (window.NFTrack && typeof window.NFTrack.trackOnce === 'function') {
      window.NFTrack.trackOnce('session_start', {});
    }
  } catch (e) {}
}
window.addEventListener('pagehide', function () {
  nfTrack('session_end', { reason: 'leave' }, { force: true });
});

function showEl(id) { document.getElementById(id).classList.remove('hidden'); }
function hideEl(id) { document.getElementById(id).classList.add('hidden'); }

function init() {
  trackSessionStart();
  currentIndex = 0;
  answers = [];
  submitted = false;
  showQuestion();
}

function showQuestion() {
  answered = false;
  var q = QUESTIONS[currentIndex];
  document.getElementById('currentNum').textContent = currentIndex + 1;
  document.getElementById('totalNum').textContent = QUESTIONS.length;
  document.getElementById('progressFill').style.width =
      ((currentIndex) / QUESTIONS.length * 100) + '%';

  document.getElementById('scenarioText').textContent = q.scenario;
  document.getElementById('optionAText').textContent = q.options[0].text;
  document.getElementById('optionBText').textContent = q.options[1].text;

  hideEl('revealBox');
  hideEl('nextRow');

  var opts = document.querySelectorAll('.option-btn');
  for (var i = 0; i < opts.length; i++) {
    opts[i].classList.remove('correct', 'wrong', 'dimmed', 'disabled');
  }
}

function choose(choice) {
  if (submitted || answered) return;
  answered = true;
  var q = QUESTIONS[currentIndex];
  var correct = isCorrect(q.id, choice);
  answers[currentIndex] = choice;

  nfTrack('cf_choice', { q: q.id, choice: choice === 'A' ? 0 : 1, correct: correct });

  var optionA = document.getElementById('optionA');
  var optionB = document.getElementById('optionB');
  if (choice === 'A') {
    optionA.classList.add(correct ? 'correct' : 'wrong');
    optionB.classList.add('dimmed');
  } else {
    optionB.classList.add(correct ? 'correct' : 'wrong');
    optionA.classList.add('dimmed');
  }
  optionA.classList.add('disabled');
  optionB.classList.add('disabled');

  var revealBox = document.getElementById('revealBox');
  var title = document.getElementById('revealTitle');
  if (correct) {
    title.innerHTML = '<i class="ti ti-circle-check"></i> 答对了：你避开了合取谬误';
    title.className = 'reveal-title reveal-ok';
  } else {
    title.innerHTML = '<i class="ti ti-alert-triangle"></i> 踩中了合取谬误（论文里 85% 的人也一样）';
    title.className = 'reveal-title reveal-bad';
  }
  document.getElementById('revealText').textContent = q.explanation;

  revealBox.classList.remove('hidden');
  showEl('nextRow');

  var isLast = currentIndex >= QUESTIONS.length - 1;
  document.getElementById('nextBtnLabel').textContent = isLast ? '查看结果' : '下一题';
}

function nextQuestion() {
  if (currentIndex >= QUESTIONS.length - 1) {
    finishTest();
    return;
  }
  currentIndex++;
  showQuestion();
}

function finishTest() {
  submitted = true;
  var result = computeResult(answers);
  var verdict = getVerdict(result.correct);

  nfTrack('cf_finish', { correct: result.correct, total: result.total });

  submitResult(result);
  hideEl('quizSection');
  showEl('resultSection');

  document.getElementById('scoreNumber').textContent = result.correct + '/' + result.total;
  document.getElementById('verdictTitle').textContent = verdict.title;
  document.getElementById('verdictText').textContent = verdict.text;

  window.scrollTo(0, 0);
  submitResult(result);
}

function loadStats() {
  fetch(API_BASE + '/conjunction-fallacy/stats')
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (json && json.status === 200 && json.data && json.data.perQuestion) {
        renderChart(json.data);
      }
    })
    .catch(function () { /* 统计拉取失败静默，不影响结果页 */ });
}

function submitResult(result) {
  var payload = {
    sessionId: (window.NFTrack && typeof window.NFTrack.sessionId === 'function')
        ? window.NFTrack.sessionId() : '',
    totalQuestions: 10,
    correctCount: result.correct,
    answers: JSON.stringify(answers.map(function (c) { return c === 'B' ? 1 : 0; }))
  };
  fetch(API_BASE + '/conjunction-fallacy/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json && json.status === 200 && json.data && json.data.perQuestion) {
          renderChart(json.data);
        } else {
          loadStats();
        }
      })
      .catch(function () {
        loadStats();
      });
}

function renderChart(stats) {
  if (typeof Chart === 'undefined') return;
  var canvas = document.getElementById('distChart');
  if (!canvas) return;
  if (distChart) {
    distChart.destroy();
  }
  var labels = [];
  var conjunction = [];
  var single = [];
  for (var i = 0; i < stats.perQuestion.length; i++) {
    var p = stats.perQuestion[i];
    labels.push('第' + p.questionId + '题');
    conjunction.push(p.conjunctionRate);
    single.push(p.correctRate);
  }

  var chartOptions = {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: '选合取项 B（踩坑）',
          data: conjunction,
          backgroundColor: 'rgba(255,107,107,0.75)',
          borderColor: '#ff6b6b',
          borderWidth: 1
        },
        {
          label: '选单项 A（正确）',
          data: single,
          backgroundColor: 'rgba(129,199,132,0.75)',
          borderColor: '#81c784',
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#ccc' } },
        tooltip: {
          callbacks: {
            label: function (ctx) { return ctx.dataset.label + ': ' + ctx.parsed.y + '%'; }
          }
        }
      },
      scales: {
        x: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.06)' } },
        y: {
          min: 0,
          max: 100,
          ticks: { color: '#aaa', callback: function (v) { return v + '%'; } },
          grid: { color: 'rgba(255,255,255,0.08)' }
        }
      }
    }
  };

  // 论文常模虚线（85%）——用第二条线标注
  chartOptions.data.datasets.push({
    type: 'line',
    label: '论文常模 85%',
    data: labels.map(function () { return 85; }),
    borderColor: '#ffd700',
    borderDash: [6, 4],
    borderWidth: 2,
    pointRadius: 0,
    fill: false
  });

  distChart = new Chart(canvas, chartOptions);
}

function resetTest() {
  submitted = false;
  hideEl('resultSection');
  showEl('quizSection');
  currentIndex = 0;
  answers = [];
  showQuestion();
}

document.addEventListener('DOMContentLoaded', function () {
  init();
});

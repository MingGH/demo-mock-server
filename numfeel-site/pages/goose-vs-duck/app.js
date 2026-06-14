/**
 * 鹅腿 vs 鸭腿测评交互逻辑。
 */

const API_BASE = 'https://numfeel-api.996.ninja';

let currentIndex = 0;
let userAnswers = [];
let quizOrder = []; // 随机排列的题目索引

/* ══════════════ Phase 切换 ══════════════ */
function showPhase(id) {
  document.querySelectorAll('.phase').forEach(el => el.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ══════════════ 开始测试 ══════════════ */
function startQuiz() {
  currentIndex = 0;
  userAnswers = [];
  // 随机打乱题目顺序
  quizOrder = shuffleArray([...Array(QUIZ_DATA.length).keys()]);
  showPhase('phase-quiz');
  showQuestion();
}

/* ══════════════ 显示当前题目 ══════════════ */
function showQuestion() {
  const q = QUIZ_DATA[quizOrder[currentIndex]];
  document.getElementById('progressLabel').textContent = `${currentIndex + 1} / ${QUIZ_DATA.length}`;
  document.getElementById('progressFill').style.width = `${(currentIndex / QUIZ_DATA.length) * 100}%`;
  document.getElementById('quizImage').src = q.image;
  document.getElementById('quizHint').textContent = `提示：${q.hint}`;
}

/* ══════════════ 用户作答 ══════════════ */
function answer(choice) {
  const q = QUIZ_DATA[quizOrder[currentIndex]];
  const correct = choice === q.answer;
  userAnswers.push({ questionIndex: quizOrder[currentIndex], choice, correct });

  // 闪烁反馈
  const wrap = document.getElementById('quizImageWrap');
  wrap.classList.add(correct ? 'flash-correct' : 'flash-wrong');
  setTimeout(() => wrap.classList.remove('flash-correct', 'flash-wrong'), 500);

  currentIndex++;
  if (currentIndex < QUIZ_DATA.length) {
    setTimeout(showQuestion, 300);
  } else {
    setTimeout(showResult, 400);
  }
}

/* ══════════════ 展示结果 ══════════════ */
function showResult() {
  const correctCount = userAnswers.filter(a => a.correct).length;
  const grade = GRADE_RULES.find(r => correctCount >= r.min);

  document.getElementById('scoreNumber').textContent = correctCount;
  document.getElementById('resultGrade').textContent = grade.grade;
  document.getElementById('resultGrade').style.color = grade.color;
  document.getElementById('resultMsg').textContent = grade.msg;

  // 逐题回顾
  const reviewList = document.getElementById('reviewList');
  reviewList.innerHTML = userAnswers.map((a, i) => {
    const q = QUIZ_DATA[a.questionIndex];
    const icon = a.correct
      ? '<i class="ti ti-circle-check review-icon correct"></i>'
      : '<i class="ti ti-circle-x review-icon wrong"></i>';
    const yourLabel = a.choice === 'goose' ? '鹅腿' : '鸭腿';
    const correctLabel = q.answer === 'goose' ? '鹅腿' : '鸭腿';
    return `
      <div class="review-item">
        <img class="review-thumb" src="${q.image}" alt="题${i + 1}">
        <div class="review-info">
          <div class="review-answer">你选: ${yourLabel} | 正确: ${correctLabel}</div>
          <div class="review-correct">${q.explanation}</div>
        </div>
        ${icon}
      </div>
    `;
  }).join('');

  showPhase('phase-result');
  submitResult(correctCount);
  loadStats();
}

/* ══════════════ 提交结果到后端 ══════════════ */
function submitResult(correctCount) {
  const perQuestion = userAnswers.map(a => ({
    questionId: a.questionIndex + 1,
    choice: a.choice,
    correct: a.correct
  }));

  fetch(`${API_BASE}/goose-duck/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      correctCount,
      total: QUIZ_DATA.length,
      answers: perQuestion
    })
  }).catch(() => { /* 静默失败 */ });
}

/* ══════════════ 加载全网统计 ══════════════ */
function loadStats() {
  const container = document.getElementById('globalStats');

  fetch(`${API_BASE}/goose-duck/stats`)
    .then(r => r.json())
    .then(res => {
      const data = res.data || res;
      renderStats(container, data);
    })
    .catch(() => {
      container.innerHTML = '<p style="color:#888;text-align:center">暂无统计数据，你是第一位参与者！</p>';
    });
}

/* ══════════════ 渲染统计 ══════════════ */
function renderStats(container, data) {
  const totalPlayers = data.totalPlayers || 0;
  const avgScore = data.avgScore || 0;
  const avgAccuracy = data.avgAccuracy || 0;
  const perQuestion = data.perQuestion || [];

  let html = `
    <div class="stats-grid">
      <div class="stats-card">
        <div class="stats-card-value">${totalPlayers}</div>
        <div class="stats-card-label">参与人数</div>
      </div>
      <div class="stats-card">
        <div class="stats-card-value">${avgScore.toFixed(1)}</div>
        <div class="stats-card-label">平均得分 / 10</div>
      </div>
      <div class="stats-card">
        <div class="stats-card-value">${(avgAccuracy * 100).toFixed(1)}%</div>
        <div class="stats-card-label">平均正确率</div>
      </div>
    </div>
  `;

  if (perQuestion.length > 0) {
    html += '<div class="stats-bar-chart"><h4 style="color:#90caf9;margin:20px 0 12px;font-size:0.9rem">每题正确率</h4>';
    perQuestion.forEach((pq, i) => {
      const pct = pq.correctRate || 0;
      const label = `第${i + 1}题`;
      html += `
        <div class="stats-bar-item">
          <span class="stats-bar-label">${label}</span>
          <div class="stats-bar-bg">
            <div class="stats-bar-fill ${pct >= 0.5 ? 'goose-fill' : 'duck-fill'}" style="width:${pct * 100}%"></div>
          </div>
          <span class="stats-bar-pct">${(pct * 100).toFixed(0)}%</span>
        </div>
      `;
    });
    html += '</div>';
  }

  container.innerHTML = html;
}

/* ══════════════ 重新开始 ══════════════ */
function restart() {
  startQuiz();
}

/* ══════════════ 首页加载简要统计（不含每题答案） ══════════════ */
function loadIntroStats() {
  const container = document.getElementById('introGlobalStats');
  if (!container) return;

  fetch(`${API_BASE}/goose-duck/stats`)
    .then(r => r.json())
    .then(res => {
      const data = res.data || res;
      const totalPlayers = data.totalPlayers || 0;
      const avgScore = data.avgScore || 0;
      const avgAccuracy = data.avgAccuracy || 0;

      if (totalPlayers === 0) {
        container.innerHTML = '<p style="color:#888;text-align:center">暂无数据，你来当第一个参与者！</p>';
        return;
      }

      container.innerHTML = `
        <div class="stats-grid">
          <div class="stats-card">
            <div class="stats-card-value">${totalPlayers}</div>
            <div class="stats-card-label">已参与</div>
          </div>
          <div class="stats-card">
            <div class="stats-card-value">${(avgAccuracy * 100).toFixed(1)}%</div>
            <div class="stats-card-label">平均正确率</div>
          </div>
          <div class="stats-card">
            <div class="stats-card-value">${avgScore.toFixed(1)}<span style="font-size:0.8rem;color:#888"> /10</span></div>
            <div class="stats-card-label">平均得分</div>
          </div>
        </div>
        <p style="color:#666;font-size:0.78rem;text-align:center;margin-top:12px">做完题后可查看每题正确率详情</p>
      `;
    })
    .catch(() => {
      container.innerHTML = '<p style="color:#888;text-align:center">暂无数据，你来当第一个参与者！</p>';
    });
}

// 页面加载时获取简要统计
document.addEventListener('DOMContentLoaded', loadIntroStats);

/* ══════════════ 工具函数 ══════════════ */
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 导出供测试使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { shuffleArray };
}

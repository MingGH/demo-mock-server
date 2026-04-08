// ── 状态 ──────────────────────────────────────────────────
let currentIndex = 0;
let correctCount = 0;
let answered = [];
let shuffledQ = [];

const API_BASE = 'https://numfeel-api.996.ninja';
// 每次页面加载生成一个 session UUID
const SESSION_ID = crypto.randomUUID();

// ── 工具 ──────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ── 启动 ──────────────────────────────────────────────────
function startChallenge() {
  shuffledQ = shuffle(QUESTIONS);
  currentIndex = 0;
  correctCount = 0;
  answered = [];
  document.getElementById('resultScreen').classList.remove('show');
  document.getElementById('challengeSection').style.display = '';
  document.getElementById('scoreCorrect').textContent = '0';
  document.getElementById('scoreTotal').textContent = '/ ' + shuffledQ.length;
  renderQuestion();
}

// ── 渲染题目 ──────────────────────────────────────────────
function renderQuestion() {
  if (currentIndex >= shuffledQ.length) { showResult(); return; }
  const q = shuffledQ[currentIndex];
  const pct = (currentIndex / shuffledQ.length * 100).toFixed(0);
  document.getElementById('progressBar').style.width = pct + '%';
  document.getElementById('nextBtn').style.display = 'none';

  const diffStars = '⭐'.repeat(q.difficulty);
  const typeLabel = { email: '邮件', sms: '短信', call: '电话', wechat: '微信' }[q.type] || q.type;

  let html = `<div class="question-card">
    <div class="q-meta">
      <i class="ti ti-hash"></i> 第 ${currentIndex + 1} / ${shuffledQ.length} 题
      <span class="tag">${typeLabel}</span>
      <span class="tag">${q.tacticName}</span>
      <span style="margin-left:auto">${diffStars}</span>
    </div>
    <div class="q-prompt">这条${typeLabel}是真实的，还是骗局？</div>
    ${buildScene(q)}
    <div class="answer-options" id="answerOptions">
      <div class="answer-opt" onclick="selectAnswer(this, false)">
        <i class="ti ti-shield-x"></i> 这是骗局
      </div>
      <div class="answer-opt" onclick="selectAnswer(this, true)">
        <i class="ti ti-shield-check"></i> 这是真实的
      </div>
    </div>
    <div class="explain-box" id="explainBox">
      <div class="explain-title"><i class="ti ti-info-circle"></i> 解析</div>
      ${buildExplain(q)}
    </div>
  </div>`;

  document.getElementById('questionArea').innerHTML = html;
}

// ── 构建场景卡片 ──────────────────────────────────────────
function buildScene(q) {
  const s = q.scene;
  if (q.type === 'email') {
    return `<div class="scene-card scene-email">
      <div class="scene-topbar">
        <span class="dot dot-red"></span><span class="dot dot-yellow"></span><span class="dot dot-green"></span>
        <span style="margin-left:8px">邮件</span>
      </div>
      <div class="scene-body">
        <div class="email-from">发件人：<span>${escHtml(s.from)}</span> &lt;${escHtml(s.fromEmail)}&gt;</div>
        <div class="email-subject">${escHtml(s.subject)}</div>
        <div class="email-content">${s.content}</div>
      </div>
    </div>`;
  }
  if (q.type === 'sms') {
    return `<div class="scene-card scene-sms">
      <div class="scene-body">
        <div class="sms-sender">${escHtml(s.sender)}</div>
        <div class="sms-bubble">${s.content}</div>
      </div>
    </div>`;
  }
  if (q.type === 'call') {
    return `<div class="scene-card scene-call">
      <div class="scene-body">
        <div class="call-avatar"><i class="ti ti-phone-incoming"></i></div>
        <div class="call-number">${escHtml(s.number)}</div>
        <div class="call-label">${escHtml(s.label)}</div>
        <div class="call-script">${escHtml(s.script)}</div>
      </div>
    </div>`;
  }
  if (q.type === 'wechat') {
    return `<div class="scene-card scene-wechat">
      <div class="scene-body">
        <div class="wechat-header">
          <div class="wechat-avatar">${s.avatar}</div>
          <div class="wechat-name">${escHtml(s.name)}</div>
        </div>
        <div class="wechat-bubble">${escHtml(s.content)}</div>
      </div>
    </div>`;
  }
  return '';
}

// ── 构建解析内容（含可疑点高亮） ─────────────────────────
function buildExplain(q) {
  let html = '';
  if (q.isFake && q.suspiciousPoints.length > 0) {
    html += `<div class="sus-count"><i class="ti ti-alert-triangle"></i> 本题共有 ${q.suspiciousPoints.length} 个可疑点（悬停查看）</div>`;
    html += buildHighlightedScene(q);
  } else if (!q.isFake) {
    html += `<div class="sus-count" style="color:#66bb6a"><i class="ti ti-shield-check"></i> 这是一封真实的安全通知邮件</div>`;
  }
  html += `<p>${q.explanation}</p>`;
  if (q.tactics.length > 0) {
    html += '<p style="margin-top:10px">使用手法：';
    q.tactics.forEach(t => { html += `<span class="tactic-tag"><i class="ti ti-tag"></i>${t}</span>`; });
    html += '</p>';
  }
  return html;
}

// ── 在解析区重建带高亮的场景 ─────────────────────────────
function buildHighlightedScene(q) {
  const s = q.scene;
  let text = '';
  if (q.type === 'email') text = s.fromEmail + ' ' + s.subject + ' ' + s.content;
  else if (q.type === 'sms') text = s.content;
  else if (q.type === 'call') text = s.script;
  else if (q.type === 'wechat') text = s.content;

  // 对每个可疑点生成 tooltip HTML
  let highlighted = text;
  q.suspiciousPoints.forEach(sp => {
    const escaped = escHtml(sp.keyword);
    const tooltip = `<span class="suspicious"><span class="sus-text">${escaped}</span><span class="sus-tooltip">${escHtml(sp.tip)}</span></span>`;
    // 只替换第一次出现
    highlighted = highlighted.replace(escaped, tooltip);
  });

  return `<div style="background:rgba(0,0,0,0.2);border-radius:8px;padding:14px;margin-bottom:12px;font-size:0.88rem;color:#b0b0b0;line-height:1.8">${highlighted}</div>`;
}

// ── 选择答案 ──────────────────────────────────────────────
function selectAnswer(el, userSaysReal) {
  const opts = document.querySelectorAll('#answerOptions .answer-opt');
  opts.forEach(o => o.classList.add('disabled'));

  const isCorrect = (userSaysReal === !shuffledQ[currentIndex].isFake);
  el.classList.add(isCorrect ? 'correct' : 'wrong');
  // 标出正确答案
  if (!isCorrect) {
    opts.forEach(o => {
      const clickedReal = o.textContent.includes('真实');
      if (clickedReal === !shuffledQ[currentIndex].isFake) o.classList.add('correct');
    });
  }

  if (isCorrect) correctCount++;
  answered.push({ q: shuffledQ[currentIndex], correct: isCorrect });
  document.getElementById('scoreCorrect').textContent = correctCount;
  document.getElementById('explainBox').classList.add('show');
  document.getElementById('nextBtn').style.display = '';
}

function nextQuestion() {
  currentIndex++;
  renderQuestion();
}

// ── 结果页 ────────────────────────────────────────────────
function showResult() {
  document.getElementById('challengeSection').style.display = 'none';
  document.getElementById('progressBar').style.width = '100%';
  submitResult();
  const screen = document.getElementById('resultScreen');
  screen.classList.add('show');

  const pct = Math.round(correctCount / shuffledQ.length * 100);
  document.getElementById('resultScore').textContent = pct + '%';

  const grades = [
    { min: 100, grade: '完美防骗', sub: '你对社会工程学攻击有极强的辨别力，骗子很难得手。' },
    { min: 80,  grade: '安全意识很强', sub: '大部分骗局骗不了你，但 AI 克隆和杀猪盘等高级手法仍需警惕。' },
    { min: 60,  grade: '及格，但有风险', sub: '你能识破常见骗局，但在紧迫感和权威恐吓下容易判断失误。' },
    { min: 40,  grade: '容易上当', sub: '你对社工攻击的辨别力偏弱，建议仔细阅读下方的手法解析。' },
    { min: 0,   grade: '高危用户', sub: '你在真实场景中很可能中招。好消息是，看完这个页面你会安全很多。' }
  ];
  const g = grades.find(g => pct >= g.min);
  document.getElementById('resultGrade').textContent = g.grade;
  document.getElementById('resultSub').textContent = g.sub;

  // 按手法统计弱点（排除真实场景）
  const tacticStats = {};
  answered.forEach(a => {
    if (a.q.tactic === 'real') return;
    const t = a.q.tactic;
    if (!tacticStats[t]) tacticStats[t] = { name: a.q.tacticName, total: 0, wrong: 0 };
    tacticStats[t].total++;
    if (!a.correct) tacticStats[t].wrong++;
  });

  let bhtml = '';
  for (const [, s] of Object.entries(tacticStats)) {
    bhtml += `<div class="rb-card"><div class="rv">${s.total - s.wrong}/${s.total}</div><div class="rl">${s.name}</div></div>`;
  }
  document.getElementById('resultBreakdown').innerHTML = bhtml;

  // 弱点分析
  const weaknesses = Object.values(tacticStats)
    .filter(s => s.wrong > 0)
    .sort((a, b) => b.wrong / b.total - a.wrong / a.total);

  let whtml = '';
  if (weaknesses.length === 0) {
    whtml = '<p style="color:#66bb6a">没有明显弱点，继续保持！</p>';
  } else {
    whtml = '<div class="weakness-list">';
    weaknesses.forEach(s => {
      const rate = Math.round(s.wrong / s.total * 100);
      const color = rate >= 67 ? '#ff4444' : rate >= 34 ? '#ffb700' : '#4CAF50';
      whtml += `<div class="weakness-item">
        <div class="weakness-label">${s.name}</div>
        <div class="weakness-bar-wrap"><div class="weakness-bar" style="width:${rate}%;background:${color}"></div></div>
        <div class="weakness-val">${rate}%</div>
      </div>`;
    });
    whtml += '</div>';
  }
  document.getElementById('weaknessArea').innerHTML = whtml;
}

// ── 初始化 ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  startChallenge();
  loadStats();
});

// ── 上报结果 ──────────────────────────────────────────────
function submitResult() {
  const payload = {
    sessionId: SESSION_ID,
    total: shuffledQ.length,
    correct: correctCount,
    questions: answered.map(a => ({
      questionId: a.q.id,
      tactic: a.q.tactic,
      isFake: a.q.isFake,
      correct: a.correct
    }))
  };
  fetch(`${API_BASE}/social-engineering/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(() => {}); // 静默失败，不影响前端体验
}

// ── 加载全站统计 ──────────────────────────────────────────
function loadStats() {
  fetch(`${API_BASE}/social-engineering/stats`)
    .then(r => r.json())
    .then(res => {
      if (res.status !== 200) return;
      renderStats(res.data);
    })
    .catch(() => {});
}

function renderStats(data) {
  const el = document.getElementById('globalStats');
  if (!el) return;
  const g = data.global;
  if (!g || !g.totalSessions) return;

  const fooledPct = g.totalSessions > 0
    ? (100 - (g.perfectSessions / g.totalSessions * 100)).toFixed(1)
    : 0;

  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-item">
        <div class="stat-val">${g.totalSessions.toLocaleString()}</div>
        <div class="stat-lbl">参与人数</div>
      </div>
      <div class="stat-item">
        <div class="stat-val">${g.perfectSessions.toLocaleString()}</div>
        <div class="stat-lbl">全对人数</div>
      </div>
      <div class="stat-item">
        <div class="stat-val" style="color:#ff8888">${fooledPct}%</div>
        <div class="stat-lbl">至少被骗一次</div>
      </div>
      <div class="stat-item">
        <div class="stat-val">${g.avgScorePct ?? 0}%</div>
        <div class="stat-lbl">平均得分</div>
      </div>
    </div>
    ${renderQuestionStats(data.questions)}
  `;
}

function renderQuestionStats(questions) {
  if (!questions || questions.length === 0) return '';
  const tacticLabel = {
    authority: '权威恐吓', urgency: '紧迫感', impersonation: '身份伪造',
    pretexting: '借口构建', 'ai-clone': 'AI克隆', qrcode: '二维码钓鱼'
  };
  let rows = questions.map(q => {
    const rate = q.correctRate ?? 0;
    const barColor = rate >= 70 ? '#4CAF50' : rate >= 40 ? '#ffb700' : '#ff4444';
    return `<div class="q-stat-row">
      <div class="q-stat-label">Q${q.questionId} <span style="color:#888;font-size:0.8rem">${tacticLabel[q.tactic] || q.tactic}</span></div>
      <div class="q-stat-bar-wrap">
        <div class="q-stat-bar" style="width:${rate}%;background:${barColor}"></div>
      </div>
      <div class="q-stat-val" style="color:${barColor}">${rate}%</div>
      <div class="q-stat-attempts" style="color:#666;font-size:0.78rem">${q.attempts}次</div>
    </div>`;
  }).join('');
  return `<div style="margin-top:20px">
    <div style="color:#ffd700;font-size:0.9rem;margin-bottom:12px;display:flex;align-items:center;gap:6px">
      <i class="ti ti-chart-bar"></i> 各题答对率
    </div>
    <div class="q-stats-list">${rows}</div>
  </div>`;
}

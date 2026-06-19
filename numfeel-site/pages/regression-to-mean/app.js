/* ═══════════════════════════════════════════════════
   回归均值模拟器 - 交互逻辑
   ═══════════════════════════════════════════════════ */

let scatterChart = null;
let lastResult = null;

// 高考场景固定参数：满分750，全省均分500，真实水平SD=80
const GAOKAO = { meanAbility: 500, abilitySd: 80, maxScore: 750 };

/* ── 模块一：考砸自测 ── */
function runAssess() {
  const raw = document.getElementById('pastScores').value.trim();
  const examScore = parseFloat(document.getElementById('examScore').value);
  const errEl = document.getElementById('assessError');
  const resultEl = document.getElementById('assessResult');

  // 解析平时成绩
  const scores = raw.split(/[,，\s]+/).map(s => parseFloat(s)).filter(v => !isNaN(v));

  // 校验
  if (scores.length < 2) {
    showAssessError('请至少输入 2 次平时大考成绩（用逗号分隔）。');
    return;
  }
  if (isNaN(examScore)) {
    showAssessError('请输入这次高考分数。');
    return;
  }
  if (stddev(scores) === 0) {
    showAssessError('你的平时成绩完全一样，无法计算波动。请输入真实的多次成绩。');
    return;
  }

  errEl.style.display = 'none';

  const a = assessStudent(scores, examScore);
  resultEl.style.display = 'block';

  // 结论框
  const box = document.getElementById('verdictBox');
  box.className = 'verdict-box ' + a.level;
  document.getElementById('verdictTitle').textContent = a.title;
  document.getElementById('verdictAdvice').textContent = a.advice;

  // 数字
  document.getElementById('aMean').textContent = a.mean.toFixed(0);
  document.getElementById('aSd').textContent = a.sd.toFixed(1);
  document.getElementById('aZ').textContent = a.z.toFixed(1);
  const gainEl = document.getElementById('aGain');
  if (a.gain > 0) {
    gainEl.textContent = '+' + a.gain.toFixed(0);
    gainEl.style.color = '#81c784';
  } else {
    gainEl.textContent = a.gain.toFixed(0);
    gainEl.style.color = '#ff6b6b';
  }
}

function showAssessError(msg) {
  const errEl = document.getElementById('assessError');
  errEl.textContent = msg;
  errEl.style.display = 'block';
  document.getElementById('assessResult').style.display = 'none';
}

/* ── 模块二：直觉测试 ── */
function selectAnswer(choice) {
  ['cardLow', 'cardRight', 'cardHigh'].forEach(id => document.getElementById(id).classList.remove('active'));
  const cardMap = { low: 'cardLow', right: 'cardRight', high: 'cardHigh' };
  if (cardMap[choice]) document.getElementById(cardMap[choice]).classList.add('active');
  document.getElementById('answerReveal').style.display = 'block';

  const texts = {
    right: '正确。<strong>成绩 = 真实水平 + 随机波动</strong>。他平时稳定600，说明真实水平就在600附近。高考540是坏运气（波动−60）。下次考试坏运气不会再来同一份，成绩会自动向600靠拢。这就是<strong>回归均值</strong>——不需要额外努力，概率本身就站在他这边。',
    low: '不太对。如果他平时<strong>稳定</strong>考600，说明真实水平确实在600附近，540是一次偏离。统计规律告诉我们：极端偏离后，下次大概率向均值回归。除非他平时波动就很大（有时620有时550），那540才没那么意外。',
    high: '部分对——努力确实能提分。但即使他什么都不改，仅靠「回归均值」就会涨分。统计上，平时600考砸540的人，下次期望就在580-600之间。努力是额外加分项，不是必要条件。'
  };

  document.getElementById('answerText').innerHTML = texts[choice] || texts.right;
}

/* ── 模块三：模拟考试 ── */
function updateNoiseLabel() {
  document.getElementById('noiseLabel').textContent = document.getElementById('noiseSlider').value;
}
function updatePercentLabel() {
  document.getElementById('percentLabel').textContent = document.getElementById('percentSlider').value + '%';
}

function runTeacherMode() {
  const noiseSd = parseInt(document.getElementById('noiseSlider').value);
  const topPercent = parseInt(document.getElementById('percentSlider').value);

  const result = regressionDemo({ n: 1000, noiseSd, topPercent, ...GAOKAO });
  lastResult = result;
  showTeacherResults(result);
}

function showTeacherResults(result) {
  document.getElementById('teacherResults').style.display = 'block';

  // 高分组
  document.getElementById('topExam1').textContent = result.top.exam1Avg.toFixed(0);
  document.getElementById('topExam2').textContent = result.top.exam2Avg.toFixed(0);
  const topArrow = document.getElementById('topArrow');
  topArrow.className = 'arrow drop';
  topArrow.textContent = `下降 ${Math.abs(result.top.change).toFixed(0)} 分`;
  document.getElementById('topAbility').textContent = result.top.abilityAvg.toFixed(0);

  // 低分组
  document.getElementById('bottomExam1').textContent = result.bottom.exam1Avg.toFixed(0);
  document.getElementById('bottomExam2').textContent = result.bottom.exam2Avg.toFixed(0);
  const bottomArrow = document.getElementById('bottomArrow');
  bottomArrow.className = 'arrow rise';
  bottomArrow.textContent = `上升 ${Math.abs(result.bottom.change).toFixed(0)} 分`;
  document.getElementById('bottomAbility').textContent = result.bottom.abilityAvg.toFixed(0);

  // 解读
  const topLuck = (result.top.exam1Avg - result.top.abilityAvg).toFixed(0);
  const bottomBadLuck = (result.bottom.abilityAvg - result.bottom.exam1Avg).toFixed(0);
  const insight = `第一次考高分的那批人，均分 <span class="highlight">${result.top.exam1Avg.toFixed(0)}</span>，但真实水平只有 <span class="highlight">${result.top.abilityAvg.toFixed(0)}</span>——中间差了 ${topLuck} 分的好运气。第二次好运气没了，回落到 ${result.top.exam2Avg.toFixed(0)}。<br><br>反过来，第一次考砸的那批人，真实水平其实有 ${result.bottom.abilityAvg.toFixed(0)}，第一次只考了 ${result.bottom.exam1Avg.toFixed(0)}（坏运气拉低了 ${bottomBadLuck} 分）。第二次坏运气消散，自动回升到 ${result.bottom.exam2Avg.toFixed(0)}。<br><br><strong>没人额外努力，是概率在帮忙。这就是「复读大概率涨分」的数学基础。</strong>`;
  document.getElementById('teacherInsight').innerHTML = insight;

  renderScatter(result);
}

/* ── 模块四：散点图 ── */
function renderScatter(result) {
  const ctx = document.getElementById('scatterChart').getContext('2d');
  if (scatterChart) scatterChart.destroy();

  const data = result.scatter.map(p => ({ x: p.x, y: p.y }));
  const minV = Math.min(...data.map(p => Math.min(p.x, p.y))) - 20;
  const maxV = Math.max(...data.map(p => Math.max(p.x, p.y))) + 20;

  scatterChart = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: '考生成绩',
          data: data,
          backgroundColor: 'rgba(255, 215, 0, 0.4)',
          borderColor: 'rgba(255, 215, 0, 0.6)',
          pointRadius: 3
        },
        {
          label: '不变线 (y=x)',
          data: [{ x: minV, y: minV }, { x: maxV, y: maxV }],
          type: 'line',
          borderColor: 'rgba(255,255,255,0.3)',
          borderDash: [5, 5],
          pointRadius: 0,
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: window.innerWidth < 600 ? 1 : 1.6,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `第一次: ${ctx.raw.x.toFixed(0)}, 第二次: ${ctx.raw.y.toFixed(0)}`
          }
        }
      },
      scales: {
        x: { title: { display: true, text: '第一次考试', color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#888' } },
        y: { title: { display: true, text: '第二次考试', color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#888' } }
      }
    }
  });

  document.getElementById('scatterStats').style.display = '';
  const allX = result.scatter.map(p => p.x);
  const allY = result.scatter.map(p => p.y);
  const r = correlationCoeff(allX, allY);
  document.getElementById('corrValue').textContent = r.toFixed(2);
  document.getElementById('topDropValue').textContent = result.top.change.toFixed(0);
  document.getElementById('topDropSub').textContent = '分';
  document.getElementById('bottomRiseValue').textContent = '+' + result.bottom.change.toFixed(0);
  document.getElementById('bottomRiseSub').textContent = '分';
}

/* ── 模块五：现实场景 ── */
function loadScenario(type, el) {
  document.querySelectorAll('#scenarioResult, .section .scenario-card').forEach(() => {});
  // 高亮选中卡片
  const parent = el ? el.parentElement : null;
  if (parent) parent.querySelectorAll('.scenario-card').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');

  const configs = {
    sports:  { n: 500, noiseSd: 60, topPercent: 5, meanAbility: 100, abilitySd: 20 },
    fund:    { n: 800, noiseSd: 50, topPercent: 10, meanAbility: 100, abilitySd: 30 },
    extreme: { n: 1000, noiseSd: 100, topPercent: 10, meanAbility: 500, abilitySd: 50, maxScore: 750 }
  };

  const cfg = configs[type];
  const result = regressionDemo(cfg);

  document.getElementById('scenarioResult').style.display = 'block';

  const r = correlationCoeff(result.scatter.map(p => p.x), result.scatter.map(p => p.y));
  const statsHtml = `
    <div class="stat-card">
      <div class="label">前${cfg.topPercent}% 第一次</div>
      <div class="value">${result.top.exam1Avg.toFixed(0)}</div>
    </div>
    <div class="stat-card">
      <div class="label">前${cfg.topPercent}% 第二次</div>
      <div class="value">${result.top.exam2Avg.toFixed(0)}</div>
      <div class="sub negative">↓ ${Math.abs(result.top.change).toFixed(0)}</div>
    </div>
    <div class="stat-card">
      <div class="label">后${cfg.topPercent}% 第二次</div>
      <div class="value">${result.bottom.exam2Avg.toFixed(0)}</div>
      <div class="sub">↑ ${Math.abs(result.bottom.change).toFixed(0)}</div>
    </div>
    <div class="stat-card">
      <div class="label">相关系数 r</div>
      <div class="value">${r.toFixed(2)}</div>
    </div>
  `;
  document.getElementById('scenarioStats').innerHTML = statsHtml;
}

/* ── 初始化 ── */
document.addEventListener('DOMContentLoaded', () => {
  runAssess();      // 用默认值跑一次自测
  runTeacherMode(); // 跑一次模拟
});

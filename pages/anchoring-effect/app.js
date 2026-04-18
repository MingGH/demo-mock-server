/**
 * 锚定效应量化测试 — 交互逻辑
 */
(function () {
  'use strict';

  const TOTAL = 10;
  let questions = [];
  let currentIdx = 0;
  let results = [];
  let chartInstance = null;

  // ── DOM ──
  const $ = (sel) => document.querySelector(sel);
  const phases = {
    intro: $('#phase-intro'),
    quiz: $('#phase-quiz'),
    summary: $('#phase-summary')
  };

  function showPhase(name) {
    Object.values(phases).forEach(el => el.classList.remove('active'));
    phases[name].classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── 开始 ──
  $('#startBtn').addEventListener('click', startQuiz);
  $('#retryBtn').addEventListener('click', startQuiz);
  $('#shareBtn').addEventListener('click', () => {
    if (window.openShareModal) window.openShareModal();
  });

  function startQuiz() {
    questions = pickQuestions(TOTAL);
    currentIdx = 0;
    results = [];
    buildProgressDots();
    showPhase('quiz');
    showQuestion();
  }

  // ── 进度点 ──
  function buildProgressDots() {
    const wrap = $('#progressDots');
    wrap.innerHTML = '';
    for (let i = 0; i < TOTAL; i++) {
      const dot = document.createElement('div');
      dot.className = 'progress-dot';
      wrap.appendChild(dot);
    }
  }

  function updateProgress() {
    const dots = document.querySelectorAll('.progress-dot');
    dots.forEach((dot, i) => {
      dot.className = 'progress-dot';
      if (i < currentIdx) dot.classList.add('done');
      if (i === currentIdx) dot.classList.add('current');
    });
    $('#progressText').textContent = `第 ${currentIdx + 1} / ${TOTAL} 题`;
  }

  // ── 展示题目 ──
  function showQuestion() {
    const q = questions[currentIdx];
    updateProgress();

    // 锚点
    $('#anchorValue').textContent = q.anchor.toLocaleString();
    $('#questionText').textContent = q.text;
    $('#answerUnit').textContent = q.unit;

    // 重置输入
    const input = $('#answerInput');
    input.value = '';
    input.disabled = false;
    input.focus();
    $('#submitAnswer').disabled = true;
    $('#questionResult').classList.remove('show');
    $('#nextBtn').style.display = '';
  }

  // ── 输入验证 ──
  $('#answerInput').addEventListener('input', () => {
    const val = $('#answerInput').value.trim();
    $('#submitAnswer').disabled = val === '' || isNaN(Number(val));
  });

  $('#answerInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !$('#submitAnswer').disabled) {
      if ($('#questionResult').classList.contains('show')) {
        goNext();
      } else {
        submitCurrentAnswer();
      }
    }
  });

  $('#submitAnswer').addEventListener('click', submitCurrentAnswer);
  $('#nextBtn').addEventListener('click', goNext);

  function submitCurrentAnswer() {
    const q = questions[currentIdx];
    const userAnswer = Number($('#answerInput').value);
    const ai = calcAnchoringIndex(userAnswer, q.answer, q.anchor);
    const errorPct = calcErrorPercent(userAnswer, q.answer);

    results.push({
      question: q.text,
      userAnswer,
      trueAnswer: q.answer,
      anchor: q.anchor,
      anchorType: q.anchorType,
      unit: q.unit,
      ai,
      errorPct,
      source: q.source
    });

    // 禁用输入
    $('#answerInput').disabled = true;
    $('#submitAnswer').disabled = true;

    // 显示结果
    showQuestionResult(userAnswer, q.answer, q.anchor, ai);
  }

  function showQuestionResult(userAnswer, trueAnswer, anchor, ai) {
    const q = questions[currentIdx];
    $('#resUserAnswer').textContent = userAnswer.toLocaleString() + ' ' + q.unit;
    $('#resTrueAnswer').textContent = trueAnswer.toLocaleString() + ' ' + q.unit;
    $('#resAnchor').textContent = anchor.toLocaleString() + ' ' + q.unit + (q.anchorType === 'high' ? ' (高锚)' : ' (低锚)');

    const aiAbs = Math.abs(ai);
    const aiText = (ai >= 0 ? '+' : '') + (ai * 100).toFixed(1) + '%';
    const aiEl = $('#resAI');
    aiEl.textContent = aiText;
    aiEl.className = 'result-value ' + (aiAbs <= 0.2 ? 'good' : aiAbs <= 0.5 ? 'warn' : 'bad');

    // 拉力条可视化
    renderPullBar(userAnswer, trueAnswer, anchor, ai, q);

    // 更新按钮文字
    if (currentIdx >= TOTAL - 1) {
      $('#nextBtn').innerHTML = '查看总结 <i class="ti ti-chart-bar"></i>';
    }

    $('#questionResult').classList.add('show');
  }

  function renderPullBar(userAnswer, trueAnswer, anchor, ai, q) {
    // 在 [min, max] 范围内映射位置
    const lo = Math.min(trueAnswer, anchor, userAnswer) * 0.8;
    const hi = Math.max(trueAnswer, anchor, userAnswer) * 1.2;
    const range = hi - lo || 1;

    const truePos = ((trueAnswer - lo) / range) * 100;
    const anchorPos = ((anchor - lo) / range) * 100;
    const userPos = ((userAnswer - lo) / range) * 100;

    const fill = $('#pullFill');
    const marker = $('#pullMarkerTrue');

    marker.style.left = truePos + '%';
    marker.title = '正确答案: ' + trueAnswer.toLocaleString();

    // 填充从正确答案到用户答案
    const fillLeft = Math.min(truePos, userPos);
    const fillWidth = Math.abs(userPos - truePos);
    fill.style.left = fillLeft + '%';
    fill.style.width = fillWidth + '%';

    const aiAbs = Math.abs(ai);
    fill.style.background = aiAbs <= 0.2 ? '#22c55e' : aiAbs <= 0.5 ? '#f59e0b' : '#ef4444';

    // 说明文字
    const direction = ai > 0 ? '被锚点拉向了' + (q.anchorType === 'high' ? '高处' : '低处') : ai < 0 ? '反向补偿，偏离了锚点方向' : '完美命中';
    $('#resPullLabel').textContent = direction;
  }

  function goNext() {
    currentIdx++;
    if (currentIdx >= TOTAL) {
      showSummary();
    } else {
      showQuestion();
    }
  }

  // ── 总结 ──
  function showSummary() {
    showPhase('summary');

    const avgAI = calcAverageAI(results);
    const rating = getAIRating(avgAI);

    $('#summaryScore').textContent = (avgAI * 100).toFixed(1) + '%';
    $('#summaryScore').style.color = rating.color;
    $('#summaryLabel').textContent = rating.label;
    $('#summaryLabel').style.color = rating.color;
    $('#summaryDesc').textContent = rating.desc;

    renderDetailTable();
    renderChart();
  }

  function renderDetailTable() {
    const tbody = $('#detailBody');
    tbody.innerHTML = '';
    results.forEach((r, i) => {
      const aiAbs = Math.abs(r.ai);
      const rating = getAIRating(r.ai);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.question.slice(0, 20)}…</td>
        <td class="num">${r.anchor.toLocaleString()}</td>
        <td class="num">${r.userAnswer.toLocaleString()}</td>
        <td class="num">${r.trueAnswer.toLocaleString()}</td>
        <td class="num">
          <span class="ai-badge" style="background:${rating.color}22;color:${rating.color}">
            ${(r.ai * 100).toFixed(1)}%
          </span>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderChart() {
    const ctx = $('#aiChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();

    const labels = results.map((r, i) => '第' + (i + 1) + '题');
    const data = results.map(r => +(r.ai * 100).toFixed(1));
    const colors = results.map(r => {
      const abs = Math.abs(r.ai);
      if (abs <= 0.2) return '#22c55e';
      if (abs <= 0.5) return '#f59e0b';
      return '#ef4444';
    });

    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: '锚定系数 (%)',
          data,
          backgroundColor: colors.map(c => c + '88'),
          borderColor: colors,
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => '锚定系数: ' + ctx.parsed.y.toFixed(1) + '%'
            }
          }
        },
        scales: {
          y: {
            title: { display: true, text: '锚定系数 (%)', color: '#94a3b8' },
            grid: { color: 'rgba(255,255,255,0.06)' },
            ticks: { color: '#94a3b8' }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8' }
          }
        }
      }
    });
  }

})();

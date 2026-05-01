(function() {
  var state = {
    questions: [],
    answers: [],
    currentIndex: 0,
    selectedChoice: null
  };

  var phases = {};
  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function init() {
    phases.intro = $('phase-intro');
    phases.quiz = $('phase-quiz');
    phases.result = $('phase-result');
    els.progressLabel = $('progressLabel');
    els.progressFill = $('progressFill');
    els.questionContext = $('questionContext');
    els.questionCategory = $('questionCategory');
    els.optionA = $('optionA');
    els.optionB = $('optionB');
    els.optionAText = $('optionAText');
    els.optionBText = $('optionBText');
    els.confirmBtn = $('confirmBtn');
    els.resultHero = $('resultHero');
    els.compareGrid = $('compareGrid');
    els.chartContainer = $('chartContainer');
    els.reviewList = $('reviewList');
    els.classicCompare = $('classicCompare');
    els.retryBtn = $('retryBtn');
  }

  function showPhase(name) {
    for (var key in phases) {
      if (phases[key]) {
        phases[key].classList.remove('active');
      }
    }
    if (phases[name]) {
      phases[name].classList.add('active');
    }
  }

  function startQuiz() {
    state.questions = pickQuestions(10);
    state.answers = [];
    state.currentIndex = 0;
    state.selectedChoice = null;
    showPhase('quiz');
    renderQuestion();
  }

  function renderQuestion() {
    if (state.currentIndex >= state.questions.length) {
      showResults();
      return;
    }

    state.selectedChoice = null;
    var q = state.questions[state.currentIndex];

    els.progressLabel.textContent = (state.currentIndex + 1) + ' / ' + state.questions.length;
    els.progressFill.style.width = ((state.currentIndex + 1) / state.questions.length * 100) + '%';

    var categoryLabels = {
      medical: '医疗',
      finance: '投资',
      career: '职业',
      environment: '环保',
      consumer: '消费',
      business: '商业',
      education: '教育',
      health: '健康'
    };
    els.questionCategory.textContent = categoryLabels[q.category] || q.category;
    els.questionContext.textContent = q.context;

    els.optionAText.textContent = q.optionA;
    els.optionBText.textContent = q.optionB;

    els.optionA.classList.remove('selected');
    els.optionB.classList.remove('selected');
    els.confirmBtn.disabled = true;

    els.optionA.onclick = function() {
      selectOption('A');
    };
    els.optionB.onclick = function() {
      selectOption('B');
    };
  }

  function selectOption(choice) {
    state.selectedChoice = choice;
    els.optionA.classList.toggle('selected', choice === 'A');
    els.optionB.classList.toggle('selected', choice === 'B');
    els.confirmBtn.disabled = false;
  }

  function confirmAnswer() {
    if (!state.selectedChoice) return;

    var q = state.questions[state.currentIndex];
    state.answers.push({
      scenarioId: q.id,
      frame: q.frame,
      choice: state.selectedChoice
    });

    state.currentIndex++;

    if (state.currentIndex >= state.questions.length) {
      showResults();
    } else {
      renderQuestion();
    }
  }

  function showResults() {
    showPhase('result');

    var result = calcFramingIndex(state.answers);
    var rating = getFramingRating(result.framingIndex);

    els.resultHero.innerHTML =
      '<h2><i class="ti ti-chart-bar"></i> 你的框架效应测试结果</h2>' +
      '<div class="result-index" style="color:' + rating.color + '">' + (result.framingIndex * 100).toFixed(0) + '%</div>' +
      '<div class="index-bar-wrap"><div class="index-bar-fill" style="width:0%" id="indexBarFill"></div></div>' +
      '<div class="index-labels"><span>0% 理性</span><span>50%</span><span>100% 被控制</span></div>' +
      '<div class="result-grade" style="color:' + rating.color + '">' + rating.label + '</div>' +
      '<div class="result-desc">' + rating.desc + '</div>';

    setTimeout(function() {
      var bar = $('indexBarFill');
      if (bar) bar.style.width = (result.framingIndex * 100) + '%';
    }, 100);

    renderCompareGrid(result);
    renderReviewList();
    renderClassicCompare();
    renderChart(result);

    els.retryBtn.onclick = function() {
      state.questions = pickQuestions(10);
      state.answers = [];
      state.currentIndex = 0;
      state.selectedChoice = null;
      showPhase('intro');
      els.progressFill.style.width = '0%';
    };
  }

  function renderCompareGrid(result) {
    var posPercent = (result.positiveARate * 100).toFixed(0);
    var negPercent = (result.negativeARate * 100).toFixed(0);
    var posColor = result.positiveARate >= result.negativeARate ? '#4ade80' : '#f87171';
    var negColor = result.negativeARate >= result.positiveARate ? '#f87171' : '#4ade80';

    els.compareGrid.innerHTML =
      '<div class="compare-card">' +
        '<h4><i class="ti ti-trending-up"></i> 正面框架</h4>' +
        '<div class="compare-percent" style="color:' + posColor + '">' + posPercent + '%</div>' +
        '<div class="compare-label">选了确定性选项（共 ' + result.positiveCount + ' 题）</div>' +
      '</div>' +
      '<div class="compare-card">' +
        '<h4><i class="ti ti-trending-down"></i> 负面框架</h4>' +
        '<div class="compare-percent" style="color:' + negColor + '">' + negPercent + '%</div>' +
        '<div class="compare-label">选了确定性选项（共 ' + result.negativeCount + ' 题）</div>' +
      '</div>';

    var diff = Math.abs(result.positiveARate - result.negativeARate);
    var insightText = '';
    if (diff <= 0.1) {
      insightText = '你在两种表述下的选择几乎一致，框架效应对你影响很小。';
    } else if (result.positiveARate > result.negativeARate) {
      insightText = '你在正面框架下更倾向于选择确定性方案，而在负面框架下更愿意冒险。这正是经典框架效应的典型表现——「得」的时候保守，「失」的时候冒险。';
    } else {
      insightText = '你的选择模式与经典框架效应方向相反：在正面框架下更愿意冒险，负面框架下更保守。这可能反映了你独特的风险偏好。';
    }

    els.compareGrid.insertAdjacentHTML('afterend',
      '<div class="compare-vs" style="max-width:640px;margin:12px auto;line-height:1.7">' + insightText + '</div>');
  }

  function renderReviewList() {
    var html = '';
    for (var i = 0; i < state.answers.length; i++) {
      var answer = state.answers[i];
      var q = state.questions[i];
      var scenario = getScenarioById(q.id);
      if (!scenario) continue;

      var frameLabel = q.frame === 'positive' ? '正面框架' : '负面框架';
      var frameClass = q.frame === 'positive' ? 'positive' : 'negative';
      var altFrame = q.frame === 'positive' ? 'negative' : 'positive';
      var altOptions = scenario[altFrame];

      html += '<div class="review-card">' +
        '<div class="review-header">' +
          '<span class="review-q">#' + (i + 1) + ' ' + scenario.title + '</span>' +
          '<span class="review-frame ' + frameClass + '">' + frameLabel + '</span>' +
        '</div>' +
        '<div class="review-options">' +
          '<div class="review-option' + (answer.choice === 'A' ? ' chosen' : '') + '">' +
            '<strong>' + (answer.choice === 'A' ? '→ ' : '  ') + '</strong>' + q.optionA +
          '</div>' +
          '<div class="review-option' + (answer.choice === 'B' ? ' chosen' : '') + '">' +
            '<strong>' + (answer.choice === 'B' ? '→ ' : '  ') + '</strong>' + q.optionB +
          '</div>' +
        '</div>' +
        '<div class="review-alt">' +
          '<span>换个说法：</span>' + altOptions.optionA + ' 或 ' + altOptions.optionB +
        '</div>' +
      '</div>';
    }
    els.reviewList.innerHTML = html;
  }

  function renderClassicCompare() {
    var classicItem = null;
    for (var i = 0; i < SCENARIOS.length; i++) {
      if (SCENARIOS[i].classicData && SCENARIOS[i].id === 1) {
        classicItem = SCENARIOS[i];
        break;
      }
    }

    if (!classicItem || !classicItem.classicData) return;

    var cd = classicItem.classicData;
    els.classicCompare.innerHTML =
      '<h4><i class="ti ti-flask"></i> 经典实验对比：亚洲疾病问题</h4>' +
      '<div class="classic-row">' +
        '<span class="classic-label">正面框架下选确定性方案</span>' +
        '<span class="classic-value" style="color:#4ade80">实验数据 ' + cd.positiveA + '%</span>' +
      '</div>' +
      '<div class="classic-row">' +
        '<span class="classic-label">负面框架下选确定性方案</span>' +
        '<span class="classic-value" style="color:#f87171">实验数据 ' + cd.negativeA + '%</span>' +
      '</div>' +
      '<div class="classic-row">' +
        '<span class="classic-label">框架效应差值</span>' +
        '<span class="classic-value" style="color:#fbbf24">' + Math.abs(cd.positiveA - cd.negativeA) + '%</span>' +
      '</div>' +
      '<div class="classic-note">' +
        'Tversky & Kahneman (1981) 在 Science 上发表的经典实验中，72% 的人在正面框架（救活）下选择了确定性方案，但在负面框架（死亡）下只有 22% 选了确定性方案——差值高达 50 个百分点。' +
        '你的结果可以和这个经典数据对比一下。' +
      '</div>';
  }

  function renderChart(result) {
    if (typeof window.loadChartJS !== 'function') return;

    window.loadChartJS().then(function() {
      var ctx = $('framingChart');
      if (!ctx) return;
      var canvasCtx = ctx.getContext('2d');

      var posA = Math.round(result.positiveARate * 100);
      var posB = 100 - posA;
      var negA = Math.round(result.negativeARate * 100);
      var negB = 100 - negA;

      new window.Chart(canvasCtx, {
        type: 'bar',
        data: {
          labels: ['正面框架', '负面框架'],
          datasets: [
            {
              label: '确定性选项 (A)',
              data: [posA, negA],
              backgroundColor: ['rgba(74,222,128,0.7)', 'rgba(248,113,113,0.7)'],
              borderColor: ['rgba(74,222,128,1)', 'rgba(248,113,113,1)'],
              borderWidth: 1,
              borderRadius: 6
            },
            {
              label: '风险性选项 (B)',
              data: [posB, negB],
              backgroundColor: ['rgba(74,222,128,0.2)', 'rgba(248,113,113,0.2)'],
              borderColor: ['rgba(74,222,128,0.5)', 'rgba(248,113,113,0.5)'],
              borderWidth: 1,
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'x',
          plugins: {
            legend: {
              labels: { color: '#a0a0a0' }
            },
            tooltip: {
              callbacks: {
                label: function(ctx) {
                  return ctx.dataset.label + ': ' + ctx.raw + '%';
                }
              }
            }
          },
          scales: {
            x: {
              stacked: true,
              ticks: { color: '#a0a0a0' },
              grid: { color: 'rgba(255,255,255,0.05)' }
            },
            y: {
              stacked: true,
              max: 100,
              ticks: {
                color: '#a0a0a0',
                callback: function(v) { return v + '%'; }
              },
              grid: { color: 'rgba(255,255,255,0.05)' }
            }
          }
        }
      });
    }).catch(function() {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      init();
    });
  } else {
    init();
  }

  window.startFramingQuiz = startQuiz;
  window.confirmFramingAnswer = confirmAnswer;
})();

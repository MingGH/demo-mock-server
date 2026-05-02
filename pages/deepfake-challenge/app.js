(function() {
  var state = {
    trials: [],
    answers: [],
    currentIndex: 0,
    locked: false
  };

  var phases = {};
  var els = {};

  function $(id) { return document.getElementById(id); }

  function init() {
    phases.intro  = $('phase-intro');
    phases.quiz   = $('phase-quiz');
    phases.result = $('phase-result');

    els.progressLabel = $('progressLabel');
    els.progressFill  = $('progressFill');
    els.trialImageWrap = $('trialImageWrap');
    els.trialImage    = $('trialImage');
    els.trialHint     = $('trialHint');
    els.feedbackOverlay = $('feedbackOverlay');
    els.btnReal       = $('btnReal');
    els.btnFake       = $('btnFake');
    els.resultHero    = $('resultHero');
    els.compareGrid   = $('compareGrid');
    els.sdtTable      = $('sdtTable');
    els.sdtExplain    = $('sdtExplain');
    els.reviewGrid    = $('reviewGrid');
    els.retryBtn      = $('retryBtn');
  }

  function showPhase(name) {
    for (var key in phases) {
      if (phases[key]) phases[key].classList.remove('active');
    }
    if (phases[name]) phases[name].classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── 开始挑战 ──
  function start() {
    state.trials = pickTrials(12);
    state.answers = [];
    state.currentIndex = 0;
    state.locked = false;
    showPhase('quiz');
    renderTrial();
  }

  // ── 渲染当前题目 ──
  function renderTrial() {
    if (state.currentIndex >= state.trials.length) {
      showResults();
      return;
    }

    state.locked = false;
    var trial = state.trials[state.currentIndex];
    var total = state.trials.length;

    els.progressLabel.textContent = (state.currentIndex + 1) + ' / ' + total;
    els.progressFill.style.width = ((state.currentIndex + 1) / total * 100) + '%';

    // 加载图片
    els.trialImageWrap.classList.add('loading');
    els.feedbackOverlay.className = 'feedback-overlay';
    els.feedbackOverlay.textContent = '';

    var img = new Image();
    img.onload = function() {
      els.trialImage.src = img.src;
      els.trialImageWrap.classList.remove('loading');
    };
    img.onerror = function() {
      els.trialImage.src = '';
      els.trialImageWrap.classList.remove('loading');
    };
    img.src = trial.src;

    els.trialHint.textContent = '第 ' + (state.currentIndex + 1) + ' 张：这是真人还是 AI？';
    els.btnReal.classList.remove('selected');
    els.btnFake.classList.remove('selected');
  }

  // ── 用户选择 ──
  function choose(userSaidReal) {
    if (state.locked) return;
    state.locked = true;

    var trial = state.trials[state.currentIndex];
    var correct = (userSaidReal === trial.isReal);

    state.answers.push({
      imageId: trial.id,
      isReal: trial.isReal,
      userSaidReal: userSaidReal,
      correct: correct
    });

    // 高亮选择
    if (userSaidReal) {
      els.btnReal.classList.add('selected');
    } else {
      els.btnFake.classList.add('selected');
    }

    // 反馈动画
    els.feedbackOverlay.textContent = correct ? '✓' : '✗';
    els.feedbackOverlay.className = 'feedback-overlay ' + (correct ? 'correct' : 'wrong');

    // 延迟进入下一题
    setTimeout(function() {
      state.currentIndex++;
      renderTrial();
    }, 800);
  }

  // ── 结果页 ──
  function showResults() {
    showPhase('result');

    var sdt = calcSDT(state.answers);
    var rating = getSDTRating(sdt.dPrime);

    // d' 映射到 0-100% 的条形宽度（d' 范围大约 -2 到 4）
    var barPercent = Math.max(0, Math.min(100, (sdt.dPrime + 1) / 5 * 100));

    els.resultHero.innerHTML =
      '<h2><i class="ti ti-scan-eye"></i> 你的 Deepfake 辨别力</h2>' +
      '<div class="result-big" style="color:' + rating.color + '">' + sdt.accuracy * 100 + '%</div>' +
      '<div style="font-size:0.85rem;color:#a0a0a0;margin-bottom:12px">' + sdt.hit + ' 次命中 · ' + sdt.cr + ' 次正确拒绝 · ' + (sdt.miss + sdt.fa) + ' 次失误</div>' +
      '<div style="font-size:0.9rem;color:#cbd5e1;margin-bottom:8px">d\' = ' + sdt.dPrime.toFixed(2) + '（信号检测论辨别力指数）</div>' +
      '<div class="dprime-bar-wrap"><div class="dprime-bar-fill" style="width:0%" id="dprimeBarFill"></div></div>' +
      '<div class="dprime-labels"><span>d\'=-1 猜反</span><span>d\'=0 纯猜</span><span>d\'=2 不错</span><span>d\'=4 专家</span></div>' +
      '<div class="result-grade" style="color:' + rating.color + '">' + rating.label + '</div>' +
      '<div class="result-desc">' + rating.desc + '</div>';

    setTimeout(function() {
      var bar = $('dprimeBarFill');
      if (bar) bar.style.width = barPercent + '%';
    }, 100);

    // 对比卡片
    var ref = REFERENCE_DATA;
    var userColor = sdt.accuracy >= 0.5 ? '#4ade80' : '#f87171';
    els.compareGrid.innerHTML =
      '<div class="compare-card">' +
        '<h4><i class="ti ti-user"></i> 你</h4>' +
        '<div class="compare-percent" style="color:' + userColor + '">' + (sdt.accuracy * 100).toFixed(0) + '%</div>' +
        '<div class="compare-label">正确率</div>' +
      '</div>' +
      '<div class="compare-card">' +
        '<h4><i class="ti ti-users"></i> 人类平均</h4>' +
        '<div class="compare-percent" style="color:#f87171">' + (ref.humanAccuracy * 100).toFixed(1) + '%</div>' +
        '<div class="compare-label">高质量 deepfake</div>' +
      '</div>' +
      '<div class="compare-card">' +
        '<h4><i class="ti ti-robot"></i> AI 检测</h4>' +
        '<div class="compare-percent" style="color:#fbbf24">' + (ref.aiRealWorldAccuracy * 100).toFixed(0) + '%</div>' +
        '<div class="compare-label">真实场景</div>' +
      '</div>';

    // 四格表
    els.sdtTable.innerHTML =
      '<table class="sdt-table">' +
        '<tr><th></th><th>实际是真人</th><th>实际是 AI</th></tr>' +
        '<tr><td><strong>你判断「真人」</strong></td><td class="hit">命中 (Hit) ' + sdt.hit + '</td><td class="fa">虚报 (FA) ' + sdt.fa + '</td></tr>' +
        '<tr><td><strong>你判断「AI」</strong></td><td class="miss">漏报 (Miss) ' + sdt.miss + '</td><td class="cr">正确拒绝 (CR) ' + sdt.cr + '</td></tr>' +
      '</table>';

    var criterionText = sdt.criterion > 0.3
      ? '你倾向于把照片判断为 AI（保守策略）。'
      : sdt.criterion < -0.3
        ? '你倾向于把照片判断为真人（宽松策略）。'
        : '你的判断偏好比较中性，没有明显偏向。';

    els.sdtExplain.innerHTML =
      '<div style="font-size:0.85rem;color:#a0a0a0;line-height:1.7">' +
        '<p><strong style="color:#ffd700">d\' = ' + sdt.dPrime.toFixed(2) + '</strong>：辨别力指数。0 = 纯猜，越高越能分辨真假。</p>' +
        '<p><strong style="color:#ffd700">c = ' + sdt.criterion.toFixed(2) + '</strong>：判断标准。' + criterionText + '</p>' +
      '</div>';

    // 逐张回顾
    var reviewHtml = '';
    for (var i = 0; i < state.answers.length; i++) {
      var a = state.answers[i];
      var trial = state.trials[i];
      var truthLabel = a.isReal ? '真人照片' : 'AI 生成';
      var truthColor = a.isReal ? '#4ade80' : '#f87171';
      var answerLabel = a.userSaidReal ? '你选了「真人」' : '你选了「AI」';
      var cssClass = a.correct ? 'was-correct' : 'was-wrong';

      reviewHtml +=
        '<div class="review-item ' + cssClass + '">' +
          '<img src="' + trial.src + '" alt="第' + (i + 1) + '张" loading="lazy">' +
          '<div class="review-item-info">' +
            '<div class="review-item-truth" style="color:' + truthColor + '">' + truthLabel + '</div>' +
            '<div class="review-item-answer">' + answerLabel + ' ' + (a.correct ? '✓' : '✗') + '</div>' +
          '</div>' +
        '</div>';
    }
    els.reviewGrid.innerHTML = reviewHtml;

    // ROC 图
    renderROC(sdt);

    // 重试按钮
    els.retryBtn.onclick = function() {
      showPhase('intro');
    };
  }

  // ── ROC 图 ──
  function renderROC(sdt) {
    if (typeof window.loadChartJS !== 'function') return;

    window.loadChartJS().then(function() {
      var ctx = $('rocChart');
      if (!ctx) return;

      // 对角线点
      var diagonalPoints = [];
      for (var i = 0; i <= 10; i++) {
        diagonalPoints.push({ x: i / 10, y: i / 10 });
      }

      new window.Chart(ctx.getContext('2d'), {
        type: 'scatter',
        data: {
          datasets: [
            {
              label: '随机猜测线',
              data: diagonalPoints,
              showLine: true,
              borderColor: 'rgba(255,255,255,0.2)',
              borderDash: [5, 5],
              pointRadius: 0,
              borderWidth: 1
            },
            {
              label: '你的位置',
              data: [{ x: sdt.faRate, y: sdt.hitRate }],
              backgroundColor: '#ffd700',
              borderColor: '#ffd700',
              pointRadius: 10,
              pointHoverRadius: 12
            },
            {
              label: '人类平均',
              data: [{ x: 0.6, y: 0.35 }],
              backgroundColor: '#f87171',
              borderColor: '#f87171',
              pointRadius: 8,
              pointStyle: 'triangle',
              pointHoverRadius: 10
            },
            {
              label: 'AI 检测（实战）',
              data: [{ x: 0.15, y: 0.65 }],
              backgroundColor: '#4ade80',
              borderColor: '#4ade80',
              pointRadius: 8,
              pointStyle: 'rectRot',
              pointHoverRadius: 10
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              title: { display: true, text: '虚报率 (False Alarm Rate)', color: '#a0a0a0' },
              min: 0, max: 1,
              ticks: { color: '#a0a0a0', callback: function(v) { return (v * 100) + '%'; } },
              grid: { color: 'rgba(255,255,255,0.05)' }
            },
            y: {
              title: { display: true, text: '命中率 (Hit Rate)', color: '#a0a0a0' },
              min: 0, max: 1,
              ticks: { color: '#a0a0a0', callback: function(v) { return (v * 100) + '%'; } },
              grid: { color: 'rgba(255,255,255,0.05)' }
            }
          },
          plugins: {
            legend: { labels: { color: '#a0a0a0' } },
            tooltip: {
              callbacks: {
                label: function(ctx) {
                  return ctx.dataset.label + ': 命中率=' + (ctx.parsed.y * 100).toFixed(0) + '%, 虚报率=' + (ctx.parsed.x * 100).toFixed(0) + '%';
                }
              }
            }
          }
        }
      });
    }).catch(function() {});
  }

  // ── 初始化 ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.startChallenge = start;
  window.makeChoice = choose;
})();

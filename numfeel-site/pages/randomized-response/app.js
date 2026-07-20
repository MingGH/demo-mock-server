(function() {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var PROD_URL = 'https://numfeel.996.ninja/pages/randomized-response/';

  // ── 全局状态 ──
  var state = {
    scenario: 'cheating',
    survey: null,        // { rng, yesCount, sampleSize, batches, seed }
    surveySeed: null,    // null = 用场景默认 seed；非 null = 重新调查后的随机 seed
    private: { step: 1, truth: null, dieValue: null, response: null, mechanism: null },
    tuning: { t: 2 / 3, n: 1000 },
    conceal: 0.5,
    nonCompliance: false
  };
  var privateFlowId = 0;
  var privateTimeline = null;

  // 分批阶段：50 -> 100 -> 200 -> 500 -> 1000 -> +500...
  var BATCH_STAGES = [50, 100, 200, 500, 1000];

  function nextBatchSize(current) {
    for (var i = 0; i < BATCH_STAGES.length; i++) {
      if (current < BATCH_STAGES[i]) return BATCH_STAGES[i] - current;
    }
    return 500;
  }

  function currentScenario() {
    return engine.SCENARIOS[state.scenario];
  }

  function pct(v, digits) {
    if (isNaN(v)) return '-';
    var d = digits === undefined ? 1 : digits;
    return (v * 100).toFixed(d) + '%';
  }

  function fmt(v, digits) {
    if (isNaN(v)) return '-';
    return Number(v).toFixed(digits === undefined ? 3 : digits);
  }

  // 私密体验优先使用浏览器加密随机源；不支持时才回退到 Math.random。
  function secureRandom() {
    if (window.crypto && window.crypto.getRandomValues) {
      var values = new Uint32Array(1);
      window.crypto.getRandomValues(values);
      return values[0] / 4294967296;
    }
    return Math.random();
  }

  function setAnswerAvailability(face) {
    var forcedYes = face === 1;
    var forcedNo = face === 2;
    privateEls.answerYesBtn.disabled = forcedNo;
    privateEls.answerNoBtn.disabled = forcedYes;

    if (forcedYes) {
      privateEls.ruleReminder.innerHTML = '你掷出了 <span class="hl-gold">1</span>，规则要求回答<span class="hl-gold">「是」</span>。页面已锁定另一个选项，避免误操作。';
    } else if (forcedNo) {
      privateEls.ruleReminder.innerHTML = '你掷出了 <span class="hl-gold">2</span>，规则要求回答<span class="hl-gold">「否」</span>。页面已锁定另一个选项，避免误操作。';
    } else {
      privateEls.ruleReminder.innerHTML = '你掷出了 <span class="hl-gold">' + face + '</span>，请按照心里保留的真实情况作答。<br>真实情况仍然不需要输入页面。';
    }
  }

  // ── 数字动画 ──
  function animateCount(el, from, to, formatter) {
    if (reduceMotion || !window.gsap) {
      el.textContent = formatter(to);
      return;
    }
    var proxy = { v: from };
    gsap.to(proxy, {
      v: to,
      duration: 0.45,
      ease: 'power2.out',
      onUpdate: function() {
        el.textContent = formatter(proxy.v);
      }
    });
  }

  // ========================================================
  // 模块 1：私密作答流程
  // ========================================================

  var privateEls = {
    startBtn: document.getElementById('startPrivateBtn'),
    section: document.getElementById('privateSection'),
    stepNav: document.getElementById('stepNav'),
    panels: [null,
      document.getElementById('panel1'),
      document.getElementById('panel2'),
      document.getElementById('panel3'),
      document.getElementById('panel4')
    ],
    toStep2Btn: document.getElementById('toStep2Btn'),
    rollDieBtn: document.getElementById('rollDieBtn'),
    usedPhysicalDieBtn: document.getElementById('usedPhysicalDieBtn'),
    physicalDieContinueBtn: document.getElementById('physicalDieContinueBtn'),
    dieInputArea: document.getElementById('dieInputArea'),
    diceFace: document.getElementById('diceFace'),
    diceLabel: document.getElementById('diceLabel'),
    diceResult: document.getElementById('diceResult'),
    diceMechanism: document.getElementById('diceMechanism'),
    ruleReminder: document.getElementById('ruleReminder'),
    answerYesBtn: document.getElementById('answerYesBtn'),
    answerNoBtn: document.getElementById('answerNoBtn'),
    privateTruth: document.getElementById('privateTruth'),
    privateDie: document.getElementById('privateDie'),
    privateMechanism: document.getElementById('privateMechanism'),
    surveyorAnswer: document.getElementById('surveyorAnswer'),
    psLine1: document.getElementById('psLine1'),
    psLine2: document.getElementById('psLine2'),
    conclusionLine: document.getElementById('conclusionLine'),
    retryBtn: document.getElementById('retryPrivateBtn'),
    goToSurveyBtn: document.getElementById('goToSurveyBtn')
  };

  function showStep(step) {
    state.private.step = step;
    for (var i = 1; i <= 4; i++) {
      privateEls.panels[i].classList.toggle('active', i === step);
    }
    var dots = privateEls.stepNav.querySelectorAll('.step-dot');
    for (var j = 0; j < dots.length; j++) {
      var s = parseInt(dots[j].getAttribute('data-step'), 10);
      dots[j].classList.remove('active', 'done');
      if (s < step) dots[j].classList.add('done');
      else if (s === step) dots[j].classList.add('active');
    }
    if (!reduceMotion && window.gsap) {
      gsap.fromTo(privateEls.panels[step], { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' });
    }
  }

  function resetPrivate() {
    privateFlowId++;
    if (privateTimeline) {
      privateTimeline.kill();
      privateTimeline = null;
    }
    state.private = { step: 1, truth: null, dieValue: null, response: null, mechanism: null };
    privateEls.diceFace.textContent = '?';
    privateEls.diceLabel.textContent = '还没掷骰子';
    privateEls.diceResult.textContent = '-';
    privateEls.diceMechanism.textContent = '-';
    privateEls.dieInputArea.style.display = 'none';
    privateEls.answerYesBtn.disabled = false;
    privateEls.answerNoBtn.disabled = false;
    privateEls.answerYesBtn.classList.remove('selected');
    privateEls.answerNoBtn.classList.remove('selected');
    privateEls.ruleReminder.innerHTML = '规则提醒：<span class="hl-gold">掷出 1 → 强制「是」</span>，<span class="hl-gold">掷出 2 → 强制「否」</span>，<span class="hl-gold">3～6 → 如实回答</span>。<br>请按规则点击下方按钮提交最终答案。调查者只会收到这个「是/否」。';
    showStep(1);
  }

  function rollLocalDie() {
    privateFlowId++;
    var flowId = privateFlowId;
    if (privateTimeline) privateTimeline.kill();
    var finalFace = engine.rollDie(secureRandom);
    privateEls.diceLabel.textContent = '本地骰子（仅你的浏览器可见）';

    if (reduceMotion || !window.gsap) {
      privateEls.diceFace.textContent = finalFace;
      finishDieRoll(finalFace, flowId);
      return;
    }

    // 翻转动画
    var frames = 0;
    var maxFrames = 10;
    privateTimeline = gsap.timeline();
    var cycle = function() {
      if (flowId !== privateFlowId) return;
      privateEls.diceFace.textContent = engine.rollDie(secureRandom);
      frames++;
      if (frames < maxFrames) {
        privateTimeline.call(cycle, null, '+=0.05');
      }
    };
    privateTimeline.to(privateEls.diceFace, { rotation: 360, duration: 0.5, ease: 'power2.out' }, 0);
    privateTimeline.call(cycle, null, 0);
    privateTimeline.call(function() {
      if (flowId !== privateFlowId) return;
      privateEls.diceFace.textContent = finalFace;
      gsap.set(privateEls.diceFace, { rotation: 0 });
      privateTimeline = null;
      finishDieRoll(finalFace, flowId);
    });
  }

  function finishDieRoll(face, flowId) {
    if (flowId !== undefined && flowId !== privateFlowId) return;
    state.private.dieValue = face;
    privateEls.diceResult.textContent = '点数：' + face;
    var mechText;
    if (face === 1) mechText = '强制回答「是」';
    else if (face === 2) mechText = '强制回答「否」';
    else mechText = '如实回答';
    privateEls.diceMechanism.textContent = '规则：' + mechText;
    privateEls.dieInputArea.style.display = 'none';
    setAnswerAvailability(face);
    if (!reduceMotion && window.gsap) {
      gsap.fromTo(privateEls.diceResult, { scale: 0.8 }, { scale: 1, duration: 0.3, ease: 'back.out(2)' });
    }
    // 自动进入步骤 3；若用户已切换到实体骰子路径则忽略这个旧回调。
    setTimeout(function() {
      if (flowId === undefined || flowId === privateFlowId) showStep(3);
    }, 600);
  }

  function submitAnswer(answer) {
    var face = state.private.dieValue;
    if ((face === 1 && answer !== 'yes') || (face === 2 && answer !== 'no')) return;

    state.private.response = answer;
    if (face === 1) state.private.mechanism = 'forced-yes';
    else if (face === 2) state.private.mechanism = 'forced-no';
    else if (state.private.mechanism !== 'private-device') state.private.mechanism = 'truthful';
    // 标记选中
    privateEls.answerYesBtn.classList.toggle('selected', answer === 'yes');
    privateEls.answerNoBtn.classList.toggle('selected', answer === 'no');
    if (!reduceMotion && window.gsap) {
      var btn = answer === 'yes' ? privateEls.answerYesBtn : privateEls.answerNoBtn;
      gsap.fromTo(btn, { scale: 0.95 }, { scale: 1, duration: 0.25, ease: 'back.out(2)' });
    }
    var answerFlowId = privateFlowId;
    setTimeout(function() {
      if (answerFlowId !== privateFlowId) return;
      showStep(4);
      revealResult();
    }, 500);
  }

  function revealResult() {
    var p = state.private;
    // 提示用户在心里对照：真值只在他们脑子里
    privateEls.privateTruth.textContent = '（只有你知道）';
    privateEls.privateDie.textContent = p.dieValue != null ? p.dieValue : '未输入页面';
    var mechText;
    if (p.mechanism === 'forced-yes') mechText = '骰子强制「是」';
    else if (p.mechanism === 'forced-no') mechText = '骰子强制「否」';
    else if (p.mechanism === 'private-device') mechText = '由你私下按规则决定';
    else mechText = '如实回答';
    privateEls.privateMechanism.textContent = mechText;
    privateEls.surveyorAnswer.textContent = p.response === 'yes' ? '是' : '否';

    // 可能来源
    if (p.response === 'yes') {
      privateEls.psLine1.textContent = '可能骰子是 1，被强制回答「是」';
      privateEls.psLine2.textContent = '可能骰子是 3～6，且真实情况为「是」';
    } else {
      privateEls.psLine1.textContent = '可能骰子是 2，被强制回答「否」';
      privateEls.psLine2.textContent = '可能骰子是 3～6，且真实情况为「否」';
    }
    privateEls.conclusionLine.textContent = '调查者不能从一个回答确定真实情况，但会获得有限的概率线索——这就是合理否认空间。';
  }

  privateEls.startBtn.addEventListener('click', function() {
    privateEls.section.style.display = 'block';
    resetPrivate();
    if (!reduceMotion && window.gsap) {
      gsap.fromTo(privateEls.section, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5 });
    }
    privateEls.section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  privateEls.toStep2Btn.addEventListener('click', function() { showStep(2); });
  privateEls.rollDieBtn.addEventListener('click', rollLocalDie);
  privateEls.usedPhysicalDieBtn.addEventListener('click', function() {
    privateFlowId++;
    if (privateTimeline) {
      privateTimeline.kill();
      privateTimeline = null;
    }
    privateEls.dieInputArea.style.display = 'block';
    privateEls.diceLabel.textContent = '实体骰子（点数不输入页面）';
    privateEls.diceResult.textContent = '请只在心里记住点数';
    privateEls.diceMechanism.textContent = '按骰子规则决定最终答案';
  });
  privateEls.physicalDieContinueBtn.addEventListener('click', function() {
    state.private.dieValue = null;
    state.private.mechanism = 'private-device';
    privateEls.dieInputArea.style.display = 'none';
    privateEls.answerYesBtn.disabled = false;
    privateEls.answerNoBtn.disabled = false;
    privateEls.ruleReminder.innerHTML = '实体骰子的点数<span class="hl-blue">没有输入页面</span>。请按你刚才私下看到的点数和规则，提交最终答案。';
    showStep(3);
  });

  privateEls.answerYesBtn.addEventListener('click', function() { submitAnswer('yes'); });
  privateEls.answerNoBtn.addEventListener('click', function() { submitAnswer('no'); });
  privateEls.retryBtn.addEventListener('click', resetPrivate);
  privateEls.goToSurveyBtn.addEventListener('click', function() {
    document.getElementById('scenarioGrid').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ========================================================
  // 模块 2：调查者视角--逐批收集
  // ========================================================

  var surveyEls = {
    scenarioGrid: document.getElementById('scenarioGrid'),
    nextBatchBtn: document.getElementById('nextBatchBtn'),
    resetSurveyBtn: document.getElementById('resetSurveyBtn'),
    batchHint: document.getElementById('batchHint'),
    batchDots: document.getElementById('batchDots'),
    statSampleSize: document.getElementById('statSampleSize'),
    statYesCount: document.getElementById('statYesCount'),
    statYesRate: document.getElementById('statYesRate'),
    statEstimate: document.getElementById('statEstimate'),
    statEstimateSub: document.getElementById('statEstimateSub'),
    statCI: document.getElementById('statCI'),
    statCISub: document.getElementById('statCISub'),
    ciBar: document.getElementById('ciBar'),
    ciRange: document.getElementById('ciRange'),
    ciMarker: document.getElementById('ciMarker'),
    ciTruth: document.getElementById('ciTruth')
  };

  var chart = null;

  function initSurvey() {
    var scenario = currentScenario();
    var seed = state.surveySeed !== null ? state.surveySeed : scenario.seed;
    state.survey = {
      rng: engine.createSeededRandom(seed),
      yesCount: 0,
      sampleSize: 0,
      batches: [],
      seed: seed
    };
    updateBatchButton();
    renderSurvey();
    renderChart();
  }

  function updateBatchButton() {
    var next = nextBatchSize(state.survey.sampleSize);
    surveyEls.nextBatchBtn.innerHTML = '<i class="ti ti-plus"></i> 调查下一批 ' + next + ' 人';
    surveyEls.nextBatchBtn.disabled = false;
  }

  function addBatch() {
    var scenario = currentScenario();
    var batchSize = nextBatchSize(state.survey.sampleSize);
    var batch = engine.simulateBatch({
      prevalence: scenario.prevalence,
      truthProbability: engine.DEFAULT_TRUTH_PROBABILITY,
      sampleSize: batchSize
    }, state.survey.rng);

    state.survey.yesCount += batch.yesCount;
    state.survey.sampleSize += batchSize;
    state.survey.batches.push({
      sampleSize: state.survey.sampleSize,
      yesCount: state.survey.yesCount,
      batchResponses: batch.responses
    });

    renderBatchDots(batch.responses);
    renderSurvey();
    updateBatchButton();
    updateChart();
  }

  function renderBatchDots(newResponses) {
    var dotsHtml = '';
    // 先渲染已有的
    var existing = surveyEls.batchDots.querySelectorAll('.batch-dot').length;
    for (var i = 0; i < newResponses.length; i++) {
      dotsHtml += '<div class="batch-dot ' + newResponses[i] + '"></div>';
    }
    surveyEls.batchDots.insertAdjacentHTML('beforeend', dotsHtml);
    // 限制显示数量，避免过多
    var allDots = surveyEls.batchDots.querySelectorAll('.batch-dot');
    if (allDots.length > 800) {
      for (var j = 0; j < allDots.length - 800; j++) {
        allDots[j].remove();
      }
    }
    if (!reduceMotion && window.gsap && newResponses.length <= 100) {
      var newDots = surveyEls.batchDots.querySelectorAll('.batch-dot');
      var startIdx = newDots.length - newResponses.length;
      for (var k = startIdx; k < newDots.length; k++) {
        gsap.fromTo(newDots[k], { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.2, delay: (k - startIdx) * 0.005 });
      }
    }
  }

  function renderSurvey() {
    var s = state.survey;
    var scenario = currentScenario();
    var t = engine.DEFAULT_TRUTH_PROBABILITY;

    var prevSample = parseInt(surveyEls.statSampleSize.textContent.replace(/,/g, ''), 10) || 0;
    animateCount(surveyEls.statSampleSize, prevSample, s.sampleSize, function(v) { return Math.round(v).toLocaleString('zh-CN'); });

    var prevYes = parseInt(surveyEls.statYesCount.textContent.replace(/,/g, ''), 10) || 0;
    animateCount(surveyEls.statYesCount, prevYes, s.yesCount, function(v) { return Math.round(v).toLocaleString('zh-CN'); });

    if (s.sampleSize === 0) {
      surveyEls.statYesRate.textContent = '0.0%';
      surveyEls.statEstimate.textContent = '-';
      surveyEls.statEstimateSub.textContent = '反推的真实比例';
      surveyEls.statCI.textContent = '-';
      surveyEls.statCISub.textContent = '标准误 -';
      surveyEls.ciRange.style.left = '0%';
      surveyEls.ciRange.style.width = '0%';
      surveyEls.ciMarker.style.left = '0%';
      surveyEls.ciTruth.style.left = (scenario.prevalence * 100) + '%';
      return;
    }

    var r = s.yesCount / s.sampleSize;
    surveyEls.statYesRate.textContent = '观察到的「是」比例 ' + pct(r);

    var ci = engine.confidenceInterval(s.yesCount, s.sampleSize, t);
    surveyEls.statEstimate.textContent = pct(ci.clippedEstimate);
    var inCI = scenario.prevalence >= ci.lower && scenario.prevalence <= ci.upper;
    var boundaryNote = ci.estimate !== ci.clippedEstimate
      ? ' · 原始估计 ' + pct(ci.estimate) + '，显示值已裁剪到 0%～100%'
      : '';
    surveyEls.statEstimateSub.innerHTML = '真实比例 ' + pct(scenario.prevalence, 0) + (inCI ? ' <span style="color:#81c784">在 CI 内</span>' : ' <span style="color:#ff6b6b">在 CI 外</span>') + boundaryNote;

    surveyEls.statCI.textContent = '[' + pct(ci.lower, 0) + ', ' + pct(ci.upper, 0) + ']';
    surveyEls.statCISub.textContent = '标准误 ' + fmt(ci.standardError * 100, 2) + '%';

    // CI bar
    var lowerPct = Math.max(0, ci.lower * 100);
    var upperPct = Math.min(100, ci.upper * 100);
    surveyEls.ciRange.style.left = lowerPct + '%';
    surveyEls.ciRange.style.width = (upperPct - lowerPct) + '%';
    surveyEls.ciMarker.style.left = Math.max(0, Math.min(100, ci.clippedEstimate * 100)) + '%';
    surveyEls.ciTruth.style.left = (scenario.prevalence * 100) + '%';

    // 更新结果预览
    updateResultPreview();
  }

  function renderChart() {
    var ctx = document.getElementById('convergenceChart');
    var scenario = currentScenario();

    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: '95% CI 下界',
            data: [],
            borderColor: 'rgba(129, 199, 132, 0.0)',
            backgroundColor: 'rgba(129, 199, 132, 0.15)',
            fill: { target: 1, above: 'rgba(129, 199, 132, 0.15)', below: 'rgba(129, 199, 132, 0.15)' },
            pointRadius: 0,
            tension: 0.3
          },
          {
            label: '95% CI 上界',
            data: [],
            borderColor: 'rgba(129, 199, 132, 0.0)',
            backgroundColor: 'transparent',
            fill: false,
            pointRadius: 0,
            tension: 0.3
          },
          {
            label: 'RRT 估计 π̂',
            data: [],
            borderColor: '#ffd700',
            backgroundColor: '#ffd700',
            fill: false,
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.3,
            borderWidth: 2
          },
          {
            label: '真实比例（虚构）',
            data: [],
            borderColor: '#90caf9',
            backgroundColor: '#90caf9',
            fill: false,
            pointRadius: 0,
            borderDash: [6, 4],
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: {
            labels: {
              color: '#ddd',
              filter: function(item) { return item.text.indexOf('CI') === -1 || item.text.indexOf('估计') !== -1; }
            }
          },
          tooltip: {
            callbacks: {
              title: function(items) { return '累计样本 ' + items[0].label + ' 人'; },
              label: function(item) {
                if (item.datasetIndex === 2) return 'RRT 估计: ' + (item.parsed.y * 100).toFixed(1) + '%';
                if (item.datasetIndex === 3) return '真实比例: ' + (item.parsed.y * 100).toFixed(0) + '%';
                if (item.datasetIndex === 0) return 'CI 下界: ' + (item.parsed.y * 100).toFixed(1) + '%';
                if (item.datasetIndex === 1) return 'CI 上界: ' + (item.parsed.y * 100).toFixed(1) + '%';
                return '';
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: '累计样本量', color: '#aaa' },
            ticks: { color: '#aaa', maxRotation: 0 },
            grid: { color: 'rgba(255,255,255,0.06)' }
          },
          y: {
            title: { display: true, text: '比例', color: '#aaa' },
            ticks: { color: '#aaa', callback: function(v) { return (v * 100).toFixed(0) + '%'; } },
            grid: { color: 'rgba(255,255,255,0.06)' },
            min: 0,
            max: 1
          }
        }
      }
    });
  }

  function updateChart() {
    if (!chart) return;
    var s = state.survey;
    var scenario = currentScenario();
    var t = engine.DEFAULT_TRUTH_PROBABILITY;

    var labels = [];
    var estimates = [];
    var lowers = [];
    var uppers = [];
    var truths = [];

    for (var i = 0; i < s.batches.length; i++) {
      var b = s.batches[i];
      var ci = engine.confidenceInterval(b.yesCount, b.sampleSize, t);
      labels.push(b.sampleSize);
      estimates.push(ci.clippedEstimate);
      lowers.push(ci.lower);
      uppers.push(ci.upper);
      truths.push(scenario.prevalence);
    }

    chart.data.labels = labels;
    chart.data.datasets[0].data = lowers;
    chart.data.datasets[1].data = uppers;
    chart.data.datasets[2].data = estimates;
    chart.data.datasets[3].data = truths;
    chart.update('none');
  }

  surveyEls.scenarioGrid.addEventListener('click', function(e) {
    var card = e.target.closest('.scenario-card');
    if (!card) return;
    state.scenario = card.getAttribute('data-scenario');
    state.surveySeed = null;
    var cards = surveyEls.scenarioGrid.querySelectorAll('.scenario-card');
    for (var i = 0; i < cards.length; i++) cards[i].classList.remove('active');
    card.classList.add('active');
    // 重置调查
    initSurvey();
    // 清空数据点
    surveyEls.batchDots.innerHTML = '';
    // 更新模块 4 的 pi
    document.getElementById('piDisplay').textContent = pct(currentScenario().prevalence, 0);
    document.querySelector('#piDisplay').parentElement.querySelector('span').textContent = '当前场景：' + currentScenario().label;
    updateCompareModule();
    updateTuningModule();
  });

  surveyEls.nextBatchBtn.addEventListener('click', addBatch);
  surveyEls.resetSurveyBtn.addEventListener('click', function() {
    // 新 seed，不修改场景默认 seed
    state.surveySeed = Math.floor(secureRandom() * 100000) + 1;
    initSurvey();
    surveyEls.batchDots.innerHTML = '';
  });

  // ========================================================
  // 模块 3：直接 vs RRT 对照
  // ========================================================

  var compareEls = {
    concealSlider: document.getElementById('concealSlider'),
    concealValue: document.getElementById('concealValue'),
    directEstimate: document.getElementById('directEstimate'),
    directTruth: document.getElementById('directTruth'),
    rrtCompareEstimate: document.getElementById('rrtCompareEstimate'),
    rrtCompareTruth: document.getElementById('rrtCompareTruth'),
    nonComplianceToggle: document.getElementById('nonComplianceToggle')
  };

  function updateCompareModule() {
    var scenario = currentScenario();
    var n = 2000;
    var t = engine.DEFAULT_TRUTH_PROBABILITY;
    var conceal = state.conceal;
    var nc = state.nonCompliance ? 0.3 : 0;

    var directRng = engine.createSeededRandom(scenario.seed + 100);
    var direct = engine.simulateDirectSurvey({
      prevalence: scenario.prevalence,
      sampleSize: n,
      concealProbability: conceal
    }, directRng);

    var rrtRng = engine.createSeededRandom(scenario.seed + 200);
    var rrtBatch = engine.simulateBatch({
      prevalence: scenario.prevalence,
      truthProbability: t,
      sampleSize: n,
      nonCompliance: nc
    }, rrtRng);
    var rrtEst = engine.estimatePrevalence(rrtBatch.yesCount, n, t);

    compareEls.directEstimate.textContent = pct(direct.observedRate);
    compareEls.directTruth.textContent = '真实比例 ' + pct(scenario.prevalence, 0) + ' | 偏差 ' + pct(direct.observedRate - scenario.prevalence);
    compareEls.rrtCompareEstimate.textContent = pct(rrtEst.clipped);
    compareEls.rrtCompareTruth.textContent = '真实比例 ' + pct(scenario.prevalence, 0) + ' | 偏差 ' + pct(rrtEst.clipped - scenario.prevalence);

    // 颜色提示
    if (Math.abs(direct.observedRate - scenario.prevalence) > 0.05) {
      compareEls.directEstimate.style.color = '#ff6b6b';
    } else {
      compareEls.directEstimate.style.color = '#ffd700';
    }
    if (Math.abs(rrtEst.clipped - scenario.prevalence) > 0.05) {
      compareEls.rrtCompareEstimate.style.color = '#ff6b6b';
    } else {
      compareEls.rrtCompareEstimate.style.color = '#81c784';
    }
  }

  compareEls.concealSlider.addEventListener('input', function() {
    state.conceal = parseFloat(compareEls.concealSlider.value);
    compareEls.concealValue.textContent = Math.round(state.conceal * 100) + '%';
    updateCompareModule();
  });

  function toggleNonCompliance() {
    state.nonCompliance = !state.nonCompliance;
    compareEls.nonComplianceToggle.classList.toggle('on', state.nonCompliance);
    compareEls.nonComplianceToggle.setAttribute('aria-checked', state.nonCompliance);
    updateCompareModule();
  }
  compareEls.nonComplianceToggle.addEventListener('click', toggleNonCompliance);
  compareEls.nonComplianceToggle.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleNonCompliance(); }
  });

  // ========================================================
  // 模块 4：隐私与精度调节台
  // ========================================================

  var tuningEls = {
    tSlider: document.getElementById('tSlider'),
    tValue: document.getElementById('tValue'),
    nSlider: document.getElementById('nSlider'),
    nValue: document.getElementById('nValue'),
    piDisplay: document.getElementById('piDisplay'),
    rcForcedYes: document.getElementById('rcForcedYes'),
    rcForcedNo: document.getElementById('rcForcedNo'),
    rcEpsilon: document.getElementById('rcEpsilon'),
    rcEpsilonSub: document.getElementById('rcEpsilonSub'),
    rcSE: document.getElementById('rcSE'),
    rcCIWidth: document.getElementById('rcCIWidth'),
    rcMultiplier: document.getElementById('rcMultiplier'),
    seesawPointer: document.getElementById('seesawPointer')
  };

  function updateTuningModule() {
    var t = state.tuning.t;
    var n = state.tuning.n;
    var pi = currentScenario().prevalence;

    var forced = engine.getForcedProbability(t);
    var epsilon = engine.localPrivacyEpsilon(t);
    var theta = engine.responseYesProbability(pi, t);
    var yesCount = Math.round(theta * n);
    var se = engine.estimateStandardError(yesCount, n, t);
    var ci = engine.confidenceInterval(yesCount, n, t);
    var mult = engine.sampleSizeMultiplier(t);

    tuningEls.tValue.textContent = t.toFixed(3);
    tuningEls.nValue.textContent = n;
    tuningEls.piDisplay.textContent = pct(pi, 0);

    tuningEls.rcForcedYes.textContent = pct(forced, 1);
    tuningEls.rcForcedNo.textContent = pct(forced, 1);
    tuningEls.rcEpsilon.textContent = epsilon >= 0.01 ? fmt(epsilon, 3) : '0';
    tuningEls.rcEpsilonSub.textContent = epsilon === Infinity ? 't=1，无隐私保护' : (t === 2 / 3 ? '= ln(5)' : 't=' + t.toFixed(2));
    tuningEls.rcSE.textContent = fmt(se * 100, 2) + '%';
    tuningEls.rcCIWidth.textContent = fmt((ci.upper - ci.lower) * 100, 1) + '%';
    tuningEls.rcMultiplier.textContent = mult >= 100 ? '∞' : fmt(mult, 2) + '×';

    // 跷跷板指针：t 越高越偏右（精度高）
    var pointerPos = t * 100;
    tuningEls.seesawPointer.style.left = pointerPos + '%';
  }

  tuningEls.tSlider.addEventListener('input', function() {
    state.tuning.t = parseFloat(tuningEls.tSlider.value);
    updateTuningModule();
  });

  tuningEls.nSlider.addEventListener('input', function() {
    state.tuning.n = parseInt(tuningEls.nSlider.value, 10);
    updateTuningModule();
  });

  // ========================================================
  // 模块 6：复制结果
  // ========================================================

  var copyEls = {
    copyBtn: document.getElementById('copyResultBtn'),
    feedback: document.getElementById('copyFeedback'),
    preview: document.getElementById('resultPreview')
  };

  function buildResultText() {
    var s = state.survey;
    var scenario = currentScenario();
    var t = engine.DEFAULT_TRUTH_PROBABILITY;
    var lines = [];
    lines.push('随机化回答调查 - 本轮结果（虚构模拟）');
    lines.push('================================');
    lines.push('模拟场景：' + scenario.label);
    lines.push('设定真实比例：' + pct(scenario.prevalence, 0));
    lines.push('累计样本量：' + s.sampleSize);
    if (s.sampleSize > 0) {
      var r = s.yesCount / s.sampleSize;
      var ci = engine.confidenceInterval(s.yesCount, s.sampleSize, t);
      lines.push('观察到的「是」比例：' + pct(r));
      lines.push('RRT 估计比例 π̂：' + pct(ci.clippedEstimate));
      lines.push('95% 置信区间：[' + pct(ci.lower, 0) + ', ' + pct(ci.upper, 0) + ']');
      lines.push('标准误：' + fmt(ci.standardError * 100, 2) + '%');
    }
    lines.push('');
    lines.push('机制：六面骰子');
    lines.push('  掷出 1：强制回答「是」(概率 ' + pct(engine.getForcedProbability(t), 1) + ')');
    lines.push('  掷出 2：强制回答「否」(概率 ' + pct(engine.getForcedProbability(t), 1) + ')');
    lines.push('  掷出 3-6：如实回答 (概率 ' + pct(t, 1) + ')');
    lines.push('如实回答概率 t：' + t.toFixed(3));
    lines.push('隐私强度 ε：' + fmt(engine.localPrivacyEpsilon(t), 3));
    lines.push('');
    lines.push('线上体验：' + PROD_URL);
    return lines.join('\n');
  }

  function updateResultPreview() {
    copyEls.preview.textContent = buildResultText();
  }

  function copyResult() {
    var text = buildResultText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        showCopyFeedback(true);
      }).catch(function() {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      showCopyFeedback(true);
    } catch (e) {
      showCopyFeedback(false);
    }
    document.body.removeChild(ta);
  }

  function showCopyFeedback(success) {
    copyEls.feedback.className = 'copy-feedback ' + (success ? 'success' : 'error');
    copyEls.feedback.textContent = success ? '已复制到剪贴板' : '复制失败，请手动选择上方文本复制';
    if (!reduceMotion && window.gsap) {
      gsap.fromTo(copyEls.feedback, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.3 });
    }
    setTimeout(function() {
      copyEls.feedback.textContent = '';
      copyEls.feedback.className = 'copy-feedback';
    }, 3000);
  }

  copyEls.copyBtn.addEventListener('click', copyResult);

  // ========================================================
  // 初始化
  // ========================================================

  initSurvey();
  updateCompareModule();
  updateTuningModule();
  updateResultPreview();

})();

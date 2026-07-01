(function() {
  'use strict';

  var currentScenario = 'income';
  var currentQuery = 'mean';
  var epsilon = 1;
  var trials = 800;
  var budgetTotal = 3;
  var budgetUsed = 0;
  var experimentSeed = 0;
  var releaseChart = null;

  var els = {
    scenarioGrid: document.getElementById('scenarioGrid'),
    sampleSize: document.getElementById('sampleSize'),
    targetValue: document.getElementById('targetValue'),
    sensitivityValue: document.getElementById('sensitivityValue'),
    queryTypeLabel: document.getElementById('queryTypeLabel'),
    withoutExact: document.getElementById('withoutExact'),
    withExact: document.getElementById('withExact'),
    exactDelta: document.getElementById('exactDelta'),
    epsilonSlider: document.getElementById('epsilonSlider'),
    epsilonValue: document.getElementById('epsilonValue'),
    querySelect: document.getElementById('querySelect'),
    trialsSlider: document.getElementById('trialsSlider'),
    trialsValue: document.getElementById('trialsValue'),
    privateRelease: document.getElementById('privateRelease'),
    releaseError: document.getElementById('releaseError'),
    noiseScale: document.getElementById('noiseScale'),
    privacyLabel: document.getElementById('privacyLabel'),
    privacyExplain: document.getElementById('privacyExplain'),
    attackConfidence: document.getElementById('attackConfidence'),
    attackBar: document.getElementById('attackBar'),
    attackNote: document.getElementById('attackNote'),
    runAttackBtn: document.getElementById('runAttackBtn'),
    resetBtn: document.getElementById('resetBtn'),
    budgetLeft: document.getElementById('budgetLeft'),
    budgetBar: document.getElementById('budgetBar'),
    budgetNote: document.getElementById('budgetNote'),
    queryLog: document.getElementById('queryLog')
  };

  function queryLabel(type) {
    if (type === 'countAbove') return '超过阈值人数';
    if (type === 'p90') return '90 分位数';
    return '平均值';
  }

  function formatNumber(value, scenario, queryType) {
    if (queryType === 'countAbove') {
      return Math.max(0, Math.round(value)).toLocaleString('zh-CN') + ' 人';
    }
    var rounded = scenario.unit === '元' ? Math.round(value) : roundTo(value, 1);
    return rounded.toLocaleString('zh-CN') + ' ' + scenario.unit;
  }

  function formatDelta(value, scenario, queryType) {
    var prefix = value >= 0 ? '+' : '';
    if (queryType === 'countAbove') return prefix + Math.round(value).toLocaleString('zh-CN') + ' 人';
    var rounded = scenario.unit === '元' ? Math.round(value) : roundTo(value, 2);
    return prefix + rounded.toLocaleString('zh-CN') + ' ' + scenario.unit;
  }

  function makeReleaseBuckets(values, center, scenario, queryType) {
    var bins = 28;
    var sorted = values.slice().sort(function(a, b) { return a - b; });
    var low = sorted[Math.floor(sorted.length * 0.02)];
    var high = sorted[Math.floor(sorted.length * 0.98)];
    var range = Math.max(Math.abs(high - low), Math.abs(center) * 0.08, 1);
    var min = center - range;
    var max = center + range;
    var counts = buildHistogram(values, min, max, bins);
    var labels = [];
    var width = (max - min) / bins;
    for (var i = 0; i < bins; i++) {
      var labelValue = min + width * (i + 0.5);
      if (queryType === 'countAbove') labels.push(String(Math.round(labelValue)));
      else if (scenario.unit === '元') labels.push(String(Math.round(labelValue / 1000)) + 'k');
      else labels.push(String(roundTo(labelValue, 0)));
    }
    return { labels: labels, counts: counts };
  }

  function renderChart(summary) {
    var ctx = document.getElementById('releaseChart');
    var buckets = makeReleaseBuckets(summary.simulatedReleases, summary.withValue, summary.scenario, currentQuery);
    if (releaseChart) releaseChart.destroy();
    releaseChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: buckets.labels,
        datasets: [{
          label: '差分隐私发布值出现次数',
          data: buckets.counts,
          backgroundColor: 'rgba(144, 202, 249, 0.35)',
          borderColor: 'rgba(144, 202, 249, 0.85)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#ddd' } },
          tooltip: { callbacks: { title: function(items) { return '发布值约 ' + items[0].label; } } }
        },
        scales: {
          x: { ticks: { color: '#aaa', maxRotation: 0 }, grid: { color: 'rgba(255,255,255,0.06)' } },
          y: { ticks: { color: '#aaa' }, grid: { color: 'rgba(255,255,255,0.06)' } }
        }
      }
    });
  }

  function updateExperiment() {
    var summary = summarizeExperiment(currentScenario, currentQuery, epsilon, trials, experimentSeed);
    var scenario = summary.scenario;
    var level = privacyLevel(epsilon);

    els.sampleSize.textContent = summary.withoutTarget.length.toLocaleString('zh-CN') + ' 人';
    els.targetValue.textContent = formatNumber(scenario.targetValue, scenario, 'mean');
    els.sensitivityValue.textContent = formatNumber(summary.sensitivity, scenario, currentQuery);
    els.queryTypeLabel.textContent = queryLabel(currentQuery);

    els.withoutExact.textContent = formatNumber(summary.withoutValue, scenario, currentQuery);
    els.withExact.textContent = formatNumber(summary.withValue, scenario, currentQuery);
    els.exactDelta.textContent = formatDelta(summary.delta, scenario, currentQuery);

    els.privateRelease.textContent = formatNumber(summary.release.value, scenario, currentQuery);
    els.releaseError.textContent = '误差 ' + formatDelta(summary.release.value - summary.withValue, scenario, currentQuery);
    els.noiseScale.textContent = formatNumber(summary.release.scale, scenario, currentQuery);
    els.privacyLabel.textContent = level.label;
    els.privacyExplain.textContent = level.text;

    var confidence = Math.round(summary.confidence * 100);
    els.attackConfidence.textContent = confidence + '%';
    els.attackBar.style.width = confidence + '%';
    if (confidence <= 58) {
      els.attackNote.textContent = '接近瞎猜：张三被噪声遮住了';
      els.attackBar.className = 'safe';
    } else if (confidence <= 75) {
      els.attackNote.textContent = '有点线索：攻击者开始占优';
      els.attackBar.className = 'warn';
    } else {
      els.attackNote.textContent = '风险很高：统计结果暴露了张三';
      els.attackBar.className = 'danger';
    }

    renderChart(summary);
  }

  function updateBudget() {
    var left = Math.max(0, budgetTotal - budgetUsed);
    var usedPct = Math.min(100, budgetUsed / budgetTotal * 100);
    els.budgetLeft.textContent = '剩余 ' + roundTo(left, 1).toFixed(1);
    els.budgetBar.style.width = (100 - usedPct) + '%';
    if (budgetUsed === 0) {
      els.budgetNote.textContent = '试着依次点击右侧按钮，看预算怎么被消耗。';
    } else if (left > 1.5) {
      els.budgetNote.textContent = '预算还充足，但每次发布都在累加泄露风险。';
    } else if (left > 0) {
      els.budgetNote.textContent = '预算紧张：继续发布会让攻击者更容易平均掉噪声。';
    } else {
      els.budgetNote.textContent = '预算用完：系统应该拒绝再发布任何结果，否则等于取消保护。';
    }
  }

  function addQueryLog(name, cost) {
    var leftBefore = Math.max(0, budgetTotal - budgetUsed);
    if (leftBefore <= 0) {
      els.queryLog.innerHTML = '<div class="log-line danger">预算已用完，拒绝继续发布。</div>' + els.queryLog.innerHTML;
      return;
    }
    if (leftBefore < cost) {
      els.queryLog.innerHTML = '<div class="log-line danger">剩余预算只有 ' + roundTo(leftBefore, 1).toFixed(1) + '，不足以再发布一次「' + name + '」（需 ' + cost + '）。</div>' + els.queryLog.innerHTML;
      return;
    }
    budgetUsed = budgetUsed + cost;
    var line = '<div class="log-line">✅ 发布「' + name + '」，扣除 ε=' + cost + '，累计已用 ' + roundTo(budgetUsed, 1).toFixed(1) + ' / 3.0</div>';
    els.queryLog.innerHTML = line + els.queryLog.innerHTML;
    updateBudget();
  }

  function resetBudget() {
    budgetUsed = 0;
    els.queryLog.innerHTML = '';
    updateBudget();
  }

  function bindEvents() {
    els.scenarioGrid.addEventListener('click', function(e) {
      var card = e.target.closest('.scenario-card');
      if (!card) return;
      currentScenario = card.getAttribute('data-scenario');
      var cards = els.scenarioGrid.querySelectorAll('.scenario-card');
      for (var i = 0; i < cards.length; i++) cards[i].classList.remove('active');
      card.classList.add('active');
      updateExperiment();
    });

    els.epsilonSlider.addEventListener('input', function() {
      epsilon = parseFloat(els.epsilonSlider.value);
      els.epsilonValue.textContent = epsilon.toFixed(1);
      updateExperiment();
    });

    els.querySelect.addEventListener('change', function() {
      currentQuery = els.querySelect.value;
      updateExperiment();
    });

    els.trialsSlider.addEventListener('input', function() {
      trials = parseInt(els.trialsSlider.value, 10);
      els.trialsValue.textContent = trials + ' 次';
      updateExperiment();
    });

    els.runAttackBtn.addEventListener('click', function() {
      experimentSeed = (experimentSeed + 1) >>> 0;
      updateExperiment();
      els.runAttackBtn.innerHTML = '<i class="ti ti-refresh"></i> 再攻击一次';
      els.runAttackBtn.classList.add('pulse');
      setTimeout(function() { els.runAttackBtn.classList.remove('pulse'); }, 350);
    });

    els.resetBtn.addEventListener('click', function() {
      currentScenario = 'income';
      currentQuery = 'mean';
      epsilon = 1;
      trials = 800;
      experimentSeed = 0;
      els.epsilonSlider.value = '1';
      els.epsilonValue.textContent = '1.0';
      els.querySelect.value = 'mean';
      els.trialsSlider.value = '800';
      els.trialsValue.textContent = '800 次';
      els.runAttackBtn.innerHTML = '<i class="ti ti-swords"></i> 模拟一次攻击';
      var cards = els.scenarioGrid.querySelectorAll('.scenario-card');
      for (var i = 0; i < cards.length; i++) {
        cards[i].classList.toggle('active', cards[i].getAttribute('data-scenario') === 'income');
      }
      resetBudget();
      updateExperiment();
    });

    var buttons = document.querySelectorAll('.query-btn');
    for (var j = 0; j < buttons.length; j++) {
      buttons[j].addEventListener('click', function() {
        addQueryLog(this.getAttribute('data-query'), parseFloat(this.getAttribute('data-cost')));
      });
    }
  }

  bindEvents();
  updateBudget();
  updateExperiment();
})();

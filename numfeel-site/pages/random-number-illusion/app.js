/**
 * app.js — 随机数错觉演示 UI 层
 * 依赖：random-engine.js（浏览器通过 <script> 引入）、Chart.js（通过 loadChartJS 加载）
 */
(function () {
  'use strict';

  // ── 预设数据：混合「有规律」和「看起来随机」的 5 位数 ──
  var PRESET_NUMBERS = [
    '11111', '83947', '12345', '54176', '99999',
    '27361', '77777', '69254', '10101', '41708'
  ];

  var PATTERN_LABELS = {
    'all-same': '全部相同',
    'sequential': '连续递增/递减',
    'repeating-pattern': '重复模式',
    'palindrome': '回文',
    'none': '无规律'
  };

  // ── 状态 ──
  var testIndex = 0;
  var userChoices = []; // { num, choice: 'random'|'notrandom', pattern }
  var generating = false;
  var distChart = null;

  // ── DOM 引用 ──
  var els = {};

  function cacheDom() {
    els.hero = document.getElementById('rni-hero');
    els.startBtn = document.getElementById('rni-start-btn');
    els.act1 = document.getElementById('rni-act1');
    els.act2 = document.getElementById('rni-act2');
    els.act3 = document.getElementById('rni-act3');

    els.progressFill = document.getElementById('rni-progress-fill');
    els.progressText = document.getElementById('rni-progress-text');
    els.numberDisplay = document.getElementById('rni-number-display');
    els.feedback = document.getElementById('rni-feedback');
    els.btnRandom = document.getElementById('rni-btn-random');
    els.btnNotRandom = document.getElementById('rni-btn-notrandom');

    els.act1Result = document.getElementById('rni-act1-result');
    els.resultTable = document.getElementById('rni-result-table');
    els.biasEvidence = document.getElementById('rni-bias-evidence');
    els.act1Continue = document.getElementById('rni-act1-continue');

    els.genBtn = document.getElementById('rni-gen-btn');
    els.genStatus = document.getElementById('rni-gen-status');
    els.numberGrid = document.getElementById('rni-number-grid');
    els.statTotal = document.getElementById('rni-stat-total');
    els.statPattern = document.getElementById('rni-stat-pattern');
    els.statRatio = document.getElementById('rni-stat-ratio');
    els.patternBreakdown = document.getElementById('rni-pattern-breakdown');
    els.genFeedback = document.getElementById('rni-gen-feedback');
    els.genAgainBtn = document.getElementById('rni-gen-again-btn');
    els.act2Continue = document.getElementById('rni-act2-continue');

    els.calcInput = document.getElementById('rni-calc-input');
    els.calcResult = document.getElementById('rni-calc-result');
    els.quickTags = document.querySelectorAll('.rni-quick-tag');
  }

  // ── 初始化 ──
  function init() {
    cacheDom();

    els.startBtn.addEventListener('click', startTest);
    els.btnRandom.addEventListener('click', function () { recordChoice('random'); });
    els.btnNotRandom.addEventListener('click', function () { recordChoice('notrandom'); });

    els.act1Continue.addEventListener('click', revealAct2);
    els.genBtn.addEventListener('click', startGeneration);
    els.genAgainBtn.addEventListener('click', startGeneration);
    els.act2Continue.addEventListener('click', revealAct3);

    els.calcInput.addEventListener('input', handleCalcInput);
    for (var i = 0; i < els.quickTags.length; i++) {
      els.quickTags[i].addEventListener('click', handleQuickTag);
    }

    // 默认禁用选择按钮，直到测试开始
    setChoiceEnabled(false);
  }

  // ── 第一幕：直觉测试 ──
  function startTest() {
    els.hero.classList.add('faded');
    setTimeout(function () {
      els.hero.style.display = 'none';
      els.act1.classList.remove('rni-hidden');
      testIndex = 0;
      userChoices = [];
      setChoiceEnabled(true);
      showCurrentNumber();
    }, 450);
  }

  function showCurrentNumber() {
    var num = PRESET_NUMBERS[testIndex];
    els.numberDisplay.classList.add('swap');
    setTimeout(function () {
      els.numberDisplay.textContent = num;
      els.numberDisplay.classList.remove('swap');
    }, 160);

    var progress = Math.round(((testIndex) / PRESET_NUMBERS.length) * 100);
    els.progressFill.style.width = Math.max(10, progress) + '%';
    els.progressText.textContent = (testIndex + 1) + ' / ' + PRESET_NUMBERS.length;
    els.feedback.classList.remove('show');
    els.feedback.textContent = '';
  }

  function recordChoice(choice) {
    if (testIndex >= PRESET_NUMBERS.length) return;

    var num = PRESET_NUMBERS[testIndex];
    userChoices.push({
      num: num,
      choice: choice,
      pattern: randomEngine.classifyPattern(num)
    });

    // 即时反馈
    els.feedback.textContent = '已记录';
    els.feedback.classList.add('show');
    setChoiceEnabled(false);

    setTimeout(function () {
      testIndex++;
      if (testIndex >= PRESET_NUMBERS.length) {
        finishAct1();
      } else {
        showCurrentNumber();
        setChoiceEnabled(true);
      }
    }, 480);
  }

  function setChoiceEnabled(enabled) {
    els.btnRandom.disabled = !enabled;
    els.btnNotRandom.disabled = !enabled;
  }

  function finishAct1() {
    els.progressFill.style.width = '100%';
    els.progressText.textContent = PRESET_NUMBERS.length + ' / ' + PRESET_NUMBERS.length;
    setChoiceEnabled(false);
    els.feedback.classList.remove('show');

    // 构建结果表
    var html = '<table><thead><tr>' +
      '<th>数字</th><th>你的判断</th><th>出现概率</th>' +
      '</tr></thead><tbody>';
    var notRandomCount = 0;
    for (var i = 0; i < userChoices.length; i++) {
      var u = userChoices[i];
      var isPatterned = u.pattern !== 'none';
      var choiceTag = u.choice === 'random'
        ? '<span class="tag-yes">随机</span>'
        : '<span class="tag-no">不随机</span>';
      if (u.choice === 'notrandom') notRandomCount++;

      var numCell = '<span class="num-val">' + u.num + '</span>' +
        (isPatterned ? '<span class="pattern-mini">' + PATTERN_LABELS[u.pattern] + '</span>' : '');
      var numClass = isPatterned ? 'num patterned' : 'num';

      html += '<tr>' +
        '<td class="' + numClass + '">' + numCell + '</td>' +
        '<td>' + choiceTag + '</td>' +
        '<td class="prob">1 / 100,000</td>' +
        '</tr>';
    }
    html += '</tbody></table>';
    els.resultTable.innerHTML = html;

    // 偏差证据
    var likely = notRandomCount >= 4 ? '大概率' : '';
    els.biasEvidence.innerHTML = '你标记了 <b>' + notRandomCount + ' 个</b>数字为「看起来不随机」' +
      (likely ? '——' + likely + '集中在那些「有规律」的数上' : '') +
      '。但它们每一个的出现概率都是 <b style="color:#ffd700">1/100,000</b>，和「看起来随机」的数完全相同。这就是<b>表征性启发式</b>在起作用：大脑把「看起来有规律」等同于「不可能是随机产生的」。';

    els.act1Result.classList.add('visible');
  }

  // ── 第二幕：实时生成验证 ──
  function revealAct2() {
    els.act2.classList.remove('rni-hidden');
    var def = document.getElementById('rni-definition');
    if (def) def.classList.remove('rni-hidden');
    // 平滑滚动到第二幕
    setTimeout(function () {
      els.act2.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  function startGeneration() {
    if (generating) return;
    generating = true;
    els.genBtn.disabled = true;
    els.genAgainBtn.disabled = true;
    els.numberGrid.innerHTML = '';
    els.genFeedback.classList.remove('visible');
    els.patternBreakdown.innerHTML = '';
    els.statTotal.textContent = '0';
    els.statPattern.textContent = '0';
    els.statRatio.textContent = '0%';
    els.genStatus.textContent = '生成中…';

    var allNumbers = randomEngine.generate5DigitNumbers(1000);
    var batchSize = 50;
    var drawn = 0;
    var patternedSoFar = 0;

    function tick() {
      if (drawn >= allNumbers.length) {
        finishGeneration(allNumbers);
        return;
      }
      var frag = document.createDocumentFragment();
      var end = Math.min(drawn + batchSize, allNumbers.length);
      for (var i = drawn; i < end; i++) {
        var cell = document.createElement('div');
        cell.className = 'rni-grid-cell';
        cell.textContent = allNumbers[i];
        var p = randomEngine.classifyPattern(allNumbers[i]);
        if (p !== 'none') {
          cell.classList.add('pattern');
          cell.title = PATTERN_LABELS[p];
          patternedSoFar++;
        }
        frag.appendChild(cell);
      }
      els.numberGrid.appendChild(frag);
      drawn = end;

      els.statTotal.textContent = drawn;
      els.statPattern.textContent = patternedSoFar;
      els.statRatio.textContent = (drawn > 0 ? ((patternedSoFar / drawn) * 100).toFixed(1) : '0') + '%';

      setTimeout(tick, 100);
    }
    tick();
  }

  function finishGeneration(allNumbers) {
    generating = false;
    els.genBtn.disabled = false;
    els.genAgainBtn.disabled = false;

    var counts = randomEngine.countPatterns(allNumbers);
    var totalPatterned = counts['all-same'] + counts['sequential'] +
      counts['repeating-pattern'] + counts['palindrome'];

    els.genStatus.textContent = '生成完毕，共 ' + allNumbers.length + ' 个随机数。';

    // 模式分布明细
    var order = ['all-same', 'sequential', 'palindrome', 'repeating-pattern'];
    var chipsHtml = '';
    for (var i = 0; i < order.length; i++) {
      var key = order[i];
      var c = counts[key];
      chipsHtml += '<span class="rni-breakdown-chip' + (c === 0 ? ' empty' : '') + '">' +
        PATTERN_LABELS[key] + ' <b>' + c + '</b></span>';
    }
    els.patternBreakdown.innerHTML = chipsHtml;

    // 反馈文案
    els.genFeedback.innerHTML = '在 1000 个随机数中找到了 <b>' + totalPatterned +
      ' 个</b>「看起来有规律的」——它们真的是随机产生的，你的算法没有坏。' +
      (totalPatterned === 0 ? '这次一个都没碰到，再跑一次试试。' : '');
    els.genFeedback.classList.add('visible');

    // 第一次生成完成后，揭示第三幕入口
    if (els.act3.classList.contains('rni-hidden')) {
      els.act2Continue.style.display = 'inline-flex';
    }
  }

  // ── 第三幕：概率计算器 + 分布图 ──
  function revealAct3() {
    els.act3.classList.remove('rni-hidden');
    setTimeout(function () {
      els.act3.scrollIntoView({ behavior: 'smooth', block: 'start' });
      renderDistributionChart();
    }, 80);
  }

  function handleQuickTag(e) {
    var num = e.currentTarget.getAttribute('data-num');
    els.calcInput.value = num;
    handleCalcInput();
  }

  function handleCalcInput() {
    var val = els.calcInput.value.replace(/\D/g, '');
    if (val !== els.calcInput.value) {
      els.calcInput.value = val;
    }
    if (val.length !== 5) {
      els.calcResult.classList.remove('has-value');
      els.calcResult.classList.remove('flash');
      els.calcResult.innerHTML = val.length === 0
        ? '输入任意一个 5 位数，看它出现的概率'
        : '还需要 ' + (5 - val.length) + ' 位';
      return;
    }
    var prob = randomEngine.calculateProbability(val);
    var pattern = randomEngine.classifyPattern(val);
    var patternText = pattern === 'none' ? '没有明显规律' : '属于「' + PATTERN_LABELS[pattern] + '」';

    els.calcResult.classList.add('has-value');
    els.calcResult.innerHTML =
      '<span>' + val + ' 出现的概率是</span>' +
      '<span class="prob-value">1 / 100,000</span>' +
      '<span class="prob-same">（= ' + prob.toFixed(5) + '，' + patternText + '，概率不变）</span>';

    // 触发闪烁动画
    els.calcResult.classList.remove('flash');
    void els.calcResult.offsetWidth; // 重排以重启动画
    els.calcResult.classList.add('flash');
  }

  // ── 分布图：按「最大重复次数」分组，统计每个分组的概率 ──
  function maxRepeatCount(numStr) {
    var counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (var i = 0; i < numStr.length; i++) {
      counts[numStr.charCodeAt(i) - 48]++;
    }
    var m = 0;
    for (var j = 0; j < 10; j++) {
      if (counts[j] > m) m = counts[j];
    }
    return m;
  }

  function computeDistribution() {
    // 遍历全部 100000 个 5 位数，按最大重复次数（1~5）分组
    var dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (var n = 0; n < 100000; n++) {
      var s = n.toString();
      while (s.length < 5) s = '0' + s;
      dist[maxRepeatCount(s)]++;
    }
    return dist;
  }

  function renderDistributionChart() {
    if (distChart) return; // 只渲染一次
    window.loadChartJS().then(function () {
      var dist = computeDistribution();
      var labels = ['1次\n(全不同)', '2次', '3次', '4次', '5次\n(全相同)'];
      var data = [];
      var rawCounts = [];
      for (var k = 1; k <= 5; k++) {
        data.push(dist[k] / 100000);
        rawCounts.push(dist[k]);
      }

      var ctx = document.getElementById('rni-dist-chart').getContext('2d');
      distChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: '出现概率',
            data: data,
            backgroundColor: [
              'rgba(144, 202, 249, 0.7)',
              'rgba(129, 199, 132, 0.7)',
              'rgba(255, 215, 0, 0.7)',
              'rgba(255, 167, 38, 0.7)',
              'rgba(255, 107, 107, 0.7)'
            ],
            borderColor: [
              '#90caf9', '#81c784', '#ffd700', '#ffa726', '#ff6b6b'
            ],
            borderWidth: 1,
            borderRadius: 6,
            maxBarThickness: 80
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: function (items) { return '最大重复次数：' + items[0].label.replace('\n', ' '); },
                label: function (ctx) {
                  var idx = ctx.dataIndex;
                  var prob = ctx.parsed.y;
                  return '概率 ' + (prob * 100).toFixed(3) + '% ｜ 共 ' + rawCounts[idx] + ' 个';
                }
              }
            }
          },
          scales: {
            x: {
              title: { display: true, text: '同一数字最多出现的次数', color: 'rgba(242,228,207,0.6)', font: { size: 12 } },
              ticks: { color: 'rgba(242,228,207,0.65)', font: { size: 11 } },
              grid: { display: false }
            },
            y: {
              title: { display: true, text: '出现概率', color: 'rgba(242,228,207,0.6)', font: { size: 12 } },
              ticks: {
                color: 'rgba(242,228,207,0.65)',
                font: { size: 11 },
                callback: function (v) { return (v * 100).toFixed(1) + '%'; }
              },
              grid: { color: 'rgba(242,228,207,0.06)' },
              beginAtZero: true
            }
          }
        }
      });
    }).catch(function () {
      document.getElementById('rni-dist-chart').parentElement.innerHTML =
        '<div style="color:rgba(242,228,207,0.5);text-align:center;padding:40px 0;">图表加载失败，请检查网络后刷新。</div>';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

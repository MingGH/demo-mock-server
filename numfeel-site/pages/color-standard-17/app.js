/**
 * 17 人定义了你的屏幕颜色 - DOM 交互 / 动画 / Chart.js 渲染
 * 依赖：color-standard-17-logic.js (window.ColorStandard17)
 */
(function () {
  'use strict';

  var L = window.ColorStandard17;
  if (!L) return;

  var $ = function (id) { return document.getElementById(id); };

  // ─────────────────────────────────────────────────────────
  // 状态
  // ─────────────────────────────────────────────────────────
  var state = {
    pairIndex: 0,
    answers: [],
    pairLocked: false,
    scoreResult: null,
    currentScene: 'warm',
    grayConfirmed: false,
    grayBias: null,
    age: 30,
    chartsRendered: false,
    cmfChart: null,
    cvChart: null
  };

  // ══════════════════════════════════════════════════════════
  // 第一段：色块对测试
  // ══════════════════════════════════════════════════════════
  var pairStage = $('pairStage');
  var pairButtons = $('pairButtons');
  var pairResult = $('pairResult');
  var pairProgressBar = $('pairProgressBar');
  var pairProgressText = $('pairProgressText');
  var btnSame = $('btnSame');
  var btnDiff = $('btnDiff');

  function renderPair() {
    if (state.pairIndex >= L.COLOR_PAIRS.length) {
      finishPairs();
      return;
    }
    var p = L.COLOR_PAIRS[state.pairIndex];
    var html =
      '<div class="pair-card" id="pairCard">' +
        '<div class="pair-region">第 ' + (state.pairIndex + 1) + ' 组 · ' + p.region + '区域</div>' +
        '<div class="pair-swatches">' +
          '<div class="swatch" style="background:' + p.color1 + ';">' +
            '<span class="swatch-label">A</span>' +
          '</div>' +
          '<div class="swatch" style="background:' + p.color2 + ';">' +
            '<span class="swatch-label">B</span>' +
          '</div>' +
        '</div>' +
        '<div class="pair-flash"></div>' +
      '</div>';
    pairStage.innerHTML = html;
    updateProgress();
    state.pairLocked = false;
  }

  function updateProgress() {
    var pct = (state.pairIndex / L.COLOR_PAIRS.length) * 100;
    pairProgressBar.style.setProperty('--pct', pct + '%');
    // 直接设置 ::after 的 width 通过内联样式
    pairProgressBar.innerHTML = '<div style="height:100%;width:' + pct +
      '%;background:linear-gradient(90deg,#ffd700,#f59e0b);transition:width .35s cubic-bezier(0.22,1,0.36,1);"></div>';
    pairProgressText.textContent = state.pairIndex + ' / ' + L.COLOR_PAIRS.length;
  }

  function answerPair(userAnswer) {
    if (state.pairLocked) return;
    state.pairLocked = true;
    var p = L.COLOR_PAIRS[state.pairIndex];
    var correct = userAnswer === p.answer;
    state.answers.push(userAnswer);

    var card = $('pairCard');
    if (card) {
      card.classList.add(correct ? 'correct' : 'wrong');
    }

    // 0.35s 反馈动画后跳下一组
    setTimeout(function () {
      state.pairIndex++;
      renderPair();
    }, 600);
  }

  function finishPairs() {
    pairButtons.classList.add('hidden');
    state.scoreResult = L.calculateScore(state.answers);

    // 「标准观察者」理论分数：deltaE 1.0~1.5 的题答对率 ~50%，1.5+ 全对，0 全对
    var stdCorrect = 0;
    for (var i = 0; i < L.COLOR_PAIRS.length; i++) {
      var d = L.COLOR_PAIRS[i].deltaE;
      if (d === 0) stdCorrect += 1;
      else if (d >= 1.5) stdCorrect += 1;
      else if (d >= 1.0) stdCorrect += 0.5;
    }
    var stdPercent = Math.round((stdCorrect / L.COLOR_PAIRS.length) * 100);

    // 答题明细
    var tagsHtml = '';
    for (var j = 0; j < L.COLOR_PAIRS.length; j++) {
      var pair = L.COLOR_PAIRS[j];
      var ok = state.answers[j] === pair.answer;
      tagsHtml += '<span class="pair-result-tag ' + (ok ? 'correct' : 'wrong') + '">' +
        '#' + pair.id + ' ' + pair.region + ' ΔE' + pair.deltaE + '</span>';
    }

    pairResult.hidden = false;
    pairResult.innerHTML =
      '<div class="pair-result-grid">' +
        '<div class="pair-result-stat user">' +
          '<div class="num">' + state.scoreResult.correct + '/' + state.scoreResult.total + '</div>' +
          '<div class="lbl">你的得分 · ' + state.scoreResult.percent + '%</div>' +
        '</div>' +
        '<div class="pair-result-stat std">' +
          '<div class="num">' + stdPercent + '%</div>' +
          '<div class="lbl">「标准观察者」理论分数</div>' +
        '</div>' +
      '</div>' +
      '<div class="pair-result-comment">' + L.scoreComment(state.scoreResult) + '</div>' +
      '<div class="pair-result-detail">' + tagsHtml + '</div>';

    // 滚动到结果
    setTimeout(function () {
      pairResult.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);

    // 触发后续渲染
    tryRenderReport();
    if (state.chartsRendered) updateUserPositionOnChart();
  }

  btnSame.addEventListener('click', function () { answerPair('same'); });
  btnDiff.addEventListener('click', function () { answerPair('diff'); });

  // 键盘快捷键：← = 相同，→ = 不同
  document.addEventListener('keydown', function (e) {
    if (state.pairIndex >= L.COLOR_PAIRS.length || state.pairLocked) return;
    if (e.key === 'ArrowLeft' || e.key === 's') answerPair('same');
    else if (e.key === 'ArrowRight' || e.key === 'd') answerPair('diff');
  });

  // ══════════════════════════════════════════════════════════
  // 第二段：灰色测试
  // ══════════════════════════════════════════════════════════
  var sceneSwitcher = $('sceneSwitcher');
  var grayStage = $('grayStage');
  var grayBox = $('grayBox');
  var sceneHint = $('sceneHint');
  var hueSlider = $('hueSlider');
  var satSlider = $('satSlider');
  var hueValue = $('hueValue');
  var satValue = $('satValue');
  var ageInput = $('ageInput');
  var confirmGrayBtn = $('confirmGrayBtn');
  var grayResult = $('grayResult');

  function renderSceneSwitcher() {
    var html = '';
    for (var i = 0; i < L.GRAY_SCENES.length; i++) {
      var s = L.GRAY_SCENES[i];
      html += '<button class="scene-btn ' + (s.id === state.currentScene ? 'active' : '') +
        '" data-scene="' + s.id + '" type="button">' + s.name + '</button>';
    }
    sceneSwitcher.innerHTML = html;
    var btns = sceneSwitcher.querySelectorAll('.scene-btn');
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener('click', onSceneClick);
    }
  }

  function onSceneClick(e) {
    var sceneId = e.currentTarget.getAttribute('data-scene');
    state.currentScene = sceneId;
    var scene = L.GRAY_SCENES.filter(function (s) { return s.id === sceneId; })[0];
    grayStage.style.background = scene.background;
    sceneHint.textContent = scene.hint;
    // 切换时给方块一个回弹动画
    grayBox.classList.remove('bump');
    void grayBox.offsetWidth; // 触发 reflow
    grayBox.classList.add('bump');
    // 更新激活态
    var btns = sceneSwitcher.querySelectorAll('.scene-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-scene') === sceneId);
    }
  }

  function updateGrayBox() {
    var h = parseFloat(hueSlider.value);
    var s = parseFloat(satSlider.value);
    // 用户色相偏移：把 -30~30 映射到 HSL hue 上
    // 正偏移 -> 偏红/橙方向，负偏移 -> 偏蓝紫方向
    var hue;
    if (h >= 0) {
      hue = h; // 0-30 红橙方向
    } else {
      hue = 360 + h; // 330-360 蓝紫→红方向
    }
    grayBox.style.background = 'hsl(' + hue + ', ' + s + '%, 50%)';
    hueValue.textContent = (h >= 0 ? '+' : '') + h.toFixed(1) + '°';
    satValue.textContent = s.toFixed(1) + '%';

    // 已确认后再次拖动 -> 重置为待确认状态
    if (state.grayConfirmed) {
      state.grayConfirmed = false;
      grayResult.hidden = true;
      confirmGrayBtn.innerHTML = '<i class="ti ti-check"></i> 确认我的灰色';
    }
  }

  hueSlider.addEventListener('input', updateGrayBox);
  satSlider.addEventListener('input', updateGrayBox);

  confirmGrayBtn.addEventListener('click', function () {
    if (state.grayConfirmed) {
      // 允许重新调整
      state.grayConfirmed = false;
      grayResult.hidden = true;
      confirmGrayBtn.innerHTML = '<i class="ti ti-check"></i> 确认我的灰色';
      return;
    }
    var h = parseFloat(hueSlider.value);
    var s = parseFloat(satSlider.value);
    var age = parseInt(ageInput.value, 10) || 30;
    state.age = age;
    state.grayBias = L.calculateGrayBias(h, s);
    state.grayConfirmed = true;
    renderGrayResult();
    confirmGrayBtn.innerHTML = '<i class="ti ti-refresh"></i> 重新调整';
    tryRenderReport();
    if (state.chartsRendered) updateUserPositionOnChart();
  });

  function renderGrayResult() {
    var b = state.grayBias;
    var report = L.buildGrayReport(b, state.age);
    var userHue = parseFloat(hueSlider.value);
    var userSat = parseFloat(satSlider.value);
    var userHsl = userHue >= 0 ? userHue : 360 + userHue;

    grayResult.hidden = false;
    grayResult.innerHTML =
      '<div class="gray-result-title">揭示：你选的灰 vs 真正的灰</div>' +
      '<div class="gray-comparison">' +
        '<div class="gray-comparison-item">' +
          '<div class="swatch-mini" style="background:hsl(0,0%,50%);"></div>' +
          '<div class="lbl">真正的纯灰</div>' +
          '<div class="val">hsl(0, 0%, 50%)</div>' +
        '</div>' +
        '<div class="gray-comparison-item">' +
          '<div class="swatch-mini" style="background:hsl(' + userHsl + ', ' + userSat + '%, 50%);"></div>' +
          '<div class="lbl">你选的灰</div>' +
          '<div class="val">hsl(' + userHsl.toFixed(1) + ', ' + userSat.toFixed(1) + '%, 50%)</div>' +
        '</div>' +
      '</div>' +
      '<div class="gray-bias-text">偏差幅度：<strong>' + b.magnitude.toFixed(2) + '°</strong>' +
        '（色相 ' + (b.hueBias >= 0 ? '+' : '') + b.hueBias.toFixed(1) + '°，' +
        '饱和度 ' + b.satBias.toFixed(1) + '%）</div>' +
      '<div class="gray-explanation">' + b.explanation + '<br><br>' +
        '<strong style="color:#90caf9;">年龄因子：</strong>' + report.ageEffect + '</div>';

    setTimeout(function () {
      grayResult.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
  }

  // ══════════════════════════════════════════════════════════
  // 第三段：数据可视化
  // ══════════════════════════════════════════════════════════
  function renderTimeline() {
    var html = '';
    for (var i = 0; i < L.TIMELINE.length; i++) {
      var t = L.TIMELINE[i];
      html +=
        '<div class="timeline-item">' +
          '<div class="timeline-year">' + t.year + '</div>' +
          '<div class="timeline-event">' + t.event + '</div>' +
        '</div>';
    }
    $('timeline').innerHTML = html;
  }

  function renderCharts() {
    if (state.chartsRendered) return;
    state.chartsRendered = true;
    window.loadChartJS().then(function () {
      renderCMFChart();
      renderCVChart();
      updateUserPositionOnChart();
    });
  }

  function renderCMFChart() {
    var ctx = $('cmfChart').getContext('2d');
    var labels = L.CIE1931_CMF.map(function (d) { return d.wavelength; });
    var rData = L.CIE1931_CMF.map(function (d) { return d.r; });
    var gData = L.CIE1931_CMF.map(function (d) { return d.g; });
    var bData = L.CIE1931_CMF.map(function (d) { return d.b; });

    state.cmfChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'x̄ (红敏感)',
            data: rData,
            borderColor: '#ff6b6b',
            backgroundColor: 'rgba(255,107,107,0.15)',
            borderWidth: 2,
            tension: 0.35,
            pointRadius: 2,
            pointHoverRadius: 5,
            fill: false
          },
          {
            label: 'ȳ (绿敏感/亮度)',
            data: gData,
            borderColor: '#81c784',
            backgroundColor: 'rgba(129,199,132,0.15)',
            borderWidth: 2,
            tension: 0.35,
            pointRadius: 2,
            pointHoverRadius: 5,
            fill: false
          },
          {
            label: 'z̄ (蓝敏感)',
            data: bData,
            borderColor: '#90caf9',
            backgroundColor: 'rgba(144,202,249,0.15)',
            borderWidth: 2,
            tension: 0.35,
            pointRadius: 2,
            pointHoverRadius: 5,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            labels: { color: '#b8b8b8', font: { size: 11 } }
          },
          tooltip: {
            backgroundColor: 'rgba(26,26,46,0.95)',
            borderColor: 'rgba(255,215,0,0.3)',
            borderWidth: 1,
            callbacks: {
              title: function (items) { return items[0].label + ' nm'; },
              label: function (item) {
                return item.dataset.label + ': ' + item.parsed.y.toFixed(4);
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: '波长 (nm)', color: '#888' },
            ticks: { color: '#888', font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.06)' }
          },
          y: {
            title: { display: true, text: '匹配系数', color: '#888' },
            ticks: { color: '#888', font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.06)' },
            beginAtZero: true
          }
        }
      }
    });
  }

  function renderCVChart() {
    var ctx = $('cvChart').getContext('2d');
    var labels = L.OBSERVER_VARIABILITY.map(function (d) { return d.wavelength; });
    var cvData = L.OBSERVER_VARIABILITY.map(function (d) { return d.cv_percent; });
    // 颜色按波长着色：短波蓝、中波绿、长波红
    var bgColors = L.OBSERVER_VARIABILITY.map(function (d) {
      if (d.wavelength <= 470) return 'rgba(144,202,249,0.7)';
      if (d.wavelength <= 550) return 'rgba(129,199,132,0.7)';
      if (d.wavelength <= 590) return 'rgba(255,215,0,0.7)';
      return 'rgba(255,107,107,0.7)';
    });

    state.cvChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: '变异系数 CV%',
          data: cvData,
          backgroundColor: bgColors,
          borderColor: bgColors.map(function (c) { return c.replace('0.7', '1'); }),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(26,26,46,0.95)',
            borderColor: 'rgba(255,215,0,0.3)',
            borderWidth: 1,
            callbacks: {
              title: function (items) { return items[0].label + ' nm'; },
              label: function (item) { return 'CV: ' + item.parsed.y + '%'; }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: '波长 (nm)', color: '#888' },
            ticks: { color: '#888', font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.06)' }
          },
          y: {
            title: { display: true, text: '变异系数 (%)', color: '#888' },
            ticks: { color: '#888', font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.06)' },
            beginAtZero: true,
            max: 45
          }
        }
      }
    });
  }

  function updateUserPositionOnChart() {
    if (!state.cvChart) return;
    // 移除旧的「你在这里」标记
    state.cvChart.data.datasets = state.cvChart.data.datasets.filter(function (ds) {
      return ds.label !== '你的位置';
    });
    if (state.scoreResult) {
      var userCV = L.mapScoreToCV(state.scoreResult.percent);
      // 在 560nm（CV 最低点）位置标注用户
      state.cvChart.data.datasets.push({
        label: '你的位置',
        type: 'scatter',
        data: [{ x: 560, y: userCV }],
        backgroundColor: '#ffd700',
        borderColor: '#ffd700',
        pointRadius: 8,
        pointHoverRadius: 10,
        pointStyle: 'star',
        showLine: false
      });
      // 显示用户位置说明
      var userLine = $('userCVLine');
      if (userLine) {
        userLine.hidden = false;
        userLine.innerHTML = '你的位置已用<strong style="color:#ffd700;">金色星标</strong>标出：' +
          '等价离散度约 <strong style="color:#ffd700;">' + userCV.toFixed(1) + '%</strong>' +
          (userCV <= 5 ? '（比 17 人的平均还稳定！）' :
           userCV <= 15 ? '（与 17 人平均水平相当）' :
           '（比 17 人平均水平离散度更高）');
      }
      state.cvChart.update();
    }
  }

  // ══════════════════════════════════════════════════════════
  // 数字 countUp 动画
  // ══════════════════════════════════════════════════════════
  function countUp(el, target, duration) {
    duration = duration || 600;
    var suffix = el.getAttribute('data-suffix') || '';
    var start = 0;
    var startTime = null;
    function step(ts) {
      if (!startTime) startTime = ts;
      var progress = Math.min((ts - startTime) / duration, 1);
      // easeOutCubic
      var eased = 1 - Math.pow(1 - progress, 3);
      var val = Math.round(start + (target - start) * eased);
      el.innerHTML = val + (suffix ? '<span class="suffix">' + suffix + '</span>' : '');
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function triggerCountUp() {
    var nums = document.querySelectorAll('.stat-num');
    for (var i = 0; i < nums.length; i++) {
      var el = nums[i];
      if (el.dataset.counted === '1') continue;
      el.dataset.counted = '1';
      var target = parseInt(el.getAttribute('data-target'), 10);
      countUp(el, target, 700);
    }
  }

  // ══════════════════════════════════════════════════════════
  // 最终报告卡片
  // ══════════════════════════════════════════════════════════
  function tryRenderReport() {
    if (!state.scoreResult || !state.grayBias) return;
    var reportCard = $('reportCard');
    var reportBody = $('reportBody');
    var b = state.grayBias;
    var grayReport = L.buildGrayReport(b, state.age);

    // 估算用户在 17 人中的位置（基于得分百分比）
    var position;
    if (state.scoreResult.percent >= 88) {
      position = '比 17 人中的大多数都稳定--你的色觉离散度低于 1931 年的「平均眼」';
    } else if (state.scoreResult.percent >= 63) {
      position = '处在 17 人的平均水平--你的色觉跟「标准观察者」差异不大';
    } else if (state.scoreResult.percent >= 38) {
      position = '比 17 人中的多数更离散，尤其对蓝紫色（420-460nm）区域可能更不敏感';
    } else {
      position = '色觉离散度高于 17 人的平均水平。考虑检查屏幕色准，或你只是不擅长分辨细微色差';
    }

    reportBody.innerHTML =
      '<div class="report-row">' +
        '<span class="lbl">辨色得分</span>' +
        '<span class="val">' + state.scoreResult.correct + '/' + state.scoreResult.total +
          ' · ' + state.scoreResult.percent + '%</span>' +
      '</div>' +
      '<div class="report-row">' +
        '<span class="lbl">灰色偏差幅度</span>' +
        '<span class="val">' + b.magnitude.toFixed(2) + '°</span>' +
      '</div>' +
      '<div class="report-row">' +
        '<span class="lbl">灰色偏差方向</span>' +
        '<span class="val">' + directionLabel(b.direction) + '</span>' +
      '</div>' +
      '<div class="report-row">' +
        '<span class="lbl">年龄 ' + state.age + ' 岁晶状体黄化</span>' +
        '<span class="val">' + grayReport.yellowing.toFixed(1) + '%</span>' +
      '</div>' +
      '<div class="report-position">' +
        '<strong>你在 17 人中的位置：</strong>' + position + '<br><br>' +
        '<strong>总结：</strong>' + grayReport.summary + '。' +
        '别忘了，那 17 人全是 1928 年的英国年轻白人男性--代表不了你，也代表不了 80 亿人。' +
      '</div>';
    reportCard.hidden = false;
  }

  function directionLabel(dir) {
    var map = {
      'pure': '无偏移（纯灰）',
      'warm': '暖色（偏红橙）',
      'warm-red': '暖色（明显偏红）',
      'cool': '冷色（偏蓝青）',
      'cool-blue': '冷色（明显偏蓝）',
      'saturated': '饱和但无方向'
    };
    return map[dir] || dir;
  }

  // ══════════════════════════════════════════════════════════
  // 分享文案
  // ══════════════════════════════════════════════════════════
  var copyShareBtn = $('copyShareBtn');
  copyShareBtn.addEventListener('click', function () {
    if (!state.scoreResult || !state.grayBias) return;
    var text = L.generateShareText(
      state.scoreResult.correct,
      state.scoreResult.total,
      state.grayBias.magnitude
    );
    copyToClipboard(text);
    showToast('分享文案已复制');
  });

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () {
        fallbackCopy(text);
      });
      return;
    }
    fallbackCopy(text);
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  function showToast(msg) {
    var toast = $('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(function () { toast.classList.remove('show'); }, 1800);
  }

  // ══════════════════════════════════════════════════════════
  // 滚动触发：countUp + 图表懒加载
  // ══════════════════════════════════════════════════════════
  function setupScrollTrigger() {
    var section3 = $('section3');
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          triggerCountUp();
          renderCharts();
          io.disconnect();
          break;
        }
      }
    }, { threshold: 0.15 });
    if (section3) io.observe(section3);

    // 兜底：3 秒后若未触发也加载
    setTimeout(function () {
      if (!state.chartsRendered) {
        triggerCountUp();
        renderCharts();
      }
    }, 3000);
  }

  // ══════════════════════════════════════════════════════════
  // 初始化
  // ══════════════════════════════════════════════════════════
  function init() {
    // 动态计算沿用年数
    var yearsEl = $('statYears');
    if (yearsEl) yearsEl.setAttribute('data-target', String(new Date().getFullYear() - 1931));

    renderPair();
    renderSceneSwitcher();
    onSceneClick({ currentTarget: sceneSwitcher.querySelector('[data-scene="warm"]') });
    updateGrayBox();
    renderTimeline();
    setupScrollTrigger();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

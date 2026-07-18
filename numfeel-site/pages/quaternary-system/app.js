/**
 * 四进制去哪了 - 交互控制
 * 依赖：quaternary-system-logic.js（算法）、GSAP（动画）、Chart.js（按需加载）
 *
 * UI 状态机：idle -> act1 -> act2 -> act3 -> act4
 * 算法调用全部委托给 QuaternaryLogic，本文件只管 DOM、动画和交互。
 */
(function () {
  'use strict';

  var L = window.QuaternaryLogic;
  if (!L) throw new Error('QuaternaryLogic failed to load');

  var SHARE_URL = 'https://numfeel.996.ninja/pages/quaternary-system/';
  var BASE_LABELS = { 2: '二进制', 4: '四进制', 8: '八进制', 16: '十六进制' };
  var BASE_COLORS = { 2: '#ffd700', 4: '#90caf9', 8: '#81c784', 16: '#ce93d8' };
  var BASE_SIZES = { 2: 2, 4: 4, 8: 8, 16: 16 }; // 字母表大小

  var state = {
    phase: 'idle',
    value: null,
    representations: null,
    binaryString: '',
    quaternaryGroups: null,
    mergeIndex: 0,
    quaternaryDone: false,
    octalDone: false,
    hexDone: false,
    chart: null,
    currentBitWidth: 32
  };

  function $(id) { return document.getElementById(id); }
  function show(el) { if (el) el.classList.remove('hidden'); }
  function hide(el) { if (el) el.classList.add('hidden'); }
  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // ── 初始化 ──────────────────────────────────────────────
  function init() {
    var presetRow = $('presetRow');
    presetRow.addEventListener('click', function (e) {
      var card = e.target.closest('.preset-card');
      if (!card) return;
      presetRow.querySelectorAll('.preset-card').forEach(function (c) { c.classList.remove('active'); });
      card.classList.add('active');
      $('decimalInput').value = card.dataset.value;
    });

    $('startBtn').addEventListener('click', startDemo);
    $('decimalInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); startDemo(); }
    });

    $('toAct2Btn').addEventListener('click', enterAct2);
    $('resetBtn1').addEventListener('click', resetToHero);
    $('mergeNextBtn').addEventListener('click', mergeNextGroup);
    $('quickFinishBtn').addEventListener('click', quickFinishQuaternary);
    $('modeOctalBtn').addEventListener('click', function () { showMode('octal'); });
    $('modeHexBtn').addEventListener('click', function () { showMode('hex'); });
    $('toAct4Btn').addEventListener('click', enterAct4);
    $('copyBtn').addEventListener('click', copyShareText);
    $('resetBtn2').addEventListener('click', resetToHero);

    var bwRow = document.querySelector('.bitwidth-row');
    bwRow.addEventListener('click', function (e) {
      var btn = e.target.closest('.bw-btn');
      if (!btn) return;
      bwRow.querySelectorAll('.bw-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      state.currentBitWidth = parseInt(btn.dataset.bw, 10);
      drawChart();
    });

    $('decimalInput').value = '2026';
  }

  // ── 启动 Demo ───────────────────────────────────────────
  function startDemo() {
    var raw = $('decimalInput').value;
    var value;
    if (raw && raw.trim() !== '') {
      var result = L.parseDecimalInput(raw);
      if (!result.ok) {
        $('inputError').textContent = result.error;
        return;
      }
      value = result.value;
    } else {
      // 没输入就用默认 2026
      var preset = $('presetRow').querySelector('.preset-card.active');
      value = BigInt(preset ? preset.dataset.value : '2026');
    }
    $('inputError').textContent = '';

    state.value = value;
    state.representations = L.buildRepresentations(value);
    state.binaryString = state.representations.binary.value;
    state.quaternaryGroups = L.groupBinary(state.binaryString, 2);
    state.mergeIndex = state.quaternaryGroups.groups.length - 1;
    state.quaternaryDone = false;
    state.octalDone = false;
    state.hexDone = false;

    enterAct1();
  }

  // ── 第一幕：数字展开 ────────────────────────────────────
  function enterAct1() {
    state.phase = 'act1';
    hide($('heroSection'));
    hide($('act2Section'));
    hide($('act3Section'));
    hide($('act4Section'));
    show($('act1Section'));

    $('decimalValue').textContent = state.value.toString();
    var bitRow = $('bitRow');
    bitRow.innerHTML = '';

    var bits = state.binaryString.split('');
    bits.forEach(function (bit, i) {
      var block = document.createElement('div');
      block.className = 'bit-block bit-' + bit;
      block.textContent = bit;
      block.setAttribute('aria-label', '第 ' + (bits.length - i) + ' 位：' + bit);
      bitRow.appendChild(block);
    });

    // GSAP stagger 动画
    if (reducedMotion()) {
      gsap.set(bitRow.children, { opacity: 1, scale: 1 });
    } else {
      gsap.fromTo(bitRow.children,
        { opacity: 0, scale: 0.3, y: -20 },
        { opacity: 1, scale: 1, y: 0, duration: 0.35, stagger: 0.06, ease: 'back.out(1.7)' }
      );
    }

    $('bitFact').textContent = '共 ' + bits.length + ' 个二进制位，每个数字携带 1 bit 信息';
    $('act1Section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── 第二幕：亲手合并成四进制 ────────────────────────────
  function enterAct2() {
    state.phase = 'act2';
    hide($('act1Section'));
    show($('act2Section'));

    renderQuaternaryGroups();
    $('quaternaryFinal').classList.add('hidden');
    state.mergeIndex = state.quaternaryGroups.groups.length - 1;
    state.quaternaryDone = false;
    $('mergeNextBtn').disabled = false;
    $('act2Section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderQuaternaryGroups() {
    var g = state.quaternaryGroups;
    var bitRow = $('quaternaryBitRow');
    var resultRow = $('quaternaryResultRow');
    bitRow.innerHTML = '';
    resultRow.innerHTML = '';

    // 显示补零提示
    if (g.paddingAdded > 0) {
      $('paddingHint').textContent = '已补 ' + g.paddingAdded + ' 个前导零（红色），不改变数值，只让分组整齐';
    } else {
      $('paddingHint').textContent = '';
    }

    g.groups.forEach(function (group, idx) {
      var frame = document.createElement('div');
      frame.className = 'group-frame';
      frame.dataset.index = idx;
      // 标记包含补零的组（第一组可能有补零）
      if (g.paddingAdded > 0 && idx === 0) {
        frame.classList.add('padded');
      }
      group.split('').forEach(function (bit, bi) {
        var block = document.createElement('div');
        block.className = 'bit-block bit-' + bit;
        block.textContent = bit;
        // 如果是补零组的前几位
        if (g.paddingAdded > 0 && idx === 0 && bi < g.paddingAdded) {
          block.classList.add('padded-zero');
        }
        frame.appendChild(block);
      });
      bitRow.appendChild(frame);

      // 结果位（初始为空占位）
      var digitDiv = document.createElement('div');
      digitDiv.className = 'group-digit';
      digitDiv.dataset.index = idx;
      var pair = document.createElement('div');
      pair.className = 'gd-pair';
      pair.textContent = group + '->?';
      var val = document.createElement('div');
      val.className = 'gd-val';
      val.style.visibility = 'hidden';
      val.textContent = '?';
      digitDiv.appendChild(pair);
      digitDiv.appendChild(val);
      resultRow.appendChild(digitDiv);
    });
  }

  function mergeNextGroup() {
    if (state.mergeIndex < 0) return;
    var g = state.quaternaryGroups;
    var idx = state.mergeIndex;
    var group = g.groups[idx];
    var digit = L.binaryGroupsToDigits([group], 2)[0].digit;

    var frames = $('quaternaryBitRow').children;
    var digits = $('quaternaryResultRow').children;
    var frame = frames[idx];
    var digitDiv = digits[idx];

    // 高亮当前组
    frame.classList.add('highlighted');

    var revealDigit = function () {
      digitDiv.querySelector('.gd-pair').textContent = group + '->' + digit;
      var valEl = digitDiv.querySelector('.gd-val');
      valEl.textContent = digit;
      valEl.style.visibility = 'visible';

      if (reducedMotion()) {
        frame.classList.remove('highlighted');
        frame.classList.add('merged');
      } else {
        // 缩放发光反馈
        gsap.fromTo(valEl,
          { scale: 0.3, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(2)' }
        );
        gsap.to(frame, {
          boxShadow: '0 0 24px rgba(129,199,132,.4)',
          duration: 0.3,
          onComplete: function () {
            frame.classList.remove('highlighted');
            frame.classList.add('merged');
          }
        });
      }
    };

    if (reducedMotion()) {
      revealDigit();
    } else {
      // 方块靠拢动画
      gsap.to(frame.children, {
        x: function (i) { return i === 0 ? 3 : -3; },
        duration: 0.2,
        yoyo: true,
        repeat: 1,
        onComplete: revealDigit
      });
    }

    state.mergeIndex--;
    if (state.mergeIndex < 0) {
      // 全部完成
      $('mergeNextBtn').disabled = true;
      finishQuaternary();
    }
  }

  function quickFinishQuaternary() {
    var g = state.quaternaryGroups;
    var frames = $('quaternaryBitRow').children;
    var digits = $('quaternaryResultRow').children;

    g.groups.forEach(function (group, idx) {
      var digit = L.binaryGroupsToDigits([group], 2)[0].digit;
      var frame = frames[idx];
      var digitDiv = digits[idx];
      frame.classList.add('merged');
      frame.classList.remove('highlighted');
      digitDiv.querySelector('.gd-pair').textContent = group + '->' + digit;
      var valEl = digitDiv.querySelector('.gd-val');
      valEl.textContent = digit;
      valEl.style.visibility = 'visible';
    });

    state.mergeIndex = -1;
    $('mergeNextBtn').disabled = true;
    finishQuaternary();
  }

  function finishQuaternary() {
    state.quaternaryDone = true;
    var finalEl = $('quaternaryFinal');
    show(finalEl);
    $('quaternaryValue').textContent = state.representations.quaternary.value;

    // 解锁第三幕
    show($('act3Section'));
    if (!reducedMotion()) {
      gsap.fromTo(finalEl, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4 });
    }
  }

  // ── 第三幕：换一种分组 ──────────────────────────────────
  function showMode(mode) {
    if (mode === 'octal') {
      state.octalDone = true;
      $('modeOctalBtn').classList.add('done');
      show($('octalDetail'));
      renderModeGroups('octal', 3, $('octalBitRow'), $('octalResultRow'), $('octalValue'));
    } else {
      state.hexDone = true;
      $('modeHexBtn').classList.add('done');
      show($('hexDetail'));
      renderModeGroups('hex', 4, $('hexBitRow'), $('hexResultRow'), $('hexValue'));
    }
    checkComparison();
  }

  function renderModeGroups(mode, groupSize, bitRow, resultRow, valueEl) {
    var g = L.groupBinary(state.binaryString, groupSize);
    var rep = mode === 'octal' ? state.representations.octal : state.representations.hexadecimal;
    bitRow.innerHTML = '';
    resultRow.innerHTML = '';

    g.groups.forEach(function (group, idx) {
      var frame = document.createElement('div');
      frame.className = 'group-frame';
      if (g.paddingAdded > 0 && idx === 0) frame.classList.add('padded');
      group.split('').forEach(function (bit, bi) {
        var block = document.createElement('div');
        block.className = 'bit-block bit-' + bit;
        block.textContent = bit;
        if (g.paddingAdded > 0 && idx === 0 && bi < g.paddingAdded) {
          block.classList.add('padded-zero');
        }
        frame.appendChild(block);
      });
      bitRow.appendChild(frame);

      var digit = L.binaryGroupsToDigits([group], groupSize)[0].digit;
      var digitDiv = document.createElement('div');
      digitDiv.className = 'group-digit';
      var pair = document.createElement('div');
      pair.className = 'gd-pair';
      pair.textContent = group + '->' + digit;
      var val = document.createElement('div');
      val.className = 'gd-val';
      val.textContent = digit;
      digitDiv.appendChild(pair);
      digitDiv.appendChild(val);
      resultRow.appendChild(digitDiv);
    });

    valueEl.textContent = rep.value;

    if (!reducedMotion()) {
      gsap.fromTo(bitRow.children,
        { opacity: 0, scale: 0.5 },
        { opacity: 1, scale: 1, duration: 0.3, stagger: 0.08, ease: 'back.out(1.5)' }
      );
    }
  }

  function checkComparison() {
    if (state.octalDone && state.hexDone) {
      show($('comparisonGrid'));
      renderComparison();
      hide($('modeProgressHint'));
      // 两个模式都完成，自动滚到对比区域
      setTimeout(function () {
        $('comparisonGrid').scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (!reducedMotion()) {
          gsap.fromTo($('comparisonGrid'),
            { opacity: 0, y: 20 },
            { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }
          );
        }
      }, 400);
    } else {
      // 只完成了一个模式，给另一个按钮加脉动提示
      nudgeRemainingMode();
    }
  }

  function nudgeRemainingMode() {
    var target = !state.octalDone ? $('modeOctalBtn') : $('modeHexBtn');
    if (!target || target.classList.contains('nudge')) return;
    target.classList.add('nudge');
    if (!reducedMotion()) {
      gsap.fromTo(target,
        { boxShadow: '0 0 0 0 rgba(206,147,216,.6)' },
        { boxShadow: '0 0 0 12px rgba(206,147,216,0)', duration: 1, repeat: 2, ease: 'power1.out',
          onComplete: function () { target.classList.remove('nudge'); }
        }
      );
    }
  }

  function renderComparison() {
    var grid = $('compGrid');
    grid.innerHTML = '';
    var bases = [
      { base: 2, rep: state.representations.binary, sub: '₂' },
      { base: 4, rep: state.representations.quaternary, sub: '₄' },
      { base: 8, rep: state.representations.octal, sub: '₈' },
      { base: 16, rep: state.representations.hexadecimal, sub: '₁₆' }
    ];
    bases.forEach(function (item) {
      var div = document.createElement('div');
      div.className = 'comp-item';
      div.innerHTML =
        '<span class="ci-label">' + BASE_LABELS[item.base] + '</span>' +
        '<span class="ci-value">' + item.rep.value + '</span>' +
        '<span class="ci-length">' + item.rep.length + ' 位 · 字母表 ' + item.base + '</span>';
      grid.appendChild(div);
    });
  }

  // ── 第四幕：长度赛跑 ────────────────────────────────────
  function enterAct4() {
    state.phase = 'act4';
    hide($('act3Section'));
    show($('act4Section'));
    drawChart();
    $('act4Section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function drawChart() {
    var bw = state.currentBitWidth;
    var bases = [2, 4, 8, 16];
    var data = bases.map(function (b) { return L.digitsForBitWidth(bw, b); });
    var labels = bases.map(function (b) { return BASE_LABELS[b]; });
    var colors = bases.map(function (b) { return BASE_COLORS[b]; });

    var summary = $('chartSummary');
    var summaryHtml = '';
    bases.forEach(function (b, i) {
      summaryHtml +=
        '<div class="cs-row">' +
        '<span class="cs-base">' + BASE_LABELS[b] +
        ' <span class="cs-alpha">字母表 ' + BASE_SIZES[b] + '</span></span>' +
        '<span class="cs-digits">' + data[i] + ' 位</span>' +
        '</div>';
    });
    summaryHtml += '<div class="cs-note">每位数字承载 ' + (Math.log2(bases[0])) + ' bit（二进制）到 ' + Math.log2(16) + ' bit（十六进制）。字母表越大，所需位数越少，但单个数字的可读性也越低。</div>';
    summary.innerHTML = summaryHtml;

    function doDraw() {
      if (state.chart) state.chart.destroy();
      var ctx = $('lengthChart').getContext('2d');
      state.chart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: '所需位数',
            data: data,
            backgroundColor: colors.map(function (c) { return c + 'AA'; }),
            borderColor: colors,
            borderWidth: 1.5,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: { display: true, text: bw + ' bit 宽度下各进制所需位数', color: '#cfcfcf', font: { size: 14 } },
            tooltip: {
              callbacks: {
                label: function (ctx) { return '需要 ' + ctx.parsed.y + ' 个数字'; }
              }
            }
          },
          scales: {
            x: { ticks: { color: '#aaa' }, grid: { display: false } },
            y: { beginAtZero: true, ticks: { color: '#888', precision: 0 }, grid: { color: 'rgba(255,255,255,.06)' } }
          }
        }
      });
    }

    if (window.Chart) {
      doDraw();
    } else if (window.loadChartJS) {
      window.loadChartJS().then(doDraw);
    } else {
      // 兜底：直接加载 CDN
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
      script.onload = doDraw;
      document.head.appendChild(script);
    }
  }

  // ── 复制 ────────────────────────────────────────────────
  function copyShareText() {
    var text = L.buildShareText(state.value, state.representations, SHARE_URL);
    var feedback = $('copyFeedback');

    function onSuccess() {
      feedback.textContent = '已复制到剪贴板';
      feedback.style.color = '#81c784';
      setTimeout(function () { feedback.textContent = ''; }, 2500);
    }

    function onFail() {
      feedback.textContent = '复制失败，请手动选中下方文本复制';
      feedback.style.color = '#ff6b6b';
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onSuccess, function () { fallbackCopy(text, onSuccess, onFail); });
    } else {
      fallbackCopy(text, onSuccess, onFail);
    }
  }

  function fallbackCopy(text, onSuccess, onFail) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      document.body.removeChild(textarea);
      onSuccess();
    } catch (e) {
      document.body.removeChild(textarea);
      onFail();
    }
  }

  // ── 重置 ────────────────────────────────────────────────
  function resetToHero() {
    state.phase = 'idle';
    state.value = null;
    state.representations = null;
    state.quaternaryDone = false;
    state.octalDone = false;
    state.hexDone = false;
    if (state.chart) { state.chart.destroy(); state.chart = null; }
    $('modeOctalBtn').classList.remove('done');
    $('modeHexBtn').classList.remove('done');
    hide($('act1Section'));
    hide($('act2Section'));
    hide($('act3Section'));
    hide($('act4Section'));
    hide($('octalDetail'));
    hide($('hexDetail'));
    hide($('comparisonGrid'));
    show($('heroSection'));
    $('decimalInput').focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── 启动 ────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

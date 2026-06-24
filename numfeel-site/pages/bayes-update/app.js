/**
 * 贝叶斯改主意计算器 — DOM 交互
 */
(function () {
  'use strict';

  var L = window.BayesUpdate;

  var $ = function (id) { return document.getElementById(id); };

  // ── 元素引用 ──
  var subjectInput = $('subjectInput');
  var evidenceInput = $('evidenceInput');
  var priorSlider = $('priorSlider');
  var likelihoodSlider = $('likelihoodSlider');
  var falseRateSlider = $('falseRateSlider');
  var guessSlider = $('guessSlider');
  var priorValue = $('priorValue');
  var likelihoodValue = $('likelihoodValue');
  var falseRateValue = $('falseRateValue');
  var guessValue = $('guessValue');

  var presetsBox = $('presets');
  var computeBtn = $('computeBtn');
  var resetBtn = $('resetBtn');
  var copyBtn = $('copyBtn');
  var shareBtn = $('shareBtn');
  var resultCard = $('resultCard');

  // ── 渲染预设场景卡片 ──
  function renderPresets() {
    var html = '';
    for (var i = 0; i < L.PRESETS.length; i++) {
      var p = L.PRESETS[i];
      html += '<div class="preset" data-idx="' + i + '">' +
        '<div class="preset-title"><i class="ti ' + p.icon + '"></i>' + p.title + '</div>' +
        '<div class="preset-twist">' + p.twist + '</div>' +
        '</div>';
    }
    presetsBox.innerHTML = html;
    var cards = presetsBox.querySelectorAll('.preset');
    for (var j = 0; j < cards.length; j++) {
      cards[j].addEventListener('click', onPresetClick);
    }
  }

  function onPresetClick(e) {
    var idx = parseInt(e.currentTarget.getAttribute('data-idx'), 10);
    var p = L.PRESETS[idx];
    subjectInput.value = p.subject;
    evidenceInput.value = p.evidence;
    setSlider(priorSlider, p.prior * 100);
    setSlider(likelihoodSlider, p.likelihood * 100);
    setSlider(falseRateSlider, p.falseRate * 100);
    setSlider(guessSlider, 50);
    syncAllValues();
    // 滚动到填表区底部以便用户看到"算一下"按钮
    computeBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function setSlider(slider, v) {
    slider.value = v;
  }

  // ── 同步滑块旁边的数字 ──
  function syncAllValues() {
    priorValue.textContent = formatSliderPct(priorSlider.value);
    likelihoodValue.textContent = formatSliderPct(likelihoodSlider.value);
    falseRateValue.textContent = formatSliderPct(falseRateSlider.value);
    guessValue.textContent = formatSliderPct(guessSlider.value);
  }

  function formatSliderPct(v) {
    var n = parseFloat(v);
    // < 1 时多显示一位小数，方便用 0.1% 这种罕见病先验
    if (n < 1 && n > 0) return n.toFixed(2) + '%';
    return n.toFixed(1).replace(/\.0$/, '') + '%';
  }

  [priorSlider, likelihoodSlider, falseRateSlider, guessSlider].forEach(function (s) {
    s.addEventListener('input', syncAllValues);
  });

  // ── 计算并渲染结果 ──
  function compute() {
    var prior = parseFloat(priorSlider.value) / 100;
    var likelihood = parseFloat(likelihoodSlider.value) / 100;
    var falseRate = parseFloat(falseRateSlider.value) / 100;
    var guess = parseFloat(guessSlider.value);

    var post = L.posterior(prior, likelihood, falseRate);
    var postPct = post * 100;
    var priorPct = prior * 100;

    var sandbox = L.buildSandbox(prior, likelihood, falseRate);
    var rating = L.rateGuess(postPct, guess);

    renderResult({
      subject: subjectInput.value.trim() || '这件事',
      evidence: evidenceInput.value.trim() || '这条新线索',
      priorPct: priorPct,
      guess: guess,
      postPct: postPct,
      sandbox: sandbox,
      rating: rating
    });
  }

  function renderResult(d) {
    $('subjectRecap').innerHTML =
      '你想搞清楚：<b class="hl-post">' + escapeHtml(d.subject) + '</b><br>' +
      '观察到的线索：<b class="hl-evidence">' + escapeHtml(d.evidence) + '</b>';

    // 三段进度条
    setBar('barPrior', d.priorPct, 'barPriorValue');
    setBar('barGuess', d.guess, 'barGuessValue');
    setBar('barPost', d.postPct, 'barPostValue');

    // 直觉评级
    var verdict = $('verdict');
    verdict.className = 'verdict ' + d.rating.level;
    var arrow;
    if (d.guess > d.postPct + 3) arrow = '你高估了';
    else if (d.guess < d.postPct - 3) arrow = '你低估了';
    else arrow = '你的直觉差不多';
    verdict.innerHTML =
      '<i class="ti ti-bulb"></i> ' + d.rating.label + ' · ' +
      '<b>' + arrow + '</b>，差 ' + d.rating.gap.toFixed(1) + ' 个百分点。';

    // 100 万人沙盘
    renderSandbox(d.sandbox, d.evidence);

    // 一句话结论
    var direction = d.postPct > d.priorPct ? '升到' : '降到';
    var diff = Math.abs(d.postPct - d.priorPct).toFixed(1);
    $('punchline').innerHTML =
      '看到「<b>' + escapeHtml(d.evidence) + '</b>」之后，「<b>' + escapeHtml(d.subject) + '</b>」是真的概率，' +
      '应该从 <b class="hl-prior">' + d.priorPct.toFixed(1) + '%</b> ' +
      direction + ' <b class="hl-post">' + d.postPct.toFixed(1) + '%</b>' +
      '（变化 ' + diff + ' 个百分点）。' +
      (d.rating.level === 'way-off' || d.rating.level === 'off'
        ? '<br>你刚才直觉猜了 <b class="hl-guess">' + d.guess.toFixed(0) + '%</b>，' + d.rating.label + '。'
        : '');

    resultCard.classList.add('active');
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setBar(barId, pct, valueId) {
    var bar = $(barId);
    // 极小值给个视觉最小宽度，方便看到
    var visible = pct < 0.5 && pct > 0 ? 0.5 : pct;
    bar.style.width = visible + '%';
    var v = $(valueId);
    if (pct < 1 && pct > 0) v.textContent = pct.toFixed(2) + '%';
    else v.textContent = pct.toFixed(1).replace(/\.0$/, '') + '%';
  }

  function renderSandbox(s, evidence) {
    var html =
      '假设有 <b>' + L.formatCount(s.total) + '</b> 件这样的事。<br>' +
      '按你的先验，<span class="sb-true">真有问题的</span>有 <b>' + L.formatCount(s.trueCount) + '</b> 件，' +
      '<span class="sb-false">其实没事的</span>有 <b>' + L.formatCount(s.falseCount) + '</b> 件。<br>' +
      '<span class="sb-true">真有问题</span>里，出现「' + escapeHtml(evidence) + '」的有 <b>' + L.formatCount(s.truePositive) + '</b> 件。<br>' +
      '<span class="sb-false">其实没事</span>里，凑巧也出现的有 <b>' + L.formatCount(s.falsePositive) + '</b> 件。<br>' +
      '总共出现这条线索的 <b>' + L.formatCount(s.evidencePositive) + '</b> 件里，真正有问题的占 ' +
      '<b>' + L.formatPct(s.posterior, 1) + '</b>。';
    $('sandboxBody').innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  // ── 重置 ──
  function reset() {
    subjectInput.value = '';
    evidenceInput.value = '';
    setSlider(priorSlider, 5);
    setSlider(likelihoodSlider, 80);
    setSlider(falseRateSlider, 20);
    setSlider(guessSlider, 50);
    syncAllValues();
    resultCard.classList.remove('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── 复制结论 ──
  function copyConclusion() {
    var text = $('punchline').innerText;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () {
        flashBtn(copyBtn, '已复制');
      });
    } else {
      var ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy');
      document.body.removeChild(ta);
      flashBtn(copyBtn, '已复制');
    }
  }

  function flashBtn(btn, text) {
    var orig = btn.innerHTML;
    btn.innerHTML = '<i class="ti ti-check"></i> ' + text;
    setTimeout(function () { btn.innerHTML = orig; }, 1500);
  }

  // ── 分享 ──
  function share() {
    var url = location.href;
    if (navigator.share) {
      navigator.share({ title: '贝叶斯改主意计算器', url: url }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () {
        flashBtn(shareBtn, '链接已复制');
      });
    }
  }

  // ── 绑定 ──
  computeBtn.addEventListener('click', compute);
  resetBtn.addEventListener('click', reset);
  copyBtn.addEventListener('click', copyConclusion);
  shareBtn.addEventListener('click', share);

  // ── 初始化 ──
  renderPresets();
  syncAllValues();
})();

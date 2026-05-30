(function () {
  'use strict';

  /* ---- sphere data ---- */
  var SPHERES = [
    { id: 'basketball', name: '篮球', radius: 0.12,    label: '半径 12 cm' },
    { id: 'football',    name: '足球', radius: 0.11,    label: '半径 11 cm' },
    { id: 'earth',       name: '地球', radius: 6371000, label: '半径 6,371 km' },
    { id: 'sun',         name: '太阳', radius: 696000000, label: '半径 696,000 km' },
    { id: 'universe',    name: '可观测宇宙', radius: 4.4e26, label: '半径 ~4.4×10²⁶ m' }
  ];

  var GUESS_OPTIONS = [
    { label: '0.001 mm', value: '1e-6',  display: '0.001 毫米' },
    { label: '0.1 mm',   value: '1e-4',  display: '0.1 毫米' },
    { label: '1 mm',     value: '1e-3',  display: '1 毫米' },
    { label: '1 cm',     value: '1e-2',  display: '1 厘米' },
    { label: '16 cm',    value: '1.59e-1', display: '16 厘米', correct: true },
    { label: '1 m',      value: '1',     display: '1 米' },
    { label: '10 m',     value: '10',    display: '10 米' }
  ];

  var currentSphere = SPHERES[2]; // default: earth
  var guessResolved = false;

  /* ---- DOM refs ---- */
  var guessOptionsEl, revealAreaEl;
  var deltaSlider, deltaLabel, gapValueEl, addedLengthEl;
  var sphereBtns, sphereStatsEl;
  var extensionInput, extensionResult, targetInput, targetResult;
  var canvas, canvasWrap;

  function $(s) { return document.querySelector(s); }
  function $$(s) { return document.querySelectorAll(s); }

  /* ================================================================
     Module 1: Intuition Test
     ================================================================ */
  function initIntuitionTest() {
    guessOptionsEl = $('#guessOptions');
    revealAreaEl = $('#revealArea');

    GUESS_OPTIONS.forEach(function (opt) {
      var btn = document.createElement('button');
      btn.className = 'guess-btn';
      btn.textContent = opt.label;
      btn.setAttribute('data-value', opt.value);
      if (opt.correct) btn.setAttribute('data-correct', 'true');
      btn.addEventListener('click', function () { handleGuess(btn, opt); });
      guessOptionsEl.appendChild(btn);
    });
  }

  function handleGuess(btn, opt) {
    if (guessResolved) return;
    guessResolved = true;

    var allBtns = $$('.guess-btn');
    allBtns.forEach(function (b) { b.disabled = true; });

    if (opt.correct) {
      btn.classList.add('correct');
      showReveal('correct', opt.display);
    } else {
      btn.classList.add('wrong');
      var correctBtn = $('[data-correct="true"]');
      if (correctBtn) correctBtn.classList.add('correct');
      showReveal('wrong', opt.display);
    }
  }

  function showReveal(result, userGuess) {
    var correctGap = calculateGap(1);
    var gapStr = (correctGap * 100).toFixed(1) + ' 厘米（约 ' + (correctGap * 100).toFixed(0) + ' cm）';

    var remark = result === 'correct'
      ? '答对了！你超越了绝大多数人的直觉。'
      : '你猜了 ' + userGuess + '，但这不是直觉的错——几乎所有人都猜错。';

    var statsHtml =
      '<div class="stats-title">据统计，各选项被选择的比例：</div>' +
      '<div class="stats-bars">' +
        buildStatBar('0.001 mm', 5,  false) +
        buildStatBar('0.1 mm',   12, false) +
        buildStatBar('1 mm',     28, false) +
        buildStatBar('1 cm',     32, false) +
        buildStatBar('16 cm',    8,  true) +
        buildStatBar('1 m',      11, false) +
        buildStatBar('10 m',     4,  false) +
      '</div>';

    revealAreaEl.innerHTML =
      '<div class="reveal-card">' +
        '<div class="guess-remark">' + remark + '</div>' +
        '<div class="answer-display">' + gapStr + '</div>' +
        '<div class="answer-detail">' +
          '关键公式：<strong>h = ΔL / (2π)</strong> = 1 / (2π) ≈ <strong>0.159 米</strong> ≈ 16 cm<br>' +
          '而且——<strong>这个高度与球的大小完全无关</strong>。篮球、地球还是太阳，结果都一样。' +
        '</div>' +
        statsHtml +
      '</div>';

    revealAreaEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function buildStatBar(label, pct, isCorrect) {
    return '<div class="stat-bar-row' + (isCorrect ? ' correct' : '') + '">' +
      '<span class="stat-bar-label">' + label + '</span>' +
      '<span class="stat-bar-track">' +
        '<span class="stat-bar-fill" style="width:' + pct + '%"></span>' +
      '</span>' +
      '<span class="stat-bar-pct">' + pct + '%</span>' +
      (isCorrect ? ' <span class="stat-bar-tag">正确答案</span>' : '') +
    '</div>';
  }

  /* ================================================================
     Module 2: Visualization
     ================================================================ */
  function initVisualization() {
    canvas = $('#vizCanvas');
    canvasWrap = $('.canvas-wrap');
    deltaSlider = $('#deltaSlider');
    deltaLabel = $('#deltaLabel');
    gapValueEl = $('#gapValue');
    addedLengthEl = $('#addedLength');

    updateVisualization();
    deltaSlider.addEventListener('input', updateVisualization);
    window.addEventListener('resize', debounce(updateVisualization, 150));
  }

  function updateVisualization() {
    var deltaL = parseFloat(deltaSlider.value);
    var gap = calculateGap(deltaL);

    deltaLabel.textContent = deltaL.toFixed(1) + ' 米';
    gapValueEl.textContent = formatLength(gap);
    if (addedLengthEl) addedLengthEl.textContent = deltaL.toFixed(1) + ' 米';

    drawCanvas(deltaL, gap);
  }

  function drawCanvas(deltaL, gap) {
    var dpr = window.devicePixelRatio || 1;
    var rect = canvasWrap.getBoundingClientRect();
    var w = rect.width;
    var h = Math.max(340, Math.min(440, w * 0.6));

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var leftCX = w * 0.26;
    var leftCY = h * 0.48;

    drawFullView(ctx, leftCX, leftCY, w, h, deltaL, gap);

    var rightCX = w * 0.72;
    var rightCY = h * 0.5;
    var rightW = w * 0.4;
    var rightH = h * 0.72;

    drawZoomedView(ctx, rightCX, rightCY, rightW, rightH, gap, deltaL);
  }

  function drawFullView(ctx, cx, cy, cw, ch, deltaL, gap) {
    // calculate max available radius so rope circle stays within canvas
    var maxAvail = Math.min(cx - 14, cw - cx - 14, cy - 22, ch * 0.44);
    // sphere radius gets scaled down if rope circle would overflow
    var r = currentSphere.radius > 0
      ? Math.min(maxAvail, maxAvail / (1 + gap / currentSphere.radius))
      : maxAvail;

    // label
    ctx.fillStyle = '#a0a0a0';
    ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('真实比例视图', cx, cy - r - 18);

    // sphere gradient
    var grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.05, cx, cy, r);
    grad.addColorStop(0, '#8bb8f0');
    grad.addColorStop(0.4, '#3b7bc9');
    grad.addColorStop(0.75, '#1a4a8a');
    grad.addColorStop(1, '#0d2b52');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // sphere outline
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // surface highlight
    var hlGrad = ctx.createLinearGradient(cx - r, cy - r * 0.2, cx + r, cy + r * 0.2);
    hlGrad.addColorStop(0, 'rgba(255,255,255,0.12)');
    hlGrad.addColorStop(0.5, 'rgba(255,255,255,0.03)');
    hlGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = hlGrad;
    ctx.fill();

    // rope circle
    var gapPx = r > 0 ? Math.max(1.5, (gap / currentSphere.radius) * r) : 2;
    // clamp gapPx so rope stays in bounds
    if (r + gapPx > maxAvail) gapPx = Math.max(1.5, maxAvail - r);
    ctx.beginPath();
    ctx.arc(cx, cy, r + gapPx, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    // rope label with leader line
    var labelAngle = -Math.PI / 4;
    var labelRX = cx + (r + gapPx) * Math.cos(labelAngle);
    var labelRY = cy + (r + gapPx) * Math.sin(labelAngle);
    var tipX = labelRX + 28;
    var tipY = labelRY - 8;

    ctx.beginPath();
    ctx.moveTo(labelRX, labelRY);
    ctx.lineTo(tipX, tipY);
    ctx.strokeStyle = 'rgba(255,215,0,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#ffd700';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('绳子', tipX + 2, tipY - 3);
    ctx.fillText('+' + deltaL.toFixed(1) + 'm', tipX + 2, tipY + 11);

    // sphere label
    ctx.fillStyle = '#a0a0a0';
    ctx.textAlign = 'center';
    ctx.fillText(currentSphere.name, cx, cy + r + 22);
  }

  function drawZoomedView(ctx, cx, cy, maxW, maxH, gap, deltaL) {
    ctx.fillStyle = '#a0a0a0';
    ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('放大视图', cx, cy - maxH / 2 - 18);

    var boxX = cx - maxW / 2;
    var boxY = cy - maxH / 2;

    // semi-transparent background fill
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    roundRect(ctx, boxX, boxY, maxW, maxH, 10);
    ctx.fill();

    // border
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    roundRect(ctx, boxX, boxY, maxW, maxH, 10);
    ctx.stroke();

    // zoom factor label (top-left corner of the box)
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('放大', boxX + 10, boxY + 18);

    // when deltaL is zero, show placeholder text
    if (deltaL <= 0) {
      ctx.fillStyle = '#a0a0a0';
      ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('拖动左侧滑块增加绳长', cx, cy + 4);
      return;
    }

    // gap in pixels: scale so that for deltaL=1, gap≈45px
    var gapPx = Math.max(6, Math.min(100, deltaL * 45));

    // We draw two concentric arcs (sharing the same circle center)
    // center is far below the visible area, so only the top arc is visible
    var arcDeg = 36;
    var arcHalfRad = (arcDeg / 2) * Math.PI / 180;
    var chordW = maxW * 0.82;
    var arcR = chordW / (2 * Math.sin(arcHalfRad));

    // Virtual circle center (far below)
    var virtualCY = cy + arcR;
    var startAngle = -Math.PI / 2 - arcHalfRad;
    var endAngle = -Math.PI / 2 + arcHalfRad;

    // Axis line (faint dotted)
    ctx.beginPath();
    ctx.moveTo(cx, boxY);
    ctx.lineTo(cx, boxY + maxH);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 12]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Rope arc (outer — larger radius)
    ctx.beginPath();
    ctx.arc(cx, virtualCY, arcR + gapPx, startAngle, endAngle);
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Sphere arc (inner — smaller radius)
    ctx.beginPath();
    ctx.arc(cx, virtualCY, arcR, startAngle, endAngle);
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Vertical gap measurement at center
    var ropeTopY = virtualCY - (arcR + gapPx);
    var sphereTopY = virtualCY - arcR;

    ctx.beginPath();
    ctx.moveTo(cx, ropeTopY);
    ctx.lineTo(cx, sphereTopY);
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrow heads
    drawArrowHead(ctx, cx, ropeTopY + 4, true);
    drawArrowHead(ctx, cx, sphereTopY - 4, false);

    // Gap label
    var midY = (ropeTopY + sphereTopY) / 2;
    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(formatLength(gap), cx + 26, midY + 2);

    // Labels on the arcs
    ctx.fillStyle = '#60a5fa';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('球面', boxX + maxW - 12, sphereTopY - 2);

    ctx.fillStyle = '#ffd700';
    ctx.textAlign = 'right';
    ctx.fillText('绳子', boxX + maxW - 12, ropeTopY + 2);
  }

  function drawArrowHead(ctx, x, y, pointUp) {
    ctx.beginPath();
    if (pointUp) {
      ctx.moveTo(x, y);
      ctx.lineTo(x - 5, y + 7);
      ctx.lineTo(x + 5, y + 7);
    } else {
      ctx.moveTo(x, y);
      ctx.lineTo(x - 5, y - 7);
      ctx.lineTo(x + 5, y - 7);
    }
    ctx.closePath();
    ctx.fillStyle = '#f87171';
    ctx.fill();
  }

  function debounce(fn, delay) {
    var timer;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, delay);
    };
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  /* ================================================================
     Module 3: Sphere selector
     ================================================================ */
  function initSphereSelector() {
    sphereBtns = $('#sphereBtns');
    sphereStatsEl = $('#sphereStats');

    SPHERES.forEach(function (s, i) {
      var btn = document.createElement('button');
      btn.className = 'sphere-btn' + (s.id === 'earth' ? ' active' : '');
      btn.textContent = s.name;
      btn.setAttribute('data-index', i);
      btn.addEventListener('click', function () {
        selectSphere(i);
      });
      sphereBtns.appendChild(btn);
    });

    updateSphereDisplay();
  }

  function selectSphere(index) {
    currentSphere = SPHERES[index];
    var btns = $$('#sphereBtns .sphere-btn');
    btns.forEach(function (b, i) {
      b.classList.toggle('active', i === index);
    });
    updateSphereDisplay();
    updateVisualization();
  }

  function updateSphereDisplay() {
    var deltaL = parseFloat(deltaSlider ? deltaSlider.value : 1);
    var result = verifyIndependence(currentSphere.radius, deltaL);

    sphereStatsEl.innerHTML =
      '<div class="sphere-stat">' +
        '<div class="stat-label">球体</div>' +
        '<div class="stat-value">' + currentSphere.name + '</div>' +
      '</div>' +
      '<div class="sphere-stat">' +
        '<div class="stat-label">半径</div>' +
        '<div class="stat-value">' + currentSphere.label + '</div>' +
      '</div>' +
      '<div class="sphere-stat">' +
        '<div class="stat-label">原始周长</div>' +
        '<div class="stat-value">' + formatLength(result.originalCircumference) + '</div>' +
      '</div>' +
      '<div class="sphere-stat">' +
        '<div class="stat-label">增加 ' + deltaL.toFixed(1) + 'm 后间隙</div>' +
        '<div class="stat-value gap-highlight">' + formatLength(result.gap) + '</div>' +
      '</div>';
  }

  /* ================================================================
     Module 4: Extension calculator
     ================================================================ */
  function initExtension() {
    extensionInput = $('#extensionInput');
    extensionResult = $('#extensionResult');
    targetInput = $('#targetInput');
    targetResult = $('#targetResult');

    if (extensionInput) {
      extensionInput.addEventListener('input', updateExtensionCalc);
      updateExtensionCalc();
    }
    if (targetInput) {
      targetInput.addEventListener('input', updateTargetCalc);
      updateTargetCalc();
    }
  }

  function updateExtensionCalc() {
    var val = parseFloat(extensionInput.value);
    if (isNaN(val) || val < 0) {
      extensionResult.innerHTML = '';
      return;
    }
    var gap = calculateGap(val);
    extensionResult.innerHTML =
      '间隙高度 = <span class="result-val">' + formatLength(gap) + '</span> （公式：' +
      val.toFixed(2) + ' / (2π) ≈ ' + (val / (2 * Math.PI)).toFixed(4) + ' 米）';
  }

  function updateTargetCalc() {
    var val = parseFloat(targetInput.value);
    if (isNaN(val) || val < 0) {
      targetResult.innerHTML = '';
      return;
    }
    var needed = calculateRequiredLength(val);
    targetResult.innerHTML =
      '需要增加的绳长 = <span class="result-val">' + formatLength(needed) + '</span> （公式：' +
      val.toFixed(2) + ' × 2π ≈ ' + (val * 2 * Math.PI).toFixed(4) + ' 米）';
  }

  /* ================================================================
     Init
     ================================================================ */
  function init() {
    initIntuitionTest();
    initVisualization();
    initSphereSelector();
    initExtension();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

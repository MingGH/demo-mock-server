/**
 * Diffie-Hellman 密钥交换 - 主交互逻辑
 * 依赖：engine.js（纯逻辑）、Chart.js、GSAP、components/header.js
 */

/* 全局状态 */
var colorStepDone = false;
var answers = [];       // 每题所选选项下标
var quizSubmitted = false;
var compareChart = null;

// ========== 行为埋点（NFTrack，见 components/track.js） ==========
// 事件清单：
//   session_start (trackOnce) 页面加载
//   color_step     第 1 步完成（生成共享色）
//   try_crack      点击"尝试破解"
//   quiz_finish    提交答卷，回答「玩家对 DH 的理解得分」
//   session_end   (force) 真正离页 pagehide，reason=leave
// 埋点不影响功能：NFTrack 不存在时静默跳过。
if (typeof window !== 'undefined') {
  window.NF_TRACK_UMAMI_MIRROR = ['quiz_finish', 'session_end'];
}
function nfTrack(name, props, opts) {
  try {
    if (window.NFTrack && typeof window.NFTrack.track === 'function') {
      window.NFTrack.track(name, props, opts);
    }
  } catch (e) {}
}
function nfTrackOnce(name, props) {
  try {
    if (window.NFTrack && typeof window.NFTrack.trackOnce === 'function') {
      window.NFTrack.trackOnce(name, props);
    }
  } catch (e) {}
}
function registerTrackLeaveHandler() {
  window.addEventListener('pagehide', function () {
    nfTrack('session_end', { reason: 'leave' }, { force: true });
  });
}
nfTrackOnce('session_start', {});
registerTrackLeaveHandler();

// ── 初始化：打开即玩 ──
function init() {
  renderQuiz();
  updatePublicColors();
  onMathChange();
}

// ══════════ Stage 1：颜色版 ══════════

function rgbStr(c) {
  return 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
}

// 两个秘密色相同时提醒（保证交换有意义）
function onSecretChange() {
  var a = document.getElementById('aliceColor').value;
  var b = document.getElementById('bobColor').value;
  document.getElementById('aliceSecret').style.background = rgbStr(SECRET_COLORS[a]);
  document.getElementById('bobSecret').style.background = rgbStr(SECRET_COLORS[b]);
  var eveMsg = document.getElementById('eveMessage');
  if (a === b) {
    eveMsg.innerHTML = '两人选了同一个秘密色——这样没有意义，请换一个。';
  } else {
    eveMsg.innerHTML = '只看到两个混合色——少了谁的秘密色都还原不出最终色。';
  }
  updatePublicColors();
}

function updatePublicColors() {
  var a = document.getElementById('aliceColor').value;
  var b = document.getElementById('bobColor').value;
  var alicePublic = mixColor(BASE_COLOR, SECRET_COLORS[a]);
  var bobPublic = mixColor(BASE_COLOR, SECRET_COLORS[b]);
  document.getElementById('alicePublic').style.background = rgbStr(alicePublic);
  document.getElementById('bobPublic').style.background = rgbStr(bobPublic);
}

function colorStep() {
  if (colorStepDone) return;
  var a = document.getElementById('aliceColor').value;
  var b = document.getElementById('bobColor').value;
  if (a === b) {
    document.getElementById('eveMessage').innerHTML = '两人选了同一个秘密色——请换一个再继续。';
    return;
  }
  colorStepDone = true;
  nfTrack('color_step', {});

  var shared = mixColor3(BASE_COLOR, SECRET_COLORS[a], SECRET_COLORS[b]);
  document.getElementById('aliceShared').style.background = rgbStr(shared);
  document.getElementById('bobShared').style.background = rgbStr(shared);
  var box = document.getElementById('sharedBox');
  box.style.display = 'block';

  if (window.gsap) {
    gsap.from('#sharedBox .color-swatch', { scale: 0.6, opacity: 0, duration: 0.5, stagger: 0.1, ease: 'power2.out' });
  }

  var btn = document.getElementById('colorStepBtn');
  btn.innerHTML = '<i class="ti ti-check"></i> 已完成';
  btn.disabled = true;
  btn.classList.add('done');

  // 滚动到共享结果
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ══════════ Stage 2：数学版 ══════════

function onMathChange() {
  var p = parseInt(document.getElementById('pSlider').value, 10);
  var g = parseInt(document.getElementById('gSlider').value, 10);
  var a = parseInt(document.getElementById('aSlider').value, 10);
  var b = parseInt(document.getElementById('bSlider').value, 10);
  document.getElementById('pValue').textContent = p;
  document.getElementById('gValue').textContent = g;
  document.getElementById('aValue').textContent = a;
  document.getElementById('bValue').textContent = b;

  var primeHint = document.getElementById('primeHint');
  if (isPrime(p)) {
    primeHint.textContent = '✓ 素数';
    primeHint.className = 'param-prime ok';
  } else {
    primeHint.textContent = '✗ 不是素数（DH 需要素数模数）';
    primeHint.className = 'param-prime bad';
  }

  var r = dhExchange(p, g, a, b);
  document.getElementById('aliceFormula').innerHTML =
    'A = ' + g + '<sup>' + a + '</sup> mod ' + p + ' = ' + r.A;
  document.getElementById('bobFormula').innerHTML =
    'B = ' + g + '<sup>' + b + '</sup> mod ' + p + ' = ' + r.B;
  document.getElementById('sharedFormula').innerHTML =
    'g<sup>' + a + '·' + b + '</sup> mod ' + p + ' = ' + r.shared;
  document.getElementById('eveSees').textContent =
    'p=' + p + ', g=' + g + ', A=' + r.A + ', B=' + r.B;
}

function tryCrack() {
  nfTrack('try_crack', {});
  var p = parseInt(document.getElementById('pSlider').value, 10);
  var g = parseInt(document.getElementById('gSlider').value, 10);
  var a = parseInt(document.getElementById('aSlider').value, 10);
  var target = modPow(g, a, p);

  // 演示暴力枚举过程：Eve 从 x=0 开始逐个试
  var tried = '';
  for (var x = 0; x <= p; x++) {
    if (modPow(g, x, p) === target) {
      tried = '她试了 ' + (x + 1) + ' 个 x（0 到 ' + x + '）后找到了 a=' + x + '。';
      break;
    }
  }
  document.getElementById('crackResult').innerHTML =
    'Eve 只能从 x=0 开始逐个试 g<sup>x</sup> mod p，直到算出 A=' + target + '。' +
    tried + '<br>真实世界里 p 是几百位的大素数，' +
    '<strong>暴力枚举在计算上不可能完成</strong>（离散对数难题）。';
  document.getElementById('crackResult').style.display = 'block';
}

// ══════════ Stage 3：判断题 ══════════

function renderQuiz() {
  var list = document.getElementById('quizList');
  var html = '';
  QUIZ.forEach(function (q, i) {
    html += '<div class="quiz-item" id="quiz-' + i + '">';
    html += '<div class="quiz-question">' + (i + 1) + '. ' + q.question + '</div>';
    html += '<div class="quiz-options">';
    q.options.forEach(function (opt, j) {
      html += '<label class="quiz-option" id="quiz-' + i + '-opt-' + j + '">' +
        '<input type="radio" name="quiz-' + i + '" value="' + j + '" onchange="window.onAnswer(' + i + ',' + j + ')">' +
        '<span>' + opt + '</span></label>';
    });
    html += '</div></div>';
  });
  list.innerHTML = html;
}

function onAnswer(qIdx, optIdx) {
  answers[qIdx] = optIdx;
  // 手动高亮选中项（避免依赖 :has()，兼容旧浏览器）
  var item = document.getElementById('quiz-' + qIdx);
  if (!item) return;
  var labels = item.querySelectorAll('.quiz-option');
  for (var i = 0; i < labels.length; i++) {
    if (i === optIdx) {
      labels[i].classList.add('selected');
    } else {
      labels[i].classList.remove('selected');
    }
  }
}

function submitQuiz() {
  if (quizSubmitted) return;
  var incomplete = [];
  for (var i = 0; i < QUIZ.length; i++) {
    if (answers[i] === undefined) {
      incomplete.push(i + 1);
    }
  }
  if (incomplete.length > 0) {
    alert('第 ' + incomplete.join('、') + ' 题还没选，全部答完再提交。');
    return;
  }
  quizSubmitted = true;
  var result = gradeQuiz(answers);
  nfTrack('quiz_finish', { correct: result.correctCount, total: result.total });

  document.getElementById('scoreDisplay').textContent = result.correctCount + ' / ' + result.total;
  var banner = document.getElementById('resultBanner');
  var comment;
  if (result.correctCount === 5) {
    comment = '满分！你已经完全理解了公开信道上的秘密交换。';
  } else if (result.correctCount >= 3) {
    comment = '不错！核心机制你已经掌握，看看解析补全剩下的细节。';
  } else {
    comment = '没关系——Diffie-Hellman 是 1976 年才被想明白的东西，看看下面的解析。';
  }
  banner.innerHTML = comment;

  renderExplainList(result);
  renderCompareChart(result.correctCount);

  document.getElementById('resultSection').style.display = 'block';
  document.getElementById('resultSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderExplainList(result) {
  var list = document.getElementById('explainList');
  var html = '';
  QUIZ.forEach(function (q, i) {
    var ok = result.perQuestion[i] === 1;
    html += '<div class="explain-item ' + (ok ? 'ok' : 'bad') + '">' +
      '<div class="explain-q">' + (i + 1) + '. ' + q.question +
      ' <span class="explain-mark">' + (ok ? '✓ 答对' : '✗ 答错') + '</span></div>' +
      '<div class="explain-a">正确答案：' + q.options[q.answer] + '</div>' +
      '<div class="explain-detail">' + q.explain + '</div></div>';
  });
  list.innerHTML = html;
}

function renderCompareChart(score) {
  var ctx = document.getElementById('compareChart');
  if (!ctx) return;
  var guess = randomGuessExpectation(QUIZ.length);
  if (compareChart) compareChart.destroy();
  compareChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['你', '随机猜测'],
      datasets: [{
        label: '答对数',
        data: [score, guess],
        backgroundColor: ['#ffd700', '#90caf9'],
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          max: QUIZ.length,
          ticks: { stepSize: 1, color: '#888' },
          grid: { color: 'rgba(255,255,255,0.06)' }
        },
        x: { ticks: { color: '#aaa' }, grid: { display: false } }
      }
    }
  });
}

// ── 重新体验 ──
function restartDemo() {
  colorStepDone = false;
  answers = [];
  quizSubmitted = false;
  document.getElementById('resultSection').style.display = 'none';
  document.getElementById('sharedBox').style.display = 'none';
  document.getElementById('crackResult').style.display = 'none';
  document.getElementById('crackResult').innerHTML = '';
  var btn = document.getElementById('colorStepBtn');
  btn.innerHTML = '<i class="ti ti-arrow-right"></i> 下一步：生成共享色';
  btn.disabled = false;
  btn.classList.remove('done');
  document.getElementById('quizSubmitBtn').disabled = false;
  var radios = document.querySelectorAll('input[type=radio]');
  for (var i = 0; i < radios.length; i++) {
    radios[i].checked = false;
  }
  var selectedLabels = document.querySelectorAll('.quiz-option.selected');
  for (var j = 0; j < selectedLabels.length; j++) {
    selectedLabels[j].classList.remove('selected');
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
  nfTrack('demo_restart', {});
}

// ── 暴露给 HTML onclick ──
window.onSecretChange = onSecretChange;
window.colorStep = colorStep;
window.onMathChange = onMathChange;
window.tryCrack = tryCrack;
window.onAnswer = onAnswer;
window.submitQuiz = submitQuiz;
window.restartDemo = restartDemo;

// ── 测试钩子（仅用于无浏览器冒烟测试） ──
window.__dh = {
  getAnswers: function () { return answers.slice(); },
  setAnswer: function (q, o) { onAnswer(q, o); },
  submitQuiz: submitQuiz,
  colorStep: colorStep,
  tryCrack: tryCrack,
  isColorStepDone: function () { return colorStepDone; },
  isQuizSubmitted: function () { return quizSubmitted; }
};

// 启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

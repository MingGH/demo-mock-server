// ========== 页面交互逻辑 ==========

const API_BASE = 'https://numfeel-api.996.ninja';
const CANVAS_SIZE = 400;
const POINT_COUNT = 200;

// ── 状态 ──
let quizState = {
  round: 0,
  totalRounds: 5,
  score: 0,
  answered: false,
  // 每轮: { trueRandomSide: 'left'|'right', pointsLeft, pointsRight }
  currentRound: null,
  history: []
};

let quantumAvailable = false;

// ── 初始化 ──
document.addEventListener('DOMContentLoaded', function () {
  initClusteringQuiz();
  initPasswordDemo();
});

// ========================================
// 模块一：聚类错觉测验
// ========================================

function initClusteringQuiz() {
  updateScoreDisplay();
  generateNewRound();
}

async function fetchQuantumNumbers(count) {
  try {
    const resp = await fetch(API_BASE + '/quantum/numbers?count=' + count + '&min=0&max=255');
    const data = await resp.json();
    if (data.status === 200 && data.data) {
      quantumAvailable = true;
      return data.data;
    }
  } catch (e) {
    // 静默失败，使用伪随机
  }
  quantumAvailable = false;
  return null;
}

async function generateNewRound() {
  quizState.answered = false;
  quizState.round++;

  // 禁用按钮并显示加载状态
  const btns = document.querySelectorAll('.quiz-btn');
  btns.forEach(function (b) {
    b.disabled = true;
    b.classList.remove('correct', 'wrong');
  });

  // 获取量子随机数（必须成功）
  const quantumNums = await fetchQuantumNumbers(POINT_COUNT * 2);

  if (!quantumNums) {
    // 量子API不可用，提示用户
    const btns = document.querySelectorAll('.quiz-btn');
    btns.forEach(function (b) { b.disabled = true; });
    showSourceBadge(false);
    document.getElementById('roundResult').classList.add('show');
    document.getElementById('resultTitle').textContent = '量子随机数获取失败';
    document.getElementById('resultTitle').style.color = '#ff6b6b';
    document.getElementById('resultText').innerHTML = '本测试需要真随机数据（来自 ANU 量子真空涨落），伪随机数不具备说服力。<br>请检查网络连接后重试。';
    document.getElementById('nextRoundBtn').textContent = '重试';
    document.getElementById('nextRoundBtn').onclick = function () {
      quizState.round--;
      generateNewRound();
    };
    return;
  }

  const trueRandomPoints = quantumNumbersToPoints(quantumNums, CANVAS_SIZE);
  showSourceBadge(true);

  const blueNoisePoints = generateBlueNoisePoints(POINT_COUNT, CANVAS_SIZE, 20);

  // 随机决定哪边放真随机
  const trueOnLeft = Math.random() < 0.5;

  quizState.currentRound = {
    trueRandomSide: trueOnLeft ? 'left' : 'right',
    pointsLeft: trueOnLeft ? trueRandomPoints : blueNoisePoints,
    pointsRight: trueOnLeft ? blueNoisePoints : trueRandomPoints
  };

  // 绘制画布
  drawPoints('canvasLeft', quizState.currentRound.pointsLeft, '#00d4ff');
  drawPoints('canvasRight', quizState.currentRound.pointsRight, '#ce93d8');

  // 更新标签
  document.getElementById('labelLeft').textContent = '图 A';
  document.getElementById('labelLeft').classList.remove('reveal');
  document.getElementById('labelRight').textContent = '图 B';
  document.getElementById('labelRight').classList.remove('reveal');

  // 启用按钮
  btns.forEach(function (b) { b.disabled = false; });

  // 隐藏结果
  document.getElementById('roundResult').classList.remove('show');

  // 更新轮次显示
  document.getElementById('roundNum').textContent = quizState.round + ' / ' + quizState.totalRounds;
}

function showSourceBadge(isQuantum) {
  const badge = document.getElementById('sourceBadge');
  if (isQuantum) {
    badge.innerHTML = '<i class="ti ti-atom"></i> 量子真随机（ANU 量子真空涨落）';
    badge.style.display = 'inline-flex';
  } else {
    badge.innerHTML = '<i class="ti ti-alert-triangle"></i> 量子API不可用';
    badge.style.display = 'inline-flex';
    badge.style.borderColor = 'rgba(255,107,107,0.3)';
    badge.style.color = '#ff6b6b';
    badge.style.background = 'rgba(255,107,107,0.08)';
  }
}

function drawPoints(canvasId, points, color) {
  const canvas = document.getElementById(canvasId);
  const dpr = window.devicePixelRatio || 1;
  const displayWidth = canvas.clientWidth || 300;
  const displayHeight = displayWidth; // 正方形

  canvas.width = displayWidth * dpr;
  canvas.height = displayHeight * dpr;
  canvas.style.height = displayHeight + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // 背景
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, 0, displayWidth, displayHeight);

  // 绘制点
  const scale = displayWidth / CANVAS_SIZE;
  ctx.fillStyle = color;
  for (let i = 0; i < points.length; i++) {
    const x = points[i].x * scale;
    const y = points[i].y * scale;
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function handleQuizAnswer(choice) {
  if (quizState.answered) return;
  quizState.answered = true;

  const trueOnLeft = quizState.currentRound.trueRandomSide === 'left';
  const userChoseLeft = (choice === 'left');
  const isCorrect = userChoseLeft === trueOnLeft;

  if (isCorrect) quizState.score++;
  updateScoreDisplay();

  // 高亮按钮
  const btnLeft = document.getElementById('btnLeft');
  const btnRight = document.getElementById('btnRight');
  btnLeft.disabled = true;
  btnRight.disabled = true;

  if (trueOnLeft) {
    btnLeft.classList.add('correct');
    if (!isCorrect) btnRight.classList.add('wrong');
  } else {
    btnRight.classList.add('correct');
    if (!isCorrect) btnLeft.classList.add('wrong');
  }

  // 揭示标签
  document.getElementById('labelLeft').textContent = trueOnLeft ? '真随机 (R≈1.0)' : '伪均匀 (R≈1.6)';
  document.getElementById('labelLeft').classList.add('reveal');
  document.getElementById('labelRight').textContent = trueOnLeft ? '伪均匀 (R≈1.6)' : '真随机 (R≈1.0)';
  document.getElementById('labelRight').classList.add('reveal');

  // 计算统计指标
  var truePoints = trueOnLeft ? quizState.currentRound.pointsLeft : quizState.currentRound.pointsRight;
  var fakePoints = trueOnLeft ? quizState.currentRound.pointsRight : quizState.currentRound.pointsLeft;
  var rTrue = clarkEvansR(truePoints, CANVAS_SIZE);
  var rFake = clarkEvansR(fakePoints, CANVAS_SIZE);
  var cvTrue = gridVarianceCV(truePoints, CANVAS_SIZE, 8);
  var cvFake = gridVarianceCV(fakePoints, CANVAS_SIZE, 8);

  // 显示结果
  var resultBox = document.getElementById('roundResult');
  var resultTitle = document.getElementById('resultTitle');
  var resultText = document.getElementById('resultText');

  resultTitle.textContent = isCorrect ? '答对了！' : '答错了！';
  resultTitle.style.color = isCorrect ? '#81c784' : '#ff6b6b';

  resultText.innerHTML =
    (isCorrect
      ? '你的直觉比大多数人靠谱。'
      : '大多数人都猜反了——看起来"更乱"的那个才是真随机。') +
    '<br><br>' +
    '<strong>Clark-Evans R 指数：</strong><br>' +
    '真随机 R = ' + rTrue.toFixed(3) + '（≈1.0 = 完全随机）<br>' +
    '伪均匀 R = ' + rFake.toFixed(3) + '（>1.2 = 人为打散）<br><br>' +
    '<strong>网格方差系数 CV：</strong><br>' +
    '真随机 CV = ' + cvTrue.toFixed(3) + '（高 = 有自然聚集和空洞）<br>' +
    '伪均匀 CV = ' + cvFake.toFixed(3) + '（低 = 分布均匀）';

  resultBox.classList.add('show');

  // 记录历史
  quizState.history.push({ round: quizState.round, correct: isCorrect, rTrue: rTrue, rFake: rFake });

  // 更新按钮文字
  var nextBtn = document.getElementById('nextRoundBtn');
  if (quizState.round >= quizState.totalRounds) {
    nextBtn.textContent = '查看总成绩';
    nextBtn.onclick = showFinalResult;
  } else {
    nextBtn.textContent = '下一轮';
    nextBtn.onclick = generateNewRound;
  }
}

function updateScoreDisplay() {
  document.getElementById('scoreDisplay').textContent = quizState.score;
  document.getElementById('roundTotal').textContent = quizState.totalRounds;
}

function showFinalResult() {
  var section = document.getElementById('quizSection');
  var finalBox = document.getElementById('finalResult');
  var accuracy = (quizState.score / quizState.totalRounds * 100).toFixed(0);

  document.getElementById('finalAccuracy').textContent = accuracy + '%';
  document.getElementById('finalScore').textContent = quizState.score + '/' + quizState.totalRounds;

  var comment;
  if (accuracy >= 80) {
    comment = '你的随机性直觉远超常人。统计学家的潜质。';
  } else if (accuracy >= 60) {
    comment = '比随机猜测好一些，但聚类错觉仍然在影响你。';
  } else if (accuracy >= 40) {
    comment = '和随机猜差不多——这恰恰证明了聚类错觉的威力。';
  } else {
    comment = '你几乎每次都猜反了——典型的聚类错觉受害者。看起来"太乱"的才是真随机。';
  }
  document.getElementById('finalComment').textContent = comment;
  finalBox.classList.add('show');

  // 隐藏 quiz 交互
  document.getElementById('quizInteraction').style.display = 'none';
}

function restartQuiz() {
  quizState = { round: 0, totalRounds: 5, score: 0, answered: false, currentRound: null, history: [] };
  document.getElementById('finalResult').classList.remove('show');
  document.getElementById('quizInteraction').style.display = 'block';
  updateScoreDisplay();
  generateNewRound();
}

// ========================================
// 模块二：密码熵对比
// ========================================

const PASSWORD_PRESETS = [
  { password: 'P@$$w0rd!', type: 'weak', desc: '经典"复杂"密码：8位+特殊字符' },
  { password: 'Tr0ub4dor&3', type: 'weak', desc: 'xkcd 漫画中的反面教材' },
  { password: 'correct horse battery staple', type: 'strong', desc: '4个随机常用词组合' },
  { password: 'purple monkey dishwasher lamp', type: 'strong', desc: '4个随机词，好记又安全' },
  { password: 'Qwerty123!', type: 'weak', desc: '满足所有规则但毫无安全性' },
  { password: 'a9f#Kx2$', type: 'weak', desc: '8位真随机字符' }
];

// 攻击速度预设（次/秒）
const ATTACK_SPEEDS = {
  online: { rate: 100, label: '在线攻击（100次/秒）' },
  offline: { rate: 1e10, label: '离线GPU集群（100亿次/秒）' },
  quantum: { rate: 1e15, label: '理论量子计算机（千万亿次/秒）' }
};

function initPasswordDemo() {
  renderPresets();
  var input = document.getElementById('passwordInput');
  input.addEventListener('input', function () {
    analyzePassword(input.value);
  });
  // 默认分析第一个预设
  analyzePassword(PASSWORD_PRESETS[0].password);
  input.value = PASSWORD_PRESETS[0].password;
  renderComparisonTable();
}

function renderPresets() {
  var grid = document.getElementById('presetGrid');
  grid.innerHTML = '';
  PASSWORD_PRESETS.forEach(function (preset) {
    var card = document.createElement('div');
    card.className = 'preset-card';
    card.innerHTML =
      '<span class="type-tag ' + preset.type + '">' + (preset.type === 'weak' ? '看起来复杂' : '真正安全') + '</span>' +
      '<div class="pw">' + escapeHtml(preset.password) + '</div>' +
      '<div class="info">' + preset.desc + '</div>';
    card.onclick = function () {
      document.getElementById('passwordInput').value = preset.password;
      analyzePassword(preset.password);
    };
    grid.appendChild(card);
  });
}

function analyzePassword(password) {
  if (!password) {
    clearAnalysis();
    return;
  }

  var entropy = bruteForceEntropy(password);
  var effective = effectiveEntropy(password);
  var strength = passwordStrengthLevel(effective);
  var patterns = detectWeakPatterns(password);
  var charsetSize = getCharsetSize(password);

  // 更新熵条
  var barFill = document.getElementById('entropyBarFill');
  var pct = Math.min(100, effective / 128 * 100);
  barFill.style.width = pct + '%';
  barFill.style.background = strength.color;

  // 更新详情
  document.getElementById('entropyBits').textContent = effective.toFixed(1) + ' bits';
  document.getElementById('entropyBits').style.color = strength.color;
  document.getElementById('strengthLabel').textContent = strength.label;
  document.getElementById('strengthLabel').style.color = strength.color;
  document.getElementById('charsetInfo').textContent = charsetSize + ' 字符 × ' + password.length + ' 位';

  // 破解时间
  var offlineTime = crackTimeSeconds(effective, ATTACK_SPEEDS.offline.rate);
  document.getElementById('crackTimeOffline').textContent = formatCrackTime(offlineTime);

  var onlineTime = crackTimeSeconds(effective, ATTACK_SPEEDS.online.rate);
  document.getElementById('crackTimeOnline').textContent = formatCrackTime(onlineTime);

  // 弱点提示
  var weakBox = document.getElementById('weakPatterns');
  if (patterns.length > 0) {
    var labels = {
      'leet-speak': 'Leet-speak 替换（a→@, e→3）攻击者会优先尝试',
      'word-plus-suffix': '单词+后缀模式，字典攻击秒破',
      'capital-first': '首字母大写太常见，不增加安全性',
      'repeat': '重复字符，几乎零熵',
      'keyboard-sequence': '键盘序列，在常见密码表前100名'
    };
    weakBox.innerHTML = '<h4><i class="ti ti-alert-triangle"></i> 检测到弱模式</h4>' +
      patterns.map(function (p) { return '<p style="color:#ff6b6b;font-size:0.85rem;">• ' + (labels[p] || p) + '</p>'; }).join('');
    weakBox.style.display = 'block';
  } else {
    weakBox.style.display = 'none';
  }

  // 对比区域更新（如果输入的不是预设密码）
  updateLiveComparison(password, effective);
}

function clearAnalysis() {
  document.getElementById('entropyBarFill').style.width = '0%';
  document.getElementById('entropyBits').textContent = '—';
  document.getElementById('strengthLabel').textContent = '—';
  document.getElementById('charsetInfo').textContent = '—';
  document.getElementById('crackTimeOffline').textContent = '—';
  document.getElementById('crackTimeOnline').textContent = '—';
  document.getElementById('weakPatterns').style.display = 'none';
}

function renderComparisonTable() {
  var tbody = document.getElementById('comparisonBody');
  tbody.innerHTML = '';

  var pairs = [
    { weak: PASSWORD_PRESETS[0], strong: PASSWORD_PRESETS[2] },
    { weak: PASSWORD_PRESETS[1], strong: PASSWORD_PRESETS[3] },
    { weak: PASSWORD_PRESETS[4], strong: PASSWORD_PRESETS[5] }
  ];

  pairs.forEach(function (pair) {
    var eWeak = effectiveEntropy(pair.weak.password);
    var eStrong = effectiveEntropy(pair.strong.password);
    var tWeak = crackTimeSeconds(eWeak, ATTACK_SPEEDS.offline.rate);
    var tStrong = crackTimeSeconds(eStrong, ATTACK_SPEEDS.offline.rate);

    var row = document.createElement('tr');
    row.innerHTML =
      '<td class="mono">' + escapeHtml(pair.weak.password) + '</td>' +
      '<td>' + eWeak.toFixed(1) + '</td>' +
      '<td style="color:#ff6b6b">' + formatCrackTime(tWeak) + '</td>' +
      '<td class="mono">' + escapeHtml(pair.strong.password) + '</td>' +
      '<td class="highlight">' + eStrong.toFixed(1) + '</td>' +
      '<td style="color:#81c784">' + formatCrackTime(tStrong) + '</td>';
    tbody.appendChild(row);
  });
}

function updateLiveComparison(password, entropy) {
  var liveRow = document.getElementById('liveCompareRow');
  if (!liveRow) return;
  var time = crackTimeSeconds(entropy, ATTACK_SPEEDS.offline.rate);
  liveRow.innerHTML =
    '<td class="mono" colspan="3" style="color:#ffd700">' + escapeHtml(password) + '</td>' +
    '<td class="highlight">' + entropy.toFixed(1) + ' bits</td>' +
    '<td colspan="2" style="color:#ffd700">' + formatCrackTime(time) + '</td>';
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


// ========================================
// 模块三：Diceware 生成器
// ========================================

let dicewordCount = 5;

function setDicewordCount(n) {
  dicewordCount = n;
  document.querySelectorAll('.dice-count-btn').forEach(function (btn) {
    btn.classList.toggle('active', parseInt(btn.textContent) === n);
  });
}

async function generateDiceware() {
  var btn = document.getElementById('dicewareBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader-2"></i> 掷骰子中...';

  var resultBox = document.getElementById('dicewareResult');
  resultBox.style.display = 'block';

  var animBox = document.getElementById('diceAnimation');
  animBox.innerHTML = '';

  // 尝试用量子随机数选词
  var indices = [];
  var isQuantum = false;
  try {
    var resp = await fetch(API_BASE + '/quantum/numbers?count=' + dicewordCount + '&min=0&max=' + (DICEWARE_SIZE - 1));
    var data = await resp.json();
    if (data.status === 200 && data.data) {
      indices = data.data;
      isQuantum = true;
    }
  } catch (e) {}

  // 回退到本地随机
  if (indices.length === 0) {
    for (var i = 0; i < dicewordCount; i++) {
      indices.push(Math.floor(Math.random() * DICEWARE_SIZE));
    }
  }

  // 动画：逐个显示骰子滚动
  var words = [];
  for (var i = 0; i < indices.length; i++) {
    var word = DICEWARE_LIST[indices[i]];
    words.push(word);

    // 显示骰子动画
    var diceEl = document.createElement('span');
    diceEl.className = 'dice-roll';
    diceEl.textContent = (isQuantum ? '⚛️' : '🎲') + ' → ' + word;
    diceEl.style.animationDelay = (i * 0.1) + 's';
    animBox.appendChild(diceEl);
  }

  // 显示结果
  var passphrase = words.join(' ');
  document.getElementById('dicewareWords').textContent = passphrase;

  // 计算熵
  var entropy = dicewordCount * Math.log2(DICEWARE_SIZE);
  var crackTime = crackTimeSeconds(entropy, 1e10);

  document.getElementById('dwEntropy').textContent = entropy.toFixed(1) + ' bits';
  document.getElementById('dwDictSize').textContent = DICEWARE_SIZE.toLocaleString() + ' 词';
  document.getElementById('dwCrackTime').textContent = formatCrackTime(crackTime);

  // 同步更新上方的密码分析器
  document.getElementById('passwordInput').value = passphrase;
  analyzePassword(passphrase);

  btn.disabled = false;
  btn.innerHTML = '<i class="ti ti-dice-5"></i> 再掷一次';
}

function copyDiceware() {
  var text = document.getElementById('dicewareWords').textContent;
  navigator.clipboard.writeText(text).then(function () {
    var btn = document.getElementById('copyDiceBtn');
    btn.innerHTML = '<i class="ti ti-check"></i> 已复制';
    setTimeout(function () {
      btn.innerHTML = '<i class="ti ti-copy"></i> 复制';
    }, 2000);
  });
}

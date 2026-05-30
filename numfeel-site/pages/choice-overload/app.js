// ========== 选择过载实验室 — UI 交互逻辑 ==========

// ── 全局状态 ──
var state = {
  // Hick
  hickRounds: [2, 4, 8, 12, 16, 24, 32],
  hickCurrent: 0,
  hickResults: [],  // [{n, rt, correct}]
  hickStartTime: 0,

  // Fatigue
  fatigueTotal: 15,
  fatigueCurrent: 0,
  fatigueResults: [],  // [{rt, chose, timeout, impulsive, optionCount}]
  fatigueTimerId: null,
  fatigueStartTime: 0,
  fatigueTimeLimit: 5000,

  // Jam
  jamData: { round1: null, round2: null },
  jamStartTime: 0,
  jamHoverCount: 0,
  jamSelected: null,
  jamSatisfaction: [0, 0],

  // Final
  hickScore: 0,
  fatigueScore: 0,
  jamScore: 0
};

// ── 决策疲劳题库 ──
var FATIGUE_QUESTIONS = [
  { q: '你更喜欢哪种天气？', opts: ['晴天', '阴天'] },
  { q: '早餐你选？', opts: ['面包', '粥', '不吃'] },
  { q: '出门穿什么颜色？', opts: ['黑色', '白色', '灰色'] },
  { q: '周末去哪？', opts: ['宅家', '逛街', '公园'] },
  { q: '喝什么？', opts: ['咖啡', '茶', '水', '奶茶'] },
  { q: '听什么音乐？', opts: ['流行', '摇滚', '古典', '电子'] },
  { q: '选一个数字', opts: ['3', '7', '12', '42', '99'] },
  { q: '你更想养？', opts: ['猫', '狗', '鱼', '仓鼠', '都不养'] },
  { q: '选一种超能力', opts: ['隐身', '飞行', '读心', '时停', '瞬移', '预知'] },
  { q: '晚饭吃什么？', opts: ['火锅', '烧烤', '日料', '西餐', '麻辣烫', '随便'] },
  { q: '选一个颜色', opts: ['红', '橙', '黄', '绿', '蓝', '紫', '粉'] },
  { q: '旅行目的地？', opts: ['日本', '泰国', '冰岛', '新西兰', '意大利', '摩洛哥', '不想出门'] },
  { q: '选一部电影类型', opts: ['喜剧', '悬疑', '科幻', '爱情', '恐怖', '纪录片', '动画', '战争'] },
  { q: '你最想学的技能？', opts: ['画画', '吉他', '编程', '做饭', '摄影', '外语', '魔术', '格斗'] },
  { q: '选一种甜品', opts: ['提拉米苏', '马卡龙', '芝士蛋糕', '布丁', '冰淇淋', '华夫饼', '泡芙', '杨枝甘露', '双皮奶'] }
];

// ══════════════════════════════════════
// 阶段切换
// ══════════════════════════════════════
function showPhase(id) {
  var phases = document.querySelectorAll('.phase');
  for (var i = 0; i < phases.length; i++) phases[i].classList.remove('active');
  document.getElementById(id).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function startExperiment() {
  showPhase('phaseHick');
  document.getElementById('hickTotalRounds').textContent = state.hickRounds.length;
  startHickRound();
}

// ══════════════════════════════════════
// 关卡一：Hick 定律
// ══════════════════════════════════════
function startHickRound() {
  var n = state.hickRounds[state.hickCurrent];
  document.getElementById('hickRoundNum').textContent = state.hickCurrent + 1;
  document.getElementById('hickOptionCount').textContent = n;
  document.getElementById('hickProgress').style.width = (state.hickCurrent / state.hickRounds.length * 100) + '%';
  document.getElementById('hickGame').style.display = 'none';
  document.getElementById('hickRoundResult').style.display = 'none';
  document.getElementById('hickSummary').style.display = 'none';

  // 倒计时
  var cd = document.getElementById('hickCountdown');
  var cdText = document.getElementById('hickCountdownText');
  cd.style.display = 'block';
  var count = 3;
  cdText.textContent = count;
  var timer = setInterval(function() {
    count--;
    if (count > 0) {
      cdText.textContent = count;
    } else {
      clearInterval(timer);
      cd.style.display = 'none';
      showHickGame(n);
    }
  }, 600);
}

function showHickGame(n) {
  var round = generateHickRound(n);
  var target = round.options[round.targetIndex];
  document.getElementById('hickTargetSwatch').style.background = target.color;
  document.getElementById('hickTargetName').textContent = target.label;

  var grid = document.getElementById('hickGrid');
  grid.innerHTML = '';
  for (var i = 0; i < round.options.length; i++) {
    var btn = document.createElement('div');
    btn.className = 'hick-btn';
    btn.style.background = round.options[i].color;
    btn.setAttribute('data-idx', i);
    btn.setAttribute('data-correct', i === round.targetIndex ? '1' : '0');
    btn.onclick = onHickClick;
    grid.appendChild(btn);
  }

  document.getElementById('hickGame').style.display = 'block';
  state.hickStartTime = performance.now();
}

function onHickClick(e) {
  var btn = e.currentTarget;
  var rt = performance.now() - state.hickStartTime;
  var correct = btn.getAttribute('data-correct') === '1';
  var n = state.hickRounds[state.hickCurrent];

  state.hickResults.push({ n: n, rt: Math.round(rt), correct: correct });

  // 禁用所有按钮
  var btns = document.querySelectorAll('.hick-btn');
  for (var i = 0; i < btns.length; i++) btns[i].onclick = null;

  btn.classList.add(correct ? 'correct' : 'wrong');

  var feedback = document.getElementById('hickRoundFeedback');
  if (correct) {
    feedback.innerHTML = '<span style="color:#22c55e"><i class="ti ti-check"></i> ' + Math.round(rt) + 'ms</span>';
  } else {
    feedback.innerHTML = '<span style="color:#ef4444"><i class="ti ti-x"></i> 点错了（' + Math.round(rt) + 'ms）</span>';
  }
  document.getElementById('hickRoundResult').style.display = 'block';
  document.getElementById('hickGame').style.display = 'none';
}

function nextHickRound() {
  state.hickCurrent++;
  if (state.hickCurrent < state.hickRounds.length) {
    startHickRound();
  } else {
    showHickSummary();
  }
}

function showHickSummary() {
  document.getElementById('hickCountdown').style.display = 'none';
  document.getElementById('hickGame').style.display = 'none';
  document.getElementById('hickRoundResult').style.display = 'none';
  document.getElementById('hickProgress').style.width = '100%';

  var correctData = state.hickResults.filter(function(r) { return r.correct; });
  var fit = hickFit(correctData);

  var info = '拟合结果：RT = ' + Math.round(fit.a) + ' + ' + Math.round(fit.b) + ' × log₂(n+1)，R² = ' + fit.r2.toFixed(3);
  document.getElementById('hickFitInfo').textContent = info;

  // 计算 Hick 分数：斜率越大 = 越容易过载
  // 典型斜率 100~300ms，映射到 0~100
  state.hickScore = Math.min(100, Math.max(0, Math.round((fit.b - 50) / 3)));

  document.getElementById('hickSummary').style.display = 'block';

  // 画图
  loadChartJS().then(function() {
    drawHickChart('hickChart', correctData, fit);
  });
}

function drawHickChart(canvasId, data, fit) {
  var ctx = document.getElementById(canvasId).getContext('2d');
  var labels = data.map(function(d) { return d.n + '个'; });
  var actual = data.map(function(d) { return d.rt; });
  var predicted = data.map(function(d) { return Math.round(fit.a + fit.b * Math.log2(d.n + 1)); });

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { label: '你的反应时间', data: actual, borderColor: '#f5af19', backgroundColor: 'rgba(245,175,25,0.1)', tension: 0.3, pointRadius: 5, pointBackgroundColor: '#f5af19' },
        { label: 'Hick 定律预测', data: predicted, borderColor: '#64748b', borderDash: [6, 4], backgroundColor: 'transparent', tension: 0.3, pointRadius: 3, pointBackgroundColor: '#64748b' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#94a3b8' } } },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#94a3b8', callback: function(v) { return v + 'ms'; } }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

// ══════════════════════════════════════
// 关卡二：决策疲劳
// ══════════════════════════════════════
function startFatiguePhase() {
  showPhase('phaseFatigue');
  state.fatigueCurrent = 0;
  state.fatigueResults = [];
  showFatigueQuestion();
}

function showFatigueQuestion() {
  if (state.fatigueCurrent >= state.fatigueTotal) {
    showFatigueSummary();
    return;
  }

  var q = FATIGUE_QUESTIONS[state.fatigueCurrent];
  document.getElementById('fatigueMeta').textContent = '第 ' + (state.fatigueCurrent + 1) + ' / ' + state.fatigueTotal + ' 题 · 每题限时 5 秒 · 选项数：' + q.opts.length;
  document.getElementById('fatigueProgress').style.width = (state.fatigueCurrent / state.fatigueTotal * 100) + '%';
  document.getElementById('fatigueQuestion').textContent = q.q;
  document.getElementById('fatigueCard').style.display = 'block';
  document.getElementById('fatigueSummary').style.display = 'none';

  var optsEl = document.getElementById('fatigueOptions');
  optsEl.innerHTML = '';
  for (var i = 0; i < q.opts.length; i++) {
    var btn = document.createElement('div');
    btn.className = 'fatigue-opt';
    btn.textContent = q.opts[i];
    btn.onclick = (function(idx) { return function() { onFatigueChoose(idx); }; })(i);
    optsEl.appendChild(btn);
  }

  // 倒计时
  state.fatigueStartTime = performance.now();
  var timerEl = document.getElementById('fatigueTimer');
  timerEl.textContent = '5.0';
  timerEl.classList.remove('warning');

  clearInterval(state.fatigueTimerId);
  state.fatigueTimerId = setInterval(function() {
    var elapsed = performance.now() - state.fatigueStartTime;
    var remaining = Math.max(0, (state.fatigueTimeLimit - elapsed) / 1000);
    timerEl.textContent = remaining.toFixed(1);
    if (remaining <= 1.5) timerEl.classList.add('warning');
    if (remaining <= 0) {
      clearInterval(state.fatigueTimerId);
      onFatigueTimeout();
    }
  }, 50);
}

function onFatigueChoose(idx) {
  clearInterval(state.fatigueTimerId);
  var rt = performance.now() - state.fatigueStartTime;
  var q = FATIGUE_QUESTIONS[state.fatigueCurrent];
  state.fatigueResults.push({
    rt: Math.round(rt),
    chose: idx,
    timeout: false,
    impulsive: isImpulsive(rt),
    optionCount: q.opts.length
  });
  state.fatigueCurrent++;
  showFatigueQuestion();
}

function onFatigueTimeout() {
  var q = FATIGUE_QUESTIONS[state.fatigueCurrent];
  state.fatigueResults.push({
    rt: state.fatigueTimeLimit,
    chose: -1,
    timeout: true,
    impulsive: false,
    optionCount: q.opts.length
  });
  state.fatigueCurrent++;
  showFatigueQuestion();
}

function showFatigueSummary() {
  document.getElementById('fatigueCard').style.display = 'none';
  document.getElementById('fatigueProgress').style.width = '100%';

  // 统计
  var timeouts = state.fatigueResults.filter(function(r) { return r.timeout; }).length;
  var impulsives = state.fatigueResults.filter(function(r) { return r.impulsive; }).length;
  var badRate = (timeouts + impulsives) / state.fatigueTotal;

  // 分数：坏决策比例越高 = 越容易疲劳
  state.fatigueScore = Math.min(100, Math.round(badRate * 150));

  // 后半段 vs 前半段的坏决策比例
  var half = Math.floor(state.fatigueTotal / 2);
  var firstHalf = state.fatigueResults.slice(0, half);
  var secondHalf = state.fatigueResults.slice(half);
  var firstBad = firstHalf.filter(function(r) { return r.timeout || r.impulsive; }).length;
  var secondBad = secondHalf.filter(function(r) { return r.timeout || r.impulsive; }).length;

  var info = '超时 ' + timeouts + ' 次，冲动选择 ' + impulsives + ' 次';
  if (secondBad > firstBad) {
    info += '。后半段坏决策明显增多（' + firstBad + ' → ' + secondBad + '），决策疲劳效应显著。';
  } else {
    info += '。前后半段表现稳定，你的决策耐力不错。';
  }
  document.getElementById('fatigueFitInfo').textContent = info;

  document.getElementById('fatigueSummary').style.display = 'block';

  loadChartJS().then(function() {
    drawFatigueChart();
  });
}

function drawFatigueChart() {
  var ctx = document.getElementById('fatigueChart').getContext('2d');
  var labels = state.fatigueResults.map(function(_, i) { return '第' + (i + 1) + '题'; });
  var rts = state.fatigueResults.map(function(r) { return r.rt; });
  var colors = state.fatigueResults.map(function(r) {
    if (r.timeout) return '#ef4444';
    if (r.impulsive) return '#f59e0b';
    return '#22c55e';
  });

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '反应时间 (ms)',
        data: rts,
        backgroundColor: colors,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterLabel: function(ctx) {
              var r = state.fatigueResults[ctx.dataIndex];
              if (r.timeout) return '⏰ 超时';
              if (r.impulsive) return '⚡ 冲动选择（<400ms）';
              return '✅ 正常';
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: '#94a3b8', callback: function(v) { return v + 'ms'; } }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

// ══════════════════════════════════════
// 关卡三：果酱实验
// ══════════════════════════════════════
function startJamPhase() {
  showPhase('phaseJam');
  renderJamShelf(1, 6);
}

function renderJamShelf(round, count) {
  var jams = generateJamShelf(count);
  var shelfId = 'jamShelf' + round;
  var shelf = document.getElementById(shelfId);
  shelf.innerHTML = '';

  state.jamSelected = null;
  state.jamHoverCount = 0;
  state.jamStartTime = performance.now();

  for (var i = 0; i < jams.length; i++) {
    var card = document.createElement('div');
    card.className = 'jam-card';
    card.setAttribute('data-idx', i);
    card.innerHTML = '<div class="jam-swatch" style="background:' + jams[i].color + '"></div>' +
      '<div class="jam-name">' + jams[i].name + '</div>' +
      '<div class="jam-desc">' + jams[i].desc + '</div>';
    card.onclick = (function(idx, rd) {
      return function() { selectJam(idx, rd); };
    })(i, round);
    card.onmouseenter = function() { state.jamHoverCount++; };
    shelf.appendChild(card);
  }

  document.getElementById('jamConfirm' + round).disabled = true;
}

function selectJam(idx, round) {
  state.jamSelected = idx;
  var cards = document.querySelectorAll('#jamShelf' + round + ' .jam-card');
  for (var i = 0; i < cards.length; i++) {
    cards[i].classList.toggle('selected', parseInt(cards[i].getAttribute('data-idx')) === idx);
  }
  document.getElementById('jamConfirm' + round).disabled = false;
}

function confirmJam(round) {
  var rt = performance.now() - state.jamStartTime;
  if (round === 1) {
    state.jamData.round1 = { rt: Math.round(rt), hovers: state.jamHoverCount, selected: state.jamSelected };
    document.getElementById('jamRound1').style.display = 'none';
    renderSatStars(1);
    document.getElementById('jamSat1').style.display = 'block';
  } else {
    state.jamData.round2 = { rt: Math.round(rt), hovers: state.jamHoverCount, selected: state.jamSelected };
    document.getElementById('jamRound2').style.display = 'none';
    renderSatStars(2);
    document.getElementById('jamSat2').style.display = 'block';
  }
}

function renderSatStars(round) {
  var row = document.getElementById('satRow' + round);
  row.innerHTML = '';
  for (var i = 1; i <= 5; i++) {
    var star = document.createElement('span');
    star.className = 'sat-star';
    star.textContent = '★';
    star.setAttribute('data-val', i);
    star.onclick = (function(val, rd) {
      return function() { rateSat(val, rd); };
    })(i, round);
    row.appendChild(star);
  }
}

function rateSat(val, round) {
  state.jamSatisfaction[round - 1] = val;
  var stars = document.querySelectorAll('#satRow' + round + ' .sat-star');
  for (var i = 0; i < stars.length; i++) {
    stars[i].classList.toggle('active', parseInt(stars[i].getAttribute('data-val')) <= val);
  }
  document.getElementById('satLabel' + round).textContent = val + ' / 5 星';
  document.getElementById('satConfirm' + round).disabled = false;
}

function confirmSat(round) {
  if (round === 1) {
    document.getElementById('jamSat1').style.display = 'none';
    document.getElementById('jamRound2').style.display = 'block';
    renderJamShelf(2, 24);
  } else {
    document.getElementById('jamSat2').style.display = 'none';
    showJamSummary();
  }
}

function showJamSummary() {
  var r1 = state.jamData.round1;
  var r2 = state.jamData.round2;

  document.getElementById('jam6Time').textContent = (r1.rt / 1000).toFixed(1) + 's';
  document.getElementById('jam24Time').textContent = (r2.rt / 1000).toFixed(1) + 's';
  document.getElementById('jam6Sat').textContent = '满意度 ' + state.jamSatisfaction[0] + '/5';
  document.getElementById('jam24Sat').textContent = '满意度 ' + state.jamSatisfaction[1] + '/5';

  var timeRatio = r2.rt / Math.max(r1.rt, 1);
  var satDiff = state.jamSatisfaction[0] - state.jamSatisfaction[1];

  var insight = '';
  if (timeRatio > 2) {
    insight = '24 种果酱让你花了 ' + timeRatio.toFixed(1) + ' 倍的时间，选项多了 4 倍，犹豫时间翻了 ' + timeRatio.toFixed(1) + ' 倍。';
  } else if (timeRatio > 1.3) {
    insight = '选项多了 4 倍，你的选择时间增加了 ' + Math.round((timeRatio - 1) * 100) + '%，属于中等程度的选择过载。';
  } else {
    insight = '你在两轮中的选择速度差不多，你可能是那种「快速决策型」选手。';
  }
  if (satDiff > 0) {
    insight += ' 而且选项少的时候你反而更满意——这正是果酱实验的核心发现。';
  } else if (satDiff === 0) {
    insight += ' 两轮满意度相同，说明选项数量没有影响你的主观感受。';
  }

  document.getElementById('jamInsight').textContent = insight;

  // 果酱分数：时间比 + 满意度差 + 悬停次数差
  var timeScore = Math.min(50, Math.round((timeRatio - 1) * 30));
  var satScore = Math.max(0, satDiff * 10);
  var hoverScore = Math.min(20, Math.round((r2.hovers - r1.hovers) / 3));
  state.jamScore = Math.min(100, Math.max(0, timeScore + satScore + hoverScore));

  document.getElementById('jamSummary').style.display = 'block';
}

// ══════════════════════════════════════
// 最终结果
// ══════════════════════════════════════
function showResult() {
  showPhase('phaseResult');

  var index = choiceOverloadIndex({
    hickScore: state.hickScore,
    fatigueScore: state.fatigueScore,
    jamScore: state.jamScore
  });
  var grade = overloadGrade(index);

  document.getElementById('resultScore').textContent = index;
  document.getElementById('resultScore').style.color = grade.color;
  document.getElementById('resultGrade').innerHTML = '<span style="color:' + grade.color + '">' + grade.grade + ' · ' + grade.label + '</span>';
  document.getElementById('resultDesc').textContent = grade.desc;

  // 三维度条
  var dims = [
    { label: 'Hick 敏感度', score: state.hickScore, color: '#f5af19' },
    { label: '决策疲劳度', score: state.fatigueScore, color: '#ef4444' },
    { label: '选择犹豫度', score: state.jamScore, color: '#3b82f6' }
  ];
  var dimHtml = '';
  for (var i = 0; i < dims.length; i++) {
    dimHtml += '<div class="dim-item">';
    dimHtml += '<div class="dim-label">' + dims[i].label + '</div>';
    dimHtml += '<div class="dim-bar-bg"><div class="dim-bar-fill" style="width:' + dims[i].score + '%;background:' + dims[i].color + '"><span>' + dims[i].score + '</span></div></div>';
    dimHtml += '</div>';
  }
  document.getElementById('dimBars').innerHTML = dimHtml;

  // 结果页 Hick 曲线
  var correctData = state.hickResults.filter(function(r) { return r.correct; });
  var fit = hickFit(correctData);
  loadChartJS().then(function() {
    drawHickChart('resultHickChart', correctData, fit);
  });
}

// ══════════════════════════════════════
// 工具函数
// ══════════════════════════════════════
function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, 2500);
}

function copyShareText() {
  var index = choiceOverloadIndex({
    hickScore: state.hickScore,
    fatigueScore: state.fatigueScore,
    jamScore: state.jamScore
  });
  var grade = overloadGrade(index);
  var text = '我的选择困难指数：' + index + '（' + grade.label + '）\n';
  text += 'Hick 敏感度 ' + state.hickScore + ' | 决策疲劳度 ' + state.fatigueScore + ' | 选择犹豫度 ' + state.jamScore + '\n';
  text += '你呢？👉 https://numfeel.996.ninja/pages/choice-overload/';

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function() {
      showToast('已复制到剪贴板');
    });
  } else {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('已复制到剪贴板');
  }
}

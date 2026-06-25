// ========== DOM 绑定 + 互动逻辑（依赖 engine.js） ==========
var BASE = 100;
var D_CR = 0.05;
var D_CD = 0.10;
var BOSS_HP = 1500;

var state = {
  cr: 0.30,
  cd: 1.00,
  upgrades: 0,
  quizIdx: 0,
  quizScore: 0,
  quizAnswers: [],
  bossA: { cr: 0.5, cd: 1.0, hp: BOSS_HP, hits: 0, log: [], done: false },
  bossB: { cr: 0.25, cd: 2.0, hp: BOSS_HP, hits: 0, log: [], done: false }
};

// ─── 全局工具 ────────────────────────────────────────
function fmt(v, digits) {
  digits = digits == null ? 2 : digits;
  return Number(v).toFixed(digits);
}
function pct(v) { return Math.round(v * 100) + '%'; }
function $(id) { return document.getElementById(id); }
function on(el, ev, fn) { if (el && el.addEventListener) el.addEventListener(ev, fn); }
function onEach(list, ev, fn) {
  if (!list) return;
  for (var i = 0; i < list.length; i++) {
    var node = list[i];
    if (node && node.addEventListener) node.addEventListener(ev, fn);
  }
}

// ─── 进度条联动 ────────────────────────────────────
function markStep(n) {
  var steps = document.querySelectorAll('.progress-wrap .step');
  for (var i = 0; i < steps.length; i++) {
    if (i + 1 <= n) steps[i].classList.add('done');
    else steps[i].classList.remove('done');
  }
}

function goNext(targetId) {
  var el = document.getElementById(targetId);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (targetId === 'simulator') markStep(2);
  if (targetId === 'boss') markStep(3);
  if (targetId === 'distribution') markStep(4);
}

// ─── 第 1 关：直觉测试 ───────────────────────────────
var QUIZ = [
  {
    title: '刚抽到的角色：暴击率 10% / 暴击伤害 50%。下一条副词条选哪个？',
    correct: 'rate',
    why: '暴击率才 10%，加 5% 就能从 1/10 拉到 3/20。暴伤再高也只 10% 触发，太浪费。'
  },
  {
    title: '已成型的角色：暴击率 60% / 暴击伤害 80%。下一条选哪个？',
    correct: 'damage',
    why: '暴伤/暴率 ≈ 1.33，暴伤滞后。补暴伤收益 +6，补暴击率只 +4。'
  },
  {
    title: '暴击率 95% / 暴击伤害 280%。下一条还加暴击率有意义吗？',
    correct: 'damage',
    why: '暴击率 100% 封顶，超出归零。补暴伤 +9.5 永远能拿到，补暴击率溢出后无效。'
  }
];

function renderQuiz() {
  var q = QUIZ[state.quizIdx];
  $('quizStep').textContent = '第 ' + (state.quizIdx + 1) + ' / ' + QUIZ.length + ' 题';
  $('quizScore').textContent = state.quizScore;
  $('quizScenario').textContent = q.title;
  $('quizFeedback').style.display = 'none';
  $('btnRate').disabled = false;
  $('btnDmg').disabled = false;
}

function quizChoose(choice) {
  var q = QUIZ[state.quizIdx];
  var correct = choice === q.correct;
  if (correct) state.quizScore++;
  state.quizAnswers.push({ q: q.title, pick: choice, correct: correct, why: q.why });

  var fb = $('quizFeedback');
  fb.style.display = 'block';
  fb.className = 'quiz-feedback ' + (correct ? 'ok' : 'bad');
  fb.innerHTML = (correct ? '<i class="ti ti-check"></i> 答对了！' : '<i class="ti ti-x"></i> 答错了')
    + '<p>' + q.why + '</p>';

  $('btnRate').disabled = true;
  $('btnDmg').disabled = true;

  setTimeout(function() {
    state.quizIdx++;
    if (state.quizIdx >= QUIZ.length) showQuizResult();
    else renderQuiz();
  }, 1800);
}

function showQuizResult() {
  $('quizCard').style.display = 'none';
  $('quizResult').style.display = 'block';
  var s = state.quizScore;
  var t;
  if (s === 3) t = '满分！直觉很准，去第 2 关验算。';
  else if (s === 2) t = '不错，有一题踩中新手常错的地方。';
  else if (s === 1) t = '直觉偏了，下面 3 关帮你校准。';
  else t = '别慌，这题不查公式基本没人能全对。';
  $('resultScore').textContent = s + ' / ' + QUIZ.length;
  $('resultText').textContent = t;

  var html = '';
  for (var i = 0; i < state.quizAnswers.length; i++) {
    var a = state.quizAnswers[i];
    var correctLabel = a.correct === 'rate' ? '暴击率 +5%' : '暴击伤害 +10%';
    var pickLabel = a.pick === 'rate' ? '暴击率 +5%' : '暴击伤害 +10%';
    var pickTag = a.correct
      ? '<span class="tag tag-ok">你选对了 · ' + pickLabel + '</span>'
      : '<span class="tag tag-bad">你选了 ' + pickLabel + '，正解是 ' + correctLabel + '</span>';
    html += '<div class="answer-row ' + (a.correct ? 'ok' : 'bad') + '">'
      + '<span class="answer-icon"><i class="ti ti-' + (a.correct ? 'check' : 'x') + '"></i></span>'
      + '<div class="answer-body">'
      + '<div class="answer-q">' + a.q + '</div>'
      + pickTag
      + '<div class="answer-why">' + a.why + '</div>'
      + '</div></div>';
  }
  $('answerReview').innerHTML = html;
}

// ─── 第 2 关：面板计算器 + 升级按钮 ──────────────────
function refreshPanel() {
  var cr = state.cr;
  var cd = state.cd;

  $('crVal').textContent = pct(cr);
  $('cdVal').textContent = pct(cd);

  var best = bestUpgrade(BASE, cr, cd, D_CR, D_CD);
  var exp = expectedDamage(BASE, cr, cd);
  var std = damageStd(BASE, cr, cd);

  $('curExp').textContent = fmt(exp);
  $('curStd').textContent = fmt(std);

  $('upRateGain').textContent = '+' + fmt(best.rateGain);
  $('upDmgGain').textContent = '+' + fmt(best.dmgGain);

  $('upRate').classList.toggle('winner', best.choice === 'rate');
  $('upDmg').classList.toggle('winner', best.choice === 'damage');

  var rateFootnote = best.capped ? '（暴击率溢出，实际只加 ' + ((1 - cr) * 100).toFixed(0) + '%）' : '当前期望 + ' + fmt(best.rateGain) + ' 伤害';
  $('upRate').querySelector('.up-foot').textContent = rateFootnote;
  $('upDmg').querySelector('.up-foot').textContent = '当前期望 + ' + fmt(best.dmgGain) + ' 伤害';

  if (best.choice === 'rate') {
    $('suggest').textContent = '+5% 暴击率';
    $('suggest').style.color = '#ff8a8a';
    $('suggestSub').textContent = '期望多 +' + fmt(best.rateGain - best.dmgGain);
  } else {
    $('suggest').textContent = '+10% 暴击伤害';
    $('suggest').style.color = '#ce93d8';
    $('suggestSub').textContent = '期望多 +' + fmt(best.dmgGain - best.rateGain);
  }

  var ratio = cr > 0 ? cd / cr : 0;
  var crossover = crossoverCd(cr, D_CR, D_CD);
  if (cr === 0) {
    $('ratioHint').innerHTML = '<i class="ti ti-info-circle"></i> 暴击率为 0 时暴伤无效，先把暴击率拉起来。';
  } else if (Math.abs(ratio - 2) < 0.15) {
    $('ratioHint').innerHTML = '<i class="ti ti-check"></i> 暴伤/暴率 ≈ 2.0，你正好踩在黄金分割线上。';
  } else if (ratio < 2) {
    $('ratioHint').innerHTML = '<i class="ti ti-arrow-up-right"></i> 暴伤/暴率 = ' + fmt(ratio) + '，暴伤滞后。要追上 1:2 线需要把暴伤堆到 ' + pct(crossover) + '。';
  } else {
    $('ratioHint').innerHTML = '<i class="ti ti-arrow-down-right"></i> 暴伤/暴率 = ' + fmt(ratio) + '，暴伤已超前。该回头补暴击率。';
  }

  if ($('regionYouDot')) {
    var svgX = 60 + (cr * 100 / 100) * 480;
    var svgY = 320 - (Math.min(cd, 3) / 300) * 300;
    $('regionYouDot').setAttribute('transform', 'translate(' + svgX + ', ' + svgY + ')');
  }
}

function doUpgrade(choice) {
  var next = applyUpgrade(state.cr, state.cd, choice, D_CR, D_CD);
  state.cr = next.cr;
  state.cd = next.cd;
  state.upgrades++;
  $('crInput').value = Math.round(state.cr * 100);
  $('cdInput').value = Math.round(state.cd * 100);
  $('upgradeCount').textContent = state.upgrades;
  refreshPanel();
  pulseUpgradeButton(choice);
}

function pulseUpgradeButton(choice) {
  var btn = choice === 'rate' ? $('upRate') : $('upDmg');
  if (!btn) return;
  btn.classList.remove('pulse');
  void btn.offsetWidth;
  btn.classList.add('pulse');
}

function resetUpgrades() {
  state.cr = 0.30;
  state.cd = 1.00;
  state.upgrades = 0;
  $('crInput').value = 30;
  $('cdInput').value = 100;
  $('upgradeCount').textContent = 0;
  refreshPanel();
}

on($('crInput'), 'input', function(e) { state.cr = parseInt(e.target.value, 10) / 100; refreshPanel(); });
on($('cdInput'), 'input', function(e) { state.cd = parseInt(e.target.value, 10) / 100; refreshPanel(); });

// ─── 预设芯片按钮 ────────────────────────────────────
onEach(document.querySelectorAll('.chip'), 'click', function(e) {
  var btn = e.currentTarget;
  if (!btn) return;
  state.cr = parseInt(btn.getAttribute('data-cr'), 10) / 100;
  state.cd = parseInt(btn.getAttribute('data-cd'), 10) / 100;
  state.upgrades = 0;
  $('crInput').value = Math.round(state.cr * 100);
  $('cdInput').value = Math.round(state.cd * 100);
  $('upgradeCount').textContent = 0;
  refreshPanel();
});

// 兼容老版 .preset-btn 的同类监听（避免缓存带来的 null 报错）
onEach(document.querySelectorAll('.preset-btn'), 'click', function(e) {
  var btn = e.currentTarget;
  if (!btn) return;
  state.cr = parseInt(btn.getAttribute('data-cr'), 10) / 100;
  state.cd = parseInt(btn.getAttribute('data-cd'), 10) / 100;
  state.upgrades = 0;
  if ($('crInput')) $('crInput').value = Math.round(state.cr * 100);
  if ($('cdInput')) $('cdInput').value = Math.round(state.cd * 100);
  if ($('upgradeCount')) $('upgradeCount').textContent = 0;
  refreshPanel();
});

// ─── 第 3 关：Boss 战 ────────────────────────────────
function renderBoss(side) {
  var s = state[side];
  var prefix = side === 'bossA' ? 'bossA' : 'bossB';
  $(prefix + 'Cr').textContent = pct(s.cr);
  $(prefix + 'Cd').textContent = pct(s.cd);
  $(prefix + 'HpBar').style.width = (Math.max(0, s.hp) / BOSS_HP * 100) + '%';
  $(prefix + 'HpBar').style.background = s.hp <= 0 ? 'linear-gradient(90deg, #6b6, #4a4)' : '';
  $(prefix + 'HpText').textContent = Math.max(0, Math.round(s.hp)) + ' / ' + BOSS_HP;
  $(prefix + 'Hits').textContent = '已砍 ' + s.hits + ' 刀';
  var logEl = $(prefix + 'Log');
  var last = s.log.slice(-5);
  logEl.innerHTML = last.map(function(entry) {
    return '<span class="dmg-entry ' + (entry.crit ? 'crit' : 'normal') + '">'
      + (entry.crit ? '<i class="ti ti-flame"></i> ' : '')
      + '-' + entry.damage + '</span>';
  }).join('');
}

function attack(side) {
  var s = state[side];
  if (s.done) return;
  var hit = rollHit(BASE, s.cr, s.cd);
  s.hp -= hit.damage;
  s.hits++;
  s.log.push(hit);
  renderBoss(side);
  if (s.hp <= 0) finishBoss(side);
}

function finishBoss(side) {
  var s = state[side];
  s.done = true;
  var prefix = side === 'bossA' ? 'bossA' : 'bossB';
  var tag = side === 'bossA' ? '高暴击率' : '高暴伤';
  var note = s.cr > 0.4 ? '节奏稳、波动小' : '波动大、赌爆头';
  $(prefix + 'Summary').style.display = 'block';
  $(prefix + 'Summary').innerHTML = '<i class="ti ti-trophy"></i> 击杀！用了 <strong>' + s.hits + '</strong> 刀。<br><span class="boss-note">' + note + '</span>';
  $(prefix + 'Summary').classList.add('victory');
}

function resetBoss(side) {
  state[side] = { cr: state[side].cr, cd: state[side].cd, hp: BOSS_HP, hits: 0, log: [], done: false };
  var prefix = side === 'bossA' ? 'bossA' : 'bossB';
  $(prefix + 'Summary').style.display = 'none';
  $(prefix + 'Summary').classList.remove('victory');
  renderBoss(side);
}

function autoBoss(side) {
  var s = state[side];
  if (s.done) return;
  var interval = setInterval(function() {
    if (!state[side] || state[side].done) { clearInterval(interval); return; }
    if (state[side].done) { clearInterval(interval); return; }
    attack(side);
    if (state[side].done) clearInterval(interval);
  }, 80);
}

function attackA() { attack('bossA'); }
function attackB() { attack('bossB'); }
function resetBossA() { resetBoss('bossA'); }
function resetBossB() { resetBoss('bossB'); }
function autoBossA() { autoBoss('bossA'); }
function autoBossB() { autoBoss('bossB'); }

// ─── 第 4 关 + 概览：分布直方图 ──────────────────────
var distChartA = null;
var distChartB = null;

function refreshDistributions() {
  var n = parseInt($('simCount').value, 10) || 10000;
  var sampA = simulateHits(BASE, 0.5, 1.0, n);
  var sampB = simulateHits(BASE, 0.25, 2.0, n);

  $('distExpA').textContent = arrayMean(sampA).toFixed(1);
  $('distStdA').textContent = arrayStd(sampA).toFixed(1);
  $('distExpB').textContent = arrayMean(sampB).toFixed(1);
  $('distStdB').textContent = arrayStd(sampB).toFixed(1);

  var histA = histogram(sampA, 16);
  var histB = histogram(sampB, 16);

  drawDist('distChartA', histA, 'rgba(129, 199, 132, 0.6)', distChartA, function(c) { distChartA = c; });
  drawDist('distChartB', histB, 'rgba(255, 107, 107, 0.6)', distChartB, function(c) { distChartB = c; });

  $('distCompare').innerHTML = '<div class="compare-row">'
    + '<div class="compare-cell"><strong>A 标准差</strong> = ' + arrayStd(sampA).toFixed(1) + '</div>'
    + '<div class="compare-cell"><strong>B 标准差</strong> = ' + arrayStd(sampB).toFixed(1) + '</div>'
    + '<div class="compare-cell"><strong>B 的方差</strong> ≈ A 的 <strong>' + ((arrayStd(sampB) * arrayStd(sampB)) / (arrayStd(sampA) * arrayStd(sampA))).toFixed(1) + '</strong> 倍</div>'
    + '</div>';
}

function drawDist(canvasId, hist, color, oldChart, setter) {
  if (oldChart) oldChart.destroy();
  var ctx = $(canvasId).getContext('2d');
  var labels = hist.bins.map(function(b) { return b.toFixed(0); });
  var newChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '次数',
        data: hist.counts,
        backgroundColor: color,
        borderColor: color.replace('0.6', '1'),
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: '单次伤害', color: '#a0a0a0' }, ticks: { color: '#a0a0a0', maxRotation: 0, autoSkip: true, maxTicksLimit: 6 }, grid: { display: false } },
        y: { ticks: { color: '#a0a0a0' }, grid: { color: 'rgba(255,255,255,0.06)' } }
      }
    }
  });
  setter(newChart);
}

// ─── 初始化 ──────────────────────────────────────────
window.addEventListener('load', function() {
  renderQuiz();
  refreshPanel();
  renderBoss('bossA');
  renderBoss('bossB');
  refreshDistributions();
  markStep(1);
});

// 暴露给 inline onclick
window.quizChoose = quizChoose;
window.doUpgrade = doUpgrade;
window.resetUpgrades = resetUpgrades;
window.attackA = attackA;
window.attackB = attackB;
window.resetBossA = resetBossA;
window.resetBossB = resetBossB;
window.autoBossA = autoBossA;
window.autoBossB = autoBossB;
window.refreshDistributions = refreshDistributions;
window.goNext = goNext;
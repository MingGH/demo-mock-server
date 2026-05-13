// ===== 无限猴子打字机 v1 =====
const API_BASE = 'https://numfeel-api.996.ninja';

// 预设
const PRESETS = [
  { label: 'hi', text: 'hi' },
  { label: 'abc', text: 'abc' },
  { label: 'cat', text: 'cat' },
  { label: 'monkey', text: 'monkey' },
  { label: 'to be', text: 'to be' },
  { label: '自定义', text: '' }
];

// 状态
let target = 'hi';
let targetLen = 2;
let alphabetSize = Engine.alphabetSize;

// 模拟状态
let running = false;
let animId = null;
let totalAttempts = 0;
let totalChars = 0;
let currentAttempt = [];      // 当前尝试的字符数组
let matchedCount = 0;         // 当前尝试连续匹配了几个
let lastMatchLen = 0;         // 本轮最佳连续匹配长度
let startTime = 0;
let success = false;
let speed = 2000;             // 每秒尝试次数（每次尝试 = targetLen 个字符）
let charsPerTick = 1;         // 每帧生成的尝试次数

// DOM 缓存
let cellsEl, tapeEl, tapeFillEl;
let statsAttempts, statsChars, statsExpected, statsTime, statsMatch;
let speedSlider, speedVal;
let successBanner;
let globalStatsEl;

function $(id) { return document.getElementById(id); }

// ===== 初始化 =====
function init() {
  cellsEl = $('targetCells');
  tapeEl = $('tapeView');
  tapeFillEl = $('tapeFill');
  statsAttempts = $('statsAttempts');
  statsChars = $('statsChars');
  statsExpected = $('statsExpected');
  statsTime = $('statsTime');
  statsMatch = $('statsMatch');
  speedSlider = $('speedSlider');
  speedVal = $('speedVal');
  successBanner = $('successBanner');
  globalStatsEl = $('globalStats');

  bindEvents();
  selectPreset(0);
  renderTarget();
  loadGlobalStats();
}

function bindEvents() {
  $('preset').addEventListener('change', function() {
    const idx = parseInt(this.value);
    selectPreset(idx);
  });
  $('customInput').addEventListener('input', function() {
    const clean = Engine.sanitizeTarget(this.value);
    this.value = clean;
    if (clean.length > 0) {
      target = clean;
      targetLen = clean.length;
      renderTarget();
      resetStats();
    }
  });
  $('runBtn').addEventListener('click', toggleRun);
  speedSlider.addEventListener('input', function() {
    speed = parseInt(this.value);
    speedVal.textContent = speed.toLocaleString();
    updateExpectedDisplay();
  });
  $('retryBtn').addEventListener('click', resetAndRun);
}

function selectPreset(idx) {
  if (idx === 5) {
    $('customRow').style.display = 'flex';
    $('customInput').focus();
    $('preset').value = '5';
    return;
  }
  $('customRow').style.display = 'none';
  target = PRESETS[idx].text;
  targetLen = target.length;
  resetStats();
  renderTarget();
  successBanner.style.display = 'none';
  updateExpectedDisplay();
}

// ===== 渲染目标 =====
function renderTarget() {
  cellsEl.innerHTML = '';
  for (let i = 0; i < targetLen; i++) {
    const cell = document.createElement('span');
    cell.className = 't-cell';
    cell.textContent = target[i];
    cell.id = 'tc' + i;
    cellsEl.appendChild(cell);
  }
}

// ===== 开始/暂停 =====
function toggleRun() {
  if (running) {
    pause();
  } else {
    run();
  }
}

function run() {
  if (running || targetLen === 0) return;
  running = true;
  success = false;
  successBanner.style.display = 'none';
  $('runBtn').innerHTML = '<i class="ti ti-player-pause"></i> 暂停';
  $('runBtn').classList.add('running');
  if (totalAttempts === 0) startTime = performance.now();
  resetAttempt();
  tick();
}

function pause() {
  running = false;
  if (animId) cancelAnimationFrame(animId);
  animId = null;
  $('runBtn').innerHTML = '<i class="ti ti-player-play"></i> 开始';
  $('runBtn').classList.remove('running');
}

function resetAndRun() {
  totalAttempts = 0;
  totalChars = 0;
  lastMatchLen = 0;
  startTime = 0;
  success = false;
  successBanner.style.display = 'none';
  renderTarget();
  updateStats();
  tapeEl.textContent = '';
  tapeFillEl.style.width = '0%';
  run();
}

function resetStats() {
  pause();
  totalAttempts = 0;
  totalChars = 0;
  lastMatchLen = 0;
  startTime = 0;
  success = false;
  successBanner.style.display = 'none';
  tapeEl.textContent = '';
  tapeFillEl.style.width = '0%';
  updateStats();
  updateExpectedDisplay();
}

// ===== 模拟循环 =====
function resetAttempt() {
  currentAttempt = [];
  matchedCount = 0;
}

function tick() {
  if (!running) return;

  const batchSize = Math.ceil(speed / 60); // 每帧 (60fps) 的尝试次数
  let done = false;

  for (let b = 0; b < batchSize; b++) {
    totalAttempts++;

    // 生成一个随机字符
    const ch = Engine.randomChar();
    const pos = currentAttempt.length;
    currentAttempt.push(ch);
    totalChars++;

    if (ch === target[pos]) {
      matchedCount++;
      if (matchedCount > lastMatchLen) lastMatchLen = matchedCount;

      if (matchedCount === targetLen) {
        // 成功！
        done = true;
        success = true;
        break;
      }
    } else {
      // 不匹配，重置
      resetAttempt();
    }
  }

  // 更新显示
  renderCurrentAttempt();
  renderTape(done);
  updateStats();
  updateExpectedDisplay();

  if (done) {
    onSuccess();
    return;
  }

  animId = requestAnimationFrame(tick);
}

function renderCurrentAttempt() {
  for (let i = 0; i < targetLen; i++) {
    const cell = document.getElementById('tc' + i);
    if (!cell) continue;
    cell.classList.remove('tc-match', 'tc-wrong', 'tc-current');
    if (i < currentAttempt.length) {
      if (currentAttempt[i] === target[i]) {
        cell.classList.add('tc-match');
      } else {
        cell.classList.add('tc-wrong');
      }
    } else if (i === currentAttempt.length) {
      cell.classList.add('tc-current');
    }
  }
}

function renderTape(done) {
  // 显示最近的尝试
  const show = currentAttempt.join('');
  tapeEl.textContent = done ? target + ' ✓' : show;

  // 进度条：已尝试 vs 期望
  const expected = Engine.expectedAttempts(targetLen, alphabetSize);
  const pct = Math.min(100, (totalAttempts / expected) * 100);
  tapeFillEl.style.width = pct.toFixed(1) + '%';
  tapeFillEl.style.background = pct > 100
    ? 'linear-gradient(90deg, #4caf50, #ffd700)'
    : pct > 50
      ? 'linear-gradient(90deg, #ff9800, #f44336)'
      : 'linear-gradient(90deg, #2196f3, #9c27b0)';
}

function onSuccess() {
  running = false;
  if (animId) cancelAnimationFrame(animId);
  animId = null;
  $('runBtn').innerHTML = '<i class="ti ti-player-play"></i> 开始';
  $('runBtn').classList.remove('running');

  // 成功动画
  successBanner.style.display = 'flex';
  successBanner.querySelector('.sb-target').textContent = target;
  successBanner.querySelector('.sb-attempts').textContent = totalAttempts.toLocaleString();
  successBanner.querySelector('.sb-chars').textContent = totalChars.toLocaleString();
  const elapsed = (performance.now() - startTime) / 1000;
  successBanner.querySelector('.sb-time').textContent = elapsed.toFixed(1);

  // 所有单元格变绿
  for (let i = 0; i < targetLen; i++) {
    const cell = document.getElementById('tc' + i);
    if (cell) {
      cell.classList.add('tc-success');
      cell.classList.remove('tc-match', 'tc-wrong', 'tc-current');
    }
  }

  // 上报后端
  submitStats();
}

// ===== 统计更新 =====
function updateStats() {
  statsAttempts.textContent = totalAttempts.toLocaleString();
  statsChars.textContent = totalChars.toLocaleString();
  if (startTime > 0) {
    const elapsed = (performance.now() - startTime) / 1000;
    statsTime.textContent = elapsed.toFixed(1) + ' 秒';
  } else {
    statsTime.textContent = '--';
  }
  statsMatch.textContent = lastMatchLen + ' / ' + targetLen;
}

function updateExpectedDisplay() {
  const expected = Engine.expectedAttempts(targetLen, alphabetSize);
  statsExpected.innerHTML = '期望 ~' + Engine.formatBigNum(expected) + ' 次尝试';
  statsExpected.title = '基于 ' + alphabetSize + ' 个字符的字母表，期望尝试次数 = ' + alphabetSize + '^' + targetLen + ' = ' + expected.toLocaleString();
}

// ===== 全局统计 =====
function loadGlobalStats() {
  fetch(API_BASE + '/monkey/stats')
    .then(r => r.json())
    .then(data => {
      if (data.status === 200) updateGlobalStats(data.data);
    }).catch(() => {});
}

function updateGlobalStats(data) {
  if (!data || data.totalRuns === 0) {
    globalStatsEl.innerHTML = '还没有人让猴子打出过目标...';
    return;
  }
  globalStatsEl.innerHTML =
    `<span class="gs-chip">🐒 ${data.totalRuns.toLocaleString()} 次挑战</span>` +
    `<span class="gs-chip">✅ ${data.totalSuccesses.toLocaleString()} 次成功</span>` +
    `<span class="gs-chip">📊 成功率 ${(Math.round(data.successRate * 1000) / 10).toFixed(1)}%</span>` +
    (data.longestTarget ? `<span class="gs-chip">🏆 最长目标 "${data.longestTarget}"</span>` : '');
}

function submitStats() {
  const elapsed = startTime > 0 ? Math.round(performance.now() - startTime) : 0;
  fetch(API_BASE + '/monkey/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetText: target,
      targetLength: targetLen,
      totalAttempts: totalAttempts,
      totalChars: totalChars,
      success: success,
      timeElapsed: elapsed
    })
  }).then(r => r.json()).then(data => {
    if (data.status === 200) updateGlobalStats(data.data);
  }).catch(() => {});
}

// ===== 启动 =====
document.addEventListener('DOMContentLoaded', init);

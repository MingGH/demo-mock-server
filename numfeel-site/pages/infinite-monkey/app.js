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
let submitted = false;        // 本轮是否已上报（防重复）
let speed = 2000;             // 每秒尝试次数（每次尝试 = targetLen 个字符）
let charsPerTick = 1;         // 每帧生成的尝试次数

// ===== 行为埋点（通用埋点 SDK，见 components/track.js） =====
// 事件清单：
//   session_start  (trackOnce) 记录一次会话及初始目标长度，回答「多少人体验、目标难度分布」
//   target_change  用户切换预设/自定义目标，回答「用户倾向选多难的目标」
//   run_action     用户开始/暂停运行，回答「运行/暂停交互频率」
//   sim_success    模拟打出目标，回答「成功所需尝试次数与字符数」
//   sim_abandon    中途放弃（未成功），回答「放弃时已尝试多少」
//   session_end    (force) 真正离页 pagehide，回答「单次会话最终状态」
// 仅低频收尾事件镜像到 umami。
if (typeof window !== 'undefined') {
  window.NF_TRACK_UMAMI_MIRROR = ['session_end'];
}

/** 安全调用 NFTrack；SDK 未加载、被拦截或抛错都不应影响页面。 */
function nfTrack(name, props, opts) {
  try {
    if (window.NFTrack && typeof window.NFTrack.track === 'function') {
      window.NFTrack.track(name, props, opts);
    }
  } catch (e) {
    // 埋点绝不能影响主流程
  }
}

/** 同名事件整个会话只记一次（对应 SDK 的 trackOnce）。 */
function nfTrackOnce(name, props) {
  try {
    if (window.NFTrack && typeof window.NFTrack.trackOnce === 'function') {
      window.NFTrack.trackOnce(name, props);
    }
  } catch (e) {
    // 埋点绝不能影响主流程
  }
}

function trackSessionEnd(reason) {
  nfTrack('session_end', {
    reason: reason,
    targetLen: targetLen,
    attempts: totalAttempts,
    chars: totalChars,
    success: success
  }, { force: true });
}

function registerTrackLeaveHandler() {
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      nfTrack('session_hidden', {
        reason: 'hidden',
        targetLen: targetLen,
        attempts: totalAttempts,
        chars: totalChars,
        success: success
      }, { force: true });
    }
  });
  window.addEventListener('pagehide', function () { trackSessionEnd('leave'); });
}

// DOM 缓存
let cellsEl, tapeEl, tapeFillEl;
let statsAttempts, statsChars, statsExpected, statsTime, statsMatch;
let speedSlider, speedVal;
let successBanner;
let globalStatsEl;
let leaderboardEl;

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
  leaderboardEl = $('leaderboard');

  bindEvents();
  selectPreset(0);
  renderTarget();
  loadGlobalStats();
  setInterval(loadGlobalStats, 5000);
  nfTrackOnce('session_start', { targetLen: targetLen, alphabetSize: alphabetSize });
  registerTrackLeaveHandler();
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
      nfTrack('target_change', { source: 'custom', targetLen: targetLen });
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
  nfTrack('target_change', { source: 'preset', targetLen: targetLen });
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
  nfTrack('run_action', { action: running ? 'pause' : 'run' });
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
  if (totalAttempts === 0) {
    startTime = performance.now();
    submitted = false;
  }
  resetAttempt();
  tick();
}

function pause() {
  if (!running) return;
  running = false;
  if (animId) cancelAnimationFrame(animId);
  animId = null;
  $('runBtn').innerHTML = '<i class="ti ti-player-play"></i> 开始';
  $('runBtn').classList.remove('running');
}

// 上报放弃（暂停或切换目标时，已跑过但未成功）
function submitAbandon() {
  if (submitted || totalAttempts === 0) return;
  submitted = true;
  nfTrack('sim_abandon', {
    targetLen: targetLen,
    attempts: totalAttempts,
    chars: totalChars
  });
  submitStats(); // success 此时为 false
}

function resetAndRun() {
  submitAbandon();
  totalAttempts = 0;
  totalChars = 0;
  lastMatchLen = 0;
  startTime = 0;
  success = false;
  submitted = false;
  successBanner.style.display = 'none';
  renderTarget();
  updateStats();
  tapeEl.textContent = '';
  tapeFillEl.style.width = '0%';
  run();
}

function resetStats() {
  pause();
  submitAbandon();
  totalAttempts = 0;
  totalChars = 0;
  lastMatchLen = 0;
  startTime = 0;
  success = false;
  submitted = false;
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
  submitted = true;
  submitStats();
  nfTrack('sim_success', {
    targetLen: targetLen,
    attempts: totalAttempts,
    chars: totalChars,
    elapsedSec: Math.round((performance.now() - startTime) / 1000)
  });
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
  statsExpected.innerHTML = '~' + Engine.formatBigNum(expected) + ' 次';
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
    leaderboardEl.innerHTML = '<div class="lb-empty">暂无成功记录</div>';
    return;
  }
  globalStatsEl.innerHTML =
    `<span class="gs-chip"><i class="ti ti-paw"></i> ${data.totalRuns.toLocaleString()} 次挑战</span>` +
    `<span class="gs-chip"><i class="ti ti-check"></i> ${data.totalSuccesses.toLocaleString()} 次成功</span>` +
    `<span class="gs-chip"><i class="ti ti-chart-pie"></i> 成功率 ${(Math.round(data.successRate * 1000) / 10).toFixed(1)}%</span>` +
    (data.longestTarget ? `<span class="gs-chip"><i class="ti ti-trophy"></i> 最长目标 "${data.longestTarget}"</span>` : '');

  renderLeaderboard(data.leaderboard || []);
}

function renderLeaderboard(list) {
  const successList = list.filter(item => item.success);
  if (successList.length === 0) {
    leaderboardEl.innerHTML = '<div class="lb-empty">暂无成功记录</div>';
    return;
  }
  let html = '<table class="lb-table"><thead><tr>' +
    '<th>#</th><th>目标文本</th><th>字符数</th><th>尝试次数</th>' +
    '</tr></thead><tbody>';
  successList.forEach((item, i) => {
    const rankClass = i === 0 ? 'lb-rank' : i === 1 ? 'lb-rank lb-rank-2' : i === 2 ? 'lb-rank lb-rank-3' : 'lb-rank';
    html += `<tr>` +
      `<td class="${rankClass}">${i + 1}</td>` +
      `<td><span class="lb-target">${escapeHtml(item.targetText)}</span></td>` +
      `<td>${item.targetLength}</td>` +
      `<td class="lb-attempts">${item.totalAttempts.toLocaleString()}</td>` +
      `</tr>`;
  });
  html += '</tbody></table>';
  leaderboardEl.innerHTML = html;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

// 页面关闭时上报未完成的挑战
window.addEventListener('beforeunload', function() {
  if (totalAttempts > 0 && !submitted && !success) {
    submitted = true;
    const elapsed = startTime > 0 ? Math.round(performance.now() - startTime) : 0;
    const blob = new Blob([JSON.stringify({
      targetText: target,
      targetLength: targetLen,
      totalAttempts: totalAttempts,
      totalChars: totalChars,
      success: false,
      timeElapsed: elapsed
    })], { type: 'application/json' });
    navigator.sendBeacon(API_BASE + '/monkey/submit', blob);
  }
});

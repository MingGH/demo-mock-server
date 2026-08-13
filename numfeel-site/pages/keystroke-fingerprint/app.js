/**
 * 键盘输入节奏识别 - 主交互逻辑
 * 依赖：engine.js（纯逻辑）、Chart.js、components/header.js
 */

/* 全局状态 */
var API_BASE = 'https://numfeel-api.996.ninja';
var samples = [];        // 两遍特征样本 [{features, errorCount, totalMs, textHash}]
var currentSample = 0;   // 当前是第几遍（0/1）
var typing = false;
var keyDownMap = {};     // key -> down 时间戳（未抬起）
var rawEvents = [];      // 当前遍的完成事件序列
var holdChart = null;
var intervalChart = null;

// ========== 行为埋点（NFTrack，见 components/track.js） ==========
// 事件清单：
//   session_start (trackOnce) 页面加载
//   typing_done   每遍打完（低频），回答「用户完成了几遍打字」
//   compare_done  提交并拉取全站对比
//   session_end   (force) 真正离页 pagehide，reason=leave
if (typeof window !== 'undefined') {
  window.NF_TRACK_UMAMI_MIRROR = ['compare_done', 'session_end'];
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
  var input = document.getElementById('typeInput');
  input.disabled = false;
  startTyping();
  input.focus();
}

function startTyping() {
  if (typing) return;
  typing = true;
  keyDownMap = {};
  rawEvents = [];
  document.getElementById('typeInput').value = '';
  updateProgress('', 0);
  updateError(0);
  startTimer();
}

// ── 计时 ──
var timerStart = 0;
var timerInterval = null;
function startTimer() {
  timerStart = Date.now();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(function () {
    var sec = ((Date.now() - timerStart) / 1000).toFixed(1);
    document.getElementById('timerText').textContent = sec + 's';
  }, 100);
}

// ── 键盘事件采集 ──
function onKeyDown(e) {
  if (!typing) return;
  var key = e.key;
  if (key.length !== 1) return; // 只记单字符（含空格）
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (keyDownMap[key] !== undefined) return; // 重复 down 忽略
  keyDownMap[key] = Date.now();
}

function onKeyUp(e) {
  if (!typing) return;
  var key = e.key;
  if (key.length !== 1) return;
  var down = keyDownMap[key];
  if (down === undefined) return;
  delete keyDownMap[key];
  rawEvents.push({ key: key, down: down, up: Date.now() });
}

// ── 输入变化：校验进度与错误 ──
function onInput() {
  if (!typing) return;
  var input = document.getElementById('typeInput');
  var typed = input.value;
  var target = TARGET_TEXT;

  // 计算匹配前缀
  var i = 0;
  while (i < typed.length && i < target.length && typed[i] === target[i]) {
    i++;
  }
  var matched = i;
  var errors = typed.length - matched;

  updateProgress(typed, matched);
  updateError(errors);

  // 输入长度达到目标 → 完成（打错也完成，错误已实时统计）
  if (typed.length >= target.length) {
    finishTyping();
  }
}

function updateProgress(typed, matched) {
  var total = TARGET_TEXT.length;
  document.getElementById('progressText').textContent = matched + ' / ' + total;
}

function updateError(n) {
  document.getElementById('errorText').textContent = n;
}

// ── 完成一遍 ──
function finishTyping() {
  if (!typing) return;
  typing = false;
  if (timerInterval) clearInterval(timerInterval);

  var features = extractFeatures(rawEvents);

  // 移动端软键盘不触发 keydown/keyup → 无按键时间数据，提示用实体键盘
  if (features.validKeys === 0) {
    document.getElementById('stageTag').textContent = '请使用实体键盘';
    document.getElementById('typeInput').disabled = true;
    var hint = document.createElement('button');
    hint.className = 'btn-primary btn-wide';
    hint.id = 'retryBtn';
    hint.innerHTML = '<i class="ti ti-keyboard"></i> 用键盘重新打一遍';
    hint.onclick = function () {
      hint.remove();
      document.getElementById('typeInput').disabled = false;
      startTyping();
    };
    document.getElementById('typingStatus').appendChild(hint);
    return;
  }

  var errorCount = 0;
  var input = document.getElementById('typeInput');
  var typed = input.value;
  for (var k = 0; k < typed.length; k++) {
    if (typed[k] !== TARGET_TEXT[k]) errorCount++;
  }

  samples.push({
    features: features,
    errorCount: errorCount,
    totalMs: Date.now() - timerStart,
    textHash: hashText(TARGET_TEXT)
  });
  nfTrack('typing_done', { sample: currentSample, errors: errorCount });

  document.getElementById('typeInput').disabled = true;

  if (currentSample === 0) {
    currentSample = 1;
    document.getElementById('stageTag').textContent = '第 2 遍 · 保持自然';
    var btn = document.createElement('button');
    btn.className = 'btn-primary btn-wide';
    btn.id = 'retryBtn';
    btn.innerHTML = '<i class="ti ti-repeat"></i> 再打一遍（第 2 遍）';
    btn.onclick = function () {
      btn.remove();
      document.getElementById('typeInput').disabled = false;
      startTyping();
    };
    document.getElementById('typingStatus').appendChild(btn);
  } else {
    // 两遍完成 → 分析
    document.getElementById('stageTag').textContent = '完成 · 分析你的节奏';
    showAnalysis();
  }
}

// ── 节奏对比分析 ──
function showAnalysis() {
  var f1 = samples[0].features;
  var f2 = samples[1].features;
  var judge = judgeStability(f1, f2);

  document.getElementById('analysisSection').style.display = 'block';
  document.getElementById('stabilityGrade').textContent = judge.grade;
  var colors = { '优秀': '#81c784', '良好': '#90caf9', '一般': '#ffd700', '不稳定': '#ff6b6b', '无法评估': '#888' };
  document.getElementById('stabilityGrade').style.color = colors[judge.grade] || '#888';
  document.getElementById('stabilityDetail').textContent =
    '两遍节奏距离 ' + judge.distance + '（越小越稳定）。第 1 遍耗时 ' + (samples[0].totalMs / 1000).toFixed(1) +
    's，第 2 遍耗时 ' + (samples[1].totalMs / 1000).toFixed(1) + 's。';

  renderHoldChart(f1, f2);
  renderIntervalChart(f1, f2);
}

// ── 波形图 ──
function renderHoldChart(f1, f2) {
  var ctx = document.getElementById('holdChart');
  if (!ctx) return;
  if (holdChart) holdChart.destroy();
  var maxLen = Math.max(f1.holdTimes.length, f2.holdTimes.length);
  var labels = [];
  for (var i = 0; i < maxLen; i++) labels.push('键 ' + (i + 1));
  holdChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: '第 1 遍', data: f1.holdTimes, backgroundColor: 'rgba(255,215,0,0.7)', borderRadius: 3 },
        { label: '第 2 遍', data: f2.holdTimes, backgroundColor: 'rgba(144,202,249,0.7)', borderRadius: 3 }
      ]
    },
    options: chartOptions('按压时长 (ms)', true)
  });
}

function renderIntervalChart(f1, f2) {
  var ctx = document.getElementById('intervalChart');
  if (!ctx) return;
  if (intervalChart) intervalChart.destroy();
  var maxLen = Math.max((f1.intervals || []).length, (f2.intervals || []).length);
  var labels = [];
  for (var i = 0; i < maxLen; i++) labels.push('间隔 ' + (i + 1));
  intervalChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: '第 1 遍', data: f1.intervals || [], backgroundColor: 'rgba(255,215,0,0.5)', borderRadius: 3 },
        { label: '第 2 遍', data: f2.intervals || [], backgroundColor: 'rgba(144,202,249,0.5)', borderRadius: 3 }
      ]
    },
    options: chartOptions('键间间隔 (ms)', true)
  });
}

function chartOptions(yTitle) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#aaa' } } },
    scales: {
      x: { ticks: { color: '#888', maxRotation: 0, autoSkip: true, maxTicksLimit: 24 }, grid: { display: false } },
      y: {
        title: { display: true, text: yTitle, color: '#888' },
        ticks: { color: '#888' },
        grid: { color: 'rgba(255,255,255,0.06)' }
      }
    }
  };
}

// ── 提交两遍样本 + 拉全站对比 ──
function submitAndCompare() {
  nfTrack('compare_done', { samples: samples.length });
  if (samples.length === 0) return;
  var sessionId = getSessionId();
  var total = samples.length;
  var done = 0;

  samples.forEach(function (s, idx) {
    var payload = {
      sessionId: sessionId,
      sampleIndex: idx,
      textHash: s.textHash,
      holdTimes: JSON.stringify(s.features.holdTimes),
      intervals: JSON.stringify(s.features.intervals || []),
      totalMs: s.totalMs,
      errorCount: s.errorCount
    };
    fetch(API_BASE + '/keystroke/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json(); })
      .then(function () { checkDone(); })
      .catch(function () { checkDone(); });
  });

  function checkDone() {
    done++;
    if (done >= total) {
      fetchStats(sessionId);
    }
  }
}

function fetchStats(sessionId) {
  fetch(API_BASE + '/keystroke/stats?sessionId=' + encodeURIComponent(sessionId))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.status === 200) {
        renderUnique(data.data);
      }
    })
    .catch(function () { /* 静默 */ });
}

function renderUnique(stats) {
  var box = document.getElementById('uniqueBox');
  box.style.display = 'block';
  var content = document.getElementById('uniqueContent');
  if (stats.totalSamples === 0) {
    content.innerHTML = '还没有足够多的全站样本，先成为第一个吧！';
    return;
  }
  var html = '全站共 <strong>' + stats.totalSamples + '</strong> 份打字样本，平均整句耗时 <strong>' +
    (stats.avgTotalMs / 1000).toFixed(1) + 's</strong>，平均按压时长 <strong>' + Math.round(stats.avgHoldMs) +
    'ms</strong>，平均键间间隔 <strong>' + Math.round(stats.avgIntervalMs) + 'ms</strong>。';
  if (stats.nearestDistance >= 0) {
    html += '<br>你的指纹与全站最接近的样本距离 <strong>' + stats.nearestDistance +
      '</strong>（距离越大越独特）。';
  } else {
    html += '<br>你的样本已提交，下次再来就能看到独特性对比。';
  }
  content.innerHTML = html;

  // 结果区
  document.getElementById('resultSection').style.display = 'block';
  if (samples.length >= 2) {
    var judge = judgeStability(samples[0].features, samples[1].features);
    document.getElementById('resStability').textContent = judge.grade + '（' + judge.distance + '）';
  } else {
    document.getElementById('resStability').textContent = '-';
  }
  document.getElementById('resSamples').textContent = stats.totalSamples;
  document.getElementById('resAvgTime').textContent = (stats.avgTotalMs / 1000).toFixed(1) + 's';
  document.getElementById('resNearest').textContent =
    stats.nearestDistance >= 0 ? stats.nearestDistance : '样本不足';

  document.getElementById('resultSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function getSessionId() {
  try {
    if (!window.sessionStorage) return 'unknown';
    var key = 'keystroke-session';
    var id = window.sessionStorage.getItem(key);
    if (!id) {
      id = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      window.sessionStorage.setItem(key, id);
    }
    return id;
  } catch (e) {
    return 'unknown';
  }
}

// ── 重开 ──
function restartDemo() {
  samples = [];
  currentSample = 0;
  rawEvents = [];
  keyDownMap = {};
  typing = false;
  if (timerInterval) clearInterval(timerInterval);
  document.getElementById('analysisSection').style.display = 'none';
  document.getElementById('uniqueBox').style.display = 'none';
  document.getElementById('resultSection').style.display = 'none';
  document.getElementById('stageTag').textContent = '第 1 遍 · 自然打字';
  var retryBtn = document.getElementById('retryBtn');
  if (retryBtn) retryBtn.remove();
  var input = document.getElementById('typeInput');
  input.value = '';
  input.disabled = false;
  document.getElementById('progressText').textContent = '0 / ' + TARGET_TEXT.length;
  document.getElementById('errorText').textContent = '0';
  document.getElementById('timerText').textContent = '0.0s';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  input.focus();
  startTyping();
  nfTrack('demo_restart', {});
}

// ── 暴露给 HTML ──
window.onKeyDown = onKeyDown;
window.onKeyUp = onKeyUp;
window.onInput = onInput;
window.submitAndCompare = submitAndCompare;
window.restartDemo = restartDemo;

// ── 测试钩子 ──
window.__kt = {
  getSamples: function () { return samples.slice(); },
  startTyping: startTyping,
  finishTyping: finishTyping,
  isTyping: function () { return typing; },
  injectEvents: function (events) { rawEvents = events; },
  setTyping: function (v) { typing = v; }
};

// 启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ========== 密码哈希破解竞速 — UI 逻辑 ==========

// ── 状态 ──
var currentPreset = null;
var currentResults = null;
var latencyClicks = { A: 0, B: 0 };
var latencyRevealed = false;
var latencyDelays = {}; // 随机分配

// ── 初始化 ──
(function init() {
  renderPresets();
  renderCompareTable();
  initLatencyTest();
})();

// ── 渲染预设卡片 ──
function renderPresets() {
  var grid = document.getElementById('presetGrid');
  var html = '';
  for (var i = 0; i < PRESETS.length; i++) {
    var p = PRESETS[i];
    var charset = CHARSETS[p.charset];
    html += '<div class="preset-card" data-id="' + p.id + '" onclick="selectPreset(\'' + p.id + '\')">';
    html += '<div class="preset-title">' + p.label + '</div>';
    html += '<div class="preset-detail">' + p.length + '位 · ' + charset.label + ' · ' + charset.size + '种字符</div>';
    html += '<div class="preset-example">' + p.example + '</div>';
    html += '</div>';
  }
  grid.innerHTML = html;
}

// ── 选择预设 ──
function selectPreset(id) {
  var preset = PRESETS.find(function(p) { return p.id === id; });
  if (!preset) return;

  // 更新UI高亮
  var cards = document.querySelectorAll('.preset-card');
  cards.forEach(function(card) { card.classList.remove('active'); });
  var activeCard = document.querySelector('[data-id="' + id + '"]');
  if (activeCard) activeCard.classList.add('active');

  currentPreset = preset;
  runRace(preset.length, preset.charset, preset.label + '（' + preset.example + '）');
}

// ── 自定义运行 ──
function runCustom() {
  var length = parseInt(document.getElementById('customLength').value) || 8;
  var charset = document.getElementById('customCharset').value;
  var charsetObj = CHARSETS[charset];
  var label = length + '位 ' + charsetObj.label + ' 密码';

  // 去除预设高亮
  document.querySelectorAll('.preset-card').forEach(function(c) { c.classList.remove('active'); });
  currentPreset = null;

  runRace(length, charset, label);
}

// ── 执行竞速 ──
function runRace(length, charsetKey, description) {
  var section = document.getElementById('raceSection');
  section.style.display = '';

  var charset = CHARSETS[charsetKey];
  var keyspace = calcKeyspace(length, charset.size);

  document.getElementById('raceDesc').textContent =
    '密码：' + description + ' | 搜索空间：' + formatBigNumber(keyspace) + ' 种组合';

  var results = calcAllCrackTimes(length, charsetKey);
  currentResults = results;

  // 渲染竞速条
  renderRaceTrack(results);

  // 渲染结果卡片
  renderResultGrid(results);

  // 渲染洞察
  renderInsight(results);

  // 更新分享文本
  updateShareText(description, results);

  // 滚动到竞速区域
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── 渲染竞速条 ──
function renderRaceTrack(results) {
  var track = document.getElementById('raceTrack');
  var html = '';

  // 找到最慢的（用于百分比计算）
  var maxLog = 0;
  for (var i = 0; i < results.length; i++) {
    var logVal = results[i].crackSeconds > 0 ? Math.log10(results[i].crackSeconds + 1) : 0;
    if (logVal > maxLog) maxLog = logVal;
  }

  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    var logTime = r.crackSeconds > 0 ? Math.log10(r.crackSeconds + 1) : 0;
    // 反转：破解越快，条越短（意味着防护越差）
    // 用对数标尺，最长的是最安全的
    var percent = maxLog > 0 ? (logTime / maxLog * 100) : 0;
    // 最小宽度保证可见
    if (percent < 3 && r.crackSeconds > 0) percent = 3;
    if (r.crackSeconds === 0) percent = 1;

    html += '<div class="race-item">';
    html += '<div class="race-label">';
    html += '<span class="race-algo-name" style="color:' + r.color + '">' + r.name + '</span>';
    html += '<span class="race-speed">' + r.speedLabel + '</span>';
    html += '</div>';
    html += '<div class="race-bar-wrap">';
    html += '<div class="race-bar" id="bar-' + r.algo + '" style="width:0%;background:' + r.color + ';">' + formatTime(r.crackSeconds) + '</div>';
    html += '</div>';
    html += '<div class="race-time" style="color:' + r.color + '">破解耗时：' + formatTime(r.crackSeconds) + ' | 登录耗时：' + r.loginMs.toFixed(0) + 'ms</div>';
    html += '</div>';
  }
  track.innerHTML = html;

  // 动画：延迟设置宽度
  setTimeout(function() {
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      var logTime = r.crackSeconds > 0 ? Math.log10(r.crackSeconds + 1) : 0;
      var percent = maxLog > 0 ? (logTime / maxLog * 100) : 0;
      if (percent < 3 && r.crackSeconds > 0) percent = 3;
      if (r.crackSeconds === 0) percent = 1;
      var bar = document.getElementById('bar-' + r.algo);
      if (bar) bar.style.width = percent + '%';
    }
  }, 100);
}

// ── 渲染结果卡片 ──
function renderResultGrid(results) {
  var grid = document.getElementById('resultGrid');
  var factors = calcSpeedupFactors(results);

  var html = '';
  html += '<div class="result-card">';
  html += '<div class="result-label">MD5 vs bcrypt 防护倍数</div>';
  html += '<div class="result-value" style="color:#81c784">x' + formatBigNumber(Math.round(factors.md5VsBcrypt)) + '</div>';
  html += '<div class="result-sub">bcrypt 让攻击者慢这么多倍</div>';
  html += '</div>';

  html += '<div class="result-card">';
  html += '<div class="result-label">MD5 vs Argon2 防护倍数</div>';
  html += '<div class="result-value" style="color:#3b82f6">x' + formatBigNumber(Math.round(factors.md5VsArgon2)) + '</div>';
  html += '<div class="result-sub">Argon2 的内存硬特性额外加码</div>';
  html += '</div>';

  html += '<div class="result-card">';
  html += '<div class="result-label">你多付出的登录延迟</div>';
  html += '<div class="result-value" style="color:#ffd700">80ms</div>';
  html += '<div class="result-sub">bcrypt 对比无哈希多花 80 毫秒</div>';
  html += '</div>';

  grid.innerHTML = html;
}

// ── 渲染洞察 ──
function renderInsight(results) {
  var box = document.getElementById('insightBox');
  var text = document.getElementById('insightText');

  var md5 = results.find(function(r) { return r.algo === 'md5'; });
  var bcrypt = results.find(function(r) { return r.algo === 'bcrypt_10'; });
  var argon2 = results.find(function(r) { return r.algo === 'argon2id'; });

  var msg = '';
  if (md5.crackSeconds < 1) {
    msg += 'MD5 存储下，这个密码瞬间就被破解。';
  } else if (md5.crackSeconds < 3600) {
    msg += 'MD5 存储下，这个密码 ' + formatTime(md5.crackSeconds) + ' 即可破解。';
  } else {
    msg += 'MD5 存储下，破解需要 ' + formatTime(md5.crackSeconds) + '。';
  }

  msg += '换成 bcrypt (cost=10) 后，同样的攻击需要 ' + formatTime(bcrypt.crackSeconds) + '。';

  if (argon2.crackSeconds > 31557600 * 100) {
    msg += '用 Argon2id 则需要 ' + formatTime(argon2.crackSeconds) + '，在可预见的未来无法暴力破解。';
  } else {
    msg += '用 Argon2id 需要 ' + formatTime(argon2.crackSeconds) + '。';
  }

  text.textContent = msg;
  box.style.display = '';
}

// ── 对比总表 ──
function renderCompareTable() {
  var body = document.getElementById('compareBody');
  var html = '';
  for (var i = 0; i < PRESETS.length; i++) {
    var p = PRESETS[i];
    var results = calcAllCrackTimes(p.length, p.charset);
    html += '<tr>';
    html += '<td>' + p.label + '<br><span style="color:#888;font-size:0.75rem;">' + p.length + '位 ' + CHARSETS[p.charset].label + '</span></td>';
    for (var j = 0; j < results.length; j++) {
      var timeStr = formatTime(results[j].crackSeconds);
      var color = results[j].crackSeconds < 3600 ? '#ff6b6b' :
                  results[j].crackSeconds < 31557600 ? '#ffb74d' : '#81c784';
      html += '<td class="col-time" style="color:' + color + '">' + timeStr + '</td>';
    }
    html += '</tr>';
  }
  body.innerHTML = html;
}

// ── 延迟感知测试 ──
function initLatencyTest() {
  // 随机分配：A和B谁是20ms谁是100ms
  if (Math.random() < 0.5) {
    latencyDelays = { A: 20, B: 100 };
  } else {
    latencyDelays = { A: 100, B: 20 };
  }
  latencyClicks = { A: 0, B: 0 };
  latencyRevealed = false;
}

function handleLatencyClick(which) {
  if (latencyRevealed) return;
  var btn = document.getElementById('latencyBtn' + which);
  var delay = latencyDelays[which];

  // 进入 loading 状态
  btn.disabled = true;
  btn.innerHTML = '<span class="latency-icon"><i class="ti ti-loader-2 ti-spin"></i></span>验证中...';
  btn.style.opacity = '0.7';

  setTimeout(function() {
    // 显示登录成功
    btn.innerHTML = '<span class="latency-icon"><i class="ti ti-circle-check" style="color:#81c784"></i></span>登录成功';
    btn.style.opacity = '1';
    btn.style.borderColor = '#81c784';
    btn.disabled = false;

    // 1.5秒后恢复原始状态，允许再次点击体验
    setTimeout(function() {
      btn.innerHTML = '<span class="latency-icon"><i class="ti ti-letter-' + which.toLowerCase() + '"></i></span>点我登录';
      btn.style.borderColor = 'rgba(255,255,255,0.15)';
    }, 1500);
  }, delay);

  latencyClicks[which]++;

  // 两个都点了至少一次后显示猜测按钮
  if (latencyClicks.A >= 1 && latencyClicks.B >= 1) {
    document.getElementById('guessRow').style.display = 'flex';
    document.getElementById('latencyResult').querySelector('p').textContent =
      '两个按钮都试过了。哪个延迟更高？';
  }
}

function guessLatency(guess) {
  if (latencyRevealed) return;
  latencyRevealed = true;

  var slower = latencyDelays.A > latencyDelays.B ? 'A' : 'B';
  var isCorrect = (guess === slower);
  var isSame = (guess === 'same');

  // 高亮猜测按钮
  var btns = document.querySelectorAll('.guess-btn');
  btns.forEach(function(b) { b.disabled = true; });

  var resultEl = document.getElementById('latencyResult');
  resultEl.classList.add('revealed');

  var msg = '';
  if (isSame) {
    msg = '你觉得一样？正常。80ms 的差距人类几乎无法感知。';
  } else if (isCorrect) {
    msg = '猜对了！但大多数人分不出来。80ms 的差距在真实登录场景中完全不影响体验。';
  } else {
    msg = '猜错了。说明 80ms 的差距真的很难感受到。';
  }

  msg += ' 实际延迟：A = ' + latencyDelays.A + 'ms，B = ' + latencyDelays.B + 'ms。';
  resultEl.querySelector('p').textContent = msg;

  // 显示洞察
  var insight = document.getElementById('latencyInsight');
  var insightText = document.getElementById('latencyInsightText');
  insight.style.display = '';
  insightText.textContent =
    '用户每次登录多等 80ms，感知差异可以忽略。' +
    '但攻击者每尝试一个密码就多花 80ms，十亿次就是 80,000,000 秒 ≈ 2.5 年。' +
    '你付出的成本：每次登录 0.08 秒。攻击者付出的成本：每个密码 0.08 秒 × 十亿个密码。这就是慢哈希的非对称优势。';
}

// ── 分享 ──
function updateShareText(desc, results) {
  var md5 = results.find(function(r) { return r.algo === 'md5'; });
  var bcrypt = results.find(function(r) { return r.algo === 'bcrypt_10'; });
  var factors = calcSpeedupFactors(results);

  var text = '【密码哈希破解竞速】\n';
  text += '密码：' + desc + '\n';
  text += 'MD5 破解：' + formatTime(md5.crackSeconds) + '\n';
  text += 'bcrypt 破解：' + formatTime(bcrypt.crackSeconds) + '\n';
  text += '防护提升：' + formatBigNumber(Math.round(factors.md5VsBcrypt)) + ' 倍\n';
  text += '你多等：80ms | 攻击者多等：' + formatTime(bcrypt.crackSeconds) + '\n';
  text += '体验：https://numfeel.996.ninja/pages/hash-crack-race/';

  document.getElementById('shareText').textContent = text;
  document.getElementById('copyBtn').disabled = false;
}

function copyShare() {
  var text = document.getElementById('shareText').textContent;
  navigator.clipboard.writeText(text).then(function() {
    showToast('已复制到剪贴板');
  }).catch(function() {
    showToast('复制失败，请手动复制');
  });
}

// ── Toast ──
function showToast(msg) {
  var toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(function() { toast.classList.remove('show'); }, 2500);
}

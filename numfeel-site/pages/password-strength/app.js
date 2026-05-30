// ========== 密码强度可视化 — UI 交互逻辑 ==========

var chartInstance = null;
var currentPassword = '';

function $(id) { return document.getElementById(id); }

// ── 初始化 ──
document.addEventListener('DOMContentLoaded', function() {
  bindEvents();
  renderCompareCards();
});

function bindEvents() {
  var input = $('passwordInput');
  if (input) {
    input.addEventListener('input', function() {
      var pwd = input.value;
      currentPassword = pwd;
      analyzePassword(pwd);
    });
  }

  var toggleBtn = $('togglePwd');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function() {
      var inputEl = $('passwordInput');
      var icon = toggleBtn.querySelector('i');
      if (inputEl.type === 'password') {
        inputEl.type = 'text';
        icon.className = 'ti ti-eye-off';
      } else {
        inputEl.type = 'password';
        icon.className = 'ti ti-eye';
      }
    });
  }

  var copyBtn = $('copyBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', copyShareText);
  }
}

// ── 主分析函数 ──
function analyzePassword(pwd) {
  if (!pwd) {
    resetDisplay();
    return;
  }

  // 信息熵
  var entResult = calcEntropy(pwd);
  var entropy = entResult.entropy;

  // 强度等级
  var level = getStrengthLevel(entropy);

  // 字符集
  var cs = detectCharsets(pwd);

  // 破解时间
  var crackTimes = calcAllCrackTimes(entropy);

  // 弱模式
  var patterns = detectPatterns(pwd);

  // 更新 UI
  updateStrengthDisplay(level, entropy);
  updateStats(entResult, cs);
  updateCrackTimes(crackTimes, entropy);
  updateCharsetDisplay(cs);
  updateWarnings(patterns);
  updateTimescale(entropy);
  updateShareText(pwd, entropy, cs, level, crackTimes);
}

// ── 强度条 ──
function updateStrengthDisplay(level, entropy) {
  var bar = $('strengthBar');
  var label = $('strengthLabel');
  var entDisp = $('entropyDisplay');

  bar.style.width = level.percent + '%';
  bar.style.background = level.color;
  label.textContent = level.label;
  label.style.color = level.color;
  entDisp.textContent = entropy.toFixed(1) + ' bit';
}

// ── 统计信息 ──
function updateStats(entResult, cs) {
  $('statLength').textContent = entResult.length;
  $('statCharset').textContent = cs.size;
  $('statEntropy').textContent = entResult.entropy.toFixed(1) + ' bit';
  var keyspace = Math.pow(2, entResult.entropy);
  if (keyspace < 1e6) {
    $('statKeyspace').textContent = Math.floor(keyspace).toLocaleString();
  } else {
    $('statKeyspace').textContent = '2^' + entResult.entropy.toFixed(1);
  }
}

// ── 破解时间 ──
function updateCrackTimes(crackTimes, entropy) {
  for (var i = 0; i < crackTimes.length; i++) {
    var ct = crackTimes[i];
    var cell;
    if (ct.key === 'online') cell = $('crackOnline');
    else if (ct.key === 'offline_gpu') cell = $('crackGpu');
    else if (ct.key === 'offline_nation') cell = $('crackNation');
    if (cell) {
      cell.textContent = ct.formatted;
      // 根据时间着色
      if (ct.seconds > 31e6) {
        cell.style.color = '#22c55e';
      } else if (ct.seconds > 86400) {
        cell.style.color = '#eab308';
      } else {
        cell.style.color = '#ef4444';
      }
    }
  }
}

// ── 破解时间标尺 ──
function updateTimescale(entropy) {
  var wrap = $('timescaleWrap');
  var marker = $('timescaleMarker');
  if (!wrap || !marker) return;

  if (entropy <= 0) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'block';

  // 对数尺度映射：entropy 0~256 映射到 0%~100%
  var maxEntropy = 200;
  var clampedEntropy = Math.min(entropy, maxEntropy);
  // 使用对数映射让低熵区域更宽
  var percent = (Math.log(clampedEntropy + 1) / Math.log(maxEntropy + 1)) * 100;
  marker.style.left = percent + '%';

  // 根据熵值生成标签
  if (entropy < 28) {
    marker.setAttribute('data-label', '秒级');
  } else if (entropy < 36) {
    marker.setAttribute('data-label', '分钟级');
  } else if (entropy < 60) {
    marker.setAttribute('data-label', '年级');
  } else if (entropy < 128) {
    marker.setAttribute('data-label', '百万年级');
  } else {
    marker.setAttribute('data-label', '宇宙年龄级');
  }

  // 动画
  marker.classList.remove('pulse');
  void marker.offsetWidth;
  marker.classList.add('pulse');
}

// ── 字符集显示 ──
function updateCharsetDisplay(cs) {
  var lower = $('csLower');
  var upper = $('csUpper');
  var digit = $('csDigit');
  var special = $('csSpecial');

  if (lower) lower.className = cs.lowercase ? 'charset-check active' : 'charset-check';
  if (upper) upper.className = cs.uppercase ? 'charset-check active' : 'charset-check';
  if (digit) digit.className = cs.digits ? 'charset-check active' : 'charset-check';
  if (special) special.className = cs.special ? 'charset-check active' : 'charset-check';

  renderCharsetChart(cs);
}

// ── 字符集饼图 ──
function renderCharsetChart(cs) {
  var ctx = document.getElementById('charsetChart');
  if (!ctx) return;
  var canvas = ctx;

  // 准备数据
  var labels = [];
  var data = [];
  var colors = [];
  var totalSize = cs.size || 0;

  if (cs.lowercase) { labels.push('小写字母 (26)'); data.push(26); colors.push('#3b82f6'); }
  if (cs.uppercase) { labels.push('大写字母 (26)'); data.push(26); colors.push('#22c55e'); }
  if (cs.digits) { labels.push('数字 (10)'); data.push(10); colors.push('#f59e0b'); }
  if (cs.special) { labels.push('特殊字符 (33)'); data.push(33); colors.push('#ef4444'); }

  if (data.length === 0) {
    labels = ['无字符'];
    data = [1];
    colors = ['#64748b'];
  }

  loadChartJS().then(function() {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }

    chartInstance = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors,
          borderColor: 'rgba(26,26,46,1)',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#94a3b8',
              padding: 16,
              font: { size: 12 }
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                var label = context.label || '';
                var value = context.parsed;
                var pct = totalSize > 0 ? ((value / totalSize) * 100).toFixed(0) : 0;
                return label + ': ' + value + ' (' + pct + '%)';
              }
            }
          }
        }
      }
    });
  });
}

// ── 弱模式警告 ──
function updateWarnings(patterns) {
  var noWarn = $('noWarnings');
  var warnList = $('warningList');
  if (!noWarn || !warnList) return;

  warnList.innerHTML = '';

  if (patterns.length === 0) {
    noWarn.style.display = 'flex';
    return;
  }

  noWarn.style.display = 'none';
  for (var i = 0; i < patterns.length; i++) {
    var p = patterns[i];
    var li = document.createElement('li');
    li.className = 'warning-item';
    var icon = 'ti-alert-circle';
    if (p.type === 'common') icon = 'ti-file-like';
    else if (p.type === 'keyboard') icon = 'ti-keyboard';
    else if (p.type === 'repeat') icon = 'ti-repeat';
    else if (p.type === 'substring-repeat') icon = 'ti-repeat';
    else if (p.type === 'date') icon = 'ti-calendar-event';
    else if (p.type === 'sequential') icon = 'ti-arrows-sort';
    li.innerHTML = '<i class="ti ' + icon + '"></i><span>' + p.description + '</span>';
    warnList.appendChild(li);
  }
}

// ── 对比卡片 ──
function renderCompareCards() {
  var grid = $('compareGrid');
  if (!grid) return;
  var cards = grid.querySelectorAll('.compare-card');

  for (var i = 0; i < cards.length; i++) {
    (function(card) {
      var pwd = card.getAttribute('data-pwd');
      var entResult = calcEntropy(pwd);
      var entropy = entResult.entropy;
      var level = getStrengthLevel(entropy);
      var ct = calcAllCrackTimes(entropy);
      var onlineFormatted = ct[0] ? ct[0].formatted : '--';

      var timeEl = card.querySelector('.cmp-time');
      var levelEl = card.querySelector('.cmp-level');
      if (timeEl) timeEl.textContent = '在线破解：' + onlineFormatted;
      if (levelEl) {
        levelEl.textContent = '强度：' + level.label + ' (' + entropy.toFixed(1) + ' bit)';
        levelEl.style.color = level.color;
      }

      card.addEventListener('click', function() {
        var input = $('passwordInput');
        if (input) {
          input.value = pwd;
          currentPassword = pwd;
          analyzePassword(pwd);
        }
        // 选中高亮
        var allCards = grid.querySelectorAll('.compare-card');
        for (var j = 0; j < allCards.length; j++) {
          allCards[j].classList.remove('selected');
        }
        card.classList.add('selected');
      });
    })(cards[i]);
  }
}

// ── 分享文本 ──
function updateShareText(pwd, entropy, cs, level, crackTimes) {
  var shareEl = $('shareText');
  var copyBtn = $('copyBtn');
  if (!shareEl) return;

  var text = '🔐 密码强度分析结果\n';
  text += '━━━━━━━━━━━━━━━━\n';
  text += '信息熵：' + entropy.toFixed(1) + ' bit\n';
  text += '强度等级：' + level.label + '\n';
  text += '密码长度：' + pwd.length + ' 位\n';
  text += '字符集大小：' + cs.size + '\n';
  text += '━━━━━━━━━━━━━━━━\n';
  text += '暴力破解时间估算：\n';
  for (var i = 0; i < crackTimes.length; i++) {
    var ct = crackTimes[i];
    text += '  · ' + ct.label + '：' + ct.formatted + '\n';
  }
  text += '━━━━━━━━━━━━━━━━\n';
  text += '测试地址：https://numfeel.996.ninja/pages/password-strength/\n';
  text += '（所有计算在浏览器本地完成，密码从未上传）';

  shareEl.textContent = text;
  if (copyBtn) copyBtn.disabled = false;
}

function copyShareText() {
  var shareEl = $('shareText');
  if (!shareEl) return;
  var text = shareEl.textContent;
  if (!text || text === '输入密码后自动生成分享文本...') return;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function() {
      showToast('已复制到剪贴板');
    }).catch(function() {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  var textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    showToast('已复制到剪贴板');
  } catch (e) {
    showToast('复制失败，请手动选择文本');
  }
  document.body.removeChild(textarea);
}

// ── Toast 提示 ──
function showToast(msg) {
  var toast = $('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(function() {
    toast.classList.remove('show');
  }, 2000);
}

// ── 重置显示 ──
function resetDisplay() {
  var bar = $('strengthBar');
  var label = $('strengthLabel');
  var entDisp = $('entropyDisplay');
  if (bar) { bar.style.width = '0%'; bar.style.background = '#64748b'; }
  if (label) { label.textContent = '--'; label.style.color = '#64748b'; }
  if (entDisp) entDisp.textContent = '0 bit';

  $('statLength').textContent = '--';
  $('statCharset').textContent = '--';
  $('statEntropy').textContent = '-- bit';
  $('statKeyspace').textContent = '--';

  $('crackOnline').textContent = '--';
  $('crackOnline').style.color = '#fbbf24';
  $('crackGpu').textContent = '--';
  $('crackGpu').style.color = '#fbbf24';
  $('crackNation').textContent = '--';
  $('crackNation').style.color = '#fbbf24';

  $('timescaleWrap').style.display = 'none';

  $('csLower').className = 'charset-check';
  $('csUpper').className = 'charset-check';
  $('csDigit').className = 'charset-check';
  $('csSpecial').className = 'charset-check';

  $('noWarnings').style.display = 'none';
  $('warningList').innerHTML = '';

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
    renderCharsetChart({ lowercase: false, uppercase: false, digits: false, special: false, size: 0 });
  }

  $('shareText').textContent = '输入密码后自动生成分享文本...';
  $('copyBtn').disabled = true;

  var grid = $('compareGrid');
  if (grid) {
    var cards = grid.querySelectorAll('.compare-card');
    for (var i = 0; i < cards.length; i++) {
      cards[i].classList.remove('selected');
    }
  }
}

// ── 加载 Chart.js 后刷新饼图 ──
loadChartJS().then(function() {
  renderCharsetChart({ lowercase: false, uppercase: false, digits: false, special: false, size: 0 });
});

/**
 * clipboard-spy/app.js
 * 页面交互逻辑
 * 通过 CE 命名空间访问 engine.js，避免与其 const 声明冲突
 */

const CE = window.ClipboardEngine;

/* ══════════ Tab 切换 ══════════ */
function switchTab(id) {
  document.querySelectorAll('.tab-content').forEach(function(el) { el.classList.remove('active'); });
  document.querySelectorAll('.tab-btn').forEach(function(el) { el.classList.remove('active'); });
  document.getElementById('tab-' + id).classList.add('active');
  var btns = document.querySelectorAll('.tab-btn');
  var tabMap = { monitor: 0, richtext: 1, profile: 2 };
  if (tabMap[id] !== undefined) btns[tabMap[id]].classList.add('active');
}
window.switchTab = switchTab;

/* ══════════ 实验一：剪贴板监听器 ══════════ */
var copyCount = 0, cutCount = 0, pasteCount = 0, sensitiveCount = 0;
var logEntries = [];

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function addLogEntry(type, content) {
  var now = new Date();
  var timeStr = now.toLocaleTimeString('zh-CN', { hour12: false });
  var hits = CE.detectSensitive(content);

  if (hits.length > 0) {
    sensitiveCount += hits.length;
    document.getElementById('sensitiveCount').textContent = sensitiveCount;
  }

  var displayContent = escapeHtml(content);
  for (var i = 0; i < hits.length; i++) {
    var h = hits[i];
    var escaped = escapeHtml(h.value);
    displayContent = displayContent.replace(
      escaped,
      '<span class="sensitive">[' + h.type + '] ' + escaped + '</span>'
    );
  }

  logEntries.unshift({ time: timeStr, type: type, content: displayContent });
  renderLog();
}

function renderLog() {
  var logArea = document.getElementById('monitorLog');
  if (!logArea) return;
  if (logEntries.length === 0) {
    logArea.innerHTML = '<div style="color:#546e7a;text-align:center;padding:20px;">等待你的第一次复制操作...</div>';
    return;
  }
  logArea.innerHTML = logEntries.map(function(e) {
    var typeLabel = e.type === 'copy' ? '复制' : e.type === 'cut' ? '剪切' : '粘贴';
    return '<div class="log-entry">' +
      '<span class="log-time">' + e.time + '</span>' +
      '<span class="log-type ' + e.type + '">' + typeLabel + '</span>' +
      '<span class="log-content">' + e.content + '</span>' +
      '</div>';
  }).join('');
}

function clearLog() {
  logEntries = [];
  copyCount = cutCount = pasteCount = sensitiveCount = 0;
  document.getElementById('copyCount').textContent = '0';
  document.getElementById('cutCount').textContent = '0';
  document.getElementById('pasteCount').textContent = '0';
  document.getElementById('sensitiveCount').textContent = '0';
  renderLog();
}
window.clearLog = clearLog;

// 监听剪贴板事件（不需要权限，自动生效）
document.addEventListener('copy', function() {
  var text = window.getSelection().toString();
  if (!text) return;
  copyCount++;
  document.getElementById('copyCount').textContent = copyCount;
  addLogEntry('copy', text.substring(0, 500));
});

document.addEventListener('cut', function() {
  var text = window.getSelection().toString();
  if (!text) return;
  cutCount++;
  document.getElementById('cutCount').textContent = cutCount;
  addLogEntry('cut', text.substring(0, 500));
});

document.addEventListener('paste', function(e) {
  var text = (e.clipboardData || window.clipboardData).getData('text');
  if (!text) return;
  pasteCount++;
  document.getElementById('pasteCount').textContent = pasteCount;
  addLogEntry('paste', text.substring(0, 500));
});

/* ══════════ 实验二：富文本陷阱 ══════════ */
var TRACKING_ID = 42857;

// 页面加载后注入零宽字符
window.addEventListener('DOMContentLoaded', function() {
  var source = document.getElementById('richTextSource');
  if (!source) return;
  var originalText = source.textContent;
  var injected = CE.injectZwsp(originalText, TRACKING_ID);
  source.innerHTML = '';
  var span = document.createElement('span');
  span.textContent = injected;
  source.appendChild(span);
  renderZwspVisualization(injected);
});

function renderZwspVisualization(text) {
  var container = document.getElementById('zwspVisualization');
  if (!container) return;
  var names = { '\u200B': 'ZWSP', '\u200C': 'ZWNJ', '\u200D': 'ZWJ', '\uFEFF': 'BOM' };
  var codes = { '\u200B': '200B', '\u200C': '200C', '\u200D': '200D', '\uFEFF': 'FEFF' };
  var html = '';
  var chars = Array.from(text);
  for (var i = 0; i < chars.length; i++) {
    var ch = chars[i];
    if (CE.ZWSP_CHARS.indexOf(ch) !== -1) {
      html += '<span class="zwsp-viz" title="U+' + codes[ch] + ' ' + names[ch] + '">U+' + codes[ch] + '</span>';
    } else {
      html += escapeHtml(ch);
    }
  }
  container.innerHTML = html;
}

function analyzeRichPaste() {
  var pasteArea = document.getElementById('richPasteArea');
  var panel = document.getElementById('richRevealPanel');
  var rawHtml = pasteArea.innerHTML;
  var plainText = pasteArea.textContent || pasteArea.innerText || '';

  if (!plainText.trim()) {
    alert('请先把上面的文字复制粘贴到输入框');
    return;
  }

  panel.style.display = 'block';

  document.getElementById('revealPlainText').textContent =
    plainText.length > 80 ? plainText.substring(0, 80) + '...' : plainText;

  var tagCount = (rawHtml.match(/<[^>]+>/g) || []).length;
  document.getElementById('revealTagCount').textContent = tagCount + ' 个';

  var styleMatches = rawHtml.match(/style="[^"]*"/g) || [];
  document.getElementById('revealStyles').textContent =
    styleMatches.length > 0 ? styleMatches.length + ' 处内联样式' : '无';

  var zwspCount = CE.countZwsp(plainText);
  document.getElementById('revealZwsp').textContent = zwspCount + ' 个';

  var decoded = CE.decodeZwsp(plainText);
  document.getElementById('revealTrackId').textContent =
    decoded !== null ? 'ID = ' + decoded : '未检测到';

  document.getElementById('revealRawHtml').textContent = rawHtml;

  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
window.analyzeRichPaste = analyzeRichPaste;

function clearRichPaste() {
  document.getElementById('richPasteArea').innerHTML = '';
  document.getElementById('richRevealPanel').style.display = 'none';
}
window.clearRichPaste = clearRichPaste;

/* ══════════ 实验三：画像拼凑 ══════════ */
var simIndex = 0;
var simActions = [];
var simTimer = null;

function simulateDay() {
  simIndex = 0;
  simActions = [];
  if (simTimer) { clearTimeout(simTimer); simTimer = null; }
  document.getElementById('simLog').innerHTML = '';
  document.getElementById('profileCard').style.display = 'none';
  document.getElementById('simTotal').textContent = '0';
  document.getElementById('simSensitive').textContent = '0';
  document.getElementById('simCategories').textContent = '0';
  scheduleNext();
}
window.simulateDay = simulateDay;

function scheduleNext() {
  if (simIndex >= CE.SIMULATED_CLIPBOARD_ACTIONS.length) {
    setTimeout(showProfile, 400);
    return;
  }
  simTimer = setTimeout(function() {
    addSimAction();
    scheduleNext();
  }, 180);
}

function simulateNextAction() {
  if (simIndex >= CE.SIMULATED_CLIPBOARD_ACTIONS.length) return;
  addSimAction();
  if (simIndex >= CE.SIMULATED_CLIPBOARD_ACTIONS.length) {
    setTimeout(showProfile, 400);
  }
}
window.simulateNextAction = simulateNextAction;

function addSimAction() {
  if (simIndex >= CE.SIMULATED_CLIPBOARD_ACTIONS.length) return;
  var action = CE.SIMULATED_CLIPBOARD_ACTIONS[simIndex];
  simActions.push(action);
  simIndex++;

  document.getElementById('simTotal').textContent = simActions.length;
  var sens = simActions.filter(function(a) { return a.sensitive; });
  document.getElementById('simSensitive').textContent = sens.length;
  var cats = {};
  sens.forEach(function(a) { cats[a.category] = 1; });
  document.getElementById('simCategories').textContent = Object.keys(cats).length;

  var logArea = document.getElementById('simLog');
  if (simActions.length === 1) logArea.innerHTML = '';

  var entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.style.animation = 'fadeIn 0.3s ease';
  var contentHtml = action.sensitive
    ? '<span class="sensitive">' + escapeHtml(action.content) + '</span>'
    : escapeHtml(action.content);
  entry.innerHTML =
    '<span class="log-time">' + action.time + '</span>' +
    '<span class="log-type ' + (action.sensitive ? 'copy' : 'paste') + '">' + action.app + '</span>' +
    '<span class="log-content">' + contentHtml + '</span>';
  logArea.prepend(entry);
}

function showProfile() {
  var card = document.getElementById('profileCard');
  var items = document.getElementById('profileItems');

  var profileSummary = [
    { label: '手机号',   value: '138-0013-8000' },
    { label: '邮箱',     value: 'zhangsan@company.com' },
    { label: '常驻地区', value: '北京市海淀区 / 望京' },
    { label: '健康状况', value: '关注慢性胃炎、焦虑症' },
    { label: '经济状况', value: '月薪 25K-35K，有银行卡' },
    { label: '求职状态', value: '正在找工作，明天有面试' },
    { label: '居住需求', value: '在找海淀区两居室，预算 5000' },
    { label: '工作信息', value: 'Q3 营收目标 2400 万' },
    { label: '车辆',     value: '京A·12345' },
    { label: '密码泄露', value: '2 个密码被捕获' },
  ];

  items.innerHTML = profileSummary.map(function(p) {
    return '<div class="profile-item">' +
      '<span class="profile-icon"><i class="ti ti-point-filled"></i></span>' +
      '<span class="profile-label">' + p.label + '</span>' +
      '<span class="profile-value">' + escapeHtml(p.value) + '</span>' +
      '</div>';
  }).join('');

  card.style.display = 'block';
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function resetSimulation() {
  if (simTimer) { clearTimeout(simTimer); simTimer = null; }
  simIndex = 0;
  simActions = [];
  document.getElementById('simLog').innerHTML =
    '<div style="color:#546e7a;text-align:center;padding:20px;">点击「模拟一天的复制操作」开始...</div>';
  document.getElementById('profileCard').style.display = 'none';
  document.getElementById('simTotal').textContent = '0';
  document.getElementById('simSensitive').textContent = '0';
  document.getElementById('simCategories').textContent = '0';
}
window.resetSimulation = resetSimulation;

// fadeIn 动画
var fadeStyle = document.createElement('style');
fadeStyle.textContent = '@keyframes fadeIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }';
document.head.appendChild(fadeStyle);

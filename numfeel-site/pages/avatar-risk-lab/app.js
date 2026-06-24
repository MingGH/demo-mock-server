// ========== 外链头像安全实验室 ==========

var API = 'https://numfeel-api.996.ninja/avatar-risk';
var currentToken = null;
var currentAvatarUrl = null;

// 场景定义：与后端 ScenarioState 字段对齐
// era: 'alive' = 现在还很猛, 'half-dead' = 浏览器已经防住一半, 'mitigated' = 主流浏览器已经拦死
var SCENARIOS = [
  {
    key: 'horror',
    icon: 'ti-mood-sad',
    title: '替换为恐怖图片',
    tag: '内容劫持',
    era: 'alive',
    eraText: '至今有效',
    desc: '图片在别人服务器上，今天正常、明天换血腥/政治敏感图，平台列表瞬间被攻陷。',
    note: '浏览器对图片内容没法管，平台审核滞后的话就是裸奔。'
  },
  {
    key: 'authPrompt',
    icon: 'ti-key',
    title: '弹出账号密码框',
    tag: '钓鱼',
    era: 'half-dead',
    eraText: '2018 后被压制',
    desc: '返回 401 + WWW-Authenticate，让浏览器原生弹账号密码框，伪装成主站要求登录。',
    note: 'Chrome/FF/Safari 已禁用「跨域子资源(img/iframe)」触发 Basic Auth 弹窗。要看效果请用下方「新标签打开」按钮——top-level navigation 仍然会弹。'
  },
  {
    key: 'redirect',
    icon: 'ti-arrow-fork',
    title: '重定向到 localhost:8080',
    tag: 'SSRF',
    era: 'half-dead',
    eraText: '客户端被防，服务端仍危险',
    desc: 'URL 看着是 .jpg，服务端 302 跳到 http://localhost:8080/admin，意图打内网管理后台 / 云元数据。',
    note: '浏览器 <img> 会因为 mixed content / CORS 拦截。但如果是服务端代下载头像（典型缩略图场景）不做白名单，照样命中——SSRF 主战场。'
  },
  {
    key: 'slow',
    icon: 'ti-hourglass-empty',
    title: '故意延迟 8 秒',
    tag: '可用性',
    era: 'alive',
    eraText: '至今有效',
    desc: '永远不返回的图片把整个 feed 流卡住。卡的不是攻击者，是你自己的页面。',
    note: '浏览器对图片没有强制超时，主线程虽不卡但连接池/HTTP2 流会被占满。'
  },
  {
    key: 'oversized',
    icon: 'ti-bomb',
    title: '返回 10MB 流量炸弹',
    tag: '流量耗尽',
    era: 'alive',
    eraText: '至今有效',
    desc: '一张 10MB 的"头像"。100 个用户访问 = 1GB 流量，移动端首当其冲。',
    note: '没有任何浏览器会主动拒收大图。防御必须在服务端做大小校验。'
  },
  {
    key: 'broken',
    icon: 'ti-photo-off',
    title: '直接 404',
    tag: '外链失效',
    era: 'alive',
    eraText: '至今有效',
    desc: '第三方挂了，你的用户列表全是碎图，体验崩盘。',
    note: '解法是转存到自己的 CDN，从此与第三方域名脱钩。'
  },
  {
    key: 'svgXss',
    icon: 'ti-code',
    title: 'SVG 里塞脚本',
    tag: 'XSS',
    era: 'half-dead',
    eraText: '换个标签就中招',
    desc: '返回带 &lt;script&gt; 的 SVG。&lt;img&gt; 加载时浏览器 sandbox 不执行脚本——但只要平台某处用 &lt;object&gt;/&lt;iframe&gt; 加载，脚本就会运行。',
    note: '开关打开后，下方对比区会出现：左侧 &lt;img&gt; 静态渲染，右侧 &lt;object&gt; 加载时 SVG 内的文字会变绿"✅ 脚本已执行"，同时通过 postMessage 通知宿主页面注入红色横幅。'
  }
];

// ========== 初始化 ==========

function init() {
  renderScenarios();
  bindButtons();
  bindSvgXssMessageListener();
  createSession();
}

function bindButtons() {
  document.getElementById('reloadBtn').addEventListener('click', reloadAvatar);
  document.getElementById('newTokenBtn').addEventListener('click', createSession);
  document.getElementById('refreshLogBtn').addEventListener('click', refreshLogs);
  document.getElementById('copyUrlBtn').addEventListener('click', copyUrl);
  document.getElementById('openInTabBtn').addEventListener('click', openInNewTab);
  document.getElementById('loadSvgObjectBtn').addEventListener('click', loadSvgViaObject);
}

// ========== 场景卡片 ==========

function renderScenarios() {
  var grid = document.getElementById('scenarioGrid');
  var html = '';
  for (var i = 0; i < SCENARIOS.length; i++) {
    var s = SCENARIOS[i];
    var eraClass = 'era-' + s.era;
    html += '<div class="scenario-card" id="card-' + s.key + '">' +
      '<div class="scenario-head">' +
        '<div class="scenario-title"><i class="ti ' + s.icon + '"></i>' + s.title + '</div>' +
        '<label class="switch">' +
          '<input type="radio" name="scenario" value="' + s.key + '" data-scenario="' + s.key + '">' +
          '<span class="slider"></span>' +
        '</label>' +
      '</div>' +
      '<div class="scenario-desc">' + s.desc + '</div>' +
      '<div class="scenario-note"><i class="ti ti-bulb"></i> ' + s.note + '</div>' +
      '<div class="scenario-footer">' +
        '<span class="scenario-tag">' + s.tag + '</span>' +
        '<span class="scenario-era ' + eraClass + '">' + s.eraText + '</span>' +
      '</div>' +
    '</div>';
  }
  // 加一个 "全部关闭" 的卡片，对应单选的 none
  html = '<div class="scenario-card scenario-none" id="card-none">' +
    '<div class="scenario-head">' +
      '<div class="scenario-title"><i class="ti ti-check"></i>正常头像（默认）</div>' +
      '<label class="switch">' +
        '<input type="radio" name="scenario" value="" data-scenario="" checked>' +
        '<span class="slider safe"></span>' +
      '</label>' +
    '</div>' +
    '<div class="scenario-desc">所有攻击场景关闭，返回正常的美女头像。每次切换其它场景前先经过这里。</div>' +
    '<div class="scenario-footer">' +
      '<span class="scenario-tag safe">默认</span>' +
    '</div>' +
  '</div>' + html;
  grid.innerHTML = html;

  var inputs = grid.querySelectorAll('input[type=radio]');
  inputs.forEach(function(input) {
    input.addEventListener('change', function() {
      if (!input.checked) return;
      selectScenario(input.getAttribute('data-scenario'));
    });
  });

  // 让整个卡片点击区域都能选中（除非点的是按钮/链接）
  var cards = grid.querySelectorAll('.scenario-card');
  cards.forEach(function(card) {
    card.addEventListener('click', function(e) {
      if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON') return;
      var input = card.querySelector('input[type=radio]');
      if (input && !input.checked) {
        input.checked = true;
        selectScenario(input.getAttribute('data-scenario'));
      }
    });
  });
}

function setScenarioUI(activeKey) {
  // activeKey === '' 表示全部关闭
  var cards = document.querySelectorAll('.scenario-card');
  cards.forEach(function(card) {
    card.classList.remove('active');
  });
  if (activeKey) {
    var card = document.getElementById('card-' + activeKey);
    if (card) card.classList.add('active');
  } else {
    var noneCard = document.getElementById('card-none');
    if (noneCard) noneCard.classList.add('active');
  }
  // 同步 radio
  var radios = document.querySelectorAll('input[name=scenario]');
  radios.forEach(function(r) {
    r.checked = (r.value === activeKey);
  });
}

// ========== Session 操作 ==========

function createSession() {
  fetch(API + '/session', { method: 'POST' })
    .then(function(r) { return r.json(); })
    .then(function(res) {
      if (res.status !== 200) {
        showStatus('error', '创建 session 失败：' + (res.message || '服务暂时不可用'));
        return;
      }
      currentToken = res.data.token;
      currentAvatarUrl = 'https://numfeel-api.996.ninja' + res.data.avatarPath;
      document.getElementById('tokenDisplay').textContent = currentToken;
      document.getElementById('urlDisplay').textContent = currentAvatarUrl;

      // 重置为 "全部关闭"
      setScenarioUI('');
      updateSvgXssVisibility(false);
      reloadAvatar();
      refreshLogs();
    })
    .catch(function(err) {
      showStatus('error', '网络错误：' + (err.message || err));
    });
}

/**
 * 单选模式：先把当前激活的场景关掉，再开启目标场景。
 * activeKey === '' 表示只关、不开（回到默认正常头像）。
 */
function selectScenario(activeKey) {
  if (!currentToken) return;
  // 先乐观更新 UI
  setScenarioUI(activeKey);

  // 找出目前后端记录中处于 enabled 状态的场景，逐个关掉，最后开目标
  fetch(API + '/state/' + currentToken)
    .then(function(r) { return r.json(); })
    .then(function(res) {
      var pending = [];
      if (res.status === 200 && res.data.exists) {
        var s = res.data.scenarios;
        for (var k in s) {
          if (Object.prototype.hasOwnProperty.call(s, k) && s[k] && k !== activeKey) {
            pending.push(toggleScenario(k, false));
          }
        }
      }
      if (activeKey) {
        pending.push(toggleScenario(activeKey, true));
      }
      return Promise.all(pending);
    })
    .then(function() {
      // 全部完成后再刷新头像
      reloadAvatar();
      updateSvgXssVisibility(activeKey === 'svgXss');
    })
    .catch(function(err) {
      alert('切换失败：' + (err.message || err));
    });
}

function toggleScenario(key, enabled) {
  return fetch(API + '/toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: currentToken, scenario: key, enabled: enabled })
  }).then(function(r) { return r.json(); });
}

// ========== 头像加载 ==========

function reloadAvatar() {
  if (!currentAvatarUrl) return;
  var img = document.getElementById('avatarImg');
  // 加 cache buster，避免浏览器缓存
  var bust = currentAvatarUrl + '?t=' + Date.now();
  showStatus('warn', '加载中…');
  img.classList.remove('broken');
  img.onload = function() {
    showStatus('ok', '加载完成 ✓');
    setTimeout(refreshLogs, 300);
  };
  img.onerror = function() {
    img.classList.add('broken');
    showStatus('error', '加载失败（可能是 401/302/404/或浏览器拦截）');
    setTimeout(refreshLogs, 300);
  };
  img.src = bust;
}

function showStatus(type, text) {
  var el = document.getElementById('avatarStatus');
  el.textContent = text;
  el.className = 'avatar-status';
  if (type === 'error') el.classList.add('error');
  if (type === 'warn') el.classList.add('warn');
}

// ========== 日志 ==========

function refreshLogs() {
  if (!currentToken) return;
  fetch(API + '/logs/' + currentToken)
    .then(function(r) { return r.json(); })
    .then(function(res) {
      if (res.status !== 200) return;
      var logs = (res.data && res.data.logs) || [];
      document.getElementById('logStat').textContent = logs.length + ' 条记录';
      var tbody = document.getElementById('logTbody');
      if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="log-empty">暂无访问记录，刷新头像看看？</td></tr>';
        return;
      }
      var html = '';
      // 倒序显示，最新在前
      for (var i = logs.length - 1; i >= 0; i--) {
        var l = logs[i];
        html += '<tr>' +
          '<td>' + formatTime(l.at) + '</td>' +
          '<td>' + escapeHtml(l.ip) + '</td>' +
          '<td>' + escapeHtml(l.userAgent) + '</td>' +
          '<td>' + escapeHtml(l.referer) + '</td>' +
        '</tr>';
      }
      tbody.innerHTML = html;
    });
}

function formatTime(ts) {
  var d = new Date(ts);
  var pad = function(n) { return n < 10 ? '0' + n : '' + n; };
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function copyUrl() {
  if (!currentAvatarUrl) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(currentAvatarUrl).then(function() {
      var btn = document.getElementById('copyUrlBtn');
      var old = btn.innerHTML;
      btn.innerHTML = '<i class="ti ti-check"></i> 已复制';
      setTimeout(function() { btn.innerHTML = old; }, 1500);
    });
  }
}

/**
 * 在新标签页打开头像 URL。
 * 这是观察 authPrompt / redirect 等场景"真实威力"的关键——
 * top-level navigation 不受跨域子资源的安全限制，浏览器会照常弹 Basic Auth 框 / 跟随重定向。
 */
function openInNewTab() {
  if (!currentAvatarUrl) return;
  window.open(currentAvatarUrl, '_blank', 'noopener');
}

/**
 * 切换 SVG XSS 对比区域的显示。
 * 仅在 svgXss 场景激活时显示，并同步把当前头像 URL 注入到 <img> 测试位。
 */
function updateSvgXssVisibility(show) {
  var section = document.getElementById('svgXssSection');
  if (!section) return;
  if (show) {
    section.style.display = '';
    var img = document.getElementById('svgImgTest');
    if (img && currentAvatarUrl) {
      img.src = currentAvatarUrl + '?svg=' + Date.now();
    }
    // 清空 object 挂载点，让用户主动点按钮触发
    var mount = document.getElementById('svgObjectMount');
    if (mount) mount.innerHTML = '<div class="svg-placeholder">点击下方按钮加载</div>';
  } else {
    section.style.display = 'none';
    // 清理：移除 object 防止脚本继续运行
    var mount2 = document.getElementById('svgObjectMount');
    if (mount2) mount2.innerHTML = '';
  }
}

/**
 * 用 <object> 标签加载同一个 SVG URL。
 * 这是演示的高潮：同一个文件、同一个 URL，换个标签就从「安全图片」变成「XSS 攻击载荷」。
 */
function loadSvgViaObject() {
  if (!currentAvatarUrl) return;
  var mount = document.getElementById('svgObjectMount');
  if (!mount) return;
  mount.innerHTML = '';
  var obj = document.createElement('object');
  obj.type = 'image/svg+xml';
  obj.data = currentAvatarUrl + '?obj=' + Date.now();
  obj.style.width = '240px';
  obj.style.height = '240px';
  mount.appendChild(obj);
}

/**
 * 监听 SVG 内脚本通过 postMessage 发来的消息。
 * 由于跨域 alert 会被现代浏览器静默拦截、跨域读 window.top 抛 SecurityError，
 * SVG 里的脚本无法直接弹窗或改宿主 DOM，只能通过 postMessage 跨域通信。
 * 收到消息后由宿主页面（这里）注入横幅，演示"XSS 可以跨越 origin 边界搞事"。
 */
function bindSvgXssMessageListener() {
  window.addEventListener('message', function(event) {
    var data = event.data;
    if (!data || data.type !== 'avatar-risk-svg-xss') return;

    // 防止重复注入
    if (document.getElementById('svgXssBanner')) return;

    var banner = document.createElement('div');
    banner.id = 'svgXssBanner';
    banner.innerHTML =
      '<i class="ti ti-bug"></i> SVG XSS 触发！收到来自 <code>' +
      escapeHtml(data.origin || 'unknown') +
      '</code> 的 postMessage —— 攻击者已在你的页面留下脚印 ' +
      '<button id="closeSvgBanner" style="margin-left:12px;background:#fff;color:#ff6b6b;border:none;padding:3px 10px;border-radius:4px;cursor:pointer;font-weight:600">关闭</button>';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:linear-gradient(90deg,#ff6b6b,#ee5a24);color:#fff;text-align:center;padding:12px 20px;z-index:99999;font:600 14px sans-serif;box-shadow:0 2px 20px rgba(255,107,107,0.5)';
    document.body.appendChild(banner);
    var closeBtn = document.getElementById('closeSvgBanner');
    if (closeBtn) closeBtn.addEventListener('click', function() { banner.remove(); });
  });
}

// 启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

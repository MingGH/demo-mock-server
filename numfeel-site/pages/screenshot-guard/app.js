/**
 * screenshot-guard/app.js
 * DOM 绑定与交互
 */
(function () {
  var Engine = window.ScreenshotGuardEngine;
  var TECHNIQUES = Engine.TECHNIQUES;
  var assessProtectionLevel = Engine.assessProtectionLevel;
  var simulateBattle = Engine.simulateBattle;
  var generateWatermarkToken = Engine.generateWatermarkToken;
  var REAL_WORLD_CASES = Engine.REAL_WORLD_CASES;
  var pickRandomTip = Engine.pickRandomTip;

  /* ── Hero 图 ── */
  var heroImg = document.getElementById('heroImg');
  if (heroImg) {
    heroImg.src = 'images/hero.jpeg';
  }

  /* ── Tab 切换 ── */
  window.switchTab = function (tabId) {
    var btns = document.querySelectorAll('.tab-btn');
    for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
    var contents = document.querySelectorAll('.tab-content');
    for (var j = 0; j < contents.length; j++) contents[j].classList.remove('active');
    document.querySelector('[onclick="switchTab(\'' + tabId + '\')"]').classList.add('active');
    document.getElementById('tab-' + tabId).classList.add('active');
  };

  /* ── 状态 ── */
  var activeDefenses = [];
  var firstToggle = true;

  /* ── 凭证初始化 ── */
  var receiptSerial = 'TX' + Date.now().toString().slice(-10);
  document.getElementById('receiptSerial').textContent = receiptSerial;
  document.getElementById('receiptDate').textContent = new Date().toLocaleString('zh-CN', { hour12: false });

  /* ── 水印 token ── */
  var watermarkToken = generateWatermarkToken(
    navigator.userAgent,
    (screen.width || 0) + '|' + Date.now()
  ).toUpperCase();

  function renderWatermark() {
    var inner = document.getElementById('watermarkInner');
    var timeStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    var text = watermarkToken + ' · 预览用户 ' + watermarkToken.slice(0, 4) + ' · ' + timeStr;
    var html = '';
    for (var i = 0; i < 36; i++) html += '<span>' + text + '</span>';
    inner.innerHTML = html;
  }
  renderWatermark();
  setInterval(function () {
    if (activeDefenses.indexOf('dynamic-watermark') > -1) renderWatermark();
  }, 5000);

  /* ── 渲染技术卡片 ── */
  function renderTechCards() {
    var grid = document.getElementById('techGrid');
    var html = '';
    for (var i = 0; i < TECHNIQUES.length; i++) {
      var t = TECHNIQUES[i];
      var effColor = t.effectiveness > 60 ? '#66bb6a' : t.effectiveness > 30 ? '#ffd700' : '#ef5350';
      var pulseCls = t.id === 'dynamic-watermark' ? ' pulse' : '';
      var arrow = t.id === 'dynamic-watermark'
        ? '<div class="tech-arrow"><i class="ti ti-hand-click"></i> 从这里开始</div>'
        : '';
      html += ''
        + '<div class="tech-card' + pulseCls + '" id="card-' + t.id + '">'
        +   arrow
        +   '<div class="tech-header">'
        +     '<span class="tech-name">' + t.name + '</span>'
        +     '<span class="diff-badge diff-' + t.difficulty + '">难度 ' + t.difficulty + '</span>'
        +   '</div>'
        +   '<p class="tech-desc">' + t.desc + '</p>'
        +   '<div class="tech-eff">'
        +     '<span>有效性</span>'
        +     '<div class="eff-bar"><div class="eff-fill" style="width:' + t.effectiveness + '%;background:' + effColor + '"></div></div>'
        +     '<span>' + t.effectiveness + '%</span>'
        +   '</div>'
        +   '<button class="btn btn-sm btn-secondary toggle-btn" onclick="toggleDefense(\'' + t.id + '\')">'
        +     '<i class="ti ti-shield-plus"></i> 启用'
        +   '</button>'
        + '</div>';
    }
    grid.innerHTML = html;
  }

  window.toggleDefense = function (id) {
    var idx = activeDefenses.indexOf(id);
    var enabling = idx === -1;
    if (enabling) activeDefenses.push(id);
    else activeDefenses.splice(idx, 1);

    // 首次开关移除呼吸引导
    if (firstToggle) {
      firstToggle = false;
      var pulseCard = document.getElementById('card-dynamic-watermark');
      if (pulseCard) pulseCard.classList.remove('pulse');
      var arrow = pulseCard && pulseCard.querySelector('.tech-arrow');
      if (arrow) arrow.remove();
    }

    applyDefenses();
    updateProtectionMeter();

    // 彩蛋提示
    showToast(pickRandomTip());

    logAction(
      (enabling ? '启用' : '关闭') +
      '：' + findTech(id).name
    );
  };

  function findTech(id) {
    for (var i = 0; i < TECHNIQUES.length; i++) if (TECHNIQUES[i].id === id) return TECHNIQUES[i];
    return null;
  }

  /* ── 应用防护到机密卡片 ── */
  var secretCard = document.getElementById('secretCard');
  var watermarkLayer = document.getElementById('watermarkLayer');
  var receiptGrid = document.getElementById('receiptGrid');

  function applyDefenses() {
    // 更新卡片视觉状态
    for (var i = 0; i < TECHNIQUES.length; i++) {
      var t = TECHNIQUES[i];
      var card = document.getElementById('card-' + t.id);
      if (!card) continue;
      var btn = card.querySelector('.toggle-btn');
      if (activeDefenses.indexOf(t.id) > -1) {
        card.classList.add('active');
        btn.innerHTML = '<i class="ti ti-shield-check"></i> 已启用';
        btn.classList.add('btn-active');
      } else {
        card.classList.remove('active');
        btn.innerHTML = '<i class="ti ti-shield-plus"></i> 启用';
        btn.classList.remove('btn-active');
      }
    }

    // 水印
    if (activeDefenses.indexOf('dynamic-watermark') > -1) {
      watermarkLayer.classList.add('on');
      renderWatermark();
    } else {
      watermarkLayer.classList.remove('on');
    }

    // Canvas 渲染
    var existCanvas = secretCard.querySelector('canvas');
    if (activeDefenses.indexOf('canvas-render') > -1) {
      receiptGrid.style.display = 'none';
      if (!existCanvas) drawReceiptCanvas();
    } else {
      receiptGrid.style.display = '';
      if (existCanvas) existCanvas.remove();
    }

    // 禁止选择 / 复制
    if (activeDefenses.indexOf('disable-select') > -1) {
      secretCard.classList.add('no-select');
    } else {
      secretCard.classList.remove('no-select');
    }
  }

  function drawReceiptCanvas() {
    var canvas = document.createElement('canvas');
    var width = secretCard.clientWidth - 44;
    if (width < 260) width = 260;
    canvas.width = width;
    canvas.height = 190;
    canvas.style.width = width + 'px';
    canvas.style.height = '190px';
    secretCard.appendChild(canvas);
    var ctx = canvas.getContext('2d');

    function redraw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = '13px -apple-system, sans-serif';
      var rows = [
        ['付款方', '张 * 敏（尾号 8823）'],
        ['收款方', '李某工程有限公司'],
        ['金额', '¥ 128,600.00'],
        ['日期', new Date().toLocaleString('zh-CN', { hour12: false })],
        ['流水号', receiptSerial],
        ['备注', '项目尾款结算'],
      ];
      for (var i = 0; i < rows.length; i++) {
        ctx.fillStyle = '#888';
        ctx.fillText(rows[i][0], 12, 24 + i * 26);
        ctx.fillStyle = rows[i][0] === '金额' ? '#ffd700' : '#e8e8e8';
        ctx.font = (rows[i][0] === '金额' ? 'bold 15px ' : '13px ') + 'monospace';
        ctx.fillText(rows[i][1], 100, 24 + i * 26);
        ctx.font = '13px -apple-system, sans-serif';
      }
    }
    redraw();
    // 频繁重绘
    var timer = setInterval(function () {
      if (activeDefenses.indexOf('canvas-render') === -1) {
        clearInterval(timer);
        return;
      }
      redraw();
    }, 800);
  }

  /* ── 防护强度 meter ── */
  function updateProtectionMeter() {
    var enabled = [];
    for (var i = 0; i < TECHNIQUES.length; i++) {
      if (activeDefenses.indexOf(TECHNIQUES[i].id) > -1) enabled.push(TECHNIQUES[i]);
    }
    var a = assessProtectionLevel(enabled);
    document.getElementById('meterFill').style.width = a.level + '%';
    document.getElementById('meterFill').style.background = a.color;
    document.getElementById('meterLabel').textContent = a.label;
    document.getElementById('meterLabel').style.color = a.color;
    document.getElementById('meterScore').textContent = a.level;
  }

  /* ── 事件监听：失焦即模糊 / DevTools 检测 / PrintScreen ── */
  function onVisibilityChange() {
    if (activeDefenses.indexOf('blur-on-blur') === -1) return;
    if (document.hidden) {
      secretCard.classList.add('blurred');
      logAction('检测到窗口失焦，已模糊内容');
    } else {
      secretCard.classList.remove('blurred');
    }
  }
  function onWindowBlur() {
    if (activeDefenses.indexOf('blur-on-blur') === -1) return;
    secretCard.classList.add('blurred');
    logAction('检测到窗口失焦，已模糊内容');
  }
  function onWindowFocus() {
    if (activeDefenses.indexOf('blur-on-blur') === -1) return;
    secretCard.classList.remove('blurred');
  }
  function onKeyDown(e) {
    // PrintScreen
    if (activeDefenses.indexOf('printscreen-listen') > -1) {
      var key = e.key || '';
      if (key === 'PrintScreen' || e.keyCode === 44) {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText('');
          }
        } catch (err) { /* 静默 */ }
        showToast('已检测到截图键，剪贴板已清空');
        logAction('检测到 PrintScreen 键');
      }
    }
    // F12 + Ctrl+Shift+I
    if (activeDefenses.indexOf('block-f12-menu') > -1) {
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i'))) {
        e.preventDefault();
        logAction('F12 / Ctrl+Shift+I 已拦截');
      }
    }
  }
  function onContextMenu(e) {
    if (activeDefenses.indexOf('block-f12-menu') > -1) {
      e.preventDefault();
      logAction('右键菜单已拦截');
    }
  }
  function onCopy(e) {
    if (activeDefenses.indexOf('disable-select') === -1) return;
    // 只在机密卡片范围内拦
    var sel = window.getSelection && window.getSelection();
    var anchor = sel && sel.anchorNode;
    if (!anchor || !secretCard.contains(anchor.nodeType === 1 ? anchor : anchor.parentNode)) return;
    e.preventDefault();
    try {
      if (e.clipboardData && e.clipboardData.setData) {
        e.clipboardData.setData('text/plain', '');
      }
    } catch (err) { /* 静默 */ }
    logAction('检测到复制操作，已清空剪贴板');
    showToast('该区域禁止复制');
  }
  function onSelectStart(e) {
    if (activeDefenses.indexOf('disable-select') === -1) return;
    var target = e.target;
    if (target && secretCard.contains(target)) {
      e.preventDefault();
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('blur', onWindowBlur);
  window.addEventListener('focus', onWindowFocus);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('copy', onCopy);
  document.addEventListener('selectstart', onSelectStart);

  /* ── DevTools 检测（尺寸差） ── */
  var devtoolsTriggered = false;
  setInterval(function () {
    if (activeDefenses.indexOf('devtools-detect') === -1) {
      if (devtoolsTriggered) {
        secretCard.classList.remove('blurred');
        devtoolsTriggered = false;
      }
      return;
    }
    var w = window.outerWidth - window.innerWidth;
    var h = window.outerHeight - window.innerHeight;
    var open = w > 160 || h > 160;
    if (open && !devtoolsTriggered) {
      devtoolsTriggered = true;
      secretCard.classList.add('blurred');
      logAction('检测到 DevTools 打开，已模糊内容');
    } else if (!open && devtoolsTriggered) {
      devtoolsTriggered = false;
      secretCard.classList.remove('blurred');
    }
  }, 1200);

  /* ── 日志 ── */
  var logEntries = [];
  function logAction(msg) {
    var time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    logEntries.unshift({ time: time, msg: msg });
    if (logEntries.length > 20) logEntries.pop();
    renderLog();
  }
  function renderLog() {
    var el = document.getElementById('actionLog');
    if (logEntries.length === 0) {
      el.innerHTML = '<div class="log-empty">启用防护后事件会在这里记录</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < logEntries.length; i++) {
      html += '<div class="log-entry"><span class="log-time">' + logEntries[i].time + '</span><span class="log-msg">' + logEntries[i].msg + '</span></div>';
    }
    el.innerHTML = html;
  }

  /* ── Toast ── */
  var toastEl = document.getElementById('toast');
  var toastTimer = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('show');
    }, 2600);
  }

  /* ══════════ Tab 2：攻防模拟 ══════════ */
  window.runBattle = function () {
    var method = document.getElementById('attackMethod').value;
    var defenses = [];
    for (var i = 0; i < TECHNIQUES.length; i++) {
      if (activeDefenses.indexOf(TECHNIQUES[i].id) > -1) defenses.push(TECHNIQUES[i]);
    }
    // 若未启用任何防护，用一个默认组合（水印 + 失焦模糊 + 拦截）
    if (defenses.length === 0) {
      defenses = [
        findTech('dynamic-watermark'),
        findTech('blur-on-blur'),
        findTech('block-f12-menu'),
      ];
    }

    var result = simulateBattle(defenses, method);
    renderBattleResult(method, defenses, result);
  };

  var methodLabel = {
    'os-screenshot': '系统截图键',
    'phone-camera': '手机对屏拍照',
    'os-recording': 'OS 级录屏',
    'devtools-save': 'DevTools 保存',
    'headless-crawler': '自动化爬虫',
    'text-copy': '手动复制文本',
  };
  var outcomeLabel = { blocked: '拦住', traceable: '溯源可追踪', useless: '无效' };
  var outcomeIcon = {
    blocked: '<i class="ti ti-shield-check"></i>',
    traceable: '<i class="ti ti-fingerprint"></i>',
    useless: '<i class="ti ti-shield-off"></i>',
  };

  function renderBattleResult(method, defenses, result) {
    var area = document.getElementById('battleResult');
    area.style.display = 'block';
    var html = ''
      + '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px;font-size:0.95rem;">'
      +   '<span style="color:#ef5350;"><i class="ti ti-sword"></i> ' + (methodLabel[method] || method) + '</span>'
      +   '<span style="color:#666;">对阵</span>'
      +   '<span style="color:#66bb6a;"><i class="ti ti-shield"></i> ' + defenses.length + ' 项防护</span>'
      + '</div>';

    html += '<div class="battle-timeline">';
    for (var i = 0; i < result.results.length; i++) {
      var r = result.results[i];
      html += ''
        + '<div class="battle-step ' + r.outcome + '">'
        +   '<span class="step-icon">' + outcomeIcon[r.outcome] + '</span>'
        +   '<span class="step-name">' + r.name + '</span>'
        +   '<span class="step-tag">' + outcomeLabel[r.outcome] + '</span>'
        +   '<div class="step-detail">' + r.detail + '</div>'
        + '</div>';
    }
    html += '</div>';

    html += '<div class="battle-verdict"><i class="ti ti-flag"></i><span>' + result.verdict + '</span></div>';
    area.innerHTML = html;
  }

  /* ══════════ Tab 3：真实案例 ══════════ */
  function renderRealCases() {
    var grid = document.getElementById('caseGrid');
    var html = '';
    for (var i = 0; i < REAL_WORLD_CASES.length; i++) {
      var c = REAL_WORLD_CASES[i];
      var tagHtml = '';
      for (var j = 0; j < c.tags.length; j++) {
        tagHtml += '<span class="case-tag">' + c.tags[j] + '</span>';
      }
      html += ''
        + '<div class="case-card">'
        +   '<div class="case-name">' + c.name + '</div>'
        +   '<div class="case-tags">' + tagHtml + '</div>'
        +   '<div class="case-note">' + c.note + '</div>'
        + '</div>';
    }
    grid.innerHTML = html;
  }

  /* ── 初始化 ── */
  renderTechCards();
  applyDefenses();
  updateProtectionMeter();
  renderLog();
  renderRealCases();
})();

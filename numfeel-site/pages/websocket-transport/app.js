/**
 * WebSocket vs HTTP 传输实验 —— 场景模拟器。
 * 四个场景，双按钮（HTTP / WS），亲眼感受协议差异。
 */
(function() {
  'use strict';

  var API_BASE = 'https://numfeel-api.996.ninja';
  var WS_BASE = 'wss://numfeel-api.996.ninja';

  // ── DOM ──
  var scenarioTabs = document.getElementById('scenarioTabs');
  var httpBtn = document.getElementById('httpBtn');
  var wsBtn = document.getElementById('wsBtn');
  var httpTimingValue = document.getElementById('httpTimingValue');
  var wsTimingValue = document.getElementById('wsTimingValue');
  var wsTimingLabel = document.getElementById('wsTimingLabel');
  var stage = document.getElementById('stage');
  var stageEmpty = document.getElementById('stageEmpty');
  var stageContent = document.getElementById('stageContent');
  var insightBar = document.getElementById('insightBar');
  var insightText = document.getElementById('insightText');
  var moreToggle = document.getElementById('moreToggle');
  var moreContent = document.getElementById('moreContent');

  // ── 状态 ──
  var currentScenario = 'trading';
  var wsSocket = null;
  var wsConnected = false;
  var httpLoading = false;
  var profileFieldsReceived = 0;
  var wsEventsReceived = 0;
  var httpStartTime = 0;
  var wsStartTime = 0;

  // ── 场景配置 ──
  var SCENARIOS = {
    trading: {
      label: '行情盘',
      endpoint: '/transport-lab/scenario/trading',
      insightHTTP: 'HTTP 一次性拉取 6 个币种价格 + 8 条成交记录，瞬间全部出现——但之后数据就"死"了，不会再更新。',
      insightWS: 'WebSocket 持续推送实时行情，价格每秒都在跳动。交易员盯着屏幕，等不了 2 秒一次轮询。',
      insightNeutral: '高频实时场景：HTTP 轮询有信息盲区，WS 推送才是正解。'
    },
    profile: {
      label: '资料页',
      endpoint: '/transport-lab/scenario/profile',
      insightHTTP: 'HTTP 一次请求返回 8 个字段，全部瞬间渲染——这就是静态资料该有的加载方式。',
      insightWS: 'WebSocket 逐字段推送，每个字段间隔 350ms，8 个字段全部到齐要等将近 3 秒。这种感觉...不太对劲吧？',
      insightNeutral: '低频静态场景：HTTP 一次性返回更高效，WS 逐字段推送纯属浪费连接。'
    },
    dashboard: {
      label: '数据看板',
      endpoint: '/transport-lab/scenario/dashboard',
      insightHTTP: 'HTTP 拉到的数据是某个时间点的快照。3 秒后、5 秒后，数字依旧是那些数字——但真实系统早已变化。',
      insightWS: 'WebSocket 每 500ms 推送一次最新指标，CPU、内存、QPS 持续跳动。运维人员需要的是"此刻"，不是"刚才"。',
      insightNeutral: '监控场景：需要持续感知变化，WS 推送避免了轮询的信息盲区和带宽浪费。'
    },
    gaming: {
      label: '多人游戏',
      endpoint: '/transport-lab/scenario/gaming',
      insightHTTP: 'HTTP 拿到的是某一帧的玩家位置和血量。角色从左边"跳"到右边——中间移动的过程完全丢失。',
      insightWS: 'WebSocket 每 220ms 推一帧，角色平滑移动，血条实时变化。你能看到攻击发生的整个过程。',
      insightNeutral: '实时互动场景：游戏需要连续的"过程"而不只是"结果"，WS 是不可替代的。'
    }
  };

  // ── 工具 ──
  function pad(n) { return n.toString().padStart(2, '0'); }
  function nowTime() {
    var d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function showStage() {
    stageEmpty.style.display = 'none';
    stageContent.style.display = 'block';
  }

  function hideStage() {
    stageEmpty.style.display = '';
    stageContent.style.display = 'none';
    stageContent.innerHTML = '';
  }

  // ══════════════════════════════════════════
  //  场景切换
  // ══════════════════════════════════════════

  scenarioTabs.addEventListener('click', function(e) {
    var tab = e.target.closest('.scenario-tab');
    if (!tab) return;
    currentScenario = tab.dataset.scenario;

    scenarioTabs.querySelectorAll('.scenario-tab').forEach(function(t) { t.classList.remove('active'); });
    tab.classList.add('active');

    // 断开旧连接
    disconnectWs();
    // 重置状态
    httpLoading = false;
    httpBtn.classList.remove('loading');
    httpBtn.innerHTML = '<i class="ti ti-cloud-download"></i> HTTP 加载';
    httpTimingValue.textContent = '—';
    wsTimingValue.textContent = '待连接';
    wsTimingLabel.textContent = '状态';
    hideStage();
    insightBar.style.display = 'none';
    profileFieldsReceived = 0;
    wsEventsReceived = 0;
  });

  // ══════════════════════════════════════════
  //  HTTP 加载
  // ══════════════════════════════════════════

  httpBtn.addEventListener('click', function() {
    if (httpLoading) return;
    httpLoading = true;
    httpBtn.classList.add('loading');
    httpBtn.innerHTML = '<i class="ti ti-loader"></i> 请求中...';
    httpTimingValue.textContent = '...';
    wsEventsReceived = 0;
    profileFieldsReceived = 0;

    var url = API_BASE + SCENARIOS[currentScenario].endpoint;
    httpStartTime = performance.now();

    fetch(url)
      .then(function(res) { return res.json(); })
      .then(function(data) {
        var elapsed = Math.round(performance.now() - httpStartTime);
        httpTimingValue.textContent = elapsed + ' ms';
        httpBtn.classList.remove('loading');
        httpBtn.innerHTML = '<i class="ti ti-cloud-download"></i> HTTP 加载';
        httpLoading = false;

        var payload = data && data.data ? data.data : data;
        renderStageHTTP(currentScenario, payload);

        // 显示洞察
        var insight = currentScenario === 'profile' || currentScenario === 'dashboard'
          ? SCENARIOS[currentScenario].insightHTTP
          : null;
        if (insight && !wsConnected) showInsight(insight);
      })
      .catch(function(err) {
        httpTimingValue.textContent = '失败';
        httpBtn.classList.remove('loading');
        httpBtn.innerHTML = '<i class="ti ti-cloud-download"></i> HTTP 加载';
        httpLoading = false;
      });
  });

  function renderStageHTTP(scenario, data) {
    showStage();
    switch (scenario) {
      case 'trading': renderTradingStage(data, false); break;
      case 'profile': renderProfileStage(data, true); break;
      case 'dashboard': renderDashboardStage(data, false); break;
      case 'gaming': renderGamingStage(data, false); break;
    }
  }

  // ══════════════════════════════════════════
  //  WebSocket 连接
  // ══════════════════════════════════════════

  wsBtn.addEventListener('click', function() {
    if (wsConnected) {
      disconnectWs();
      return;
    }
    connectWs();
  });

  function connectWs() {
    wsEventsReceived = 0;
    profileFieldsReceived = 0;
    wsBtn.classList.add('loading');
    wsBtn.innerHTML = '<i class="ti ti-loader"></i> 连接中...';
    wsTimingValue.textContent = '...';
    wsTimingLabel.textContent = '状态';

    var wsUrl = WS_BASE + '/transport-lab/ws?scenario=' + currentScenario;
    wsStartTime = performance.now();

    try {
      wsSocket = new WebSocket(wsUrl);
    } catch (e) {
      wsTimingValue.textContent = '失败';
      wsBtn.classList.remove('loading');
      wsBtn.innerHTML = '<i class="ti ti-plug-connected"></i> WebSocket 连接';
      return;
    }

    wsSocket.onopen = function() {
      wsConnected = true;
      var elapsed = Math.round(performance.now() - wsStartTime);
      wsTimingValue.textContent = '握手 ' + elapsed + 'ms';
      wsTimingLabel.textContent = '已连接';
      wsBtn.classList.remove('loading');
      wsBtn.innerHTML = '<i class="ti ti-plug-connected"></i> 断开连接';
      wsBtn.classList.add('connected');
    };

    wsSocket.onmessage = function(event) {
      var data;
      try { data = JSON.parse(event.data); } catch (e) { return; }

      if (data.type === 'ready') {
        // 已就绪，等待数据
        return;
      }

      wsEventsReceived++;
      var elapsed = Math.round(performance.now() - wsStartTime);

      switch (data.type) {
        case 'tick':
          handleWsTick(data, elapsed);
          break;
        case 'profile_field':
          handleWsProfileField(data, elapsed);
          break;
        case 'profile_done':
          handleWsProfileDone(elapsed);
          break;
        case 'dashboard_snapshot':
          handleWsDashboard(data, elapsed);
          break;
        case 'game_state':
          handleWsGameState(data, elapsed);
          break;
      }
    };

    wsSocket.onerror = function() {
      wsTimingValue.textContent = '错误';
      resetWsUI();
    };

    wsSocket.onclose = function() {
      if (wsConnected) resetWsUI();
    };
  }

  function disconnectWs() {
    if (wsSocket) {
      wsSocket.close(1000, '用户断开');
      wsSocket = null;
    }
    resetWsUI();
  }

  function resetWsUI() {
    wsConnected = false;
    wsSocket = null;
    wsBtn.classList.remove('loading', 'connected');
    wsBtn.innerHTML = '<i class="ti ti-plug-connected"></i> WebSocket 连接';
    wsTimingValue.textContent = '已断开';
    wsTimingLabel.textContent = '状态';
  }

  // ── WS 事件处理 ──

  function handleWsTick(data, elapsed) {
    showStage();
    if (wsEventsReceived === 1) renderTradingStageEmpty();
    updateTradingTick(data);
    wsTimingValue.textContent = elapsed + 'ms / ' + wsEventsReceived + '条';
  }

  function handleWsProfileField(data, elapsed) {
    showStage();
    if (wsEventsReceived === 1) renderProfileStageEmpty();
    profileFieldsReceived++;
    appendProfileField(data);
    wsTimingValue.textContent = elapsed + 'ms / ' + profileFieldsReceived + '/' + data.total + '字段';
    wsTimingLabel.textContent = '推送中';
  }

  function handleWsProfileDone(elapsed) {
    wsTimingLabel.textContent = '完成';
    wsTimingValue.textContent = elapsed + 'ms';
    showInsight(SCENARIOS.profile.insightWS);
    stageContent.querySelector('.profile-progress') &&
      (stageContent.querySelector('.profile-progress').textContent = '全部字段已接收 ✓');
  }

  function handleWsDashboard(data, elapsed) {
    showStage();
    if (wsEventsReceived === 1) renderDashboardStageEmpty();
    updateDashboardMetrics(data);
    wsTimingValue.textContent = elapsed + 'ms / ' + wsEventsReceived + '次';
    if (wsEventsReceived >= 3) showInsight(SCENARIOS.dashboard.insightWS);
  }

  function handleWsGameState(data, elapsed) {
    showStage();
    if (wsEventsReceived === 1) renderGamingStageEmpty();
    updateGamingState(data);
    wsTimingValue.textContent = elapsed + 'ms / ' + wsEventsReceived + '帧';
    if (wsEventsReceived >= 5) showInsight(SCENARIOS.gaming.insightWS);
  }

  // ══════════════════════════════════════════
  //  场景舞台渲染：行情盘
  // ══════════════════════════════════════════

  function renderTradingStage(data, fromHTTP) {
    var html = '<div class="trading-terminal">';
    html += '<div class="terminal-header"><i class="ti ti-trending-up"></i> 实时行情终端</div>';

    // 价格卡片行
    html += '<div class="ticker-row" id="tickerRow">';
    var symbols = data.symbols || [];
    symbols.forEach(function(s) {
      var changeClass = s.change >= 0 ? 'up' : 'down';
      html += '<div class="ticker-card ' + changeClass + '" data-symbol="' + s.symbol + '">';
      html += '<div class="ticker-symbol">' + s.symbol + '</div>';
      html += '<div class="ticker-price">$' + s.price.toFixed(2) + '</div>';
      html += '<div class="ticker-change ' + changeClass + '">' + (s.change >= 0 ? '+' : '') + s.change + '%</div>';
      html += '<div class="ticker-vol">vol ' + s.volume + '</div>';
      html += '</div>';
    });
    html += '</div>';

    // 成交记录
    html += '<div class="trade-list" id="tradeList">';
    html += '<div class="trade-list-header">最近成交</div>';
    var trades = data.recentTrades || [];
    trades.forEach(function(t) {
      html += '<div class="trade-item">';
      html += '<span class="trade-time">' + new Date(t.time).toLocaleTimeString() + '</span>';
      html += '<span class="trade-symbol">' + t.symbol + '</span>';
      html += '<span class="trade-price">$' + t.price.toFixed(2) + '</span>';
      html += '<span class="trade-amount">' + t.amount + '</span>';
      html += '</div>';
    });
    html += '</div>';

    html += '</div>';
    stageContent.innerHTML = html;

    if (fromHTTP) showInsight(SCENARIOS.trading.insightHTTP);
  }

  function renderTradingStageEmpty() {
    stageContent.innerHTML = '<div class="trading-terminal"><div class="terminal-header"><i class="ti ti-trending-up"></i> 实时行情终端</div><div class="ticker-row" id="tickerRow"></div><div class="trade-list" id="tradeList"><div class="trade-list-header">最近成交</div></div></div>';
  }

  function updateTradingTick(data) {
    // 更新或添加价格卡片
    var tickerRow = document.getElementById('tickerRow');
    var existingCard = tickerRow.querySelector('[data-symbol="' + data.symbol + '"]');
    var changeClass = data.change >= 0 ? 'up' : 'down';
    var cardHTML = '<div class="ticker-card ' + changeClass + '" data-symbol="' + data.symbol + '">' +
      '<div class="ticker-symbol">' + data.symbol + '</div>' +
      '<div class="ticker-price">$' + data.price.toFixed(2) + '</div>' +
      '<div class="ticker-change ' + changeClass + '">' + (data.change >= 0 ? '+' : '') + data.change + '%</div>' +
      '<div class="ticker-vol">vol ' + data.volume + '</div></div>';

    if (existingCard) {
      existingCard.outerHTML = cardHTML;
    } else if (tickerRow.children.length < 6) {
      tickerRow.insertAdjacentHTML('beforeend', cardHTML);
    }

    // 成交记录
    var tradeList = document.getElementById('tradeList');
    var tradeHTML = '<div class="trade-item new">' +
      '<span class="trade-time">' + nowTime() + '</span>' +
      '<span class="trade-symbol">' + data.symbol + '</span>' +
      '<span class="trade-price">$' + data.price.toFixed(2) + '</span>' +
      '<span class="trade-amount">' + (Math.random() * 5).toFixed(2) + '</span></div>';
    tradeList.insertAdjacentHTML('afterbegin', tradeHTML);
    if (tradeList.children.length > 15) tradeList.lastElementChild.remove();
  }

  // ══════════════════════════════════════════
  //  场景舞台渲染：资料页
  // ══════════════════════════════════════════

  function renderProfileStage(data, fromHTTP) {
    var fields = data.fields || [];
    var html = '<div class="profile-card">';
    html += '<div class="profile-header">个人资料</div>';
    html += '<div class="profile-fields" id="profileFields">';
    fields.forEach(function(f) {
      html += renderProfileFieldHTML(f);
    });
    html += '</div>';
    html += '<div class="profile-progress">' + fields.length + ' 个字段已加载</div>';
    html += '</div>';
    stageContent.innerHTML = html;
    if (fromHTTP) showInsight(SCENARIOS.profile.insightHTTP);
  }

  function renderProfileStageEmpty() {
    stageContent.innerHTML = '<div class="profile-card"><div class="profile-header">个人资料</div><div class="profile-fields" id="profileFields"></div><div class="profile-progress">0 / 8 字段</div></div>';
  }

  function renderProfileFieldHTML(f) {
    var html = '<div class="profile-field" data-key="' + f.key + '">';
    html += '<span class="pf-label">' + f.label + '</span>';
    html += '<span class="pf-value">';
    if (f.key === 'avatar') {
      html += '<img class="pf-avatar" src="' + (f.imageUrl || f.value) + '" alt="\u5934\u50cf">';
    } else {
      html += f.value;
    }
    html += '</span></div>';
    return html;
  }

  function appendProfileField(data) {
    var fields = document.getElementById('profileFields');
    if (!fields) return;
    var existing = fields.querySelector('[data-key="' + data.key + '"]');
    if (existing) return;
    var f = { key: data.key, value: data.value, label: data.label, imageUrl: data.key === 'avatar' ? data.value : '' };
    fields.insertAdjacentHTML('beforeend', renderProfileFieldHTML(f));
    var progress = stageContent.querySelector('.profile-progress');
    if (progress) progress.textContent = profileFieldsReceived + ' / ' + data.total + ' 字段';
  }

  // ══════════════════════════════════════════
  //  场景舞台渲染：数据看板
  // ══════════════════════════════════════════

  function renderDashboardStage(data, fromHTTP) {
    var metrics = data.metrics || [];
    var html = '<div class="dashboard-panel">';
    html += '<div class="dash-header"><i class="ti ti-dashboard"></i> 系统监控面板</div>';
    html += '<div class="dash-grid" id="dashGrid">';
    metrics.forEach(function(m) {
      html += renderMetricCard(m);
    });
    html += '</div></div>';
    stageContent.innerHTML = html;
    if (fromHTTP) showInsight(SCENARIOS.dashboard.insightHTTP);
  }

  function renderDashboardStageEmpty() {
    stageContent.innerHTML = '<div class="dashboard-panel"><div class="dash-header"><i class="ti ti-dashboard"></i> 系统监控面板</div><div class="dash-grid" id="dashGrid"></div></div>';
  }

  function renderMetricCard(m) {
    var pct = m.unit === '%' ? m.value : (m.value / 100);
    var color = pct > 80 ? '#ff6b6b' : pct > 60 ? '#ffd700' : '#81c784';
    return '<div class="dash-card" data-key="' + m.key + '">' +
      '<div class="dash-label">' + m.label + '</div>' +
      '<div class="dash-value" style="color:' + color + '">' + m.value + (m.unit ? ' <small>' + m.unit + '</small>' : '') + '</div>' +
      '<div class="dash-bar"><div class="dash-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
      '</div>';
  }

  function updateDashboardMetrics(data) {
    var grid = document.getElementById('dashGrid');
    if (!grid) return;
    var metrics = data.metrics || [];
    metrics.forEach(function(m) {
      var card = grid.querySelector('[data-key="' + m.key + '"]');
      var pct = m.unit === '%' ? m.value : Math.min(m.value / 100, 100);
      var color = pct > 80 ? '#ff6b6b' : pct > 60 ? '#ffd700' : '#81c784';
      if (card) {
        card.querySelector('.dash-value').innerHTML = m.value + (m.unit ? ' <small>' + m.unit + '</small>' : '');
        card.querySelector('.dash-value').style.color = color;
        card.querySelector('.dash-bar-fill').style.width = pct + '%';
        card.querySelector('.dash-bar-fill').style.background = color;
      } else {
        grid.insertAdjacentHTML('beforeend', renderMetricCard(m));
      }
    });
  }

  // ══════════════════════════════════════════
  //  场景舞台渲染：多人游戏
  // ══════════════════════════════════════════

  function renderGamingStage(data, fromHTTP) {
    var players = data.players || [];
    var html = '<div class="game-battlefield">';
    html += '<div class="game-header"><i class="ti ti-sword"></i> 战场实时状态</div>';
    html += '<div class="game-arena" id="gameArena">';
    html += '<div class="arena-grid"></div>';
    players.forEach(function(p) {
      var hpPct = p.maxHp > 0 ? (p.hp / p.maxHp * 100) : 0;
      var hpColor = hpPct > 50 ? '#81c784' : hpPct > 25 ? '#ffd700' : '#ff6b6b';
      html += '<div class="game-player" data-id="' + p.id + '" style="left:' + p.x + '%;top:' + p.y + '%">';
      html += '<div class="gp-dot" style="background:' + getClassColor(p.cls) + '"></div>';
      html += '<div class="gp-name">' + p.name + '</div>';
      html += '<div class="gp-hp-bar"><div class="gp-hp-fill" style="width:' + hpPct + '%;background:' + hpColor + '"></div></div>';
      html += '</div>';
    });
    html += '</div></div>';
    stageContent.innerHTML = html;
    if (fromHTTP) showInsight(SCENARIOS.gaming.insightHTTP);
  }

  function renderGamingStageEmpty() {
    stageContent.innerHTML = '<div class="game-battlefield"><div class="game-header"><i class="ti ti-sword"></i> 战场实时状态</div><div class="game-arena" id="gameArena"><div class="arena-grid"></div></div></div>';
  }

  function updateGamingState(data) {
    var arena = document.getElementById('gameArena');
    if (!arena) return;
    var players = data.players || [];
    players.forEach(function(p) {
      var el = arena.querySelector('[data-id="' + p.id + '"]');
      var hpPct = p.maxHp > 0 ? (p.hp / p.maxHp * 100) : 0;
      var hpColor = hpPct > 50 ? '#81c784' : hpPct > 25 ? '#ffd700' : '#ff6b6b';
      if (el) {
        el.style.left = p.x + '%';
        el.style.top = p.y + '%';
        var fill = el.querySelector('.gp-hp-fill');
        if (fill) {
          fill.style.width = hpPct + '%';
          fill.style.background = hpColor;
        }
      } else {
        var html = '<div class="game-player" data-id="' + p.id + '" style="left:' + p.x + '%;top:' + p.y + '%">' +
          '<div class="gp-dot" style="background:' + getClassColor(p.cls) + '"></div>' +
          '<div class="gp-name">' + p.name + '</div>' +
          '<div class="gp-hp-bar"><div class="gp-hp-fill" style="width:' + hpPct + '%;background:' + hpColor + '"></div></div></div>';
        arena.insertAdjacentHTML('beforeend', html);
      }
    });
  }

  function getClassColor(cls) {
    switch (cls) {
      case 'warrior': return '#ff6b6b';
      case 'mage': return '#ce93d8';
      case 'assassin': return '#90caf9';
      case 'priest': return '#ffffff';
      case 'archer': return '#81c784';
      case 'knight': return '#ffd700';
      default: return '#888';
    }
  }

  // ══════════════════════════════════════════
  //  洞察
  // ══════════════════════════════════════════

  function showInsight(text) {
    insightBar.style.display = 'flex';
    if (typeof gsap !== 'undefined') {
      gsap.to(insightBar, { opacity: 0, duration: 0.15, onComplete: function() {
        insightText.textContent = text;
        gsap.to(insightBar, { opacity: 1, duration: 0.3 });
      }});
    } else {
      insightText.textContent = text;
    }
  }

  // ══════════════════════════════════════════
  //  了解更多
  // ══════════════════════════════════════════

  moreToggle.addEventListener('click', function() {
    var isOpen = moreContent.classList.contains('open');
    if (isOpen) {
      moreContent.classList.remove('open');
      moreToggle.classList.remove('open');
    } else {
      moreContent.classList.add('open');
      moreToggle.classList.add('open');
    }
  });

  // ── 初始默认场景提示 ──
  showInsight(SCENARIOS.trading.insightNeutral);

})();

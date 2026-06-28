/**
 * WebSocket 空闲连接流量实测 — 应用逻辑。
 * 自动连接，跟踪实际流量，展示时间轴投影。
 */
(function() {
  'use strict';

  var WS_BASE = 'wss://numfeel-api.996.ninja';

  // ── 协议层常量 ──
  var WS_HANDSHAKE = 1100;          // WebSocket 升级握手一次性开销 (B)
  var PER_PACKET_OVERHEAD = 62;     // WS帧头(4) + TCP(20) + IP(20) + Eth(14) + FCS(4)

  // ── 时间轴里程碑（秒） ──
  var MILESTONES = [
    { label: '10 秒', seconds: 10 },
    { label: '1 分钟', seconds: 60 },
    { label: '30 分钟', seconds: 1800 },
    { label: '1 小时', seconds: 3600 },
    { label: '8 小时', seconds: 28800 },
    { label: '24 小时', seconds: 86400 }
  ];

  // ── DOM ──
  var statusDot = document.getElementById('statusDot');
  var statusText = document.getElementById('statusText');
  var statusInterval = document.getElementById('statusInterval');
  var statusElapsed = document.getElementById('statusElapsed');
  var heartbeatCountEl = document.getElementById('heartbeatCount');
  var appTrafficEl = document.getElementById('appTraffic');
  var wireTrafficEl = document.getElementById('wireTraffic');
  var timelineGrid = document.getElementById('timelineGrid');
  var compareGrid = document.getElementById('compareGrid');
  var intervalSlider = document.getElementById('intervalSlider');
  var intervalValue = document.getElementById('intervalValue');
  var reconnectBtn = document.getElementById('reconnectBtn');
  var layerAppSize = document.getElementById('layerAppSize');

  // ── 状态 ──
  var wsSocket = null;
  var wsConnected = false;
  var connectStartTime = 0;
  var heartbeatCount = 0;
  var appBytesTotal = 0;
  var avgPayloadSize = 0;
  var currentIntervalS = 5;
  var elapsedTimer = null;
  var updateTimer = null;

  // ── 工具 ──

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function formatDuration(totalSec) {
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = Math.floor(totalSec % 60);
    if (h > 0) return h + 'h ' + pad(m) + 'm ' + pad(s) + 's';
    if (m > 0) return m + 'm ' + pad(s) + 's';
    return s + 's';
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return Math.round(bytes) + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function formatBytesPrecise(bytes) {
    if (bytes < 1024) return Math.round(bytes) + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(3) + ' MB';
  }

  /**
   * 计算预估网络层总流量。
   * @param {number} count 心跳次数（预估时使用）
   * @param {number} avgBytes 平均每条应用层载荷字节数
   * @returns {number} 预估总字节数
   */
  function calcWireTraffic(count, avgBytes) {
    if (count === 0) return WS_HANDSHAKE; // 只有握手
    return WS_HANDSHAKE + count * (avgBytes + PER_PACKET_OVERHEAD);
  }

  // ══════════════════════════════════════════
  //  WebSocket 连接
  // ══════════════════════════════════════════

  function connect() {
    var intervalMs = currentIntervalS * 1000;
    var wsUrl = WS_BASE + '/transport-lab/ws?scenario=idle&delay=' + intervalMs;

    heartbeatCount = 0;
    appBytesTotal = 0;
    avgPayloadSize = 0;
    connectStartTime = performance.now();

    setStatus('connecting', '正在连接...');
    updateStats();

    try {
      wsSocket = new WebSocket(wsUrl);
    } catch (e) {
      setStatus('disconnected', '连接失败');
      return;
    }

    wsSocket.onopen = function() {
      wsConnected = true;
      setStatus('connected', '已连接（空闲心跳中）');
      startTimers();
      renderTimeline();
      renderCompare();
    };

    wsSocket.onmessage = function(event) {
      var payloadSize = (typeof event.data === 'string') ? event.data.length : event.data.byteLength;
      heartbeatCount++;
      appBytesTotal += payloadSize;
      avgPayloadSize = Math.round(appBytesTotal / heartbeatCount);

      // 更新协议层拆解中的应用数据大小
      if (layerAppSize && heartbeatCount === 1) {
        layerAppSize.textContent = '~' + payloadSize + ' B（实测）';
      }

      updateStats();
      renderTimeline();
    };

    wsSocket.onerror = function() {
      setStatus('disconnected', '连接错误');
      stopTimers();
    };

    wsSocket.onclose = function() {
      wsConnected = false;
      wsSocket = null;
      setStatus('disconnected', '连接已断开');
      stopTimers();
    };
  }

  function disconnect() {
    stopTimers();
    if (wsSocket) {
      wsSocket.close(1000, '用户断开');
      wsSocket = null;
    }
    wsConnected = false;
    setStatus('disconnected', '已断开');
  }

  function setStatus(state, text) {
    statusDot.className = 'status-dot';
    if (state === 'connecting') statusDot.classList.add('connecting');
    if (state === 'disconnected') statusDot.classList.add('disconnected');
    statusText.textContent = text;
  }

  // ══════════════════════════════════════════
  //  计时器
  // ══════════════════════════════════════════

  function startTimers() {
    stopTimers();
    elapsedTimer = setInterval(updateElapsed, 1000);
    updateTimer = setInterval(function() {
      updateStats();
      renderTimeline();
    }, 5000);
  }

  function stopTimers() {
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
    if (updateTimer) { clearInterval(updateTimer); updateTimer = null; }
  }

  // ══════════════════════════════════════════
  //  更新显示
  // ══════════════════════════════════════════

  function getElapsedSeconds() {
    if (!wsConnected || connectStartTime === 0) return 0;
    return (performance.now() - connectStartTime) / 1000;
  }

  function updateElapsed() {
    var sec = getElapsedSeconds();
    statusElapsed.textContent = formatDuration(sec);
  }

  function updateStats() {
    heartbeatCountEl.textContent = heartbeatCount;

    if (appBytesTotal < 1024) {
      appTrafficEl.textContent = appBytesTotal;
      appTrafficEl.parentElement.querySelector('.stat-unit').textContent = 'B';
    } else if (appBytesTotal < 1024 * 1024) {
      appTrafficEl.textContent = (appBytesTotal / 1024).toFixed(1);
      appTrafficEl.parentElement.querySelector('.stat-unit').textContent = 'KB';
    } else {
      appTrafficEl.textContent = (appBytesTotal / (1024 * 1024)).toFixed(2);
      appTrafficEl.parentElement.querySelector('.stat-unit').textContent = 'MB';
    }

    var wireBytes = calcWireTraffic(heartbeatCount, avgPayloadSize || 30);
    if (wireBytes < 1024) {
      wireTrafficEl.textContent = wireBytes;
      wireTrafficEl.parentElement.querySelector('.stat-unit').textContent = 'B';
    } else if (wireBytes < 1024 * 1024) {
      wireTrafficEl.textContent = (wireBytes / 1024).toFixed(2);
      wireTrafficEl.parentElement.querySelector('.stat-unit').textContent = 'KB';
    } else {
      wireTrafficEl.textContent = (wireBytes / (1024 * 1024)).toFixed(3);
      wireTrafficEl.parentElement.querySelector('.stat-unit').textContent = 'MB';
    }

    updateElapsed();
  }

  // ══════════════════════════════════════════
  //  时间轴渲染
  // ══════════════════════════════════════════

  function renderTimeline() {
    var elapsed = getElapsedSeconds();
    var currentRate = heartbeatCount > 0 ? (heartbeatCount / Math.max(elapsed, 1)) : 0;
    var useAvgBytes = avgPayloadSize || 30;

    var html = '';
    MILESTONES.forEach(function(m) {
      var isReached = elapsed >= m.seconds;
      var isCurrent = !isReached && (elapsed > 0);

      // 计算这个时间点的流量
      var projectedCount, wireBytes;
      if (isReached) {
        // 实际已达：按比例计算此时的流量（因为我们在到达该时间点时没有快照，用速率估算）
        projectedCount = Math.floor(currentRate * m.seconds);
        wireBytes = calcWireTraffic(projectedCount, useAvgBytes);
      } else {
        // 未到达：用当前速率预估
        projectedCount = Math.floor(currentRate * m.seconds);
        wireBytes = calcWireTraffic(projectedCount, useAvgBytes);
      }

      var cls = isReached ? 'reached' : (isCurrent ? 'current' : '');
      var statusLabel = isReached ? '已到达' : '预估中';

      html += '<div class="timeline-card ' + cls + '">';
      html += '<div class="tl-time">' + m.label + '</div>';
      html += '<div class="tl-traffic">' + formatBytes(wireBytes) + '</div>';
      html += '<div class="tl-status ' + (isReached ? 'real' : 'projected') + '">' + statusLabel + '</div>';
      html += '</div>';
    });

    timelineGrid.innerHTML = html;
  }

  // ══════════════════════════════════════════
  //  HTTP 对比
  // ══════════════════════════════════════════

  function renderCompare() {
    var HTTP_HEADERS = 900;  // 每次 HTTP 请求头约 900 字节
    var useAvgBytes = avgPayloadSize || 30;

    var intervals = [
      { label: '每条心跳/请求', wsApp: useAvgBytes, wsWire: useAvgBytes + PER_PACKET_OVERHEAD, httpWire: HTTP_HEADERS },
      { label: '1 小时（间隔 ' + currentIntervalS + 's）', wsApp: 0, wsWire: 0, httpWire: 0 },
      { label: '24 小时（间隔 ' + currentIntervalS + 's）', wsApp: 0, wsWire: 0, httpWire: 0 }
    ];

    // 计算 1h 和 24h 的
    var perHour = Math.floor(3600 / currentIntervalS);
    var perDay = Math.floor(86400 / currentIntervalS);

    intervals[1].wsWire = calcWireTraffic(perHour, useAvgBytes);
    intervals[1].httpWire = perHour * HTTP_HEADERS;

    intervals[2].wsWire = calcWireTraffic(perDay, useAvgBytes);
    intervals[2].httpWire = perDay * HTTP_HEADERS;

    var html = '';
    intervals.forEach(function(item) {
      var wsFmt = formatBytesPrecise(item.wsWire);
      var httpFmt = formatBytesPrecise(item.httpWire);
      var ratio;
      if (item.httpWire > 0 && item.wsWire > 0) {
        ratio = 'HTTP 是 WS 的 ' + (item.httpWire / item.wsWire).toFixed(1) + ' 倍';
      } else {
        ratio = '';
      }

      html += '<div class="compare-row">';
      html += '<span class="compare-label">' + item.label + '</span>';
      html += '<span class="compare-ws">WS: ' + wsFmt + '</span>';
      html += '<span class="compare-http">HTTP: ' + httpFmt + '</span>';
      html += '<span class="compare-ratio">' + ratio + '</span>';
      html += '</div>';
    });

    compareGrid.innerHTML = html;
  }

  // ══════════════════════════════════════════
  //  控制
  // ══════════════════════════════════════════

  intervalSlider.addEventListener('input', function() {
    var val = parseInt(this.value);
    currentIntervalS = val;
    intervalValue.textContent = val + 's';
  });

  reconnectBtn.addEventListener('click', function() {
    disconnect();
    connect();
  });

  // ── 初始化 ──
  intervalValue.textContent = currentIntervalS + 's';
  intervalSlider.value = currentIntervalS;
  renderTimeline();
  renderCompare();

  // 自动连接
  connect();

})();

/**
 * WebSocket vs HTTP 传输实验 — 核心计算引擎。
 * 纯函数，不依赖 DOM，与后端 TransportLabService 计算逻辑保持一致。
 */

var TransportEngine = (function() {
  'use strict';

  var HTTP_HEADERS = 900;
  var WS_HANDSHAKE = 1100;
  var WS_FRAME_OVERHEAD = 8;
  var DEFAULT_CONNECTION_MEMORY_KB = 48;
  var DEFAULT_SERVER_WORK_MS = 2.0;
  var DEFAULT_BURST = 1.2;

  /**
   * @param {number} value 输入值
   * @param {number} min 最小值
   * @param {number} max 最大值
   * @returns {number} 夹紧后的值
   */
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * @param {number} value 输入值
   * @returns {number} 保留一位小数
   */
  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  /**
   * 创建标准化参数（填充默认值并夹紧边界）。
   *
   * @param {Object} raw 原始参数
   * @param {number} [raw.eventsPerMinute=60] 每分钟业务事件数
   * @param {number} [raw.payloadSize=500] 单条消息载荷字节数
   * @param {number} [raw.activeSeconds=180] 在线时长（秒）
   * @param {number} [raw.clients=500] 同时在线客户端数
   * @param {number} [raw.pollInterval=5] HTTP 轮询间隔（秒）
   * @param {number} [raw.reconnects=0] WebSocket 重连次数
   * @returns {Object} 标准化参数
   */
  function normalizeParams(raw) {
    raw = raw || {};
    return {
      eventsPerMinute: clamp(parseFloat(raw.eventsPerMinute) || 60, 1, 1000),
      payloadSize: clamp(parseInt(raw.payloadSize) || 500, 50, 20000),
      activeSeconds: clamp(parseFloat(raw.activeSeconds) || 180, 30, 3600),
      clients: clamp(parseInt(raw.clients) || 500, 1, 20000),
      pollInterval: clamp(parseFloat(raw.pollInterval) || 5, 0.5, 60),
      reconnects: clamp(parseInt(raw.reconnects) || 0, 0, 20),
      serverWorkMs: DEFAULT_SERVER_WORK_MS,
      connectionMemoryKb: DEFAULT_CONNECTION_MEMORY_KB,
      burst: DEFAULT_BURST
    };
  }

  /**
   * 根据参数计算 HTTP 与 WebSocket 方案的对比快照。
   *
   * @param {Object} raw 原始参数
   * @returns {Object} 包含 recommendation、http、websocket、summary 等字段
   */
  function snapshot(raw) {
    var p = normalizeParams(raw);
    var eventsPerSecond = p.eventsPerMinute / 60;
    var sessionMinutes = p.activeSeconds / 60;
    var eventCount = Math.max(1, Math.round(p.eventsPerMinute * sessionMinutes));
    var pollCount = Math.max(1, Math.ceil(p.activeSeconds / p.pollInterval));
    var effectivePollResponses = Math.min(eventCount, pollCount);

    var httpBytesPerClient = effectivePollResponses * (p.payloadSize + HTTP_HEADERS);
    var wsBytesPerClient = WS_HANDSHAKE + eventCount * (p.payloadSize + WS_FRAME_OVERHEAD);
    var httpTotalBytes = httpBytesPerClient * p.clients;
    var wsTotalBytes = wsBytesPerClient * p.clients;

    var httpServerMs = pollCount * p.serverWorkMs * p.burst;
    var wsServerMs = (eventCount * p.serverWorkMs * 0.42 + 4 + p.reconnects * 5) * p.burst;

    var httpMemoryMb = round1(p.clients * 4 / 1024);
    var wsMemoryMb = round1(p.clients * p.connectionMemoryKb / 1024);

    var httpLatency = Math.round(p.pollInterval * 500 + 80);
    var wsLatency = Math.round(45 + p.reconnects * 12 + Math.min(eventsPerSecond * 2, 80));

    var wsScore = scoreWebSocket(p, httpLatency, wsLatency, wsMemoryMb);
    var recommendation = wsScore >= 62 ? 'websocket' : (wsScore <= 42 ? 'http' : 'mixed');

    return {
      recommendation: recommendation,
      reason: buildReason(recommendation, p, eventCount, wsMemoryMb),
      eventCount: eventCount,
      pollCount: pollCount,
      score: wsScore,
      http: {
        bytes: httpTotalBytes,
        latencyMs: httpLatency,
        serverMs: round1(httpServerMs * p.clients),
        memoryMb: httpMemoryMb,
        operations: pollCount * p.clients
      },
      websocket: {
        bytes: wsTotalBytes,
        latencyMs: wsLatency,
        serverMs: round1(wsServerMs * p.clients),
        memoryMb: wsMemoryMb,
        operations: eventCount * p.clients
      },
      summary: {
        wsBytesSavedPercent: round1(percentDelta(httpTotalBytes, wsTotalBytes)),
        wsServerSavedPercent: round1(percentDelta(httpServerMs, wsServerMs)),
        wsLatencySavedPercent: round1(percentDelta(httpLatency, wsLatency)),
        wsMemoryPenaltyPercent: round1(percentDelta(wsMemoryMb, httpMemoryMb))
      }
    };
  }

  /**
   * 计算 WebSocket 评分（0-100）。
   */
  function scoreWebSocket(p, httpLatency, wsLatency, wsMemoryMb) {
    var score = 35;
    score += Math.min(p.eventsPerMinute / 4, 32);
    score += p.pollInterval <= 2 ? 14 : (p.pollInterval <= 5 ? 8 : 0);
    score += httpLatency > wsLatency * 4 ? 12 : 4;
    score += p.payloadSize < 700 ? 5 : -4;
    score -= p.clients > 2000 ? 9 : (p.clients > 800 ? 5 : 0);
    score -= wsMemoryMb > 120 ? 10 : (wsMemoryMb > 40 ? 4 : 0);
    score -= p.reconnects * 3;
    if (p.eventsPerMinute <= 6) { score -= 28; }
    if (p.eventsPerMinute <= 2) { score -= 18; }
    return clamp(score, 5, 95);
  }

  /**
   * 计算百分比差值。
   */
  function percentDelta(base, value) {
    if (base === 0) { return 0; }
    return (base - value) / base * 100;
  }

  /**
   * 生成推荐理由文案。
   */
  function buildReason(recommendation, p, eventCount, wsMemoryMb) {
    switch (recommendation) {
      case 'websocket':
        return '事件频率高，轮询会制造大量空请求或延迟；WebSocket 把一次连接摊到 ' + eventCount + ' 条消息上更划算。';
      case 'http':
        return '交互稀疏，HTTP 的一次请求一次响应足够清楚；WebSocket 会让 ' + p.clients + ' 个客户端长期占用约 ' + round1(wsMemoryMb) + ' MB 连接内存。';
      default:
        return '两边都有理由：核心实时区用 WebSocket，列表、表单、历史记录继续走 HTTP，复杂度比较均衡。';
    }
  }

  /**
   * 预设场景配置。
   */
  var PRESETS = [
    {
      id: 'trading',
      label: '行情盘 / 聊天室',
      icon: 'trending-up',
      desc: '高频实时，每秒4次更新',
      params: { eventsPerMinute: 240, payloadSize: 320, activeSeconds: 180, clients: 800, pollInterval: 2, reconnects: 1 }
    },
    {
      id: 'form',
      label: '表单 / 资料页',
      icon: 'forms',
      desc: '低频交互，改完提交即可',
      params: { eventsPerMinute: 1, payloadSize: 1600, activeSeconds: 120, clients: 1200, pollInterval: 30, reconnects: 0 }
    },
    {
      id: 'dashboard',
      label: '数据看板',
      icon: 'dashboard',
      desc: '中等频率，定期刷新',
      params: { eventsPerMinute: 30, payloadSize: 500, activeSeconds: 300, clients: 1500, pollInterval: 5, reconnects: 2 }
    },
    {
      id: 'gaming',
      label: '多人游戏状态同步',
      icon: 'device-gamepad-2',
      desc: '超高频，每帧都可能更新',
      params: { eventsPerMinute: 600, payloadSize: 200, activeSeconds: 360, clients: 500, pollInterval: 0.5, reconnects: 3 }
    }
  ];

  /**
   * 随机提示语列表（彩蛋用）。
   */
  var TIPS = [
    '每个 WebSocket 连接在服务端大约占 48KB 内核缓冲区',
    'HTTP/2 的多路复用让轮询比以前便宜了不少',
    'SSE 适合"只读实时"，但很少有人提它',
    'WebSocket 断了之后，重连和补消息的逻辑才是最头疼的',
    '负载均衡器对长连接天生不友好，会话粘滞是绕不开的坑',
    'Chrome 限制每个域名最多 255 个 WebSocket 连接',
    '微信小程序的 WebSocket 最大并发连接数是 5',
    'HTTP 304 Not Modified 响应可以不传 body，省掉大量流量',
    'CDN 缓存对 WebSocket 消息流几乎没用',
    'NAT 网关通常在 30-120 秒后清理空闲连接映射'
  ];

  /**
   * 获取随机提示语。
   * @returns {string}
   */
  function randomTip() {
    return TIPS[Math.floor(Math.random() * TIPS.length)];
  }

  /**
   * 获取预设场景列表。
   * @returns {Array}
   */
  function getPresets() {
    return PRESETS;
  }

  /**
   * 根据推荐结果获取吉祥物状态。
   * @param {string} recommendation 推荐结果 'websocket'|'http'|'mixed'
   * @returns {{border: string, emoji: string, label: string}}
   */
  function getMascotState(recommendation) {
    switch (recommendation) {
      case 'websocket':
        return { border: '#ce93d8', emoji: '⚡', label: 'WebSocket 更合适' };
      case 'http':
        return { border: '#81c784', emoji: '🐢', label: 'HTTP 就够了' };
      default:
        return { border: '#ffd700', emoji: '🤔', label: '混合方案最优' };
    }
  }

  /**
   * 格式化字节数为可读字符串。
   * @param {number} bytes
   * @returns {string}
   */
  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  /**
   * 格式化毫秒数为可读字符串。
   * @param {number} ms
   * @returns {string}
   */
  function formatMs(ms) {
    if (ms >= 1000) return (ms / 1000).toFixed(1) + ' s';
    return ms + ' ms';
  }

  // 公开 API
  return {
    snapshot: snapshot,
    getPresets: getPresets,
    randomTip: randomTip,
    getMascotState: getMascotState,
    formatBytes: formatBytes,
    formatMs: formatMs,
    // 暴露内部常量供测试使用
    _HTTP_HEADERS: HTTP_HEADERS,
    _WS_HANDSHAKE: WS_HANDSHAKE,
    _WS_FRAME_OVERHEAD: WS_FRAME_OVERHEAD
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TransportEngine;
}

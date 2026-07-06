/**
 * 隐身通道 demo 核心逻辑
 * 纯函数，不操作 DOM，可被 node 测试
 * 对比 6 种浏览器数据外发通道在 Network tab 中的可见性
 */

// 可见性等级
var VISIBILITY = {
  VISIBLE: 'visible',   // Network tab 明明白白可见
  SUBTLE: 'subtle',     // 混在资源里，易被忽略
  PARTIAL: 'partial',   // 连接可见，消息藏在子标签
  HIDDEN: 'hidden',     // 完全看不到
  NONE: 'none'          // 不走网络
};

// 通道定义表
var CHANNELS = [
  {
    id: 'fetch',
    name: 'fetch / XHR',
    icon: 'ti-world-www',
    visibility: VISIBILITY.VISIBLE,
    desc: '最标准的 HTTP 请求，Network tab 一览无余。',
    hint: '主列表里清清楚楚一条记录，Method、Status、Payload 全都能看到。'
  },
  {
    id: 'beacon',
    name: 'sendBeacon',
    icon: 'ti-satellite',
    visibility: VISIBILITY.VISIBLE,
    desc: '页面卸载时 fire-and-forget 的后台发送。',
    hint: 'Network tab 可见，类型标记为 beacon。'
  },
  {
    id: 'pixel',
    name: '追踪像素',
    icon: 'ti-target',
    visibility: VISIBILITY.SUBTLE,
    desc: '用 new Image().src 偷偷带参数，伪装成图片请求。',
    hint: '在 Network tab 里是一条图片请求，混在几十个资源里，谁也不会注意。'
  },
  {
    id: 'websocket',
    name: 'WebSocket',
    icon: 'ti-bolt',
    visibility: VISIBILITY.PARTIAL,
    desc: '长连接双向通信，主列表只有一条连接记录。',
    hint: '连接在主列表可见，但消息内容藏在 Messages 子标签里，不点开根本看不到。'
  },
  {
    id: 'webrtc',
    name: 'WebRTC DataChannel',
    icon: 'ti-ghost',
    visibility: VISIBILITY.HIDDEN,
    desc: 'P2P 直连，数据走 SCTP over DTLS，完全不经过 HTTP 栈。',
    hint: 'Network tab 根本不钩这条管道——建连后数据传输在这里彻底消失。'
  },
  {
    id: 'postmessage',
    name: 'postMessage',
    icon: 'ti-arrows-left-right',
    visibility: VISIBILITY.NONE,
    desc: '跨 iframe / window 通信，纯页面内，不走网络。',
    hint: '根本不是网络请求，Network tab 自然没有。作为对照基线。'
  }
];

// 可见性元信息：展示用
var VISIBILITY_META = {
  visible: { label: '可见', color: '#81c784' },
  subtle: { label: '易忽略', color: '#ffb74d' },
  partial: { label: '半隐身', color: '#ffb74d' },
  hidden: { label: '隐身', color: '#ff6b6b' },
  none: { label: '不走网络', color: '#ce93d8' }
};

// room code 字符表（去掉易混的 0/O/1/I）
var ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
var ROOM_LENGTH = 6;
var TOKEN_LENGTH = 8;
var HEX_CHARS = '0123456789abcdef';

/**
 * 获取全部通道定义。
 * @returns {Array} 通道数组（副本）
 */
function getChannels() {
  return CHANNELS.slice();
}

/**
 * 按 id 取单个通道定义。
 * @param {string} id 通道 id
 * @returns {Object|null} 通道定义
 */
function getChannel(id) {
  for (var i = 0; i < CHANNELS.length; i++) {
    if (CHANNELS[i].id === id) return CHANNELS[i];
  }
  return null;
}

/**
 * 取通道的可见性元信息。
 * @param {string} id 通道 id
 * @returns {Object} { level, label, color }
 */
function getVisibility(id) {
  var ch = getChannel(id);
  var level = ch ? ch.visibility : VISIBILITY.VISIBLE;
  var meta = VISIBILITY_META[level] || VISIBILITY_META.visible;
  return { level: level, label: meta.label, color: meta.color };
}

/**
 * 生成 6 位 room code（去除易混字符）。
 * @returns {string} room code
 */
function generateRoomCode() {
  var code = '';
  for (var i = 0; i < ROOM_LENGTH; i++) {
    code += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
  }
  return code;
}

/**
 * 规范化 room code 输入：转大写、去空格。
 * @param {string} input
 * @returns {string}
 */
function normalizeRoomCode(input) {
  if (!input) return '';
  return String(input).toUpperCase().replace(/\s+/g, '');
}

/**
 * 校验 room code 是否合法（6 位，字符在允许表内）。
 * @param {string} code
 * @returns {boolean}
 */
function isValidRoomCode(code) {
  if (!code) return false;
  var c = normalizeRoomCode(code);
  if (c.length !== ROOM_LENGTH) return false;
  for (var i = 0; i < c.length; i++) {
    if (ROOM_CHARS.indexOf(c[i]) === -1) return false;
  }
  return true;
}

/**
 * 生成 8 位 hex token。
 * @returns {string}
 */
function makeToken() {
  var s = '';
  for (var i = 0; i < TOKEN_LENGTH; i++) {
    s += HEX_CHARS[Math.floor(Math.random() * 16)];
  }
  return s;
}

/**
 * 格式化一条「秘密消息」，附带唯一 token、通道、时间戳。
 * @param {string} channelId 通道 id
 * @param {string} content 消息内容
 * @returns {Object} { token, channel, channelId, content, time }
 */
function formatMessage(channelId, content) {
  var ch = getChannel(channelId);
  return {
    token: makeToken(),
    channelId: channelId,
    channel: ch ? ch.name : channelId,
    content: content,
    time: Date.now()
  };
}

/**
 * 构造信令消息（JSON 字符串）。
 * @param {string} type 信令类型 join/offer/answer/ice/leave
 * @param {string} room 房间号
 * @param {*} payload 负载（SDP / candidate 等）
 * @returns {string} JSON 字符串
 */
function buildSignal(type, room, payload) {
  return JSON.stringify({ type: type, room: room, payload: payload });
}

/**
 * 容错解析信令消息。
 * @param {string} raw 原始字符串
 * @returns {Object|null} 解析结果，失败返回 null
 */
function parseSignal(raw) {
  try {
    var obj = JSON.parse(raw);
    if (!obj || typeof obj.type !== 'string') return null;
    return obj;
  } catch (e) {
    return null;
  }
}

/**
 * 判断某通道在 Network tab 是否能被抓到（用于挑战答案判定）。
 * visible / subtle / partial 算「能找到」，hidden / none 算「抓不到」。
 * @param {string} id 通道 id
 * @returns {boolean}
 */
function isCatchable(id) {
  var v = getVisibility(id).level;
  return v === VISIBILITY.VISIBLE || v === VISIBILITY.SUBTLE || v === VISIBILITY.PARTIAL;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    VISIBILITY: VISIBILITY,
    ROOM_LENGTH: ROOM_LENGTH,
    TOKEN_LENGTH: TOKEN_LENGTH,
    getChannels: getChannels,
    getChannel: getChannel,
    getVisibility: getVisibility,
    generateRoomCode: generateRoomCode,
    normalizeRoomCode: normalizeRoomCode,
    isValidRoomCode: isValidRoomCode,
    makeToken: makeToken,
    formatMessage: formatMessage,
    buildSignal: buildSignal,
    parseSignal: parseSignal,
    isCatchable: isCatchable
  };
}

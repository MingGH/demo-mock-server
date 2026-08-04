/**
 * NFTrack — 通用行为埋点 SDK。
 *
 * 目标：任何 demo 页面只需 `NFTrack.track('press', { idx: 1 })` 就能记录行为数据，
 * 不需要新建后端表/接口。数据上报到 `POST /events/collect`（见 numfeel-service）。
 *
 * 用法：
 *   NFTrack.track(name, props)              // 记一个事件，进队列
 *   NFTrack.track(name, props, {force:true}) // 绕过会话事件上限（用于收尾事件）
 *   NFTrack.trackOnce(name, props)          // 同名事件整个会话只记一次
 *   NFTrack.flush()                          // 立即上报缓冲队列
 *   NFTrack.sessionId()                      // 当前会话 ID
 *   NFTrack.disable()                        // 运行期关闭
 *
 * 设计要点（详见 numfeel-site/AGENTS.md「如何给新 demo 加埋点」一节）：
 * - demo slug 从 location.pathname 自动推导，解析不出来就静默禁用自己。
 * - sessionId 存在 sessionStorage（关标签页即失效，刻意不做成持久标识）。
 * - 所有入口 try/catch 兜底，绝不抛异常、绝不阻塞 UI，网络失败静默丢弃、不重试。
 * - 会话事件上限 600 条：普通事件超限丢弃；force:true 的事件仍能通过，
 *   并会被自动打上 `truncated:true`（只要本会话此前发生过丢弃）。
 */
(function (global) {
  'use strict';

  var API_BASE = 'https://numfeel-api.996.ninja';
  var COLLECT_ENDPOINT = API_BASE + '/events/collect';

  var MAX_QUEUE_SIZE = 20;
  var FLUSH_INTERVAL_MS = 5000;
  var SESSION_EVENT_CAP = 600;
  var MAX_PROPS_KEYS = 20;
  var MAX_PROPS_STRING_LENGTH = 64;
  var SESSION_STORAGE_KEY = 'nf_sid';
  var SEQ_STORAGE_KEY = 'nf_seq';
  var COUNT_STORAGE_KEY = 'nf_cnt';
  var TRUNC_STORAGE_KEY = 'nf_trunc';
  var ONCE_STORAGE_KEY = 'nf_once';
  var MAX_ONCE_EVENTS = 200;
  var SESSION_ID_LENGTH = 16;
  var SESSION_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

  // ── 纯函数（可独立测试，不依赖 DOM / window） ──────────────────────────

  /**
   * 从页面路径推导 demo slug。
   * 支持 `/pages/<slug>/`（含 index.html）与 `/pages/<slug>.html` 两种形式。
   * 解析不出来或不满足后端 slug 格式时返回 null（调用方应据此静默禁用自己）。
   *
   * @param {string} pathname location.pathname
   * @returns {string|null} demo slug，或 null
   */
  function deriveSlug(pathname) {
    if (typeof pathname !== 'string') {
      return null;
    }
    var idx = pathname.indexOf('/pages/');
    if (idx === -1) {
      return null;
    }
    var rest = pathname.slice(idx + '/pages/'.length);
    if (!rest) {
      return null;
    }

    var slug = null;
    var slashIdx = rest.indexOf('/');
    if (slashIdx !== -1) {
      // 目录形式：/pages/<slug>/ 或 /pages/<slug>/index.html
      slug = rest.slice(0, slashIdx);
    } else {
      // 单文件形式：/pages/<slug>.html
      var match = /^([^/]+)\.html$/.exec(rest);
      if (match) {
        slug = match[1];
      }
    }

    if (!slug) {
      return null;
    }
    slug = slug.toLowerCase();
    // 与后端 EventController 的 demo 校验正则保持一致
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
      return null;
    }
    return slug;
  }

  /**
   * 清洗事件属性：仅保留 number / boolean / 长度 ≤64 的 string 值，
   * 最多保留 20 个 key（与后端 EventCollectService 的清洗规则保持一致）。
   * 嵌套对象、数组、函数、超长字符串、超过数量的 key 会被静默丢弃。
   *
   * @param {Object} raw 原始属性对象，可为空
   * @returns {Object} 清洗后的属性对象（不修改原对象）
   */
  function cleanProps(raw) {
    var result = {};
    if (!raw || typeof raw !== 'object') {
      return result;
    }
    var count = 0;
    for (var key in raw) {
      if (!Object.prototype.hasOwnProperty.call(raw, key)) {
        continue;
      }
      if (count >= MAX_PROPS_KEYS) {
        break;
      }
      var value = raw[key];
      var type = typeof value;
      if (type === 'number' || type === 'boolean') {
        result[key] = value;
        count++;
      } else if (type === 'string' && value.length <= MAX_PROPS_STRING_LENGTH) {
        result[key] = value;
        count++;
      }
      // 其余类型（object / array / function / undefined）直接丢弃该 key
    }
    return result;
  }

  /**
   * 判断当前缓冲队列是否应该立即上报。
   *
   * @param {number} queueLength 当前队列长度
   * @param {number} [maxSize] 队列上限，默认 {@link MAX_QUEUE_SIZE}
   * @returns {boolean} 是否应该 flush
   */
  function shouldFlushQueue(queueLength, maxSize) {
    return queueLength >= (maxSize || MAX_QUEUE_SIZE);
  }

  /**
   * 判断本会话是否还能接受新的普通事件；force 事件始终放行。
   *
   * @param {number} trackedCount 本会话已接受的事件总数（含已丢弃前的计数）
   * @param {number} cap 会话事件上限
   * @param {boolean} force 是否强制通过
   * @returns {boolean} 是否应接受该事件
   */
  function shouldAcceptEvent(trackedCount, cap, force) {
    if (force) {
      return true;
    }
    return trackedCount < cap;
  }

  /**
   * 若本会话此前发生过截断，则在 props 上打上 `truncated:true`；否则原样返回。
   * 不修改传入对象，返回新对象。
   *
   * @param {Object} props 清洗后的事件属性
   * @param {boolean} wasTruncated 本会话是否已经发生过截断
   * @returns {Object} 处理后的属性对象
   */
  function stampTruncated(props, wasTruncated) {
    if (!wasTruncated) {
      return props;
    }
    var result = {};
    for (var key in props) {
      if (Object.prototype.hasOwnProperty.call(props, key)) {
        result[key] = props[key];
      }
    }
    result.truncated = true;
    return result;
  }

  /**
   * 将一组随机字节转换成固定长度的会话 ID（仅使用小写字母与数字）。
   * 纯函数：真正的随机源获取放在 {@link getRandomBytes} 中，便于单独测试本函数。
   *
   * @param {number[]} bytes 随机字节数组（每个元素 0-255）
   * @returns {string} 长度等于 bytes.length 的会话 ID
   */
  function bytesToSessionId(bytes) {
    var chars = [];
    for (var i = 0; i < bytes.length; i++) {
      chars.push(SESSION_ID_ALPHABET.charAt(bytes[i] % SESSION_ID_ALPHABET.length));
    }
    return chars.join('');
  }

  /**
   * 判断事件名是否为合法格式（与后端事件名正则保持一致的宽松前端校验，
   * 仅用于避免把明显无效的调用塞进队列，真正的强校验在后端）。
   *
   * @param {string} name 事件名
   * @returns {boolean} 是否合法
   */
  function isValidEventName(name) {
    return typeof name === 'string' && /^[a-z][a-z0-9_]{0,47}$/.test(name);
  }

  /**
   * 判断事件入队后是否需要立即发送（不等 5s 定时或离页 flush）。
   *
   * 典型场景是 session_end 这类收尾事件：页面在 pagehide 监听器里最后才入队，
   * 而 SDK 自己的 pagehide flush 注册得更早、会先跑完，导致收尾事件留在队列里
   * 再无发送机会而丢失。这类事件必须入队后立即发送。
   *
   * @param {string} name 事件名
   * @returns {boolean} 是否需要立即 flush
   */
  function shouldImmediateFlush(name) {
    return name === 'session_end';
  }

  /**
   * 把字符串解析成非负整数；缺失 / 非数字 / 负数 / 浮点 / 被人为改坏的垃圾值一律退化为 fallback。
   * 纯函数，容忍任何输入，绝不抛异常。
   *
   * @param {string} str 待解析的字符串（可为 null / undefined）
   * @param {number} fallback 解析失败时的兜底值
   * @returns {number} 合法的非负整数，或 fallback
   */
  function parseNonNegInt(str, fallback) {
    if (typeof str !== 'string' || str.trim() === '') {
      return fallback;
    }
    var n = Number(str);
    if (!isFinite(n) || n < 0) {
      return fallback;
    }
    return Math.floor(n);
  }

  /**
   * 把逗号分隔的 once 事件名列表还原成 firedOnce 集合对象。
   * 纯函数：跳过空串与重复项，非法输入返回空对象。
   *
   * @param {string} str 逗号分隔的事件名列表，可为 null / undefined
   * @returns {Object} 以事件名为 key 的集合对象
   */
  function parseOnceList(str) {
    var map = {};
    if (typeof str !== 'string' || str.length === 0) {
      return map;
    }
    var parts = str.split(',');
    for (var i = 0; i < parts.length; i++) {
      var name = parts[i];
      if (name && !Object.prototype.hasOwnProperty.call(map, name)) {
        map[name] = true;
      }
    }
    return map;
  }

  /**
   * 把 firedOnce 集合对象序列化成逗号分隔字符串（保持插入顺序）。
   * 纯函数，不修改传入对象。
   *
   * @param {Object} map firedOnce 集合对象
   * @returns {string} 逗号分隔的事件名列表
   */
  function serializeOnceMap(map) {
    var names = [];
    for (var key in map) {
      if (Object.prototype.hasOwnProperty.call(map, key)) {
        names.push(key);
      }
    }
    return names.join(',');
  }

  /**
   * 从一组存储字符串恢复会话计数器与 once 集合（容错版）。
   * 纯函数：任何一个值缺失 / 非法都会退化到该字段的初始值，绝不抛异常。
   *
   * @param {string} seqStr 存储的 seq 字符串
   * @param {string} countStr 存储的 trackedCount 字符串
   * @param {string} truncStr 存储的 truncated 标记（'1' 表示已截断）
   * @param {string} onceStr 存储的 once 事件名列表
   * @returns {{seq:number, trackedCount:number, truncated:boolean, firedOnce:Object}} 恢复后的状态
   */
  function restoreCounters(seqStr, countStr, truncStr, onceStr) {
    return {
      seq: parseNonNegInt(seqStr, 0),
      trackedCount: parseNonNegInt(countStr, 0),
      truncated: truncStr === '1',
      firedOnce: parseOnceList(onceStr)
    };
  }

  /**
   * 限制 firedOnce 集合的大小，超出 {@link MAX_ONCE_EVENTS} 时丢弃最旧的事件名。
   * 以对象自身的插入顺序（字符串 key）为淘汰依据。纯函数，直接修改并返回传入对象。
   *
   * @param {Object} map firedOnce 集合对象
   * @returns {Object} 裁剪后的集合对象
   */
  function pruneOnceMap(map) {
    var keys = Object.keys(map);
    while (keys.length > MAX_ONCE_EVENTS) {
      delete map[keys.shift()];
    }
    return map;
  }

  // ── 浏览器相关的状态与副作用（不参与单元测试） ─────────────────────────

  var state = {
    slug: null,
    sessionId: null,
    seq: 0,
    queue: [],
    trackedCount: 0,
    truncated: false,
    firedOnce: {},
    disabled: false,
    flushTimer: null
  };

  function getRandomBytes(length) {
    try {
      if (global.crypto && typeof global.crypto.getRandomValues === 'function') {
        var arr = new Uint8Array(length);
        global.crypto.getRandomValues(arr);
        return Array.prototype.slice.call(arr);
      }
    } catch (e) {
      // 降级到 Math.random
    }
    var bytes = [];
    for (var i = 0; i < length; i++) {
      bytes.push(Math.floor(Math.random() * 256));
    }
    return bytes;
  }

  function getOrCreateSessionId() {
    try {
      var existing = global.sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (existing) {
        return existing;
      }
      var fresh = bytesToSessionId(getRandomBytes(SESSION_ID_LENGTH));
      global.sessionStorage.setItem(SESSION_STORAGE_KEY, fresh);
      return fresh;
    } catch (e) {
      // sessionStorage 不可用（隐私模式等）时退化为内存态会话 ID，不持久但不影响当次上报
      return bytesToSessionId(getRandomBytes(SESSION_ID_LENGTH));
    }
  }

  /** 安全读取 sessionStorage；不可用时返回 null，绝不抛异常。 */
  function safeGetItem(key) {
    try {
      return global.sessionStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  /**
   * 把 seq / trackedCount / truncated / firedOnce 持久化到 sessionStorage，
   * 使同标签页刷新后 seq 从刷新前的值继续递增（跨刷新保持 trackOnce 契约）。
   * 全部包在 try/catch 里，sessionStorage 不可用时退化为纯内存态。
   */
  function persistState() {
    try {
      global.sessionStorage.setItem(SEQ_STORAGE_KEY, String(state.seq));
      global.sessionStorage.setItem(COUNT_STORAGE_KEY, String(state.trackedCount));
      global.sessionStorage.setItem(TRUNC_STORAGE_KEY, state.truncated ? '1' : '0');
      global.sessionStorage.setItem(ONCE_STORAGE_KEY, serializeOnceMap(state.firedOnce));
    } catch (e) {
      // sessionStorage 不可用则退化为纯内存态，不影响当次上报
    }
  }

  function mirrorToUmami(name, props) {
    try {
      var whitelist = global.NF_TRACK_UMAMI_MIRROR;
      if (global.umami && typeof global.umami.track === 'function' &&
          whitelist && whitelist.indexOf(name) !== -1) {
        global.umami.track(name, props);
      }
    } catch (e) {
      // 镜像失败不应影响主流程
    }
  }

  function sendPayload(payload) {
    var body;
    try {
      body = JSON.stringify(payload);
    } catch (e) {
      return;
    }

    try {
      if (global.navigator && typeof global.navigator.sendBeacon === 'function') {
        var blob = new Blob([body], { type: 'application/json' });
        var ok = global.navigator.sendBeacon(COLLECT_ENDPOINT, blob);
        if (ok) {
          return;
        }
      }
    } catch (e) {
      // 降级到 fetch
    }

    try {
      if (typeof global.fetch === 'function') {
        global.fetch(COLLECT_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          keepalive: true
        }).catch(function () {});
      }
    } catch (e) {
      // 网络失败静默丢弃，不重试
    }
  }

  function flush() {
    try {
      if (state.queue.length === 0) {
        return;
      }
      var events = state.queue;
      state.queue = [];
      sendPayload({ demo: state.slug, sessionId: state.sessionId, events: events });
    } catch (e) {
      // 埋点绝不能影响主页面
    }
  }

  function scheduleFlushIfNeeded() {
    if (shouldFlushQueue(state.queue.length, MAX_QUEUE_SIZE)) {
      flush();
    }
  }

  function track(name, props, opts) {
    try {
      if (state.disabled || !state.slug) {
        return;
      }
      if (!isValidEventName(name)) {
        return;
      }
      var force = !!(opts && opts.force);
      if (!shouldAcceptEvent(state.trackedCount, SESSION_EVENT_CAP, force)) {
        state.trackedCount++;
        state.truncated = true;
        return;
      }

      var cleaned = cleanProps(props);
      cleaned = stampTruncated(cleaned, state.truncated && force);

      state.seq++;
      state.trackedCount++;
      state.queue.push({
        name: name,
        seq: state.seq,
        t: Date.now(),
        props: cleaned
      });

      mirrorToUmami(name, cleaned);
      persistState();
      if (shouldImmediateFlush(name)) {
        // 收尾事件（session_end）：页面可能紧接着销毁，定时/离页 flush 都来不及，
        // 入队后立即发送，避免丢失。
        flush();
      } else {
        scheduleFlushIfNeeded();
      }
    } catch (e) {
      // 绝不抛异常、绝不阻塞 UI
    }
  }

  function trackOnce(name, props) {
    try {
      if (state.firedOnce[name]) {
        return;
      }
      state.firedOnce[name] = true;
      pruneOnceMap(state.firedOnce);
      track(name, props);
    } catch (e) {
      // 同上
    }
  }

  function disable() {
    try {
      state.disabled = true;
      if (state.flushTimer !== null) {
        global.clearInterval(state.flushTimer);
        state.flushTimer = null;
      }
    } catch (e) {
      // 忽略
    }
  }

  function sessionId() {
    return state.sessionId;
  }

  function init() {
    try {
      if (typeof global.location === 'undefined') {
        return;
      }
      var slug = deriveSlug(global.location.pathname);
      if (!slug) {
        // 解析不出来就静默禁用自己
        state.disabled = true;
        return;
      }
      state.slug = slug;
      state.sessionId = getOrCreateSessionId();

      // 恢复跨刷新状态（容错：缺失/垃圾值退化为初始值）
      var restored = restoreCounters(
        safeGetItem(SEQ_STORAGE_KEY),
        safeGetItem(COUNT_STORAGE_KEY),
        safeGetItem(TRUNC_STORAGE_KEY),
        safeGetItem(ONCE_STORAGE_KEY)
      );
      state.seq = restored.seq;
      state.trackedCount = restored.trackedCount;
      state.truncated = restored.truncated;
      state.firedOnce = restored.firedOnce;

      state.flushTimer = global.setInterval(flush, FLUSH_INTERVAL_MS);

      if (global.document && typeof global.document.addEventListener === 'function') {
        global.document.addEventListener('visibilitychange', function () {
          if (global.document.visibilityState === 'hidden') {
            flush();
          }
        });
      }
      if (typeof global.addEventListener === 'function') {
        global.addEventListener('pagehide', flush);
      }
    } catch (e) {
      // 初始化失败也不应影响主页面，仅使 SDK 保持禁用状态
      state.disabled = true;
    }
  }

  // 仅在浏览器环境中自动初始化；Node 环境（单元测试）跳过副作用
  if (typeof global.document !== 'undefined' && typeof global.location !== 'undefined') {
    init();
  }

  global.NFTrack = {
    track: track,
    trackOnce: trackOnce,
    flush: flush,
    sessionId: sessionId,
    disable: disable
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      deriveSlug: deriveSlug,
      cleanProps: cleanProps,
      shouldFlushQueue: shouldFlushQueue,
      shouldAcceptEvent: shouldAcceptEvent,
      stampTruncated: stampTruncated,
      bytesToSessionId: bytesToSessionId,
      isValidEventName: isValidEventName,
      shouldImmediateFlush: shouldImmediateFlush,
      parseNonNegInt: parseNonNegInt,
      parseOnceList: parseOnceList,
      serializeOnceMap: serializeOnceMap,
      restoreCounters: restoreCounters,
      pruneOnceMap: pruneOnceMap
    };
  }
})(typeof window !== 'undefined' ? window : this);

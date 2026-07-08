// ========== 离线生存实验室：核心算法与存储逻辑 ==========
// 与 DOM 解耦的纯逻辑：缓存策略模拟、IndexedDB 笔记存储、同步队列、离线能力评分。
// 既能被浏览器 <script> 直接使用（挂到 window），也能被 Node 测试 require。

// ── 默认配置 ──────────────────────────────────────────────
var DEFAULT_NETWORK_LATENCY = 320;   // 在线时模拟网络延迟（ms）
var DEFAULT_CACHE_LATENCY = 12;      // 缓存命中延迟（ms）
var DEFAULT_TIMEOUT = 3000;          // Network First 超时阈值（ms）

// ── 缓存策略模拟 ──────────────────────────────────────────
// 这些函数不真正发网络请求，用 setTimeout 模拟延迟与缓存命中，
// 返回 { source, latency, ... } 让前端做可视化对比。

/**
 * Cache First：有缓存直接吃，没缓存才走网络。
 * @param {{hasCache?:boolean, networkLatency?:number, cacheLatency?:number}} options
 * @returns {Promise<{source:string, latency:number}>}
 */
function simulateCacheFirst(options) {
  options = options || {};
  var hasCache = options.hasCache !== false;
  var networkLatency = options.networkLatency != null ? options.networkLatency : DEFAULT_NETWORK_LATENCY;
  var cacheLatency = options.cacheLatency != null ? options.cacheLatency : DEFAULT_CACHE_LATENCY;

  if (hasCache) {
    return delay(cacheLatency).then(function () {
      return { source: 'cache', latency: cacheLatency };
    });
  }
  return delay(networkLatency).then(function () {
    return { source: 'network', latency: networkLatency };
  });
}

/**
 * Network First：先等网络，超时则回退缓存。
 * @param {{online?:boolean, hasCache?:boolean, networkLatency?:number, timeout?:number, cacheLatency?:number}} options
 * @returns {Promise<{source:string, latency:number}>}
 */
function simulateNetworkFirst(options) {
  options = options || {};
  var online = options.online !== false;
  var hasCache = options.hasCache !== false;
  var networkLatency = options.networkLatency != null ? options.networkLatency : DEFAULT_NETWORK_LATENCY;
  var timeout = options.timeout != null ? options.timeout : DEFAULT_TIMEOUT;
  var cacheLatency = options.cacheLatency != null ? options.cacheLatency : DEFAULT_CACHE_LATENCY;

  if (!online) {
    // 离线：等一个超时，再回退缓存
    return delay(timeout).then(function () {
      if (hasCache) {
        return delay(cacheLatency).then(function () {
          return { source: 'cache', latency: timeout + cacheLatency };
        });
      }
      return { source: 'timeout', latency: timeout };
    });
  }
  return delay(networkLatency).then(function () {
    return { source: 'network', latency: networkLatency };
  });
}

/**
 * Stale While Revalidate：立刻给缓存，后台静默更新。
 * @param {{hasCache?:boolean, online?:boolean, networkLatency?:number, cacheLatency?:number}} options
 * @returns {Promise<{source:string, latency:number, bgUpdate:boolean, bgUpdateOk:boolean}>}
 */
function simulateSWR(options) {
  options = options || {};
  var hasCache = options.hasCache !== false;
  var online = options.online !== false;
  var networkLatency = options.networkLatency != null ? options.networkLatency : DEFAULT_NETWORK_LATENCY;
  var cacheLatency = options.cacheLatency != null ? options.cacheLatency : DEFAULT_CACHE_LATENCY;

  if (!hasCache) {
    // 首次没缓存，只能走网络
    return delay(networkLatency).then(function () {
      return { source: 'network', latency: networkLatency, bgUpdate: false, bgUpdateOk: true };
    });
  }
  // 立刻返回旧内容
  return delay(cacheLatency).then(function () {
    return {
      source: 'cache',
      latency: cacheLatency,
      bgUpdate: true,
      bgUpdateOk: online   // 后台更新是否成功取决于是否在线
    };
  });
}

// ── IndexedDB 笔记存储 ────────────────────────────────────
// 真实使用 IndexedDB；Node 测试环境无 indexedDB 时，相关用例由测试文件 mock 或跳过。

/**
 * 离线笔记存储：notes（笔记） + syncQueue（待同步队列）两个 store。
 * @param {string} dbName
 */
function OfflineNoteStore(dbName) {
  this.dbName = dbName || 'offline-lab-notes';
  this.version = 1;
  this._db = null;
}

OfflineNoteStore.prototype._open = function () {
  var self = this;
  if (self._db) return Promise.resolve(self._db);
  return new Promise(function (resolve, reject) {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    var req = indexedDB.open(self.dbName, self.version);
    req.onupgradeneeded = function (e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains('notes')) {
        var store = db.createObjectStore('notes', { keyPath: 'id', autoIncrement: true });
        store.createIndex('synced', 'synced', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains('syncQueue')) {
        db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = function (e) { self._db = e.target.result; resolve(self._db); };
    req.onerror = function (e) { reject(e.target.error); };
  });
};

OfflineNoteStore.prototype._tx = function (store, mode) {
  return this._open().then(function (db) {
    return db.transaction(store, mode).objectStore(store);
  });
};

/**
 * 新增一条笔记。
 * @param {string} text
 * @param {boolean} synced
 * @returns {Promise<{id:number, text:string, timestamp:number, synced:boolean}>}
 */
OfflineNoteStore.prototype.addNote = function (text, synced) {
  var self = this;
  var note = { text: text, timestamp: Date.now(), synced: !!synced };
  return self._tx('notes', 'readwrite').then(function (store) {
    return new Promise(function (resolve, reject) {
      var req = store.add(note);
      req.onsuccess = function (e) { note.id = e.target.result; resolve(note); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  });
};

/** 取全部笔记，按时间倒序。 */
OfflineNoteStore.prototype.getAllNotes = function () {
  return this._tx('notes', 'readonly').then(function (store) {
    return new Promise(function (resolve, reject) {
      var req = store.getAll();
      req.onsuccess = function (e) {
        var list = e.target.result || [];
        list.sort(function (a, b) { return b.timestamp - a.timestamp; });
        resolve(list);
      };
      req.onerror = function (e) { reject(e.target.error); };
    });
  });
};

/** 标记某条笔记已同步。 */
OfflineNoteStore.prototype.markSynced = function (id) {
  return this._tx('notes', 'readwrite').then(function (store) {
    return new Promise(function (resolve, reject) {
      var getReq = store.get(id);
      getReq.onsuccess = function (e) {
        var note = e.target.result;
        if (!note) { resolve(null); return; }
        note.synced = true;
        var putReq = store.put(note);
        putReq.onsuccess = function () { resolve(note); };
        putReq.onerror = function (ev) { reject(ev.target.error); };
      };
      getReq.onerror = function (e) { reject(e.target.error); };
    });
  });
};

/** 取所有未同步笔记（待同步队列）。 */
OfflineNoteStore.prototype.getPendingSync = function () {
  return this._tx('notes', 'readonly').then(function (store) {
    return new Promise(function (resolve, reject) {
      var idx = store.index('synced');
      var req = idx.getAll(0);
      req.onsuccess = function (e) {
        var list = e.target.result || [];
        list.sort(function (a, b) { return a.timestamp - b.timestamp; });
        resolve(list);
      };
      req.onerror = function (e) { reject(e.target.error); };
    });
  });
};

/** 清空全部笔记与队列（演示重置用）。 */
OfflineNoteStore.prototype.clearAll = function () {
  var self = this;
  return self._tx('notes', 'readwrite').then(function (store) {
    return new Promise(function (resolve, reject) {
      var r = store.clear();
      r.onsuccess = function () { resolve(); };
      r.onerror = function (e) { reject(e.target.error); };
    });
  });
};

// ── 同步队列 ──────────────────────────────────────────────
/**
 * 同步队列：管理待同步笔记，恢复联网后逐条消化。
 * @param {OfflineNoteStore} noteStore
 * @param {{isOnline?:function, syncDelay?:number, onSync?:function}} options
 */
function SyncQueue(noteStore, options) {
  this.store = noteStore;
  options = options || {};
  this._isOnline = options.isOnline || function () { return true; };
  this.syncDelay = options.syncDelay != null ? options.syncDelay : 500;
  this.onSync = options.onSync || function () {};
  this._processing = false;
}

/** 入队一条待同步笔记（实际就是确认它存在且 synced=false）。 */
SyncQueue.prototype.enqueue = function (noteId) {
  // 笔记已在 store 里且 synced=false，这里仅做计数来源
  var self = this;
  return self.getQueueLength().then(function (n) {
    return n + 1;
  }).then(function () {
    return noteId;
  });
};

/** 当前队列长度（未同步笔记数）。 */
SyncQueue.prototype.getQueueLength = function () {
  return this.store.getPendingSync().then(function (list) {
    return list.length;
  });
};

/**
 * 处理队列：逐条同步，返回结果统计。
 * @returns {Promise<{synced:number, failed:number}>}
 */
SyncQueue.prototype.processQueue = function () {
  var self = this;
  if (self._processing) {
    return Promise.resolve({ synced: 0, failed: 0 });
  }
  self._processing = true;
  return self.store.getPendingSync().then(function (pending) {
    if (pending.length === 0) {
      self._processing = false;
      return { synced: 0, failed: 0 };
    }
    return processOne(self, pending, 0, 0).then(function (res) {
      self._processing = false;
      return res;
    });
  });
};

function processOne(self, pending, synced, failed) {
  if (pending.length === 0) {
    return Promise.resolve({ synced: synced, failed: failed });
  }
  var note = pending.shift();
  return delay(self.syncDelay).then(function () {
    if (!self._isOnline()) {
      failed += pending.length + 1;
      return { synced: synced, failed: failed };
    }
    return self.store.markSynced(note.id).then(function () {
      self.onSync(note);
      synced += 1;
      return processOne(self, pending, synced, failed);
    });
  });
}

// ── 离线能力评分 ──────────────────────────────────────────
// 真实调用浏览器 API 检测当前页面的离线能力，每项 0 或 20 分。

/** 检测 Service Worker 是否注册。 */
function checkServiceWorker() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
    return Promise.resolve({ score: 0, detail: '当前环境不支持 Service Worker' });
  }
  return navigator.serviceWorker.getRegistrations().then(function (regs) {
    if (regs && regs.length > 0) {
      return { score: 20, detail: '已注册 ' + regs.length + ' 个 Service Worker' };
    }
    return { score: 0, detail: '未检测到 Service Worker 注册' };
  }).catch(function () {
    return { score: 0, detail: 'Service Worker 检测失败' };
  });
}

/** 检测 Cache Storage 是否有缓存条目。 */
function checkCacheStorage() {
  if (typeof caches === 'undefined') {
    return Promise.resolve({ score: 0, detail: '当前环境不支持 Cache API' });
  }
  return caches.keys().then(function (keys) {
    if (keys && keys.length > 0) {
      return { score: 20, detail: '发现 ' + keys.length + ' 个缓存仓库' };
    }
    return { score: 0, detail: 'Cache Storage 为空' };
  }).catch(function () {
    return { score: 0, detail: 'Cache Storage 检测失败' };
  });
}

/** 检测是否配置了离线回退（启发式：SW 已激活即视为有回退能力）。 */
function checkOfflineFallback() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
    return Promise.resolve({ score: 0, detail: '无 Service Worker，无法提供离线回退' });
  }
  return navigator.serviceWorker.getRegistration().then(function (reg) {
    if (reg && reg.active) {
      return { score: 20, detail: 'Service Worker 已激活，可拦截离线请求' };
    }
    return { score: 0, detail: 'Service Worker 未激活' };
  }).catch(function () {
    return { score: 0, detail: '离线回退检测失败' };
  });
}

/** 检测 IndexedDB 中是否有数据。 */
function checkIndexedDB() {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve({ score: 0, detail: '当前环境不支持 IndexedDB' });
  }
  if (indexedDB.databases) {
    return indexedDB.databases().then(function (dbs) {
      if (dbs && dbs.length > 0) {
        return { score: 20, detail: 'IndexedDB 有 ' + dbs.length + ' 个数据库' };
      }
      return { score: 0, detail: 'IndexedDB 为空' };
    }).catch(function () {
      return { score: 0, detail: 'IndexedDB 检测失败' };
    });
  }
  // Safari 等不支持 databases()，尝试打开一个轻量库作为可用性证明
  return new Promise(function (resolve) {
    try {
      var req = indexedDB.open('offline-lab-probe', 1);
      req.onsuccess = function () { resolve({ score: 20, detail: 'IndexedDB 可用' }); };
      req.onerror = function () { resolve({ score: 0, detail: 'IndexedDB 不可用' }); };
    } catch (e) {
      resolve({ score: 0, detail: 'IndexedDB 不可用' });
    }
  });
}

/** 检测浏览器是否支持 Background Sync API。 */
function checkBackgroundSync() {
  if (typeof SyncManager !== 'undefined') {
    return Promise.resolve({ score: 20, detail: '浏览器支持 Background Sync API' });
  }
  return Promise.resolve({ score: 0, detail: '浏览器不支持 Background Sync（仅 Chromium 系支持）' });
}

/** 汇总评分。 */
function getFullScore() {
  return Promise.all([
    checkServiceWorker(),
    checkCacheStorage(),
    checkOfflineFallback(),
    checkIndexedDB(),
    checkBackgroundSync()
  ]).then(function (results) {
    var total = 0;
    for (var i = 0; i < results.length; i++) total += results[i].score;
    return {
      total: total,
      items: [
        { name: 'Service Worker 注册', check: checkServiceWorker, result: results[0] },
        { name: '关键资源缓存', check: checkCacheStorage, result: results[1] },
        { name: '离线 fallback 页面', check: checkOfflineFallback, result: results[2] },
        { name: '数据持久化', check: checkIndexedDB, result: results[3] },
        { name: '后台同步能力', check: checkBackgroundSync, result: results[4] }
      ]
    };
  });
}

// ── 工具 ──────────────────────────────────────────────────
function delay(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// ── 导出（兼容浏览器与 Node 测试）──────────────────────────
if (typeof window !== 'undefined') {
  window.simulateCacheFirst = simulateCacheFirst;
  window.simulateNetworkFirst = simulateNetworkFirst;
  window.simulateSWR = simulateSWR;
  window.OfflineNoteStore = OfflineNoteStore;
  window.SyncQueue = SyncQueue;
  window.checkServiceWorker = checkServiceWorker;
  window.checkCacheStorage = checkCacheStorage;
  window.checkOfflineFallback = checkOfflineFallback;
  window.checkIndexedDB = checkIndexedDB;
  window.checkBackgroundSync = checkBackgroundSync;
  window.getFullScore = getFullScore;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    simulateCacheFirst: simulateCacheFirst,
    simulateNetworkFirst: simulateNetworkFirst,
    simulateSWR: simulateSWR,
    OfflineNoteStore: OfflineNoteStore,
    SyncQueue: SyncQueue,
    checkServiceWorker: checkServiceWorker,
    checkCacheStorage: checkCacheStorage,
    checkOfflineFallback: checkOfflineFallback,
    checkIndexedDB: checkIndexedDB,
    checkBackgroundSync: checkBackgroundSync,
    getFullScore: getFullScore,
    _delay: delay,
    _DEFAULTS: {
      networkLatency: DEFAULT_NETWORK_LATENCY,
      cacheLatency: DEFAULT_CACHE_LATENCY,
      timeout: DEFAULT_TIMEOUT
    }
  };
}

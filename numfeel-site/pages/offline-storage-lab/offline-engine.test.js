// ========== offline-engine 单元测试 ==========
// 用法：node pages/offline-storage-lab/offline-engine.test.js
// 纯逻辑测试，不依赖浏览器 DOM。IndexedDB 相关用内存 mock 模拟。

var E = require('./offline-engine.js');

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('✅ ' + msg);
  } else {
    failed++;
    console.error('❌ ' + msg);
  }
}
function assertEqual(a, b, msg) {
  assert(a === b, msg + ' (got: ' + JSON.stringify(a) + ', want: ' + JSON.stringify(b) + ')');
}

// ── 1. simulateCacheFirst ──
E.simulateCacheFirst({ hasCache: true, cacheLatency: 5 }).then(function (r) {
  assertEqual(r.source, 'cache', 'CacheFirst 有缓存 -> source=cache');
  assert(r.latency <= 50, 'CacheFirst 有缓存延迟 < 50ms (实际 ' + r.latency + ')');
  return E.simulateCacheFirst({ hasCache: false, networkLatency: 10 });
}).then(function (r) {
  assertEqual(r.source, 'network', 'CacheFirst 无缓存 -> source=network');
  return E.simulateNetworkFirst({ online: true, networkLatency: 8 });
})
// ── 2. simulateNetworkFirst ──
.then(function (r) {
  assertEqual(r.source, 'network', 'NetworkFirst 在线 -> source=network');
  return E.simulateNetworkFirst({ online: false, hasCache: true, timeout: 30, cacheLatency: 5 });
})
.then(function (r) {
  assert(r.source === 'timeout' || r.source === 'cache', 'NetworkFirst 离线超时 fallback (source=' + r.source + ')');
  assert(r.latency >= 30, 'NetworkFirst 离线延迟 >= timeout (实际 ' + r.latency + ')');
  return E.simulateNetworkFirst({ online: false, hasCache: false, timeout: 20 });
})
.then(function (r) {
  assertEqual(r.source, 'timeout', 'NetworkFirst 离线无缓存 -> source=timeout');
  return E.simulateSWR({ hasCache: true, online: true, cacheLatency: 5 });
})
// ── 3. simulateSWR ──
.then(function (r) {
  assertEqual(r.source, 'cache', 'SWR 有缓存优先返回 cache');
  assertEqual(r.bgUpdate, true, 'SWR 触发后台更新 bgUpdate=true');
  assertEqual(r.bgUpdateOk, true, 'SWR 在线后台更新成功');
  return E.simulateSWR({ hasCache: true, online: false, cacheLatency: 5 });
})
.then(function (r) {
  assertEqual(r.bgUpdateOk, false, 'SWR 离线后台更新失败 bgUpdateOk=false');
  return E.simulateSWR({ hasCache: false, networkLatency: 10 });
})
.then(function (r) {
  assertEqual(r.source, 'network', 'SWR 首次无缓存 -> source=network');
  assertEqual(r.bgUpdate, false, 'SWR 首次无缓存不触发后台更新');

  // ── 4. SyncQueue：用内存 mock store ──
  return testSyncQueue();
})
.then(function () {
  // ── 5. getFullScore：mock 浏览器全局 ──
  return testScoreChecks();
})
.then(function () {
  console.log('\n────────────────────────');
  console.log('通过 ' + passed + ' / 失败 ' + failed);
  process.exit(failed > 0 ? 1 : 0);
})
.catch(function (err) {
  console.error('测试异常:', err);
  process.exit(1);
});

// ── 内存 mock store（替代 IndexedDB）──
function MockStore() {
  this._seq = 0;
  this._notes = [];
}
MockStore.prototype.addNote = function (text, synced) {
  var self = this;
  self._seq += 1;
  var note = { id: self._seq, text: text, timestamp: Date.now(), synced: !!synced };
  self._notes.push(note);
  return Promise.resolve(note);
};
MockStore.prototype.getPendingSync = function () {
  var list = this._notes.filter(function (n) { return !n.synced; });
  list.sort(function (a, b) { return a.timestamp - b.timestamp; });
  return Promise.resolve(list);
};
MockStore.prototype.markSynced = function (id) {
  var self = this;
  var note = self._notes.filter(function (n) { return n.id === id; })[0];
  if (note) note.synced = true;
  return Promise.resolve(note);
};

function testSyncQueue() {
  var store = new MockStore();
  var online = true;
  var syncedCount = 0;
  var q = new E.SyncQueue(store, {
    isOnline: function () { return online; },
    syncDelay: 5,
    onSync: function () { syncedCount++; }
  });

  return store.addNote('note-1', false).then(function (n1) {
    return q.enqueue(n1.id);
  }).then(function () {
    return q.getQueueLength();
  }).then(function (len) {
    assertEqual(len, 1, 'enqueue 后队列长度 +1');
    return store.addNote('note-2', false);
  }).then(function (n2) {
    return q.enqueue(n2.id);
  }).then(function () {
    return q.getQueueLength();
  }).then(function (len) {
    assertEqual(len, 2, '两条待同步 -> 队列长度 2');
    return q.processQueue();
  }).then(function (res) {
    assertEqual(res.synced, 2, 'processQueue 同步成功 2 条');
    assertEqual(res.failed, 0, 'processQueue 失败 0 条');
    assertEqual(syncedCount, 2, 'onSync 回调触发 2 次');
    return q.getQueueLength();
  }).then(function (len) {
    assertEqual(len, 0, '处理后队列清空');

    // 离线场景：入队后离线处理 -> 全部 failed
    online = false;
    return store.addNote('note-3', false);
  }).then(function (n3) {
    return q.enqueue(n3.id);
  }).then(function () {
    return q.processQueue();
  }).then(function (res) {
    assertEqual(res.synced, 0, '离线时 processQueue 同步 0 条');
    assertEqual(res.failed, 1, '离线时 processQueue 失败 1 条');
    return q.getQueueLength();
  }).then(function (len) {
    assertEqual(len, 1, '离线失败后队列仍保留 1 条');

    // 恢复联网重试 -> 同步成功
    online = true;
    return q.processQueue();
  }).then(function (res) {
    assertEqual(res.synced, 1, '恢复联网后同步成功 1 条');
  });
}

function setGlobal(name, value) {
  // Node 20+ 内置只读 navigator，普通赋值静默失败，需用 defineProperty 强制覆盖
  try {
    Object.defineProperty(global, name, { value: value, configurable: true, writable: true });
  } catch (e) {
    global[name] = value;
  }
}

function testScoreChecks() {
  // mock 浏览器全局
  setGlobal('navigator', {
    serviceWorker: {
      getRegistrations: function () { return Promise.resolve([{}]); },
      getRegistration: function () { return Promise.resolve({ active: true }); }
    }
  });
  setGlobal('caches', { keys: function () { return Promise.resolve(['numfeel-v1']); } });
  setGlobal('indexedDB', {
    databases: function () { return Promise.resolve([{ name: 'offline-lab-notes' }]); }
  });
  setGlobal('SyncManager', function () {});

  return E.getFullScore().then(function (score) {
    assert(score.total >= 0 && score.total <= 100, 'getFullScore total 在 0-100 之间 (实际 ' + score.total + ')');
    assertEqual(score.items.length, 5, 'getFullScore 返回 5 个检测项');
    var allValid = score.items.every(function (it) {
      return typeof it.result.score === 'number' && typeof it.result.detail === 'string';
    });
    assert(allValid, '每个检测项含 score 和 detail 字段');
    assertEqual(score.total, 100, 'mock 环境下满分 100');
  });
}

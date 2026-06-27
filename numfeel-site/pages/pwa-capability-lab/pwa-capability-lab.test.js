/**
 * PWA 能力检测引擎单元测试
 * 运行: node pages/pwa-capability-lab/pwa-capability-lab.test.js
 */

// 模拟浏览器环境 —— navigator 是 Node.js 内置 getter，需用 defineProperty 覆盖
function mockNavigator(obj) {
  Object.defineProperty(globalThis, 'navigator', { value: obj, writable: true, configurable: true });
}

mockNavigator({});
global.window = { matchMedia: function() { return { matches: false }; } };
global.document = { querySelector: function() { return null; } };
global.ServiceWorkerRegistration = { prototype: {} };
global.Notification = { permission: 'default' };

var engine = require('./engine.js');

var passed = 0;
var failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log('✅ ' + msg);
  } else {
    failed++;
    console.error('❌ ' + msg);
  }
}

// ── 测试：全量检测返回 18 项 ──
(function testAllCapabilitiesCount() {
  mockNavigator({});
  global.window = { matchMedia: function() { return { matches: false }; } };
  var caps = engine.detectAllCapabilities();
  assert(caps.length === 18, 'detectAllCapabilities 应返回 18 项能力');
})();

// ── 测试：Service Worker 检测 ──
(function testServiceWorkerSupported() {
  mockNavigator({ serviceWorker: { controller: null } });
  global.window = { matchMedia: function() { return { matches: false }; } };
  var caps = engine.detectAllCapabilities();
  var sw = caps.find(function(c) { return c.id === 'service-worker'; });
  assert(sw !== undefined, '应包含 service-worker 检测项');
  assert(sw.supported === true, 'Service Worker 可用时应返回 supported=true');
  assert(sw.group === 'foundation', 'Service Worker 应属于 foundation 组');
})();

(function testServiceWorkerUnsupported() {
  mockNavigator({});
  global.window = { matchMedia: function() { return { matches: false }; } };
  var caps = engine.detectAllCapabilities();
  var sw = caps.find(function(c) { return c.id === 'service-worker'; });
  assert(sw !== undefined, '应包含 service-worker 检测项');
  assert(sw.supported === false, 'Service Worker 不可用时应返回 supported=false');
})();

// ── 测试：Cache API 检测 ──
(function testCacheApiSupported() {
  mockNavigator({});
  global.window = { caches: {}, matchMedia: function() { return { matches: false }; } };
  var caps = engine.detectAllCapabilities();
  var cache = caps.find(function(c) { return c.id === 'cache-api'; });
  assert(cache.supported === true, 'Cache API 可用时应返回 supported=true');
})();

(function testCacheApiUnsupported() {
  mockNavigator({});
  global.window = { matchMedia: function() { return { matches: false }; } };
  var caps = engine.detectAllCapabilities();
  var cache = caps.find(function(c) { return c.id === 'cache-api'; });
  assert(cache.supported === false, 'Cache API 不可用时应返回 supported=false');
})();

// ── 测试：推送通知检测 ──
(function testPushNotificationSupported() {
  mockNavigator({});
  global.window = { PushManager: function() {}, matchMedia: function() { return { matches: false }; } };
  global.Notification = { permission: 'default' };
  var caps = engine.detectAllCapabilities();
  var push = caps.find(function(c) { return c.id === 'push-notification'; });
  assert(push.supported === true, 'Push API 可用时应返回 supported=true');
})();

(function testPushNotificationUnsupported() {
  mockNavigator({});
  global.window = { matchMedia: function() { return { matches: false }; } };
  var caps = engine.detectAllCapabilities();
  var push = caps.find(function(c) { return c.id === 'push-notification'; });
  assert(push.supported === false, 'Push API 不可用时应返回 supported=false');
})();

// ── 测试：getBrowserInfo 返回必要字段 ──
(function testBrowserInfoFields() {
  global.navigator = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };
  global.window = { matchMedia: function() { return { matches: false }; } };
  var info = engine.getBrowserInfo();
  assert(typeof info.name === 'string' && info.name.length > 0, 'getBrowserInfo 应返回浏览器名称');
  assert(typeof info.os === 'string' && info.os.length > 0, 'getBrowserInfo 应返回操作系统');
  assert(typeof info.isPwa === 'boolean', 'getBrowserInfo 应返回 isPwa 布尔值');
})();

// ── 测试：summarizeByGroup ──
(function testSummarizeByGroup() {
  var caps = [
    { id: 'a', name: 'A', supported: true, detail: '', group: 'foundation' },
    { id: 'b', name: 'B', supported: false, detail: '', group: 'foundation' },
    { id: 'c', name: 'C', supported: true, detail: '', group: 'experience' },
    { id: 'd', name: 'D', supported: true, detail: '', group: 'advanced' }
  ];
  var summary = engine.summarizeByGroup(caps);
  assert(summary.foundation.total === 2 && summary.foundation.passed === 1, 'foundation 组应有 2 项、通过 1 项');
  assert(summary.experience.total === 1 && summary.experience.passed === 1, 'experience 组应有 1 项、通过 1 项');
  assert(summary.advanced.total === 1 && summary.advanced.passed === 1, 'advanced 组应有 1 项、通过 1 项');
})();

// ── 结果 ──
console.log('\n' + (failed === 0 ? '✅ 全部通过' : '❌ ' + failed + ' 个失败') + ' | ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);

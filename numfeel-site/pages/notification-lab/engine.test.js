/**
 * 浏览器通知能力实验室 — 单元测试
 * 运行: node pages/notification-lab/engine.test.js
 */

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

function assertEqual(actual, expected, msg) {
  assert(actual === expected, msg + '（实际: ' + actual + '，期望: ' + expected + '）');
}

// ── 测试：能力定义表完整性 ──
(function testCapabilityDefsIntegrity() {
  var defs = engine.CAPABILITY_DEFS;

  assert(defs.length === 10, '能力定义表应有 10 项，实际 ' + defs.length);

  var ids = defs.map(function (def) { return def.id; });
  var unique = new Set(ids);
  assertEqual(unique.size, ids.length, '能力 ID 不应重复');

  var missingField = defs.some(function (def) {
    return !def.name || !def.icon || !def.how || !def.why;
  });
  assert(!missingField, '每项能力都应带 name / icon / how / why');
})();

// ── 测试：全支持环境的检测结果 ──
(function testDetectAllSupported() {
  var env = {
    hasNotification: true,
    hasServiceWorker: true,
    hasPushManager: true,
    hasBadging: true,
    hasVibrate: true,
    hasWakeLock: true,
    isIOS: false,
    isAndroid: false,
    standalone: true
  };

  var caps = engine.detectCapabilities(env);
  assertEqual(caps.length, 10, 'detectCapabilities 应返回 10 项');
  assert(caps.every(function (c) { return c.supported; }), '全支持环境下每项都应返回 true');
})();

// ── 测试：全不支持环境的检测结果 ──
(function testDetectNoneSupported() {
  var env = {
    hasNotification: false,
    hasServiceWorker: false,
    hasPushManager: false,
    hasBadging: false,
    hasVibrate: false,
    hasWakeLock: false,
    isIOS: false,
    isAndroid: false,
    standalone: false
  };

  var caps = engine.detectCapabilities(env);
  var syncIds = ['notification', 'service-worker', 'push', 'badging', 'vibrate', 'wake-lock'];
  var syncAllOff = syncIds.every(function (id) {
    var item = caps.find(function (c) { return c.id === id; });
    return item && !item.supported;
  });

  assert(syncAllOff, '全不支持环境下 6 项同步能力都应为 false');
})();

// ── 测试：iOS 普通网页拿不到 Web Push ──
(function testIOSNonStandalone() {
  var env = {
    hasNotification: true,
    hasServiceWorker: true,
    hasPushManager: true,
    hasBadging: true,
    hasVibrate: true,
    hasWakeLock: false,
    isIOS: true,
    isAndroid: false,
    standalone: false
  };

  var caps = engine.detectCapabilities(env);
  var push = caps.find(function (c) { return c.id === 'push'; });

  assert(push.detail.indexOf('主屏幕') !== -1, 'iOS 普通网页应提示需要添加到主屏幕');
  assert(env.hasPushManager, '能力探测只反映 API 是否存在，限制由 detail 说明');
})();

// ── 测试：真实 iOS 普通标签页（无 PushManager）也提示主屏幕限制 ──
(function testIOSNonStandaloneNoPushManager() {
  var env = {
    hasNotification: true,
    hasServiceWorker: true,
    hasPushManager: false,
    hasBadging: false,
    hasVibrate: true,
    hasWakeLock: false,
    isIOS: true,
    isAndroid: false,
    standalone: false
  };

  var caps = engine.detectCapabilities(env);
  var push = caps.find(function (c) { return c.id === 'push'; });

  assert(push.detail.indexOf('主屏幕') !== -1,
    '真实 iOS 标签页没有 PushManager，但仍应解释主屏幕限制而不是只说缺少 API');
})();

// ── 测试：iOS 主屏幕 App 拿到推送 ──
(function testIOSStandalone() {
  var env = {
    hasNotification: true,
    hasServiceWorker: true,
    hasPushManager: true,
    hasBadging: true,
    hasVibrate: true,
    hasWakeLock: false,
    isIOS: true,
    isAndroid: false,
    standalone: true
  };

  var caps = engine.detectCapabilities(env);
  var push = caps.find(function (c) { return c.id === 'push'; });

  assert(push.detail.indexOf('主屏幕 App') !== -1, 'iOS 主屏幕 App 应说明可以订阅');
})();

// ── 测试：Android 角标由系统自绘 ──
(function testAndroidBadging() {
  var env = {
    hasNotification: true,
    hasServiceWorker: true,
    hasPushManager: true,
    hasBadging: true,
    hasVibrate: true,
    hasWakeLock: false,
    isIOS: false,
    isAndroid: true,
    standalone: false
  };

  var caps = engine.detectCapabilities(env);
  var badging = caps.find(function (c) { return c.id === 'badging'; });

  assert(badging.detail.indexOf('系统') !== -1, 'Android 应说明角标由系统自绘');
})();

// ── 测试：异步项标记为待实测 ──
(function testAsyncItemsPending() {
  var env = {
    hasNotification: true,
    hasServiceWorker: true,
    hasPushManager: true,
    hasBadging: true,
    hasVibrate: true,
    hasWakeLock: true,
    isIOS: false,
    isAndroid: false,
    standalone: false
  };

  var caps = engine.detectCapabilities(env);
  var pendingIds = ['get-notification', 'actions', 'silent-push', 'persistent'];
  var allPending = pendingIds.every(function (id) {
    var item = caps.find(function (c) { return c.id === id; });
    return item && item.supported && item.detail === '需实际发送一条通知后确认';
  });

  assert(allPending, '四项异步能力应统一标记为「需实际发送后确认」');
})();

// ── 测试：未知能力项不崩溃 ──
(function testUnknownCapability() {
  var env = {
    hasNotification: true,
    hasServiceWorker: true,
    hasPushManager: true,
    hasBadging: true,
    hasVibrate: true,
    hasWakeLock: true,
    isIOS: false,
    isAndroid: false,
    standalone: false
  };

  var caps = engine.detectCapabilities(env);
  assert(caps.every(function (c) { return typeof c.detail === 'string'; }), '每项都应返回字符串 detail');
})();

// ── 测试：summarize 统计 ──
(function testSummarize() {
  var env = {
    hasNotification: true,
    hasServiceWorker: true,
    hasPushManager: false,
    hasBadging: true,
    hasVibrate: false,
    hasWakeLock: true,
    isIOS: false,
    isAndroid: false,
    standalone: false
  };

  var caps = engine.detectCapabilities(env);
  var sum = engine.summarize(caps);

  assertEqual(sum.total, 10, '总数应为 10');
  assertEqual(sum.confirmed, 8, '已确认支持应为 8 项（4 项同步命中 + 4 项待实测）');
  assertEqual(sum.unconfirmed, 4, '待实测应为 4 项');
  assertEqual(sum.ratio, 80, '百分比应为 80');
})();

// ── 测试：summarize 空数组不除零 ──
(function testSummarizeEmpty() {
  var sum = engine.summarize([]);
  assertEqual(sum.ratio, 0, '空数组不应产生 NaN');
  assertEqual(sum.total, 0, '空数组总数为 0');
})();

// ── 测试：平台识别 ──
(function testDescribePlatform() {
  var iPhone = engine.describePlatform(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    false
  );
  assert(iPhone.isIOS, 'iPhone UA 应识别为 iOS');
  assertEqual(iPhone.os, 'iOS / iPadOS', 'iOS 系统名应正确');

  var android = engine.describePlatform(
    'Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0 Mobile Safari/537.36',
    false
  );
  assert(android.isAndroid, 'Android UA 应识别为 Android');

  var firefoxIOS = engine.describePlatform(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) FxiOS/120.0',
    false
  );
  assertEqual(firefoxIOS.browser, 'Safari', 'iOS 上第三方浏览器底层都是 Safari 内核');

  var unknown = engine.describePlatform('', false);
  assertEqual(unknown.browser, '未知浏览器', '空 UA 不应崩溃');
  assertEqual(unknown.isIOS, false, '空 UA 不应误判为 iOS');
})();

// ── 测试：权限状态机 ──
(function testExplainPermission() {
  var granted = engine.explainPermission('granted');
  assertEqual(granted.tone, 'good', 'granted 应为绿色');

  var denied = engine.explainPermission('denied');
  assertEqual(denied.tone, 'bad', 'denied 应为红色');
  assert(denied.advice.indexOf('锁死') !== -1, 'denied 应说明无法再申请');

  var fallback = engine.explainPermission('nonsense');
  assertEqual(fallback.state, 'unsupported', '非法权限值应回退到 unsupported');
})();

// ── 测试：预设完整性 ──
(function testPresetIntegrity() {
  var presets = engine.NOTIFICATION_PRESETS;

  assertEqual(presets.length, 6, '预设场景应有 6 个');

  var ids = presets.map(function (p) { return p.id; });
  assertEqual(new Set(ids).size, ids.length, '预设 ID 不应重复');

  var bad = presets.some(function (p) {
    return !p.name || !p.icon || !p.desc || !p.note || !p.options || !p.options.tag;
  });
  assert(!bad, '每个预设都应带 name / icon / desc / note / options.tag');
})();

// ── 测试：通知构造不修改源预设 ──
(function testBuildNotificationNoMutation() {
  var preset = engine.NOTIFICATION_PRESETS[0];
  var originalBody = preset.options.body;

  var built = engine.buildNotification(preset, '改写后的正文');
  assertEqual(built.options.body, '改写后的正文', 'bodyOverride 应生效');
  assertEqual(preset.options.body, originalBody, '源预设不应被修改');

  assertEqual(built.options.tag, preset.options.tag, '其他字段应原样保留');
  assertEqual(built.meta.name, preset.name, '元信息应回传');
})();

// ── 测试：连发替换演示递增进度 ──
(function testRenotifyProgress() {
  var preset = engine.NOTIFICATION_PRESETS.find(function (p) { return p.id === 'renotify'; });
  var texts = ['进度 33%', '进度 66%', '进度 100%'];

  var tags = texts.map(function (text) {
    return engine.buildNotification(preset, text).options.tag;
  });

  assertEqual(new Set(tags).size, 1, '连发多条应共用同一个 tag 才能互相替换');
  assertEqual(preset.options.renotify, true, 'renotify 预设应开启静默更新');
})();

// ── 测试：定时通知预设 ──
(function testDelayedPreset() {
  var preset = engine.NOTIFICATION_PRESETS.find(function (p) { return p.id === 'delayed'; });

  assert(preset, '应存在 delayed 预设');
  assertEqual(preset.delayMs, 5000, '延迟应为 5000ms');
  assertEqual(preset.options.tag, 'nf-delayed', 'delayed 预设应带固定基础 tag');

  // delayMs 是调度用的元字段，不应泄漏进通知构造参数
  var built = engine.buildNotification(preset);
  assert(typeof built.options.delayMs === 'undefined', 'delayMs 不应出现在通知 options 里');
})();

// ── 测试：平台对照表 ──
(function testPlatformMatrix() {
  var rows = engine.PLATFORM_MATRIX;

  assert(rows.length >= 5, '平台对照表至少 5 行，实际 ' + rows.length);

  var allowed = ['yes', 'no', 'installed', 'homescreen', 'system'];
  var badCell = rows.some(function (row) {
    return allowed.indexOf(row.notification) === -1
      || allowed.indexOf(row.push) === -1
      || allowed.indexOf(row.badging) === -1;
  });
  assert(!badCell, '单元格取值应限定在约定枚举内');

  var missingNote = rows.some(function (row) { return !row.note || !row.platform || !row.os; });
  assert(!missingNote, '每行都应带 platform / os / note');

  var iOSRow = rows.find(function (row) { return /iOS/.test(row.platform); });
  assertEqual(iOSRow.push, 'homescreen', 'iOS 的 Web Push 应标注为仅主屏幕 App');
})();

// ── 测试：单元格格式化 ──
(function testFormatMatrixCell() {
  assertEqual(engine.formatMatrixCell('yes').tone, 'good', 'yes 应为绿色');
  assertEqual(engine.formatMatrixCell('no').tone, 'bad', 'no 应为红色');
  assertEqual(engine.formatMatrixCell('homescreen').text, '仅主屏幕 App', '文案应正确');

  var unknown = engine.formatMatrixCell('???');
  assertEqual(unknown.tone, 'idle', '未知取值应回退为 idle 而不是崩溃');
})();

// ── 测试：collectEnv 不依赖真实浏览器 ──
(function testCollectEnv() {
  var fakeWin = { navigator: { standalone: false } };
  var fakeNav = { userAgent: 'test', serviceWorker: {}, vibrate: function () {} };

  var env = engine.collectEnv(fakeWin, fakeNav);

  assertEqual(env.hasServiceWorker, true, '应读到 serviceWorker');
  assertEqual(env.hasVibrate, true, '应读到 vibrate');
  assertEqual(env.hasNotification, false, '窗口无 Notification 时应为 false');
  assertEqual(env.standalone, false, '非独立窗口时应为 false');
})();

console.log('\n' + '─'.repeat(40));
console.log('通过 ' + passed + ' / 失败 ' + failed);
if (failed > 0) {
  process.exit(1);
}

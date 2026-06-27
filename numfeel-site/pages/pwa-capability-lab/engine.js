/**
 * PWA 能力检测引擎 —— 纯逻辑层，不操作 DOM
 */

/**
 * @typedef {Object} CapabilityResult
 * @property {string} id - 能力标识
 * @property {string} name - 中文名称
 * @property {boolean} supported - 是否支持
 * @property {string} detail - 补充说明
 * @property {string} group - 分组：foundation / experience / advanced
 */

/**
 * 检测所有 PWA 相关能力
 * @returns {CapabilityResult[]}
 */
function detectAllCapabilities() {
  var results = [];
  results.push(detectServiceWorker());
  results.push(detectManifest());
  results.push(detectCacheApi());
  results.push(detectIndexedDB());
  results.push(detectPushNotification());
  results.push(detectBackgroundSync());
  results.push(detectPeriodicSync());
  results.push(detectWebShare());
  results.push(detectWebShareTarget());
  results.push(detectBadging());
  results.push(detectInstallPrompt());
  results.push(detectOfflineCapability());
  results.push(detectGeolocation());
  results.push(detectCamera());
  results.push(detectFileSystem());
  results.push(detectWakeLock());
  results.push(detectWebBluetooth());
  results.push(detectWebNFC());
  return results;
}

/** @returns {CapabilityResult} */
function detectServiceWorker() {
  var supported = 'serviceWorker' in navigator;
  var detail = '';
  if (supported) {
    detail = navigator.serviceWorker.controller
      ? '已激活（当前页面由 SW 控制）'
      : '已注册但未激活（首次访问或 SW 更新中）';
  } else {
    detail = '不支持（iOS WKWebView、部分国产浏览器内核）';
  }
  return { id: 'service-worker', name: 'Service Worker', supported: supported, detail: detail, group: 'foundation' };
}

/** @returns {CapabilityResult} */
function detectManifest() {
  var link = document.querySelector('link[rel="manifest"]');
  var supported = !!link;
  var detail = supported ? '已检测到 manifest.json 链接' : '页面未声明 manifest';
  return { id: 'manifest', name: 'Web App Manifest', supported: supported, detail: detail, group: 'foundation' };
}

/** @returns {CapabilityResult} */
function detectCacheApi() {
  var supported = 'caches' in window;
  var detail = supported ? 'Cache API 可用，支持编程式缓存控制' : '不支持，离线能力受限';
  return { id: 'cache-api', name: 'Cache API', supported: supported, detail: detail, group: 'foundation' };
}

/** @returns {CapabilityResult} */
function detectIndexedDB() {
  var supported = 'indexedDB' in window;
  var detail = supported ? '支持结构化本地存储' : '不支持，大数据量本地存储受限';
  return { id: 'indexeddb', name: 'IndexedDB', supported: supported, detail: detail, group: 'foundation' };
}

/** @returns {CapabilityResult} */
function detectPushNotification() {
  var supported = 'PushManager' in window;
  var detail = '';
  if (supported) {
    detail = 'Notification' in window && Notification.permission === 'granted'
      ? '已授权推送通知'
      : 'API 可用但未授权（需用户手动允许）';
  } else {
    detail = '不支持（iOS Safari 不支持 Web Push）';
  }
  return { id: 'push-notification', name: '推送通知', supported: supported, detail: detail, group: 'experience' };
}

/** @returns {CapabilityResult} */
function detectBackgroundSync() {
  var supported = 'SyncManager' in window;
  var detail = supported
    ? '支持后台数据同步'
    : '不支持（仅 Chrome 系支持，iOS/WebKit 不支持）';
  return { id: 'background-sync', name: '后台同步', supported: supported, detail: detail, group: 'experience' };
}

/** @returns {CapabilityResult} */
function detectPeriodicSync() {
  var supported = 'periodicSync' in (navigator.serviceWorker && navigator.serviceWorker.registration || {});
  if (!supported && 'ServiceWorkerRegistration' in window) {
    supported = 'periodicSync' in ServiceWorkerRegistration.prototype;
  }
  var detail = supported
    ? '支持周期性后台数据更新'
    : '不支持（需要已安装 PWA + Chrome）';
  return { id: 'periodic-sync', name: '周期性后台同步', supported: supported, detail: detail, group: 'advanced' };
}

/** @returns {CapabilityResult} */
function detectWebShare() {
  var supported = 'share' in navigator;
  var detail = supported
    ? '可调用系统原生分享面板'
    : '不支持（桌面端 Safari、部分旧浏览器）';
  return { id: 'web-share', name: 'Web Share', supported: supported, detail: detail, group: 'experience' };
}

/** @returns {CapabilityResult} */
function detectWebShareTarget() {
  var link = document.querySelector('link[rel="manifest"]');
  var detail = '需 manifest 声明 share_target（当前页面未检测）';
  return { id: 'share-target', name: '接收分享', supported: false, detail: detail, group: 'experience' };
}

/** @returns {CapabilityResult} */
function detectBadging() {
  var supported = 'setAppBadge' in navigator || 'setClientBadge' in (navigator || {});
  var detail = supported
    ? '可在桌面图标上显示角标'
    : '不支持（仅已安装的 PWA + Chrome/Edge）';
  return { id: 'badging', name: '桌面角标', supported: supported, detail: detail, group: 'experience' };
}

/** @returns {CapabilityResult} */
function detectInstallPrompt() {
  var detail = '';
  var isStandalone = false;
  if (window.matchMedia) {
    isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  }
  if (isStandalone) {
    detail = '已在独立窗口中运行（已安装 PWA）';
  } else {
    detail = '未安装为 PWA（可通过浏览器菜单"添加到主屏幕"）';
  }
  return { id: 'install-prompt', name: '可安装体验', supported: true, detail: detail, group: 'experience' };
}

/** @returns {CapabilityResult} */
function detectOfflineCapability() {
  var sw = navigator.serviceWorker;
  var supported = sw && sw.controller;
  var detail = '';
  if (supported) {
    detail = 'Service Worker 可拦截请求并返回缓存内容';
  } else if (sw) {
    detail = 'SW 可用但未控制页面（刷新后生效）';
  } else {
    detail = '离线能力依赖 Service Worker，当前浏览器不支持';
  }
  return { id: 'offline', name: '离线可用', supported: supported, detail: detail, group: 'experience' };
}

/** @returns {CapabilityResult} */
function detectGeolocation() {
  var supported = 'geolocation' in navigator;
  var detail = supported ? '支持地理定位 API' : '不支持';
  return { id: 'geolocation', name: '地理定位', supported: supported, detail: detail, group: 'advanced' };
}

/** @returns {CapabilityResult} */
function detectCamera() {
  var supported = 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices;
  var detail = supported ? '支持摄像头/麦克风访问' : '不支持或在非 HTTPS 下不可用';
  return { id: 'camera', name: '摄像头访问', supported: supported, detail: detail, group: 'advanced' };
}

/** @returns {CapabilityResult} */
function detectFileSystem() {
  var supported = 'showOpenFilePicker' in window;
  var detail = supported
    ? '支持 File System Access API（可读写本地文件）'
    : '不支持（仅 Chrome 桌面端支持）';
  return { id: 'file-system', name: '本地文件系统', supported: supported, detail: detail, group: 'advanced' };
}

/** @returns {CapabilityResult} */
function detectWakeLock() {
  var supported = 'wakeLock' in navigator;
  var detail = supported
    ? '可阻止屏幕休眠'
    : '不支持（部分浏览器仅 HTTPS + 特定场景）';
  return { id: 'wake-lock', name: '屏幕唤醒锁', supported: supported, detail: detail, group: 'advanced' };
}

/** @returns {CapabilityResult} */
function detectWebBluetooth() {
  var supported = 'bluetooth' in navigator;
  var detail = supported
    ? '可连接蓝牙设备'
    : '不支持（仅 Chrome 桌面/Android 支持）';
  return { id: 'web-bluetooth', name: '蓝牙 API', supported: supported, detail: detail, group: 'advanced' };
}

/** @returns {CapabilityResult} */
function detectWebNFC() {
  var supported = 'NDEFReader' in window;
  var detail = supported
    ? '可读写 NFC 标签'
    : '不支持（仅 Chrome Android 支持）';
  return { id: 'web-nfc', name: 'NFC 读写', supported: supported, detail: detail, group: 'advanced' };
}

/**
 * 获取浏览器信息
 * @returns {{name: string, os: string, isPwa: boolean}}
 */
function getBrowserInfo() {
  var ua = navigator.userAgent;
  var name = '未知浏览器';
  var os = '未知系统';

  if (ua.indexOf('Edg/') !== -1) name = 'Edge';
  else if (ua.indexOf('Chrome/') !== -1) name = 'Chrome';
  else if (ua.indexOf('Safari/') !== -1 && ua.indexOf('Chrome') === -1) name = 'Safari';
  else if (ua.indexOf('Firefox/') !== -1) name = 'Firefox';
  else if (ua.indexOf('MicroMessenger') !== -1) name = '微信内置浏览器';
  else if (ua.indexOf('QQ/') !== -1) name = 'QQ内置浏览器';
  else if (ua.indexOf('UCBrowser') !== -1) name = 'UC浏览器';
  else if (ua.indexOf('Baidu') !== -1) name = '百度浏览器';

  if (ua.indexOf('Windows') !== -1) os = 'Windows';
  else if (ua.indexOf('Mac') !== -1) os = 'macOS';
  else if (ua.indexOf('Android') !== -1) os = 'Android';
  else if (ua.indexOf('iPhone') !== -1 || ua.indexOf('iPad') !== -1) os = 'iOS';

  var isPwa = window.matchMedia('(display-mode: standalone)').matches;

  return { name: name, os: os, isPwa: isPwa };
}

/**
 * 计算能力分组汇总
 * @param {CapabilityResult[]} capabilities
 * @returns {{foundation: {total: number, passed: number}, experience: {total: number, passed: number}, advanced: {total: number, passed: number}}}
 */
function summarizeByGroup(capabilities) {
  var groups = { foundation: { total: 0, passed: 0 }, experience: { total: 0, passed: 0 }, advanced: { total: 0, passed: 0 } };
  capabilities.forEach(function(cap) {
    var g = groups[cap.group];
    if (g) {
      g.total++;
      if (cap.supported) g.passed++;
    }
  });
  return groups;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    detectAllCapabilities: detectAllCapabilities,
    getBrowserInfo: getBrowserInfo,
    summarizeByGroup: summarizeByGroup
  };
}

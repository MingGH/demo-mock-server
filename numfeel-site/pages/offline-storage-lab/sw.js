// ========== 离线生存实验室：Service Worker ==========
// 预缓存本页静态资源，fetch 时 cache-first，离线回退到本地资源。
// 注意：站点根目录已有一个 /sw.js（由 header.js 注册），覆盖整站。
// 本文件作用域为 /pages/offline-storage-lab/，更具体，对本目录资源优先接管。

var LAB_CACHE = 'offline-lab-v1';

var PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './offline-engine.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(LAB_CACHE)
      .then(function (cache) {
        // addAll 对个别资源失败会整体 reject，这里逐个容错
        return Promise.all(PRECACHE_URLS.map(function (url) {
          return cache.add(url).catch(function () {});
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys.filter(function (k) { return k !== LAB_CACHE; }).map(function (k) { return caches.delete(k); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  // 仅拦截同源 GET 请求，CDN 资源交给浏览器默认缓存策略
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        // 运行时缓存成功响应，便于离线时回退
        if (res && res.ok) {
          var clone = res.clone();
          caches.open(LAB_CACHE).then(function (cache) { cache.put(req, clone); });
        }
        return res;
      }).catch(function () {
        // 离线且无缓存：HTML 请求回退到 index，其余返回离线占位
        if (req.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});

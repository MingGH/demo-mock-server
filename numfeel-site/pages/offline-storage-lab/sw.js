// ========== 离线生存实验室：Service Worker ==========
// 预缓存本页所有资源（含 CDN），确保真实断网后页面完整可用。
// 作用域：/pages/offline-storage-lab/

var LAB_CACHE = 'offline-lab-v2';

// 本地资源
var LOCAL_URLS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './offline-engine.js',
  '../../components/header.js',
  '../../components/header.css'
];

// CDN 资源（真断网时必须可用）
var CDN_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css'
];

var ALL_URLS = LOCAL_URLS.concat(CDN_URLS);

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(LAB_CACHE)
      .then(function (cache) {
        // 逐个 add，单个失败不影响其他
        return Promise.all(ALL_URLS.map(function (url) {
          return cache.add(url).catch(function (err) {
            console.warn('[SW] precache failed:', url, err.message);
          });
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
          keys.filter(function (k) { return k !== LAB_CACHE; })
            .map(function (k) { return caches.delete(k); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  e.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          var clone = res.clone();
          caches.open(LAB_CACHE).then(function (cache) { cache.put(req, clone); });
        }
        return res;
      }).catch(function () {
        // 离线且无缓存
        if (req.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});

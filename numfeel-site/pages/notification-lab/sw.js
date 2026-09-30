/**
 * 通知能力实验室 — 页面内的 Service Worker
 *
 * Chrome 已禁用 Notification 构造函数，所有通知必须经由 SW 的 showNotification 发出；
 * 同时通知上的按钮、点击跳转也只在这里才有地方接。
 */

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = event.action;
  const target = action === 'reject'
    ? '/pages/notification-lab/?from=reject'
    : '/pages/notification-lab/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((item) => item.url.includes('/pages/notification-lab/'));
      if (existing) {
        return existing.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});

self.addEventListener('push', (event) => {
  // 预留：真推送接入后，push 事件里的数据会从这里分流到具体页面
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (error) {
      payload = { body: event.data.text() };
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || '数字直觉', {
      body: payload.body || '有一条新推送',
      icon: '/favicon.ico',
      tag: payload.tag || 'nf-push'
    })
  );
});

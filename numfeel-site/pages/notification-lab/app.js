/**
 * 浏览器通知能力实验室 — DOM 层
 *
 * 所有判定逻辑来自 engine.js，这里只负责读取环境、渲染、发送通知和上报。
 */

var PENDING_DETAIL = '需实际发送一条通知后确认';

var state = {
  capabilities: [],
  worker: null,
  workerTried: false,
  sentCount: 0
};

// ── 初始化 ──
document.addEventListener('DOMContentLoaded', function () {
  var env = engine.collectEnv(window, navigator);
  state.capabilities = engine.detectCapabilities(env);

  renderCapabilities();
  renderPresets();
  renderMatrix();
  renderPermission();

  bindHero();
  bindMore();

  track('session_start', {
    is_ios: env.isIOS,
    is_android: env.isAndroid,
    standalone: env.standalone,
    has_push: env.hasPushManager
  });
});

window.addEventListener('pagehide', function () {
  track('session_end', { sent: state.sentCount });
});

// ── 渲染能力清单 ──
function renderCapabilities() {
  var list = document.getElementById('cap-list');
  var summary = engine.summarize(state.capabilities);

  document.getElementById('score-badge').textContent = summary.confirmed + ' / ' + summary.total;
  document.getElementById('meter-fill').style.width = summary.ratio + '%';

  list.innerHTML = state.capabilities.map(function (item) {
    return renderCapItem(item);
  }).join('');

  track('capability_scan', {
    score: summary.confirmed,
    total: summary.total,
    unconfirmed: summary.unconfirmed
  });
}

function renderCapItem(item) {
  var isPending = item.detail === PENDING_DETAIL;
  var mark = item.supported ? '支持' : '不支持';
  var stateClass = item.supported ? 'yes' : 'no';

  var pendingTag = isPending
    ? '<span class="cap-tag pending">需实测</span>'
    : '';

  return [
    '<div class="cap-item">',
    '<div class="cap-icon"><i class="ti ' + item.icon + '"></i></div>',
    '<div>',
    '<div class="cap-name">' + item.name + pendingTag + '</div>',
    '<div class="cap-how">' + item.how + '</div>',
    '<div class="cap-why">' + item.why + '</div>',
    '</div>',
    '<div class="cap-state ' + stateClass + '">' + mark + '</div>',
    '<div class="cap-detail">' + item.detail + '</div>',
    '</div>'
  ].join('');
}

// ── 渲染工坊预设 ──
function renderPresets() {
  var grid = document.getElementById('preset-grid');

  grid.innerHTML = engine.NOTIFICATION_PRESETS.map(function (preset) {
    return [
      '<button class="preset" type="button" data-preset="' + preset.id + '">',
      '<div class="preset-name"><i class="ti ' + preset.icon + '"></i>' + preset.name + '</div>',
      '<div class="preset-desc">' + preset.desc + '</div>',
      '<div class="preset-note">' + preset.note + '</div>',
      '<div class="preset-sent" data-sent="' + preset.id + '"></div>',
      '</button>'
    ].join('');
  }).join('');

  grid.addEventListener('click', function (event) {
    var card = event.target.closest('.preset');
    if (card) {
      firePreset(card.dataset.preset);
    }
  });
}

// ── 发送预设通知 ──
function firePreset(presetId) {
  var preset = engine.NOTIFICATION_PRESETS.find(function (item) {
    return item.id === presetId;
  });
  if (!preset) {
    return;
  }

  if (preset.id === 'renotify') {
    fireRenotifySequence();
    return;
  }

  var built = engine.buildNotification(preset);
  var options = built.options;
  // 每次点击生成唯一 tag，避免被当成「替换上一条」而不重新弹出。
  options.tag = uniqueTag(built.meta.id);

  if (preset.delayMs) {
    markScheduled(built.meta.id, preset.delayMs);
    window.setTimeout(function () {
      sendNotification(options, built.meta);
    }, preset.delayMs);
    return;
  }

  sendNotification(options, built.meta);
}

function fireRenotifySequence() {
  var preset = engine.NOTIFICATION_PRESETS.find(function (item) {
    return item.id === 'renotify';
  });
  var steps = ['进度 33%', '进度 66%', '进度 100%'];

  steps.forEach(function (text, index) {
    var built = engine.buildNotification(preset, text);
    var options = built.options;
    options.renotify = index > 0;
    window.setTimeout(function () {
      sendNotification(options, built.meta);
    }, index * 900);
  });
}

// ── 平台对照表 ──
function renderMatrix() {
  var body = document.getElementById('matrix-body');
  var notes = document.getElementById('matrix-notes');

  body.innerHTML = engine.PLATFORM_MATRIX.map(function (row) {
    var cells = ['notification', 'push', 'badging'].map(function (key) {
      return '<td>' + renderCell(row[key]) + '</td>';
    }).join('');

    return '<tr><td>' + row.platform + '<span class="os">' + row.os + '</span></td>'
      + cells + '</tr>';
  }).join('');

  notes.innerHTML = engine.PLATFORM_MATRIX.map(function (row) {
    return '<div class="matrix-note"><strong>' + row.platform + '</strong>：' + row.note + '</div>';
  }).join('');
}

function renderCell(value) {
  var formatted = engine.formatMatrixCell(value);
  return '<span class="cell ' + formatted.tone + '">' + formatted.text + '</span>';
}

// ── 权限状态 ──
function renderPermission() {
  var badge = document.getElementById('perm-badge');
  var advice = document.getElementById('perm-advice');
  var state_ = engine.explainPermission(currentPermission());

  badge.textContent = state_.label;
  badge.className = 'perm-badge ' + state_.tone;
  advice.textContent = state_.advice;
  advice.className = 'perm-advice ' + state_.tone;
}

function currentPermission() {
  if (!('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

// ── Hero 按钮 ──
function bindHero() {
  var button = document.getElementById('hero-cta');
  var hint = document.getElementById('hero-hint');

  button.addEventListener('click', function () {
    button.disabled = true;
    hint.textContent = '正在申请权限…';

    requestPermission()
      .then(function (permission) {
        var state_ = engine.explainPermission(permission);
        renderPermission();
        track('permission_result', { granted: permission === 'granted', state: state_.state });
        return state_.state;
      })
      .then(function (state_) {
        if (state_ === 'granted') {
          return sendDemoGreeting();
        }
        hint.textContent = '权限没拿到，下面的能力清单照样能看';
      })
      .catch(function (error) {
        hint.textContent = '这个环境不支持通知，试试 Chrome、Edge 或 Firefox';
        track('permission_error', {});
      })
      .then(function () {
        button.disabled = false;
      });
  });
}

function requestPermission() {
  if (!('Notification' in window)) {
    return Promise.resolve('unsupported');
  }
  if (Notification.permission !== 'default') {
    return Promise.resolve(Notification.permission);
  }
  return Notification.requestPermission();
}

function sendDemoGreeting() {
  var built = engine.buildNotification(engine.NOTIFICATION_PRESETS[0]);
  var options = built.options;
  options.body = '通知能力已点亮，往下看你的浏览器能弹什么。';
  options.tag = uniqueTag(built.meta.id);

  return sendNotification(options, built.meta)
    .then(function () {
      document.getElementById('hero-hint').textContent = '通知已经发到你的系统通知中心，去看看';
    });
}

// ── 折叠区 ──
function bindMore() {
  var toggle = document.getElementById('more-toggle');
  var content = document.getElementById('more-content');

  content.hidden = true;

  toggle.addEventListener('click', function () {
    content.hidden = !content.hidden;
    toggle.classList.toggle('open', !content.hidden);
    track('more_toggle', { open: !content.hidden });
  });
}

// ── Service Worker ──
function ensureWorker() {
  if (state.worker || state.workerTried) {
    return Promise.resolve(state.worker);
  }
  state.workerTried = true;

  if (!('serviceWorker' in navigator)) {
    return Promise.resolve(null);
  }

  return navigator.serviceWorker.register('sw.js', { scope: './' })
    .then(function (registration) {
      state.worker = registration;
      track('worker_registered', { ok: true });
      return registration;
    })
    .catch(function () {
      track('worker_registered', { ok: false });
      return null;
    });
}

// ── 真正发出一条通知 ──
/**
 * 生成唯一 tag：在基础 tag 上追加时间戳。
 * 同 tag 的通知会被浏览器当作「替换旧通知」，导致重复点击不重新弹；
 * 加时间戳后每次点击都是全新的一条。
 *
 * @param {string} base 预设自带的基础 tag
 * @returns {string} 唯一的 tag
 */
function uniqueTag(base) {
  return base + '-' + Date.now();
}

function sendNotification(options, meta) {
  if (currentPermission() !== 'granted') {
    return Promise.resolve({ ok: false, reason: 'permission' });
  }

  return ensureWorker()
    .then(function (worker) {
      if (worker && worker.showNotification) {
        return worker.showNotification('数字直觉 · ' + meta.name, options)
          .then(function () { return { ok: true }; });
      }
      return showDirect(options, meta).then(function (ok) {
        return { ok: ok, reason: 'fallback' };
      });
    })
    .then(function (result) {
      state.sentCount += 1;
      markSent(meta.id, result.ok);
      track('preset_send', { preset: meta.id, ok: result.ok });
      return result;
    })
    .catch(function () {
      track('preset_send', { preset: meta.id, ok: false });
      return { ok: false, reason: 'error' };
    });
}

function showDirect(options, meta) {
  try {
    var n = new Notification('数字直觉 · ' + meta.name, options);
    return Promise.resolve(Boolean(n));
  } catch (error) {
    return Promise.resolve(false);
  }
}

function markScheduled(presetId, delayMs) {
  var slot = document.querySelector('[data-sent="' + presetId + '"]');
  if (!slot) {
    return;
  }
  slot.textContent = '已预约，' + Math.round(delayMs / 1000) + ' 秒后送达，现在可以切走了';
  slot.className = 'preset-sent';
  slot.style.color = '#90caf9';
}

function markSent(presetId, ok) {
  var slot = document.querySelector('[data-sent="' + presetId + '"]');
  if (!slot) {
    return;
  }
  slot.textContent = ok ? '已发出' : '这个环境没弹出来';
  slot.className = 'preset-sent';
  slot.style.color = ok ? '#81c784' : '#ff6b6b';
}

// ── 埋点 ──
function track(event, props) {
  if (window.NFTrack) {
    window.NFTrack.track(event, props);
  }
}

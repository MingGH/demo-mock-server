/**
 * 浏览器通知能力实验室 — 纯逻辑层
 *
 * 所有函数不触碰 DOM，浏览器环境通过参数注入，因此可在 Node 中直接单测。
 */

/** 通知相关能力定义表：顺序即页面展示顺序 */
const CAPABILITY_DEFS = [
  {
    id: 'notification',
    name: '基础通知',
    icon: 'ti-bell',
    category: 'display',
    how: 'Notification in window',
    why: '一切的起点。没有它，网页只能在页面内画一个假的弹窗。'
  },
  {
    id: 'service-worker',
    name: 'Service Worker',
    icon: 'ti-settings',
    category: 'display',
    how: 'navigator.serviceWorker',
    why: '页面关掉之后还能继续执行代码，全靠它常驻。'
  },
  {
    id: 'push',
    name: 'Web Push 订阅',
    icon: 'ti-cloud-upload',
    category: 'push',
    how: 'window.PushManager',
    why: '让服务器能主动找你，而不是你去找服务器。'
  },
  {
    id: 'get-notification',
    name: '通知查询与替换',
    icon: 'ti-layers-subtract',
    category: 'push',
    how: 'registration.getNotifications',
    why: '用 tag 把旧通知换掉，避免通知中心堆成山。'
  },
  {
    id: 'badging',
    name: '应用角标',
    icon: 'ti-badge',
    category: 'display',
    how: 'navigator.setAppBadge',
    why: '在图标上直接写未读数，Android 是系统自带的，桌面得自己画。'
  },
  {
    id: 'actions',
    name: '通知内嵌按钮',
    icon: 'ti-click',
    category: 'display',
    how: 'options.actions',
    why: '让用户在通知上直接做决定，不用点进页面。也是钓鱼的绝佳载体。'
  },
  {
    id: 'vibrate',
    name: '震动',
    icon: 'ti-device-mobile',
    category: 'display',
    how: 'navigator.vibrate',
    why: '桌面端基本无效，主要服务移动端。'
  },
  {
    id: 'wake-lock',
    name: '屏幕常亮',
    icon: 'ti-brightness',
    category: 'extra',
    how: 'navigator.wakeLock',
    why: '推送场景常和它一起用：用户没点头就锁屏，通知等于没发。'
  },
  {
    id: 'silent-push',
    name: '静默推送',
    icon: 'ti-eye-off',
    category: 'extra',
    how: 'push 事件里不调 showNotification',
    why: '用户界面上什么都不显示，但代码已经跑了。Safari 明确封杀这条路。'
  },
  {
    id: 'persistent',
    name: '常驻不消失',
    icon: 'ti-alert-octagon',
    category: 'extra',
    how: 'options.requireInteraction',
    why: '通知可以赖在屏幕上不走，直到用户处理它。'
  }
];

/**
 * 平台支持对照表。
 *
 * 每条结论都来自浏览器厂商或 MDN 的公开文档，不含实测推测；
 * 未验证的平台（如各家国产浏览器、微信内置浏览器）一律不列。
 */
const PLATFORM_MATRIX = [
  {
    platform: 'Chrome / Edge 桌面',
    os: 'Windows · macOS · Linux',
    notification: 'yes',
    push: 'yes',
    badging: 'installed',
    note: '角标要求先把站点安装成 PWA。'
  },
  {
    platform: 'Chrome Android',
    os: 'Android',
    notification: 'yes',
    push: 'yes',
    badging: 'system',
    note: '浏览器不提供 Badging API，未读角标由系统自己画。'
  },
  {
    platform: 'Safari iOS / iPadOS',
    os: 'iOS 16.4+ · iPadOS 16.4+',
    notification: 'yes',
    push: 'homescreen',
    badging: 'yes',
    note: 'Web Push 只能发给「已添加到主屏幕」的 App，普通网页收不到。'
  },
  {
    platform: 'Safari macOS',
    os: 'macOS 16+',
    notification: 'yes',
    push: 'yes',
    badging: 'no',
    note: '16 之前的版本用的是 Safari 私有推送，16 起才转正为标准 Web Push。'
  },
  {
    platform: 'Firefox 桌面',
    os: 'Windows · macOS · Linux',
    notification: 'yes',
    push: 'yes',
    badging: 'no',
    note: '桌面版既不支持角标，也不支持安装 PWA。'
  },
  {
    platform: 'Firefox Android',
    os: 'Android',
    notification: 'yes',
    push: 'yes',
    badging: 'yes',
    note: '移动端能力比桌面完整得多。'
  }
];

/** 通知工坊预设场景 */
const NOTIFICATION_PRESETS = [
  {
    id: 'basic',
    name: '最小可用形态',
    icon: 'ti-bell-ringing',
    tone: 'easy',
    desc: '只有一段标题和正文。这是绝大多数网站实际发出来的样子。',
    note: '没有任何图标、按钮或交互，弹出来三秒后自己消失。',
    options: {
      body: '你有一条新消息。',
      tag: 'nf-basic'
    }
  },
  {
    id: 'rich',
    name: '富媒体 + 角标 + 震动',
    icon: 'ti-photo',
    tone: 'medium',
    desc: '一次性把图标、大图、角标数字、震动全用上。',
    note: '图标、角标、震动全用上——四样里桌面端通常只有图标生效，角标和震动基本是移动端专属。',
    options: {
      body: '3 张新照片已同步完成。',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'nf-rich',
      vibrate: [80, 40, 80]
    }
  },
  {
    id: 'actions',
    name: '带按钮的决策通知',
    icon: 'ti-click',
    tone: 'medium',
    desc: '通知上直接挂「同意 / 拒绝」两个按钮。',
    note: '这是钓鱼和误触的完美载体：用户以为在系统层做选择。',
    options: {
      body: '「数字直觉」请求访问你的通知权限',
      tag: 'nf-actions',
      requireInteraction: true,
      actions: [
        { action: 'accept', title: '同意' },
        { action: 'reject', title: '拒绝' }
      ]
    }
  },
  {
    id: 'persistent',
    name: '常驻不消失',
    icon: 'ti-alert-octagon',
    tone: 'medium',
    desc: 'requireInteraction 让通知赖在屏幕上，直到你处理它。',
    note: '旧版本的通知会自动消失，勒索式弹窗靠这个属性续命。',
    options: {
      body: '有一条通知需要你亲自确认，不处理不会消失。',
      tag: 'nf-persistent',
      requireInteraction: true
    }
  },
  {
    id: 'delayed',
    name: '5 秒后送达',
    icon: 'ti-clock',
    tone: 'fun',
    desc: '点完之后你有 5 秒，切到别的标签页或别的应用，看通知能不能找到你。',
    note: '页面必须保持打开：标签页退到后台可以，关掉浏览器就发不出。能穿透「关掉浏览器」的只有服务器 Web Push。',
    delayMs: 5000,
    options: {
      body: '这条通知是在你切到别处之后送达的。',
      tag: 'nf-delayed'
    }
  },
  {
    id: 'renotify',
    name: '静默替换旧通知',
    icon: 'ti-refresh',
    tone: 'fun',
    desc: '同一个 tag 连发三条，通知中心里始终只留最新一条。',
    note: '没有 tag 的话，通知中心会堆三条一模一样的垃圾。',
    options: {
      body: '进度 33%',
      tag: 'nf-progress',
      renotify: true
    }
  }
];

/** 权限状态机的四种状态 */
const PERMISSION_STATES = {
  unsupported: {
    label: '浏览器不支持',
    tone: 'bad',
    advice: '换 Chrome、Edge 或 Firefox 试试，iOS 需要 16.4 以上。'
  },
  default: {
    label: '尚未询问',
    tone: 'idle',
    advice: '浏览器还没问过你，这是权限最宽松的阶段。'
  },
  granted: {
    label: '已授权',
    tone: 'good',
    advice: '可以正常弹通知了，但这不代表你信任这个网站。'
  },
  denied: {
    label: '已拒绝',
    tone: 'bad',
    advice: 'Chrome 里拒绝后会被锁死，只能去站点设置里手动改回来，网页无法再申请。'
  }
};

/**
 * 从注入的环境对象里同步检测能力。
 *
 * @param {object} env 浏览器能力标志的扁平集合
 * @param {boolean} env.hasNotification
 * @param {boolean} env.hasServiceWorker
 * @param {boolean} env.hasPushManager
 * @param {boolean} env.hasBadging
 * @param {boolean} env.hasVibrate
 * @param {boolean} env.hasWakeLock
 * @param {boolean} env.standalone 是否以 PWA 独立窗口运行
 * @returns {Array<{id: string, name: string, supported: boolean, detail: string}>} 能力检测结果
 */
function detectCapabilities(env) {
  return CAPABILITY_DEFS.map((def) => {
    const probed = probeCapability(def.id, env);
    return {
      id: def.id,
      name: def.name,
      icon: def.icon,
      category: def.category,
      how: def.how,
      why: def.why,
      supported: probed.supported,
      detail: probed.detail
    };
  });
}

/**
 * 探测单项能力。
 *
 * 异步项（通知查询、通知按钮、常驻、静默推送）无法在能力探测阶段确认，
 * 统一按构造成功与否在实发时验证，因此这里给的是「待实测」而不是否。
 *
 * @param {string} id 能力 ID
 * @param {object} env 浏览器能力标志集合
 * @returns {{supported: boolean, detail: string}} 单项探测结论
 */
function probeCapability(id, env) {
  const pending = { supported: true, detail: '需实际发送一条通知后确认' };

  const switchOnId = {
    notification: () => ({
      supported: env.hasNotification,
      detail: env.hasNotification ? '可调用 Notification' : '缺少 Notification API'
    }),
    'service-worker': () => ({
      supported: env.hasServiceWorker,
      detail: env.hasServiceWorker ? '可注册常驻脚本' : '缺少 Service Worker'
    }),
    push: () => ({
      supported: env.hasPushManager,
      detail: buildPushDetail(env)
    }),
    'get-notification': () => pending,
    badging: () => ({
      supported: env.hasBadging,
      detail: env.hasBadging
        ? buildBadgingDetail(env)
        : '缺少 setAppBadge'
    }),
    actions: () => pending,
    vibrate: () => ({
      supported: env.hasVibrate,
      detail: env.hasVibrate ? '移动端有效，桌面端通常被忽略' : '缺少 vibrate'
    }),
    'wake-lock': () => ({
      supported: env.hasWakeLock,
      detail: env.hasWakeLock ? '可阻止自动锁屏' : '缺少 Wake Lock'
    }),
    'silent-push': () => pending,
    persistent: () => pending
  };

  const probe = switchOnId[id];
  return probe ? probe() : { supported: false, detail: '未知能力项' };
}

/**
 * 拼装 Web Push 的说明文案。
 *
 * iOS 上「浏览器支持」和「实际能收到」是两件事，检测结果需要分开讲。
 * 注意 iOS 普通标签页根本不暴露 PushManager，所以 iOS 判断必须放在
 * hasPushManager 检查之前，否则这句提示永远走不到。
 *
 * @param {object} env 浏览器能力标志集合
 * @returns {string} 能力说明
 */
function buildPushDetail(env) {
  if (env.isIOS && !env.standalone) {
    return 'iOS 仅对已添加到主屏幕的 App 开放推送，当前是普通网页';
  }
  if (!env.hasPushManager) {
    return '缺少 PushManager';
  }
  if (env.isIOS) {
    return 'iOS 主屏幕 App，可以订阅推送';
  }
  return '可订阅，服务器可在页面关闭后继续推送';
}

/**
 * 拼装角标能力说明，区分「平台自绘」和「API 自己画」。
 * 只有 hasBadging 为 true 时才会走到这里，文案不能再声称浏览器不暴露该 API。
 *
 * @param {object} env 浏览器能力标志集合
 * @returns {string} 能力说明
 */
function buildBadgingDetail(env) {
  if (env.isAndroid) {
    return 'API 可用，但 Android 未读角标由系统自绘，网页设置的数字取决于桌面启动器';
  }
  if (env.standalone) {
    return '以 PWA 独立窗口运行，角标可用';
  }
  return 'Windows / macOS 需先安装成 PWA 角标才生效';
}

/**
 * 从 UA 里识别桌面浏览器。
 *
 * @param {string} ua 浏览器 UA 字符串
 * @returns {{browser: string, os: string}} 桌面平台标签
 */
function matchDesktopBrowser(ua) {
  const matchers = [
    { browser: 'Edge', test: /Edg\//, os: 'Windows' },
    { browser: 'Chrome', test: /Chrome\//, os: 'Windows' },
    { browser: 'Firefox', test: /Firefox\//, os: 'Windows' },
    { browser: 'Safari', test: /Safari\//, os: 'macOS' }
  ];

  const hit = matchers.find((item) => item.test.test(ua));
  if (!hit) {
    return { browser: '未知浏览器', os: '未知系统' };
  }
  return { browser: hit.browser, os: hit.os };
}

/**
 * 把浏览器 UA 解析成可展示的平台标签。
 *
 * @param {string} userAgent 浏览器 UA 字符串
 * @param {boolean} standalone 是否以 PWA 独立窗口运行
 * @returns {{browser: string, os: string, isIOS: boolean, isAndroid: boolean}} 平台标签
 */
function describePlatform(userAgent, standalone) {
  const ua = String(userAgent || '');
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);

  let platform = matchDesktopBrowser(ua);
  if (isIOS) {
    platform = { browser: /CriOS/.test(ua) ? 'Chrome' : 'Safari', os: 'iOS / iPadOS' };
  } else if (isAndroid) {
    platform = { browser: /Firefox/.test(ua) ? 'Firefox' : 'Chrome', os: 'Android' };
  }

  return {
    browser: platform.browser,
    os: platform.os,
    isIOS: isIOS,
    isAndroid: isAndroid,
    standalone: Boolean(standalone)
  };
}

/**
 * 从浏览器环境里收集能力标志，供 detectCapabilities 使用。
 *
 * @param {Window} win 浏览器 window 对象
 * @param {Navigator} nav 浏览器 navigator 对象
 * @returns {object} 能力标志扁平集合
 */
function collectEnv(win, nav) {
  return {
    hasNotification: 'Notification' in win,
    hasServiceWorker: 'serviceWorker' in nav,
    hasPushManager: 'PushManager' in win,
    hasBadging: 'setAppBadge' in nav,
    hasVibrate: 'vibrate' in nav,
    hasWakeLock: 'wakeLock' in nav,
    isIOS: /iPhone|iPad|iPod/.test(nav.userAgent || ''),
    isAndroid: /Android/.test(nav.userAgent || ''),
    standalone: Boolean(
      win.navigator.standalone
      || (win.matchMedia && win.matchMedia('(display-mode: standalone)').matches)
    )
  };
}

/**
 * 汇总检测结果。
 *
 * 「待实测」项单独计数，避免把「还没验」算成「已确认不支持」。
 *
 * @param {Array<object>} capabilities detectCapabilities 的返回值
 * @returns {{total: number, confirmed: number, unconfirmed: number, ratio: number}} 汇总结果
 */
function summarize(capabilities) {
  const total = capabilities.length;
  const confirmed = capabilities.filter((item) => item.supported).length;
  const unconfirmed = capabilities.filter(
    (item) => item.detail === '需实际发送一条通知后确认'
  ).length;

  return {
    total: total,
    confirmed: confirmed,
    unconfirmed: unconfirmed,
    ratio: total === 0 ? 0 : Math.round((confirmed / total) * 100)
  };
}

/**
 * 把权限值翻译成可展示的结论。
 *
 * @param {string} permission Notification.permission 的值
 * @returns {{state: string, label: string, tone: string, advice: string}} 权限结论
 */
function explainPermission(permission) {
  const state = PERMISSION_STATES[permission] ? permission : 'unsupported';
  const meta = PERMISSION_STATES[state];

  return {
    state: state,
    label: meta.label,
    tone: meta.tone,
    advice: meta.advice
  };
}

/**
 * 把预设转换成通知构造参数，并剥掉只用于展示的字段。
 *
 * @param {object} preset NOTIFICATION_PRESETS 中的一项
 * @param {string} [bodyOverride] 覆盖正文，用于「静默替换」连发演示
 * @returns {{options: object, meta: object}} 构造参数与元信息
 */
function buildNotification(preset, bodyOverride) {
  const options = Object.assign({}, preset.options);

  if (typeof bodyOverride === 'string') {
    options.body = bodyOverride;
  }

  const meta = {
    id: preset.id,
    name: preset.name,
    icon: preset.icon,
    tone: preset.tone,
    desc: preset.desc,
    note: preset.note
  };

  return { options: options, meta: meta };
}

/**
 * 取出平台对照表里某个单元格的展示文案。
 *
 * @param {string} cell yes / no / installed / homescreen / system
 * @returns {{text: string, tone: string}} 单元格展示内容
 */
function formatMatrixCell(cell) {
  const table = {
    yes: { text: '支持', tone: 'good' },
    no: { text: '不支持', tone: 'bad' },
    installed: { text: '需装成 PWA', tone: 'mid' },
    homescreen: { text: '仅主屏幕 App', tone: 'mid' },
    system: { text: '系统自带', tone: 'mid' }
  };

  return table[cell] || { text: cell, tone: 'idle' };
}

const engineExports = {
  CAPABILITY_DEFS: CAPABILITY_DEFS,
  PLATFORM_MATRIX: PLATFORM_MATRIX,
  NOTIFICATION_PRESETS: NOTIFICATION_PRESETS,
  PERMISSION_STATES: PERMISSION_STATES,
  detectCapabilities: detectCapabilities,
  describePlatform: describePlatform,
  collectEnv: collectEnv,
  summarize: summarize,
  explainPermission: explainPermission,
  buildNotification: buildNotification,
  formatMatrixCell: formatMatrixCell
};

// 浏览器直接挂到 window（供 app.js 使用），Node 里走 module.exports（供测试使用）。
if (typeof module !== 'undefined' && module.exports) {
  module.exports = engineExports;
} else if (typeof window !== 'undefined') {
  window.engine = engineExports;
}

(function(global) {
  'use strict';

  const MODE_OPTIONS = Object.freeze([
    {
      key: 'direct',
      label: '本地直连打开',
      summary: '图片请求直接到达你的服务器，更接近真人打开。',
      risk: '较可靠',
      serverView: '通常能看到请求时间、出口 IP、粗略地理位置和收件人 ID。'
    },
    {
      key: 'gmail-proxy',
      label: 'Gmail 图片代理',
      summary: '图片先经 Google 代理，服务端能收到打开事件，但看到的是代理出口。',
      risk: '位置失真',
      serverView: '请求时间仍有参考价值，IP 和地理位置会更像 Google 代理节点。'
    },
    {
      key: 'apple-mpp',
      label: 'Apple Mail 隐私保护',
      summary: 'Apple Mail 可能在后台预取远程内容，请求时间不一定等于真人阅读时间。',
      risk: '容易高估',
      serverView: '能看到一次请求，但这次请求可能发生在真正阅读之前。'
    },
    {
      key: 'security-gateway',
      label: '企业安全网关预检',
      summary: '企业邮箱安全网关可能先替用户扫描图片和链接。',
      risk: '需要复核',
      serverView: '第一次请求可能来自安全系统，后续真人打开才会出现第二次请求。'
    }
  ]);

  const MAILBOX_PRESETS = Object.freeze([
    {
      key: 'gmail',
      label: 'Gmail',
      description: '适合演示图片代理带来的 IP 与位置失真。',
      recommendedMode: 'gmail-proxy'
    },
    {
      key: 'apple-mail',
      label: 'Apple Mail',
      description: '适合演示 Mail Privacy Protection 的后台预取。',
      recommendedMode: 'apple-mpp'
    },
    {
      key: 'outlook',
      label: 'Outlook / 常规客户端',
      description: '用于观察更接近真人直连打开的情况。',
      recommendedMode: 'direct'
    },
    {
      key: 'corp-gateway',
      label: '企业安全网关',
      description: '用于观察投递前扫描触发的假打开。',
      recommendedMode: 'security-gateway'
    }
  ]);

  const EMAIL_PARAGRAPHS = Object.freeze([
    '你好，这是一封给合作方的活动邮件。正文里看不到任何脚本，只有一个 1x1 的图片地址藏在 HTML 里。',
    '当邮件客户端加载这张图片时，服务端就能根据 URL 里的 uid、campaign 等参数，记下一次“打开事件”。',
    '能不能把这次事件当成真人阅读，要看请求究竟来自谁。Gmail 代理、Apple Mail 隐私保护和企业安全网关，都会把这件事变得没那么直接。'
  ]);

  const DEFAULT_FORM = Object.freeze({
    campaignId: 'spring-launch-2026',
    uid: 'user-1024',
    recipient: 'reader@example.com',
    mailbox: 'gmail',
    mode: 'gmail-proxy',
    sender: 'growth@demo.local',
    subject: '春季活动邀请：今晚 8 点开播',
    pixelLabel: 'open-pixel'
  });

  const BATCH_SCENARIO = Object.freeze([
    {
      uid: 'user-2001',
      recipient: 'alice@gmail.com',
      mailbox: 'gmail',
      mode: 'gmail-proxy',
      note: 'Gmail 首次打开'
    },
    {
      uid: 'user-2001',
      recipient: 'alice@gmail.com',
      mailbox: 'gmail',
      mode: 'gmail-proxy',
      note: '同一封 Gmail 再次打开'
    },
    {
      uid: 'user-2002',
      recipient: 'bob@outlook.com',
      mailbox: 'outlook',
      mode: 'direct',
      note: 'Outlook 直连打开'
    },
    {
      uid: 'user-2003',
      recipient: 'carol@icloud.com',
      mailbox: 'apple-mail',
      mode: 'apple-mpp',
      note: 'Apple Mail 后台预取'
    },
    {
      uid: 'user-2004',
      recipient: 'dave@corp.example',
      mailbox: 'corp-gateway',
      mode: 'security-gateway',
      note: '企业网关投递前预检'
    },
    {
      uid: 'user-2004',
      recipient: 'dave@corp.example',
      mailbox: 'outlook',
      mode: 'direct',
      note: '员工稍后真人打开'
    },
    {
      uid: 'user-2005',
      recipient: 'erin@gmail.com',
      mailbox: 'gmail',
      mode: 'gmail-proxy',
      note: '另一个 Gmail 收件人'
    },
    {
      uid: 'user-2006',
      recipient: 'frank@icloud.com',
      mailbox: 'apple-mail',
      mode: 'apple-mpp',
      note: '第二个 Apple Mail 预取'
    }
  ]);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function sanitizeText(value, fallback) {
    const text = String(value == null ? '' : value).trim();
    if (!text) return fallback || '';
    return text;
  }

  function getMailboxPreset(mailbox) {
    return MAILBOX_PRESETS.find(function(item) {
      return item.key === mailbox;
    }) || MAILBOX_PRESETS[0];
  }

  function getModeOption(mode) {
    return MODE_OPTIONS.find(function(item) {
      return item.key === mode;
    }) || MODE_OPTIONS[0];
  }

  function applyMailboxPreset(form, mailbox) {
    const next = clone(form);
    const preset = getMailboxPreset(mailbox);
    next.mailbox = preset.key;
    next.mode = preset.recommendedMode;
    return next;
  }

  function buildPixelId(form) {
    return [
      sanitizeText(form.pixelLabel, 'open-pixel'),
      sanitizeText(form.campaignId, 'demo-campaign'),
      sanitizeText(form.uid, 'anonymous')
    ].join('-');
  }

  function buildPixelUrl(baseOrigin, form) {
    const safeBase = sanitizeText(baseOrigin, 'http://localhost:8080');
    const url = new URL('/email-tracking/pixel.gif', safeBase);
    url.searchParams.set('uid', sanitizeText(form.uid, 'anonymous'));
    url.searchParams.set('campaign', sanitizeText(form.campaignId, 'demo-campaign'));
    url.searchParams.set('recipient', sanitizeText(form.recipient, 'reader@example.com'));
    url.searchParams.set('mailbox', sanitizeText(form.mailbox, 'unknown'));
    url.searchParams.set('mode', sanitizeText(form.mode, 'direct'));
    url.searchParams.set('pixel', buildPixelId(form));
    return url.toString();
  }

  function buildEmailHtml(form, pixelUrl) {
    const safePixelUrl = sanitizeText(pixelUrl, '');
    const sender = sanitizeText(form.sender, 'growth@demo.local');
    const recipient = sanitizeText(form.recipient, 'reader@example.com');
    const subject = sanitizeText(form.subject, '邮件主题');

    return [
      '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;color:#1f2937;line-height:1.7;">',
      '  <p>发件人：' + sender + '</p>',
      '  <p>收件人：' + recipient + '</p>',
      '  <h2 style="margin:16px 0 12px;">' + subject + '</h2>',
      '  <p>你好，这是一封演示 Email Tracking Pixel 的 HTML 邮件。</p>',
      '  <p>正文看起来很普通，真正负责记录打开事件的是下面这张 1x1 图片。</p>',
      '  <img src="' + safePixelUrl + '" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;" />',
      '</div>'
    ].join('\n');
  }

  function defaultStats() {
    return {
      summary: {
        openEvents: 0,
        uniqueRecipients: 0,
        directEvents: 0,
        proxyEvents: 0,
        prefetchLikeEvents: 0,
        latestOpenedAt: null,
        latestOpenedAtText: '还没有请求'
      },
      modeBreakdown: [],
      recipients: [],
      events: []
    };
  }

  function summarizeStats(raw) {
    const stats = raw && typeof raw === 'object' ? raw : defaultStats();
    const summary = stats.summary || defaultStats().summary;
    const recipients = Array.isArray(stats.recipients) ? stats.recipients : [];
    const events = Array.isArray(stats.events) ? stats.events : [];

    const uniqueIps = new Set();
    const uniqueLocations = new Set();
    events.forEach(function(item) {
      if (item.ip) uniqueIps.add(item.ip);
      if (item.location) uniqueLocations.add(item.location);
    });

    const directRecipientCount = recipients.filter(function(item) {
      return item.hasDirectOpen;
    }).length;
    const proxyOnlyRecipientCount = recipients.filter(function(item) {
      return !item.hasDirectOpen;
    }).length;
    const cautiousRecipientCount = recipients.filter(function(item) {
      return item.hasPrefetchLikeOpen;
    }).length;
    const repeatedRecipientCount = recipients.filter(function(item) {
      return Number(item.openCount || 0) > 1;
    }).length;

    return {
      openEvents: Number(summary.openEvents || 0),
      uniqueRecipients: Number(summary.uniqueRecipients || 0),
      directEvents: Number(summary.directEvents || 0),
      proxyEvents: Number(summary.proxyEvents || 0),
      prefetchLikeEvents: Number(summary.prefetchLikeEvents || 0),
      latestOpenedAtText: summary.latestOpenedAtText || '还没有请求',
      directRecipientCount: directRecipientCount,
      proxyOnlyRecipientCount: proxyOnlyRecipientCount,
      cautiousRecipientCount: cautiousRecipientCount,
      repeatedRecipientCount: repeatedRecipientCount,
      uniqueIpCount: uniqueIps.size,
      uniqueLocationCount: uniqueLocations.size,
      recipients: recipients,
      events: events,
      modeBreakdown: Array.isArray(stats.modeBreakdown) ? stats.modeBreakdown : []
    };
  }

  function interpretRecipient(row) {
    if (!row) return '还没有数据';
    if (row.hasDirectOpen && row.hasPrefetchLikeOpen) {
      return '先出现系统预取，后面又出现了更接近真人的直连打开。';
    }
    if (row.hasDirectOpen) {
      return '当前这组记录更接近真人真正打开邮件。';
    }
    if (row.hasPrefetchLikeOpen) {
      return '更像是隐私保护或安全扫描触发，请别直接当成人已阅读。';
    }
    return '只能确认远程图片被请求过一次，仍要结合上下文判断。';
  }

  function interpretEvent(event) {
    if (!event) return '';
    if (event.prefetchLike) return '更像预取或扫描';
    if (event.proxy) return '能看到打开，但位置和 IP 更像代理';
    return '更接近真人打开';
  }

  function getBatchScenarioSummary() {
    const modeCounts = {};
    let proxy = 0;
    let prefetchLike = 0;
    const recipients = new Set();

    BATCH_SCENARIO.forEach(function(step) {
      recipients.add(step.uid + '|' + step.recipient);
      modeCounts[step.mode] = (modeCounts[step.mode] || 0) + 1;
      const option = getModeOption(step.mode);
      if (step.mode !== 'direct') proxy += 1;
      if (option.key === 'apple-mpp' || option.key === 'security-gateway') {
        prefetchLike += 1;
      }
    });

    return {
      events: BATCH_SCENARIO.length,
      recipients: recipients.size,
      directEvents: modeCounts.direct || 0,
      proxyEvents: proxy,
      prefetchLikeEvents: prefetchLike,
      modeCounts: modeCounts
    };
  }

  const api = {
    MODE_OPTIONS: clone(MODE_OPTIONS),
    MAILBOX_PRESETS: clone(MAILBOX_PRESETS),
    EMAIL_PARAGRAPHS: clone(EMAIL_PARAGRAPHS),
    DEFAULT_FORM: clone(DEFAULT_FORM),
    BATCH_SCENARIO: clone(BATCH_SCENARIO),
    applyMailboxPreset: applyMailboxPreset,
    buildEmailHtml: buildEmailHtml,
    buildPixelId: buildPixelId,
    buildPixelUrl: buildPixelUrl,
    defaultStats: defaultStats,
    getBatchScenarioSummary: getBatchScenarioSummary,
    getMailboxPreset: getMailboxPreset,
    getModeOption: getModeOption,
    interpretEvent: interpretEvent,
    interpretRecipient: interpretRecipient,
    summarizeStats: summarizeStats
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  global.EmailTrackingPixelLab = api;
})(typeof window !== 'undefined' ? window : globalThis);

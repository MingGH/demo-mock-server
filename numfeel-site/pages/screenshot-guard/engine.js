/**
 * screenshot-guard/engine.js
 * 核心逻辑：前端"防截图"技术的分类、评分、攻防模拟、水印生成。
 * 纯函数，不依赖 DOM。
 */

/* ── 防截图技术清单 ──
 * category:
 *   watermark  水印溯源（拦不住动作，事后追责）
 *   blur       视觉遮蔽（失焦/切窗）
 *   input      输入拦截（PrtScn/右键/F12）
 *   detect     环境探测（DevTools/尺寸）
 *   render     渲染混淆（Canvas/iframe）
 *   drm        DRM 硬件级（HDCP/EME）
 */
var TECHNIQUES = [
  {
    id: 'dynamic-watermark',
    name: '动态水印覆盖',
    category: 'watermark',
    difficulty: 2,
    effectiveness: 60,
    desc: '在内容上斜向平铺半透明水印，含用户指纹和时间戳，截图后可溯源。',
    bypassNotes: '拦不住截图动作，但截出来的图带了作案者身份',
  },
  {
    id: 'blur-on-blur',
    name: '失焦即模糊',
    category: 'blur',
    difficulty: 2,
    effectiveness: 40,
    desc: '监听 visibilitychange / blur，切走窗口或 Alt+Tab 后立刻 filter:blur(20px)。',
    bypassNotes: '对 OS 全屏截图和外部相机完全无效',
  },
  {
    id: 'printscreen-listen',
    name: 'PrintScreen 键监听',
    category: 'input',
    difficulty: 3,
    effectiveness: 25,
    desc: '监听 keydown PrintScreen，尝试清空剪贴板并记录事件。',
    bypassNotes: '只在 Windows PrtScn 部分场景可触发，macOS/手机拍照完全失效',
  },
  {
    id: 'devtools-detect',
    name: 'DevTools 打开检测',
    category: 'detect',
    difficulty: 3,
    effectiveness: 35,
    desc: '通过 debugger 断点耗时 + innerWidth/outerWidth 差判定 F12 打开，触发后模糊。',
    bypassNotes: '真的想抓的人会用远程调试或无头浏览器',
  },
  {
    id: 'canvas-render',
    name: 'Canvas 渲染 + 频繁重绘',
    category: 'render',
    difficulty: 4,
    effectiveness: 50,
    desc: '把内容画到 canvas，用户肉眼可见但自动化难以稳定截取干净帧。',
    bypassNotes: '对人肉截图完全无效，只能拖慢自动化爬虫',
  },
  {
    id: 'iframe-csp',
    name: 'iframe 沙盒 + CSP frame-ancestors',
    category: 'render',
    difficulty: 3,
    effectiveness: 45,
    desc: '限制第三方页面嵌入，拦掉某些远程截图服务和嵌入式代理。',
    bypassNotes: '拦不住直接打开原站的浏览器截图',
  },
  {
    id: 'hdcp-drm',
    name: 'HDCP / EME DRM',
    category: 'drm',
    difficulty: 5,
    effectiveness: 90,
    desc: '仅视频有效：Netflix 靠这个把截屏和录屏变成黑屏。需要浏览器+GPU+显示器全链路支持。',
    bypassNotes: '真正专业级方案，但仅限视频；手机对屏拍照仍然可绕过',
  },
  {
    id: 'block-f12-menu',
    name: '右键 + F12 拦截',
    category: 'input',
    difficulty: 1,
    effectiveness: 10,
    desc: '拦截 contextmenu、F12、Ctrl+Shift+I 组合键。纯心理安慰。',
    bypassNotes: '菜单栏点开 DevTools 即可绕过',
  },
];

/**
 * 根据启用的技术数组评估防护强度。
 * @param {Array<Object>} enabledTechniques - 启用的技术对象数组
 * @returns {{level:number,label:string,color:string}} 评分（0-100）、语义化标签、色值
 */
function assessProtectionLevel(enabledTechniques) {
  if (!enabledTechniques || enabledTechniques.length === 0) {
    return { level: 0, label: '无防护', color: '#ef5350' };
  }
  var sum = 0;
  var max = 0;
  for (var i = 0; i < enabledTechniques.length; i++) {
    var eff = enabledTechniques[i].effectiveness;
    sum += eff;
    if (eff > max) max = eff;
  }
  // 以最高有效性为基线，其他项按 30% 权重叠加。保证加一项防护评分单调不降。
  var score = Math.min(100, Math.round(max + (sum - max) * 0.3));

  if (score < 15) return { level: score, label: '心理安慰', color: '#ef5350' };
  if (score < 35) return { level: score, label: '一般', color: '#ff9800' };
  if (score < 60) return { level: score, label: '较强', color: '#ffd700' };
  if (score < 85) return { level: score, label: '专业级', color: '#66bb6a' };
  return { level: score, label: '硬件级', color: '#42a5f5' };
}

/**
 * 模拟一次截图攻击对抗。
 * @param {Array<Object>} defenses - 启用的防护技术
 * @param {string} attackMethod - 攻击方式 id
 * @returns {{results:Array<Object>,verdict:string,score:number}}
 */
function simulateBattle(defenses, attackMethod) {
  var results = [];
  for (var i = 0; i < defenses.length; i++) {
    var d = defenses[i];
    var outcome = evaluatePair(d, attackMethod);
    results.push({
      id: d.id,
      name: d.name,
      outcome: outcome.outcome, // 'blocked' | 'traceable' | 'useless'
      detail: outcome.detail,
    });
  }
  var verdict = summarize(results, attackMethod);
  var score = 0;
  for (var j = 0; j < results.length; j++) {
    if (results[j].outcome === 'blocked') score += 2;
    else if (results[j].outcome === 'traceable') score += 1;
  }
  return { results: results, verdict: verdict, score: score };
}

/**
 * 对单个 (防护, 攻击方式) 组合给出结论。
 * @param {Object} defense - 防护技术
 * @param {string} attack - 攻击方式 id
 * @returns {{outcome:string,detail:string}}
 */
function evaluatePair(defense, attack) {
  // 手机对屏拍照：绕过一切纯前端技术，只有水印能溯源
  if (attack === 'phone-camera') {
    if (defense.category === 'watermark') return { outcome: 'traceable', detail: '水印被一起拍进照片，事后可溯源' };
    return { outcome: 'useless', detail: '外部相机不经过浏览器，纯前端毫无办法' };
  }

  // OS 全屏截图键（PrtScn / ⌘⇧4）
  if (attack === 'os-screenshot') {
    if (defense.id === 'printscreen-listen') return { outcome: 'blocked', detail: 'Windows PrtScn 部分场景能被拦并清空剪贴板' };
    if (defense.category === 'watermark') return { outcome: 'traceable', detail: '截图包含水印，可追溯用户' };
    if (defense.category === 'blur') return { outcome: 'useless', detail: 'OS 截图键不触发窗口失焦事件' };
    if (defense.category === 'detect') return { outcome: 'useless', detail: 'OS 截图不需要开 DevTools' };
    if (defense.category === 'render') return { outcome: 'useless', detail: 'Canvas 照样被像素级截取' };
    if (defense.category === 'drm') return { outcome: 'blocked', detail: '视频层被 HDCP 变黑屏' };
    return { outcome: 'useless', detail: '按键拦截绕不过 OS' };
  }

  // OS 级录屏 QuickTime / OBS
  if (attack === 'os-recording') {
    if (defense.id === 'hdcp-drm') return { outcome: 'blocked', detail: 'HDCP 让 OBS 录到的视频区域全黑' };
    if (defense.category === 'watermark') return { outcome: 'traceable', detail: '录像同样带水印' };
    if (defense.category === 'blur') return { outcome: 'useless', detail: '录屏时窗口始终有焦点，不触发失焦' };
    return { outcome: 'useless', detail: '录屏软件在浏览器进程之外' };
  }

  // DevTools 手动保存 HTML/Canvas
  if (attack === 'devtools-save') {
    if (defense.id === 'devtools-detect') return { outcome: 'blocked', detail: '打开 DevTools 瞬间触发模糊' };
    if (defense.id === 'block-f12-menu') return { outcome: 'useless', detail: '菜单栏仍可打开 DevTools' };
    if (defense.category === 'render') return { outcome: 'traceable', detail: 'Canvas 数据能被 dump 但反查难度较高' };
    if (defense.category === 'watermark') return { outcome: 'traceable', detail: 'DOM 里也带水印节点' };
    if (defense.category === 'blur') return { outcome: 'useless', detail: '手动保存不触发失焦' };
    return { outcome: 'useless', detail: '开发者工具面前基本失效' };
  }

  // 自动化爬虫 Puppeteer + page.screenshot
  if (attack === 'headless-crawler') {
    if (defense.id === 'devtools-detect') return { outcome: 'blocked', detail: '尺寸差 + debugger 检测能识别部分无头' };
    if (defense.id === 'canvas-render') return { outcome: 'blocked', detail: '频繁重绘让爬虫难截干净帧' };
    if (defense.id === 'iframe-csp') return { outcome: 'blocked', detail: 'frame-ancestors 直接拦掉嵌入型爬虫' };
    if (defense.category === 'watermark') return { outcome: 'traceable', detail: '爬到的截图带水印' };
    if (defense.id === 'hdcp-drm') return { outcome: 'blocked', detail: '无头浏览器无法通过 HDCP 链路' };
    return { outcome: 'useless', detail: '普通拦键对无头浏览器无效' };
  }

  return { outcome: 'useless', detail: '未知攻击方式' };
}

/**
 * 给一次对抗结果生成一句话结论。
 * @param {Array<Object>} results
 * @param {string} attack
 * @returns {string}
 */
function summarize(results, attack) {
  if (attack === 'phone-camera') {
    return '手机对屏拍照绕过所有前端防护，只有水印能事后溯源。';
  }
  if (attack === 'os-recording') {
    return 'OS 级录屏在浏览器进程之外，只有 HDCP DRM 能在视频层拦住，其他技术全部无效。';
  }
  var blocked = 0, traceable = 0;
  for (var i = 0; i < results.length; i++) {
    if (results[i].outcome === 'blocked') blocked++;
    else if (results[i].outcome === 'traceable') traceable++;
  }
  if (blocked === 0 && traceable === 0) return '当前防护对该攻击方式全部无效，建议至少启用水印用于溯源。';
  if (blocked === 0) return '拦不住这次截图，但水印能留下证据，事后可追责。';
  return '有 ' + blocked + ' 项防护成功拦截，另有 ' + traceable + ' 项能溯源。';
}

/**
 * 生成 8 位水印 token（十六进制），基于 UA 和 seed。
 * 相同输入总产生相同输出（纯函数）。
 * @param {string} ua - navigator.userAgent 或任意字符串
 * @param {number|string} seed - 时间戳或屏幕尺寸等
 * @returns {string} 8 位十六进制字符串
 */
function generateWatermarkToken(ua, seed) {
  var str = String(ua) + '|' + String(seed);
  var h = 0x811c9dc5; // FNV-1a 32-bit
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  var hex = h.toString(16);
  while (hex.length < 8) hex = '0' + hex;
  return hex.slice(0, 8);
}

/* ── 真实产品案例 ── */
var REAL_WORLD_CASES = [
  {
    name: 'Netflix',
    tags: ['HDCP', 'EME DRM'],
    note: '视频链路走 HDCP，截屏和 OBS 录屏都是黑屏——前端防截图的天花板。',
  },
  {
    name: '腾讯会议',
    tags: ['SetWindowDisplayAffinity', '原生客户端'],
    note: 'Windows 桌面版调用 OS API 让窗口在截图中变黑，浏览器版做不到。',
  },
  {
    name: '支付宝支付页',
    tags: ['水印', '失焦模糊'],
    note: '订单页叠满半透明账户水印，切窗立刻模糊，兼顾溯源和视觉遮蔽。',
  },
  {
    name: '微信读书',
    tags: ['水印(用户ID)'],
    note: '每页水印带真实用户 ID，泄露即锁定人；不拦截图，专治转发。',
  },
  {
    name: '网易云音乐 Web',
    tags: ['无防护'],
    note: '音频截屏没意义，直接不做；说明防护要按场景选，不是必备。',
  },
  {
    name: '银行网银',
    tags: ['水印溯源'],
    note: '交易凭证叠水印为主，很少硬拦，因为拦了会影响客服协作。',
  },
  {
    name: 'Zoom',
    tags: ['原生客户端 API'],
    note: '桌面客户端同样调 OS 级窗口保护，Web 版仅能提示。',
  },
  {
    name: 'Snapchat',
    tags: ['系统 API 检测'],
    note: 'Android 能检测截图并通知发送者，iOS 只能提示——OS 权限决定上限。',
  },
];

/* ── 交互彩蛋提示语 ── */
var RANDOM_TIPS = [
  'Netflix 花了 20 亿美元建 DRM 生态，你这个 filter:blur 只花了 5 分钟。',
  '前端防截图的本质是提高恶意用户的成本，不是让他做不到。',
  '手机对着屏幕拍照，你写多少 JS 都拦不住——这就是物理层。',
  '水印是所有前端防护里 ROI 最高的：不影响体验，能溯源到人。',
  'PrintScreen 监听只在 Windows 部分场景有效，macOS 完全无感。',
  '打开浏览器菜单栏 → 更多工具 → 开发者工具，绕过所有 F12 拦截。',
  'HDCP 是硬件级方案，但它只保视频层——文字截图照样能截。',
  'iOS 系统截图 SDK 不给应用监听权限，你只能"提示用户不要这么做"。',
  '每次你按 PrtScn 都能被检测到，是浏览器早年没做好的隐私漏洞。',
  '真正的机密内容不该出现在浏览器里，出现了就默认它会泄露。',
];

/**
 * 从 RANDOM_TIPS 中挑一条。
 * @param {number} [random] - 可选注入的 0~1 随机数，用于测试确定性
 * @returns {string}
 */
function pickRandomTip(random) {
  var r = typeof random === 'number' ? random : Math.random();
  var idx = Math.floor(r * RANDOM_TIPS.length);
  if (idx < 0) idx = 0;
  if (idx >= RANDOM_TIPS.length) idx = RANDOM_TIPS.length - 1;
  return RANDOM_TIPS[idx];
}

/* ── 导出 ── */
if (typeof window !== 'undefined') {
  window.ScreenshotGuardEngine = {
    TECHNIQUES: TECHNIQUES,
    assessProtectionLevel: assessProtectionLevel,
    simulateBattle: simulateBattle,
    generateWatermarkToken: generateWatermarkToken,
    REAL_WORLD_CASES: REAL_WORLD_CASES,
    RANDOM_TIPS: RANDOM_TIPS,
    pickRandomTip: pickRandomTip,
  };
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TECHNIQUES: TECHNIQUES,
    assessProtectionLevel: assessProtectionLevel,
    simulateBattle: simulateBattle,
    generateWatermarkToken: generateWatermarkToken,
    REAL_WORLD_CASES: REAL_WORLD_CASES,
    RANDOM_TIPS: RANDOM_TIPS,
    pickRandomTip: pickRandomTip,
  };
}

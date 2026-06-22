/**
 * copy-protection/engine.js
 * 核心逻辑：各种防复制技术的实现与检测
 */

/* ── 防复制技术列表 ── */
const TECHNIQUES = [
  {
    id: 'css-user-select',
    name: 'CSS user-select: none',
    category: 'css',
    difficulty: 1,
    desc: '通过 CSS 属性禁止文本选中',
    code: 'user-select: none;\n-webkit-user-select: none;',
    bypass: '打开 DevTools → 删除该 CSS 属性，或用 JS 执行 document.querySelector(".target").style.userSelect = "text"',
    effectiveness: 15,
  },
  {
    id: 'js-copy-event',
    name: '拦截 copy 事件',
    category: 'js',
    difficulty: 2,
    desc: '监听 copy 事件并调用 preventDefault() 阻止复制',
    code: 'document.addEventListener("copy", e => {\n  e.preventDefault();\n});',
    bypass: '在 DevTools Console 执行: document.addEventListener("copy", e => e.stopImmediatePropagation(), true)',
    effectiveness: 25,
  },
  {
    id: 'js-contextmenu',
    name: '禁用右键菜单',
    category: 'js',
    difficulty: 1,
    desc: '拦截 contextmenu 事件，阻止右键粘贴/复制菜单',
    code: 'document.addEventListener("contextmenu",\n  e => e.preventDefault());',
    bypass: '浏览器设置中关闭「允许网页禁用右键」，或在地址栏输入 javascript:void(document.oncontextmenu=null)',
    effectiveness: 10,
  },
  {
    id: 'css-overlay',
    name: '透明遮罩层',
    category: 'css',
    difficulty: 2,
    desc: '在文字上方覆盖一个 pointer-events: all 的透明 div，用户选不中下面的文字',
    code: '.overlay {\n  position: absolute;\n  top: 0; left: 0;\n  width: 100%; height: 100%;\n  z-index: 999;\n}',
    bypass: 'DevTools 中删除遮罩元素，或设置 pointer-events: none',
    effectiveness: 20,
  },
  {
    id: 'js-clipboard-replace',
    name: '剪贴板内容替换',
    category: 'js',
    difficulty: 3,
    desc: '允许复制，但把剪贴板内容替换为版权声明或乱码',
    code: 'document.addEventListener("copy", e => {\n  e.preventDefault();\n  const text = window.getSelection().toString();\n  e.clipboardData.setData("text/plain",\n    text + "\\n\\n来源：xxx 禁止转载");\n});',
    bypass: '用 DevTools 的「选中文本 → Store as global variable」直接拿到原文',
    effectiveness: 35,
  },
  {
    id: 'canvas-render',
    name: 'Canvas 渲染文字',
    category: 'advanced',
    difficulty: 4,
    desc: '将文字绘制到 Canvas 上，用户看到的是图片而非 DOM 文本节点',
    code: 'const ctx = canvas.getContext("2d");\nctx.font = "16px sans-serif";\nctx.fillText("机密内容", 10, 30);',
    bypass: 'OCR 识别（如 Tesseract.js），或直接抓 Canvas 调用参数',
    effectiveness: 60,
  },
  {
    id: 'font-obfuscation',
    name: '字体映射混淆',
    category: 'advanced',
    difficulty: 5,
    desc: '使用自定义字体，将字符编码打乱。页面显示正常文字，复制出来是乱码',
    code: '@font-face {\n  font-family: "Obfuscated";\n  src: url("shuffled.woff2");\n}\n/* "hello" 实际编码为 "xk#2m" */',
    bypass: '分析字体文件的 cmap 表反推映射关系，或用 OCR',
    effectiveness: 70,
  },
  {
    id: 'svg-text',
    name: 'SVG 文字渲染',
    category: 'advanced',
    difficulty: 3,
    desc: '用 SVG <text> 元素显示内容，部分浏览器不支持直接选中 SVG 内文字',
    code: '<svg><text x="10" y="30"\n  font-size="16">机密内容</text></svg>',
    bypass: '查看 SVG 源码直接读取 <text> 内容',
    effectiveness: 30,
  },
];

/* ── 防护等级评估 ── */
function assessProtectionLevel(enabledTechniques) {
  if (enabledTechniques.length === 0) return { level: 0, label: '无防护', color: '#ef5350' };
  const avgEff = enabledTechniques.reduce((s, t) => s + t.effectiveness, 0) / enabledTechniques.length;
  const maxEff = Math.max(...enabledTechniques.map(t => t.effectiveness));
  const score = Math.min(100, Math.round(avgEff * 0.4 + maxEff * 0.6));

  if (score < 20) return { level: score, label: '形同虚设', color: '#ef5350' };
  if (score < 40) return { level: score, label: '防君子', color: '#ff9800' };
  if (score < 60) return { level: score, label: '中等防护', color: '#ffd700' };
  if (score < 80) return { level: score, label: '较强防护', color: '#66bb6a' };
  return { level: score, label: '专业级', color: '#42a5f5' };
}

/* ── 绕过难度计算 ── */
function bypassDifficulty(technique) {
  const labels = ['', '小白 10 秒', '初级 1 分钟', '中级 5 分钟', '高级 30 分钟', '专家级 需要工具'];
  return labels[technique.difficulty] || '未知';
}

/* ── 模拟攻防对抗 ── */
function simulateBattle(defenses, attackerLevel) {
  // attackerLevel: 1=小白, 2=前端初学者, 3=前端开发者, 4=安全研究员, 5=专业爬虫
  const results = [];
  for (const def of defenses) {
    const canBypass = attackerLevel >= def.difficulty;
    const timeSeconds = canBypass
      ? Math.round(Math.pow(2, def.difficulty) * (6 - attackerLevel) * 3)
      : Infinity;
    results.push({
      technique: def.name,
      bypassed: canBypass,
      timeSeconds,
      method: canBypass ? def.bypass : '无法绕过',
    });
  }
  const allBypassed = results.every(r => r.bypassed);
  const totalTime = results.reduce((s, r) => s + (r.bypassed ? r.timeSeconds : 0), 0);
  return { results, allBypassed, totalTime };
}

/* ── 字体混淆：字符旋转映射 ── */

/**
 * 构建字符替换映射表。
 * 将文本中出现的不重复字符按 Unicode 范围分组（CJK / ASCII），
 * 在同一组内做旋转替换：char[i] → char[(i+1) % n]。
 * 同组字符宽度相近，保证替换后布局不错位。
 * @param {string} text - 原始文本
 * @returns {Object.<string,string>} 字符 → 替换字符的映射
 */
function buildObfuscationMap(text) {
  var cjkChars = [];
  var asciiChars = [];
  var seen = {};
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (seen[ch]) continue;
    seen[ch] = true;
    var code = text.charCodeAt(i);
    if (code >= 0x4E00 && code <= 0x9FFF) {
      cjkChars.push(ch);
    } else if (code >= 0x20 && code <= 0x7E) {
      asciiChars.push(ch);
    }
  }
  var map = {};
  for (var j = 0; j < cjkChars.length; j++) {
    map[cjkChars[j]] = cjkChars[(j + 1) % cjkChars.length];
  }
  for (var k = 0; k < asciiChars.length; k++) {
    map[asciiChars[k]] = asciiChars[(k + 1) % asciiChars.length];
  }
  return map;
}

/**
 * 根据映射表对文本进行字符替换。
 * @param {string} text - 原始文本
 * @param {Object.<string,string>} map - buildObfuscationMap 返回的映射
 * @returns {string} 替换后的文本
 */
function obfuscateText(text, map) {
  var result = '';
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    result += map[ch] || ch;
  }
  return result;
}

/* ── 真实网站防复制方案统计（基于公开信息） ── */
const REAL_WORLD_CASES = [
  { site: '知乎', techniques: ['css-user-select', 'js-clipboard-replace'], note: '复制内容自动追加来源链接和作者信息' },
  { site: '微信公众号', techniques: ['js-contextmenu', 'js-clipboard-replace'], note: '长按复制追加版权声明，部分文章禁止转载' },
  { site: 'CSDN', techniques: ['js-copy-event', 'js-clipboard-replace'], note: '复制代码强制追加来源链接，登录后才能复制' },
  { site: '起点中文网', techniques: ['css-user-select', 'js-copy-event', 'font-obfuscation'], note: '付费章节用字体混淆，复制得到乱码' },
  { site: '百度文库', techniques: ['css-user-select', 'css-overlay', 'canvas-render'], note: '文档渲染为 Canvas，需付费才能复制' },
  { site: '中国知网', techniques: ['js-copy-event', 'css-overlay'], note: '论文阅读页禁止选中，需下载 PDF' },
  { site: 'Medium（付费文章）', techniques: ['js-copy-event', 'css-user-select'], note: '付费墙文章限制复制' },
  { site: '纽约时报', techniques: ['js-clipboard-replace'], note: '复制超过一定字数自动追加来源' },
];

/* ── 导出 ── */
if (typeof window !== 'undefined') {
  window.CopyProtectionEngine = {
    TECHNIQUES,
    assessProtectionLevel,
    bypassDifficulty,
    simulateBattle,
    REAL_WORLD_CASES,
    buildObfuscationMap,
    obfuscateText,
  };
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TECHNIQUES,
    assessProtectionLevel,
    bypassDifficulty,
    simulateBattle,
    REAL_WORLD_CASES,
    buildObfuscationMap,
    obfuscateText,
  };
}

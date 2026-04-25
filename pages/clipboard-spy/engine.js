/**
 * clipboard-spy/engine.js
 * 核心逻辑：敏感信息检测、零宽字符编解码、模拟数据生成
 */

/* ── 敏感信息正则 ── */
const SENSITIVE_PATTERNS = [
  { type: '手机号',    regex: /1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}/g },
  { type: '身份证',    regex: /\d{17}[\dXx]/g },
  { type: '银行卡',    regex: /\d{4}[\s]?\d{4}[\s]?\d{4}[\s]?\d{3,4}[\s]?\d{0,3}/g },
  { type: '邮箱',      regex: /[\w.-]+@[\w.-]+\.\w{2,}/g },
  { type: '密码',      regex: /(?:密码|password|pwd)[\s:：]*\S+/gi },
  { type: 'IP地址',    regex: /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g },
  { type: '网址',      regex: /https?:\/\/[^\s<]+/g },
  { type: '地址',      regex: /[\u4e00-\u9fa5]{2,}(?:省|市|区|县|路|街|号|栋|楼|室)/g },
];

function detectSensitive(text) {
  const hits = [];
  for (const p of SENSITIVE_PATTERNS) {
    const matches = text.match(p.regex);
    if (matches) {
      for (const m of matches) {
        hits.push({ type: p.type, value: m });
      }
    }
  }
  return hits;
}

/* ── 零宽字符编解码 ── */
const ZWSP_CHARS = ['\u200B', '\u200C', '\u200D', '\uFEFF']; // 4 种 → 2 bit 每字符

function encodeZwsp(id) {
  // 把数字 ID 转为二进制，每 2 bit 映射一个零宽字符
  const bin = id.toString(2).padStart(Math.ceil(id.toString(2).length / 2) * 2, '0');
  let result = '';
  for (let i = 0; i < bin.length; i += 2) {
    const idx = parseInt(bin.substr(i, 2), 2);
    result += ZWSP_CHARS[idx];
  }
  return result;
}

function decodeZwsp(str) {
  let bin = '';
  for (const ch of str) {
    const idx = ZWSP_CHARS.indexOf(ch);
    if (idx === -1) continue;
    bin += idx.toString(2).padStart(2, '0');
  }
  return bin ? parseInt(bin, 2) : null;
}

function countZwsp(str) {
  let count = 0;
  for (const ch of str) {
    if (ZWSP_CHARS.includes(ch)) count++;
  }
  return count;
}

// 在文本开头插入零宽字符编码的 ID（只插入一次，保证解码一致性）
function injectZwsp(text, id) {
  const encoded = encodeZwsp(id);
  // 在第 3 个可见字符后插入一次
  const chars = [...text];
  const insertPos = Math.min(3, chars.length);
  chars.splice(insertPos, 0, encoded);
  return chars.join('');
}

/* ── 模拟数据：一天的剪贴板记录 ── */
const SIMULATED_CLIPBOARD_ACTIONS = [
  { time: '07:12', app: '闹钟', content: '关闭闹钟', category: '日常', sensitive: false },
  { time: '07:35', app: '微信', content: '收到验证码：482916', category: '验证码', sensitive: true },
  { time: '08:02', app: '地图', content: '北京市海淀区中关村大街1号', category: '地址', sensitive: true },
  { time: '08:15', app: '备忘录', content: 'WiFi密码: Coffee@2026', category: '密码', sensitive: true },
  { time: '09:10', app: '邮件', content: 'zhangsan@company.com', category: '邮箱', sensitive: true },
  { time: '09:45', app: '浏览器', content: 'https://bank.example.com/login', category: '网址', sensitive: true },
  { time: '10:20', app: '文档', content: '项目预算：Q3 营收目标 2400 万', category: '工作机密', sensitive: true },
  { time: '10:55', app: '微信', content: '我的银行卡号 6222 0200 0012 3456 789', category: '银行卡', sensitive: true },
  { time: '11:30', app: '外卖App', content: '15号楼2单元1803', category: '地址', sensitive: true },
  { time: '12:15', app: '浏览器', content: '如何治疗慢性胃炎', category: '健康', sensitive: true },
  { time: '13:00', app: '淘宝', content: '¥dKs8cXZqR2t¥', category: '淘口令', sensitive: false },
  { time: '13:40', app: '备忘录', content: '身份证号 110105199003071234', category: '身份证', sensitive: true },
  { time: '14:20', app: '微信', content: '今晚7点老地方见，别迟到', category: '社交', sensitive: false },
  { time: '15:05', app: '浏览器', content: '租房 海淀区 两居室 5000以内', category: '搜索', sensitive: true },
  { time: '15:50', app: '招聘App', content: '期望薪资 25K-35K', category: '求职', sensitive: true },
  { time: '16:30', app: '密码管理器', content: 'aX#9kL$mP2@wQ', category: '密码', sensitive: true },
  { time: '17:15', app: '微信', content: '138-0013-8000', category: '手机号', sensitive: true },
  { time: '18:00', app: '浏览器', content: '北京协和医院 挂号 消化内科', category: '健康', sensitive: true },
  { time: '19:30', app: '视频App', content: '分享链接 https://v.example.com/s/abc123', category: '网址', sensitive: false },
  { time: '20:45', app: '备忘录', content: '车牌号 京A·12345', category: '车辆', sensitive: true },
  { time: '21:20', app: '微信', content: '明天面试地址：望京SOHO T1 12层', category: '地址', sensitive: true },
  { time: '22:00', app: '浏览器', content: '焦虑症自测量表', category: '健康', sensitive: true },
];

// 从模拟数据中提取画像
function buildProfile(actions) {
  const profile = {};
  const categoryMap = {
    '手机号': { icon: 'ti-phone', label: '手机号' },
    '邮箱': { icon: 'ti-mail', label: '邮箱' },
    '地址': { icon: 'ti-map-pin', label: '常驻地区' },
    '银行卡': { icon: 'ti-credit-card', label: '银行卡' },
    '身份证': { icon: 'ti-id', label: '身份证' },
    '密码': { icon: 'ti-lock', label: '密码' },
    '健康': { icon: 'ti-heartbeat', label: '健康关注' },
    '工作机密': { icon: 'ti-briefcase', label: '工作信息' },
    '求职': { icon: 'ti-search', label: '求职状态' },
    '搜索': { icon: 'ti-home', label: '生活需求' },
    '车辆': { icon: 'ti-car', label: '车辆信息' },
    '验证码': { icon: 'ti-shield', label: '验证码' },
  };

  for (const a of actions) {
    if (a.sensitive && categoryMap[a.category]) {
      if (!profile[a.category]) {
        profile[a.category] = {
          ...categoryMap[a.category],
          values: [],
        };
      }
      profile[a.category].values.push(a.content);
    }
  }
  return profile;
}

/* ── 导出 ── */
window.ClipboardEngine = {
  detectSensitive,
  encodeZwsp,
  decodeZwsp,
  countZwsp,
  injectZwsp,
  ZWSP_CHARS,
  SIMULATED_CLIPBOARD_ACTIONS,
  buildProfile,
};

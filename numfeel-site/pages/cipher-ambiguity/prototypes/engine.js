/**
 * cipher-ambiguity 共享演示数据与纯函数
 * 主题：同一段密文，在不同钥匙下解出不同明文。
 * 全部为演示用假数据，不做真实加密 —— 样式与交互原型阶段。
 * 测试：node engine.test.js
 */

/** 演示密文（十六进制展示） */
const CIPHERTEXT = '9F 3A C1 7E 55';

/** V1 · 双面密文：两把实体钥匙 + 一把隐藏的万能钥匙 */
const DUAL_KEYS = {
  red:  { name: '红钥匙', tag: '真钥匙',   text: '行动取消，原地待命。' },
  blue: { name: '蓝钥匙', tag: '伪装钥匙', text: '妈：周末回家吃饭吗？' },
  gold: { name: '金钥匙', tag: '万能钥匙', text: '任何明文，都有一把钥匙等着它。' }
};

/**
 * 用指定钥匙解密演示密文
 * @param {string} keyId - 'red' | 'blue' | 'gold'
 * @returns {{ok: boolean, name: string, tag: string, text: string}}
 */
function decryptByKey(keyId) {
  const key = DUAL_KEYS[keyId];
  if (!key) return { ok: false, name: '未知钥匙', tag: '', text: '' };
  return { ok: true, name: key.name, tag: key.tag, text: key.text };
}

/** V2 · 密钥转盘：16 档钥匙，只对应 8 种明文 */
const OTP_KEY_COUNT = 16;
const OTP_PLAINTEXTS = [
  '明晚八点，老地方见。',
  '股票清仓，全部买金。',
  '生日快乐，蛋糕在冰箱。',
  '计划有变，取消行动。',
  '天冷加衣，别再熬夜。',
  '会议改到周四下午三点。',
  '论文过了，请客吃饭！',
  '今晚火锅还是烧烤？'
];

/**
 * 把密钥转盘旋到第 keyIndex 档
 * @param {number} keyIndex - 任意整数，自动折回 0..15
 * @returns {{keyIndex: number, text: string}}
 */
function decryptOtp(keyIndex) {
  const i = ((Math.round(keyIndex) % OTP_KEY_COUNT) + OTP_KEY_COUNT) % OTP_KEY_COUNT;
  return { keyIndex: i, text: OTP_PLAINTEXTS[i % OTP_PLAINTEXTS.length] };
}

/**
 * 统计一批解密结果中不同明文的数量
 * @param {{text: string}[]} results
 * @returns {number}
 */
function countDistinctTexts(results) {
  return new Set(results.map((r) => r.text)).size;
}

/** V3 · 平方根谜宫：9 格中藏着 4 个合法候选明文 */
const RABIN_GRID = [
  { id: 0, hit: true,  text: '守住桥头' },
  { id: 1, hit: false, text: '' },
  { id: 2, hit: true,  text: '雨夜撤离' },
  { id: 3, hit: false, text: '' },
  { id: 4, hit: false, text: '' },
  { id: 5, hit: true,  text: '今晚加餐' },
  { id: 6, hit: false, text: '' },
  { id: 7, hit: true,  text: '取消行动' },
  { id: 8, hit: false, text: '' }
];

/**
 * 点击九宫格中的一格
 * @param {number} id - 0..8
 * @returns {{ok: boolean, hit: boolean, text: string}}
 */
function rabinPick(id) {
  const cell = RABIN_GRID.find((c) => c.id === id);
  if (!cell) return { ok: false, hit: false, text: '' };
  return { ok: true, hit: cell.hit, text: cell.text };
}

/**
 * 四个候选是否已全部找到
 * @param {number[]} pickedIds
 * @returns {boolean}
 */
function rabinAllFound(pickedIds) {
  const set = new Set(pickedIds);
  return RABIN_GRID.filter((c) => c.hit).every((c) => set.has(c.id));
}

/** V4 · 审讯室：三个分支选项（两轮共用） */
const INTERROGATION = {
  real: { title: '交出真钥匙', safe: 1, text: '「行动取消，原地待命。」审讯官盯着你看了很久——这不是情报机关的口吻。空气突然安静。' },
  fake: { title: '交出假钥匙', safe: 3, text: '「妈：周末回家吃饭吗？」审讯官冷笑一声，挥手放人。一句家常话救了你一命。' },
  deny: { title: '交出坏钥匙', safe: 2, text: '钥匙插进锁孔，转出一串乱码。「设备坏了？」——没人能证明一把坏钥匙里藏着什么。' }
};

/**
 * 审讯室分支选择
 * @param {string} id - 'real' | 'fake' | 'deny'
 * @returns {{ok: boolean, title: string, text: string, safe: number}}
 */
function interrogationChoice(id) {
  const b = INTERROGATION[id];
  if (!b) return { ok: false, title: '', text: '', safe: 0 };
  return { ok: true, title: b.title, text: b.text, safe: b.safe };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CIPHERTEXT, DUAL_KEYS, decryptByKey,
    OTP_KEY_COUNT, OTP_PLAINTEXTS, decryptOtp, countDistinctTexts,
    RABIN_GRID, rabinPick, rabinAllFound,
    INTERROGATION, interrogationChoice
  };
}

/**
 * 钓鱼域名识别挑战 - 单元测试
 * 运行: node pages/phishing-domain.test.js
 */

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log('  ✅ ' + msg); }
  else { failed++; console.log('  ❌ ' + msg); }
}

// ===== 同形字检测逻辑 =====
const HOMOGLYPHS = {
  '\u0430': { latin: 'a', name: '西里尔 а', code: 'U+0430' },
  '\u0435': { latin: 'e', name: '西里尔 е', code: 'U+0435' },
  '\u043E': { latin: 'o', name: '西里尔 о', code: 'U+043E' },
  '\u0440': { latin: 'p', name: '西里尔 р', code: 'U+0440' },
  '\u0441': { latin: 'c', name: '西里尔 с', code: 'U+0441' },
  '\u0445': { latin: 'x', name: '西里尔 х', code: 'U+0445' },
  '\u0443': { latin: 'y', name: '西里尔 у', code: 'U+0443' },
  '\u0456': { latin: 'i', name: '乌克兰 і', code: 'U+0456' },
  '\u0455': { latin: 's', name: '马其顿 ѕ', code: 'U+0455' },
  '\u0432': { latin: 'b', name: '西里尔 в', code: 'U+0432' },
  '\u0251': { latin: 'a', name: 'IPA ɑ', code: 'U+0251' }
};

function detectHomoglyphs(domain) {
  const found = [];
  for (let i = 0; i < domain.length; i++) {
    if (HOMOGLYPHS[domain[i]]) {
      found.push({ pos: i, char: domain[i], ...HOMOGLYPHS[domain[i]] });
    }
  }
  return found;
}

function detectSubdomainSpoof(domain) {
  const knownBrands = ['google', 'apple', 'amazon', 'microsoft', 'facebook', 'paypal', 'netflix', 'github', 'twitter', 'taobao', 'bilibili'];
  const parts = domain.split('.');
  if (parts.length < 3) return null;
  const mainDomain = parts.slice(-2).join('.');
  const subParts = parts.slice(0, -2).join('.');
  for (const brand of knownBrands) {
    if (subParts.includes(brand) && !mainDomain.includes(brand)) {
      return { brand, mainDomain };
    }
  }
  return null;
}

function detectDigitSubstitution(domain) {
  const digitSubs = { '0': 'o', '1': 'l/i', '3': 'e', '5': 's', '8': 'b' };
  const parts = domain.split('.');
  const base = parts.slice(0, -1).join('.');
  const found = [];
  for (const [digit, letter] of Object.entries(digitSubs)) {
    if (base.includes(digit)) found.push(digit + ' → ' + letter);
  }
  return found;
}

// ===== 题库验证 =====
const QUESTIONS = [
  { options: [{ domain: 'p\u0430ypal.com', real: false }, { domain: 'paypal.com', real: true }, { domain: 'payp\u0430l.com', real: false }] },
  { options: [{ domain: 'apple.com', real: true }, { domain: 'appIe.com', real: false }, { domain: 'app1e.com', real: false }] },
  { options: [{ domain: 'gooogle.com', real: false }, { domain: 'googel.com', real: false }, { domain: 'google.com', real: true }] },
  { options: [{ domain: 'apple.com.account-verify.net', real: false }, { domain: 'support.apple.com', real: true }, { domain: 'apple-id.support.com', real: false }] },
];

// ===== 测试 =====
console.log('\n🎯 钓鱼域名识别挑战 - 单元测试\n');

console.log('--- 同形字检测 ---');
assert(detectHomoglyphs('paypal.com').length === 0, '正常域名无同形字');
assert(detectHomoglyphs('p\u0430ypal.com').length === 1, '检测到西里尔 а');
assert(detectHomoglyphs('p\u0430yp\u0430l.com').length === 2, '检测到两个西里尔 а');
assert(detectHomoglyphs('micr\u043Esoft.com').length === 1, '检测到西里尔 о');
assert(detectHomoglyphs('fac\u0435book.com').length === 1, '检测到西里尔 е');
assert(detectHomoglyphs('micro\u0455oft.com').length === 1, '检测到马其顿 ѕ');

console.log('\n--- 子域名伪装检测 ---');
assert(detectSubdomainSpoof('support.apple.com') === null, '正常子域名不报警');
assert(detectSubdomainSpoof('apple.com.verify.net') !== null, '检测到 apple 子域名伪装');
assert(detectSubdomainSpoof('apple.com.verify.net').mainDomain === 'verify.net', '正确识别主域名');
assert(detectSubdomainSpoof('github.com.login-auth.io') !== null, '检测到 github 子域名伪装');
assert(detectSubdomainSpoof('google.com') === null, '二级域名不误报');

console.log('\n--- 数字替换检测 ---');
assert(detectDigitSubstitution('paypal.com').length === 0, '正常域名无数字替换');
assert(detectDigitSubstitution('paypa1.com').length === 1, '检测到 1 替换 l');
assert(detectDigitSubstitution('g00gle.com').length === 1, '检测到 0 替换 o');
assert(detectDigitSubstitution('app13.com').length === 2, '检测到多个数字替换');

console.log('\n--- 题库完整性 ---');
QUESTIONS.forEach((q, i) => {
  const realCount = q.options.filter(o => o.real).length;
  assert(realCount === 1, '第 ' + (i + 1) + ' 题有且仅有一个正确答案');
});
assert(QUESTIONS.length >= 4, '题库至少有 4 道题');

console.log('\n--- 同形字映射表 ---');
assert(Object.keys(HOMOGLYPHS).length >= 10, '同形字表至少 10 个条目');
for (const [char, info] of Object.entries(HOMOGLYPHS)) {
  assert(char.charCodeAt(0) > 127, info.name + ' 是非 ASCII 字符');
  assert(info.latin.charCodeAt(0) <= 127, info.name + ' 对应的拉丁字母是 ASCII');
}

// ===== 结果 =====
console.log('\n=============================');
console.log('通过: ' + passed + '  失败: ' + failed);
console.log('=============================\n');
process.exit(failed > 0 ? 1 : 0);

/**
 * 二维码劫持实验室 — 核心算法单元测试
 * 运行方式：node pages/qr-hijack/engine.test.js
 */
const { CHALLENGE_QUESTIONS, PAYLOAD_TYPES, analyzeUrl, levenshtein, shuffleArray } = require('./engine.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log('  ✓ ' + msg);
  } else {
    failed++;
    console.error('  ✗ ' + msg);
  }
}

function assertEq(actual, expected, msg) {
  assert(actual === expected, msg + ` (got ${actual}, expected ${expected})`);
}

// ── Levenshtein 距离测试 ──
console.log('\n== Levenshtein 距离 ==');
assertEq(levenshtein('', ''), 0, '空字符串距离为 0');
assertEq(levenshtein('abc', 'abc'), 0, '相同字符串距离为 0');
assertEq(levenshtein('abc', 'ab'), 1, '删除一个字符距离为 1');
assertEq(levenshtein('abc', 'axc'), 1, '替换一个字符距离为 1');
assertEq(levenshtein('kitten', 'sitting'), 3, '经典测试用例');
assertEq(levenshtein('github', 'githuh'), 1, 'typosquatting 示例距离为 1');
assertEq(levenshtein('google', 'gooogle'), 1, '多一个字母距离为 1');

// ── URL 分析测试 ──
console.log('\n== URL 分析 ==');

const r1 = analyzeUrl('https://www.alipay.com.pay-verify.cc/login');
assert(r1.length > 0, '子域名伪装应被检测到');
assert(r1.some(r => r.type === 'subdomain-spoof'), '类型为 subdomain-spoof');

const r2 = analyzeUrl('https://bit.ly/3xWqLogin');
assert(r2.length > 0, '短链应被检测到');
assert(r2.some(r => r.type === 'short-url'), '类型为 short-url');

const r3 = analyzeUrl('javascript:alert(1)');
assert(r3.length > 0, 'JS 注入应被检测到');
assert(r3.some(r => r.type === 'js-injection'), '类型为 js-injection');

const r4 = analyzeUrl('https://www.google.com/search');
assertEq(r4.length, 0, '正常 URL 无风险');

const r5 = analyzeUrl('https://accounts.gooɡle.com/signin');
assert(r5.some(r => r.type === 'unicode'), 'Unicode 混淆应被检测到');

// ── shuffleArray 测试 ──
console.log('\n== shuffleArray ==');
const arr = [1, 2, 3, 4, 5];
const shuffled = shuffleArray(arr);
assertEq(shuffled.length, arr.length, '洗牌后长度不变');
assert(shuffled.sort((a,b) => a-b).join(',') === arr.join(','), '洗牌后元素不变');
assert(arr[0] === 1, '原数组不被修改');

// ── 数据完整性测试 ──
console.log('\n== 数据完整性 ==');
assert(CHALLENGE_QUESTIONS.length >= 5, '挑战题目至少 5 题');
CHALLENGE_QUESTIONS.forEach((q, i) => {
  assert(q.safe && q.danger && q.tactic && q.explain, `题目 ${i+1} 字段完整`);
  assert(q.safe !== q.danger, `题目 ${i+1} safe 和 danger 不同`);
});

assert(PAYLOAD_TYPES.length >= 5, 'Payload 类型至少 5 种');
PAYLOAD_TYPES.forEach((p, i) => {
  assert(p.id && p.title && p.icon && p.risk && p.example && p.desc && p.howItWorks,
    `Payload ${p.id} 字段完整`);
  assert(['high', 'medium', 'low'].includes(p.risk), `Payload ${p.id} 风险等级有效`);
});

// ── 总结 ──
console.log(`\n== 结果: ${passed} passed, ${failed} failed ==`);
if (failed > 0) process.exit(1);

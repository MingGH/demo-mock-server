// SRI Checker 前端单元测试
// 运行方式: node pages/sri-checker/sri-checker.test.js

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function assertEqual(actual, expected, msg) {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg} — expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)}`);
  }
}

// 模拟浏览器环境中不存在的 API
if (typeof document === 'undefined') {
  global.document = { addEventListener: () => {}, querySelectorAll: () => [], getElementById: () => ({}) };
  global.navigator = { clipboard: { writeText: () => Promise.resolve() } };
}

// 加载模块
const { shortenUrl, escapeHtml, getAttackSteps } = require('./app.js');

console.log('\n=== SRI Checker 单元测试 ===\n');

// ── shortenUrl 测试 ──
console.log('shortenUrl:');
assertEqual(
  shortenUrl('https://cdn.example.com/lib.js'),
  'cdn.example.com/lib.js',
  '短路径保持完整'
);
assert(
  shortenUrl('https://cdn.example.com/very/long/path/that/exceeds/thirty/characters/file.min.js').includes('...'),
  '长路径被截断'
);
assertEqual(
  shortenUrl('not-a-url'),
  'not-a-url',
  '非 URL 原样返回'
);

// ── escapeHtml 测试 ──
console.log('\nescapeHtml:');
assertEqual(
  escapeHtml('<script>alert("xss")</script>'),
  '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
  '正确转义 HTML 特殊字符'
);
assertEqual(
  escapeHtml('normal text'),
  'normal text',
  '普通文本不变'
);
assertEqual(
  escapeHtml('a&b'),
  'a&amp;b',
  '& 符号被转义'
);

// ── getAttackSteps 测试 ──
console.log('\ngetAttackSteps:');
const scriptSteps = getAttackSteps({ tag: 'script', src: 'https://cdn.example.com/lib.js' });
assert(scriptSteps.length >= 5, 'script 类型返回至少 5 个攻击步骤');
assert(scriptSteps.some(s => s.includes('键盘记录')), 'script 攻击包含键盘记录');
assert(scriptSteps.some(s => s.includes('Cookie')), 'script 攻击包含 Cookie 窃取');

const linkSteps = getAttackSteps({ tag: 'link', src: 'https://cdn.example.com/style.css' });
assert(linkSteps.length >= 3, 'link 类型返回至少 3 个攻击步骤');
assert(linkSteps.some(s => s.includes('CSS')), 'link 攻击提及 CSS');
assert(scriptSteps.length > linkSteps.length, 'script 比 link 风险步骤更多');

// ── 结果汇总 ──
console.log(`\n${'='.repeat(40)}`);
console.log(`结果: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);

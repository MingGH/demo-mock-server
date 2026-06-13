/**
 * 头像URL陷阱 — 单元测试
 * 运行: node pages/avatar-url-risk/avatar-url-risk.test.js
 */

// ── Mock DOM environment ──
global.document = { cookie: 'test=1' };
global.navigator = { userAgent: 'TestAgent', language: 'zh-CN', platform: 'MacIntel' };
global.screen = { width: 1920, height: 1080 };
global.event = { currentTarget: { style: {} } };

// ── Load module ──
const { generateFakeIp, defenses } = require('./app.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.log(`  ✗ ${msg}`);
    failed++;
  }
}

console.log('=== 头像URL陷阱 测试 ===\n');

// Test 1: generateFakeIp
console.log('generateFakeIp:');
const ip = generateFakeIp();
const parts = ip.split('.');
assert(parts.length === 4, 'IP有4个部分');
assert(parts.every(p => Number(p) >= 0 && Number(p) <= 255), 'IP每段在0-255之间');
assert(Number(parts[0]) >= 60, 'IP首段>=60（避免保留段）');

// Test 2: defenses 数据完整性
console.log('\ndefenses 数据:');
assert(defenses.length === 4, '有4种防御方案');
assert(defenses[0].title.includes('代理'), '第一种是服务端代理');
assert(defenses[1].title.includes('Security-Policy'), '第二种是CSP白名单');
assert(defenses[3].title.includes('后缀'), '第四种是后缀校验');
defenses.forEach((d, i) => {
  assert(d.content.length > 50, `方案${i}有详细内容`);
});

// Test 3: 多次生成IP不重复（概率验证）
console.log('\nIP唯一性:');
const ips = new Set();
for (let i = 0; i < 100; i++) ips.add(generateFakeIp());
assert(ips.size > 90, `100次生成有${ips.size}个不同IP（应>90）`);

console.log(`\n结果: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

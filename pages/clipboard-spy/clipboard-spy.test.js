/**
 * clipboard-spy.test.js
 * 用 node 直接运行：node clipboard-spy.test.js
 */

// ── 模拟浏览器环境 ──
global.window = {};
global.document = { createElement: () => ({ textContent: '', innerHTML: '' }) };

// ── 加载引擎 ──
require('./engine.js');
const {
  detectSensitive,
  encodeZwsp,
  decodeZwsp,
  countZwsp,
  injectZwsp,
  ZWSP_CHARS,
  SIMULATED_CLIPBOARD_ACTIONS,
  buildProfile,
} = global.window.ClipboardEngine;

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    console.error(`  ❌ ${msg}`);
  }
}

// ── 敏感信息检测 ──
console.log('\n📋 敏感信息检测');

assert(
  detectSensitive('我的手机号是 138-0013-8000').length > 0,
  '检测到手机号'
);

assert(
  detectSensitive('身份证 110105199003071234').length > 0,
  '检测到身份证号'
);

assert(
  detectSensitive('邮箱 test@example.com').length > 0,
  '检测到邮箱'
);

assert(
  detectSensitive('密码是 MyPass@123').length > 0,
  '检测到密码'
);

assert(
  detectSensitive('银行卡号 6222 0200 0000 1234 567').length > 0,
  '检测到银行卡号'
);

assert(
  detectSensitive('北京市朝阳区建国路88号').length > 0,
  '检测到地址'
);

assert(
  detectSensitive('今天天气不错').length === 0,
  '普通文本无敏感信息'
);

assert(
  detectSensitive('https://example.com/login').length > 0,
  '检测到网址'
);

// ── 零宽字符编解码 ──
console.log('\n🔤 零宽字符编解码');

const testId = 42857;
const encoded = encodeZwsp(testId);
const decoded = decodeZwsp(encoded);
assert(decoded === testId, `编码 ${testId} → 解码 ${decoded}（应为 ${testId}）`);

assert(encoded.length > 0, '编码结果非空');
assert(countZwsp(encoded) === encoded.length, '编码结果全部是零宽字符');

// 不同 ID 编码不同
const encoded2 = encodeZwsp(12345);
assert(encoded !== encoded2, '不同 ID 编码结果不同');

// 解码不同 ID
assert(decodeZwsp(encoded2) === 12345, '解码 12345 正确');

// 空字符串
assert(decodeZwsp('') === null, '空字符串解码为 null');

// 普通文本无零宽字符
assert(countZwsp('hello world') === 0, '普通文本零宽字符数为 0');

// ── 注入零宽字符 ──
console.log('\n💉 零宽字符注入');

const original = '这是一段测试文本，用来验证零宽字符注入功能。';
const injected = injectZwsp(original, testId);

assert(injected.length > original.length, '注入后长度增加');
assert(countZwsp(injected) > 0, '注入后包含零宽字符');

// 去掉零宽字符后应该和原文一致
const cleaned = injected.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
assert(cleaned === original, '去掉零宽字符后恢复原文');

// 从注入文本中解码出 ID
assert(decodeZwsp(injected) === testId, '从注入文本中解码出正确 ID');

// ── 模拟数据 ──
console.log('\n📊 模拟数据');

assert(
  SIMULATED_CLIPBOARD_ACTIONS.length >= 20,
  `模拟数据有 ${SIMULATED_CLIPBOARD_ACTIONS.length} 条（≥20）`
);

const sensitiveActions = SIMULATED_CLIPBOARD_ACTIONS.filter(a => a.sensitive);
assert(
  sensitiveActions.length >= 15,
  `敏感操作 ${sensitiveActions.length} 条（≥15）`
);

// 每条都有必要字段
const allValid = SIMULATED_CLIPBOARD_ACTIONS.every(
  a => a.time && a.app && a.content && a.category && typeof a.sensitive === 'boolean'
);
assert(allValid, '所有模拟数据字段完整');

// ── 画像构建 ──
console.log('\n👤 画像构建');

const profile = buildProfile(SIMULATED_CLIPBOARD_ACTIONS);
const profileCategories = Object.keys(profile);
assert(profileCategories.length >= 5, `画像包含 ${profileCategories.length} 个类别（≥5）`);
assert(profile['手机号'] !== undefined, '画像包含手机号');
assert(profile['地址'] !== undefined, '画像包含地址');

// ── 结果 ──
console.log(`\n${'═'.repeat(40)}`);
console.log(`总计: ${passed + failed} 项 | ✅ ${passed} 通过 | ❌ ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);

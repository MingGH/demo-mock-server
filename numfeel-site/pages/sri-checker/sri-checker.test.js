// SRI 安全实验室 前端单元测试
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

// 模拟浏览器环境
if (typeof document === 'undefined') {
  global.document = {
    addEventListener: () => {},
    querySelectorAll: () => [],
    getElementById: () => ({ classList: { add: () => {}, remove: () => {} }, innerHTML: '' })
  };
  global.navigator = { clipboard: { writeText: () => Promise.resolve() } };
  global.fetch = () => Promise.resolve({ text: () => Promise.resolve('sha384-testHashValue123') });
}

// 加载模块
const { buildPageHtml, setIntegrityHash } = require('./app.js');

// 设置 integrityHash（模拟 init 完成）
setIntegrityHash('sha384-testHashValue123');

console.log('\n=== SRI 安全实验室 单元测试 ===\n');

// ── buildPageHtml 测试 ──
console.log('buildPageHtml — 正常模式:');

const normalSafe = buildPageHtml(false, true);
assert(normalSafe.includes('integrity="sha384-testHashValue123"'), '正常+有SRI → 包含正确的 integrity 属性');
assert(normalSafe.includes('crossorigin="anonymous"'), '正常+有SRI → 包含 crossorigin');
assert(!normalSafe.includes('tampered=true'), '正常+有SRI → URL 不含 tampered 参数');
assert(normalSafe.includes('/sri/demo.js"'), '正常+有SRI → 引用正确的脚本路径');
assert(normalSafe.includes('SecureBank'), '包含模拟银行登录页');

const normalUnsafe = buildPageHtml(false, false);
assert(!normalUnsafe.includes('integrity='), '正常+无SRI → 不包含 integrity 属性');
assert(!normalUnsafe.includes('crossorigin'), '正常+无SRI → 不包含 crossorigin');
assert(!normalUnsafe.includes('tampered=true'), '正常+无SRI → URL 不含 tampered');

console.log('\nbuildPageHtml — 篡改模式:');

const tamperedSafe = buildPageHtml(true, true);
assert(tamperedSafe.includes('tampered=true'), '篡改+有SRI → URL 含 tampered=true');
assert(tamperedSafe.includes('integrity="sha384-testHashValue123"'), '篡改+有SRI → 仍包含 integrity（基于正常版本哈希）');
assert(tamperedSafe.includes('onerror='), '篡改+有SRI → 包含 onerror 处理');
assert(tamperedSafe.includes('SRI 保护生效'), 'onerror 处理文本包含保护生效提示');
assert(tamperedSafe.includes('keylog-panel'), '页面包含键盘记录面板 DOM');

const tamperedUnsafe = buildPageHtml(true, false);
assert(tamperedUnsafe.includes('tampered=true'), '篡改+无SRI → URL 含 tampered=true');
assert(!tamperedUnsafe.includes('integrity='), '篡改+无SRI → 不包含 integrity 属性');

console.log('\n页面结构验证:');
assert(normalSafe.includes('script-status'), '包含脚本状态容器 DOM id');
assert(normalSafe.includes('<!DOCTYPE html>'), '是完整 HTML 文档');
assert(normalSafe.includes('<body>'), '有 body 标签');
assert(normalSafe.includes('</html>'), '有闭合 html 标签');

console.log('\n无 integrityHash 时的行为:');
setIntegrityHash(null);
const noHashSafe = buildPageHtml(false, true);
assert(!noHashSafe.includes('integrity='), '无哈希时即使 withSri=true 也不加 integrity');

// ── 结果汇总 ──
console.log(`\n${'='.repeat(40)}`);
console.log(`结果: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);

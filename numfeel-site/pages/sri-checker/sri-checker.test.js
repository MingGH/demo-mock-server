// SRI 安全实验室 前端单元测试
// 运行方式: node pages/sri-checker/sri-checker.test.js

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log(`  ✓ ${msg}`); } else { failed++; console.error(`  ✗ ${msg}`); } }

// 模拟浏览器环境
global.document = { addEventListener: () => {}, getElementById: () => ({ srcdoc: '', classList: { add:()=>{}, remove:()=>{} } }) };
global.fetch = () => Promise.resolve({ text: () => Promise.resolve('sha384-abc') });
global.location = { protocol: 'http:' };
global.URL = class { constructor() {} static createObjectURL() { return ''; } static revokeObjectURL() {} };
global.Blob = class {};

const { buildPageHtml, buildDownloadHtml, setIntegrityHash } = require('./app.js');
setIntegrityHash('sha384-testHash123');

console.log('\n=== SRI 安全实验室 单元测试 ===\n');

console.log('buildPageHtml — 正常模式:');
const normalSafe = buildPageHtml(false, true);
assert(normalSafe.includes('integrity="sha384-testHash123"'), '正常+有SRI → 包含 integrity');
assert(normalSafe.includes('crossorigin="anonymous"'), '正常+有SRI → 包含 crossorigin');
assert(!normalSafe.includes('tampered=true'), '正常+有SRI → 不含 tampered');
assert(normalSafe.includes('SecureBank'), '包含模拟银行页面');
assert(normalSafe.includes('type="password"'), '包含密码输入框');
assert(normalSafe.includes('keylog-panel'), '包含键盘记录面板 DOM');

const normalUnsafe = buildPageHtml(false, false);
assert(!normalUnsafe.includes('integrity='), '正常+无SRI → 不含 integrity');

console.log('\nbuildPageHtml — 篡改模式:');
const tamperedSafe = buildPageHtml(true, true);
assert(tamperedSafe.includes('tampered=true'), '篡改+有SRI → URL 含 tampered=true');
assert(tamperedSafe.includes('integrity='), '篡改+有SRI → 仍有 integrity');
assert(tamperedSafe.includes('onerror='), '篡改+有SRI → 有 onerror');

const tamperedUnsafe = buildPageHtml(true, false);
assert(tamperedUnsafe.includes('tampered=true'), '篡改+无SRI → URL 含 tampered=true');
assert(!tamperedUnsafe.includes('integrity='), '篡改+无SRI → 无 integrity');

console.log('\nbuildDownloadHtml:');
const dlSafe = buildDownloadHtml(true);
assert(dlSafe.includes('integrity='), '下载safe → 含 integrity');
assert(dlSafe.includes('tampered=true'), '下载safe → 引用篡改版本脚本');
assert(dlSafe.includes('有 SRI 保护'), '下载safe → 标题正确');

const dlUnsafe = buildDownloadHtml(false);
assert(!dlUnsafe.includes('integrity='), '下载unsafe → 不含 integrity');
assert(dlUnsafe.includes('无 SRI 保护'), '下载unsafe → 标题正确');

console.log('\n无 hash 时:');
setIntegrityHash(null);
const noHash = buildPageHtml(true, true);
assert(!noHash.includes('integrity='), '无hash时不加 integrity');

console.log(`\n${'='.repeat(40)}`);
console.log(`结果: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);

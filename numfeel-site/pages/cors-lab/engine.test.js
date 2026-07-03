// ========== cors-lab engine 单测 ==========
// 用法：node pages/cors-lab/engine.test.js

var E = require('./engine.js');
var classifyRequest = E.classifyRequest;
var browserBlocksReading = E.browserBlocksReading;
var serverHeaders = E.serverHeaders;
var isSimpleMethod = E.isSimpleMethod;
var isSimpleContentType = E.isSimpleContentType;
var CORS_MODES = E.CORS_MODES;

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('✅ ' + msg);
  } else {
    failed++;
    console.error('❌ ' + msg);
  }
}

function assertEqual(a, b, msg) {
  assert(a === b, msg + ' (got: ' + JSON.stringify(a) + ')');
}

// ── 简单方法 ──
assertEqual(isSimpleMethod('GET'), true, 'GET 是简单方法');
assertEqual(isSimpleMethod('post'), true, 'post 大小写不敏感');
assertEqual(isSimpleMethod('PUT'), false, 'PUT 非简单方法');
assertEqual(isSimpleMethod('DELETE'), false, 'DELETE 非简单方法');

// ── 简单 Content-Type ──
assertEqual(isSimpleContentType('application/x-www-form-urlencoded'), true, 'form-urlencoded 简单');
assertEqual(isSimpleContentType('text/plain'), true, 'text/plain 简单');
assertEqual(isSimpleContentType('multipart/form-data; boundary=xxx'), true, 'multipart 带参数仍简单');
assertEqual(isSimpleContentType('application/json'), false, 'application/json 触发预检');
assertEqual(isSimpleContentType(''), true, '空 Content-Type 视为简单');

// ── classifyRequest：简单请求 ──
var simple = classifyRequest({ method: 'GET', headers: { 'Accept': 'application/json' } });
assertEqual(simple.needsPreflight, false, 'GET + Accept 是简单请求，不预检');

var simplePost = classifyRequest({
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
});
assertEqual(simplePost.needsPreflight, false, 'POST + form-urlencoded 是简单请求，不预检');

// ── classifyRequest：JSON 触发预检 ──
var jsonReq = classifyRequest({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
});
assertEqual(jsonReq.needsPreflight, true, 'POST + JSON 触发预检');
assert(jsonReq.reasons.length > 0, 'JSON 请求给出预检原因');

// ── classifyRequest：自定义头触发预检 ──
var customHeader = classifyRequest({
  method: 'GET',
  headers: { 'X-Demo': '1' }
});
assertEqual(customHeader.needsPreflight, true, 'GET + 自定义头 X-Demo 触发预检');
assert(customHeader.reasons.join('').indexOf('X-Demo') !== -1, '原因里提到 X-Demo');

// ── classifyRequest：PUT 触发预检 ──
var putReq = classifyRequest({ method: 'PUT', headers: {} });
assertEqual(putReq.needsPreflight, true, 'PUT 触发预检');

// ── browserBlocksReading ──
assertEqual(browserBlocksReading(CORS_MODES.DENY, false).blocked, true, 'deny 模式读不到响应');
assertEqual(browserBlocksReading(CORS_MODES.ALLOW, false).blocked, false, 'allow 模式不带凭据可读');
assertEqual(browserBlocksReading(CORS_MODES.ALLOW, true).blocked, true, 'allow 模式带凭据被拦（* 与凭据冲突）');
assertEqual(browserBlocksReading(CORS_MODES.ALLOW_CREDENTIALS, true).blocked, false, 'allow-credentials 带凭据可读');
assertEqual(browserBlocksReading(CORS_MODES.ALLOW_CREDENTIALS, false).blocked, false, 'allow-credentials 不带凭据也可读');

// ── serverHeaders：与后端 corsHeadersFor 对齐 ──
var denyH = serverHeaders(CORS_MODES.DENY, 'https://a.com');
assertEqual(Object.keys(denyH).length, 0, 'deny 不写任何 CORS 头');

var allowH = serverHeaders(CORS_MODES.ALLOW, 'https://a.com');
assertEqual(allowH['Access-Control-Allow-Origin'], '*', 'allow 写通配符 *');
assert(!('Access-Control-Allow-Credentials' in allowH), 'allow 不写 Allow-Credentials');

var credH = serverHeaders(CORS_MODES.ALLOW_CREDENTIALS, 'https://a.com');
assertEqual(credH['Access-Control-Allow-Origin'], 'https://a.com', 'allow-credentials 回显具体 Origin');
assertEqual(credH['Access-Control-Allow-Credentials'], 'true', 'allow-credentials 写 Allow-Credentials: true');
assertEqual(credH['Vary'], 'Origin', 'allow-credentials 写 Vary: Origin');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);

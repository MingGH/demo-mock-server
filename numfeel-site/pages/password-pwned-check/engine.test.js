/* ============================================================
   密码泄露自查 —— engine.js 单元测试
   运行：node pages/password-pwned-check/engine.test.js
   无测试框架依赖，自实现 assert。
   ============================================================ */

var engine = require('./engine.js');

var passed = 0, failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log('✅ ' + msg); }
  else { failed++; console.error('❌ ' + msg); }
}

function assertEq(actual, expected, msg) {
  assert(actual === expected, msg + ' (期望 ' + expected + '，实际 ' + actual + ')');
}

/* ---------- SHA-1 已知测试向量 ---------- */
assertEq(engine.sha1Hex('').toLowerCase(),
  'da39a3ee5e6b4b0d3255bfef95601890afd80709', 'SHA-1 空字符串');
assertEq(engine.sha1Hex('abc').toLowerCase(),
  'a9993e364706816aba3e25717850c26c9cd0d89d', 'SHA-1 "abc"');
assertEq(engine.sha1Hex('password').toLowerCase(),
  '5baa61e4c9b93f3f0682250b6cf8331b7ee68fd8', 'SHA-1 "password"');
assertEq(engine.sha1Hex('123456').toLowerCase(),
  '7c4a8d09ca3762af61e59520943dc26494f8941b', 'SHA-1 "123456"');
// 长消息跨多个 512 位分块
assertEq(engine.sha1Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq').toLowerCase(),
  '84983e441c3bd26ebaae4aa1f95129e5e54670f1', 'SHA-1 56 字节多分块');

/* ---------- 输出格式：40 位大写 ---------- */
var h = engine.sha1Hex('hello');
assertEq(h.length, 40, 'SHA-1 输出长度为 40');
assert(/^[0-9A-F]{40}$/.test(h), 'SHA-1 输出为大写十六进制');

/* ---------- UTF-8 编码 ---------- */
assertEq(JSON.stringify(engine.utf8Bytes('A')), JSON.stringify([65]), 'UTF-8 ASCII');
assertEq(JSON.stringify(engine.utf8Bytes('中')), JSON.stringify([0xe4, 0xb8, 0xad]), 'UTF-8 中文三字节');
// 中文密码也能算出哈希（长度 40）
assertEq(engine.sha1Hex('密码123').length, 40, '中文密码可计算 SHA-1');

/* ---------- splitHash：前 5 位 + 后 35 位 ---------- */
var sp = engine.splitHash('5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8');
assertEq(sp.prefix, '5BAA6', 'splitHash 前缀为前 5 位');
assertEq(sp.suffix, '1E4C9B93F3F0682250B6CF8331B7EE68FD8', 'splitHash 后缀为后 35 位');
assertEq(sp.prefix.length + sp.suffix.length, 40, 'splitHash 前后缀合计 40 位');
// 小写输入也应被标准化为大写
assertEq(engine.splitHash('5baa61e4c9b93f3f0682250b6cf8331b7ee68fd8').prefix, '5BAA6', 'splitHash 标准化为大写');

/* ---------- countInRange：在 range 文本中查后缀次数 ---------- */
var rangeText =
  '003D68EB55068C33ACE09247EE4C639306B:3\r\n' +
  '1E4C9B93F3F0682250B6CF8331B7EE68FD8:9659365\r\n' +
  '012832DC9E13B5E62F8B5C0A4A5E0F8E1B2:42';
assertEq(engine.countInRange(rangeText, '1E4C9B93F3F0682250B6CF8331B7EE68FD8'), 9659365, 'countInRange 命中返回次数');
assertEq(engine.countInRange(rangeText, 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'), 0, 'countInRange 未命中返回 0');
assertEq(engine.countInRange(rangeText, '1e4c9b93f3f0682250b6cf8331b7ee68fd8'), 9659365, 'countInRange 大小写不敏感');
assertEq(engine.countInRange('', 'ABC'), 0, 'countInRange 空文本返回 0');

/* ---------- checkPassword：端到端 ---------- */
// "password" 的 SHA-1 = 5BAA61E4...，后缀正好在上面 rangeText 中
var res = engine.checkPassword('password', rangeText);
assertEq(res.prefix, '5BAA6', 'checkPassword 计算出正确前缀');
assertEq(res.count, 9659365, 'checkPassword 得出命中次数');
assert(res.pwned === true, 'checkPassword 命中时 pwned=true');

var safeRes = engine.checkPassword('password', '0000000000000000000000000000000000A:1');
assertEq(safeRes.count, 0, 'checkPassword 未命中次数为 0');
assert(safeRes.pwned === false, 'checkPassword 未命中时 pwned=false');

// 可复现：同一密码两次结果一致
assertEq(engine.checkPassword('123456', rangeText).hash,
         engine.checkPassword('123456', rangeText).hash, 'checkPassword 同输入可复现');

/* ---------- 体量类比 ---------- */
assert(Math.abs(engine.timesWorldPopulation(8.2e9) - 1) < 1e-9, 'timesWorldPopulation 等于人口时为 1 倍');
assert(engine.timesWorldPopulation(9.9e9) > 1, 'RockYou2024 超过全球人口');
assertEq(engine.formatCount(9.9e9), '99 亿', 'formatCount 99 亿');
assertEq(engine.formatCount(3.2e7), '3200 万', 'formatCount 3200 万');

/* ---------- 数据完整性 ---------- */
assert(engine.WORDLIST_MILESTONES.length >= 4, 'WORDLIST_MILESTONES 至少 4 个里程碑');
assert(engine.PRESET_PASSWORDS.length >= 5, 'PRESET_PASSWORDS 至少 5 个预设');

/* ---------- 汇总 ---------- */
console.log('\n========================================');
console.log('通过：' + passed + '，失败：' + failed);
console.log('========================================');
if (failed > 0) { process.exit(1); }

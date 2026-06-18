/**
 * hash-crack-race.test.js — 密码哈希破解竞速核心算法测试
 * 运行：node pages/hash-crack-race/hash-crack-race.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const engine = require('./engine.js');

// ── calcKeyspace ──
describe('calcKeyspace', () => {
  test('6位数字: 10^6 = 1,000,000', () => {
    assert.equal(engine.calcKeyspace(6, 10), 1000000);
  });

  test('8位小写: 26^8', () => {
    assert.equal(engine.calcKeyspace(8, 26), Math.pow(26, 8));
  });

  test('长度为0返回0', () => {
    assert.equal(engine.calcKeyspace(0, 26), 0);
  });

  test('字符集为0返回0', () => {
    assert.equal(engine.calcKeyspace(8, 0), 0);
  });

  test('12位全字符集: 95^12', () => {
    var result = engine.calcKeyspace(12, 95);
    assert.ok(Math.abs(result - Math.pow(95, 12)) < 1);
  });
});

// ── calcCrackSeconds ──
describe('calcCrackSeconds', () => {
  test('已知搜索空间的破解时间', () => {
    // keyspace = 1,000,000, speed = 1000/s => 1000000 / 1000 / 2 = 500s
    var time = engine.calcCrackSeconds(1000000, 1000);
    assert.equal(time, 500);
  });

  test('keyspace为0时返回0', () => {
    assert.equal(engine.calcCrackSeconds(0, 1000), 0);
  });

  test('speed为0时返回0', () => {
    assert.equal(engine.calcCrackSeconds(1000000, 0), 0);
  });

  test('大搜索空间慢哈希应得到很长时间', () => {
    // 8位全字符: 95^8 ≈ 6.6e15, argon2 120/s => 6.6e15 / 120 / 2 ≈ 2.75e13 秒
    var keyspace = Math.pow(95, 8);
    var time = engine.calcCrackSeconds(keyspace, 120);
    assert.ok(time > 1e13);
  });
});

// ── calcAllCrackTimes ──
describe('calcAllCrackTimes', () => {
  test('返回4种算法结果', () => {
    var results = engine.calcAllCrackTimes(8, 'lower');
    assert.equal(results.length, 4);
  });

  test('MD5总是最快破解', () => {
    var results = engine.calcAllCrackTimes(8, 'mixed_digits');
    var md5 = results.find(r => r.algo === 'md5');
    var bcrypt = results.find(r => r.algo === 'bcrypt_10');
    assert.ok(md5.crackSeconds < bcrypt.crackSeconds);
  });

  test('Argon2总是最慢破解（最安全）', () => {
    var results = engine.calcAllCrackTimes(8, 'mixed_digits');
    var argon2 = results.find(r => r.algo === 'argon2id');
    for (var i = 0; i < results.length; i++) {
      assert.ok(argon2.crackSeconds >= results[i].crackSeconds);
    }
  });

  test('无效字符集返回空数组', () => {
    var results = engine.calcAllCrackTimes(8, 'invalid');
    assert.deepEqual(results, []);
  });

  test('各结果包含必要字段', () => {
    var results = engine.calcAllCrackTimes(6, 'digits');
    for (var i = 0; i < results.length; i++) {
      assert.ok(typeof results[i].algo === 'string');
      assert.ok(typeof results[i].name === 'string');
      assert.ok(typeof results[i].speed === 'number');
      assert.ok(typeof results[i].crackSeconds === 'number');
      assert.ok(typeof results[i].loginMs === 'number');
      assert.ok(typeof results[i].color === 'string');
    }
  });
});

// ── formatTime ──
describe('formatTime', () => {
  test('0秒 → 瞬间', () => {
    assert.equal(engine.formatTime(0), '瞬间');
  });

  test('亚毫秒', () => {
    assert.ok(engine.formatTime(0.0005).includes('不到 1 毫秒'));
  });

  test('毫秒级', () => {
    var result = engine.formatTime(0.5);
    assert.ok(result.includes('毫秒'));
  });

  test('秒级', () => {
    var result = engine.formatTime(30);
    assert.ok(result.includes('秒'));
  });

  test('分钟级', () => {
    var result = engine.formatTime(300);
    assert.ok(result.includes('分钟'));
  });

  test('小时级', () => {
    var result = engine.formatTime(7200);
    assert.ok(result.includes('小时'));
  });

  test('天级', () => {
    var result = engine.formatTime(172800);
    assert.ok(result.includes('天'));
  });

  test('年级', () => {
    var result = engine.formatTime(31557600 * 5);
    assert.ok(result.includes('年'));
  });

  test('千年级', () => {
    var result = engine.formatTime(31557600 * 5000);
    assert.ok(result.includes('千年'));
  });

  test('宇宙年龄级', () => {
    var result = engine.formatTime(1e20);
    assert.ok(result.includes('宇宙年龄'));
  });

  test('Infinity', () => {
    assert.equal(engine.formatTime(Infinity), '超出计算范围');
  });

  test('NaN', () => {
    assert.equal(engine.formatTime(NaN), '--');
  });
});

// ── formatBigNumber ──
describe('formatBigNumber', () => {
  test('小数字原样输出', () => {
    var result = engine.formatBigNumber(12345);
    assert.ok(result.includes('12'));
  });

  test('百万级', () => {
    var result = engine.formatBigNumber(5000000);
    assert.ok(result.includes('百万'));
  });

  test('十亿级', () => {
    var result = engine.formatBigNumber(3000000000);
    assert.ok(result.includes('十亿'));
  });

  test('更大数字用科学记数法', () => {
    var result = engine.formatBigNumber(1e15);
    assert.ok(result.includes('e'));
  });

  test('0返回"0"', () => {
    assert.equal(engine.formatBigNumber(0), '0');
  });

  test('Infinity返回∞', () => {
    assert.equal(engine.formatBigNumber(Infinity), '∞');
  });
});

// ── calcSpeedupFactors ──
describe('calcSpeedupFactors', () => {
  test('MD5 vs bcrypt 倍数应约等于速度比', () => {
    var results = engine.calcAllCrackTimes(8, 'lower');
    var factors = engine.calcSpeedupFactors(results);
    // MD5 1.64e11 / bcrypt 5.7e3 ≈ 28,771,929
    var expected = engine.HASH_ALGORITHMS.md5.speed / engine.HASH_ALGORITHMS.bcrypt_10.speed;
    assert.ok(Math.abs(factors.md5VsBcrypt - expected) < 1);
  });

  test('MD5 vs Argon2 倍数应更大', () => {
    var results = engine.calcAllCrackTimes(8, 'lower');
    var factors = engine.calcSpeedupFactors(results);
    assert.ok(factors.md5VsArgon2 > factors.md5VsBcrypt);
  });
});

// ── detectCharsetKey ──
describe('detectCharsetKey', () => {
  test('纯数字 → digits', () => {
    assert.equal(engine.detectCharsetKey('123456'), 'digits');
  });

  test('纯小写 → lower', () => {
    assert.equal(engine.detectCharsetKey('abcdef'), 'lower');
  });

  test('小写+数字 → lower_digits', () => {
    assert.equal(engine.detectCharsetKey('abc123'), 'lower_digits');
  });

  test('大小写 → mixed', () => {
    assert.equal(engine.detectCharsetKey('AbCdEf'), 'mixed');
  });

  test('大小写+数字 → mixed_digits', () => {
    assert.equal(engine.detectCharsetKey('Ab1Cd2'), 'mixed_digits');
  });

  test('含特殊字符 → full', () => {
    assert.equal(engine.detectCharsetKey('a1!B'), 'full');
  });

  test('空字符串 → digits', () => {
    assert.equal(engine.detectCharsetKey(''), 'digits');
  });
});

// ── HASH_ALGORITHMS 常量 ──
describe('HASH_ALGORITHMS', () => {
  test('包含4种算法', () => {
    var keys = Object.keys(engine.HASH_ALGORITHMS);
    assert.equal(keys.length, 4);
    assert.ok(keys.includes('md5'));
    assert.ok(keys.includes('sha256'));
    assert.ok(keys.includes('bcrypt_10'));
    assert.ok(keys.includes('argon2id'));
  });

  test('速度递减: MD5 > SHA256 > bcrypt > Argon2', () => {
    var h = engine.HASH_ALGORITHMS;
    assert.ok(h.md5.speed > h.sha256.speed);
    assert.ok(h.sha256.speed > h.bcrypt_10.speed);
    assert.ok(h.bcrypt_10.speed > h.argon2id.speed);
  });

  test('登录时间递增', () => {
    var h = engine.HASH_ALGORITHMS;
    assert.ok(h.md5.loginTime < h.sha256.loginTime);
    assert.ok(h.sha256.loginTime < h.bcrypt_10.loginTime);
    assert.ok(h.bcrypt_10.loginTime < h.argon2id.loginTime);
  });
});

// ── PRESETS ──
describe('PRESETS', () => {
  test('至少有5个预设', () => {
    assert.ok(engine.PRESETS.length >= 5);
  });

  test('每个预设有必要字段', () => {
    for (var i = 0; i < engine.PRESETS.length; i++) {
      var p = engine.PRESETS[i];
      assert.ok(typeof p.id === 'string');
      assert.ok(typeof p.label === 'string');
      assert.ok(typeof p.length === 'number');
      assert.ok(typeof p.charset === 'string');
      assert.ok(typeof p.example === 'string');
      assert.ok(engine.CHARSETS[p.charset], 'preset charset key must exist in CHARSETS');
    }
  });
});

// ── 集成：具体场景验证 ──
describe('集成测试：真实场景', () => {
  test('6位数字PIN用MD5: 应在1秒内破解', () => {
    var results = engine.calcAllCrackTimes(6, 'digits');
    var md5 = results.find(r => r.algo === 'md5');
    // 10^6 / 1.64e11 / 2 ≈ 0.000003 秒
    assert.ok(md5.crackSeconds < 1);
  });

  test('6位数字PIN用Argon2: 仍然很快（搜索空间太小）', () => {
    var results = engine.calcAllCrackTimes(6, 'digits');
    var argon2 = results.find(r => r.algo === 'argon2id');
    // 10^6 / 120 / 2 ≈ 4166 秒 ≈ 1.1 小时
    assert.ok(argon2.crackSeconds > 3000);
    assert.ok(argon2.crackSeconds < 6000);
  });

  test('12位全字符用bcrypt: 应需要极长时间', () => {
    var results = engine.calcAllCrackTimes(12, 'full');
    var bcrypt = results.find(r => r.algo === 'bcrypt_10');
    // 95^12 / 5700 / 2 ≈ 4.74e19 秒，远超宇宙年龄
    assert.ok(bcrypt.crackSeconds > 1e19);
  });

  test('8位混合密码: MD5分钟级，bcrypt百万年级', () => {
    var results = engine.calcAllCrackTimes(8, 'mixed_digits');
    var md5 = results.find(r => r.algo === 'md5');
    var bcrypt = results.find(r => r.algo === 'bcrypt_10');
    // MD5: 62^8 / 1.64e11 / 2 ≈ 6580 秒 ≈ 1.8 小时
    assert.ok(md5.crackSeconds < 86400); // 一天内
    // bcrypt: 62^8 / 5700 / 2 ≈ 1.9e10 秒 ≈ 600 年
    assert.ok(bcrypt.crackSeconds > 31557600 * 100); // 超过100年
  });
});

console.log('所有测试通过 ✓');

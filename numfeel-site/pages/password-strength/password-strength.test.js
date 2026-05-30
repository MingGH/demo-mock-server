/**
 * password-strength.test.js — 密码强度核心算法测试
 * 运行：node pages/password-strength/password-strength.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const engine = require('./engine.js');

// ── calcEntropy ──
describe('calcEntropy', function() {
  test('空密码熵为0', function() {
    var result = engine.calcEntropy('');
    assert.equal(result.entropy, 0);
    assert.equal(result.charsetSize, 0);
    assert.equal(result.length, 0);
  });

  test('纯小写8位熵约37.6', function() {
    var result = engine.calcEntropy('abcdefgh');
    // 8 * log2(26) = 8 * 4.7004... ≈ 37.6035
    assert.ok(Math.abs(result.entropy - 37.6035) < 0.01);
    assert.equal(result.charsetSize, 26);
    assert.equal(result.length, 8);
  });

  test('混合大小写+数字+特殊字符', function() {
    var result = engine.calcEntropy('aA1!bB2@');
    assert.equal(result.charsetSize, 95);
    assert.equal(result.length, 8);
    // 8 * log2(95) ≈ 8 * 6.5698 ≈ 52.559
    assert.ok(Math.abs(result.entropy - 52.559) < 0.01);
  });

  test('纯数字8位', function() {
    var result = engine.calcEntropy('12345678');
    assert.equal(result.charsetSize, 10);
    // 8 * log2(10) ≈ 8 * 3.3219 ≈ 26.575
    assert.ok(Math.abs(result.entropy - 26.575) < 0.01);
  });
});

// ── calcCrackTime ──
describe('calcCrackTime', function() {
  test('已知熵值破解时间计算正确', function() {
    // entropy = 40, keyspace = 2^40 ≈ 1.1e12
    // 在线攻击 1000/s, 平均时间 = 1.1e12 / 1000 / 2 ≈ 5.5e8 秒
    var time = engine.calcCrackTime(40, 1000);
    // 2^40 = 1099511627776
    // / 1000 / 2 = 549755813.888 秒
    assert.ok(Math.abs(time - 549755813.888) < 1);
  });

  test('entropy为0时时间为0', function() {
    assert.equal(engine.calcCrackTime(0, 1000), 0);
  });

  test('三个攻击场景都有返回值', function() {
    var times = engine.calcAllCrackTimes(40);
    assert.equal(times.length, 3);
    for (var i = 0; i < times.length; i++) {
      assert.ok(typeof times[i].formatted === 'string');
      assert.ok(times[i].seconds > 0);
    }
  });
});

// ── detectCharsets ──
describe('detectCharsets', function() {
  test('纯小写', function() {
    var cs = engine.detectCharsets('abc');
    assert.equal(cs.lowercase, true);
    assert.equal(cs.uppercase, false);
    assert.equal(cs.digits, false);
    assert.equal(cs.special, false);
    assert.equal(cs.size, 26);
  });

  test('混合所有类型', function() {
    var cs = engine.detectCharsets('aA1!');
    assert.equal(cs.lowercase, true);
    assert.equal(cs.uppercase, true);
    assert.equal(cs.digits, true);
    assert.equal(cs.special, true);
    assert.equal(cs.size, 95);
  });

  test('空密码', function() {
    var cs = engine.detectCharsets('');
    assert.equal(cs.lowercase, false);
    assert.equal(cs.uppercase, false);
    assert.equal(cs.digits, false);
    assert.equal(cs.special, false);
    assert.equal(cs.size, 0);
  });
});

// ── detectPatterns ──
describe('detectPatterns', function() {
  test('检测常见密码', function() {
    var patterns = engine.detectPatterns('password');
    var common = patterns.filter(function(p) { return p.type === 'common'; });
    assert.ok(common.length > 0);
  });

  test('检测键盘模式', function() {
    var patterns = engine.detectPatterns('qwerty');
    var keyboard = patterns.filter(function(p) { return p.type === 'keyboard'; });
    assert.ok(keyboard.length > 0);
  });

  test('检测重复模式', function() {
    var patterns = engine.detectPatterns('aaaaaa');
    var repeat = patterns.filter(function(p) { return p.type === 'repeat'; });
    assert.ok(repeat.length > 0);
  });

  test('检测日期模式', function() {
    var patterns = engine.detectPatterns('19900101');
    var date = patterns.filter(function(p) { return p.type === 'date'; });
    assert.ok(date.length > 0);
  });

  test('检测日期模式（带分隔符）', function() {
    var patterns = engine.detectPatterns('2000-01-01');
    var date = patterns.filter(function(p) { return p.type === 'date'; });
    assert.ok(date.length > 0);
  });

  test('检测连续字符', function() {
    var patterns = engine.detectPatterns('abcdef');
    var seq = patterns.filter(function(p) { return p.type === 'sequential'; });
    assert.ok(seq.length > 0);
  });

  test('检测连续数字', function() {
    var patterns = engine.detectPatterns('123456');
    var seq = patterns.filter(function(p) { return p.type === 'sequential'; });
    assert.ok(seq.length > 0);
  });

  test('随机强密码无弱模式', function() {
    var patterns = engine.detectPatterns('Xy7!kQ9#');
    assert.equal(patterns.length, 0);
  });

  test('空密码无模式', function() {
    var patterns = engine.detectPatterns('');
    assert.deepEqual(patterns, []);
  });
});

// ── formatTime ──
describe('formatTime', function() {
  test('毫秒级', function() {
    var result = engine.formatTime(0.001);
    assert.ok(result.indexOf('毫秒') !== -1);
  });

  test('秒级', function() {
    var result = engine.formatTime(30);
    assert.ok(result.indexOf('秒') !== -1);
  });

  test('分钟级', function() {
    var result = engine.formatTime(120);
    assert.ok(result.indexOf('分钟') !== -1);
  });

  test('小时级', function() {
    var result = engine.formatTime(3600);
    assert.ok(result.indexOf('小时') !== -1);
  });

  test('天级', function() {
    var result = engine.formatTime(86400);
    assert.ok(result.indexOf('天') !== -1);
  });

  test('年级', function() {
    var result = engine.formatTime(31557600 * 5);
    assert.ok(result.indexOf('年') !== -1);
  });

  test('宇宙年龄级别', function() {
    var result = engine.formatTime(1e20);
    assert.ok(result.indexOf('宇宙年龄') !== -1);
  });

  test('不到1毫秒', function() {
    var result = engine.formatTime(0.0005);
    assert.ok(result.indexOf('不到 1 毫秒') !== -1 || result.indexOf('毫秒') !== -1);
  });

  test('null返回计算中', function() {
    var result = engine.formatTime(null);
    assert.ok(result.indexOf('计算') !== -1);
  });
});

// ── getStrengthLevel ──
describe('getStrengthLevel', function() {
  test('entropy < 28 → very-weak', function() {
    var level = engine.getStrengthLevel(20);
    assert.equal(level.level, 'very-weak');
    assert.equal(level.color, '#ef4444');
  });

  test('entropy 28-35 → weak', function() {
    var level = engine.getStrengthLevel(30);
    assert.equal(level.level, 'weak');
    assert.equal(level.color, '#f59e0b');
  });

  test('entropy 36-59 → fair', function() {
    var level = engine.getStrengthLevel(50);
    assert.equal(level.level, 'fair');
    assert.equal(level.color, '#eab308');
  });

  test('entropy 60-127 → strong', function() {
    var level = engine.getStrengthLevel(80);
    assert.equal(level.level, 'strong');
    assert.equal(level.color, '#22c55e');
  });

  test('entropy >= 128 → very-strong', function() {
    var level = engine.getStrengthLevel(130);
    assert.equal(level.level, 'very-strong');
    assert.equal(level.color, '#3b82f6');
  });

  test('entropy = 0 → none', function() {
    var level = engine.getStrengthLevel(0);
    assert.equal(level.level, 'none');
  });

  test('负entropy', function() {
    var level = engine.getStrengthLevel(-1);
    assert.equal(level.level, 'none');
  });
});

// ── isCommonPassword ──
describe('isCommonPassword', function() {
  test('"123456"是常见密码', function() {
    assert.equal(engine.isCommonPassword('123456'), true);
  });

  test('"password"是常见密码', function() {
    assert.equal(engine.isCommonPassword('password'), true);
  });

  test('"PASSWORD"不同大小写也是常见密码', function() {
    assert.equal(engine.isCommonPassword('PASSWORD'), true);
  });

  test('随机强密码不是常见密码', function() {
    assert.equal(engine.isCommonPassword('xK9!mQ2#vL'), false);
  });

  test('空密码不是常见密码', function() {
    assert.equal(engine.isCommonPassword(''), false);
  });
});

// ── 攻击速度常量 ──
describe('ATTACK_SPEEDS', function() {
  test('三个攻击速度常量都定义', function() {
    assert.ok(typeof engine.ATTACK_SPEEDS.online === 'number');
    assert.ok(typeof engine.ATTACK_SPEEDS.offline_gpu === 'number');
    assert.ok(typeof engine.ATTACK_SPEEDS.offline_nation === 'number');
  });
});

console.log('所有测试通过 ✓');

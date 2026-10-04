/**
 * uuid-collision-lab engine.js 纯逻辑测试。
 * 运行：node pages/uuid-collision-lab/engine.test.js
 */
(function () {
  'use strict';

  var E = require('./engine.js');
  var passed = 0;
  var failed = 0;

  function assert(condition, message) {
    if (condition) {
      passed++;
      console.log('✅ ' + message);
    } else {
      failed++;
      console.error('❌ ' + message);
    }
  }

  function assertEqual(actual, expected, message) {
    if (actual === expected) {
      passed++;
      console.log('✅ ' + message);
    } else {
      failed++;
      console.error('❌ ' + message + ' | expected=' + expected + ' actual=' + actual);
    }
  }

  assertEqual(E.TARGET_ROW_COUNT, 100000000, '目标行数是 1 亿');
  assertEqual(E.TRIM_THRESHOLD, 1000000, '裁剪阈值是 100 万');
  assertEqual(E.expectedPairs(100), 4950, '两两比较数公式正确');
  assertEqual(E.expectedPairs(1), 0, '单条没有比较对');
  assert(E.collisionProbability(100000000) > 9e-22 && E.collisionProbability(100000000) < 9.5e-22,
    '1 亿条 122 位 UUID 冲突概率约为 9.4e-22');
  assertEqual(E.collisionProbability(1), 0, '单条冲突概率为 0');
  assertEqual(E.formatInteger(1234567), '1,234,567', '整数格式化带千分位');
  assertEqual(E.formatPercent(25.004), '25.00%', '百分比格式化');
  assert(E.formatProbability(E.collisionProbability(100000000)).indexOf('× 10⁻') > 0,
    '极小概率用科学计数法显示');
  assertEqual(E.formatDuration(1234), '1.23 s', '秒级耗时格式化');
  assertEqual(E.rawBytes(100000000), '1.49 GiB', '1 亿条原始 16 字节负载为 1.49 GiB');
  assertEqual(E.normalizeUuidInput('550E8400-E29B-41D4-A716-446655440000'),
    '550e8400-e29b-41d4-a716-446655440000', 'UUID 支持大写并规范化');
  assertEqual(E.normalizeUuidInput('550e8400e29b41d4a716446655440000'),
    '550e8400-e29b-41d4-a716-446655440000', 'UUID 支持无连字符');
  assertEqual(E.normalizeUuidInput('not-a-uuid'), null, '非法 UUID 返回 null');
  assertEqual(E.normalizeUuidInput('550e8400-e29b-11d4-a716-446655440000'), null,
    '非 UUIDv4 返回 null');
  assertEqual(E.insertSpeedPerSecond(500, 1000), 500, '实际插入速度按 insertedCount 计算');
  assertEqual(E.insertSpeedPerSecond(1000, 0), 0, '耗时为 0 时速度为 0');
  assertEqual(E.insertSpeedPerSecond(0, 1000), 0, '插入数为 0 时速度为 0');
  assertEqual(E.API_BASE, 'https://numfeel-api.996.ninja', '生产 API 地址正确');

  console.log('\n通过 ' + passed + ' 个，失败 ' + failed + ' 个');
  if (failed > 0) process.exit(1);
})();

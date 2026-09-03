/**
 * crud-race engine.js 纯逻辑测试 — node 直接运行，无测试框架依赖。
 * 运行：node pages/crud-race/engine.test.js
 */
(function () {
  'use strict';

  var E = require('./engine.js');

  var passed = 0;
  var failed = 0;

  function assert(cond, msg) {
    if (cond) { passed++; console.log('✅ ' + msg); }
    else { failed++; console.error('❌ ' + msg); }
  }

  function assertEqual(actual, expected, msg) {
    if (actual === expected) { passed++; console.log('✅ ' + msg); }
    else { failed++; console.error('❌ ' + msg + ' | 期望: ' + expected + ' 实际: ' + actual); }
  }

  // ── seed 生成 ──

  assertEqual(E.keyOf(0), 'k0000000', 'keyOf(0) 格式');
  assertEqual(E.keyOf(42), 'k0000042', 'keyOf(42) 格式');
  assertEqual(E.keyOf(999999), 'k0999999', 'keyOf(999999) 格式');

  // 手工按后端 Java 公式算出的期望值：h = 42 * 2654435761 & 0xFFFFFFFF = 4112119562
  // (h>>>18)%10000 = 5686, (h>>>7)%100000 = 25934, h%1000 = 562
  assertEqual(E.valueOf(42), 'user-5686|item-25934|amt-562|paid', 'valueOf(42) 与后端公式一致');

  // 再抽一个数验证公式移植：i = 7
  // h = (7 * 2654435761) & 0xFFFFFFFF = 18581050327 - 4*4294967296 = 1401181143
  // >>>18: floor(1401181143/262144) = 5345; %10000 = 5345
  // >>>7: floor(1401181143/128) = 10946727; %100000 = 46727
  // %1000 = 143
  assertEqual(E.valueOf(7), 'user-5345|item-46727|amt-143|paid', 'valueOf(7) 与后端公式一致');

  assert(E.valueOf(1) !== E.valueOf(2), '不同序号的 value 不同');
  assert(E.valueOf(123) === E.valueOf(123), '同序号 value 确定');

  // ── 文本文件引擎 ──

  var eng = E.createTextFileEngine();
  eng.loadSeed(8);

  assertEqual(eng.size(), 8, '载入 8 行');
  assert(eng.bytes() > 0, '文件字节数 > 0');
  assertEqual(eng.getAll().length, 8, 'getAll 返回 8 行');

  // 查询：命中
  var hit = eng.get('k0000003');
  assert(hit.found === true, '查询命中已存在的 key');
  assertEqual(hit.value, E.valueOf(3), '命中行 value 正确');
  assertEqual(hit.scanned, 4, '扫描到第 4 行命中（scanned = i+1）');

  // 查询：未命中
  var miss = eng.get('k9999999');
  assert(miss.found === false, '查询未命中');
  assertEqual(miss.scanned, 8, '未命中扫完整个文件（8 行）');

  // 查询：平均扫描行数约为 N/2（统计意义上）
  eng.loadSeed(100);
  var total = 0;
  var keys = ['k0000010', 'k0000050', 'k0000099', 'k0000000', 'k0000075'];
  for (var i = 0; i < keys.length; i++) total += eng.get(keys[i]).scanned;
  assert(total > 0 && total < 5 * 100, '扫描行数介于 0 和 N 之间');

  // 插入：追加一行
  eng.loadSeed(8);
  eng.insert('k1000000', 'user-0000|item-00000|amt-000|paid');
  assertEqual(eng.size(), 9, '插入后 9 行');
  assert(eng.get('k1000000').found, '插入的 key 可查到');
  assertEqual(eng.writtenCount(), 1, '插入只写 1 行（追加）');

  // 更新：全量重写（写放大）
  eng.loadSeed(100);
  var updated = eng.update('k0000050', 'new-value');
  assert(updated === true, '更新命中');
  assertEqual(eng.get('k0000050').value, 'new-value', '更新后值已替换');
  assertEqual(eng.writtenCount(), 100, '更新 1 行 = 重写整个文件（100 行写放大）');
  assertEqual(eng.size(), 100, '更新不改变行数');

  // 更新：未命中
  assert(eng.update('k9999999', 'x') === false, '更新未命中返回 false');

  // 删除：全量重写
  eng.loadSeed(100);
  var removed = eng.remove('k0000010');
  assert(removed === true, '删除命中');
  assertEqual(eng.size(), 99, '删除后 99 行');
  assert(eng.get('k0000010').found === false, '删除后查不到');
  assertEqual(eng.writtenCount(), 99, '删除 1 行 = 重写剩余 99 行');

  // 删除：未命中不产生写放大
  assert(eng.remove('k9999999') === false, '删除未命中返回 false');
  assertEqual(eng.writtenCount(), 99, '未命中删除不写文件');

  // ── 格式化 ──

  assertEqual(E.formatMs(0.0004), '<0.001 ms', 'formatMs 极小值');
  assertEqual(E.formatMs(0.5), '0.50 ms', 'formatMs 亚毫秒');
  assertEqual(E.formatMs(123.4), '123 ms', 'formatMs 毫秒');
  assertEqual(E.formatMs(2345), '2.35 s', 'formatMs 秒');
  assertEqual(E.formatBytes(500), '500 B', 'formatBytes 字节');
  assertEqual(E.formatBytes(4096), '4.0 KB', 'formatBytes KB');
  assertEqual(E.formatBytes(4 * 1024 * 1024), '4.00 MB', 'formatBytes MB');
  assertEqual(E.ratioText(100, 1), '×100', 'ratioText 倍率');
  assertEqual(E.ratioText(0, 1), '—', 'ratioText 无基准');
  assertEqual(E.formatQps(1234.5), '1,235 /s', 'formatQps 千分位');

  // ── 引擎元数据 ──

  assert(E.ENGINE_META.text && E.ENGINE_META.mysql && E.ENGINE_META.caffeine && E.ENGINE_META.indexeddb,
    '四个引擎元数据齐全');
  assertEqual(E.API_BASE, 'https://numfeel-api.996.ninja', 'API_BASE 是生产地址');

  // ── 汇总 ──

  console.log('\n通过 ' + passed + ' 个，失败 ' + failed + ' 个');
  if (failed > 0) process.exit(1);
})();

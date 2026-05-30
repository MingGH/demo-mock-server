const engine = require('./ipv8-lab/engine.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

console.log('\n[地址转换]');

test('ASN 64496 转成点分前缀', () => {
  assertEqual(engine.asnToPrefix(64496), '0.0.251.240');
});

test('IPv4 子集表达正确', () => {
  assertEqual(engine.buildIpv4SubsetAddress('192.168.5.1'), '0.0.0.0.192.168.5.1');
});

test('IPv8 地址拼接正确', () => {
  assertEqual(engine.buildIpv8Address(64496, '192.168.5.1'), '0.0.251.240.192.168.5.1');
});

test('ASN 点分表示正确', () => {
  assertEqual(engine.buildAsnDotNotation(64496, '192.168.5.1'), '64496.192.168.5.1');
});

test('非法 IPv4 会抛错', () => {
  let thrown = false;
  try {
    engine.buildIpv8Address(1, '300.1.1.1');
  } catch (error) {
    thrown = true;
  }
  assert(thrown, '应当抛出异常');
});

console.log('\n[流程模拟]');

test('所有条件满足时允许放行', () => {
  const result = engine.evaluateConnectionFlow({
    hasDhcpLease: true,
    hasToken: true,
    hasDnsLookup: true,
    hasWhoisRoute: true,
    usesLiteralIp: false,
    clientStack: 'ipv4-app'
  });
  assertEqual(result.status, 'allowed');
  assert(result.steps.every(step => step.passed), '所有步骤都应通过');
});

test('没有 DNS8 查询时会被拦下', () => {
  const result = engine.evaluateConnectionFlow({
    hasDhcpLease: true,
    hasToken: true,
    hasDnsLookup: false,
    hasWhoisRoute: true,
    usesLiteralIp: false
  });
  assertEqual(result.status, 'blocked');
  assert(result.summary.includes('DNS8'), '摘要应提到 DNS8');
});

test('直接连硬编码 IP 时会卡在 DNS8', () => {
  const result = engine.evaluateConnectionFlow({
    hasDhcpLease: true,
    hasToken: true,
    hasDnsLookup: true,
    hasWhoisRoute: true,
    usesLiteralIp: true
  });
  assertEqual(result.status, 'blocked');
  assert(result.steps[2].detail.includes('硬编码 IP'), '应提示硬编码 IP');
});

test('WHOIS8 验证失败时出口阻断', () => {
  const result = engine.evaluateConnectionFlow({
    hasDhcpLease: true,
    hasToken: true,
    hasDnsLookup: true,
    hasWhoisRoute: false,
    usesLiteralIp: false
  });
  assertEqual(result.status, 'blocked');
  assert(result.summary.includes('WHOIS8'), '摘要应提到 WHOIS8');
});

console.log('\n[迁移算账]');

test('高兼容诉求 + 低改造抗拒时偏向 attractive', () => {
  const result = engine.calculateMigrationScore({
    legacyDependence: 90,
    compatibilityDesire: 88,
    fragmentationPain: 70,
    securityTolerance: 72,
    ipv6Satisfaction: 20,
    changeAversion: 18
  });
  assertEqual(result.verdict, 'attractive');
  assert(result.attraction > result.friction, '兼容诱惑应更高');
});

test('高组织阻力 + 高 IPv6 满意度时偏向 resistant', () => {
  const result = engine.calculateMigrationScore({
    legacyDependence: 20,
    compatibilityDesire: 25,
    fragmentationPain: 30,
    securityTolerance: 20,
    ipv6Satisfaction: 90,
    changeAversion: 88
  });
  assertEqual(result.verdict, 'resistant');
  assert(result.friction > result.attraction, '落地阻力应更高');
});

test('中间参数时落在 mixed', () => {
  const result = engine.calculateMigrationScore({
    legacyDependence: 60,
    compatibilityDesire: 55,
    fragmentationPain: 55,
    securityTolerance: 45,
    ipv6Satisfaction: 50,
    changeAversion: 58
  });
  assertEqual(result.verdict, 'mixed');
});

console.log(`\n结果：${passed} 通过，${failed} 失败\n`);
if (failed > 0) {
  process.exit(1);
}

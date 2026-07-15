/**
 * DNS 解析演示 - 单元测试
 * 运行: node pages/dns-resolve.test.js
 */

// ── Core functions (re-declared for testing, matching the HTML page logic) ──

// 1. HOSTS.TXT 线性查找：模拟早期互联网主机名解析
function linearSearch(hostsArray, queryName) {
  var query = (queryName || '').toLowerCase();
  for (var i = 0; i < hostsArray.length; i++) {
    if (hostsArray[i].name.toLowerCase() === query) {
      return { found: true, ip: hostsArray[i].ip, stepsScanned: i + 1 };
    }
  }
  return { found: false, ip: null, stepsScanned: hostsArray.length };
}

// 2. DNS 层级解析：模拟浏览器 -> 递归解析器 -> 根 -> TLD -> 权威 的完整流程
function dnsResolve(domain) {
  var ipMap = {
    'www.zhihu.com': '118.89.204.198',
    'docs.google.com': '142.250.80.46',
    'api.github.com': '140.82.121.6'
  };
  var finalIp = ipMap[domain] || '0.0.0.0';

  var parts = domain.split('.');
  var host = parts[0];                          // www / docs / api
  var tld = parts[parts.length - 1];            // com
  var domainZone = parts.slice(1).join('.');    // zhihu.com / google.com / github.com

  // 延迟值包含了请求+响应的完整往返时间,总计 ≈80ms 与页面展示一致
  var steps = [
    { from: '浏览器', to: '递归解析器', query: '请问 ' + domain + ' 在哪?', response: '我去查一下', latencyMs: 1 },
    { from: '递归解析器', to: '根服务器', query: '谁管 .' + tld + '?', response: '去问 192.5.6.30', latencyMs: 28 },
    { from: '递归解析器', to: '.' + tld + ' 顶级域', query: '谁管 ' + domainZone + '?', response: '去问 ns1.' + domainZone, latencyMs: 22 },
    { from: '递归解析器', to: '权威服务器', query: host + ' 的 A 记录?', response: finalIp, latencyMs: 22 },
    { from: '递归解析器', to: '浏览器', query: '结果是 ' + finalIp, response: '收到', latencyMs: 7 }
  ];

  var totalLatencyMs = 0;
  for (var i = 0; i < steps.length; i++) {
    totalLatencyMs += steps[i].latencyMs;
  }

  return {
    steps: steps,
    totalLatencyMs: totalLatencyMs,
    totalQueries: 4
  };
}

// 3. HOSTS.TXT 文件大小估算：假设每条记录平均 30 字节
function calculateHostsFileSize(domainCount) {
  var bytes = domainCount * 30;
  var megabytes = bytes / (1024 * 1024);
  var gigabytes = bytes / (1024 * 1024 * 1024);
  var downloadTimeAt100Mbps_seconds = bytes / (100 * 1024 * 1024 / 8);
  return {
    bytes: bytes,
    megabytes: megabytes,
    gigabytes: gigabytes,
    downloadTimeAt100Mbps_seconds: downloadTimeAt100Mbps_seconds
  };
}

// 4. 带缓存的 DNS 解析：命中缓存则 1ms 返回，否则走完整 DNS 流程
function resolveWithCache(domain, cache) {
  var entry = cache[domain];
  if (entry && entry.expiry > Date.now()) {
    return { cached: true, ip: entry.ip, latencyMs: 1 };
  }
  var result = dnsResolve(domain);
  return {
    cached: false,
    steps: result.steps,
    totalLatencyMs: result.totalLatencyMs,
    totalQueries: result.totalQueries
  };
}

// ── Test framework ──
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log('  \x1b[32m✓\x1b[0m ' + msg);
  } else {
    failed++;
    console.log('  \x1b[31m✗\x1b[0m ' + msg);
  }
}

function assertApprox(actual, expected, tolerance, msg) {
  var diff = Math.abs(actual - expected);
  assert(diff <= tolerance, msg + ' (got ' + actual + ', expected ~' + expected + ')');
}

// ── Test cases ──

console.log('\n\x1b[1mDNS 解析演示 - 单元测试\x1b[0m\n');

// Test linearSearch
console.log('\x1b[36mlinearSearch:\x1b[0m');

var hosts = [
  { name: 'localhost', ip: '127.0.0.1' },
  { name: 'router', ip: '192.168.1.1' },
  { name: 'printer', ip: '192.168.1.50' },
  { name: 'nas', ip: '192.168.1.100' },
  { name: 'server', ip: '10.0.0.1' }
];

// Find first element
var r1 = linearSearch(hosts, 'localhost');
assert(r1.found === true, '查找第一个元素 localhost - found=true');
assert(r1.ip === '127.0.0.1', '查找第一个元素 localhost - ip=127.0.0.1');
assert(r1.stepsScanned === 1, '查找第一个元素 - stepsScanned=1');

// Find last element
var r2 = linearSearch(hosts, 'server');
assert(r2.found === true, '查找最后一个元素 server - found=true');
assert(r2.ip === '10.0.0.1', '查找最后一个元素 server - ip=10.0.0.1');
assert(r2.stepsScanned === 5, '查找最后一个元素 - stepsScanned=5');

// Find middle element
var r3 = linearSearch(hosts, 'printer');
assert(r3.found === true, '查找中间元素 printer - found=true');
assert(r3.ip === '192.168.1.50', '查找中间元素 printer - ip=192.168.1.50');
assert(r3.stepsScanned === 3, '查找中间元素 - stepsScanned=3');

// Not found
var r4 = linearSearch(hosts, 'unknown');
assert(r4.found === false, '未找到元素 - found=false');
assert(r4.ip === null, '未找到元素 - ip=null');
assert(r4.stepsScanned === 5, '未找到元素 - stepsScanned=5(扫描全部)');

// Empty array
var r5 = linearSearch([], 'localhost');
assert(r5.found === false, '空数组 - found=false');
assert(r5.ip === null, '空数组 - ip=null');
assert(r5.stepsScanned === 0, '空数组 - stepsScanned=0');

// Case sensitivity (case-insensitive)
var r6 = linearSearch(hosts, 'LOCALHOST');
assert(r6.found === true, '大小写不敏感 LOCALHOST - found=true');
assert(r6.ip === '127.0.0.1', '大小写不敏感 LOCALHOST - ip=127.0.0.1');
var r7 = linearSearch(hosts, 'Router');
assert(r7.found === true, '大小写不敏感 Router - found=true');
assert(r7.stepsScanned === 2, '大小写不敏感 Router - stepsScanned=2');

// Test dnsResolve
console.log('\x1b[36mdnsResolve:\x1b[0m');

// Resolve www.zhihu.com
var z = dnsResolve('www.zhihu.com');
assert(z.totalQueries === 4, 'www.zhihu.com - totalQueries=4');
assertApprox(z.totalLatencyMs, 80, 1, 'www.zhihu.com - 总延迟~80ms');
assert(z.steps.length === 5, 'www.zhihu.com - steps长度=5(含递归->浏览器)');
assert(z.steps[0].from === '浏览器', 'www.zhihu.com - 第一步from=浏览器');
assert(z.steps[3].response === '118.89.204.198', 'www.zhihu.com - 权威服务器响应包含IP');
var zLast = z.steps[z.steps.length - 1];
assert(zLast.query.indexOf('118.89.204.198') !== -1, 'www.zhihu.com - 最后一步query包含IP');

// Resolve docs.google.com
var g = dnsResolve('docs.google.com');
assert(g.totalQueries === 4, 'docs.google.com - totalQueries=4');
assert(g.steps.length === 5, 'docs.google.com - steps长度=5');
assert(g.steps[3].response === '142.250.80.46', 'docs.google.com - 权威服务器响应=142.250.80.46');
assertApprox(g.totalLatencyMs, 80, 1, 'docs.google.com - 总延迟~80ms');

// Resolve api.github.com
var a = dnsResolve('api.github.com');
assert(a.totalQueries === 4, 'api.github.com - totalQueries=4');
assert(a.steps.length === 5, 'api.github.com - steps长度=5');
assert(a.steps[3].response === '140.82.121.6', 'api.github.com - 权威服务器响应=140.82.121.6');
assertApprox(a.totalLatencyMs, 80, 1, 'api.github.com - 总延迟~80ms');

// Step structure sanity: first step query contains domain, last step to is 浏览器
assert(z.steps[0].query.indexOf('www.zhihu.com') !== -1, 'www.zhihu.com - 第一步query包含域名');
assert(zLast.to === '浏览器', 'www.zhihu.com - 最后一步to=浏览器');

// Test calculateHostsFileSize
console.log('\x1b[36mcalculateHostsFileSize:\x1b[0m');

// 40 domains (1973 ARPANET)
var s1 = calculateHostsFileSize(40);
assert(s1.bytes === 1200, '40个域名(1973 ARPANET) - bytes=1200');
assert(s1.megabytes < 1, '40个域名 - 文件很小(<1MB)');

// 500 domains (1982)
var s2 = calculateHostsFileSize(500);
assert(s2.bytes === 15000, '500个域名(1982) - bytes=15000');
assert(s2.megabytes < 1, '500个域名 - 文件仍很小(<1MB)');

// 350,000,000 domains (today)
var s3 = calculateHostsFileSize(350000000);
assert(s3.bytes === 10500000000, '3.5亿域名 - bytes=10,500,000,000');
assertApprox(s3.gigabytes, 9.77, 0.1, '3.5亿域名 - ~9.77GB(约10GB)');
assertApprox(s3.downloadTimeAt100Mbps_seconds, 801, 10, '3.5亿域名 - 100Mbps下载~801秒(±10)');
assertApprox(s3.downloadTimeAt100Mbps_seconds / 60, 13.4, 0.5, '3.5亿域名 - 约13.4分钟');

// Test resolveWithCache
console.log('\x1b[36mresolveWithCache:\x1b[0m');

var futureExpiry = Date.now() + 60000;
var pastExpiry = Date.now() - 60000;

// Cache hit: domain in cache, not expired
var cache1 = { 'www.zhihu.com': { ip: '118.89.204.198', expiry: futureExpiry } };
var c1 = resolveWithCache('www.zhihu.com', cache1);
assert(c1.cached === true, '缓存命中 - cached=true');
assert(c1.ip === '118.89.204.198', '缓存命中 - ip=118.89.204.198');
assert(c1.latencyMs === 1, '缓存命中 - latencyMs=1');

// Cache miss: domain not in cache
var cache2 = {};
var c2 = resolveWithCache('www.zhihu.com', cache2);
assert(c2.cached === false, '缓存未命中(不在缓存) - cached=false');
assert(c2.totalQueries === 4, '缓存未命中 - 走完整DNS(totalQueries=4)');
assertApprox(c2.totalLatencyMs, 80, 1, '缓存未命中 - 总延迟~80ms');

// Cache expired: domain in cache but expired
var cache3 = { 'www.zhihu.com': { ip: '118.89.204.198', expiry: pastExpiry } };
var c3 = resolveWithCache('www.zhihu.com', cache3);
assert(c3.cached === false, '缓存过期 - cached=false');
assert(c3.totalQueries === 4, '缓存过期 - 走完整DNS(totalQueries=4)');

// Cache hit for one domain while another misses
var cache4 = {
  'www.zhihu.com': { ip: '118.89.204.198', expiry: futureExpiry }
};
var c4a = resolveWithCache('www.zhihu.com', cache4);
var c4b = resolveWithCache('docs.google.com', cache4);
assert(c4a.cached === true, 'www.zhihu.com 命中缓存 - cached=true');
assert(c4a.ip === '118.89.204.198', 'www.zhihu.com 命中缓存 - ip正确');
assert(c4a.latencyMs === 1, 'www.zhihu.com 命中缓存 - latencyMs=1');
assert(c4b.cached === false, 'docs.google.com 未命中缓存 - cached=false');
assert(c4b.totalQueries === 4, 'docs.google.com 未命中 - 走完整DNS(totalQueries=4)');

// ── Results ──
console.log('\n' + '═'.repeat(40));
console.log('\x1b[1m结果: ' + passed + ' 通过, ' + failed + ' 失败\x1b[0m');
if (failed > 0) {
  process.exit(1);
} else {
  console.log('\x1b[32m全部通过!\x1b[0m\n');
}

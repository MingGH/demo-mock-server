/**
 * cipher-ambiguity 引擎单元测试
 * 运行：node engine.test.js
 */
const {
  CIPHERTEXT, OTP_KEY_COUNT, OTP_PLAINTEXTS, decryptOtp, countDistinctTexts, keySpace, buildSummary
} = require('./engine.js');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

console.log('\n📍 密文与映射表');
{
  assert(CIPHERTEXT.split(' ').every((h) => /^[0-9A-F]{2}$/.test(h)), '密文格式合法（8 字节十六进制）');
  assert(OTP_KEY_COUNT === 16, '转盘 16 档（4 位密钥）');
  assert(OTP_PLAINTEXTS.length === 8, '8 种真相明文');
  assert(new Set(OTP_PLAINTEXTS).size === 8, '8 种真相互不相同');
}

console.log('\n📍 decryptOtp / countDistinctTexts');
{
  assert(decryptOtp(0).keyIndex === 0, '0 号档位原样返回');
  assert(decryptOtp(-1).keyIndex === 15, '负数档位折回末尾');
  assert(decryptOtp(16).keyIndex === 0, '越界档位折回开头');
  assert(decryptOtp(3.6).keyIndex === 4, '小数档位四舍五入');
  const all = [];
  for (let i = 0; i < OTP_KEY_COUNT; i++) all.push(decryptOtp(i));
  assert(countDistinctTexts(all) === 8, '16 把钥匙恰好解出 8 种不同明文');
  assert(all.every((r) => r.truthIndex === r.keyIndex % 8), 'truthIndex 与档位映射一致');
  assert(decryptOtp(2).text === decryptOtp(10).text, '档位 2 与 10 解出同一真相（同余）');
  assert(countDistinctTexts([{ text: 'a' }, { text: 'a' }, { text: 'b' }]) === 2, 'countDistinctTexts 去重正确');
}

console.log('\n📍 keySpace 密钥空间');
{
  assert(keySpace(4).keys === 16, '4 位密钥 = 16 把');
  assert(keySpace(4).display === '16', '小空间显示精确数字');
  assert(keySpace(1).keys === 2 && keySpace(0).keys === 2, '位数下限收敛到 1');
  assert(keySpace(100).bits === 64, '位数上限收敛到 64');
  assert(keySpace(64).display.includes('10^19'), '64 位走科学计数法');
  assert(keySpace(128).bits === 64, '越界位数收敛');
  assert(keySpace(2.6).bits === 3, '小数位数四舍五入');
  assert(!Number.isNaN(keySpace(10).keys) && keySpace(10).keys === 1024, '10 位 = 1024');
}

console.log('\n📍 buildSummary 复制文案');
{
  const s = buildSummary({ triedCount: 18, foundCount: 8, totalTexts: 8, bits: 4 });
  assert(s.includes('18'), '小结包含尝试次数');
  assert(s.includes('8/8'), '小结包含收集进度');
  assert(s.includes('16'), '小结包含密钥空间');
  assert(!buildSummary({ triedCount: 0, foundCount: 0, totalTexts: 8, bits: 64 }).includes('10^19') === false, '大空间走科学计数法');
}

console.log(`\n结果：${passed} 通过，${failed} 失败`);
process.exit(failed ? 1 : 0);

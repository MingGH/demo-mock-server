// ========== Luhn 算法 单元测试 ==========
// 运行: node pages/luhn-lab/logic.test.js

const {
  normalizeDigits, luhnSum, luhnCheck, luhnCheckDigit,
  completeNumber, formatCardNumber, luhnSteps, detectCardType
} = require('./logic.js');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

// ── normalizeDigits ──
console.log('\n[normalizeDigits]');
assert(normalizeDigits('4242 4242 4242 4242') === '4242424242424242', '去空格');
assert(normalizeDigits('4242-4242-4242-4242') === '4242424242424242', '去横线');
assert(normalizeDigits('abc123') === null, '含字母 → null');
assert(normalizeDigits('') === null, '空串 → null');
assert(normalizeDigits(undefined) === null, '非字符串 → null');

// ── luhnCheck：已知真实测试号 ──
console.log('\n[luhnCheck 已知号码]');
assert(luhnCheck('4242424242424242') === true, 'Visa 测试号 4242424242424242 → true');
assert(luhnCheck('5555555555554444') === true, 'Mastercard 测试号 5555555555554444 → true');
assert(luhnCheck('378282246310005') === true, 'Amex 测试号 378282246310005 → true');
assert(luhnCheck('4111111111111111') === true, 'Visa 4111111111111111 → true');
assert(luhnCheck('4242 4242 4242 4242') === true, '带空格也通过');
assert(luhnCheck('4242424242424241') === false, '末位改 1 → false');
assert(luhnCheck('4242424242424243') === false, '末位改 3 → false');
assert(luhnCheck('1234567890') === false, '校验和不对 → false');
assert(luhnCheck('4242abcd42424242') === false, '含字母 → false');
assert(luhnCheck('0') === false, '单数字 → false');

// ── luhnCheckDigit / completeNumber：由前缀生成合法号 ──
console.log('\n[校验位生成]');
assert(luhnCheckDigit('424242424242424') === 2, '424242424242424 的校验位 = 2');
assert(luhnCheckDigit('555555555555444') === 4, '555555555555444 的校验位 = 4');
assert(completeNumber('4242 4242 4242 424') === '4242424242424242', '补全 = 4242424242424242');
assert(luhnCheck(completeNumber('424242424242424')) === true, '补全后必然通过校验');
assert(completeNumber('abc') === null, '非法前缀 → null');

// ── luhnSum ──
console.log('\n[luhnSum]');
assert(luhnSum('4242424242424242') % 10 === 0, '合法号校验和 %10 = 0');
assert(luhnSum([1, 8]) === 10, '[1,8] 校验和 = 10（18 是合法两位）');

// ── formatCardNumber ──
console.log('\n[formatCardNumber]');
assert(formatCardNumber('4242424242424242') === '4242 4242 4242 4242', '4 位分组');
assert(formatCardNumber('378282246310005') === '3782 8224 6310 005', 'Amex 15 位分组');

// ── luhnSteps 分步明细 ──
console.log('\n[luhnSteps 分步]');
{
  const r = luhnSteps('18');
  assert(r !== null, '返回明细');
  assert(r.steps.length === 2, '2 位 → 2 步');
  assert(r.steps[0].digit === 8 && r.steps[0].fromRight === 1 && !r.steps[0].doubled, '第1位(右) 8 不加倍');
  assert(r.steps[1].digit === 1 && r.steps[1].fromRight === 2 && r.steps[1].doubled && r.steps[1].transformed === 2, '第2位(右) 1 加倍 → 2');
  assert(r.sum === 10 && r.valid === true, 'sum=10 且 valid');
  assert(luhnSteps('abc') === null, '非法输入 → null');
}
{
  // 偶数位加倍且 >9 减 9：如 9 加倍 18 → 9
  const r = luhnSteps('95');
  assert(r.steps[1].raw === 18 && r.steps[1].transformed === 9, '9 加倍 18 → 减 9 = 9');
}

// ── 奇偶长度下的加倍奇偶性 ──
console.log('\n[luhnSteps 奇偶长度]');
{
  const even = luhnSteps('4242424242424242'); // 16 位
  const odd = luhnSteps('378282246310005');   // 15 位 Amex
  assert(even.steps[0].fromRight === 1 && !even.steps[0].doubled, '16 位最右（校验位）不加倍');
  assert(even.steps[15].fromRight === 16 && even.steps[15].doubled, '16 位最左（从右第16位）加倍');
  assert(odd.steps[0].fromRight === 1 && !odd.steps[0].doubled, '15 位最右（校验位）不加倍');
  assert(odd.steps[14].fromRight === 15 && !odd.steps[14].doubled, '15 位最左（从右第15位）不加倍');
  assert(odd.sum % 10 === 0 && odd.valid === true, '15 位 Amex 校验和 %10=0');
}

// ── detectCardType 卡组织识别 ──
console.log('\n[detectCardType]');
assert(detectCardType('4242424242424242')?.code === 'visa', '4242 → Visa');
assert(detectCardType('5555555555554444')?.code === 'mastercard', '5555 → Mastercard');
assert(detectCardType('378282246310005')?.code === 'amex', '3782 → Amex');
assert(detectCardType('6222021234567890')?.code === 'unionpay', '6222 → UnionPay');
assert(detectCardType('6011111111111117')?.code === 'discover', '6011 → Discover');
assert(detectCardType('1234') === null, '未知前缀 → null');
assert(detectCardType('abc') === null, '非法输入 → null');

// ── 结果 ──
console.log(`\n${'='.repeat(40)}`);
console.log(`结果: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);

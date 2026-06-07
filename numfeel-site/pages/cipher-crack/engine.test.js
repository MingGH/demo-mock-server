// ========== 密码破解算法 单元测试 ==========
// 运行: node pages/cipher-crack/engine.test.js

const {
  caesarEncrypt, caesarDecrypt,
  substitutionEncrypt, substitutionDecrypt, generateRandomMapping,
  vigenereEncrypt, vigenereDecrypt,
  letterFrequency, chiSquared,
  bruteForceCaesar, kasiskiExamination,
  indexOfCoincidence, icKeyLengthEstimate, crackVigenereWithLength,
  ENGLISH_FREQ
} = require('./engine.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.log(`  ✗ ${msg}`);
  }
}

function assertApprox(a, b, tolerance, msg) {
  assert(Math.abs(a - b) <= tolerance, `${msg} (got ${a}, expected ~${b})`);
}

// ── 凯撒密码 ──
console.log('\n[凯撒加密/解密]');
{
  assert(caesarEncrypt('HELLO', 3) === 'KHOOR', 'HELLO shift 3 → KHOOR');
  assert(caesarEncrypt('hello', 3) === 'khoor', '小写保持大小写');
  assert(caesarEncrypt('Hello, World!', 13) === 'Uryyb, Jbeyq!', 'ROT13 混合大小写和标点');
  assert(caesarDecrypt('KHOOR', 3) === 'HELLO', '解密 KHOOR shift 3 → HELLO');
  assert(caesarEncrypt('ABC', 0) === 'ABC', 'shift 0 不变');
  assert(caesarEncrypt('XYZ', 3) === 'ABC', '绕回: XYZ shift 3 → ABC');
  assert(caesarDecrypt(caesarEncrypt('Test message 123', 17), 17) === 'Test message 123', '加密解密互逆');
}

// ── 简单替换密码 ──
console.log('\n[简单替换]');
{
  const mapping = { A: 'Q', B: 'W', C: 'E', D: 'R', E: 'T', F: 'Y', G: 'U', H: 'I',
    I: 'O', J: 'P', K: 'A', L: 'S', M: 'D', N: 'F', O: 'G', P: 'H',
    Q: 'J', R: 'K', S: 'L', T: 'Z', U: 'X', V: 'C', W: 'V', X: 'B', Y: 'N', Z: 'M' };

  const encrypted = substitutionEncrypt('HELLO', mapping);
  assert(encrypted === 'ITSSG', 'HELLO → ITSSG');

  const decrypted = substitutionDecrypt(encrypted, mapping);
  assert(decrypted === 'HELLO', '解密回 HELLO');

  // 标点和数字不变
  assert(substitutionEncrypt('A 1 B!', mapping) === 'Q 1 W!', '标点数字不变');
}

// ── 随机映射 ──
console.log('\n[随机映射生成]');
{
  const m = generateRandomMapping();
  const keys = Object.keys(m);
  const vals = Object.values(m);
  assert(keys.length === 26, '有 26 个键');
  assert(new Set(vals).size === 26, '值不重复（双射）');
  assert(vals.every(v => v >= 'A' && v <= 'Z'), '值全为大写字母');
}

// ── Vigenère 密码 ──
console.log('\n[Vigenère 加密/解密]');
{
  // 经典测试：key = LEMON
  const plain = 'ATTACKATDAWN';
  const key = 'LEMON';
  const cipher = vigenereEncrypt(plain, key);
  assert(cipher === 'LXFOPVEFRNHR', 'ATTACKATDAWN + LEMON → LXFOPVEFRNHR');
  assert(vigenereDecrypt(cipher, key) === plain, '解密互逆');

  // 小写
  assert(vigenereDecrypt(vigenereEncrypt('hello world', 'key'), 'key') === 'hello world', '小写加解密');

  // 标点不影响密钥推进
  const p2 = 'AB CD';
  const c2 = vigenereEncrypt(p2, 'AB');
  // A+A=A, B+B=C, C+A=C, D+B=E
  assert(c2 === 'AC CE', '标点不消耗密钥位');
}

// ── 字母频率 ──
console.log('\n[字母频率计算]');
{
  const freq = letterFrequency('AAABBC');
  assertApprox(freq['A'], 50, 0.01, 'A 频率 50%');
  assertApprox(freq['B'], 33.33, 0.01, 'B 频率 33.33%');
  assertApprox(freq['C'], 16.67, 0.01, 'C 频率 16.67%');
  assert(freq['D'] === 0, 'D 频率 0%');

  // 大小写混合
  const freq2 = letterFrequency('aAbB');
  assertApprox(freq2['A'], 50, 0.01, '大小写混合: A 50%');
}

// ── 卡方统计 ──
console.log('\n[卡方统计]');
{
  // 完全匹配
  const chi0 = chiSquared(ENGLISH_FREQ, ENGLISH_FREQ);
  assertApprox(chi0, 0, 0.001, '完全匹配 → chi² ≈ 0');

  // 偏差越大，卡方值越大
  const shifted = {};
  for (const [k, v] of Object.entries(ENGLISH_FREQ)) shifted[k] = v + 1;
  const chi1 = chiSquared(shifted, ENGLISH_FREQ);
  assert(chi1 > 0, '有偏差 → chi² > 0');
}

// ── 暴力破解凯撒 ──
console.log('\n[暴力破解凯撒]');
{
  const plaintext = 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG';
  const shift = 7;
  const ciphertext = caesarEncrypt(plaintext, shift);
  const results = bruteForceCaesar(ciphertext);
  assert(results[0].shift === shift, `最佳偏移应为 ${shift}，得到 ${results[0].shift}`);
  assert(results[0].preview.startsWith('THE QUICK'), '解密预览正确');
}

// ── 重合指数 ──
console.log('\n[重合指数]');
{
  // 英文文本的 IC 应接近 0.0667
  const english = 'IN THE BEGINNING GOD CREATED THE HEAVEN AND THE EARTH AND THE EARTH WAS WITHOUT FORM AND VOID AND DARKNESS WAS UPON THE FACE OF THE DEEP';
  const ic = indexOfCoincidence(english);
  assertApprox(ic, 0.0667, 0.015, `英文 IC ≈ 0.0667 (got ${ic.toFixed(4)})`);

  // 完全均匀分布的 IC 应接近 1/26 ≈ 0.0385
  // 对于恰好 260 个字母（每个出现 10 次），IC = 26 * 10*9 / (260*259) = 2340/67340 ≈ 0.0347
  let uniform = '';
  for (let i = 0; i < 260; i++) uniform += String.fromCharCode(65 + (i % 26));
  const icU = indexOfCoincidence(uniform);
  assertApprox(icU, 0.0347, 0.005, `均匀分布 IC ≈ 0.035 (got ${icU.toFixed(4)})`);
}

// ── Kasiski 检验 ──
console.log('\n[Kasiski 检验]');
{
  // 用已知密钥加密足够长的文本
  const longText = 'THE SUN ALSO RISES EVERY MORNING AND THE BIRDS SING THEIR SONGS IN THE TREES THE WORLD GOES ON TURNING AND THE SEASONS CHANGE FROM WINTER TO SPRING';
  const key = 'SECRET';
  const cipher = vigenereEncrypt(longText, key);
  const kasiski = kasiskiExamination(cipher);
  // 密钥长度 6 应该是高分因子之一
  const found = kasiski.find(k => k.length === 6);
  assert(found !== undefined, 'Kasiski 找到因子 6');
  if (found) {
    assert(kasiski.indexOf(found) < 5, `密钥长度 6 排名前 5 (rank ${kasiski.indexOf(found) + 1})`);
  }
}

// ── IC 密钥长度估计 ──
console.log('\n[IC 密钥长度估计]');
{
  const longText = 'LADIES AND GENTLEMEN OF THE CLASS OF NINETY SEVEN WEAR SUNSCREEN IF I COULD OFFER YOU ONLY ONE TIP FOR THE FUTURE SUNSCREEN WOULD BE IT THE LONG TERM BENEFITS OF SUNSCREEN HAVE BEEN PROVED BY SCIENTISTS';
  const key = 'CRYPTO';
  const cipher = vigenereEncrypt(longText, key);
  const icResults = icKeyLengthEstimate(cipher, 12);
  // 密钥长度 6 应该排名靠前
  const rank = icResults.findIndex(r => r.length === 6);
  assert(rank >= 0 && rank < 4, `IC 估计密钥长度 6 排名前 4 (rank ${rank + 1})`);
}

// ── 完整 Vigenère 破解 ──
console.log('\n[完整 Vigenère 破解]');
{
  const longText = 'IT WAS THE BEST OF TIMES IT WAS THE WORST OF TIMES IT WAS THE AGE OF WISDOM IT WAS THE AGE OF FOOLISHNESS IT WAS THE EPOCH OF BELIEF IT WAS THE EPOCH OF INCREDULITY';
  const key = 'HACK';
  const cipher = vigenereEncrypt(longText, key);
  const crackedKey = crackVigenereWithLength(cipher, 4);
  assert(crackedKey === key, `破解密钥应为 ${key}，得到 ${crackedKey}`);
}

// ── 结果 ──
console.log(`\n${'='.repeat(40)}`);
console.log(`结果: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);

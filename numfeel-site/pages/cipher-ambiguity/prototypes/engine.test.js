/**
 * cipher-ambiguity 共享逻辑单元测试
 * 运行：node engine.test.js
 */
const {
  CIPHERTEXT, DUAL_KEYS, decryptByKey,
  OTP_KEY_COUNT, OTP_PLAINTEXTS, decryptOtp, countDistinctTexts,
  RABIN_GRID, rabinPick, rabinAllFound,
  INTERROGATION, interrogationChoice
} = require('./engine.js');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

console.log('\n📍 V1 双面密文 decryptByKey');
{
  assert(CIPHERTEXT.split(' ').every((h) => /^[0-9A-F]{2}$/.test(h)), '密文格式合法');
  assert(Object.keys(DUAL_KEYS).length === 3, '三把钥匙齐全');
  const r = decryptByKey('red');
  assert(r.ok && r.text.includes('行动取消'), '红钥匙解出行动指令');
  const b = decryptByKey('blue');
  assert(b.ok && b.text.includes('回家吃饭'), '蓝钥匙解出家常话');
  const g = decryptByKey('gold');
  assert(g.ok && g.tag === '万能钥匙', '金钥匙存在且标注正确');
  assert(!decryptByKey('green').ok, '未知钥匙返回失败');
  assert(decryptByKey('red').text !== decryptByKey('blue').text, '同一密文解出两种不同明文');
}

console.log('\n📍 V2 密钥转盘 decryptOtp / countDistinctTexts');
{
  assert(OTP_KEY_COUNT === 16 && OTP_PLAINTEXTS.length === 8, '16 档钥匙对 8 种明文');
  assert(decryptOtp(-1).keyIndex === 15, '负数档位折回末尾');
  assert(decryptOtp(16).keyIndex === 0, '越界档位折回开头');
  assert(decryptOtp(3.6).keyIndex === 4, '小数档位四舍五入');
  const all = [];
  for (let i = 0; i < OTP_KEY_COUNT; i++) all.push(decryptOtp(i));
  assert(countDistinctTexts(all) === 8, '16 把钥匙恰好解出 8 种不同明文');
  assert(countDistinctTexts([{ text: 'a' }, { text: 'a' }, { text: 'b' }]) === 2, 'countDistinctTexts 去重正确');
}

console.log('\n📍 V3 平方根谜宫 rabinPick / rabinAllFound');
{
  assert(RABIN_GRID.length === 9, '九宫格共 9 格');
  assert(RABIN_GRID.filter((c) => c.hit).length === 4, '恰好 4 格藏有候选明文');
  const hitTexts = RABIN_GRID.filter((c) => c.hit).map((c) => c.text);
  assert(new Set(hitTexts).size === 4 && hitTexts.every((t) => t.length > 0), '4 个候选明文互不相同');
  assert(rabinPick(0).ok && rabinPick(0).hit, '格子 0 命中');
  assert(rabinPick(1).ok && !rabinPick(1).hit, '格子 1 落空');
  assert(!rabinPick(99).ok, '越界格子返回失败');
  assert(rabinAllFound([0, 2, 5, 7]) === true, '找齐 4 格判定完成');
  assert(rabinAllFound([0, 2, 5]) === false, '缺一格不判定完成');
  assert(rabinAllFound([0, 1, 2, 5, 7]) === true, '多余点击不影响判定');
}

console.log('\n📍 V4 审讯室 interrogationChoice');
{
  assert(Object.keys(INTERROGATION).length === 3, '三个分支选项');
  for (const id of ['real', 'fake', 'deny']) {
    const r = interrogationChoice(id);
    assert(r.ok && r.title.length > 0 && r.text.length > 10, `分支 ${id} 文案完整`);
    assert(r.safe >= 1 && r.safe <= 3, `分支 ${id} 安全度在 1..3`);
  }
  assert(!interrogationChoice('nope').ok, '未知分支返回失败');
  assert(INTERROGATION.fake.safe > INTERROGATION.real.safe, '假钥匙比真钥匙安全');
}

console.log(`\n结果：${passed} 通过，${failed} 失败`);
process.exit(failed ? 1 : 0);

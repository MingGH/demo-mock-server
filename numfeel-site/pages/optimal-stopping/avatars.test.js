// avatars.js 单元测试
// 运行: node pages/optimal-stopping/avatars.test.js

var avatars = require('./avatars.js');
var passed = 0, failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.error('  ✗ ' + msg); }
}

console.log('\n[FEMALE_PROMPTS / MALE_PROMPTS]');
assert(avatars.FEMALE_PROMPTS.length === 12, '女性头像 prompt 数量 = 12');
assert(avatars.MALE_PROMPTS.length === 12, '男性头像 prompt 数量 = 12');
assert(avatars.FEMALE_PROMPTS.every(function(p) { return p.tag && p.prompt; }),
  '每个女性 prompt 都含 tag/prompt');
assert(avatars.MALE_PROMPTS.every(function(p) { return p.tag && p.prompt; }),
  '每个男性 prompt 都含 tag/prompt');

// tag 不重复
var fTags = avatars.FEMALE_PROMPTS.map(function(p) { return p.tag; });
var mTags = avatars.MALE_PROMPTS.map(function(p) { return p.tag; });
assert(new Set(fTags).size === 12, '女性 tag 全部唯一');
assert(new Set(mTags).size === 12, '男性 tag 全部唯一');

console.log('\n[getAvatarPool]');
var p1 = avatars.getAvatarPool('female', 12);
assert(p1.length === 12, 'female n=12 → 12 个');
assert(p1.every(function(a) { return a.url.indexOf('http') === 0 || a.url.indexOf('avatars/') === 0; }), '每个含 url');
assert(p1.every(function(a) { return a.url.indexOf('avatars/') > -1; }), 'url 指向本地 avatars/');

var p2 = avatars.getAvatarPool('male', 8);
assert(p2.length === 8, 'male n=8 → 8 个');

var p3 = avatars.getAvatarPool('male', 20);
assert(p3.length === 20, 'male n=20 → 20 个（>12 时循环复用）');

// 武装直升机：男女混着抽
var p4 = avatars.getAvatarPool('helicopter', 12);
assert(p4 !== null && p4.length === 12, 'helicopter n=12 → 12 个');
var allTagsMixed = avatars.FEMALE_PROMPTS.concat(avatars.MALE_PROMPTS).map(function(p) { return p.tag; });
assert(p4.every(function(a) { return allTagsMixed.indexOf(a.tag) > -1; }),
  'helicopter 候选来自男女混合池');

// 多跑几次 helicopter，验证抽到的至少出现过 male 和 female 池
var saw = { female: false, male: false };
var femalePromptSet = {};
avatars.FEMALE_PROMPTS.forEach(function(p) { femalePromptSet[p.prompt] = true; });
for (var t = 0; t < 30; t++) {
  var sample = avatars.getAvatarPool('helicopter', 24);
  sample.forEach(function(a) {
    if (femalePromptSet[a.prompt]) saw.female = true; else saw.male = true;
  });
  if (saw.female && saw.male) break;
}
assert(saw.female && saw.male, 'helicopter 多次抽样后既出过女性也出过男性');

var p5 = avatars.getAvatarPool('unknown', 12);
assert(p5 === null, '未知 scenario → null');

console.log('\n' + '='.repeat(40));
console.log('通过: ' + passed + '  失败: ' + failed);
if (failed > 0) { console.log('❌ 有测试失败'); process.exit(1); }
else { console.log('✅ 全部通过'); }

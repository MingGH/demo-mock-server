// 测试文件：防复制实验室核心逻辑
// 运行：node copy-protection.test.js

const { TECHNIQUES, assessProtectionLevel, bypassDifficulty, simulateBattle, REAL_WORLD_CASES, buildObfuscationMap, obfuscateText } = require('./engine.js');

let passed = 0, failed = 0;
function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

console.log('\n🧪 防复制实验室 - 核心逻辑测试\n');

console.log('--- TECHNIQUES 数据完整性 ---');
assert(Array.isArray(TECHNIQUES) && TECHNIQUES.length === 8, `共 8 种技术: ${TECHNIQUES.length}`);
TECHNIQUES.forEach(t => {
  assert(!!t.id && !!t.name && !!t.desc, `${t.name} 有 id/name/desc`);
  assert(t.difficulty >= 1 && t.difficulty <= 5, `${t.name} 难度在 1~5: ${t.difficulty}`);
  assert(t.effectiveness >= 0 && t.effectiveness <= 100, `${t.name} 有效性 0~100: ${t.effectiveness}`);
  assert(typeof t.bypass === 'string' && t.bypass.length > 0, `${t.name} 有绕过方法说明`);
});

console.log('--- ID 唯一性 ---');
const ids = TECHNIQUES.map(t => t.id);
assert(new Set(ids).size === ids.length, '所有技术 id 唯一');

console.log('--- assessProtectionLevel ---');
const none = assessProtectionLevel([]);
assert(none.level === 0 && none.label === '无防护', '空防护 = 0 分无防护');

const weak = assessProtectionLevel([TECHNIQUES.find(t => t.id === 'js-contextmenu')]);
assert(weak.level < 40, `单独禁右键评分很低: ${weak.level}`);

const strong = assessProtectionLevel([TECHNIQUES.find(t => t.id === 'font-obfuscation')]);
assert(strong.level > weak.level, `字体混淆比禁右键评分高: ${strong.level} > ${weak.level}`);

const all = assessProtectionLevel(TECHNIQUES);
assert(all.level > 0 && all.level <= 100, `全部启用评分合法: ${all.level}`);
assert(typeof all.color === 'string' && all.color.startsWith('#'), '返回颜色值');

console.log('--- 评分单调性 ---');
const single = assessProtectionLevel([TECHNIQUES.find(t => t.id === 'canvas-render')]);
const combined = assessProtectionLevel([
  TECHNIQUES.find(t => t.id === 'canvas-render'),
  TECHNIQUES.find(t => t.id === 'font-obfuscation'),
]);
assert(combined.level >= single.level, `组合防护不低于单项: ${combined.level} >= ${single.level}`);

console.log('--- bypassDifficulty ---');
TECHNIQUES.forEach(t => {
  const label = bypassDifficulty(t);
  assert(typeof label === 'string' && label.length > 0, `${t.name} 有绕过难度文案: ${label}`);
});

console.log('--- simulateBattle ---');
const defenses = TECHNIQUES.slice(0, 3);

// 小白打不过中高难度防护
const noobVsHard = simulateBattle([TECHNIQUES.find(t => t.id === 'font-obfuscation')], 1);
assert(!noobVsHard.allBypassed, '小白无法绕过字体混淆（难度5）');
assert(noobVsHard.results[0].bypassed === false, '字体混淆对小白显示无法绕过');

// 专业爬虫能破一切
const proVsAll = simulateBattle(TECHNIQUES, 5);
assert(proVsAll.allBypassed, '专业爬虫能绕过全部防护');
assert(proVsAll.totalTime > 0, `专业爬虫总耗时为正: ${proVsAll.totalTime}秒`);

// 难度恰好等于攻击者水平 → 能绕过
const exact = simulateBattle([TECHNIQUES.find(t => t.id === 'canvas-render')], 4);
assert(exact.results[0].bypassed === true, '难度4防护被水平4攻击者绕过');

// 难度高于攻击者水平 1 级 → 不能绕过
const justBelow = simulateBattle([TECHNIQUES.find(t => t.id === 'font-obfuscation')], 4);
assert(justBelow.results[0].bypassed === false, '难度5防护挡住水平4攻击者');

console.log('--- 绕过时间随攻击者水平递减 ---');
const target = [TECHNIQUES.find(t => t.id === 'js-clipboard-replace')]; // 难度3
const t3 = simulateBattle(target, 3).results[0].timeSeconds;
const t5 = simulateBattle(target, 5).results[0].timeSeconds;
assert(t5 < t3, `水平越高绕过越快: 水平5用${t5}秒 < 水平3用${t3}秒`);

console.log('--- REAL_WORLD_CASES 数据完整性 ---');
assert(Array.isArray(REAL_WORLD_CASES) && REAL_WORLD_CASES.length >= 5, `至少5个真实案例: ${REAL_WORLD_CASES.length}`);
REAL_WORLD_CASES.forEach(c => {
  assert(!!c.site && Array.isArray(c.techniques) && !!c.note, `${c.site} 数据完整`);
  // 引用的技术 id 必须存在于 TECHNIQUES
  c.techniques.forEach(tid => {
    assert(TECHNIQUES.some(t => t.id === tid), `${c.site} 引用的技术 ${tid} 存在`);
  });
});

console.log('--- buildObfuscationMap ---');

// 基本映射：每个字符都应被映射为同组中的另一个字符
var sampleText = '测试文字abc';
var map = buildObfuscationMap(sampleText);
assert(typeof map === 'object', '返回映射对象');
var allMapped = true;
for (var key in map) {
  if (map[key] === key) { allMapped = false; break; }
}
assert(allMapped, '没有字符映射到自身');

// CJK 字符映射到 CJK，ASCII 映射到 ASCII
var cjkKey = '测';
var asciiKey = 'a';
assert(map[cjkKey] && map[cjkKey].charCodeAt(0) >= 0x4E00, 'CJK 字符映射到 CJK 范围');
assert(map[asciiKey] && map[asciiKey].charCodeAt(0) >= 0x20 && map[asciiKey].charCodeAt(0) <= 0x7E, 'ASCII 字符映射到 ASCII 范围');

// 空文本
var emptyMap = buildObfuscationMap('');
assert(typeof emptyMap === 'object' && Object.keys(emptyMap).length === 0, '空文本返回空映射');

// 重复字符不重复入列
var dupMap = buildObfuscationMap('aaabbb');
assert(Object.keys(dupMap).length === 2, '重复字符去重: ' + Object.keys(dupMap).length + ' 个');

console.log('--- obfuscateText ---');

// 替换后长度不变
var obfuscated = obfuscateText(sampleText, map);
assert(obfuscated.length === sampleText.length, '替换后长度不变: ' + obfuscated.length);

// 替换后内容确实不同
assert(obfuscated !== sampleText, '替换后内容不同');

// 未在映射表中的字符保持原样
var partialMap = { 'a': 'b' };
var partialResult = obfuscateText('a中', partialMap);
assert(partialResult === 'b中', '未映射字符保持原样');

// 同一映射两次替换应还原（旋转替换的逆是再旋转 n-1 次，两次还原需 n=2）
var twoCharMap = buildObfuscationMap('ab');
var twoCharOriginal = 'ab';
var twoCharOnce = obfuscateText(twoCharOriginal, twoCharMap);
var twoCharTwice = obfuscateText(twoCharOnce, twoCharMap);
assert(twoCharTwice === twoCharOriginal, '两字符旋转两次还原原文');

console.log(`\n📊 结果: ${passed} 通过, ${failed} 失败\n`);
process.exit(failed > 0 ? 1 : 0);

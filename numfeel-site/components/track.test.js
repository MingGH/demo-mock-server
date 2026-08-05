/**
 * NFTrack 埋点 SDK — 单元测试
 * node components/track.test.js
 */

const {
  deriveSlug,
  cleanProps,
  shouldFlushQueue,
  shouldAcceptEvent,
  stampTruncated,
  bytesToSessionId,
  isValidEventName,
  shouldImmediateFlush,
  parseNonNegInt,
  parseOnceList,
  serializeOnceMap,
  restoreCounters,
  pruneOnceMap
} = require('./track.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  \u2705 ${msg}`);
  } else {
    failed++;
    console.error(`  \u274c ${msg}`);
  }
}

// ========== deriveSlug ==========
console.log('\n\ud83d\udccd deriveSlug: 目录形式 /pages/<slug>/');
{
  assert(deriveSlug('/pages/wealth-button-paradox/') === 'wealth-button-paradox', '目录形式带斜杠');
  assert(deriveSlug('/pages/wealth-button-paradox/index.html') === 'wealth-button-paradox', '目录形式 index.html');
  assert(deriveSlug('/numfeel-site/pages/sample-inference/') === 'sample-inference', '带前缀路径的目录形式');
}

console.log('\n\ud83d\udccd deriveSlug: 单文件形式 /pages/<slug>.html');
{
  assert(deriveSlug('/pages/braess-paradox.html') === 'braess-paradox', '单文件形式');
  assert(deriveSlug('/pages/benfords-law.html') === 'benfords-law', '另一个单文件形式');
}

console.log('\n\ud83d\udccd deriveSlug: 非 demo 路径应返回 null');
{
  assert(deriveSlug('/index.html') === null, '首页不是 demo 页');
  assert(deriveSlug('/components/header.js') === null, '不含 /pages/ 的路径');
  assert(deriveSlug('/pages/') === null, '/pages/ 后面为空');
  assert(deriveSlug(null) === null, '非字符串输入');
  assert(deriveSlug(undefined) === null, 'undefined 输入');
}

console.log('\n\ud83d\udccd deriveSlug: 大小写与非法字符');
{
  assert(deriveSlug('/pages/Some-Demo/') === 'some-demo', '自动转小写');
  assert(deriveSlug('/pages/bad_demo!/') === null, '包含非法字符（下划线/叹号）时返回 null');
}

// ========== cleanProps ==========
console.log('\n\ud83e\uddf9 cleanProps: 保留 number/boolean/短字符串');
{
  const cleaned = cleanProps({ idx: 1, win: true, mode: 'standard' });
  assert(cleaned.idx === 1, '保留 number');
  assert(cleaned.win === true, '保留 boolean');
  assert(cleaned.mode === 'standard', '保留短字符串');
}

console.log('\n\ud83e\uddf9 cleanProps: 丢弃嵌套对象/数组/超长字符串');
{
  const cleaned = cleanProps({
    nested: { a: 1 },
    arr: [1, 2, 3],
    longStr: 'x'.repeat(65),
    okStr: 'y'.repeat(64),
    fn: function () {},
    ok: 1
  });
  assert(!('nested' in cleaned), '丢弃嵌套对象');
  assert(!('arr' in cleaned), '丢弃数组');
  assert(!('longStr' in cleaned), '丢弃超过64字符的字符串');
  assert(cleaned.okStr === 'y'.repeat(64), '刚好64字符的字符串保留');
  assert(!('fn' in cleaned), '丢弃函数');
  assert(cleaned.ok === 1, '其余合法字段正常保留');
}

console.log('\n\ud83e\uddf9 cleanProps: 最多保留 20 个 key');
{
  const raw = {};
  for (let i = 0; i < 30; i++) raw['k' + i] = i;
  const cleaned = cleanProps(raw);
  assert(Object.keys(cleaned).length === 20, `超过20个key时截断到20 (实际 ${Object.keys(cleaned).length})`);
}

console.log('\n\ud83e\uddf9 cleanProps: 空/非法输入返回空对象');
{
  assert(Object.keys(cleanProps(null)).length === 0, 'null 输入返回空对象');
  assert(Object.keys(cleanProps(undefined)).length === 0, 'undefined 输入返回空对象');
  assert(Object.keys(cleanProps({})).length === 0, '空对象输入返回空对象');
  assert(Object.keys(cleanProps('not-an-object')).length === 0, '非对象输入返回空对象');
}

// ========== shouldFlushQueue ==========
console.log('\n\ud83d\udce6 shouldFlushQueue');
{
  assert(shouldFlushQueue(20, 20) === true, '达到上限应该 flush');
  assert(shouldFlushQueue(21, 20) === true, '超过上限应该 flush');
  assert(shouldFlushQueue(19, 20) === false, '未达上限不 flush');
  assert(shouldFlushQueue(0, 20) === false, '空队列不 flush');
}

// ========== shouldAcceptEvent ==========
console.log('\n\ud83c\udfab shouldAcceptEvent: 会话上限与 force');
{
  assert(shouldAcceptEvent(599, 600, false) === true, '未达上限时正常事件通过');
  assert(shouldAcceptEvent(600, 600, false) === false, '达到上限时正常事件被拒绝');
  assert(shouldAcceptEvent(600, 600, true) === true, 'force=true 时即使达到上限也通过');
  assert(shouldAcceptEvent(10000, 600, true) === true, 'force=true 时远超上限也通过');
}

// ========== stampTruncated ==========
console.log('\n\ud83c\udff7\ufe0f stampTruncated');
{
  const untouched = stampTruncated({ a: 1 }, false);
  assert(!('truncated' in untouched), '未截断时不添加 truncated 字段');

  const stamped = stampTruncated({ a: 1 }, true);
  assert(stamped.truncated === true, '已截断时添加 truncated:true');
  assert(stamped.a === 1, '原有字段保留');

  const original = { a: 1 };
  stampTruncated(original, true);
  assert(!('truncated' in original), '不修改原对象（返回新对象）');
}

// ========== bytesToSessionId ==========
console.log('\n\ud83c\udd94 bytesToSessionId');
{
  const id = bytesToSessionId([0, 25, 26, 51, 255]);
  assert(typeof id === 'string' && id.length === 5, '长度与输入字节数一致');
  assert(/^[a-z0-9]+$/.test(id), '只包含小写字母和数字');

  const id2 = bytesToSessionId(new Array(16).fill(0));
  assert(id2.length === 16, '16字节生成16位ID');
}

// ========== isValidEventName ==========
console.log('\n\u2705 isValidEventName');
{
  assert(isValidEventName('press') === true, '合法小写事件名');
  assert(isValidEventName('session_start') === true, '含下划线的合法事件名');
  assert(isValidEventName('Press') === false, '大写字母不合法');
  assert(isValidEventName('press-x') === false, '连字符不合法');
  assert(isValidEventName('') === false, '空字符串不合法');
  assert(isValidEventName(null) === false, 'null 不合法');
  assert(isValidEventName('a'.repeat(49)) === false, '超过48字符不合法');
  assert(isValidEventName('a'.repeat(48)) === true, '恰好48字符合法');
}

// ========== parseNonNegInt ==========
console.log('\n\ud83d\udccf parseNonNegInt: 容错解析');
{
  assert(parseNonNegInt('42', 0) === 42, '正常数字');
  assert(parseNonNegInt('0', 0) === 0, '0 合法');
  assert(parseNonNegInt(null, 5) === 5, 'null 退化到 fallback');
  assert(parseNonNegInt(undefined, 5) === 5, 'undefined 退化到 fallback');
  assert(parseNonNegInt('abc', 5) === 5, '非数字字符串退化');
  assert(parseNonNegInt('-3', 5) === 5, '负数退化');
  assert(parseNonNegInt('3.7', 5) === 3, '浮点向下取整');
  assert(parseNonNegInt('', 5) === 5, '空字符串退化');
}

// ========== parseOnceList / serializeOnceMap ==========
console.log('\n\ud83d\udce1 parseOnceList / serializeOnceMap: 往返');
{
  assert(Object.keys(parseOnceList(null)).length === 0, 'null 返回空集合');
  assert(Object.keys(parseOnceList('')).length === 0, '空串返回空集合');
  const parsed = parseOnceList('session_start,milestone,session_start');
  assert(parsed.session_start === true && parsed.milestone === true, '解析去重');
  assert(Object.keys(parsed).length === 2, '重复项只算一次');
  assert(serializeOnceMap(parsed) === 'session_start,milestone', '序列化保持插入顺序');
  assert(serializeOnceMap({}) === '', '空集合序列化为空串');
}

// ========== restoreCounters ==========
console.log('\n\ud83d\udee0\ufe0f restoreCounters: 容错恢复');
{
  const ok = restoreCounters('10', '20', '1', 'a,b');
  assert(ok.seq === 10 && ok.trackedCount === 20 && ok.truncated === true, '正常值恢复');
  assert(ok.firedOnce.a === true && ok.firedOnce.b === true, 'once 集合恢复');

  const missing = restoreCounters(null, null, null, null);
  assert(missing.seq === 0 && missing.trackedCount === 0 && missing.truncated === false, '缺失退化为初始值');
  assert(Object.keys(missing.firedOnce).length === 0, '缺失时 once 为空');

  const garbage = restoreCounters('abc', '-5', 'yes', 'x,y,,z');
  assert(garbage.seq === 0 && garbage.trackedCount === 0 && garbage.truncated === false, '垃圾值退化为初始值');
  assert(garbage.firedOnce.x === true && garbage.firedOnce.y === true && garbage.firedOnce.z === true, 'once 忽略空项');

  const negative = restoreCounters('-1', '0', '0', '');
  assert(negative.seq === 0 && negative.truncated === false, '负数 seq 与 truncated=0 正确');
}

// ========== pruneOnceMap ==========
console.log('\n\ud83d\udeae pruneOnceMap: 超长 once 列表裁剪');
{
  const map = {};
  for (let i = 0; i < 205; i++) map['k' + i] = true;
  pruneOnceMap(map);
  assert(Object.keys(map).length === 200, '超过 200 条时裁剪到 200');
  assert(map['k4'] === undefined, '丢弃最旧的超限项');
  assert(map['k204'] === true, '保留最新的 200 条');
}

// ========== shouldImmediateFlush ==========
console.log('\n\ud83d\ude85 shouldImmediateFlush: 收尾事件需立即发送');
{
  assert(shouldImmediateFlush('session_end') === true, 'session_end 应立即 flush');
  assert(shouldImmediateFlush('session_start') === false, 'session_start 不立即 flush');
  assert(shouldImmediateFlush('press') === false, '普通事件不立即 flush');
  assert(shouldImmediateFlush('') === false, '空事件名不立即 flush');
}
console.log(`总计: ${passed + failed} 测试, \u2705 ${passed} 通过, \u274c ${failed} 失败`);
if (failed > 0) process.exit(1);

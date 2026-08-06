/**
 * zhihu-link 纯逻辑单元测试（Node 直接运行，无测试框架）。
 * 运行：node components/zhihu-link.test.js
 * 只测纯函数，不测 DOM。
 */
var link = require('./zhihu-link.js');

var passed = 0;
var failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log('\u2705 ' + msg);
  } else {
    failed++;
    console.error('\u274c ' + msg);
  }
}

function assertEqual(actual, expected, msg) {
  assert(actual === expected, msg + ' (got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected) + ')');
}

// ── deriveSlug ──────────────────────────────────────────────
assertEqual(link.deriveSlug('/pages/benfords-law.html'), 'benfords-law', '单文件页面推导 slug');
assertEqual(link.deriveSlug('/pages/sample-inference/index.html'), 'sample-inference', '目录 index.html 推导 slug');
assertEqual(link.deriveSlug('/pages/sample-inference/'), 'sample-inference', '目录结尾推导 slug');
assertEqual(link.deriveSlug('/pages/Coin-Flip.html'), 'coin-flip', 'slug 统一转小写');
assertEqual(link.deriveSlug('index.html'), null, '首页无 slug');
assertEqual(link.deriveSlug('/'), null, '根路径无 slug');
assertEqual(link.deriveSlug('/pages/foo.bar.html'), null, '非法文件名无 slug');
assertEqual(link.deriveSlug(null), null, 'null 输入容错');
assertEqual(link.deriveSlug(123), null, '非字符串输入容错');

// ── resolveZhihuLink ───────────────────────────────────────
var config = {
  'benfords-law': { url: 'https://zhuanlan.zhihu.com/p/111', title: '本福特定律：数字也会说谎' },
  'sample-inference': { url: 'https://zhuanlan.zhihu.com/p/222' },
  'monty-hall-simulator': [
    { url: 'https://zhuanlan.zhihu.com/p/333', title: '三门问题解开篇' },
    { url: 'https://zhuanlan.zhihu.com/p/444' }
  ],
  'bad-one': { url: '' },
  '_sample': { url: 'https://zhuanlan.zhihu.com/p/999', title: '示例' }
};

// 单篇对象 → 返回单元素数组
var single = link.resolveZhihuLink('benfords-law', config);
assert(Array.isArray(single) && single.length === 1, '单篇对象归一化为单元素数组');
assertEqual(single[0].url, 'https://zhuanlan.zhihu.com/p/111', '返回正确 url');
assertEqual(single[0].title, '本福特定律：数字也会说谎', '返回配置的 title');

var hitNoTitle = link.resolveZhihuLink('sample-inference', config);
assertEqual(hitNoTitle[0].title, '知乎配套文章', '缺 title 时用默认文案');

// 一对多：对象数组 → 返回全部有效条目
var many = link.resolveZhihuLink('monty-hall-simulator', config);
assert(Array.isArray(many) && many.length === 2, '数组配置返回全部条目');
assertEqual(many[0].title, '三门问题解开篇', '首篇 title');
assertEqual(many[1].title, '知乎配套文章', '数组内第二篇缺 title 用默认');

assert(link.resolveZhihuLink('unknown-slug', config).length === 0, '未配置的 slug 返回空数组');
assert(link.resolveZhihuLink('_sample', config).length === 0, '下划线开头的 key（说明条目）被忽略');
assert(link.resolveZhihuLink('bad-one', config).length === 0, 'url 为空的条目被过滤');
assert(link.resolveZhihuLink(null, config).length === 0, 'slug 为 null 返回空数组');
assert(link.resolveZhihuLink('benfords-law', null).length === 0, '配置为 null 返回空数组');
assert(link.resolveZhihuLink('benfords-law', { 'benfords-law': {} }).length === 0, '条目缺 url 返回空数组');
assert(link.resolveZhihuLink('benfords-law', 'not-an-object').length === 0, '非对象配置返回空数组');
assert(link.resolveZhihuLink('bad-one', { 'bad-one': [{ url: 'https://x', title: 'a' }, { url: '' }] }).length === 1, '数组内无效条目被过滤');

// ── computePrefix ───────────────────────────────────────────
assertEqual(link.computePrefix('/pages/benfords-law.html'), '../', '单文件页前缀 ../');
assertEqual(link.computePrefix('/pages/sample-inference/index.html'), '../../', '目录页前缀 ../../');
assertEqual(link.computePrefix('/index.html'), '', '首页前缀为空');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
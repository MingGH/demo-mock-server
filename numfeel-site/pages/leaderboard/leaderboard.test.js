/**
 * 排行榜逻辑单元测试。运行：node pages/leaderboard/leaderboard.test.js
 */
var L = require('./logic.js');

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log('✅ ' + msg); }
  else { failed++; console.error('❌ ' + msg); }
}

// ── normalizeKey ──────────────────────────────
assert(L.normalizeKey('/pages/wealth-button-paradox') === 'pages/wealth-button-paradox',
  'normalizeKey 去前导斜杠');
assert(L.normalizeKey('pages/dithering/') === 'pages/dithering',
  'normalizeKey 去尾部斜杠');
assert(L.normalizeKey('pages/coin-flip-probability.html') === 'pages/coin-flip-probability',
  'normalizeKey 去 .html 后缀');
assert(L.normalizeKey('/pages/dithering/#google_vignette') === 'pages/dithering',
  'normalizeKey 去 hash');
assert(L.normalizeKey('') === '' && L.normalizeKey(null) === '',
  'normalizeKey 处理空值');
// 后端 path "pages/xxx" 与 demos.json href "pages/xxx.html" 应归一到同一 key
assert(L.normalizeKey('pages/monty-hall-simulator') === L.normalizeKey('pages/monty-hall-simulator.html'),
  'normalizeKey 让后端路径与 demos.json href 对齐');

// ── buildDemoIndex ────────────────────────────
var demosJson = {
  categories: [
    { id: 'probability', name: '概率与统计', demos: [
      { href: 'pages/monty-hall-simulator.html', icon: 'ti-door', title: '蒙提霍尔问题模拟', desc: 'x' },
      { href: 'pages/dithering/', icon: 'ti-photo', title: '图片做旧实验室', desc: 'y' }
    ]},
    { id: 'tech', name: '技术演示', demos: [
      { href: 'pages/browser-fingerprint.html', icon: 'ti-fingerprint', title: '浏览器指纹实验室', desc: 'z' }
    ]}
  ]
};
var index = L.buildDemoIndex(demosJson);
assert(Object.keys(index).length === 3, 'buildDemoIndex 扁平化全部 demo');
assert(index['pages/monty-hall-simulator'].title === '蒙提霍尔问题模拟',
  'buildDemoIndex 以归一化 key 索引');
assert(index['pages/dithering'].catName === '概率与统计',
  'buildDemoIndex 带上分类名');
assert(L.buildDemoIndex(null).constructor === Object && Object.keys(L.buildDemoIndex(null)).length === 0,
  'buildDemoIndex 处理空输入');

// ── enrichLeaderboard ─────────────────────────
var entries = [
  { path: 'pages/dithering/', views: 2951 },
  { path: 'pages/browser-fingerprint', views: 1955 },   // 后端无 .html
  { path: 'pages/unknown-removed-demo', views: 999 },    // demos.json 里没有 → 应剔除
  { path: 'pages/monty-hall-simulator', views: 195 }
];
var enriched = L.enrichLeaderboard(entries, index);
assert(enriched.length === 3, 'enrichLeaderboard 剔除 demos.json 中不存在的条目');
assert(enriched[0].rank === 1 && enriched[0].title === '图片做旧实验室',
  'enrichLeaderboard 保持顺序并标注名次');
assert(enriched[1].title === '浏览器指纹实验室',
  'enrichLeaderboard 后端无 .html 路径仍能匹配 demos.json 的 .html href');
assert(enriched[2].rank === 3 && enriched[2].views === 195,
  'enrichLeaderboard 名次连续递增（剔除后重新编号）');
assert(L.enrichLeaderboard(null, index).length === 0, 'enrichLeaderboard 处理空输入');

// ── formatViews ───────────────────────────────
assert(L.formatViews(195) === '195', 'formatViews 小数字原样');
assert(L.formatViews(12345) === '1.2万', 'formatViews 万级缩写');
assert(L.formatViews(10000) === '1万', 'formatViews 整万去掉 .0');
assert(L.formatViews(undefined) === '0', 'formatViews 处理 undefined');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);

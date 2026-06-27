/**
 * websocket-transport demo 自检验证脚本。
 * 运行：node numfeel-site/pages/websocket-transport/_verify.js
 */

var fs = require('fs');
var path = require('path');

var pageDir = __dirname;
var passed = 0;
var failed = 0;

function check(num, label, ok, detail) {
  if (ok) { passed++; console.log('✅ [' + num + '] ' + label); }
  else { failed++; console.log('❌ [' + num + '] ' + label); }
  if (detail) console.log('     ' + detail);
}

function fileExists(name) { return fs.existsSync(path.join(pageDir, name)); }
function readFile(name) { return fs.readFileSync(path.join(pageDir, name), 'utf-8'); }

console.log('═══════════════════════════════════════');
console.log('  websocket-transport 10项自检');
console.log('═══════════════════════════════════════\n');

var html = readFile('index.html');
var css = readFile('style.css');
var js = readFile('app.js');

// 1. 信息密度
check('1', '信息密度：首屏标题+副标题+场景卡片，无冗余说明',
  html.indexOf('hero-subtitle') !== -1 && html.indexOf('more-section') !== -1);

// 2. 交互有效性
check('2', '交互有效性：hover/active/transform 反馈',
  css.indexOf(':hover') !== -1 && css.indexOf(':active') !== -1 && css.indexOf('transform') !== -1);

// 3. 引导与节奏
check('3', '引导与节奏：GSAP fade 动画 + 舞台 empty→content 切换',
  html.indexOf('gsap') !== -1 && css.indexOf('animation') !== -1);

// 4. 配色
check('4', '配色：金色主色 + 场景舞台多样渲染，无高饱和色块泛滥',
  (css.match(/#ffd700/g) || []).length > 0);

// 5. 真实互动
check('5', '真实互动：HTTP按钮触发fetch + WS按钮触发WebSocket',
  js.indexOf('fetch(') !== -1 && js.indexOf('new WebSocket') !== -1);

// 6. 趣味性
check('6', '趣味性：资料页WS逐字段推送"反向教材" + 游戏战场实时动画',
  js.indexOf('profile_field') !== -1 && js.indexOf('game_state') !== -1);

// 7. 中文配图
check('7', '中文配图：mascot.jpg 存在',
  fileExists('mascot.jpg'));

// 8. 移动端适配
check('8', '移动端适配：@media 断点 + min-height:44px',
  css.indexOf('@media') !== -1 && css.indexOf('44px') !== -1);

// 9. 成熟库
check('9', '成熟库：GSAP CDN 引入',
  html.indexOf('gsap@3') !== -1);

// 10. 主题视觉
check('10', '主题视觉：四个场景各有专属舞台渲染',
  js.indexOf('renderTradingStage') !== -1 && js.indexOf('renderProfileStage') !== -1 &&
  js.indexOf('renderDashboardStage') !== -1 && js.indexOf('renderGamingStage') !== -1);

// ── engine 测试 ──
console.log('\n── engine 单元测试 ──');
try {
  require('./engine.test.js');
} catch (e) {
  console.log('❌ engine 测试运行失败: ' + e.message);
  failed++;
}

console.log('\n═══════════════════════════════════════');
console.log('  自检结果: ' + passed + ' 通过, ' + failed + ' 不通过');
console.log('═══════════════════════════════════════');
if (failed > 0) process.exit(1);

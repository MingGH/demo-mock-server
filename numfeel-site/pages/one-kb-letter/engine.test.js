/**
 * 一KB传书 — 单元测试
 * 运行命令: node pages/one-kb-letter/engine.test.js
 */

const E = require('./engine.js');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  ✅ ' + msg);
  } else {
    failed++;
    console.error('  ❌ ' + msg);
  }
}

function assertClose(actual, expected, tol, msg) {
  assert(Math.abs(actual - expected) <= tol, msg + '（期望≈' + expected + '，实际=' + actual + '）');
}

// ───────────────────────── 字节计数 ─────────────────────────
console.log('测试组1: 字节计数 countBytes');
assert(E.countBytes('') === 0, '空字符串为 0 字节');
assert(E.countBytes('abc') === 3, '3 个英文为 3 字节');
assert(E.countBytes('你好') === 6, '2 个中文为 6 字节（UTF-8 每字 3 字节）');
assert(E.countBytes('a你') === 4, '中英混排 1+3=4 字节');
assert(E.countBytes('😀') === 4, 'emoji 为 4 字节（代理对）');
assert(E.countBytes('🙂🙂') === 8, '两个 emoji 为 8 字节');
assert(E.countBytes(null) === 0, 'null 按 0 处理');
assert(E.countBytes(undefined) === 0, 'undefined 按 0 处理');
console.log('');

// ───────────────────────── 1KB 占用 ─────────────────────────
console.log('测试组2: percentOfKB 与 packCells');
assert(E.percentOfKB(512) === 50, '512 字节 = 50%');
assert(E.percentOfKB(1024) === 100, '1024 字节 = 100%');
assert(E.percentOfKB(2048) === 200, '2048 字节 = 200%');
const cellsEmpty = E.packCells(0);
assert(cellsEmpty.length === 64 && cellsEmpty.filter(Boolean).length === 0, '0 字节 -> 64 格全空');
const cellsFull = E.packCells(1024);
assert(cellsFull.length === 64 && cellsFull.filter(Boolean).length === 64, '1024 字节 -> 64 格全满');
const cellsHalf = E.packCells(512);
assert(cellsHalf.filter(Boolean).length === 32, '512 字节 -> 32 格占用');
const cellsOver = E.packCells(99999);
assert(cellsOver.filter(Boolean).length === 64, '超限数据最多也只填满 64 格');
console.log('');

// ───────────────────────── 打包 ─────────────────────────
console.log('测试组3: buildPacket');
let p1 = E.buildPacket(E.TYPE_TEXT, '你好');
assert(p1.ok === true && p1.bytes === 6, '短文本可打包');
let pOver = E.buildPacket(E.TYPE_TEXT, new Array(500).join('字'));
assert(pOver.bytes > E.KB && pOver.ok === false, '超 1KB 不可打包');
let pEmpty = E.buildPacket(E.TYPE_TEXT, '');
assert(pEmpty.ok === false, '空文本不可打包');
let pType = E.buildPacket(E.TYPE_NUMBERS, '20230501');
assert(pType.type === E.TYPE_NUMBERS, '类型保留');
console.log('');

// ───────────────────────── 数字解析 ─────────────────────────
console.log('测试组4: parseNumbers');
let nLottery = E.parseNumbers('彩票 7 14 21 28 35 6');
assert(nLottery.kind === E.NUMBER_KIND_LOTTERY, '6 个 1-35 数字识别为彩票');
assert(nLottery.matched === true, '彩票匹配标志');
let nPrice = E.parseNumbers('比特币 19600 卖出');
assert(nPrice.kind === E.NUMBER_KIND_PRICE && nPrice.value === '19600', '比特币价格识别');
let nWallet = E.parseNumbers('5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ');
assert(nWallet.kind === E.NUMBER_KIND_WALLET, '疑似私钥识别');
let nOther = E.parseNumbers('今天天气不错');
assert(nOther.kind === E.NUMBER_KIND_OTHER && nOther.matched === false, '普通文本无数字特征');
let nEmpty = E.parseNumbers('');
assert(nEmpty.matched === false, '空文本无数字特征');
console.log('');

// ───────────────────────── 可信度 ─────────────────────────
console.log('测试组5: creditScore');
assert(E.creditScore('') === 0, '空内容可信度 0');
let cInstruct = E.creditScore('嘿，别辞职，快去买房');
assert(cInstruct > 50, '口语+明确指令提升可信度');
let cVerbose = E.creditScore('2023年5月15日星期一早上八点十五分我在城东的十字路口看见一只黄色的流浪猫它一直跟着我走了三条街后来停在了一家叫老王的早餐店门口我给它买了根油条它吃了两口就跑了你说这算不算缘分我觉得算，可是天又快黑了它会不会饿');
assert(cVerbose < 50, '长篇大论（不含信任词）反而降低可信度');
assert(E.creditScore('随便') >= 0 && E.creditScore('随便') <= 100, '可信度在 0-100 区间');
console.log('');

// ───────────────────────── 命运改变值 ─────────────────────────
console.log('测试组6: changeScore 与 gradeOf');
let cNum = E.changeScore(E.TYPE_NUMBERS, '比特币 19600 买入');
let cText = E.changeScore(E.TYPE_TEXT, '好好吃饭');
assert(cNum > cText, '数字信的基础改变值高于废话信');
assert(E.changeScore(E.TYPE_NUMBERS, '私钥 5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ') >= 55, '私钥类改变值明显高于普通数字（可信度低会拉低）');
assert(E.changeScore(E.TYPE_CODE, '// a\nwhile(true){}\n') >= 50, '代码类基础值不低于 50');
assert(E.gradeOf(10).name === '石沉大海', '10 分 -> 石沉大海');
assert(E.gradeOf(100).name === '逆天改命', '100 分 -> 逆天改命');
assert(E.gradeOf(50).name === '有点东西', '50 分 -> 有点东西');
console.log('');

// ───────────────────────── 命运结算 ─────────────────────────
console.log('测试组7: settleFate');
let sLottery = E.settleFate({ type: E.TYPE_NUMBERS, text: '彩票 7 14 21 28 35 6', bytes: 30 });
assert(sLottery.grade && sLottery.verdict, '结算返回评级与判词');
assert(sLottery.analyses.length >= 2, '数字信至少 2 条分析');
assert(sLottery.analyses.join('').indexOf('破产') !== -1, '彩票信包含破产警示');
assert(sLottery.credit >= 0 && sLottery.credit <= 100, '可信度有界');
assert(sLottery.change >= 0 && sLottery.change <= 100, '改变值有界');
let sText = E.settleFate({ type: E.TYPE_TEXT, text: '好好吃饭', bytes: 12 });
assert(sText.analyses.length >= 2, '文字信至少 2 条分析');
let sCode = E.settleFate({ type: E.TYPE_CODE, text: 'while(true){}', bytes: 13 });
assert(sCode.analyses.join('').indexOf('代码') !== -1, '代码信分析包含代码说明');
console.log('');

// ───────────────────────── 工具函数 ─────────────────────────
console.log('测试组9: clamp');
assert(E.clamp(5, 0, 100) === 5, '区间内原样返回');
assert(E.clamp(-3, 0, 100) === 0, '低于下限被截断');
assert(E.clamp(999, 0, 100) === 100, '高于上限被截断');
console.log('');

console.log('========================================');
console.log('结果: ' + passed + ' 通过, ' + failed + ' 失败');
if (failed > 0) process.exit(1);

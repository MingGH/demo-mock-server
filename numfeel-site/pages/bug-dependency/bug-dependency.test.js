/**
 * 积木塔 Demo 单元测试
 * 运行命令: node pages/bug-dependency/bug-dependency.test.js
 */

var L = require('./bug-dependency-logic.js');

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log('  \u2705 ' + msg);
    passed++;
  } else {
    console.log('  \u274c ' + msg);
    failed++;
  }
}

// ========== 1. 场景数据完整性 ==========
console.log('\n\ud83c\udfdb\ufe0f 1. 场景数据完整性');

var scenarios = L.getScenarios();
assert(Array.isArray(scenarios), '获取场景列表返回数组');
assert(scenarios.length === 3, '预设 3 个场景');

scenarios.forEach(function (sc) {
  assert(typeof sc.id === 'string' && sc.id.length > 0, '场景 ' + sc.id + ' 有 id');
  assert(typeof sc.name === 'string' && sc.name.length > 0, '场景 ' + sc.id + ' 有 name');
  assert(typeof sc.description === 'string', '场景 ' + sc.id + ' 有 description');
  assert(Array.isArray(sc.layers) && sc.layers.length >= 3, '场景 ' + sc.id + ' 至少 3 层');
  assert(typeof sc.bugLayerIdx === 'number', '场景 ' + sc.id + ' 有 bugLayerIdx');
  assert(sc.bugLayerIdx >= 0 && sc.bugLayerIdx < sc.layers.length, '场景 ' + sc.id + ' bugLayerIdx 在范围内');
  assert(typeof sc.fixDescription === 'string', '场景 ' + sc.id + ' 有 fixDescription');
  assert(typeof sc.cascadeExplanation === 'string', '场景 ' + sc.id + ' 有 cascadeExplanation');

  // 验证 bug 层确实标记了 hasBug
  var bugLayer = sc.layers[sc.bugLayerIdx];
  assert(bugLayer.hasBug === true, '场景 ' + sc.id + ' 的 bugLayerIdx 对应层 hasBug=true');
  assert(bugLayer.status === 'bugged', '场景 ' + sc.id + ' 的 bug 层 status=bugged');

  // 验证每层有必需字段
  sc.layers.forEach(function (layer, idx) {
    assert(typeof layer.name === 'string', '场景 ' + sc.id + ' 层' + idx + ' 有 name');
    assert(typeof layer.role === 'string', '场景 ' + sc.id + ' 层' + idx + ' 有 role');
    assert(['normal', 'bugged', 'adapted'].indexOf(layer.status) !== -1,
      '场景 ' + sc.id + ' 层' + idx + ' status 合法');
  });
});

// ========== 2. getScenario 单场景获取 ==========
console.log('\n\ud83d\udd0d 2. getScenario 单场景获取');

var discount = L.getScenario('discount');
assert(discount !== null, 'getScenario("discount") 返回非 null');
assert(discount.id === 'discount', '返回的场景 id 正确');
assert(discount.name === '电商折扣系统', '返回的场景 name 正确');

var nothing = L.getScenario('nonexistent');
assert(nothing === null, 'getScenario("nonexistent") 返回 null');

// 验证返回深拷贝
discount.layers[0].name = 'MODIFIED';
var discount2 = L.getScenario('discount');
assert(discount2.layers[0].name !== 'MODIFIED', 'getScenario 返回深拷贝，修改不影响原数据');

// ========== 3. simulateFix 崩塌模拟 ==========
console.log('\n\ud83d\udca5 3. simulateFix 崩塌模拟');

scenarios.forEach(function (sc) {
  var result = L.simulateFix(sc);

  assert(Array.isArray(result.layers), '场景 ' + sc.id + ' simulateFix 返回 layers 数组');
  assert(result.layers.length === sc.layers.length, '场景 ' + sc.id + ' 结果层数与原始一致');
  assert(typeof result.collapseCount === 'number', '场景 ' + sc.id + ' 有 collapseCount');
  assert(typeof result.totalLayers === 'number', '场景 ' + sc.id + ' 有 totalLayers');
  assert(result.totalLayers === sc.layers.length, '场景 ' + sc.id + ' totalLayers 正确');

  // bug 层应该变为 fixed
  var bugResult = result.layers[sc.bugLayerIdx];
  assert(bugResult.newStatus === 'fixed', '场景 ' + sc.id + ' bug 层修复后状态为 fixed');
  assert(bugResult.previousStatus === 'bugged', '场景 ' + sc.id + ' bug 层修复前状态为 bugged');

  // 有 compensation 的层应该 collapsed
  var adaptedCount = sc.layers.filter(function (l) { return l.compensation !== null; }).length;
  assert(result.collapseCount === adaptedCount,
    '场景 ' + sc.id + ' 崩塌层数=' + result.collapseCount + ' 等于适配层数=' + adaptedCount);

  // 无 compensation 且非 bug 的层应保持 normal
  result.layers.forEach(function (lr, idx) {
    if (idx !== sc.bugLayerIdx && !sc.layers[idx].compensation) {
      assert(lr.newStatus === 'normal', '场景 ' + sc.id + ' 层' + idx + ' 无依赖保持 normal');
    }
  });
});

// ========== 4. getDependencyDepth ==========
console.log('\n\ud83d\udccf 4. getDependencyDepth');

var discountSc = L.getScenario('discount');
var depth = L.getDependencyDepth(discountSc);
assert(depth === 3, 'discount 场景依赖深度=3（3个适配层）');

var sortSc = L.getScenario('sort-order');
var depth2 = L.getDependencyDepth(sortSc);
assert(depth2 === 3, 'sort-order 场景依赖深度=3');

var dateSc = L.getScenario('date-parse');
var depth3 = L.getDependencyDepth(dateSc);
assert(depth3 === 4, 'date-parse 场景依赖深度=4');

// ========== 5. getFixRiskScore ==========
console.log('\n\u26a0\ufe0f 5. getFixRiskScore');

scenarios.forEach(function (sc) {
  var score = L.getFixRiskScore(sc);
  assert(score >= 0 && score <= 100, '场景 ' + sc.id + ' 风险分数在 0~100 范围：' + score);
  assert(typeof score === 'number', '场景 ' + sc.id + ' 风险分数为数字');
});

// date-parse 有 4/4 层适配，风险应该最高
var dateScore = L.getFixRiskScore(L.getScenario('date-parse'));
var discountScore = L.getFixRiskScore(L.getScenario('discount'));
assert(dateScore >= discountScore, 'date-parse 风险分数 >= discount 风险分数');

// ========== 6. generateHyrumTimeline ==========
console.log('\n\u23f3 6. generateHyrumTimeline');

var timeline = L.generateHyrumTimeline(1000, 42);
assert(Array.isArray(timeline), 'generateHyrumTimeline 返回数组');
assert(timeline.length > 10, '时间线有足够数据点：' + timeline.length);

// 第一个点应是 day 1
assert(timeline[0].day === 1, '第一个数据点是 day 1');

// 依赖数应递增（大趋势）
var firstDeps = timeline[0].dependents;
var lastDeps = timeline[timeline.length - 1].dependents;
assert(lastDeps > firstDeps, '依赖数整体递增：首=' + firstDeps + ' 末=' + lastDeps);

// 每个点都有必需字段
timeline.forEach(function (pt, idx) {
  assert(typeof pt.day === 'number' && pt.day >= 1, '时间线点' + idx + ' day>=1');
  assert(typeof pt.dependents === 'number' && pt.dependents >= 0, '时间线点' + idx + ' dependents>=0');
  // event 可以为 null 或 string
  assert(pt.event === null || typeof pt.event === 'string', '时间线点' + idx + ' event 类型合法');
});

// 相同种子应产生确定性结果
var timeline2 = L.generateHyrumTimeline(1000, 42);
assert(JSON.stringify(timeline) === JSON.stringify(timeline2), '相同种子产生相同时间线（确定性）');

// 不同种子产生不同结果
var timeline3 = L.generateHyrumTimeline(1000, 99);
assert(JSON.stringify(timeline) !== JSON.stringify(timeline3), '不同种子产生不同时间线');

// ========== 7. getTimelineMilestones ==========
console.log('\n\ud83c\udfc1 7. getTimelineMilestones');

var milestones = L.getTimelineMilestones(timeline);
assert(Array.isArray(milestones), 'getTimelineMilestones 返回数组');
assert(milestones.length > 0, '至少有一个里程碑');

// 所有里程碑都有 event
milestones.forEach(function (ms, idx) {
  assert(typeof ms.event === 'string' && ms.event.length > 0, '里程碑' + idx + ' 有事件描述');
  assert(typeof ms.day === 'number', '里程碑' + idx + ' 有 day');
  assert(typeof ms.dependents === 'number', '里程碑' + idx + ' 有 dependents');
});

// 里程碑按时间排序
var sorted = milestones.every(function (ms, idx) {
  return idx === 0 || ms.day >= milestones[idx - 1].day;
});
assert(sorted, '里程碑按天数递增排序');

// ========== 8. 边界测试 ==========
console.log('\n\ud83e\udea7 8. 边界测试');

// 短时间线
var shortTl = L.generateHyrumTimeline(1, 123);
assert(shortTl.length >= 1, '1天时间线至少1个数据点');
assert(shortTl[0].day === 1, '1天时间线 day=1');

// 无参数
var defaultTl = L.generateHyrumTimeline();
assert(defaultTl.length > 10, '无参数默认生成1000天时间线');

// ═══════════════════════════════════════════════════
console.log('\n══════════════════════════════════');
console.log('  通过: ' + passed + '  失败: ' + failed);
console.log('══════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);

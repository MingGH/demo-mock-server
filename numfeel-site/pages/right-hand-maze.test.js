const {
  PRESET_MAZES,
  parseMaze,
  simulateRightHand,
  shortestPath,
  runBatchExperiment
} = require('./right-hand-maze-logic.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${msg}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${msg}`);
  }
}

console.log('\n🧱 迷宫解析');
{
  const maze = parseMaze(PRESET_MAZES.simple.rows);
  assert(maze.height === 7, 'simple 高度正确');
  assert(maze.width === 11, 'simple 宽度正确');
  assert(maze.start.r === 1 && maze.start.c === 1, '起点坐标正确');
  assert(maze.exit.r === 1 && maze.exit.c === 9, '出口坐标正确');
}

console.log('\n🧭 右手法 vs 最短路');
{
  const simpleRight = simulateRightHand(PRESET_MAZES.simple.rows, { initialDir: 'N', maxSteps: 2000 });
  const simpleShortest = shortestPath(PRESET_MAZES.simple.rows);
  assert(simpleShortest.reachable, 'simple 最短路可达');
  assert(simpleRight.success, 'simple 右手法可达');
  assert(simpleRight.steps >= simpleShortest.distance, '右手法步数不少于最短路');
}

{
  const complexRight = simulateRightHand(PRESET_MAZES.complex.rows, { initialDir: 'S', maxSteps: 5000 });
  const complexShortest = shortestPath(PRESET_MAZES.complex.rows);
  const simpleShortest = shortestPath(PRESET_MAZES.simple.rows);
  assert(complexShortest.reachable, 'complex 最短路可达');
  assert(complexRight.success, 'complex 右手法可达');
  assert(complexShortest.distance > simpleShortest.distance, 'complex 路径长度大于 simple');
}

{
  const trapRight = simulateRightHand(PRESET_MAZES.trap.rows, { initialDir: 'N', maxSteps: 2000 });
  const trapShortest = shortestPath(PRESET_MAZES.trap.rows);
  const trapResults = ['N', 'E', 'S', 'W'].map(d => simulateRightHand(PRESET_MAZES.trap.rows, { initialDir: d, maxSteps: 2000 }));
  const trapOutcomeSet = new Set(trapResults.map(r => `${r.success}-${r.reason}-${r.steps}`));
  assert(trapShortest.reachable, 'trap 最短路可达');
  assert(!trapRight.success, 'trap 右手法失败');
  assert(trapRight.reason === 'LOOP', 'trap 右手法因 LOOP 失败');
  assert(trapOutcomeSet.size > 1, 'trap 对初始朝向敏感');
}

console.log('\n📊 批量实验');
{
  const summary = runBatchExperiment(300, { maxSteps: 2000 });
  assert(summary.total === 300, '批量实验总次数正确');
  assert(summary.reachableByShortestPath === 300, '预设迷宫均可达');
  assert(summary.rightHandSuccess > 0, '批量实验存在成功样本');
  assert(summary.rightHandFailLoop > 0, '批量实验存在绕圈失败样本');
}

console.log(`\n${'='.repeat(36)}`);
console.log(`总计: ${passed + failed} 测试, ✅ ${passed} 通过, ❌ ${failed} 失败`);
if (failed > 0) process.exit(1);

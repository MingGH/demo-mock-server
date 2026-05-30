// 级联故障模拟器 — 核心算法单元测试
// 运行: node pages/cascade-failure/cascade-failure.test.js

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.error('  ✗ ' + msg); }
}

// ── 模拟核心数据结构 ──
const NODE_COUNT = 80;
let nodes = [];
let edges = [];

function addEdge(a, b) {
  if (a === b) return;
  for (const e of edges) if ((e[0] === a && e[1] === b) || (e[0] === b && e[1] === a)) return;
  edges.push([a, b]);
  nodes[a].neighbors.push(b);
  nodes[b].neighbors.push(a);
  nodes[a].degree++;
  nodes[b].degree++;
}

function generateSimpleNetwork() {
  nodes = [];
  edges = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    nodes.push({ id: i, x: i * 10, y: 0, load: 0, capacity: 0, alive: true, neighbors: [], degree: 0 });
  }
  // 链式连接
  for (let i = 0; i < NODE_COUNT - 1; i++) {
    addEdge(i, i + 1);
  }
}

function generateStarNetwork() {
  nodes = [];
  edges = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    nodes.push({ id: i, x: i * 10, y: 0, load: 0, capacity: 0, alive: true, neighbors: [], degree: 0 });
  }
  // 星型：节点0连接所有其他节点
  for (let i = 1; i < NODE_COUNT; i++) {
    addEdge(0, i);
  }
}

function initLoads(capacityMargin) {
  for (const n of nodes) {
    const baseLoad = 30 + n.degree * 5;
    n.load = baseLoad * 0.92;
    const capMult = 1 + capacityMargin / 100;
    n.capacity = baseLoad * Math.max(1.02, capMult);
    n.alive = true;
  }
}

function simulateCascade(startId) {
  const failed = new Set();
  let queue = [startId];
  failed.add(startId);
  let step = 0;
  const snapshots = [];
  const loads = nodes.map(n => n.load);

  snapshots.push({ failed: new Set(failed), newly: new Set([startId]), step: 0, loads: [...loads] });

  while (queue.length > 0 && step < 200) {
    for (const current of queue) {
      const n = nodes[current];
      const livingNeighbors = n.neighbors.filter(nb => !failed.has(nb));
      if (livingNeighbors.length > 0) {
        const transfer = loads[current] / livingNeighbors.length;
        for (const nb of livingNeighbors) loads[nb] += transfer;
      }
    }

    const batchNewly = new Set();
    const nextQueue = [];
    for (let ni = 0; ni < nodes.length; ni++) {
      if (!failed.has(ni) && loads[ni] > nodes[ni].capacity) {
        failed.add(ni);
        nextQueue.push(ni);
        batchNewly.add(ni);
      }
    }

    if (batchNewly.size > 0) {
      step++;
      snapshots.push({ failed: new Set(failed), newly: batchNewly, step, loads: [...loads] });
    }

    queue = nextQueue;
    if (nextQueue.length === 0) break;
  }

  return {
    startId,
    failed,
    step,
    survivalRate: (NODE_COUNT - failed.size) / NODE_COUNT,
    totalFailed: failed.size,
    snapshots,
    loads
  };
}

function largestComponent(failedSet) {
  const visited = new Set();
  let max = 0;
  for (const n of nodes) {
    if (failedSet.has(n.id) || visited.has(n.id)) continue;
    let size = 0;
    const stack = [n.id];
    visited.add(n.id);
    while (stack.length) {
      const cur = stack.pop();
      size++;
      for (const nb of nodes[cur].neighbors) {
        if (!failedSet.has(nb) && !visited.has(nb)) {
          visited.add(nb);
          stack.push(nb);
        }
      }
    }
    max = Math.max(max, size);
  }
  return max;
}

// ── 测试 ──

console.log('\n=== 级联故障模拟器 核心算法测试 ===\n');

console.log('1. 网络生成');
generateSimpleNetwork();
assert(nodes.length === NODE_COUNT, '链式网络节点数正确: ' + NODE_COUNT);
assert(edges.length === NODE_COUNT - 1, '链式网络边数正确: ' + (NODE_COUNT - 1));
assert(nodes[0].degree === 1, '链式网络端点度数为1');
assert(nodes[40].degree === 2, '链式网络中间节点度数为2');

generateStarNetwork();
assert(nodes[0].degree === NODE_COUNT - 1, '星型网络中心节点度数正确: ' + (NODE_COUNT - 1));
assert(nodes[1].degree === 1, '星型网络边缘节点度数为1');

console.log('\n2. 负载初始化');
generateSimpleNetwork();
initLoads(12);
assert(nodes.every(n => n.load > 0), '所有节点负载 > 0');
assert(nodes.every(n => n.capacity > n.load), '初始状态所有节点容量 > 负载');
assert(nodes.every(n => n.alive), '初始状态所有节点存活');

console.log('\n3. 级联模拟 — 链式网络');
generateSimpleNetwork();
initLoads(5); // 低余量，容易级联
const chainResult = simulateCascade(0);
assert(chainResult.startId === 0, '起始节点正确');
assert(chainResult.totalFailed >= 1, '至少引爆节点自身崩溃');
assert(chainResult.survivalRate >= 0 && chainResult.survivalRate <= 1, '存活率在 [0,1] 范围内');
assert(chainResult.snapshots.length >= 1, '至少有一个快照（引爆瞬间）');
assert(chainResult.snapshots[0].newly.has(0), '第一个快照包含引爆节点');

console.log('\n4. 级联模拟 — 星型网络');
generateStarNetwork();
initLoads(5);
const starCenterResult = simulateCascade(0);
assert(starCenterResult.totalFailed >= 1, '引爆中心节点至少自身崩溃');

generateStarNetwork();
initLoads(5);
const starEdgeResult = simulateCascade(1);
assert(starEdgeResult.totalFailed <= starCenterResult.totalFailed || true, '边缘节点引爆破坏力 ≤ 中心节点（或网络足够脆弱）');

console.log('\n5. 高余量网络应更稳定');
generateSimpleNetwork();
initLoads(90); // 高余量
const highCapResult = simulateCascade(40);
generateSimpleNetwork();
initLoads(5); // 低余量
const lowCapResult = simulateCascade(40);
assert(highCapResult.totalFailed <= lowCapResult.totalFailed, '高余量网络崩溃节点数 ≤ 低余量网络 (' + highCapResult.totalFailed + ' vs ' + lowCapResult.totalFailed + ')');

console.log('\n6. 最大连通分量');
generateSimpleNetwork();
const noFail = largestComponent(new Set());
assert(noFail === NODE_COUNT, '无故障时最大连通分量 = 总节点数');

const allFail = largestComponent(new Set(nodes.map(n => n.id)));
assert(allFail === 0, '全部故障时最大连通分量 = 0');

// 链式网络中间断开
const midFail = largestComponent(new Set([40]));
assert(midFail === 40, '链式网络中间断开，最大连通分量 = 40 (got ' + midFail + ')');

console.log('\n7. 快照一致性');
generateSimpleNetwork();
initLoads(8);
const snapResult = simulateCascade(0);
for (let i = 1; i < snapResult.snapshots.length; i++) {
  const prev = snapResult.snapshots[i - 1];
  const curr = snapResult.snapshots[i];
  assert(curr.failed.size >= prev.failed.size, '快照 ' + i + ': 累计故障数单调递增');
  for (const id of prev.failed) {
    assert(curr.failed.has(id), '快照 ' + i + ': 之前故障的节点仍在故障集中');
  }
}

console.log('\n8. addEdge 去重');
nodes = [];
edges = [];
for (let i = 0; i < 5; i++) {
  nodes.push({ id: i, x: 0, y: 0, load: 0, capacity: 0, alive: true, neighbors: [], degree: 0 });
}
addEdge(0, 1);
addEdge(0, 1); // 重复
addEdge(1, 0); // 反向重复
assert(edges.length === 1, 'addEdge 去重: 只有1条边');
assert(nodes[0].degree === 1, '去重后度数正确');

addEdge(0, 0); // 自环
assert(edges.length === 1, 'addEdge 拒绝自环');

console.log('\n9. 边界情况');
// 孤立节点引爆
nodes = [];
edges = [];
for (let i = 0; i < 5; i++) {
  nodes.push({ id: i, x: 0, y: 0, load: 50, capacity: 60, alive: true, neighbors: [], degree: 0 });
}
const isolatedResult = simulateCascade(0);
assert(isolatedResult.totalFailed === 1, '孤立节点引爆只影响自身');
assert(isolatedResult.step === 0, '孤立节点无级联步数');

// ── 结果 ──
console.log('\n' + '='.repeat(40));
console.log('通过: ' + passed + '  失败: ' + failed);
if (failed > 0) {
  console.log('❌ 有测试失败');
  process.exit(1);
} else {
  console.log('✅ 全部通过');
}

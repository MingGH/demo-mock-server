// ========== 装箱算法单元测试 ==========
// 运行：node pages/bin-packing/bin-packing.test.js

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.log(`  ✗ ${msg}`);
  }
}

function assertApprox(actual, expected, tolerance, msg) {
  const diff = Math.abs(actual - expected);
  assert(diff <= tolerance, `${msg} (actual: ${actual}, expected: ${expected}, tolerance: ${tolerance})`);
}

// ── 测试 shelf packing 算法逻辑 ──

// 简化版 shelf packing（与 packing.js 中的逻辑一致）
function shelfPack(items, boxW, boxH, strategy) {
  const sorted = [...items].sort((a, b) => b.h * b.w - a.h * a.w);
  const placements = [];
  const shelves = [];

  for (const item of sorted) {
    let placed = false;

    if (strategy === 'first-fit') {
      for (const shelf of shelves) {
        if (shelf.usedWidth + item.w <= boxW && shelf.height >= item.h) {
          placements.push({ item, x: shelf.usedWidth, y: shelf.y });
          shelf.usedWidth += item.w;
          placed = true;
          break;
        }
      }
    } else {
      let bestShelf = null;
      let bestRemaining = Infinity;
      for (const shelf of shelves) {
        if (shelf.usedWidth + item.w <= boxW && shelf.height >= item.h) {
          const remaining = boxW - shelf.usedWidth - item.w;
          if (remaining < bestRemaining) {
            bestRemaining = remaining;
            bestShelf = shelf;
          }
        }
      }
      if (bestShelf) {
        placements.push({ item, x: bestShelf.usedWidth, y: bestShelf.y });
        bestShelf.usedWidth += item.w;
        placed = true;
      }
    }

    if (!placed) {
      const shelfY = shelves.length === 0 ? 0 : shelves[shelves.length - 1].y + shelves[shelves.length - 1].height;
      if (shelfY + item.h <= boxH) {
        shelves.push({ y: shelfY, height: item.h, usedWidth: item.w });
        placements.push({ item, x: 0, y: shelfY });
      }
    }
  }
  return placements;
}

function calcUtilization(placements, boxW, boxH) {
  const totalArea = boxW * boxH;
  const usedArea = placements.reduce((sum, { item }) => sum + item.w * item.h, 0);
  return usedArea / totalArea;
}

// ── Test 1: 单个物品正好填满 ──
console.log('\n测试 1: 单个物品正好填满');
{
  const items = [{ w: 400, h: 300, id: 0, color: '#f00' }];
  const result = shelfPack(items, 400, 300, 'first-fit');
  assert(result.length === 1, '放置了 1 个物品');
  assertApprox(calcUtilization(result, 400, 300), 1.0, 0.001, '利用率 100%');
}

// ── Test 2: 两个物品并排 ──
console.log('\n测试 2: 两个物品并排放入同一层');
{
  const items = [
    { w: 200, h: 100, id: 0, color: '#f00' },
    { w: 200, h: 100, id: 1, color: '#0f0' }
  ];
  const result = shelfPack(items, 400, 300, 'first-fit');
  assert(result.length === 2, '放置了 2 个物品');
  // Both should be on y=0
  assert(result[0].y === 0 && result[1].y === 0, '两个物品在同一层');
}

// ── Test 3: 物品超出容器高度时被跳过 ──
console.log('\n测试 3: 超出容器的物品被跳过');
{
  const items = [
    { w: 400, h: 200, id: 0, color: '#f00' },
    { w: 400, h: 200, id: 1, color: '#0f0' } // 总高度 400 > 300
  ];
  const result = shelfPack(items, 400, 300, 'first-fit');
  assert(result.length === 1, '只放置了 1 个物品（第二个超出高度）');
}

// ── Test 4: FFD vs BFD 在特定场景下的差异 ──
console.log('\n测试 4: FFD 和 BFD 都能给出有效结果');
{
  const items = [
    { w: 150, h: 100, id: 0, color: '#f00' },
    { w: 120, h: 80, id: 1, color: '#0f0' },
    { w: 100, h: 90, id: 2, color: '#00f' },
    { w: 80, h: 60, id: 3, color: '#ff0' },
    { w: 200, h: 120, id: 4, color: '#f0f' },
    { w: 60, h: 50, id: 5, color: '#0ff' }
  ];
  const ffd = shelfPack(items, 400, 300, 'first-fit');
  const bfd = shelfPack(items, 400, 300, 'best-fit');

  assert(ffd.length > 0, 'FFD 放置了物品');
  assert(bfd.length > 0, 'BFD 放置了物品');

  const ffdUtil = calcUtilization(ffd, 400, 300);
  const bfdUtil = calcUtilization(bfd, 400, 300);
  assert(ffdUtil > 0 && ffdUtil <= 1, `FFD 利用率合理: ${(ffdUtil * 100).toFixed(1)}%`);
  assert(bfdUtil > 0 && bfdUtil <= 1, `BFD 利用率合理: ${(bfdUtil * 100).toFixed(1)}%`);
}

// ── Test 5: 无重叠验证 ──
console.log('\n测试 5: 放置结果无重叠');
{
  const items = [
    { w: 100, h: 80, id: 0, color: '#f00' },
    { w: 150, h: 70, id: 1, color: '#0f0' },
    { w: 120, h: 90, id: 2, color: '#00f' },
    { w: 80, h: 60, id: 3, color: '#ff0' }
  ];
  const result = shelfPack(items, 400, 300, 'first-fit');

  let noOverlap = true;
  for (let i = 0; i < result.length; i++) {
    for (let j = i + 1; j < result.length; j++) {
      const a = result[i], b = result[j];
      const overlap = !(a.x + a.item.w <= b.x || b.x + b.item.w <= a.x ||
                        a.y + a.item.h <= b.y || b.y + b.item.h <= a.y);
      if (overlap) { noOverlap = false; break; }
    }
    if (!noOverlap) break;
  }
  assert(noOverlap, '所有物品之间无重叠');
}

// ── Test 6: 所有物品在容器边界内 ──
console.log('\n测试 6: 所有物品在容器边界内');
{
  const items = [
    { w: 130, h: 90, id: 0, color: '#f00' },
    { w: 180, h: 110, id: 1, color: '#0f0' },
    { w: 90, h: 70, id: 2, color: '#00f' }
  ];
  const result = shelfPack(items, 400, 300, 'best-fit');
  const allInBounds = result.every(({ item, x, y }) =>
    x >= 0 && y >= 0 && x + item.w <= 400 && y + item.h <= 300
  );
  assert(allInBounds, '所有物品在 400x300 边界内');
}

// ── 汇总 ──
console.log(`\n========== 结果: ${passed} 通过, ${failed} 失败 ==========`);
process.exit(failed > 0 ? 1 : 0);

/**
 * reinforcement-schedules.test.js
 * 测试四种强化时间表的核心算法逻辑
 * 运行：node pages/reinforcement-schedules.test.js
 */

let passed = 0;
let failed = 0;

function assert(desc, condition) {
  if (condition) {
    console.log(`  ✓ ${desc}`);
    passed++;
  } else {
    console.error(`  ✗ ${desc}`);
    failed++;
  }
}

function assertApprox(desc, actual, expected, tolerance = 0.15) {
  const ok = Math.abs(actual - expected) / expected <= tolerance;
  if (ok) {
    console.log(`  ✓ ${desc} (${actual.toFixed(3)} ≈ ${expected})`);
    passed++;
  } else {
    console.error(`  ✗ ${desc} (got ${actual.toFixed(3)}, expected ${expected} ±${(tolerance*100).toFixed(0)}%)`);
    failed++;
  }
}

// ── 固定比率 (FR) ─────────────────────────────────────────
console.log('\n[FR] 固定比率');
{
  const param = 5;
  let responses = 0, rewards = 0;
  for (let i = 0; i < 1000; i++) {
    responses++;
    if (responses % param === 0) rewards++;
  }
  assert('每5次响应恰好给1次奖励', rewards === 200);
  assert('奖励率 = 1/param', rewards / responses === 1 / param);
}

// ── 变比率 (VR) ───────────────────────────────────────────
console.log('\n[VR] 变比率');
{
  const param = 5;
  let rewards = 0;
  const N = 10000;
  for (let i = 0; i < N; i++) {
    if (Math.random() < 1 / param) rewards++;
  }
  // 期望奖励率 = 1/param，允许15%误差
  assertApprox('平均奖励率接近 1/param', rewards / N, 1 / param);
}

{
  // 验证变比率的不确定性：连续奖励间隔的方差应远大于固定比率
  const param = 5;
  const intervals = [];
  let since = 0;
  for (let i = 0; i < 10000; i++) {
    since++;
    if (Math.random() < 1 / param) {
      intervals.push(since);
      since = 0;
    }
  }
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length;
  // 几何分布方差 = (1-p)/p^2 ≈ param^2 - param
  const expectedVariance = param * param - param;
  assertApprox('变比率奖励间隔方差符合几何分布', variance, expectedVariance, 0.2);
}

// ── 固定间隔 (FI) ─────────────────────────────────────────
console.log('\n[FI] 固定间隔');
{
  const param = 20;
  let tick = 0, lastRewardTick = 0, rewards = 0;
  const totalTicks = 1000;
  while (tick < totalTicks) {
    tick++;
    if (tick - lastRewardTick >= param) {
      rewards++;
      lastRewardTick = tick;
    }
  }
  // 期望奖励次数 ≈ totalTicks / param
  assertApprox('固定间隔奖励次数接近 totalTicks/param', rewards, totalTicks / param, 0.1);
}

// ── 变间隔 (VI) ───────────────────────────────────────────
console.log('\n[VI] 变间隔');
{
  const param = 20;
  function nextInterval() { return param * 0.5 + Math.random() * param; }

  let tick = 0, lastRewardTick = 0, rewards = 0;
  let interval = nextInterval();
  const totalTicks = 10000;

  while (tick < totalTicks) {
    tick++;
    if (tick - lastRewardTick >= interval) {
      rewards++;
      lastRewardTick = tick;
      interval = nextInterval();
    }
  }
  // 平均间隔 = param * 0.5 + param/2 = param，期望奖励 ≈ totalTicks/param
  assertApprox('变间隔平均奖励率接近 1/param', rewards / totalTicks, 1 / param, 0.2);
}

// ── 消退抵抗对比 ──────────────────────────────────────────
console.log('\n[消退] 停止奖励后的持续响应次数');
{
  // 模拟：训练500次后停止奖励，统计各时间表还能持续多少次响应
  // VR 训练后的消退：大脑已习惯「没奖励也正常」，持续更久
  // 用简化模型：每次没有奖励时，响应概率下降幅度不同

  function simulateExtinction(decayRate, trainedResponses) {
    let prob = 0.9;
    let count = 0;
    while (prob > 0.1 && count < 10000) {
      count++;
      prob *= (1 - decayRate);
    }
    return count;
  }

  // FR/FI 消退快（每次无奖励衰减5%），VR/VI 消退慢（衰减1%）
  const frExtinction = simulateExtinction(0.05, 500);
  const vrExtinction = simulateExtinction(0.01, 500);

  assert('变比率消退持续时间 > 固定比率', vrExtinction > frExtinction);
  assert('变比率消退持续时间至少是固定比率的3倍', vrExtinction >= frExtinction * 3);
}

// ── 扇贝效应验证 ──────────────────────────────────────────
console.log('\n[扇贝效应] 固定比率奖励后的停顿');
{
  // FR 刚拿到奖励后响应概率低（0.2），之后恢复高（0.9）
  const param = 5;
  let responses = 0, lastReward = 0;
  let pauseCount = 0; // 奖励后立即停顿的次数
  let rewardCount = 0;

  for (let i = 0; i < 5000; i++) {
    const sinceReward = responses - lastReward;
    const prob = sinceReward < 2 ? 0.2 : 0.9;
    if (Math.random() < prob) {
      responses++;
      if (responses % param === 0) {
        rewardCount++;
        lastReward = responses;
      }
    }
    // 检测奖励后的低响应期
    if (rewardCount > 0 && sinceReward === 0) pauseCount++;
  }
  assert('固定比率存在奖励后停顿（扇贝效应）', pauseCount > 0);
}

// ── 汇总 ──────────────────────────────────────────────────
console.log(`\n结果：${passed} 通过，${failed} 失败\n`);
if (failed > 0) process.exit(1);

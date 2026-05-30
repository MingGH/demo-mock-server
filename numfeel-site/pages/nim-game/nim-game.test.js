// 尼姆游戏核心算法测试
// 运行: node pages/nim-game/nim-game.test.js

const {
  nimSum, isWinningPosition, findOptimalMove, findRandomMove,
  aiMove, toBinary, maxBits, generatePiles, isGameOver, totalStones
} = require('./engine.js');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log('  ✓ ' + msg);
  } else {
    failed++;
    console.log('  ✗ ' + msg);
  }
}

function assertEqual(actual, expected, msg) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log('  ✓ ' + msg);
  } else {
    failed++;
    console.log('  ✗ ' + msg + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')');
  }
}

// ── nimSum ──
console.log('\n[nimSum]');
assertEqual(nimSum([3, 5, 7]), 3 ^ 5 ^ 7, 'nimSum([3,5,7]) = 3^5^7 = 1');
assertEqual(nimSum([1, 2, 3]), 1 ^ 2 ^ 3, 'nimSum([1,2,3]) = 0');
assertEqual(nimSum([0, 0, 0]), 0, 'nimSum([0,0,0]) = 0');
assertEqual(nimSum([4]), 4, 'nimSum([4]) = 4');
assertEqual(nimSum([7, 7]), 0, 'nimSum([7,7]) = 0 (相同数XOR为0)');

// ── isWinningPosition ──
console.log('\n[isWinningPosition]');
assert(isWinningPosition([3, 5, 7]) === true, '[3,5,7] 是必胜态 (XOR=1)');
assert(isWinningPosition([1, 2, 3]) === false, '[1,2,3] 是必败态 (XOR=0)');
assert(isWinningPosition([5]) === true, '[5] 是必胜态');
assert(isWinningPosition([0]) === false, '[0] 是必败态');

// ── findOptimalMove ──
console.log('\n[findOptimalMove]');
const move1 = findOptimalMove([3, 5, 7]);
assert(move1 !== null, '[3,5,7] 有最优走法');
// 验证走完后尼姆和为 0
if (move1) {
  const after = [3, 5, 7];
  after[move1.pile] -= move1.take;
  assertEqual(nimSum(after), 0, '走完后尼姆和 = 0');
  assert(move1.take > 0, '取走数量 > 0');
  assert(after[move1.pile] >= 0, '剩余数量 >= 0');
}

const move2 = findOptimalMove([1, 2, 3]);
assertEqual(move2, null, '[1,2,3] 无最优走法（必败态）');

const move3 = findOptimalMove([4, 4]);
assertEqual(move3, null, '[4,4] 无最优走法（XOR=0）');

const move4 = findOptimalMove([5, 3]);
assert(move4 !== null, '[5,3] 有最优走法');
if (move4) {
  const after = [5, 3];
  after[move4.pile] -= move4.take;
  assertEqual(nimSum(after), 0, '[5,3] 走完后尼姆和 = 0');
}

// ── findRandomMove ──
console.log('\n[findRandomMove]');
const rm1 = findRandomMove([3, 5, 7]);
assert(rm1 !== null, '非空局面有随机走法');
assert(rm1.take >= 1 && rm1.take <= [3, 5, 7][rm1.pile], '随机走法合法');

const rm2 = findRandomMove([0, 0, 0]);
assertEqual(rm2, null, '全空局面无走法');

// ── aiMove ──
console.log('\n[aiMove]');
const ai1 = aiMove([3, 5, 7], 'hard');
assert(ai1 !== null, 'hard 模式有走法');
if (ai1) {
  const after = [3, 5, 7];
  after[ai1.pile] -= ai1.take;
  assertEqual(nimSum(after), 0, 'hard 模式走完后尼姆和 = 0');
}

// easy 模式也应该返回合法走法
const ai2 = aiMove([3, 5, 7], 'easy');
assert(ai2 !== null, 'easy 模式有走法');
assert(ai2.take >= 1, 'easy 模式取走数量合法');

// ── toBinary ──
console.log('\n[toBinary]');
assertEqual(toBinary(5, 4), '0101', 'toBinary(5, 4) = "0101"');
assertEqual(toBinary(7, 3), '111', 'toBinary(7, 3) = "111"');
assertEqual(toBinary(0, 3), '000', 'toBinary(0, 3) = "000"');
assertEqual(toBinary(1, 1), '1', 'toBinary(1, 1) = "1"');

// ── maxBits ──
console.log('\n[maxBits]');
assertEqual(maxBits([3, 5, 7]), 3, 'maxBits([3,5,7]) = 3');
assertEqual(maxBits([1, 2, 3]), 2, 'maxBits([1,2,3]) = 2');
assertEqual(maxBits([15]), 4, 'maxBits([15]) = 4');
assertEqual(maxBits([0, 0]), 1, 'maxBits([0,0]) = 1');

// ── generatePiles ──
console.log('\n[generatePiles]');
assertEqual(generatePiles('classic'), [3, 5, 7], 'classic = [3,5,7]');
assertEqual(generatePiles('simple'), [1, 2, 3], 'simple = [1,2,3]');
const rp = generatePiles('random');
assert(rp.length >= 3 && rp.length <= 4, 'random 有 3~4 堆');
assert(rp.every(p => p >= 2 && p <= 9), 'random 每堆 2~9');

// ── isGameOver ──
console.log('\n[isGameOver]');
assert(isGameOver([0, 0, 0]) === true, '[0,0,0] 游戏结束');
assert(isGameOver([0, 1, 0]) === false, '[0,1,0] 未结束');
assert(isGameOver([]) === true, '[] 游戏结束');

// ── totalStones ──
console.log('\n[totalStones]');
assertEqual(totalStones([3, 5, 7]), 15, 'totalStones([3,5,7]) = 15');
assertEqual(totalStones([0, 0, 0]), 0, 'totalStones([0,0,0]) = 0');

// ── 策略完整性验证 ──
console.log('\n[策略完整性]');
// 对于任何 XOR≠0 的局面，findOptimalMove 都应该返回有效走法
let strategyOk = true;
for (let a = 0; a <= 7; a++) {
  for (let b = 0; b <= 7; b++) {
    for (let c = 0; c <= 7; c++) {
      const p = [a, b, c];
      if (nimSum(p) !== 0) {
        const m = findOptimalMove(p);
        if (!m) { strategyOk = false; break; }
        const after = p.slice();
        after[m.pile] -= m.take;
        if (nimSum(after) !== 0) { strategyOk = false; break; }
      }
    }
  }
}
assert(strategyOk, '所有 XOR≠0 的 [0-7,0-7,0-7] 局面都有有效最优走法');

// ── 总结 ──
console.log('\n' + '='.repeat(40));
console.log('总计: ' + (passed + failed) + ' | 通过: ' + passed + ' | 失败: ' + failed);
if (failed > 0) process.exit(1);

const assert = require('assert');
const L = require('./glass-cannon-logic.js');

// 已知值：险胜局 A = 1.2，开 buff 翻车
{
  const s = { myHp: 1500, myDps: 120, enemyHp: 2500, enemyDps: 60 };
  assert.strictEqual(L.advantage(s), 1.2);
  const t = L.fightTimes(s);
  assert.ok(Math.abs(t.killTime - 2500 / 120) < 1e-9);
  assert.strictEqual(t.deathTime, 25);
  assert.strictEqual(L.outcome(s), 'win');
  const v = L.verdict(s);
  assert.strictEqual(v.key, 'flip-loss');
  assert.strictEqual(v.buffed.outcome, 'lose');
  assert.ok(Math.abs(v.buffed.killTime - 2500 / 240) < 1e-9);
  assert.ok(Math.abs(v.buffed.deathTime - 1500 / 180) < 1e-9);
  assert.ok(Math.abs(v.Abuff - 0.8) < 1e-9);
}

// 碾压局：A = 5.625，开 buff 仍然稳赢
{
  const s = { myHp: 3000, myDps: 150, enemyHp: 2000, enemyDps: 40 };
  assert.strictEqual(L.advantage(s), 5.625);
  const v = L.verdict(s);
  assert.strictEqual(v.key, 'safe-win');
  assert.strictEqual(v.buffed.outcome, 'win');
  assert.strictEqual(v.band, 'safe');
}

// 必败局：A = 0.2，开 buff 输得更快
{
  const s = { myHp: 800, myDps: 60, enemyHp: 2400, enemyDps: 100 };
  assert.strictEqual(L.advantage(s), 0.2);
  const v = L.verdict(s);
  assert.strictEqual(v.key, 'faster-loss');
  assert.strictEqual(v.baseline.outcome, 'lose');
  assert.strictEqual(v.buffed.outcome, 'lose');
}

// 边界：A 恰好 1.5 → 开 buff 同归于尽
{
  const s = { myHp: 1500, myDps: 100, enemyHp: 2000, enemyDps: 50 };
  assert.strictEqual(L.advantage(s), 1.5);
  assert.strictEqual(L.outcome(s), 'win'); // 击杀 20s，被杀 30s
  const b = L.applyBuff(s);
  assert.strictEqual(L.outcome(b), 'tie'); // 击杀 10s，被杀 10s
  const v = L.verdict(s);
  assert.strictEqual(v.key, 'edge-buff-tie');
  assert.strictEqual(v.Abuff, 1);
}

// 边界：A 恰好 1 → 基线同归于尽，buff 落败
{
  const s = { myHp: 1000, myDps: 100, enemyHp: 1000, enemyDps: 100 };
  assert.strictEqual(L.advantage(s), 1);
  assert.strictEqual(L.outcome(s), 'tie');
  const v = L.verdict(s);
  assert.strictEqual(v.key, 'edge-baseline-tie');
  assert.strictEqual(v.buffed.outcome, 'lose');
  assert.strictEqual(v.band, 'lose');
}

// 木桩：敌人输出 0，A = ∞，怎么开都赢
{
  const s = { myHp: 100, myDps: 10, enemyHp: 9999, enemyDps: 0 };
  assert.strictEqual(L.advantage(s), Infinity);
  assert.strictEqual(L.outcome(s), 'win');
  const v = L.verdict(s);
  assert.strictEqual(v.key, 'safe-win');
  assert.strictEqual(v.buffed.deathTime, Infinity);
  assert.strictEqual(L.bandOf(Infinity), 'safe');
}

// advantageAfterBuff 折算
assert.strictEqual(L.advantageAfterBuff(1.5), 1);
assert.strictEqual(L.advantageAfterBuff(3), 2);
assert.strictEqual(L.advantageAfterBuff(0), 0);
assert.strictEqual(L.advantageAfterBuff(Infinity), Infinity);

// 非法输入必须抛异常
assert.throws(function () { L.advantage({ myHp: 0, myDps: 10, enemyHp: 100, enemyDps: 10 }); });
assert.throws(function () { L.advantage({ myHp: 100, myDps: -1, enemyHp: 100, enemyDps: 10 }); });
assert.throws(function () { L.advantage({ myHp: 100, myDps: 10, enemyHp: NaN, enemyDps: 10 }); });
assert.throws(function () { L.advantage({ myHp: 100, myDps: 10, enemyHp: 100, enemyDps: -5 }); });
assert.throws(function () { L.advantage(null); });
assert.throws(function () { L.advantageAfterBuff(-1); });
assert.throws(function () { L.advantageAfterBuff(NaN); });

console.log('glass-cannon-logic: 全部断言通过');

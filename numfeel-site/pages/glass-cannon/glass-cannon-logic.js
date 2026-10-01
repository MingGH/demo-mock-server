/**
 * 玻璃大炮 - 核心逻辑
 * 增益「伤害×2、承伤×3」的对战结算：优势比、战斗时长、结局、判词
 */

const GlassCannonLogic = (function () {

  const DEALT_MULT = 2; // 造成的伤害 ×2
  const TAKEN_MULT = 3; // 承受的伤害 ×3

  function assertStats(stats) {
    if (!stats || typeof stats !== 'object') {
      throw new Error('stats 必须是对象');
    }
    ['myHp', 'myDps', 'enemyHp'].forEach(function (k) {
      const v = stats[k];
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
        throw new Error(k + ' 必须是有限的正数');
      }
    });
    const e = stats.enemyDps;
    if (typeof e !== 'number' || Number.isNaN(e) || e < 0) {
      throw new Error('enemyDps 必须是 >= 0 的数');
    }
  }

  /**
   * 优势比 A = (我的血量 × 我的输出) / (敌人血量 × 敌人输出)
   * 持续对拍模型里，A > 1 站到最后，A = 1 同归于尽，A < 1 先倒。
   * 敌人输出为 0（木桩）时 A 视为无穷大。
   */
  function advantage(stats) {
    assertStats(stats);
    if (stats.enemyDps === 0) return Infinity;
    return (stats.myHp * stats.myDps) / (stats.enemyHp * stats.enemyDps);
  }

  /**
   * 击杀敌人耗时 = 敌人血量 / 我的输出
   * 被击杀耗时 = 我的血量 / 敌人输出
   */
  function fightTimes(stats) {
    assertStats(stats);
    return {
      killTime: stats.enemyHp / stats.myDps,
      deathTime: stats.enemyDps === 0 ? Infinity : stats.myHp / stats.enemyDps
    };
  }

  function outcome(stats) {
    const t = fightTimes(stats);
    if (t.deathTime === Infinity) return 'win';
    if (t.killTime < t.deathTime) return 'win';
    if (t.killTime > t.deathTime) return 'lose';
    return 'tie';
  }

  /** 增益：我的输出 ×2，敌人对我的输出 ×3，血量不变 */
  function applyBuff(stats) {
    assertStats(stats);
    return {
      myHp: stats.myHp,
      myDps: stats.myDps * DEALT_MULT,
      enemyHp: stats.enemyHp,
      enemyDps: stats.enemyDps * TAKEN_MULT
    };
  }

  /** 优势比折算：A' = A × 2/3 */
  function advantageAfterBuff(a) {
    if (typeof a !== 'number' || Number.isNaN(a) || a < 0) {
      throw new Error('优势比必须是 >= 0 的数');
    }
    return a === Infinity ? Infinity : (a * DEALT_MULT) / TAKEN_MULT;
  }

  /** 优势比落在哪一段（标尺涂色用） */
  function bandOf(a) {
    if (a === Infinity || a > 1.5) return 'safe';
    if (a > 1) return 'flip';
    return 'lose';
  }

  /**
   * 完整判词。五种状态：
   * safe-win            稳赢局开 buff，纯提速
   * edge-buff-tie       A 恰好 1.5，开 buff 同归于尽
   * flip-loss           险胜局开 buff，翻车
   * edge-baseline-tie   A 恰好 1，本来就同归于尽，buff 落败
   * faster-loss         必败局，死得更快
   */
  function verdict(stats) {
    assertStats(stats);
    const base = fightTimes(stats);
    const baseOutcome = outcome(stats);
    const buffedStats = applyBuff(stats);
    const buffed = fightTimes(buffedStats);
    const buffedOutcome = outcome(buffedStats);
    const A = advantage(stats);
    const Abuff = advantageAfterBuff(A);

    let key, headline, detail;
    if (baseOutcome === 'win' && buffedOutcome === 'win') {
      key = 'safe-win';
      headline = '纯赚：胜负没变，只是打得更省时间';
      detail = '余量足够厚（A > 1.5），承伤 ×3 还没兑现，敌人先倒了。这类局里 buff 是收割加速器。';
    } else if (baseOutcome === 'win' && buffedOutcome === 'tie') {
      key = 'edge-buff-tie';
      headline = '刀尖：A 恰好 1.5，开 buff 变成同归于尽';
      detail = '优势比 ×2/3 之后正好等于 1——最刁钻的边界。看起来只是打平，实际上把稳赢的局亲手送掉了。';
    } else if (baseOutcome === 'win' && buffedOutcome === 'lose') {
      key = 'flip-loss';
      headline = '翻车：原本险胜，现在暴毙';
      detail = '优势被打了 6.7 折（×2/3），掉进 1 ~ 1.5 的毒性区间。这个 buff 在这里就是负面的。';
    } else if (baseOutcome === 'tie') {
      key = 'edge-baseline-tie';
      headline = '本来就同归于尽，buff 让你彻底落败';
      detail = 'A 恰好等于 1 时双方同时倒下；承伤 ×3 一加，你就先走了。';
    } else {
      key = 'faster-loss';
      headline = '死得更快：结局没变，省下了时间';
      detail = '反正打不过，buff 把败局压缩了——存活时间直接除以三。如果这局注定要输，早死早超生是唯一的好处。';
    }

    return {
      A: A,
      Abuff: Abuff,
      band: bandOf(A),
      baseline: { outcome: baseOutcome, killTime: base.killTime, deathTime: base.deathTime },
      buffed: { outcome: buffedOutcome, killTime: buffed.killTime, deathTime: buffed.deathTime },
      key: key,
      headline: headline,
      detail: detail
    };
  }

  return {
    DEALT_MULT: DEALT_MULT,
    TAKEN_MULT: TAKEN_MULT,
    assertStats: assertStats,
    advantage: advantage,
    fightTimes: fightTimes,
    outcome: outcome,
    applyBuff: applyBuff,
    advantageAfterBuff: advantageAfterBuff,
    bandOf: bandOf,
    verdict: verdict
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GlassCannonLogic;
}

if (typeof window !== 'undefined') {
  window.GlassCannonLogic = GlassCannonLogic;
}

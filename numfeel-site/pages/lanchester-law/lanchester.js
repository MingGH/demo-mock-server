/*
 * lanchester.js — 兰彻斯特方程核心逻辑
 *
 * 同时支持浏览器（挂到 window.Lanchester）和 Node（module.exports），
 * 便于用 node 直接跑单元测试。
 *
 * 两条定律：
 *   平方律（Square Law）：有集火/远程瞄准时，战力 ∝ 人数²。
 *       守恒量  sA·a² − sB·b²  在整场战斗中不变。
 *   线性律（Linear Law）：一对一肉搏，战力 ∝ 人数。
 *       守恒量  sA·a − sB·b  不变。
 *
 *   a, b  = 两队人数
 *   sA, sB = 单兵强度（dps × 有效性），默认 1
 */
(function (root) {
  'use strict';

  // ── 平方律预测：给定初始兵力，解出谁赢、赢家剩多少 ──────────
  function predictSquare(a, b, sA, sB) {
    sA = sA == null ? 1 : sA;
    sB = sB == null ? 1 : sB;
    var k = sA * a * a - sB * b * b;
    if (Math.abs(k) < 1e-9) {
      return { winner: 'draw', survivors: 0, k: 0 };
    }
    if (k > 0) {
      return { winner: 'A', survivors: Math.sqrt(k / sA), k: k };
    }
    return { winner: 'B', survivors: Math.sqrt(-k / sB), k: k };
  }

  // ── 线性律预测（一对一肉搏，也是大众的「线性直觉」）──────────
  function predictLinear(a, b, sA, sB) {
    sA = sA == null ? 1 : sA;
    sB = sB == null ? 1 : sB;
    var k = sA * a - sB * b;
    if (Math.abs(k) < 1e-9) {
      return { winner: 'draw', survivors: 0, k: 0 };
    }
    if (k > 0) {
      return { winner: 'A', survivors: k / sA, k: k };
    }
    return { winner: 'B', survivors: -k / sB, k: k };
  }

  // ── 创建一场战斗的初始状态 ────────────────────────────────
  // opts: { a, b, hp, dpsA, dpsB, dt, mode:'pure'|'random',
  //         crit, critChance, variance, seed }
  function createBattle(opts) {
    opts = opts || {};
    var a = opts.a != null ? opts.a : 5;
    var b = opts.b != null ? opts.b : 5;
    var hp = opts.hp != null ? opts.hp : 100;
    var dpsA = opts.dpsA != null ? opts.dpsA : 20;
    var dpsB = opts.dpsB != null ? opts.dpsB : 20;
    var dt = opts.dt != null ? opts.dt : 0.05;

    var units = [];
    var id = 0;
    var i;
    for (i = 0; i < a; i++) {
      units.push(makeUnit(id++, 'A', i, hp, dpsA));
    }
    for (i = 0; i < b; i++) {
      units.push(makeUnit(id++, 'B', i, hp, dpsB));
    }

    return {
      units: units,
      t: 0,
      dt: dt,
      mode: opts.mode === 'random' ? 'random' : 'pure',
      crit: opts.crit != null ? opts.crit : 2,
      critChance: opts.critChance != null ? opts.critChance : 0.15,
      variance: opts.variance != null ? opts.variance : 0.4,
      targetA: null, // A 队当前集火的目标 id
      targetB: null, // B 队当前集火的目标 id
      rng: makeRng(opts.seed != null ? opts.seed : 0x2545f491),
      history: [snapshotCounts(units, 0)]
    };
  }

  function makeUnit(id, team, slot, hp, dps) {
    return {
      id: id,
      team: team,
      slot: slot,
      hp: hp,
      maxHp: hp,
      dps: dps,
      alive: true
    };
  }

  // 确定性伪随机（mulberry32），保证 random 模式可复现
  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function aliveOf(units, team) {
    var r = [];
    for (var i = 0; i < units.length; i++) {
      if (units[i].team === team && units[i].alive) r.push(units[i]);
    }
    return r;
  }

  function byId(units, id) {
    for (var i = 0; i < units.length; i++) {
      if (units[i].id === id) return units[i];
    }
    return null;
  }

  // 选择集火目标：优先沿用旧目标（还活着），否则挑血量最低的敌人。
  // 血量相同则挑 slot 最小的，保证 pure 模式完全确定。
  function pickFocus(units, enemyTeam, currentId) {
    if (currentId != null) {
      var cur = byId(units, currentId);
      if (cur && cur.alive) return cur.id;
    }
    var enemies = aliveOf(units, enemyTeam);
    if (enemies.length === 0) return null;
    var best = enemies[0];
    for (var i = 1; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.hp < best.hp - 1e-9 || (Math.abs(e.hp - best.hp) < 1e-9 && e.slot < best.slot)) {
        best = e;
      }
    }
    return best.id;
  }

  // ── 推进一个 tick：双方同时开火，返回本 tick 的事件列表 ──────
  function stepBattle(state) {
    var events = [];
    var aliveA = aliveOf(state.units, 'A');
    var aliveB = aliveOf(state.units, 'B');
    if (aliveA.length === 0 || aliveB.length === 0) {
      return events;
    }

    state.targetA = pickFocus(state.units, 'B', state.targetA);
    state.targetB = pickFocus(state.units, 'A', state.targetB);
    var tgtA = byId(state.units, state.targetA); // A 打 tgtA(属于B)
    var tgtB = byId(state.units, state.targetB); // B 打 tgtB(属于A)

    // 先把双方这一 tick 的输出算出来（基于 tick 开始时的存活快照）
    var dmgToB = teamDamage(state, aliveA, events, 'A');
    var dmgToA = teamDamage(state, aliveB, events, 'B');

    // 同时结算：集中砸向各自目标，溢出伤害转移到下一个目标
    // A 队开火 → 砸向 B 队目标 tgtA；B 队开火 → 砸向 A 队目标 tgtB
    applyFocusedDamage(state, 'A', 'B', tgtA, dmgToB, events);
    applyFocusedDamage(state, 'B', 'A', tgtB, dmgToA, events);

    state.t += state.dt;
    state.history.push(snapshotCounts(state.units, state.t));
    return events;
  }

  // 计算一个队伍本 tick 的总伤害；random 模式叠加暴击与方差
  function teamDamage(state, aliveUnits, events, team) {
    var total = 0;
    for (var i = 0; i < aliveUnits.length; i++) {
      var u = aliveUnits[i];
      var d = u.dps * state.dt;
      if (state.mode === 'random') {
        // dps 方差：在 [1-variance, 1+variance] 间抖动
        var f = 1 + (state.rng() * 2 - 1) * state.variance;
        d *= f;
        // 暴击
        if (state.rng() < state.critChance) {
          d *= state.crit;
          events.push({ type: 'crit', from: u.id, team: team });
        }
      }
      total += d;
    }
    return total;
  }

  // 把集火伤害灌进目标，目标死了就顺延到同队下一个（血量最低）目标。
  // firingTeam = 开火方（决定更新哪个集火指针），damagedTeam = 挨打方。
  function applyFocusedDamage(state, firingTeam, damagedTeam, firstTarget, dmg, events) {
    var target = firstTarget;
    var guard = 0;
    while (dmg > 1e-9 && target && guard < 100) {
      guard++;
      var taken = Math.min(dmg, target.hp);
      target.hp -= taken;
      dmg -= taken;
      if (target.hp <= 1e-9) {
        target.hp = 0;
        target.alive = false;
        events.push({ type: 'death', unit: target.id, team: damagedTeam });
        // 目标死亡，重选开火方的集火目标
        var nextId = pickFocus(state.units, damagedTeam, null);
        if (firingTeam === 'A') state.targetA = nextId;
        else state.targetB = nextId;
        target = nextId != null ? byId(state.units, nextId) : null;
      } else {
        events.push({ type: 'hit', team: damagedTeam, unit: target.id });
      }
    }
  }

  function isOver(state) {
    return aliveOf(state.units, 'A').length === 0 || aliveOf(state.units, 'B').length === 0;
  }

  function snapshotCounts(units, t) {
    return {
      t: t,
      a: countAlive(units, 'A'),
      b: countAlive(units, 'B')
    };
  }

  function countAlive(units, team) {
    var n = 0;
    for (var i = 0; i < units.length; i++) {
      if (units[i].team === team && units[i].alive) n++;
    }
    return n;
  }

  // ── 跑完整场战斗，返回结果（不做动画，用于预测/蒙特卡洛）──────
  function runBattle(opts) {
    var state = createBattle(opts);
    var maxTicks = 200000;
    var ticks = 0;
    while (!isOver(state) && ticks < maxTicks) {
      stepBattle(state);
      ticks++;
    }
    var aliveA = countAlive(state.units, 'A');
    var aliveB = countAlive(state.units, 'B');
    return {
      winner: aliveA > 0 && aliveB === 0 ? 'A' : (aliveB > 0 && aliveA === 0 ? 'B' : 'draw'),
      survivorsA: aliveA,
      survivorsB: aliveB,
      time: state.t,
      history: state.history
    };
  }

  // ── 蒙特卡洛：random 模式跑 n 次，统计胜者剩余人数分布 ──────
  function monteCarlo(opts, n) {
    n = n || 200;
    var base = opts || {};
    var results = { aWins: 0, bWins: 0, draws: 0, survivorDist: {}, runs: n };
    for (var i = 0; i < n; i++) {
      var o = {};
      for (var k in base) if (base.hasOwnProperty(k)) o[k] = base[k];
      o.mode = 'random';
      o.seed = (base.seed || 1) + i * 2654435761;
      var r = runBattle(o);
      if (r.winner === 'A') results.aWins++;
      else if (r.winner === 'B') results.bWins++;
      else results.draws++;
      var s = r.winner === 'A' ? r.survivorsA : (r.winner === 'B' ? r.survivorsB : 0);
      results.survivorDist[s] = (results.survivorDist[s] || 0) + 1;
    }
    return results;
  }

  var api = {
    predictSquare: predictSquare,
    predictLinear: predictLinear,
    createBattle: createBattle,
    stepBattle: stepBattle,
    isOver: isOver,
    runBattle: runBattle,
    monteCarlo: monteCarlo,
    aliveOf: aliveOf,
    countAlive: countAlive,
    byId: byId
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Lanchester = api;
  }
})(typeof window !== 'undefined' ? window : this);

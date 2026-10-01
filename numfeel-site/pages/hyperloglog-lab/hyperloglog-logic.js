/* HyperLogLog 实验室 - 纯逻辑层
 * 无 DOM 依赖，Node 直跑可测，浏览器经 window.HLLLib 使用。
 * demo 用 32 位哈希（基数上限 42.9 亿，远超本页 1 亿目标），生产实现普遍用 64 位。
 */
(function (global) {
  'use strict';

  // ---------- 哈希：xmur3 ----------
  function hash32(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }

  function toInput(value) {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    throw new TypeError('HLL 只接受字符串或有限数字');
  }

  // ---------- rho：去掉低 p 位后，高位里第一个 1 前面有几个 0 ----------
  function clz32(x) {
    if (x === 0) return 32;
    let n = 0;
    if ((x & 0xffff0000) === 0) { n += 16; x = (x << 16) >>> 0; }
    if ((x & 0xff000000) === 0) { n += 8;  x = (x << 8) >>> 0; }
    if ((x & 0xf0000000) === 0) { n += 4;  x = (x << 4) >>> 0; }
    if ((x & 0xc0000000) === 0) { n += 2;  x = (x << 2) >>> 0; }
    if ((x & 0x80000000) === 0) { n += 1; }
    return n;
  }

  function rhoOf(hash, p) {
    const mask = (~0 << p) >>> 0; // 清掉低 p 位（桶号），高位保持原位
    const rest = (hash & mask) >>> 0;
    if (rest === 0) return 32 - p + 1; // 剩余位全 0，记该桶理论最大值
    return clz32(rest) + 1;
  }

  // ---------- HLL ----------
  const HLL_P = 14;

  function createHll(p) {
    if (p === undefined) p = HLL_P;
    if (!Number.isInteger(p) || p < 4 || p > 16) throw new RangeError('p 必须是 4..16 的整数');
    const m = 1 << p;
    return { p: p, m: m, registers: new Uint8Array(m), adds: 0 };
  }

  function hllAdd(hll, value) {
    const input = toInput(value);
    const hash = hash32(input);
    const bucket = hash & (hll.m - 1);
    const rho = rhoOf(hash, hll.p);
    if (rho > hll.registers[bucket]) {
      hll.registers[bucket] = rho;
    }
    hll.adds += 1;
    return rho;
  }

  function alphaM(m) {
    return 0.7213 / (1 + 1.079 / m);
  }

  function hllZeroCount(hll) {
    let v = 0;
    for (let i = 0; i < hll.m; i++) {
      if (hll.registers[i] === 0) v++;
    }
    return v;
  }

  function hllNonZeroCount(hll) {
    return hll.m - hllZeroCount(hll);
  }

  // 估计基数：小基数走线性计数，否则走调和平均（标准 HLL 两段式）
  function hllEstimate(hll) {
    const v = hllZeroCount(hll);
    if (v > 0) {
      const lc = hll.m * Math.log(hll.m / v);
      if (lc <= 2.5 * hll.m) return lc;
    }
    let sum = 0;
    for (let i = 0; i < hll.m; i++) {
      sum += Math.pow(2, -hll.registers[i]);
    }
    return (alphaM(hll.m) * hll.m * hll.m) / sum;
  }

  function hllMerge(a, b) {
    if (a.m !== b.m) throw new Error('寄存器数不同，无法合并');
    const out = createHll(a.p);
    for (let i = 0; i < a.m; i++) {
      out.registers[i] = Math.max(a.registers[i], b.registers[i]);
    }
    return out;
  }

  // 16384 个寄存器 × 6 bit（Redis 稠密编码同款）
  function hllMemoryBytes(hll) {
    return (hll.m * 6) / 8;
  }

  // ---------- 内存模型（量级演示用，UI 明示假设） ----------
  const BUDGET_BYTES = 64 * 1000 * 1000;           // 统计模块的内存预算：64MB（十进制）
  const HASHSET_BYTES_PER_ID = 72;               // Java HashMap 平均每条目约 72B（16 字符 ID）

  function budgetBytes() {
    return BUDGET_BYTES;
  }

  function hashSetBytes(n) {
    if (!Number.isFinite(n) || n < 0) throw new RangeError('n 必须是非负数');
    return n * HASHSET_BYTES_PER_ID;
  }

  // 位图：前提是 ID 为连续整数。字符串 ID 需要额外发号映射表（隐藏账单）
  function bitmapBytes(maxId) {
    if (!Number.isFinite(maxId) || maxId < 0) throw new RangeError('maxId 必须是非负数');
    return Math.ceil((maxId + 1) / 8);
  }

  // HashSet 还能装多少人（超出预算时的 OOM 点）
  function hashSetCapacity() {
    return Math.floor(BUDGET_BYTES / HASHSET_BYTES_PER_ID);
  }

  // ---------- 抛硬币直觉实验室 ----------
  // 统计 flips 次抛掷里"连续正面"最长纪录；2^最长连击 反推抛掷次数
  function coinFlipStats(flips, rng) {
    if (!Number.isInteger(flips) || flips < 0) throw new RangeError('flips 必须是非负整数');
    const random = rng || Math.random;
    let run = 0;
    let best = 0;
    for (let i = 0; i < flips; i++) {
      if (random() < 0.5) {
        run++;
        if (run > best) best = run;
      } else {
        run = 0;
      }
    }
    return { flips: flips, longestRun: best, estimate: Math.pow(2, best) };
  }

  const api = {
    hash32: hash32,
    clz32: clz32,
    rhoOf: rhoOf,
    HLL_P: HLL_P,
    createHll: createHll,
    hllAdd: hllAdd,
    hllEstimate: hllEstimate,
    hllZeroCount: hllZeroCount,
    hllNonZeroCount: hllNonZeroCount,
    hllMerge: hllMerge,
    hllMemoryBytes: hllMemoryBytes,
    budgetBytes: budgetBytes,
    hashSetBytes: hashSetBytes,
    hashSetCapacity: hashSetCapacity,
    bitmapBytes: bitmapBytes,
    HASHSET_BYTES_PER_ID: HASHSET_BYTES_PER_ID,
    coinFlipStats: coinFlipStats
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.HLLLib = api;
})(typeof window !== 'undefined' ? window : globalThis);

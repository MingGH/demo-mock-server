/**
 * dna-core.js - DNA 存储核心算法
 *
 * 纯算法模块，不依赖 DOM，可被 node 直接 require 测试。
 * 实现 DNA Fountain（喷泉码）编码/解码流水线：
 *   分段 -> Robust Soliton 度分布 -> LT 液滴（XOR）-> 碱基映射 -> 生物学体检
 *   -> 信道模拟（丢包/突变）-> 剥离译码（peeling decoder）
 *
 * 论文背景：DNA Fountain enables a robust and efficient storage architecture
 *   Erlich & Zielinski, Science 2017-03-03, 355(6328):950-954
 */

// ────────────────────────────────────────────────────────────
// 0. 常量与工具
// ────────────────────────────────────────────────────────────

/** 默认 Robust Soliton 参数 c */
var DEFAULT_C = 0.1;
/** 默认 Robust Soliton 参数 delta */
var DEFAULT_DELTA = 0.5;

/** DNA 存储密度：215 PB / 克（论文实测值），换算为 字节/克 */
var DENSITY_BYTES_PER_GRAM = 215e6 * 1e9; // 215 百万 GB/g = 2.15e17 B/g

/** 碱基映射表：每 2 bit -> 1 碱基 */
var BASE_MAP = ['A', 'C', 'G', 'T'];
/** 碱基反查表 */
var BASE_REV = { 'A': 0, 'C': 1, 'G': 2, 'T': 3 };

/**
 * 比较两个 Uint8Array / 数组是否逐字节相等
 * @param {Uint8Array|number[]} a
 * @param {Uint8Array|number[]} b
 * @returns {boolean}
 */
function arraysEqual(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * 位置相关 XOR 掩码（白化），打散种子高位的连续 0 字节带来的长同碱基重复
 * 每个掩码字节转碱基后最长重复 <= 2，避免自身引入超长 run
 */
var WHITEN_MASK = [0x1B, 0xE1, 0x4B, 0xD2, 0x87, 0x9C, 0x63, 0xB4];

/**
 * 对字节数组做位置相关 XOR 白化（可逆）
 * @param {Uint8Array|number[]} bytes
 * @returns {Uint8Array} 白化后的字节
 */
function whiten(bytes) {
  var out = new Uint8Array(bytes.length);
  for (var i = 0; i < bytes.length; i++) {
    out[i] = bytes[i] ^ WHITEN_MASK[i % WHITEN_MASK.length];
  }
  return out;
}

/**
 * 白化的逆运算（XOR 自反）
 * @param {Uint8Array|number[]} bytes
 * @returns {Uint8Array} 还原后的字节
 */
function unwhiten(bytes) {
  return whiten(bytes);
}

/**
 * 把文本字符串转换为字节数组（UTF-8）
 * @param {string} text
 * @returns {Uint8Array}
 */
function textToBytes(text) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text);
  }
  // Node 兜底
  var buf = Buffer.from(text, 'utf-8');
  var arr = new Uint8Array(buf.length);
  for (var i = 0; i < buf.length; i++) arr[i] = buf[i];
  return arr;
}

/**
 * 把字节数组还原为文本字符串（UTF-8）
 * @param {Uint8Array|number[]} bytes
 * @returns {string}
 */
function bytesToText(bytes) {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  }
  return Buffer.from(bytes).toString('utf-8');
}

// ────────────────────────────────────────────────────────────
// 1. 确定性 PRNG（mulberry32）
// ────────────────────────────────────────────────────────────

/**
 * 创建确定性伪随机数生成器（mulberry32）
 * 同一个 seed 永远产生同一个序列，保证液滴可复现。
 * @param {number} seed 种子（32 位无符号整数）
 * @returns {function():number} 返回 [0,1) 浮点数的函数
 */
function createRng(seed) {
  var s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ────────────────────────────────────────────────────────────
// 2. 分段
// ────────────────────────────────────────────────────────────

/**
 * 把字节序列切成长度为 segLen 的段，末段用 0 补齐
 * @param {Uint8Array|number[]} bytes 原始字节
 * @param {number} segLen 每段字节数
 * @returns {Uint8Array[]} 段数组，每段长度恰好 segLen
 */
function splitIntoSegments(bytes, segLen) {
  if (segLen < 1) throw new Error('segLen 必须 >= 1');
  var segments = [];
  for (var i = 0; i < bytes.length; i += segLen) {
    var seg = new Uint8Array(segLen);
    for (var j = 0; j < segLen; j++) {
      if (i + j < bytes.length) seg[j] = bytes[i + j];
    }
    segments.push(seg);
  }
  // 空输入至少产生 1 段
  if (segments.length === 0) segments.push(new Uint8Array(segLen));
  return segments;
}

// ────────────────────────────────────────────────────────────
// 3. Robust Soliton 度分布
// ────────────────────────────────────────────────────────────

/**
 * 构建 Robust Soliton 累积分布函数（CDF）
 *
 * 理想 Soliton：rho(1)=1/K，rho(d)=1/(d*(d-1)) (d>=2)
 * 鲁棒项：R = c*ln(K/delta)*sqrt(K)
 *   tau(d) = R/(d*K)        (d < K/R)
 *   tau(K/R) = R*ln(R/delta)/K
 * 归一化后 mu(d) = (rho(d)+tau(d))/Z，再累加成 CDF。
 *
 * @param {number} K 段总数
 * @param {number} [c] 鲁棒参数，默认 0.1
 * @param {number} [delta] 失败概率上界，默认 0.5
 * @returns {number[]} 长度 K+1 的累积分布数组，下标 1..K，cdf[K]=1
 */
function buildSolitonDistribution(K, c, delta) {
  c = (typeof c === 'number') ? c : DEFAULT_C;
  delta = (typeof delta === 'number') ? delta : DEFAULT_DELTA;
  if (K <= 1) {
    return [0, 1]; // 单段时度恒为 1
  }

  // 理想 Soliton
  var rho = new Array(K + 1);
  rho[0] = 0;
  rho[1] = 1 / K;
  for (var d = 2; d <= K; d++) {
    rho[d] = 1 / (d * (d - 1));
  }

  // 鲁棒项
  var R = c * Math.log(K / delta) * Math.sqrt(K);
  var tau = new Array(K + 1);
  for (var t = 0; t <= K; t++) tau[t] = 0;
  var cutoff = Math.floor(K / R); // K/R
  if (cutoff < 1) cutoff = 1;
  for (var i = 1; i < cutoff && i <= K; i++) {
    tau[i] = R / (i * K);
  }
  if (cutoff >= 1 && cutoff <= K) {
    tau[cutoff] = R * Math.log(R / delta) / K;
  }

  // 归一化 + CDF
  var cdf = new Array(K + 1);
  cdf[0] = 0;
  var Z = 0;
  for (var j = 1; j <= K; j++) Z += (rho[j] + tau[j]);
  var cum = 0;
  for (var k = 1; k <= K; k++) {
    cum += (rho[k] + tau[k]) / Z;
    cdf[k] = cum;
  }
  cdf[K] = 1; // 抵消浮点误差
  return cdf;
}

/**
 * 从累积分布中采样一个度 d（1..K）
 * @param {function():number} rng 随机数生成器
 * @param {number[]} cdf 累积分布数组
 * @returns {number} 采样的度
 */
function sampleDegree(rng, cdf) {
  var r = rng();
  for (var d = 1; d < cdf.length; d++) {
    if (r < cdf[d]) return d;
  }
  return cdf.length - 1;
}

// ────────────────────────────────────────────────────────────
// 4. 液滴生成（LT 码）
// ────────────────────────────────────────────────────────────

/**
 * 仅凭 seed 和 K 重放出液滴选取的段下标
 * 关键：与 makeDroplet 使用完全相同的 rng 调用序列，保证一致。
 * @param {number} seed 液滴种子
 * @param {number} K 段总数
 * @returns {number[]} 升序排列的段下标数组
 */
function recoverIndices(seed, K) {
  var rng = createRng(seed);
  var cdf = buildSolitonDistribution(K);
  var d = sampleDegree(rng, cdf);
  if (d > K) d = K;
  if (d < 1) d = 1;

  // Fisher-Yates 部分洗牌，从前 d 次交换中取下标
  var pool = new Array(K);
  for (var i = 0; i < K; i++) pool[i] = i;
  var indices = [];
  for (var j = 0; j < d; j++) {
    var range = K - j;
    var rIdx = j + Math.floor(rng() * range);
    var tmp = pool[j];
    pool[j] = pool[rIdx];
    pool[rIdx] = tmp;
    indices.push(pool[j]);
  }
  indices.sort(function (a, b) { return a - b; });
  return indices;
}

/**
 * 生成一个 LT 液滴
 * 用 seed 建 rng -> 抽度 d -> 从 K 段中不重复抽 d 个下标 -> 数据 = 这些段逐字节 XOR
 * @param {Uint8Array[]} segments 段数组
 * @param {number} seed 液滴种子
 * @returns {{seed:number, indices:number[], data:Uint8Array}}
 */
function makeDroplet(segments, seed) {
  var K = segments.length;
  var indices = recoverIndices(seed, K);
  var segLen = segments[0].length;
  var data = new Uint8Array(segLen);
  for (var i = 0; i < indices.length; i++) {
    var seg = segments[indices[i]];
    for (var b = 0; b < segLen; b++) {
      data[b] ^= seg[b];
    }
  }
  return { seed: seed, indices: indices, data: data };
}

// ────────────────────────────────────────────────────────────
// 5. 碱基映射（2 bit -> 1 碱基）
// ────────────────────────────────────────────────────────────

/**
 * 字节序列转碱基字符串：每 2 bit -> 1 碱基（00->A, 01->C, 10->G, 11->T）
 * @param {Uint8Array|number[]} bytes
 * @returns {string} 碱基字符串，长度 = bytes.length * 4
 */
function bytesToBases(bytes) {
  var result = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i];
    result += BASE_MAP[(b >> 6) & 3];
    result += BASE_MAP[(b >> 4) & 3];
    result += BASE_MAP[(b >> 2) & 3];
    result += BASE_MAP[b & 3];
  }
  return result;
}

/**
 * 碱基字符串转字节序列（bytesToBases 的逆运算，往返无损）
 * @param {string} baseStr 碱基字符串，长度须为 4 的倍数
 * @returns {Uint8Array} 字节数组
 */
function basesToBytes(baseStr) {
  var nBytes = Math.floor(baseStr.length / 4);
  var bytes = new Uint8Array(nBytes);
  for (var i = 0; i < nBytes; i++) {
    var v = 0;
    v = (v << 2) | BASE_REV[baseStr[i * 4]];
    v = (v << 2) | BASE_REV[baseStr[i * 4 + 1]];
    v = (v << 2) | BASE_REV[baseStr[i * 4 + 2]];
    v = (v << 2) | BASE_REV[baseStr[i * 4 + 3]];
    bytes[i] = v;
  }
  return bytes;
}

// ────────────────────────────────────────────────────────────
// 6. 生物学体检
// ────────────────────────────────────────────────────────────

/**
 * 计算 GC 含量比例（0~1）
 * @param {string} baseStr 碱基字符串
 * @returns {number} GC 比例
 */
function gcContent(baseStr) {
  if (baseStr.length === 0) return 0;
  var gc = 0;
  for (var i = 0; i < baseStr.length; i++) {
    if (baseStr[i] === 'G' || baseStr[i] === 'C') gc++;
  }
  return gc / baseStr.length;
}

/**
 * 计算最长同碱基重复（homopolymer run）长度
 * @param {string} baseStr 碱基字符串
 * @returns {number} 最长连续相同碱基数
 */
function maxHomopolymerRun(baseStr) {
  if (baseStr.length === 0) return 0;
  var max = 1, cur = 1;
  for (var i = 1; i < baseStr.length; i++) {
    if (baseStr[i] === baseStr[i - 1]) {
      cur++;
      if (cur > max) max = cur;
    } else {
      cur = 1;
    }
  }
  return max;
}

/**
 * 对一条 oligo 做生物学体检
 * @param {string} baseStr 碱基字符串
 * @param {object} [opts] 约束选项
 * @param {number} [opts.gcMin=0.45] GC 含量下限
 * @param {number} [opts.gcMax=0.55] GC 含量上限
 * @param {number} [opts.maxRun=3] 同碱基重复上限
 * @returns {{pass:boolean, gc:number, run:number, reason:string}}
 */
function screenOligo(baseStr, opts) {
  opts = opts || {};
  var gcMin = (opts.gcMin !== undefined) ? opts.gcMin : 0.45;
  var gcMax = (opts.gcMax !== undefined) ? opts.gcMax : 0.55;
  var maxRun = (opts.maxRun !== undefined) ? opts.maxRun : 3;

  var gc = gcContent(baseStr);
  var run = maxHomopolymerRun(baseStr);
  var pass = (gc >= gcMin && gc <= gcMax && run <= maxRun);
  var reason = '';
  if (!pass) {
    if (gc < gcMin) reason = 'GC 含量过低';
    else if (gc > gcMax) reason = 'GC 含量过高';
    else if (run > maxRun) reason = '同碱基重复超限';
  }
  return { pass: pass, gc: gc, run: run, reason: reason };
}

// ────────────────────────────────────────────────────────────
// 7. 完整编码
// ────────────────────────────────────────────────────────────

/**
 * 把 4 字节 seed 写入字节数组（大端）
 * @param {number} seed
 * @returns {number[]} 4 字节
 */
function seedToBytes(seed) {
  return [
    (seed >>> 24) & 0xFF,
    (seed >>> 16) & 0xFF,
    (seed >>> 8) & 0xFF,
    seed & 0xFF
  ];
}

/**
 * 从 4 字节还原 seed（大端）
 * @param {number} b0
 * @param {number} b1
 * @param {number} b2
 * @param {number} b3
 * @returns {number}
 */
function bytesToSeed(b0, b1, b2, b3) {
  return ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
}

/**
 * 完整编码：循环递增 seed 生成液滴 -> 转碱基 -> 体检 -> 通过则收下
 *
 * 每条 oligo 字节结构：seed(4 字节) + payload(segLen 字节) + checksum(1 字节)
 * 整体转碱基。返回所有通过的 oligo。
 *
 * @param {Uint8Array|number[]} bytes 原始数据
 * @param {object} [opts]
 * @param {number} [opts.segLen=4] 段长
 * @param {number} [opts.redundancy=1] 冗余率，目标条数 = K*(1+redundancy)
 * @param {number} [opts.startSeed=1] 起始种子，传不同值让每次编码产生不同液滴序列
 * @param {object} [opts.screen] 体检选项（传给 screenOligo）
 * @returns {{oligos:Array, K:number, segLen:number, stats:object}}
 */
function encode(bytes, opts) {
  opts = opts || {};
  var segLen = opts.segLen || 4;
  var redundancy = (opts.redundancy !== undefined) ? opts.redundancy : 1;
  var screenOpts = opts.screen || {};

  var segments = splitIntoSegments(bytes, segLen);
  var K = segments.length;
  var target = Math.max(K + 1, Math.ceil(K * (1 + redundancy)));

  var oligos = [];
  var rejectedSamples = []; // 被拒绝的样本（供展示）
  var seed = opts.startSeed || 1;
  var attempts = 0;
  var maxAttempts = target * 60 + 200; // 安全上限，避免死循环

  while (oligos.length < target && attempts < maxAttempts) {
    attempts++;
    var droplet = makeDroplet(segments, seed);

    // 组装 oligo 字节：seed + payload + checksum
    var oligoBytes = new Uint8Array(4 + segLen + 1);
    var sb = seedToBytes(seed);
    oligoBytes[0] = sb[0];
    oligoBytes[1] = sb[1];
    oligoBytes[2] = sb[2];
    oligoBytes[3] = sb[3];
    for (var b = 0; b < segLen; b++) oligoBytes[4 + b] = droplet.data[b];

    var checksum = 0;
    for (var c = 0; c < 4 + segLen; c++) checksum ^= oligoBytes[c];
    oligoBytes[4 + segLen] = checksum;

    // 白化后转碱基：打散种子高位 0 字节导致的长重复，平衡 GC
    var whitened = whiten(oligoBytes);
    var baseStr = bytesToBases(whitened);
    var screen = screenOligo(baseStr, screenOpts);

    if (screen.pass) {
      oligos.push({
        seed: seed,
        baseStr: baseStr,
        indices: droplet.indices,
        degree: droplet.indices.length
      });
    } else if (rejectedSamples.length < 6) {
      rejectedSamples.push({
        seed: seed,
        gc: screen.gc,
        run: screen.run,
        reason: screen.reason
      });
    }
    seed++;
  }

  return {
    oligos: oligos,
    K: K,
    segLen: segLen,
    stats: {
      attempts: attempts,
      target: target,
      accepted: oligos.length,
      rejected: attempts - oligos.length,
      rejectedSamples: rejectedSamples
    }
  };
}

// ────────────────────────────────────────────────────────────
// 8. 信道模拟
// ────────────────────────────────────────────────────────────

/**
 * 模拟 DNA 测序信道：oligo 丢失（dropout）与碱基突变（mutation）
 * @param {Array} oligos encode 返回的 oligo 数组
 * @param {object} opts
 * @param {number} [opts.dropoutRate=0] 丢失概率 0~1
 * @param {number} [opts.mutationRate=0] 每个碱基突变概率 0~1
 * @param {function():number} [opts.rng] 随机数生成器
 * @returns {string[]} 接收到的碱基字符串数组
 */
function simulateChannel(oligos, opts) {
  opts = opts || {};
  var dropoutRate = opts.dropoutRate || 0;
  var mutationRate = opts.mutationRate || 0;
  var rng = opts.rng || createRng(99991);

  var received = [];
  for (var i = 0; i < oligos.length; i++) {
    if (rng() < dropoutRate) continue; // 整条丢失
    var baseStr = oligos[i].baseStr;
    if (mutationRate <= 0) {
      received.push(baseStr);
      continue;
    }
    var chars = baseStr.split('');
    for (var j = 0; j < chars.length; j++) {
      if (rng() < mutationRate) {
        var cur = BASE_REV[chars[j]];
        var nb;
        do { nb = Math.floor(rng() * 4); } while (nb === cur);
        chars[j] = BASE_MAP[nb];
      }
    }
    received.push(chars.join(''));
  }
  return received;
}

// ────────────────────────────────────────────────────────────
// 9. 解码（剥离译码 peeling decoder）
// ────────────────────────────────────────────────────────────

/**
 * 从接收到的碱基字符串数组解码出原始数据
 *
 * 流程：每条 oligo 转字节 -> 校验 checksum -> 提取 seed/payload ->
 *   recoverIndices 得到连接的段 -> 剥离译码：反复用度 1 液滴解出段，
 *   再把已解段从其他液滴中 XOR 消去，直至全部解出或卡住。
 *
 * @param {string[]} receivedBaseStrs 接收到的碱基字符串
 * @param {number} K 段总数
 * @param {number} segLen 段长
 * @returns {{success:boolean, data:Uint8Array|null, steps:Array, K:number, resolvedMap:object}}
 *   steps 为逐轮过程，供动画使用：{round, resolved:number[], totalResolved, remaining}
 *   resolvedMap 为 {segIdx:Uint8Array}，含所有已解出段（即使最终失败也有部分数据），供逐段渲染
 */
function decode(receivedBaseStrs, K, segLen) {
  var steps = [];
  var droplets = [];

  // 1. 解析每条 oligo
  for (var i = 0; i < receivedBaseStrs.length; i++) {
    var bs = receivedBaseStrs[i];
    if (bs.length < (4 + segLen + 1) * 4) continue;
    var rawBytes = basesToBytes(bs);
    // 去白化，还原 seed + payload + checksum
    var oligoBytes = unwhiten(rawBytes);

    // checksum 校验，未通过则丢弃（模拟突变破坏）
    var checksum = 0;
    for (var c = 0; c < 4 + segLen; c++) checksum ^= oligoBytes[c];
    if (checksum !== oligoBytes[4 + segLen]) continue;

    var seed = bytesToSeed(oligoBytes[0], oligoBytes[1], oligoBytes[2], oligoBytes[3]);
    var payload = oligoBytes.slice(4, 4 + segLen);
    var indices = recoverIndices(seed, K);
    if (indices.length === 0) continue;

    // 拷贝 payload 避免后续 XOR 污染
    var dataCopy = new Uint8Array(segLen);
    for (var p = 0; p < segLen; p++) dataCopy[p] = payload[p];
    droplets.push({ indices: indices.slice(), data: dataCopy });
  }

  // 2. 剥离译码
  var resolved = {}; // segIdx -> Uint8Array
  var unresolvedCount = K;
  var round = 0;

  while (unresolvedCount > 0) {
    round++;
    // 找度 1 液滴并解出段
    var newlyResolved = [];
    for (var d = 0; d < droplets.length; d++) {
      var drop = droplets[d];
      if (drop.indices.length === 1) {
        var segIdx = drop.indices[0];
        if (!resolved.hasOwnProperty(segIdx)) {
          // 拷贝数据，避免后续传播 XOR 污染已解出的值
          var segData = new Uint8Array(segLen);
          for (var bb = 0; bb < segLen; bb++) segData[bb] = drop.data[bb];
          resolved[segIdx] = segData;
          newlyResolved.push(segIdx);
        }
      }
    }

    if (newlyResolved.length === 0) break; // 卡住，无法继续

    // 把已解段从所有液滴中消去
    for (var e = 0; e < droplets.length; e++) {
      var dr = droplets[e];
      var newIndices = [];
      for (var y = 0; y < dr.indices.length; y++) {
        var idx = dr.indices[y];
        if (resolved.hasOwnProperty(idx)) {
          var rs = resolved[idx];
          for (var b = 0; b < segLen; b++) dr.data[b] ^= rs[b];
        } else {
          newIndices.push(idx);
        }
      }
      dr.indices = newIndices;
    }

    unresolvedCount -= newlyResolved.length;
    steps.push({
      round: round,
      resolved: newlyResolved.slice(),
      totalResolved: K - unresolvedCount,
      remaining: unresolvedCount
    });
  }

  // 3. 拼装结果
  var success = unresolvedCount === 0;
  var data = null;
  if (success) {
    data = new Uint8Array(K * segLen);
    for (var s = 0; s < K; s++) {
      for (var b2 = 0; b2 < segLen; b2++) {
        data[s * segLen + b2] = resolved[s][b2];
      }
    }
  }

  // 暴露已解出段的数据（供动画逐段渲染，即使最终失败也有部分数据）
  var resolvedMap = {};
  var rKeys = Object.keys(resolved);
  for (var ri = 0; ri < rKeys.length; ri++) {
    resolvedMap[rKeys[ri]] = resolved[rKeys[ri]];
  }

  return { success: success, data: data, steps: steps, K: K, resolvedMap: resolvedMap };
}

// ────────────────────────────────────────────────────────────
// 10. 蒙特卡洛冗余扫描
// ────────────────────────────────────────────────────────────

/**
 * 蒙特卡洛扫描：在不同冗余率下统计解码成功率
 * @param {Uint8Array|number[]} bytes 原始数据
 * @param {object} [opts]
 * @param {number[]} [opts.rates] 冗余率采样点
 * @param {number} [opts.trials=30] 每个冗余率的试验次数
 * @param {number} [opts.dropoutRate=0.1] 信道丢失率
 * @param {number} [opts.segLen=4] 段长
 * @returns {Array<{redundancy:number, successRate:number}>}
 */
function sweepRedundancy(bytes, opts) {
  opts = opts || {};
  var rates = opts.rates || [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0];
  var trials = opts.trials || 30;
  var dropoutRate = opts.dropoutRate !== undefined ? opts.dropoutRate : 0.1;
  var segLen = opts.segLen || 4;

  // 预先分段，得到带补齐的参考数据用于校验
  var segments = splitIntoSegments(bytes, segLen);
  var K = segments.length;
  var reference = new Uint8Array(K * segLen);
  for (var s = 0; s < K; s++) {
    for (var b = 0; b < segLen; b++) reference[s * segLen + b] = segments[s][b];
  }

  var results = [];
  for (var r = 0; r < rates.length; r++) {
    var success = 0;
    for (var t = 0; t < trials; t++) {
      var enc = encode(bytes, { segLen: segLen, redundancy: rates[r] });
      var rng = createRng(t * 7919 + r * 31 + 1);
      var received = simulateChannel(enc.oligos, { dropoutRate: dropoutRate, rng: rng });
      var dec = decode(received, enc.K, segLen);
      if (dec.success && arraysEqual(dec.data, reference)) success++;
    }
    results.push({ redundancy: rates[r], successRate: success / trials });
  }
  return results;
}

// ────────────────────────────────────────────────────────────
// 11. 密度计算
// ────────────────────────────────────────────────────────────

/**
 * 计算存储指定字节数所需的 DNA 质量（克）
 * 基于 215 PB/g 的实测密度
 * @param {number} bytes 字节数
 * @returns {number} 质量（克）
 */
function dnaMass(bytes) {
  return bytes / DENSITY_BYTES_PER_GRAM;
}

/**
 * 描述存储规模：把字节数换算成 DNA 质量与直观对比物
 * @param {number} bytes 字节数
 * @returns {{bytes:number, massGram:number, oligosEst:number, comparisons:Array}}
 */
function describeScale(bytes) {
  var mass = dnaMass(bytes);
  var comparisons = [];

  // 若按 oligo 平均 200 字节估算条数
  var oligosEst = Math.ceil(bytes / 200);

  comparisons.push({
    object: '一粒沙子',
    mass: 0.0001,
    note: '约 0.1 毫克'
  });
  comparisons.push({
    object: '一粒食盐',
    mass: 0.000058,
    note: '约 58 微克'
  });
  comparisons.push({
    object: '一根头发',
    mass: 0.0001,
    note: '约 0.1 毫克'
  });
  comparisons.push({
    object: '一粒大米',
    mass: 0.025,
    note: '约 25 毫克'
  });

  return {
    bytes: bytes,
    massGram: mass,
    oligosEst: oligosEst,
    comparisons: comparisons
  };
}

// ────────────────────────────────────────────────────────────
// 导出
// ────────────────────────────────────────────────────────────

var api = {
  // 常量
  DEFAULT_C: DEFAULT_C,
  DEFAULT_DELTA: DEFAULT_DELTA,
  DENSITY_BYTES_PER_GRAM: DENSITY_BYTES_PER_GRAM,
  BASE_MAP: BASE_MAP,
  BASE_REV: BASE_REV,
  // 工具
  arraysEqual: arraysEqual,
  whiten: whiten,
  unwhiten: unwhiten,
  textToBytes: textToBytes,
  bytesToText: bytesToText,
  // PRNG
  createRng: createRng,
  // 分段
  splitIntoSegments: splitIntoSegments,
  // 度分布
  buildSolitonDistribution: buildSolitonDistribution,
  sampleDegree: sampleDegree,
  // 液滴
  makeDroplet: makeDroplet,
  recoverIndices: recoverIndices,
  // 碱基映射
  bytesToBases: bytesToBases,
  basesToBytes: basesToBytes,
  // 生物学体检
  gcContent: gcContent,
  maxHomopolymerRun: maxHomopolymerRun,
  screenOligo: screenOligo,
  // 编解码
  encode: encode,
  simulateChannel: simulateChannel,
  decode: decode,
  // 蒙特卡洛
  sweepRedundancy: sweepRedundancy,
  // 密度
  dnaMass: dnaMass,
  describeScale: describeScale,
  // 内部工具（供测试）
  seedToBytes: seedToBytes,
  bytesToSeed: bytesToSeed
};

// Node.js 环境导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
// 浏览器环境挂到 window
if (typeof window !== 'undefined') {
  window.DNACore = api;
}

// ========== gps-time 核心算法（可独立测试，纯函数、不碰 DOM） ==========

/**
 * 光速，m/s。
 */
const SPEED_OF_LIGHT = 299792458;

/**
 * 高斯消元解线性方程组 A x = b（用于定位解算的最小二乘法法方程）。
 * @param {number[][]} a 系数矩阵
 * @param {number[]} b 右端向量
 * @returns {number[]|null} 解向量；奇异矩阵返回 null
 */
function solveLinearSystem(a, b) {
  const n = a.length;
  if (n === 0 || b.length !== n) return null;
  const m = a.map((row, i) => row.slice().concat(b[i]));
  for (let col = 0; col < n; col++) {
    // 选主元
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const pv = m[col][col];
    for (let c = col; c <= n; c++) m[col][c] /= pv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col];
      if (Math.abs(f) < 1e-15) continue;
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map(row => row[n]);
}

/**
 * 由真实接收机位置与钟差正算某颗卫星的伪距（供构造测试与演示）。
 * 伪距 = 几何距离 + 光速 × 钟差（钟差为秒，接收机慢为负）。
 * @param {number} dist 接收机到卫星的几何距离（米）
 * @param {number} clockBiasSeconds 接收机钟差（秒；相对系统时）
 * @returns {number} 伪距（米）
 */
function pseudorange(dist, clockBiasSeconds) {
  return dist + SPEED_OF_LIGHT * clockBiasSeconds;
}

/**
 * 计算接收机到卫星的平面距离（2D 定位用）。
 * @param {{x:number,y:number}} p 接收机坐标
 * @param {{x:number,y:number}} s 卫星坐标
 * @returns {number} 距离（米）
 */
function dist2d(p, s) {
  return Math.hypot(p.x - s.x, p.y - s.y);
}

/**
 * 高斯-牛顿迭代解平面定位（真实算法，2D，几何稳健）。
 *
 * 未知数：x, y 位置 + b 钟差（× 光速后的等效距离）。观测方程：
 *   ρᵢ = ‖P − Sᵢ‖ + b
 * 其中 b 已是「钟差(秒) × 光速」的单位（米）。返回的 clockBiasSeconds = b / c。
 * 3 个未知数需要至少 3 颗卫星；把 b 当已知（assumeClockKnown）则 2 颗即可。
 *
 * @param {{x:number, y:number}[]} satellites 卫星坐标（米，平面）
 * @param {number[]} pseudoranges 对应各卫星的伪距（米）
 * @param {object} [opts]
 * @param {boolean} [opts.assumeClockKnown=false] 设为 true 时固定 b=0（假设时钟完美）
 * @param {number} [opts.maxIterations=20] 最大迭代次数
 * @returns {{x:number, y:number, clockBiasSeconds:number, iterations:number, residual:number}}
 */
function solvePosition(satellites, pseudoranges, opts) {
  const o = opts || {};
  const assumeClockKnown = !!o.assumeClockKnown;
  const maxIter = o.maxIterations || 20;
  const n = satellites.length;

  if (n < (assumeClockKnown ? 2 : 3)) return null;

  // 初始值用卫星坐标重心（几何上稳定）。
  let px = 0, py = 0;
  for (const s of satellites) { px += s.x; py += s.y; }
  px /= n; py /= n;
  let b = 0; // 等效距离（米）

  let iterations = 0;
  for (; iterations < maxIter; iterations++) {
    const A = [];
    const rhs = [];
    let residualSum = 0;
    for (let i = 0; i < n; i++) {
      const s = satellites[i];
      const expected = dist2d({ x: px, y: py }, s) + b;
      const residual = pseudoranges[i] - expected;
      residualSum += residual * residual;
      const d = Math.hypot(px - s.x, py - s.y);
      if (d < 1e-9) { A.push([0, 0, assumeClockKnown ? 0 : 0]); rhs.push(0); continue; }
      const gx = (px - s.x) / d;
      const gy = (py - s.y) / d;
      if (assumeClockKnown) {
        A.push([gx, gy]);
      } else {
        A.push([gx, gy, 1]);
      }
      rhs.push(residual);
    }
    const nUnknowns = assumeClockKnown ? 2 : 3;
    // 法方程 (AᵀA) dx = Aᵀ rhs
    const ata = Array.from({ length: nUnknowns }, () => new Array(nUnknowns).fill(0));
    const atb = new Array(nUnknowns).fill(0);
    for (let i = 0; i < n; i++) {
      for (let r = 0; r < nUnknowns; r++) {
        atb[r] += A[i][r] * rhs[i];
        for (let c = 0; c < nUnknowns; c++) {
          ata[r][c] += A[i][r] * A[i][c];
        }
      }
    }
    const dx = solveLinearSystem(ata, atb);
    if (!dx) return null;
    px += dx[0]; py += dx[1];
    if (!assumeClockKnown) b += dx[2];
    const stepMag = Math.hypot(dx[0], dx[1]) + Math.abs(assumeClockKnown ? 0 : dx[2]);
    if (stepMag < 1e-4) break;
  }

  const clockBiasSeconds = assumeClockKnown ? 0 : b / SPEED_OF_LIGHT;

  // 最终残差（RMS，米）
  let res = 0;
  for (let i = 0; i < n; i++) {
    const expected = dist2d({ x: px, y: py }, satellites[i]) + b;
    const r = pseudoranges[i] - expected;
    res += r * r;
  }
  res = Math.sqrt(res / n);

  return { x: px, y: py, clockBiasSeconds, iterations, residual: res };
}

/**
 * 时钟误差(秒) → 距离误差(米)：d = c × Δt。
 * @param {number} dtSeconds 时钟误差，秒
 * @returns {number} 距离误差，米
 */
function clockErrorToRange(dtSeconds) {
  return SPEED_OF_LIGHT * dtSeconds;
}

/**
 * 时钟误差(秒) → 现实后果标签。返回 { label, detail }。
 * 用于「1 纳秒 = 30 厘米」模块的对数滑块右轴。
 * @param {number} dtSeconds 时钟误差，秒
 * @returns {{label:string, detail:string, meters:number}}
 */
function errorToRealWorld(dtSeconds) {
  const meters = clockErrorToRange(dtSeconds);
  const tiers = [
    { max: 1e-8, label: '航空精密授时以下：日常无感', detail: '亚10纳秒通常被基础设施直接吸收，你对不上也觉察不到。' },
    { max: 3e-8, label: '≈10米定位精度（手机导航的锚点）', detail: '对应时钟误差 30 纳秒：这正是一台现代智能手机定位所需的授时精度。' },
    { max: 1e-6, label: '电网相位失稳', detail: '50Hz 下 1µs 对应约 0.018° 相角偏转；同步相量测量（IEEE C37.118）要求微秒级一致，超差会让保护误动。' },
    { max: 1e-3, label: '高频交易时序错乱', detail: 'MiFID II RTS 25 要求高频交易时钟同步 ±100µs；毫秒级错位足以推翻交易先后。' },
    { max: Infinity, label: '设备失步、网络崩溃级', detail: '毫秒到秒级误差：5G 基站相位失步、分布式共识乱序、缓存失效雪崩。' }
  ];
  for (const t of tiers) {
    if (dtSeconds <= t.max) return { label: t.label, detail: t.detail, meters };
  }
  return null;
}

/**
 * NTP 四时间戳：偏移量（毫秒）。
 * t1=客户端发送，t2=服务端收到，t3=服务端发出，t4=客户端收到。
 * offset = ((t2 − t1) + (t3 − t4)) / 2
 * @param {number} t1
 * @param {number} t2
 * @param {number} t3
 * @param {number} t4
 * @returns {number} 偏移，毫秒
 */
function ntpOffset(t1, t2, t3, t4) {
  return ((t2 - t1) + (t3 - t4)) / 2;
}

/**
 * NTP 四时间戳：往返延迟（毫秒）。
 * delay = (t4 − t1) − (t3 − t2)
 * @param {number} t1
 * @param {number} t2
 * @param {number} t3
 * @param {number} t4
 * @returns {number} 延迟，毫秒（可能因时钟噪声略负，调用方取 max(0,…)）
 */
function ntpDelay(t1, t2, t3, t4) {
  return (t4 - t1) - (t3 - t2);
}

/**
 * 时钟样本。
 * @typedef {{t1:number, t2:number, t3:number, t4:number}} ClockSample
 */

/**
 * NTP clock filter：取 delay 最小的样本作为结果（NTP 经典选择算法）。
 * @param {ClockSample[]} samples 样本列表
 * @returns {{offsetMillis:number, delayMillis:number, uncertaintyMillis:number, chosenIndex:number}}
 */
function clockFilter(samples) {
  if (!samples || samples.length === 0) {
    return { offsetMillis: 0, delayMillis: 0, uncertaintyMillis: 0, chosenIndex: -1 };
  }
  let best = -1, bestDelay = Infinity;
  for (let i = 0; i < samples.length; i++) {
    const d = Math.max(0, ntpDelay(samples[i].t1, samples[i].t2, samples[i].t3, samples[i].t4));
    if (d < bestDelay) { bestDelay = d; best = i; }
  }
  const chosen = samples[best];
  const offset = ntpOffset(chosen.t1, chosen.t2, chosen.t3, chosen.t4);
  // 不确定度：取 delay 的一半作为粗估上界（对称假设）。
  return {
    offsetMillis: offset,
    delayMillis: bestDelay,
    uncertaintyMillis: bestDelay / 2,
    chosenIndex: best
  };
}

/**
 * 从采样序列估算时钟量化台阶（performance.now() 的最小步进，毫秒）。
 * @param {number[]} samples 单调递增的 performance.now() 采样（毫秒）
 * @returns {number} 量化台阶（毫秒）；样本不足或台阶为 0 时返回 0
 */
function measureQuantization(samples) {
  if (!samples || samples.length < 2) return 0;
  let minStep = Infinity;
  for (let i = 1; i < samples.length; i++) {
    const step = samples[i] - samples[i - 1];
    if (step > 0 && step < minStep) minStep = step;
  }
  return Number.isFinite(minStep) && minStep > 0 ? minStep : 0;
}

/**
 * 由 performance.timeOrigin + performance.now() 得到一个带亚毫秒分辨率的"墙钟时间"（毫秒）。
 * 单独抽出便于测试。
 * @param {number} timeOriginMs performance.timeOrigin 的毫秒值
 * @param {number} nowMs performance.now() 毫秒值
 * @returns {number}
 */
function wallTimeMs(timeOriginMs, nowMs) {
  return timeOriginMs + nowMs;
}

/**
 * 格式化距离为易读字符串。
 * @param {number} m 米
 * @returns {string}
 */
function formatRange(m) {
  const abs = Math.abs(m);
  if (abs >= 1e6) return (m / 1e3).toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' km';
  if (abs >= 1e3) return (m / 1e3).toFixed(1) + ' km';
  if (abs >= 1) return m.toFixed(1) + ' m';
  if (abs >= 0.01) return (m * 100).toFixed(1) + ' cm';
  return m.toExponential(1) + ' m';
}

/**
 * 格式化秒为易读字符串。
 * @param {number} s 秒
 * @returns {string}
 */
function formatTime(s) {
  const abs = Math.abs(s);
  if (abs >= 1) return s.toFixed(1) + ' s';
  if (abs >= 1e-3) return (s * 1e3).toFixed(1) + ' ms';
  if (abs >= 1e-6) return (s * 1e6).toFixed(1) + ' µs';
  if (abs >= 1e-9) return (s * 1e9).toFixed(1) + ' ns';
  return s.toExponential(1) + ' s';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SPEED_OF_LIGHT,
    solveLinearSystem,
    pseudorange,
    dist2d,
    solvePosition,
    clockErrorToRange,
    errorToRealWorld,
    ntpOffset,
    ntpDelay,
    clockFilter,
    measureQuantization,
    wallTimeMs,
    formatRange,
    formatTime
  };
} else if (typeof window !== 'undefined') {
  // 浏览器直接 <script> 引入时挂到全局，供 app.js 使用。
  window.GPS_ENGINE = {
    SPEED_OF_LIGHT,
    solveLinearSystem,
    pseudorange,
    dist2d,
    solvePosition,
    clockErrorToRange,
    errorToRealWorld,
    ntpOffset,
    ntpDelay,
    clockFilter,
    measureQuantization,
    wallTimeMs,
    formatRange,
    formatTime
  };
}
// ========== 牛顿分形核心算法（可独立测试） ==========
//
// 设计原则：
// - 所有函数纯函数，不依赖 DOM、不依赖全局状态
// - 复数运算直接用 (zr, zi) 双参数形式，避免对象创建（百万像素级性能）
// - newtonStep / newtonStepN 对 z^n - 1 = 0 求解；newtonStepCustom 处理自定义方程
// - 模块底部条件导出，浏览器与 Node 测试皆可

// ── 复数基础运算（内联进主循环以保证性能，这里仅作辅助） ──

/**
 * 复数乘法 (ar+ai·i) * (br+bi·i)
 */
function cmul(ar, ai, br, bi) {
  return { r: ar * br - ai * bi, i: ar * bi + ai * br };
}

/**
 * 复数除法 (ar+ai·i) / (br+bi·i)
 */
function cdiv(ar, ai, br, bi) {
  const denom = br * br + bi * bi;
  if (denom === 0) return { r: ar, i: ai };
  return {
    r: (ar * br + ai * bi) / denom,
    i: (ai * br - ar * bi) / denom,
  };
}

/**
 * 复数整数幂 z^n（n 为非负整数）
 */
function cpow(ar, ai, n) {
  let r = 1, i = 0;
  for (let k = 0; k < n; k++) {
    const nr = r * ar - i * ai;
    const ni = r * ai + i * ar;
    r = nr; i = ni;
  }
  return { r, i };
}

// ── 牛顿迭代步 ──

/**
 * 对 z³-1=0 的牛顿迭代（复数运算）
 * 公式：z_{n+1} = z - (z³-1)/(3z²) = (2z³+1)/(3z²)
 * @param {number} zr - z 的实部
 * @param {number} zi - z 的虚部
 * @returns {{zr: number, zi: number}} 迭代后的新 z
 */
function newtonStep(zr, zi) {
  // z²
  const z2r = zr * zr - zi * zi;
  const z2i = 2 * zr * zi;
  // z³ = z² * z
  const z3r = z2r * zr - z2i * zi;
  const z3i = z2r * zi + z2i * zr;
  // 分子 (2z³+1) / 分母 (3z²)
  const numr = 2 * z3r + 1;
  const numi = 2 * z3i;
  const denr = 3 * z2r;
  const deni = 3 * z2i;
  const denom = denr * denr + deni * deni;
  if (denom === 0) return { zr: zr, zi: zi };
  return {
    zr: (numr * denr + numi * deni) / denom,
    zi: (numi * denr - numr * deni) / denom,
  };
}

/**
 * 通用牛顿迭代步（支持 z^n - 1 = 0）
 * 推导：z_{n+1} = z - (z^n-1)/(n·z^(n-1)) = ((n-1)·z^n + 1) / (n·z^(n-1))
 * @param {number} zr
 * @param {number} zi
 * @param {number} n - 方程次数（n>=2）
 * @returns {{zr: number, zi: number}}
 */
function newtonStepN(zr, zi, n) {
  if (n === 3) return newtonStep(zr, zi);
  if (n < 2) return { zr: zr, zi: zi };

  // 计算 z^(n-1)（用快速幂优化小 n 已足够，n 通常 <= 8）
  let znm1r = 1, znm1i = 0;
  for (let k = 0; k < n - 1; k++) {
    const nr = znm1r * zr - znm1i * zi;
    const ni = znm1r * zi + znm1i * zr;
    znm1r = nr; znm1i = ni;
  }
  // z^n = z^(n-1) * z
  const znr = znm1r * zr - znm1i * zi;
  const zni = znm1r * zi + znm1i * zr;
  // num = (n-1)*z^n + 1
  const numr = (n - 1) * znr + 1;
  const numi = (n - 1) * zni;
  // den = n * z^(n-1)
  const denr = n * znm1r;
  const deni = n * znm1i;
  const denom = denr * denr + deni * deni;
  if (denom === 0) return { zr: zr, zi: zi };
  return {
    zr: (numr * denr + numi * deni) / denom,
    zi: (numi * denr - numr * deni) / denom,
  };
}

/**
 * 自定义方程的牛顿迭代步：z_{n+1} = z - f(z)/f'(z)
 * 用于 z^n - 1 之外的方程（如 z³ - 2z + 2 = 0）
 * @param {number} zr
 * @param {number} zi
 * @param {function} f - (zr, zi) => {r, i}
 * @param {function} fp - (zr, zi) => {r, i}
 * @returns {{zr: number, zi: number}}
 */
function newtonStepCustom(zr, zi, f, fp) {
  const fz = f(zr, zi);
  const fpz = fp(zr, zi);
  const denom = fpz.r * fpz.r + fpz.i * fpz.i;
  if (denom === 0) return { zr: zr, zi: zi };
  // z - f(z)/f'(z)
  const divR = (fz.r * fpz.r + fz.i * fpz.i) / denom;
  const divI = (fz.i * fpz.r - fz.r * fpz.i) / denom;
  return { zr: zr - divR, zi: zi - divI };
}

// ── 根的解析 ──

/**
 * 获取 z^n - 1 = 0 的所有根（复平面坐标）
 * 第 k 个根：e^(2πik/n) = cos(2πk/n) + i·sin(2πk/n)
 * @param {number} n
 * @returns {Array<{r: number, i: number}>}
 */
function getRoots(n) {
  const roots = [];
  for (let k = 0; k < n; k++) {
    const angle = (2 * Math.PI * k) / n;
    roots.push({ r: Math.cos(angle), i: Math.sin(angle) });
  }
  return roots;
}

/**
 * z³ - 2z + 2 = 0 的三个根（数值近似）
 * 1 个实根 ≈ -1.76929235423863
 * 2 个共轭复根 ≈ 0.88464617711932 ± 0.58974280502219i
 * 这些值由数值方法预先求得，精度足够用于收敛判定
 */
const CUSTOM_ROOTS = [
  { r: -1.7692923542386314, i: 0 },
  { r: 0.8846461771193155, i: 0.5897428050222055 },
  { r: 0.8846461771193155, i: -0.5897428050222055 },
];

/**
 * 自定义方程 f(z) = z³ - 2z + 2 的 f 与 f'
 */
const CUSTOM_F = function (zr, zi) {
  const z2r = zr * zr - zi * zi;
  const z2i = 2 * zr * zi;
  const z3r = z2r * zr - z2i * zi;
  const z3i = z2r * zi + z2i * zr;
  return { r: z3r - 2 * zr + 2, i: z3i - 2 * zi };
};
const CUSTOM_FP = function (zr, zi) {
  const z2r = zr * zr - zi * zi;
  const z2i = 2 * zr * zi;
  return { r: 3 * z2r - 2, i: 3 * z2i };
};

// ── 迭代收敛 ──

/**
 * 从给定起点出发，执行牛顿迭代直到收敛
 * @param {number} zr0 - 起点实部
 * @param {number} zi0 - 起点虚部
 * @param {number} n - 方程 z^n - 1 = 0
 * @param {number} maxIter - 最大迭代次数
 * @param {number} tolerance - 收敛判定阈值（|z - root| < tolerance 则认为收敛）
 * @returns {{rootIndex: number, iterations: number, trajectory: Array<{zr, zi}>}}
 *   rootIndex: 收敛到第几个根（0-indexed），-1 表示未收敛
 *   iterations: 实际迭代次数（执行 newtonStep 的次数）
 *   trajectory: 完整轨迹 [z0, z1, ..., z_iter]，长度 = iterations + 1
 */
function newtonIterate(zr0, zi0, n, maxIter, tolerance) {
  const roots = getRoots(n);
  const trajectory = [{ zr: zr0, zi: zi0 }];
  let zr = zr0, zi = zi0;
  const tolSq = tolerance * tolerance;

  // 起点即已收敛
  for (let k = 0; k < roots.length; k++) {
    const dr = zr - roots[k].r;
    const di = zi - roots[k].i;
    if (dr * dr + di * di < tolSq) {
      return { rootIndex: k, iterations: 0, trajectory: trajectory };
    }
  }

  for (let iter = 0; iter < maxIter; iter++) {
    const next = newtonStepN(zr, zi, n);
    zr = next.zr;
    zi = next.zi;
    trajectory.push({ zr: zr, zi: zi });

    // 发散保护
    if (!isFinite(zr) || !isFinite(zi) || zr * zr + zi * zi > 1e20) {
      return { rootIndex: -1, iterations: iter + 1, trajectory: trajectory };
    }

    // 检查收敛
    for (let k = 0; k < roots.length; k++) {
      const dr = zr - roots[k].r;
      const di = zi - roots[k].i;
      if (dr * dr + di * di < tolSq) {
        return { rootIndex: k, iterations: iter + 1, trajectory: trajectory };
      }
    }
  }

  return { rootIndex: -1, iterations: maxIter, trajectory: trajectory };
}

/**
 * 高速版牛顿迭代（不构建 trajectory），用于 computeNewtonFractal
 */
function newtonIterateFast(zr0, zi0, stepFn, roots, maxIter, tolerance) {
  let zr = zr0, zi = zi0;
  const tolSq = tolerance * tolerance;

  for (let k = 0; k < roots.length; k++) {
    const dr = zr - roots[k].r;
    const di = zi - roots[k].i;
    if (dr * dr + di * di < tolSq) return { rootIndex: k, iterations: 0 };
  }

  for (let iter = 0; iter < maxIter; iter++) {
    const next = stepFn(zr, zi);
    zr = next.zr;
    zi = next.zi;

    if (!isFinite(zr) || !isFinite(zi) || zr * zr + zi * zi > 1e20) {
      return { rootIndex: -1, iterations: iter + 1 };
    }

    for (let k = 0; k < roots.length; k++) {
      const dr = zr - roots[k].r;
      const di = zi - roots[k].i;
      if (dr * dr + di * di < tolSq) {
        return { rootIndex: k, iterations: iter + 1 };
      }
    }
  }

  return { rootIndex: -1, iterations: maxIter };
}

// ── 全局分形渲染 ──

/**
 * 计算整个视口区域的牛顿分形数据（针对 z^n - 1 = 0）
 * 视口宽度对应复平面 4/zoom 单位（与 Mandelbrot demo 一致）
 * @param {number} width
 * @param {number} height
 * @param {number} centerX - 视口中心实部
 * @param {number} centerY - 视口中心虚部
 * @param {number} zoom
 * @param {number} n - 方程次数
 * @param {number} maxIter
 * @returns {{rootIndices: Int8Array, iterCounts: Float32Array}}
 */
function computeNewtonFractal(width, height, centerX, centerY, zoom, n, maxIter) {
  const total = width * height;
  const rootIndices = new Int8Array(total);
  const iterCounts = new Float32Array(total);
  const roots = getRoots(n);
  const tolerance = 1e-6;
  const scale = 4.0 / (Math.min(width, height) * zoom);
  const halfW = width / 2;
  const halfH = height / 2;

  // 绑定 stepFn 以加速
  const stepFn = function (zr, zi) { return newtonStepN(zr, zi, n); };

  for (let py = 0; py < height; py++) {
    const cy = centerY + (py - halfH) * scale;
    for (let px = 0; px < width; px++) {
      const cx = centerX + (px - halfW) * scale;
      const result = newtonIterateFast(cx, cy, stepFn, roots, maxIter, tolerance);
      const idx = py * width + px;
      rootIndices[idx] = result.rootIndex;
      iterCounts[idx] = result.iterations;
    }
  }

  return { rootIndices: rootIndices, iterCounts: iterCounts };
}

/**
 * 计算自定义方程视口的牛顿分形
 * @param {number} width
 * @param {number} height
 * @param {number} centerX
 * @param {number} centerY
 * @param {number} zoom
 * @param {function} stepFn - (zr, zi) => {zr, zi}
 * @param {Array<{r, i}>} roots
 * @param {number} maxIter
 * @returns {{rootIndices: Int8Array, iterCounts: Float32Array}}
 */
function computeNewtonFractalCustom(width, height, centerX, centerY, zoom, stepFn, roots, maxIter) {
  const total = width * height;
  const rootIndices = new Int8Array(total);
  const iterCounts = new Float32Array(total);
  const tolerance = 1e-6;
  const scale = 4.0 / (Math.min(width, height) * zoom);
  const halfW = width / 2;
  const halfH = height / 2;

  for (let py = 0; py < height; py++) {
    const cy = centerY + (py - halfH) * scale;
    for (let px = 0; px < width; px++) {
      const cx = centerX + (px - halfW) * scale;
      const result = newtonIterateFast(cx, cy, stepFn, roots, maxIter, tolerance);
      const idx = py * width + px;
      rootIndices[idx] = result.rootIndex;
      iterCounts[idx] = result.iterations;
    }
  }

  return { rootIndices: rootIndices, iterCounts: iterCounts };
}

// ── 着色 ──

/**
 * 配色方案表：每行对应一个根的基础 RGB
 */
const COLOR_PALETTES = {
  // 经典：玫红 / 金黄 / 翠绿（用户指定 FF0052/FFD400/00C68D）
  classic: [
    [255, 0, 82],
    [255, 212, 0],
    [0, 198, 141],
    [100, 80, 255],
    [255, 140, 0],
    [0, 180, 255],
  ],
  // 深空：靛蓝 / 琥珀 / 洋红
  deepspace: [
    [30, 90, 255],
    [255, 180, 40],
    [220, 40, 160],
    [0, 200, 130],
    [255, 80, 80],
    [180, 100, 255],
  ],
  // 热力：深红 / 烈橙 / 亮黄
  heat: [
    [220, 40, 40],
    [255, 120, 0],
    [255, 210, 30],
    [230, 60, 90],
    [255, 140, 100],
    [200, 80, 0],
  ],
  // 冰蓝：深海蓝 / 天青 / 极光白
  ice: [
    [20, 60, 160],
    [40, 170, 240],
    [200, 240, 255],
    [80, 200, 220],
    [140, 220, 255],
    [60, 120, 200],
  ],
  // 霓虹：品红 / 电青 / 柠檬绿
  neon: [
    [255, 20, 180],
    [0, 240, 220],
    [180, 255, 0],
    [200, 100, 255],
    [80, 255, 80],
    [160, 60, 255],
  ],
  // 日落：珊瑚 / 紫罗兰 / 蜜桃
  sunset: [
    [255, 90, 60],
    [160, 50, 220],
    [255, 180, 100],
    [255, 120, 180],
    [100, 40, 180],
    [255, 150, 50],
  ],
};

/**
 * 将 rootIndex + 迭代次数映射为颜色
 * 亮度编码：迭代越少（收敛越快）越亮，越多（越接近边界）越暗
 * @param {number} rootIndex
 * @param {number} iterations
 * @param {number} maxIter
 * @param {number} totalRoots
 * @param {string} scheme - 配色方案名称（classic/heat/ice/neon）
 * @returns {{r: number, g: number, b: number}}
 */
function getColor(rootIndex, iterations, maxIter, totalRoots, scheme) {
  // 未收敛点：黑色
  if (rootIndex < 0) return { r: 0, g: 0, b: 0 };

  const palette = COLOR_PALETTES[scheme] || COLOR_PALETTES.classic;
  const base = palette[rootIndex % palette.length];

  // 亮度：使用对数缩放，让低迭代值的层次更丰富
  // t ∈ [0, 1]，迭代越少 t 越小，亮度越高
  const t = maxIter > 0
    ? Math.min(1, Math.log(iterations + 1) / Math.log(maxIter + 1))
    : 0;
  // 亮度范围 0.35（接近 maxIter，最暗） -> 1.0（1 步收敛，最亮）
  const brightness = 1 - 0.65 * t;

  return {
    r: Math.max(0, Math.min(255, Math.round(base[0] * brightness))),
    g: Math.max(0, Math.min(255, Math.round(base[1] * brightness))),
    b: Math.max(0, Math.min(255, Math.round(base[2] * brightness))),
  };
}

// ── 视口信息 ──

/**
 * 计算当前视口的复平面范围信息
 */
function getViewportInfo(width, height, centerX, centerY, zoom) {
  const scale = 4.0 / (Math.min(width, height) * zoom);
  return {
    realMin: centerX - (width / 2) * scale,
    realMax: centerX + (width / 2) * scale,
    imagMin: centerY - (height / 2) * scale,
    imagMax: centerY + (height / 2) * scale,
    pixelSize: scale,
  };
}

// ── 经典放大坐标预设 ──
// 这些坐标在 z³-1 的分形边界上，经过数值验证：放大后仍保持多色（深边界）
// 利用 z³-1 关于实轴的对称性，预设点选在 y>0 半平面
const NEWTON_PRESETS = [
  { name: '全景', x: 0, y: 0, zoom: 1, n: 3, desc: '三根瓜分复平面的全景' },
  { name: '三色交汇', x: -0.046, y: 0.572, zoom: 18, n: 3, desc: '三种颜色交界的螺旋结构' },
  { name: '发丝地带', x: 1.180, y: 1.900, zoom: 100, n: 3, desc: '极细的色带交织' },
  { name: '涡旋眼', x: 0.800, y: 0.920, zoom: 150, n: 3, desc: '旋转形态的涡旋中心' },
];

// ── 单点追踪预设起点 ──
const SINGLE_POINT_PRESETS = [
  { name: '稳定区域', zr: 1.5, zi: 0.5, desc: '快速收敛到最近的根' },
  { name: '边界附近', zr: 0.1, zi: 0.1, desc: '轨迹曲折，迭代次数较多' },
  { name: '三色交界', zr: 0, zi: 0.5, desc: '极度敏感，命运难以预测' },
  { name: '对称轴上', zr: 0, zi: 1, desc: '有趣的对称行为' },
];

// ── Node.js 导出 ──
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    cmul,
    cdiv,
    cpow,
    newtonStep,
    newtonStepN,
    newtonStepCustom,
    getRoots,
    newtonIterate,
    newtonIterateFast,
    computeNewtonFractal,
    computeNewtonFractalCustom,
    getColor,
    getViewportInfo,
    COLOR_PALETTES,
    CUSTOM_ROOTS,
    CUSTOM_F,
    CUSTOM_FP,
    NEWTON_PRESETS,
    SINGLE_POINT_PRESETS,
  };
}

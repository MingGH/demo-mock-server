// ========== 曼德勃罗集核心算法（可独立测试） ==========

/**
 * 计算点 (cx, cy) 的逃逸迭代次数。
 * 曼德勃罗集定义：z_{n+1} = z_n^2 + c，从 z_0 = 0 开始。
 * 若 |z_n| > 2 则确定发散（逃逸），返回迭代次数。
 * 若达到 maxIter 仍未逃逸，视为集合内部，返回 maxIter。
 *
 * 使用平滑迭代计数（smooth iteration count）避免色带断裂。
 */
function mandelbrotEscape(cx, cy, maxIter) {
  let zx = 0, zy = 0;
  let zx2 = 0, zy2 = 0;
  let iter = 0;

  while (zx2 + zy2 <= 4 && iter < maxIter) {
    zy = 2 * zx * zy + cy;
    zx = zx2 - zy2 + cx;
    zx2 = zx * zx;
    zy2 = zy * zy;
    iter++;
  }

  if (iter === maxIter) return maxIter;

  // 平滑迭代计数：消除整数迭代导致的色带效果
  const log2 = Math.log(2);
  const modulus = Math.sqrt(zx2 + zy2);
  const smooth = iter + 1 - Math.log(Math.log(modulus)) / log2;
  return smooth;
}

/**
 * 将逃逸值映射到 HSL 颜色。
 * 集合内部（iter === maxIter）返回黑色。
 * 使用对数归一化确保不同缩放级别下都有丰富色彩。
 */
function iterToColor(iter, maxIter) {
  if (iter >= maxIter) return { r: 0, g: 0, b: 0 };

  // 对数归一化：让低迭代值也能分配到丰富颜色
  const t = Math.log(iter + 1) / Math.log(maxIter + 1);
  const hue = 220 + 140 * t; // 蓝→紫→金色
  const sat = 0.75 + 0.25 * Math.sin(t * Math.PI);
  const light = 0.05 + 0.55 * t;

  return hslToRgb(hue / 360, sat, light);
}

/**
 * 配色方案：超火焰（UltraFractal 风格）
 */
function iterToColorFire(iter, maxIter) {
  if (iter >= maxIter) return { r: 0, g: 0, b: 0 };

  const t = Math.log(iter + 1) / Math.log(maxIter + 1);
  // 火焰色带：黑→红→橙→黄→白
  const r = Math.min(255, Math.floor(510 * t));
  const g = Math.min(255, Math.floor(Math.max(0, 510 * (t - 0.35))));
  const b = Math.min(255, Math.floor(Math.max(0, 510 * (t - 0.65))));

  return { r, g, b };
}

/**
 * 配色方案：冰蓝
 */
function iterToColorIce(iter, maxIter) {
  if (iter >= maxIter) return { r: 0, g: 0, b: 0 };

  const t = Math.log(iter + 1) / Math.log(maxIter + 1);
  const r = Math.floor(9 * (1 - t) * t * t * t * 255);
  const g = Math.floor(15 * (1 - t) * (1 - t) * t * t * 255);
  const b = Math.min(255, Math.floor(8.5 * (1 - t) * (1 - t) * (1 - t) * t * 255 + 200 * t));

  return {
    r: Math.min(255, r),
    g: Math.min(255, g),
    b: Math.min(255, Math.max(0, b))
  };
}

/**
 * 配色方案：经典彩虹（HSV 循环）
 */
function iterToColorRainbow(iter, maxIter) {
  if (iter >= maxIter) return { r: 0, g: 0, b: 0 };

  const hue = (iter * 7) % 360;
  return hslToRgb(hue / 360, 0.9, 0.5);
}

/**
 * HSL → RGB 转换
 */
function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hueToRgb(p, q, h + 1 / 3);
    g = hueToRgb(p, q, h);
    b = hueToRgb(p, q, h - 1 / 3);
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

function hueToRgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

/**
 * 计算整个视口区域的曼德勃罗集。
 * 返回包含每个像素逃逸值的 Float64Array。
 */
function computeRegion(width, height, centerX, centerY, zoom, maxIter) {
  const escapeData = new Float64Array(width * height);
  const scale = 4.0 / (width * zoom);

  for (let py = 0; py < height; py++) {
    const cy = centerY + (py - height / 2) * scale;
    for (let px = 0; px < width; px++) {
      const cx = centerX + (px - width / 2) * scale;
      escapeData[py * width + px] = mandelbrotEscape(cx, cy, maxIter);
    }
  }

  return escapeData;
}

/**
 * 估算某个缩放级别下的"有趣度"：
 * 在边界附近的点比例越高越有趣（非全黑也非全快逃逸）。
 */
function estimateInterest(samples, maxIter) {
  let boundary = 0;
  for (let i = 0; i < samples.length; i++) {
    const iter = samples[i];
    if (iter > 2 && iter < maxIter) boundary++;
  }
  return boundary / samples.length;
}

/**
 * 预设的有趣坐标（著名的放大位置）
 */
const PRESETS = [
  { name: '全貌', x: -0.5, y: 0, zoom: 1, desc: '曼德勃罗集全景' },
  { name: '海马谷', x: -0.745, y: 0.113, zoom: 80, desc: '无限重复的海马形螺旋结构' },
  { name: '三重螺旋', x: -0.088, y: 0.654, zoom: 300, desc: '三条旋臂交织的螺旋图案' },
  { name: '象谷', x: 0.2859, y: 0.0138, zoom: 500, desc: '大象般的重复卷曲图案' },
  { name: '触须', x: -1.256, y: 0.38, zoom: 400, desc: '集合边界延伸出的精细触须' },
  { name: '丝状体', x: -1.2536, y: 0.3437, zoom: 3000, desc: '极细的分支丝状分形结构' },
  { name: '嵌入Julia', x: -0.156653, y: 1.039127, zoom: 800, desc: '边界上嵌入的Julia集形态' },
  { name: '花园', x: -1.749, y: 0.0, zoom: 2000, desc: '无限缩放的花朵结构' },
];

/**
 * 计算当前视口的复平面范围信息
 */
function getViewportInfo(width, height, centerX, centerY, zoom) {
  const scale = 4.0 / (width * zoom);
  return {
    realMin: centerX - (width / 2) * scale,
    realMax: centerX + (width / 2) * scale,
    imagMin: centerY - (height / 2) * scale,
    imagMax: centerY + (height / 2) * scale,
    pixelSize: scale,
  };
}

// Node.js 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    mandelbrotEscape,
    iterToColor,
    iterToColorFire,
    iterToColorIce,
    iterToColorRainbow,
    hslToRgb,
    hueToRgb,
    computeRegion,
    estimateInterest,
    getViewportInfo,
    PRESETS,
  };
}

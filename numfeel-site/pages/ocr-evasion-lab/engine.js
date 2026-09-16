/**
 * OCR 规避实验室 —— 图像处理与判定逻辑
 *
 * 本文件只做纯计算，不碰 DOM，可在 Node 下直接 require 测试。
 * 图像统一表示为 { data: Uint8ClampedArray(RGBA), width, height }。
 */

/**
 * 创建一张纯色图像
 * @param {number} width 宽度
 * @param {number} height 高度
 * @param {number} [v] 灰度值，默认 255（白）
 * @returns {{data: Uint8ClampedArray, width: number, height: number}}
 */
function createImage(width, height, v = 255) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  return { data, width, height };
}

/**
 * 深拷贝一张图像
 * @param {{data: Uint8ClampedArray, width: number, height: number}} img
 * @returns {{data: Uint8ClampedArray, width: number, height: number}}
 */
function cloneImage(img) {
  return {
    data: new Uint8ClampedArray(img.data),
    width: img.width,
    height: img.height,
  };
}

/**
 * 确定性伪随机数生成器（mulberry32）
 * 同一个种子必须产出同一串随机数，否则「切碎」「噪点」无法复现。
 * @param {number} seed 种子
 * @returns {function(): number} 每次调用返回一个 [0,1) 的数
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 转灰度（BT.601 亮度公式）
 * @param {{data: Uint8ClampedArray, width: number, height: number}} img
 * @returns {{data: Uint8ClampedArray, width: number, height: number}}
 */
function toGrayscale(img) {
  const out = cloneImage(img);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = y;
    d[i + 1] = y;
    d[i + 2] = y;
  }
  return out;
}

/**
 * 压缩对比度：把所有像素朝背景色靠拢
 * @param {{data: Uint8ClampedArray, width: number, height: number}} img
 * @param {number} amount 0 表示不变，1 表示全部变成背景色
 * @param {number} [bg] 背景灰度值，默认 255
 * @returns {{data: Uint8ClampedArray, width: number, height: number}}
 */
function reduceContrast(img, amount, bg = 255) {
  const a = Math.max(0, Math.min(1, amount));
  const out = cloneImage(img);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = bg + (d[i] - bg) * (1 - a);
    d[i + 1] = bg + (d[i + 1] - bg) * (1 - a);
    d[i + 2] = bg + (d[i + 2] - bg) * (1 - a);
  }
  return out;
}

/**
 * 方框模糊（先横后纵两次一维卷积）
 * @param {{data: Uint8ClampedArray, width: number, height: number}} img
 * @param {number} radius 半径，0 表示不处理
 * @returns {{data: Uint8ClampedArray, width: number, height: number}}
 */
function blur(img, radius) {
  const r = Math.round(radius);
  if (r <= 0) return cloneImage(img);
  const w = img.width;
  const h = img.height;
  const src = img.data;
  const tmp = new Uint8ClampedArray(src.length);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s0 = 0;
      let s1 = 0;
      let s2 = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= w) continue;
        const p = (y * w + xx) * 4;
        s0 += src[p];
        s1 += src[p + 1];
        s2 += src[p + 2];
        n++;
      }
      const q = (y * w + x) * 4;
      tmp[q] = s0 / n;
      tmp[q + 1] = s1 / n;
      tmp[q + 2] = s2 / n;
      tmp[q + 3] = 255;
    }
  }

  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s0 = 0;
      let s1 = 0;
      let s2 = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= h) continue;
        const p = (yy * w + x) * 4;
        s0 += tmp[p];
        s1 += tmp[p + 1];
        s2 += tmp[p + 2];
        n++;
      }
      const q = (y * w + x) * 4;
      out[q] = s0 / n;
      out[q + 1] = s1 / n;
      out[q + 2] = s2 / n;
      out[q + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}

/**
 * 撒噪点
 * @param {{data: Uint8ClampedArray, width: number, height: number}} img
 * @param {number} amount 噪点幅度，0-128
 * @param {function(): number} rng 随机数生成器
 * @returns {{data: Uint8ClampedArray, width: number, height: number}}
 */
function addNoise(img, amount, rng) {
  const out = cloneImage(img);
  if (amount <= 0) return out;
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() * 2 - 1) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  return out;
}

/**
 * 正弦波浪扭曲：逐行左右平移
 * @param {{data: Uint8ClampedArray, width: number, height: number}} img
 * @param {number} amplitude 最大位移像素
 * @param {number} period 正弦周期（像素）
 * @returns {{data: Uint8ClampedArray, width: number, height: number}}
 */
function waveWarp(img, amplitude, period) {
  const amp = Math.round(amplitude);
  if (amp <= 0) return cloneImage(img);
  const w = img.width;
  const h = img.height;
  const src = img.data;
  const out = new Uint8ClampedArray(src.length);
  out.fill(255);
  const p = Math.max(4, Math.round(period));

  for (let y = 0; y < h; y++) {
    const dx = Math.round(Math.sin((2 * Math.PI * y) / p) * amp);
    for (let x = 0; x < w; x++) {
      const xx = x - dx;
      if (xx < 0 || xx >= w) continue;
      const s = (y * w + xx) * 4;
      const q = (y * w + x) * 4;
      out[q] = src[s];
      out[q + 1] = src[s + 1];
      out[q + 2] = src[s + 2];
      out[q + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}

/**
 * 切片错位：把图像按固定高度横切成条，每条随机左右错位
 * 人眼能靠上下文把字连起来，按行读取的 OCR 会被打乱。
 * @param {{data: Uint8ClampedArray, width: number, height: number}} img
 * @param {number} maxShift 单条最大位移像素，0 表示不处理
 * @param {function(): number} rng 随机数生成器
 * @param {number} [sliceHeight] 条带高度，默认 10
 * @returns {{data: Uint8ClampedArray, width: number, height: number}}
 */
function sliceShift(img, maxShift, rng, sliceHeight = 10) {
  const amp = Math.round(maxShift);
  if (amp <= 0) return cloneImage(img);
  const w = img.width;
  const h = img.height;
  const src = img.data;
  const out = new Uint8ClampedArray(src.length);
  out.fill(255);
  const sh = Math.max(1, Math.round(sliceHeight));

  for (let y0 = 0; y0 < h; y0 += sh) {
    const dx = Math.round((rng() * 2 - 1) * amp);
    const yEnd = Math.min(y0 + sh, h);
    for (let y = y0; y < yEnd; y++) {
      for (let x = 0; x < w; x++) {
        const xx = x - dx;
        if (xx < 0 || xx >= w) continue;
        const s = (y * w + xx) * 4;
        const q = (y * w + x) * 4;
        out[q] = src[s];
        out[q + 1] = src[s + 1];
        out[q + 2] = src[s + 2];
        out[q + 3] = 255;
      }
    }
  }
  return { data: out, width: w, height: h };
}

/**
 * 笔画切断：随机横向细线把字拦腰擦成背景色
 * 切断线只落在有墨迹的纵向区间内，否则会撒在空白处，看不出效果。
 * @param {{data: Uint8ClampedArray, width: number, height: number}} img
 * @param {number} count 切线条数，0 表示不处理
 * @param {function(): number} rng 随机数生成器
 * @returns {{data: Uint8ClampedArray, width: number, height: number}}
 */
function strokeBreak(img, count, rng) {
  const n = Math.round(count);
  const out = cloneImage(img);
  if (n <= 0) return out;
  const w = out.width;
  const h = out.height;
  const d = out.data;

  let inkTop = -1;
  let inkBottom = -1;
  for (let y = 0; y < h; y++) {
    const rowStart = y * w;
    for (let x = 0; x < w; x++) {
      if (d[(rowStart + x) * 4] < 160) {
        if (inkTop < 0) inkTop = y;
        inkBottom = y;
        break;
      }
    }
  }
  const top = inkTop >= 0 ? inkTop : 0;
  const bottom = inkTop >= 0 ? inkBottom : h - 1;
  const span = bottom - top + 1;

  for (let i = 0; i < n; i++) {
    const y = top + Math.floor(rng() * span);
    const thickness = rng() < 0.35 ? 2 : 1;
    for (let k = 0; k < thickness && y + k < h; k++) {
      const rowStart = (y + k) * w;
      for (let x = 0; x < w; x++) {
        const q = (rowStart + x) * 4;
        d[q] = 255;
        d[q + 1] = 255;
        d[q + 2] = 255;
      }
    }
  }
  return out;
}

/**
 * 完整处理管道：按固定顺序依次施加所有手段
 * @param {{data: Uint8ClampedArray, width: number, height: number}} img 原始渲染图
 * @param {Object} [params] 各项强度
 * @param {number} [params.wave] 波浪振幅
 * @param {number} [params.wavePeriod] 波浪周期
 * @param {number} [params.slice] 切片错位幅度
 * @param {number} [params.blur] 模糊半径
 * @param {number} [params.breakCount] 切线条数
 * @param {number} [params.noise] 噪点幅度
 * @param {number} [params.contrast] 对比度压缩百分比 0-100
 * @param {number} [seed] 随机种子，决定「切碎」「噪点」的具体形态
 * @returns {{data: Uint8ClampedArray, width: number, height: number}}
 */
function applyPipeline(img, params = {}, seed = 1) {
  const p = Object.assign(
    { wave: 0, wavePeriod: 40, slice: 0, blur: 0, breakCount: 0, noise: 0, contrast: 0 },
    params
  );
  const rng = mulberry32(seed);

  let out = toGrayscale(img);
  out = waveWarp(out, p.wave, p.wavePeriod);
  out = sliceShift(out, p.slice, rng);
  out = blur(out, p.blur);
  out = strokeBreak(out, p.breakCount, rng);
  out = addNoise(out, p.noise, rng);
  out = reduceContrast(out, p.contrast / 100);
  return out;
}

/**
 * 归一化文本：去空白、去标点、转小写，用于比对
 * @param {string} s 原始文本
 * @returns {string} 归一化结果
 */
function normalizeText(s) {
  return String(s == null ? '' : s)
    .replace(/[\s\u3000]/g, '')
    .replace(/[，。、；：？！,.;:?!"'“”‘’（）()《》〈〉【】\[\]{}<>·—～~\\/|_\-]/g, '')
    .toLowerCase();
}

/**
 * 文本相似度（1 - 归一化编辑距离）
 * @param {string} a 文本 A
 * @param {string} b 文本 B
 * @returns {number} 0-1，1 表示完全一致
 */
function similarity(a, b) {
  const s = normalizeText(a);
  const t = normalizeText(b);
  if (!s.length && !t.length) return 1;
  if (!s.length || !t.length) return 0;

  let prev = new Array(t.length + 1);
  let cur = new Array(t.length + 1);
  for (let j = 0; j <= t.length; j++) prev[j] = j;

  for (let i = 1; i <= s.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    const swap = prev;
    prev = cur;
    cur = swap;
  }
  return 1 - prev[t.length] / Math.max(s.length, t.length);
}

/**
 * 判定 OCR 是否读对了
 * @param {string} original 原文
 * @param {string} ocrText OCR 输出
 * @param {number} [threshold] 相似度阈值，默认 0.8
 * @returns {{similarity: number, pass: boolean}} 相似度与是否算读对
 */
function judgeOcr(original, ocrText, threshold = 0.8) {
  const sim = similarity(original, ocrText);
  return { similarity: sim, pass: sim >= threshold };
}

/**
 * 四象限分类：把「人读得出来吗」和「机器读得出来吗」交叉
 * @param {boolean} humanRead 人是否读出来了
 * @param {boolean} ocrPass 机器是否读出来了
 * @returns {'separation'|'both-ok'|'both-fail'|'machine-only'} 分类结果
 */
function classify(humanRead, ocrPass) {
  if (humanRead && !ocrPass) return 'separation';
  if (humanRead && ocrPass) return 'both-ok';
  if (!humanRead && ocrPass) return 'machine-only';
  return 'both-fail';
}

/**
 * 各项手法的「实际见效点」：到这里画面基本已经毁了，再往上加意义不大
 */
const BREAKDOWN_MAX = {
  wave: 16,
  slice: 20,
  blur: 4,
  breakCount: 14,
  noise: 60,
  contrast: 60,
  lines: 8,
};

/**
 * 把一组参数换算成 0-100 的破坏强度
 * 取最强的那一项。预设通常只动两三项，求平均会把它们压成一堆相同的值。
 * 字号不参与，它影响的是字号本身，不算破坏。
 * @param {Object} [params] 参数
 * @returns {number} 0-100 的整数，0 表示原图，100 表示至少有一项到了见效点
 */
function breakdownLevel(params) {
  const p = params || {};
  const keys = Object.keys(BREAKDOWN_MAX);
  let peak = 0;
  for (let i = 0; i < keys.length; i++) {
    const max = BREAKDOWN_MAX[keys[i]];
    const v = Number(p[keys[i]]) || 0;
    const ratio = Math.max(0, Math.min(1, v / max));
    if (ratio > peak) peak = ratio;
  }
  return Math.round(peak * 100);
}

/**
 * 汇总战绩
 * @param {Array<{humanRead: boolean, ocrPass: boolean}>} records 每轮记录
 * @returns {{total: number, separation: number, bothOk: number, bothFail: number, machineOnly: number, separationRate: number}}
 */
function summarize(records) {
  const list = Array.isArray(records) ? records : [];
  const result = {
    total: list.length,
    separation: 0,
    bothOk: 0,
    bothFail: 0,
    machineOnly: 0,
    separationRate: 0,
  };
  for (const r of list) {
    const kind = classify(!!r.humanRead, !!r.ocrPass);
    if (kind === 'separation') result.separation++;
    else if (kind === 'both-ok') result.bothOk++;
    else if (kind === 'machine-only') result.machineOnly++;
    else result.bothFail++;
  }
  result.separationRate = result.total ? result.separation / result.total : 0;
  return result;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createImage: createImage,
    cloneImage: cloneImage,
    mulberry32: mulberry32,
    toGrayscale: toGrayscale,
    reduceContrast: reduceContrast,
    blur: blur,
    addNoise: addNoise,
    waveWarp: waveWarp,
    sliceShift: sliceShift,
    strokeBreak: strokeBreak,
    applyPipeline: applyPipeline,
    normalizeText: normalizeText,
    similarity: similarity,
    judgeOcr: judgeOcr,
    classify: classify,
    breakdownLevel: breakdownLevel,
    summarize: summarize,
  };
}

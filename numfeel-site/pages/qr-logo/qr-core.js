/**
 * qr-core.js — 二维码结构、覆盖结算、码字归并
 *
 * 纯计算，不碰 DOM、不依赖 canvas，便于单独测试。
 * 浏览器里挂到 window.QRCore，Node 测试里用 require 取。
 */

/* 每个版本的数据码字总数（ISO/IEC 18004 表 9），仅用于自检 */
const SPEC_TOTAL_CODEWORDS = [
  26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581, 655,
  733, 815, 901, 991, 1085, 1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921,
  2051, 2185, 2323, 2465, 2611, 2761, 2876, 3034, 3196, 3362, 3532, 3706
];

/* 标准公布的名义容错比例（占码字总数的经验值） */
const NOMINAL = { L: 0.07, M: 0.15, Q: 0.25, H: 0.30 };

/**
 * 由模块边长反推版本号。
 * @param {number} size 模块边长（= version * 4 + 17）
 * @returns {number} 版本号 1–40
 */
function versionOf(size) {
  return (size - 17) / 4;
}

/**
 * 校正图形中心坐标表（附录 E 算法；version 32 是历史遗留的特例）。
 * @param {number} version 版本号
 * @returns {number[]} 升序坐标，v1 为空数组
 */
function alignPositions(version) {
  if (version === 1) return [];
  const size = version * 4 + 17;
  const num = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((size - 13) / (num * 2 - 2)) * 2;
  const pos = [6];
  for (let i = num - 1; i >= 1; i--) pos.push(size - 7 - (num - 1 - i) * step);
  return pos.sort((a, b) => a - b);
}

/**
 * 生成功能图形地图：哪些模块是定位/时序/校正/格式/版本信息（碰不得）。
 * @param {number} size 模块边长
 * @returns {{fn: Uint8Array, apOwner: Int8Array, apList: Array<{r: number, c: number}>}}
 */
function structure(size) {
  const version = versionOf(size);
  const fn = new Uint8Array(size * size);
  const apOwner = new Int8Array(size * size).fill(-1);
  const mark = (r, c) => {
    if (r >= 0 && r < size && c >= 0 && c < size) fn[r * size + c] = 1;
  };
  const rect = (r0, c0, h, w) => {
    for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) mark(r, c);
  };

  // 三个定位图形（含分隔符，各 8×8）
  rect(0, 0, 8, 8);
  rect(0, size - 8, 8, 8);
  rect(size - 8, 0, 8, 8);

  // 横竖两条时序图形
  for (let i = 8; i < size - 8; i++) {
    mark(6, i);
    mark(i, 6);
  }

  // 校正图形（5×5），跳过与定位图形重叠的三处
  const pos = alignPositions(version);
  const last = size - 7;
  const apList = [];
  for (const r of pos) {
    for (const c of pos) {
      if ((r === 6 && c === 6) || (r === 6 && c === last) || (r === last && c === 6)) continue;
      const idx = apList.length;
      apList.push({ r, c });
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
          fn[rr * size + cc] = 1;
          apOwner[rr * size + cc] = idx;
        }
      }
    }
  }

  // 格式信息（围绕三个定位图形）
  for (let i = 0; i <= 8; i++) {
    mark(8, i);
    mark(i, 8);
  }
  for (let i = 0; i < 8; i++) {
    mark(8, size - 1 - i);
    mark(size - 1 - i, 8);
  }
  mark(size - 8, 8); // 固定黑模块

  // 版本信息（v7 起才有）
  if (version >= 7) {
    rect(0, size - 11, 6, 3);
    rect(size - 11, 0, 3, 6);
  }

  return { fn, apOwner, apList, version };
}

/**
 * 走位：按标准从右下角两列一组蛇形排布，给每个数据模块分配比特序号。
 * 一个码字 = 连续的 8 个比特，因此模块号 >> 3 就是它所属的码字。
 * @param {number} size 模块边长
 * @param {Uint8Array} fn 功能图形地图
 * @returns {{order: Int32Array, dataModules: number, totalCodewords: number}}
 */
function placement(size, fn) {
  const order = new Int32Array(size * size).fill(-1);
  let bit = 0;
  let up = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // 竖向时序图形整列跳过
    for (let v = 0; v < size; v++) {
      const r = up ? size - 1 - v : v;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (fn[r * size + c]) continue;
        order[r * size + c] = bit++;
      }
    }
    up = !up;
  }
  return { order, dataModules: bit, totalCodewords: Math.floor(bit / 8) };
}

/**
 * Logo 覆盖结算：盖住了多少模块，其中多少是功能图形、压到了哪几个校正图形。
 * @param {number} size 模块边长
 * @param {number} pct Logo 边长占符号边长的百分比
 * @param {object} struct structure() 的返回值
 * @param {'rect'|'circle'} [shape] 形状，默认方形
 * @returns {{side: number, cover: Uint8Array, covered: number, fnModules: number, apHit: number[]}}
 */
function coverage(size, pct, struct, shape) {
  const form = shape || 'rect';
  const side = (size * pct) / 100;
  const half = side / 2;
  const cover = new Uint8Array(size * size);
  const apHit = new Set();
  let covered = 0;
  let fnModules = 0;
  if (side <= 0) return { side: 0, cover, covered: 0, fnModules: 0, apHit: [] };

  for (let r = 0; r < size; r++) {
    const dr = r + 0.5 - size / 2;
    if (Math.abs(dr) > half) continue;
    for (let c = 0; c < size; c++) {
      const dc = c + 0.5 - size / 2;
      if (Math.abs(dc) > half) continue;
      if (form === 'circle' && dr * dr + dc * dc > half * half) continue;
      const i = r * size + c;
      cover[i] = 1;
      covered++;
      if (struct.fn[i]) {
        fnModules++;
        if (struct.apOwner[i] >= 0) apHit.add(struct.apOwner[i]);
      }
    }
  }
  return { side, cover, covered, fnModules, apHit: [...apHit] };
}

/**
 * 实测翻转：逐模块取亮度，和原始矩阵比对，数出真正被改掉的位。
 * 采样函数由调用方提供，因此这里不依赖 canvas，可以喂假数据测试。
 * @param {number} size 模块边长
 * @param {Uint8Array} dark 原始矩阵，1 = 黑
 * @param {object} struct structure() 的返回值
 * @param {Int32Array} order placement() 给出的比特序号
 * @param {number} totalCw placement() 给出的码字总数
 * @param {(r: number, c: number) => number} sample 返回该模块中心的亮度 0–255
 * @returns {{flip: Uint8Array, flips: number, fnFlips: number, apFlips: number, cwDamaged: number, totalCw: number}}
 */
function measureFlips(size, dark, struct, order, totalCw, sample) {
  const flip = new Uint8Array(size * size);
  const cw = new Set();
  let flips = 0;
  let fnFlips = 0;
  let apFlips = 0;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const i = r * size + c;
      const b = order[i];
      const got = sample(r, c) < 128 ? 1 : 0;
      if (got === dark[i]) continue;
      flip[i] = 1;
      flips++;
      if (struct.fn[i]) {
        if (struct.apOwner[i] >= 0) apFlips++;
        else fnFlips++;
      } else if (b >= 0) {
        cw.add(b >> 3);
      }
    }
  }

  return { flip, flips, fnFlips, apFlips, cwDamaged: cw.size, totalCw };
}

/**
 * 名义预算占用：受损码字占比 ÷ 该等级公布的容错比例。
 * 超过 1 表示「按标准的保守说法已经爆表」。
 * @param {string} level 'L' | 'M' | 'Q' | 'H'
 * @param {number} cwDamaged 受损码字数
 * @param {number} totalCw 数据码字总数
 * @returns {{ratio: number, nominal: number, damagedRatio: number}}
 */
function budgetUsed(level, cwDamaged, totalCw) {
  const nominal = NOMINAL[level] || NOMINAL.H;
  const damagedRatio = totalCw > 0 ? cwDamaged / totalCw : 0;
  return { ratio: damagedRatio / nominal, nominal, damagedRatio };
}

/**
 * 裁到画布上的 Logo 几何：给定边长与形状，返回是否覆盖某模块中心。
 * 仅供测试与外部复核，正常渲染走 coverage()。
 * @param {number} size 模块边长
 * @param {number} pct 百分比
 * @param {'rect'|'circle'} shape
 * @param {number} r 行
 * @param {number} c 列
 * @returns {boolean}
 */
function hitsModule(size, pct, shape, r, c) {
  const half = (size * pct) / 200;
  const dr = r + 0.5 - size / 2;
  const dc = c + 0.5 - size / 2;
  if (shape === 'circle') return dr * dr + dc * dc <= half * half;
  return Math.abs(dr) <= half && Math.abs(dc) <= half;
}

const API = {
  SPEC_TOTAL_CODEWORDS,
  NOMINAL,
  versionOf,
  alignPositions,
  structure,
  placement,
  coverage,
  measureFlips,
  budgetUsed,
  hitsModule
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
}
if (typeof window !== 'undefined') {
  window.QRCore = API;
}

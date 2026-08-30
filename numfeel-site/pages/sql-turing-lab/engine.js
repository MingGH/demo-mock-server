/**
 * SQL 图灵完备实验室 — 纯逻辑引擎
 * 所有函数均不操作 DOM，可被 Node 单元测试直接 require。
 * 浏览器端通过 <script src="engine.js"> 加载，挂载到 window.SQLTuringEngine。
 */
(function (global) {
  'use strict';

  /**
   * 把浮点数格式化成稳定的 SQL 字面量，避免 JS 浮点误差（如 0.1+0.2）。
   * @param {number} x
   * @returns {string|number}
   */
  function fmtNum(x) {
    if (Number.isInteger(x)) return x;
    const s = parseFloat(x.toPrecision(12));
    return s;
  }

  /**
   * Demo 1：构建「递归 CTE 计数」SQL。
   * @param {number} n - 从 1 数到 n
   * @returns {string} SQL
   */
  function buildCounterSQL(n) {
    const limit = Math.max(1, Math.floor(Number(n) || 1));
    return `WITH RECURSIVE t(i) AS (
  SELECT 1::INTEGER AS i
  UNION ALL
  SELECT i + 1 FROM t WHERE i < ${limit}
)
SELECT * FROM t ORDER BY i`;
  }

  /**
   * Demo 1：解析计数结果行。
   * @param {Array<{i:number|bigint}>} rows
   * @returns {number[]}
   */
  function parseCounterRows(rows) {
    return (rows || []).map((r) => Number(r.i));
  }

  /**
   * Demo 2：构建「曼德博集合」SQL（单条递归 CTE，网格 + 迭代全在 SQL 里）。
   * @param {number} width - 横向像素数
   * @param {number} height - 纵向像素数
   * @param {number} maxIter - 最大迭代次数
   * @param {number} xmin - 复平面实部下限
   * @param {number} xmax - 复平面实部上限
   * @param {number} ymin - 复平面虚部下限
   * @param {number} ymax - 复平面虚部上限
   * @returns {string} SQL
   */
  function buildMandelbrotSQL(width, height, maxIter, xmin, xmax, ymin, ymax) {
    const w = Math.max(2, Math.floor(Number(width) || 60));
    const h = Math.max(2, Math.floor(Number(height) || 40));
    const it = Math.max(1, Math.floor(Number(maxIter) || 30));
    const sx = fmtNum((xmax - xmin) / (w - 1));
    const sy = fmtNum((ymax - ymin) / (h - 1));
    const x0 = fmtNum(xmin);
    const y0 = fmtNum(ymin);
    return `WITH RECURSIVE mandel(px, py, cr, ci, zr, zi, iter) AS (
  SELECT px, py,
         ${x0} + px::DOUBLE * ${sx},
         ${y0} + py::DOUBLE * ${sy},
         0.0, 0.0, 0
  FROM range(0, ${w}) AS t(px), range(0, ${h}) AS t(py)
  UNION ALL
  SELECT px, py, cr, ci,
         zr * zr - zi * zi + cr,
         2 * zr * zi + ci,
         iter + 1
  FROM mandel
  WHERE zr * zr + zi * zi < 4.0 AND iter < ${it}
)
SELECT px::INTEGER AS px, py::INTEGER AS py, max(iter)::INTEGER AS it
FROM mandel
GROUP BY px, py
ORDER BY py, px`;
  }

  /**
   * Demo 2：解析曼德博结果行，输出按行展开的迭代次数数组。
   * @param {Array<{px:number,py:number,it:number}>} rows
   * @param {number} width
   * @param {number} height
   * @returns {Int32Array} 长度 width*height，索引 = py*width+px，值 0..maxIter
   */
  function parseMandelbrotRows(rows, width, height) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    const out = new Int32Array(w * h);
    for (const r of rows || []) {
      const px = Number(r.px);
      const py = Number(r.py);
      if (px >= 0 && px < w && py >= 0 && py < h) {
        out[py * w + px] = Number(r.it);
      }
    }
    return out;
  }

  /**
   * Demo 2：曼德博迭代次数（JS 参考实现，供单元测试对照 SQL 结果）。
   * 语义与 SQL 一致：z=0 起步，每次 z=z^2+c 后判断是否逃逸（|z|^2>4）。
   * @param {number} cr
   * @param {number} ci
   * @param {number} maxIter
   * @returns {number} 逃逸时的迭代次数；未逃逸返回 maxIter
   */
  function mandelbrotIterations(cr, ci, maxIter) {
    let zr = 0;
    let zi = 0;
    for (let i = 0; i < maxIter; i++) {
      const nzr = zr * zr - zi * zi + cr;
      const nzi = 2 * zr * zi + ci;
      zr = nzr;
      zi = nzi;
      if (zr * zr + zi * zi > 4) return i + 1;
    }
    return maxIter;
  }

  /**
   * Demo 2：把迭代次数映射成 RGB 颜色。
   * @param {number} iter - 0..maxIter
   * @param {number} maxIter
   * @returns {[number,number,number]} RGB 三元组
   */
  function escapeColor(iter, maxIter) {
    if (iter >= maxIter) return [6, 8, 26];
    const t = iter / Math.max(1, maxIter);
    const stops = [
      [0, [10, 22, 64]],
      [0.2, [30, 80, 160]],
      [0.45, [70, 160, 200]],
      [0.7, [200, 190, 90]],
      [1, [240, 200, 60]],
    ];
    let i = 0;
    while (i < stops.length - 1 && t > stops[i + 1][0]) i++;
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    const k = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
    return [
      Math.round(c0[0] + (c1[0] - c0[0]) * k),
      Math.round(c0[1] + (c1[1] - c0[1]) * k),
      Math.round(c0[2] + (c1[2] - c0[2]) * k),
    ];
  }

  /**
   * 去重细胞列表（相同坐标只保留一个）。
   * @param {Array<{x:number,y:number}>} cells
   * @returns {Array<{x:number,y:number}>}
   */
  function dedupeCells(cells) {
    const seen = new Set();
    const out = [];
    for (const c of cells || []) {
      const x = Math.floor(Number(c.x));
      const y = Math.floor(Number(c.y));
      const key = x + ',' + y;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ x, y });
      }
    }
    return out;
  }

  /**
   * Demo 3：构建生命游戏棋盘初始化 SQL。
   * @param {Array<{x:number,y:number}>} cells - 初始活细胞
   * @returns {string} SQL
   */
  function buildLifeSetupSQL(cells) {
    const list = dedupeCells(cells)
      .map((c) => `(${c.x}, ${c.y})`)
      .join(', ');
    if (!list) {
      return `CREATE OR REPLACE TABLE board AS
SELECT * FROM (VALUES (0, 0)) AS b(x, y) WHERE false`;
    }
    return `CREATE OR REPLACE TABLE board AS
SELECT * FROM (VALUES ${list}) AS b(x, y)`;
  }

  /**
   * Demo 3：生命游戏演化一代的 SQL（每条 SQL = 一帧游戏逻辑）。
   * @returns {string} SQL
   */
  function buildLifeNextSQL() {
    return `WITH cells AS (
  SELECT x, y FROM board
),
neighbors AS (
  SELECT x + dx AS nx, y + dy AS ny
  FROM cells
  CROSS JOIN (VALUES (-1::INTEGER), (0), (1)) AS dx(dx)
  CROSS JOIN (VALUES (-1::INTEGER), (0), (1)) AS dy(dy)
  WHERE NOT (dx = 0 AND dy = 0)
),
counts AS (
  SELECT nx AS x, ny AS y, count(*) AS n
  FROM neighbors
  GROUP BY nx, ny
)
SELECT c.x, c.y
FROM counts c
WHERE c.n = 3
   OR (c.n = 2 AND EXISTS (SELECT 1 FROM board b WHERE b.x = c.x AND b.y = c.y))
ORDER BY c.y, c.x`;
  }

  /**
   * Demo 3：解析生命游戏结果行。
   * @param {Array<{x:number,y:number}>} rows
   * @returns {Array<{x:number,y:number}>}
   */
  function parseLifeRows(rows) {
    return (rows || []).map((r) => ({ x: Number(r.x), y: Number(r.y) }));
  }

  /**
   * Demo 3：生命游戏下一代（JS 参考实现，供单元测试对照 SQL 结果）。
   * @param {Array<{x:number,y:number}>} cells
   * @returns {Array<{x:number,y:number}>} 按 y,x 升序
   */
  function lifeNext(cells) {
    const src = dedupeCells(cells);
    const alive = new Set(src.map((c) => c.x + ',' + c.y));
    const counts = new Map();
    for (const c of src) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const key = c.x + dx + ',' + (c.y + dy);
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
    }
    const next = [];
    for (const [key, n] of counts) {
      if (n === 3 || (n === 2 && alive.has(key))) {
        const [x, y] = key.split(',').map(Number);
        next.push({ x, y });
      }
    }
    next.sort((a, b) => a.y - b.y || a.x - b.x);
    return next;
  }

  /**
   * 生命游戏经典预设图案。
   */
  const LIFE_PRESETS = {
    glider: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: -1 }, { x: 1, y: -2 }],
    blinker: [{ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }],
    // 标准脉冲星：13×13，48 细胞，周期 3
    pulsar: (function () {
      const cells = [];
      const rowY = [-6, -1, 1, 6];
      const rowX = [-4, -3, -2, 2, 3, 4];
      for (const y of rowY) {
        for (const x of rowX) cells.push({ x, y });
      }
      const colX = [-6, -1, 1, 6];
      const colY = [-4, -3, -2, 2, 3, 4];
      for (const x of colX) {
        for (const y of colY) cells.push({ x, y });
      }
      return cells;
    })(),
  };

  const api = {
    fmtNum,
    buildCounterSQL,
    parseCounterRows,
    buildMandelbrotSQL,
    parseMandelbrotRows,
    mandelbrotIterations,
    escapeColor,
    dedupeCells,
    buildLifeSetupSQL,
    buildLifeNextSQL,
    parseLifeRows,
    lifeNext,
    LIFE_PRESETS,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof global !== 'undefined' && global && typeof window !== 'undefined') {
    global.SQLTuringEngine = api;
  } else if (typeof globalThis !== 'undefined') {
    globalThis.SQLTuringEngine = api;
  }
})(typeof window !== 'undefined' ? window : this);

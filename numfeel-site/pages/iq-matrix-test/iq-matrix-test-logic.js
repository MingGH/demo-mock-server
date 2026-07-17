/**
 * 高智商矩阵推理测试 - 核心逻辑（与 DOM 解耦的纯函数）
 * 包含：矩阵题目随机生成、规则推导、选项与干扰项生成、N-back 序列与评分、常模与正态分布计算。
 * 运行测试：node pages/iq-matrix-test/iq-matrix-test.test.js
 */

var IQMatrixLogic = (function () {

  // ── 可复现随机数（mulberry32） ────────────────────────────
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seedFromString(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return hash;
  }

  // ── 属性域定义 ──────────────────────────────────────────
  var SHAPES = ['circle', 'square', 'triangle', 'diamond', 'star', 'cross'];
  var FILLS = ['solid', 'hollow', 'half'];
  var ROTATIONS = [0, 45, 90, 135, 180, 225, 270, 315];
  var SIZES = ['small', 'medium', 'large'];
  var POSITIONS = ['topleft', 'center', 'bottomright'];
  var COUNTS = [1, 2, 3, 4];

  var DOMAINS = {
    shape: SHAPES,
    fill: FILLS,
    rotation: ROTATIONS,
    size: SIZES,
    position: POSITIONS,
    count: COUNTS
  };

  var ATTR_KEYS = ['shape', 'fill', 'rotation', 'size', 'position', 'count'];

  // ── 难度 -> 规则数 ──────────────────────────────────────
  var LEVEL_NAMES = { 1: '入门', 2: '中等', 3: '困难' };

  function shuffleArr(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function pickRandom(arr, rng) {
    return arr[Math.floor(rng() * arr.length)];
  }

  function randomCell(rng) {
    var cell = {};
    ATTR_KEYS.forEach(function (k) {
      cell[k] = pickRandom(DOMAINS[k], rng);
    });
    return cell;
  }

  /**
   * 为指定难度生成一道矩阵题。
   * 规则模型：每条规则作用于一个属性，描述该属性沿行内列方向的演变。
   *   arithmetic：value(r,c) = domain[(startIdx_r + c * step) % len]，step 在所有行一致。
   *   combine：value(r,2) = domain[(idx(r,0) + idx(r,1)) % len]。
   * combine 使用模加法，避免非 2 次幂属性域上直接异或取模造成的分布偏差。
   * 非规则属性在全网格保持常量，避免干扰。
   * @param {number} level 1|2|3
   * @param {function} rng mulberry32 实例
   * @returns {object} {grid, answer, options, rules, explanation, level}
   */
  function generateQuestion(level, rng) {
    level = Math.max(1, Math.min(3, level | 0));
    var chosenAttrs = shuffleArr(ATTR_KEYS, rng).slice(0, level);

    var rules = chosenAttrs.map(function (attr) {
      var domain = DOMAINS[attr];
      var useCombine = rng() < 0.3;
      if (useCombine) {
        return { attr: attr, type: 'combine', step: 0 };
      }
      var maxStep = Math.max(1, domain.length - 1);
      var step = 1 + Math.floor(rng() * Math.min(2, maxStep));
      // 避免步长使整行恒等
      while (step % domain.length === 0) {
        step = 1 + Math.floor(rng() * Math.min(2, maxStep));
      }
      return { attr: attr, type: 'arithmetic', step: step };
    });

    // 非规则属性取常量
    var constants = {};
    ATTR_KEYS.forEach(function (attr) {
      if (chosenAttrs.indexOf(attr) === -1) {
        constants[attr] = pickRandom(DOMAINS[attr], rng);
      }
    });

    var grid = [];
    for (var r = 0; r < 3; r++) {
      var row = [];
      var startIdx = {};
      rules.forEach(function (rule) {
        startIdx[rule.attr] = Math.floor(rng() * DOMAINS[rule.attr].length);
      });

      for (var c = 0; c < 3; c++) {
        var cell = {};
        // 常量属性
        Object.keys(constants).forEach(function (k) { cell[k] = constants[k]; });
        // 规则属性
        rules.forEach(function (rule) {
          var domain = DOMAINS[rule.attr];
          if (rule.type === 'arithmetic') {
            var idx = (startIdx[rule.attr] + c * rule.step) % domain.length;
            cell[rule.attr] = domain[idx];
          } else {
            // combine：前两列自由随机，第三列在本行结束后由前两列模加得到
            if (c < 2) {
              cell[rule.attr] = domain[Math.floor(rng() * domain.length)];
            } else {
              cell[rule.attr] = null; // 占位
            }
          }
        });
        row.push(cell);
      }

      // combine 第二遍：第三列索引为前两列索引之和取模
      rules.forEach(function (rule) {
        if (rule.type === 'combine') {
          var domain = DOMAINS[rule.attr];
          var i0 = domain.indexOf(row[0][rule.attr]);
          var i1 = domain.indexOf(row[1][rule.attr]);
          row[2][rule.attr] = domain[(i0 + i1) % domain.length];
        }
      });

      grid.push(row);
    }

    var answer = cloneCell(grid[2][2]);
    var options = generateOptions(answer, rules, grid, rng);
    var explanation = buildExplanation(rules);

    return {
      grid: grid,
      answer: answer,
      options: options,
      rules: rules,
      explanation: explanation,
      level: level
    };
  }

  function cloneCell(cell) {
    var c = {};
    ATTR_KEYS.forEach(function (k) { c[k] = cell[k]; });
    return c;
  }

  /**
   * 生成 6 个选项（1 正确 + 5 干扰），全部唯一并打乱。
   * 干扰策略：破坏规则A、破坏规则B、全部偏移、方向相反、随机。
   */
  function generateOptions(answer, rules, grid, rng) {
    var correct = cloneCell(answer);
    var seen = {};
    var keyify = function (cell) {
      return ATTR_KEYS.map(function (k) { return cell[k]; }).join('|');
    };
    var result = [];
    var addUnique = function (cell) {
      var k = keyify(cell);
      if (!seen[k]) { seen[k] = true; result.push(cell); return true; }
      return false;
    };
    addUnique(correct);

    var mutate = function (cell, attr, delta) {
      var domain = DOMAINS[attr];
      var cur = domain.indexOf(cell[attr]);
      var next = ((cur + delta) % domain.length + domain.length) % domain.length;
      var c = cloneCell(cell);
      c[attr] = domain[next];
      return c;
    };

    // 候选池
    var candidates = [];

    // 破坏每条规则（各偏移 ±1 / ±2）
    rules.forEach(function (rule) {
      candidates.push(mutate(correct, rule.attr, 1));
      candidates.push(mutate(correct, rule.attr, -1));
      candidates.push(mutate(correct, rule.attr, 2));
    });

    // 全部规则偏移
    var allShift = cloneCell(correct);
    rules.forEach(function (rule) {
      allShift = mutate(allShift, rule.attr, 1);
    });
    candidates.push(allShift);

    // 方向相反：对第一条算术规则用 -2*step
    if (rules.length > 0) {
      var firstRule = rules[0];
      if (firstRule.type === 'arithmetic') {
        candidates.push(mutate(correct, firstRule.attr, -2 * firstRule.step));
      } else {
        candidates.push(mutate(correct, firstRule.attr, 2));
      }
    }

    // 随机若干
    for (var i = 0; i < 6; i++) {
      candidates.push(randomCell(rng));
    }

    // 从候选池挑满 5 个干扰项
    for (var j = 0; j < candidates.length && result.length < 6; j++) {
      addUnique(candidates[j]);
    }

    // 兜底：还不够就继续随机
    var guard = 0;
    while (result.length < 6 && guard < 200) {
      addUnique(randomCell(rng));
      guard++;
    }

    return shuffleArr(result, rng);
  }

  function buildExplanation(rules) {
    var labels = {
      count: '图形数量',
      rotation: '旋转角度',
      shape: '形状',
      fill: '填充方式',
      size: '图形大小',
      position: '元素位置'
    };
    var parts = rules.map(function (rule) {
      var label = labels[rule.attr] || rule.attr;
      if (rule.type === 'combine') {
        return label + '由每行前两格组合决定';
      }
      if (rule.attr === 'rotation') {
        return '每格顺时针旋转 ' + (rule.step * 45) + '°';
      }
      return label + '按固定步长循环变化';
    });
    if (parts.length === 1) return parts[0];
    return '规则叠加：' + parts.join('；');
  }

  /**
   * 生成一组测试题：3 个难度 × 3 题 = 9 题
   */
  function generateTestSet(rng) {
    var set = [];
    for (var lvl = 1; lvl <= 3; lvl++) {
      for (var i = 0; i < 3; i++) {
        set.push(generateQuestion(lvl, rng));
      }
    }
    return set;
  }

  // ── SVG 渲染 ────────────────────────────────────────────
  var CELL_BG = '#1b2440';
  var SHAPE_COLOR = '#d4d4d4';

  function shapeMarkup(shape, s) {
    // s = 缩放半径基准
    switch (shape) {
      case 'circle':
        return '<circle r="' + s + '" />';
      case 'square':
        return '<rect x="' + (-s) + '" y="' + (-s) + '" width="' + (2 * s) + '" height="' + (2 * s) + '" rx="3" />';
      case 'triangle':
        return '<polygon points="0,' + (-s) + ' ' + s + ',' + s + ' ' + (-s) + ',' + s + '" />';
      case 'diamond':
        return '<polygon points="0,' + (-s) + ' ' + s + ',0 0,' + s + ' ' + (-s) + ',0" />';
      case 'star':
        return starPoints(s);
      case 'cross':
        return crossPath(s);
      default:
        return '<circle r="' + s + '" />';
    }
  }

  function starPoints(r) {
    var pts = [];
    for (var i = 0; i < 10; i++) {
      var ang = (Math.PI / 5) * i - Math.PI / 2;
      var rad = (i % 2 === 0) ? r : r * 0.45;
      pts.push((rad * Math.cos(ang)).toFixed(2) + ',' + (rad * Math.sin(ang)).toFixed(2));
    }
    return '<polygon points="' + pts.join(' ') + '" />';
  }

  function crossPath(r) {
    var t = r * 0.35;
    return '<path d="M ' + (-t) + ' ' + (-r) + ' L ' + t + ' ' + (-r) + ' L ' + t + ' ' + (-t) +
      ' L ' + r + ' ' + (-t) + ' L ' + r + ' ' + t + ' L ' + t + ' ' + t +
      ' L ' + t + ' ' + r + ' L ' + (-t) + ' ' + r + ' L ' + (-t) + ' ' + t +
      ' L ' + (-r) + ' ' + t + ' L ' + (-r) + ' ' + (-t) + ' L ' + (-t) + ' ' + (-t) + ' Z" />';
  }

  /**
   * 将 cell 渲染为内嵌 SVG 字符串。
   * @param {object} cell
   * @param {number} box 绘制区域边长（px）
   * @returns {string} SVG
   */
  function renderCellSVG(cell, box) {
    box = box || 100;
    var count = cell.count;
    var shape = cell.shape;
    var fill = cell.fill;
    var rot = cell.rotation;
    var sizeScale = cell.size === 'small' ? 0.6 : (cell.size === 'large' ? 1.05 : 0.82);
    var baseR = 16 * sizeScale;

    // 位置偏移
    var px = 0, py = 0;
    if (cell.position === 'topleft') { px = -16; py = -16; }
    else if (cell.position === 'bottomright') { px = 16; py = 16; }

    // 多图形布局
    var layouts = {
      1: [[0, 0]],
      2: [[-baseR, 0], [baseR, 0]],
      3: [[0, -baseR], [-baseR, baseR * 0.7], [baseR, baseR * 0.7]],
      4: [[-baseR, -baseR], [baseR, -baseR], [-baseR, baseR], [baseR, baseR]]
    };
    var pts = layouts[count] || layouts[1];

    var fillAttr, strokeAttr;
    if (fill === 'solid') {
      fillAttr = 'fill="' + SHAPE_COLOR + '" stroke="none"';
    } else if (fill === 'hollow') {
      fillAttr = 'fill="none" stroke="' + SHAPE_COLOR + '" stroke-width="2.5"';
    } else {
      fillAttr = 'fill="' + SHAPE_COLOR + '" stroke="none"';
    }

    var inner = '';
    for (var i = 0; i < pts.length; i++) {
      var cx = pts[i][0], cy = pts[i][1];
      var group = '<g transform="translate(' + (cx + px) + ',' + (cy + py) + ') rotate(' + rot + ')">';
      group += '<g ' + fillAttr + '>' + shapeMarkup(shape, baseR) + '</g>';
      if (fill === 'half') {
        // 用背景色矩形遮住上半，实现半填充（随形状一起旋转）
        group += '<rect x="-' + (baseR + 4) + '" y="-' + (baseR + 4) + '" width="' + (2 * baseR + 8) + '" height="' + (baseR + 4) + '" fill="' + CELL_BG + '" />';
      }
      group += '</g>';
      inner += group;
    }

    return '<svg viewBox="0 0 ' + box + ' ' + box + '" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="' + box + '" height="' + box + '" rx="8" fill="' + CELL_BG + '" />' +
      '<g transform="translate(' + (box / 2) + ',' + (box / 2) + ')">' + inner + '</g>' +
      '</svg>';
  }

  // ── N-back ──────────────────────────────────────────────
  /**
   * 生成 N-back 序列。
   * @param {number} n 2|3
   * @param {number} total 序列长度
   * @param {function} rng
   * @returns {{positions:number[], matches:boolean[], n:number}}
   */
  function generateNBackSequence(n, total, rng) {
    var positions = [];
    var matches = [];
    var matchTarget = 0.3;
    for (var i = 0; i < total; i++) {
      if (i < n) {
        positions.push(1 + Math.floor(rng() * 9));
        matches.push(false);
        continue;
      }
      var wantMatch = rng() < matchTarget;
      // 防止连续 3 次 match
      if (wantMatch && i >= 2 && matches[i - 1] && matches[i - 2]) {
        wantMatch = false;
      }
      if (wantMatch) {
        positions.push(positions[i - n]);
        matches.push(true);
      } else {
        var p;
        do { p = 1 + Math.floor(rng() * 9); } while (p === positions[i - n]);
        positions.push(p);
        matches.push(false);
      }
    }
    return { positions: positions, matches: matches, n: n };
  }

  /**
   * 评分 N-back
   * @param {object} seq generateNBackSequence 返回值
   * @param {boolean[]} responses 用户每个位置是否按「相同」
   */
  function scoreNBack(seq, responses) {
    var hit = 0, miss = 0, fa = 0, cr = 0, omissions = 0;
    var start = seq.n;
    var end = Math.min(seq.positions.length, responses.length);
    for (var i = start; i < end; i++) {
      var response = responses[i];
      if (response === null || response === undefined) {
        omissions++;
        continue;
      }
      var isMatch = seq.matches[i];
      var said = !!response;
      if (isMatch && said) hit++;
      else if (isMatch && !said) miss++;
      else if (!isMatch && said) fa++;
      else cr++;
    }
    var total = hit + miss + fa + cr + omissions;
    var accuracy = total > 0 ? (hit + cr) / total : 0;
    return { hit: hit, miss: miss, fa: fa, cr: cr, omissions: omissions, accuracy: accuracy, total: total };
  }

  // ── 常模 & 正态分布 ─────────────────────────────────────
  var NORMS = {
    matrixReasoning: {
      general: { mean: 0.50, sd: 0.15 },
      highIQ: { mean: 0.78, sd: 0.10 },
      genius: { mean: 0.92, sd: 0.05 }
    },
    reactionTime: {
      general: { mean: 18000, sd: 6000 },
      highIQ: { mean: 11000, sd: 3000 }
    },
    workingMemory: {
      general: { mean: 0.62, sd: 0.12 },
      highIQ: { mean: 0.82, sd: 0.08 }
    }
  };

  function normalPDF(x, mean, sd) {
    var z = (x - mean) / sd;
    return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
  }

  function erf(x) {
    // Abramowitz & Steun 7.1.26 近似
    var t = 1 / (1 + 0.3275911 * Math.abs(x));
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return x >= 0 ? y : -y;
  }

  function normalCDF(x, mean, sd) {
    return 0.5 * (1 + erf((x - mean) / (sd * Math.SQRT2)));
  }

  /** 在某人群分布中所处百分位（0~1） */
  function percentileRank(value, mean, sd) {
    return normalCDF(value, mean, sd);
  }

  // ── 得分计算 ────────────────────────────────────────────
  /**
   * @param {Array<{correct:boolean, reactionTime:number}>} results
   */
  function computeMatrixScore(results) {
    var len = results.length;
    var correct = 0, sumRT = 0, sumCorrectRT = 0;
    for (var i = 0; i < len; i++) {
      var reactionTime = Number(results[i].reactionTime);
      if (!Number.isFinite(reactionTime) || reactionTime < 0) reactionTime = 0;
      if (results[i].correct) {
        correct++;
        sumCorrectRT += reactionTime;
      }
      sumRT += reactionTime;
    }
    return {
      accuracy: len ? correct / len : 0,
      avgRT: len ? sumRT / len : 0,
      avgCorrectRT: correct ? sumCorrectRT / correct : 30000,
      correct: correct,
      total: len
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * 计算本站挑战综合分。矩阵正确率占 50%，工作记忆占 40%，答对题速度占 10%。
   * 速度分乘以矩阵正确率，防止快速盲猜获得额外收益。
   * @param {{accuracy:number,avgCorrectRT:number,correct:number}} matrixScore 矩阵成绩
   * @param {number} nbackAccuracy N-back 正确率（0~1）
   * @returns {{score:number,components:{matrix:number,workingMemory:number,speed:number,effectiveSpeed:number}}}
   */
  function computeOverallScore(matrixScore, nbackAccuracy) {
    var matrix = clamp(Number(matrixScore.accuracy) * 100 || 0, 0, 100);
    var workingMemory = clamp(Number(nbackAccuracy) * 100 || 0, 0, 100);
    var reactionTime = matrixScore.correct > 0 ? Number(matrixScore.avgCorrectRT) : 30000;
    if (!Number.isFinite(reactionTime)) reactionTime = 30000;
    var speed = clamp((30000 - reactionTime) / 29000 * 100, 0, 100);
    var effectiveSpeed = speed * matrix / 100;
    return {
      score: Math.round(matrix * 0.5 + workingMemory * 0.4 + effectiveSpeed * 0.1),
      components: {
        matrix: matrix,
        workingMemory: workingMemory,
        speed: speed,
        effectiveSpeed: effectiveSpeed
      }
    };
  }

  /** 旧版参考模型概要，仅保留用于兼容已有调用；不代表标准化 IQ 常模。 */
  function summarizePerformance(matrixScore, nbackAccuracy) {
    var matrixPct = percentileRank(matrixScore.accuracy, NORMS.matrixReasoning.general.mean, NORMS.matrixReasoning.general.sd);
    var rtPct = 1 - percentileRank(matrixScore.avgCorrectRT, NORMS.reactionTime.general.mean, NORMS.reactionTime.general.sd);
    var wmPct = percentileRank(nbackAccuracy, NORMS.workingMemory.general.mean, NORMS.workingMemory.general.sd);
    return {
      matrixPercentile: matrixPct,
      reactionPercentile: rtPct,
      wmPercentile: wmPct,
      overall: (matrixPct + rtPct + wmPct) / 3
    };
  }

  // 导出
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      mulberry32: mulberry32,
      seedFromString: seedFromString,
      generateQuestion: generateQuestion,
      generateTestSet: generateTestSet,
      generateOptions: generateOptions,
      buildExplanation: buildExplanation,
      renderCellSVG: renderCellSVG,
      generateNBackSequence: generateNBackSequence,
      scoreNBack: scoreNBack,
      NORMS: NORMS,
      normalPDF: normalPDF,
      normalCDF: normalCDF,
      erf: erf,
      percentileRank: percentileRank,
      computeMatrixScore: computeMatrixScore,
      computeOverallScore: computeOverallScore,
      summarizePerformance: summarizePerformance,
      LEVEL_NAMES: LEVEL_NAMES,
      DOMAINS: DOMAINS,
      ATTR_KEYS: ATTR_KEYS
    };
  }

  return {
    mulberry32: mulberry32,
    seedFromString: seedFromString,
    generateQuestion: generateQuestion,
    generateTestSet: generateTestSet,
    generateOptions: generateOptions,
    buildExplanation: buildExplanation,
    renderCellSVG: renderCellSVG,
    generateNBackSequence: generateNBackSequence,
    scoreNBack: scoreNBack,
    NORMS: NORMS,
    normalPDF: normalPDF,
    normalCDF: normalCDF,
    erf: erf,
    percentileRank: percentileRank,
    computeMatrixScore: computeMatrixScore,
    computeOverallScore: computeOverallScore,
    summarizePerformance: summarizePerformance,
    LEVEL_NAMES: LEVEL_NAMES,
    DOMAINS: DOMAINS,
    ATTR_KEYS: ATTR_KEYS
  };
})();

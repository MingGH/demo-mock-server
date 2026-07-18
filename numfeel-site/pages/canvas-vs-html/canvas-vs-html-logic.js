/**
 * Canvas vs HTML/CSS 能力对决 - 核心逻辑（与 DOM 解耦的纯函数）
 * 包含：特性对比数据、代码复杂度计量、性能模拟、评分计算
 * 运行测试：node pages/canvas-vs-html/canvas-vs-html.test.js
 */

var CanvasVsHtmlLogic = (function () {

  // ── 特性对比数据 ─────────────────────────────────────────
  // 每个特性包含: id, name, category, htmlSupport, canvasSupport, verdict, detail
  // support: 'native'(原生) | 'partial'(有限) | 'manual'(需手写) | 'none'(无法实现)
  var FEATURES = [
    {
      id: 'text-select',
      name: '文字选中与复制',
      category: 'accessibility',
      htmlSupport: 'native',
      canvasSupport: 'manual',
      codeRatio: 50, // Canvas 实现代码量是 HTML 的倍数
      verdict: 'HTML 原生支持，Canvas 需要手写选区追踪、光标渲染、剪贴板 API 集成',
      detail: '浏览器原生文字选中涉及 Selection API、Range、双击选词、三击选段，Canvas 需全部从零实现'
    },
    {
      id: 'screen-reader',
      name: '屏幕阅读器支持',
      category: 'accessibility',
      htmlSupport: 'native',
      canvasSupport: 'none',
      codeRatio: Infinity,
      verdict: 'Canvas 内容对辅助技术完全不可见，无法通过 ARIA 补救画布内的像素',
      detail: 'HTML 语义标签自动构建无障碍树(Accessibility Tree)，屏幕阅读器能遍历所有内容'
    },
    {
      id: 'keyboard-nav',
      name: '键盘导航与焦点管理',
      category: 'accessibility',
      htmlSupport: 'native',
      canvasSupport: 'manual',
      codeRatio: 30,
      verdict: 'HTML 的 Tab 序列、焦点环、skip link 全是免费的；Canvas 得自建焦点系统',
      detail: '浏览器自动管理 tabindex、焦点样式、表单导航，Canvas 无法利用这些机制'
    },
    {
      id: 'responsive',
      name: '响应式布局',
      category: 'layout',
      htmlSupport: 'native',
      canvasSupport: 'manual',
      codeRatio: 20,
      verdict: 'CSS Flexbox/Grid + 媒体查询 vs 手算坐标 + resize 监听全量重绘',
      detail: 'CSS 布局引擎处理百分比、min/max、断点，Canvas 的每个元素位置都需要手动计算'
    },
    {
      id: 'text-wrap',
      name: '文本自动换行与排版',
      category: 'layout',
      htmlSupport: 'native',
      canvasSupport: 'manual',
      codeRatio: 40,
      verdict: 'CSS 的 word-wrap、hyphenation、text-align vs Canvas.measureText + 手动断行',
      detail: '多语言换行规则(CJK不同于拉丁)、连字符、两端对齐——浏览器文本引擎几十年迭代的成果'
    },
    {
      id: 'scroll',
      name: '滚动与溢出处理',
      category: 'layout',
      htmlSupport: 'native',
      canvasSupport: 'manual',
      codeRatio: 25,
      verdict: 'overflow: auto 一行搞定 vs 自建虚拟滚动系统',
      detail: '原生滚动有惯性、滚动条样式、scroll-snap、平滑滚动、触摸适配'
    },
    {
      id: 'hover-states',
      name: '悬停/聚焦/激活状态',
      category: 'interaction',
      htmlSupport: 'native',
      canvasSupport: 'manual',
      codeRatio: 8,
      verdict: 'CSS :hover/:focus/:active 伪类 vs hit-testing + 状态机 + 重绘调度',
      detail: 'Canvas 需要为每个交互区域维护边界数据，做逐帧碰撞检测'
    },
    {
      id: 'form-validation',
      name: '表单验证',
      category: 'interaction',
      htmlSupport: 'native',
      canvasSupport: 'manual',
      codeRatio: 35,
      verdict: 'HTML5 required/pattern/type 验证 vs 从输入框到错误提示全部手写',
      detail: '浏览器内置 email/url/number 验证、自定义 validity、约束验证 API'
    },
    {
      id: 'animation',
      name: 'CSS 动画与过渡',
      category: 'interaction',
      htmlSupport: 'native',
      canvasSupport: 'manual',
      codeRatio: 5,
      verdict: 'transition/animation 声明式 vs requestAnimationFrame 命令式循环',
      detail: 'CSS 动画由合成线程驱动不阻塞主线程，Canvas 动画全在主线程'
    },
    {
      id: 'seo',
      name: '搜索引擎索引',
      category: 'ecosystem',
      htmlSupport: 'native',
      canvasSupport: 'none',
      codeRatio: Infinity,
      verdict: '爬虫能读 HTML 内容，Canvas 像素对搜索引擎完全不可见',
      detail: 'Google/百度爬虫解析 DOM 文本和语义标签，Canvas 内容不会被索引'
    },
    {
      id: 'i18n',
      name: '浏览器翻译/查找',
      category: 'ecosystem',
      htmlSupport: 'native',
      canvasSupport: 'none',
      codeRatio: Infinity,
      verdict: 'Ctrl+F 查找、右键翻译、浏览器自动翻译——全部只对 DOM 文本生效',
      detail: 'Chrome 翻译功能遍历 DOM 文本节点替换，Canvas 绘制的文字不在 DOM 中'
    },
    {
      id: 'devtools',
      name: 'DevTools 调试',
      category: 'ecosystem',
      htmlSupport: 'native',
      canvasSupport: 'partial',
      codeRatio: 3,
      verdict: 'Elements 面板直接审查每个 DOM 节点 vs Canvas 只能看到一个 <canvas> 元素',
      detail: '可以实时修改 CSS 属性、查看 computed styles、触发伪类，Canvas 没有对等能力'
    }
  ];

  // ── 分类数据 ─────────────────────────────────────────────
  var CATEGORIES = {
    accessibility: { name: '无障碍与可访问性', icon: 'ti-accessible', color: '#ff6b6b' },
    layout: { name: '布局与排版', icon: 'ti-layout', color: '#ffd700' },
    interaction: { name: '交互与动效', icon: 'ti-click', color: '#81c784' },
    ecosystem: { name: '生态与工具链', icon: 'ti-world', color: '#90caf9' }
  };

  // ── Canvas 擅长的场景 ────────────────────────────────────
  var CANVAS_STRENGTHS = [
    {
      id: 'particles',
      name: '粒子系统',
      reason: '上万同质元素的批量渲染，DOM 节点开销太大',
      typical: '烟花、雪花、星空背景、流体模拟'
    },
    {
      id: 'charts',
      name: '数据可视化图表',
      reason: '高密度像素操作 + 自定义渲染管线，超出 SVG 性能上限',
      typical: '百万点散点图、热力图、K线图'
    },
    {
      id: 'games',
      name: '游戏与实时渲染',
      reason: '逐帧全量重绘 + 精灵图批处理 + WebGL 加速',
      typical: '2D platformer、弹幕射击、物理引擎可视化'
    },
    {
      id: 'image-edit',
      name: '图像处理',
      reason: '像素级读写(getImageData/putImageData)，CSS 无法操作单个像素',
      typical: '滤镜、抠图、截图、水印、图片压缩'
    },
    {
      id: 'drawing',
      name: '绘图与白板',
      reason: '自由曲线、笔压感应、无限画布——HTML 元素无法表达',
      typical: '电子签名、涂鸦板、标注工具'
    }
  ];

  // ── 代码复杂度对比数据 ───────────────────────────────────
  // 实现一个带 hover 效果的圆角卡片按钮
  var CODE_COMPARISON = {
    task: '实现一个带 hover 变色、圆角、阴影、文字居中的可点击按钮',
    html: {
      lines: 12,
      code: '<button class="card-btn">Click me</button>\n\n.card-btn {\n  padding: 12px 24px;\n  border-radius: 8px;\n  background: #4a90d9;\n  color: white;\n  border: none;\n  cursor: pointer;\n  box-shadow: 0 2px 8px rgba(0,0,0,0.2);\n  transition: background 0.2s;\n}\n.card-btn:hover { background: #357abd; }'
    },
    canvas: {
      lines: 85,
      code: '// Canvas 实现需要:\n// 1. 绘制圆角矩形 (手写贝塞尔曲线)\n// 2. 绘制阴影 (ctx.shadowBlur)\n// 3. 绘制居中文本 (measureText + 手算位置)\n// 4. 鼠标 hit-testing (判断坐标是否在按钮内)\n// 5. hover 状态管理 (mousemove + 状态变量)\n// 6. 重绘调度 (requestAnimationFrame)\n// 7. 点击事件处理 (click + 坐标判定)\n// 8. 焦点管理 (tabindex + 自绘焦点环)\n\nfunction drawRoundRect(ctx, x, y, w, h, r) {\n  ctx.beginPath();\n  ctx.moveTo(x + r, y);\n  ctx.arcTo(x + w, y, x + w, y + h, r);\n  ctx.arcTo(x + w, y + h, x, y + h, r);\n  ctx.arcTo(x, y + h, x, y, r);\n  ctx.arcTo(x, y, x + w, y, r);\n  ctx.closePath();\n}\n\nvar btn = { x: 50, y: 50, w: 160, h: 44, r: 8, hovered: false };\n\nfunction isInside(mx, my) {\n  return mx >= btn.x && mx <= btn.x + btn.w &&\n         my >= btn.y && my <= btn.y + btn.h;\n}\n\ncanvas.addEventListener("mousemove", function(e) {\n  var rect = canvas.getBoundingClientRect();\n  var wasHovered = btn.hovered;\n  btn.hovered = isInside(e.clientX - rect.left, e.clientY - rect.top);\n  if (wasHovered !== btn.hovered) render();\n});\n\ncanvas.addEventListener("click", function(e) {\n  var rect = canvas.getBoundingClientRect();\n  if (isInside(e.clientX - rect.left, e.clientY - rect.top)) {\n    handleClick();\n  }\n});\n\nfunction render() {\n  ctx.clearRect(0, 0, canvas.width, canvas.height);\n  ctx.shadowColor = "rgba(0,0,0,0.2)";\n  ctx.shadowBlur = 8;\n  ctx.shadowOffsetY = 2;\n  ctx.fillStyle = btn.hovered ? "#357abd" : "#4a90d9";\n  drawRoundRect(ctx, btn.x, btn.y, btn.w, btn.h, btn.r);\n  ctx.fill();\n  ctx.shadowBlur = 0;\n  ctx.fillStyle = "white";\n  ctx.font = "16px sans-serif";\n  ctx.textAlign = "center";\n  ctx.textBaseline = "middle";\n  ctx.fillText("Click me", btn.x + btn.w/2, btn.y + btn.h/2);\n}'
    }
  };

  // ── 性能基准模拟 ─────────────────────────────────────────
  /**
   * 模拟不同元素数量下 DOM vs Canvas 的性能表现
   * 基于经验数据建模：
   * - DOM: 少量元素时快(增量更新)，大量元素时性能下降(重排成本)
   * - Canvas: 固定开销较高(全量重绘)，但不随元素数线性增长
   * @param {number} elementCount 元素数量
   * @returns {object} { dom: fps, canvas: fps, crossover: boolean }
   */
  function simulatePerformance(elementCount) {
    // DOM: 基础60fps，增量更新在少量元素时非常高效
    // 大量元素时重排/重绘成本飙升（指数级下降）
    var domFps = Math.max(5, 60 * Math.exp(-elementCount / 3000));
    
    // Canvas: 批量渲染，起步有固定开销(全帧重绘)导致少量元素时比 DOM 慢
    // 但大量同质元素时只是增加 draw call，性能下降非常缓慢(对数级)
    var canvasFps = Math.max(15, 55 - 4.5 * Math.log10(Math.max(1, elementCount)));
    
    // 交叉点：约500-1500个元素时 Canvas 开始胜出
    var crossover = canvasFps > domFps;
    
    return {
      dom: Math.round(domFps * 10) / 10,
      canvas: Math.round(canvasFps * 10) / 10,
      crossover: crossover,
      elementCount: elementCount
    };
  }

  /**
   * 生成性能对比数据系列
   * @param {number[]} counts 元素数量数组
   * @returns {object[]} 每个数量对应的性能数据
   */
  function generatePerformanceSeries(counts) {
    return counts.map(simulatePerformance);
  }

  // 默认测试数据点
  var DEFAULT_COUNTS = [10, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 50000];

  /**
   * 计算特性评分汇总
   * @returns {object} { htmlScore, canvasScore, categories }
   */
  function computeFeatureScores() {
    var supportScore = { native: 3, partial: 2, manual: 1, none: 0 };
    var htmlTotal = 0;
    var canvasTotal = 0;
    var maxTotal = FEATURES.length * 3;
    var catScores = {};

    FEATURES.forEach(function (f) {
      htmlTotal += supportScore[f.htmlSupport];
      canvasTotal += supportScore[f.canvasSupport];

      if (!catScores[f.category]) {
        catScores[f.category] = { html: 0, canvas: 0, count: 0 };
      }
      catScores[f.category].html += supportScore[f.htmlSupport];
      catScores[f.category].canvas += supportScore[f.canvasSupport];
      catScores[f.category].count++;
    });

    // 归一化到百分比
    Object.keys(catScores).forEach(function (cat) {
      var c = catScores[cat];
      var max = c.count * 3;
      c.htmlPct = Math.round((c.html / max) * 100);
      c.canvasPct = Math.round((c.canvas / max) * 100);
    });

    return {
      htmlScore: Math.round((htmlTotal / maxTotal) * 100),
      canvasScore: Math.round((canvasTotal / maxTotal) * 100),
      htmlTotal: htmlTotal,
      canvasTotal: canvasTotal,
      maxTotal: maxTotal,
      categories: catScores
    };
  }

  /**
   * 计算代码复杂度比率
   * @returns {object} { ratio, htmlLines, canvasLines, task }
   */
  function getCodeComplexity() {
    return {
      ratio: Math.round(CODE_COMPARISON.canvas.lines / CODE_COMPARISON.html.lines * 10) / 10,
      htmlLines: CODE_COMPARISON.html.lines,
      canvasLines: CODE_COMPARISON.canvas.lines,
      task: CODE_COMPARISON.task
    };
  }

  /**
   * 获取指定分类下的特性列表
   * @param {string} categoryId
   * @returns {object[]}
   */
  function getFeaturesByCategory(categoryId) {
    return FEATURES.filter(function (f) { return f.category === categoryId; });
  }

  /**
   * 获取所有分类 ID
   * @returns {string[]}
   */
  function getCategoryIds() {
    return Object.keys(CATEGORIES);
  }

  /**
   * 找到性能交叉点（Canvas 开始优于 DOM 的元素数量）
   * 使用二分查找
   * @returns {number} 交叉点元素数量
   */
  function findCrossoverPoint() {
    var lo = 1, hi = 100000;
    while (hi - lo > 1) {
      var mid = Math.floor((lo + hi) / 2);
      var perf = simulatePerformance(mid);
      if (perf.crossover) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    return hi;
  }

  /**
   * 生成综合评估结论
   * @returns {object} { summary, recommendation, scores }
   */
  function generateVerdict() {
    var scores = computeFeatureScores();
    var crossover = findCrossoverPoint();
    var complexity = getCodeComplexity();

    return {
      summary: 'Canvas 在 UI 特性评分上仅获得 ' + scores.canvasScore + '% (HTML: ' + scores.htmlScore + '%)。' +
               '实现同一个按钮，Canvas 代码量是 HTML 的 ' + complexity.ratio + ' 倍。' +
               '性能交叉点在约 ' + crossover + ' 个同质元素时出现。',
      recommendation: crossover > 500
        ? '日常 UI 用 HTML/CSS，大量同质元素渲染用 Canvas，混合架构最优'
        : '几乎所有场景 Canvas 都更优（模型异常）',
      scores: scores,
      crossover: crossover,
      complexity: complexity
    };
  }

  // ── 导出 ─────────────────────────────────────────────────
  var exports = {
    FEATURES: FEATURES,
    CATEGORIES: CATEGORIES,
    CANVAS_STRENGTHS: CANVAS_STRENGTHS,
    CODE_COMPARISON: CODE_COMPARISON,
    DEFAULT_COUNTS: DEFAULT_COUNTS,
    simulatePerformance: simulatePerformance,
    generatePerformanceSeries: generatePerformanceSeries,
    computeFeatureScores: computeFeatureScores,
    getCodeComplexity: getCodeComplexity,
    getFeaturesByCategory: getFeaturesByCategory,
    getCategoryIds: getCategoryIds,
    findCrossoverPoint: findCrossoverPoint,
    generateVerdict: generateVerdict
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }
  if (typeof window !== 'undefined') {
    window.CanvasVsHtmlLogic = exports;
  }

  return exports;
})();

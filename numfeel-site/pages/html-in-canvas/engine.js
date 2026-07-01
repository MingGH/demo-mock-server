// ========== HTML-in-Canvas 演示 · 纯逻辑层 ==========
// 故意写成 ES5 风格（var / function），可在浏览器直接 <script> 引入，
// 也可在 Node 中 require 用于单元测试。

// ─────────────────────────────────────────────────────────
// 1. 浏览器特性检测：drawElementImage 是否真的可用
// ─────────────────────────────────────────────────────────
/**
 * 检测当前环境是否支持 HTML-in-Canvas 提案的核心 API。
 * 允许传入自定义的 canvas 工厂，便于在 Node 中 mock。
 *
 * @param {Function} [canvasFactory] 返回一个 canvas 对象，默认用 document.createElement
 * @returns {{drawElement: boolean, layoutSubtree: boolean, onpaint: boolean, supported: boolean}}
 */
function detectHtmlInCanvas(canvasFactory) {
  var result = {
    drawElement: false,
    layoutSubtree: false,
    onpaint: false,
    supported: false
  };

  try {
    var canvas;
    if (typeof canvasFactory === 'function') {
      canvas = canvasFactory();
    } else if (typeof document !== 'undefined') {
      canvas = document.createElement('canvas');
    } else {
      return result;
    }
    var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx) return result;

    result.drawElement = typeof ctx.drawElementImage === 'function';
    // layoutsubtree 属性反射到 DOM property
    result.layoutSubtree = ('layoutSubtree' in canvas) ||
      (typeof canvas.hasAttribute === 'function' && canvas.hasAttribute('layoutsubtree'));
    result.onpaint = ('onpaint' in canvas);
    // 只要核心绘制 API 存在就算可用，其余两项作为辅助
    result.supported = result.drawElement;
  } catch (e) {
    // 静默：任何抛错都视为不支持
  }
  return result;
}

// ─────────────────────────────────────────────────────────
// 2. 差异矩阵：每个 case 描述 html2canvas 的痛点
// ─────────────────────────────────────────────────────────
var DIFF_CASES = [
  {
    id: 'emoji',
    title: 'Emoji 渲染',
    html: '<div style="font-size:48px;padding:12px;">🎉 🍣 🌸 🍃 🚀 🌈</div>',
    legacyIssue: '系统 emoji 字体未注入 → 渲染成 □ 或单色字形',
    nativeWin: '复用浏览器排版引擎，彩色 emoji 与原生一致',
    severity: 'high'
  },
  {
    id: 'rtl',
    title: 'RTL 阿拉伯文',
    html: '<div dir="rtl" style="font-size:28px;padding:12px;font-family:serif;">السلام عليكم — 你好世界</div>',
    legacyIssue: 'fillText 不处理双向文本，标点位置与连字错乱',
    nativeWin: 'BiDi 完整支持，与浏览器排版同一套规则',
    severity: 'high'
  },
  {
    id: 'vertical',
    title: '竖排文字 writing-mode',
    html: '<div style="writing-mode:vertical-rl;height:140px;font-size:22px;padding:12px;">春风又绿江南岸</div>',
    legacyIssue: 'html2canvas 把竖排重排成水平，CJK 标点位置错误',
    nativeWin: 'writing-mode、text-orientation 全部按 CSS 规范输出',
    severity: 'medium'
  },
  {
    id: 'text-shadow',
    title: '多层 text-shadow',
    html: '<div style="font-size:42px;color:#fff;text-shadow:0 0 12px #c96b33,2px 2px 0 #88954a,-2px -2px 0 #fff;padding:12px;">霓 虹 字</div>',
    legacyIssue: '复杂 shadow 在 html2canvas 中位置/模糊半径与浏览器不一致',
    nativeWin: '阴影由 Blink 直接合成，像素级一致',
    severity: 'medium'
  },
  {
    id: 'backdrop-filter',
    title: 'backdrop-filter 毛玻璃',
    html: '<div style="position:relative;padding:18px;background:linear-gradient(135deg,#c96b33,#88954a);">' +
          '<div style="backdrop-filter:blur(8px) saturate(140%);background:rgba(255,255,255,0.18);padding:14px;border-radius:12px;color:#fff;">毛玻璃信用卡</div></div>',
    legacyIssue: 'html2canvas 完全不支持 backdrop-filter，输出为透明',
    nativeWin: '原生合成层直接采样，效果与页面一致',
    severity: 'critical'
  },
  {
    id: 'mix-blend',
    title: 'mix-blend-mode 叠加',
    html: '<div style="position:relative;height:120px;background:#c96b33;">' +
          '<span style="position:absolute;top:30px;left:24px;font-size:42px;color:#88954a;mix-blend-mode:difference;">叠加</span></div>',
    legacyIssue: '混合模式在 html2canvas 中被忽略 → 直出纯色',
    nativeWin: '逐层合成，输出与浏览器渲染一致',
    severity: 'high'
  },
  {
    id: 'filter',
    title: 'CSS filter 滤镜',
    html: '<div style="font-size:40px;padding:12px;color:#fff;background:#88954a;filter:hue-rotate(120deg) saturate(180%) drop-shadow(0 4px 8px rgba(0,0,0,0.5));">滤镜不丢</div>',
    legacyIssue: 'hue-rotate / saturate 等被 html2canvas 直接忽略',
    nativeWin: 'filter pipeline 复用 GPU 合成，所见即所得',
    severity: 'critical'
  },
  {
    id: 'form',
    title: '表单原生外观',
    html: '<form style="padding:12px;display:flex;flex-direction:column;gap:8px;">' +
          '<input type="text" value="可编辑输入" style="padding:8px;border:1px solid #c96b33;border-radius:6px;">' +
          '<select><option>选项 A</option><option>选项 B</option></select></form>',
    legacyIssue: '表单聚焦边框、原生下拉箭头、占位符样式经常错位或缺失',
    nativeWin: '直接复用浏览器表单 UA 样式，包括 focus ring',
    severity: 'medium'
  }
];

/**
 * 对一个差异 case 给出"通过/失败"判定。
 * 真实页面上是双跑后做像素 diff，这里抽象成一个可被测试的纯函数：
 * 我们假设 html2canvas 在某些"模式"上必然失败（已在社区被记录），
 * 而 drawElementImage 可用时全部通过。
 *
 * @param {string} caseId - DIFF_CASES 中的 id
 * @param {boolean} hasNativeApi - 当前浏览器是否支持 drawElementImage
 * @returns {{legacy: 'pass'|'fail'|'partial', native: 'pass'|'unknown'}}
 */
function judgeCase(caseId, hasNativeApi) {
  var legacyMatrix = {
    'emoji': 'partial',
    'rtl': 'fail',
    'vertical': 'fail',
    'text-shadow': 'partial',
    'backdrop-filter': 'fail',
    'mix-blend': 'fail',
    'filter': 'fail',
    'form': 'partial'
  };
  var legacy = legacyMatrix[caseId] || 'partial';
  var native = hasNativeApi ? 'pass' : 'unknown';
  return { legacy: legacy, native: native };
}

// ─────────────────────────────────────────────────────────
// 3. 粒子破碎物理：从一张位图采样出粒子，做一帧步进
// ─────────────────────────────────────────────────────────

/**
 * 从图像像素数组中采样粒子。
 * 步长越大 → 粒子越少越快。Alpha < 阈值 的像素被跳过。
 *
 * @param {Uint8ClampedArray} pixels - canvas getImageData().data
 * @param {number} width
 * @param {number} height
 * @param {number} step - 采样间隔（像素）
 * @returns {{x:Float32Array,y:Float32Array,vx:Float32Array,vy:Float32Array,r:Uint8Array,g:Uint8Array,b:Uint8Array,a:Uint8Array,life:Float32Array,count:number}}
 */
function sampleParticles(pixels, width, height, step) {
  step = step || 3;
  // 先粗略统计粒子数，避免数组扩容
  var count = 0;
  for (var sy = 0; sy < height; sy += step) {
    for (var sx = 0; sx < width; sx += step) {
      var ia = (sy * width + sx) * 4 + 3;
      if (pixels[ia] > 16) count++;
    }
  }

  var x = new Float32Array(count);
  var y = new Float32Array(count);
  var vx = new Float32Array(count);
  var vy = new Float32Array(count);
  var r = new Uint8Array(count);
  var g = new Uint8Array(count);
  var b = new Uint8Array(count);
  var a = new Uint8Array(count);
  var life = new Float32Array(count);

  var i = 0;
  for (var py = 0; py < height; py += step) {
    for (var px = 0; px < width; px += step) {
      var idx = (py * width + px) * 4;
      if (pixels[idx + 3] <= 16) continue;
      x[i] = px;
      y[i] = py;
      vx[i] = 0;
      vy[i] = 0;
      r[i] = pixels[idx];
      g[i] = pixels[idx + 1];
      b[i] = pixels[idx + 2];
      a[i] = pixels[idx + 3];
      life[i] = 1.0;
      i++;
    }
  }
  return { x: x, y: y, vx: vx, vy: vy, r: r, g: g, b: b, a: a, life: life, count: count };
}

/**
 * 给所有粒子一次性赋"爆破"初速度：从指定中心向外扩散。
 * 升级版：近中心冲击更猛（冲击波），叠加切向旋转与湍流，整体更炫。
 *
 * @param {object} particles - sampleParticles 的返回
 * @param {number} cx 爆破中心 x
 * @param {number} cy 爆破中心 y
 * @param {number} power 爆破强度（速度上限）
 * @param {Function} [rand] 自定义 [0,1) 随机源，便于测试可复现
 * @param {object} [opts]
 *   @param {number} [opts.swirl=0] 切向旋转强度（0=纯放射）
 *   @param {number} [opts.turbulence=1.5] 随机湍流幅度
 *   @param {number} [opts.lift=2] 整体上扬
 *   @param {number} [opts.radius] 冲击波半径（近中心加成的衰减尺度）
 */
function igniteParticles(particles, cx, cy, power, rand, opts) {
  rand = rand || Math.random;
  opts = opts || {};
  var swirl = opts.swirl == null ? 0 : opts.swirl;
  var turbulence = opts.turbulence == null ? 1.5 : opts.turbulence;
  var lift = opts.lift == null ? 2 : opts.lift;
  var radius = opts.radius == null ? 0 : opts.radius;
  var n = particles.count;
  for (var i = 0; i < n; i++) {
    var dx = particles.x[i] - cx;
    var dy = particles.y[i] - cy;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = dx / dist;
    var ny = dy / dist;
    // 冲击波：离中心越近，初速度越大（指数衰减）
    var shock = 1;
    if (radius > 0) {
      shock = 0.5 + 1.5 * Math.exp(-dist / radius);
    }
    var force = power * shock * (0.6 + rand() * 0.8);
    // 切向分量（旋转）：法向量旋转 90°
    var tx = -ny;
    var ty = nx;
    particles.vx[i] = nx * force + tx * swirl * (0.5 + rand()) + (rand() - 0.5) * turbulence;
    particles.vy[i] = ny * force + ty * swirl * (0.5 + rand()) - rand() * lift;
  }
}

/**
 * 推进一帧粒子物理：速度更新位置，加重力，加阻尼，缩寿命。
 *
 * @param {object} particles
 * @param {number} dt - 时间步长，建议 1（按帧步进）
 * @param {object} [opts]
 *   @param {number} [opts.gravity=0.18]
 *   @param {number} [opts.damping=0.985]
 *   @param {number} [opts.decay=0.012]
 * @returns {number} 仍存活的粒子数
 */
function stepParticles(particles, dt, opts) {
  opts = opts || {};
  var gravity = opts.gravity == null ? 0.18 : opts.gravity;
  var damping = opts.damping == null ? 0.985 : opts.damping;
  var decay = opts.decay == null ? 0.012 : opts.decay;
  dt = dt == null ? 1 : dt;
  var alive = 0;
  var n = particles.count;
  for (var i = 0; i < n; i++) {
    if (particles.life[i] <= 0) continue;
    particles.vy[i] += gravity * dt;
    particles.vx[i] *= damping;
    particles.vy[i] *= damping;
    particles.x[i] += particles.vx[i] * dt;
    particles.y[i] += particles.vy[i] * dt;
    particles.life[i] -= decay * dt;
    if (particles.life[i] > 0) alive++;
  }
  return alive;
}

// ─────────────────────────────────────────────────────────
// 4. 海报模板：用同一份 HTML 同时喂给 html2canvas 与新 API
// ─────────────────────────────────────────────────────────
var POSTER_TEMPLATES = [
  {
    id: 'festival',
    name: '节气海报',
    note: 'Emoji + text-shadow + 圆角头像',
    html:
      '<div style="width:340px;padding:28px;border-radius:24px;color:#fff;font-family:\'PingFang SC\',sans-serif;' +
      'background:radial-gradient(circle at 30% 20%,rgba(255,255,255,0.18),transparent 50%),linear-gradient(135deg,#c96b33,#88954a);">' +
      '<div style="display:flex;align-items:center;gap:12px;">' +
      '<div style="width:48px;height:48px;border-radius:50%;background:#f2e4cf;color:#241812;display:flex;align-items:center;justify-content:center;font-size:24px;">小</div>' +
      '<div><div style="font-size:14px;opacity:0.8;">数字直觉 · 春日特辑</div><div style="font-size:18px;font-weight:700;">@小数 · 关注</div></div></div>' +
      '<div style="margin-top:18px;font-size:32px;font-weight:800;text-shadow:0 2px 0 rgba(0,0,0,0.18),0 0 20px rgba(255,255,255,0.18);">🌸 春日观察 🍃</div>' +
      '<p style="margin-top:12px;font-size:14px;line-height:1.7;opacity:0.92;">梨花风起正清明，游子寻春半出城。emoji、阴影、圆角同框，看谁先翻车。</p>' +
      '</div>'
  },
  {
    id: 'invoice',
    name: '订单分享卡',
    note: 'backdrop-filter + 渐变文字',
    html:
      '<div style="width:340px;padding:24px;border-radius:24px;font-family:\'PingFang SC\',sans-serif;' +
      'background:linear-gradient(135deg,#3a1f12,#1a120d);color:#f2e4cf;position:relative;overflow:hidden;">' +
      '<div style="position:absolute;inset:0;background:radial-gradient(circle at 80% 20%,rgba(201,107,51,0.45),transparent 60%);"></div>' +
      '<div style="position:relative;">' +
      '<div style="font-size:12px;letter-spacing:0.2em;opacity:0.7;">ORDER · #20260612</div>' +
      '<div style="font-size:28px;font-weight:800;margin-top:6px;background:linear-gradient(90deg,#ffd9a8,#88954a);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">¥ 1,288.00</div>' +
      '<div style="margin-top:14px;padding:14px;border-radius:14px;background:rgba(242,228,207,0.08);backdrop-filter:blur(10px) saturate(160%);">' +
      '<div style="font-size:13px;opacity:0.78;">毛玻璃背景能否还原？html2canvas 直接漏底。</div></div>' +
      '</div></div>'
  },
  {
    id: 'danmu',
    name: '弹幕封面',
    note: 'mix-blend-mode 多层叠加',
    html:
      '<div style="width:340px;height:200px;position:relative;border-radius:24px;overflow:hidden;color:#fff;' +
      'background:radial-gradient(circle at 20% 30%,#c96b33,transparent 50%),radial-gradient(circle at 80% 70%,#88954a,transparent 50%),#120d0a;">' +
      '<div style="position:absolute;top:24px;left:24px;font-size:30px;font-weight:800;mix-blend-mode:screen;color:#fff;">看 · 弹 · 幕</div>' +
      '<div style="position:absolute;bottom:24px;right:24px;font-size:24px;mix-blend-mode:difference;color:#ffd700;">满 屏 飞</div>' +
      '<div style="position:absolute;top:84px;left:60px;font-size:18px;mix-blend-mode:overlay;color:#88954a;">混合模式不能丢</div>' +
      '</div>'
  },
  {
    id: 'invite',
    name: '邀请码',
    note: 'drop-shadow + 复杂排版',
    html:
      '<div style="width:340px;padding:24px;border-radius:24px;background:#f2e4cf;color:#241812;font-family:\'PingFang SC\',sans-serif;">' +
      '<div style="font-size:13px;letter-spacing:0.2em;color:#88954a;">数字直觉 · 邀请</div>' +
      '<h2 style="margin:8px 0 4px;font-size:26px;">把这页发给你那个不信邪的朋友</h2>' +
      '<p style="font-size:13px;color:#3a1f12;opacity:0.7;line-height:1.7;">他要是看不到 backdrop-filter，就让他换 Canary。</p>' +
      '<div style="margin-top:16px;display:flex;align-items:center;gap:14px;">' +
      '<div style="width:96px;height:96px;border-radius:18px;background:repeating-conic-gradient(#241812 0 25%,#f2e4cf 0 50%);filter:drop-shadow(0 6px 14px rgba(36,24,18,0.32));"></div>' +
      '<div><div style="font-size:13px;color:#88954a;">INVITE</div><div style="font-size:22px;font-weight:800;letter-spacing:0.12em;">RUN-2026</div></div>' +
      '</div></div>'
  },
  {
    id: 'cover',
    name: '视频封面',
    note: 'filter:hue-rotate + saturate',
    html:
      '<div style="width:340px;height:200px;border-radius:24px;overflow:hidden;position:relative;' +
      'filter:hue-rotate(30deg) saturate(140%) contrast(110%);">' +
      '<div style="position:absolute;inset:0;background:linear-gradient(45deg,#c96b33,#88954a,#f2e4cf);"></div>' +
      '<div style="position:absolute;inset:0;background:radial-gradient(circle at 70% 30%,rgba(255,255,255,0.6),transparent 50%);"></div>' +
      '<div style="position:absolute;left:24px;bottom:24px;color:#fff;font-family:\'PingFang SC\',sans-serif;">' +
      '<div style="font-size:12px;letter-spacing:0.2em;opacity:0.86;">EPISODE 03</div>' +
      '<div style="font-size:28px;font-weight:800;text-shadow:0 2px 12px rgba(0,0,0,0.45);">滤镜也别丢</div></div></div>'
  }
];

// ─────────────────────────────────────────────────────────
// 5. 工具：把 0..1 严重度映射为可读文字 / 颜色 hint
// ─────────────────────────────────────────────────────────
/**
 * @param {'pass'|'fail'|'partial'|'unknown'} status
 * @returns {{label:string, tone:'good'|'bad'|'warn'|'mute'}}
 */
function statusToLabel(status) {
  switch (status) {
    case 'pass': return { label: '通过', tone: 'good' };
    case 'fail': return { label: '失败', tone: 'bad' };
    case 'partial': return { label: '部分还原', tone: 'warn' };
    case 'unknown': return { label: '需 Canary 验证', tone: 'mute' };
    default: return { label: '未知', tone: 'mute' };
  }
}

// ─────────────────────────────────────────────────────────
// 模块导出
// ─────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    detectHtmlInCanvas: detectHtmlInCanvas,
    DIFF_CASES: DIFF_CASES,
    judgeCase: judgeCase,
    sampleParticles: sampleParticles,
    igniteParticles: igniteParticles,
    stepParticles: stepParticles,
    POSTER_TEMPLATES: POSTER_TEMPLATES,
    statusToLabel: statusToLabel
  };
}

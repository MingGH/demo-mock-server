/**
 * browser-fingerprint.test.js
 * 测试浏览器指纹核心算法（Node.js 可直接运行）
 * node pages/browser-fingerprint.test.js
 */

let passed = 0;
let failed = 0;

function assert(desc, condition) {
  if (condition) {
    console.log('  ✓', desc);
    passed++;
  } else {
    console.error('  ✗', desc);
    failed++;
  }
}

// ── 模拟浏览器 API ────────────────────────────────────────────────────────
const { createCanvas } = (() => {
  // 轻量 canvas mock，不依赖 node-canvas
  return {
    createCanvas: (w, h) => ({
      width: w, height: h,
      getContext: () => ({
        textBaseline: '',
        font: '',
        fillStyle: '',
        fillRect: () => {},
        fillText: () => {},
        measureText: (s) => ({ width: s.length * 8 }), // 固定宽度 mock
        toDataURL: () => 'data:image/png;base64,mock=='
      }),
      toDataURL: () => 'data:image/png;base64,mock=='
    })
  };
})();

// ── 被测函数（从页面提取，去掉 DOM 依赖） ────────────────────────────────

function getFontListMock(testFonts, mockWidths) {
  // mockWidths: { fontName: width } 模拟不同字体渲染宽度
  const baseW = 104; // monospace 基准宽度
  return testFonts.filter(font => (mockWidths[font] || baseW) !== baseW);
}

const ENTROPY_MAP = [
  { name: 'Canvas 指纹',   bits: 11.2 },
  { name: 'WebGL 渲染器',  bits: 8.6  },
  { name: '字体列表',      bits: 7.8  },
  { name: '屏幕分辨率',    bits: 4.8  },
  { name: '时区',          bits: 3.9  },
  { name: '音频指纹',      bits: 3.4  },
  { name: '语言',          bits: 2.7  },
  { name: '操作系统平台',  bits: 2.3  },
  { name: '硬件并发数',    bits: 2.1  },
  { name: '设备内存',      bits: 1.8  },
  { name: '像素比',        bits: 1.5  },
  { name: '色深',          bits: 1.2  },
  { name: '触控支持',      bits: 0.9  },
];

function calcTotalEntropy(map) {
  return map.reduce((s, v) => s + v.bits, 0);
}

function calcUniqueCount(entropyBits) {
  return Math.pow(2, Math.round(entropyBits));
}

// ── 测试套件 ──────────────────────────────────────────────────────────────

console.log('\n[1] 字体检测逻辑');
{
  const fonts = ['Arial', 'SimSun', 'Helvetica'];
  const mockWidths = { 'Arial': 112, 'SimSun': 120 }; // Helvetica 未安装，宽度同 monospace
  const detected = getFontListMock(fonts, mockWidths);
  assert('检测到 Arial（宽度不同）', detected.includes('Arial'));
  assert('检测到 SimSun（宽度不同）', detected.includes('SimSun'));
  assert('未检测到 Helvetica（宽度相同）', !detected.includes('Helvetica'));
  assert('返回数组长度为 2', detected.length === 2);
}

console.log('\n[2] 熵值计算');
{
  const total = calcTotalEntropy(ENTROPY_MAP);
  assert('总熵值大于 40 bits', total > 40);
  assert('总熵值小于 70 bits', total < 70);
  assert('Canvas 指纹熵值最高', ENTROPY_MAP[0].bits === Math.max(...ENTROPY_MAP.map(v => v.bits)));
  assert('触控支持熵值最低', ENTROPY_MAP[ENTROPY_MAP.length - 1].bits === Math.min(...ENTROPY_MAP.map(v => v.bits)));
  assert('熵值条目数为 13', ENTROPY_MAP.length === 13);
}

console.log('\n[3] 唯一性计算');
{
  const total = calcTotalEntropy(ENTROPY_MAP);
  const unique = calcUniqueCount(total);
  assert('唯一性大于 100万', unique > 1e6);
  assert('唯一性是 2 的整数次幂', Math.log2(unique) % 1 === 0);
  // 20 bits = 1048576 ≈ 100万
  assert('20 bits 对应约 100万', calcUniqueCount(20) === 1048576);
}

console.log('\n[4] Hash 截断显示');
{
  function shortHash(h) { return h ? h.substring(0, 16) + '...' : 'N/A'; }
  const fakeHash = 'a'.repeat(64);
  const short = shortHash(fakeHash);
  assert('截断后长度为 19（16 + ...）', short.length === 19);
  assert('末尾是 ...', short.endsWith('...'));
  assert('null 返回 N/A', shortHash(null) === 'N/A');
}

console.log('\n[5] 屏幕信息格式');
{
  function buildScreenInfo(w, h, depth) {
    return w + 'x' + h + '@' + depth + 'bit';
  }
  assert('1920x1080@24bit 格式正确', buildScreenInfo(1920, 1080, 24) === '1920x1080@24bit');
  assert('包含 x 分隔符', buildScreenInfo(1280, 720, 32).includes('x'));
  assert('包含 @ 分隔符', buildScreenInfo(1280, 720, 32).includes('@'));
}

console.log('\n[6] 后端 payload 结构验证');
{
  function buildPayload(fullHash, canvasHash, fontHash, webglHash, opts) {
    return {
      fullHash, canvasHash, fontHash, webglHash,
      screenInfo: opts.screenInfo,
      timezone: opts.tz,
      language: opts.lang,
      platform: opts.platform,
      hardwareConcurrency: opts.hwc,
      deviceMemory: opts.mem,
      touchSupport: opts.touch,
      colorDepth: opts.colorDepth,
      pixelRatio: opts.pixelRatio,
      entropyBits: opts.entropyBits
    };
  }
  const payload = buildPayload('hash1', 'hash2', 'hash3', 'hash4', {
    screenInfo: '1920x1080@24bit', tz: 'Asia/Shanghai', lang: 'zh-CN',
    platform: 'MacIntel', hwc: 8, mem: 16, touch: false,
    colorDepth: 24, pixelRatio: 2, entropyBits: 52.2
  });
  assert('payload 包含 fullHash', 'fullHash' in payload);
  assert('payload 包含 timezone', 'timezone' in payload);
  assert('payload 包含 entropyBits', 'entropyBits' in payload);
  assert('entropyBits 是数字', typeof payload.entropyBits === 'number');
  assert('touchSupport 是布尔', typeof payload.touchSupport === 'boolean');
}

// ── 结果 ──────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(40));
console.log(`结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);

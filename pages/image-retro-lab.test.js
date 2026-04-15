/**
 * 图片做旧实验室 - 单元测试
 * 运行: node pages/image-retro-lab.test.js
 */

const ImageRetroLabLogic = require('./image-retro-lab-logic.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || '断言失败');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `期望 ${expected}，实际 ${actual}`);
  }
}

function getUniqueColorKeys(pixels) {
  const set = new Set();
  for (let i = 0; i < pixels.length; i += 4) {
    set.add(`${pixels[i]}-${pixels[i + 1]}-${pixels[i + 2]}`);
  }
  return set;
}

console.log('\n🎨 图片做旧实验室 - 单元测试\n');

console.log('[样图生成]');
test('人像样图尺寸正确', () => {
  const pixels = ImageRetroLabLogic.generateSampleScene(160, 120, 'portrait');
  assertEqual(pixels.length, 160 * 120 * 4, '像素数组长度不正确');
});

test('夜街样图包含足够多的颜色', () => {
  const pixels = ImageRetroLabLogic.generateSampleScene(128, 128, 'street');
  const unique = ImageRetroLabLogic.countUniqueColors(pixels);
  assert(unique > 200, `夜街样图颜色过少：${unique}`);
});

test('海报样图完全不透明', () => {
  const pixels = ImageRetroLabLogic.generateSampleScene(96, 96, 'poster');
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] !== 255) {
      throw new Error('发现非 255 alpha 像素');
    }
  }
});

console.log('\n[调色板]');
test('固定调色板数量正确', () => {
  assertEqual(ImageRetroLabLogic.getFixedPalette('gameboy').length, 4, 'Game Boy 调色板应为 4 色');
  assertEqual(ImageRetroLabLogic.getFixedPalette('newspaper').length, 4, '黑白报纸调色板应为 4 色');
});

test('自适应调色板不会超出目标颜色数', () => {
  const pixels = ImageRetroLabLogic.generateSampleScene(96, 96, 'portrait');
  const palette = ImageRetroLabLogic.buildAdaptivePalette(pixels, 16);
  assert(palette.length > 0, '调色板不能为空');
  assert(palette.length <= 16, `调色板颜色超标：${palette.length}`);
});

console.log('\n[量化结果]');
test('固定调色板量化后只使用调色板中的颜色', () => {
  const pixels = ImageRetroLabLogic.generateSampleScene(96, 96, 'street');
  const result = ImageRetroLabLogic.quantizeImage(pixels, 96, 96, {
    colorCount: 4,
    dither: 'none',
    paletteId: 'gameboy'
  });
  const allowed = new Set(result.palette.map((color) => color.join('-')));
  const used = getUniqueColorKeys(result.pixels);
  used.forEach((key) => {
    assert(allowed.has(key), `输出中出现调色板之外的颜色：${key}`);
  });
});

test('Floyd-Steinberg 量化后颜色数不超过调色板大小', () => {
  const pixels = ImageRetroLabLogic.generateSampleScene(120, 120, 'poster');
  const result = ImageRetroLabLogic.quantizeImage(pixels, 120, 120, {
    colorCount: 8,
    dither: 'floyd-steinberg',
    paletteId: 'adaptive'
  });
  assert(result.stats.uniqueAfter <= result.palette.length, '输出颜色数不应超过调色板大小');
});

test('量化后颜色数明显下降', () => {
  const pixels = ImageRetroLabLogic.generateSampleScene(128, 128, 'portrait');
  const result = ImageRetroLabLogic.quantizeImage(pixels, 128, 128, {
    colorCount: 16,
    dither: 'ordered',
    paletteId: 'adaptive'
  });
  assert(result.stats.uniqueAfter <= 16, `输出颜色数应不超过 16，实际 ${result.stats.uniqueAfter}`);
  assert(result.stats.uniqueBefore > result.stats.uniqueAfter, '量化后颜色数应减少');
});

test('理论像素体积估算低于原始 RGB', () => {
  const pixels = ImageRetroLabLogic.generateSampleScene(128, 96, 'street');
  const result = ImageRetroLabLogic.quantizeImage(pixels, 128, 96, {
    colorCount: 16,
    dither: 'none',
    paletteId: 'adaptive'
  });
  assert(result.stats.indexedSizeBytes < result.stats.rawSizeBytes, '索引色理论体积应更小');
});

test('平均误差为非负数', () => {
  const pixels = ImageRetroLabLogic.generateSampleScene(80, 80, 'poster');
  const result = ImageRetroLabLogic.quantizeImage(pixels, 80, 80, {
    colorCount: 32,
    dither: 'floyd-steinberg',
    paletteId: 'adaptive'
  });
  assert(result.stats.meanAbsoluteError >= 0, '平均误差应为非负数');
  assert(result.stats.rmse >= 0, 'RMSE 应为非负数');
});

console.log('\n[接口]');
test('调色板预设列表包含 adaptive 和 warm-retro', () => {
  const presets = ImageRetroLabLogic.getPalettePresets().map((item) => item.id);
  assert(presets.includes('adaptive'), '缺少 adaptive');
  assert(presets.includes('warm-retro'), '缺少 warm-retro');
});

console.log(`\n结果：${passed} 通过，${failed} 失败\n`);
if (failed > 0) process.exit(1);

/**
 * image-retro-lab-logic.js
 * 图片做旧实验室的核心逻辑：调色板、颜色量化、抖动与样图生成。
 */

const ImageRetroLabLogic = (() => {
  const BAYER_4X4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ];

  const PALETTE_PRESETS = [
    { id: 'adaptive', name: '原图自适应', colors: null },
    {
      id: 'gameboy',
      name: 'Game Boy',
      colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f']
    },
    {
      id: 'warm-retro',
      name: '暖复古',
      colors: ['#2a1a12', '#6f3b28', '#b26a3d', '#d8a65a', '#f0d7a1', '#9d4539']
    },
    {
      id: 'cool-film',
      name: '冷胶片',
      colors: ['#101820', '#20313e', '#476072', '#6f8ba4', '#b8c7d9', '#d8e1eb']
    },
    {
      id: 'newspaper',
      name: '黑白报纸',
      colors: ['#161616', '#565656', '#a5a5a5', '#f2f2f2']
    },
    {
      id: 'vaporwave',
      name: '霓虹像素',
      colors: ['#120458', '#4b1d8f', '#ff2e88', '#ff99d7', '#32f6ff', '#fefefe']
    }
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16)
    ];
  }

  function rgbToInt(r, g, b) {
    return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
  }

  function getPalettePresets() {
    return PALETTE_PRESETS.map((preset) => ({
      id: preset.id,
      name: preset.name,
      size: preset.colors ? preset.colors.length : null
    }));
  }

  function getPresetById(paletteId) {
    return PALETTE_PRESETS.find((preset) => preset.id === paletteId) || PALETTE_PRESETS[0];
  }

  function getFixedPalette(paletteId) {
    const preset = getPresetById(paletteId);
    return preset.colors ? preset.colors.map(hexToRgb) : null;
  }

  function samplePixels(pixels, maxSamples) {
    const pixelCount = pixels.length / 4;
    const step = Math.max(1, Math.floor(pixelCount / maxSamples));
    const out = [];
    for (let i = 0; i < pixelCount; i += step) {
      const idx = i * 4;
      out.push([pixels[idx], pixels[idx + 1], pixels[idx + 2]]);
    }
    return out;
  }

  function computeChannelRange(colors) {
    let minR = 255, minG = 255, minB = 255;
    let maxR = 0, maxG = 0, maxB = 0;
    for (const color of colors) {
      if (color[0] < minR) minR = color[0];
      if (color[1] < minG) minG = color[1];
      if (color[2] < minB) minB = color[2];
      if (color[0] > maxR) maxR = color[0];
      if (color[1] > maxG) maxG = color[1];
      if (color[2] > maxB) maxB = color[2];
    }
    return {
      r: maxR - minR,
      g: maxG - minG,
      b: maxB - minB
    };
  }

  function averageColors(colors) {
    let r = 0, g = 0, b = 0;
    for (const color of colors) {
      r += color[0];
      g += color[1];
      b += color[2];
    }
    const size = colors.length || 1;
    return [
      Math.round(r / size),
      Math.round(g / size),
      Math.round(b / size)
    ];
  }

  function buildAdaptivePalette(pixels, targetCount) {
    const sampled = samplePixels(pixels, 6000);
    if (!sampled.length) {
      return [[0, 0, 0]];
    }

    let boxes = [sampled];
    while (boxes.length < targetCount) {
      let splitIndex = -1;
      let bestScore = -1;

      for (let i = 0; i < boxes.length; i++) {
        const bucket = boxes[i];
        if (bucket.length <= 1) continue;
        const range = computeChannelRange(bucket);
        const score = Math.max(range.r, range.g, range.b) * bucket.length;
        if (score > bestScore) {
          bestScore = score;
          splitIndex = i;
        }
      }

      if (splitIndex === -1) break;

      const bucket = boxes[splitIndex];
      const range = computeChannelRange(bucket);
      const axis = range.r >= range.g && range.r >= range.b ? 0 : (range.g >= range.b ? 1 : 2);
      const sorted = [...bucket].sort((a, b) => a[axis] - b[axis]);
      const mid = Math.floor(sorted.length / 2);
      const left = sorted.slice(0, mid);
      const right = sorted.slice(mid);

      boxes.splice(splitIndex, 1);
      if (left.length) boxes.push(left);
      if (right.length) boxes.push(right);
      if (!left.length || !right.length) break;
    }

    const palette = boxes.map(averageColors);
    const deduped = [];
    const seen = new Set();
    for (const color of palette) {
      const key = rgbToInt(color[0], color[1], color[2]);
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(color);
      }
    }
    return deduped.slice(0, targetCount);
  }

  function colorDistanceSq(a, b) {
    const dr = a[0] - b[0];
    const dg = a[1] - b[1];
    const db = a[2] - b[2];
    return dr * dr + dg * dg + db * db;
  }

  function findNearestColorIndex(color, palette) {
    let bestIndex = 0;
    let bestDist = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const dist = colorDistanceSq(color, palette[i]);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  function applyNoDither(pixels, width, height, palette) {
    const output = new Uint8ClampedArray(width * height * 4);
    const usage = new Array(palette.length).fill(0);

    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      const nearest = findNearestColorIndex([pixels[idx], pixels[idx + 1], pixels[idx + 2]], palette);
      const color = palette[nearest];
      output[idx] = color[0];
      output[idx + 1] = color[1];
      output[idx + 2] = color[2];
      output[idx + 3] = pixels[idx + 3];
      usage[nearest]++;
    }

    return { pixels: output, usage };
  }

  function getOrderedStrength(paletteSize) {
    return clamp(56 - paletteSize * 3.5, 10, 46);
  }

  function applyOrderedDither(pixels, width, height, palette) {
    const output = new Uint8ClampedArray(width * height * 4);
    const usage = new Array(palette.length).fill(0);
    const strength = getOrderedStrength(palette.length);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const threshold = (BAYER_4X4[y % 4][x % 4] / 15 - 0.5) * strength;
        const adjusted = [
          clamp(pixels[idx] + threshold, 0, 255),
          clamp(pixels[idx + 1] + threshold, 0, 255),
          clamp(pixels[idx + 2] + threshold, 0, 255)
        ];
        const nearest = findNearestColorIndex(adjusted, palette);
        const color = palette[nearest];
        output[idx] = color[0];
        output[idx + 1] = color[1];
        output[idx + 2] = color[2];
        output[idx + 3] = pixels[idx + 3];
        usage[nearest]++;
      }
    }

    return { pixels: output, usage };
  }

  function applyFloydSteinberg(pixels, width, height, palette) {
    const output = new Uint8ClampedArray(width * height * 4);
    const usage = new Array(palette.length).fill(0);
    const work = new Float32Array(width * height * 3);

    for (let i = 0, j = 0; i < pixels.length; i += 4, j += 3) {
      work[j] = pixels[i];
      work[j + 1] = pixels[i + 1];
      work[j + 2] = pixels[i + 2];
    }

    function addError(x, y, error, factor) {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const base = (y * width + x) * 3;
      work[base] = clamp(work[base] + error[0] * factor, 0, 255);
      work[base + 1] = clamp(work[base + 1] + error[1] * factor, 0, 255);
      work[base + 2] = clamp(work[base + 2] + error[2] * factor, 0, 255);
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const rgbaIdx = i * 4;
        const base = i * 3;
        const current = [work[base], work[base + 1], work[base + 2]];
        const nearest = findNearestColorIndex(current, palette);
        const color = palette[nearest];
        output[rgbaIdx] = color[0];
        output[rgbaIdx + 1] = color[1];
        output[rgbaIdx + 2] = color[2];
        output[rgbaIdx + 3] = pixels[rgbaIdx + 3];
        usage[nearest]++;

        const error = [
          current[0] - color[0],
          current[1] - color[1],
          current[2] - color[2]
        ];

        addError(x + 1, y, error, 7 / 16);
        addError(x - 1, y + 1, error, 3 / 16);
        addError(x, y + 1, error, 5 / 16);
        addError(x + 1, y + 1, error, 1 / 16);
      }
    }

    return { pixels: output, usage };
  }

  function countUniqueColors(pixels) {
    const seen = new Set();
    for (let i = 0; i < pixels.length; i += 4) {
      seen.add(rgbToInt(pixels[i], pixels[i + 1], pixels[i + 2]));
    }
    return seen.size;
  }

  function computeErrorStats(originalPixels, quantizedPixels) {
    let absError = 0;
    let sqError = 0;
    const totalChannels = (originalPixels.length / 4) * 3;
    for (let i = 0; i < originalPixels.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const delta = originalPixels[i + c] - quantizedPixels[i + c];
        absError += Math.abs(delta);
        sqError += delta * delta;
      }
    }
    return {
      meanAbsoluteError: absError / totalChannels,
      rmse: Math.sqrt(sqError / totalChannels)
    };
  }

  function estimateIndexedSizeBytes(width, height, paletteSize) {
    const bitsPerPixel = Math.max(1, Math.ceil(Math.log2(Math.max(2, paletteSize))));
    return Math.ceil(width * height * bitsPerPixel / 8) + paletteSize * 3;
  }

  function estimateRgbSizeBytes(width, height) {
    return width * height * 3;
  }

  function createPalette(pixels, options) {
    if (options.paletteId && options.paletteId !== 'adaptive') {
      return getFixedPalette(options.paletteId);
    }
    return buildAdaptivePalette(pixels, options.colorCount || 16);
  }

  function quantizeImage(pixels, width, height, options = {}) {
    const palette = createPalette(pixels, options);
    const dither = options.dither || 'none';
    let quantized;

    if (dither === 'floyd-steinberg') {
      quantized = applyFloydSteinberg(pixels, width, height, palette);
    } else if (dither === 'ordered') {
      quantized = applyOrderedDither(pixels, width, height, palette);
    } else {
      quantized = applyNoDither(pixels, width, height, palette);
    }

    const errors = computeErrorStats(pixels, quantized.pixels);
    const uniqueBefore = countUniqueColors(pixels);
    const uniqueAfter = countUniqueColors(quantized.pixels);
    const rawSizeBytes = estimateRgbSizeBytes(width, height);
    const indexedSizeBytes = estimateIndexedSizeBytes(width, height, palette.length);

    return {
      width,
      height,
      palette,
      pixels: quantized.pixels,
      usage: quantized.usage,
      stats: {
        uniqueBefore,
        uniqueAfter,
        reductionRatio: uniqueBefore > 0 ? 1 - uniqueAfter / uniqueBefore : 0,
        meanAbsoluteError: errors.meanAbsoluteError,
        rmse: errors.rmse,
        rawSizeBytes,
        indexedSizeBytes,
        indexedSavings: rawSizeBytes > 0 ? 1 - indexedSizeBytes / rawSizeBytes : 0
      }
    };
  }

  function mixColor(a, b, t) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t)
    ];
  }

  function setPixel(pixels, width, x, y, color, alpha = 255) {
    if (x < 0 || x >= width || y < 0) return;
    const idx = (y * width + x) * 4;
    pixels[idx] = color[0];
    pixels[idx + 1] = color[1];
    pixels[idx + 2] = color[2];
    pixels[idx + 3] = alpha;
  }

  function addNoise(base, amount, seed) {
    const next = Math.sin(seed * 12.9898) * 43758.5453;
    const noise = (next - Math.floor(next) - 0.5) * amount;
    return clamp(Math.round(base + noise), 0, 255);
  }

  function generateSampleScene(width, height, variant = 'portrait') {
    const pixels = new Uint8ClampedArray(width * height * 4);

    if (variant === 'poster') {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const t = y / Math.max(1, height - 1);
          const sky = mixColor([34, 21, 56], [255, 127, 80], t);
          const glow = Math.max(0, 1 - Math.abs(x - width * 0.72) / (width * 0.18));
          const color = [
            clamp(sky[0] + glow * 60, 0, 255),
            clamp(sky[1] + glow * 20, 0, 255),
            clamp(sky[2] + glow * 10, 0, 255)
          ];
          setPixel(pixels, width, x, y, color);
        }
      }
      for (let y = Math.floor(height * 0.62); y < height; y++) {
        const intensity = 20 + (y - height * 0.62) * 0.8;
        for (let x = 0; x < width; x++) {
          setPixel(pixels, width, x, y, [clamp(intensity, 0, 255), 22, 42]);
        }
      }
      for (let x = 0; x < width; x++) {
        const hill = Math.floor(height * 0.64 + Math.sin(x * 0.06) * 14 + Math.sin(x * 0.015) * 22);
        for (let y = hill; y < height; y++) {
          setPixel(pixels, width, x, y, [28, 14, 36]);
        }
      }
      const sunCx = Math.floor(width * 0.72);
      const sunCy = Math.floor(height * 0.32);
      const sunR = Math.floor(Math.min(width, height) * 0.14);
      for (let y = sunCy - sunR; y <= sunCy + sunR; y++) {
        for (let x = sunCx - sunR; x <= sunCx + sunR; x++) {
          const dx = x - sunCx;
          const dy = y - sunCy;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d <= sunR) {
            const band = Math.floor((dy + sunR) / 10) % 2;
            const sunColor = band === 0 ? [255, 236, 170] : [255, 170, 125];
            setPixel(pixels, width, x, y, sunColor);
          }
        }
      }
      return pixels;
    }

    if (variant === 'street') {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const v = y / Math.max(1, height - 1);
          const base = mixColor([10, 18, 38], [50, 78, 120], v);
          const light = Math.max(0, 1 - Math.abs(x - width * 0.5) / (width * 0.55));
          const c = [
            clamp(base[0] + light * 18, 0, 255),
            clamp(base[1] + light * 12, 0, 255),
            clamp(base[2] + light * 24, 0, 255)
          ];
          setPixel(pixels, width, x, y, c);
        }
      }
      for (let x = 0; x < width; x++) {
        const leftWall = width * 0.18 + Math.sin(x * 0.05) * 4;
        const rightWall = width * 0.82 + Math.sin(x * 0.04) * 4;
        for (let y = 0; y < height; y++) {
          if (x < leftWall) setPixel(pixels, width, x, y, [28, 30, 52]);
          if (x > rightWall) setPixel(pixels, width, x, y, [24, 26, 48]);
        }
      }
      for (let y = 0; y < height; y++) {
        const roadHalf = (1 - y / height) * width * 0.28;
        const center = width / 2;
        const left = Math.floor(center - roadHalf);
        const right = Math.ceil(center + roadHalf);
        for (let x = left; x <= right; x++) {
          const glow = Math.max(0, 1 - Math.abs(x - center) / Math.max(1, roadHalf));
          const road = [
            addNoise(30 + glow * 16, 8, x * 17 + y * 19),
            addNoise(26 + glow * 12, 8, x * 31 + y * 13),
            addNoise(42 + glow * 28, 10, x * 7 + y * 29)
          ];
          setPixel(pixels, width, x, y, road);
        }
      }
      const neonBoxes = [
        { x: 0.16, y: 0.22, w: 0.13, h: 0.19, c: [255, 62, 128] },
        { x: 0.71, y: 0.16, w: 0.12, h: 0.23, c: [36, 240, 255] },
        { x: 0.67, y: 0.44, w: 0.1, h: 0.16, c: [255, 185, 64] }
      ];
      for (const box of neonBoxes) {
        const sx = Math.floor(width * box.x);
        const sy = Math.floor(height * box.y);
        const ex = Math.floor(width * (box.x + box.w));
        const ey = Math.floor(height * (box.y + box.h));
        for (let y = sy; y < ey; y++) {
          for (let x = sx; x < ex; x++) {
            const border = x === sx || x === ex - 1 || y === sy || y === ey - 1;
            setPixel(pixels, width, x, y, border ? box.c : mixColor(box.c, [20, 20, 28], 0.6));
          }
        }
      }
      return pixels;
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tx = x / Math.max(1, width - 1);
        const ty = y / Math.max(1, height - 1);
        const bg = mixColor([243, 214, 197], [130, 91, 112], ty * 0.9 + tx * 0.1);
        setPixel(pixels, width, x, y, [
          addNoise(bg[0], 10, x * 17 + y * 13),
          addNoise(bg[1], 10, x * 31 + y * 29),
          addNoise(bg[2], 10, x * 23 + y * 19)
        ]);
      }
    }

    const cx = width / 2;
    const cy = height * 0.48;
    const rx = width * 0.24;
    const ry = height * 0.3;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) {
          const skin = mixColor([242, 198, 167], [201, 143, 122], clamp((dy + 1) / 2, 0, 1));
          setPixel(pixels, width, x, y, skin);
        }
      }
    }

    for (let y = 0; y < height * 0.38; y++) {
      const spread = Math.abs((y - height * 0.12) / (height * 0.28));
      const halfWidth = rx * (0.95 - spread * 0.3);
      for (let x = cx - halfWidth; x <= cx + halfWidth; x++) {
        if (y < 0 || x < 0 || x >= width) continue;
        const tint = addNoise(48, 18, x * 11 + y * 17);
        setPixel(pixels, width, Math.floor(x), Math.floor(y + height * 0.11), [tint, 34, 28]);
      }
    }

    const eyes = [
      { x: width * 0.43, y: height * 0.47 },
      { x: width * 0.57, y: height * 0.47 }
    ];
    for (const eye of eyes) {
      for (let y = -5; y <= 5; y++) {
        for (let x = -10; x <= 10; x++) {
          if ((x * x) / 100 + (y * y) / 25 <= 1) {
            setPixel(pixels, width, Math.floor(eye.x + x), Math.floor(eye.y + y), [248, 246, 242]);
          }
          if ((x * x) / 16 + (y * y) / 16 <= 1) {
            setPixel(pixels, width, Math.floor(eye.x + x), Math.floor(eye.y + y), [52, 52, 58]);
          }
        }
      }
    }

    for (let y = 0; y < 10; y++) {
      const left = Math.floor(cx - 18 + y * 0.6);
      const right = Math.floor(cx + 18 - y * 0.6);
      for (let x = left; x <= right; x++) {
        setPixel(pixels, width, x, Math.floor(height * 0.68 + y), [170, 70, 82]);
      }
    }

    return pixels;
  }

  return {
    getPalettePresets,
    getFixedPalette,
    buildAdaptivePalette,
    quantizeImage,
    countUniqueColors,
    estimateIndexedSizeBytes,
    estimateRgbSizeBytes,
    generateSampleScene
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ImageRetroLabLogic;
}

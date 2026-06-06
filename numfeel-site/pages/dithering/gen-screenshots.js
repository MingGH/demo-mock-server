// 生成知乎文章配图的脚本
// 运行: node gen-screenshots.js (需要在 dithering 目录下)
// 依赖: 使用 canvas 包 (npm install canvas)

const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

// 导入抖动算法
const { floydSteinberg } = require('./dither.js');

function toGrayscaleFromCanvas(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return gray;
}

async function main() {
  const imgPath = path.join(__dirname, 'sample.jpg');
  const img = await loadImage(imgPath);

  // 缩放到合适尺寸
  const maxDim = 600;
  let w = img.width;
  let h = img.height;
  if (w > maxDim || h > maxDim) {
    const scale = maxDim / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  // 绘制原图并提取灰度
  const srcCanvas = createCanvas(w, h);
  const srcCtx = srcCanvas.getContext('2d');
  srcCtx.drawImage(img, 0, 0, w, h);
  const gray = toGrayscaleFromCanvas(srcCtx, w, h);

  // 生成灰度图 canvas
  const grayCanvas = createCanvas(w, h);
  const grayCtx = grayCanvas.getContext('2d');
  const grayImageData = grayCtx.createImageData(w, h);
  for (let i = 0; i < gray.length; i++) {
    const v = Math.round(gray[i]);
    grayImageData.data[i * 4] = v;
    grayImageData.data[i * 4 + 1] = v;
    grayImageData.data[i * 4 + 2] = v;
    grayImageData.data[i * 4 + 3] = 255;
  }
  grayCtx.putImageData(grayImageData, 0, h);
  grayCtx.putImageData(grayImageData, 0, 0);

  // 执行 Floyd-Steinberg 抖动
  const dithered = floydSteinberg(gray, w, h, 128);

  // 生成抖动图 canvas
  const ditherCanvas = createCanvas(w, h);
  const ditherCtx = ditherCanvas.getContext('2d');
  const ditherImageData = ditherCtx.createImageData(w, h);
  for (let i = 0; i < dithered.length; i++) {
    const v = dithered[i];
    ditherImageData.data[i * 4] = v;
    ditherImageData.data[i * 4 + 1] = v;
    ditherImageData.data[i * 4 + 2] = v;
    ditherImageData.data[i * 4 + 3] = 255;
  }
  ditherCtx.putImageData(ditherImageData, 0, 0);

  // === 图1: 左右对比图 ===
  const gap = 20;
  const labelH = 40;
  const compareW = w * 2 + gap;
  const compareH = h + labelH;
  const compareCanvas = createCanvas(compareW, compareH);
  const compareCtx = compareCanvas.getContext('2d');

  // 背景
  compareCtx.fillStyle = '#1a1a2e';
  compareCtx.fillRect(0, 0, compareW, compareH);

  // 标签
  compareCtx.fillStyle = '#a0a0a0';
  compareCtx.font = '16px sans-serif';
  compareCtx.textAlign = 'center';
  compareCtx.fillText('灰度原图（256级亮度）', w / 2, 26);
  compareCtx.fillText('Floyd-Steinberg 抖动（仅黑白）', w + gap + w / 2, 26);

  // 灰度图
  compareCtx.putImageData(grayImageData, 0, labelH);
  // 抖动图
  compareCtx.putImageData(ditherImageData, w + gap, labelH);

  const outDir = path.join(__dirname, '..', '..', '..', 'docs');
  fs.writeFileSync(path.join(outDir, 'dithering-compare.png'), compareCanvas.toBuffer('image/png'));
  console.log('✓ 生成对比图: docs/dithering-compare.png');

  // === 图2: 局部放大图 ===
  const cropSize = 80;
  const zoomScale = 5;
  // 取图片中心偏上位置（通常是人脸区域）
  const cx = Math.round(w * 0.5);
  const cy = Math.round(h * 0.35);
  const x0 = Math.max(0, cx - cropSize / 2);
  const y0 = Math.max(0, cy - cropSize / 2);

  const zoomW = cropSize * zoomScale * 2 + gap;
  const zoomH = cropSize * zoomScale + labelH;
  const zoomCanvas = createCanvas(zoomW, zoomH);
  const zoomCtx = zoomCanvas.getContext('2d');

  zoomCtx.fillStyle = '#1a1a2e';
  zoomCtx.fillRect(0, 0, zoomW, zoomH);

  zoomCtx.fillStyle = '#a0a0a0';
  zoomCtx.font = '16px sans-serif';
  zoomCtx.textAlign = 'center';
  zoomCtx.fillText('灰度原图（放大5×）', cropSize * zoomScale / 2, 26);
  zoomCtx.fillText('抖动结果（放大5×）', cropSize * zoomScale + gap + cropSize * zoomScale / 2, 26);

  // 放大灰度
  zoomCtx.imageSmoothingEnabled = false;
  zoomCtx.drawImage(grayCanvas, x0, y0, cropSize, cropSize, 0, labelH, cropSize * zoomScale, cropSize * zoomScale);
  // 放大抖动
  zoomCtx.drawImage(ditherCanvas, x0, y0, cropSize, cropSize, cropSize * zoomScale + gap, labelH, cropSize * zoomScale, cropSize * zoomScale);

  fs.writeFileSync(path.join(outDir, 'dithering-zoom.png'), zoomCanvas.toBuffer('image/png'));
  console.log('✓ 生成放大图: docs/dithering-zoom.png');
}

main().catch(console.error);

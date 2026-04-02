/**
 * 隐形水印实验室 - 空间域水印（LSB）
 */

let spatialOriginalData = null;
let spatialWatermarkedData = null;

function initSpatial() {
  // 拖拽上传
  setupDropZone('spatialUpload', 'spatialFileInput', (file) => {
    loadImageFile(file, (img) => {
      spatialOriginalData = drawImageToCanvas(img, 'spatialOriginal');
      clearCanvas('spatialWatermarked');
      clearCanvas('spatialDiff');
      clearCanvas('spatialLSB');
      showToast('图片已加载');
    });
  });

  // 文件选择上传
  document.getElementById('spatialFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    loadImageFile(file, (img) => {
      spatialOriginalData = drawImageToCanvas(img, 'spatialOriginal');
      clearCanvas('spatialWatermarked');
      clearCanvas('spatialDiff');
      clearCanvas('spatialLSB');
      showToast('图片已加载');
    });
  });
}

function loadSampleSpatial() {
  generateSampleImage((img) => {
    spatialOriginalData = drawImageToCanvas(img, 'spatialOriginal');
    clearCanvas('spatialWatermarked');
    clearCanvas('spatialDiff');
    clearCanvas('spatialLSB');
    showToast('示例图已加载');
  });
}

function embedSpatial() {
  if (!spatialOriginalData) { showToast('请先上传或加载图片'); return; }
  const text = document.getElementById('spatialText').value.trim();
  if (!text) { showToast('请输入水印文本'); return; }
  const channel = parseInt(document.getElementById('spatialChannel').value);
  const numBits = parseInt(document.getElementById('spatialBits').value);

  const result = lsbEmbed(spatialOriginalData, text, channel, numBits);
  spatialWatermarkedData = result.imageData;

  const wCanvas = document.getElementById('spatialWatermarked');
  wCanvas.width = spatialOriginalData.width;
  wCanvas.height = spatialOriginalData.height;
  wCanvas.getContext('2d').putImageData(spatialWatermarkedData, 0, 0);

  drawDiffMap('spatialDiff', spatialOriginalData, spatialWatermarkedData, 50);
  drawLSBPlane('spatialLSB', spatialWatermarkedData, channel);

  const totalPixels = spatialOriginalData.width * spatialOriginalData.height;
  document.getElementById('spatialCapacity').textContent = totalPixels * numBits;
  document.getElementById('spatialPSNR').textContent = calcPSNR(spatialOriginalData.data, spatialWatermarkedData.data, spatialOriginalData.data.length) + ' dB';
  document.getElementById('spatialModified').textContent = (result.modifiedPixels / totalPixels * 100).toFixed(1) + '%';
  document.getElementById('spatialExtracted').textContent = '待提取';
  document.getElementById('spatialDownloadBtn').style.display = '';
  showToast('空间域水印已嵌入');
}

function lsbEmbed(origData, text, channel, numBits) {
  const w = origData.width, h = origData.height;
  const newData = new ImageData(new Uint8ClampedArray(origData.data), w, h);
  const contentBits = textToBits(text);
  const lenBits = [];
  for (let i = 15; i >= 0; i--) lenBits.push((contentBits.length >> i) & 1);
  const allBits = lenBits.concat(contentBits);

  let modified = 0;
  const mask = (0xFF >> numBits) << numBits;

  for (let i = 0; i < allBits.length; i += numBits) {
    const pixIdx = Math.floor(i / numBits);
    if (pixIdx >= w * h) break;
    const dataIdx = pixIdx * 4 + channel;
    let val = newData.data[dataIdx] & mask;
    for (let b = 0; b < numBits && (i + b) < allBits.length; b++) {
      val |= (allBits[i + b] << (numBits - 1 - b));
    }
    if (newData.data[dataIdx] !== val) modified++;
    newData.data[dataIdx] = val;
  }
  return { imageData: newData, modifiedPixels: modified };
}

function extractSpatial() {
  const target = spatialWatermarkedData || spatialOriginalData;
  if (!target) { showToast('请先嵌入水印'); return; }
  const channel = parseInt(document.getElementById('spatialChannel').value);
  const numBits = parseInt(document.getElementById('spatialBits').value);
  const text = lsbExtract(target, channel, numBits);
  document.getElementById('spatialExtracted').textContent = text || '[空]';
  document.getElementById('spatialResultBox').style.display = '';
  showToast('提取完成: ' + text);
}

function lsbExtract(imgData, channel, numBits) {
  const w = imgData.width, h = imgData.height;
  const lenBits = [];
  for (let i = 0; i < 16; i += numBits) {
    const pixIdx = Math.floor(i / numBits);
    const dataIdx = pixIdx * 4 + channel;
    const val = imgData.data[dataIdx];
    for (let b = 0; b < numBits && (i + b) < 16; b++) {
      lenBits.push((val >> (numBits - 1 - b)) & 1);
    }
  }
  let bitLen = 0;
  for (const b of lenBits) bitLen = (bitLen << 1) | b;
  if (bitLen <= 0 || bitLen > 10000) return '[无有效水印]';

  const totalBits = 16 + bitLen;
  const allBits = [];
  for (let i = 0; i < totalBits; i += numBits) {
    const pixIdx = Math.floor(i / numBits);
    if (pixIdx >= w * h) break;
    const dataIdx = pixIdx * 4 + channel;
    const val = imgData.data[dataIdx];
    for (let b = 0; b < numBits && (i + b) < totalBits; b++) {
      allBits.push((val >> (numBits - 1 - b)) & 1);
    }
  }
  return bitsToText(allBits.slice(16));
}

function attackSpatial() {
  if (!spatialWatermarkedData) { showToast('请先嵌入水印'); return; }
  const c = document.createElement('canvas');
  c.width = spatialWatermarkedData.width;
  c.height = spatialWatermarkedData.height;
  const ctx = c.getContext('2d');
  ctx.putImageData(spatialWatermarkedData, 0, 0);
  const jpegUrl = c.toDataURL('image/jpeg', 0.7);
  const img = new Image();
  img.onload = () => {
    const wCanvas = document.getElementById('spatialWatermarked');
    wCanvas.width = img.width;
    wCanvas.height = img.height;
    const wCtx = wCanvas.getContext('2d');
    wCtx.drawImage(img, 0, 0);
    spatialWatermarkedData = wCtx.getImageData(0, 0, img.width, img.height);
    const channel = parseInt(document.getElementById('spatialChannel').value);
    const numBits = parseInt(document.getElementById('spatialBits').value);
    const text = lsbExtract(spatialWatermarkedData, channel, numBits);
    document.getElementById('spatialExtracted').textContent = text;
    document.getElementById('spatialResultBox').style.display = '';
    drawDiffMap('spatialDiff', spatialOriginalData, spatialWatermarkedData, 50);
    showToast('JPEG 压缩攻击完成——水印已被破坏');
  };
  img.src = jpegUrl;
}

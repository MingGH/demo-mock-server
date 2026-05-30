/**
 * 隐形水印实验室 - 频域水印（DCT）
 */

let freqOriginalData = null;
let freqWatermarkedData = null;
let freqWatermarkKey = null;

// 中频位置（zigzag 扫描的中间部分）
const MID_FREQ_POSITIONS = [
  [0,3],[0,4],[1,2],[1,3],[2,1],[2,2],[3,0],[3,1],
  [1,4],[2,3],[3,2],[4,1],[4,0],[0,5],[5,0],[4,2]
];

function initFrequency() {
  setupDropZone('freqUpload', 'freqFileInput', (file) => {
    loadImageFile(file, (img) => {
      freqOriginalData = drawImageToCanvas(img, 'freqOriginal');
      clearCanvas('freqWatermarked');
      clearCanvas('freqDiff');
      clearCanvas('freqSpectrum');
      showToast('图片已加载');
    });
  });

  document.getElementById('freqFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    loadImageFile(file, (img) => {
      freqOriginalData = drawImageToCanvas(img, 'freqOriginal');
      clearCanvas('freqWatermarked');
      clearCanvas('freqDiff');
      clearCanvas('freqSpectrum');
      showToast('图片已加载');
    });
  });
}

function loadSampleFrequency() {
  generateSampleImage((img) => {
    freqOriginalData = drawImageToCanvas(img, 'freqOriginal');
    clearCanvas('freqWatermarked');
    clearCanvas('freqDiff');
    clearCanvas('freqSpectrum');
    showToast('示例图已加载');
  });
}

// ===== DCT 变换 =====
function dct8x8(block) {
  const N = 8;
  const out = new Float64Array(64);
  for (let u = 0; u < N; u++) {
    for (let v = 0; v < N; v++) {
      let sum = 0;
      for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
          sum += block[x * N + y] *
            Math.cos((2 * x + 1) * u * Math.PI / (2 * N)) *
            Math.cos((2 * y + 1) * v * Math.PI / (2 * N));
        }
      }
      const cu = u === 0 ? 1 / Math.SQRT2 : 1;
      const cv = v === 0 ? 1 / Math.SQRT2 : 1;
      out[u * N + v] = 0.25 * cu * cv * sum;
    }
  }
  return out;
}

function idct8x8(block) {
  const N = 8;
  const out = new Float64Array(64);
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      let sum = 0;
      for (let u = 0; u < N; u++) {
        for (let v = 0; v < N; v++) {
          const cu = u === 0 ? 1 / Math.SQRT2 : 1;
          const cv = v === 0 ? 1 / Math.SQRT2 : 1;
          sum += cu * cv * block[u * N + v] *
            Math.cos((2 * x + 1) * u * Math.PI / (2 * N)) *
            Math.cos((2 * y + 1) * v * Math.PI / (2 * N));
        }
      }
      out[x * N + y] = 0.25 * sum;
    }
  }
  return out;
}

function seededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ===== 嵌入 =====
function embedFrequency() {
  if (!freqOriginalData) { showToast('请先上传或加载图片'); return; }
  const text = document.getElementById('freqText').value.trim();
  if (!text) { showToast('请输入水印文本'); return; }
  const strength = parseInt(document.getElementById('freqStrength').value);

  const bits = textToBits(text);
  const lenBits = [];
  for (let i = 15; i >= 0; i--) lenBits.push((bits.length >> i) & 1);
  const allBits = lenBits.concat(bits);

  const w = freqOriginalData.width, h = freqOriginalData.height;
  const newData = new ImageData(new Uint8ClampedArray(freqOriginalData.data), w, h);

  const Y = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) {
    Y[i] = 0.299 * freqOriginalData.data[i * 4] + 0.587 * freqOriginalData.data[i * 4 + 1] + 0.114 * freqOriginalData.data[i * 4 + 2];
  }

  const blocksX = Math.floor(w / 8), blocksY = Math.floor(h / 8);
  const rng = seededRandom(42);
  freqWatermarkKey = { strength, allBits: allBits.slice(), w, h };

  let bitIdx = 0;
  for (let by = 0; by < blocksY && bitIdx < allBits.length; by++) {
    for (let bx = 0; bx < blocksX && bitIdx < allBits.length; bx++) {
      const block = new Float64Array(64);
      for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
          block[r * 8 + c] = Y[(by * 8 + r) * w + (bx * 8 + c)];

      const dctBlock = dct8x8(block);
      const pos = MID_FREQ_POSITIONS[bitIdx % MID_FREQ_POSITIONS.length];
      const coefIdx = pos[0] * 8 + pos[1];
      const bit = allBits[bitIdx];
      const coef = dctBlock[coefIdx];
      const quantized = Math.round(coef / strength) * strength;
      dctBlock[coefIdx] = quantized + (bit ? strength * 0.25 : -strength * 0.25);

      const spatial = idct8x8(dctBlock);
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const origY = Y[(by * 8 + r) * w + (bx * 8 + c)];
          const diff = spatial[r * 8 + c] - origY;
          const pi = ((by * 8 + r) * w + (bx * 8 + c)) * 4;
          newData.data[pi] = Math.max(0, Math.min(255, newData.data[pi] + diff));
          newData.data[pi + 1] = Math.max(0, Math.min(255, newData.data[pi + 1] + diff));
          newData.data[pi + 2] = Math.max(0, Math.min(255, newData.data[pi + 2] + diff));
        }
      }
      bitIdx++;
    }
  }

  freqWatermarkedData = newData;
  const wCanvas = document.getElementById('freqWatermarked');
  wCanvas.width = w; wCanvas.height = h;
  wCanvas.getContext('2d').putImageData(newData, 0, 0);

  drawDiffMap('freqDiff', freqOriginalData, newData, 30);
  drawDCTSpectrum('freqSpectrum', newData);

  document.getElementById('freqPSNR').textContent = calcPSNR(freqOriginalData.data, newData.data, freqOriginalData.data.length) + ' dB';
  document.getElementById('freqSSIM').textContent = calcSSIM(freqOriginalData.data, newData.data, freqOriginalData.data.length);
  document.getElementById('freqExtracted').textContent = '待提取';
  document.getElementById('freqSurvived').textContent = '待测试';
  document.getElementById('freqDownloadBtn').style.display = '';
  showToast('频域水印已嵌入');
}

// ===== 提取 =====
function extractFrequency() {
  const target = freqWatermarkedData || freqOriginalData;
  if (!target) { showToast('请先上传或加载图片'); return; }
  const strength = parseInt(document.getElementById('freqStrength').value);
  const text = dctExtract(target, strength);
  document.getElementById('freqExtracted').textContent = text || '[空]';
  document.getElementById('freqResultBox').style.display = '';
  showToast('提取完成: ' + text);
}

function dctExtract(imgData, strength) {
  const w = imgData.width, h = imgData.height;
  const Y = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) {
    Y[i] = 0.299 * imgData.data[i * 4] + 0.587 * imgData.data[i * 4 + 1] + 0.114 * imgData.data[i * 4 + 2];
  }

  const blocksX = Math.floor(w / 8), blocksY = Math.floor(h / 8);
  const extractedBits = [];
  let bitIdx = 0;

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const block = new Float64Array(64);
      for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
          block[r * 8 + c] = Y[(by * 8 + r) * w + (bx * 8 + c)];

      const dctBlock = dct8x8(block);
      const pos = MID_FREQ_POSITIONS[bitIdx % MID_FREQ_POSITIONS.length];
      const coefIdx = pos[0] * 8 + pos[1];
      const coef = dctBlock[coefIdx];
      const quantized = Math.round(coef / strength) * strength;
      const remainder = coef - quantized;
      extractedBits.push(remainder > 0 ? 1 : 0);
      bitIdx++;

      if (extractedBits.length === 16) {
        let bitLen = 0;
        for (const b of extractedBits) bitLen = (bitLen << 1) | b;
        if (bitLen <= 0 || bitLen > 5000) return '[无有效水印]';
      }
      if (extractedBits.length > 16) {
        let bitLen = 0;
        for (let i = 0; i < 16; i++) bitLen = (bitLen << 1) | extractedBits[i];
        if (extractedBits.length >= 16 + bitLen) {
          return bitsToText(extractedBits.slice(16, 16 + bitLen));
        }
      }
    }
  }
  if (extractedBits.length > 16) {
    let bitLen = 0;
    for (let i = 0; i < 16; i++) bitLen = (bitLen << 1) | extractedBits[i];
    return bitsToText(extractedBits.slice(16, 16 + bitLen));
  }
  return '[数据不足]';
}

// ===== 攻击 =====
function attackFrequency() {
  if (!freqWatermarkedData || !freqWatermarkKey) { showToast('请先嵌入水印'); return; }
  const c = document.createElement('canvas');
  c.width = freqWatermarkedData.width;
  c.height = freqWatermarkedData.height;
  const ctx = c.getContext('2d');
  ctx.putImageData(freqWatermarkedData, 0, 0);
  const jpegUrl = c.toDataURL('image/jpeg', 0.5);
  const img = new Image();
  img.onload = () => {
    const wCanvas = document.getElementById('freqWatermarked');
    wCanvas.width = img.width;
    wCanvas.height = img.height;
    const wCtx = wCanvas.getContext('2d');
    wCtx.drawImage(img, 0, 0);
    const compressed = wCtx.getImageData(0, 0, img.width, img.height);
    freqWatermarkedData = compressed;

    const text = dctExtract(compressed, freqWatermarkKey.strength);
    const original = document.getElementById('freqText').value.trim();
    const survived = text === original;

    document.getElementById('freqExtracted').textContent = text;
    document.getElementById('freqResultBox').style.display = '';
    document.getElementById('freqSurvived').textContent = survived ? '存活' : '部分损坏';
    document.getElementById('freqSurvived').style.color = survived ? '#4CAF50' : '#ff4444';
    document.getElementById('freqPSNR').textContent = calcPSNR(freqOriginalData.data, compressed.data, freqOriginalData.data.length) + ' dB';
    drawDiffMap('freqDiff', freqOriginalData, compressed, 30);
    showToast(survived ? 'JPEG 50% 压缩后水印仍然存活' : 'JPEG 压缩后水印部分损坏');
  };
  img.src = jpegUrl;
}

// ===== 频谱可视化 =====
function drawDCTSpectrum(canvasId, imgData) {
  const c = document.getElementById(canvasId);
  const w = imgData.width, h = imgData.height;
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const Y = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) {
    Y[i] = 0.299 * imgData.data[i * 4] + 0.587 * imgData.data[i * 4 + 1] + 0.114 * imgData.data[i * 4 + 2];
  }
  const out = ctx.createImageData(w, h);
  const blocksX = Math.floor(w / 8), blocksY = Math.floor(h / 8);
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const block = new Float64Array(64);
      for (let r = 0; r < 8; r++)
        for (let cc = 0; cc < 8; cc++)
          block[r * 8 + cc] = Y[(by * 8 + r) * w + (bx * 8 + cc)];
      const dctBlock = dct8x8(block);
      for (let r = 0; r < 8; r++) {
        for (let cc = 0; cc < 8; cc++) {
          const pi = ((by * 8 + r) * w + (bx * 8 + cc)) * 4;
          const v = Math.min(255, Math.abs(dctBlock[r * 8 + cc]) * 0.5);
          out.data[pi] = v * 0.3;
          out.data[pi + 1] = v * 0.7;
          out.data[pi + 2] = v;
          out.data[pi + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(out, 0, 0);
}

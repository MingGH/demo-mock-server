// ========== 波形合成器 ==========
let waveType = 'square';
let harmonicCount = 1;
let animating = false;
let animFrame = null;

const synthCanvas = document.getElementById('synthCanvas');
const synthCtx = synthCanvas.getContext('2d');

function setWaveType(type) {
  waveType = type;
  document.querySelectorAll('#waveTypeGroup .btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === type);
  });
  updateSynth();
}

function updateSynth() {
  harmonicCount = parseInt(document.getElementById('harmonicSlider').value);
  document.getElementById('harmonicVal').textContent = harmonicCount;
  drawSynth();
  updateSpectrum();
  updateStats();
}

function drawSynth() {
  const canvas = synthCanvas;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 280 * dpr;
  const ctx = synthCtx;
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = 280;

  ctx.clearRect(0, 0, W, H);

  const midY = H / 2;
  const ampY = H * 0.35;
  const samples = 500;
  const step = (4 * Math.PI) / samples;

  // 获取系数
  let coeffs;
  if (waveType === 'square') coeffs = squareWaveCoeffs(harmonicCount);
  else if (waveType === 'sawtooth') coeffs = sawtoothWaveCoeffs(harmonicCount);
  else coeffs = triangleWaveCoeffs(harmonicCount);

  // 画目标波形（虚线）
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(129,199,132,0.5)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  for (let i = 0; i <= samples; i++) {
    const x = (i / samples) * W;
    const t = -2 * Math.PI + i * step;
    const y = midY - targetWaveValue(waveType, t) * ampY;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // 画各谐波（透明度递减）
  if (harmonicCount <= 10) {
    for (let k = 0; k < coeffs.length; k++) {
      const alpha = Math.max(0.1, 0.4 - k * 0.03);
      ctx.beginPath();
      ctx.strokeStyle = `rgba(144,202,249,${alpha})`;
      ctx.lineWidth = 1;
      for (let i = 0; i <= samples; i++) {
        const x = (i / samples) * W;
        const t = -2 * Math.PI + i * step;
        const y = midY - coeffs[k].amp * Math.sin(coeffs[k].freq * t) * ampY;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  // 画合成波形（金色实线）
  ctx.beginPath();
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 2.5;
  for (let i = 0; i <= samples; i++) {
    const x = (i / samples) * W;
    const t = -2 * Math.PI + i * step;
    const y = midY - fourierSum(coeffs, t) * ampY;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // 图例
  ctx.font = '12px -apple-system, sans-serif';
  ctx.fillStyle = '#81c784';
  ctx.fillText('— 目标波形', 10, 20);
  ctx.fillStyle = '#ffd700';
  ctx.fillText('— 傅里叶逼近 (' + harmonicCount + ' 项)', 10, 38);
  if (harmonicCount <= 10) {
    ctx.fillStyle = '#90caf9';
    ctx.fillText('— 各次谐波', 10, 56);
  }
}

function updateSpectrum() {
  let coeffs;
  if (waveType === 'square') coeffs = squareWaveCoeffs(harmonicCount);
  else if (waveType === 'sawtooth') coeffs = sawtoothWaveCoeffs(harmonicCount);
  else coeffs = triangleWaveCoeffs(harmonicCount);

  const container = document.getElementById('spectrumBars');
  const maxAmp = Math.max(...coeffs.map(c => Math.abs(c.amp)));
  container.innerHTML = coeffs.slice(0, 25).map((c, i) => {
    const h = Math.abs(c.amp) / maxAmp * 100;
    return `<div class="spectrum-bar" style="height:${h}%" title="第${c.freq}次谐波: 振幅 ${Math.abs(c.amp).toFixed(4)}"></div>`;
  }).join('');
}

function updateStats() {
  let coeffs;
  if (waveType === 'square') coeffs = squareWaveCoeffs(harmonicCount);
  else if (waveType === 'sawtooth') coeffs = sawtoothWaveCoeffs(harmonicCount);
  else coeffs = triangleWaveCoeffs(harmonicCount);

  const rmse = computeRMSE(coeffs, waveType, 1000);
  document.getElementById('rmseVal').textContent = rmse.toFixed(4);
  document.getElementById('freqCountVal').textContent = coeffs.length;

  // 能量比（Parseval 定理近似）
  const totalEnergy = waveType === 'triangle' ? 1 / 3 : 1; // 归一化后目标波形能量
  const approxEnergy = coeffs.reduce((s, c) => s + c.amp * c.amp / 2, 0);
  const energyPct = Math.min(100, (approxEnergy / (totalEnergy / 2)) * 100);
  document.getElementById('energyVal').textContent = energyPct.toFixed(1) + '%';

  // 动态洞察
  const insight = document.getElementById('synthInsight');
  if (harmonicCount === 1) {
    insight.textContent = '只有 1 个谐波时，合成波形是纯正弦波。和目标波形差距很大——需要更多频率分量来逼近尖锐的转折。';
  } else if (harmonicCount <= 5) {
    insight.textContent = `${harmonicCount} 个谐波已经能看出大致形状了。注意边角处的「超调」——这叫 Gibbs 现象，即使谐波数无穷大，超调幅度也不会消失（始终约为 9%）。`;
  } else if (harmonicCount <= 15) {
    insight.textContent = `${harmonicCount} 个谐波，RMSE 已经降到 ${rmse.toFixed(3)}。对人眼来说几乎分辨不出差异了。这解释了为什么 JPEG 只保留有限个 DCT 系数就够用。`;
  } else {
    insight.textContent = `${harmonicCount} 个谐波，逼近已经非常精确。继续增加收效递减——高次谐波的振幅按 1/n 衰减，对整体形状的贡献越来越小。这就是压缩的数学基础：丢掉小系数，视觉几乎无损。`;
  }
}

// 动画模式
function toggleAnimate() {
  animating = !animating;
  const btn = document.getElementById('animateBtn');
  if (animating) {
    btn.innerHTML = '<i class="ti ti-player-pause"></i> 暂停';
    animateStep();
  } else {
    btn.innerHTML = '<i class="ti ti-player-play"></i> 动画';
    if (animFrame) cancelAnimationFrame(animFrame);
  }
}

function animateStep() {
  if (!animating) return;
  const slider = document.getElementById('harmonicSlider');
  let val = parseInt(slider.value) + 1;
  if (val > 50) val = 1;
  slider.value = val;
  updateSynth();
  animFrame = requestAnimationFrame(() => setTimeout(animateStep, 300));
}

// ========== 音色实验 ==========
let audioCtx = null;

function playTone(type) {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // 高亮按钮
  document.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('playing'));
  event.currentTarget.classList.add('playing');

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = 440;
  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 1.2);

  setTimeout(() => {
    document.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('playing'));
  }, 1200);
}

// ========== JPEG 压缩演示 ==========
let originalPixels = null;

function initJpeg() {
  const canvas = document.getElementById('jpegOriginal');
  const ctx = canvas.getContext('2d');
  const size = 256;

  // 生成测试图案：渐变 + 几何图形（不依赖外部图片）
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      // 背景渐变
      let val = (x + y) * 0.4;

      // 叠加几何图形
      const cx = size / 2, cy = size / 2;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);

      // 同心圆
      if (dist < 80) val += Math.cos(dist * 0.2) * 60;

      // 方块
      if (x > 30 && x < 80 && y > 30 && y < 80) val = 220;
      if (x > 170 && x < 230 && y > 60 && y < 100) val = 180;

      // 对角线
      if (Math.abs(x - y) < 3) val = 255;
      if (Math.abs(x - (size - y)) < 3) val = 200;

      // 小文字般的高频区域
      if (y > 180 && y < 240) {
        val += Math.sin(x * 0.8) * 30 + Math.cos(y * 1.2) * 20;
      }

      val = Math.max(0, Math.min(255, val));
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // 存储灰度值
  originalPixels = new Float64Array(size * size);
  for (let i = 0; i < size * size; i++) {
    originalPixels[i] = data[i * 4];
  }

  updateJpeg();
}

function updateJpeg() {
  if (!originalPixels) return;
  const quality = parseInt(document.getElementById('jpegQualSlider').value);
  document.getElementById('jpegQualVal').textContent = quality;

  const size = 256;
  const blockSize = 8;
  const blocksPerRow = size / blockSize;
  const quantMatrix = getQuantMatrix(quality);

  const compressedCanvas = document.getElementById('jpegCompressed');
  const ctx = compressedCanvas.getContext('2d');
  const imageData = ctx.createImageData(size, size);
  const outData = imageData.data;

  let totalNonZero = 0;
  let totalCoeffs = 0;
  let mse = 0;

  // 逐 8×8 块处理
  for (let by = 0; by < blocksPerRow; by++) {
    for (let bx = 0; bx < blocksPerRow; bx++) {
      // 提取块，中心化（减 128）
      const block = Array.from({ length: 8 }, () => new Float64Array(8));
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const px = bx * 8 + x;
          const py = by * 8 + y;
          block[y][x] = originalPixels[py * size + px] - 128;
        }
      }

      // DCT → 量化 → 反量化 → IDCT
      const dctBlock = dct2d(block);
      const quantBlock = quantize(dctBlock, quantMatrix);
      totalNonZero += countNonZero(quantBlock);
      totalCoeffs += 64;
      const deqBlock = dequantize(quantBlock, quantMatrix);
      const restored = idct2d(deqBlock);

      // 写回像素
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const px = bx * 8 + x;
          const py = by * 8 + y;
          const val = Math.max(0, Math.min(255, Math.round(restored[y][x] + 128)));
          const idx = (py * size + px) * 4;
          outData[idx] = val;
          outData[idx + 1] = val;
          outData[idx + 2] = val;
          outData[idx + 3] = 255;

          const orig = originalPixels[py * size + px];
          mse += (val - orig) ** 2;
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // 统计
  const keepPct = ((totalNonZero / totalCoeffs) * 100).toFixed(1);
  const ratio = (totalCoeffs / Math.max(1, totalNonZero)).toFixed(1);
  mse /= (size * size);
  const psnr = mse > 0 ? (10 * Math.log10(255 * 255 / mse)).toFixed(1) : '∞';

  document.getElementById('jpegKeepPct').textContent = keepPct + '%';
  document.getElementById('jpegNonZero').textContent = totalNonZero.toLocaleString() + ' / ' + totalCoeffs.toLocaleString();
  document.getElementById('jpegRatio').textContent = ratio + ':1';
  document.getElementById('jpegPsnr').textContent = psnr;
}

// ========== 初始化 ==========
window.addEventListener('DOMContentLoaded', () => {
  updateSynth();
  initJpeg();
});

// 响应窗口大小变化
window.addEventListener('resize', () => {
  drawSynth();
});

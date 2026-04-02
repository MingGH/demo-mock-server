/**
 * 隐形水印实验室 - 公共工具函数
 */

// ===== Tab 切换 =====
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((b, i) => {
    b.classList.toggle('active', (tab === 'spatial' && i === 0) || (tab === 'frequency' && i === 1));
  });
  document.getElementById('tab-spatial').classList.toggle('active', tab === 'spatial');
  document.getElementById('tab-frequency').classList.toggle('active', tab === 'frequency');
}

// ===== Toast =====
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

function copyShareLink() {
  navigator.clipboard.writeText(window.location.href).then(() => showToast('链接已复制到剪贴板'));
}

// ===== 编解码 =====
function textToBits(text) {
  const bytes = new TextEncoder().encode(text);
  const bits = [];
  for (const b of bytes) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  return bits;
}

function bitsToText(bits) {
  const bytes = [];
  for (let i = 0; i + 7 < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    bytes.push(byte);
  }
  try { return new TextDecoder().decode(new Uint8Array(bytes)); } catch { return '[解码失败]'; }
}

// ===== 图像质量指标 =====
function calcPSNR(data1, data2, len) {
  let mse = 0;
  for (let i = 0; i < len; i += 4) {
    for (let c = 0; c < 3; c++) {
      const d = data1[i + c] - data2[i + c];
      mse += d * d;
    }
  }
  mse /= (len / 4) * 3;
  if (mse === 0) return Infinity;
  return (10 * Math.log10(255 * 255 / mse)).toFixed(1);
}

function calcSSIM(data1, data2, len) {
  let sum1 = 0, sum2 = 0, sum12 = 0, sumSq1 = 0, sumSq2 = 0;
  const n = (len / 4) * 3;
  for (let i = 0; i < len; i += 4) {
    for (let c = 0; c < 3; c++) {
      const a = data1[i + c], b = data2[i + c];
      sum1 += a; sum2 += b; sum12 += a * b; sumSq1 += a * a; sumSq2 += b * b;
    }
  }
  const mu1 = sum1 / n, mu2 = sum2 / n;
  const s1 = sumSq1 / n - mu1 * mu1, s2 = sumSq2 / n - mu2 * mu2;
  const s12 = sum12 / n - mu1 * mu2;
  const c1 = 6.5025, c2 = 58.5225;
  return (((2 * mu1 * mu2 + c1) * (2 * s12 + c2)) / ((mu1 * mu1 + mu2 * mu2 + c1) * (s1 + s2 + c2))).toFixed(4);
}

// ===== Canvas 工具 =====
function drawImageToCanvas(img, canvasId) {
  const canvas = document.getElementById(canvasId);
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height);
}

function clearCanvas(id) {
  const c = document.getElementById(id);
  c.getContext('2d').clearRect(0, 0, c.width, c.height);
}

function drawDiffMap(canvasId, data1, data2, amplify) {
  const c = document.getElementById(canvasId);
  c.width = data1.width;
  c.height = data1.height;
  const ctx = c.getContext('2d');
  const diff = ctx.createImageData(data1.width, data1.height);
  for (let i = 0; i < data1.data.length; i += 4) {
    const dr = Math.abs(data1.data[i] - data2.data[i]);
    const dg = Math.abs(data1.data[i + 1] - data2.data[i + 1]);
    const db = Math.abs(data1.data[i + 2] - data2.data[i + 2]);
    const d = Math.min((dr + dg + db) * amplify, 255);
    diff.data[i] = 0;
    diff.data[i + 1] = d;
    diff.data[i + 2] = 0;
    diff.data[i + 3] = 255;
  }
  ctx.putImageData(diff, 0, 0);
}

function drawLSBPlane(canvasId, imgData, channel) {
  const c = document.getElementById(canvasId);
  c.width = imgData.width;
  c.height = imgData.height;
  const ctx = c.getContext('2d');
  const plane = ctx.createImageData(imgData.width, imgData.height);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const lsb = imgData.data[i + channel] & 1;
    const v = lsb * 255;
    plane.data[i] = v;
    plane.data[i + 1] = v;
    plane.data[i + 2] = v;
    plane.data[i + 3] = 255;
  }
  ctx.putImageData(plane, 0, 0);
}

// ===== 示例图生成 =====
function generateSampleImage(callback) {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 300;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 400, 300);
  grad.addColorStop(0, '#2c3e50');
  grad.addColorStop(0.5, '#3498db');
  grad.addColorStop(1, '#2ecc71');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 400, 300);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.arc(120, 150, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,200,0,0.4)';
  ctx.fillRect(220, 80, 120, 120);
  ctx.fillStyle = 'rgba(255,100,100,0.3)';
  ctx.beginPath();
  ctx.moveTo(320, 220);
  ctx.lineTo(380, 280);
  ctx.lineTo(260, 280);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '16px sans-serif';
  ctx.fillText('Sample Image', 150, 30);
  const img = new Image();
  img.onload = () => callback(img);
  img.src = canvas.toDataURL();
}

// ===== 拖拽上传 =====
function setupDropZone(zoneId, fileInputId, onFileLoad) {
  const zone = document.getElementById(zoneId);
  if (!zone) return;

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.style.borderColor = '#ffd700';
    zone.style.background = 'rgba(255,215,0,0.08)';
  });

  zone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.style.borderColor = '';
    zone.style.background = '';
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.style.borderColor = '';
    zone.style.background = '';
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      onFileLoad(file);
    } else {
      showToast('请拖入图片文件');
    }
  });
}

function loadImageFile(file, callback) {
  const img = new Image();
  img.onload = () => callback(img);
  img.src = URL.createObjectURL(file);
}

// ===== 下载 canvas 图片 =====
function downloadCanvas(canvasId, filename) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || canvas.width === 0) { showToast('没有可下载的图片'); return; }
  const link = document.createElement('a');
  link.download = filename || 'watermarked.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

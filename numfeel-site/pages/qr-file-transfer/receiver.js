// ========== 接收端逻辑 ==========

let video = null;
let canvas = null;
let ctx = null;
let scanning = false;
let scanIntervalId = null;

// 接收状态
let fileName = null;
let totalChunks = 0;
let receivedChunks = new Map(); // index -> data
let startTime = null;
let scanCount = 0;
let scanAttempts = 0; // 总扫描次数
let lastDetectedTime = 0; // 上次检测到二维码的时间

// ========== 初始化 ==========
async function init() {
  video = document.getElementById('video');
  canvas = document.getElementById('scanCanvas');
  ctx = canvas.getContext('2d', { willReadFrequently: true });
  
  document.getElementById('downloadBtn').addEventListener('click', downloadFile);
  document.getElementById('resetBtn').addEventListener('click', resetReceiver);
  
  // 检查 jsQR 是否加载
  if (typeof jsQR === 'undefined') {
    showError('二维码识别库加载失败，请刷新页面重试');
    return;
  }
  
  try {
    await startCamera();
    startScanning();
  } catch (err) {
    showError('无法访问摄像头：' + err.message);
  }
}

// ========== 摄像头 ==========
async function startCamera() {
  // 使用较低分辨率，提高处理速度
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'environment',
      width: { ideal: 640 },
      height: { ideal: 480 }
    }
  });
  
  video.srcObject = stream;
  
  // 等待视频准备好
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = () => {
      video.play().then(resolve).catch(reject);
    };
    video.onerror = reject;
  });
  
  // 再等一下确保尺寸确定
  await new Promise(r => setTimeout(r, 500));
  
  // 设置 canvas 尺寸
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  console.log('摄像头尺寸:', canvas.width, 'x', canvas.height);
}

// ========== 扫描循环 ==========
function startScanning() {
  scanning = true;
  showStatus('正在扫描，请对准电脑屏幕上的二维码...', 'scanning');
  
  // 每 80ms 扫描一次（约 12fps），平衡速度和性能
  scanIntervalId = setInterval(scanFrame, 80);
}

function scanFrame() {
  if (!scanning) return;
  if (video.readyState !== video.HAVE_ENOUGH_DATA) return;
  
  scanAttempts++;
  
  try {
    // 绘制视频帧到 canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // 识别二维码 - 尝试多种模式
    let code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert'
    });
    
    // 如果失败，尝试反色模式
    if (!code) {
      code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'onlyInvert'
      });
    }
    
    if (code && code.data) {
      lastDetectedTime = Date.now();
      handleQRCode(code.data);
    }
    
    // 更新扫描状态指示
    updateScanIndicator();
    
  } catch (e) {
    console.error('扫描错误:', e);
  }
}

function updateScanIndicator() {
  const now = Date.now();
  const timeSinceLastDetect = now - lastDetectedTime;
  
  // 如果超过 3 秒没检测到二维码，提示用户
  if (lastDetectedTime > 0 && timeSinceLastDetect > 3000 && receivedChunks.size < totalChunks) {
    showStatus(`已接收 ${receivedChunks.size}/${totalChunks}，等待下一个二维码...（请保持对准）`, 'scanning');
  }
}

// ========== 处理二维码数据 ==========
function handleQRCode(data) {
  const packet = decodePacket(data);
  
  if (!packet) return;
  
  if (packet.error === 'checksum_mismatch') {
    console.log('校验失败，忽略');
    return;
  }
  
  // 首次接收，初始化
  if (!fileName) {
    fileName = packet.fileName;
    totalChunks = packet.totalChunks;
    startTime = Date.now();
    
    document.getElementById('fileInfo').style.display = '';
    document.getElementById('fileName').textContent = fileName;
    document.getElementById('fileMeta').textContent = `共 ${totalChunks} 个分片`;
    document.getElementById('statTotal').textContent = totalChunks;
    
    createChunkGrid(totalChunks);
    console.log('开始接收:', fileName, '总分片:', totalChunks);
  }
  
  // 检查是否是同一个文件
  if (packet.fileName !== fileName || packet.totalChunks !== totalChunks) {
    return;
  }
  
  // 记录分片（去重）
  if (!receivedChunks.has(packet.index)) {
    receivedChunks.set(packet.index, packet.data);
    scanCount++;
    
    console.log('收到分片:', packet.index + 1, '/', totalChunks);
    
    updateProgress();
    markChunkReceived(packet.index);
    
    // 震动反馈（如果支持）
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
    
    // 检查是否完成
    if (receivedChunks.size === totalChunks) {
      completeTransfer();
    }
  }
}

// ========== UI 更新 ==========
function createChunkGrid(total) {
  const grid = document.getElementById('chunkGrid');
  grid.innerHTML = '';
  
  const maxDisplay = 100;
  const displayCount = Math.min(total, maxDisplay);
  
  for (let i = 0; i < displayCount; i++) {
    const dot = document.createElement('div');
    dot.className = 'chunk-dot';
    dot.id = 'chunk-' + i;
    grid.appendChild(dot);
  }
  
  if (total > maxDisplay) {
    const more = document.createElement('div');
    more.style.cssText = 'width:100%;text-align:center;color:#666;font-size:0.75rem;margin-top:8px;';
    more.textContent = `共 ${total} 个，显示前 ${maxDisplay} 个`;
    grid.appendChild(more);
  }
}

function markChunkReceived(index) {
  const dot = document.getElementById('chunk-' + index);
  if (dot) {
    dot.classList.add('received', 'latest');
    setTimeout(() => dot.classList.remove('latest'), 300);
  }
}

function updateProgress() {
  const received = receivedChunks.size;
  const progress = (received / totalChunks * 100).toFixed(1);
  
  document.getElementById('progressFill').style.width = progress + '%';
  document.getElementById('statReceived').textContent = received;
  
  if (startTime && scanCount > 0) {
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = (scanCount / elapsed).toFixed(1);
    document.getElementById('statSpeed').textContent = rate + '/s';
  }
  
  showStatus(`已接收 ${received}/${totalChunks} (${progress}%)`, 'scanning');
}

function showStatus(msg, type) {
  const el = document.getElementById('statusMsg');
  el.textContent = msg;
  el.className = 'status-msg ' + type;
}

// ========== 传输完成 ==========
function completeTransfer() {
  scanning = false;
  if (scanIntervalId) {
    clearInterval(scanIntervalId);
    scanIntervalId = null;
  }
  
  // 停止摄像头
  const stream = video.srcObject;
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  
  // 震动反馈
  if (navigator.vibrate) {
    navigator.vibrate([100, 50, 100]);
  }
  
  // 合并数据
  const fileData = mergeChunks(receivedChunks, totalChunks);
  if (!fileData) {
    showError('文件合并失败，请重试');
    return;
  }
  
  window.receivedFileData = fileData;
  window.receivedFileName = fileName;
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const fileSize = fileData.length;
  const rate = (fileSize / 1024 / parseFloat(duration)).toFixed(1);
  
  document.getElementById('scanSection').style.display = 'none';
  document.getElementById('completeSection').style.display = '';
  
  document.getElementById('completeFileName').textContent = fileName;
  document.getElementById('completeFileMeta').textContent = formatFileSize(fileSize);
  document.getElementById('statTotalChunks').textContent = totalChunks;
  document.getElementById('statDuration').textContent = duration + 's';
  document.getElementById('statRate').textContent = rate + ' KB/s';
}

// ========== 下载文件 ==========
function downloadFile() {
  if (!window.receivedFileData || !window.receivedFileName) return;
  
  const blob = new Blob([window.receivedFileData]);
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = window.receivedFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ========== 重置 ==========
function resetReceiver() {
  if (scanIntervalId) {
    clearInterval(scanIntervalId);
    scanIntervalId = null;
  }
  
  fileName = null;
  totalChunks = 0;
  receivedChunks.clear();
  startTime = null;
  scanCount = 0;
  scanAttempts = 0;
  lastDetectedTime = 0;
  
  window.receivedFileData = null;
  window.receivedFileName = null;
  
  document.getElementById('completeSection').style.display = 'none';
  document.getElementById('scanSection').style.display = '';
  document.getElementById('fileInfo').style.display = 'none';
  document.getElementById('chunkGrid').innerHTML = '';
  document.getElementById('progressFill').style.width = '0%';
  document.getElementById('statReceived').textContent = '0';
  document.getElementById('statTotal').textContent = '-';
  document.getElementById('statSpeed').textContent = '-';
  
  init();
}

// ========== 错误处理 ==========
function showError(msg) {
  if (scanIntervalId) {
    clearInterval(scanIntervalId);
    scanIntervalId = null;
  }
  document.getElementById('scanSection').style.display = 'none';
  document.getElementById('errorSection').style.display = '';
  document.getElementById('errorMsg').textContent = msg;
}

// 启动
init();

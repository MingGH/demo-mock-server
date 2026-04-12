// ========== 接收端逻辑 ==========

let video = null;
let canvas = null;
let ctx = null;
let scanning = false;
let animationId = null;

// 接收状态
let fileName = null;
let totalChunks = 0;
let receivedChunks = new Map(); // index -> data
let startTime = null;
let lastScanTime = null;
let scanCount = 0;

// ========== 初始化 ==========
async function init() {
  video = document.getElementById('video');
  canvas = document.getElementById('scanCanvas');
  ctx = canvas.getContext('2d', { willReadFrequently: true });
  
  document.getElementById('downloadBtn').addEventListener('click', downloadFile);
  document.getElementById('resetBtn').addEventListener('click', resetReceiver);
  
  try {
    await startCamera();
    startScanning();
  } catch (err) {
    showError('无法访问摄像头：' + err.message);
  }
}

// ========== 摄像头 ==========
async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'environment', // 优先后置摄像头
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  });
  
  video.srcObject = stream;
  await video.play();
  
  // 设置 canvas 尺寸
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
}

// ========== 扫描循环 ==========
function startScanning() {
  scanning = true;
  showStatus('正在扫描，请对准电脑屏幕上的二维码...', 'scanning');
  scanFrame();
}

function scanFrame() {
  if (!scanning) return;
  
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    // 绘制视频帧到 canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // 识别二维码
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert'
    });
    
    if (code && code.data) {
      handleQRCode(code.data);
    }
  }
  
  animationId = requestAnimationFrame(scanFrame);
}

// ========== 处理二维码数据 ==========
function handleQRCode(data) {
  const packet = decodePacket(data);
  
  if (!packet) return; // 不是我们的协议
  
  if (packet.error === 'checksum_mismatch') {
    // 校验失败，忽略
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
    
    // 创建分片指示器
    createChunkGrid(totalChunks);
  }
  
  // 检查是否是同一个文件
  if (packet.fileName !== fileName || packet.totalChunks !== totalChunks) {
    // 不同文件，忽略（或可以提示用户）
    return;
  }
  
  // 记录分片
  if (!receivedChunks.has(packet.index)) {
    receivedChunks.set(packet.index, packet.data);
    scanCount++;
    lastScanTime = Date.now();
    
    // 更新 UI
    updateProgress();
    markChunkReceived(packet.index);
    
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
  
  for (let i = 0; i < total; i++) {
    const dot = document.createElement('div');
    dot.className = 'chunk-dot';
    dot.id = 'chunk-' + i;
    dot.title = '分片 ' + (i + 1);
    grid.appendChild(dot);
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
  
  // 计算扫描速度
  if (startTime && scanCount > 1) {
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = (scanCount / elapsed).toFixed(1);
    document.getElementById('statSpeed').textContent = rate + '/s';
  }
  
  showStatus(`已接收 ${received}/${totalChunks} 个分片 (${progress}%)`, 'scanning');
}

function showStatus(msg, type) {
  const el = document.getElementById('statusMsg');
  el.textContent = msg;
  el.className = 'status-msg ' + type;
}

// ========== 传输完成 ==========
function completeTransfer() {
  scanning = false;
  cancelAnimationFrame(animationId);
  
  // 停止摄像头
  const stream = video.srcObject;
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  
  // 合并数据
  const fileData = mergeChunks(receivedChunks, totalChunks);
  if (!fileData) {
    showError('文件合并失败，请重试');
    return;
  }
  
  // 保存到全局供下载
  window.receivedFileData = fileData;
  window.receivedFileName = fileName;
  
  // 计算统计
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const fileSize = fileData.length;
  const rate = (fileSize / 1024 / parseFloat(duration)).toFixed(1);
  
  // 切换界面
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
  fileName = null;
  totalChunks = 0;
  receivedChunks.clear();
  startTime = null;
  scanCount = 0;
  
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
  
  // 重新启动摄像头
  init();
}

// ========== 错误处理 ==========
function showError(msg) {
  document.getElementById('scanSection').style.display = 'none';
  document.getElementById('errorSection').style.display = '';
  document.getElementById('errorMsg').textContent = msg;
}

// 启动
init();

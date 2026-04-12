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
let lastScanTime = null;
let scanCount = 0;
let scanAttempts = 0; // 总扫描次数（包括失败）

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
  
  // 等待视频尺寸确定
  await new Promise(resolve => {
    if (video.videoWidth > 0) {
      resolve();
    } else {
      video.addEventListener('loadedmetadata', resolve, { once: true });
    }
  });
  
  // 设置 canvas 尺寸
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  console.log('摄像头尺寸:', canvas.width, 'x', canvas.height);
}

// ========== 扫描循环 ==========
function startScanning() {
  scanning = true;
  showStatus('正在扫描，请对准电脑屏幕上的二维码...', 'scanning');
  
  // 使用 setInterval 而不是 requestAnimationFrame，确保稳定的扫描频率
  // 每 50ms 扫描一次（20fps），给 jsQR 足够的处理时间
  scanIntervalId = setInterval(scanFrame, 50);
}

function scanFrame() {
  if (!scanning) return;
  
  if (video.readyState !== video.HAVE_ENOUGH_DATA) {
    return;
  }
  
  scanAttempts++;
  
  // 绘制视频帧到 canvas
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  
  // 识别二维码
  try {
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert'
    });
    
    if (code && code.data) {
      handleQRCode(code.data);
    }
  } catch (e) {
    console.error('jsQR 错误:', e);
  }
}

// ========== 处理二维码数据 ==========
function handleQRCode(data) {
  const packet = decodePacket(data);
  
  if (!packet) {
    // 不是我们的协议，可能是其他二维码
    return;
  }
  
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
    
    // 创建分片指示器（限制最大显示数量）
    createChunkGrid(totalChunks);
    
    console.log('开始接收文件:', fileName, '总分片:', totalChunks);
  }
  
  // 检查是否是同一个文件
  if (packet.fileName !== fileName || packet.totalChunks !== totalChunks) {
    // 不同文件，忽略
    return;
  }
  
  // 记录分片（去重）
  if (!receivedChunks.has(packet.index)) {
    receivedChunks.set(packet.index, packet.data);
    scanCount++;
    lastScanTime = Date.now();
    
    console.log('收到分片:', packet.index + 1, '/', totalChunks);
    
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
  
  // 如果分片太多，只显示前 200 个 + 省略提示
  const maxDisplay = 200;
  const displayCount = Math.min(total, maxDisplay);
  
  for (let i = 0; i < displayCount; i++) {
    const dot = document.createElement('div');
    dot.className = 'chunk-dot';
    dot.id = 'chunk-' + i;
    dot.title = '分片 ' + (i + 1);
    grid.appendChild(dot);
  }
  
  if (total > maxDisplay) {
    const more = document.createElement('div');
    more.style.cssText = 'width:100%;text-align:center;color:#666;font-size:0.8rem;margin-top:8px;';
    more.textContent = `... 共 ${total} 个分片，仅显示前 ${maxDisplay} 个`;
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
  if (scanIntervalId) {
    clearInterval(scanIntervalId);
    scanIntervalId = null;
  }
  
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

// ========== 发送端逻辑 ==========

let selectedFile = null;
let chunks = [];
let currentIndex = 0;
let isPlaying = false;
let playInterval = null;
let loopCount = 1;
let playSpeed = 200;

// ========== 初始化 ==========
function init() {
  // 检查 QRCode 库是否加载
  if (typeof QRCode === 'undefined') {
    console.error('QRCode 库未加载');
    return;
  }
  console.log('QRCode 库已加载');
  
  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('fileInput');
  
  // 阻止整个页面的拖拽默认行为（防止浏览器打开文件）
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => e.preventDefault());
  
  // 点击上传
  uploadArea.addEventListener('click', () => fileInput.click());
  
  // 拖拽上传
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.add('dragover');
  });
  uploadArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.remove('dragover');
  });
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.remove('dragover');
    console.log('拖拽文件:', e.dataTransfer.files);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });
  
  // 文件选择
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  });
  
  // 分片大小滑块
  document.getElementById('chunkSize').addEventListener('input', (e) => {
    document.getElementById('chunkSizeVal').textContent = e.target.value + ' 字节';
    if (selectedFile) {
      updateFileInfo();
    }
  });
  
  // 开始按钮
  document.getElementById('startBtn').addEventListener('click', startTransfer);
  
  // 播放速度滑块
  document.getElementById('speedSlider').addEventListener('input', (e) => {
    playSpeed = parseInt(e.target.value);
    document.getElementById('speedVal').textContent = playSpeed + 'ms';
    if (isPlaying) {
      clearInterval(playInterval);
      playInterval = setInterval(showNextChunk, playSpeed);
    }
    updateStats();
  });
  
  // 控制按钮
  document.getElementById('pauseBtn').addEventListener('click', togglePause);
  document.getElementById('restartBtn').addEventListener('click', restartTransfer);
  document.getElementById('newFileBtn').addEventListener('click', selectNewFile);
  
  // 示例文件按钮
  document.getElementById('demoBtn').addEventListener('click', loadDemoFile);
  
  // 生成接收端二维码
  generateReceiverQR();
}

// ========== 文件处理 ==========
function handleFile(file) {
  console.log('handleFile 被调用:', file.name, file.size);
  selectedFile = file;
  document.getElementById('fileInfo').style.display = '';
  document.getElementById('fileName').textContent = file.name;
  updateFileInfo();
  document.getElementById('startBtn').disabled = false;
}

// ========== 示例文件 ==========
function loadDemoFile() {
  const demoText = `二维码文件传输演示

这是一个示例文本文件，用于演示二维码传输功能。

原理：
1. 文件被切分成多个小块（约500字节）
2. 每个小块编码成一个二维码
3. 二维码循环播放，手机扫描接收
4. 收集完所有分片后合并还原

特点：
- 纯前端实现，无需服务器
- 离线可用，适合隔离网络
- 支持任意文件类型

适用场景：
- 传输密钥、配置文件
- 无网络环境下的小文件分享
- 展示「信息可以用光传输」的原理

—— 数字直觉 numfeel.996.ninja`;

  const blob = new Blob([demoText], { type: 'text/plain' });
  const file = new File([blob], 'demo.txt', { type: 'text/plain' });
  handleFile(file);
}

function updateFileInfo() {
  const chunkSize = parseInt(document.getElementById('chunkSize').value);
  const estimatedChunks = Math.ceil(selectedFile.size * 1.37 / chunkSize); // Base64 膨胀约 37%
  const estimatedTime = (estimatedChunks * playSpeed / 1000).toFixed(1);
  
  document.getElementById('fileMeta').textContent = 
    `${formatFileSize(selectedFile.size)} · 约 ${estimatedChunks} 个二维码 · 预计 ${estimatedTime} 秒`;
}

// ========== 开始传输 ==========
async function startTransfer() {
  let chunkSize = parseInt(document.getElementById('chunkSize').value);
  
  // 读取文件
  const buffer = await selectedFile.arrayBuffer();
  chunks = encodeFile(buffer, selectedFile.name, chunkSize);
  
  // 检查第一个分片长度，如果太长则自动调整
  if (chunks.length > 0 && chunks[0].length > 1200) {
    // 数据包太长，自动降低分片大小
    const ratio = 1200 / chunks[0].length;
    chunkSize = Math.floor(chunkSize * ratio * 0.9); // 留 10% 余量
    chunkSize = Math.max(200, chunkSize); // 最小 200
    console.log('自动调整分片大小为:', chunkSize);
    chunks = encodeFile(buffer, selectedFile.name, chunkSize);
  }
  
  console.log('分片数:', chunks.length, '第一个分片长度:', chunks[0]?.length);
  
  // 切换界面
  document.getElementById('selectSection').style.display = 'none';
  document.getElementById('transferSection').style.display = '';
  
  // 显示文件信息
  document.getElementById('txFileName').textContent = selectedFile.name;
  document.getElementById('txFileMeta').textContent = 
    `${formatFileSize(selectedFile.size)} · ${chunks.length} 个分片`;
  document.getElementById('totalChunks').textContent = chunks.length;
  
  // 开始播放
  currentIndex = 0;
  loopCount = 1;
  isPlaying = true;
  showCurrentChunk();
  playInterval = setInterval(showNextChunk, playSpeed);
  updatePauseButton();
  updateStats();
}

// ========== 二维码显示 ==========
function showCurrentChunk() {
  const canvas = document.getElementById('qrCanvas');
  const data = chunks[currentIndex];
  
  // 清空 canvas
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  QRCode.toCanvas(canvas, data, {
    width: 300,
    margin: 2,
    errorCorrectionLevel: 'L', // 低纠错，容量更大
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  }, function(err) {
    if (err) {
      console.error('QR生成失败:', err.message || err);
      console.error('数据长度:', data.length, '字符');
      // 显示错误提示
      ctx.fillStyle = '#ff4444';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('数据过长，请减小分片大小', 150, 140);
      ctx.fillText('当前: ' + data.length + ' 字符', 150, 160);
    }
  });
  
  document.getElementById('currentChunk').textContent = currentIndex + 1;
  
  // 更新进度条
  const progress = ((currentIndex + 1) / chunks.length * 100).toFixed(1);
  document.getElementById('progressFill').style.width = progress + '%';
}

function showNextChunk() {
  currentIndex++;
  if (currentIndex >= chunks.length) {
    currentIndex = 0;
    loopCount++;
    document.getElementById('statLoop').textContent = loopCount;
  }
  showCurrentChunk();
}

// ========== 控制 ==========
function togglePause() {
  isPlaying = !isPlaying;
  if (isPlaying) {
    playInterval = setInterval(showNextChunk, playSpeed);
  } else {
    clearInterval(playInterval);
  }
  updatePauseButton();
}

function updatePauseButton() {
  const btn = document.getElementById('pauseBtn');
  if (isPlaying) {
    btn.innerHTML = '<i class="ti ti-player-pause"></i> 暂停';
  } else {
    btn.innerHTML = '<i class="ti ti-player-play"></i> 继续';
  }
}

function restartTransfer() {
  currentIndex = 0;
  loopCount = 1;
  document.getElementById('statLoop').textContent = 1;
  showCurrentChunk();
  if (!isPlaying) {
    togglePause();
  }
}

function selectNewFile() {
  clearInterval(playInterval);
  isPlaying = false;
  chunks = [];
  selectedFile = null;
  
  document.getElementById('transferSection').style.display = 'none';
  document.getElementById('selectSection').style.display = '';
  document.getElementById('fileInfo').style.display = 'none';
  document.getElementById('startBtn').disabled = true;
  document.getElementById('fileInput').value = '';
}

function updateStats() {
  document.getElementById('statSpeed').textContent = playSpeed + 'ms';
  const eta = (chunks.length * playSpeed / 1000).toFixed(1);
  document.getElementById('statEta').textContent = eta + 's';
}

// ========== 接收端二维码 ==========
function generateReceiverQR() {
  const url = 'https://numfeel.996.ninja/pages/qr-file-transfer/receiver.html';
  const container = document.getElementById('receiverQr');
  
  QRCode.toCanvas(document.createElement('canvas'), url, {
    width: 120,
    margin: 1
  }, (err, canvas) => {
    if (!err) {
      container.appendChild(canvas);
    }
  });
}

function copyReceiverUrl() {
  const url = document.getElementById('receiverUrl').textContent;
  navigator.clipboard.writeText(url).then(() => {
    // 简单反馈
    const btn = event.target.closest('button');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="ti ti-check"></i> 已复制';
    setTimeout(() => {
      btn.innerHTML = originalHtml;
    }, 1500);
  });
}

// 启动
init();

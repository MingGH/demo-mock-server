/**
 * 照片隐私泄露检测器 — 交互逻辑
 * 支持 JPEG, PNG, HEIC, TIFF, WebP, AVIF
 */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  let currentBuffer = null;
  let currentFileName = '';
  let currentFileType = '';

  // ── Tab 切换 ──
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $('#tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  // ── 平台对比表 ──
  const tbody = $('#platformTable tbody');
  ExifParser.PLATFORM_EXIF_POLICY.forEach(p => {
    const tr = document.createElement('tr');
    const riskLabel = p.risk === 'safe' ? '安全' : p.risk === 'warn' ? '注意' : '危险';
    tr.innerHTML = `
      <td style="color:#fff;font-weight:500;">${p.name}</td>
      <td>${p.note}</td>
      <td><span class="badge ${p.risk}">${riskLabel}</span></td>
    `;
    tbody.appendChild(tr);
  });

  // ── 文件上传 ──
  const uploadZone = $('#uploadZone');
  const fileInput = $('#fileInput');

  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
  uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) handleFile(fileInput.files[0]);
  });

  function handleFile(file) {
    // 检查格式支持
    if (!ExifParser.isSupported(file)) {
      alert('不支持的文件格式。支持：JPEG、PNG、HEIC、TIFF、WebP、AVIF');
      return;
    }
    currentFileName = file.name;
    currentFileType = file.type || guessType(file.name);

    const reader = new FileReader();
    reader.onload = async (e) => {
      currentBuffer = e.target.result;
      await analyzeExif(currentBuffer);
    };
    reader.readAsArrayBuffer(file);
  }

  function guessType(name) {
    const ext = (name || '').split('.').pop().toLowerCase();
    const map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', heif: 'image/heif', tiff: 'image/tiff', tif: 'image/tiff', webp: 'image/webp', avif: 'image/avif' };
    return map[ext] || 'image/jpeg';
  }

  // ── 分析 EXIF ──
  async function analyzeExif(buffer) {
    try {
      const result = await ExifParser.parse(buffer);
      renderResult(result);
      $('#resultArea').classList.add('show');
      uploadZone.style.display = 'none';
    } catch (e) {
      alert('解析失败: ' + e.message);
    }
  }

  function renderResult(result) {
    // 警告横幅
    const banner = $('#alertBanner');
    if (result.gps) {
      banner.innerHTML = `
        <div class="alert-banner danger">
          <i class="ti ti-alert-triangle"></i>
          <div class="alert-banner-text">
            <h3>这张照片暴露了你的精确位置</h3>
            <p>GPS 坐标已嵌入照片文件中。任何拿到这张原图的人，都能知道你在哪里拍的。</p>
          </div>
        </div>`;
    } else if (result.hasExif) {
      banner.innerHTML = `
        <div class="alert-banner danger" style="border-color:rgba(245,158,11,0.3);background:rgba(245,158,11,0.08);">
          <i class="ti ti-alert-circle" style="color:#f59e0b;"></i>
          <div class="alert-banner-text">
            <h3>照片包含设备和拍摄信息</h3>
            <p>没有 GPS 坐标，但设备型号、拍摄时间等信息仍然暴露。</p>
          </div>
        </div>`;
    } else {
      banner.innerHTML = `
        <div class="alert-banner safe">
          <i class="ti ti-shield-check"></i>
          <div class="alert-banner-text">
            <h3>这张照片是干净的</h3>
            <p>未检测到 EXIF 元数据。可能已经被平台剥离，或者拍摄时未记录。</p>
          </div>
        </div>`;
    }

    // 统计卡片
    const stats = $('#statCards');
    const leakCount = countLeaks(result);
    stats.innerHTML = `
      <div class="stat-card">
        <div class="stat-num ${result.gps ? 'danger' : 'safe'}">${result.gps ? '是' : '否'}</div>
        <div class="stat-label">GPS 坐标泄露</div>
      </div>
      <div class="stat-card">
        <div class="stat-num ${leakCount > 0 ? 'danger' : 'safe'}">${leakCount}</div>
        <div class="stat-label">泄露的信息项</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${result.rawTagCount}</div>
        <div class="stat-label">EXIF 标签总数</div>
      </div>
    `;

    renderMap(result.gps);
    renderDataList(result);

    // 更新清除按钮状态
    const isJpeg = currentFileType.includes('jpeg') || currentFileType.includes('jpg');
    const stripBtn = $('#stripBtn');
    if (isJpeg) {
      stripBtn.style.display = '';
      stripBtn.title = '';
    } else {
      // 非 JPEG 格式：提示用截图方式
      stripBtn.style.display = '';
      stripBtn.innerHTML = '<i class="ti ti-info-circle"></i> 非 JPEG 格式，建议截图代替原图';
      stripBtn.disabled = true;
      stripBtn.title = 'EXIF 清除目前仅支持 JPEG 格式。对于 HEIC/PNG 等格式，建议截图后分享。';
    }
  }

  function countLeaks(result) {
    let count = 0;
    if (result.gps) count += 2;
    if (result.device) count += Object.keys(result.device).filter(k => result.device[k]).length;
    if (result.datetime) count++;
    if (result.camera) count += Object.keys(result.camera).length;
    if (result.dimensions) count++;
    return count;
  }

  function renderMap(gps) {
    const container = $('#mapContainer');
    const coordsEl = $('#gpsCoords');

    if (!gps) {
      container.innerHTML = '<div class="map-placeholder"><i class="ti ti-map-pin-off" style="margin-right:8px;"></i> 未检测到 GPS 坐标</div>';
      coordsEl.style.display = 'none';
      return;
    }

    const lat = parseFloat(gps.latitude.toFixed(6));
    const lng = parseFloat(gps.longitude.toFixed(6));
    const delta = 0.006;
    const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;

    container.innerHTML = `<iframe src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}" loading="lazy" style="width:100%;height:100%;border:none;"></iframe>`;

    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

    coordsEl.style.display = 'block';
    coordsEl.innerHTML = `
      <i class="ti ti-map-pin" style="color:#ef4444;"></i>
      <strong>纬度:</strong> ${lat}° &nbsp;
      <strong>经度:</strong> ${lng}°
      ${gps.altitude ? `&nbsp; <strong>海拔:</strong> ${Math.round(gps.altitude)}m` : ''}
      &nbsp;
      <a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" style="color:#f5af19;text-decoration:none;font-weight:600;">
        <i class="ti ti-external-link" style="font-size:0.85em;"></i> 在 Google Maps 中查看
      </a>
    `;
  }

  function renderDataList(result) {
    const list = $('#dataList');
    list.innerHTML = '';

    const items = [];

    if (result.gps) {
      items.push({ label: 'GPS 纬度', value: result.gps.latitude.toFixed(6) + '°', danger: true });
      items.push({ label: 'GPS 经度', value: result.gps.longitude.toFixed(6) + '°', danger: true });
      if (result.gps.altitude) items.push({ label: '海拔', value: Math.round(result.gps.altitude) + 'm', danger: true });
    }

    if (result.device) {
      if (result.device.make) items.push({ label: '设备厂商', value: result.device.make });
      if (result.device.model) items.push({ label: '设备型号', value: result.device.model });
      if (result.device.software) items.push({ label: '系统版本', value: result.device.software });
    }

    if (result.datetime) {
      items.push({ label: '拍摄时间', value: result.datetime.formatted });
    }

    if (result.camera) {
      if (result.camera.focalLength) items.push({ label: '焦距', value: result.camera.focalLength });
      if (result.camera.aperture) items.push({ label: '光圈', value: result.camera.aperture });
      if (result.camera.exposureTime) items.push({ label: '快门速度', value: result.camera.exposureTime });
      if (result.camera.iso) items.push({ label: 'ISO', value: result.camera.iso });
      if (result.camera.flash) items.push({ label: '闪光灯', value: result.camera.flash });
      if (result.camera.lens) items.push({ label: '镜头', value: result.camera.lens });
    }

    if (result.dimensions) {
      items.push({ label: '原始尺寸', value: result.dimensions.width + ' × ' + result.dimensions.height + ' px' });
    }

    // 显示文件格式
    const ext = currentFileName.split('.').pop().toUpperCase();
    items.push({ label: '文件格式', value: ext });

    if (items.length === 0) {
      list.innerHTML = '<div style="text-align:center;color:#64748b;padding:20px;">未检测到可读取的元数据</div>';
      return;
    }

    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'data-row';
      row.innerHTML = `
        <span class="data-label">${item.label}</span>
        <span class="data-value ${item.danger ? 'danger' : ''}">${item.value}</span>
      `;
      list.appendChild(row);
    });
  }

  // ── 清除 EXIF 并下载（仅 JPEG）──
  $('#stripBtn').addEventListener('click', () => {
    if (!currentBuffer) return;
    const isJpeg = currentFileType.includes('jpeg') || currentFileType.includes('jpg');
    if (!isJpeg) return;

    const cleaned = ExifParser.stripExif(currentBuffer);
    const blob = new Blob([cleaned], { type: 'image/jpeg' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = currentFileName.replace(/\.[^.]+$/, '');
    a.download = baseName + '_cleaned.jpg';
    a.click();
    URL.revokeObjectURL(url);
  });

  // ── 重置 ──
  $('#resetBtn').addEventListener('click', () => {
    currentBuffer = null;
    currentFileName = '';
    currentFileType = '';
    fileInput.value = '';
    $('#resultArea').classList.remove('show');
    uploadZone.style.display = '';
    const sb = $('#stripBtn');
    sb.innerHTML = '<i class="ti ti-eraser"></i> 一键清除元数据并下载';
    sb.disabled = false;
  });

  // ══════════════════════════════════════════════════════════
  //  批量清除 Tab
  // ══════════════════════════════════════════════════════════

  const stripUploadZone = $('#stripUploadZone');
  const stripFileInput = $('#stripFileInput');
  const stripResult = $('#stripResult');
  const stripFileList = $('#stripFileList');
  let cleanedFiles = [];

  stripUploadZone.addEventListener('click', () => stripFileInput.click());
  stripUploadZone.addEventListener('dragover', e => { e.preventDefault(); stripUploadZone.classList.add('drag-over'); });
  stripUploadZone.addEventListener('dragleave', () => stripUploadZone.classList.remove('drag-over'));
  stripUploadZone.addEventListener('drop', e => {
    e.preventDefault();
    stripUploadZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) handleBatchFiles(e.dataTransfer.files);
  });
  stripFileInput.addEventListener('change', () => {
    if (stripFileInput.files.length > 0) handleBatchFiles(stripFileInput.files);
  });

  async function handleBatchFiles(fileList) {
    const files = Array.from(fileList).filter(f => ExifParser.isSupported(f));
    if (files.length === 0) { alert('没有支持的图片文件'); return; }

    cleanedFiles = [];
    stripUploadZone.style.display = 'none';
    stripResult.style.display = 'block';
    stripFileList.innerHTML = '<div class="strip-processing"><i class="ti ti-loader"></i> 正在处理 ' + files.length + ' 张照片...</div>';

    const items = [];
    for (const file of files) {
      try {
        const r = await stripSingleFile(file);
        items.push(r);
        cleanedFiles.push(r);
      } catch (e) {
        // 即使图片转换失败，也尝试读取 EXIF 信息
        let exifSummary = '';
        try {
          const buf = await file.arrayBuffer();
          const parsed = await ExifParser.parse(buf);
          const parts = [];
          if (parsed.gps) parts.push('GPS: ' + parsed.gps.latitude.toFixed(4) + '°, ' + parsed.gps.longitude.toFixed(4) + '°');
          if (parsed.device && parsed.device.model) parts.push(parsed.device.model);
          if (parsed.datetime) parts.push(parsed.datetime.formatted);
          exifSummary = parts.join(' · ');
        } catch (ex) { /* ignore */ }
        items.push({ name: file.name, error: e.message, exifSummary });
      }
    }
    renderStripResults(items);
  }

  async function stripSingleFile(file) {
    const buffer = await file.arrayBuffer();
    const ext = file.name.split('.').pop().toLowerCase();
    const isJpeg = ext === 'jpg' || ext === 'jpeg';
    const baseName = file.name.replace(/\.[^.]+$/, '');

    let hadGps = false;
    let tagCount = 0;
    try {
      const parsed = await ExifParser.parse(buffer);
      hadGps = !!parsed.gps;
      tagCount = parsed.rawTagCount;
    } catch (e) { /* ignore */ }

    let blob, outName;
    if (isJpeg) {
      const cleaned = ExifParser.stripExif(buffer);
      blob = new Blob([cleaned], { type: 'image/jpeg' });
      outName = baseName + '_cleaned.jpg';
    } else {
      blob = await canvasStrip(file);
      outName = baseName + '_cleaned.png';
    }

    const url = URL.createObjectURL(blob);
    // 缩略图：HEIC 浏览器不能直接显示，用清理后的 blob 做缩略图
    const ext2 = file.name.split('.').pop().toLowerCase();
    const isHeic2 = ext2 === 'heic' || ext2 === 'heif';
    const thumbUrl = isHeic2 ? URL.createObjectURL(blob) : URL.createObjectURL(file);
    return { name: file.name, outName, originalSize: file.size, cleanedSize: blob.size, hadGps, tagCount, blob, url, thumbUrl, method: isJpeg ? '二进制剥离' : 'Canvas 重绘' };
  }

  function canvasStrip(file) {
    return new Promise(async (resolve, reject) => {
      let blobForImg = file;
      const ext = file.name.split('.').pop().toLowerCase();
      const isHeic = ext === 'heic' || ext === 'heif';

      // HEIC 浏览器不能直接渲染，先转成 JPEG
      if (isHeic && typeof heic2any !== 'undefined') {
        try {
          const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
          blobForImg = Array.isArray(converted) ? converted[0] : converted;
        } catch (e) {
          // heic2any 失败时，尝试直接用 Image 加载（Safari 支持）
          // 如果也失败，返回一个提示
          console.warn('heic2any 转换失败，尝试直接加载:', e);
        }
      }

      const img = new Image();
      const objUrl = URL.createObjectURL(blobForImg);
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        URL.revokeObjectURL(objUrl);
        c.toBlob(b => b ? resolve(b) : reject(new Error('Canvas 导出失败')), 'image/jpeg', 0.92);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objUrl);
        if (isHeic) {
          reject(new Error('HEIC 转换失败，请在 iPhone 设置中改为「兼容性最强」格式（JPEG），或用 Safari 打开本页'));
        } else {
          reject(new Error('图片加载失败'));
        }
      };
      img.src = objUrl;
    });
  }

  function renderStripResults(items) {
    stripFileList.innerHTML = '';
    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'strip-file-item';
      if (item.error) {
        const isHeicErr = item.error.includes('HEIC') || item.error.includes('Safari');
        div.innerHTML = `
          <div style="width:44px;height:44px;border-radius:8px;background:rgba(239,68,68,0.1);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i class="ti ti-alert-circle" style="color:#ef4444;"></i>
          </div>
          <div class="file-info">
            <span class="file-name">${item.name}</span>
            <span class="file-meta" style="color:#ef4444;">${item.error}</span>
            ${item.exifSummary ? '<span class="file-meta" style="color:#f59e0b;">EXIF 已检测到: ' + item.exifSummary + '</span>' : ''}
          </div>`;
      } else {
        div.innerHTML = `
          <img class="file-thumb" src="${item.thumbUrl}" alt="">
          <div class="file-info">
            <span class="file-name">${item.name}</span>
            <span class="file-meta">
              ${item.hadGps ? '<span style="color:#ef4444;">GPS 已清除</span> · ' : ''}${item.tagCount} 个标签已清除 · ${item.method} · ${fmtSize(item.cleanedSize)}
            </span>
          </div>
          <span class="file-status"><span class="badge safe">已清除</span></span>
          <button class="file-download" title="下载" data-out="${item.outName}"><i class="ti ti-download"></i></button>`;
      }
      stripFileList.appendChild(div);
    });

    // 单个下载事件委托
    stripFileList.querySelectorAll('.file-download[data-out]').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = cleanedFiles.find(f => f.outName === btn.dataset.out);
        if (!item) return;
        const a = document.createElement('a');
        a.href = item.url; a.download = item.outName; a.click();
      });
    });
  }

  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  $('#downloadAllBtn').addEventListener('click', () => {
    cleanedFiles.forEach((item, i) => {
      setTimeout(() => { const a = document.createElement('a'); a.href = item.url; a.download = item.outName; a.click(); }, i * 300);
    });
  });

  $('#stripResetBtn').addEventListener('click', () => {
    cleanedFiles.forEach(f => { if (f.url) URL.revokeObjectURL(f.url); if (f.thumbUrl) URL.revokeObjectURL(f.thumbUrl); });
    cleanedFiles = [];
    stripFileInput.value = '';
    stripResult.style.display = 'none';
    stripUploadZone.style.display = '';
  });

})();

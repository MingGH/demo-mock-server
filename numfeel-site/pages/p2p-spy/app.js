// ========== P2P 隐私透视镜 ==========
const API = 'https://numfeel-api.996.ninja/p2p';
let currentData = null;
let mapCanvas, mapCtx;

// ========== 初始化 ==========
async function init() {
  mapCanvas = document.getElementById('worldMap');
  mapCtx = mapCanvas.getContext('2d');
  resizeMap();
  window.addEventListener('resize', resizeMap);

  initTradeoffSlider();
  await loadTorrents();
  await loadPeers(0);
}

function resizeMap() {
  const rect = mapCanvas.parentElement.getBoundingClientRect();
  mapCanvas.width = rect.width * window.devicePixelRatio;
  mapCanvas.height = rect.height * window.devicePixelRatio;
  mapCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
  if (currentData) drawMap(currentData.allPeers);
}


// ========== 加载 torrent 列表 ==========
async function loadTorrents() {
  try {
    const res = await fetch(API + '/torrents');
    const json = await res.json();
    if (json.status !== 200) throw new Error(json.message);
    renderTorrentSelector(json.data);
  } catch (e) {
    // 如果后端不可用，用内置数据
    renderTorrentSelector([
      { index: 0, name: 'Ubuntu 24.04 Desktop ISO', infohash: '0a1b...8a9b' },
      { index: 1, name: 'Blender 4.2 LTS', infohash: '1a2b...9a0b' },
      { index: 2, name: 'LibreOffice 24.8', infohash: '2b3c...0b1c' }
    ]);
    // 使用本地模拟数据
    loadLocalFallback(0);
  }
}

function renderTorrentSelector(torrents) {
  const container = document.getElementById('torrentSelector');
  container.innerHTML = '';
  torrents.forEach((t, i) => {
    const btn = document.createElement('button');
    btn.className = 'torrent-btn' + (i === 0 ? ' active' : '');
    btn.innerHTML = `<i class="ti ti-file-download"></i> ${t.name}`;
    btn.onclick = () => selectTorrent(i, btn);
    container.appendChild(btn);
  });
}

async function selectTorrent(index, btn) {
  document.querySelectorAll('.torrent-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  await loadPeers(index);
}


// ========== 加载 peer 数据 ==========
async function loadPeers(index) {
  try {
    const res = await fetch(API + '/peers?index=' + index);
    const json = await res.json();
    if (json.status !== 200) throw new Error(json.message);
    currentData = json.data;
    renderAll(currentData);
  } catch (e) {
    loadLocalFallback(index);
  }
}

function loadLocalFallback(index) {
  // 生成本地模拟数据
  const names = ['ubuntu-24.04.2-desktop-amd64.iso', 'blender-4.2.0-linux-x64.tar.xz', 'LibreOffice_24.8.0_Linux_x86-64_deb.tar.gz'];
  const counts = [1247, 356, 218];
  const peers = generateLocalPeers(counts[index] || 1247);
  currentData = {
    torrentName: names[index] || names[0],
    infohash: '0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b',
    totalPeers: peers.length,
    countryDistribution: countPeersPerCountry(peers),
    sampleLog: peers.slice(0, 20),
    allPeers: peers,
    updatedAt: Date.now()
  };
  renderAll(currentData);
}

function renderAll(data) {
  // Hero section
  animateNumber(document.getElementById('heroNumber'), data.totalPeers);
  document.getElementById('heroTorrent').textContent = data.torrentName;
  const timeStr = new Date(data.updatedAt).toLocaleTimeString('zh-CN');
  const sourceTag = data.source === 'dht' ? ' (DHT 实时数据)' : ' (基于真实分布模拟)';
  document.getElementById('updateTime').textContent = '数据更新于 ' + timeStr + sourceTag;

  // Map
  drawMap(data.allPeers);

  // Country distribution
  renderCountryGrid(data.countryDistribution, data.totalPeers);

  // Spy log
  renderSpyLog(data.sampleLog);
}


// ========== 世界地图绘制 ==========
function drawMap(peers) {
  const w = mapCanvas.width / window.devicePixelRatio;
  const h = mapCanvas.height / window.devicePixelRatio;
  mapCtx.clearRect(0, 0, w, h);

  // 绘制简化世界轮廓（用矩形网格暗示大陆）
  drawWorldOutline(w, h);

  // 绘制 peer 点
  peers.forEach((peer, i) => {
    const x = lngToX(peer.lng, w);
    const y = latToY(peer.lat, h);

    // 外发光
    mapCtx.beginPath();
    mapCtx.arc(x, y, 4, 0, Math.PI * 2);
    mapCtx.fillStyle = 'rgba(255, 215, 0, 0.15)';
    mapCtx.fill();

    // 内核
    mapCtx.beginPath();
    mapCtx.arc(x, y, 1.5, 0, Math.PI * 2);
    mapCtx.fillStyle = 'rgba(255, 215, 0, 0.8)';
    mapCtx.fill();
  });
}

function drawWorldOutline(w, h) {
  // 简化大陆轮廓用浅色填充
  mapCtx.fillStyle = 'rgba(255,255,255,0.03)';
  // 北美
  fillRect(0.08, 0.15, 0.25, 0.35, w, h);
  // 南美
  fillRect(0.18, 0.52, 0.12, 0.35, w, h);
  // 欧洲
  fillRect(0.42, 0.12, 0.12, 0.2, w, h);
  // 非洲
  fillRect(0.42, 0.35, 0.14, 0.35, w, h);
  // 亚洲
  fillRect(0.55, 0.1, 0.3, 0.4, w, h);
  // 澳大利亚
  fillRect(0.75, 0.6, 0.12, 0.15, w, h);

  // 赤道线
  mapCtx.strokeStyle = 'rgba(255,255,255,0.04)';
  mapCtx.lineWidth = 0.5;
  mapCtx.setLineDash([4, 4]);
  mapCtx.beginPath();
  mapCtx.moveTo(0, h * 0.5);
  mapCtx.lineTo(w, h * 0.5);
  mapCtx.stroke();
  mapCtx.setLineDash([]);
}

function fillRect(xPct, yPct, wPct, hPct, canvasW, canvasH) {
  mapCtx.fillRect(xPct * canvasW, yPct * canvasH, wPct * canvasW, hPct * canvasH);
}

function lngToX(lng, width) {
  return ((lng + 180) / 360) * width;
}

function latToY(lat, height) {
  // Mercator-like projection (simplified)
  const latRad = lat * Math.PI / 180;
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  const clampedMerc = Math.max(-Math.PI, Math.min(Math.PI, mercN));
  return (0.5 - clampedMerc / (2 * Math.PI)) * height;
}


// ========== 国家分布渲染 ==========
function renderCountryGrid(dist, total) {
  const grid = document.getElementById('countryGrid');
  grid.innerHTML = '';
  const entries = Object.entries(dist).sort((a, b) => b[1] - a[1]).slice(0, 12);

  entries.forEach(([country, count]) => {
    const pct = ((count / total) * 100).toFixed(1);
    const flag = countryFlag(country);
    const div = document.createElement('div');
    div.className = 'country-bar';
    div.innerHTML = `
      <span class="flag">${flag}</span>
      <span class="name">${country}</span>
      <span class="count">${count} (${pct}%)</span>
    `;
    grid.appendChild(div);
  });
}

function countryFlag(name) {
  const flags = {
    'United States': '🇺🇸', 'Germany': '🇩🇪', 'France': '🇫🇷',
    'United Kingdom': '🇬🇧', 'Brazil': '🇧🇷', 'Canada': '🇨🇦',
    'Netherlands': '🇳🇱', 'India': '🇮🇳', 'Russia': '🇷🇺',
    'Japan': '🇯🇵', 'Australia': '🇦🇺', 'South Korea': '🇰🇷',
    'Sweden': '🇸🇪', 'Poland': '🇵🇱', 'Italy': '🇮🇹',
    'Spain': '🇪🇸', 'China': '🇨🇳', 'Ukraine': '🇺🇦',
    'Romania': '🇷🇴', 'Argentina': '🇦🇷', 'South Africa': '🇿🇦'
  };
  return flags[name] || '🌍';
}

// ========== 监控日志渲染 ==========
function renderSpyLog(sampleLog) {
  const container = document.getElementById('logEntries');
  container.innerHTML = '';

  sampleLog.forEach((peer, i) => {
    const time = new Date(peer.discoveredAt).toLocaleTimeString('zh-CN');
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.style.animationDelay = (i * 0.05) + 's';
    entry.innerHTML = `
      <span class="log-time">[${time}]</span>
      <span class="log-ip">${peer.ip}:${peer.port}</span>
      <span class="log-country"> ${peer.country}</span>
      <span class="log-port"> — 正在下载 infohash:${currentData.infohash.substring(0, 8)}…</span>
    `;
    container.appendChild(entry);
  });
}


// ========== Trade-off 滑块 ==========
function initTradeoffSlider() {
  const slider = document.getElementById('tradeoffSlider');
  slider.addEventListener('input', updateTradeoff);
  updateTradeoff();
}

function updateTradeoff() {
  const val = parseInt(document.getElementById('tradeoffSlider').value);
  const result = document.getElementById('tradeoffResult');

  const scenarios = [
    { max: 10, title: 'Tor + BT', speed: '50 KB/s', anon: '高', desc: '三层洋葱路由，每一跳都加密。速度约为直连的 1/200。实际上 Tor 官方明确反对在其上跑 BT，因为会拖垮整个网络。' },
    { max: 25, title: 'I2P 网络', speed: '200 KB/s', anon: '较高', desc: '大蒜路由，每个包走不同路径。比 Tor 快一些但仍然很慢，且做种者极少，资源匮乏。' },
    { max: 45, title: 'VPN + BT', speed: '5 MB/s', anon: '中等', desc: 'VPN 隐藏真实 IP，但 VPN 提供商有完整日志。peer 看到的是 VPN 出口 IP，内容仍然可见。多国政府可依法要求 VPN 公司交出记录。' },
    { max: 65, title: '协议加密（PE/MSE）', speed: '15 MB/s', anon: '低', desc: '流量加密让 ISP 无法识别 BT 协议（绕过限速）。但同 swarm 的 peer 照样看到你的 IP 和下载内容——只是 ISP 看不到。' },
    { max: 85, title: '标准 BT 下载', speed: '30 MB/s', anon: '无', desc: '默认状态。你的 IP 在 DHT 网络中公开可查，所有 peer 都能看到你在下什么。任何人放一个节点就能记录。' },
    { max: 100, title: '开启 DHT + PEX + UPnP', speed: '50+ MB/s', anon: '负（主动暴露）', desc: '启用所有加速特性：DHT 广播你的存在，PEX 让 peer 互相分享你的信息，UPnP 自动打开端口。速度最快，暴露最彻底。' }
  ];

  const scenario = scenarios.find(s => val <= s.max) || scenarios[scenarios.length - 1];
  result.innerHTML = `
    <strong style="color:#ffd700;">${scenario.title}</strong><br>
    <span style="color:#81c784;">速度：${scenario.speed}</span> &nbsp;|&nbsp;
    <span style="color:#ff6b6b;">匿名性：${scenario.anon}</span><br>
    <span style="color:#a0a0a0;font-size:0.85rem;">${scenario.desc}</span>
  `;
}

// ========== 数字动画 ==========
function animateNumber(el, target) {
  const duration = 1500;
  const start = performance.now();
  const from = 0;

  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // ease-out-cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(from + (target - from) * eased);
    el.textContent = current.toLocaleString();
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}


// ========== 本地模拟数据生成（后端不可用时的 fallback） ==========
const GEO_DATA = [
  { country: 'United States', code: 'US', lat: 37.77, lng: -122.42, weight: 18 },
  { country: 'Germany', code: 'DE', lat: 50.11, lng: 8.68, weight: 12 },
  { country: 'France', code: 'FR', lat: 48.86, lng: 2.35, weight: 8 },
  { country: 'United Kingdom', code: 'GB', lat: 51.51, lng: -0.13, weight: 7 },
  { country: 'Brazil', code: 'BR', lat: -23.55, lng: -46.63, weight: 6 },
  { country: 'Canada', code: 'CA', lat: 43.65, lng: -79.38, weight: 5 },
  { country: 'Netherlands', code: 'NL', lat: 52.37, lng: 4.90, weight: 5 },
  { country: 'India', code: 'IN', lat: 19.08, lng: 72.88, weight: 5 },
  { country: 'Russia', code: 'RU', lat: 55.76, lng: 37.62, weight: 4 },
  { country: 'Japan', code: 'JP', lat: 35.68, lng: 139.69, weight: 4 },
  { country: 'Australia', code: 'AU', lat: -33.87, lng: 151.21, weight: 3 },
  { country: 'South Korea', code: 'KR', lat: 37.57, lng: 126.98, weight: 3 },
  { country: 'Sweden', code: 'SE', lat: 59.33, lng: 18.07, weight: 3 },
  { country: 'Poland', code: 'PL', lat: 52.23, lng: 21.01, weight: 3 },
  { country: 'Italy', code: 'IT', lat: 41.90, lng: 12.50, weight: 3 },
  { country: 'Spain', code: 'ES', lat: 40.42, lng: -3.70, weight: 2 },
  { country: 'China', code: 'CN', lat: 31.23, lng: 121.47, weight: 2 },
  { country: 'Ukraine', code: 'UA', lat: 50.45, lng: 30.52, weight: 2 },
  { country: 'Romania', code: 'RO', lat: 44.43, lng: 26.10, weight: 2 },
  { country: 'Argentina', code: 'AR', lat: -34.60, lng: -58.38, weight: 2 },
  { country: 'South Africa', code: 'ZA', lat: -33.93, lng: 18.42, weight: 1 }
];

function generateLocalPeers(count) {
  const totalWeight = GEO_DATA.reduce((s, g) => s + g.weight, 0);
  const peers = [];

  for (let i = 0; i < count; i++) {
    const geo = pickWeightedGeo(totalWeight);
    const lat = geo.lat + (Math.random() - 0.5) * 6;
    const lng = geo.lng + (Math.random() - 0.5) * 6;
    const ip = randomIp();
    const port = 6881 + Math.floor(Math.random() * 1000);

    peers.push({
      ip, port,
      country: geo.country,
      countryCode: geo.code,
      lat: Math.max(-85, Math.min(85, lat)),
      lng: Math.max(-180, Math.min(180, lng)),
      discoveredAt: Date.now() - Math.floor(Math.random() * 600000)
    });
  }
  return peers;
}

function pickWeightedGeo(totalWeight) {
  let r = Math.random() * totalWeight;
  for (const geo of GEO_DATA) {
    r -= geo.weight;
    if (r <= 0) return geo;
  }
  return GEO_DATA[GEO_DATA.length - 1];
}

function randomIp() {
  const first = [24, 35, 44, 64, 68, 71, 73, 98, 104, 108, 5, 46, 62, 78, 80, 87, 177, 179, 186];
  const f = first[Math.floor(Math.random() * first.length)];
  return f + '.' + rand256() + '.' + rand256() + '.' + (1 + Math.floor(Math.random() * 254));
}

function rand256() { return Math.floor(Math.random() * 256); }

function countPeersPerCountry(peers) {
  const map = {};
  peers.forEach(p => { map[p.country] = (map[p.country] || 0) + 1; });
  // sort descending
  return Object.fromEntries(Object.entries(map).sort((a, b) => b[1] - a[1]));
}

// ========== 启动 ==========
init();

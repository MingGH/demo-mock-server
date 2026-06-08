// ========== P2P 隐私透视镜 ==========
const API = 'https://numfeel-api.996.ninja/p2p';
let mapChart = null;
let currentData = null;

async function init() {
  initMap();
  initTradeoffSlider();
  await loadTorrents();
  await loadPeers(0);
  window.addEventListener('resize', () => { if (mapChart) mapChart.resize(); });
}

// ========== ECharts 世界地图 ==========
function initMap() {
  mapChart = echarts.init(document.getElementById('worldMap'), null, { renderer: 'canvas' });
  mapChart.setOption({
    backgroundColor: 'transparent',
    geo: {
      map: 'world',
      roam: false,
      silent: true,
      itemStyle: { areaColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 0.5 },
      emphasis: { disabled: true },
      projection: { project: (p) => [p[0] / 180 * Math.PI, -Math.log(Math.tan((Math.PI / 2 + p[1] / 180 * Math.PI) / 2))], unproject: (p) => [p[0] * 180 / Math.PI, 2 * 180 / Math.PI * Math.atan(Math.exp(p[1])) - 90] }
    },
    series: [{
      type: 'effectScatter',
      coordinateSystem: 'geo',
      data: [],
      symbolSize: 6,
      showEffectOn: 'render',
      rippleEffect: { brushType: 'stroke', scale: 3, period: 4 },
      itemStyle: { color: '#ffd700', shadowBlur: 10, shadowColor: 'rgba(255,215,0,0.5)' }
    }]
  });
}

function updateMap(peers) {
  if (!mapChart) return;
  const data = peers.map(p => ({ value: [p.lng, p.lat], name: p.country }))
      .filter(p => p.value[0] !== 0 || p.value[1] !== 0);
  mapChart.setOption({ series: [{ data }] });
}


// ========== 数据加载 ==========
async function loadTorrents() {
  try {
    const res = await fetch(API + '/torrents');
    const json = await res.json();
    if (json.status !== 200) throw new Error(json.message);
    renderTorrentSelector(json.data);
  } catch (e) {
    document.getElementById('torrentSelector').innerHTML = '<span style="color:#ff6b6b;">后端连接失败：' + e.message + '</span>';
  }
}

function renderTorrentSelector(torrents) {
  const container = document.getElementById('torrentSelector');
  container.innerHTML = '';
  torrents.forEach((t, i) => {
    const btn = document.createElement('button');
    btn.className = 'torrent-btn' + (i === 0 ? ' active' : '');
    btn.innerHTML = `<i class="ti ti-file-download"></i> ${t.name}`;
    btn.onclick = () => { document.querySelectorAll('.torrent-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); loadPeers(i); };
    container.appendChild(btn);
  });
}

async function loadPeers(index) {
  const heroEl = document.getElementById('heroNumber');
  heroEl.textContent = '…';
  document.getElementById('updateTime').textContent = '查询 DHT 网络中…';

  try {
    const res = await fetch(API + '/peers?index=' + index);
    const json = await res.json();
    if (json.status !== 200) throw new Error(json.message);
    currentData = json.data;
    renderAll(currentData);
  } catch (e) {
    heroEl.textContent = '0';
    document.getElementById('updateTime').textContent = '获取失败：' + e.message + '（后端可能正在首次查询 DHT，请稍后刷新）';
  }
}

function renderAll(data) {
  animateNumber(document.getElementById('heroNumber'), data.totalPeers);
  document.getElementById('heroTorrent').textContent = data.torrentName;
  const timeStr = new Date(data.updatedAt).toLocaleTimeString('zh-CN');
  document.getElementById('updateTime').textContent = data.totalPeers > 0
    ? '数据采集于 ' + timeStr + '（来自 DHT 真实查询）'
    : '暂无数据，后台正在查询 DHT 网络，请稍后刷新';

  // 地图：用 allPeers 中有经纬度的
  if (data.sampleLog && data.sampleLog.length > 0) {
    updateMap(data.sampleLog);
  }
  renderCountryGrid(data.countryDistribution || {}, data.totalPeers);
  renderSpyLog(data.sampleLog || []);
}


// ========== 国家分布 ==========
function renderCountryGrid(dist, total) {
  const grid = document.getElementById('countryGrid');
  grid.innerHTML = '';
  if (total === 0) { grid.innerHTML = '<span style="color:#666;">等待数据…</span>'; return; }
  const entries = Object.entries(dist).sort((a, b) => b[1] - a[1]).slice(0, 12);
  entries.forEach(([country, count]) => {
    const pct = ((count / total) * 100).toFixed(1);
    const div = document.createElement('div');
    div.className = 'country-bar';
    div.innerHTML = `<span class="flag">${countryFlag(country)}</span><span class="name">${country}</span><span class="count">${count} (${pct}%)</span>`;
    grid.appendChild(div);
  });
}

function countryFlag(name) {
  const f = {'United States':'🇺🇸','Germany':'🇩🇪','France':'🇫🇷','United Kingdom':'🇬🇧','Brazil':'🇧🇷','Canada':'🇨🇦','Netherlands':'🇳🇱','India':'🇮🇳','Russia':'🇷🇺','Japan':'🇯🇵','Australia':'🇦🇺','South Korea':'🇰🇷','Sweden':'🇸🇪','Poland':'🇵🇱','Italy':'🇮🇹','Spain':'🇪🇸','China':'🇨🇳','Ukraine':'🇺🇦','Romania':'🇷🇴','Argentina':'🇦🇷','South Africa':'🇿🇦','Europe':'🇪🇺','Unknown':'🌐'};
  return f[name] || '🌍';
}

// ========== 监控日志 ==========
function renderSpyLog(sampleLog) {
  const container = document.getElementById('logEntries');
  if (sampleLog.length === 0) { container.innerHTML = '<div style="color:#666;padding:12px;">等待 DHT 查询完成…</div>'; return; }
  container.innerHTML = '';
  sampleLog.forEach(peer => {
    const time = new Date(peer.discoveredAt).toLocaleTimeString('zh-CN');
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-ip">${peer.ip}:${peer.port}</span> <span class="log-country">${peer.country || 'Unknown'}${peer.city ? ' · ' + peer.city : ''}</span> <span class="log-action">GET_PEERS infohash:${currentData.infohash.substring(0,8)}…</span>`;
    container.appendChild(entry);
  });
}

// ========== Trade-off 滑块 ==========
function initTradeoffSlider() {
  document.getElementById('tradeoffSlider').addEventListener('input', updateTradeoff);
  updateTradeoff();
}

function updateTradeoff() {
  const val = parseInt(document.getElementById('tradeoffSlider').value);
  const scenarios = [
    { max:10, title:'Tor + BT', speed:'50 KB/s', anon:'高', desc:'三层洋葱路由。速度约直连的 1/200。Tor 官方明确反对跑 BT。' },
    { max:25, title:'I2P 网络', speed:'200 KB/s', anon:'较高', desc:'大蒜路由，比 Tor 快但做种者极少。' },
    { max:45, title:'VPN + BT', speed:'5 MB/s', anon:'中等', desc:'VPN 隐藏真实 IP，但提供商有日志，peer 仍看到出口 IP。' },
    { max:65, title:'协议加密 PE/MSE', speed:'15 MB/s', anon:'低', desc:'ISP 无法识别流量，但 swarm 内 peer 照样看到你。' },
    { max:85, title:'标准 BT', speed:'30 MB/s', anon:'无', desc:'IP 在 DHT 中公开可查，任何人放节点即可记录。' },
    { max:100, title:'DHT+PEX+UPnP', speed:'50+ MB/s', anon:'负', desc:'主动广播存在。速度最快，暴露最彻底。' }
  ];
  const s = scenarios.find(s => val <= s.max) || scenarios[5];
  document.getElementById('tradeoffResult').innerHTML = `<strong style="color:#ffd700;">${s.title}</strong><br><span style="color:#81c784;">速度：${s.speed}</span> · <span style="color:#ff6b6b;">匿名性：${s.anon}</span><br><span style="color:#a0a0a0;font-size:0.85rem;">${s.desc}</span>`;
}

// ========== 工具 ==========
function animateNumber(el, target) {
  if (target === 0) { el.textContent = '0'; return; }
  const start = performance.now(), duration = 1200;
  (function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString();
    if (p < 1) requestAnimationFrame(tick);
  })(performance.now());
}

// ========== 启动 ==========
init();

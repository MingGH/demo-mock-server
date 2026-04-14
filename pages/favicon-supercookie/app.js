/**
 * Favicon 超级 Cookie — 核心逻辑
 *
 * 本文件包含可独立测试的纯函数（编码/解码/位操作），
 * 以及浏览器端的 UI 交互逻辑。
 */

// ============================================================
//  纯函数（可在 Node.js 中测试）
// ============================================================

/**
 * 将十进制数字编码为固定长度的二进制数组
 * @param {number} num - 非负整数
 * @param {number} bits - 位数
 * @returns {number[]} 二进制数组，高位在前
 */
function numToBits(num, bits) {
  const arr = [];
  for (let i = bits - 1; i >= 0; i--) {
    arr.push((num >>> i) & 1);
  }
  return arr;
}

/**
 * 将二进制数组还原为十进制数字
 * @param {number[]} arr - 二进制数组，高位在前
 * @returns {number}
 */
function bitsToNum(arr) {
  let n = 0;
  for (let i = 0; i < arr.length; i++) {
    n = (n << 1) | (arr[i] ? 1 : 0);
  }
  return n >>> 0; // 保证无符号
}

/**
 * 生成 N 个子域名列表
 * @param {string} domain - 主域名
 * @param {number} n - 位数
 * @returns {string[]}
 */
function generateSubdomains(domain, n) {
  const subs = [];
  for (let i = 0; i < n; i++) {
    subs.push(`bit${i}.${domain}`);
  }
  return subs;
}

/**
 * 模拟 F-Cache 写入：根据 ID 的二进制位决定哪些子域名需要缓存 favicon
 * @param {number} userId - 用户 ID
 * @param {number} bits - 位数
 * @returns {{ subdomain: string, cached: boolean }[]}
 */
function encodeFaviconId(userId, bits) {
  const binary = numToBits(userId, bits);
  return binary.map((bit, i) => ({
    subdomain: `bit${i}.tracker.com`,
    cached: bit === 1,
    bitIndex: i,
    bitValue: bit,
  }));
}

/**
 * 模拟 F-Cache 读取：根据缓存命中情况还原 ID
 * @param {boolean[]} cacheHits - 每个子域名是否命中缓存
 * @returns {number}
 */
function decodeFaviconId(cacheHits) {
  const bits = cacheHits.map(hit => hit ? 1 : 0);
  return bitsToNum(bits);
}

/**
 * 计算 N 位能标记多少用户
 * @param {number} bits
 * @returns {number}
 */
function maxUsers(bits) {
  return Math.pow(2, bits);
}

/**
 * 格式化大数字（加逗号）
 * @param {number} n
 * @returns {string}
 */
function formatNumber(n) {
  return n.toLocaleString('en-US');
}

/**
 * 模拟"清除浏览数据"后 F-Cache 的存活情况
 * 普通 Cookie/LocalStorage 会被清除，但 F-Cache 不受影响
 * @param {object} storageState - { cookie, localStorage, sessionStorage, fcache }
 * @returns {object} 清除后的状态
 */
function simulateClearBrowsingData(storageState) {
  return {
    cookie: false,
    localStorage: false,
    sessionStorage: false,
    fcache: storageState.fcache, // F-Cache 不受影响
  };
}

/**
 * 模拟"无痕模式"下各存储的行为
 * @param {object} storageState
 * @returns {object}
 */
function simulateIncognitoMode(storageState) {
  return {
    cookie: false,       // 关闭后清除
    localStorage: false, // 关闭后清除
    sessionStorage: false,
    fcache: storageState.fcache, // 在 Chrome/Safari 中仍然持久
  };
}

// ============================================================
//  浏览器端 UI 逻辑（仅在浏览器环境执行）
// ============================================================

if (typeof window !== 'undefined') {
  (function () {
    'use strict';

    const BITS = 16;
    let currentId = 0;
    let cacheState = new Array(BITS).fill(false);
    let logLines = [];
    let animating = false;

    // ---------- DOM 引用 ----------
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // ---------- 初始化 ----------
    document.addEventListener('DOMContentLoaded', () => {
      // 先渲染空状态，等真实追踪写入后同步
      renderBitGrid();
      updateIdDisplay();
      updateStats();
    });

    // 供真实追踪部分调用，同步 ID 到交互演示
    function syncSimulationId(id) {
      const bits = numToBits(id, BITS);
      for (let i = 0; i < BITS; i++) {
        cacheState[i] = bits[i] === 1;
      }
      currentId = id;
      renderBitGrid();
      updateIdDisplay();
      updateStats();
      addLog('info', `同步真实追踪 ID: ${id}`);
      addLog('write', `二进制: ${bits.join('')}`);
      const input = document.getElementById('inputId');
      if (input) input.value = id;
    }

    // ---------- 生成随机 favicon 颜色 ----------
    function faviconColor(index) {
      const hue = (index * 137.508) % 360; // 黄金角分布
      return `hsl(${hue}, 70%, 55%)`;
    }

    function faviconSvgDataUrl(index, filled) {
      const color = filled ? faviconColor(index) : '#333';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" rx="3" fill="${color}"/><text x="8" y="12" text-anchor="middle" font-size="10" fill="#fff" font-family="monospace">${index}</text></svg>`;
      return 'data:image/svg+xml,' + encodeURIComponent(svg);
    }

    // ---------- 渲染二进制网格 ----------
    function renderBitGrid() {
      const grid = $('#bitGrid');
      if (!grid) return;
      grid.innerHTML = '';
      for (let i = 0; i < BITS; i++) {
        const cell = document.createElement('div');
        cell.className = `bit-cell ${cacheState[i] ? 'on' : 'off'}`;
        cell.id = `cell-${i}`;
        cell.innerHTML = `
          <img class="favicon-icon" src="${faviconSvgDataUrl(i, cacheState[i])}" alt="bit${i}">
          <span class="bit-label">bit${i}</span>
          <span class="bit-val">${cacheState[i] ? '1' : '0'}</span>
        `;
        grid.appendChild(cell);
      }
    }

    // ---------- 更新 ID 显示 ----------
    function updateIdDisplay() {
      const bits = cacheState.map(c => c ? 1 : 0);
      currentId = bitsToNum(bits);
      const binaryStr = bits.join('');
      const el = $('#idValue');
      if (el) el.textContent = binaryStr;
      const dec = $('#idDecimal');
      if (dec) dec.textContent = `十进制: ${formatNumber(currentId)}  (${BITS} 位可标记 ${formatNumber(maxUsers(BITS))} 个用户)`;
    }

    // ---------- 更新统计 ----------
    function updateStats() {
      const setBits = cacheState.filter(c => c).length;
      const el1 = $('#statBits');
      if (el1) el1.textContent = BITS;
      const el2 = $('#statUsers');
      if (el2) el2.textContent = formatNumber(maxUsers(BITS));
      const el3 = $('#statSet');
      if (el3) el3.textContent = setBits;
      const el4 = $('#statId');
      if (el4) el4.textContent = formatNumber(currentId);
    }

    // ---------- 日志 ----------
    function addLog(type, msg) {
      const now = new Date();
      const ts = now.toLocaleTimeString('zh-CN', { hour12: false });
      logLines.push({ ts, type, msg });
      if (logLines.length > 100) logLines.shift();
      renderLog();
    }

    function renderLog() {
      const box = $('#logBox');
      if (!box) return;
      box.innerHTML = logLines.map(l =>
        `<div class="log-line"><span class="log-time">[${l.ts}]</span> <span class="log-${l.type}">${l.msg}</span></div>`
      ).join('');
      box.scrollTop = box.scrollHeight;
    }

    // ---------- 动画：逐位写入 ----------
    async function animateWrite(id) {
      if (animating) return;
      animating = true;
      const bits = numToBits(id, BITS);
      addLog('info', `开始写入 ID: ${id} (${bits.join('')})`);

      const progress = $('#writeProgress');

      for (let i = 0; i < BITS; i++) {
        cacheState[i] = bits[i] === 1;
        const cell = $(`#cell-${i}`);
        if (cell) {
          cell.className = `bit-cell ${cacheState[i] ? 'on' : 'off'} checking`;
          cell.querySelector('.favicon-icon').src = faviconSvgDataUrl(i, cacheState[i]);
          cell.querySelector('.bit-val').textContent = cacheState[i] ? '1' : '0';
          setTimeout(() => cell.classList.remove('checking'), 500);
        }
        if (cacheState[i]) {
          addLog('write', `→ bit${i}.tracker.com/favicon.ico  [缓存写入]`);
        } else {
          addLog('miss', `→ bit${i}.tracker.com/favicon.ico  [跳过/无缓存]`);
        }
        if (progress) progress.style.width = `${((i + 1) / BITS) * 100}%`;
        await sleep(120);
      }

      updateIdDisplay();
      updateStats();
      addLog('info', `写入完成！ID = ${id}`);
      animating = false;
    }

    // ---------- 动画：逐位读取 ----------
    async function animateRead() {
      if (animating) return;
      animating = true;
      addLog('info', '开始读取 F-Cache...');

      const progress = $('#readProgress');
      const readBits = [];

      for (let i = 0; i < BITS; i++) {
        const hit = cacheState[i];
        readBits.push(hit);
        const cell = $(`#cell-${i}`);
        if (cell) {
          cell.classList.add('checking');
          setTimeout(() => cell.classList.remove('checking'), 500);
        }
        if (hit) {
          addLog('read', `← bit${i}.tracker.com  [缓存命中 → 1]`);
        } else {
          addLog('miss', `← bit${i}.tracker.com  [未命中 → 0]`);
        }
        if (progress) progress.style.width = `${((i + 1) / BITS) * 100}%`;
        await sleep(100);
      }

      const recoveredId = decodeFaviconId(readBits);
      addLog('info', `读取完成！还原 ID = ${recoveredId}`);
      animating = false;
    }

    // ---------- 模拟清除浏览数据 ----------
    async function animateClear() {
      if (animating) return;
      animating = true;
      addLog('info', '用户执行「清除浏览数据」...');
      await sleep(300);
      addLog('miss', '✗ Cookie → 已清除');
      await sleep(200);
      addLog('miss', '✗ LocalStorage → 已清除');
      await sleep(200);
      addLog('miss', '✗ SessionStorage → 已清除');
      await sleep(200);
      addLog('miss', '✗ 浏览器缓存 → 已清除');
      await sleep(200);
      addLog('write', '✓ F-Cache (Favicon 缓存) → 未受影响！');
      await sleep(300);

      // F-Cache 不变，重新读取
      addLog('info', '网站重新读取 F-Cache...');
      await sleep(400);
      const bits = cacheState.map(c => c ? 1 : 0);
      const id = bitsToNum(bits);
      addLog('read', `还原 ID = ${id}  ← 你还是你。`);
      animating = false;
    }

    // ---------- 模拟无痕模式 ----------
    async function animateIncognito() {
      if (animating) return;
      animating = true;
      addLog('info', '用户打开「无痕/隐私浏览」模式...');
      await sleep(400);
      addLog('info', 'Cookie: 窗口关闭后清除');
      addLog('info', 'LocalStorage: 窗口关闭后清除');
      await sleep(300);
      addLog('write', 'F-Cache: 在 Chrome/Safari 中仍然共享主缓存！');
      await sleep(300);
      const bits = cacheState.map(c => c ? 1 : 0);
      const id = bitsToNum(bits);
      addLog('read', `读取 F-Cache → ID = ${id}  ← 无痕模式没用。`);
      animating = false;
    }

    // ---------- 重置 ----------
    function resetAll() {
      cacheState = new Array(BITS).fill(false);
      currentId = 0;
      logLines = [];
      renderBitGrid();
      updateIdDisplay();
      updateStats();
      renderLog();
      const p1 = $('#writeProgress');
      const p2 = $('#readProgress');
      if (p1) p1.style.width = '0';
      if (p2) p2.style.width = '0';
    }

    // ---------- 工具 ----------
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ---------- 暴露到全局 ----------
    window.faviconApp = {
      animateWrite,
      animateRead,
      animateClear,
      animateIncognito,
      resetAll,
      generateRandomId: () => Math.floor(Math.random() * maxUsers(BITS)),
      BITS,
    };

    // 分享链接
    window.copyShareLink = function () {
      const url = window.location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url);
      }
      const toast = $('#toast');
      if (toast) {
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
      }
    };

    // ========== 真实追踪演示（F-Cache 实现） ==========
    const API_BASE = 'https://numfeel-api.996.ninja';
    const SUBDOMAIN_BASE = '996.ninja';
    const CONTROL_CACHED_URL = `${API_BASE}/supercookie/control-cached`;
    const CONTROL_NETWORK_URL = `${API_BASE}/supercookie/control-network`;
    const CONTROL_SAMPLE_COUNT = 3;
    const MIN_CONTROL_GAP_MS = 8;
    const MIN_GRAY_BAND_MS = 2;
    const GRAY_BAND_RATIO = 0.2;
    const UNKNOWN_RETRY_WAIT_MS = 5500;
    function bitDomain(i) { return `bit${i}-numfeel.${SUBDOMAIN_BASE}`; }
    function bitPixelUrl(i) { return `https://${bitDomain(i)}/supercookie/pixel`; }
    const realLogLines = [];

    function addRealLog(type, msg) {
      const now = new Date();
      const ts = now.toLocaleTimeString('zh-CN', { hour12: false });
      console.log(`[F-Cache ${type}] ${msg}`);
      realLogLines.push({ ts, type, msg });
      if (realLogLines.length > 50) realLogLines.shift();
      const box = $('#realLogBox');
      if (!box) return;
      box.innerHTML = realLogLines.map(l =>
        `<div class="log-line"><span class="log-time">[${l.ts}]</span> <span class="log-${l.type}">${l.msg}</span></div>`
      ).join('');
      box.scrollTop = box.scrollHeight;
    }

    function showTrackingResult(data, isReturning) {
      const resultEl = $('#trackingResult');
      if (resultEl) resultEl.style.display = 'block';

      const idVal = $('#realIdValue');
      if (idVal) idVal.textContent = data.binary || '-';

      const idDec = $('#realIdDecimal');
      if (idDec) idDec.textContent = `追踪 ID: ${formatNumber(data.trackingId)}`;

      const visits = $('#realVisits');
      if (visits) visits.textContent = isReturning ? '回访用户' : '新用户';

      const firstSeen = $('#realFirstSeen');
      if (firstSeen) firstSeen.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });

      fetch(`${API_BASE}/supercookie/stats`)
        .then(r => r.json())
        .then(j => {
          const tracked = $('#realTracked');
          if (tracked && j.data) tracked.textContent = formatNumber(j.data.trackedUsers);
        })
        .catch(() => {});

      const insight = $('#realInsight');
      const title = $('#realInsightTitle');
      const text = $('#realInsightText');
      if (insight && title && text) {
        insight.style.display = 'block';
        if (isReturning) {
          title.textContent = '我们认出你了';
          text.innerHTML = `你的追踪 ID 是 <strong style="color:#ffd700">${data.trackingId}</strong>（二进制: ${data.binary}）。<br>` +
            `你没有登录、没有填任何信息，但服务器通过 F-Cache 还原了你的身份。<br>` +
            `试试清除 Cookie 后再点一次——你会发现 ID 没有变化。`;
        } else {
          title.textContent = '追踪 ID 已写入你的 F-Cache';
          text.innerHTML = `服务器刚刚给你分配了追踪 ID: <strong style="color:#ffd700">${data.trackingId}</strong>。<br>` +
            `${BITS} 个子域名的 favicon 已经按照二进制编码写入了你的浏览器缓存。<br>` +
            `现在试试：清除浏览器 Cookie，然后再点「重新探测」——你会发现 ID 没变。`;
        }
      }
    }

    function measureImageLoad(url) {
      return new Promise((resolve) => {
        const img = new Image();
        const start = performance.now();
        let settled = false;
        const done = () => {
          if (!settled) {
            settled = true;
            resolve(performance.now() - start);
          }
        };
        img.onload = img.onerror = done;
        setTimeout(done, 10000);
        img.src = url;
      });
    }

    function median(values) {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    }

    async function seedCachedControl() {
      const elapsed = await measureImageLoad(CONTROL_CACHED_URL);
      addRealLog('write', `→ control-cached  [校准缓存写入, ${elapsed.toFixed(1)}ms]`);
    }

    async function collectCalibration(roundLabel) {
      const cachedSamples = [];
      const networkSamples = [];

      for (let i = 0; i < CONTROL_SAMPLE_COUNT; i++) {
        const cachedElapsed = await measureImageLoad(CONTROL_CACHED_URL);
        cachedSamples.push(cachedElapsed);
        addRealLog('read', `← control-cached  [${roundLabel} #${i + 1}: ${cachedElapsed.toFixed(1)}ms]`);

        const networkElapsed = await measureImageLoad(CONTROL_NETWORK_URL);
        networkSamples.push(networkElapsed);
        addRealLog('read', `← control-network  [${roundLabel} #${i + 1}: ${networkElapsed.toFixed(1)}ms]`);
      }

      const cachedMedian = median(cachedSamples);
      const networkMedian = median(networkSamples);
      const gap = networkMedian - cachedMedian;
      const threshold = (cachedMedian + networkMedian) / 2;
      const grayBand = Math.max(MIN_GRAY_BAND_MS, gap * GRAY_BAND_RATIO);
      const reliable = gap >= MIN_CONTROL_GAP_MS;
      const reason = reliable ? '' : `控制样本差距仅 ${gap.toFixed(1)}ms，无法可靠区分缓存与网络`;

      addRealLog(
        reliable ? 'info' : 'miss',
        `校准(${roundLabel}): cached≈${cachedMedian.toFixed(1)}ms, network≈${networkMedian.toFixed(1)}ms, gap=${gap.toFixed(1)}ms, midpoint=${threshold.toFixed(1)}ms, gray=±${grayBand.toFixed(1)}ms`
      );

      return {
        reliable,
        reason,
        cachedMedian,
        networkMedian,
        gap,
        threshold,
        grayBand,
      };
    }

    async function measureBitTimings(indices) {
      const timings = [];
      for (const i of indices) {
        const elapsed = await measureImageLoad(bitPixelUrl(i));
        timings.push({ index: i, elapsed });
        addRealLog('read', `← ${bitDomain(i)}  [${elapsed.toFixed(1)}ms]`);
      }
      return timings;
    }

    function classifyTimings(timings, calibration) {
      const bits = {};
      const unknownIndices = [];
      const cacheUpperBound = calibration.threshold - calibration.grayBand;
      const networkLowerBound = calibration.threshold + calibration.grayBand;

      addRealLog(
        'info',
        `判定窗口: 缓存 <=${cacheUpperBound.toFixed(1)}ms；网络 >=${networkLowerBound.toFixed(1)}ms；灰区 ${cacheUpperBound.toFixed(1)}-${networkLowerBound.toFixed(1)}ms`
      );

      for (const timing of timings) {
        if (timing.elapsed <= cacheUpperBound) {
          bits[timing.index] = 1;
        } else if (timing.elapsed >= networkLowerBound) {
          bits[timing.index] = 0;
        } else {
          unknownIndices.push(timing.index);
        }
      }

      return { bits, unknownIndices, cacheUpperBound, networkLowerBound };
    }

    /** 写入阶段：只请求 bit=1 的子域名的固定 favicon URL */
    function writeFaviconBits(bits) {
      return new Promise((resolve) => {
        const oneBits = bits.reduce((s, b) => s + b, 0);
        if (oneBits === 0) { resolve(); return; }
        let loaded = 0;
        for (let i = 0; i < BITS; i++) {
          if (bits[i] === 1) {
            const img = new Image();
            const idx = i;
            img.onload = img.onerror = () => {
              addRealLog('write', `→ ${bitDomain(idx)}/favicon.ico  [缓存写入, bit=1]`);
              if (++loaded === oneBits) resolve();
            };
            img.src = bitPixelUrl(i);
          } else {
            addRealLog('miss', `  bit${i} = 0，跳过（不请求 = 不缓存）`);
          }
        }
      });
    }

    /**
     * 读取阶段：
     * 1. 先用 control-cached / control-network 建立本轮参考系
     * 2. 再读取 16 个 bit 的耗时
     * 3. 对灰区 bit 等待 5.5 秒后重试一次，避免 0 位被第一次读取污染
     */
    function readFaviconBits() {
      return new Promise(async (resolve) => {
        const results = new Array(BITS).fill(0);
        const allIndices = Array.from({ length: BITS }, (_, i) => i);

        const firstCalibration = await collectCalibration('初判');
        if (!firstCalibration.reliable) {
          resolve({ status: 'uncertain', reason: firstCalibration.reason });
          return;
        }

        const firstTimings = await measureBitTimings(allIndices);
        const firstPass = classifyTimings(firstTimings, firstCalibration);
        for (const [idx, bit] of Object.entries(firstPass.bits)) {
          results[Number(idx)] = bit;
        }

        if (firstPass.unknownIndices.length === 0) {
          resolve({ status: 'ok', bits: results });
          return;
        }

        addRealLog('info', `${firstPass.unknownIndices.length} 个 bit 落在灰区，等待 ${(UNKNOWN_RETRY_WAIT_MS / 1000).toFixed(1)}s 后重试这些位。`);
        await sleep(UNKNOWN_RETRY_WAIT_MS);

        const retryCalibration = await collectCalibration('重试');
        if (!retryCalibration.reliable) {
          resolve({
            status: 'uncertain',
            reason: `重试阶段失败：${retryCalibration.reason}`,
            unknownIndices: firstPass.unknownIndices,
          });
          return;
        }

        const retryTimings = await measureBitTimings(firstPass.unknownIndices);
        const retryPass = classifyTimings(retryTimings, retryCalibration);
        for (const [idx, bit] of Object.entries(retryPass.bits)) {
          results[Number(idx)] = bit;
        }

        if (retryPass.unknownIndices.length > 0) {
          resolve({
            status: 'uncertain',
            reason: `${retryPass.unknownIndices.length} 个 bit 在重试后仍落在灰区`,
            unknownIndices: retryPass.unknownIndices,
          });
          return;
        }

        resolve({ status: 'ok', bits: results });
      });
    }

    function bitsArrayToId(bits) {
      let id = 0;
      for (let i = 0; i < bits.length; i++) id = (id << 1) | (bits[i] === 1 ? 1 : 0);
      return id >>> 0;
    }

    window.realTrack = {
      async writeId() {
        addRealLog('info', '正在向服务器申请追踪 ID...');
        try {
          const res = await fetch(`${API_BASE}/supercookie/session`, { method: 'POST' });
          const json = await res.json();
          const data = json.data;
          addRealLog('write', `← 分配 ID: ${data.trackingId} (${data.binary})`);
          await seedCachedControl();
          addRealLog('info', '开始写入：只请求 bit=1 的子域名...');
          await writeFaviconBits(data.bits);
          addRealLog('info', 'F-Cache 写入完成！');
          showTrackingResult(data, false);
          syncSimulationId(data.trackingId);
          return { status: 'written', trackingId: data.trackingId, binary: data.binary };
        } catch (e) {
          addRealLog('miss', `请求失败: ${e.message}`);
          return { status: 'error', error: e };
        }
      },

      async probe() {
        addRealLog('info', '开始从 F-Cache 还原追踪 ID...');
        try {
          const probeResult = await readFaviconBits();
          if (probeResult.status !== 'ok') {
            addRealLog('miss', `探测结果不可靠：${probeResult.reason}`);
            addRealLog('info', '本轮不写入新 ID，避免把误判当成真实缓存状态。');
            return probeResult;
          }

          const bits = probeResult.bits;
          const trackingId = bitsArrayToId(bits);
          const binary = bits.map(b => String(b)).join('');
          addRealLog('read', `← 还原 ID: ${trackingId} (${binary})`);
          if (trackingId === 0) {
            addRealLog('info', 'F-Cache 为空，首次访问。写入新 ID...');
            const writeResult = await this.writeId();
            return { status: 'empty', trackingId: 0, binary, writeResult };
          } else {
            addRealLog('info', '你被追踪了。没有 Cookie，没有登录，但服务器认出了你。');
            showTrackingResult({ trackingId, binary }, true);
            syncSimulationId(trackingId);
            return { status: 'found', trackingId, binary };
          }
        } catch (e) {
          addRealLog('miss', `探测失败: ${e.message}`);
          return { status: 'error', error: e };
        }
      },

      async clearAndRetry() {
        addRealLog('info', '用户执行「清除浏览数据」...');
        document.cookie.split(';').forEach(c => {
          document.cookie = c.trim().split('=')[0] + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
        });
        try { localStorage.clear(); } catch(e) {}
        try { sessionStorage.clear(); } catch(e) {}
        await sleep(500);
        addRealLog('miss', '✗ Cookie → 已清除');
        addRealLog('miss', '✗ LocalStorage → 已清除');
        addRealLog('miss', '✗ SessionStorage → 已清除');
        await sleep(300);
        addRealLog('write', '✓ F-Cache (Favicon 缓存) → 无法清除！');
        await sleep(500);
        addRealLog('info', '重新探测 F-Cache...');
        await sleep(300);
        await this.probe();
      },
    };

    // 页面加载：先探测，只有空缓存时才写入新 ID。
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(async () => {
        addRealLog('info', '页面初始化：先探测现有 F-Cache...');
        await window.realTrack.probe();
      }, 800);
    });
  })();
}

// ---------- Node.js 导出 ----------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    numToBits,
    bitsToNum,
    generateSubdomains,
    encodeFaviconId,
    decodeFaviconId,
    maxUsers,
    formatNumber,
    simulateClearBrowsingData,
    simulateIncognitoMode,
  };
}

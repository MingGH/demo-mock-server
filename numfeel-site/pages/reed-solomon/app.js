/**
 * app.js - 里德-所罗门纠错码演示页交互逻辑
 *
 * 依赖：rs-core.js（window.RSCore）、GSAP（可选动画）、Chart.js（通过 header.js 加载）
 */

(function () {
  'use strict';

  var RS = window.RSCore;

  // ── 场景预设 ──
  var SCENES = {
    qrcode: { nParity: 6, label: '二维码 H 级', desc: '约 30% 可恢复' },
    cd:     { nParity: 5, label: 'CD CIRC', desc: '约 25% 可恢复' },
    voyager:{ nParity: 8, label: '深空 RS 级联', desc: '高冗余抗噪声' },
    raid:   { nParity: 4, label: 'RAID 6', desc: '双盘容错' }
  };

  // ── 状态 ──
  var state = {
    scene: 'qrcode',
    nParity: 6,
    dataSymbols: [],
    codeword: [],
    damaged: {},      // { index: true }
    hasEncoded: false,
    hasRecovered: false,
    thresholdChart: null
  };

  // ── DOM 引用 ──
  var $ = function (id) { return document.getElementById(id); };

  // ── 工具函数 ──
  function showToast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  function hexByte(v) {
    return (v < 16 ? '0' : '') + v.toString(16).toUpperCase();
  }

  // ── 场景选择 ──
  function initScenes() {
    var cards = document.querySelectorAll('.scene-card');
    cards.forEach(function (card) {
      card.addEventListener('click', function () {
        cards.forEach(function (c) { c.classList.remove('active'); });
        card.classList.add('active');
        state.scene = card.dataset.scene;
        state.nParity = SCENES[state.scene].nParity;
        // 切换场景后重新编码
        if (state.hasEncoded) {
          doEncode();
        }
      });
    });
  }

  // ── 编码 ──
  function doEncode() {
    var text = $('dataInput').value.trim() || 'RS码改变世界';
    var symbols = RS.textToSymbols(text);

    // 限制数据长度，避免码字过长
    if (symbols.length > 20) {
      symbols = symbols.slice(0, 20);
      showToast('数据过长，已截断到 20 字节');
    }

    state.dataSymbols = symbols;
    state.codeword = RS.rsEncode(symbols, state.nParity);
    state.damaged = {};
    state.hasEncoded = true;
    state.hasRecovered = false;

    renderCodeword('codewordVis', false);
    renderCodeword('damageVis', true);
    renderCodeword('recoverVis', false);
    updateDamageStatus();
    $('recoverResult').textContent = '';
    $('recoverResult').className = 'recover-result';
    $('recoverBtn').disabled = false;

    // 编码信息
    var n = state.codeword.length;
    var k = state.dataSymbols.length;
    var info = '数据符号 <span class="blue">' + k + '</span> 个 + 校验符号 <span class="hl">' + state.nParity + '</span> 个 = 共 <span class="hl">' + n + '</span> 个符号。' +
      '最多可恢复 <span class="hl">' + state.nParity + '</span> 个擦除。';
    $('encodeInfo').innerHTML = info;

    // GSAP 入场动画
    animateBlocks('codewordVis');
    animateBlocks('damageVis');
  }

  // ── 渲染码字方块 ──
  function renderCodeword(containerId, clickable) {
    var container = $(containerId);
    container.innerHTML = '';

    if (state.codeword.length === 0) {
      container.innerHTML = '<p class="placeholder-text">点「编码」生成码字方块</p>';
      return;
    }

    for (var i = 0; i < state.codeword.length; i++) {
      if (i === state.dataSymbols.length && i > 0) {
        var divider = document.createElement('div');
        divider.className = 'symbol-divider';
        container.appendChild(divider);
      }

      var block = document.createElement('div');
      var isData = i < state.dataSymbols.length;
      var isDamaged = state.damaged[i];
      var cls = 'symbol-block';
      if (isDamaged) {
        cls += ' damaged';
      } else {
        cls += isData ? ' data' : ' parity';
      }
      block.className = cls;
      block.dataset.index = i;
      block.textContent = isDamaged ? 'XX' : hexByte(state.codeword[i]);

      if (clickable && !state.hasRecovered) {
        (function (idx) {
          block.addEventListener('click', function () {
            toggleDamage(idx);
          });
        })(i);
      }

      container.appendChild(block);
    }
  }

  // ── 入场动画 ──
  function animateBlocks(containerId) {
    if (typeof gsap === 'undefined') return;
    var blocks = $(containerId).querySelectorAll('.symbol-block');
    gsap.from(blocks, {
      scale: 0,
      opacity: 0,
      duration: 0.3,
      stagger: 0.04,
      ease: 'back.out(1.7)'
    });
  }

  // ── 切换损坏 ──
  function toggleDamage(index) {
    if (state.hasRecovered) return;

    if (state.damaged[index]) {
      delete state.damaged[index];
    } else {
      state.damaged[index] = true;
    }

    renderCodeword('damageVis', true);
    renderCodeword('recoverVis', false);
    updateDamageStatus();
  }

  // ── 更新损坏状态 ──
  function updateDamageStatus() {
    var count = Object.keys(state.damaged).length;
    $('damagedCount').textContent = count;
    $('parityCount').textContent = state.nParity;

    var status = $('damageStatus');
    var hint = $('damageHint');
    var recoverBtn = $('recoverBtn');

    if (count === 0) {
      status.classList.remove('warning');
      hint.textContent = '点击方块把它擦除';
      hint.style.color = '#888';
      recoverBtn.disabled = true;
    } else if (count <= state.nParity) {
      status.classList.remove('warning');
      hint.textContent = '还能恢复！冗余够用';
      hint.style.color = '#81c784';
      recoverBtn.disabled = false;
    } else {
      status.classList.add('warning');
      hint.textContent = '超出纠错能力！无法恢复';
      hint.style.color = '#ff6b6b';
      recoverBtn.disabled = false; // 允许点击，演示失败
    }
  }

  // ── 恢复数据 ──
  function doRecover() {
    var erasurePos = Object.keys(state.damaged).map(Number).sort(function (a, b) { return a - b; });
    if (erasurePos.length === 0) {
      showToast('没有损坏，无需恢复');
      return;
    }

    // 构建带 null 的码字
    var damagedCodeword = state.codeword.slice();
    for (var i = 0; i < erasurePos.length; i++) {
      damagedCodeword[erasurePos[i]] = null;
    }

    var result = RS.rsEraseDecode(damagedCodeword, erasurePos, state.nParity);
    var resultEl = $('recoverResult');
    var recoverVis = $('recoverVis');

    if (result.success) {
      // 动画：逐个恢复
      animateRecovery(erasurePos, result.recovered, function () {
        state.hasRecovered = true;
        var restoredText = RS.symbolsToText(result.recovered.slice(0, state.dataSymbols.length));
        resultEl.innerHTML = '数据完整恢复！原始文本：<span class="hl">' + escapeHtml(restoredText) + '</span>';
        resultEl.className = 'recover-result success';
        renderCodeword('damageVis', false); // 恢复后不可再点
      });
    } else {
      // 失败动画
      animateFailure(erasurePos, function () {
        resultEl.innerHTML = '超出纠错能力，数据无法恢复。损坏 <span class="hl">' + erasurePos.length + '</span> 个 > 校验 <span class="hl">' + state.nParity + '</span> 个';
        resultEl.className = 'recover-result fail';
      });
    }
  }

  // ── 恢复动画 ──
  function animateRecovery(erasurePos, recoveredValues, callback) {
    var blocks = $('recoverVis').querySelectorAll('.symbol-block');
    var delay = 0;

    erasurePos.forEach(function (pos) {
      var block = blocks[pos];
      if (!block) return;

      setTimeout(function () {
        block.classList.add('computing');
      }, delay);
      delay += 200;

      setTimeout(function () {
        block.classList.remove('computing', 'damaged');
        block.classList.add('recovered');
        block.textContent = hexByte(recoveredValues[pos]);
      }, delay);
      delay += 300;
    });

    setTimeout(callback, delay + 200);
  }

  // ── 失败动画 ──
  function animateFailure(erasurePos, callback) {
    var blocks = $('recoverVis').querySelectorAll('.symbol-block');

    erasurePos.forEach(function (pos, i) {
      var block = blocks[pos];
      if (!block) return;
      setTimeout(function () {
        block.classList.add('computing');
      }, i * 150);
    });

    setTimeout(function () {
      erasurePos.forEach(function (pos) {
        var block = blocks[pos];
        if (block) {
          block.classList.remove('computing');
          block.classList.add('damaged');
        }
      });
      callback();
    }, erasurePos.length * 150 + 600);
  }

  // ── HTML 转义 ──
  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ── 清除损坏 ──
  function clearDamage() {
    state.damaged = {};
    state.hasRecovered = false;
    renderCodeword('damageVis', true);
    renderCodeword('recoverVis', false);
    updateDamageStatus();
    $('recoverResult').textContent = '';
    $('recoverResult').className = 'recover-result';
  }

  // ── 随机打烂 ──
  function randomDamage() {
    if (!state.hasEncoded) return;
    state.damaged = {};
    state.hasRecovered = false;

    var n = state.codeword.length;
    // 随机打烂 1 ~ nParity+2 个（有时超出上限）
    var maxDamage = Math.min(n - 1, state.nParity + 2);
    var count = Math.floor(Math.random() * (maxDamage)) + 1;

    var indices = [];
    for (var i = 0; i < n; i++) indices.push(i);
    // 洗牌取前 count 个
    for (var j = indices.length - 1; j > 0; j--) {
      var r = Math.floor(Math.random() * (j + 1));
      var tmp = indices[j]; indices[j] = indices[r]; indices[r] = tmp;
    }

    for (var k = 0; k < count; k++) {
      state.damaged[indices[k]] = true;
    }

    renderCodeword('damageVis', true);
    renderCodeword('recoverVis', false);
    updateDamageStatus();
    $('recoverResult').textContent = '';
    $('recoverResult').className = 'recover-result';
  }

  // ── 阈值实验图表 ──
  function initThresholdChart() {
    loadChartJS().then(function () {
      drawThresholdChart(0.30);
      $('redundancySlider').addEventListener('input', function () {
        var val = parseInt(this.value, 10);
        $('redundancyVal').textContent = val + '%';
        drawThresholdChart(val / 100);
      });
    });
  }

  function drawThresholdChart(redundancyRatio) {
    var curve = RS.thresholdCurve(redundancyRatio, 50);
    var ctx = $('thresholdChart').getContext('2d');

    if (state.thresholdChart) {
      state.thresholdChart.destroy();
    }

    state.thresholdChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: curve.labels,
        datasets: [{
          label: '恢复成功率',
          data: curve.data,
          borderColor: '#ffd700',
          backgroundColor: 'rgba(255,215,0,0.12)',
          fill: true,
          tension: 0,
          pointRadius: 0,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: function (items) { return '损坏比例: ' + items[0].label; },
              label: function (item) { return '恢复成功率: ' + (item.parsed.y * 100) + '%'; }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: '损坏比例', color: '#888', font: { size: 12 } },
            ticks: { color: '#888', maxTicksLimit: 11, font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y: {
            title: { display: true, text: '恢复成功率', color: '#888', font: { size: 12 } },
            min: -0.05, max: 1.1,
            ticks: {
              color: '#888', font: { size: 10 },
              callback: function (v) { return v === 0 || v === 1 ? (v * 100) + '%' : ''; }
            },
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        }
      }
    });

    // 更新说明
    var pct = Math.round(redundancyRatio * 100);
    $('thresholdNote').innerHTML = '当前冗余 <span class="hl">' + pct + '%</span>：损坏不超过此比例时 100% 恢复，一旦越过就直接归零。' +
      '这就是 RS 码的硬阈值特性--没有「部分恢复」，要么全对，要么全错。' +
      '实际工程中，冗余越高越安全，但存储和带宽代价也越大。';
  }

  // ── Hero 按钮滚动 ──
  function initHeroBtn() {
    $('heroBtn').addEventListener('click', function () {
      $('sceneSection').scrollIntoView({ behavior: 'smooth' });
    });
  }

  // ── 回到顶部 ──
  function initTopBtn() {
    $('topBtn').addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ── 初始化 ──
  function init() {
    initScenes();
    initHeroBtn();
    initTopBtn();

    $('encodeBtn').addEventListener('click', doEncode);
    $('dataInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doEncode();
    });
    $('recoverBtn').addEventListener('click', doRecover);
    $('clearDamageBtn').addEventListener('click', clearDamage);
    $('randomDamageBtn').addEventListener('click', randomDamage);

    // 自动编码一次
    doEncode();
    initThresholdChart();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

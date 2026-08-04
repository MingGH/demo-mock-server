// ========== 主控制逻辑 ==========

// ══════════════════════════════════════════════════════════
// 行为埋点（NFTrack，见 components/track.js）
// 事件清单：
//   session_start   → 会话开始（trackOnce）
//   tetris_start    → 开始或重开一局俄罗斯方块
//   tetris_finish   → 一局结束 { utilization }（回答人类装箱空间利用率）
//   compare         → 与算法对比（回答是否走到对比环节）
//   session_end     → 离页（pagehide, force）
// ══════════════════════════════════════════════════════════
function nfTrack(name, props, opts) {
  try {
    if (window.NFTrack && typeof window.NFTrack.track === 'function') {
      window.NFTrack.track(name, props, opts);
    }
  } catch (e) {}
}
var trackSessionStarted = false;
function trackSessionStart() {
  if (trackSessionStarted) return;
  trackSessionStarted = true;
  nfTrack('session_start', {});
}
window.addEventListener('pagehide', function () {
  nfTrack('session_end', { reason: 'leave' }, { force: true });
});
trackSessionStart();

// ── 俄罗斯方块部分 ──
TETRIS.init('tetrisCanvas', 'nextCanvas', onTetrisFinish);

document.getElementById('startTetrisBtn').addEventListener('click', () => {
  nfTrack('tetris_start', { attempt: 'first' });
  document.getElementById('tetrisOverlay').style.display = 'none';
  document.getElementById('tetrisResult').style.display = 'none';
  TETRIS.start();
});

document.getElementById('retryTetrisBtn').addEventListener('click', () => {
  nfTrack('tetris_start', { attempt: 'retry' });
  document.getElementById('tetrisResult').style.display = 'none';
  TETRIS.start();
});

document.getElementById('goPackingBtn').addEventListener('click', () => {
  document.getElementById('packingSection').scrollIntoView({ behavior: 'smooth' });
});

// 键盘控制
document.addEventListener('keydown', (e) => {
  if (!TETRIS.isRunning()) return;
  switch (e.key) {
    case 'ArrowLeft': e.preventDefault(); TETRIS.moveLeft(); break;
    case 'ArrowRight': e.preventDefault(); TETRIS.moveRight(); break;
    case 'ArrowUp': e.preventDefault(); TETRIS.rotate(); break;
    case 'ArrowDown': e.preventDefault(); TETRIS.softDrop(); break;
    case ' ': e.preventDefault(); TETRIS.hardDrop(); break;
  }
});

// 触控按钮
document.getElementById('ctrlLeft').addEventListener('click', () => TETRIS.moveLeft());
document.getElementById('ctrlRight').addEventListener('click', () => TETRIS.moveRight());
document.getElementById('ctrlRotate').addEventListener('click', () => TETRIS.rotate());
document.getElementById('ctrlDrop').addEventListener('click', () => TETRIS.hardDrop());

function onTetrisFinish(utilization) {
  const pct = (utilization * 100).toFixed(1);
  nfTrack('tetris_finish', { utilization: Math.round(utilization * 1000) / 1000 });
  document.getElementById('tetrisUtilization').textContent = pct + '%';

  let comment = '';
  if (utilization >= 0.9) comment = '顶级水平。你的空间感觉比大多数启发式算法都好。';
  else if (utilization >= 0.8) comment = '很不错。人类在这类任务中的平均水平是 85-92%，你在这个范围内。';
  else if (utilization >= 0.7) comment = '中等水平。空隙主要来自 L/S/Z 形方块没有贴紧。';
  else comment = '还有提升空间。试试先把方块贴边放，减少中间的空洞。';

  document.getElementById('tetrisComment').textContent = comment;
  document.getElementById('tetrisResult').style.display = '';
}

// ── 装箱部分 ──
PACKING.init('suitcaseCanvas');

document.getElementById('resetPackingBtn').addEventListener('click', () => {
  PACKING.resetPacking();
});

document.getElementById('compareBtn').addEventListener('click', () => {
  nfTrack('compare', {});
  const humanUtil = PACKING.getHumanUtilization();
  const ffdPlacements = PACKING.solveFFD();
  const bfdPlacements = PACKING.solveBFD();
  const ffdUtil = PACKING.calcUtilization(ffdPlacements);
  const bfdUtil = PACKING.calcUtilization(bfdPlacements);

  document.getElementById('humanUtil').textContent = (humanUtil * 100).toFixed(1) + '%';
  document.getElementById('ffdUtil').textContent = (ffdUtil * 100).toFixed(1) + '%';
  document.getElementById('bfdUtil').textContent = (bfdUtil * 100).toFixed(1) + '%';

  // Render algorithm results
  PACKING.renderToCanvas(document.getElementById('ffdCanvas'), ffdPlacements);
  PACKING.renderToCanvas(document.getElementById('bfdCanvas'), bfdPlacements);

  document.getElementById('compareResult').style.display = '';
  document.getElementById('compareResult').scrollIntoView({ behavior: 'smooth' });
});

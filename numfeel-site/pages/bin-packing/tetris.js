// ========== 迷你俄罗斯方块引擎（只堆不消） ==========
const TETRIS = (() => {
  const COLS = 6;
  const ROWS = 10;
  const CELL = 30; // px per cell
  const MAX_PIECES = 15;

  // 7 种标准 Tetromino
  const SHAPES = [
    { name: 'I', color: '#00bcd4', cells: [[0,0],[1,0],[2,0],[3,0]] },
    { name: 'O', color: '#ffd700', cells: [[0,0],[1,0],[0,1],[1,1]] },
    { name: 'T', color: '#ce93d8', cells: [[0,0],[1,0],[2,0],[1,1]] },
    { name: 'S', color: '#81c784', cells: [[1,0],[2,0],[0,1],[1,1]] },
    { name: 'Z', color: '#ff6b6b', cells: [[0,0],[1,0],[1,1],[2,1]] },
    { name: 'L', color: '#ffb74d', cells: [[0,0],[0,1],[0,2],[1,2]] },
    { name: 'J', color: '#64b5f6', cells: [[1,0],[1,1],[1,2],[0,2]] }
  ];

  let grid = [];
  let currentPiece = null;
  let nextPiece = null;
  let pieceX = 0, pieceY = 0;
  let piecesPlaced = 0;
  let running = false;
  let dropInterval = null;
  let canvas, ctx, nextCanvas, nextCtx;
  let onFinish = null;

  function init(canvasId, nextCanvasId, finishCallback) {
    canvas = document.getElementById(canvasId);
    ctx = canvas.getContext('2d');
    nextCanvas = document.getElementById(nextCanvasId);
    nextCtx = nextCanvas.getContext('2d');
    onFinish = finishCallback;
    reset();
  }

  function reset() {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    piecesPlaced = 0;
    running = false;
    currentPiece = null;
    nextPiece = null;
    if (dropInterval) { clearInterval(dropInterval); dropInterval = null; }
    render();
    renderNext();
  }

  function start() {
    reset();
    running = true;
    nextPiece = randomPiece();
    spawnNext();
    dropInterval = setInterval(tick, 600);
  }

  function randomPiece() {
    const s = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    return { ...s, cells: s.cells.map(c => [...c]) };
  }

  function rotateCells(cells) {
    // 90 degrees clockwise around center of bounding box
    const xs = cells.map(c => c[0]);
    const ys = cells.map(c => c[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    return cells.map(([x, y]) => {
      const dx = x - cx, dy = y - cy;
      return [Math.round(cx + dy), Math.round(cy - dx)];
    });
  }

  function spawnNext() {
    currentPiece = nextPiece;
    nextPiece = randomPiece();
    // center horizontally
    const xs = currentPiece.cells.map(c => c[0]);
    const w = Math.max(...xs) - Math.min(...xs) + 1;
    pieceX = Math.floor((COLS - w) / 2);
    pieceY = 0;
    // adjust so min y is 0
    const minY = Math.min(...currentPiece.cells.map(c => c[1]));
    if (minY !== 0) currentPiece.cells = currentPiece.cells.map(([x, y]) => [x, y - minY]);

    if (!canPlace(currentPiece.cells, pieceX, pieceY)) {
      // game over - board full
      finish();
      return;
    }
    renderNext();
    render();
    updateCount();
  }

  function canPlace(cells, ox, oy) {
    return cells.every(([cx, cy]) => {
      const x = ox + cx, y = oy + cy;
      return x >= 0 && x < COLS && y >= 0 && y < ROWS && !grid[y][x];
    });
  }

  function lock() {
    currentPiece.cells.forEach(([cx, cy]) => {
      const x = pieceX + cx, y = pieceY + cy;
      if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
        grid[y][x] = currentPiece.color;
      }
    });
    piecesPlaced++;
    updateCount();
    if (piecesPlaced >= MAX_PIECES) {
      finish();
    } else {
      spawnNext();
    }
  }

  function tick() {
    if (!running) return;
    if (canPlace(currentPiece.cells, pieceX, pieceY + 1)) {
      pieceY++;
    } else {
      lock();
    }
    render();
  }

  function moveLeft() {
    if (!running) return;
    if (canPlace(currentPiece.cells, pieceX - 1, pieceY)) { pieceX--; render(); }
  }

  function moveRight() {
    if (!running) return;
    if (canPlace(currentPiece.cells, pieceX + 1, pieceY)) { pieceX++; render(); }
  }

  function rotate() {
    if (!running) return;
    const rotated = rotateCells(currentPiece.cells);
    // wall kick: try 0, +1, -1
    for (const dx of [0, 1, -1, 2, -2]) {
      if (canPlace(rotated, pieceX + dx, pieceY)) {
        currentPiece.cells = rotated;
        pieceX += dx;
        render();
        return;
      }
    }
  }

  function softDrop() {
    if (!running) return;
    if (canPlace(currentPiece.cells, pieceX, pieceY + 1)) { pieceY++; render(); }
  }

  function hardDrop() {
    if (!running) return;
    while (canPlace(currentPiece.cells, pieceX, pieceY + 1)) { pieceY++; }
    lock();
    render();
  }

  function finish() {
    running = false;
    if (dropInterval) { clearInterval(dropInterval); dropInterval = null; }
    const utilization = calcUtilization();
    if (onFinish) onFinish(utilization);
  }

  function calcUtilization() {
    let filled = 0;
    // count cells from top to the lowest filled row
    let lowestRow = -1;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c]) { lowestRow = r; break; }
      }
    }
    if (lowestRow === -1) return 0;
    // area = cols * (rows from lowestRow to bottom)
    const height = ROWS - lowestRow;
    const totalArea = COLS * height;
    for (let r = lowestRow; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c]) filled++;
      }
    }
    return filled / totalArea;
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 0.5;
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(COLS * CELL, r * CELL); ctx.stroke();
    }
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, ROWS * CELL); ctx.stroke();
    }
    // placed cells
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c]) drawCell(ctx, c, r, grid[r][c]);
      }
    }
    // current piece + ghost
    if (running && currentPiece) {
      // ghost
      let ghostY = pieceY;
      while (canPlace(currentPiece.cells, pieceX, ghostY + 1)) ghostY++;
      currentPiece.cells.forEach(([cx, cy]) => {
        const x = pieceX + cx, y = ghostY + cy;
        if (y >= 0 && y < ROWS) {
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
        }
      });
      // actual piece
      currentPiece.cells.forEach(([cx, cy]) => {
        drawCell(ctx, pieceX + cx, pieceY + cy, currentPiece.color);
      });
    }
  }

  function drawCell(context, x, y, color) {
    context.fillStyle = color;
    context.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
    context.fillStyle = 'rgba(255,255,255,0.2)';
    context.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, 3);
  }

  function renderNext() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    if (!nextPiece) return;
    const cellSize = 18;
    const xs = nextPiece.cells.map(c => c[0]);
    const ys = nextPiece.cells.map(c => c[1]);
    const w = (Math.max(...xs) - Math.min(...xs) + 1) * cellSize;
    const h = (Math.max(...ys) - Math.min(...ys) + 1) * cellSize;
    const ox = (nextCanvas.width - w) / 2 - Math.min(...xs) * cellSize;
    const oy = (nextCanvas.height - h) / 2 - Math.min(...ys) * cellSize;
    nextPiece.cells.forEach(([cx, cy]) => {
      nextCtx.fillStyle = nextPiece.color;
      nextCtx.fillRect(ox + cx * cellSize + 1, oy + cy * cellSize + 1, cellSize - 2, cellSize - 2);
    });
  }

  function updateCount() {
    const el = document.getElementById('pieceCount');
    if (el) el.textContent = piecesPlaced;
  }

  function isRunning() { return running; }

  return { init, start, reset, moveLeft, moveRight, rotate, softDrop, hardDrop, isRunning };
})();

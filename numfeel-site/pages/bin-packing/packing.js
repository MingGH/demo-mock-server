// ========== 2D 装箱模块（支持预览阴影 + 可调整已放置物品） ==========
const PACKING = (() => {
  const BOX_W = 400;
  const BOX_H = 300;

  const COLORS = [
    '#ff6b6b', '#ffd700', '#64b5f6', '#81c784', '#ce93d8',
    '#ffb74d', '#4dd0e1', '#f06292', '#aed581', '#7986cb'
  ];

  let items = [];
  let placedItems = []; // { item, x, y }
  let canvas, ctx;
  // Ghost preview state
  let ghostItem = null;
  let ghostX = 0, ghostY = 0;
  let ghostValid = false;
  // Drag from canvas (reposition)
  let draggingPlaced = null; // index in placedItems
  let pointerOffset = { x: 0, y: 0 };

  function init(canvasId) {
    canvas = document.getElementById(canvasId);
    ctx = canvas.getContext('2d');
    generateItems();
    render();
    setupInteractions();
  }

  function generateItems() {
    items = [];
    placedItems = [];
    // Generate items whose total area is ~130-150% of box area
    // so user can't fit them all — the challenge is maximizing what fits
    const boxArea = BOX_W * BOX_H;
    const targetTotal = boxArea * (1.3 + Math.random() * 0.2); // 130%-150%
    let totalArea = 0;
    let id = 0;
    while (totalArea < targetTotal) {
      const w = 40 + Math.floor(Math.random() * 100);
      const h = 30 + Math.floor(Math.random() * 80);
      items.push({ id, w, h, color: COLORS[id % COLORS.length], placed: false });
      totalArea += w * h;
      id++;
    }
    renderItemsList();
  }

  function renderItemsList() {
    const list = document.getElementById('itemsList');
    if (!list) return;
    list.innerHTML = '';
    items.forEach(item => {
      const chip = document.createElement('div');
      chip.className = 'item-chip' + (item.placed ? ' placed' : '');
      chip.dataset.id = item.id;
      chip.innerHTML = `
        <span class="item-color" style="background:${item.color}"></span>
        <span>${item.w} × ${item.h}</span>
      `;
      if (!item.placed) {
        chip.draggable = true;
        chip.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', JSON.stringify({ id: item.id, source: 'list' }));
          e.dataTransfer.effectAllowed = 'move';
          ghostItem = item;
        });
        chip.addEventListener('dragend', () => { ghostItem = null; clearGhost(); });
      }
      list.appendChild(chip);
    });
  }

  function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = BOX_W / rect.width;
    const scaleY = BOX_H / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  function snapPos(x, y, item) {
    let sx = Math.round(x / 10) * 10;
    let sy = Math.round(y / 10) * 10;
    sx = Math.max(0, Math.min(BOX_W - item.w, sx));
    sy = Math.max(0, Math.min(BOX_H - item.h, sy));
    return { x: sx, y: sy };
  }

  function setupInteractions() {
    // ── Drag from list into canvas ──
    canvas.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (ghostItem) {
        const pos = getCanvasPos(e);
        const snapped = snapPos(pos.x - ghostItem.w / 2, pos.y - ghostItem.h / 2, ghostItem);
        ghostX = snapped.x;
        ghostY = snapped.y;
        ghostValid = !hasOverlap(ghostItem, ghostX, ghostY, -1);
        render();
      }
    });

    canvas.addEventListener('dragleave', () => { clearGhost(); render(); });

    canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      let data;
      try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }

      if (data.source === 'list') {
        const item = items.find(it => it.id === data.id);
        if (!item || item.placed) return;
        const pos = getCanvasPos(e);
        const snapped = snapPos(pos.x - item.w / 2, pos.y - item.h / 2, item);
        if (!hasOverlap(item, snapped.x, snapped.y, -1)) {
          item.placed = true;
          placedItems.push({ item, x: snapped.x, y: snapped.y });
          renderItemsList();
          updateStats();
        }
      }
      ghostItem = null;
      clearGhost();
      render();
    });

    // ── Pointer events for repositioning placed items ──
    let pointerDown = false;

    canvas.addEventListener('pointerdown', (e) => {
      const pos = getCanvasPos(e);
      // Find topmost placed item under pointer (reverse order = topmost)
      for (let i = placedItems.length - 1; i >= 0; i--) {
        const p = placedItems[i];
        if (pos.x >= p.x && pos.x <= p.x + p.item.w && pos.y >= p.y && pos.y <= p.y + p.item.h) {
          draggingPlaced = i;
          pointerOffset.x = pos.x - p.x;
          pointerOffset.y = pos.y - p.y;
          pointerDown = true;
          ghostItem = p.item;
          canvas.setPointerCapture(e.pointerId);
          e.preventDefault();
          return;
        }
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!pointerDown || draggingPlaced === null) return;
      const pos = getCanvasPos(e);
      const item = placedItems[draggingPlaced].item;
      const snapped = snapPos(pos.x - pointerOffset.x, pos.y - pointerOffset.y, item);
      ghostX = snapped.x;
      ghostY = snapped.y;
      ghostValid = !hasOverlap(item, ghostX, ghostY, draggingPlaced);
      render();
    });

    canvas.addEventListener('pointerup', (e) => {
      if (!pointerDown || draggingPlaced === null) { pointerDown = false; return; }
      const pos = getCanvasPos(e);
      const item = placedItems[draggingPlaced].item;
      const snapped = snapPos(pos.x - pointerOffset.x, pos.y - pointerOffset.y, item);

      if (!hasOverlap(item, snapped.x, snapped.y, draggingPlaced)) {
        placedItems[draggingPlaced].x = snapped.x;
        placedItems[draggingPlaced].y = snapped.y;
        updateStats();
      }
      pointerDown = false;
      draggingPlaced = null;
      ghostItem = null;
      clearGhost();
      render();
    });

    canvas.addEventListener('pointercancel', () => {
      pointerDown = false;
      draggingPlaced = null;
      ghostItem = null;
      clearGhost();
      render();
    });
  }

  function clearGhost() { ghostItem = null; ghostValid = false; }

  function hasOverlap(newItem, nx, ny, skipIndex) {
    return placedItems.some((p, idx) => {
      if (idx === skipIndex) return false;
      return !(nx + newItem.w <= p.x || nx >= p.x + p.item.w ||
               ny + newItem.h <= p.y || ny >= p.y + p.item.h);
    });
  }

  function render() {
    ctx.clearRect(0, 0, BOX_W, BOX_H);
    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= BOX_W; x += 20) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, BOX_H); ctx.stroke();
    }
    for (let y = 0; y <= BOX_H; y += 20) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(BOX_W, y); ctx.stroke();
    }
    // placed items (skip the one being dragged)
    placedItems.forEach((p, idx) => {
      if (idx === draggingPlaced) {
        // draw dimmed original position
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(p.x, p.y, p.item.w, p.item.h);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(p.x, p.y, p.item.w, p.item.h);
        ctx.setLineDash([]);
        return;
      }
      drawItem(ctx, p.item, p.x, p.y, 1);
    });
    // Ghost preview
    if (ghostItem) {
      const alpha = ghostValid ? 0.5 : 0.25;
      drawItem(ctx, ghostItem, ghostX, ghostY, alpha);
      // border color indicates valid/invalid
      ctx.strokeStyle = ghostValid ? 'rgba(129,199,132,0.8)' : 'rgba(255,107,107,0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(ghostX, ghostY, ghostItem.w, ghostItem.h);
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
    }
  }

  function drawItem(context, item, x, y, alpha) {
    context.globalAlpha = alpha;
    context.fillStyle = item.color;
    context.fillRect(x, y, item.w, item.h);
    context.strokeStyle = 'rgba(255,255,255,0.3)';
    context.lineWidth = 1;
    context.strokeRect(x, y, item.w, item.h);
    context.fillStyle = 'rgba(0,0,0,0.6)';
    context.font = '11px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(`${item.w}×${item.h}`, x + item.w / 2, y + item.h / 2);
    context.globalAlpha = 1;
  }

  function renderToCanvas(targetCanvas, placements) {
    const tctx = targetCanvas.getContext('2d');
    tctx.clearRect(0, 0, BOX_W, BOX_H);
    tctx.strokeStyle = 'rgba(255,255,255,0.03)';
    tctx.lineWidth = 0.5;
    for (let x = 0; x <= BOX_W; x += 20) {
      tctx.beginPath(); tctx.moveTo(x, 0); tctx.lineTo(x, BOX_H); tctx.stroke();
    }
    for (let y = 0; y <= BOX_H; y += 20) {
      tctx.beginPath(); tctx.moveTo(0, y); tctx.lineTo(BOX_W, y); tctx.stroke();
    }
    placements.forEach(({ item, x, y }) => drawItem(tctx, item, x, y, 1));
  }

  function updateStats() {
    const totalArea = BOX_W * BOX_H;
    const usedArea = placedItems.reduce((sum, { item }) => sum + item.w * item.h, 0);
    const pct = ((usedArea / totalArea) * 100).toFixed(1);
    const el1 = document.getElementById('usedPercent');
    const el2 = document.getElementById('remainPercent');
    if (el1) el1.textContent = pct + '%';
    if (el2) el2.textContent = (100 - parseFloat(pct)).toFixed(1) + '%';
  }

  function getHumanUtilization() {
    const totalArea = BOX_W * BOX_H;
    const usedArea = placedItems.reduce((sum, { item }) => sum + item.w * item.h, 0);
    return usedArea / totalArea;
  }

  // ========== Algorithms ==========
  function solveFFD() {
    const sorted = [...items].sort((a, b) => b.h * b.w - a.h * a.w);
    return shelfPack(sorted, 'first-fit');
  }

  function solveBFD() {
    const sorted = [...items].sort((a, b) => b.h * b.w - a.h * a.w);
    return shelfPack(sorted, 'best-fit');
  }

  function shelfPack(sortedItems, strategy) {
    const placements = [];
    const shelves = [];

    for (const item of sortedItems) {
      let placed = false;
      if (strategy === 'first-fit') {
        for (const shelf of shelves) {
          if (shelf.usedWidth + item.w <= BOX_W && shelf.height >= item.h) {
            placements.push({ item, x: shelf.usedWidth, y: shelf.y });
            shelf.usedWidth += item.w;
            placed = true;
            break;
          }
        }
      } else {
        let bestShelf = null, bestRemaining = Infinity;
        for (const shelf of shelves) {
          if (shelf.usedWidth + item.w <= BOX_W && shelf.height >= item.h) {
            const remaining = BOX_W - shelf.usedWidth - item.w;
            if (remaining < bestRemaining) { bestRemaining = remaining; bestShelf = shelf; }
          }
        }
        if (bestShelf) {
          placements.push({ item, x: bestShelf.usedWidth, y: bestShelf.y });
          bestShelf.usedWidth += item.w;
          placed = true;
        }
      }
      if (!placed) {
        const shelfY = shelves.length === 0 ? 0 : shelves[shelves.length - 1].y + shelves[shelves.length - 1].height;
        if (shelfY + item.h <= BOX_H) {
          shelves.push({ y: shelfY, height: item.h, usedWidth: item.w });
          placements.push({ item, x: 0, y: shelfY });
        }
      }
    }
    return placements;
  }

  function calcUtilization(placements) {
    const totalArea = BOX_W * BOX_H;
    const usedArea = placements.reduce((sum, { item }) => sum + item.w * item.h, 0);
    return usedArea / totalArea;
  }

  function resetPacking() {
    generateItems();
    render();
    updateStats();
    document.getElementById('compareResult').style.display = 'none';
  }

  return {
    init, resetPacking, getHumanUtilization,
    solveFFD, solveBFD, calcUtilization, renderToCanvas
  };
})();

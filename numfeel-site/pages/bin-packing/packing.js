// ========== 2D 装箱模块 ==========
const PACKING = (() => {
  const BOX_W = 400;
  const BOX_H = 300;

  // 预定义物品颜色
  const COLORS = [
    '#ff6b6b', '#ffd700', '#64b5f6', '#81c784', '#ce93d8',
    '#ffb74d', '#4dd0e1', '#f06292', '#aed581', '#7986cb'
  ];

  let items = [];
  let placedItems = []; // { item, x, y }
  let canvas, ctx;
  let dragItem = null;
  let dragOffsetX = 0, dragOffsetY = 0;
  let isDragging = false;

  function init(canvasId) {
    canvas = document.getElementById(canvasId);
    ctx = canvas.getContext('2d');
    generateItems();
    render();
    setupDragAndDrop();
  }

  function generateItems() {
    items = [];
    placedItems = [];
    // Generate 8-12 random rectangles
    const count = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      const w = 40 + Math.floor(Math.random() * 100);
      const h = 30 + Math.floor(Math.random() * 80);
      items.push({
        id: i,
        w: w,
        h: h,
        color: COLORS[i % COLORS.length],
        placed: false
      });
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
          e.dataTransfer.setData('text/plain', item.id);
        });
      }
      list.appendChild(chip);
    });
  }

  function setupDragAndDrop() {
    canvas.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      const id = parseInt(e.dataTransfer.getData('text/plain'));
      const item = items.find(it => it.id === id);
      if (!item || item.placed) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = BOX_W / rect.width;
      const scaleY = BOX_H / rect.height;
      let x = (e.clientX - rect.left) * scaleX - item.w / 2;
      let y = (e.clientY - rect.top) * scaleY - item.h / 2;

      // snap to grid (10px)
      x = Math.round(x / 10) * 10;
      y = Math.round(y / 10) * 10;

      // clamp to box
      x = Math.max(0, Math.min(BOX_W - item.w, x));
      y = Math.max(0, Math.min(BOX_H - item.h, y));

      // check overlap
      if (!hasOverlap(item, x, y)) {
        item.placed = true;
        placedItems.push({ item, x, y });
        renderItemsList();
        render();
        updateStats();
      }
    });

    // Touch support for mobile
    let touchItem = null;
    const itemsList = document.getElementById('itemsList');
    if (itemsList) {
      itemsList.addEventListener('touchstart', (e) => {
        const chip = e.target.closest('.item-chip');
        if (!chip) return;
        const id = parseInt(chip.dataset.id);
        touchItem = items.find(it => it.id === id && !it.placed);
      });
    }

    canvas.addEventListener('touchend', (e) => {
      if (!touchItem) return;
      const rect = canvas.getBoundingClientRect();
      const touch = e.changedTouches[0];
      const scaleX = BOX_W / rect.width;
      const scaleY = BOX_H / rect.height;
      let x = (touch.clientX - rect.left) * scaleX - touchItem.w / 2;
      let y = (touch.clientY - rect.top) * scaleY - touchItem.h / 2;
      x = Math.round(x / 10) * 10;
      y = Math.round(y / 10) * 10;
      x = Math.max(0, Math.min(BOX_W - touchItem.w, x));
      y = Math.max(0, Math.min(BOX_H - touchItem.h, y));

      if (!hasOverlap(touchItem, x, y)) {
        touchItem.placed = true;
        placedItems.push({ item: touchItem, x, y });
        renderItemsList();
        render();
        updateStats();
      }
      touchItem = null;
    });
  }

  function hasOverlap(newItem, nx, ny) {
    return placedItems.some(({ item, x, y }) => {
      return !(nx + newItem.w <= x || nx >= x + item.w || ny + newItem.h <= y || ny >= y + item.h);
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
    // placed items
    placedItems.forEach(({ item, x, y }) => {
      ctx.fillStyle = item.color;
      ctx.fillRect(x, y, item.w, item.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, item.w, item.h);
      // label
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${item.w}×${item.h}`, x + item.w / 2, y + item.h / 2 + 4);
    });
  }

  function renderToCanvas(targetCanvas, placements) {
    const tctx = targetCanvas.getContext('2d');
    tctx.clearRect(0, 0, BOX_W, BOX_H);
    // grid
    tctx.strokeStyle = 'rgba(255,255,255,0.03)';
    tctx.lineWidth = 0.5;
    for (let x = 0; x <= BOX_W; x += 20) {
      tctx.beginPath(); tctx.moveTo(x, 0); tctx.lineTo(x, BOX_H); tctx.stroke();
    }
    for (let y = 0; y <= BOX_H; y += 20) {
      tctx.beginPath(); tctx.moveTo(0, y); tctx.lineTo(BOX_W, y); tctx.stroke();
    }
    placements.forEach(({ item, x, y }) => {
      tctx.fillStyle = item.color;
      tctx.fillRect(x, y, item.w, item.h);
      tctx.strokeStyle = 'rgba(255,255,255,0.3)';
      tctx.lineWidth = 1;
      tctx.strokeRect(x, y, item.w, item.h);
      tctx.fillStyle = 'rgba(0,0,0,0.6)';
      tctx.font = '10px sans-serif';
      tctx.textAlign = 'center';
      tctx.fillText(`${item.w}×${item.h}`, x + item.w / 2, y + item.h / 2 + 4);
    });
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

  // ========== First-Fit Decreasing (by height) ==========
  function solveFFD() {
    const sorted = [...items].sort((a, b) => b.h * b.w - a.h * a.w);
    return shelfPack(sorted, 'first-fit');
  }

  // ========== Best-Fit Decreasing ==========
  function solveBFD() {
    const sorted = [...items].sort((a, b) => b.h * b.w - a.h * a.w);
    return shelfPack(sorted, 'best-fit');
  }

  // Simple shelf packing algorithm
  function shelfPack(sortedItems, strategy) {
    const placements = [];
    // shelves: each has { y, height, usedWidth }
    const shelves = [];

    for (const item of sortedItems) {
      let placed = false;

      if (strategy === 'first-fit') {
        // find first shelf that fits
        for (const shelf of shelves) {
          if (shelf.usedWidth + item.w <= BOX_W && shelf.height >= item.h) {
            placements.push({ item, x: shelf.usedWidth, y: shelf.y });
            shelf.usedWidth += item.w;
            placed = true;
            break;
          }
        }
      } else {
        // best-fit: find shelf with least remaining space that still fits
        let bestShelf = null;
        let bestRemaining = Infinity;
        for (const shelf of shelves) {
          if (shelf.usedWidth + item.w <= BOX_W && shelf.height >= item.h) {
            const remaining = BOX_W - shelf.usedWidth - item.w;
            if (remaining < bestRemaining) {
              bestRemaining = remaining;
              bestShelf = shelf;
            }
          }
        }
        if (bestShelf) {
          placements.push({ item, x: bestShelf.usedWidth, y: bestShelf.y });
          bestShelf.usedWidth += item.w;
          placed = true;
        }
      }

      if (!placed) {
        // start new shelf
        const shelfY = shelves.length === 0 ? 0 : shelves[shelves.length - 1].y + shelves[shelves.length - 1].height;
        if (shelfY + item.h <= BOX_H) {
          shelves.push({ y: shelfY, height: item.h, usedWidth: item.w });
          placements.push({ item, x: 0, y: shelfY });
        }
        // if doesn't fit, skip this item
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

  function getItems() { return items; }

  return {
    init, resetPacking, getHumanUtilization,
    solveFFD, solveBFD, calcUtilization, renderToCanvas, getItems
  };
})();

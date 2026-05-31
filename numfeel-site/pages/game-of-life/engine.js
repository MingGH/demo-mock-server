'use strict';

var PATTERNS = {
  'glider': {
    name: '滑翔机',
    desc: '最小的可移动图案，每4代向右下移动一格',
    cells: [[1,0],[2,1],[0,2],[1,2],[2,2]]
  },
  'blinker': {
    name: '闪光灯',
    desc: '最简单的振荡器，周期为2',
    cells: [[1,0],[1,1],[1,2]]
  },
  'beacon': {
    name: '信标',
    desc: '周期为2的振荡器，两个2x2方块交替闪烁',
    cells: [[0,0],[1,0],[0,1],[1,1],[2,2],[3,2],[2,3],[3,3]]
  },
  'pulsar': {
    name: '脉冲星',
    desc: '周期为3的大型振荡器',
    cells: [
      [2,0],[3,0],[4,0],[8,0],[9,0],[10,0],
      [0,2],[5,2],[7,2],[12,2],
      [0,3],[5,3],[7,3],[12,3],
      [0,4],[5,4],[7,4],[12,4],
      [2,5],[3,5],[4,5],[8,5],[9,5],[10,5],
      [2,7],[3,7],[4,7],[8,7],[9,7],[10,7],
      [0,8],[5,8],[7,8],[12,8],
      [0,9],[5,9],[7,9],[12,9],
      [0,10],[5,10],[7,10],[12,10],
      [2,12],[3,12],[4,12],[8,12],[9,12],[10,12]
    ]
  },
  'glider-gun': {
    name: '高斯帕滑翔机枪',
    desc: '首个被发现的无限增长图案，每30代发射一个滑翔机',
    cells: [
      [24,0],[22,1],[24,1],[12,2],[13,2],[20,2],[21,2],[34,2],[35,2],
      [11,3],[15,3],[20,3],[21,3],[34,3],[35,3],
      [0,4],[1,4],[10,4],[16,4],[20,4],[21,4],
      [0,5],[1,5],[10,5],[14,5],[16,5],[17,5],[22,5],[24,5],
      [10,6],[16,6],[24,6],
      [11,7],[15,7],
      [12,8],[13,8]
    ]
  },
  'lwss': {
    name: '轻型太空船',
    desc: '每4代水平移动2格，最常见的飞船图案之一',
    cells: [[1,0],[2,0],[3,0],[4,0],[0,1],[4,1],[4,2],[0,3],[3,3]]
  },
  'diehard': {
    name: 'Diehard',
    desc: '一个终将消亡的图案，但需要130代才彻底消失',
    cells: [[6,0],[4,1],[5,1],[6,1],[3,2],[3,3],[4,3],[0,4],[1,4],[2,4]]
  },
  'acorn': {
    name: '橡果',
    desc: '一个不起眼的7细胞图案，能持续生长5206代，最终稳定为633个细胞',
    cells: [[1,0],[3,1],[0,2],[1,2],[3,2],[4,2],[5,2]]
  },
  'r-pentomino': {
    name: 'R-Pentomino',
    desc: '5个细胞的起点，需要1103代才稳定，是经典挑战题目',
    cells: [[1,0],[2,0],[0,1],[1,1],[2,1]]
  }
};

function GameOfLife(cols, rows) {
  this.cols = cols || 80;
  this.rows = rows || 50;
  this.generation = 0;
  this.grid = this._emptyGrid();
  this.nextGrid = this._emptyGrid();
  this.populationHistory = [];
  this.maxHistoryLen = 600;
  this.stable = false;
  this.periodDetected = 0;
}

GameOfLife.prototype._emptyGrid = function () {
  var grid = new Array(this.rows);
  for (var r = 0; r < this.rows; r++) {
    grid[r] = new Array(this.cols);
    for (var c = 0; c < this.cols; c++) {
      grid[r][c] = 0;
    }
  }
  return grid;
};

GameOfLife.prototype._resetHistoryState = function () {
  this.generation = 0;
  this.populationHistory = [];
  this.stable = false;
  this.periodDetected = 0;
};

GameOfLife.prototype.gridHash = function () {
  var parts = new Array(this.rows);
  for (var r = 0; r < this.rows; r++) {
    var row = this.grid[r];
    var s = '';
    for (var c = 0; c < this.cols; c++) {
      s += row[c];
    }
    parts[r] = s;
  }
  return parts.join('|');
};

GameOfLife.prototype.resize = function (cols, rows) {
  var oldGrid = this.grid;
  var oldCols = this.cols;
  var oldRows = this.rows;
  this.cols = cols;
  this.rows = rows;
  this.grid = this._emptyGrid();
  this.nextGrid = this._emptyGrid();
  this._resetHistoryState();
  var minCols = Math.min(oldCols, cols);
  var minRows = Math.min(oldRows, rows);
  for (var r = 0; r < minRows; r++) {
    for (var c = 0; c < minCols; c++) {
      this.grid[r][c] = oldGrid[r][c];
    }
  }
};

GameOfLife.prototype.toggle = function (x, y) {
  if (x >= 0 && x < this.cols && y >= 0 && y < this.rows) {
    this.grid[y][x] = this.grid[y][x] ? 0 : 1;
    this._resetHistoryState();
  }
};

GameOfLife.prototype.setCell = function (x, y, val) {
  if (x >= 0 && x < this.cols && y >= 0 && y < this.rows) {
    this.grid[y][x] = val ? 1 : 0;
    this._resetHistoryState();
  }
};

GameOfLife.prototype.clear = function () {
  this.grid = this._emptyGrid();
  this.nextGrid = this._emptyGrid();
  this._resetHistoryState();
};

GameOfLife.prototype.placePattern = function (patternKey, offsetX, offsetY) {
  var pattern = PATTERNS[patternKey];
  if (!pattern) return;
  this.clear();
  var cells = pattern.cells;
  for (var i = 0; i < cells.length; i++) {
    var x = cells[i][0] + (offsetX || 0);
    var y = cells[i][1] + (offsetY || 0);
    if (x >= 0 && x < this.cols && y >= 0 && y < this.rows) {
      this.grid[y][x] = 1;
    }
  }
  this._resetHistoryState();
};

GameOfLife.prototype.randomFill = function (density) {
  density = density || 0.3;
  this.clear();
  for (var r = 0; r < this.rows; r++) {
    for (var c = 0; c < this.cols; c++) {
      this.grid[r][c] = Math.random() < density ? 1 : 0;
    }
  }
  this._resetHistoryState();
};

GameOfLife.prototype.countNeighbors = function (x, y) {
  var count = 0;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      var nx = (x + dx + this.cols) % this.cols;
      var ny = (y + dy + this.rows) % this.rows;
      count += this.grid[ny][nx];
    }
  }
  return count;
};

GameOfLife.prototype.step = function () {
  var changed = false;
  for (var r = 0; r < this.rows; r++) {
    var row = this.grid[r];
    var nextRow = this.nextGrid[r];
    for (var c = 0; c < this.cols; c++) {
      var neighbors = 0;
      var yUp = r === 0 ? this.rows - 1 : r - 1;
      var yDn = r === this.rows - 1 ? 0 : r + 1;
      var xLf = c === 0 ? this.cols - 1 : c - 1;
      var xRt = c === this.cols - 1 ? 0 : c + 1;

      neighbors += this.grid[yUp][xLf];
      neighbors += this.grid[yUp][c];
      neighbors += this.grid[yUp][xRt];
      neighbors += this.grid[r][xLf];
      neighbors += this.grid[r][xRt];
      neighbors += this.grid[yDn][xLf];
      neighbors += this.grid[yDn][c];
      neighbors += this.grid[yDn][xRt];

      var alive = row[c] === 1;
      if (alive) {
        nextRow[c] = (neighbors === 2 || neighbors === 3) ? 1 : 0;
      } else {
        nextRow[c] = neighbors === 3 ? 1 : 0;
      }
      if (nextRow[c] !== row[c]) changed = true;
    }
  }
  var tmp = this.grid;
  this.grid = this.nextGrid;
  this.nextGrid = tmp;

  this.generation++;

  var pop = this.population();
  this.populationHistory.push({ gen: this.generation, pop: pop, hash: this.gridHash() });
  if (this.populationHistory.length > this.maxHistoryLen) {
    this.populationHistory.shift();
  }

  if (!changed || pop === 0) {
    this.stable = true;
    this.periodDetected = pop === 0 ? 0 : this._detectPeriod();
  } else {
    this.stable = false;
    this.periodDetected = this._detectPeriod();
  }

  return { changed: changed, population: pop, stable: this.stable, period: this.periodDetected };
};

GameOfLife.prototype._detectPeriod = function () {
  var len = this.populationHistory.length;
  if (len < 10) return 0;
  for (var p = 2; p <= 8; p++) {
    if (len < p * 3) continue;
    var match = true;
    for (var i = 0; i < p; i++) {
      var idx = len - 1 - i;
      var idx2 = len - 1 - i - p;
      if (idx2 < 0 || this.populationHistory[idx].hash !== this.populationHistory[idx2].hash) {
        match = false;
        break;
      }
    }
    if (match) return p;
  }
  return 0;
};

GameOfLife.prototype.stepMany = function (n) {
  var result;
  for (var i = 0; i < n; i++) {
    result = this.step();
  }
  return result;
};

GameOfLife.prototype.population = function () {
  var count = 0;
  for (var r = 0; r < this.rows; r++) {
    var row = this.grid[r];
    for (var c = 0; c < this.cols; c++) {
      count += row[c];
    }
  }
  return count;
};

GameOfLife.prototype.density = function () {
  var total = this.cols * this.rows;
  return total > 0 ? this.population() / total : 0;
};

GameOfLife.prototype.snapshot = function () {
  var pop = this.population();
  return {
    generation: this.generation,
    population: pop,
    density: pop / (this.cols * this.rows),
    stable: this.stable,
    period: this.periodDetected,
    cols: this.cols,
    rows: this.rows,
    grid: this.grid
  };
};

function formatLargeNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
  return n.toLocaleString();
}

function formatPercent(v) {
  return (v * 100).toFixed(1) + '%';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GameOfLife, PATTERNS, formatLargeNum, formatPercent };
}

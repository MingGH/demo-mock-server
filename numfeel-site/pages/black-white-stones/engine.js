// ========== 核心算法（可独立测试，无 DOM 依赖） ==========

const TOTAL_BLACK = 50;
const TOTAL_WHITE = 50;
const TOTAL = TOTAL_BLACK + TOTAL_WHITE;

function calcWinProb(b1, w1) {
  const b2 = TOTAL_BLACK - b1;
  const w2 = TOTAL_WHITE - w1;
  const t1 = b1 + w1;
  const t2 = b2 + w2;
  const valid = t1 > 0 && t2 > 0;

  let probA, probB;
  if (t1 === 0) {
    probA = 0;
    probB = t2 === 0 ? 0 : b2 / t2;
  } else if (t2 === 0) {
    probA = b1 / t1;
    probB = 0;
  } else {
    probA = b1 / t1;
    probB = b2 / t2;
  }

  const winProb = 0.5 * probA + 0.5 * probB;
  return { winProb, probA, probB, b1, w1, b2, w2, t1, t2, valid };
}

function simulateDraw(b1, w1) {
  const { b2, w2, t1, t2, valid } = calcWinProb(b1, w1);
  if (!valid) return { bowl: null, stone: null, win: false, valid: false };

  let bowl;
  if (t1 === 0) {
    bowl = 'B';
  } else if (t2 === 0) {
    bowl = 'A';
  } else {
    bowl = Math.random() < 0.5 ? 'A' : 'B';
  }

  const stoneCount = bowl === 'A' ? t1 : t2;
  const blackCount = bowl === 'A' ? b1 : b2;
  const stone = Math.random() * stoneCount < blackCount ? 'black' : 'white';

  return { bowl, stone, win: stone === 'black', valid: true };
}

function monteCarlo(b1, w1, n) {
  let wins = 0;
  const { valid } = calcWinProb(b1, w1);
  if (!valid) return { wins: 0, total: 0, rate: 0, valid: false };
  for (let i = 0; i < n; i++) {
    if (simulateDraw(b1, w1).win) wins++;
  }
  return { wins, total: n, rate: wins / n, valid: true };
}

function calcAllProbs() {
  const grid = [];
  for (let b = 0; b <= TOTAL_BLACK; b++) {
    const row = [];
    for (let w = 0; w <= TOTAL_WHITE; w++) {
      row.push(calcWinProb(b, w).winProb);
    }
    grid.push(row);
  }
  return grid;
}

function findOptimal() {
  const allProbs = calcAllProbs();
  let maxProb = 0, maxB = 0, maxW = 0;
  for (let b = 0; b <= TOTAL_BLACK; b++) {
    for (let w = 0; w <= TOTAL_WHITE; w++) {
      if (allProbs[b][w] > maxProb) {
        maxProb = allProbs[b][w];
        maxB = b;
        maxW = w;
      }
    }
  }
  return { b1: maxB, w1: maxW, winProb: maxProb };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calcWinProb, simulateDraw, monteCarlo, calcAllProbs, findOptimal, TOTAL_BLACK, TOTAL_WHITE, TOTAL };
}

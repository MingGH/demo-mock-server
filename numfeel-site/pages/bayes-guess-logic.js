// 贝叶斯猜数字 — 核心逻辑（可独立测试）
// 系统在 [1, N] 中随机选一个数，玩家每次猜一个数，
// 系统给出"偏高/偏低/正确"的提示，但提示有 lieProb 概率说谎。
// 用贝叶斯更新维护每个数字的后验概率分布。

function createGame(N, lieProb) {
  N = (N === undefined || N === null) ? 100 : N;
  lieProb = (lieProb === undefined || lieProb === null) ? 0.2 : lieProb;
  var secret = Math.floor(Math.random() * N) + 1;
  // 均匀先验
  var prior = new Array(N);
  for (var i = 0; i < N; i++) prior[i] = 1 / N;
  var history = []; // { guess, hint, truthful }
  return { N: N, lieProb: lieProb, secret: secret, prior: prior, history: history };
}

// 给定猜测，生成提示（可能说谎）
function generateHint(game, guess) {
  var truth;
  if (guess === game.secret) {
    truth = 'correct';
  } else if (guess > game.secret) {
    truth = 'high';
  } else {
    truth = 'low';
  }
  // 如果猜中了，永远返回 correct（不说谎）
  if (truth === 'correct') return { hint: 'correct', truthful: true };
  var lies = game.lieProb > 0 && Math.random() < game.lieProb;
  var hint;
  if (lies) {
    hint = (truth === 'high') ? 'low' : 'high';
  } else {
    hint = truth;
  }
  return { hint: hint, truthful: !lies };
}

// 贝叶斯更新：给定猜测和提示，更新后验分布
function bayesUpdate(prior, N, guess, hint, lieProb) {
  var newPrior = new Array(N);
  var sum = 0;
  for (var x = 1; x <= N; x++) {
    var likelihood = getLikelihood(x, guess, hint, lieProb);
    newPrior[x - 1] = prior[x - 1] * likelihood;
    sum += newPrior[x - 1];
  }
  // 归一化
  if (sum > 0) {
    for (var i = 0; i < N; i++) newPrior[i] = newPrior[i] / sum;
  }
  return newPrior;
}

// P(hint | secret=x, guess)
function getLikelihood(x, guess, hint, lieProb) {
  if (x === guess) {
    // 如果 x 就是猜的数，只有 hint=correct 才可能
    return hint === 'correct' ? 1 : 0;
  }
  // x != guess，hint 不可能是 correct
  if (hint === 'correct') return 0;

  var truthDir = (x > guess) ? 'low' : 'high'; // 真实方向：secret > guess → 应该说 low（猜低了）
  // 修正：如果 secret=x > guess，真实提示应该是 "low"（你猜低了）
  // 如果 secret=x < guess，真实提示应该是 "high"（你猜高了）
  if (x > guess) {
    truthDir = 'low'; // 猜低了
  } else {
    truthDir = 'high'; // 猜高了
  }

  if (hint === truthDir) {
    return 1 - lieProb; // 说了真话
  } else {
    return lieProb; // 说了谎
  }
}

// 执行一步：猜测 → 生成提示 → 贝叶斯更新
function playStep(game, guess) {
  var result = generateHint(game, guess);
  game.history.push({ guess: guess, hint: result.hint, truthful: result.truthful });
  if (result.hint === 'correct') {
    return { hint: result.hint, truthful: result.truthful, won: true };
  }
  game.prior = bayesUpdate(game.prior, game.N, guess, result.hint, game.lieProb);
  return { hint: result.hint, truthful: result.truthful, won: false };
}

// 获取当前最大后验概率的数字（MAP估计）
function getMapEstimate(prior) {
  var maxP = 0, maxIdx = 0;
  for (var i = 0; i < prior.length; i++) {
    if (prior[i] > maxP) { maxP = prior[i]; maxIdx = i; }
  }
  return { value: maxIdx + 1, prob: maxP };
}

// 获取后验分布的熵（衡量不确定性）
function getEntropy(prior) {
  var H = 0;
  for (var i = 0; i < prior.length; i++) {
    if (prior[i] > 0) H -= prior[i] * Math.log2(prior[i]);
  }
  return H;
}

// AI 策略：选择使期望信息增益最大的猜测
function getBestGuess(prior, N, lieProb) {
  var bestGuess = 1, bestIG = -1;
  // 为了性能，只检查有意义的候选（概率 > 0 的区间）
  var lo = 0, hi = N - 1;
  while (lo < N && prior[lo] < 1e-10) lo++;
  while (hi >= 0 && prior[hi] < 1e-10) hi--;
  if (lo > hi) return Math.floor(N / 2);

  var currentEntropy = getEntropy(prior);

  for (var g = lo + 1; g <= hi + 1; g++) {
    // 计算猜 g 后的期望熵
    var expectedEntropy = 0;
    var hints = ['high', 'low', 'correct'];
    for (var h = 0; h < hints.length; h++) {
      var hint = hints[h];
      var updated = bayesUpdate(prior, N, g, hint, lieProb);
      // P(hint) = sum of updated * prior 的归一化常数
      var pHint = 0;
      for (var x = 0; x < N; x++) {
        pHint += prior[x] * getLikelihood(x + 1, g, hint, lieProb);
      }
      if (pHint > 0) {
        expectedEntropy += pHint * getEntropy(updated);
      }
    }
    var ig = currentEntropy - expectedEntropy;
    if (ig > bestIG) { bestIG = ig; bestGuess = g; }
  }
  return bestGuess;
}

// 模拟一局完整游戏（AI 策略），返回步数
function simulateAIGame(N, lieProb) {
  var game = createGame(N, lieProb);
  var maxSteps = 200;
  for (var step = 0; step < maxSteps; step++) {
    var guess = getBestGuess(game.prior, game.N, game.lieProb);
    var result = playStep(game, guess);
    if (result.won) return step + 1;
  }
  return maxSteps;
}

// 模拟多局，返回统计
function simulateMultiple(trials, N, lieProb) {
  var steps = [];
  for (var i = 0; i < trials; i++) {
    steps.push(simulateAIGame(N, lieProb));
  }
  steps.sort(function(a, b) { return a - b; });
  var sum = 0;
  for (var i = 0; i < steps.length; i++) sum += steps[i];
  return {
    mean: (sum / steps.length).toFixed(1),
    median: steps[Math.floor(steps.length / 2)],
    min: steps[0],
    max: steps[steps.length - 1],
    distribution: steps
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createGame: createGame,
    generateHint: generateHint,
    bayesUpdate: bayesUpdate,
    getLikelihood: getLikelihood,
    playStep: playStep,
    getMapEstimate: getMapEstimate,
    getEntropy: getEntropy,
    getBestGuess: getBestGuess,
    simulateAIGame: simulateAIGame,
    simulateMultiple: simulateMultiple
  };
}

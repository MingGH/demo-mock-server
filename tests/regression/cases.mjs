export const cases = [
  { name: "word-cloud", method: "GET", path: "/word-cloud", compare: "structure" },
  { name: "word-cloud-search", method: "GET", path: "/word-cloud?search=%E6%88%91", compare: "structure" },
  { name: "quantum-available", method: "GET", path: "/quantum/available", compare: "structure" },
  { name: "memory-leaderboard-get", method: "GET", path: "/memory-challenge/leaderboard?limit=3", compare: "exact" },
  {
    name: "memory-leaderboard-post",
    method: "POST",
    path: "/memory-challenge/leaderboard",
    compare: "structure",
    body: {
      name: "Regression",
      capacity: 12,
      history: [
        { n: 8, accuracy: 100 },
        { n: 12, accuracy: 92 }
      ]
    }
  },

  { name: "fingerprint-stats", method: "GET", path: "/fingerprint/stats", compare: "exact" },
  {
    name: "fingerprint-collect",
    method: "POST",
    path: "/fingerprint/collect",
    compare: "exact",
    body: {
      fullHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      canvasHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      fontHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      webglHash: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      screenInfo: "1920x1080@24bit",
      timezone: "Asia/Shanghai",
      language: "zh-CN",
      platform: "MacIntel",
      hardwareConcurrency: 8,
      deviceMemory: 8,
      touchSupport: false,
      colorDepth: 24,
      pixelRatio: 2,
      entropyBits: 52
    }
  },

  { name: "social-engineering-stats", method: "GET", path: "/social-engineering/stats", compare: "exact" },
  {
    name: "social-engineering-submit",
    method: "POST",
    path: "/social-engineering/submit",
    compare: "exact",
    body: {
      sessionId: "11111111-1111-1111-1111-111111111111",
      total: 3,
      correct: 2,
      questions: [
        { questionId: 1, tactic: "authority", isFake: true, correct: true },
        { questionId: 2, tactic: "urgency", isFake: true, correct: false },
        { questionId: 3, tactic: "real", isFake: false, correct: true }
      ]
    }
  },

  { name: "inference-get", method: "GET", path: "/inference/leaderboard?limit=5", compare: "exact" },
  {
    name: "inference-post",
    method: "POST",
    path: "/inference/leaderboard",
    compare: "exact",
    body: { name: "回归测试", score: 420, rounds: 6, wins: 4, grade: "数据侦探" }
  },

  { name: "stroop-stats", method: "GET", path: "/stroop/stats", compare: "exact" },
  {
    name: "stroop-submit",
    method: "POST",
    path: "/stroop/submit",
    compare: "exact",
    body: {
      total: 20,
      correctCount: 18,
      accuracy: 1,
      avgRT: 520,
      conAvgRT: 450,
      incAvgRT: 620,
      stroopEffect: 170,
      grade: "正常水平"
    }
  },

  { name: "barnum-stats", method: "GET", path: "/barnum-test/stats", compare: "exact" },
  {
    name: "barnum-submit",
    method: "POST",
    path: "/barnum-test/submit",
    compare: "exact",
    body: { userGroup: "tarot", rating1: 4, rating2: 5, rating3: 3, rating4: 4, rating5: 5 }
  },

  { name: "captcha-stats", method: "GET", path: "/captcha/stats", compare: "exact" },
  {
    name: "captcha-submit",
    method: "POST",
    path: "/captcha/submit",
    compare: "exact",
    body: {
      passedCount: 6,
      totalTimeMs: 49600,
      grade: "A",
      levels: {
        text: 1,
        math: 1,
        slider: 1,
        grid: 1,
        click: 0,
        rotate: 1,
        spatial: 0,
        behavior: 1,
        timeText: 5200,
        timeMath: 3100,
        timeSlider: 4500,
        timeGrid: 8200,
        timeClick: 6300,
        timeRotate: 7100,
        timeSpatial: 5800,
        timeBehavior: 9400
      }
    }
  },

  { name: "inception-maze-stats", method: "GET", path: "/inception-maze/stats", compare: "exact" },
  {
    name: "inception-maze-submit",
    method: "POST",
    path: "/inception-maze/submit",
    compare: "exact",
    body: { gridSize: 20, pathLength: 167, minPath: 39, detourRatio: 4, dreamLevel: 5, wallCount: 186 }
  },

  { name: "devil-deal-stats", method: "GET", path: "/devil-deal/stats", compare: "exact" },
  {
    name: "devil-deal-submit",
    method: "POST",
    path: "/devil-deal/submit",
    compare: "exact",
    body: {
      dealType: "money",
      secondType: "love",
      powerPct: 30,
      lovePct: 55,
      moneyPct: 80,
      revengePct: 10,
      recognitionPct: 40,
      knowledgePct: 25
    }
  },

  { name: "time-perception-stats", method: "GET", path: "/time-perception/stats", compare: "exact" },
  { name: "time-perception-leaderboard", method: "GET", path: "/time-perception/leaderboard?limit=5", compare: "exact" },
  {
    name: "time-perception-submit",
    method: "POST",
    path: "/time-perception/submit",
    compare: "exact",
    body: {
      name: "回归测试",
      totalScore: 75,
      weberScore: 0,
      avgAbsDistortion: 0,
      blankAvgDistortion: 0,
      loadAvgDistortion: 0,
      emotionAvgDistortion: 0,
      biasDirection: "overestimator",
      grade: "良好时感"
    }
  },

  { name: "cascade-failure-stats", method: "GET", path: "/cascade-failure/stats", compare: "exact" },
  { name: "cascade-failure-leaderboard", method: "GET", path: "/cascade-failure/leaderboard?limit=5", compare: "exact" },
  {
    name: "cascade-failure-submit",
    method: "POST",
    path: "/cascade-failure/submit",
    compare: "exact",
    body: {
      topology: "scale-free",
      coupling: 55,
      capacity: 12,
      strategy: "none",
      triggerPos: "hub",
      survivalRate: 1,
      cascadeSteps: 0,
      maxComponent: 79,
      totalNodes: 80,
      score: 99
    }
  },

  { name: "newcomb-stats", method: "GET", path: "/newcomb/stats", compare: "exact" },
  {
    name: "newcomb-submit",
    method: "POST",
    path: "/newcomb/submit",
    compare: "exact",
    body: { choice: "one", prediction: "one", hit: true, payoff: 1000000 }
  },

  { name: "sorites-stats", method: "GET", path: "/sorites/stats", compare: "exact" },
  {
    name: "sorites-submit",
    method: "POST",
    path: "/sorites/submit",
    compare: "exact",
    body: { sandBoundary: 1500, sandSharpness: "sharp", baldBoundary: 5000, colorBoundary: 45 }
  },

  { name: "cosmic-reaper-stats", method: "GET", path: "/cosmic-reaper/stats", compare: "exact" },
  {
    name: "cosmic-reaper-submit",
    method: "POST",
    path: "/cosmic-reaper/submit",
    compare: "exact",
    body: {
      strategy: "balanced",
      escaped: true,
      turns: 12,
      score: 88,
      finalTech: 75,
      finalSignal: 40,
      finalStealth: 65
    }
  },

  { name: "seckill-stats", method: "GET", path: "/seckill/stats", compare: "exact" },
  {
    name: "seckill-submit",
    method: "POST",
    path: "/seckill/submit",
    compare: "exact",
    body: { participants: 2000, stock: 100, userWon: false, userRank: 342, userLatency: 94, latencyGap: 43 }
  },

  { name: "monkey-stats", method: "GET", path: "/monkey/stats", compare: "exact" },
  {
    name: "monkey-submit",
    method: "POST",
    path: "/monkey/submit",
    compare: "exact",
    body: { targetText: "abc", targetLength: 3, totalAttempts: 13281, totalChars: 13281, success: true, timeElapsed: 6486 }
  },

  { name: "nim-game-stats", method: "GET", path: "/nim-game/stats", compare: "exact" },
  {
    name: "nim-game-submit",
    method: "POST",
    path: "/nim-game/submit",
    compare: "exact",
    body: { result: "lose", difficulty: "hard", rounds: 8, preset: "classic" }
  },

  { name: "winning-strategy-stats", method: "GET", path: "/winning-strategy/stats", compare: "exact" },
  {
    name: "winning-strategy-submit",
    method: "POST",
    path: "/winning-strategy/submit",
    compare: "exact",
    body: { game: "bash", result: "win", difficulty: "hard", rounds: 5 }
  },

  { name: "doc-track-events", method: "GET", path: "/doc-track/events?id=regression-doc", compare: "structure" },
  { name: "mock", method: "GET", path: "/mock?n=200", compare: "structure" },
  { name: "chinese-names", method: "GET", path: "/chinese-names?n=3", compare: "structure" },
  { name: "quantum-numbers", method: "GET", path: "/quantum/numbers?count=5&min=1&max=10&unique=true", compare: "structure" }
];

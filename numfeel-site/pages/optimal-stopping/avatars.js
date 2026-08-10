// ========== 候选人头像（豆包 seedream MCP 生成，已落地本地） ==========
// 24 张头像，存于 pages/optimal-stopping/avatars/（512×512 webp，原 2048×2048 jpeg 已压缩）

var AVATAR_DIR = 'avatars/';

var FEMALE_PROMPTS = [
  { tag: '甜美校园',   prompt: 'sweet-campus',    url: AVATAR_DIR + 'female-01-sweet-campus.webp' },
  { tag: '运动元气',   prompt: 'sporty',          url: AVATAR_DIR + 'female-02-sporty.webp' },
  { tag: '古风汉服',   prompt: 'hanfu',           url: AVATAR_DIR + 'female-03-hanfu.webp' },
  { tag: '酷感朋克',   prompt: 'punk',            url: AVATAR_DIR + 'female-04-punk.webp' },
  { tag: '文艺书店',   prompt: 'bookish',         url: AVATAR_DIR + 'female-05-bookish.webp' },
  { tag: '阳光麻花辫', prompt: 'sunny-braids',    url: AVATAR_DIR + 'female-06-sunny-braids.webp' },
  { tag: '职场OL',     prompt: 'office-lady',     url: AVATAR_DIR + 'female-07-office-lady.webp' },
  { tag: '兔耳卫衣',   prompt: 'bunny-hoodie',    url: AVATAR_DIR + 'female-08-bunny-hoodie.webp' },
  { tag: '高冷御姐',   prompt: 'cool-lady',       url: AVATAR_DIR + 'female-09-cool-lady.webp' },
  { tag: '美式街头',   prompt: 'streetwear',      url: AVATAR_DIR + 'female-10-streetwear.webp' },
  { tag: '森系花环',   prompt: 'forest-fairy',    url: AVATAR_DIR + 'female-11-forest-fairy.webp' },
  { tag: '赛博虹彩',   prompt: 'cyber-rainbow',   url: AVATAR_DIR + 'female-12-cyber-rainbow.webp' }
];

var MALE_PROMPTS = [
  { tag: '阳光学长',   prompt: 'sunny-senior',    url: AVATAR_DIR + 'male-01-sunny-senior.webp' },
  { tag: '运动短发',   prompt: 'sporty-boy',      url: AVATAR_DIR + 'male-02-sporty-boy.webp' },
  { tag: '古风公子',   prompt: 'hanfu-gent',      url: AVATAR_DIR + 'male-03-hanfu.webp' },
  { tag: '酷感朋克',   prompt: 'punk-boy',        url: AVATAR_DIR + 'male-04-punk.webp' },
  { tag: '文艺书店',   prompt: 'bookish-boy',     url: AVATAR_DIR + 'male-05-bookish.webp' },
  { tag: '元气大学',   prompt: 'campus-energy',   url: AVATAR_DIR + 'male-06-campus-energy.webp' },
  { tag: '职场精英',   prompt: 'businessman',     url: AVATAR_DIR + 'male-07-businessman.webp' },
  { tag: '宅系卫衣',   prompt: 'hoodie-boy',      url: AVATAR_DIR + 'male-08-hoodie.webp' },
  { tag: '高冷霸总',   prompt: 'cool-ceo',        url: AVATAR_DIR + 'male-09-cool-ceo.webp' },
  { tag: '美式街头',   prompt: 'streetwear-m',    url: AVATAR_DIR + 'male-10-streetwear.webp' },
  { tag: '森系白衬衫', prompt: 'forest-boy',      url: AVATAR_DIR + 'male-11-forest-boy.webp' },
  { tag: '赛博虹彩',   prompt: 'cyber-rainbow-m', url: AVATAR_DIR + 'male-12-cyber-rainbow.webp' }
];

/**
 * 根据情境取一组头像（自带 url），按候选人数量裁剪/循环
 * @param {string} scenario - 'female' | 'male' | 'helicopter'
 * @param {number} n - 候选人数量
 * @returns {Array<{tag:string, prompt:string, url:string}> | null}
 */
function getAvatarPool(scenario, n) {
  var pool;
  if (scenario === 'female') {
    pool = FEMALE_PROMPTS;
  } else if (scenario === 'male') {
    pool = MALE_PROMPTS;
  } else if (scenario === 'helicopter') {
    pool = FEMALE_PROMPTS.concat(MALE_PROMPTS);
  } else {
    return null;
  }
  var shuffled = pool.slice();
  for (var i = shuffled.length - 1; i > 0; i--) {
    var k = Math.floor(Math.random() * (i + 1));
    var tmp = shuffled[i]; shuffled[i] = shuffled[k]; shuffled[k] = tmp;
  }
  var result = [];
  for (var j = 0; j < n; j++) {
    var item = shuffled[j % shuffled.length];
    result.push({ tag: item.tag, prompt: item.prompt, url: item.url });
  }
  return result;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getAvatarPool: getAvatarPool,
    FEMALE_PROMPTS: FEMALE_PROMPTS,
    MALE_PROMPTS: MALE_PROMPTS
  };
}

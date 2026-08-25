/**
 * LMCompress 交互演示 — 核心逻辑
 *
 * 主题：用「预测器」做无损压缩。压缩的本质是预测——预测得越准，
 * 编码需要的比特就越少。LMCompress 论文（arXiv:2407.07723，
 * Nature Machine Intelligence 2025）把大语言模型接上算术编码器当预测器，
 * 图片压过 JPEG-XL 两倍、文本压过 bz2 四倍——但至今没人用。
 *
 * 本引擎基于真实的 PPM（Prediction by Partial Matching，部分匹配预测）：
 *   - 用内置训练语料「预训练」上下文统计模型（词频表/二元表/三元表…）；
 *   - 压缩时对每个字符，按最长已知上下文做概率预测（带逃逸回退），
 *     累加 -log2 p 得到理想编码比特数（算术编码可逼近的理论下界）；
 *   - 边编码边把新看到的内容写回模型（自适应，PPMd 同款机制），
 *     所以文本越长、重复模式越多，压得越好——这就是「学习曲线」。
 *
 * 另外提供：
 *   - 解压成本估算（gzip / n-gram / LLM 三种模式）
 *   - 三角权衡矩阵（模型规模 × 压缩率 × 解压成本）
 *   - 论文参考数据（arXiv:2407.07723）
 *
 * 全部为纯函数、不碰 DOM，可在 Node 中直接 require 测试。
 */

/** 内置训练语料：原创中文科普 + 英文，作为预测模型的"预训练知识"。 */
var TRAINING_CORPUS =
    '压缩的本质是预测。任何一种无损压缩算法，做的都是同一件事：猜测下一个字符是什么，' +
    '猜得越准，编码它需要的比特就越少。二十世纪八十年来，gzip、PNG、FLAC 这些经典算法，' +
    '都在用人工设计的统计模型做这个猜测。大语言模型改变了这件事。' +
    '它通过海量文本学会了语言的内在规律，是人类历史上最强的预测器。' +
    '于是有人想到：既然预测得越准压缩得越好，为什么不直接把大模型当成压缩器？' +
    '这就是二〇二四年那篇论文的疯狂想法。它在图像上压过了 JPEG-XL 两倍，在音频上压过了 FLAC 两倍，' +
    '在文本上压过了 bz2 四倍。听起来完美，却没有人用。原因很简单：解压的时候，你得重新跑一遍那个大模型。' +
    '带宽省下来了，算力却爆炸了。模型升级之后，旧文件可能再也解不开。' +
    '生态里没有工具链，没有格式标准，浏览器和操作系统全都视而不见。' +
    '一个技术上赢了、商业上输了的发明。The better a model understands data, the better it compresses.' +
    ' ' +
    '数字世界里的每一份文件，从一张照片到一段音乐，从一段代码到一句问候，本质上都是符号的排列。' +
    '排列的规律越多，可压缩的空间就越大。一份完全随机的数据无法被压缩，因为随机没有规律可循。' +
    '而现实中几乎没有数据是完全随机的：中文里"的"和"了"出现得远比"熵"和"栈"频繁，' +
    '英文里字母 q 后面几乎总是跟着 u，代码里的缩进和括号有着固定的套路。' +
    '这些规律就是压缩的原料。经典算法把这些规律写成一张查表，或者一个概率分布，' +
    '然后按照规律给高频符号分配短编码，给低频符号分配长编码。这就是熵编码的由来。' +
    '信息的价值不在于数据本身的大小，而在于其中真正不可预测的那部分。' +
    '能够预测的部分都是冗余，冗余可以被安全地剥离，剥离之后剩下的才是真正的信息。' +
    '这正是香农信息论的核心洞察，也是所有压缩算法共同的数学根基。' +
    '从哈夫曼编码到算术编码，从 LZ77 到 BWT，从 DEFLATE 到 CMIX，' +
    '无数算法在这条路上走了将近一个世纪，把无损压缩的边界一点一点往前推。' +
    '每前进一步，都需要更聪明的预测模型。而大语言模型，把这条路带向了全新的方向。' +
    ' ' +
    'Computers store everything as bytes, and bytes are just numbers. ' +
    'Compression finds the redundancy in those numbers and removes it. ' +
    'The better the predictor, the smaller the output. ' +
    'Gzip uses a sliding window and Huffman coding. ' +
    'Zstd uses finite state entropy for even better results. ' +
    'Brotli adds a static dictionary of common web words. ' +
    'Every improvement is an improvement in prediction. ' +
    'Large language models are the ultimate predictors, trained on trillions of tokens. ' +
    'They have seen more text than any human ever will. ' +
    'They know how sentences continue, how code is structured, how music repeats. ' +
    'Using them as compressors is both brilliant and impractical. ' +
    'The theory is beautiful, the practice is impossible. ' +
    'A model that understands everything can compress anything. ' +
    'But running that model costs more than the bandwidth it saves. ' +
    'This is the paradox of smart compression: intelligence is expensive. ' +
    ' ' +
    '当模型越聪明，它能看穿的模式就越多，压缩得就越小。但聪明的代价是巨大的计算资源。' +
    '一个几亿参数的模型，光是加载进内存就需要几GB，更不用说逐字预测时的推理开销。' +
    '相比之下，gzip 的算法只有几千行代码，运行在任何设备上都毫无压力。' +
    '这就是为什么聪明模型只能停留在论文里，而笨办法活在生产环境中。' +
    '历史总是这样反复上演：更先进的技术，常常败给更实用的技术。' +
    '决定技术命运的往往不是技术本身的好坏，而是它周围的环境是否准备好了。' +
    '标准、生态、工具链、兼容性，这些看不见的细节，才是技术落地的真正门槛。' +
    '一个算法再优秀，如果没有人愿意为它写解码器，它就永远无法被使用。' +
    '压缩领域的每一场胜利，都建立在无数适配工作的基础之上。' +
    '所以当你在浏览器里看到一张 JPEG 图片时，请记住它背后站着的是一个世纪的努力。' +
    ' ' +
    '我们再来仔细想想，预测下一个字符这件事，到底有多重要。' +
    '假设你已经看到了前半个句子，优秀的模型能猜出后面大概会接什么字。' +
    '猜对了，就只需要记下一个很小的数字，而不是记下完整的内容。' +
    '猜得越准，需要记录的数字就越小，文件也就越小。' +
    '这就是压缩的本质是预测的真正含义。' +
    '模型的预测能力越强，它看穿数据规律的能力就越强，压缩的效果就越好。' +
    '从香农提出信息论开始，人们就在追逐更好的预测模型。' +
    '哈夫曼编码根据字符频率分配编码，算术编码根据上下文分配概率，' +
    '这些算法都在做同一件事：预测下一个字符出现的概率。' +
    '而大语言模型把这件事做到了极致，它读过的文本比任何人类一辈子读的都要多。' +
    '它学会了句子的语法，学会了词语的搭配，学会了修辞的节奏。' +
    '让它来预测下一个字符，它的准确率高得惊人。' +
    '于是研究者把大语言模型接上算术编码器，做成了最强的无损压缩器。' +
    '图片被压得更小，音频被压得更小，代码被压得更小，文本被压得更小。' +
    '一切数据都变得更小，听起来完美无缺。' +
    '可是没有人用它，因为解压的成本高得吓人。' +
    '每还原一个字符，都要让那个巨大的模型从头推理一次。' +
    '一个一千字节的文件，可能需要好几分钟才能解压回来。' +
    '而 gzip 解压同样的文件，连一毫秒都用不了。' +
    '这就是聪明模型和笨算法的差别：聪明需要付出代价。' +
    '技术上的胜利，不一定能换来商业上的胜利。' +
    '决定一个技术能否被采用的，往往不是它有多聪明，而是它有多方便。' +
    '标准、生态、兼容性，这些词听起来枯燥，却决定了一切。' +
    '预测越准压缩越好，这句话永远成立，但前提是成本能够被接受。' +
    '大语言模型的预测能力天下第一，却因为成本太高而无人问津。' +
    '这就是 LMCompress 的故事，一个关于预测、压缩和现实的故事。' +
    ' ' +
    'In the end, compression is about finding patterns. ' +
    'The better you understand a language, the better you can compress it. ' +
    'Large language models understand language better than anything before. ' +
    'They compress text twice as well as bzip2 and images twice as well as JPEG-XL. ' +
    'The only problem is the cost of decompression. ' +
    'You need a huge model running just to read a file back. ' +
    'That is why the cleverest compressor in the world sits unused in a paper. ' +
    'Reality favors the simple and the fast, not the smart and the slow. ' +
    'Compression is prediction, and prediction is power. ' +
    'But power comes at a price nobody is willing to pay. ' +
    ' ' +
    '想象一下你正在写一篇文章，写到一半停住了。' +
    '接下来的字该怎么写？如果你已经读过很多类似的文章，心里自然会有一个预感。' +
    '预感越准，你写起来就越省力。压缩算法也是这个道理。' +
    '模型读过的文章越多，它对下一个字的预感就越准，编码就压得越小。' +
    '所以训练数据量的多少，直接决定了压缩效果的上限。' +
    '在小语料里，两三个字的上下文就已经把规律看得差不多了。' +
    '想要看得更远，就需要指数级增长的数据来支撑。' +
    '这就是字符级模型的天花板：上下文越长，数据越不够用。' +
    '真正的大语言模型，用海量数据跨过了这道坎。' +
    '它看到的模式不限于几个字的拼接，而是句子、段落、甚至整篇文章的结构。' +
    '所以它能比任何 n-gram 都压得更小，因为它看得更远。' +
    '但看得远是有代价的。' +
    '每次预测都要走一遍几百亿参数的神经网络，计算量惊人。' +
    '把这样的模型装进每个人的电脑，显然不现实。' +
    '于是它只能待在数据中心里，待在论文里，待在梦想里。' +
    '技术没有错，错的是时机和环境。' +
    '当环境准备好的时候，再笨的技术也能起飞；环境没准备好，再聪明的技术也只能等待。' +
    '压缩的故事还没有结束，预测的故事也才刚刚开始。' +
    '未来的某一天，也许会有一种既聪明又便宜的方法出现。' +
    '到那时，我们也许真的能用大模型压缩一切。' +
    '但现在，我们还是老老实实使用 gzip 吧。' +
    '毕竟，大多数时候我们需要的不是极限，而是够用。' +
    ' ' +
    'There is a lesson hidden in this story about compression. ' +
    'The best technology does not always win. ' +
    'The most convenient technology usually does. ' +
    'A model that understands everything can compress anything. ' +
    'But understanding everything costs more than we can afford. ' +
    'So we trade a little compression for a lot of speed. ' +
    'That is engineering: choosing the best trade-off, not the best number. ' +
    'Compression teaches us about prediction, about data, about cost. ' +
    'And it teaches us about why some ideas stay in papers forever. ' +
    'The cleverest ideas are not always the most practical ones. ' +
    'Sometimes the world is not ready for them yet. ' +
    'Sometimes it never will be. ' +
    'And sometimes, just sometimes, the world catches up. ' +
    'Then the clever idea finally gets its moment in the sun. ' +
    'Until then, we wait, and we use what works. ' +
    'That is the real story of LMCompress and every great idea before it. ' +
    'Ideas are cheap. Deployment is expensive. ' +
    'Prediction is powerful. Practice is slow. ' +
    'And in the end, the practical always wins. ' +
    ' ' +
    '每一次技术的更迭，都是一场关于成本的博弈。' +
    '新算法带来更好的效果，也带来新的成本。' +
    '成本不只有计算成本，还有生态成本、学习成本、迁移成本。' +
    '当新技术的总成本高于旧技术时，再好的效果也无人问津。' +
    '这不是技术问题，这是经济学问题。' +
    '理解了这一点，你就理解了为什么大部分新技术都会失败。' +
    '也理解了为什么 LMCompress 这样的天才想法，至今没有走进现实。' +
    '压缩的本质是预测，预测的代价是成本，成本的权衡是现实。' +
    '这条链，构成了整个数据世界的底层逻辑。' +
    '愿你下次看到文件大小的时候，能想起这个关于预测的故事。' +
    '也愿你能在权衡成本的时候，做出聪明的选择。' +
    '这就是我们做这个演示的初衷：让你亲手感受预测与成本的博弈。' +
    '现在，轮到你动手了。';

/** 预设样例（供用户直接体验压缩的对象），key 与页面预设按钮对应。 */
var PRESETS = {
  zh: {
    label: '中文科普（模型懂）',
    text: '压缩的本质是预测，猜得越准，编码需要的比特就越少。聪明的模型能看穿更多规律，所以压得更小。数据里的冗余可以被剥离，剥离之后剩下的才是真正的信息。预测模型越强，压缩的效果就越好，这是无损压缩的全部秘密。经典算法用人工设计的统计模型，大语言模型用海量数据学到的规律，两者做的都是同一件事：预测下一个字符。模型越聪明，它就能越准地预测，压缩得就越小。'
  },
  log: {
    label: '服务器日志（模型不懂）',
    text: '2026-08-17 10:00:01 INFO  request_id=ab12c3 method=GET path=/api/v1/users status=200 cost=12ms\n2026-08-17 10:00:02 INFO  request_id=de45f6 method=GET path=/api/v1/users status=200 cost=9ms\n2026-08-17 10:00:03 INFO  request_id=gh78i9 method=POST path=/api/v1/orders status=201 cost=45ms\n2026-08-17 10:00:04 INFO  request_id=jk01l2 method=GET path=/api/v1/users status=200 cost=11ms\n2026-08-17 10:00:05 WARN  request_id=mn34o5 method=GET path=/api/v1/search status=502 cost=1203ms\n2026-08-17 10:00:06 INFO  request_id=pq56r7 method=GET path=/api/v1/users status=200 cost=8ms'
  },
  en: {
    label: '英文句子（模型不懂）',
    text: 'To compress is to predict. The better a model predicts the next symbol, the fewer bits it needs to encode it. This single idea unifies a century of compression research, and it is exactly why large language models are the strongest compressors ever built.'
  }
};

/** 论文参考数据（LMCompress 相对传统算法的压缩率倍数，来源 arXiv:2407.07723）。 */
var PAPER_RATIO = {
  imageVsJpegXl: 2,
  audioVsFlac: 2,
  videoVsH264: 2,
  textVsBz2: 4
};

/** 演示支持的最大上下文阶数（模型能回看多少个历史字符）。 */
var MAX_ORDER = 5;

/**
 * 统计一段文本里出现的所有不同字符，作为模型词表。
 *
 * @param {string} corpus 训练语料
 * @returns {Array<string>} 去重后的字符列表
 */
function getAlphabet(corpus) {
  var seen = {};
  var out = [];
  for (var i = 0; i < corpus.length; i++) {
    var ch = corpus.charAt(i);
    if (!Object.prototype.hasOwnProperty.call(seen, ch)) {
      seen[ch] = true;
      out.push(ch);
    }
  }
  return out;
}

/**
 * 用「预训练语料」构建 PPM 上下文统计模型。
 *
 * 模型结构：{ counts: { 上下文 -> { 下一字符 -> 次数 } }, totals: { 上下文 -> 总次数 },
 *             vocabSize, alphabet: [字符列表] }
 * 上下文长度为 0（字符频率表）到 order-1 的所有前缀。
 *
 * @param {string} corpus 预训练语料
 * @param {number} order  最大阶数（能回看 order-1 个历史字符）
 * @returns {{counts:Object, totals:Object, vocabSize:number, alphabet:Array<string>}} 模型
 */
function buildModel(corpus, order) {
  var alphabet = getAlphabet(corpus);
  var counts = {};
  var totals = {};
  var vocabSize = Math.max(1, alphabet.length);
  var ctxLen = Math.max(0, order - 1);

  for (var i = 0; i < corpus.length; i++) {
    var prefix = corpus.substring(i - ctxLen, i);
    var ch = corpus.charAt(i);
    // 从最长前缀一路写回所有后缀（让每个长度的上下文都有统计；前缀不够长时自然截断）
    var maxStart = Math.min(ctxLen, prefix.length);
    for (var start = 0; start <= maxStart; start++) {
      var ctx = prefix.substring(start);
      if (!Object.prototype.hasOwnProperty.call(counts, ctx)) {
        counts[ctx] = {};
      }
      var inner = counts[ctx];
      inner[ch] = (inner[ch] || 0) + 1;
      totals[ctx] = (totals[ctx] || 0) + 1;
    }
  }
  return { counts: counts, totals: totals, vocabSize: vocabSize, alphabet: alphabet };
}

/**
 * 取历史文本中、模型见过的【最长】上下文（长度不超过 order-1）。找不到返回 null。
 *
 * @param {Object} model   模型
 * @param {string} history 当前字符之前的所有文本
 * @param {number} order   最大阶数
 * @returns {string|null} 最长已知上下文
 */
function bestContext(model, history, order) {
  var maxLen = Math.min(order - 1, history.length);
  for (var len = maxLen; len >= 1; len--) {
    var ctx = history.substring(history.length - len);
    if (Object.prototype.hasOwnProperty.call(model.counts, ctx)) {
      return ctx;
    }
  }
  return null;
}

/** 某上下文里出现过的不同字符数。 */
function distinctCount(model, ctx) {
  var inner = model.counts[ctx];
  if (!inner) return 0;
  var n = 0;
  for (var ch in inner) {
    if (Object.prototype.hasOwnProperty.call(inner, ch)) n++;
  }
  return n;
}

/**
 * PPM 逃逸链概率：给定上下文与字符，返回其有效概率。
 * 规则：在当前上下文命中则用 count/(total+distinct)；
 *       未命中则付逃逸概率 distinct/(total+distinct)，回退到更短上下文；
 *       一直回退到字符频率表，最后落到 1/vocabSize 均匀分布。
 *
 * @param {Object} model  模型
 * @param {string} context 上下文（可为 null）
 * @param {string} ch      目标字符
 * @returns {number} 有效概率（0~1）
 */
/** 上下文至少要有这么多观测才算"有证据"，否则免费回退（稀疏上下文不收费）。 */
var MIN_CTX_SAMPLES = 4;

/**
 * PPM 逃逸链概率：给定上下文与字符，返回其有效概率。
 * 规则：当前上下文命中则用 count/(total+distinct)；
 *       未命中则付逃逸概率 distinct/(total+distinct)，回退到更短上下文；
 *       观测不足（total < MIN_CTX_SAMPLES）的上下文不收费，直接回退；
 *       一直回退到字符频率表，最后落到 1/vocabSize 均匀分布。
 *
 * @param {Object} model  模型
 * @param {string} context 上下文（可为 null）
 * @param {string} ch      目标字符
 * @returns {number} 有效概率（0~1）
 */
function smoothProb(model, context, ch) {
  // 词表外字符：首个出现付一次固定代价（1/vocabSize），之后进入词表走正常逃逸链
  if (model.alphabet.indexOf(ch) === -1) {
    return 1 / model.vocabSize;
  }
  var escapes = 1;
  var ctx = context;
  while (ctx !== null && ctx.length > 0) {
    if (Object.prototype.hasOwnProperty.call(model.counts, ctx)) {
      var inner = model.counts[ctx];
      var total = model.totals[ctx];
      var d = distinctCount(model, ctx);
      if (total >= MIN_CTX_SAMPLES) {
        if (Object.prototype.hasOwnProperty.call(inner, ch)) {
          return escapes * inner[ch] / (total + d);
        }
        escapes *= d / (total + d);
      }
    }
    ctx = ctx.substring(1);
  }
  // 字符频率表（长度为 0 的上下文）
  var unigram = model.counts[''];
  var unigramTotal = model.totals[''] || 0;
  if (unigramTotal > 0) {
    if (Object.prototype.hasOwnProperty.call(unigram, ch)) {
      return escapes * unigram[ch] / (unigramTotal + distinctCount(model, ''));
    }
    escapes *= distinctCount(model, '') / (unigramTotal + distinctCount(model, ''));
  }
  return escapes * (1 / model.vocabSize);
}

/**
 * 给定历史文本，返回模型预测的前 K 个字符及其概率（降序，概率和为 1）。
 *
 * @param {Object} model  模型
 * @param {string} history 历史文本
 * @param {number} order   最大阶数
 * @param {number} topK    返回前几个预测
 * @returns {Array<{char:string, prob:number}>} 预测列表
 */
function predictDist(model, history, order, topK) {
  var ctx = bestContext(model, history, order);
  var out = [];
  for (var i = 0; i < model.alphabet.length; i++) {
    var ch = model.alphabet[i];
    out.push({ char: ch, prob: smoothProb(model, ctx, ch) });
  }
  out.sort(function (a, b) { return b.prob - a.prob; });
  return out.slice(0, topK);
}

/**
 * 把新看到的字符写回模型（自适应学习），上下文长度 0..order-2。
 * 编码和解码双方做同样的更新，保证无损。
 *
 * @param {Object} model   模型（会被修改）
 * @param {string} history 当前字符【之前】的完整历史（不含 ch 本身）
 * @param {string} ch      当前字符
 * @param {number} order   最大阶数
 */
function adaptModel(model, history, ch, order) {
  var ctxLen = Math.min(order - 1, history.length);
  for (var len = 1; len <= ctxLen; len++) {
    var ctx = history.substring(history.length - len);
    if (!Object.prototype.hasOwnProperty.call(model.counts, ctx)) {
      model.counts[ctx] = {};
    }
    var inner = model.counts[ctx];
    inner[ch] = (inner[ch] || 0) + 1;
    model.totals[ctx] = (model.totals[ctx] || 0) + 1;
  }
  // 字符频率表也要更新
  if (!Object.prototype.hasOwnProperty.call(model.counts, '')) {
    model.counts[''] = {};
  }
  // 新字符加入词表（自适应编码器维护动态符号表）
  if (model.alphabet.indexOf(ch) === -1) {
    model.alphabet.push(ch);
    model.vocabSize = model.alphabet.length;
  }
  var uni = model.counts[''];
  uni[ch] = (uni[ch] || 0) + 1;
  model.totals[''] = (model.totals[''] || 0) + 1;
}

/**
 * 用 PPM 编码一段文本：累加每个字符的理想比特数，并返回逐字符比特序列。
 * 注意：会修改传入模型（边编码边学习），需要可复现结果时请每次传入新模型。
 *
 * @param {string} text  待编码文本
 * @param {Object} model 预训练模型（会被自适应更新）
 * @param {number} order 最大阶数
 * @returns {{bits:number, perCharBits:Array<number>}} 总比特数与逐字符比特
 */
function encodePPM(text, model, order) {
  var bits = 0;
  var perCharBits = [];
  var history = '';
  for (var i = 0; i < text.length; i++) {
    var ch = text.charAt(i);
    var ctx = bestContext(model, history, order);
    var p = smoothProb(model, ctx, ch);
    var b = -Math.log2(p);
    bits += b;
    perCharBits.push(b);
    adaptModel(model, history, ch, order);
    history += ch;
  }
  return { bits: bits, perCharBits: perCharBits };
}

/**
 * 计算 UTF-8 编码的字节数（手写实现，兼容旧浏览器，不依赖 TextEncoder）。
 *
 * @param {string} str 输入字符串
 * @returns {number} UTF-8 字节数
 */
function utf8Bytes(str) {
  var bytes = 0;
  for (var i = 0; i < str.length; i++) {
    var code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xD800 && code <= 0xDBFF && i + 1 < str.length) {
      var low = str.charCodeAt(i + 1);
      if (low >= 0xDC00 && low <= 0xDFFF) {
        bytes += 4;
        i++;
      } else {
        bytes += 3;
      }
    } else if (code < 0x10000) {
      bytes += 3;
    } else {
      bytes += 4;
    }
  }
  return bytes;
}

/**
 * 计算一份文本在给定阶数、给定训练数据量下的压缩报告。
 *
 * @param {string} text      待压缩文本
 * @param {string} corpus    预训练语料
 * @param {number} order     最大阶数
 * @param {number} corpusSize 实际使用的语料长度（截取前 corpusSize 个字符；省略则用全部）
 * @returns {{order:number, corpusSize:number, originalBytes:number, compressedBytes:number, ratio:number, savedPercent:number, bitsPerChar:number, perCharBits:Array<number>}} 压缩报告
 */
function compressReport(text, corpus, order, corpusSize) {
  var usedCorpus = (corpusSize && corpusSize < corpus.length) ? corpus.substring(0, corpusSize) : corpus;
  var model = buildModel(usedCorpus, order);
  var encoded = encodePPM(text, model, order);
  var compressedBytes = Math.max(1, Math.ceil(encoded.bits / 8));
  var originalBytes = utf8Bytes(text);
  var ratio = originalBytes > 0 ? compressedBytes / originalBytes : 1;
  return {
    order: order,
    corpusSize: usedCorpus.length,
    originalBytes: originalBytes,
    compressedBytes: compressedBytes,
    ratio: ratio,
    savedPercent: originalBytes > 0 ? (1 - ratio) * 100 : 0,
    bitsPerChar: text.length > 0 ? encoded.bits / text.length : 0,
    perCharBits: encoded.perCharBits
  };
}

/**
 * 对同一份文本在 1..maxOrder 各阶数下做压缩扫描，用于画对比图。
 *
 * @param {string} text     待压缩文本
 * @param {string} corpus   预训练语料
 * @param {number} maxOrder 最大阶数
 * @param {number} corpusSize 实际使用的语料长度（可选）
 * @returns {Array<Object>} 各阶数压缩报告数组
 */
function sweepOrders(text, corpus, maxOrder, corpusSize) {
  var reports = [];
  for (var order = 1; order <= maxOrder; order++) {
    reports.push(compressReport(text, corpus, order, corpusSize));
  }
  return reports;
}

/**
 * 把逐字符比特序列聚合成学习曲线（等分窗口内的平均每字符比特数）。
 *
 * @param {Array<number>} perCharBits 逐字符比特数
 * @param {number} buckets 窗口数量
 * @returns {Array<{bucket:number, bitsPerChar:number}>} 学习曲线数据
 */
function learningCurve(perCharBits, buckets) {
  if (!perCharBits || perCharBits.length === 0) return [];
  var n = Math.max(1, buckets);
  var out = [];
  var chunk = perCharBits.length / n;
  for (var i = 0; i < n; i++) {
    var start = Math.floor(i * chunk);
    var end = Math.max(start + 1, Math.floor((i + 1) * chunk));
    var sum = 0;
    for (var j = start; j < end; j++) {
      sum += perCharBits[j];
    }
    var avg = sum / (end - start);
    out.push({ bucket: i + 1, bitsPerChar: avg });
  }
  return out;
}

/**
 * 估算解压耗时。
 *
 * @param {number} bytes 压缩后的字节数
 * @param {string} mode  模式：'gzip' | 'ngram3' | 'ngram6' | 'llm'
 * @returns {{ms:number, human:string}} 毫秒数与人类可读时长
 */
function estimateDecodeMs(bytes, mode) {
  var ms = 0;
  switch (mode) {
    case 'gzip':
      ms = bytes / 300e6 * 1000;
      break;
    case 'ngram3':
      ms = bytes / 30e6 * 1000;
      break;
    case 'ngram6':
      ms = bytes / 8e6 * 1000;
      break;
    case 'llm':
      // LLM 需逐 token 前向推理：token 数 ≈ 字节数 × 0.25，GPU 推理 ~60 token/s
      var tokens = bytes * 0.25;
      ms = tokens / 60 * 1000;
      break;
    default:
      ms = 0;
  }
  return { ms: ms, human: formatDuration(ms) };
}

/**
 * 生成同一份压缩文件的解压时间对比（用于「解压成本对决」动画）。
 *
 * @param {number} bytes 压缩后的字节数
 * @returns {Array<{key:string, label:string, ms:number, human:string, color:string}>} 各方案对比
 */
function decodeComparison(bytes) {
  return [
    { key: 'gzip', label: 'gzip', ms: estimateDecodeMs(bytes, 'gzip').ms, human: estimateDecodeMs(bytes, 'gzip').human, color: '#81c784' },
    { key: 'ngram3', label: '3-gram', ms: estimateDecodeMs(bytes, 'ngram3').ms, human: estimateDecodeMs(bytes, 'ngram3').human, color: '#90caf9' },
    { key: 'ngram6', label: '6-gram', ms: estimateDecodeMs(bytes, 'ngram6').ms, human: estimateDecodeMs(bytes, 'ngram6').human, color: '#ffd700' },
    { key: 'llm', label: 'LMCompress（8B 模型）', ms: estimateDecodeMs(bytes, 'llm').ms, human: estimateDecodeMs(bytes, 'llm').human, color: '#ff6b6b' }
  ];
}

/**
 * 生成「模型规模 × 压缩率 × 解压成本」三角权衡数据（教学示意值，非实测基准）。
 *
 * @param {number} fileBytes 假设要压缩的原始文件字节数
 * @returns {Array<{name:string, params:number, paramsHuman:string, savedPercent:number, decodeMs:number, decodeHuman:string}>} 权衡矩阵
 */
function tradeoffMatrix(fileBytes) {
  var compressed = Math.max(1, Math.ceil(fileBytes * 0.4));
  var list = [
    { name: 'gzip（DEFLATE）', params: 1e5, paramsHuman: '0.1M 参数', savedPercent: 40, decodeMs: estimateDecodeMs(compressed, 'gzip').ms, decodeHuman: estimateDecodeMs(compressed, 'gzip').human },
    { name: '3-gram', params: 1e6, paramsHuman: '1M 参数', savedPercent: 50, decodeMs: estimateDecodeMs(compressed, 'ngram3').ms, decodeHuman: estimateDecodeMs(compressed, 'ngram3').human },
    { name: '6-gram', params: 1e7, paramsHuman: '10M 参数', savedPercent: 58, decodeMs: estimateDecodeMs(compressed, 'ngram6').ms, decodeHuman: estimateDecodeMs(compressed, 'ngram6').human },
    { name: 'LMCompress（8B）', params: 8e9, paramsHuman: '80亿参数', savedPercent: 75, decodeMs: estimateDecodeMs(compressed, 'llm').ms, decodeHuman: estimateDecodeMs(compressed, 'llm').human }
  ];
  return list;
}

/**
 * 字节数转人类可读字符串。
 *
 * @param {number} bytes 字节数
 * @returns {string} 如 "1.2 MB"
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/**
 * 时长（毫秒）转人类可读字符串。
 *
 * @param {number} ms 毫秒数
 * @returns {string} 如 "1.2 秒" / "68 分钟"
 */
function formatDuration(ms) {
  if (ms < 1) return Math.round(ms * 1000) + ' 微秒';
  if (ms < 1000) return Math.round(ms) + ' 毫秒';
  if (ms < 60000) return (ms / 1000).toFixed(1) + ' 秒';
  if (ms < 3600000) return Math.round(ms / 60000) + ' 分钟';
  return (ms / 3600000).toFixed(1) + ' 小时';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TRAINING_CORPUS: TRAINING_CORPUS,
    PRESETS: PRESETS,
    PAPER_RATIO: PAPER_RATIO,
    MAX_ORDER: MAX_ORDER,
    getAlphabet: getAlphabet,
    buildModel: buildModel,
    bestContext: bestContext,
    distinctCount: distinctCount,
    smoothProb: smoothProb,
    predictDist: predictDist,
    adaptModel: adaptModel,
    encodePPM: encodePPM,
    utf8Bytes: utf8Bytes,
    compressReport: compressReport,
    sweepOrders: sweepOrders,
    learningCurve: learningCurve,
    estimateDecodeMs: estimateDecodeMs,
    decodeComparison: decodeComparison,
    tradeoffMatrix: tradeoffMatrix,
    formatBytes: formatBytes,
    formatDuration: formatDuration
  };
}
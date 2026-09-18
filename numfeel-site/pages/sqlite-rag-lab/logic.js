/**
 * 一个文件的 AI 大脑 · SQLite RAG 实验室 - 核心纯逻辑
 * 与 DOM 完全解耦，供 app.js 调用与 node 单元测试直接加载。
 */

const SqliteRagLogic = (function() {

  /**
   * 中文按单字切分、拉丁字母数字词保留整体、小写；剔除空白与标点。
   * 与后端 SqliteRagLabLogic.charTokens 保持同构，用于高亮与 FTS 讲解。
   * @param {string} text 任意文本
   * @returns {string[]} token 列表
   */
  function charTokens(text) {
    if (typeof text !== 'string' || !text.trim()) return [];
    const s = text.trim();
    const tokens = [];
    let latin = '';
    const flushLatin = () => {
      if (latin) {
        tokens.push(latin);
        latin = '';
      }
    };
    for (const ch of s) {
      if (/[A-Za-z0-9_]/.test(ch)) {
        latin += ch.toLowerCase();
        continue;
      }
      if (latin) {
        tokens.push(latin);
        latin = '';
      }
      const code = ch.codePointAt(0);
      const isCjk = (code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3400 && code <= 0x4DBF);
      if (isCjk) tokens.push(ch);
    }
    if (latin) tokens.push(latin);
    return tokens;
  }

  /**
   * 根据查询把内容切成 普通文本/命中 片段，用于渲染高亮。
   * @param {string} content 原文
   * @param {string} query 用户查询
   * @returns {{text: string, hit: boolean}[]}
   */
  function buildHighlight(content, query) {
    const text = String(content || '');
    if (!text) return [{ text: '', hit: false }];
    const tokens = [...new Set(charTokens(query))]
      .filter(t => t.length > 1 || /[\u4e00-\u9fff]/.test(t))
      .slice(0, 6);
    if (!tokens.length) return [{ text, hit: false }];
    const lower = tokens.map(t => t.toLowerCase());
    const pattern = new RegExp(`(${tokens.map(t => t.replace(/[.*+?^${}()\\[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    const parts = text.split(pattern).filter(p => p !== '');
    return parts.map(part => ({ text: part, hit: lower.includes(part.toLowerCase()) }));
  }

  /**
   * RRF 融合演示：给定各通道的排名（chunkId 数组），计算每个 id 的融合分。
   * @param {number[][]} rankings 各通道按相关度降序的 chunkId 数组
   * @param {number} k 常数（默认 60）
   * @returns {{scores: Map<number, number>, order: number[]}}
   */
  function rrfExplain(channels, k = 60) {
    const scores = new Map();
    for (const channel of channelsOf(channels)) {
      for (let i = 0; i < channel.length; i++) {
        const contribution = 1 / (k + i + 1);
        scores.set(channel[i], (scores.get(channel[i]) || 0) + contribution);
      }
    }
    return {
      scores,
      order: [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id),
    };
  }

  function channelsOf(channels) {
    return Array.isArray(channels) ? channels.filter(Array.isArray) : [];
  }

  /**
   * Attach per-channel ranks without changing the server's fused order or score.
   * @param {object[]} results Server-ranked fused results.
   * @param {{fts?: object[], vec?: object[]}} channels Candidate lists.
   * @returns {object[]} Results with nullable one-based ftsRank and vecRank.
   */
  function describeResultRanks(results, channels = {}) {
    const ranks = key => new Map(
      (channels[key] || []).map((hit, index) => [hit.chunkId, index + 1])
    );
    const fts = ranks('fts');
    const vec = ranks('vec');
    return results.map(hit => ({
      ...hit,
      ftsRank: fts.get(hit.chunkId) ?? null,
      vecRank: vec.get(hit.chunkId) ?? null,
    }));
  }

  /**
   * 盲测打分：从 6 张卡里选出的 picks 与融合答案 target 求交集。
   * @param {number[]} picks 选中的 chunkId
   * @param {number[]} target 融合 TopN 的 chunkId
   */
  function gradePicks(picks, target) {
    const hitCount = picks.filter(id => target.includes(id)).length;
    return {
      hit: hitCount,
      perfect: hitCount === target.length,
      score: hitCount * 10,
      message: messageFor(hitCount, target.length),
    };
  }

  function messageFor(hit, total) {
    if (total === 0) return '这题两路通道都没答上来，你的直觉还是最可信的。';
    if (hit === total) return '全中！你的直觉跟混合检索完全一致。';
    if (hit >= total - 1 && hit >= 1) return '接近了，核心片段基本摸到。';
    if (hit >= 1) return '方向对，混合检索的判断比看起来难猜。';
    return '颗粒无收。别着急，信息检索这门手艺就得靠多打几局练。';
  }

  /**
   * 积分推进：全中 +15，命中每张 +10；中断连胜。
   * @param {{score:number, streak:number, best:number}} prev
   * @param {{hit:number, perfect:boolean}} grade
   */
  function nextScore(prev, grade) {
    const streak = grade.perfect ? prev.streak + 1 : 0;
    return {
      score: prev.score + grade.hit * 10 + (grade.perfect ? 15 : 0),
      streak,
      best: Math.max(prev.best, streak),
    };
  }

  /** 种子随机洗牌（mulberry32），同一 seed 结果一致，便于测试复现。
   * @template T
   * @param {T[]} arr
   * @param {number} seed
   */
  function shuffleWithSeed(arr, seed) {
    let t = seed >>> 0;
    const rand = () => {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * 毫秒格式化。
   * @param {number} ms 毫秒
   */
  function formatMs(ms) {
    const n = Number(ms) || 0;
    if (n < 1) return `${(n * 1000).toFixed(0)}µs`;
    if (n < 10) return `${n.toFixed(2)}ms`;
    return `${n.toFixed(0)}ms`;
  }

  /**
   * 字节数格式化。
   * @param {number} bytes
   */
  function formatBytes(bytes) {
    const b = Number(bytes) || 0;
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(2)} MB`;
  }

  /**
   * 去重 + 保持顺序工具（用于对战卡牌可能重复出现时）。
   * @param {number[]} ids
   * @returns {number[]}
   */
  function uniqueIds(ids) {
    return [...new Set(ids)];
  }

  const QUESTION_SUGGESTIONS = Object.freeze([
    '世界上装机量最大的数据库是哪个',
    'ChatGPT 的记忆一般用什么存储',
    '断电了数据会丢吗',
    '向量检索是怎么回事',
    '微信的聊天记录存在哪里',
    '一个数据库文件能装下多少东西',
  ]);

  return {
    charTokens,
    buildHighlight,
    rrfExplain,
    describeResultRanks,
    gradePicks,
    nextScore,
    shuffleWithSeed,
    formatMs,
    formatBytes,
    uniqueIds,
    QUESTION_SUGGESTIONS,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SqliteRagLogic;
} else {
  window.SqliteRagLogic = SqliteRagLogic;
}

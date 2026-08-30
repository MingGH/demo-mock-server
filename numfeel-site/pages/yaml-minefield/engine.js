/**
 * engine.js — YAML 地雷阵纯逻辑层
 * 不操作 DOM，可在浏览器与 Node 测试中直接运行。
 * 依赖约定：js-yaml 在 app.js 中调用，解析后的 JS 对象传入本模块的纯函数。
 */
(function (global) {
  'use strict';

  // ── 常量 ──

  /** 每局抽题数量 */
  var QUESTIONS_PER_RUN = 8;

  /** 单题限时（秒） */
  var TIME_LIMIT = 20;

  /** 类别标签（图表与题目共用） */
  var CATEGORY_LABELS = {
    bool: '布尔陷阱',
    number: '数字陷阱',
    syntax: '语法雷区',
    type: '类型变形',
    spec: '规范打架'
  };

  /**
   * 题库：12 道真实 YAML 1.1 陷阱题。
   * answer 为 options 下标；正确性对 js-yaml 4（浏览器）与 SnakeYAML 2.x（服务器）均成立，
   * 个别两台解析器会打架的题（单字母 y、重复键）不进题库，放对照台现场演示。
   */
  var QUESTION_POOL = [
    {
      id: 'norway',
      category: 'bool',
      severity: 4,
      yaml: 'country: no',
      question: 'country 解析出来的值是？',
      options: ['"no"，字符串原样保留', 'false，布尔值', 'null', '直接报错'],
      answer: 1,
      explain: 'YAML 1.1 把 yes/no/on/off 全划成了布尔值。挪威的国家代码是 NO，一进配置就变 false。这就是最有名的 Norway 问题，坑过无数国家的枚举字段。'
    },
    {
      id: 'sexagesimal',
      category: 'number',
      severity: 5,
      yaml: 'duration: 12:30',
      question: 'duration 解析出来的值是？',
      options: ['"12:30"，字符串', '750', '12.5', '直接报错'],
      answer: 1,
      explain: 'YAML 1.1 内置六十进制。12:30 被当成「12 时 30 分」，12×60＋30＝750。一个冒号，你想要的半小时就没了。'
    },
    {
      id: 'octal',
      category: 'number',
      severity: 4,
      yaml: 'zip: 02134',
      question: 'zip 解析出来的值是？',
      options: ['2134', '1116', '"02134"，字符串', '直接报错'],
      answer: 1,
      explain: 'YAML 1.1 里 0 开头的数字是八进制，02134 换算出来正好是 1116。波士顿人的邮编，就这么被改了门牌。'
    },
    {
      id: 'version',
      category: 'number',
      severity: 3,
      yaml: 'version: 1.10',
      question: 'version 解析出来的值是？',
      options: ['1.10，原样保留', '1.1', '字符串 "1.10"', '直接报错'],
      answer: 1,
      explain: '它被认成了浮点数。浮点数 1.10 就是 1.1，尾巴上的 0 不算数。写版本号，请把引号焊死在手上。'
    },
    {
      id: 'on-flag',
      category: 'bool',
      severity: 2,
      yaml: 'flag: on',
      question: 'flag 解析出来的值是？',
      options: ['字符串 "on"', 'true', '数字 1', 'null'],
      answer: 1,
      explain: 'on/off/yes/no/true/false，六兄弟全是布尔。你写的是开关的位置，它读出来是开关的状态。这题送分，但天天有人翻车。'
    },
    {
      id: 'quoted-true',
      category: 'type',
      severity: 1,
      yaml: "env: 'true'",
      question: "env: 'true' 解析出来的值是？",
      options: ['true，布尔值', '字符串 "true"', 'null', '直接报错'],
      answer: 1,
      explain: '引号一包，布尔变字符串。这是 YAML 里少数「你以为是坑，其实是护栏」的设计。想保住字面值，加引号就对了。'
    },
    {
      id: 'tab',
      category: 'syntax',
      severity: 5,
      yaml: 'server:\n\tport: 8080',
      question: 'port 前面缩进的是一个 Tab，解析结果是？',
      options: ['正常解析，port 是 8080', '报错，解析失败', 'port 是字符串 " 8080"', '这一行被悄悄忽略'],
      answer: 1,
      explain: 'YAML 明令禁止 Tab 缩进，只认空格。报错文案像天书：「found character that cannot start any token」。多少人对着这行字第一次见识了什么叫禅。'
    },
    {
      id: 'underscore',
      category: 'number',
      severity: 3,
      yaml: 'budget: 1_000_000',
      question: 'budget 解析出来的值是？',
      options: ['字符串 "1_000_000"', '1000000', '1000，下划线处截断', '直接报错'],
      answer: 1,
      explain: 'YAML 1.1 支持数字里加下划线分节，读着舒服，算出来正常。这个设计是真贴心，骂到这里先停一下。'
    },
    {
      id: 'date',
      category: 'type',
      severity: 3,
      yaml: 'published: 2026-08-29',
      question: 'published 解析出来是什么？',
      options: ['字符串 "2026-08-29"', '日期对象', '数字 20260829', '直接报错'],
      answer: 1,
      explain: 'YAML 1.1 内置时间戳正则，这个写法会被认成日期对象。字符串还是日期，取决于你用什么语言去读。跨语言一序列化，戏就开始了。'
    },
    {
      id: 'bigint',
      category: 'number',
      severity: 4,
      yaml: 'order_id: 1234567890123456789',
      question: '这个 19 位订单号，两边解析器拿到的是？',
      options: ['浏览器和 Java 都精确保留', '浏览器丢精度，Java 没事', '两边都丢精度', '直接报错'],
      answer: 1,
      explain: '这题考的是下游语言。Java 拿到 BigInteger，一位不差；JavaScript 拿到 Number，末尾悄悄变成 6800。订单号对不上号，查一晚上，就查到这。对照台里能亲眼看这个精度差。'
    },
    {
      id: 'merge',
      category: 'spec',
      severity: 3,
      yaml: 'defaults: &d\n  color: red\nitem:\n  <<: *d\n  color: blue',
      question: 'item.color 最后是？',
      options: ['red，锚点说了算', 'blue，后写的覆盖', '[red, blue] 合并成数组', '直接报错'],
      answer: 1,
      explain: '<< 是合并键，把锚点里的键值搬进来。同名键，后写的赢。这套锚点语法功能很强，强到一般人写第三遍才会对。'
    },
    {
      id: 'fold',
      category: 'syntax',
      severity: 4,
      yaml: 'poem: >\n  静夜思\n  床前明月光',
      question: '用 > 折叠符写诗，poem 的值是？',
      options: ['两行分开，保留换行', '一行，换行折叠成空格', '两行文字直接粘一起，没有空格', '直接报错'],
      answer: 1,
      explain: '> 是折叠符，换行变空格；想保留换行得用 |。就差一个符号，整首诗念成一坨。90% 的人第一次都选错，包括当年的我。'
    }
  ];

  // ── 出题 ──

  /**
   * 洗牌（Fisher-Yates，可注入随机源）。
   * @param {Array} list 原数组（不改动）
   * @param {Function} rng 返回 [0,1) 的随机函数
   * @returns {Array} 新数组
   */
  function shuffle(list, rng) {
    var arr = list.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor((rng() % 1) * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  /**
   * 从题库抽题：每个类别保底一道，其余随机补齐，最后打乱出场顺序。
   * @param {Array} pool 题库
   * @param {number} count 抽题数
   * @param {Function} [rng] 可注入随机源
   * @returns {Array} 题目列表
   */
  function pickQuestions(pool, count, rng) {
    rng = rng || Math.random;
    var shuffled = shuffle(pool, rng);
    var categories = [];
    pool.forEach(function (q) {
      if (categories.indexOf(q.category) < 0) {
        categories.push(q.category);
      }
    });
    var picked = [];
    var used = {};
    categories.forEach(function (cat) {
      if (picked.length >= count) {
        return;
      }
      var found = null;
      for (var i = 0; i < shuffled.length; i++) {
        if (shuffled[i].category === cat && !used[shuffled[i].id]) {
          found = shuffled[i];
          break;
        }
      }
      if (found) {
        picked.push(found);
        used[found.id] = true;
      }
    });
    for (var i = 0; i < shuffled.length && picked.length < count; i++) {
      if (!used[shuffled[i].id]) {
        picked.push(shuffled[i]);
        used[shuffled[i].id] = true;
      }
    }
    return shuffle(picked, rng).slice(0, count);
  }

  // ── 计分与称号 ──

  /**
   * 单题得分：基础 100，剩余时间每秒折 2 分（上限 40），连对第 2 题起每题加 25。
   * @param {boolean} isCorrect 是否答对
   * @param {number} remainingSeconds 剩余秒数
   * @param {number} streak 含本题在内的连对数
   * @returns {{base:number, timeBonus:number, streakBonus:number, gained:number}}
   */
  function scoreAnswer(isCorrect, remainingSeconds, streak) {
    if (!isCorrect) {
      return { base: 0, timeBonus: 0, streakBonus: 0, gained: 0 };
    }
    var base = 100;
    var timeBonus = Math.max(0, Math.min(40, Math.round(Math.max(0, remainingSeconds)) * 2));
    var streakBonus = streak >= 2 ? (streak - 1) * 25 : 0;
    return { base: base, timeBonus: timeBonus, streakBonus: streakBonus, gained: base + timeBonus + streakBonus };
  }

  /**
   * 按正确率给称号。
   * @param {number} correct 答对题数
   * @param {number} total 总题数
   * @returns {{title:string, comment:string}}
   */
  function rankTitle(correct, total) {
    var ratio = total > 0 ? correct / total : 0;
    if (ratio >= 1) {
      return { title: 'YAML 判官本官', comment: '一颗雷都没踩。别写代码了，去写规范吧。' };
    }
    if (ratio >= 0.75) {
      return { title: '资深配置工程师', comment: '老油条，靠肌肉记忆活了下来。' };
    }
    if (ratio >= 0.5) {
      return { title: '缩进幸存者', comment: '活得下来，全靠小心驶得万年船。' };
    }
    return { title: '刚被 YAML 炸过', comment: '没关系，第一个雷大家都踩。' };
  }

  // ── 值描述与对照（供解析器对照台使用）──

  /**
   * 把任意 js-yaml 解析产物描述成 {type, display}，归类与后端 DTO 一一对应。
   * @param {*} v 任意解析值
   * @returns {{type:string, display:string}}
   */
  function describeValue(v) {
    if (v === null || v === undefined) {
      return { type: 'null', display: 'null' };
    }
    if (typeof v === 'boolean') {
      return { type: 'boolean', display: v ? 'true' : 'false' };
    }
    if (typeof v === 'number') {
      return { type: Number.isInteger(v) ? 'integer' : 'float', display: String(v) };
    }
    if (typeof v === 'string') {
      return { type: 'string', display: v };
    }
    if (v instanceof Date) {
      return { type: 'date', display: v.toISOString().replace(/\.000Z$/, 'Z') };
    }
    if (Array.isArray(v)) {
      return { type: 'object', display: '[数组 ' + v.length + ' 项]' };
    }
    if (typeof v === 'object') {
      return { type: 'object', display: '[嵌套对象]' };
    }
    return { type: 'string', display: String(v) };
  }

  /**
   * 把 js-yaml 的根节点归一化为条目列表。
   * @param {*} root js-yaml 解析产物
   * @returns {{rootKind:string, entries:Array<{key:string,type:string,display:string}>}}
   */
  function toEntries(root) {
    if (root === null || root === undefined) {
      return { rootKind: 'null', entries: [] };
    }
    if (Array.isArray(root)) {
      return {
        rootKind: 'sequence',
        entries: root.map(function (v, i) {
          var d = describeValue(v);
          return { key: String(i), type: d.type, display: d.display };
        })
      };
    }
    if (typeof root === 'object') {
      return {
        rootKind: 'mapping',
        entries: Object.keys(root).map(function (k) {
          var d = describeValue(root[k]);
          return { key: k, type: d.type, display: d.display };
        })
      };
    }
    var d = describeValue(root);
    return { rootKind: 'scalar', entries: [{ key: '(root)', type: d.type, display: d.display }] };
  }

  /**
   * 对照浏览器与服务器两侧解析结果。
   * @param {{ok:boolean, error:string|null, entries:Array, rootKind:string}} front 前端归一化结果
   * @param {{ok:boolean, error:string|null, errorLine:number|null, rootKind:string|null,
   *          values:Array<{key:string,value:string,type:string}>}} back 后端 DTO（data 部分）
   * @returns {{verdict:string, clashCount:number, rows:Array<{key:string, front:{type,display}|null,
   *          back:{type,display}|null, same:boolean}>}}
   *          verdict: agree / clash / front-error / back-error / both-error
   */
  function diffEntries(front, back) {
    if (!front.ok && !back.ok) {
      return { verdict: 'both-error', clashCount: 0, rows: [] };
    }
    if (!front.ok) {
      return { verdict: 'front-error', clashCount: 0, rows: [] };
    }
    if (!back.ok) {
      return { verdict: 'back-error', clashCount: 0, rows: [] };
    }
    var frontMap = {};
    front.entries.forEach(function (e) {
      frontMap[e.key] = e;
    });
    var backMap = {};
    back.values.forEach(function (e) {
      backMap[e.key] = e;
    });
    var keys = back.values.map(function (e) {
      return e.key;
    });
    front.entries.forEach(function (e) {
      if (!(e.key in backMap) && keys.indexOf(e.key) < 0) {
        keys.push(e.key);
      }
    });
    var rows = keys.map(function (k) {
      var f = frontMap[k] || null;
      var b = backMap[k] || null;
      var frontCell = f ? { type: f.type, display: f.display } : null;
      var backCell = b ? { type: b.type, display: String(b.value) } : null;
      var same = !!(f && b) && f.type === b.type && f.display === String(b.value);
      return { key: k, front: frontCell, back: backCell, same: same };
    });
    var clashCount = rows.filter(function (r) {
      return !r.same;
    }).length;
    return { verdict: clashCount > 0 ? 'clash' : 'agree', clashCount: clashCount, rows: rows };
  }

  /**
   * 按类别汇总答题记录（结果页图表数据）。
   * @param {Array<{category:string, correct:boolean}>} answers
   * @returns {Array<{category:string, label:string, correct:number, total:number}>}
   */
  function categoryStats(answers) {
    var map = {};
    answers.forEach(function (a) {
      if (!map[a.category]) {
        map[a.category] = { category: a.category, label: CATEGORY_LABELS[a.category] || a.category, correct: 0, total: 0 };
      }
      map[a.category].total += 1;
      if (a.correct) {
        map[a.category].correct += 1;
      }
    });
    return Object.keys(map).map(function (k) {
      return map[k];
    });
  }

  /**
   * 生成战绩分享文本。
   * @param {{correct:number, total:number, score:number, title:string}} stat
   * @returns {string}
   */
  function buildShareText(stat) {
    return '我在「YAML 地雷阵」排掉了 ' + stat.correct + '/' + stat.total + ' 颗雷，得分 ' +
      stat.score + '，称号：' + stat.title + '。\n' +
      'country: no 会解析成 false 这种事，我居然现在才知道。\n' +
      '→ https://numfeel.996.ninja/pages/yaml-minefield/';
  }

  // ── 导出 ──

  var engine = {
    QUESTIONS_PER_RUN: QUESTIONS_PER_RUN,
    TIME_LIMIT: TIME_LIMIT,
    QUESTION_POOL: QUESTION_POOL,
    CATEGORY_LABELS: CATEGORY_LABELS,
    shuffle: shuffle,
    pickQuestions: pickQuestions,
    scoreAnswer: scoreAnswer,
    rankTitle: rankTitle,
    describeValue: describeValue,
    toEntries: toEntries,
    diffEntries: diffEntries,
    categoryStats: categoryStats,
    buildShareText: buildShareText
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = engine;
  }
  global.YamlMinefieldEngine = engine;
})(typeof window !== 'undefined' ? window : globalThis);

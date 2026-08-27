(function () {
  'use strict';

  var LZW = {};

  /**
   * 计算字符串的 UTF-8 字节数（按码点计，代理对按 4 字节）。
   * @param {string} str - 输入字符串
   * @returns {number} UTF-8 字节数
   */
  LZW.utf8Length = function (str) {
    var bytes = 0;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) {
        bytes += 1;
      } else if (c < 0x800) {
        bytes += 2;
      } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        var c2 = str.charCodeAt(i + 1);
        if (c2 >= 0xdc00 && c2 <= 0xdfff) {
          bytes += 4;
          i++;
        } else {
          bytes += 3;
        }
      } else {
        bytes += 3;
      }
    }
    return bytes;
  };

  /**
   * 把字符串拆成符号数组（码点级，代理对完整保留）。
   * @param {string} input - 输入字符串
   * @returns {string[]} 符号数组
   */
  LZW.toSymbols = function (input) {
    var out = [];
    for (var i = 0; i < input.length; i++) {
      var c = input.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < input.length) {
        var c2 = input.charCodeAt(i + 1);
        if (c2 >= 0xdc00 && c2 <= 0xdfff) {
          out.push(input.slice(i, i + 2));
          i++;
          continue;
        }
      }
      out.push(input.charAt(i));
    }
    return out;
  };

  /**
   * 符号数组 → 字典键（数组转 JSON，符号边界无歧义）。
   * @param {string[]} phrase - 短语符号数组
   * @returns {string} 字典键
   */
  LZW.phraseKey = function (phrase) {
    return JSON.stringify(phrase);
  };

  /**
   * 字典大小 → 每码定长位数 ceil(log2(dictSize))，至少 1 位。
   * 用 (dictSize-1) 的二进制位长实现，避免 Math.log 浮点误差（log2(2^n) 在部分引擎会偏大导致多算 1 位）。
   * @param {number} dictSize - 字典条目数
   * @returns {number} 位数
   */
  LZW.codeWidth = function (dictSize) {
    if (dictSize <= 1) return 1;
    return (dictSize - 1).toString(2).length;
  };

  /**
   * LZW 编码（GIF 风格：字母表即起手字典，边读边学新短语）。
   * 短语全程以符号数组表示，字典键无歧义，任意符号集（文本码点/像素级/字节值）均可。
   *
   * 返回对象：
   * - alphabet: 起手字典的符号表（按首次出现顺序，编号 0..N-1）
   * - codes: 输出编号流
   * - steps: 逐步 trace（供动画逐帧播放）
   *   step = { pos, symbol, matched, matchedStart, matchedEnd, emitted, newKey, newCode, flush }
   *     pos: 触发输出的读头位置（符号索引）
   *     symbol: 这一步读到的符号
   *     matched: 命中的字典条目（本次输出的词，符号数组）
   *     matchedStart/matchedEnd: 该词在输入中的覆盖区间 [start, end)
   *     emitted: 输出的编号
   *     newKey: 新学的词条（符号数组，flush 步为空数组）
   *     newCode: 新词条编号（flush 步为 -1）
   * - initialDictSize / finalDictSize: 字典条目数 起点 → 终点
   * - codeWidth: 每码定长位数
   * - alphabetBytes / codeBytes / totalBytes: 压缩后体积构成
   * - symbolCount: 输入符号数
   *
   * @param {string[]} symbols - 符号数组（来自 toSymbols，或数字字符串化的像素级/字节值）
   * @param {object} [opts] - { byteAlphabet: 字母表按"调色板"记账，每符号 1 字节（GIF 风格） }
   * @returns {object} 编码结果
   */
  LZW.encode = function (symbols, opts) {
    var byteAlphabet = !!(opts && opts.byteAlphabet);

    // 1) 字母表：按首次出现顺序给每个符号发编号，组成起手字典
    // 键统一用 phraseKey（单元素数组），与主循环的短语键同一命名空间
    var alphabet = [];
    var dict = {};
    var nextCode = 0;
    for (var i = 0; i < symbols.length; i++) {
      var s = symbols[i];
      var singleKey = LZW.phraseKey([s]);
      if (!dict.hasOwnProperty(singleKey)) {
        dict[singleKey] = nextCode++;
        alphabet.push(s);
      }
    }
    var initialDictSize = nextCode;

    // 2) 主循环：能匹配就攒着，匹配不上了就把词报出去，再学一个新短语
    var codes = [];
    var steps = [];
    var w = [];
    for (var j = 0; j < symbols.length; j++) {
      var c = symbols[j];
      var wcKey = LZW.phraseKey(w.concat([c]));
      if (dict.hasOwnProperty(wcKey)) {
        w.push(c);
      } else {
        var emit = dict[LZW.phraseKey(w)];
        codes.push(emit);
        var newCode = nextCode++;
        dict[wcKey] = newCode;
        steps.push({
          pos: j,
          symbol: c,
          matched: w.slice(),
          matchedStart: j - w.length,
          matchedEnd: j,
          emitted: emit,
          newKey: w.concat([c]),
          newCode: newCode,
          flush: false
        });
        w = [c];
      }
    }

    // 3) 收尾：最后一个词也要报出去
    if (w.length > 0) {
      var lastEmit = dict[LZW.phraseKey(w)];
      codes.push(lastEmit);
      steps.push({
        pos: symbols.length,
        symbol: '',
        matched: w.slice(),
        matchedStart: symbols.length - w.length,
        matchedEnd: symbols.length,
        emitted: lastEmit,
        newKey: [],
        newCode: -1,
        flush: true
      });
    }

    // 4) 体积估算：字母表（起手字典）+ 编号流（定长位打包）
    var finalDictSize = nextCode;
    var width = LZW.codeWidth(finalDictSize);
    var alphabetBytes = 0;
    if (byteAlphabet) {
      // 调色板式字母表：每项就是 1 个原始字节（等价 GIF 存调色板）
      alphabetBytes = alphabet.length;
    } else {
      for (var k = 0; k < alphabet.length; k++) {
        alphabetBytes += LZW.utf8Length(alphabet[k]);
      }
    }
    var codeBytes = Math.ceil(codes.length * width / 8);
    return {
      alphabet: alphabet,
      codes: codes,
      steps: steps,
      initialDictSize: initialDictSize,
      finalDictSize: finalDictSize,
      codeWidth: width,
      alphabetBytes: alphabetBytes,
      codeBytes: codeBytes,
      totalBytes: alphabetBytes + codeBytes,
      symbolCount: symbols.length
    };
  };

  /**
   * LZW 解码：只依赖字母表 + 编号流，重建出与编码器完全相同的字典。
   * @param {string[]} alphabet - 起手字典符号表（与编码时一致）
   * @param {number[]} codes - 编号流
   * @returns {object} { phrases: 解出的短语数组, symbols: 展开的符号数组, text: 拼接字符串 }
   * @throws 遇到非法编号抛错（此时说明压缩数据损坏）
   */
  LZW.decode = function (alphabet, codes) {
    var dict = {};
    var nextCode = 0;
    for (var i = 0; i < alphabet.length; i++) {
      dict[i] = [alphabet[i]];
      nextCode++;
    }
    var phrases = [];
    var prev = null;
    for (var j = 0; j < codes.length; j++) {
      var k = codes[j];
      var entry;
      if (dict.hasOwnProperty(k)) {
        entry = dict[k];
      } else if (k === nextCode && prev !== null) {
        // 经典 KwKwK 情况：这个编号刚学进字典就要被引用，
        // 词 = 上一个词 + 上一个词的首符号
        entry = prev.concat([prev[0]]);
      } else {
        throw new Error('corrupt code ' + k + ' (next=' + nextCode + ')');
      }
      phrases.push(entry);
      if (prev !== null) {
        dict[nextCode] = prev.concat([entry[0]]);
        nextCode++;
      }
      prev = entry;
    }
    var symbols = [];
    for (var m = 0; m < phrases.length; m++) {
      symbols = symbols.concat(phrases[m]);
    }
    return { phrases: phrases, symbols: symbols, text: symbols.join('') };
  };

  /**
   * 把符号数组拼成可读文本（数字符号间加空格）。
   * @param {string[]} symbols - 符号数组
   * @param {boolean} numeric - 符号是否为数字（像素级/字节级）
   * @returns {string} 展示文本
   */
  LZW.symbolsToDisplay = function (symbols, numeric) {
    if (!numeric) return symbols.join('');
    var buf = [];
    var perLine = 32;
    for (var i = 0; i < symbols.length; i++) {
      if (i > 0 && i % perLine === 0) buf.push('\n');
      else if (i > 0) buf.push(' ');
      buf.push(symbols[i]);
    }
    return buf.join('');
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LZW;
  }

  if (typeof window !== 'undefined') {
    window.LZW = LZW;
  }
})();

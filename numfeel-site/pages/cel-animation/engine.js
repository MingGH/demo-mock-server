(function () {
  'use strict';

  var Cel = {};

  // ============================================================
  // 一、成本计算（赛璐珞 vs 整帧重画）
  // ============================================================

  /**
   * 计算总帧数
   * @param {number} durationSec - 时长（秒）
   * @param {number} fps - 帧率
   * @returns {number} 总帧数
   */
  Cel.computeFrameCount = function (durationSec, fps) {
    return Math.round(durationSec * fps);
  };

  /**
   * 赛璐珞模式需要手绘的片数
   * 移动层每帧要换一张新片；静态层只画一次。
   * @param {number} frames - 总帧数
   * @param {number} movingLayers - 移动（会动）的图层数
   * @param {number} staticLayers - 静止（背景/前景）的图层数
   * @returns {number}
   */
  Cel.computeCelSheets = function (frames, movingLayers, staticLayers) {
    return movingLayers * frames + staticLayers;
  };

  /**
   * 整帧重画模式需要手绘的片数
   * 每一帧所有图层都要重画。
   * @param {number} frames - 总帧数
   * @param {number} totalLayers - 图层总数
   * @returns {number}
   */
  Cel.computeFullRedrawSheets = function (frames, totalLayers) {
    return totalLayers * frames;
  };

  /**
   * 汇总成本对比信息
   * @param {number} frames - 总帧数
   * @param {number} movingLayers - 移动层数
   * @param {number} staticLayers - 静态层数
   * @returns {object} 对比信息
   */
  Cel.computeSavingsInfo = function (frames, movingLayers, staticLayers) {
    var totalLayers = movingLayers + staticLayers;
    var cel = Cel.computeCelSheets(frames, movingLayers, staticLayers);
    var full = Cel.computeFullRedrawSheets(frames, totalLayers);
    var ratio = (cel > 0 && full > 0) ? (full / cel) : 0;
    return {
      frames: frames,
      totalLayers: totalLayers,
      movingLayers: movingLayers,
      staticLayers: staticLayers,
      celSheets: cel,
      fullRedrawSheets: full,
      savedSheets: full - cel,
      savingsRatio: ratio
    };
  };

  // ============================================================
  // 二、像素级场景生成（纯数据，不碰 DOM）
  // ============================================================

  function makeBuffer(w, h) {
    return new Uint8ClampedArray(w * h * 4);
  }

  /**
   * 在 RGBA 缓冲上写一个像素（src-over 混合）
   */
  function setPx(buf, w, x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= w) return;
    var h = buf.length / (w * 4);
    if (y >= h) return;
    var i = (y * w + x) * 4;
    var sa = a / 255;
    var da = buf[i + 3] / 255;
    var oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    buf[i] = Math.round((r * sa + buf[i] * da * (1 - sa)) / oa);
    buf[i + 1] = Math.round((g * sa + buf[i + 1] * da * (1 - sa)) / oa);
    buf[i + 2] = Math.round((b * sa + buf[i + 2] * da * (1 - sa)) / oa);
    buf[i + 3] = Math.round(oa * 255);
  }

  function fillRect(buf, w, h, x0, y0, x1, y1, r, g, b, a) {
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        setPx(buf, w, x, y, r, g, b, a);
      }
    }
  }

  function fillCircle(buf, w, h, cx, cy, radius, r, g, b, a) {
    for (var y = cy - radius; y <= cy + radius; y++) {
      for (var x = cx - radius; x <= cx + radius; x++) {
        var dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= radius * radius) {
          setPx(buf, w, x, y, r, g, b, a);
        }
      }
    }
  }

  function fillTriangle(buf, w, h, x0, y0, x1, y1, x2, y2, r, g, b, a) {
    var minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    var maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1, x2)));
    var minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    var maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1, y2)));
    function sign(ax, ay, bx, by, cx, cy) {
      return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    }
    for (var y = minY; y <= maxY; y++) {
      for (var x = minX; x <= maxX; x++) {
        var d1 = sign(x0, y0, x1, y1, x, y);
        var d2 = sign(x1, y1, x2, y2, x, y);
        var d3 = sign(x2, y2, x0, y0, x, y);
        var neg = d1 < 0 || d2 < 0 || d3 < 0;
        var pos = d1 > 0 || d2 > 0 || d3 > 0;
        if (!(neg && pos)) {
          setPx(buf, w, x, y, r, g, b, a);
        }
      }
    }
  }

  /**
   * 生成静态背景（天空 / 太阳 / 远山 / 近山 / 地面）
   * @param {number} w - 宽
   * @param {number} h - 高
   * @returns {Uint8ClampedArray} RGBA 像素
   */
  Cel.buildBackground = function (w, h) {
    var buf = makeBuffer(w, h);
    for (var y = 0; y < h; y++) {
      var t = y / h;
      var r = Math.round(135 + (255 - 135) * t);
      var g = Math.round(206 - (206 - 173) * t);
      var bV = Math.round(235 - (235 - 200) * t);
      fillRect(buf, w, h, 0, y, w - 1, y, r, g, bV, 255);
    }
    fillCircle(buf, w, h, Math.round(w * 0.78), Math.round(h * 0.22), Math.round(h * 0.12), 255, 214, 0, 255);
    fillTriangle(buf, w, h, 0, h, Math.round(w * 0.3), Math.round(h * 0.5), Math.round(w * 0.6), h, 110, 160, 90, 255);
    fillTriangle(buf, w, h, Math.round(w * 0.4), h, Math.round(w * 0.75), Math.round(h * 0.45), w, h, 100, 150, 80, 255);
    fillTriangle(buf, w, h, 0, h, Math.round(w * 0.2), Math.round(h * 0.62), Math.round(w * 0.5), h, 80, 140, 70, 255);
    fillTriangle(buf, w, h, Math.round(w * 0.5), h, Math.round(w * 0.85), Math.round(h * 0.6), w, h, 70, 130, 60, 255);
    fillRect(buf, w, h, 0, Math.round(h * 0.82), w - 1, h - 1, 90, 150, 60, 255);
    return buf;
  };

  /**
   * 生成角色精灵（透明底，一个圆润小人）
   * @returns {{data: Uint8ClampedArray, width: number, height: number}}
   */
  Cel.buildCharacterSprite = function () {
    var cw = 26, ch = 34;
    var buf = makeBuffer(cw, ch);
    fillCircle(buf, cw, ch, 13, 16, 10, 240, 120, 100, 255);
    fillCircle(buf, cw, ch, 13, 8, 8, 255, 200, 150, 255);
    fillCircle(buf, cw, ch, 10, 7, 2, 40, 40, 60, 255);
    fillCircle(buf, cw, ch, 16, 7, 2, 40, 40, 60, 255);
    fillRect(buf, cw, ch, 10, 11, 16, 11, 80, 60, 60, 255);
    fillRect(buf, cw, ch, 8, 26, 12, 31, 200, 90, 80, 255);
    fillRect(buf, cw, ch, 14, 26, 18, 31, 200, 90, 80, 255);
    return { data: buf, width: cw, height: ch };
  };

  /**
   * 生成静态前景（几棵树，透明底）
   * @param {number} w - 宽
   * @param {number} h - 高
   * @returns {Uint8ClampedArray} RGBA 像素
   */
  Cel.buildForeground = function (w, h) {
    var buf = makeBuffer(w, h);
    var treeXs = [w * 0.08, w * 0.35, w * 0.65, w * 0.92];
    for (var i = 0; i < treeXs.length; i++) {
      var tx = Math.round(treeXs[i]);
      var ty = Math.round(h * 0.82);
      fillRect(buf, w, h, tx - 3, ty - 6, tx + 3, ty + 6, 120, 80, 50, 255);
      fillTriangle(buf, w, h, tx - 12, ty - 6, tx, ty - 30, tx + 12, ty - 6, 40, 90, 50, 255);
      fillTriangle(buf, w, h, tx - 9, ty - 14, tx, ty - 34, tx + 9, ty - 14, 50, 110, 60, 255);
    }
    return buf;
  };

  /**
   * 计算角色在某帧的位置（水平移动 + 上下弹跳）
   * @param {number} frame - 当前帧
   * @param {number} frames - 一个循环的总帧数
   * @param {number} w - 场景宽
   * @param {number} h - 场景高
   * @param {number} spriteW - 精灵宽
   * @param {number} spriteH - 精灵高
   * @returns {{x: number, y: number}}
   */
  Cel.characterPositionAt = function (frame, frames, w, h, spriteW, spriteH) {
    var t = frames > 1 ? frame / (frames - 1) : 0;
    var x = Math.round(t * (w - spriteW));
    var bounce = Math.abs(Math.sin(frame * 0.6)) * (h * 0.1);
    var y = Math.round(Math.round(h * 0.82 - spriteH) - bounce);
    return { x: x, y: y };
  };

  /**
   * 给整张缓冲加一个亮度偏移（模拟整帧重画的闪烁）
   * @param {Uint8ClampedArray} buf - 源缓冲
   * @param {number} delta - 亮度偏移（-255 ~ 255）
   * @returns {Uint8ClampedArray} 新缓冲
   */
  Cel.applyFlicker = function (buf, delta) {
    var out = new Uint8ClampedArray(buf.length);
    for (var i = 0; i < buf.length; i += 4) {
      out[i] = Math.max(0, Math.min(255, buf[i] + delta));
      out[i + 1] = Math.max(0, Math.min(255, buf[i + 1] + delta));
      out[i + 2] = Math.max(0, Math.min(255, buf[i + 2] + delta));
      out[i + 3] = buf[i + 3];
    }
    return out;
  };

  /**
   * 把背景 + 角色 + 前景合成到一张完整 RGBA 缓冲
   * @param {number} w - 宽
   * @param {number} h - 高
   * @param {Uint8ClampedArray|null} background
   * @param {{data:Uint8ClampedArray,width:number,height:number}|null} character
   * @param {Uint8ClampedArray|null} fg
   * @param {number} charX - 角色目标 x
   * @param {number} charY - 角色目标 y
   * @returns {Uint8ClampedArray}
   */
  Cel.composite = function (w, h, background, character, fg, charX, charY) {
    var out = makeBuffer(w, h);
    if (background) out.set(background);
    if (character) {
      var cw = character.width, ch = character.height;
      for (var y = 0; y < ch; y++) {
        for (var x = 0; x < cw; x++) {
          var si = (y * cw + x) * 4;
          var a = character.data[si + 3];
          if (a === 0) continue;
          setPx(out, w, charX + x, charY + y, character.data[si], character.data[si + 1], character.data[si + 2], a);
        }
      }
    }
    if (fg) {
      for (var y2 = 0; y2 < h; y2++) {
        for (var x2 = 0; x2 < w; x2++) {
          var fi = (y2 * w + x2) * 4;
          var fa = fg[fi + 3];
          if (fa === 0) continue;
          setPx(out, w, x2, y2, fg[fi], fg[fi + 1], fg[fi + 2], fa);
        }
      }
    }
    return out;
  };

  // ============================================================
  // 导出
  // ============================================================
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Cel;
  }
  window.FractalCel = Cel;
})();
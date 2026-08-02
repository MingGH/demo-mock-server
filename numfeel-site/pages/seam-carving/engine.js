var seamCarving = {};

seamCarving.computeEnergy = function (data, w, h) {
  var energy = new Float32Array(w * h);

  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var idx = (y * w + x) * 4;
      var dx = 0, dy = 0;

      if (x > 0 && x < w - 1) {
        var l = (y * w + (x - 1)) * 4;
        var r = (y * w + (x + 1)) * 4;
        dx = Math.abs(data[r] - data[l]) + Math.abs(data[r + 1] - data[l + 1]) + Math.abs(data[r + 2] - data[l + 2]);
      }

      if (y > 0 && y < h - 1) {
        var u = ((y - 1) * w + x) * 4;
        var d = ((y + 1) * w + x) * 4;
        dy = Math.abs(data[d] - data[u]) + Math.abs(data[d + 1] - data[u + 1]) + Math.abs(data[d + 2] - data[u + 2]);
      }

      energy[y * w + x] = dx + dy;
    }
  }
  return energy;
};

seamCarving.findVerticalSeam = function (energy, w, h) {
  var dp = new Float32Array(w * h);
  var parent = new Int32Array(w * h);

  for (var x = 0; x < w; x++) {
    dp[x] = energy[x];
    parent[x] = -1;
  }

  for (var y = 1; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var idx = y * w + x;
      var minVal = dp[(y - 1) * w + x];
      var minParent = x;

      if (x > 0 && dp[(y - 1) * w + (x - 1)] < minVal) {
        minVal = dp[(y - 1) * w + (x - 1)];
        minParent = x - 1;
      }
      if (x < w - 1 && dp[(y - 1) * w + (x + 1)] < minVal) {
        minVal = dp[(y - 1) * w + (x + 1)];
        minParent = x + 1;
      }

      dp[idx] = energy[idx] + minVal;
      parent[idx] = minParent;
    }
  }

  var minEnergy = Infinity;
  var endX = 0;
  for (var x = 0; x < w; x++) {
    var val = dp[(h - 1) * w + x];
    if (val < minEnergy) {
      minEnergy = val;
      endX = x;
    }
  }

  var seam = new Int32Array(h);
  var cx = endX;
  for (var y = h - 1; y >= 0; y--) {
    seam[y] = cx;
    cx = parent[y * w + cx];
  }
  return seam;
};

seamCarving.removeVerticalSeam = function (data, w, h, seam) {
  var dst = new Uint8ClampedArray((w - 1) * h * 4);

  for (var y = 0; y < h; y++) {
    var sx = seam[y];
    var srcRow = y * w * 4;
    var dstRow = y * (w - 1) * 4;
    for (var x = 0; x < sx; x++) {
      var si = srcRow + x * 4;
      var di = dstRow + x * 4;
      dst[di] = data[si];
      dst[di + 1] = data[si + 1];
      dst[di + 2] = data[si + 2];
      dst[di + 3] = data[si + 3];
    }
    for (var x = sx + 1; x < w; x++) {
      var si = srcRow + x * 4;
      var di = dstRow + (x - 1) * 4;
      dst[di] = data[si];
      dst[di + 1] = data[si + 1];
      dst[di + 2] = data[si + 2];
      dst[di + 3] = data[si + 3];
    }
  }

  return { data: dst, width: w - 1, height: h };
};

seamCarving.findHorizontalSeam = function (energy, w, h) {
  var transposed = new Float32Array(w * h);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      transposed[x * h + y] = energy[y * w + x];
    }
  }
  var seamT = seamCarving.findVerticalSeam(transposed, h, w);
  var seam = new Int32Array(w);
  for (var x = 0; x < w; x++) {
    seam[x] = seamT[x];
  }
  return seam;
};

seamCarving.removeHorizontalSeam = function (data, w, h, seam) {
  var dst = new Uint8ClampedArray(w * (h - 1) * 4);

  for (var x = 0; x < w; x++) {
    var sy = seam[x];
    for (var y = 0; y < sy; y++) {
      var si = (y * w + x) * 4;
      var di = (y * w + x) * 4;
      dst[di] = data[si];
      dst[di + 1] = data[si + 1];
      dst[di + 2] = data[si + 2];
      dst[di + 3] = data[si + 3];
    }
    for (var y = sy + 1; y < h; y++) {
      var si = (y * w + x) * 4;
      var di = ((y - 1) * w + x) * 4;
      dst[di] = data[si];
      dst[di + 1] = data[si + 1];
      dst[di + 2] = data[si + 2];
      dst[di + 3] = data[si + 3];
    }
  }

  return { data: dst, width: w, height: h - 1 };
};

seamCarving.carveOneSeam = function (data, w, h, direction) {
  var energy = seamCarving.computeEnergy(data, w, h);
  var seam;
  if (direction === 'horizontal') {
    seam = seamCarving.findHorizontalSeam(energy, w, h);
  } else {
    seam = seamCarving.findVerticalSeam(energy, w, h);
  }
  var result = direction === 'horizontal'
    ? seamCarving.removeHorizontalSeam(data, w, h, seam)
    : seamCarving.removeVerticalSeam(data, w, h, seam);
  result.seam = seam;
  result.energy = energy;
  return result;
};

seamCarving.getRandomFact = function () {
  var FACTS = [
    'Seam Carving 由 Shai Avidan 和 Ariel Shamir 在 2007 年提出，论文被引用超过 3000 次',
    'Photoshop 的 "内容感知缩放" 功能底层就是 Seam Carving 算法',
    'Seam Carving 可以同时移除垂直和水平方向的接缝，实现任意尺寸缩放',
    '算法会优先移除"能量最低"的像素路径——即颜色变化最平缓的区域',
    'Seam Carving 的复杂度是 O(w×h)，对一张 400×300 的图移除 100 条接缝只需不到 1 秒',
    '接缝是一条从顶到底（或从左到右）的连续路径，每次只经过相邻像素',
    '能量函数可以用梯度、熵、显著性等多种方式计算，不同函数效果不同',
    'Seam Carving 也可以用来放大图片——复制低能量接缝即可',
    '最早的 Seam Carving 演示视频在 YouTube 上有超过 200 万次播放',
    '接缝删除的顺序可以用动态规划精确求解，保证每次删除的都是当前最优',
    'Seam Carving 是计算摄影学领域的经典算法之一',
    '如果把一张图的所有接缝都画出来，会形成类似"水流"的流线图案'
  ];
  return FACTS[Math.floor(Math.random() * FACTS.length)];
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = seamCarving;
}
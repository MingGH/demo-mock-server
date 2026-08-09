/**
 * 知乎创作分析 — 数据处理引擎
 * 纯函数，不操作 DOM，可独立测试。
 */

var ZhihuEngine = (function () {
  'use strict';

  var TYPE_LABELS = {
    'article': '文章',
    'answer': '回答',
    'zvideo': '视频',
    'pin': '想法',
    'question': '问题'
  };

  var TYPE_COLORS = {
    'article': '#ffd700',
    'answer': '#90caf9',
    'zvideo': '#81c784',
    'pin': '#ce93d8',
    'question': '#ff8a65'
  };

  /**
   * 获取内容类型的中文标签。
   * @param {string} type - 英文类型
   * @returns {string} 中文标签
   */
  function getTypeLabel(type) {
    return TYPE_LABELS[type] || type;
  }

  /**
   * 获取内容类型的颜色。
   * @param {string} type - 英文类型
   * @returns {string} 颜色值
   */
  function getTypeColor(type) {
    return TYPE_COLORS[type] || '#888';
  }

  /**
   * 格式化大数字：过万用"万"表示。
   * @param {number} n - 数字
   * @returns {string} 格式化后的字符串
   */
  function formatNumber(n) {
    if (n >= 10000) {
      return (n / 10000).toFixed(1) + '万';
    }
    if (n >= 1000) {
      return n.toLocaleString('zh-CN');
    }
    return String(n);
  }

  /**
   * 将秒级时间戳格式化为日期字符串。
   * @param {number} ts - 秒级时间戳
   * @returns {string} 格式如 "2023-05-15"
   */
  function formatDate(ts) {
    if (!ts) return '-';
    var d = new Date(ts * 1000);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  /**
   * 将秒级时间戳格式化为完整日期时间。
   * @param {number} ts - 秒级时间戳
   * @returns {string} 格式如 "2023-05-15 14:30"
   */
  function formatDateTime(ts) {
    if (!ts) return '-';
    var d = new Date(ts * 1000);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0') + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0');
  }

  /**
   * 计算数组的中位数。
   * @param {number[]} arr - 数字数组
   * @returns {number} 中位数
   */
  function median(arr) {
    if (!arr || arr.length === 0) return 0;
    var sorted = arr.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    }
    return sorted[mid];
  }

  /**
   * 计算数组的 P90 分位数。
   * @param {number[]} arr - 数字数组
   * @returns {number} P90 值
   */
  function percentile90(arr) {
    if (!arr || arr.length === 0) return 0;
    var sorted = arr.slice().sort(function (a, b) { return a - b; });
    var idx = Math.ceil(sorted.length * 0.9) - 1;
    return sorted[Math.max(0, idx)];
  }

  /**
   * 按固定区间生成直方图分桶数据。
   * 数据呈幂律分布时（max/min ≥ 50），自动改为对数桶，
   * 让 1-9 / 10-99 / 100-999 / 1,000+ 这种「数量级边界」可见。
   * @param {number[]} values - 原始值数组
   * @param {number} maxBuckets - 最大桶数
   * @returns {{labels: string[], data: number[], median: number, p90: number}}
   */
  function histogram(values, maxBuckets) {
    maxBuckets = maxBuckets || 10;
    if (!values || values.length === 0) {
      return { labels: [], data: [], median: 0, p90: 0 };
    }
    var minVal = Math.min.apply(null, values);
    var maxVal = Math.max.apply(null, values);
    if (maxVal === minVal) {
      return {
        labels: [formatBucketNum(maxVal)],
        data: [values.length],
        buckets: [values.slice()],
        median: maxVal,
        p90: maxVal
      };
    }
    // 幂律数据：max ≥ 50 × min 时切对数桶
    if (maxVal / Math.max(1, minVal) >= 50) {
      return logBuckets(values, minVal, maxVal, maxBuckets);
    }
    return linearBuckets(values, minVal, maxVal, maxBuckets);
  }

  function linearBuckets(values, minVal, maxVal, maxBuckets) {
    var bucketSize = Math.max(1, Math.ceil((maxVal - minVal) / maxBuckets));
    var buckets = [];
    var bucketValues = [];
    var bucketLabels = [];
    for (var i = 0; i < maxBuckets; i++) {
      var low = minVal + i * bucketSize;
      var high = low + bucketSize - 1;
      if (i === maxBuckets - 1) high = maxVal;
      bucketLabels.push(formatRange(low, high));
      buckets.push(0);
      bucketValues.push([]);
    }
    for (var j = 0; j < values.length; j++) {
      var idx = Math.min(maxBuckets - 1, Math.floor((values[j] - minVal) / bucketSize));
      buckets[idx]++;
      bucketValues[idx].push(values[j]);
    }
    return {
      labels: bucketLabels,
      data: buckets,
      buckets: bucketValues,
      median: median(values),
      p90: percentile90(values)
    };
  }

  function logBuckets(values, minVal, maxVal, maxBuckets) {
    var lo = Math.floor(Math.log10(Math.max(1, minVal)));
    var hi = Math.ceil(Math.log10(Math.max(1, maxVal)));
    var decades = Math.max(1, hi - lo);
    // 每个 decade 1 桶；若总桶数 > maxBuckets，则合并相邻 decade
    var step = Math.max(1, Math.ceil(decades / Math.max(1, maxBuckets - 1)));
    var buckets = [];
    var bucketValues = [];
    var bucketLabels = [];
    for (var p = lo; p < hi; p += step) {
      var low = Math.pow(10, p);
      var high = Math.pow(10, Math.min(hi, p + step)) - 1;
      if (p + step >= hi) high = maxVal;
      bucketLabels.push(formatRange(low, high));
      buckets.push(0);
      bucketValues.push([]);
    }
    for (var i = 0; i < values.length; i++) {
      var v = Math.max(1, values[i]);
      var pIdx = Math.floor(Math.log10(v));
      var idx = Math.min(buckets.length - 1, Math.floor((pIdx - lo) / step));
      buckets[idx]++;
      bucketValues[idx].push(values[i]);
    }
    return {
      labels: bucketLabels,
      data: buckets,
      buckets: bucketValues,
      median: median(values),
      p90: percentile90(values)
    };
  }

  function formatRange(low, high) {
    if (low === high) return formatBucketNum(low);
    // 跨万级用「1万+」简写
    if (low >= 10000) return formatBucketNum(low) + '+';
    if (high >= 10000 && low < 10000) {
      return formatBucketNum(low) + '-' + Math.round(high / 1000) + 'k';
    }
    return formatBucketNum(low) + '-' + formatBucketNum(high);
  }

  function formatBucketNum(n) {
    n = Math.round(n);
    if (n >= 10000) return (n / 10000).toFixed(n % 10000 === 0 ? 0 : 1) + '\u4e07';
    return n.toLocaleString('en-US');
  }

  /**
   * 按小时聚合发布数量。
   * @param {Array} items - 内容列表，每项包含 createdAt
   * @returns {number[]} 24 小时数组
   */
  function aggregateByHour(items) {
    var hours = new Array(24).fill(0);
    for (var i = 0; i < items.length; i++) {
      var h = new Date(items[i].createdAt * 1000).getHours();
      hours[h]++;
    }
    return hours;
  }

  /**
   * 按星期聚合发布数量。
   * @param {Array} items - 内容列表，每项包含 createdAt
   * @returns {number[]} 7 天数组（0=周日, 1=周一...）
   */
  function aggregateByWeekday(items) {
    var days = new Array(7).fill(0);
    for (var i = 0; i < items.length; i++) {
      var d = new Date(items[i].createdAt * 1000).getDay();
      days[d]++;
    }
    return days;
  }

  /**
   * 按月聚合发布数量（用于热力图）。
   * @param {Array} items - 内容列表
   * @returns {Object} { labels: string[], data: number[] }
   */
  function aggregateByMonth(items) {
    var map = {};
    for (var i = 0; i < items.length; i++) {
      var d = new Date(items[i].createdAt * 1000);
      var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      map[key] = (map[key] || 0) + 1;
    }
    var keys = Object.keys(map).sort();
    return {
      labels: keys,
      data: keys.map(function (k) { return map[k]; })
    };
  }

  /**
   * 生成洞察引语。
   * @param {Object} stats - 统计数据
   * @returns {string} 洞察文本
   */
  function generateInsight(stats) {
    var parts = [];
    if (stats.total > 0) {
      parts.push('你共创作了 ' + stats.total + ' 篇内容');
    }
    if (stats.span > 0) {
      parts.push('创作生涯跨越 ' + stats.span + ' 天');
    }
    if (stats.byType) {
      var maxType = '';
      var maxCount = 0;
      var keys = Object.keys(stats.byType);
      for (var i = 0; i < keys.length; i++) {
        if (stats.byType[keys[i]] > maxCount) {
          maxCount = stats.byType[keys[i]];
          maxType = keys[i];
        }
      }
      if (maxType) {
        parts.push('主力内容是' + getTypeLabel(maxType) + '（' + maxCount + ' 篇）');
      }
    }
    if (stats.avgLikes > 0) {
      parts.push('篇均获赞 ' + Math.round(stats.avgLikes));
    }
    if (stats.totalLikes > 0) {
      parts.push('累计获赞 ' + formatNumber(stats.totalLikes));
    }
    return parts.join('，') + '。';
  }

  /**
   * 计算统计数据。
   * @param {Array} items - 全部内容列表
   * @returns {Object} 统计结果
   */
  function computeStats(items) {
    if (!items || items.length === 0) {
      return {
        total: 0, span: 0, totalLikes: 0, totalComments: 0, totalFavorites: 0,
        avgLikes: 0, avgComments: 0, avgFavorites: 0,
        firstCreated: 0, lastCreated: 0, byType: {}, byYear: {}, byMonth: {}
      };
    }
    var total = items.length;
    var likes = items.map(function (i) { return i.likeCount; });
    var comments = items.map(function (i) { return i.commentCount; });
    var favorites = items.map(function (i) { return i.favoriteCount; });
    var timestamps = items.map(function (i) { return i.createdAt; });

    var totalLikes = likes.reduce(function (a, b) { return a + b; }, 0);
    var totalComments = comments.reduce(function (a, b) { return a + b; }, 0);
    var totalFavorites = favorites.reduce(function (a, b) { return a + b; }, 0);
    var firstCreated = Math.min.apply(null, timestamps);
    var lastCreated = Math.max.apply(null, timestamps);
    var span = Math.floor((lastCreated - firstCreated) / 86400) + 1;

    var byType = {};
    var byYear = {};
    var byMonth = {};
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      byType[item.contentType] = (byType[item.contentType] || 0) + 1;
      var d = new Date(item.createdAt * 1000);
      var yearKey = String(d.getFullYear());
      var monthKey = yearKey + '-' + String(d.getMonth() + 1).padStart(2, '0');
      byYear[yearKey] = (byYear[yearKey] || 0) + 1;
      byMonth[monthKey] = (byMonth[monthKey] || 0) + 1;
    }

    return {
      total: total,
      span: span,
      totalLikes: totalLikes,
      totalComments: totalComments,
      totalFavorites: totalFavorites,
      avgLikes: total > 0 ? Math.round(totalLikes / total) : 0,
      avgComments: total > 0 ? Math.round(totalComments / total) : 0,
      avgFavorites: total > 0 ? Math.round(totalFavorites / total) : 0,
      firstCreated: firstCreated,
      lastCreated: lastCreated,
      byType: byType,
      byYear: byYear,
      byMonth: byMonth
    };
  }

  /**
   * 计算移动平均线。
   * @param {number[]} data - 原始数据
   * @param {number} windowSize - 窗口大小
   * @returns {number[]} 移动平均
   */
  function movingAverage(data, windowSize) {
    windowSize = windowSize || 7;
    var result = [];
    for (var i = 0; i < data.length; i++) {
      var start = Math.max(0, i - Math.floor(windowSize / 2));
      var end = Math.min(data.length, i + Math.ceil(windowSize / 2));
      var sum = 0;
      for (var j = start; j < end; j++) {
        sum += data[j];
      }
      result.push(Math.round(sum / (end - start)));
    }
    return result;
  }

  /**
   * 生成分析摘要文本（用于复制）。
   * @param {Array} items - 全部内容
   * @param {Object} stats - 统计数据
   * @returns {string} 摘要文本
   */
  function generateSummary(items, stats) {
    var lines = [];
    lines.push('【知乎创作分析报告】');
    lines.push('');
    lines.push('创作总数：' + stats.total + ' 篇');
    lines.push('创作跨度：' + stats.span + ' 天（' + formatDate(stats.firstCreated) + ' ~ ' + formatDate(stats.lastCreated) + '）');
    lines.push('累计获赞：' + formatNumber(stats.totalLikes) + ' | 评论：' + formatNumber(stats.totalComments) + ' | 收藏：' + formatNumber(stats.totalFavorites));
    lines.push('篇均获赞：' + stats.avgLikes);
    lines.push('');
    lines.push('内容分布：');
    var typeKeys = Object.keys(stats.byType);
    for (var i = 0; i < typeKeys.length; i++) {
      lines.push('  ' + getTypeLabel(typeKeys[i]) + '：' + stats.byType[typeKeys[i]] + ' 篇');
    }
    lines.push('');
    lines.push('年度产出：');
    var yearKeys = Object.keys(stats.byYear).sort();
    for (var j = 0; j < yearKeys.length; j++) {
      lines.push('  ' + yearKeys[j] + '：' + stats.byYear[yearKeys[j]] + ' 篇');
    }
    lines.push('');
    lines.push('—— 由「数字直觉」生成 (https://numfeel.996.ninja)');
    return lines.join('\n');
  }

  return {
    getTypeLabel: getTypeLabel,
    getTypeColor: getTypeColor,
    formatNumber: formatNumber,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    median: median,
    percentile90: percentile90,
    histogram: histogram,
    aggregateByHour: aggregateByHour,
    aggregateByWeekday: aggregateByWeekday,
    aggregateByMonth: aggregateByMonth,
    generateInsight: generateInsight,
    computeStats: computeStats,
    movingAverage: movingAverage,
    generateSummary: generateSummary
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ZhihuEngine: ZhihuEngine };
}
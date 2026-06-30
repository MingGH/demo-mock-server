/**
 * engine.js — JS 二进制实验室 纯计算逻辑
 * 浏览器端和 Node 测试均可使用
 */

var JsBinaryEngine = (function () {
    'use strict';

    /**
     * 字节数转可读格式
     * @param {number} bytes
     * @returns {string}
     */
    function formatSize(bytes) {
        if (bytes === 0) return '0 B';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    /**
     * 按指标排序编译对比数据
     * @param {Array} data
     * @param {string} metric - 'size' | 'coldStartMs' | 'peakMemKb'
     * @returns {Array}
     */
    function sortByMetric(data, metric) {
        return data.slice().sort(function (a, b) {
            return a[metric] - b[metric];
        });
    }

    /**
     * 热力图 segment 类型 → 颜色映射
     * @param {string} type - 'text' | 'data' | 'code' | 'zero'
     * @returns {string} CSS color
     */
    function segmentColor(type) {
        var map = {
            text: '#90caf9',
            data: '#ce93d8',
            code: '#81c784',
            zero: '#2a2a3e'
        };
        return map[type] || '#666';
    }

    /**
     * 从 segments 数据计算总字节数
     * @param {Array} segments
     * @returns {number}
     */
    function totalSize(segments) {
        var total = 0;
        for (var i = 0; i < segments.length; i++) {
            total += segments[i].size;
        }
        return total;
    }

    /**
     * 按类型统计 segment 占比
     * @param {Array} segments
     * @returns {Object} {text: N, data: N, code: N, zero: N}
     */
    function segmentTypeStats(segments) {
        var stats = { text: 0, data: 0, code: 0, zero: 0 };
        for (var i = 0; i < segments.length; i++) {
            var s = segments[i];
            stats[s.type] = (stats[s.type] || 0) + s.size;
        }
        return stats;
    }

    /**
     * 获取预设场景列表
     * @returns {Array<{id:string, name:string, icon:string, desc:string, code:string}>}
     */
    function getScenarios() {
        return [
            {
                id: 'fib',
                name: 'Fibonacci 递归',
                icon: 'ti-math-function',
                desc: '计算 fib(35)，测试递归性能',
                code: 'function fib(n) {\n    if (n <= 1) return n;\n    return fib(n-1) + fib(n-2);\n}\nconsole.log("fib(35) =", fib(35));\n'
            },
            {
                id: 'sort',
                name: '数组排序',
                icon: 'ti-arrows-sort',
                desc: '对 10000 个随机数排序，测量耗时',
                code: 'var arr = [];\nfor (var i = 0; i < 10000; i++) arr.push(Math.random());\nvar t = Date.now();\narr.sort(function(a,b){return a-b;});\nconsole.log("sorted 10000 in", Date.now()-t, "ms");\n'
            },
            {
                id: 'strings',
                name: '字符串处理',
                icon: 'ti-typography',
                desc: '重复拼接 + 分割 + 合并，测试字符串性能',
                code: 'var s = "Hello JS Binary Lab! ";\ns = s.repeat(1000);\nvar parts = s.split(" ");\nvar joined = parts.join("-");\nconsole.log("length:", joined.length);\n'
            }
        ];
    }

    // ── 导出 ──
    var api = {
        formatSize: formatSize,
        sortByMetric: sortByMetric,
        segmentColor: segmentColor,
        totalSize: totalSize,
        segmentTypeStats: segmentTypeStats,
        getScenarios: getScenarios
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    return api;
})();

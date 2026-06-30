// 标准测试脚本 — 覆盖典型 JS 操作：递归、JSON、字符串处理
function fib(n) {
    if (n <= 1) return n;
    return fib(n - 1) + fib(n - 2);
}

function bench() {
    var start = Date.now();
    var f = fib(35);
    var j = JSON.stringify({ a: 1, b: [2, 3, 4, 5], c: "hello".repeat(100) });
    var p = JSON.parse(j);
    var result = { fib35: f, jsonKeys: Object.keys(p).length, timeMs: Date.now() - start };
    console.log(JSON.stringify(result));
}

bench();

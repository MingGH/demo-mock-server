#!/usr/bin/env python3
"""
measure_inside.py — 在 Docker 容器内执行编译 + 性能测量
用法: python3 measure_inside.py /output/js-binary-comparison.json
"""
import json, os, subprocess, tempfile, statistics, shutil, time, sys, re

OUTFILE = sys.argv[1]
WORK = '/tmp/compile-work'
os.makedirs(WORK, exist_ok=True)

shutil.copy('/scripts/test-sample.js', WORK + '/test-sample.js')
with open(WORK + '/package.json', 'w') as f:
    json.dump({"name": "test", "version": "1.0.0"}, f)

results = []

def measure_cold(binary_cmd, n=50):
    """跑 n 次冷启动，返回中位数毫秒"""
    times = []
    for _ in range(n):
        start = time.perf_counter()
        r = subprocess.run(binary_cmd, shell=True, capture_output=True, 
                          cwd=WORK, timeout=30)
        elapsed = (time.perf_counter() - start) * 1000
        times.append(elapsed)
    return int(round(statistics.median(times)))

def measure_mem(binary_cmd):
    """使用 /usr/bin/time 测量峰值内存 (KB)"""
    wrapper = f'/usr/bin/time -f "MEM:%M" {binary_cmd}'
    r = subprocess.run(wrapper, shell=True, capture_output=True, cwd=WORK, timeout=30)
    # time 输出到 stderr
    stderr = r.stderr.decode()
    m = re.search(r'MEM:(\d+)', stderr)
    if m:
        return int(m.group(1))
    return 0

def compile_and_measure(label, compile_cmd, binary_path, desc, strip=False):
    """编译 + 测量一个工具"""
    print(f'=== {label} ===')
    # 编译
    r = subprocess.run(compile_cmd, shell=True, capture_output=True, cwd=WORK, timeout=120)
    if not os.path.exists(binary_path):
        print(f'  SKIP: no binary produced\n  stderr: {r.stderr.decode()[:300]}')
        return
    
    # strip 减小体积
    if strip:
        subprocess.run(f'strip {binary_path}', shell=True, capture_output=True)
    
    size = os.path.getsize(binary_path)
    cold_ms = measure_cold(str(binary_path))
    mem_kb = measure_mem(str(binary_path))
    
    results.append({
        'tool': label,
        'size': size,
        'coldStartMs': cold_ms,
        'peakMemKb': mem_kb,
        'desc': desc
    })
    mb = size / 1024 / 1024
    print(f'  {mb:.1f} MB, {cold_ms}ms startup, {mem_kb} KB peak')

# ── QuickJS qjsc ──
compile_and_measure(
    "QuickJS qjsc",
    "qjsc -o out-qjs test-sample.js 2>&1",
    WORK + "/out-qjs",
    "真正AOT编译，产物几百KB，不依赖外部运行时",
    strip=True
)

# ── Bun compile ──
compile_and_measure(
    "Bun compile",
    "bun build --compile test-sample.js --outfile out-bun 2>&1",
    WORK + "/out-bun",
    "打包Bun运行时+JS代码，体积约70-90MB"
)

# ── pkg: 试试 node18 target ──
pkg_result = subprocess.run(
    "pkg test-sample.js -t node18-linux-x64 -o out-pkg 2>&1",
    shell=True, capture_output=True, cwd=WORK, timeout=120
)
if os.path.exists(WORK + "/out-pkg"):
    compile_and_measure(
        "pkg (Vercel)",
        "echo already-built",
        WORK + "/out-pkg",
        "嵌入完整Node运行时(v18)，解压到临时目录执行"
    )
else:
    print(f'  pkg SKIP: {pkg_result.stderr.decode()[:200]}')

# ── Node.js 源码运行 (基线) ──
size = os.path.getsize(WORK + "/test-sample.js")
cold_ms = measure_cold(f"node {WORK}/test-sample.js")
mem_kb = measure_mem(f"node {WORK}/test-sample.js")
results.append({
    'tool': 'Node.js (源码运行)',
    'size': size,
    'coldStartMs': cold_ms,
    'peakMemKb': mem_kb,
    'desc': '不编译，node 直接运行（对比基线）'
})
print(f'  Node.js baseline: {cold_ms}ms, {mem_kb}KB')

# ── 输出 JSON ──
with open(OUTFILE, 'w') as f:
    json.dump(results, f, indent=2, ensure_ascii=False)
print(f'\n=== Wrote {len(results)} entries → {OUTFILE} ===')

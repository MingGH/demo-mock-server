#!/usr/bin/env python3
"""
anatomy_inside.py — 在 Docker 容器内编译 + 二进制解剖
输出 segments（热力图）、strings（可读字符串）、sections（ELF 结构）
"""
import json, os, subprocess, shutil, math, sys

OUTFILE = sys.argv[1]
WORK = '/tmp/anatomy-work'
os.makedirs(WORK, exist_ok=True)

shutil.copy('/scripts/test-sample.js', WORK + '/test-sample.js')
with open(WORK + '/package.json', 'w') as f:
    json.dump({"name": "test", "version": "1.0.0"}, f)

results = []

def run(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, cwd=WORK, timeout=120)

def analyze(label, compile_cmd, binary_name, strip=False):
    print(f'=== {label} ===')
    run(compile_cmd)
    binary = WORK + '/' + binary_name
    if not os.path.exists(binary):
        print(f'  SKIP: no binary')
        return
    
    if strip:
        subprocess.run(f'strip {binary}', shell=True, capture_output=True)
    
    size = os.path.getsize(binary)
    
    # 提取可读字符串（最多 50 条）
    strings_output = run(f'strings {binary}').stdout.decode(errors='replace')
    strings_list = []
    for line in strings_output.split('\n'):
        line = line.strip()
        if line and len(line) >= 4:
            # 过滤常见无意义模式
            if not all(c in '0123456789abcdefABCDEF ' for c in line):
                strings_list.append(line[:120])
    strings_list = strings_list[:50]
    
    # ELF sections
    sections = []
    readelf = run(f'readelf -S {binary} 2>/dev/null || true')
    for line in readelf.stdout.decode(errors='replace').split('\n'):
        # 匹配 section 行: [Nr] Name Type Address Offset Size ...
        parts = line.strip().split()
        if len(parts) >= 6 and parts[0].startswith('[') and parts[0].endswith(']'):
            try:
                name = parts[1]
                # 跳过不是十六进制的 offset/size
                if name.startswith('.'):
                    sections.append({
                        'name': name,
                        'offset': parts[4],
                        'size': parts[5]
                    })
            except:
                pass
    
    # 按类型分段（热力图数据）
    data = open(binary, 'rb').read()
    total = len(data)
    step = max(1, total // 256)
    segments = []
    for i in range(0, total, step):
        chunk = data[i:i+step]
        if len(chunk) == 0:
            continue
        zeros = sum(1 for b in chunk if b == 0)
        printable = sum(1 for b in chunk if 32 <= b < 127)
        
        # 计算熵
        freq = {}
        for b in chunk:
            freq[b] = freq.get(b, 0) + 1
        ent = 0
        for c in freq.values():
            p = c / len(chunk)
            if p > 0:
                ent -= p * math.log2(p)
        
        if zeros / len(chunk) > 0.9:
            t = 'zero'
        elif printable / len(chunk) > 0.7:
            t = 'text'
        elif ent > 5:
            t = 'data'
        else:
            t = 'code'
        
        segments.append({
            'offset': i,
            'size': min(step, total - i),
            'type': t
        })
    
    results.append({
        'tool': label,
        'size': size,
        'strings': strings_list,
        'sections': sections,
        'segments': segments
    })
    mb = size / 1024 / 1024
    print(f'  {mb:.1f} MB, {len(segments)} segments, {len(strings_list)} strings')

# ── QuickJS ──
analyze("QuickJS qjsc", "qjsc -o out-qjs test-sample.js 2>&1", "out-qjs", strip=True)

# ── Bun ──
analyze("Bun compile", "bun build --compile test-sample.js --outfile out-bun 2>&1", "out-bun")

# ── pkg ──
run("pkg test-sample.js -t node18-linux-x64 -o out-pkg 2>&1")
analyze("pkg (Vercel)", "echo done", "out-pkg")

with open(OUTFILE, 'w') as f:
    json.dump(results, f, indent=2, ensure_ascii=False)
print(f'\n=== Wrote {len(results)} entries → {OUTFILE} ===')

#!/bin/bash
set -euo pipefail
# compile-compare.sh — 板块1: 编译对比数据采集（全部在 Docker 内完成）
OUTFILE="${1:-/tmp/js-binary-comparison.json}"
ABSOUT="$(cd "$(dirname "$OUTFILE")" && pwd)/$(basename "$OUTFILE")"
IMAGE="js-compile-lab"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== 启动 Docker 编译+测量流水线 ==="

docker run --rm \
    -v "$SCRIPT_DIR:/scripts:ro" \
    -v "$(dirname "$ABSOUT"):/output" \
    "$IMAGE" \
    python3 /scripts/measure_inside.py /output/$(basename "$ABSOUT")

echo "=== Done ==="
python3 -m json.tool "$OUTFILE" > /dev/null && echo "JSON valid ✓"
python3 -c "
import json
d = json.load(open('$OUTFILE'))
print(f'{len(d)} tools collected:')
for e in d:
    mb = e['size']/1024/1024
    print(f'  {e[\"tool\"]}: {mb:.1f} MB, {e[\"coldStartMs\"]}ms startup, {e[\"peakMemKb\"]} KB peak')
"

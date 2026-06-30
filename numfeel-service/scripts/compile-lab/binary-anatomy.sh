#!/bin/bash
set -euo pipefail
# binary-anatomy.sh — 板块2: 二进制解剖数据采集（Docker 内完成）
OUTFILE="${1:-/tmp/js-binary-anatomy.json}"
ABSOUT="$(cd "$(dirname "$OUTFILE")" && pwd)/$(basename "$OUTFILE")"
IMAGE="js-compile-lab"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== 启动 Docker 编译+解剖流水线 ==="

docker run --rm \
    -v "$SCRIPT_DIR:/scripts:ro" \
    -v "$(dirname "$ABSOUT"):/output" \
    "$IMAGE" \
    python3 /scripts/anatomy_inside.py /output/$(basename "$ABSOUT")

echo "=== Done ==="
python3 -m json.tool "$OUTFILE" > /dev/null && echo "JSON valid ✓"
python3 -c "
import json
d = json.load(open('$OUTFILE'))
print(f'{len(d)} tools analyzed:')
for e in d:
    mb = e['size']/1024/1024
    segs = len(e['segments'])
    strs = len(e['strings'])
    secs = len(e['sections'])
    print(f'  {e[\"tool\"]}: {mb:.1f} MB, {segs} segments, {strs} strings, {secs} sections')
"

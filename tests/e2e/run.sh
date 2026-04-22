#!/bin/bash
# 生产环境冒烟测试
# 用法: ./tests/e2e/run.sh [--local]
#   --local  测试本地服务 (localhost:3999)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "$1" = "--local" ]; then
  export BASE_URL="http://localhost:3999"
  export API_URL="http://localhost:3999"
  echo "Testing local: $BASE_URL"
else
  echo "Testing production: https://numfeel.996.ninja"
fi

docker run --rm \
  -v "$SCRIPT_DIR/prod-smoke.js":/tmp/prod-smoke.js:ro \
  --network host \
  -w /tmp \
  -e BASE_URL -e API_URL \
  mcr.microsoft.com/playwright:v1.52.0-noble \
  sh -c "npm init -y >/dev/null 2>&1 && npm i playwright-core@1.52.0 >/dev/null 2>&1 && node prod-smoke.js"

"""numfeel-echo：rpc-chain 演示用的最小微服务。

只做一件事：按 query 参数 delay_ms 睡眠指定的毫秒数，然后返回
自己这一跳内部的真实耗时（微秒）。上游 Java 服务（numfeel-service）
通过 /demo/rpc-chain 串行调用本服务 N 跳，用返回的 took_us 区分
「上游纯处理耗时」与「网络 + 序列化 + 框架开销」。

刻意保持最小：无数据库、无连接池、无外部依赖，单进程 uvicorn 足够。
"""

import asyncio
import time

from fastapi import FastAPI, Query

app = FastAPI(title="numfeel-echo", docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/health")
async def health() -> dict:
    """存活探针，k3s readiness/liveness 共用。"""
    return {"status": "ok"}


@app.get("/echo")
async def echo(
    delay_ms: int = Query(default=0, ge=0, le=500, description="模拟的业务处理耗时（毫秒）"),
) -> dict:
    """睡眠 delay_ms 后返回本跳内部耗时。

    took_us 是 handler 入口到返回的总耗时（含睡眠），
    slept_us 是其中纯 asyncio.sleep 的部分，两者之差即 Python 侧框架开销。
    """
    start = time.perf_counter_ns()
    await asyncio.sleep(delay_ms / 1000)
    slept_us = (time.perf_counter_ns() - start) // 1000
    return {
        "service": "numfeel-echo",
        "delay_ms": delay_ms,
        "took_us": (time.perf_counter_ns() - start) // 1000,
        "slept_us": slept_us,
    }

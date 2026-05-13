# AGENTS.md — AI Context for opencode

## 项目概述

**demo-mock-server** — 交互式技术演示合集（数字直觉系列），用可视化和互动方式解释概率、统计、博弈论、心理学等概念。最初用于知乎技术问答的配套演示。

- 前端：https://numfeel.996.ninja（~119 个 HTML 演示页）
- 后端：https://numfeel-api.996.ninja

## 技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| 语言 | Java | 17 |
| 后端框架 | Eclipse Vert.x | 4.5.13 |
| 构建 | Maven + shade-plugin (fat jar) | — |
| 数据库 | MySQL 5.7+ (阿里云 RDS) | — |
| 限流 | Caffeine 内存缓存 | 3.1.8 |
| 日志 | SLF4J + Logback | — |
| JSON | Jackson | 2.12.2 |
| 前端 | 原生 HTML/CSS/JS + Chart.js 4.4.0 | — |
| 部署 | Docker + K3s (单副本) | — |
| CDN/DNS | Cloudflare 代理 | — |
| 测试 | JUnit 5 + Vert.x JUnit5 + Playwright (E2E) | — |

## 项目结构

```
├── pages/                  # 前端演示页面（~119个 HTML）
├── components/             # 公共组件（header.js, header.css）
├── data/
│   └── demos.json          # 演示列表（首页唯一数据源，编辑此文件同步到 sitemap/README）
├── src/main/java/com/example/demo_mock_server/
│   ├── MainVerticle.java   # 入口，启动 HTTP (8080)
│   ├── config/RouterConfig.java  # 路由注册（全部 API 路由）
│   ├── handler/            # API 处理器（24个，实现 Handler<RoutingContext>）
│   ├── service/            # 业务服务（17个，Caffeine 缓存）
│   └── generator/          # 数据生成器
├── src/test/java/          # 单元测试（19个测试类）
├── sql/                    # 数据库建表语句（13个表）
├── tests/e2e/              # Playwright 端到端测试
├── scripts/sync.py         # demos.json → sitemap.xml / README.md 同步脚本
├── Dockerfile              # ibm-semeru-runtimes:open-17-jre
├── k3s-deployment-prod.yaml
└── pom.xml
```

## 编码规范

- **Handler 模式：** 每个 API 端点一个 Handler 类，实现 `Handler<RoutingContext>`，通过 RouterConfig 注册
- **Service 层：** Caffeine 内存缓存，不依赖外部缓存中间件
- **IP 获取优先级：** `CF-Connecting-IP` > `X-Forwarded-For` > `X-Real-IP` > `remoteAddress`（因为走 Cloudflare 代理）
- **前端页面：** 每个演示独立 HTML，公共组件通过 `../../components/` 引用
- **数据驱动首页：** 新增/修改演示只改 `data/demos.json`，不要硬编码到 index.html
- **缩进：** 2 空格，UTF-8，LF（参见 .editorconfig）
- **测试：** JUnit 5 + Vert.x JUnit5 Extension + Mockito

## 常用命令

```bash
# 编译（本机无 JDK 17 则用 Docker）
docker run --rm -v "$(pwd)":/app -w /app eclipse-temurin:17-jdk ./mvnw clean package

# 运行测试
./mvnw test

# E2E 测试
./tests/e2e/run.sh              # 测生产
./tests/e2e/run.sh --local      # 测本地

# 同步 demos.json 到 sitemap.xml / README.md
python3 scripts/sync.py
```

## 部署

- **前端：** Cloudflare Pages 直接托管 `pages/`、`components/`、`data/`、`images/` 等静态目录，推送 `main` 后自动同步部署
- **后端：** GitHub Actions 构建 Docker 镜像 → 阿里云容器镜像仓库 → K3s 滚动更新（`Dockerfile` 只打包 fat jar，不含前端文件）
- 密钥通过 K3s Secret 注入（MYSQL_HOST/PORT/DB/USER/PASSWORD）
- 健康检查端点：`GET /chinese-names?n=1`（轻量，返回 200）

## 已知问题 / 待优化

- **P0:** 89 个 HTML 页面内联 CSS 严重重复
- **P1:** Dockerfile 单阶段构建，基础镜像版本未锁定
- **P1:** StatsProxyHandler 回调地狱，应改 `Future.all()`
- **P1:** pom.xml 依赖偏旧（jackson-databind 2.12.2 有 CVE）
- **P1:** CORS 配置 `*` 过于宽松
- **P2:** 前端逻辑分离不一致（~20 页有 xxx-logic.js，~70 页仍内联）

## 新选题方向

用户提出：「用代码解释 XX 概念」系列 — 以可运行的代码片段直观展示技术/数学/算法概念，如：

- 用代码解释递归 / 闭包 / Promise / 协程
- 用代码解释布隆过滤器 / 一致性哈希 / Raft 共识
- 用代码解释傅里叶变换 / 蒙特卡洛 / PageRank

新增此类演示只需：在 `pages/` 下创建 HTML 页面，在 `data/demos.json` 中注册即可。

## .kiro 遗留信息

项目根目录 `.kiro/` 是前 AI 助手 kiro 的 LSP 配置目录：
- `settings/lsp.json` — 语言服务器配置（Java/jdtls、Python/pyright、TypeScript、Go/gopls、Rust/rust-analyzer、Ruby/solargraph、C++/clangd）
- `.kiro-context.md` — kiro 的项目上下文文件（本文件基于此更新）

## Cloudflare DNS

- Zone: 996.ninja (ID: `49c84b697b70c650cfff3d43becba6af`)
- 管理脚本位于 `/root/control-ninja`
- 只增 DNS 记录，不删不改现有记录，全部 proxied=true

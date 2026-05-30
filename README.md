# Demo Collection

一个交互式技术演示合集，用可视化和互动方式解释编程概念、算法原理和生活中的数学问题。

## 在线预览

![](https://img.996.ninja/ninjutsu/d2ee5b735380bc524a6918a7d68ff72e.png)

| 环境 | 地址 |
|------|------|
| 前端 | https://numfeel.996.ninja |
| 后端 API | https://numfeel-api.996.ninja |

## 项目结构

```
├── numfeel-service/       # 后端 — Spring Boot WebFlux（Java 17）
│   ├── src/main/java/.../controller/   # REST 控制器（薄层）
│   ├── src/main/java/.../service/      # 业务逻辑层
│   ├── src/main/java/.../dto/          # 请求/响应 DTO（Java record）
│   ├── Dockerfile                       # Docker 构建
│   ├── k3s-deployment-prod.yaml         # K3s 部署配置
│   └── pom.xml                          # Maven 配置
├── numfeel-site/          # 前端 — 原生 HTML/CSS/JS + Chart.js
│   ├── pages/             # 演示页面（100+ 个互动演示）
│   ├── components/        # 公共组件
│   ├── images/            # 静态资源
│   ├── docs/              # 文档
│   └── index.html         # 首页
├── tests/                 # 回归测试脚本
├── temp/                  # 本地测试数据（.gitignore）
└── .github/workflows/     # CI/CD（GitHub Actions → K3s）
```

## 技术栈

### 后端（numfeel-service）
- **Java 17** + **Spring Boot 4** + **WebFlux**（Netty）
- **R2DBC MySQL** — 反应式数据库访问
- **Bucket4j + Caffeine** — IP 级别限流（1000次/分钟全局，写接口按路由分桶）
- **MaxMind GeoIP2** — IP 地理位置查询
- **Jieba** — 中文分词（词云）
- **Datafaker** — 假数据生成
- **Docker** + **K3s**（阿里云香港）

### 前端（numfeel-site）
- 原生 HTML/CSS/JavaScript + Chart.js
- 无需构建工具，纯静态部署

## 后端 API 接口

| 分类 | 接口 | 说明 |
|------|------|------|
| 数据生成 | `GET /mock?n=` | 假数据生成（200-1,000,000 条） |
| | `GET /chinese-names?n=` | 中文名生成（1-100,000 个） |
| 词云 | `GET /word-cloud[?search=]` | 词云数据 / 单词搜索 |
| 量子随机数 | `GET /quantum/numbers` | ANU 量子随机数（失败降级伪随机） |
| | `GET /quantum/available` | 上游量子 API 可用量查询 |
| 指纹 | `POST /fingerprint/collect` | 浏览器指纹采集 |
| | `GET /fingerprint/stats` | 指纹统计 |
| 统计代理 | `GET\|POST /stats` | 上游统计数据代理 |
| 文档追踪 | `GET /doc-track/pixel` | 追踪像素 |
| | `GET /doc-track/events` | 追踪事件 |
| 游戏统计 | `POST /xxx/submit` `GET /xxx/stats` | 21 个游戏/实验的统计接口 |
| 排行榜 | `GET /xxx/leaderboard` | 记忆力挑战、推理、时间感知、级联故障 |

## 本地开发

### 后端

```bash
cd numfeel-service

# 构建
./mvnw clean package -Dmaven.test.skip=true

# 运行（需要设置环境变量）
MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=xxx MYSQL_DB=demomockserver \
  ./mvnw spring-boot:run -Dspring-boot.run.profiles=dev

# 测试
./mvnw test
```

### 前端

```bash
# 直接用浏览器打开 numfeel-site/index.html
# 或使用任意 HTTP 服务器
cd numfeel-site && python3 -m http.server 3000
```

## 部署

推送 main 分支自动触发 GitHub Actions：
1. 构建 `numfeel-service/` 下的 Spring Boot 项目
2. 打包 Docker 镜像并推送到阿里云容器仓库
3. 通过 kubectl 更新 K3s 集群

所需 K3s Secret：
```bash
kubectl create secret generic mysql-secret \
  --namespace runnable-run \
  --from-literal=host=<host> \
  --from-literal=port=3306 \
  --from-literal=db=<db> \
  --from-literal=user=<user> \
  --from-literal=password=<password>

kubectl create secret generic ninja-api-secret \
  --namespace runnable-run \
  --from-literal=token=<api-token>
```

## 作者

**知乎：** [@Asher](https://www.zhihu.com/people/han-ming-45-96)

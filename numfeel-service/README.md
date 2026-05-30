# numfeel-service

Numfeel 后端服务 — 从 Vert.x 迁移至 Spring Boot WebFlux。

## 技术栈

- **Java 17**、**Spring Boot 4**、**WebFlux**（Netty）
- **R2DBC MySQL**（`io.asyncer:r2dbc-mysql`）反应式数据库访问
- **Bucket4j** — IP 级别限流
- **Caffeine** — 本地缓存（限流桶、文档追踪、词云）
- **Jieba** — 中文分词（词云）
- **Datafaker** — 假数据生成

## 构建

```bash
./mvnw clean package -Dmaven.test.skip=true
```

## 运行

```bash
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev
```

## 必需环境变量

| 变量               | 说明             | 默认值         |
|--------------------|------------------|----------------|
| `MYSQL_HOST`       | MySQL 主机地址   | `localhost`    |
| `MYSQL_PORT`       | MySQL 端口       | `3306`         |
| `MYSQL_USER`       | MySQL 用户名     | `root`         |
| `MYSQL_PASSWORD`   | MySQL 密码       |（空）          |
| `MYSQL_DB`         | 数据库名         | `demomockserver` |
| `NINJA_API_TOKEN`  | 上游统计 API 令牌 |（空）          |

## 项目结构

```
src/main/java/run/runnable/numfeelservice/
├── NumfeelServiceApplication.java      # 入口
├── config/                             # SchemaInitializer、WebClientConfig
├── controller/                         # REST 控制器（薄层，委托给 Service）
│   └── dto/                            # 请求/响应 DTO（Java record + Javadoc）
├── generator/                          # FakeDataGenerator、ChineseNameGenerator
├── model/                              # R2DBC 实体（表映射 record）
├── service/                            # 业务逻辑层
└── web/                                # ApiResponse、ApiException、RateLimitWebFilter、GlobalExceptionHandler
```

## 测试

```bash
./mvnw test
```

测试类遵循 `*Test.java` 命名规范，位于 `src/test/java/`。

## 架构要点

- **全链路反应式**：所有 I/O 非阻塞，基于 Reactor `Mono`/`Flux`。阻塞操作通过 `Schedulers.boundedElastic()` 脱离事件循环。
- **统一 API 响应**：`ApiResponse.ok(data)` → `{"status":200,"data":...}`，`ApiResponse.error(status, msg)` → `{"status":xxx,"message":"..."}`。
- **限流**：基于 IP，规则统一在 `RateLimitWebFilter` 中定义，Bucket4j + Caffeine 实现。
- **表结构初始化**：启动时通过 `SchemaInitializer` 从 `schema.sql` 尽力执行 DDL（失败不阻断服务，与旧版 Vert.x 行为一致）。
- **数据库查询**：聚合/统计类优先使用 `DatabaseClient` 原生 SQL；避免 `selectAll()` + Java stream 内存过滤。简单 CRUD 使用 `R2dbcEntityTemplate`。
- **DTO 使用 record**：所有请求/响应 DTO 均为 Java record，每个字段带 Javadoc。

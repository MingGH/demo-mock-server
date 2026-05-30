# numfeel-service

Numfeel backend — Spring Boot WebFlux migration from Vert.x.

## Tech Stack

- **Java 17**, **Spring Boot 4**, **WebFlux** (Netty)
- **R2DBC MySQL** (`io.asyncer:r2dbc-mysql`) for reactive database access
- **Bucket4j** for IP-based rate limiting
- **Caffeine** for in-memory caching (rate limit buckets, doc-tracking, word cloud)
- **MaxMind GeoIP2** for IP geolocation
- **Jieba** for Chinese word segmentation (word cloud)
- **Datafaker** for mock data generation

## Build

```bash
./mvnw clean package -Dmaven.test.skip=true
```

## Run

```bash
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev
```

## Required Environment Variables

| Variable           | Description                     | Default      |
|--------------------|---------------------------------|--------------|
| `MYSQL_HOST`       | MySQL host                      | `localhost`  |
| `MYSQL_PORT`       | MySQL port                      | `3306`       |
| `MYSQL_USER`       | MySQL username                  | `root`       |
| `MYSQL_PASSWORD`   | MySQL password                  | (empty)      |
| `MYSQL_DB`         | MySQL database name             | `demomockserver` |
| `NINJA_API_TOKEN`  | Upstream stats API token        | (empty)      |

## Project Structure

```
src/main/java/run/runnable/numfeelservice/
├── NumfeelServiceApplication.java      # Entry point
├── config/                             # SchemaInitializer, WebClientConfig
├── controller/                         # REST controllers (thin, delegates to services)
│   └── dto/                            # Request/response records with Javadoc
├── generator/                          # FakeDataGenerator, ChineseNameGenerator
├── model/                              # R2DBC entity records (table mappings)
├── service/                            # Business logic layer
└── web/                                # ApiResponse, ApiException, RateLimitWebFilter, GlobalExceptionHandler
```

## Tests

```bash
./mvnw test
```

Test classes follow the `*Test.java` naming convention under `src/test/java/`.

## Architecture Notes

- **Reactive by default**: All I/O is non-blocking via Reactor `Mono`/`Flux`. Blocking operations are offloaded to `Schedulers.boundedElastic()`.
- **Consistent API responses**: `ApiResponse.ok(data)` → `{"status":200,"data":...}`, `ApiResponse.error(status, msg)` → `{"status":xxx,"message":"..."}`.
- **Rate limiting**: Per-IP, defined in `RateLimitWebFilter` via Bucket4j with Caffeine-backed bucket storage.
- **Schema init**: Best-effort DDL executed on startup via `SchemaInitializer` from `schema.sql` (non-fatal, mirrors old Vert.x behavior).
- **Database queries**: Prefer raw SQL via `DatabaseClient` for aggregations; avoid `selectAll()` + Java stream filtering where SQL is more appropriate.
- **DTOs as records**: All request/response DTOs are Java records with Javadoc on each field.

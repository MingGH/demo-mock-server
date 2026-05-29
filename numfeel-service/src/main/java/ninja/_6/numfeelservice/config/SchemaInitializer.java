package ninja._6.numfeelservice.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.io.ClassPathResource;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * 启动时执行 {@code schema.sql} 建表（迁移自旧版各 Service 的 initTable）。
 * <p>
 * 逐条执行每个 CREATE 语句（IF NOT EXISTS，可重复执行），单条失败仅记录告警、不影响其他语句，
 * 也不阻断服务启动——与旧版 best-effort 行为一致，但相比 ResourceDatabasePopulator
 * 能清楚地看到是哪一条语句失败。
 */
@Component
public class SchemaInitializer {

    private static final Logger log = LoggerFactory.getLogger(SchemaInitializer.class);

    private final DatabaseClient db;

    public SchemaInitializer(DatabaseClient db) {
        this.db = db;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void initSchema() {
        List<String> statements;
        try {
            statements = loadStatements();
        } catch (IOException e) {
            log.warn("Cannot read schema.sql, skip schema init: {}", e.getMessage());
            return;
        }

        Flux.fromIterable(statements)
                .concatMap(sql -> db.sql(sql).fetch().rowsUpdated()
                        .doOnError(err -> log.warn("DDL failed [{}]: {}", tableOf(sql), err.getMessage()))
                        .onErrorResume(err -> reactor.core.publisher.Mono.empty()))
                .then()
                .doOnSuccess(v -> log.info("Database schema initialized"))
                .doOnError(err -> log.warn("Schema init failed (service continues): {}", err.getMessage()))
                .onErrorComplete()
                .subscribe();
    }

    /** 读取 schema.sql，去掉注释行后按分号拆分为单条语句。 */
    private List<String> loadStatements() throws IOException {
        String raw;
        try (var in = new ClassPathResource("schema.sql").getInputStream()) {
            raw = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
        StringBuilder sb = new StringBuilder();
        for (String line : raw.split("\n")) {
            String trimmed = line.trim();
            if (trimmed.startsWith("--") || trimmed.isEmpty()) {
                continue;
            }
            sb.append(line).append('\n');
        }
        List<String> statements = new ArrayList<>();
        for (String stmt : sb.toString().split(";")) {
            String s = stmt.trim();
            if (!s.isEmpty()) {
                statements.add(s);
            }
        }
        return statements;
    }

    /** 从 CREATE TABLE 语句里提取表名，仅用于日志。 */
    private String tableOf(String sql) {
        String lower = sql.toLowerCase();
        int idx = lower.indexOf("exists");
        if (idx < 0) idx = lower.indexOf("table");
        if (idx < 0) return "?";
        String rest = sql.substring(idx).replaceFirst("(?i)exists", "").trim();
        rest = rest.replaceFirst("(?i)table", "").trim();
        int sp = 0;
        while (sp < rest.length() && (Character.isLetterOrDigit(rest.charAt(sp)) || rest.charAt(sp) == '_')) {
            sp++;
        }
        return sp > 0 ? rest.substring(0, sp) : "?";
    }
}

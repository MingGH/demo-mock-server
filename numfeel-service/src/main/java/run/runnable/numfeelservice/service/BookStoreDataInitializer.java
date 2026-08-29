package run.runnable.numfeelservice.service;

import lombok.extern.slf4j.Slf4j;
import net.datafaker.Faker;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * REST vs GraphQL 对比实验的数据初始化器。
 * <p>
 * 启动后向 {@code bookstore_authors / bookstore_books / bookstore_reviews} 三张表
 * 幂等地灌入模拟图书电商数据（200 位作者、10,000 本书、约 3 万条书评）。
 * 任一表数量低于目标值时，先 TRUNCATE 三张表再整体重建，保证外键关系一致。
 * <p>
 * 自身先执行 CREATE TABLE IF NOT EXISTS，避免与 {@code SchemaInitializer} 的执行顺序竞争。
 */
@Slf4j
@Component
public class BookStoreDataInitializer {

    /** 作者数量 */
    static final int AUTHOR_COUNT = 200;

    /** 图书数量（知乎问题演示的核心规模：一万条数据） */
    static final int BOOK_COUNT = 10_000;

    /** 每本书书评数上限（0~5 条，平均约 2.5 条，总量约 2.5~3 万） */
    private static final int REVIEWS_PER_BOOK_MAX = 5;

    /** 每批插入的行数（控制单条 SQL 占位符数量） */
    private static final int BATCH_SIZE = 500;

    private static final Faker CN = new Faker(Locale.CHINA);
    private static final Faker EN = new Faker(Locale.ENGLISH);

    private static final String[] COUNTRIES = {
            "中国", "美国", "英国", "日本", "法国", "德国", "俄罗斯", "加拿大", "澳大利亚", "印度"
    };

    private static final String[] CATEGORIES = {
            "科幻", "历史", "文学", "心理学", "经济学", "科普", "推理", "生活", "艺术", "哲学"
    };

    private static final String[] SUBJECTS = {
            "量子力学", "深度学习", "时间简史", "星际航行", "人类简史", "宋词选注", "昆虫记",
            "敦煌壁画", "葡萄酒", "咖啡烘焙", "围棋死活", "城市地图", "失落的文明", "太空电梯",
            "区块链", "神经科学", "古典音乐", "刑侦档案", "荒野生存", "深海探索", "人工智能",
            "拓扑学", "气象学", "考古笔记", "机器人", "疫苗", "数学之美", "宇宙尘埃",
            "密码学", "烹饪科学", "梦的解析", "大运河", "雨林生态", "晶体管", "光速旅行", "古罗马"
    };

    private static final String[] MODIFIERS = {
            "", "新编", "图解", "微型", "终极", "袖珍", "剑桥", "牛津", "深夜", "荒野"
    };

    private static final String[] FORMS = {
            "导论", "简史", "指南", "笔记", "之谜", "全集", "入门", "十二讲", "研究", "漫谈",
            "图鉴", "手册", "沉思录", "导览", "读本"
    };

    private static final String[] DESC_SENTENCES = {
            "这本书从最基础的概念讲起，逐步推进到前沿问题，读起来毫无断档感。",
            "作者用大量一手案例替代了枯燥的公式推导，适合零基础读者入门。",
            "第三部分的实验设计尤其精彩，读完让人忍不住想亲自验证一遍。",
            "如果你只读一章，建议读第七章，它几乎浓缩了全书的方法论。",
            "译文流畅，术语统一，是国内译者少见的用心之作。",
            "每一章末尾的延伸阅读清单非常扎实，按图索骥能省下大量时间。",
            "数据和图表都标注了出处，可以追溯到原始论文，可信度很高。",
            "装帧和排版在线下书店同价位里几乎找不到对手。",
            "几位一线从业者撰写的附录，比正文还值回书价。",
            "一口气读完花了一个周末，信息密度大但节奏控制得很好。",
            "书里对争议话题的处理很克制，摆事实而不站队。",
            "适合作为教材，也适合作为案头随时翻开的工具书。",
            "开篇三章稍显啰嗦，坚持读下去会发现后面的展开非常值得。",
            "不少读者把它当作入门书，其实它更适合读过一两本同类书之后再来复盘。",
            "作者在结尾留下的开放问题，至今仍是这个领域最活跃的研究方向。"
    };

    private static final String[] BIO_TEMPLATES = {
            "%s 年生于%s，长年专注于%s领域的研究与写作。",
            "%s 年生于%s，曾是%s方向的一线从业者，后转入写作。",
            "生于%s的%s作家，作品被译成十余种语言。",
            "%s 年生于%s，其著作多次获奖，现居乡间写作。",
            "生于%s，做过记者、编辑与程序员，最终成为%s领域的作家。"
    };

    private static final String[] REVIEW_TEMPLATES = {
            "一口气读完，强烈推荐给同好。",
            "排版很好，内容稍微有点浅，入门足够了。",
            "第三章的案例太精彩，值得反复读。",
            "比想象中厚，但读起来完全不累。",
            "快递很快，书有塑封，五星。",
            "作者很克制，没有贩卖焦虑，好评。",
            "翻译腔有点重，扣一星。",
            "豆瓣评分虚高了，实际三星半。",
            "数据都给了出处，这种态度值得五星。",
            "读了一半放下了，等有空再捡起来。",
            "作为工具书放在案头非常合适。",
            "结尾有点仓促，像是被截断了。",
            "纸张和印刷都很舒服，阅读体验加分。",
            "朋友推荐买的，没有让我失望。",
            "适合入门后再读，直接读会有点懵。",
            "每年重读一遍，常读常新。",
            "电子版做了超链接注释，比纸书方便。",
            "贵是贵了点，但值。"
    };

    private final DatabaseClient db;

    /** 数据是否已就绪（初始化完成前查询接口返回 503，避免撞上重建窗口的瞬时错误）。 */
    private final java.util.concurrent.atomic.AtomicBoolean dataReady =
            new java.util.concurrent.atomic.AtomicBoolean(false);

    public BookStoreDataInitializer(DatabaseClient db) {
        this.db = db;
    }

    /**
     * 应用启动后执行：建表（幂等）-> 数量检查 -> 不足则重建数据。
     */
    @EventListener(ApplicationReadyEvent.class)
    public void init() {
        createTables()
                .then(countAll())
                .flatMap(counts -> {
                    if (counts[0] >= AUTHOR_COUNT && counts[1] >= BOOK_COUNT && counts[2] > 0) {
                        log.info("BookStore data ready: {} authors, {} books, {} reviews",
                                counts[0], counts[1], counts[2]);
                        return Mono.empty();
                    }
                    return truncateAll()
                            .then(seedAuthors())
                            .then(seedBooks())
                            .then(seedReviews())
                            .then(countAll())
                            .doOnNext(fresh -> log.info(
                                    "BookStore data seeded: {} authors, {} books, {} reviews",
                                    fresh[0], fresh[1], fresh[2]));
                })
                .doOnSuccess(v -> dataReady.set(true))
                .doOnError(e -> log.warn("BookStore data init failed (service continues): {}", e.getMessage()))
                .onErrorComplete()
                .subscribe();
    }

    /**
     * 数据是否已就绪。
     *
     * @return true 表示三表数据已初始化完成，可安全查询
     */
    public boolean isReady() {
        return dataReady.get();
    }

    /**
     * 执行本模块三张表的 CREATE TABLE IF NOT EXISTS，不依赖 SchemaInitializer 的完成时机。
     *
     * @return 完成信号
     */
    private Mono<Void> createTables() {
        return Mono.fromCallable(() -> List.of(
                "CREATE TABLE IF NOT EXISTS bookstore_authors (\n" +
                        "    id         INT AUTO_INCREMENT PRIMARY KEY,\n" +
                        "    name       VARCHAR(64)  NOT NULL COMMENT '作者姓名',\n" +
                        "    country    VARCHAR(32)  NOT NULL COMMENT '国籍',\n" +
                        "    birth_year SMALLINT     NOT NULL COMMENT '出生年份',\n" +
                        "    bio        VARCHAR(512) NOT NULL COMMENT '作者简介',\n" +
                        "    INDEX idx_bs_author_name (name)\n" +
                        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
                "CREATE TABLE IF NOT EXISTS bookstore_books (\n" +
                        "    id             INT AUTO_INCREMENT PRIMARY KEY,\n" +
                        "    title          VARCHAR(128) NOT NULL COMMENT '书名',\n" +
                        "    author_id      INT          NOT NULL COMMENT '作者 ID',\n" +
                        "    isbn           VARCHAR(20)  NOT NULL COMMENT 'ISBN 编号',\n" +
                        "    category       VARCHAR(32)  NOT NULL COMMENT '分类',\n" +
                        "    price          DOUBLE       NOT NULL COMMENT '售价（元）',\n" +
                        "    rating         DOUBLE       NOT NULL COMMENT '评分 1.0-5.0',\n" +
                        "    pages          SMALLINT     NOT NULL COMMENT '页数',\n" +
                        "    stock          INT          NOT NULL COMMENT '库存',\n" +
                        "    published_year SMALLINT     NOT NULL COMMENT '出版年份',\n" +
                        "    description    VARCHAR(512) NOT NULL COMMENT '图书简介',\n" +
                        "    INDEX idx_bs_book_author (author_id),\n" +
                        "    INDEX idx_bs_book_category (category)\n" +
                        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
                "CREATE TABLE IF NOT EXISTS bookstore_reviews (\n" +
                        "    id         BIGINT AUTO_INCREMENT PRIMARY KEY,\n" +
                        "    book_id    INT          NOT NULL COMMENT '书 ID',\n" +
                        "    rating     TINYINT      NOT NULL COMMENT '评分 1-5',\n" +
                        "    content    VARCHAR(256) NOT NULL COMMENT '评论内容',\n" +
                        "    reviewer   VARCHAR(64)  NOT NULL COMMENT '评论者昵称',\n" +
                        "    created_at BIGINT       NOT NULL COMMENT '评论时间戳（ms）',\n" +
                        "    INDEX idx_bs_review_book (book_id)\n" +
                        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"))
                .flatMapMany(Flux::fromIterable)
                .concatMap(sql -> db.sql(sql).fetch().rowsUpdated().onErrorResume(e -> Mono.empty()))
                .then();
    }

    /**
     * 统计三张表行数。
     *
     * @return {@code [authors, books, reviews]} 行数数组
     */
    private Mono<long[]> countAll() {
        return count("bookstore_authors")
                .zipWith(count("bookstore_books"))
                .zipWith(count("bookstore_reviews"))
                .map(t -> new long[]{t.getT1().getT1(), t.getT1().getT2(), t.getT2()});
    }

    /** 单表行数统计。 */
    private Mono<Long> count(String table) {
        return db.sql("SELECT COUNT(*) AS c FROM " + table)
                .map((row, meta) -> ((Number) row.get("c")).longValue())
                .first()
                .defaultIfEmpty(0L);
    }

    /** 清空三张表（仅启动时数据量不足的重建路径使用）。 */
    private Mono<Void> truncateAll() {
        return Flux.just("bookstore_reviews", "bookstore_books", "bookstore_authors")
                .concatMap(t -> db.sql("TRUNCATE TABLE " + t).fetch().rowsUpdated())
                .then();
    }

    /** 生成并批量写入 200 位作者。 */
    private Mono<Void> seedAuthors() {
        List<Object[]> rows = new ArrayList<>(AUTHOR_COUNT);
        for (int i = 0; i < AUTHOR_COUNT; i++) {
            String name = CN.name().fullName();
            String country = pick(COUNTRIES);
            int birthYear = 1920 + CN.random().nextInt(76);
            String subject = pick(SUBJECTS);
            String bio = String.format(pick(BIO_TEMPLATES), birthYear, country, subject);
            rows.add(new Object[]{name, country, birthYear, bio});
        }
        return insertBatches("bookstore_authors", "name, country, birth_year, bio", rows, 4);
    }

    /** 生成并批量写入 10,000 本书。 */
    private Mono<Void> seedBooks() {
        List<Object[]> rows = new ArrayList<>(BOOK_COUNT);
        for (int i = 0; i < BOOK_COUNT; i++) {
            int authorId = 1 + EN.random().nextInt(AUTHOR_COUNT);
            String title = randomTitle();
            String isbn = EN.code().isbn13();
            String category = pick(CATEGORIES);
            double price = Math.round((19 + EN.random().nextDouble() * 180) * 10.0) / 10.0;
            double rating = Math.round((1.0 + EN.random().nextDouble() * 4.0) * 10.0) / 10.0;
            int pages = 80 + EN.random().nextInt(720);
            int stock = EN.random().nextInt(500);
            int publishedYear = 1960 + EN.random().nextInt(66);
            String description = randomDescription();
            rows.add(new Object[]{title, authorId, isbn, category, price, rating, pages, stock, publishedYear, description});
        }
        return insertBatches("bookstore_books",
                "title, author_id, isbn, category, price, rating, pages, stock, published_year, description", rows, 10);
    }

    /** 为每本书生成 0~5 条书评并批量写入（总量约 2.5 万条）。 */
    private Mono<Void> seedReviews() {
        List<Object[]> rows = new ArrayList<>(BOOK_COUNT * 3);
        long now = System.currentTimeMillis();
        long twoYears = 2L * 365 * 24 * 3600 * 1000;
        for (int bookId = 1; bookId <= BOOK_COUNT; bookId++) {
            int reviewCount = EN.random().nextInt(REVIEWS_PER_BOOK_MAX + 1);
            for (int r = 0; r < reviewCount; r++) {
                long createdAt = now - (long) (EN.random().nextDouble() * twoYears);
                rows.add(new Object[]{
                        bookId,
                        1 + EN.random().nextInt(5),
                        pick(REVIEW_TEMPLATES),
                        CN.name().fullName(),
                        createdAt
                });
            }
        }
        return insertBatches("bookstore_reviews", "book_id, rating, content, reviewer, created_at", rows, 5);
    }

    /**
     * 分批构建多行 VALUES 的 INSERT 语句并执行。
     *
     * @param table   目标表名
     * @param columns 列名列表（逗号分隔）
     * @param rows    全部行数据，每行长度须等于列数
     * @param cols    列数
     * @return 完成信号
     */
    private Mono<Void> insertBatches(String table, String columns, List<Object[]> rows, int cols) {
        List<List<Object[]>> batches = new ArrayList<>();
        for (int i = 0; i < rows.size(); i += BATCH_SIZE) {
            batches.add(rows.subList(i, Math.min(i + BATCH_SIZE, rows.size())));
        }
        return Flux.fromIterable(batches)
                .concatMap(batch -> {
                    var spec = db.sql(buildInsertSql(table, columns, batch.size(), cols));
                    int idx = 0;
                    for (Object[] row : batch) {
                        for (int c = 0; c < cols; c++) {
                            spec = spec.bind(idx++, row[c]);
                        }
                    }
                    return spec.fetch().rowsUpdated();
                })
                .then();
    }

    /** 构建 {@code INSERT INTO t (...) VALUES (?,?,..),(?,?,..)} 形式的 SQL。 */
    private String buildInsertSql(String table, String columns, int rowCount, int cols) {
        StringBuilder sb = new StringBuilder("INSERT INTO ").append(table)
                .append(" (").append(columns).append(") VALUES ");
        for (int r = 0; r < rowCount; r++) {
            sb.append('(');
            for (int c = 0; c < cols; c++) {
                if (c > 0) {
                    sb.append(',');
                }
                sb.append('?');
            }
            sb.append(')');
            if (r < rowCount - 1) {
                sb.append(',');
            }
        }
        return sb.toString();
    }

    /** 随机取一个元素。 */
    private String pick(String[] arr) {
        return arr[EN.random().nextInt(arr.length)];
    }

    /** 组合式生成中文书名：主语 +（可选修饰词）+ 形态词。 */
    private String randomTitle() {
        String subject = pick(SUBJECTS);
        String modifier = pick(MODIFIERS);
        String form = pick(FORMS);
        return modifier.isEmpty() ? subject + form : modifier + subject + form;
    }

    /** 拼接 2~3 句简介。 */
    private String randomDescription() {
        int sentences = 2 + EN.random().nextInt(2);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < sentences; i++) {
            if (i > 0) {
                sb.append(' ');
            }
            sb.append(pick(DESC_SENTENCES));
        }
        return sb.toString();
    }
}

package run.runnable.numfeelservice.service;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.controller.dto.BookDetailDTO;
import run.runnable.numfeelservice.controller.dto.BookStoreStatusDTO;
import run.runnable.numfeelservice.controller.dto.CatalogItemDTO;
import run.runnable.numfeelservice.controller.dto.CatalogResponseDTO;
import run.runnable.numfeelservice.controller.dto.ReviewDTO;
import run.runnable.numfeelservice.web.ApiException;

import java.util.List;

/**
 * REST vs GraphQL 对比实验 — REST 侧业务逻辑。
 * <p>
 * 提供三种 REST 查询：
 * <ul>
 *   <li>完整套餐：返回书目全部字段（模拟通用 DTO 直接返回的 over-fetch）</li>
 *   <li>瘦身版：只返回页面核心字段（模拟认真设计后的 REST 同样可以省字节）</li>
 *   <li>单书详情 + 书评</li>
 * </ul>
 */
@Service
public class RestVsGraphqlService {

    private static final int MAX_LIMIT = 100;

    private final DatabaseClient db;
    private final BookStoreDataInitializer dataInitializer;

    public RestVsGraphqlService(DatabaseClient db, BookStoreDataInitializer dataInitializer) {
        this.db = db;
        this.dataInitializer = dataInitializer;
    }

    /**
     * 查询书目录。{@code full=true} 返回完整字段，{@code full=false} 返回瘦身字段。
     *
     * @param full  是否完整模式
     * @param limit 返回条数（上限 {@link #MAX_LIMIT}）
     * @return 目录响应，含服务端耗时与 SQL 次数
     */
    public Mono<CatalogResponseDTO> catalog(boolean full, int limit) {
        if (!dataInitializer.isReady()) {
            return Mono.error(new ApiException(503, "图书数据仍在初始化，请稍后重试"));
        }
        int n = Math.max(1, Math.min(limit, MAX_LIMIT));
        String columns = full
                ? "b.id, b.title, a.name AS author, b.isbn, b.category, b.price, b.rating, "
                        + "b.pages, b.stock, b.published_year, b.description"
                : "b.id, b.title, a.name AS author, b.price, b.rating";
        String sql = "SELECT " + columns + " FROM bookstore_books b "
                + "JOIN bookstore_authors a ON a.id = b.author_id "
                + "ORDER BY b.rating DESC, b.id LIMIT :limit";

        long start = System.nanoTime();
        return db.sql(sql).bind("limit", n)
                .map((row, meta) -> toCatalogItem(full, row))
                .all()
                .collectList()
                .map(items -> {
                    long elapsedMs = (System.nanoTime() - start) / 1_000_000;
                    return new CatalogResponseDTO(items.size(), items, elapsedMs, 1);
                });
    }

    /**
     * 查询单书详情及其书评（书评最多返回 10 条）。
     *
     * @param id 书 ID
     * @return 书详情 DTO；书不存在时抛出 404
     */
    public Mono<BookDetailDTO> book(int id) {
        if (!dataInitializer.isReady()) {
            return Mono.error(new ApiException(503, "图书数据仍在初始化，请稍后重试"));
        }
        if (id <= 0) {
            return Mono.error(ApiException.badRequest("无效的书 ID"));
        }
        String bookSql = "SELECT b.id, b.title, a.name AS author, b.isbn, b.category, b.price, b.rating, "
                + "b.pages, b.stock, b.published_year, b.description "
                + "FROM bookstore_books b JOIN bookstore_authors a ON a.id = b.author_id WHERE b.id = :id";

        return db.sql(bookSql).bind("id", id)
                .map((row, meta) -> toCatalogItem(true, row))
                .one()
                .switchIfEmpty(Mono.error(new ApiException(404, "书不存在")))
                .flatMap(book -> db.sql("SELECT id, rating, content, reviewer, created_at "
                                + "FROM bookstore_reviews WHERE book_id = :bookId ORDER BY created_at DESC LIMIT 10")
                        .bind("bookId", id)
                        .map((row, meta) -> new ReviewDTO(
                                ((Number) row.get("id")).longValue(),
                                ((Number) row.get("rating")).intValue(),
                                row.get("content", String.class),
                                row.get("reviewer", String.class),
                                ((Number) row.get("created_at")).longValue()))
                        .all()
                        .collectList()
                        .map(reviews -> new BookDetailDTO(book, reviews)));
    }

    /**
     * 查询数据集初始化状态。
     *
     * @return 三表行数与数据是否就绪
     */
    public Mono<BookStoreStatusDTO> status() {
        return count("bookstore_authors")
                .zipWith(count("bookstore_books"))
                .zipWith(count("bookstore_reviews"))
                .map(t -> new BookStoreStatusDTO(
                        t.getT1().getT1() >= BookStoreDataInitializer.AUTHOR_COUNT
                                && t.getT1().getT2() >= BookStoreDataInitializer.BOOK_COUNT,
                        t.getT1().getT1(),
                        t.getT1().getT2(),
                        t.getT2()));
    }

    /** 单表行数统计。 */
    private Mono<Long> count(String table) {
        return db.sql("SELECT COUNT(*) AS c FROM " + table)
                .map((row, meta) -> ((Number) row.get("c")).longValue())
                .first()
                .defaultIfEmpty(0L);
    }

    /** 从查询行构造目录条目 DTO。 */
    private CatalogItemDTO toCatalogItem(boolean full, io.r2dbc.spi.Row row) {
        if (full) {
            return new CatalogItemDTO(
                    ((Number) row.get("id")).intValue(),
                    row.get("title", String.class),
                    row.get("author", String.class),
                    row.get("isbn", String.class),
                    row.get("category", String.class),
                    ((Number) row.get("price")).doubleValue(),
                    ((Number) row.get("rating")).doubleValue(),
                    ((Number) row.get("pages")).intValue(),
                    ((Number) row.get("stock")).intValue(),
                    ((Number) row.get("published_year")).intValue(),
                    row.get("description", String.class));
        }
        return new CatalogItemDTO(
                ((Number) row.get("id")).intValue(),
                row.get("title", String.class),
                row.get("author", String.class),
                null, null,
                ((Number) row.get("price")).doubleValue(),
                ((Number) row.get("rating")).doubleValue(),
                null, null, null, null);
    }
}
package run.runnable.numfeelservice.service;

import graphql.schema.DataFetchingEnvironment;
import graphql.schema.DataFetchingFieldSelectionSet;
import graphql.schema.SelectedField;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.web.ApiException;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * REST vs GraphQL 对比实验 — GraphQL 侧业务逻辑。
 * <p>
 * 采用"单个查询入口 + 根据客户端请求的字段选择（selection set）决定是否联查作者/书评"的实现。
 * 客户端请求的嵌套越深，服务端实际执行的 DB 查询次数（{@code dbCalls}）就越多——即 N+1 查询成本，
 * 正是"GraphQL 单端点的服务端成本不可控"这一结论的具象化：
 * <ul>
 *   <li>只请求 {@code price/title} 等标量 → 1 次 SQL</li>
 *   <li>追加 {@code author} → 每本书再查 1 次作者（1+N）</li>
 *   <li>追加 {@code reviews} → 每本书再查 1 次书评（1+N+N'）</li>
 * </ul>
 * 真实成本通过 {@link CostMeta} 暴露给前端，与 REST 恒为 1 次 SQL 形成对比。
 */
@Service
public class BookGraphqlService {

    private static final int MAX_LIMIT = 100;
    private static final int MAX_REVIEWS_PER_BOOK = 5;

    private final DatabaseClient db;
    private final BookStoreDataInitializer dataInitializer;

    public BookGraphqlService(DatabaseClient db, BookStoreDataInitializer dataInitializer) {
        this.db = db;
        this.dataInitializer = dataInitializer;
    }

    /**
     * 解析一次 GraphQL 查询：先取书目，再按 selection set 决定是否联查作者/书评，统计真实 DB 成本。
     *
     * @param env   GraphQL 执行环境（用于读取字段选择）
     * @param limit 客户端请求的 limit（null 时取默认 10）
     * @return 查询结果（书列表 + 成本元信息）
     */
    public Mono<BookListResult> query(DataFetchingEnvironment env, Integer limit) {
        if (!dataInitializer.isReady()) {
            return Mono.error(new ApiException(503, "图书数据仍在初始化，请稍后重试"));
        }
        int n = clamp(limit != null ? limit : 10);
        DataFetchingFieldSelectionSet booksSelection = booksSelection(env);
        boolean needAuthor = contains(booksSelection, "author");
        boolean needReviews = contains(booksSelection, "reviews");

        long start = System.nanoTime();
        AtomicInteger dbCalls = new AtomicInteger(0);
        AtomicInteger rowsLoaded = new AtomicInteger(0);

        return loadBooks(n, dbCalls, rowsLoaded)
                .flatMap(books -> Flux.fromIterable(books)
                        .concatMap(book -> enrich(book, needAuthor, needReviews, dbCalls, rowsLoaded))
                        .collectList())
                .map(books -> new BookListResult(books, new CostMeta(
                        dbCalls.get(), rowsLoaded.get(), (int) ((System.nanoTime() - start) / 1_000_000))));
    }

    /** 按需为单本书联查作者与书评，模拟 N+1。 */
    private Mono<BookData> enrich(BookData book, boolean needAuthor, boolean needReviews,
                                  AtomicInteger dbCalls, AtomicInteger rowsLoaded) {
        Mono<BookData> result = Mono.just(book);
        if (needAuthor) {
            result = result.flatMap(b -> loadAuthor(b, dbCalls, rowsLoaded));
        }
        if (needReviews) {
            result = result.flatMap(b -> loadReviews(b, dbCalls, rowsLoaded));
        }
        return result;
    }

    /** 加载某位作者（逐条 SQL，模拟 N+1）。 */
    private Mono<BookData> loadAuthor(BookData book, AtomicInteger dbCalls, AtomicInteger rowsLoaded) {
        dbCalls.incrementAndGet();
        return db.sql("SELECT id, name, country, bio FROM bookstore_authors WHERE id = :id")
                .bind("id", book.authorId())
                .map((row, meta) -> new AuthorData(
                        ((Number) row.get("id")).intValue(),
                        row.get("name", String.class),
                        row.get("country", String.class),
                        row.get("bio", String.class)))
                .one()
                .map(author -> {
                    rowsLoaded.incrementAndGet();
                    return rebuild(book, author, book.reviews());
                })
                .defaultIfEmpty(rebuild(book, null, book.reviews()));
    }

    /** 加载某本书的书评（逐条 SQL，模拟 N+1）。 */
    private Mono<BookData> loadReviews(BookData book, AtomicInteger dbCalls, AtomicInteger rowsLoaded) {
        dbCalls.incrementAndGet();
        return db.sql("SELECT id, rating, content, reviewer FROM bookstore_reviews "
                        + "WHERE book_id = :bookId ORDER BY created_at DESC LIMIT :limit")
                .bind("bookId", book.id())
                .bind("limit", MAX_REVIEWS_PER_BOOK)
                .map((row, meta) -> new BookReviewData(
                        ((Number) row.get("id")).intValue(),
                        ((Number) row.get("rating")).intValue(),
                        row.get("content", String.class),
                        row.get("reviewer", String.class)))
                .all()
                .collectList()
                .map(reviews -> {
                    rowsLoaded.addAndGet(reviews.size());
                    return rebuild(book, book.author(), reviews);
                });
    }

    /** 用已填充的作者 + 书评重建一本书节点。 */
    private BookData rebuild(BookData book, AuthorData author, List<BookReviewData> reviews) {
        return new BookData(book.id(), book.title(), book.authorId(), author, book.isbn(), book.category(),
                book.price(), book.rating(), book.pages(), book.stock(), book.publishedYear(),
                book.description(), reviews);
    }

    /** 查询基础书单（不含作者/书评，1 条 SQL，按评分倒序）。 */
    private Mono<List<BookData>> loadBooks(int limit, AtomicInteger dbCalls, AtomicInteger rowsLoaded) {
        dbCalls.incrementAndGet();
        return db.sql("SELECT b.id, b.title, b.author_id, b.isbn, b.category, b.price, b.rating, "
                        + "b.pages, b.stock, b.published_year, b.description "
                        + "FROM bookstore_books b ORDER BY b.rating DESC, b.id LIMIT :limit")
                .bind("limit", limit)
                .map((row, meta) -> new BookData(
                        ((Number) row.get("id")).intValue(),
                        row.get("title", String.class),
                        ((Number) row.get("author_id")).intValue(),
                        null,
                        row.get("isbn", String.class),
                        row.get("category", String.class),
                        ((Number) row.get("price")).doubleValue(),
                        ((Number) row.get("rating")).doubleValue(),
                        ((Number) row.get("pages")).intValue(),
                        ((Number) row.get("stock")).intValue(),
                        ((Number) row.get("published_year")).intValue(),
                        row.get("description", String.class),
                        new ArrayList<>()))
                .all()
                .collectList()
                .map(books -> {
                    rowsLoaded.addAndGet(books.size());
                    return books;
                });
    }

    /** 钳制 limit。 */
    private int clamp(int limit) {
        return Math.max(1, Math.min(limit, MAX_LIMIT));
    }

    /** 检测 selection set 中是否请求了某字段。 */
    private boolean contains(DataFetchingFieldSelectionSet sel, String field) {
        return sel != null && sel.contains(field);
    }

    /** 提取内层 books（Book 列表）字段的子选择集，用于检测 author/reviews 是否被请求。 */
    private DataFetchingFieldSelectionSet booksSelection(DataFetchingEnvironment env) {
        List<SelectedField> inner = env.getSelectionSet().getFields("books");
        if (inner != null && !inner.isEmpty() && inner.get(0).getSelectionSet() != null) {
            return inner.get(0).getSelectionSet();
        }
        return env.getSelectionSet();
    }

    // ── GraphQL 返回模型 ──

    /** books 查询的包装结果（含成本元信息）。 */
    public record BookListResult(List<BookData> books, CostMeta meta) {
    }

    /** 一次查询的成本信息。 */
    public record CostMeta(int dbCalls, int rowsLoaded, int elapsedMs) {
    }

    /** 书节点；author/reviews 仅在客户端请求时才被填充。 */
    public record BookData(
            Integer id,
            String title,
            Integer authorId,
            AuthorData author,
            String isbn,
            String category,
            Double price,
            Double rating,
            Integer pages,
            Integer stock,
            Integer publishedYear,
            String description,
            List<BookReviewData> reviews) {
    }

    /** 作者节点。 */
    public record AuthorData(Integer id, String name, String country, String bio) {
    }

    /** 书评节点。 */
    public record BookReviewData(Integer id, Integer rating, String content, String reviewer) {
    }
}
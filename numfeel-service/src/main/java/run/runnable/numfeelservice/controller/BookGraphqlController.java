package run.runnable.numfeelservice.controller;

import graphql.schema.DataFetchingEnvironment;
import org.springframework.graphql.data.method.annotation.Argument;
import org.springframework.graphql.data.method.annotation.QueryMapping;
import org.springframework.stereotype.Controller;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.service.BookGraphqlService;

/**
 * REST vs GraphQL 对比实验 - GraphQL 控制器。
 * <p>
 * 通过 Spring for GraphQL 的注解控制器暴露 {@code POST /graphql} 单端点。
 * 客户端在 query 里自行选择字段（精确取数）与嵌套深度（成本爆炸），
 * 服务端真实成本经 {@code meta} 字段随响应返回。
 */
@Controller
public class BookGraphqlController {

    private final BookGraphqlService service;

    public BookGraphqlController(BookGraphqlService service) {
        this.service = service;
    }

    /**
     * {@code Query.books(limit)} 入口：按客户端字段选择解析查询。
     *
     * @param limit 返回书目条数（缺省 10，服务端钳制在 1~100）
     * @param env   GraphQL 执行环境，用于读取 selection set
     * @return 书列表 + 成本元信息
     */
    @QueryMapping
    public Mono<BookGraphqlService.BookListResult> books(
            @Argument Integer limit, DataFetchingEnvironment env) {
        return service.query(env, limit);
    }
}
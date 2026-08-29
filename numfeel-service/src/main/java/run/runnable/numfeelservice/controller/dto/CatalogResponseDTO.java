package run.runnable.numfeelservice.controller.dto;

import java.util.List;

/**
 * 书目录列表响应 DTO。
 *
 * @param count     返回条目数
 * @param items     目录条目
 * @param elapsedMs 服务端处理耗时（毫秒），用于对比 REST / GraphQL 的服务端成本
 * @param sqlCalls  本次请求执行的 SQL 次数（REST 恒为 1）
 */
public record CatalogResponseDTO(
        int count,
        List<CatalogItemDTO> items,
        long elapsedMs,
        int sqlCalls
) {
}
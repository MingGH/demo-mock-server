package run.runnable.numfeelservice.controller.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * 书目录条目 DTO。
 * <p>
 * 用于 REST 三端点对比：{@code 完整套餐} 返回全部字段（含 isbn / category / pages / stock /
 * publishedYear / description 等重量字段），而 {@code 瘦身版} 仅保留页面真正需要的核心字段，
 * 其余字段置 null 并由 {@code @JsonInclude(NON_NULL)} 剔除，从而在响应体层面演示 over-fetch 的字节浪费。
 */
public record CatalogItemDTO(
        int id,
        String title,
        String author,

        @JsonInclude(JsonInclude.Include.NON_NULL) String isbn,
        @JsonInclude(JsonInclude.Include.NON_NULL) String category,
        double price,
        double rating,
        @JsonInclude(JsonInclude.Include.NON_NULL) Integer pages,
        @JsonInclude(JsonInclude.Include.NON_NULL) Integer stock,
        @JsonInclude(JsonInclude.Include.NON_NULL) Integer publishedYear,
        @JsonInclude(JsonInclude.Include.NON_NULL) String description
) {
}
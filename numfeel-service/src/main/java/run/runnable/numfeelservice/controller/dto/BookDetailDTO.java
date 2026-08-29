package run.runnable.numfeelservice.controller.dto;

import java.util.List;

/**
 * 单书详情 DTO，含该书书评列表。
 */
public record BookDetailDTO(
        CatalogItemDTO book,
        List<ReviewDTO> reviews
) {
}
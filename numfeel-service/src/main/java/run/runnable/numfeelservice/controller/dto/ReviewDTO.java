package run.runnable.numfeelservice.controller.dto;

/**
 * 书评 DTO。
 */
public record ReviewDTO(
        long id,
        int rating,
        String content,
        String reviewer,
        long createdAt
) {
}
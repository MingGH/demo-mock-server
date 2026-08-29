package run.runnable.numfeelservice.controller.dto;

/**
 * 图书数据集初始化状态 DTO。
 */
public record BookStoreStatusDTO(
        boolean dataReady,
        long authors,
        long books,
        long reviews
) {
}
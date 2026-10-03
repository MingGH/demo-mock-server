package run.runnable.numfeelservice.controller.dto;

/**
 * UUID 碰撞实验的接口请求模型。
 */
public final class UuidCollisionRequests {

    private UuidCollisionRequests() {
    }

    /**
     * 现场追加请求。
     *
     * @param count 生成数量；只允许 1000 / 10000 / 100000
     */
    public record AppendRequest(Integer count) {
    }
}

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

    /**
     * 查询某个 UUID 是否已在实验表中。
     *
     * @param uuid 用户提供的 UUIDv4；支持带连字符或不带连字符
     */
    public record LookupRequest(String uuid) {
    }
}

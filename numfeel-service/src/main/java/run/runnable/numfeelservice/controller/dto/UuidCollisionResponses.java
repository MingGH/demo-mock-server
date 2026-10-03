package run.runnable.numfeelservice.controller.dto;

/**
 * UUID 碰撞实验的接口响应模型。
 */
public final class UuidCollisionResponses {

    private UuidCollisionResponses() {
    }

    /**
     * 实验状态响应。
     *
     * @param databaseRowCount MySQL 表当前真实行数
     * @param targetRowCount 基础实验目标行数
     * @param trimThreshold 行数超过该阈值时触发裁剪
     * @param progressPercent 相对目标行数的进度百分比
     * @param backgroundBusy 后台检查或补齐任务是否正在运行
     */
    public record StatusResponse(
            long databaseRowCount,
            long targetRowCount,
            long trimThreshold,
            double progressPercent,
            boolean backgroundBusy) {
    }

    /**
     * 现场追加一批 UUID 的响应。
     *
     * @param requestedCount 本次请求生成的 UUID 数
     * @param insertedCount 本次真正写入的新 UUID 数
     * @param duplicateCount 本次被唯一主键拒绝的数量
     * @param databaseRowCountBefore 插入前的 MySQL 真实行数
     * @param databaseRowCountAfter 插入后的 MySQL 真实行数
     * @param elapsedMs 本次追加总耗时（毫秒）
     */
    public record AppendResponse(
            int requestedCount,
            long insertedCount,
            long duplicateCount,
            long databaseRowCountBefore,
            long databaseRowCountAfter,
            long elapsedMs) {
    }
}

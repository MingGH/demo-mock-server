package run.runnable.numfeelservice.controller.dto;

import java.util.List;

/**
 * Demo 热门排行榜响应 DTO。
 */
public final class LeaderboardResponses {

    private LeaderboardResponses() {
    }

    /**
     * 单个榜单条目。
     *
     * @param path Demo 页面路径（已归一化，形如 {@code pages/xxx.html} 或 {@code pages/xxx/}），
     *             前端据此匹配 demos.json 渲染标题与图标
     * @param views 该口径时间窗内的浏览量（PV）
     */
    public record LeaderboardEntry(
            String path,
            long views
    ) {
    }

    /**
     * 排行榜聚合响应：包含三个口径的榜单及数据更新时间。
     *
     * @param last7Days 近 7 天热门榜
     * @param last30Days 近 30 天热门榜
     * @param allTime 历史总榜
     * @param updatedAt 数据快照更新时间戳（毫秒），0 表示尚未拉取到数据
     */
    public record LeaderboardResponse(
            List<LeaderboardEntry> last7Days,
            List<LeaderboardEntry> last30Days,
            List<LeaderboardEntry> allTime,
            long updatedAt
    ) {
    }
}

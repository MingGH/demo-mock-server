package run.runnable.numfeelservice.schedule;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import run.runnable.numfeelservice.service.LeaderboardService;

/**
 * 排行榜缓存预热定时任务。
 * <p>
 * 每小时触发一次，主动调用 {@link LeaderboardService#getLeaderboard()}
 * 以确保 @Cacheable 缓存始终有热数据，前端不会遇到冷缓存延迟。
 */
@Component
public class LeaderboardRefreshTask {

    private static final Logger log = LoggerFactory.getLogger(LeaderboardRefreshTask.class);

    private final LeaderboardService leaderboardService;

    public LeaderboardRefreshTask(LeaderboardService leaderboardService) {
        this.leaderboardService = leaderboardService;
    }

    /**
     * 启动后延迟 10 秒首次预热，之后每半小时执行一次。
     */
    @Scheduled(initialDelay = 10_000L, fixedRate = 1_800_000L)
    public void refresh() {
        leaderboardService.getLeaderboard()
                .subscribe(
                        resp -> log.info("Leaderboard cache warmed: 24h={}, 7d={}, 30d={}, all={}",
                                resp.last24Hours().size(), resp.last7Days().size(),
                                resp.last30Days().size(), resp.allTime().size()),
                        err -> log.warn("Leaderboard cache warm-up failed: {}", err.getMessage())
                );
    }
}

package run.runnable.numfeelservice.controller;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.service.LeaderboardService;
import run.runnable.numfeelservice.web.ApiResponse;
import tools.jackson.databind.JsonNode;

/**
 * Demo 热门排行榜接口。
 * <p>
 * {@code GET /leaderboard} 返回近 24 小时 / 近 7 天 / 近 30 天 / 历史总榜四个口径的热门 demo 列表。
 * 数据由 {@link LeaderboardService} 通过 @AsyncCacheable 缓存 1 小时，配合定时任务预热。
 */
@RestController
public class LeaderboardController {

    private final LeaderboardService leaderboardService;

    public LeaderboardController(LeaderboardService leaderboardService) {
        this.leaderboardService = leaderboardService;
    }

    /**
     * 获取热门排行榜。
     *
     * @return 统一包裹的排行榜数据 {@code {"status":200,"data":{...}}}
     */
    @GetMapping(value = "/leaderboard", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<JsonNode>> getLeaderboard() {
        return leaderboardService.getLeaderboard()
                .map(ApiResponse::ok);
    }
}

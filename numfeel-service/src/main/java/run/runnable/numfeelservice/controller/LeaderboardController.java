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
 * {@code GET /leaderboard} 返回近 7 天 / 近 30 天 / 历史总榜三个口径的热门 demo 列表。
 * 数据由 {@link LeaderboardService} 每小时定时刷新内存快照，本接口仅读取快照，
 * 永不阻塞、永不抛错。
 */
@RestController
public class LeaderboardController {

    private final LeaderboardService leaderboardService;

    public LeaderboardController(LeaderboardService leaderboardService) {
        this.leaderboardService = leaderboardService;
    }

    /**
     * 获取热门排行榜快照。
     *
     * @return 统一包裹的排行榜数据 {@code {"status":200,"data":{...}}}
     */
    @GetMapping(value = "/leaderboard", produces = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<JsonNode>> getLeaderboard() {
        return Mono.just(ApiResponse.ok(leaderboardService.getLeaderboard()));
    }
}

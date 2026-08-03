package run.runnable.numfeelservice.controller.dto;

import java.util.Map;

/**
 * 通用行为埋点接口使用的响应 DTO。
 */
public final class EventResponses {

    private EventResponses() {
    }

    /**
     * 埋点批量上报响应。
     *
     * @param accepted 本批次成功接受并落库的事件数
     * @param dropped 本批次被丢弃（非法事件名 / 校验失败）的事件数
     */
    public record EventCollectResponse(
            int accepted,
            int dropped
    ) {
    }

    /**
     * 某个 demo 的聚合摘要响应。
     *
     * @param sessions 去重会话数
     * @param events 事件总数
     * @param byEvent 按事件名分组的计数
     */
    public record EventSummaryResponse(
            long sessions,
            long events,
            Map<String, Long> byEvent
    ) {
    }
}

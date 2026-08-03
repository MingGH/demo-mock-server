package run.runnable.numfeelservice.controller.dto;

import java.util.List;
import java.util.Map;

/**
 * 通用行为埋点接口使用的请求 DTO。
 */
public final class EventRequests {

    private EventRequests() {
    }

    /**
     * 埋点批量上报请求。
     *
     * @param demo demo 页面 slug，如 wealth-button-paradox
     * @param sessionId 客户端生成的会话 ID（sessionStorage，非持久标识）
     * @param events 本批次事件列表
     */
    public record EventCollectRequest(
            String demo,
            String sessionId,
            List<EventItem> events
    ) {
    }

    /**
     * 单条埋点事件。
     *
     * @param name 事件名，如 press / bankrupt / session_end
     * @param seq 会话内事件序号，从 1 递增
     * @param t 客户端事件发生时间（毫秒）；允许缺省
     * @param props 事件属性，扁平结构，仅允许数值/布尔/短字符串
     */
    public record EventItem(
            String name,
            Integer seq,
            Long t,
            Map<String, Object> props
    ) {
    }
}

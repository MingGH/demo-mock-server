package run.runnable.numfeelservice.config;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.filter.Filter;
import ch.qos.logback.core.spi.FilterReply;

/**
 * 未配置 Loki URL 或 token 时直接丢弃日志事件。
 */
public class LokiConfigFilter extends Filter<ILoggingEvent> {

    private static final String NOT_CONFIGURED_HOST = "loki-not-configured.invalid";

    @Override
    public FilterReply decide(ILoggingEvent event) {
        String url = getContext().getProperty("lokiUrl");
        String token = getContext().getProperty("lokiToken");
        if (url == null || url.contains(NOT_CONFIGURED_HOST) || token == null || token.isBlank()) {
            return FilterReply.DENY;
        }
        return FilterReply.NEUTRAL;
    }
}

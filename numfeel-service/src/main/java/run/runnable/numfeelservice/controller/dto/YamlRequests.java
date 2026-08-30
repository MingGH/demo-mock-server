package run.runnable.numfeelservice.controller.dto;

/** YAML 地雷阵演示使用的请求 DTO。 */
public final class YamlRequests {

    private YamlRequests() {
    }

    /**
     * 对照台解析请求。
     *
     * @param yaml 用户输入的原始 YAML 文本
     */
    public record YamlParseRequest(String yaml) {
    }
}

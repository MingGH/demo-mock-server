package run.runnable.numfeelservice.model;

/**
 * 浏览器指纹采集过程使用的不可变值对象。
 * <p>
 * 该类型用于在 controller 与 service 之间传递清洗后的业务数据，
 * 不直接对应数据库表结构。
 *
 * @param fullHash 浏览器多维特征拼接后的总指纹哈希，作为设备识别主键
 * @param canvasHash Canvas 渲染结果的哈希，用于区分图形栈差异
 * @param fontHash 已检测字体列表的哈希，用于反映本机字体环境
 * @param webglHash WebGL 渲染器信息的哈希，用于反映 GPU/驱动差异
 * @param screenInfo 屏幕分辨率与色深的组合描述，格式类似 `1920x1080@24bit`
 * @param timezone 浏览器上报的 IANA 时区标识
 * @param language 浏览器首选语言，如 `zh-CN`
 * @param platform 浏览器暴露的操作系统平台信息
 * @param hardwareConcurrency 浏览器可见的 CPU 逻辑核心数
 * @param deviceMemory 浏览器可见的设备内存，单位通常为 GB
 * @param touchSupport 当前设备是否支持触控输入
 * @param colorDepth 屏幕色深，单位为 bit
 * @param pixelRatio 设备像素比，用于区分 Retina 等高分屏
 * @param entropyBits 前端根据各维度估算出的理论总熵值
 * @param ipHint 请求头或连接信息推导出的来源 IP 提示值
 */
public record FingerprintRecord(
        String fullHash,
        String canvasHash,
        String fontHash,
        String webglHash,
        String screenInfo,
        String timezone,
        String language,
        String platform,
        Integer hardwareConcurrency,
        Integer deviceMemory,
        boolean touchSupport,
        Integer colorDepth,
        Double pixelRatio,
        Double entropyBits,
        String ipHint
) {
    /**
     * 按前端上报字段顺序构造指纹记录。
     *
     * @param fullHash 浏览器总指纹哈希
     * @param canvasHash Canvas 指纹哈希
     * @param fontHash 字体指纹哈希
     * @param webglHash WebGL 指纹哈希
     * @param screenInfo 屏幕信息描述
     * @param timezone 浏览器时区
     * @param language 浏览器语言
     * @param platform 浏览器平台
     * @param hardwareConcurrency CPU 逻辑核心数
     * @param deviceMemory 设备内存
     * @param touchSupport 是否支持触控
     * @param colorDepth 屏幕色深
     * @param pixelRatio 设备像素比
     * @param entropyBits 理论熵值
     * @param ipHint 来源 IP 提示值
     * @return 构造后的指纹记录
     */
    public static FingerprintRecord of(
            String fullHash, String canvasHash, String fontHash, String webglHash,
            String screenInfo, String timezone, String language, String platform,
            Integer hardwareConcurrency, Integer deviceMemory, boolean touchSupport,
            Integer colorDepth, Double pixelRatio, Double entropyBits, String ipHint
    ) {
        return new FingerprintRecord(
                fullHash, canvasHash, fontHash, webglHash, screenInfo, timezone,
                language, platform, hardwareConcurrency, deviceMemory, touchSupport,
                colorDepth, pixelRatio, entropyBits, ipHint
        );
    }
}

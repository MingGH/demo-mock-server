package com.example.demo_mock_server.service;

/**
 * 浏览器指纹数据记录（不可变值对象）
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

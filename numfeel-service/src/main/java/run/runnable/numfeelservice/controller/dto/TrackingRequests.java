package run.runnable.numfeelservice.controller.dto;

import java.util.List;

/**
 * 追踪、采集与排行榜相关接口使用的请求 DTO。
 */
public final class TrackingRequests {

    private TrackingRequests() {
    }

    /**
     * 浏览器指纹采集上报参数。
     *
     * @param fullHash 前端将多维特征拼接后计算得到的总指纹哈希
     * @param canvasHash Canvas 渲染结果的哈希
     * @param fontHash 检测到的字体列表哈希
     * @param webglHash WebGL 渲染器信息哈希
     * @param screenInfo 屏幕分辨率与色深描述
     * @param timezone 浏览器解析出的当前时区
     * @param language 浏览器首选语言
     * @param platform 浏览器暴露的平台信息
     * @param hardwareConcurrency 浏览器可见的 CPU 逻辑核心数
     * @param deviceMemory 浏览器可见的设备内存
     * @param touchSupport 当前设备是否支持触摸输入
     * @param colorDepth 当前屏幕色深
     * @param pixelRatio 设备像素比
     * @param entropyBits 前端估算出的总熵值
     */
    public record BrowserFingerprintCollectRequest(
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
            Boolean touchSupport,
            Integer colorDepth,
            Double pixelRatio,
            Double entropyBits
    ) {
    }

    /**
     * 验证码挑战结果提交参数。
     *
     * @param passedCount 8 关挑战中成功通过的关卡数量
     * @param totalTimeMs 完成全部关卡的总耗时，单位毫秒
     * @param grade 前端按通关表现计算出的评级
     * @param levels 各关卡的通过情况与耗时明细
     */
    public record CaptchaSubmitRequest(
            Integer passedCount,
            Integer totalTimeMs,
            String grade,
            CaptchaLevels levels
    ) {
    }

    /**
     * 验证码各子项目等级与耗时明细。
     *
     * @param text 扭曲文字关是否通过，按 0/1 记录
     * @param math 数学运算关是否通过，按 0/1 记录
     * @param slider 滑块拼图关是否通过，按 0/1 记录
     * @param grid 九宫格图片选择关是否通过，按 0/1 记录
     * @param click 文字点选关是否通过，按 0/1 记录
     * @param rotate 旋转对齐关是否通过，按 0/1 记录
     * @param spatial 空间推理关是否通过，按 0/1 记录
     * @param behavior 行为验证关是否通过，按 0/1 记录
     * @param timeText 扭曲文字关耗时，单位毫秒
     * @param timeMath 数学运算关耗时，单位毫秒
     * @param timeSlider 滑块拼图关耗时，单位毫秒
     * @param timeGrid 九宫格图片选择关耗时，单位毫秒
     * @param timeClick 文字点选关耗时，单位毫秒
     * @param timeRotate 旋转对齐关耗时，单位毫秒
     * @param timeSpatial 空间推理关耗时，单位毫秒
     * @param timeBehavior 行为验证关耗时，单位毫秒
     */
    public record CaptchaLevels(
            Integer text,
            Integer math,
            Integer slider,
            Integer grid,
            Integer click,
            Integer rotate,
            Integer spatial,
            Integer behavior,
            Integer timeText,
            Integer timeMath,
            Integer timeSlider,
            Integer timeGrid,
            Integer timeClick,
            Integer timeRotate,
            Integer timeSpatial,
            Integer timeBehavior
    ) {
    }

    /**
     * 记忆力排行榜查询参数。
     *
     * @param limit 期望返回的排行榜条数
     */
    public record MemoryLeaderboardGetQuery(String limit) {
    }

    /**
     * 记忆力排行榜成绩提交参数。
     *
     * @param name 玩家昵称
     * @param capacity 本次记忆挑战达到的最高容量
     * @param history 每一轮容量与准确率历史
     * @param cacheKB 前端估算的记忆缓存量，单位 KB
     */
    public record MemoryLeaderboardPostRequest(
            String name,
            Integer capacity,
            List<MemoryHistoryItem> history,
            Double cacheKB
    ) {
    }

    /**
     * 记忆力测试每一轮的历史成绩项。
     *
     * @param n 当前轮次的容量值
     * @param accuracy 当前轮次的正确率
     */
    public record MemoryHistoryItem(
            Integer n,
            Double accuracy
    ) {
    }

    /**
     * 社会工程学测试提交参数。
     *
     * @param sessionId 本次答题会话的 UUID
     * @param total 本次共作答题数
     * @param correct 本次答对题数
     * @param questions 每道题的作答明细
     */
    public record SocialEngineeringSubmitRequest(
            String sessionId,
            Integer total,
            Integer correct,
            List<SocialEngineeringQuestionItem> questions
    ) {
    }

    /**
     * 社会工程学测试的单题作答明细。
     *
     * @param questionId 题目编号
     * @param tactic 该题所属的社工手法标识
     * @param isFake 该题场景是否为骗局
     * @param correct 用户是否答对该题
     */
    public record SocialEngineeringQuestionItem(
            Integer questionId,
            String tactic,
            Boolean isFake,
            Boolean correct
    ) {
    }
}

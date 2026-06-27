package run.runnable.numfeelservice.service;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Base64;
import java.util.List;

/**
 * 为 HTTP 文本 vs 二进制传输对比演示生成模拟社交动态流数据。
 * <p>
 * 核心职责：
 * <ul>
 *   <li>构造一份多层嵌套的业务数据（用户、动态、评论、投票等）</li>
 *   <li>以 JSON 文本（{@link #toJsonText()}）和 MessagePack 二进制（{@link #toBinary()}）
 *       两种格式输出同一份数据</li>
 * </ul>
 */
@Service
public class HttpBinaryDemoService {

    private static final JsonNodeFactory NF = JsonNodeFactory.instance;
    private static final ObjectMapper JSON_MAPPER = new ObjectMapper();

    /**
     * MessagePack 序列化使用 com.fasterxml.jackson（因 tools.jackson 与 msgpack-jackson 不兼容）。
     * 桥接方式：tools.jackson → JSON bytes → com.fasterxml.jackson 解析 → MessagePack 输出。
     */
    private static final com.fasterxml.jackson.databind.ObjectMapper CF_JSON_MAPPER =
            new com.fasterxml.jackson.databind.ObjectMapper();
    private static final com.fasterxml.jackson.databind.ObjectMapper CF_MSGPACK_MAPPER =
            new com.fasterxml.jackson.databind.ObjectMapper(new org.msgpack.jackson.dataformat.MessagePackFactory());

    /** 预生成一份数据，缓存起来避免每次请求重新构造（数据量固定）。 */
    private final ObjectNode cachedData;

    public HttpBinaryDemoService() {
        this.cachedData = buildFeed();
    }

    /**
     * 返回 JSON 文本字符串（缩进格式化，便于人类阅读）。
     */
    public String toJsonText() {
        try {
            return JSON_MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(cachedData);
        } catch (Exception e) {
            throw new RuntimeException("JSON序列化失败", e);
        }
    }

    /**
     * 返回 MessagePack 二进制字节数组。
     * <p>
     * 桥接流程：tools.jackson ObjectNode → JSON 字节 → com.fasterxml.jackson 解析 → MessagePack 输出。
     * 原因：项目使用 tools.jackson（Spring 内部重打包），而 msgpack-jackson 仅兼容 com.fasterxml.jackson。
     */
    public byte[] toBinary() {
        try {
            // Step 1: tools.jackson → JSON bytes
            byte[] jsonBytes = JSON_MAPPER.writeValueAsBytes(cachedData);
            // Step 2: com.fasterxml.jackson 解析
            com.fasterxml.jackson.databind.JsonNode cfNode = CF_JSON_MAPPER.readTree(jsonBytes);
            // Step 3: com.fasterxml.jackson → MessagePack
            return CF_MSGPACK_MAPPER.writeValueAsBytes(cfNode);
        } catch (Exception e) {
            throw new RuntimeException("MessagePack序列化失败", e);
        }
    }

    // ---------- 数据构造 ----------

    private static ObjectNode buildFeed() {
        var feed = NF.objectNode();

        feed.put("generated_at", Instant.now().toString());
        feed.put("description", "一个典型的社交动态流——包含用户、图文、投票、嵌套评论与引用转发");

        // -- 用户 --
        var users = NF.arrayNode();
        users.add(user(10001, "小明爱编程", "全栈工程师", 12340, "🚀 代码改变世界 / 摄影爱好者 / 偶尔写写知乎"));
        users.add(user(10002, "小红爱设计", "UI/UX设计师", 8900, "🎨 设计让世界更美好 / 咖啡成瘾者"));
        users.add(user(10003, "老王爱思考", "独立开发者", 45600, "💡 产品沉思录作者 / 反直觉爱好者"));
        feed.set("users", users);

        // -- 动态 --
        var posts = NF.arrayNode();

        // 动态1：纯文字
        posts.add(post(50001, "text", 10001,
                "今天学到了一个有趣的知识点：HTTP协议从1991年就诞生了，但它至今仍然用纯文本传输HTML。\n\n"
                + "为什么呢？如果直接把浏览器内存里的DOM对象序列化成二进制发过去，不是更快吗？\n\n"
                + "我做了个实验对比——答案就在下文👇",
                List.of("HTTP", "网络协议", "科普", "前端"),
                234, 45, 12, 5600,
                List.of(
                        comment(60001, 10002, "学到了！文本格式最大的好处就是跨平台兼容，任何语言都能解析 👍", 23),
                        comment(60002, 10003, "补充一点：gzip压缩之后的纯文本体积其实跟二进制差不多，但可调试性强太多了", 67),
                        comment(60003, 10001, "@老王爱思考 对，devtools直接看，二进制你只能对着hex瞪眼 😂", 15)
                )));

        // 动态2：图文
        var imgPost = post(50002, "image", 10002,
                "周末在郊外拍的星空 🌌 Canon R5 + 24-70 f/2.8",
                List.of("摄影", "星空", "周末"),
                891, 132, 45, 18000, List.of());
        var images = NF.arrayNode();
        images.add(image("https://img.example.com/photo_001.jpg", 1920, 1080, 245000, "jpeg"));
        images.add(image("https://img.example.com/photo_002.jpg", 1920, 1280, 312000, "jpeg"));
        images.add(image("https://img.example.com/photo_003.jpg", 3840, 2160, 890000, "jpeg"));
        imgPost.set("images", images);
        posts.add(imgPost);

        // 动态3：投票
        var pollPost = post(50003, "poll", 10003,
                "你觉得前端开发中哪个环节最容易被忽视？",
                List.of("前端", "投票", "讨论"),
                567, 89, 23, 22000, List.of());
        var options = NF.arrayNode();
        options.add(pollOption(1, "错误处理与边界情况", 342));
        options.add(pollOption(2, "无障碍访问（a11y）", 567));
        options.add(pollOption(3, "SEO与元数据", 234));
        options.add(pollOption(4, "移动端适配与性能", 891));
        pollPost.set("poll_options", options);
        pollPost.put("total_votes", 2034);
        pollPost.put("expires_at", "2026-07-04T00:00:00Z");
        posts.add(pollPost);

        // 动态4：引用转发
        var repost = post(50004, "repost", 10001,
                "这个观点非常认同——语言无关性才是Web能发展成今天这样的根本原因",
                List.of("Web", "协议设计"),
                189, 34, 8, 9500, List.of());
        var quotedPost = NF.objectNode();
        quotedPost.put("id", 49999);
        quotedPost.put("type", "text");
        quotedPost.put("author_nickname", "技术老炮");
        quotedPost.put("content", "互联网最伟大的设计决策之一：用纯文本协议。\n\n"
                + "它使得任何平台、任何语言、任何设备都能参与进来。\n"
                + "二进制协议更快，但会筑起无形的墙——只有特定运行时才能解析。");
        quotedPost.put("created_at", "2026-06-26T08:15:00Z");
        quotedPost.put("likes", 2340);
        repost.set("reposted_post", quotedPost);
        posts.add(repost);

        // 动态5：含emoji和Unicode的长文
        var emojiPost = post(50005, "text", 10002,
                "国际化的坑 😅💀\n\n"
                + "今天测试提了个bug：用户名叫「ＡＢＣ」的日本用户登录后昵称显示乱码。\n"
                + "排查了半天发现——这不是普通的ABC，是全角字母ＡＢＣ（U+FF21-U+FF23）！\n\n"
                + "再加上各种emoji：👨‍👩‍👧‍👦（家庭，ZWJ组合）、🏳️‍🌈（彩虹旗，也是组合）、"
                + "🇨🇳🇺🇸🇯🇵（国旗，区域指示符）……\n\n"
                + "如果用二进制协议，光是对齐Unicode编码格式就能吵三天。\n"
                + "而文本JSON？UTF-8一把梭，全世界通用。",
                List.of("Unicode", "国际化", "i18n", "emoji"),
                445, 78, 56, 15000,
                List.of(
                        comment(60004, 10003, "全角字母那个坑我也踩过…数据库collation没设对，两个用户名字'相同'但字节不一样 😂", 112),
                        comment(60005, 10001, "所以说文本格式其实是一种「容错设计」——错了能看、能改、能调试", 89)
                ));
        posts.add(emojiPost);

        feed.set("posts", posts);
        return feed;
    }

    // ---------- 辅助构造方法 ----------

    private static ObjectNode user(int id, String nickname, String role, int followers, String bio) {
        var u = NF.objectNode();
        u.put("id", id);
        u.put("nickname", nickname);
        u.put("role", role);
        // 一个 1x1 像素的 "头像" Base64（真实场景会更大，这里用作标题性的二进制数据对比）
        u.put("avatar_thumb_base64",
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"
                + "+P+/HgAEhQJ/w7SYeAAAAABJRU5ErkJggg==");
        u.put("bio", bio);
        var stats = NF.objectNode();
        stats.put("followers", followers);
        stats.put("following", followers / 20);
        stats.put("posts", followers / 100);
        u.set("stats", stats);
        return u;
    }

    private static ObjectNode post(int id, String type, int authorId, String content,
                                   List<String> tags, int likes, int comments, int shares,
                                   int views, List<ObjectNode> commentList) {
        var p = NF.objectNode();
        p.put("id", id);
        p.put("type", type);
        p.put("author_id", authorId);
        p.put("content", content);
        p.put("created_at", "2026-06-27T" + String.format("%02d:%02d:%02dZ", 8 + id % 12, id % 60, id % 60));
        var stats = NF.objectNode();
        stats.put("likes", likes);
        stats.put("comments_count", comments);
        stats.put("shares", shares);
        stats.put("views", views);
        p.set("stats", stats);
        var tagArr = NF.arrayNode();
        tags.forEach(tagArr::add);
        p.set("tags", tagArr);
        if (!commentList.isEmpty()) {
            var arr = NF.arrayNode();
            commentList.forEach(arr::add);
            p.set("comments", arr);
        }
        return p;
    }

    private static ObjectNode comment(int id, int authorId, String content, int likes) {
        var c = NF.objectNode();
        c.put("id", id);
        c.put("author_id", authorId);
        c.put("content", content);
        c.put("created_at", "2026-06-27T" + String.format("%02d:%02d:%02dZ", 10 + id % 10, id % 60, id % 60));
        c.put("likes", likes);
        return c;
    }

    private static ObjectNode image(String url, int width, int height, int sizeBytes, String format) {
        var img = NF.objectNode();
        img.put("url", url);
        img.put("width", width);
        img.put("height", height);
        img.put("size_bytes", sizeBytes);
        img.put("format", format);
        return img;
    }

    private static ObjectNode pollOption(int id, String text, int votes) {
        var opt = NF.objectNode();
        opt.put("id", id);
        opt.put("text", text);
        opt.put("votes", votes);
        return opt;
    }
}

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

    /** 用户姓名池 */
    private static final String[] NICKNAMES = {
        "小明爱编程","小红爱设计","老王爱思考","阿杰的日常","莉莉安",
        "代码诗人","产品狗小张","安全老炮","前端小菜","测试小美",
        "运维老李","算法小王","设计小周","移动端老陈","云原生阿坤",
        "后端老赵","数据小钱","架构老孙","前端小李","测试老周",
        "安全小吴","运维老郑","产品小王","算法小冯","设计老陈",
        "移动端小褚","云原生老卫","后端老蒋","数据小沈","架构老韩",
        "前端老杨","测试小朱","安全老秦","运维小许","产品老何",
        "算法小吕","设计老施","移动端老张","云原生小孔","后端老曹",
        "数据小严","架构老华","前端小金","测试小魏","安全老陶",
        "运维小姜","产品老戚","算法小谢","设计老邹","云原生小柏",
    };
    private static final String[] ROLES = {
        "全栈工程师","UI/UX设计师","独立开发者","后端开发","数据分析师",
        "SRE工程师","产品经理","安全工程师","前端开发","测试工程师",
        "DevOps","算法工程师","视觉设计师","iOS/Android开发","架构师",
        "Java工程师","Python工程师","云原生工程师","C++工程师","技术经理",
        "安全研究员","运维工程师","产品运营","机器学习","交互设计师",
        "游戏开发","嵌入式工程师","VR/AR开发","技术总监","质量工程师",
        "数据库管理员","系统架构师","全栈设计师","运维开发","研发总监",
        "自然语言处理","区块链开发","量子计算研究","技术写作","增长黑客",
        "研发效能","基础架构","边缘计算","自动驾驶","技术美术",
    };

    /** 动态内容模板池（长文本） */
    private static final String[] TEXT_TEMPLATES = {
        "刚看完一篇关于 HTTP/3 的文章，QUIC 协议确实解决了不少 TCP 的痛点。\n\n"
        + "0-RTT 握手、多路复用无队头阻塞、连接迁移…这些改进让移动端体验提升明显。\n\n"
        + "但部署成本不低，UDP 被运营商 QoS 限速的问题依然存在。\n\n"
        + "查了一下数据：目前 HTTP/3 部署率大约 28%，主要集中在大厂 CDN。"
        + "小站点上 HTTP/3 的性价比存疑，毕竟大部分用户还在用 HTTP/2。\n\n"
        + "你们公司上了 HTTP/3 吗？体验提升明显不？",
        "分享一个踩坑记录：MySQL 的 REPEATABLE READ 隔离级别下，快照读和当前读混用的坑。\n\n"
        + "背景：订单系统里，一个事务内先 SELECT 查余额（快照读），再 UPDATE 扣款（当前读），"
        + "中间如果另一个事务修改了余额并提交，这个事务的 UPDATE 会基于最新版本，导致扣款后余额不对。\n\n"
        + "根本原因：MVCC 下快照读和当前读看到的数据版本不同。"
        + "解决方案：用 SELECT ... FOR UPDATE 强制当前读，或者改成 SERIALIZABLE 隔离级别。\n\n"
        + "花了两天才定位到，写了个详细的复现步骤👇 大家遇到类似问题可以参考。",
        "面试了一个校招生，问 TCP 三次握手的第三个包丢了会怎样？\n\n"
        + "大部分人只答到「客户端会重发 ACK」。实际这个场景非常微妙：\n"
        + "1) 客户端认为连接已建立（第二次握手收到后就进入 ESTABLISHED），发了数据\n"
        + "2) 服务端还在 SYN-RECV 状态，收到数据但 seq 不对，回 RST\n"
        + "3) 如果开启了 SYN Cookie，行为又不同——服务端根本不维护 SYN-RECV 队列\n\n"
        + "这种问题最能区分背八股文和真正理解 TCP 状态机的人。面试里追问两层就能筛掉一大半。",
        "关于 Code Review 的一些想法，做了五年 CR 总结的经验：\n\n"
        + "1. Review 的目的不是挑刺，是知识共享和风险控制\n"
        + "2. 每次 PR 控制在 400 行以内，超过就拆——大 PR 没人认真看\n"
        + "3. 给建议的时候必须加 why，不然对方觉得你在命令他\n"
        + "4. 发现好代码也要夸，别只盯着问题——正向反馈很重要\n"
        + "5. 区分阻塞性问题（bug、安全漏洞）和非阻塞性建议（命名、风格），用不同标签\n\n"
        + "你们团队的 CR 文化怎么样？有没有什么特别好的实践？",
        "重新读了《Designing Data-Intensive Applications》第5章 Replication 和 第7章 Transactions。\n\n"
        + "每次重读都有新收获。Leader-based replication 的 split-brain 问题，本质上是 CAP 定理中"
        + "网络分区时的一致性问题——要么牺牲可用性，要么承担脑裂风险。\n\n"
        + "现实工程中处理这个问题的三个方向：\n"
        + "1) Raft/Paxos 共识算法（强一致，牺牲部分可用性）\n"
        + "2) 多 Leader + CRDT（最终一致，无冲突自动合并）\n"
        + "3) 应用层补偿（TCC/Saga，最终一致 + 补偿机制）\n\n"
        + "MVCC + 逻辑时钟的方案比单纯用物理时间戳靠谱得多。DDIA 值得每年重读一遍。",
        "今天给团队做了个分享：Git 高级用法——不是基础教程那种。\n\n"
        + "挑了 5 个大家日常不太用但关键时刻救命的技巧：\n"
        + "1) git bisect：二分查找引入 bug 的 commit，配合自动化测试脚本效率极高\n"
        + "2) git reflog：误操作救星，找回丢失的 commit、恢复误 reset 的分支\n"
        + "3) interactive rebase：整理提交历史、合并 commit、修改 commit message\n"
        + "4) git worktree：同时操作多个分支，不用来回 stash\n"
        + "5) git cherry-pick + -x：选择性合并 commit 并保留来源引用\n\n"
        + "最打动大家的是 bisect——一个实习生说他之前排查 bug 逐行看 diff 看了半天 😂",
        "最近在折腾 homelab，记录一下配置清单：\n\n"
        + "主机：二手 Dell PowerEdge R730xd，双路 E5-2680 v4（28核56线程），128GB DDR4 ECC\n"
        + "存储：8×2TB SAS 盘组 RAID-Z2，实际可用约 10TB\n"
        + "虚拟化：Proxmox VE，管理 6 个 VM\n"
        + "服务清单：\n"
        + "- Plex Media Server（影音媒体库，全家都用）\n"
        + "- Pi-hole（全屋 DNS 广告过滤，日均拦截 30% 查询）\n"
        + "- Home Assistant（智能家居中控，控制 15+ 设备）\n"
        + "- GitLab Runner（CI/CD，跑自己的项目）\n"
        + "- k3s 集群（3 个 VM 节点，学习 k8s）\n"
        + "- MinIO（S3 兼容对象存储，当私有网盘）\n\n"
        + "电费一个月大概 90 块，风扇噪音有点大放阳台了。折腾的快乐无价！",
        "收到一封钓鱼邮件，差点上当。复盘一下手法：\n\n"
        + "伪装成 Github 的「安全通知」，说我的 personal access token 在俄罗斯 IP 泄露了，"
        + "让我点击链接「立即确认或撤销」。\n\n"
        + "仔细看域名：github-secur1ty.com——注意 secur1ty 里的 1 不是 i，是数字 1。\n"
        + "这就是 Unicode 同形字攻击（homograph attack），用相似字符伪造域名。\n"
        + "页面完全 1:1 仿制 Github 登录页，CSS 和图片都是从真实 Github 热链接的。\n\n"
        + "如果输入密码，攻击者会收到明文。然后攻击者有 30 秒窗口期登录你的真实 Github。\n"
        + "发出来提醒大家：看清楚浏览器地址栏里的域名，每个字母都确认一遍。",
        "关于单元测试覆盖率的一些不同看法：\n\n"
        + "团队里最近定了个规矩：PR 合并要求 test coverage ≥ 85%。\n"
        + "一开始觉得挺好，后来发现出了问题——大家开始写「为覆盖率而覆盖」的测试：\n"
        + "不测边界、不测异常路径、只测 happy path，把行覆盖凑够 85% 就提交。\n\n"
        + "这种测试的质量比没有测试还差——它给你虚假的安全感。\n\n"
        + "更好用的指标：Mutation Testing。原理是把代码改一个小地方（翻转条件、改返回值），"
        + "看测试能不能抓到。PIT (Pitest) 是 Java 生态里比较好用的 mutation testing 工具。\n\n"
        + "覆盖率是一个下限指标——它告诉你哪些代码「完全没被测」，但不告诉你被测的代码「测得好不好」。",
        "后端接口设计踩过的坑，每条都付出了线上事故的代价 🥲\n\n"
        + "1. 别用 PUT 做部分更新。PUT 语义是「完整替换」，部分更新用 PATCH。\n"
        + "   我们曾经有个 PUT /user/{id} 只传了 nickname，结果把 email 和 phone 都覆盖成 null 了。\n\n"
        + "2. 分页接口必须返回 total 或 has_more。不然前端不知道什么时候停，一直翻页。\n\n"
        + "3. 错误码要语义化。400(Bad Request)、401(Unauthorized)、403(Forbidden)、\n"
        + "   404(Not Found)、409(Conflict)、429(Too Many Requests)——各有其用，不要全扔 500。\n\n"
        + "4. API Versioning 放 Header（Accept: application/vnd.api.v2+json）比放 URL path 优雅，\n"
        + "   且不影响 CDN 缓存策略。\n\n"
        + "5. 永远不要信任客户端传来的 ID。服务端必须鉴权——「这个用户是否有权操作这个资源」。",
        "今天面试被问了一个有趣的问题：Redis 的过期键删除策略？\n\n"
        + "我一开始只答了惰性删除和定期删除。面试官追问：定时删除为什么不用？\n\n"
        + "原来如果每个设置了过期时间的 key 都创建一个定时器，key 多的时候 CPU 全浪费在定时器管理上。\n"
        + "所以 Redis 选了折中方案：惰性删除（访问时检查）+ 定期删除（每 100ms 随机抽 20 个 key 检查）。\n\n"
        + "这哥们还问了：如果大量 key 同时过期怎么办？Redis 做了过期时间随机化——"
        + "在设置过期时间时自动加上最多 25% 的随机偏移，避免雪崩。\n\n"
        + "细节见真章。这种面试题比「Redis 和 Memcached 的区别」有价值多了。",
        "最近在重构一个遗留系统，总结了几条血泪教训：\n\n"
        + "1. 先写 Characterization Test（特征测试），再重构。\n"
        + "   你不知道现有行为是 bug 还是 feature——先锁住行为，再改代码。\n\n"
        + "2. 别一次性重构太多。每次只动一块，提交、部署、观察——出了问题好定位。\n\n"
        + "3. 数据库重构最危险。改表结构之前先确认：\n"
        + "   - 有没有其他服务直接读这张表\n"
        + "   - 有没有定时任务依赖当前 schema\n"
        + "   - 锁表时间会不会影响线上\n\n"
        + "4. 重构的目标不是「写出好代码」，是「在不改行为的前提下提高可维护性」。\n"
        + "   如果你忍不住顺便「顺便改个小需求」，那你就不是在重构，你是在埋雷。",
    };

    private static final String[] IMAGE_TEMPLATES = {
        "周末去徒步了 12 公里 🏔️ 路线：香山→植物园穿越线，累计爬升 600 米，耗时 3 小时。秋天的北京太美了。带了 Sony A7M4 + 24-105 f/4，轻装上阵刚好够用。",
        "最近在学 Blender 建模 🎮 从零开始做了个低多边形风格的小场景，渲染出来还挺有感觉。Blender 4.0 的 Cycles 渲染速度提升明显，EEVEE Next 也值得期待。",
        "周末在家做了红烧排骨 🍖 改良版配方：冰糖炒糖色、加八角桂皮香叶、啤酒代替水、大火收汁到挂勺。卖相一般但味道绝了。",
        "给桌面换了新外设 ⌨️ HHKB Professional Hybrid Type-S + Logitech MX Master 3S。静电容手感确实不一样，打字像在云朵上跳舞。",
        "公司搬了新工位 🏢 270° 落地窗 view，显示器从 2 台加到 4 台。设备清单：Dell U2723QE ×3 + LG C2 42寸 OLED 当副屏。桌面终于够用了。",
        "入手了一台 3D 打印机 🖨️ Bambu Lab X1 Carbon，打印精度惊艳。第一件作品是个机械键盘外壳，耗时 4 小时。模型用 Fusion 360 画的。",
        "参加了一场黑客马拉松 💻 36 小时极限开发，做了个 AI 辅助 Code Review 的 VSCode 插件。最终拿了第二名，奖品是一台 MacBook Air。",
        "去了一趟东京 🗼 秋叶原逛了 6 个小时，收了一把 HHKB、两套键帽、三个高达模型。电器街的氛围太好了，下次还要去。",
        "新买了一个 65% 配列机械键盘 ⌨️ Akko MOD007B HE，磁轴、热插拔、RGB。打字声音像雨滴。桌面终于从 87 键升级到了 65%。",
        "咖啡设备升级 ☕ La Marzocco Linea Mini + Eureka Mignon Specialita。终于能稳定出杯了，拉花技术还在练习中。",
    };

    private static final String[] POLL_QUESTIONS = {
        "你平时写代码最常踩的坑是什么？",
        "你觉得哪个编程语言的社区生态最健康？",
        "全栈工程师应该先精通哪个领域？",
        "微服务还是单体，你的选择是？",
        "你更看好哪个前端框架的未来？",
        "AI 辅助编程工具会不会让初级程序员失业？",
        "你团队用的项目管理工具是什么？",
        "技术博客还有没有写的必要？",
        "远程办公效率到底高不高？",
        "Open Source 项目最缺的是什么？",
        "你更看重代码质量还是交付速度？",
        "新项目应该选什么数据库？",
    };

    private static ObjectNode buildFeed() {
        var feed = NF.objectNode();
        feed.put("generated_at", Instant.now().toString());
        feed.put("description", "一个典型的社交动态流——包含用户、图文、投票、嵌套评论与引用转发");

        // -- 用户：50人 --
        var users = NF.arrayNode();
        for (int i = 0; i < NICKNAMES.length; i++) {
            users.add(buildUser(10001 + i, i));
        }
        feed.set("users", users);

        // -- 动态：80条 --
        var posts = NF.arrayNode();
        var commentId = 60001;
        var postId = 50001;

        for (int t = 0; t < 80; t++) {
            int typeIdx = t % 20;
            String type;
            String content;
            if (typeIdx < 12) {
                type = "text";
                content = TEXT_TEMPLATES[typeIdx % TEXT_TEMPLATES.length]
                        + "\n\n#" + (t + 1) + " 条动态（共80条）——此数据仅用于传输格式对比实验";
                // 让每条文本动态内容略有不同
                content = content.replace("你们", "大家").replace("周末", t % 2 == 0 ? "周末" : "最近");
            } else if (typeIdx < 16) {
                type = "image";
                content = IMAGE_TEMPLATES[typeIdx % IMAGE_TEMPLATES.length];
            } else if (typeIdx < 18) {
                type = "poll";
                content = POLL_QUESTIONS[typeIdx % POLL_QUESTIONS.length];
            } else {
                type = "repost";
                content = "值得一读的观点——转发自技术社区热帖 #技术分享 #互联网协议";
            }

            int authorId = 10001 + (t % NICKNAMES.length);

            // 评论：4-7条
            var commentList = new java.util.ArrayList<ObjectNode>();
            if (!"poll".equals(type)) {
                int commentCount = 4 + t % 4;
                for (int c = 0; c < commentCount; c++) {
                    int cAuthorId = 10001 + ((authorId - 10001 + c + 1) % NICKNAMES.length);
                    commentList.add(comment(commentId++, cAuthorId,
                            COMMENT_POOL[(commentId + c) % COMMENT_POOL.length], 10 + commentId % 100));
                }
            }

            var p = post(postId++, type, authorId, content,
                    List.of("技术", "编程", "分享", "互联网"), 10 + t * 47,
                    commentList.size() + t, 2 + t, 800 + t * 200, commentList);

            // 编辑历史（每条动态加1-2个历史版本，增加数据量）
            if (t % 5 != 0) {
                var history = NF.arrayNode();
                var h1 = NF.objectNode();
                h1.put("edited_at", "2026-06-27T" + String.format("%02d:%02d:%02dZ", 7 + t % 12, t % 60, t % 60));
                h1.put("change_summary", t % 3 == 0 ? "修正错别字" : t % 3 == 1 ? "补充详细内容" : "调整排版格式");
                h1.put("char_diff", -5 + t % 30);
                history.add(h1);
                if (t % 3 == 0) {
                    var h2 = NF.objectNode();
                    h2.put("edited_at", "2026-06-27T" + String.format("%02d:%02d:%02dZ", 5 + t % 12, t % 60, t % 60));
                    h2.put("change_summary", "初始版本发布");
                    h2.put("char_diff", content.length());
                    history.add(h2);
                }
                p.set("edit_history", history);
            }

            // 图文动态
            if ("image".equals(type)) {
                var imgs = NF.arrayNode();
                for (int m = 0; m < 3; m++) {
                    var img = NF.objectNode();
                    img.put("url", "https://img.example.com/photo_" + t + "_0" + (m + 1) + ".jpg");
                    img.put("width", 1920);
                    img.put("height", 1080 + m * 200);
                    img.put("size_bytes", 200000 + t * 30000);
                    img.put("format", "jpeg");
                    // EXIF 元数据
                    var exif = NF.objectNode();
                    exif.put("camera", "Sony A7M4");
                    exif.put("lens", "FE 24-105mm F4 G OSS");
                    exif.put("focal_length", "35mm");
                    exif.put("aperture", "f/5.6");
                    exif.put("shutter_speed", "1/250");
                    exif.put("iso", 400 + m * 200);
                    exif.put("gps_lat", 39.9 + m * 0.001);
                    exif.put("gps_lng", 116.4 + m * 0.001);
                    img.set("exif", exif);
                    imgs.add(img);
                }
                p.set("images", imgs);
            }

            // 投票动态
            if ("poll".equals(type)) {
                var opts = NF.arrayNode();
                opts.add(pollOption(1, POLL_OPTION_POOL[(t * 3) % POLL_OPTION_POOL.length], 100 + t * 50));
                opts.add(pollOption(2, POLL_OPTION_POOL[(t * 3 + 1) % POLL_OPTION_POOL.length], 200 + t * 60));
                opts.add(pollOption(3, POLL_OPTION_POOL[(t * 3 + 2) % POLL_OPTION_POOL.length], 150 + t * 40));
                opts.add(pollOption(4, POLL_OPTION_POOL[(t * 3 + 3) % POLL_OPTION_POOL.length], 300 + t * 70));
                opts.add(pollOption(5, POLL_OPTION_POOL[(t * 3 + 4) % POLL_OPTION_POOL.length], 80 + t * 30));
                p.set("poll_options", opts);
                p.put("total_votes", 830 + t * 180);
                p.put("expires_at", "2026-07-" + String.format("%02d", 1 + t % 28) + "T00:00:00Z");
            }

            // 转发动态
            if ("repost".equals(type)) {
                var qp = NF.objectNode();
                qp.put("id", 49000 - t);
                qp.put("type", "text");
                qp.put("author_nickname", NICKNAMES[(t * 7) % NICKNAMES.length]);
                qp.put("content", "互联网最伟大的设计决策之一：用纯文本协议传输数据。\n\n"
                        + "它使得任何平台、任何语言、任何设备都能解析和生成网页内容。\n"
                        + "二进制协议或许更快，但会筑起无形的技术壁垒——\n"
                        + "只有特定编程语言和运行时环境才能理解的数据格式，\n"
                        + "与互联网「开放、平等」的核心理念背道而驰。");
                qp.put("created_at", "2026-06-26T08:15:00Z");
                qp.put("likes", 2000 + t * 80);
                // 引用帖子的 stats
                var qpStats = NF.objectNode();
                qpStats.put("likes", 2000 + t * 80);
                qpStats.put("comments_count", 45 + t);
                qpStats.put("shares", 12 + t % 30);
                qpStats.put("views", 15000 + t * 500);
                qp.set("stats", qpStats);
                p.set("reposted_post", qp);
            }

            // 地理位置（每3条加一个）
            if (t % 3 == 0) {
                var loc = NF.objectNode();
                loc.put("name", t % 6 == 0 ? "北京·中关村" : t % 6 == 1 ? "上海·张江" :
                        t % 6 == 2 ? "深圳·科技园" : t % 6 == 3 ? "杭州·未来科技城" :
                        t % 6 == 4 ? "成都·天府软件园" : "广州·天河");
                loc.put("lat", 39.9 + (t % 6) * 1.5);
                loc.put("lng", 116.4 + (t % 6) * 2.0);
                p.set("location", loc);
            }

            posts.add(p);
        }
        feed.set("posts", posts);

        // -- 热门话题 --
        var topics = NF.arrayNode();
        for (int i = 0; i < 12; i++) {
            var topic = NF.objectNode();
            topic.put("id", 80001 + i);
            topic.put("name", TOPICS[i % TOPICS.length]);
            topic.put("post_count", 1000 + i * 340);
            topic.put("trend", i < 4 ? "rising" : i < 8 ? "hot" : "stable");
            topics.add(topic);
        }
        feed.set("trending_topics", topics);

        // -- 推荐关注 --
        var recommend = NF.arrayNode();
        for (int i = 0; i < 8; i++) {
            var rec = NF.objectNode();
            int uid = 10001 + ((i * 7 + 3) % NICKNAMES.length);
            rec.put("user_id", uid);
            rec.put("reason", i % 4 == 0 ? "你关注的人也关注了TA" :
                    i % 4 == 1 ? "和你有相似的兴趣标签" :
                    i % 4 == 2 ? "最近发布了热门内容" : "新晋优秀作者");
            recommend.add(rec);
        }
        feed.set("recommended_users", recommend);

        return feed;
    }

    /** 评论模板池 */
    private static final String[] COMMENT_POOL = {
        "学到了，收藏了 👍",
        "这个观点很新颖，回头我试试",
        "确实，我之前也遇到过类似的问题",
        "写得真好，特别是第三点",
        "请问有详细的复现步骤吗？",
        "这个坑我也踩过，排查了好久 😂",
        "补充一个相关的问题：同样的道理也适用于分布式事务",
        "说得太对了，深有同感",
        "有没有推荐的参考资料？",
        "总结得很到位，转了",
        "这个角度我没想到，学习了",
        "@作者 能展开讲讲第二点吗？",
        "mark一下，后面要用到",
        "关于这个我还有不同看法，有空写篇文章聊",
        "老哥稳，全是干货 🔥",
    };

    /** 投票选项池 */
    private static final String[] POLL_OPTION_POOL = {
        "性能优化", "代码可读性", "团队协作", "项目管理",
        "单元测试", "持续集成", "文档编写", "技术选型",
        "架构设计", "安全审计", "用户体验", "DevOps实践",
        "Go语言", "Rust语言", "TypeScript", "Python",
        "React", "Vue.js", "Svelte", "Angular",
    };

    /** 热门话题 */
    private static final String[] TOPICS = {
        "#HTTP协议设计", "#前端性能优化", "#微服务架构", "#AI编程助手",
        "#开源社区", "#技术面试", "#职业发展", "#远程办公",
        "#数据库选型", "#云原生", "#安全漏洞", "#程序员日常",
    };

    // ---------- 辅助方法 ----------

    private static ObjectNode buildUser(int id, int idx) {
        var u = NF.objectNode();
        u.put("id", id);
        u.put("nickname", NICKNAMES[idx]);
        u.put("role", ROLES[idx % ROLES.length]);
        u.put("avatar_thumb_base64",
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"
                + "+P+/HgAEhQJ/w7SYeAAAAABJRU5ErkJggg==");
        u.put("bio", NICKNAMES[idx] + "的简介——热爱技术、乐于分享的互联网从业者。");
        u.put("join_date", "202" + (idx % 6) + "-0" + (1 + idx % 9) + "-" + String.format("%02d", 1 + idx % 28));
        u.put("email_hash", "sha256:" + Integer.toHexString(("user" + id + "@example.com").hashCode()));

        var stats = NF.objectNode();
        stats.put("followers", 2000 + idx * 1234);
        stats.put("following", 100 + idx * 17);
        stats.put("posts", 10 + idx * 3);
        stats.put("likes_received", 5000 + idx * 890);
        u.set("stats", stats);

        // 用户徽章
        var badges = NF.arrayNode();
        var badgeNames = new String[]{"认证开发者", "优秀答主", "年度创作者", "社区贡献者", "技术博主",
                "开源英雄", "知识分享官", "连续签到365天", "万人粉丝", "互动之星"};
        for (int b = 0; b < 2 + idx % 4; b++) {
            var badge = NF.objectNode();
            badge.put("name", badgeNames[(idx + b) % badgeNames.length]);
            badge.put("level", idx % 3 == 0 ? "gold" : idx % 3 == 1 ? "silver" : "bronze");
            badge.put("awarded_at", "2026-0" + (1 + b % 6) + "-" + String.format("%02d", 1 + idx % 28));
            badges.add(badge);
        }
        u.set("badges", badges);

        // 社交链接
        var links = NF.objectNode();
        links.put("github", "https://github.com/user" + id);
        links.put("twitter", "https://twitter.com/user" + id);
        links.put("website", "https://user" + id + ".dev");
        links.put("stackoverflow", "https://stackoverflow.com/users/" + (100000 + id));
        u.set("social_links", links);

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

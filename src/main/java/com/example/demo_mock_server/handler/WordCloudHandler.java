package com.example.demo_mock_server.handler;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.huaban.analysis.jieba.JiebaSegmenter;
import com.huaban.analysis.jieba.SegToken;
import io.vertx.core.Handler;
import io.vertx.core.Vertx;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;

import java.io.*;
import java.net.URL;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class WordCloudHandler implements Handler<RoutingContext> {

    private static final String DATA_URL = "https://fileshare.runnable.run/HuChenFeng/HuChenFeng.zip";
    private static final String LOCAL_ZIP_PATH = "data/HuChenFeng.zip";
    private static final String DATA_DIR = "data/HuChenFeng";
    private static final String CACHE_KEY = "word_cloud_data";

    // Expanded stop words list
    private static final Set<String> STOP_WORDS = new HashSet<>();

    static {
        STOP_WORDS.addAll(Arrays.asList(
            "户晨风", "感谢", "不是", "现在", "一下", "可以", "知道", "然后", "xxxx", "问题", "为什么", "可能", "觉得",  "这样", "这种", "是不是", "不能", "不要", "的话", "咱们", "应该", "时候",
            "总说", "直接", "东西", "还有", "比如说", "多少", "就是说", "这些", "观点", "里面", "哎呀", "意思", "确实", "很多", "大家", "一点", "一些", "你好", "已经", "今天",
            "稍微", "视频", "直播间", "之后", "需要", "真的", "一样", "这是", "有没有", "刚才", "告诉", "sc", "之前", "不会", "别人", "肯定", "比较","当然", "非常", "说话",
            "不行", "...", "哪个", "开始", "地方", "一定", "喜欢",  "出来", "看到", "大概", "来讲", "其他", "别急", "不了", "两个", "事情", "认为", "生活", "感觉", "人家",
            "任何",  "着急", "那种", "不用", "不好", "城市", "明白", "首先", "如果说", "时间", "清楚",  "一个月", "就行了", "专业", "逻辑", "表达", "一直", "有人", "情况",
            "办法",  "有点", "话题", "那些", "真是", "一年", "不到", "例子", "简单",  "说实话", "包括", "别别", "干什么",  "谢谢", "正常","所以","那么","能够","而且","或者","一个",
            "最后", "了解", "哪里", "毕业", "马上", "关系", "不想", "ok", "怎么样", "当时", "这边", "干嘛",  "晚上", "本身", "能力", "申请", "所有","自己","因为","这么","尤其","一句","没什么",
            "另外", "对于", "怎么办", "所谓", "换个", "基本上", "反正", "特别", "上麦", "拜拜", "几个", "网友", "成本", "只有", "好好", "小时",  "以后", "通过", "一天",
            "起来",  "或者说", "有些", "只能", "一种", "连麦", "理解",  "完全", "支持", "块钱", "必须", "再见", "主播", "存在", "只要", "好像","这个","就是","那个","什么","怎么","还是"
        ));
    }

    private static class WordCloudData {
        final JsonArray top300;
        final Map<String, Integer> fullCounts;

        WordCloudData(JsonArray top300, Map<String, Integer> fullCounts) {
            this.top300 = top300;
            this.fullCounts = fullCounts;
        }
    }

    private final Vertx vertx;
    private final Cache<String, WordCloudData> cache;

    public WordCloudHandler(Vertx vertx) {
        this.vertx = vertx;
        this.cache = Caffeine.newBuilder()
            .expireAfterWrite(1, TimeUnit.HOURS)
            .maximumSize(1)
            .build();

        try {
            initData();
            // Trigger cache warmup asynchronously
            vertx.executeBlocking(promise -> {
                 try {
                     System.out.println("Warming up word cloud cache...");
                     cache.get(CACHE_KEY, k -> {
                        try {
                            return generateWordCloud();
                        } catch (IOException e) {
                            throw new RuntimeException(e);
                        }
                    });
                    System.out.println("Word cloud cache warmup completed.");
                    promise.complete();
                 } catch (Exception e) {
                     e.printStackTrace();
                     promise.fail(e);
                 }
            });
        } catch (IOException e) {
            e.printStackTrace();
            System.err.println("Failed to initialize data: " + e.getMessage());
        }
    }

    @Override
    public void handle(RoutingContext ctx) {
        String searchWord = ctx.queryParams().get("search");

        WordCloudData cached = cache.getIfPresent(CACHE_KEY);
        if (cached != null) {
            handleResponse(ctx, cached, searchWord);
            return;
        }

        vertx.executeBlocking(promise -> {
            try {
                // Double-checked locking pattern is not strictly needed with Caffeine if we used a LoadingCache
                // or cache.get(key, k -> load(k)), but since load() throws IOException and is heavy,
                // we want to do it in executeBlocking.
                // Caffeine's get(key, mappingFunction) computes atomically.
                WordCloudData result = cache.get(CACHE_KEY, k -> {
                    try {
                        return generateWordCloud();
                    } catch (IOException e) {
                        throw new RuntimeException(e);
                    }
                });

                promise.complete(result);
            } catch (Exception e) {
                e.printStackTrace();
                promise.fail(e);
            }
        }, res -> {
            if (res.succeeded()) {
                handleResponse(ctx, (WordCloudData) res.result(), searchWord);
            } else {
                ctx.response()
                    .setStatusCode(500)
                    .end(new JsonObject().put("error", res.cause().getMessage()).encode());
            }
        });
    }

    private void handleResponse(RoutingContext ctx, WordCloudData data, String searchWord) {
        if (searchWord != null && !searchWord.trim().isEmpty()) {
            String word = searchWord.trim();
            Integer count = data.fullCounts.getOrDefault(word, 0);
            boolean inTop300 = false;
            for (int i = 0; i < data.top300.size(); i++) {
                if (data.top300.getJsonObject(i).getString("name").equals(word)) {
                    inTop300 = true;
                    break;
                }
            }

            ctx.response()
                .putHeader("Content-Type", "application/json; charset=utf-8")
                .end(new JsonObject()
                    .put("word", word)
                    .put("count", count)
                    .put("inTop300", inTop300)
                    .encode());
        } else {
            ctx.response()
                .putHeader("Content-Type", "application/json; charset=utf-8")
                .end(data.top300.encode());
        }
    }

    private void initData() throws IOException {
        Path dataPath = Paths.get(DATA_DIR);
        // Check if directory exists and has files
        if (Files.exists(dataPath) && Files.isDirectory(dataPath)) {
            try (Stream<Path> entries = Files.list(dataPath)) {
                if (entries.findFirst().isPresent()) {
                    return; // Data exists, skip download
                }
            }
        }

        // Create data directory if not exists
        Files.createDirectories(Paths.get("data"));

        // Download
        System.out.println("Downloading data from " + DATA_URL + "...");
        try (InputStream in = new URL(DATA_URL).openStream()) {
            Files.copy(in, Paths.get(LOCAL_ZIP_PATH), StandardCopyOption.REPLACE_EXISTING);
        }

        // Unzip
        System.out.println("Unzipping data...");
        unzip(LOCAL_ZIP_PATH, "data");

        // Clean up zip
        Files.deleteIfExists(Paths.get(LOCAL_ZIP_PATH));
    }

    private void unzip(String zipFilePath, String destDir) throws IOException {
        File dir = new File(destDir);
        if (!dir.exists()) dir.mkdirs();

        byte[] buffer = new byte[1024];
        try (ZipInputStream zis = new ZipInputStream(new FileInputStream(zipFilePath))) {
            ZipEntry zipEntry = zis.getNextEntry();
            while (zipEntry != null) {
                File newFile = newFile(dir, zipEntry);
                if (zipEntry.isDirectory()) {
                    if (!newFile.isDirectory() && !newFile.mkdirs()) {
                        throw new IOException("Failed to create directory " + newFile);
                    }
                } else {
                    // fix for Windows-created archives
                    File parent = newFile.getParentFile();
                    if (!parent.isDirectory() && !parent.mkdirs()) {
                        throw new IOException("Failed to create directory " + parent);
                    }

                    try (FileOutputStream fos = new FileOutputStream(newFile)) {
                        int len;
                        while ((len = zis.read(buffer)) > 0) {
                            fos.write(buffer, 0, len);
                        }
                    }
                }
                zipEntry = zis.getNextEntry();
            }
            zis.closeEntry();
        }
    }

    private File newFile(File destinationDir, ZipEntry zipEntry) throws IOException {
        File destFile = new File(destinationDir, zipEntry.getName());
        String destDirPath = destinationDir.getCanonicalPath();
        String destFilePath = destFile.getCanonicalPath();
        if (!destFilePath.startsWith(destDirPath + File.separator)) {
            throw new IOException("Entry is outside of the target dir: " + zipEntry.getName());
        }
        return destFile;
    }

    private WordCloudData generateWordCloud() throws IOException {
        System.out.println("Generating word cloud data...");
        Map<String, Integer> wordCounts = new HashMap<>();
        JiebaSegmenter segmenter = new JiebaSegmenter();

        Path dataPath = Paths.get(DATA_DIR);
        if (!Files.exists(dataPath)) {
             System.out.println("Data directory not found: " + dataPath.toAbsolutePath());
             return new WordCloudData(new JsonArray(), new HashMap<>());
        }

        try (Stream<Path> paths = Files.walk(dataPath)) {
            paths.filter(Files::isRegularFile)
                 .filter(p -> p.toString().endsWith(".md"))
                 .forEach(path -> processFile(path, segmenter, wordCounts));
        }

        System.out.println("Total words found: " + wordCounts.size());

        List<Map.Entry<String, Integer>> sortedWords = wordCounts.entrySet().stream()
            .filter(e -> e.getKey().length() > 1) // Filter single characters
            .filter(e -> !STOP_WORDS.contains(e.getKey()))
            .sorted((e1, e2) -> e2.getValue().compareTo(e1.getValue()))
            .limit(300)
            .collect(Collectors.toList());

        System.out.println("Top words count: " + sortedWords.size());

        JsonArray result = new JsonArray();
        for (Map.Entry<String, Integer> entry : sortedWords) {
            result.add(new JsonObject()
                .put("name", entry.getKey())
                .put("value", entry.getValue()));
        }
        return new WordCloudData(result, wordCounts);
    }

    private void processFile(Path path, JiebaSegmenter segmenter, Map<String, Integer> wordCounts) {
        try {
            List<String> lines = Files.readAllLines(path);
            for (String line : lines) {
                String content = line.trim();
                if (content.isEmpty()) continue;

                // Filter: Only process lines starting with "户晨风：" or "户晨风:"
                if (!content.startsWith("户晨风：") && !content.startsWith("户晨风:")) {
                    continue;
                }

                // Strip speaker name
                int colonIndex = content.indexOf("：");
                if (colonIndex == -1) {
                    colonIndex = content.indexOf(":");
                }

                if (colonIndex != -1) {
                     content = content.substring(colonIndex + 1).trim();
                }

                if (!content.isEmpty()) {
                    List<SegToken> tokens = segmenter.process(content, JiebaSegmenter.SegMode.SEARCH);
                    for (SegToken token : tokens) {
                        String word = token.word.trim();
                        if (!STOP_WORDS.contains(word) && !word.isEmpty() && !isNumeric(word)) {
                            wordCounts.put(word, wordCounts.getOrDefault(word, 0) + 1);
                        }
                    }
                }
            }
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    private boolean isNumeric(String str) {
        return str.matches("-?\\d+(\\.\\d+)?");
    }
}

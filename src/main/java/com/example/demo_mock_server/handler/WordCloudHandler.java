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
            "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好", "自己", "这",
            "那", "个", "吗", "吧", "啊", "什么", "因为", "所以", "但是", "而且", "这个", "那个", "其实", "只是", "还是", "或者", "如果", "就是", "这么", "那么", "怎么", "我们", "你们", "他们",
            "它", "她们", "它们", "位", "部", "个", "只", "次", "件", "本", "些", "点", "块", "张", "条", "支", "架", "台", "份", "颗", "株", "头", "匹", "口", "间", "所", "座", "栋", "层",
            "级", "种", "类", "群", "对", "把", "被", "让", "给", "为", "以", "由", "从", "自", "向", "往", "在", "当", "朝", "按", "照", "凭", "据", "依", "靠", "沿", "顺", "趁", "随", "同",
            "跟", "与", "及", "或", "而", "且", "但", "虽", "然", "即", "便", "纵", "不", "过", "只", "要", "只", "有", "除", "非", "无", "论", "不", "管", "嗯", "哦", "哎", "呀", "哈"
        ));
    }

    private final Vertx vertx;
    private final Cache<String, JsonArray> cache;

    public WordCloudHandler(Vertx vertx) {
        this.vertx = vertx;
        this.cache = Caffeine.newBuilder()
            .expireAfterWrite(1, TimeUnit.HOURS)
            .maximumSize(1)
            .build();

        try {
            initData();
        } catch (IOException e) {
            e.printStackTrace();
            System.err.println("Failed to initialize data: " + e.getMessage());
        }
    }

    @Override
    public void handle(RoutingContext ctx) {
        JsonArray cached = cache.getIfPresent(CACHE_KEY);
        if (cached != null) {
            ctx.response()
                .putHeader("Content-Type", "application/json; charset=utf-8")
                .end(cached.encode());
            return;
        }

        vertx.executeBlocking(promise -> {
            try {
                // Double-checked locking pattern is not strictly needed with Caffeine if we used a LoadingCache
                // or cache.get(key, k -> load(k)), but since load() throws IOException and is heavy,
                // we want to do it in executeBlocking.
                // Caffeine's get(key, mappingFunction) computes atomically.
                JsonArray result = cache.get(CACHE_KEY, k -> {
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
                ctx.response()
                    .putHeader("Content-Type", "application/json; charset=utf-8")
                    .end(((JsonArray) res.result()).encode());
            } else {
                ctx.response()
                    .setStatusCode(500)
                    .end(new JsonObject().put("error", res.cause().getMessage()).encode());
            }
        });
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

    private JsonArray generateWordCloud() throws IOException {
        System.out.println("Generating word cloud data...");
        Map<String, Integer> wordCounts = new HashMap<>();
        JiebaSegmenter segmenter = new JiebaSegmenter();

        Path dataPath = Paths.get(DATA_DIR);
        if (!Files.exists(dataPath)) {
             System.out.println("Data directory not found: " + dataPath.toAbsolutePath());
             return new JsonArray();
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
            .limit(200)
            .collect(Collectors.toList());

        System.out.println("Top words count: " + sortedWords.size());

        JsonArray result = new JsonArray();
        for (Map.Entry<String, Integer> entry : sortedWords) {
            result.add(new JsonObject()
                .put("name", entry.getKey())
                .put("value", entry.getValue()));
        }
        return result;
    }

    private void processFile(Path path, JiebaSegmenter segmenter, Map<String, Integer> wordCounts) {
        try {
            List<String> lines = Files.readAllLines(path);
            for (String line : lines) {
                String content = line.trim();
                if (content.isEmpty()) continue;

                // Attempt to strip speaker name (e.g. "户晨风：")
                int colonIndex = content.indexOf("：");
                if (colonIndex == -1) {
                    colonIndex = content.indexOf(":");
                }

                if (colonIndex != -1 && colonIndex < 20) {
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

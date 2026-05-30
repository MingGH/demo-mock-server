package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.UtilityResponses.WordCloudEntryResponse;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.huaban.analysis.jieba.JiebaSegmenter;
import com.huaban.analysis.jieba.SegToken;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * 词云业务逻辑层：数据下载、分词、统计、缓存（迁移自 Vert.x 版，Json 换成 Jackson）。
 * <p>
 * 所有方法均为同步阻塞，调用方需在 boundedElastic 调度器上执行。
 */
@Service
public class WordCloudService {

    private static final Logger log = LoggerFactory.getLogger(WordCloudService.class);

    private static final String DATA_URL = "https://fileshare.runnable.run/HuChenFeng/HuChenFeng.zip";
    private static final String LOCAL_ZIP = "data/HuChenFeng.zip";
    private static final String DATA_DIR = "data/HuChenFeng";
    private static final String CACHE_KEY = "word_cloud_data";

    private static final Set<String> STOP_WORDS = Set.of(
            "户晨风","感谢","不是","现在","一下","可以","知道","然后","xxxx","问题","为什么","可能","觉得","这样","这种",
            "是不是","不能","不要","的话","咱们","应该","时候","总说","直接","东西","还有","比如说","多少","就是说",
            "这些","观点","里面","哎呀","意思","确实","很多","大家","一点","一些","你好","已经","今天","稍微","视频",
            "直播间","之后","需要","真的","一样","这是","有没有","刚才","告诉","sc","之前","不会","别人","肯定","比较",
            "当然","非常","说话","不行","...","哪个","开始","地方","一定","喜欢","出来","看到","大概","来讲","其他",
            "别急","不了","两个","事情","认为","生活","感觉","人家","任何","着急","那种","不用","不好","城市","明白",
            "首先","如果说","时间","清楚","一个月","就行了","专业","逻辑","表达","一直","有人","情况","办法","有点",
            "话题","那些","真是","一年","不到","例子","简单","说实话","包括","别别","干什么","谢谢","正常","所以",
            "那么","能够","而且","或者","一个","最后","了解","哪里","毕业","马上","关系","不想","ok","怎么样","当时",
            "这边","干嘛","晚上","本身","能力","申请","所有","自己","因为","这么","尤其","一句","没什么","另外","对于",
            "怎么办","所谓","换个","基本上","反正","特别","上麦","拜拜","几个","网友","成本","只有","好好","小时",
            "以后","通过","一天","起来","或者说","有些","只能","一种","连麦","理解","完全","支持","块钱","必须","再见",
            "主播","存在","只要","好像","这个","就是","那个","什么","怎么","还是"
    );

    public record WordCloudData(List<WordCloudEntryResponse> top300, Map<String, Integer> fullCounts) {
    }

    private final Cache<String, WordCloudData> cache = Caffeine.newBuilder()
            .expireAfterWrite(1, TimeUnit.HOURS)
            .maximumSize(1)
            .build();

    @EventListener(ApplicationReadyEvent.class)
    public void initOnStartup() {
        Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "wordcloud-init");
            t.setDaemon(true);
            return t;
        }).submit(() -> {
            try {
                initData();
            } catch (Exception e) {
                log.warn("Word cloud data init failed: {}", e.getMessage());
            }
            warmUp();
        });
    }

    public void warmUp() {
        log.info("Warming up word cloud cache...");
        cache.get(CACHE_KEY, k -> {
            try {
                return generate();
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        });
        log.info("Word cloud cache warmup completed");
    }

    /** 优先从缓存读取词云数据，缓存未命中时重新生成。 */
    public WordCloudData getOrLoad() throws IOException {
        return cache.get(CACHE_KEY, key -> loadWordCloudData());
    }

    /** 首次启动时按需下载并解压原始语料。 */
    public void initData() throws IOException {
        Path dataPath = Paths.get(DATA_DIR);
        if (hasExistingData(dataPath)) {
            return;
        }
        Files.createDirectories(Paths.get("data"));
        downloadDataArchive();
        log.info("Unzipping data...");
        unzip(LOCAL_ZIP, "data");
        Files.deleteIfExists(Paths.get(LOCAL_ZIP));
    }

    /** 扫描语料目录，分词并生成 Top300 词频结果。 */
    private WordCloudData generate() throws IOException {
        log.info("Generating word cloud data...");
        Map<String, Integer> wordCounts = new HashMap<>();
        JiebaSegmenter segmenter = new JiebaSegmenter();

        Path dataPath = Paths.get(DATA_DIR);
        if (!Files.exists(dataPath)) {
            log.warn("Data directory not found: {}", dataPath.toAbsolutePath());
            return new WordCloudData(List.of(), new HashMap<>());
        }

        try (Stream<Path> paths = Files.walk(dataPath)) {
            paths.filter(Files::isRegularFile)
                    .filter(p -> p.toString().endsWith(".md"))
                    .forEach(p -> processFile(p, segmenter, wordCounts));
        }

        log.info("Total words found: {}", wordCounts.size());

        List<Map.Entry<String, Integer>> sorted = wordCounts.entrySet().stream()
                .filter(e -> e.getKey().length() > 1)
                .filter(e -> !STOP_WORDS.contains(e.getKey()))
                .sorted((a, b) -> b.getValue().compareTo(a.getValue()))
                .limit(300)
                .collect(Collectors.toList());

        log.info("Top words count: {}", sorted.size());

        List<WordCloudEntryResponse> result = sorted.stream()
                .map(e -> new WordCloudEntryResponse(e.getKey(), e.getValue()))
                .toList();

        return new WordCloudData(result, wordCounts);
    }

    /** 将受检异常转换为缓存加载器可接受的运行时异常。 */
    private WordCloudData loadWordCloudData() {
        try {
            return generate();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** 判断本地语料目录是否已经存在可用数据。 */
    private boolean hasExistingData(Path dataPath) throws IOException {
        if (!Files.exists(dataPath) || !Files.isDirectory(dataPath)) {
            return false;
        }
        try (Stream<Path> entries = Files.list(dataPath)) {
            return entries.findFirst().isPresent();
        }
    }

    /** 下载压缩包形式的原始语料数据。 */
    private void downloadDataArchive() throws IOException {
        log.info("Downloading data from {}...", DATA_URL);
        try (InputStream in = new URL(DATA_URL).openStream()) {
            Files.copy(in, Paths.get(LOCAL_ZIP), StandardCopyOption.REPLACE_EXISTING);
        }
    }

    /** 处理单个 Markdown 文件，只统计目标说话人的文本内容。 */
    private void processFile(Path path, JiebaSegmenter segmenter, Map<String, Integer> wordCounts) {
        try {
            for (String line : Files.readAllLines(path)) {
                String content = extractSpeakerContent(line);
                if (content == null) {
                    continue;
                }
                for (SegToken token : segmenter.process(content, JiebaSegmenter.SegMode.SEARCH)) {
                    String word = token.word.trim();
                    if (shouldCountWord(word)) {
                        wordCounts.merge(word, 1, Integer::sum);
                    }
                }
            }
        } catch (IOException e) {
            log.warn("Failed to process file {}: {}", path, e.getMessage());
        }
    }

    /** 提取“户晨风”说话内容，去掉说话人前缀与空白。 */
    private String extractSpeakerContent(String line) {
        String content = line.trim();
        if (content.isEmpty()) {
            return null;
        }
        if (!content.startsWith("户晨风：") && !content.startsWith("户晨风:")) {
            return null;
        }

        int colon = content.indexOf("：");
        if (colon == -1) {
            colon = content.indexOf(":");
        }
        if (colon != -1) {
            content = content.substring(colon + 1).trim();
        }
        return content.isEmpty() ? null : content;
    }

    /** 过滤停用词、空串和纯数字，避免污染词云结果。 */
    private boolean shouldCountWord(String word) {
        return !word.isEmpty()
                && !STOP_WORDS.contains(word)
                && !word.matches("-?\\d+(\\.\\d+)?");
    }

    private void unzip(String zipPath, String destDir) throws IOException {
        File dir = new File(destDir);
        if (!dir.exists()) dir.mkdirs();
        byte[] buf = new byte[4096];
        try (ZipInputStream zis = new ZipInputStream(new FileInputStream(zipPath))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                File out = newFile(dir, entry);
                if (entry.isDirectory()) {
                    out.mkdirs();
                } else {
                    out.getParentFile().mkdirs();
                    try (FileOutputStream fos = new FileOutputStream(out)) {
                        int len;
                        while ((len = zis.read(buf)) > 0) fos.write(buf, 0, len);
                    }
                }
            }
        }
    }

    private File newFile(File destDir, ZipEntry entry) throws IOException {
        File file = new File(destDir, entry.getName());
        if (!file.getCanonicalPath().startsWith(destDir.getCanonicalPath() + File.separator)) {
            throw new IOException("Zip slip detected: " + entry.getName());
        }
        return file;
    }
}

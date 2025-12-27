package com.example.demo_mock_server.handler;

import com.huaban.analysis.jieba.JiebaSegmenter;
import com.huaban.analysis.jieba.SegToken;
import io.vertx.core.Handler;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.RoutingContext;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class WordCloudHandler implements Handler<RoutingContext> {

    private static final String DATA_DIR = "data/HuChenFeng";
    // Expanded stop words list
    private static final Set<String> STOP_WORDS = new HashSet<>(Arrays.asList(
        "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好", "自己", "这",
        "那", "个", "吗", "吧", "啊", "什么", "因为", "所以", "但是", "而且", "这个", "那个", "其实", "只是", "还是", "或者", "如果", "就是", "这么", "那么", "怎么", "我们", "你们", "他们",
        "它", "她们", "它们", "位", "部", "个", "只", "次", "件", "本", "些", "点", "块", "张", "条", "支", "架", "台", "份", "颗", "株", "头", "匹", "口", "间", "所", "座", "栋", "层",
        "级", "种", "类", "群", "对", "把", "被", "让", "给", "为", "以", "由", "从", "自", "向", "往", "在", "当", "朝", "按", "照", "凭", "据", "依", "靠", "沿", "顺", "趁", "随", "同",
        "跟", "与", "及", "或", "而", "且", "但", "虽", "然", "即", "便", "纵", "不", "过", "只", "要", "只", "有", "除", "非", "无", "论", "不", "管", "嗯", "哦", "哎", "呀", "哈"
    ));

    @Override
    public void handle(RoutingContext ctx) {
        try {
            Map<String, Integer> wordCounts = new HashMap<>();
            JiebaSegmenter segmenter = new JiebaSegmenter();

            Path dataPath = Paths.get(DATA_DIR);
            if (!Files.exists(dataPath)) {
                 ctx.response()
                    .setStatusCode(404)
                    .end(new JsonObject().put("error", "Data directory not found: " + DATA_DIR).encode());
                 return;
            }

            try (Stream<Path> paths = Files.walk(dataPath)) {
                paths.filter(Files::isRegularFile)
                     .filter(p -> p.toString().endsWith(".md"))
                     .forEach(path -> processFile(path, segmenter, wordCounts));
            }

            List<Map.Entry<String, Integer>> sortedWords = wordCounts.entrySet().stream()
                .filter(e -> e.getKey().length() > 1) // Filter single characters
                .filter(e -> !STOP_WORDS.contains(e.getKey()))
                .sorted((e1, e2) -> e2.getValue().compareTo(e1.getValue()))
                .limit(200) // Increase limit to get more data
                .collect(Collectors.toList());

            JsonArray result = new JsonArray();
            for (Map.Entry<String, Integer> entry : sortedWords) {
                result.add(new JsonObject()
                    .put("name", entry.getKey())
                    .put("value", entry.getValue()));
            }

            ctx.response()
                .putHeader("Content-Type", "application/json; charset=utf-8")
                .end(result.encode());

        } catch (IOException e) {
            ctx.response()
                .setStatusCode(500)
                .end(new JsonObject().put("error", e.getMessage()).encode());
        }
    }

    private void processFile(Path path, JiebaSegmenter segmenter, Map<String, Integer> wordCounts) {
        try {
            List<String> lines = Files.readAllLines(path);
            for (String line : lines) {
                // Extract content after the arrow and speaker name if present
                // Format example: " 1→户晨风：这个刚开..." or " 2→" (empty) or " 3→某网友：..."
                int arrowIndex = line.indexOf("→");
                if (arrowIndex != -1) {
                    String content = line.substring(arrowIndex + 1).trim();
                    // Remove speaker name if present (e.g. "户晨风：" or "某网友：")
                    int colonIndex = content.indexOf("：");
                    if (colonIndex != -1 && colonIndex < 10) { // Assume speaker name is short
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
            }
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    private boolean isNumeric(String str) {
        return str.matches("-?\\d+(\\.\\d+)?");
    }
}

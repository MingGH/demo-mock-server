package run.runnable.numfeelservice.service;

import run.runnable.numfeelservice.controller.dto.GameplayResponses.SoritesBucket;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * SoritesService 纯逻辑测试（不依赖 DB），迁移自旧版同名测试。
 */
class SoritesServiceTest {

    // 用匿名子类访问 protected 方法，传 null DatabaseClient（纯逻辑不触发 DB）
    private final SoritesService service = new SoritesService(null) {
    };

    @Test
    void median_odd_count() {
        assertEquals(3, service.median(Arrays.asList(1, 3, 5)));
    }

    @Test
    void median_even_count() {
        assertEquals(3, service.median(Arrays.asList(1, 2, 4, 5)));
    }

    @Test
    void median_single_element() {
        assertEquals(42, service.median(Collections.singletonList(42)));
    }

    @Test
    void median_empty_list() {
        assertEquals(0, service.median(Collections.emptyList()));
    }

    @Test
    void median_null_list() {
        assertEquals(0, service.median(null));
    }

    @Test
    void median_unsorted_input() {
        assertEquals(3, service.median(Arrays.asList(5, 1, 3)));
    }

    @Test
    void bucketize_basic() {
        List<Integer> values = Arrays.asList(500, 1500, 2500, 3500, 4500);
        List<SoritesBucket> result = service.bucketize(values, 5, 5000);
        assertEquals(5, result.size());
        for (int i = 0; i < 5; i++) {
            assertEquals(1, result.get(i).count());
        }
    }

    @Test
    void bucketize_empty() {
        List<SoritesBucket> result = service.bucketize(Collections.emptyList(), 5, 5000);
        assertEquals(5, result.size());
        for (int i = 0; i < 5; i++) {
            assertEquals(0, result.get(i).count());
        }
    }

    @Test
    void bucketize_edge_values() {
        List<Integer> values = Arrays.asList(0, 10000);
        List<SoritesBucket> result = service.bucketize(values, 10, 10000);
        assertEquals(10, result.size());
        assertEquals(1, result.get(0).count());
        assertEquals(1, result.get(9).count());
    }

    @Test
    void bucketize_labels_correct() {
        List<SoritesBucket> result = service.bucketize(Collections.emptyList(), 3, 300);
        assertEquals("0-100", result.get(0).label());
        assertEquals("100-200", result.get(1).label());
        assertEquals("200-300", result.get(2).label());
    }

    @Test
    void bucketize_all_in_one_bucket() {
        List<Integer> values = Arrays.asList(50, 60, 70, 80, 90);
        List<SoritesBucket> result = service.bucketize(values, 10, 1000);
        assertEquals(5, result.get(0).count());
        for (int i = 1; i < 10; i++) {
            assertEquals(0, result.get(i).count());
        }
    }
}

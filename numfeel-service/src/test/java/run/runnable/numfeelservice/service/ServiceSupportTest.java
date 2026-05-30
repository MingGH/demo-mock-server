package run.runnable.numfeelservice.service;

import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class ServiceSupportTest {

    @Test
    void clampLimitShouldReturnLimitWhenInRange() {
        assertEquals(50, ServiceSupport.clampLimit(50, 1, 100));
    }

    @Test
    void clampLimitShouldReturnAtMinBoundary() {
        assertEquals(1, ServiceSupport.clampLimit(1, 1, 100));
    }

    @Test
    void clampLimitShouldReturnAtMaxBoundary() {
        assertEquals(100, ServiceSupport.clampLimit(100, 1, 100));
    }

    @Test
    void clampLimitShouldClampBelowMin() {
        assertEquals(1, ServiceSupport.clampLimit(0, 1, 100));
        assertEquals(1, ServiceSupport.clampLimit(-5, 1, 100));
    }

    @Test
    void clampLimitShouldClampAboveMax() {
        assertEquals(100, ServiceSupport.clampLimit(200, 1, 100));
        assertEquals(100, ServiceSupport.clampLimit(101, 1, 100));
    }

    @Test
    void roundShouldRoundToSpecifiedScale() {
        assertEquals(3.3, ServiceSupport.round(3.333, 1));
        assertEquals(3.33, ServiceSupport.round(3.333, 2));
        assertEquals(3.334, ServiceSupport.round(3.3335, 3));
    }

    @Test
    void roundShouldHandleNegativeValues() {
        assertEquals(-3.3, ServiceSupport.round(-3.333, 1));
        assertEquals(-3.34, ServiceSupport.round(-3.336, 2));
    }

    @Test
    void roundShouldHandleZero() {
        assertEquals(0.0, ServiceSupport.round(0.0, 1));
        assertEquals(0.0, ServiceSupport.round(0.0, 0));
    }

    @Test
    void roundShouldHandleZeroScale() {
        assertEquals(3.0, ServiceSupport.round(3.3, 0));
        assertEquals(4.0, ServiceSupport.round(3.5, 0));
    }

    @Test
    void percentageShouldCalculateCorrectly() {
        assertEquals(50.0, ServiceSupport.percentage(5, 10, 1));
        assertEquals(33.3, ServiceSupport.percentage(1, 3, 1));
        assertEquals(33.33, ServiceSupport.percentage(1, 3, 2));
    }

    @Test
    void percentageShouldReturnZeroWhenDenominatorIsZero() {
        assertEquals(0.0, ServiceSupport.percentage(5, 0, 1));
    }

    @Test
    void percentageShouldReturnZeroWhenDenominatorIsNegative() {
        assertEquals(0.0, ServiceSupport.percentage(5, -1, 1));
    }

    @Test
    void percentageShouldHandleHundredPercent() {
        assertEquals(100.0, ServiceSupport.percentage(10, 10, 1));
    }

    @Test
    void percentageShouldHandleZeroPercent() {
        assertEquals(0.0, ServiceSupport.percentage(0, 10, 1));
    }

    @Test
    void ratioShouldCalculateCorrectly() {
        assertEquals(0.5, ServiceSupport.ratio(5, 10, 1));
        assertEquals(0.33, ServiceSupport.ratio(1, 3, 2));
        assertEquals(0.667, ServiceSupport.ratio(2, 3, 3));
    }

    @Test
    void ratioShouldReturnZeroWhenDenominatorIsZero() {
        assertEquals(0.0, ServiceSupport.ratio(5, 0, 1));
    }

    @Test
    void ratioShouldReturnZeroWhenDenominatorIsNegative() {
        assertEquals(0.0, ServiceSupport.ratio(5, -1, 1));
    }

    @Test
    void distinctNonNullCountShouldCountUniqueNonNullValues() {
        List<String> items = Arrays.asList("a", "b", "a", "c", null, "b");
        assertEquals(3, ServiceSupport.distinctNonNullCount(items, s -> s));
    }

    @Test
    void distinctNonNullCountShouldReturnZeroForAllNulls() {
        List<String> items = Arrays.asList(null, null);
        assertEquals(0, ServiceSupport.distinctNonNullCount(items, s -> s));
    }

    @Test
    void distinctNonNullCountShouldReturnZeroForEmptyList() {
        assertEquals(0, ServiceSupport.distinctNonNullCount(List.of(), s -> s));
    }

    @Test
    void distinctNonNullCountShouldHandleNumericValues() {
        List<Integer> items = List.of(1, 2, 2, 3, 1);
        assertEquals(3, ServiceSupport.distinctNonNullCount(items, i -> i));
    }

    @Test
    void countByShouldGroupAndCount() {
        List<String> items = List.of("A", "B", "A", "C", "B", "A");
        Map<String, Long> result = ServiceSupport.countBy(items, s -> s);
        assertEquals(3L, result.get("A"));
        assertEquals(2L, result.get("B"));
        assertEquals(1L, result.get("C"));
    }

    @Test
    void countByShouldReturnEmptyMapForEmptyList() {
        Map<String, Long> result = ServiceSupport.countBy(List.<String>of(), s -> s);
        assertTrue(result.isEmpty());
    }

    @Test
    void countByShouldPreserveInsertionOrder() {
        List<String> items = List.of("Z", "X", "Y", "Z");
        Map<String, Long> result = ServiceSupport.countBy(items, s -> s);
        List<String> keys = List.copyOf(result.keySet());
        assertEquals("Z", keys.get(0));
        assertEquals("X", keys.get(1));
        assertEquals("Y", keys.get(2));
    }

    @Test
    void countByShouldHandleExtractorFunction() {
        record Person(String name, String grade) {}
        List<Person> people = List.of(
                new Person("Alice", "A"),
                new Person("Bob", "B"),
                new Person("Charlie", "A")
        );
        Map<String, Long> result = ServiceSupport.countBy(people, Person::grade);
        assertEquals(2L, result.get("A"));
        assertEquals(1L, result.get("B"));
    }

    @Test
    void mostFrequentOrDefaultShouldReturnMostFrequent() {
        List<String> items = List.of("A", "B", "A", "C", "B", "A");
        String result = ServiceSupport.mostFrequentOrDefault(items, s -> s, "DEFAULT");
        assertEquals("A", result);
    }

    @Test
    void mostFrequentOrDefaultShouldReturnDefaultForEmptyList() {
        String result = ServiceSupport.mostFrequentOrDefault(List.<String>of(), s -> s, "DEFAULT");
        assertEquals("DEFAULT", result);
    }

    @Test
    void mostFrequentOrDefaultShouldWorkWithSingleElement() {
        List<Integer> items = List.of(42);
        Integer result = ServiceSupport.mostFrequentOrDefault(items, i -> i, -1);
        assertEquals(42, result);
    }

    @Test
    void mostFrequentOrDefaultShouldHandleTiesByReturningOneOfThem() {
        List<String> items = List.of("A", "B", "C");
        String result = ServiceSupport.mostFrequentOrDefault(items, s -> s, "DEFAULT");
        assertNotNull(result);
        assertTrue(List.of("A", "B", "C").contains(result));
    }

    @Test
    void sortedShouldSortAscending() {
        List<Integer> items = List.of(3, 1, 4, 1, 5);
        List<Integer> result = ServiceSupport.sorted(items, Comparator.naturalOrder());
        assertEquals(List.of(1, 1, 3, 4, 5), result);
    }

    @Test
    void sortedShouldSortDescending() {
        List<Integer> items = List.of(3, 1, 4, 1, 5);
        List<Integer> result = ServiceSupport.sorted(items, Comparator.reverseOrder());
        assertEquals(List.of(5, 4, 3, 1, 1), result);
    }

    @Test
    void sortedShouldHandleEmptyList() {
        List<String> result = ServiceSupport.sorted(List.<String>of(), Comparator.naturalOrder());
        assertTrue(result.isEmpty());
    }

    @Test
    void sortedShouldNotModifyOriginalList() {
        List<Integer> original = List.of(3, 1, 2);
        List<Integer> result = ServiceSupport.sorted(original, Comparator.naturalOrder());
        assertNotSame(original, result);
        assertEquals(List.of(3, 1, 2), original);
    }
}

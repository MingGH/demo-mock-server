package run.runnable.numfeelservice.service.dht;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 最小化 Bencode 编解码器，支持 DHT KRPC 协议所需的四种类型：
 * 整数、字节串、列表、字典。
 */
public final class Bencode {

    private Bencode() {}

    // ── 编码 ──────────────────────────────────────────

    /** 将 Java 对象编码为 bencode 字节数组。 */
    public static byte[] encode(Object obj) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        encodeInto(obj, out);
        return out.toByteArray();
    }

    @SuppressWarnings("unchecked")
    private static void encodeInto(Object obj, ByteArrayOutputStream out) {
        if (obj instanceof byte[] bytes) {
            out.writeBytes(Integer.toString(bytes.length).getBytes(StandardCharsets.US_ASCII));
            out.write(':');
            out.writeBytes(bytes);
        } else if (obj instanceof String s) {
            byte[] bytes = s.getBytes(StandardCharsets.UTF_8);
            out.writeBytes(Integer.toString(bytes.length).getBytes(StandardCharsets.US_ASCII));
            out.write(':');
            out.writeBytes(bytes);
        } else if (obj instanceof Integer i) {
            out.write('i');
            out.writeBytes(Integer.toString(i).getBytes(StandardCharsets.US_ASCII));
            out.write('e');
        } else if (obj instanceof Long l) {
            out.write('i');
            out.writeBytes(Long.toString(l).getBytes(StandardCharsets.US_ASCII));
            out.write('e');
        } else if (obj instanceof List<?> list) {
            out.write('l');
            for (Object item : list) encodeInto(item, out);
            out.write('e');
        } else if (obj instanceof Map<?, ?> map) {
            out.write('d');
            // BEP-5 要求 dict key 按字典序排列
            List<String> keys = new ArrayList<>(((Map<String, ?>) map).keySet());
            keys.sort(String::compareTo);
            for (String key : keys) {
                encodeInto(key, out);
                encodeInto(((Map<String, ?>) map).get(key), out);
            }
            out.write('e');
        } else {
            throw new IllegalArgumentException("Unsupported type: " + obj.getClass());
        }
    }

    // ── 解码 ──────────────────────────────────────────

    /** 将 bencode 字节数组解码为 Java 对象。 */
    public static Object decode(byte[] data) {
        int[] pos = {0};
        return decodeNext(data, pos);
    }

    private static Object decodeNext(byte[] data, int[] pos) {
        if (pos[0] >= data.length) throw new IllegalArgumentException("Unexpected end of data");
        byte c = data[pos[0]];
        if (c == 'i') {
            return decodeInt(data, pos);
        } else if (c == 'l') {
            return decodeList(data, pos);
        } else if (c == 'd') {
            return decodeDict(data, pos);
        } else if (c >= '0' && c <= '9') {
            return decodeBytes(data, pos);
        } else {
            throw new IllegalArgumentException("Invalid bencode at pos " + pos[0] + ": " + (char) c);
        }
    }

    private static long decodeInt(byte[] data, int[] pos) {
        pos[0]++; // skip 'i'
        int end = indexOf(data, (byte) 'e', pos[0]);
        String numStr = new String(data, pos[0], end - pos[0], StandardCharsets.US_ASCII);
        pos[0] = end + 1;
        return Long.parseLong(numStr);
    }

    private static byte[] decodeBytes(byte[] data, int[] pos) {
        int colonIdx = indexOf(data, (byte) ':', pos[0]);
        String lenStr = new String(data, pos[0], colonIdx - pos[0], StandardCharsets.US_ASCII);
        int len = Integer.parseInt(lenStr);
        pos[0] = colonIdx + 1;
        byte[] result = new byte[len];
        System.arraycopy(data, pos[0], result, 0, len);
        pos[0] += len;
        return result;
    }

    private static List<Object> decodeList(byte[] data, int[] pos) {
        pos[0]++; // skip 'l'
        List<Object> list = new ArrayList<>();
        while (data[pos[0]] != 'e') {
            list.add(decodeNext(data, pos));
        }
        pos[0]++; // skip 'e'
        return list;
    }

    private static Map<String, Object> decodeDict(byte[] data, int[] pos) {
        pos[0]++; // skip 'd'
        Map<String, Object> dict = new LinkedHashMap<>();
        while (data[pos[0]] != 'e') {
            byte[] keyBytes = decodeBytes(data, pos);
            String key = new String(keyBytes, StandardCharsets.UTF_8);
            Object val = decodeNext(data, pos);
            dict.put(key, val);
        }
        pos[0]++; // skip 'e'
        return dict;
    }

    private static int indexOf(byte[] data, byte target, int from) {
        for (int i = from; i < data.length; i++) {
            if (data[i] == target) return i;
        }
        throw new IllegalArgumentException("Byte not found: " + (char) target);
    }
}

package run.runnable.numfeelservice.service.dht;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class BencodeTest {

    @Test
    void encodeAndDecodeInteger() {
        byte[] encoded = Bencode.encode(42);
        assertEquals("i42e", new String(encoded, StandardCharsets.US_ASCII));
        Object decoded = Bencode.decode(encoded);
        assertEquals(42L, decoded);
    }

    @Test
    void encodeAndDecodeNegativeInteger() {
        byte[] encoded = Bencode.encode(-7);
        assertEquals("i-7e", new String(encoded, StandardCharsets.US_ASCII));
        Object decoded = Bencode.decode(encoded);
        assertEquals(-7L, decoded);
    }

    @Test
    void encodeAndDecodeString() {
        byte[] encoded = Bencode.encode("spam");
        assertEquals("4:spam", new String(encoded, StandardCharsets.US_ASCII));
        Object decoded = Bencode.decode(encoded);
        assertArrayEquals("spam".getBytes(), (byte[]) decoded);
    }

    @Test
    void encodeAndDecodeByteArray() {
        byte[] data = {0x01, 0x02, 0x03};
        byte[] encoded = Bencode.encode(data);
        Object decoded = Bencode.decode(encoded);
        assertArrayEquals(data, (byte[]) decoded);
    }

    @Test
    @SuppressWarnings("unchecked")
    void encodeAndDecodeList() {
        List<Object> list = List.of("spam", 42);
        byte[] encoded = Bencode.encode(list);
        Object decoded = Bencode.decode(encoded);
        assertInstanceOf(List.class, decoded);
        List<Object> decodedList = (List<Object>) decoded;
        assertEquals(2, decodedList.size());
        assertArrayEquals("spam".getBytes(), (byte[]) decodedList.get(0));
        assertEquals(42L, decodedList.get(1));
    }

    @Test
    @SuppressWarnings("unchecked")
    void encodeAndDecodeDict() {
        Map<String, Object> dict = new LinkedHashMap<>();
        dict.put("cow", "moo");
        dict.put("spam", "eggs");
        byte[] encoded = Bencode.encode(dict);
        Object decoded = Bencode.decode(encoded);
        assertInstanceOf(Map.class, decoded);
        Map<String, Object> decodedDict = (Map<String, Object>) decoded;
        assertArrayEquals("moo".getBytes(), (byte[]) decodedDict.get("cow"));
        assertArrayEquals("eggs".getBytes(), (byte[]) decodedDict.get("spam"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void encodeGetPeersQuery() {
        // Verify we can encode a proper get_peers query per BEP-5
        Map<String, Object> query = new LinkedHashMap<>();
        query.put("t", "aa");
        query.put("y", "q");
        query.put("q", "get_peers");
        Map<String, Object> args = new LinkedHashMap<>();
        args.put("id", "abcdefghij0123456789".getBytes(StandardCharsets.US_ASCII));
        args.put("info_hash", "mnopqrstuvwxyz123456".getBytes(StandardCharsets.US_ASCII));
        query.put("a", args);

        byte[] encoded = Bencode.encode(query);
        assertNotNull(encoded);
        assertTrue(encoded.length > 0);

        // Verify round-trip
        Map<String, Object> decoded = (Map<String, Object>) Bencode.decode(encoded);
        assertArrayEquals("aa".getBytes(), (byte[]) decoded.get("t"));
        assertArrayEquals("q".getBytes(), (byte[]) decoded.get("y"));
        assertArrayEquals("get_peers".getBytes(), (byte[]) decoded.get("q"));
    }

    @Test
    void decodeBep5Example() {
        // BEP-5 example: d1:ad2:id20:abcdefghij01234567899:info_hash20:mnopqrstuvwxyz123456e1:q9:get_peers1:t2:aa1:y1:qe
        String benStr = "d1:ad2:id20:abcdefghij01234567899:info_hash20:mnopqrstuvwxyz123456e1:q9:get_peers1:t2:aa1:y1:qe";
        byte[] data = benStr.getBytes(StandardCharsets.US_ASCII);

        @SuppressWarnings("unchecked")
        Map<String, Object> decoded = (Map<String, Object>) Bencode.decode(data);
        assertNotNull(decoded);
        assertArrayEquals("get_peers".getBytes(), (byte[]) decoded.get("q"));
        assertArrayEquals("aa".getBytes(), (byte[]) decoded.get("t"));
        assertArrayEquals("q".getBytes(), (byte[]) decoded.get("y"));

        @SuppressWarnings("unchecked")
        Map<String, Object> a = (Map<String, Object>) decoded.get("a");
        assertNotNull(a);
        assertArrayEquals("abcdefghij0123456789".getBytes(), (byte[]) a.get("id"));
        assertArrayEquals("mnopqrstuvwxyz123456".getBytes(), (byte[]) a.get("info_hash"));
    }
}

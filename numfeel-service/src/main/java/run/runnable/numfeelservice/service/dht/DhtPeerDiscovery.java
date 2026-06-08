package run.runnable.numfeelservice.service.dht;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.SocketTimeoutException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 最小化 DHT 客户端，实现 BEP-5 的 get_peers 查询。
 * <p>
 * 工作流程：
 * 1. 向 bootstrap 节点发送 find_node，获取初始路由表
 * 2. 对目标 infohash 迭代发送 get_peers
 * 3. 收集返回的 peer 紧凑信息（IP:port）
 * <p>
 * 此类设计为短生命周期使用：创建 → 查询 → 关闭。
 * 线程安全性：非线程安全，应在单线程中使用。
 */
public class DhtPeerDiscovery implements AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(DhtPeerDiscovery.class);

    /** 公共 DHT bootstrap 节点。 */
    private static final String[][] BOOTSTRAP_NODES = {
            {"router.bittorrent.com", "6881"},
            {"dht.transmissionbt.com", "6881"},
            {"router.utorrent.com", "6881"},
            {"dht.libtorrent.org", "25401"}
    };

    private static final int SOCKET_TIMEOUT_MS = 2000;
    private static final int BATCH_RECV_TIMEOUT_MS = 600;
    private static final int BATCH_TOTAL_MS = 3500;
    private static final int MAX_BATCH_SIZE = 50;
    private static final int MAX_ITERATIONS = 8;
    private static final int MAX_PEERS = 1000;
    private static final long MAX_TOTAL_MS = 18_000;

    private final byte[] nodeId;
    private final DatagramSocket socket;
    private final Random random = new Random();
    private int txCounter = 0;

    public DhtPeerDiscovery() throws Exception {
        this.nodeId = generateNodeId();
        this.socket = new DatagramSocket();
        this.socket.setSoTimeout(SOCKET_TIMEOUT_MS);
    }

    /**
     * 对给定 infohash 执行 DHT peer 发现。
     *
     * @param infohashHex 40 字符的十六进制 infohash
     * @return 发现的 peer 列表（IP:port）
     */
    public List<DiscoveredPeer> discoverPeers(String infohashHex) {
        byte[] infohash = hexToBytes(infohashHex);
        Set<String> seenPeers = new HashSet<>();
        List<DiscoveredPeer> peers = new ArrayList<>();
        List<NodeInfo> nodesToQuery = new ArrayList<>();
        long startTime = System.currentTimeMillis();

        // 第一步：从 bootstrap 节点获取初始节点
        for (String[] bootstrap : BOOTSTRAP_NODES) {
            if (System.currentTimeMillis() - startTime > MAX_TOTAL_MS) break;
            try {
                InetAddress addr = InetAddress.getByName(bootstrap[0]);
                int port = Integer.parseInt(bootstrap[1]);
                List<NodeInfo> found = sendFindNode(addr, port, infohash);
                nodesToQuery.addAll(found);
            } catch (Exception e) {
                log.debug("Bootstrap {} failed: {}", bootstrap[0], e.getMessage());
            }
        }

        log.info("Bootstrap complete, got {} initial nodes", nodesToQuery.size());

        // 第二步：批量迭代 get_peers（同一轮节点全部并发发出，再统一收回复）
        Set<String> queriedNodes = new HashSet<>();
        for (int iter = 0; iter < MAX_ITERATIONS && peers.size() < MAX_PEERS; iter++) {
            if (elapsed(startTime) > MAX_TOTAL_MS) break;

            List<NodeInfo> batch = nodesToQuery.stream()
                    .filter(n -> queriedNodes.add(nodeKey(n)))
                    .limit(MAX_BATCH_SIZE)
                    .collect(Collectors.toList());

            if (batch.isEmpty()) break;

            try {
                socket.setSoTimeout(BATCH_RECV_TIMEOUT_MS);
            } catch (java.net.SocketException e) {
                log.warn("Failed to set batch timeout: {}", e.getMessage());
                break;
            }
            List<NodeInfo> nextRound = batchQueryGetPeers(batch, infohash, seenPeers, peers);
            nodesToQuery = nextRound;
            log.debug("Iteration {}: {} peers found, {} nodes for next round",
                    iter + 1, peers.size(), nodesToQuery.size());
        }

        log.info("DHT discovery complete for {}: {} peers found in {}ms",
                infohashHex.substring(0, 8), peers.size(), System.currentTimeMillis() - startTime);
        return peers;
    }

    @Override
    public void close() {
        if (socket != null && !socket.isClosed()) {
            socket.close();
        }
    }

    // ── 批量 get_peers 查询 ──────────────────────────────────────────

    /**
     * 批量 get_peers：对所有待查节点并发发出 UDP 查询，再循环收回复。
     * <p>
     * 相比串行逐个发收，此方法在同一时间段内可查询数十个节点。
     */
    @SuppressWarnings("unchecked")
    private List<NodeInfo> batchQueryGetPeers(List<NodeInfo> nodes, byte[] infohash,
                                               Set<String> seenPeers, List<DiscoveredPeer> peers) {
        Map<String, NodeInfo> pending = new LinkedHashMap<>();

        for (NodeInfo node : nodes) {
            String txId = nextTxId();
            try {
                byte[] encoded = buildGetPeersQuery(txId, infohash);
                DatagramPacket packet = new DatagramPacket(encoded, encoded.length,
                        node.address(), node.port());
                socket.send(packet);
                pending.put(txId, node);
            } catch (Exception e) {
                log.debug("Send to {} failed: {}", node.address(), e.getMessage());
            }
        }

        if (pending.isEmpty()) return List.of();

        long deadline = System.currentTimeMillis() + BATCH_TOTAL_MS;
        List<NodeInfo> nextRound = new ArrayList<>();
        byte[] buf = new byte[4096];

        while (!pending.isEmpty() && System.currentTimeMillis() < deadline) {
            try {
                DatagramPacket recv = new DatagramPacket(buf, buf.length);
                socket.receive(recv);
                byte[] data = new byte[recv.getLength()];
                System.arraycopy(recv.getData(), recv.getOffset(), data, 0, recv.getLength());

                Map<String, Object> decoded = (Map<String, Object>) Bencode.decode(data);
                String txId = decoded.get("t") instanceof byte[] tb
                        ? new String(tb, java.nio.charset.StandardCharsets.UTF_8) : null;
                if (txId == null) continue;

                NodeInfo node = pending.remove(txId);
                if (node == null) continue;

                Map<String, Object> r = (Map<String, Object>) decoded.get("r");
                if (r == null) continue;

                Object valuesObj = r.get("values");
                if (valuesObj instanceof List<?> valuesList) {
                    for (Object v : valuesList) {
                        if (v instanceof byte[] compact && compact.length == 6) {
                            DiscoveredPeer peer = parsePeerCompact(compact);
                            if (seenPeers.add(peer.ip() + ":" + peer.port())) {
                                peers.add(peer);
                            }
                        }
                    }
                }

                Object nodesObj = r.get("nodes");
                if (nodesObj instanceof byte[] nodesBytes) {
                    nextRound.addAll(parseCompactNodes(nodesBytes));
                }
            } catch (SocketTimeoutException e) {
                break;
            } catch (Exception e) {
                log.debug("Failed to process batch response: {}", e.getMessage());
            }
        }

        return nextRound;
    }

    /** 构建 get_peers 查询消息的 bencode 字节。 */
    private byte[] buildGetPeersQuery(String txId, byte[] infohash) throws Exception {
        Map<String, Object> query = new LinkedHashMap<>();
        query.put("t", txId);
        query.put("y", "q");
        query.put("q", "get_peers");
        Map<String, Object> args = new LinkedHashMap<>();
        args.put("id", nodeId);
        args.put("info_hash", infohash);
        query.put("a", args);
        return Bencode.encode(query);
    }

    private static long elapsed(long startTime) {
        return System.currentTimeMillis() - startTime;
    }

    private static String nodeKey(NodeInfo node) {
        return node.address().getHostAddress() + ":" + node.port();
    }

    // ── KRPC 消息构建与解析 ──────────────────────────────────────────

    private List<NodeInfo> sendFindNode(InetAddress addr, int port, byte[] target) throws Exception {
        Map<String, Object> query = new LinkedHashMap<>();
        query.put("t", nextTxId());
        query.put("y", "q");
        query.put("q", "find_node");
        Map<String, Object> args = new LinkedHashMap<>();
        args.put("id", nodeId);
        args.put("target", target);
        query.put("a", args);

        byte[] response = sendAndReceive(query, addr, port);
        if (response == null) return List.of();

        return parseNodesFromResponse(response);
    }

    @SuppressWarnings("unchecked")
    private GetPeersResult sendGetPeers(InetAddress addr, int port, byte[] infohash) throws Exception {
        Map<String, Object> query = new LinkedHashMap<>();
        query.put("t", nextTxId());
        query.put("y", "q");
        query.put("q", "get_peers");
        Map<String, Object> args = new LinkedHashMap<>();
        args.put("id", nodeId);
        args.put("info_hash", infohash);
        query.put("a", args);

        byte[] response = sendAndReceive(query, addr, port);
        if (response == null) return new GetPeersResult(null, null);

        Map<String, Object> decoded = (Map<String, Object>) Bencode.decode(response);
        Map<String, Object> r = (Map<String, Object>) decoded.get("r");
        if (r == null) return new GetPeersResult(null, null);

        List<DiscoveredPeer> peers = null;
        List<NodeInfo> nodes = null;

        // 解析 values（peer 列表）
        Object valuesObj = r.get("values");
        if (valuesObj instanceof List<?> valuesList) {
            peers = new ArrayList<>();
            for (Object v : valuesList) {
                if (v instanceof byte[] compact && compact.length == 6) {
                    peers.add(parsePeerCompact(compact));
                }
            }
        }

        // 解析 nodes（更近的节点）
        Object nodesObj = r.get("nodes");
        if (nodesObj instanceof byte[] nodesBytes) {
            nodes = parseCompactNodes(nodesBytes);
        }

        return new GetPeersResult(peers, nodes);
    }

    private byte[] sendAndReceive(Map<String, Object> message, InetAddress addr, int port) throws Exception {
        byte[] encoded = Bencode.encode(message);
        DatagramPacket packet = new DatagramPacket(encoded, encoded.length, addr, port);
        socket.send(packet);

        byte[] buf = new byte[4096];
        DatagramPacket recv = new DatagramPacket(buf, buf.length);
        socket.receive(recv); // 可能抛 SocketTimeoutException
        byte[] data = new byte[recv.getLength()];
        System.arraycopy(recv.getData(), recv.getOffset(), data, 0, recv.getLength());
        return data;
    }

    // ── 紧凑格式解析 ──────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private List<NodeInfo> parseNodesFromResponse(byte[] response) {
        try {
            Map<String, Object> decoded = (Map<String, Object>) Bencode.decode(response);
            Map<String, Object> r = (Map<String, Object>) decoded.get("r");
            if (r == null) return List.of();
            Object nodesObj = r.get("nodes");
            if (nodesObj instanceof byte[] nodesBytes) {
                return parseCompactNodes(nodesBytes);
            }
        } catch (Exception e) {
            log.debug("Failed to parse find_node response: {}", e.getMessage());
        }
        return List.of();
    }

    /** 解析紧凑节点信息：20字节 node ID + 4字节 IP + 2字节端口 = 26字节/节点。 */
    private List<NodeInfo> parseCompactNodes(byte[] data) {
        List<NodeInfo> nodes = new ArrayList<>();
        for (int i = 0; i + 26 <= data.length; i += 26) {
            try {
                InetAddress addr = InetAddress.getByAddress(new byte[]{
                        data[i + 20], data[i + 21], data[i + 22], data[i + 23]
                });
                int port = ((data[i + 24] & 0xFF) << 8) | (data[i + 25] & 0xFF);
                if (port > 0 && port < 65536) {
                    nodes.add(new NodeInfo(addr, port));
                }
            } catch (Exception ignored) {}
        }
        return nodes;
    }

    /** 解析紧凑 peer 信息：4字节 IP + 2字节端口 = 6字节/peer。 */
    private DiscoveredPeer parsePeerCompact(byte[] compact) {
        String ip = (compact[0] & 0xFF) + "." + (compact[1] & 0xFF) + "."
                + (compact[2] & 0xFF) + "." + (compact[3] & 0xFF);
        int port = ((compact[4] & 0xFF) << 8) | (compact[5] & 0xFF);
        return new DiscoveredPeer(ip, port);
    }

    // ── 工具方法 ──────────────────────────────────────────

    private byte[] generateNodeId() {
        byte[] id = new byte[20];
        random.nextBytes(id);
        return id;
    }

    private String nextTxId() {
        txCounter++;
        return String.valueOf((char) ((txCounter >> 8) & 0xFF)) + (char) (txCounter & 0xFF);
    }

    static byte[] hexToBytes(String hex) {
        int len = hex.length();
        byte[] data = new byte[len / 2];
        for (int i = 0; i < len; i += 2) {
            data[i / 2] = (byte) ((Character.digit(hex.charAt(i), 16) << 4)
                    + Character.digit(hex.charAt(i + 1), 16));
        }
        return data;
    }

    // ── 内部记录 ──────────────────────────────────────────

    record NodeInfo(InetAddress address, int port) {}
    public record DiscoveredPeer(String ip, int port) {}
    record GetPeersResult(List<DiscoveredPeer> peers, List<NodeInfo> nodes) {}
}

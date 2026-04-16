package com.example.demo_mock_server.service;

import io.vertx.core.Future;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.LinkedList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Email Tracking Pixel demo 的内存数据服务。
 */
public class EmailTrackingPixelService {

    private static final int MAX_EVENTS = 240;
    private static final DateTimeFormatter TIME_FORMATTER =
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
            .withLocale(Locale.SIMPLIFIED_CHINESE)
            .withZone(ZoneId.systemDefault());

    private static final Map<String, ModeProfile> MODE_PROFILES = createModeProfiles();

    private final GeoLocationService geoLocationService;
    private final AtomicLong sequence = new AtomicLong(0);
    private final Deque<TrackedEvent> events = new LinkedList<>();
    private final Map<String, RecipientAggregate> recipients = new ConcurrentHashMap<>();

    public EmailTrackingPixelService(GeoLocationService geoLocationService) {
        this.geoLocationService = geoLocationService;
    }

    public Future<JsonObject> recordOpen(String uid,
                                         String campaignId,
                                         String recipient,
                                         String mailbox,
                                         String mode,
                                         String pixelId,
                                         String sourceIp,
                                         String userAgent) {
        long now = System.currentTimeMillis();
        ModeProfile profile = resolveMode(mode);
        String resolvedIp = resolveIp(profile, sourceIp);
        String location = resolveLocation(profile, resolvedIp);

        TrackedEvent event = new TrackedEvent(
            sequence.incrementAndGet(),
            uid,
            campaignId,
            recipient,
            mailbox,
            pixelId,
            profile.key(),
            profile.label(),
            profile.note(),
            resolvedIp,
            location,
            now,
            trim(userAgent, 160),
            profile.proxy(),
            profile.prefetchLike()
        );

        RecipientAggregate aggregate;
        long totalEvents;
        synchronized (this) {
            events.addFirst(event);
            while (events.size() > MAX_EVENTS) {
                events.removeLast();
            }

            String recipientKey = buildRecipientKey(uid, campaignId, recipient);
            aggregate = recipients.computeIfAbsent(
                recipientKey,
                ignored -> new RecipientAggregate(uid, campaignId, recipient, mailbox, pixelId)
            );
            aggregate.apply(event);
            totalEvents = events.size();
        }

        return Future.succeededFuture(new JsonObject()
            .put("eventId", event.id())
            .put("uid", uid)
            .put("campaignId", campaignId)
            .put("recipient", recipient)
            .put("pathLabel", event.pathLabel())
            .put("proxy", event.proxy())
            .put("prefetchLike", event.prefetchLike())
            .put("ip", event.ip())
            .put("location", event.location())
            .put("openedAt", event.openedAt())
            .put("openedAtText", formatTime(event.openedAt()))
            .put("recipientOpenCount", aggregate.openCount)
            .put("totalEvents", totalEvents)
        );
    }

    public Future<JsonObject> stats() {
        synchronized (this) {
            return Future.succeededFuture(buildStatsPayload());
        }
    }

    public Future<JsonObject> reset() {
        synchronized (this) {
            events.clear();
            recipients.clear();
        }
        return Future.succeededFuture(new JsonObject().put("ok", true));
    }

    private JsonObject buildStatsPayload() {
        List<RecipientAggregate> recipientRows = new ArrayList<>(recipients.values());
        recipientRows.sort((a, b) -> Long.compare(b.lastOpenedAt, a.lastOpenedAt));

        Map<String, Integer> modeBreakdown = new LinkedHashMap<>();
        long proxyEvents = 0;
        long prefetchLikeEvents = 0;
        long directEvents = 0;
        long latestOpenedAt = 0;

        JsonArray eventArray = new JsonArray();
        for (TrackedEvent event : events) {
            modeBreakdown.merge(event.pathKey(), 1, Integer::sum);
            if (event.proxy()) proxyEvents++;
            if (event.prefetchLike()) prefetchLikeEvents++;
            if (!event.proxy()) directEvents++;
            latestOpenedAt = Math.max(latestOpenedAt, event.openedAt());
            eventArray.add(event.toJson());
        }

        JsonArray recipientArray = new JsonArray();
        for (RecipientAggregate row : recipientRows) {
            recipientArray.add(row.toJson());
        }

        JsonArray breakdownArray = new JsonArray();
        for (Map.Entry<String, Integer> entry : modeBreakdown.entrySet()) {
            ModeProfile profile = resolveMode(entry.getKey());
            breakdownArray.add(new JsonObject()
                .put("key", profile.key())
                .put("label", profile.label())
                .put("count", entry.getValue())
            );
        }

        return new JsonObject()
            .put("summary", new JsonObject()
                .put("openEvents", events.size())
                .put("uniqueRecipients", recipients.size())
                .put("directEvents", directEvents)
                .put("proxyEvents", proxyEvents)
                .put("prefetchLikeEvents", prefetchLikeEvents)
                .put("latestOpenedAt", latestOpenedAt == 0 ? null : latestOpenedAt)
                .put("latestOpenedAtText", latestOpenedAt == 0 ? "还没有请求" : formatTime(latestOpenedAt))
            )
            .put("modeBreakdown", breakdownArray)
            .put("recipients", recipientArray)
            .put("events", eventArray);
    }

    private ModeProfile resolveMode(String rawMode) {
        if (rawMode == null) return MODE_PROFILES.get("direct");
        return MODE_PROFILES.getOrDefault(rawMode.trim().toLowerCase(Locale.ROOT), MODE_PROFILES.get("direct"));
    }

    private String resolveIp(ModeProfile profile, String sourceIp) {
        if (profile.fixedIp() != null) {
            return profile.fixedIp();
        }
        if (sourceIp == null || sourceIp.isBlank()) {
            return "127.0.0.1";
        }
        return sourceIp;
    }

    private String resolveLocation(ModeProfile profile, String ip) {
        if (isLocalIp(ip)) {
            return "开发机本地";
        }

        JsonObject geo = geoLocationService != null ? geoLocationService.lookup(ip) : new JsonObject();
        String city = trim(geo.getString("city"), 64);
        String country = trim(geo.getString("country"), 64);
        if (city != null && country != null) return city + " / " + country;
        if (country != null && !"Unknown".equalsIgnoreCase(country)) return country;
        return profile.fallbackLocation();
    }

    private boolean isLocalIp(String ip) {
        return "127.0.0.1".equals(ip) || "::1".equals(ip) || "0:0:0:0:0:0:0:1".equals(ip) || "localhost".equalsIgnoreCase(ip);
    }

    private String formatTime(long ts) {
        return TIME_FORMATTER.format(Instant.ofEpochMilli(ts));
    }

    private String buildRecipientKey(String uid, String campaignId, String recipient) {
        return uid + "|" + campaignId + "|" + recipient;
    }

    private String trim(String value, int maxLen) {
        if (value == null) return null;
        String cleaned = value.trim();
        if (cleaned.isEmpty()) return null;
        return cleaned.length() > maxLen ? cleaned.substring(0, maxLen) : cleaned;
    }

    private static Map<String, ModeProfile> createModeProfiles() {
        Map<String, ModeProfile> map = new LinkedHashMap<>();
        map.put("direct", new ModeProfile(
            "direct",
            "本地直连打开",
            "图片请求直接到达你的服务器，最接近真实用户打开。",
            null,
            "用户出口 IP",
            false,
            false
        ));
        map.put("gmail-proxy", new ModeProfile(
            "gmail-proxy",
            "Gmail 图片代理",
            "请求经过 Google 图片代理，能看到打开，但拿到的是代理出口 IP。",
            "66.249.84.139",
            "Google 图片代理出口",
            true,
            false
        ));
        map.put("apple-mpp", new ModeProfile(
            "apple-mpp",
            "Apple Mail 隐私保护",
            "Apple Mail 可能在用户真正阅读前后台预取远程内容。",
            "17.58.102.14",
            "Apple Mail 隐私代理",
            true,
            true
        ));
        map.put("security-gateway", new ModeProfile(
            "security-gateway",
            "企业安全网关预检",
            "部分企业邮箱会在投递前扫描图片和链接，请求可能早于真人阅读。",
            "40.94.28.17",
            "邮件安全网关",
            true,
            true
        ));
        return map;
    }

    private record ModeProfile(String key,
                               String label,
                               String note,
                               String fixedIp,
                               String fallbackLocation,
                               boolean proxy,
                               boolean prefetchLike) {
    }

    private record TrackedEvent(long id,
                                String uid,
                                String campaignId,
                                String recipient,
                                String mailbox,
                                String pixelId,
                                String pathKey,
                                String pathLabel,
                                String note,
                                String ip,
                                String location,
                                long openedAt,
                                String userAgent,
                                boolean proxy,
                                boolean prefetchLike) {

        JsonObject toJson() {
            return new JsonObject()
                .put("id", id)
                .put("uid", uid)
                .put("campaignId", campaignId)
                .put("recipient", recipient)
                .put("mailbox", mailbox)
                .put("pixelId", pixelId)
                .put("pathKey", pathKey)
                .put("pathLabel", pathLabel)
                .put("note", note)
                .put("ip", ip)
                .put("location", location)
                .put("openedAt", openedAt)
                .put("openedAtText", TIME_FORMATTER.format(Instant.ofEpochMilli(openedAt)))
                .put("proxy", proxy)
                .put("prefetchLike", prefetchLike)
                .put("userAgent", userAgent);
        }
    }

    private static final class RecipientAggregate {
        private final String uid;
        private final String campaignId;
        private final String recipient;
        private final String mailbox;
        private final String pixelId;
        private final LinkedHashSet<String> pathLabels = new LinkedHashSet<>();
        private final LinkedHashSet<String> ips = new LinkedHashSet<>();
        private final LinkedHashSet<String> locations = new LinkedHashSet<>();

        private long firstOpenedAt;
        private long lastOpenedAt;
        private int openCount;
        private String lastPathLabel;
        private String lastNote;
        private boolean hasDirectOpen;
        private boolean hasPrefetchLikeOpen;

        private RecipientAggregate(String uid, String campaignId, String recipient, String mailbox, String pixelId) {
            this.uid = uid;
            this.campaignId = campaignId;
            this.recipient = recipient;
            this.mailbox = mailbox;
            this.pixelId = pixelId;
        }

        private void apply(TrackedEvent event) {
            openCount++;
            if (firstOpenedAt == 0 || event.openedAt() < firstOpenedAt) {
                firstOpenedAt = event.openedAt();
            }
            if (event.openedAt() >= lastOpenedAt) {
                lastOpenedAt = event.openedAt();
                lastPathLabel = event.pathLabel();
                lastNote = event.note();
            }
            pathLabels.add(event.pathLabel());
            ips.add(event.ip());
            locations.add(event.location());
            hasDirectOpen = hasDirectOpen || !event.proxy();
            hasPrefetchLikeOpen = hasPrefetchLikeOpen || event.prefetchLike();
        }

        private JsonObject toJson() {
            return new JsonObject()
                .put("uid", uid)
                .put("campaignId", campaignId)
                .put("recipient", recipient)
                .put("mailbox", mailbox)
                .put("pixelId", pixelId)
                .put("openCount", openCount)
                .put("firstOpenedAt", firstOpenedAt)
                .put("firstOpenedAtText", TIME_FORMATTER.format(Instant.ofEpochMilli(firstOpenedAt)))
                .put("lastOpenedAt", lastOpenedAt)
                .put("lastOpenedAtText", TIME_FORMATTER.format(Instant.ofEpochMilli(lastOpenedAt)))
                .put("lastPathLabel", lastPathLabel)
                .put("lastNote", lastNote)
                .put("uniqueIpCount", ips.size())
                .put("uniqueIps", new JsonArray(new ArrayList<>(ips)))
                .put("uniqueLocations", new JsonArray(new ArrayList<>(locations)))
                .put("pathLabels", new JsonArray(new ArrayList<>(pathLabels)))
                .put("hasDirectOpen", hasDirectOpen)
                .put("hasPrefetchLikeOpen", hasPrefetchLikeOpen);
        }
    }
}

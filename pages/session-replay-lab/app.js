const API_BASE = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? window.location.origin
  : "https://numfeel-api.996.ninja";

const SAMPLE_SESSION = {
  sessionId: "00000000-0000-4000-8000-000000000001",
  questionCount: 5,
  durationMs: 26500,
  eventCount: 19,
  typedChars: 33,
  focusSwitches: 5,
  maxScrollPct: 74,
  createdAt: Date.now(),
  answers: {
    dailyApp: "地图",
    videoTime: "晚上躺床",
    hesitation: ["是否留手机号", "是否开定位权限"],
    purchaseNote: "一把人体工学椅，购物车里躺了快两周。",
    shareScore: 8
  },
  events: [
    { ts: 0, type: "focus", target: "dailyApp" },
    { ts: 380, type: "input", target: "dailyApp", value: "地" },
    { ts: 760, type: "input", target: "dailyApp", value: "地图" },
    { ts: 1320, type: "blur", target: "dailyApp" },
    { ts: 1720, type: "change", target: "videoTime", value: "晚上躺床" },
    { ts: 3650, type: "scroll", target: "page", value: "38%", meta: { scrollPct: 38 } },
    { ts: 4700, type: "change", target: "hesitation", value: "是否留手机号", meta: { selected: "是否留手机号" } },
    { ts: 5620, type: "change", target: "hesitation", value: "是否留手机号 | 是否开定位权限", meta: { selected: "是否留手机号 | 是否开定位权限" } },
    { ts: 6850, type: "focus", target: "purchaseNote" },
    { ts: 7360, type: "input", target: "purchaseNote", value: "一把人体工学椅" },
    { ts: 8420, type: "input", target: "purchaseNote", value: "一把人体工学椅，购物车里躺了快两周。" },
    { ts: 10420, type: "scroll", target: "page", value: "74%", meta: { scrollPct: 74 } },
    { ts: 11820, type: "blur", target: "purchaseNote" },
    { ts: 13350, type: "focus", target: "shareScore" },
    { ts: 13920, type: "input", target: "shareScore", value: "7" },
    { ts: 14740, type: "input", target: "shareScore", value: "8" },
    { ts: 15420, type: "blur", target: "shareScore" },
    { ts: 24100, type: "click", target: "submitBtn", value: "结束录制" },
    { ts: 26500, type: "submit", target: "form", value: "session saved" }
  ]
};

const state = {
  sessionId: null,
  startedAt: 0,
  recording: false,
  events: [],
  typedChars: 0,
  focusSwitches: 0,
  maxScrollPct: 0,
  lastFocusedField: "",
  latestValues: {},
  playbackTimers: [],
  currentSession: null
};

document.addEventListener("DOMContentLoaded", () => {
  bindUi();
  bindTracking();
  loadStats();
  loadSessionFromQuery();
});

function bindUi() {
  const consentBtn = document.getElementById("consentBtn");
  const declineBtn = document.getElementById("declineBtn");
  const loadSampleBtn = document.getElementById("loadSampleBtn");
  const startOwnBtn = document.getElementById("startOwnBtn");
  const copyLinkBtn = document.getElementById("copyLinkBtn");
  const form = document.getElementById("replayForm");
  const slider = document.getElementById("shareScore");

  consentBtn.addEventListener("click", startRecordingSession);
  declineBtn.addEventListener("click", () => {
    closePrivacyModal();
    renderReplaySession(SAMPLE_SESSION, "内置示例");
    startPlayback();
  });
  loadSampleBtn.addEventListener("click", () => {
    closePrivacyModal();
    renderReplaySession(SAMPLE_SESSION, "内置示例");
    startPlayback();
  });
  startOwnBtn.addEventListener("click", startRecordingSession);
  copyLinkBtn.addEventListener("click", copyCurrentLink);
  form.addEventListener("submit", submitSession);
  slider.addEventListener("input", () => {
    document.getElementById("shareScoreValue").textContent = slider.value;
  });

  document.getElementById("playBtn").addEventListener("click", startPlayback);
  document.getElementById("restartBtn").addEventListener("click", resetPlaybackView);
}

function bindTracking() {
  const form = document.getElementById("replayForm");

  form.addEventListener("focusin", (event) => {
    const target = event.target;
    if (!isTrackable(target) || !state.recording) return;
    const field = target.dataset.track;
    if (state.lastFocusedField !== field) {
      state.focusSwitches += 1;
      state.lastFocusedField = field;
    }
    highlightFormField(field, true);
    recordEvent("focus", field);
  });

  form.addEventListener("focusout", (event) => {
    const target = event.target;
    if (!isTrackable(target) || !state.recording) return;
    const field = target.dataset.track;
    highlightFormField(field, false);
    recordEvent("blur", field);
  });

  form.addEventListener("input", (event) => {
    const target = event.target;
    if (!isTrackable(target) || !state.recording) return;
    const field = target.dataset.track;

    if (target.type === "radio" || target.type === "checkbox") {
      return;
    }

    const value = getFieldValue(target);
    const prevValue = state.latestValues[field] || "";
    if (typeof value === "string" && typeof prevValue === "string") {
      state.typedChars += Math.max(0, value.length - prevValue.length);
    }
    state.latestValues[field] = value;

    const meta = {};
    if (typeof value === "string") {
      meta.length = value.length;
    }
    recordEvent("input", field, stringifyValue(value), meta);
  });

  form.addEventListener("change", (event) => {
    const target = event.target;
    if (!isTrackable(target) || !state.recording) return;
    const field = target.dataset.track;
    const value = getFieldValue(target);
    state.latestValues[field] = value;

    const meta = {};
    if (target.type === "checkbox") {
      meta.selected = getCheckboxValues(target.name).join(" | ");
    }
    recordEvent("change", field, stringifyValue(value), meta);
  });

  window.addEventListener("scroll", throttle(() => {
    if (!state.recording) return;
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    const pct = Math.min(100, Math.max(0, window.scrollY / max * 100));
    state.maxScrollPct = Math.max(state.maxScrollPct, round1(pct));
    recordEvent("scroll", "page", `${round1(pct)}%`, { scrollPct: round1(pct) });
  }, 220));
}

function startRecordingSession() {
  closePrivacyModal();
  document.getElementById("liveSection").style.display = "grid";
  document.getElementById("replayForm").reset();
  document.getElementById("shareScore").value = "6";
  document.getElementById("shareScoreValue").textContent = "6";
  document.getElementById("submitBtn").disabled = false;
  document.getElementById("replaySource").textContent = "还没有回放记录";

  stopPlayback();
  resetRecordingState();
  window.scrollTo({ top: 0, behavior: "smooth" });

  state.sessionId = crypto.randomUUID();
  state.startedAt = performance.now();
  state.recording = true;
  recordEvent("session-start", "page", "recording");
}

function resetRecordingState() {
  state.events = [];
  state.typedChars = 0;
  state.focusSwitches = 0;
  state.maxScrollPct = 0;
  state.lastFocusedField = "";
  state.latestValues = {};
  updateMetrics();
  renderEventFeed();
  document.querySelectorAll(".question-card.active").forEach((node) => node.classList.remove("active"));
}

async function submitSession(event) {
  event.preventDefault();
  if (!state.recording) return;

  const form = document.getElementById("replayForm");
  if (!form.reportValidity()) return;

  recordEvent("click", "submitBtn", "结束录制");
  const payload = buildPayload();
  state.recording = false;
  document.getElementById("submitBtn").disabled = true;

  try {
    const resp = await fetch(`${API_BASE}/session-replay/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const json = await resp.json();
    if (!resp.ok || json.status !== 200) {
      throw new Error(json.message || "submit failed");
    }

    const session = await fetchSession(payload.sessionId);
    renderReplaySession(session || payload, session ? "服务端回放" : "本地回放");
    if (session) {
      replaceQuerySession(payload.sessionId);
    }
  } catch (error) {
    console.warn("submit session failed", error);
    renderReplaySession(payload, "本地回放");
  }

  loadStats();
  startPlayback();
}

function buildPayload() {
  const answers = {
    dailyApp: document.getElementById("dailyApp").value.trim(),
    videoTime: getRadioValue("videoTime"),
    hesitation: getCheckboxValues("hesitation"),
    purchaseNote: document.getElementById("purchaseNote").value.trim(),
    shareScore: Number(document.getElementById("shareScore").value)
  };

  const durationMs = Math.max(0, Math.round(performance.now() - state.startedAt));
  recordEvent("submit", "form", "session saved");

  return {
    sessionId: state.sessionId,
    questionCount: 5,
    durationMs,
    eventCount: state.events.length,
    typedChars: state.typedChars,
    focusSwitches: state.focusSwitches,
    maxScrollPct: round1(state.maxScrollPct),
    answers,
    events: state.events.slice()
  };
}

function recordEvent(type, target, value, meta) {
  if (!state.startedAt) return;
  const event = {
    ts: Math.max(0, Math.round(performance.now() - state.startedAt)),
    type,
    target
  };
  if (value != null && value !== "") {
    event.value = String(value);
  }
  if (meta && Object.keys(meta).length > 0) {
    event.meta = meta;
  }

  state.events.push(event);
  updateMetrics();
  renderEventFeed();
}

function updateMetrics() {
  document.getElementById("metricEvents").textContent = String(state.events.length);
  document.getElementById("metricTyped").textContent = String(state.typedChars);
  document.getElementById("metricFocus").textContent = String(state.focusSwitches);
  document.getElementById("metricScroll").textContent = `${round1(state.maxScrollPct)}%`;
}

function renderEventFeed() {
  const container = document.getElementById("eventFeed");
  if (state.events.length === 0) {
    container.innerHTML = '<div class="placeholder">开始操作后，这里会滚动显示最近的事件。</div>';
    return;
  }

  const latest = state.events.slice(-6).reverse();
  container.innerHTML = latest.map((event) => `
    <div class="event-item">
      <strong>${escapeHtml(describeEvent(event))}</strong>
      <small>${formatMs(event.ts)}</small>
    </div>
  `).join("");
}

function renderReplaySession(session, sourceLabel) {
  state.currentSession = normalizeSession(session);
  document.getElementById("playBtn").disabled = false;
  document.getElementById("restartBtn").disabled = false;
  document.getElementById("replaySource").textContent = sourceLabel;

  const cards = [
    { value: formatDuration(state.currentSession.durationMs), label: "录制时长" },
    { value: `${state.currentSession.eventCount}`, label: "总事件数" },
    { value: `${state.currentSession.typedChars}`, label: "输入字符" },
    { value: `${round1(state.currentSession.maxScrollPct)}%`, label: "最大滚动" }
  ];
  document.getElementById("summaryGrid").innerHTML = cards.map((item) => `
    <div class="summary-card">
      <div class="summary-value">${escapeHtml(item.value)}</div>
      <div class="summary-label">${escapeHtml(item.label)}</div>
    </div>
  `).join("");

  renderTimeline(state.currentSession.events);
  resetPlaybackView();
}

function normalizeSession(session) {
  const events = Array.isArray(session.events) ? session.events : [];
  return {
    sessionId: session.sessionId,
    questionCount: session.questionCount || 5,
    durationMs: session.durationMs || 0,
    eventCount: session.eventCount || events.length,
    typedChars: session.typedChars || 0,
    focusSwitches: session.focusSwitches || 0,
    maxScrollPct: session.maxScrollPct || 0,
    createdAt: session.createdAt || Date.now(),
    answers: session.answers || {},
    events
  };
}

function renderTimeline(events) {
  const container = document.getElementById("timelineList");
  if (!events || events.length === 0) {
    container.innerHTML = '<div class="placeholder">没有可回放的事件。</div>';
    return;
  }
  container.innerHTML = events.map((event, index) => `
    <div class="timeline-item" id="timeline-item-${index}">
      <strong>${escapeHtml(describeEvent(event))}</strong>
      <small>${formatMs(event.ts)} · ${escapeHtml(event.target)}</small>
    </div>
  `).join("");
}

function resetPlaybackView() {
  stopPlayback();
  resetReplayStateUi();
  document.getElementById("progressText").textContent = state.currentSession
    ? "已载入，可点击播放"
    : "等待数据";
}

function resetReplayStateUi() {
  document.querySelectorAll(".timeline-item.active").forEach((node) => node.classList.remove("active"));
  document.querySelectorAll(".replay-question.active").forEach((node) => node.classList.remove("active"));

  document.getElementById("replay-dailyApp").textContent = "未填写";
  document.getElementById("replay-purchaseNote").textContent = "未填写";
  document.getElementById("replay-shareScore").textContent = "0 / 10";
  document.getElementById("replay-scoreFill").style.width = "0%";
  document.getElementById("scrollProgressFill").style.width = "0%";
  document.getElementById("playbackClock").textContent = "00:00";

  document.querySelectorAll("#replay-videoTime .chip").forEach((node) => node.classList.remove("active"));
  document.querySelectorAll("#replay-hesitation span").forEach((node) => node.classList.remove("active"));
}

function startPlayback() {
  if (!state.currentSession || !state.currentSession.events.length) return;

  stopPlayback();
  resetReplayStateUi();

  const speed = Number(document.getElementById("speedSelect").value) || 1;
  const events = state.currentSession.events;
  document.getElementById("playBtn").disabled = true;
  document.getElementById("progressText").textContent = `播放中，速度 ${speed}x`;

  events.forEach((event, index) => {
    const timer = window.setTimeout(() => {
      applyReplayEvent(event, index);
    }, Math.round(event.ts / speed));
    state.playbackTimers.push(timer);
  });

  const doneTimer = window.setTimeout(() => {
    document.getElementById("playBtn").disabled = false;
    document.getElementById("progressText").textContent = "回放结束，可重新播放";
  }, Math.round((state.currentSession.durationMs + 200) / speed));
  state.playbackTimers.push(doneTimer);
}

function stopPlayback() {
  state.playbackTimers.forEach((timer) => clearTimeout(timer));
  state.playbackTimers = [];
  document.getElementById("playBtn").disabled = !state.currentSession;
}

function applyReplayEvent(event, index) {
  highlightTimeline(index);
  setReplayClock(event.ts);

  if (event.type === "focus") {
    highlightReplayField(event.target, true);
    return;
  }

  if (event.type === "blur") {
    highlightReplayField(event.target, false);
    return;
  }

  if (event.type === "scroll") {
    const pct = event.meta && typeof event.meta.scrollPct === "number"
      ? event.meta.scrollPct
      : parseFloat(String(event.value || "0").replace("%", ""));
    document.getElementById("scrollProgressFill").style.width = `${round1(pct)}%`;
    return;
  }

  if (event.type === "input" || event.type === "change") {
    applyReplayValue(event.target, event.value || "", event.meta || {});
    return;
  }

  if (event.type === "click" || event.type === "submit") {
    document.getElementById("progressText").textContent = describeEvent(event);
  }
}

function applyReplayValue(target, value, meta) {
  if (target === "dailyApp") {
    document.getElementById("replay-dailyApp").textContent = value || "未填写";
    highlightReplayField(target, true);
    return;
  }

  if (target === "purchaseNote") {
    document.getElementById("replay-purchaseNote").textContent = value || "未填写";
    highlightReplayField(target, true);
    return;
  }

  if (target === "videoTime") {
    document.querySelectorAll("#replay-videoTime .chip").forEach((node) => {
      node.classList.toggle("active", node.textContent === value);
    });
    highlightReplayField(target, true);
    return;
  }

  if (target === "hesitation") {
    const selected = meta.selected
      ? meta.selected.split("|").map((item) => item.trim()).filter(Boolean)
      : String(value).split("|").map((item) => item.trim()).filter(Boolean);
    document.querySelectorAll("#replay-hesitation span").forEach((node) => {
      node.classList.toggle("active", selected.includes(node.textContent));
    });
    highlightReplayField(target, true);
    return;
  }

  if (target === "shareScore") {
    const numeric = Math.max(0, Math.min(10, Number(value || 0)));
    document.getElementById("replay-shareScore").textContent = `${numeric} / 10`;
    document.getElementById("replay-scoreFill").style.width = `${numeric * 10}%`;
    highlightReplayField(target, true);
  }
}

async function loadStats() {
  try {
    const resp = await fetch(`${API_BASE}/session-replay/stats`);
    const json = await resp.json();
    if (!resp.ok || json.status !== 200) {
      throw new Error("stats failed");
    }
    renderStats(json.data);
  } catch (error) {
    console.warn("load stats failed", error);
    document.getElementById("serverStats").innerHTML =
      '<div class="placeholder">统计暂时不可用，完成一条录制后再刷新试试。</div>';
  }
}

function renderStats(data) {
  const global = data.global || {};
  const recent = Array.isArray(data.recent) ? data.recent : [];
  const total = Number(global.totalSessions || 0);

  if (!total) {
    document.getElementById("serverStats").innerHTML =
      '<div class="placeholder">还没有真实会话数据。先录一段，再回来看这里。</div>';
    return;
  }

  const statsHtml = `
    <div class="stats-kpis">
      <div class="mini"><strong>${total}</strong><span>累计会话</span></div>
      <div class="mini"><strong>${formatDuration(global.avgDurationMs || 0)}</strong><span>平均时长</span></div>
      <div class="mini"><strong>${round1(global.avgEventCount || 0)}</strong><span>平均事件数</span></div>
      <div class="mini"><strong>${round1(global.avgMaxScrollPct || 0)}%</strong><span>平均滚动深度</span></div>
    </div>
    <div class="side-title"><i class="ti ti-clock-hour-4"></i> 最近录制</div>
    <div class="recent-list">
      ${recent.map((item) => `
        <div class="recent-item" data-session-id="${escapeHtml(item.sessionId)}">
          <strong>${shortSessionId(item.sessionId)}</strong>
          <small>${formatDuration(item.durationMs)} · ${item.eventCount} 个事件 · ${round1(item.maxScrollPct)}% 滚动</small>
        </div>
      `).join("")}
    </div>
  `;

  const container = document.getElementById("serverStats");
  container.innerHTML = statsHtml;
  container.querySelectorAll(".recent-item").forEach((node) => {
    node.addEventListener("click", async () => {
      const sessionId = node.dataset.sessionId;
      const session = await fetchSession(sessionId);
      if (session) {
        renderReplaySession(session, "服务端历史记录");
        replaceQuerySession(sessionId);
      }
    });
  });
}

async function fetchSession(sessionId) {
  try {
    const resp = await fetch(`${API_BASE}/session-replay/session/${encodeURIComponent(sessionId)}`);
    const json = await resp.json();
    if (!resp.ok || json.status !== 200) {
      throw new Error("fetch session failed");
    }
    return json.data;
  } catch (error) {
    console.warn("fetch session failed", error);
    return null;
  }
}

async function loadSessionFromQuery() {
  const sessionId = new URLSearchParams(window.location.search).get("session");
  if (!sessionId) return;
  closePrivacyModal();
  const session = await fetchSession(sessionId);
  if (session) {
    renderReplaySession(session, "服务端历史记录");
  }
}

function replaceQuerySession(sessionId) {
  const url = new URL(window.location.href);
  url.searchParams.set("session", sessionId);
  window.history.replaceState({}, "", url);
}

function closePrivacyModal() {
  const modal = document.getElementById("privacyModal");
  if (modal) {
    modal.style.display = "none";
  }
}

function copyCurrentLink() {
  navigator.clipboard.writeText(window.location.href)
    .then(() => {
      document.getElementById("copyLinkBtn").innerHTML = '<i class="ti ti-check"></i> 已复制';
      window.setTimeout(() => {
        document.getElementById("copyLinkBtn").innerHTML = '<i class="ti ti-link"></i> 复制当前页链接';
      }, 1500);
    })
    .catch(() => {});
}

function highlightFormField(field, active) {
  const wrapper = document.querySelector(`[data-track-wrapper="${field}"]`);
  if (wrapper) {
    wrapper.classList.toggle("active", active);
  }
}

function highlightReplayField(field, active) {
  const wrapper = document.querySelector(`[data-replay-wrapper="${field}"]`);
  if (wrapper) {
    wrapper.classList.toggle("active", active);
  }
}

function highlightTimeline(index) {
  document.querySelectorAll(".timeline-item.active").forEach((node) => node.classList.remove("active"));
  const current = document.getElementById(`timeline-item-${index}`);
  if (current) {
    current.classList.add("active");
    current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function setReplayClock(ms) {
  document.getElementById("playbackClock").textContent = formatMs(ms);
}

function getFieldValue(target) {
  if (target.type === "radio") {
    return target.checked ? target.value : getRadioValue(target.name);
  }
  if (target.type === "checkbox") {
    return getCheckboxValues(target.name);
  }
  if (target.type === "range") {
    return String(target.value);
  }
  return target.value;
}

function getRadioValue(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : "";
}

function getCheckboxValues(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map((node) => node.value);
}

function isTrackable(target) {
  return Boolean(target && target.dataset && target.dataset.track);
}

function stringifyValue(value) {
  if (Array.isArray(value)) {
    return value.join(" | ");
  }
  return String(value);
}

function describeEvent(event) {
  const targetLabel = {
    dailyApp: "第一个 App",
    videoTime: "刷短视频时间段",
    hesitation: "犹豫项",
    purchaseNote: "最近一次犹豫购物",
    shareScore: "推荐分数",
    page: "页面",
    submitBtn: "提交按钮",
    form: "问卷表单"
  }[event.target] || event.target;

  if (event.type === "focus") return `聚焦到 ${targetLabel}`;
  if (event.type === "blur") return `离开 ${targetLabel}`;
  if (event.type === "scroll") return `滚动到 ${event.value || "当前位置"}`;
  if (event.type === "input") return `${targetLabel} 输入为：${event.value || ""}`;
  if (event.type === "change") return `${targetLabel} 选择了：${event.value || ""}`;
  if (event.type === "click") return `点击 ${targetLabel}`;
  if (event.type === "submit") return "会话提交完成";
  return `${event.type} · ${targetLabel}`;
}

function shortSessionId(sessionId) {
  return `${sessionId.slice(0, 8)}...${sessionId.slice(-4)}`;
}

function formatDuration(ms) {
  if (!ms) return "0 秒";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec} 秒`;
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes} 分 ${seconds} 秒`;
}

function formatMs(ms) {
  const totalSec = Math.floor(ms / 1000);
  const minutes = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const seconds = String(totalSec % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function round1(num) {
  return Math.round(Number(num || 0) * 10) / 10;
}

function throttle(fn, wait) {
  let last = 0;
  return function throttled() {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      fn();
    }
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ========== Network tab 抓不到的数据通道 ==========
(function () {
  var API_BASE = 'https://numfeel-api.996.ninja';
  var WS_BASE = 'wss://numfeel-api.996.ninja/stealth-channel/ws';
  var HTTP_TARGET = API_BASE + '/stats';

  // WebRTC 配对状态
  var room = null;
  var ws = null;
  var pc = null;
  var dc = null;
  var isCaller = false;

  // ── 渲染通道卡片 ──
  function renderChannels() {
    var grid = document.getElementById('channelGrid');
    grid.innerHTML = getChannels().map(function (ch) {
      var v = getVisibility(ch.id);
      var cardClass = ch.visibility === 'hidden' ? 'is-hidden' : (ch.visibility === 'none' ? 'is-none' : '');
      return '<div class="channel-card ' + cardClass + '" data-channel="' + ch.id + '">' +
        '<div class="ch-head">' +
          '<i class="ti ' + ch.icon + '"></i>' +
          '<span class="ch-name">' + ch.name + '</span>' +
          '<span class="vis-badge" style="color:' + v.color + '">' + v.label + '</span>' +
        '</div>' +
        '<p class="ch-desc">' + ch.desc + '</p>' +
        '<button class="ch-send-btn" data-send="' + ch.id + '"><i class="ti ti-send"></i> 发送秘密消息</button>' +
        '<div class="ch-log" data-log="' + ch.id + '"></div>' +
        '<div class="ch-hint">' + ch.hint + '</div>' +
      '</div>';
    }).join('');

    grid.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-send]');
      if (!btn) return;
      sendByChannel(btn.getAttribute('data-send'));
    });
  }

  // ── 通道发送分发（卡片点击） ──
  function sendByChannel(id) {
    var msg = formatMessage(id, 'secret-' + id);
    logChannel(id, msg);
    dispatch(msg);
  }

  function logChannel(id, msg) {
    var el = document.querySelector('[data-log="' + id + '"]');
    if (el) {
      el.innerHTML = '<span class="ok">已发送</span> token=<span class="token">' + msg.token + '</span>';
    }
  }

  function dispatch(msg) {
    switch (msg.channelId) {
      case 'fetch': sendFetch(msg); break;
      case 'beacon': sendBeacon(msg); break;
      case 'pixel': sendPixel(msg); break;
      case 'websocket': sendWebSocket(msg); break;
      case 'webrtc': sendWebRTC(msg); break;
      case 'postmessage': sendPostMessage(msg); break;
    }
  }

  // ── 各通道实现 ──
  function sendFetch(msg) {
    fetch(HTTP_TARGET + '?ch=fetch&t=' + msg.token, { method: 'GET', mode: 'cors' }).catch(function () {});
  }

  function sendBeacon(msg) {
    try { navigator.sendBeacon(HTTP_TARGET + '?ch=beacon&t=' + msg.token, msg.token); } catch (e) {}
  }

  function sendPixel(msg) {
    var img = new Image();
    img.src = HTTP_TARGET + '?ch=pixel&t=' + msg.token + '&_=' + Date.now();
  }

  function sendWebSocket(msg) {
    try {
      var w = new WebSocket(WS_BASE);
      w.onopen = function () {
        try { w.send(buildSignal('demo', 'demo', { ch: 'websocket', token: msg.token })); } catch (e) {}
      };
      w.onerror = function () {};
      setTimeout(function () { try { w.close(); } catch (e) {} }, 3000);
    } catch (e) {}
  }

  function sendWebRTC(msg) {
    if (!dc || dc.readyState !== 'open') {
      var el = document.querySelector('[data-log="webrtc"]');
      if (el) el.innerHTML = '<span style="color:#ff6b6b">DataChannel 未连接，请先在下方完成配对</span>';
      return;
    }
    dc.send(JSON.stringify({ channel: 'webrtc', token: msg.token, content: 'secret-webrtc' }));
  }

  function sendPostMessage(msg) {
    var iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.srcdoc = '<script>window.addEventListener("message",function(){})<\/script>';
    document.body.appendChild(iframe);
    setTimeout(function () {
      try { iframe.contentWindow.postMessage({ channel: 'postmessage', token: msg.token }, '*'); } catch (e) {}
      setTimeout(function () { try { document.body.removeChild(iframe); } catch (e) {} }, 500);
    }, 100);
  }

  // ── WebRTC 配对 ──
  function initPairing() {
    document.getElementById('newRoomBtn').addEventListener('click', createRoom);
    document.getElementById('joinRoomBtn').addEventListener('click', joinRoom);
    document.getElementById('copyLinkBtn').addEventListener('click', copyLink);
    document.getElementById('chatSendBtn').addEventListener('click', sendChat);
    document.getElementById('chatInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') sendChat();
    });
    var params = new URLSearchParams(location.search);
    var r = params.get('room');
    if (r) {
      document.getElementById('roomInput').value = r;
      joinRoom();
    }
  }

  function createRoom() {
    var code = generateRoomCode();
    document.getElementById('roomInput').value = code;
    updateShareLink(code);
    connectSignaling(code, false);
  }

  function joinRoom() {
    var raw = document.getElementById('roomInput').value;
    var code = normalizeRoomCode(raw);
    if (!isValidRoomCode(code)) {
      setStatus('房间号不合法（需 6 位）', 'waiting');
      return;
    }
    document.getElementById('roomInput').value = code;
    updateShareLink(code);
    connectSignaling(code, true); // 后加入者作为 caller 发起 offer
  }

  function updateShareLink(code) {
    document.getElementById('shareLink').value = location.origin + location.pathname + '?room=' + code;
  }

  function copyLink() {
    var input = document.getElementById('shareLink');
    input.select();
    try { document.execCommand('copy'); } catch (e) {}
  }

  function connectSignaling(code, caller) {
    room = code;
    isCaller = caller;
    if (ws) { try { ws.close(); } catch (e) {} }
    if (pc) { try { pc.close(); } catch (e) {} }
    pc = null;
    dc = null;
    enableChat(false);
    setStatus('正在连接信令服务器…', 'connecting');
    try {
      ws = new WebSocket(WS_BASE);
    } catch (e) {
      setStatus('信令服务器连接失败', 'waiting');
      return;
    }
    ws.onopen = function () {
      safeSend(buildSignal('join', room, null));
      setStatus(isCaller ? '已加入，正在发起连接…' : '已加入，等待对方…', 'connecting');
      setupPeer(isCaller);
    };
    ws.onmessage = function (e) {
      var sig = parseSignal(e.data);
      if (!sig) return;
      handleSignal(sig);
    };
    ws.onerror = function () { setStatus('信令连接出错', 'waiting'); };
  }

  function safeSend(msg) {
    try { if (ws && ws.readyState === WebSocket.OPEN) ws.send(msg); } catch (e) {}
  }

  function setupPeer(caller) {
    pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    pc.onicecandidate = function (e) {
      if (e.candidate) {
        var c = e.candidate.toJSON ? e.candidate.toJSON() : e.candidate;
        safeSend(buildSignal('ice', room, c));
      }
    };
    pc.onconnectionstatechange = function () {
      if (pc.connectionState === 'connected') {
        setStatus('P2P 已连接', 'connected');
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setStatus('连接断开', 'waiting');
        enableChat(false);
      }
    };
    if (caller) {
      dc = pc.createDataChannel('chat');
      bindDataChannel(dc);
      pc.createOffer().then(function (o) {
        return pc.setLocalDescription(o);
      }).then(function () {
        safeSend(buildSignal('offer', room, pc.localDescription));
      }).catch(function (e) { setStatus('建立连接失败: ' + e.message, 'waiting'); });
    } else {
      pc.ondatachannel = function (e) { dc = e.channel; bindDataChannel(dc); };
    }
  }

  function bindDataChannel(channel) {
    channel.onopen = function () {
      setStatus('P2P 已连接', 'connected');
      enableChat(true);
    };
    channel.onmessage = function (e) { appendChat('in', e.data); };
    channel.onclose = function () { enableChat(false); };
  }

  function handleSignal(sig) {
    if (sig.room !== room) return;
    if (sig.type === 'offer') {
      if (!pc) setupPeer(false);
      pc.setRemoteDescription(new RTCSessionDescription(sig.payload)).then(function () {
        return pc.createAnswer();
      }).then(function (a) {
        return pc.setLocalDescription(a);
      }).then(function () {
        safeSend(buildSignal('answer', room, pc.localDescription));
      }).catch(function () {});
    } else if (sig.type === 'answer') {
      if (pc) pc.setRemoteDescription(new RTCSessionDescription(sig.payload)).catch(function () {});
    } else if (sig.type === 'ice') {
      if (pc) pc.addIceCandidate(new RTCIceCandidate(sig.payload)).catch(function () {});
    }
  }

  function setStatus(text, cls) {
    var el = document.getElementById('pairStatus');
    el.className = 'pair-status' + (cls ? ' ' + cls : '');
    el.innerHTML = '<span class="status-dot ' + cls + '"></span> ' + text;
  }

  function enableChat(on) {
    document.getElementById('chatInput').disabled = !on;
    document.getElementById('chatSendBtn').disabled = !on;
  }

  function sendChat() {
    var input = document.getElementById('chatInput');
    var text = input.value.trim();
    if (!text || !dc || dc.readyState !== 'open') return;
    dc.send(text);
    appendChat('out', text);
    input.value = '';
  }

  function appendChat(dir, text) {
    var log = document.getElementById('chatLog');
    var empty = log.querySelector('.chat-empty');
    if (empty) log.innerHTML = '';
    var div = document.createElement('div');
    div.className = 'chat-msg ' + dir;
    var label = dir === 'in' ? '收到' : '已发';
    div.innerHTML = escapeHtml(text) + '<div class="meta">' + label + ' · ' + new Date().toLocaleTimeString() + '</div>';
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── 抓包挑战 ──
  function initChallenge() {
    document.getElementById('startChallengeBtn').addEventListener('click', startChallenge);
  }

  function startChallenge() {
    var btn = document.getElementById('startChallengeBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader"></i> 发送中…';
    var result = document.getElementById('challengeResult');
    result.innerHTML = '';

    var targets = ['fetch', 'beacon', 'pixel', 'websocket', 'webrtc', 'postmessage'];
    var messages = targets.map(function (id) { return formatMessage(id, 'challenge-' + id); });

    var html = messages.map(function (msg) {
      var ch = getChannel(msg.channelId);
      var catchable = isCatchable(msg.channelId);
      return '<div class="challenge-row">' +
        '<span class="ch-icon"><i class="ti ' + ch.icon + '"></i></span>' +
        '<span class="ch-title">' + ch.name + '</span>' +
        '<span class="token-tag">' + msg.token + '</span>' +
        '<span class="verdict ' + (catchable ? 'caught' : 'missed') + '">' +
          (catchable ? '可抓' : '抓不到') + '</span>' +
      '</div>';
    }).join('');
    result.innerHTML = html;

    messages.forEach(function (msg) { dispatch(msg); });

    var caughtCount = messages.filter(function (m) { return isCatchable(m.channelId); }).length;
    var summary = document.createElement('div');
    summary.className = 'challenge-summary miss';
    summary.innerHTML = '<strong>6 条消息已发出。</strong>其中 ' + caughtCount + ' 条能在 Network tab 找到 token，' +
      '<span style="color:#ff6b6b;font-weight:700">' + (6 - caughtCount) + ' 条抓不到</span>——' +
      'webrtc 走 P2P DataChannel、postMessage 不走网络，Network tab 对它们无能为力。' +
      '（webrtc 那条需先在上方完成配对才会真正发出）';
    result.appendChild(summary);

    setTimeout(function () {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-reload"></i> 再来一次';
    }, 800);
  }

  // ── 初始化 ──
  function init() {
    renderChannels();
    initPairing();
    initChallenge();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

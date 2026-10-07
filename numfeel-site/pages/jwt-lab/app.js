(function () {
  'use strict';

  const logic = window.JwtLabLogic;
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: '1001',
    name: '示例用户',
    role: 'user',
    iat: 1516239022,
    exp: 1516242622
  };

  const elements = {
    headerSegment: document.getElementById('headerSegment'),
    payloadSegment: document.getElementById('payloadSegment'),
    signatureSegment: document.getElementById('signatureSegment'),
    payloadInput: document.getElementById('payloadInput'),
    payloadNote: document.getElementById('payloadNote'),
    serverBadge: document.getElementById('serverBadge'),
    serverOutput: document.getElementById('serverOutput'),
    verdict: document.getElementById('verdict'),
    attackLog: document.getElementById('attackLog')
  };

  let currentHeader = { ...header };
  let currentPayload = { ...payload };
  let currentSignature = '';
  let serverConfig = {
    vulnerable: false,
    secret: 'demo-secret-not-in-dictionary'
  };
  let lastToken = '';
  let busy = false;

  const weakDictionary = ['secret', '123456', 'password', 'jwt', 'letmein'];

  function renderToken(updateTextarea = true) {
    const encodedHeader = logic.encodeJson(currentHeader);
    const encodedPayload = logic.encodeJson(currentPayload);
    elements.headerSegment.textContent = encodedHeader;
    elements.payloadSegment.textContent = encodedPayload;
    elements.signatureSegment.textContent = currentSignature || '空';
    elements.signatureSegment.classList.toggle('empty', !currentSignature);
    if (updateTextarea) {
      elements.payloadInput.value = JSON.stringify(currentPayload, null, 2);
    }
  }

  function buildCurrentToken() {
    return `${logic.encodeJson(currentHeader)}.${logic.encodeJson(currentPayload)}.${currentSignature}`;
  }

  function appendLog(message) {
    const item = document.createElement('div');
    item.textContent = message;
    elements.attackLog.appendChild(item);
    elements.attackLog.scrollTop = elements.attackLog.scrollHeight;
  }

  function renderServer() {
    elements.serverOutput.textContent = serverConfig.vulnerable
      ? '服务器模式：漏洞服务。\n算法白名单：未执行。\n验签：未强制执行。'
      : '服务器模式：严格服务。\n算法白名单：HS256。\n验签：已强制执行。';
  }

  function showVerdict(kind, title, text) {
    elements.verdict.className = `verdict ${kind}`;
    elements.verdict.replaceChildren();
    const strong = document.createElement('strong');
    strong.textContent = title;
    const span = document.createElement('span');
    span.textContent = text;
    elements.verdict.append(strong, span);
    elements.serverBadge.textContent = kind === 'valid' ? '验证通过' : '验证失败';
    elements.serverBadge.className = `status-badge ${kind}`;
  }

  function showAlgNoneAccepted() {
    showVerdict('invalid', '模拟服务器：验证通过，欢迎你，admin。', '这台服务没有坚持验签，也没有白名单算法。');
    elements.serverBadge.textContent = '验证通过';
    elements.serverBadge.className = 'status-badge invalid';
  }

  async function refreshVerification() {
    const token = buildCurrentToken();
    lastToken = token;
    renderServer();

    if (serverConfig.vulnerable && currentHeader.alg === 'none' && currentPayload.role === 'admin') {
      showAlgNoneAccepted();
      appendLog('模拟服务器接受了 alg=none token。');
      return;
    }

    const result = await logic.verifyToken(token, serverConfig.secret, ['HS256']);

    if (!serverConfig.vulnerable && currentHeader.alg === 'none') {
      showVerdict('danger', 'alg=none 被白名单拦下。', '这正是必须固定签名算法的原因。');
      appendLog('alg=none 伪造被白名单拒绝。');
      return;
    }

    if (result.valid) {
      showVerdict('valid', '签名有效。', '服务器可以相信这条 token 没被改过。');
      appendLog('签名有效。');
      return;
    }

    showVerdict('invalid', '签名无效。', '服务器应当拒绝这条 token。');
    appendLog('签名校验失败。');
  }

  async function signCurrentToken(secret) {
    serverConfig.secret = secret;
    currentHeader.alg = 'HS256';
    const signed = await logic.signHs256(currentHeader, currentPayload, serverConfig.secret);
    currentSignature = signed.signature;
    renderToken();
    await refreshVerification();
  }

  async function applyScene(scene) {
    if (scene === 'secure') {
      serverConfig = { vulnerable: false, secret: 'demo-secret-not-in-dictionary' };
      currentHeader = { ...header };
      currentPayload = { ...payload };
      appendLog('预设：配置正确的服务。');
      await signCurrentToken(serverConfig.secret);
    } else if (scene === 'weak') {
      serverConfig = { vulnerable: false, secret: 'secret' };
      currentHeader = { ...header };
      currentPayload = { ...payload };
      appendLog('预设：使用弱密钥。');
      await signCurrentToken(serverConfig.secret);
    } else {
      serverConfig = { vulnerable: true, secret: 'demo-secret-not-in-dictionary' };
      currentHeader = { ...header, alg: 'none' };
      currentPayload = { ...payload, role: 'admin' };
      currentSignature = '';
      renderToken();
      appendLog('预设：存在 alg=none 漏洞。');
      await refreshVerification();
    }
  }

  async function attackAlgNone() {
    serverConfig = { vulnerable: true, secret: serverConfig.secret };
    currentHeader = { ...currentHeader, alg: 'none' };
    currentPayload = { ...currentPayload, role: 'admin' };
    currentSignature = '';
    renderToken();
    appendLog('执行 alg=none 伪造，header 与 payload 已改写。');
    await refreshVerification();
  }

  async function editOneByte() {
    currentPayload = { ...currentPayload, role: currentPayload.role === 'user' ? 'admin' : 'user' };
    renderToken();
    appendLog('只改 payload，保留旧签名。');
    await refreshVerification();
  }

  async function crackSecret() {
    appendLog('开始按小字典逐个尝试。');
    const token = buildCurrentToken();
    const result = await logic.bruteForceToken(token, weakDictionary);
    if (result.rejected) {
      showVerdict('invalid', '这不是可爆破的 HS256 token。', '先让服务器处于支持签名校验的场景。');
      appendLog('爆破已跳过，token 不是 HS256。');
      return;
    }
    if (result.found) {
      showVerdict('danger', `密钥是 ${result.found}，用时 ${result.elapsedMs} ms。`, '拿到密钥的人从此能签发任意身份。');
      appendLog(`命中第 ${result.attempts} 个候选，用时 ${result.elapsedMs} ms。`);
    } else {
      showVerdict('invalid', '小字典没有命中。', '这说明强密钥让这类攻击代价变高。');
      appendLog(`尝试 ${result.attempts} 个候选，未命中。`);
    }
  }

  async function useStrongKey() {
    const randomBytes = window.crypto.getRandomValues(new Uint8Array(32));
    const secret = Array.from(randomBytes)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    appendLog('生成强密钥并重新签名。');
    serverConfig = { vulnerable: false, secret };
    await signCurrentToken(secret);
  }

  function copyToken() {
    if (!lastToken) return;
    if (!navigator.clipboard) {
      elements.payloadNote.textContent = '当前环境不支持一键复制。';
      return;
    }
    navigator.clipboard.writeText(lastToken).then(() => {
      elements.payloadNote.textContent = 'token 已复制。';
    });
  }

  async function handlePayloadInput() {
    try {
      const parsed = JSON.parse(elements.payloadInput.value);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('payload must be an object');
      }
      currentPayload = parsed;
      renderToken(false);
      await refreshVerification();
      elements.payloadNote.textContent = 'payload 已更新，签名仍是旧值。';
    } catch (error) {
      elements.payloadNote.textContent = 'JSON 不完整，暂时不更新。';
    }
  }

  function bindEvents() {
    document.addEventListener('click', async (event) => {
      const actionButton = event.target.closest('[data-action]');
      if (actionButton) {
        const action = actionButton.dataset.action;
        if (action === 'edit-one-byte') await withBusy(editOneByte);
        if (action === 'alg-none') await withBusy(attackAlgNone);
        if (action === 'crack-secret') await withBusy(crackSecret);
        if (action === 'use-strong-key') await withBusy(useStrongKey);
        if (action === 'copy-token') copyToken();
      }

      const sceneButton = event.target.closest('[data-scene]');
      if (sceneButton) {
        await withBusy(() => applyScene(sceneButton.dataset.scene));
      }
    });

    elements.payloadInput.addEventListener('input', handlePayloadInput);
  }

  async function initialize() {
    renderToken();
    renderServer();
    bindEvents();
    await signCurrentToken('demo-secret-not-in-dictionary');
  }

  document.addEventListener('DOMContentLoaded', initialize);

  async function withBusy(action) {
    if (busy) return;
    busy = true;
    try {
      await action();
    } finally {
      busy = false;
    }
  }
})();

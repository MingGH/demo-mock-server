/**
 * JWT Lab 纯逻辑层。
 * 仅做编码、签名、验签、字典爆破和判词推导。
 * 不操作 DOM，也不发起网络请求。
 */

(function (globalObject) {
  'use strict';

  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8');

  function bytesFromUtf8(value) {
    if (typeof value !== 'string') {
      throw new Error('value must be a string');
    }
    return encoder.encode(value);
  }

  function bytesToBase64Url(bytes) {
    let output = '';
    for (const byte of bytes) {
      output += String.fromCharCode(byte);
    }
    return btoa(output)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  function bytesFromBase64Url(value) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error('base64url value must be a non-empty string');
    }
    let normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    while (normalized.length % 4 !== 0) {
      normalized += '=';
    }
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function encodeJson(value) {
    return bytesToBase64Url(bytesFromUtf8(JSON.stringify(value)));
  }

  function decodeSegment(value) {
    const bytes = bytesFromBase64Url(value);
    const text = decoder.decode(bytes);
    return JSON.parse(text);
  }

  function safeDecodeSegment(value) {
    try {
      return decodeSegment(value);
    } catch (error) {
      return null;
    }
  }

  async function signHs256(header, payload, secret) {
    const encodedHeader = encodeJson(header);
    const encodedPayload = encodeJson(payload);
    const signature = await signHs256Message(`${encodedHeader}.${encodedPayload}`, secret);
    return {
      header: encodedHeader,
      payload: encodedPayload,
      signature
    };
  }

  async function signHs256Message(message, secret) {
    const crypto = globalObject.crypto;
    if (!crypto || !crypto.subtle) {
      throw new Error('Web Crypto unavailable');
    }
    const key = await crypto.subtle.importKey(
      'raw',
      bytesFromUtf8(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, bytesFromUtf8(message));
    return bytesToBase64Url(new Uint8Array(signature));
  }

  function safeEqual(a, b) {
    if (a === b) {
      return true;
    }
    if (a.length !== b.length) {
      return false;
    }
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  function parseToken(token) {
    if (typeof token !== 'string') {
      throw new Error('token must be a string');
    }
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0].length === 0 || parts[1].length === 0) {
      const error = new Error('token must have header, payload and signature');
      error.code = 'MALFORMED';
      throw error;
    }
    const header = decodeSegment(parts[0]);
    const payload = decodeSegment(parts[1]);
    if (!header || typeof header !== 'object' || typeof header.alg !== 'string') {
      const error = new Error('token header is invalid');
      error.code = 'BAD_HEADER';
      throw error;
    }
    if (!payload || typeof payload !== 'object') {
      const error = new Error('token payload is invalid');
      error.code = 'BAD_PAYLOAD';
      throw error;
    }
    return {
      header,
      payload,
      signature: parts[2],
      parts
    };
  }

  function safeParseToken(token) {
    try {
      return parseToken(token);
    } catch (error) {
      return { error };
    }
  }

  async function verifyToken(token, secret, allowedAlgorithms) {
    const whitelist = allowedAlgorithms || ['HS256'];
    let parsed;
    try {
      parsed = parseToken(token);
    } catch (error) {
      return {
        valid: false,
        reason: error.code || 'MALFORMED',
        message: '格式无效，直接拒绝。'
      };
    }

    if (!whitelist.includes(parsed.header.alg)) {
      return {
        valid: false,
        reason: 'ALG_REJECTED',
        message: `算法 ${parsed.header.alg} 不在白名单。`
      };
    }

    try {
      const signed = await signHs256Message(`${parsed.parts[0]}.${parsed.parts[1]}`, secret);
      const valid = safeEqual(signed, parsed.signature);
      return {
        valid,
        reason: valid ? 'VALID' : 'SIGNATURE_MISMATCH',
        message: valid ? '签名与服务器密钥一致。' : '签名与服务器密钥不一致。'
      };
    } catch (error) {
      return {
        valid: false,
        reason: 'SIGNING_ERROR',
        message: '签名计算失败，拒绝这条 token。'
      };
    }
  }

  async function bruteForceToken(token, candidateSecrets) {
    const parsed = safeParseToken(token);
    if (parsed.error || parsed.header.alg !== 'HS256') {
      return {
        found: null,
        attempts: 0,
        elapsedMs: 0,
        rejected: true
      };
    }

    const started = performance.now();
    let attempts = 0;
    for (const candidate of candidateSecrets) {
      attempts += 1;
      const result = await verifyToken(token, candidate, ['HS256']);
      if (result.valid) {
        return {
          found: candidate,
          attempts,
          elapsedMs: Math.max(1, Math.round(performance.now() - started)),
          rejected: false
        };
      }
    }
    return {
      found: null,
      attempts,
      elapsedMs: Math.max(1, Math.round(performance.now() - started)),
      rejected: false
    };
  }

  function decideVerdict(state) {
    if (!state || typeof state !== 'object') {
      throw new Error('state must be an object');
    }
    if (state.cracked) {
      return 'cracked';
    }
    if (state.algNone) {
      return 'alg-none';
    }
    if (state.valid) {
      return 'valid';
    }
    return 'invalid';
  }

  function buildToken(header, payload, signature) {
    return `${encodeJson(header)}.${encodeJson(payload)}.${signature}`;
  }

  const JwtLabLogic = {
    bytesFromUtf8,
    bytesToBase64Url,
    bytesFromBase64Url,
    encodeJson,
    decodeSegment,
    safeDecodeSegment,
    signHs256,
    signHs256Message,
    parseToken,
    safeParseToken,
    verifyToken,
    bruteForceToken,
    decideVerdict,
    buildToken,
    safeEqual
  };

  globalObject.JwtLabLogic = JwtLabLogic;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = JwtLabLogic;
  }
})(typeof window !== 'undefined' ? window : globalThis);

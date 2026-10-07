'use strict';

const assert = require('assert');
const crypto = require('crypto');
const logic = require('./jwt-lab-logic.js');

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`✅ ${message}`);
    return;
  }
  failed += 1;
  console.error(`❌ ${message}`);
}

async function main() {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: '1234567890',
    name: 'John Doe',
    iat: 1516239022
  };
  const secret = 'your-256-bit-secret';

  const encodedHeader = logic.encodeJson(header);
  const encodedPayload = logic.encodeJson(payload);
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  const signed = await logic.signHs256(header, payload, secret);
  check(signed.signature === expectedSignature, 'signature matches independent HMAC-SHA256 computation');

  const token = `${encodedHeader}.${encodedPayload}.${expectedSignature}`;
  const valid = await logic.verifyToken(token, secret, ['HS256']);
  check(valid.valid === true, 'a correctly signed token verifies');

  const edited = `${encodedHeader}.${logic.encodeJson({ ...payload, name: 'Jahn Doe' })}.${expectedSignature}`;
  const invalid = await logic.verifyToken(edited, secret, ['HS256']);
  check(invalid.valid === false && invalid.reason === 'SIGNATURE_MISMATCH', 'editing payload makes verification fail');

  const rawHeader = Buffer.from('{"typ":"JWT", "alg":"HS256"}').toString('base64url');
  const rawPayload = Buffer.from('{"name":"John Doe", "sub":"1234567890"}').toString('base64url');
  const rawSignature = crypto.createHmac('sha256', secret).update(`${rawHeader}.${rawPayload}`).digest('base64url');
  const rawToken = `${rawHeader}.${rawPayload}.${rawSignature}`;
  const rawResult = await logic.verifyToken(rawToken, secret, ['HS256']);
  check(rawResult.valid === true, 'verification covers transmitted bytes, not re-serialized JSON');

  const malleablePayload = Buffer.from(JSON.stringify({ sub: '1234567890', name: 'John Doe', iat: 1516239022 }, null, 2)).toString('base64url');
  const malleableToken = `${encodedHeader}.${malleablePayload}.${expectedSignature}`;
  const malleableResult = await logic.verifyToken(malleableToken, secret, ['HS256']);
  check(malleableResult.valid === false, 'same JSON with different bytes does not inherit a signature');

  const noneToken = `${logic.encodeJson({ alg: 'none', typ: 'JWT' })}.${encodedPayload}.`;
  const noneResult = await logic.verifyToken(noneToken, secret, ['HS256']);
  check(noneResult.valid === false && noneResult.reason === 'ALG_REJECTED', 'alg=none is rejected by whitelist');

  const weakCandidates = ['secret', '123456', 'password', 'jwt', 'letmein'];
  const weakSigned = await logic.signHs256(header, payload, 'secret');
  const weakToken = `${weakSigned.header}.${weakSigned.payload}.${weakSigned.signature}`;
  const cracked = await logic.bruteForceToken(weakToken, weakCandidates);
  check(cracked.found === 'secret' && cracked.rejected === false, 'weak secret is found by dictionary');

  const strongSigned = await logic.signHs256(header, payload, 'a-long-random-secret-that-is-not-in-the-dictionary');
  const strongToken = `${strongSigned.header}.${strongSigned.payload}.${strongSigned.signature}`;
  const notCracked = await logic.bruteForceToken(strongToken, weakCandidates);
  check(notCracked.found === null && notCracked.rejected === false, 'strong secret survives the small dictionary');

  check(logic.decideVerdict({ valid: true }) === 'valid', 'verdict state valid');
  check(logic.decideVerdict({ valid: false }) === 'invalid', 'verdict state invalid');
  check(logic.decideVerdict({ valid: false, algNone: true }) === 'alg-none', 'verdict state alg-none');
  check(logic.decideVerdict({ valid: true, algNone: true, cracked: true }) === 'cracked', 'verdict state cracked has priority');

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

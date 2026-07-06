/**
 * 隐身通道 demo 单元测试
 * 运行：node pages/stealth-channel/stealth-channel.test.js
 */

var engine = require('./engine.js');
var VISIBILITY = engine.VISIBILITY;

var passed = 0;
var failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log('  \u2713 ' + message);
  } else {
    failed++;
    console.log('  \u2717 ' + message);
  }
}

console.log('\n=== 通道定义完整性 ===');

(function testChannelList() {
  var chs = engine.getChannels();
  assert(chs.length === 6, '应有 6 个通道（实际: ' + chs.length + '）');
  var ids = {};
  chs.forEach(function (c) { ids[c.id] = true; });
  assert(ids.fetch && ids.beacon && ids.pixel && ids.websocket && ids.webrtc && ids.postmessage,
    '6 个通道 id 齐全: fetch/beacon/pixel/websocket/webrtc/postmessage');
  // id 唯一
  var seen = {};
  var unique = chs.every(function (c) {
    if (seen[c.id]) return false;
    seen[c.id] = true;
    return true;
  });
  assert(unique, '通道 id 不重复');
  // 每个通道必要字段
  var ok = chs.every(function (c) {
    return c.id && c.name && c.icon && c.visibility && c.desc && c.hint;
  });
  assert(ok, '每个通道含 id/name/icon/visibility/desc/hint');
  // getChannels 返回副本，不污染内部表
  chs.push({ id: 'fake' });
  assert(engine.getChannels().length === 6, 'getChannels 返回副本，原表未被污染');
})();

console.log('\n=== getChannel ===');

(function testGetChannel() {
  var ch = engine.getChannel('webrtc');
  assert(ch !== null && ch.id === 'webrtc', 'getChannel(webrtc) 返回正确通道');
  assert(ch.visibility === VISIBILITY.HIDDEN, 'webrtc 可见性为 hidden');
  assert(engine.getChannel('not-exist') === null, '未知 id 返回 null');
})();

console.log('\n=== 可见性判定 ===');

(function testVisibility() {
  var cases = {
    fetch: VISIBILITY.VISIBLE,
    beacon: VISIBILITY.VISIBLE,
    pixel: VISIBILITY.SUBTLE,
    websocket: VISIBILITY.PARTIAL,
    webrtc: VISIBILITY.HIDDEN,
    postmessage: VISIBILITY.NONE
  };
  Object.keys(cases).forEach(function (id) {
    assert(engine.getVisibility(id).level === cases[id],
      id + ' 可见性等级为 ' + cases[id]);
  });
  // 元信息含 label 与 color
  var v = engine.getVisibility('webrtc');
  assert(v.label && v.color, '可见性元信息含 label 与 color');
  // 未知通道降级为 visible
  assert(engine.getVisibility('xxx').level === VISIBILITY.VISIBLE, '未知通道降级为 visible');
})();

console.log('\n=== isCatchable（挑战答案判定） ===');

(function testCatchable() {
  assert(engine.isCatchable('fetch') === true, 'fetch 可被抓');
  assert(engine.isCatchable('beacon') === true, 'beacon 可被抓');
  assert(engine.isCatchable('pixel') === true, 'pixel 可被抓（虽易忽略）');
  assert(engine.isCatchable('websocket') === true, 'websocket 可被抓（连接可见）');
  assert(engine.isCatchable('webrtc') === false, 'webrtc 抓不到（核心反直觉点）');
  assert(engine.isCatchable('postmessage') === false, 'postmessage 抓不到（不走网络）');
})();

console.log('\n=== room code 生成 ===');

(function testGenerateRoomCode() {
  var code = engine.generateRoomCode();
  assert(code.length === engine.ROOM_LENGTH, 'room code 长度为 ' + engine.ROOM_LENGTH + '（实际: ' + code.length + '）');
  assert(engine.isValidRoomCode(code), '生成的 room code 合法');
  // 100 次生成应出现多个不同值
  var set = {};
  for (var i = 0; i < 100; i++) {
    set[engine.generateRoomCode()] = true;
  }
  assert(Object.keys(set).length > 50, '100 次生成出现 >50 个不同值（实际: ' + Object.keys(set).length + '）');
  // 不含易混字符 0/O/1/I
  var noAmbiguous = true;
  for (var j = 0; j < 50; j++) {
    var c = engine.generateRoomCode();
    if (/[01OI]/.test(c)) { noAmbiguous = false; break; }
  }
  assert(noAmbiguous, '生成的 room code 不含易混字符 0/O/1/I');
})();

console.log('\n=== room code 校验 ===');

(function testIsValidRoomCode() {
  assert(engine.isValidRoomCode('ABCDEF') === true, '合法 code ABCDEF 通过');
  assert(engine.isValidRoomCode('XYZ234') === true, '合法 code XYZ234 通过');
  assert(engine.isValidRoomCode('abcdef') === true, '小写 code 通过（规范化后合法）');
  assert(engine.isValidRoomCode('AB CD EF') === true, '带空格 code 通过（规范化后合法）');
  assert(engine.isValidRoomCode('ABCD') === false, '长度不足不通过');
  assert(engine.isValidRoomCode('ABCDEFG') === false, '长度超出不通过');
  assert(engine.isValidRoomCode('ABC0EF') === false, '含 0 不通过');
  assert(engine.isValidRoomCode('ABCIEF') === false, '含 I 不通过');
  assert(engine.isValidRoomCode('') === false, '空字符串不通过');
  assert(engine.isValidRoomCode(null) === false, 'null 不通过');
})();

console.log('\n=== normalizeRoomCode ===');

(function testNormalize() {
  assert(engine.normalizeRoomCode('abcd') === 'ABCD', '转大写');
  assert(engine.normalizeRoomCode('  a b c  ') === 'ABC', '去空格');
  assert(engine.normalizeRoomCode('') === '', '空输入返回空');
  assert(engine.normalizeRoomCode(null) === '', 'null 返回空');
})();

console.log('\n=== 消息格式化 ===');

(function testFormatMessage() {
  var msg = engine.formatMessage('webrtc', 'hello');
  assert(msg.channelId === 'webrtc', 'channelId 正确');
  assert(msg.channel === 'WebRTC DataChannel', 'channel 名取自通道定义');
  assert(msg.content === 'hello', 'content 保留');
  assert(typeof msg.time === 'number' && msg.time > 0, 'time 为有效时间戳');
  assert(/^[0-9a-f]{8}$/.test(msg.token), 'token 为 8 位 hex（实际: ' + msg.token + '）');
  // 未知通道也能格式化（channel 名回退为 id）
  var msg2 = engine.formatMessage('xxx', 'c');
  assert(msg2.channel === 'xxx', '未知通道 channel 名回退为 id');
})();

console.log('\n=== 信令构造与解析 ===');

(function testSignal() {
  var raw = engine.buildSignal('offer', 'ABC234', { sdp: 'v=0' });
  var obj = engine.parseSignal(raw);
  assert(obj.type === 'offer', '解析 type 正确');
  assert(obj.room === 'ABC234', '解析 room 正确');
  assert(obj.payload.sdp === 'v=0', '解析 payload 正确');
  // 往返一致性
  var raw2 = engine.buildSignal('ice', 'XYZ567', { candidate: 'host' });
  var obj2 = engine.parseSignal(raw2);
  assert(obj2.type === 'ice' && obj2.room === 'XYZ567', 'ice 信令往返一致');
  // 非法输入
  assert(engine.parseSignal('not json') === null, '非法 JSON 返回 null');
  assert(engine.parseSignal('{}') === null, '缺 type 字段返回 null');
  assert(engine.parseSignal('') === null, '空串返回 null');
  assert(engine.parseSignal(null) === null, 'null 返回 null');
})();

console.log('\n=== 结果 ===');
console.log('通过: ' + passed + ', 失败: ' + failed);
process.exit(failed > 0 ? 1 : 0);

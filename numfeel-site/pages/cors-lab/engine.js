// ========== 跨域请求限制实验室：纯逻辑 ==========
// 这些函数与 DOM 解耦，编码的是 Fetch 规范里「简单请求 / 预检」的判定规则，
// 以及三种 CORS 策略下「浏览器是否放行读取」「服务器该返回什么头」。
// 与后端 CorsLabFilter.corsHeadersFor 保持对齐，便于单测对照。

var CORS_MODES = {
  DENY: 'deny',
  ALLOW: 'allow',
  ALLOW_CREDENTIALS: 'allow-credentials'
};

// CORS-safelisted methods
var SIMPLE_METHODS = { GET: 1, POST: 1, HEAD: 1 };

// CORS-safelisted request-header 名（小写）
var SIMPLE_HEADER_NAMES = {
  'accept': 1,
  'accept-language': 1,
  'content-language': 1,
  'content-type': 1,
  'range': 1
};

// 仅这三种 Content-Type 算「简单」，其余（含 application/json）一律触发预检
var SIMPLE_CONTENT_TYPES = {
  'application/x-www-form-urlencoded': 1,
  'multipart/form-data': 1,
  'text/plain': 1
};

/**
 * 是否简单方法。
 * @param {string} method
 * @returns {boolean}
 */
function isSimpleMethod(method) {
  return !!SIMPLE_METHODS[(method || '').toUpperCase()];
}

/**
 * 该 Content-Type 值是否算简单类型。
 * @param {string} ct
 * @returns {boolean}
 */
function isSimpleContentType(ct) {
  if (!ct) return true; // 没带 Content-Type 视为简单
  // 只看主类型，去掉 ;charset= 之类参数
  var base = String(ct).split(';')[0].trim().toLowerCase();
  return !!SIMPLE_CONTENT_TYPES[base];
}

/**
 * 判断一个请求是否需要预检（preflight）。
 * @param {{method:string, headers:Object}} req
 * @returns {{needsPreflight:boolean, reasons:string[]}}
 */
function classifyRequest(req) {
  req = req || {};
  var method = req.method || 'GET';
  var headers = req.headers || {};
  var reasons = [];

  if (!isSimpleMethod(method)) {
    reasons.push('方法 ' + method.toUpperCase() + ' 不在简单列表（GET/POST/HEAD）里，会触发预检');
  }

  // 逐个头检查
  Object.keys(headers).forEach(function (name) {
    var lower = name.toLowerCase();
    if (!SIMPLE_HEADER_NAMES[lower]) {
      reasons.push('携带了自定义头 ' + name + '，会触发预检');
      return;
    }
    if (lower === 'content-type' && !isSimpleContentType(headers[name])) {
      reasons.push('Content-Type: ' + headers[name] + ' 不属于三种简单类型，会触发预检');
    }
  });

  return { needsPreflight: reasons.length > 0, reasons: reasons };
}

/**
 * 给定策略与是否带凭据，判断浏览器会不会把响应交给 JS 读取。
 * @param {string} mode
 * @param {boolean} withCredentials
 * @returns {{blocked:boolean, reason:string}}
 */
function browserBlocksReading(mode, withCredentials) {
  if (mode === CORS_MODES.DENY) {
    return {
      blocked: true,
      reason: '服务器没返回 Access-Control-Allow-Origin，浏览器拒绝把响应体交给 JS——但请求已经发出、服务器已经处理。'
    };
  }
  if (mode === CORS_MODES.ALLOW) {
    if (withCredentials) {
      return {
        blocked: true,
        reason: '服务器返回 Access-Control-Allow-Origin: *，可请求带了凭据（cookie）。规范禁止 * 与凭据同时使用，浏览器拦下读取。'
      };
    }
    return { blocked: false, reason: '服务器返回 Access-Control-Allow-Origin: *，允许任意源读取响应。' };
  }
  if (mode === CORS_MODES.ALLOW_CREDENTIALS) {
    return {
      blocked: false,
      reason: '服务器回显你的 Origin 并加上 Access-Control-Allow-Credentials: true，带凭据也能读。'
    };
  }
  return { blocked: true, reason: '未知策略' };
}

/**
 * 三种策略下服务器应当写入的 CORS 响应头（与后端 CorsLabFilter.corsHeadersFor 对齐）。
 * @param {string} mode
 * @param {string} origin
 * @returns {Object}
 */
function serverHeaders(mode, origin) {
  var h = {};
  if (mode === CORS_MODES.ALLOW) {
    h['Access-Control-Allow-Origin'] = '*';
  } else if (mode === CORS_MODES.ALLOW_CREDENTIALS) {
    h['Access-Control-Allow-Origin'] = origin || 'null';
    h['Access-Control-Allow-Credentials'] = 'true';
    h['Vary'] = 'Origin';
  }
  // deny：什么都不写
  return h;
}

// 浏览器 / Node 双环境导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CORS_MODES: CORS_MODES,
    isSimpleMethod: isSimpleMethod,
    isSimpleContentType: isSimpleContentType,
    classifyRequest: classifyRequest,
    browserBlocksReading: browserBlocksReading,
    serverHeaders: serverHeaders
  };
}

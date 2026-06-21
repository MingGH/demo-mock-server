/* ============================================================
   伪元素炫技场 —— 卡片数据 + 注入
   每张卡片：极简的 demo DOM + 对应伪元素源码（点按钮展开）
   逻辑保持 ES5 风格（var / function），浏览器直接打开即可运行。
   ============================================================ */

/** 卡片配置：title 标题，tag 分类，demo demo的HTML，hint 一句话说明，code 关键伪元素源码 */
var CARDS = [
  {
    title: "渐变描边",
    tag: "实战刚需",
    demo: '<span class="demo-border">border 不支持渐变？</span>',
    hint: "border 只能纯色。用 ::before 垫一层渐变 + mask 抠空中心，得到渐变圆角边框。",
    code:
'.box::before{\n' +
'  content:""; position:absolute; inset:0;\n' +
'  border-radius:14px; padding:2px; z-index:-1;\n' +
'  background:linear-gradient(135deg,#ffd700,#ff6b6b,#ce93d8,#90caf9);\n' +
'  /* 抠掉中心，只留 2px 边 */\n' +
'  -webkit-mask:linear-gradient(#000 0 0) content-box,\n' +
'              linear-gradient(#000 0 0);\n' +
'  -webkit-mask-composite:xor;\n' +
'  mask-composite:exclude;\n' +
'}'
  },
  {
    title: "旋转霓虹光晕",
    tag: "炫技天花板",
    demo: '<span class="demo-glow">Hover me 也不需要</span>',
    hint: "::before 画 conic 渐变边，::after 复制一份模糊当外溢光晕。@property 让角度能被动画。",
    code:
'@property --ang{ syntax:"<angle>"; initial-value:0deg; inherits:false; }\n' +
'.box::before,.box::after{\n' +
'  content:""; position:absolute; inset:-2px; z-index:-1;\n' +
'  border-radius:16px;\n' +
'  background:conic-gradient(from var(--ang),\n' +
'    #ff6b6b,#ffd700,#90caf9,#ce93d8,#ff6b6b);\n' +
'  animation:spin 4s linear infinite;\n' +
'}\n' +
'.box::after{ filter:blur(16px); opacity:.7; } /* 光晕 */\n' +
'@keyframes spin{ to{ --ang:360deg; } }'
  },
  {
    title: "纯 CSS 对话气泡",
    tag: "纯CSS图形",
    demo: '<span class="demo-bubble">JOJO!我不做人了！</span>',
    hint: "气泡那个小尾巴是 ::after 画的纯三角形——四条 border 三条透明，留一条着色。",
    code:
'.bubble::after{\n' +
'  content:""; position:absolute;\n' +
'  left:28px; bottom:-12px;\n' +
'  border:12px solid transparent;\n' +
'  border-top-color:#90caf9; /* 只给上边上色 */\n' +
'  border-bottom:0;          /* = 一个朝下的三角 */\n' +
'}'
  },
  {
    title: "零 JS Tooltip",
    tag: "attr() 魔法",
    demo: '<span class="demo-tip" tabindex="0" data-tip="文案来自 data-tip 属性，一行 JS 都没有">悬浮 / 点我</span>',
    hint: "content:attr(data-tip) 直接把 HTML 属性读进伪元素。改文案只改属性，无需碰 CSS/JS。",
    code:
'.tip::after{\n' +
'  content:attr(data-tip);   /* 读 HTML 上的 data-tip */\n' +
'  position:absolute; bottom:140%; left:50%;\n' +
'  transform:translateX(-50%);\n' +
'  opacity:0; transition:.25s;\n' +
'}\n' +
'.tip:hover::after{ opacity:1; }'
  },
  {
    title: "杂志级大引号",
    tag: "排版增强",
    demo: '<p class="demo-quote">直觉在随机性问题上，几乎总是错的。</p>',
    hint: "content 可以放任意字符。用 \\201C 插入一个超大装饰引号，不占据真实文本。",
    code:
'.quote::before{\n' +
'  content:"\\201C";       /* Unicode 左双引号 */\n' +
'  position:absolute; left:-6px; top:-24px;\n' +
'  font-size:64px; color:#ffd700; opacity:.5;\n' +
'  font-family:Georgia,serif;\n' +
'}'
  },
  {
    title: "纯 CSS 嵌套编号",
    tag: "counters()",
    demo:
'<ol class="demo-counter">' +
'<li>准备工作' +
  '<ol>' +
    '<li>打开页面</li>' +
    '<li>什么都不用做</li>' +
  '</ol>' +
'</li>' +
'<li>开始体验' +
  '<ol>' +
    '<li>序号是 CSS 自己算的</li>' +
    '<li>连 1.2.1 这种多级号也行' +
      '<ol><li>想嵌几层嵌几层</li></ol>' +
    '</li>' +
  '</ol>' +
'</li>' +
'</ol>',
    hint: "counters()（带 s）能拼出 1、1.1、1.2.1 这种多级章节号。删一行，整棵编号自动重排，零 JS。",
    code:
'.list{ counter-reset:step; }      /* 每层各起一个计数器 */\n' +
'.list li{ counter-increment:step; }\n' +
'.list li::before{\n' +
'  /* counters 带 s：把各层用 "." 串起来 */\n' +
'  content:counters(step,".") " ";  /* → 1  1.1  1.2.1 */\n' +
'}'
  },
  {
    title: "邮票/撕纸锯齿边",
    tag: "纹理技巧",
    demo: '<span class="demo-ticket">入场券 No.996</span>',
    hint: "上下各一个伪元素，用平铺的 radial-gradient 半圆挖出锯齿，做出邮票/票根质感。",
    code:
'.ticket::before,.ticket::after{\n' +
'  content:""; position:absolute; left:0; right:0;\n' +
'  height:10px;\n' +
'  background:radial-gradient(circle,\n' +
'    transparent 0 5px,#f2e4cf 5px)\n' +
'    center/14px 14px repeat-x;\n' +
'}\n' +
'.ticket::before{ top:-9px; }\n' +
'.ticket::after{ bottom:-9px; transform:rotate(180deg); }'
  },
  {
    title: "角标丝带",
    tag: "电商常见",
    demo: '<div class="demo-ribbon"></div>',
    hint: "一个空盒子 + ::before，旋转 45° 拉成斜带，配 overflow:hidden 裁出三角丝带。",
    code:
'.box{ overflow:hidden; position:relative; }\n' +
'.box::before{\n' +
'  content:"NEW"; position:absolute;\n' +
'  top:14px; right:-34px; width:130px;\n' +
'  transform:rotate(45deg);\n' +
'  text-align:center;\n' +
'  background:linear-gradient(90deg,#ffd700,#ffb347);\n' +
'}'
  },
  {
    title: "下划线中间展开",
    tag: "微交互",
    demo: '<span class="demo-underline" tabindex="0">悬浮 / 点我</span>',
    hint: "::after 初始 left:50% right:50%（宽度为0），hover 时归零，下划线从中间向两端铺开。",
    code:
'.link::after{\n' +
'  content:""; position:absolute; bottom:-2px;\n' +
'  left:50%; right:50%; height:2px;       /* 宽度 0 */\n' +
'  background:linear-gradient(90deg,#ffd700,#ff6b6b);\n' +
'  transition:left .3s,right .3s;\n' +
'}\n' +
'.link:hover::after{ left:0; right:0; }   /* 展开 */'
  },
  {
    title: "三个点加载动画",
    tag: "1 个元素 = 3 个点",
    demo: '<span class="demo-dots"></span>',
    hint: "本体是中间那个点，::before / ::after 各画一个，错开 animation-delay 实现波浪跳动。",
    code:
'.dots,.dots::before,.dots::after{\n' +
'  width:12px; height:12px; border-radius:50%;\n' +
'  background:#ffd700; animation:blink 1s infinite;\n' +
'}\n' +
'.dots::before{ left:-22px; animation-delay:0s; }\n' +
'.dots::after { left:22px;  animation-delay:.4s; }\n' +
'@keyframes blink{ 0%,100%{opacity:.25} 50%{opacity:1} }'
  }
];

/** HTML 转义，避免源码里的尖括号被当成标签 */
function esc(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/** 渲染所有卡片到 #grid */
function render(){
  var grid = document.getElementById('grid');
  var html = '';
  for (var i = 0; i < CARDS.length; i++){
    var c = CARDS[i];
    html +=
      '<div class="card">' +
        '<div class="tag">' + esc(c.tag) + '</div>' +
        '<h3>' + (i + 1) + '. ' + esc(c.title) + '</h3>' +
        '<div class="stage">' + c.demo + '</div>' +
        '<div class="hint">' + esc(c.hint) + '</div>' +
        '<button class="code-toggle" data-i="' + i + '">看源码 &lt;/&gt;</button>' +
        '<pre class="code" id="code-' + i + '">' + esc(c.code) + '</pre>' +
      '</div>';
  }
  grid.innerHTML = html;

  // 绑定「看源码」展开/收起
  var btns = grid.querySelectorAll('.code-toggle');
  for (var j = 0; j < btns.length; j++){
    btns[j].addEventListener('click', function(){
      var pre = document.getElementById('code-' + this.getAttribute('data-i'));
      var open = pre.classList.toggle('show');
      this.innerHTML = open ? '收起源码 &lt;/&gt;' : '看源码 &lt;/&gt;';
    });
  }
}

render();

// 题库：12道题，8道骗局 + 4道真实场景
// 真实场景故意设计得"看起来可疑"，防止用户无脑选"骗局"
// tactic: authority | urgency | impersonation | pretexting | ai-clone | qrcode | real
const QUESTIONS = [

  // ── 骗局 ──────────────────────────────────────────────────────────────

  {
    id: 1,
    type: 'sms',
    tactic: 'impersonation',
    tacticName: '身份伪造',
    difficulty: 1,
    isFake: true,
    scene: {
      sender: '【招商银行】',
      content: '您的账户于今日14:32在异地（广州）登录，如非本人操作请立即拨打 <span class="sms-link">400-820-9555</span> 冻结账户，或点击 <span class="sms-link">http://cmb-safe.cn/verify</span> 验证身份。'
    },
    suspiciousPoints: [
      { keyword: '400-820-9555', tip: '招商银行官方客服是 95555，400 开头的号码不是官方热线' },
      { keyword: 'cmb-safe.cn', tip: '招商银行官方域名是 cmbchina.com，cmb-safe.cn 是钓鱼域名' }
    ],
    explanation: '两个破绽：假客服电话（真实是 95555）和钓鱼域名。真正的银行短信不会让你点链接登录，遇到账户异常直接拨打卡背面的电话。',
    tactics: ['身份伪造', '紧迫感制造']
  },

  {
    id: 2,
    type: 'email',
    tactic: 'urgency',
    tacticName: '紧迫感制造',
    difficulty: 2,
    isFake: true,
    scene: {
      from: 'Apple Support',
      fromEmail: 'noreply@apple-id-verify.com',
      subject: '【紧急】您的 Apple ID 将在 24 小时内停用',
      content: '亲爱的用户，<br><br>我们检测到您的账户存在异常登录行为，您的 Apple ID 将在 <strong>24小时内</strong> 被暂停。<br><br>请立即点击以下链接完成身份验证：<br><br><span class="email-link">http://apple-id-verify.com/account/restore?token=a8f2k...</span><br><br>Apple 安全团队'
    },
    suspiciousPoints: [
      { keyword: 'noreply@apple-id-verify.com', tip: 'Apple 官方邮件只从 @apple.com 发出，apple-id-verify.com 是钓鱼域名' },
      { keyword: '24小时内', tip: '人为制造紧迫感，让你来不及思考就点击链接' },
      { keyword: 'apple-id-verify.com', tip: '链接域名同样是钓鱼域名，不是 apple.com' }
    ],
    explanation: '三个破绽叠加：假冒 Apple 品牌、24小时倒计时、钓鱼域名。Apple 的官方邮件只从 @apple.com 发出，遇到这类邮件直接去 appleid.apple.com 官网检查。',
    tactics: ['紧迫感制造', '品牌仿冒', '钓鱼域名']
  },

  {
    id: 3,
    type: 'call',
    tactic: 'authority',
    tacticName: '权威恐吓',
    difficulty: 1,
    isFake: true,
    scene: {
      number: '+86 010-XXXX-XXXX',
      label: '未知号码',
      script: '"您好，我是公安局网络安全部门，您的身份证被人用于注册了一个诈骗账号，目前已立案。为配合调查，请不要告诉任何人，添加我的微信，我发给您一个「安全账户」，需要将您名下资产转入配合资金核查……"'
    },
    suspiciousPoints: [
      { keyword: '公安局网络安全部门', tip: '公安机关不会通过电话要求转账，更不会用微信联系' },
      { keyword: '不要告诉任何人', tip: '要求保密是骗局的标志性话术，目的是切断你与外界的联系' },
      { keyword: '安全账户', tip: '世界上没有「安全账户」这个东西，这是诈骗专用词汇' }
    ],
    explanation: '「冒充公检法」诈骗的标准剧本。真正的公安机关不会通过电话要求转账，不会让你添加微信，更不会要求你保密。接到此类电话直接挂断，拨打 110 核实。',
    tactics: ['权威恐吓', '孤立目标', '借口构建']
  },

  {
    id: 4,
    type: 'wechat',
    tactic: 'ai-clone',
    tacticName: 'AI 身份克隆',
    difficulty: 3,
    isFake: true,
    scene: {
      name: '王总（老板）',
      avatar: '👔',
      content: '小李，我在开会不方便打电话。公司有笔紧急采购款需要先垫付，财务那边来不及走流程，你先从个人账户转 8 万过去，我开完会马上报销给你。收款账户：6228 XXXX XXXX XXXX，户名：张某某。'
    },
    suspiciousPoints: [
      { keyword: '不方便打电话', tip: '刻意避开语音/视频核实，是 AI 克隆诈骗的典型特征' },
      { keyword: '先从个人账户转', tip: '正规公司财务流程不会让员工垫付大额款项' },
      { keyword: '马上报销给你', tip: '承诺事后报销，降低你的警惕性' }
    ],
    explanation: '2026年 AI 声音克隆攻击增长超400%。骗子盗取老板微信后，用 AI 克隆声音取得信任，再以「紧急转账」行骗。收到此类请求，务必挂断后用另一个渠道直接打电话给本人核实。',
    tactics: ['AI 身份克隆', '权威施压', '紧迫感制造']
  },

  {
    id: 5,
    type: 'sms',
    tactic: 'qrcode',
    tacticName: '二维码钓鱼',
    difficulty: 2,
    isFake: true,
    scene: {
      sender: '【顺丰速运】',
      content: '您有一件快递因地址不详无法投递，请在48小时内扫描下方二维码补充收件信息，逾期将退回发件方。[二维码图片]'
    },
    suspiciousPoints: [
      { keyword: '扫描下方二维码', tip: '顺丰官方通知通过 APP 或官网处理，不会在短信里发二维码' },
      { keyword: '48小时内', tip: '时间压力是催促你不假思索扫码的手段' },
      { keyword: '【顺丰速运】', tip: '短信发件人名称可以伪造，不代表真的来自顺丰' }
    ],
    explanation: '快递二维码钓鱼高发骗局。扫码后通常跳转仿冒页面，要求填写姓名、手机号、身份证甚至银行卡。收到此类短信，直接在顺丰官网或 APP 用运单号查询。',
    tactics: ['品牌仿冒', '紧迫感制造', '二维码钓鱼']
  },

  {
    id: 6,
    type: 'wechat',
    tactic: 'impersonation',
    tacticName: '账号盗用',
    difficulty: 2,
    isFake: true,
    scene: {
      name: '张伟（大学同学）',
      avatar: '🧑',
      content: '兄弟，我在外地急用钱，支付宝被限额了，能不能先借我2000，我明天就还你？支付宝：138XXXX8888（张某某）'
    },
    suspiciousPoints: [
      { keyword: '急用钱', tip: '制造紧迫感，让你来不及核实' },
      { keyword: '支付宝被限额了', tip: '借口解释为什么不能用其他方式，是借口构建手法' },
      { keyword: '明天就还你', tip: '承诺快速还款降低警惕，但转账后对方会消失' }
    ],
    explanation: '朋友账号被盗后，骗子翻聊天记录，用熟悉的称呼和语气向通讯录里的人借钱。核实方法很简单：直接打电话给本人。如果对方说「不方便接电话」，就是骗局。',
    tactics: ['账号盗用', '信任利用', '紧迫感制造']
  },

  {
    id: 7,
    type: 'call',
    tactic: 'pretexting',
    tacticName: '借口构建',
    difficulty: 3,
    isFake: true,
    scene: {
      number: '95188（伪造）',
      label: '疑似支付宝客服',
      script: '"您好，我是支付宝客服，您的账户被误标记为异常，需要配合解除。请打开手机屏幕共享功能，我来远程帮您操作，整个过程只需要3分钟……"'
    },
    suspiciousPoints: [
      { keyword: '屏幕共享', tip: '屏幕共享会暴露你的所有账号密码、验证码、银行余额，是最危险的操作' },
      { keyword: '远程帮您操作', tip: '任何客服都不需要远程控制你的手机' },
      { keyword: '只需要3分钟', tip: '用「快速解决」降低你的警惕，让你不假思索地同意' }
    ],
    explanation: '屏幕共享诈骗是2024-2026年增长最快的骗局类型。一旦开启，骗子可实时看到你输入的所有密码和验证码。任何客服都不需要你开屏幕共享，遇到就挂断。',
    tactics: ['借口构建', '技术恐吓', '屏幕共享劫持']
  },

  {
    id: 8,
    type: 'wechat',
    tactic: 'pretexting',
    tacticName: '杀猪盘',
    difficulty: 3,
    isFake: true,
    scene: {
      name: '林晓雨（陌生人）',
      avatar: '👩',
      content: '你好，我是做量化交易的，最近发现一个内部平台收益很稳定，上周我朋友投了5万，7天赚了8000。我可以带你一起，先小额试试，平台有监管备案的，我发你链接……'
    },
    suspiciousPoints: [
      { keyword: '内部平台', tip: '「内部」「私密」渠道是杀猪盘的标志性话术' },
      { keyword: '7天赚了8000', tip: '16%的7日收益率，年化超过800%，任何合法投资都不可能做到' },
      { keyword: '有监管备案', tip: '骗子会伪造监管备案信息，真实平台可在证监会官网查询' }
    ],
    explanation: '杀猪盘流程：陌生人搭讪→建立信任→推荐「内部平台」→小额提现成功→诱导大额投入→平台消失。识别关键：任何主动找你推荐投资的陌生人，都是骗局。',
    tactics: ['情感操控', '虚假收益', '杀猪盘']
  },

  // ── 真实场景（故意设计得"看起来可疑"） ──────────────────────────────

  {
    id: 9,
    type: 'email',
    tactic: 'real',
    tacticName: '真实场景',
    difficulty: 2,
    isFake: false,
    scene: {
      from: 'GitHub Security',
      fromEmail: 'security@github.com',
      subject: 'A new public key was added to your account',
      content: '你好，<br><br>我们注意到一个新的 SSH 公钥已被添加到您的 GitHub 账户。<br><br>如果这是您本人操作，可以忽略此邮件。<br><br>如果您没有进行此操作，请立即前往 <span class="email-link">github.com/settings/keys</span>（请手动输入，不要点击）删除该密钥，并修改密码。<br><br>GitHub Security Team'
    },
    suspiciousPoints: [],
    explanation: '这是真实的 GitHub 安全通知。辨别要点：发件人是 @github.com 官方域名；没有制造紧迫感；明确说明「如果是你操作可以忽略」；提示手动输入网址而非点击链接——这些都是正规安全通知的写法，和骗局邮件的套路完全相反。',
    tactics: []
  },

  {
    id: 10,
    type: 'sms',
    tactic: 'real',
    tacticName: '真实场景',
    difficulty: 2,
    isFake: false,
    scene: {
      sender: '【京东】',
      content: '您好，您在京东的订单（单号：JD2026XXXX）已发货，预计明日送达。如有问题请拨打 950618 或登录 jd.com 查询。'
    },
    suspiciousPoints: [],
    explanation: '这是真实的京东发货通知。辨别要点：没有要求点击链接；客服电话 950618 是京东官方号码；引导去 jd.com 官网查询而非第三方域名；没有任何紧迫感或异常要求。真实的物流短信只告诉你状态，不要求你做任何操作。',
    tactics: []
  },

  {
    id: 11,
    type: 'email',
    tactic: 'real',
    tacticName: '真实场景',
    difficulty: 3,
    isFake: false,
    scene: {
      from: 'Google 账号团队',
      fromEmail: 'no-reply@accounts.google.com',
      subject: '您的 Google 账号在新设备上登录',
      content: '您的 Google 账号刚刚在以下设备上登录：<br><br>设备：iPhone 14<br>位置：上海，中国<br>时间：2026年4月8日 09:23<br><br>如果这是您本人操作，无需任何操作。<br><br>如果您不认识此活动，请立即前往 <span class="email-link">myaccount.google.com/security</span> 检查您的账号安全。<br><br>Google 账号团队'
    },
    suspiciousPoints: [],
    explanation: '这是真实的 Google 登录通知。辨别要点：发件人域名是 @accounts.google.com（Google 官方）；没有要求你点击邮件内的链接；引导你去 myaccount.google.com 官网；没有制造恐惧或紧迫感。和骗局邮件的区别在于：它不要求你「立即」做任何事。',
    tactics: []
  },

  {
    id: 12,
    type: 'wechat',
    tactic: 'real',
    tacticName: '真实场景',
    difficulty: 3,
    isFake: false,
    scene: {
      name: '李明（真实朋友）',
      avatar: '😊',
      content: '哥们，上次你借我的500块，我刚发工资了，现在还你。支付宝转过去了，查一下收到没？'
    },
    suspiciousPoints: [],
    explanation: '这是真实的还款消息。辨别要点：是对方主动还钱，不是要求你转账；没有任何紧迫感；没有奇怪的借口；符合正常的人际往来逻辑。骗局的特征是「要求你转钱」，而不是「告诉你收到钱了」。',
    tactics: []
  }

];

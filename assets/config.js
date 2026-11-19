/* ============================================================
   野遇 · 认证配置（v0.45）
   ------------------------------------------------------------
   ⚠️ 本文件只放「占位符」，严禁写入任何真实密钥 / AppSecret。
   生产取值顺序建议：构建期环境变量注入 → 服务端下发（/config）→ 本地兜底。
   凡 __XXX__ 形式的键，接入时必须由 CI 或后台替换，缺失即视为未配置。
   ============================================================ */
window.AUTH_CONFIG = {
  env: 'production',                   // prototype | staging | production

  /* ---------- 网关 ---------- */
  api: {
    baseUrl: '__API_BASE_URL__',       // 例：https://api.yeyu.example.com
    timeoutMs: 8000,
    endpoints: {
      sendCode:      '/auth/sms/send',
      verifyCode:    '/auth/sms/verify',
      oneClick:      '/auth/oneclick/login',
      oauthCallback: '/auth/oauth/callback',
      oauthBind:     '/auth/oauth/bind',
      oauthMerge:    '/auth/oauth/merge',
      refresh:       '/auth/token/refresh',
      logout:        '/auth/logout',
      profile:       '/user/profile'
    }
  },

  /* ---------- 短信验证码 ---------- */
  sms: {
    provider:     '__SMS_PROVIDER__',      // aliyun | tencent | volcengine
    accessKeyId:  '__SMS_ACCESS_KEY_ID__',
    accessSecret: '__SMS_ACCESS_SECRET__',
    signName:     '__SMS_SIGN_NAME__',     // 需报备的短信签名，如「野遇」
    templateId:   '__SMS_TEMPLATE_ID__',
    scene:        'LOGIN_REGISTER',
    codeLen:      6,
    resendSec:    60,                      // 重发冷却
    maxPerDay:    10,                      // 单号码日发送上限
    maxTry:       5,                       // 单验证码最大错误次数，超出即作废
    /* 验证码回显开关：默认为 false —— 服务端不下发明文验证码，客户端也不应打印。
       （v0.76 前为 true，仅便于原型走查） */
    exposeCodeInDemo: false
  },

  /* ---------- 运营商一键登录（号码认证）---------- */
  oneclick: {
    enabled:      true,
    carriers:     ['cmcc', 'cucc', 'ctcc'],   // 移动 / 联通 / 电信
    accessKey:    '__ONECLICK_ACCESS_KEY__',
    secretKey:    '__ONECLICK_SECRET_KEY__',
    timeoutMs:    5000,
    /* 取号后是否仍需短信验证码？
       true（默认）：取号只用于回填号码，身份验证仍走短信 —— 注册/换设备等高风险场景推荐。
       false：运营商网关认证免密直登，取到号即登录，不再下发短信。
       两种模式共用同一套 UI 与接口，切换此开关即可，无需改代码。 */
    requireSms:   true,
    /* 演示用：模拟取号结果 success | no-sim | no-network | timeout | user-switch */
    debugMock:    'success'
  },

  /* ---------- 第三方授权 ---------- */
  oauth: {
    wechat: {
      appId:         '__WECHAT_APPID__',
      appSecret:     '__WECHAT_APPSECRET__',   // ⚠️ 只应存在于服务端
      scope:         'snsapi_userinfo',
      universalLink: '__WECHAT_UNIVERSAL_LINK__',
      debugMock:     'success'
    },
    qq: {
      appId:         '__QQ_APPID__',
      appSecret:     '__QQ_APPSECRET__',
      scope:         'get_user_info',
      debugMock:     'success'
    },
    douyin: {
      clientKey:    '__DOUYIN_CLIENT_KEY__',
      clientSecret: '__DOUYIN_CLIENT_SECRET__',
      scope:        'user_info',
      debugMock:    'success'
    },
    apple: {
      serviceId:    '__APPLE_SERVICE_ID__',   // iOS 必接：苹果要求提供第三方登录时必须提供「通过 Apple 登录」
      teamId:       '__APPLE_TEAM_ID__',
      keyId:        '__APPLE_KEY_ID__',
      scope:        'name email',
      debugMock:    'success'
    }
  },

  /* ---------- 令牌 ---------- */
  token: {
    accessTtlSec:     1800,      // access_token 30 分钟
    refreshTtlSec:    2592000,   // refresh_token 30 天
    refreshAheadSec:  300,       // 提前 5 分钟静默刷新，避免临界失败
    /* 演示用：把有效期压缩到秒级，方便观察「过期 → 静默刷新 → 强制登出」全链路 */
    demoAccelerate:   false
  },

  /* ---------- 协议 ---------- */
  agreements: {
    version: '2026-10-29',
    terms:   '__TERMS_URL__',
    privacy: '__PRIVACY_URL__',
    /* 合规：未勾选协议不得调用获取验证码接口（个人信息保护法 + 工信部要求） */
    requireCheckedBeforeSms: true
  },

  /* ---------- 完善资料（首次登录）---------- */
  profile: {
    /* 昵称：客户端规则必须与服务端一致。客户端只做即时反馈，最终以服务端校验为准 */
    nickMinLen:   2,
    nickMaxLen:   12,
    /* 允许中英文、数字、下划线、连字符；禁止 emoji / 空格 / 特殊符号（昵称要可被搜索与 @） */
    nickPattern:  '[\\u4e00-\\u9fa5A-Za-z0-9_-]+',
    /* 官方保留昵称（生产由服务端敏感词库 + 占用库判定） */
    reservedNicks: ['admin', 'administrator', '野遇', '野遇官方', '官方客服', '客服', '系统消息'],
    /* 实时查重：输入停止后延迟发起，避免每敲一个字都打一次接口 */
    checkDebounceMs: 400,

    /* 头像 */
    avatar: {
      maxSizeMb:       10,     // 单张上限
      minPx:           80,     // 最小边长，低于此值裁剪后会模糊
      acceptMime:      ['image/jpeg', 'image/png', 'image/webp'],
      /* input[accept]：尽量只放出支持的格式，从源头减少"选错格式"的概率 */
      acceptAttr:      'image/jpeg,image/png,image/webp',
      outputPx:        320,    // 裁剪输出尺寸（正方形）
      outputQuality:   0.9,
      /* 本地二次压缩阈值：超了就降一档重新导出，兼顾清晰度与存储/流量 */
      compressAboveKb: 220
    },

    /* 跳过后下次登录是否仍提示完善（true = 资料没补齐就一直轻提醒） */
    forceUntilCompleted: true,
    /* 保存成功后是否跳过「兴趣标签」引导直接进首页（true = 直接进首页） */
    skipOnboardAfterProfile: true,
    /* 演示开关：模拟保存结果 success | fail，用于走查「失败重试」分支 */
    debugSaveMock: 'success'
  },

  /* ---------- 安全策略 ---------- */
  security: {
    lockSec:        300,     // 连续错误后的冷却
    deviceBind:     true,    // 新设备二次校验
    riskCheck:      true,    // 风控（代理/模拟器/高频）
    oneClickFallbackSms: true
  }
};

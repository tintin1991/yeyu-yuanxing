# v0.76 清理清单：移除的原型演示 / 测试 / 调试内容

> 用途：进入 Flutter 开发前的核对表。每一行都标注了**原所在位置**，便于你逐条确认是否该删。
> 版本 `v0.76` / 缓存 `?v=98` / 回退点 `backups/v0.76/`（含被删除的 `用户测试工具包.html`）
> 冒烟：**899 通过 / 0 失败**

---

## 一、A/B 实验系统

| 被移除内容 | 原位置 |
|---|---|
| A/B 分流核心：`AB_KEY`、`abVariant()`、uid 哈希分组、`ab_assignment` 埋点 | `assets/analytics.js` |
| 广场 CTA 双文案（A「打招呼」/ B「说句你好」） | `assets/app.js` `renderPlaza()`、详情页 CTA |
| 顶栏 A/B 角标 `#abTag`（含按 tab 显隐的控制逻辑） | `index.html` 发现页 navbar；`assets/app.js` |
| 看板内「A/B 实验：广场 CTA 文案」分组 + 转化率 `cvr()` | `assets/app.js` |
| 埋点漏斗里的 A/B 相关说明 | `assets/analytics.js` 头部注释 |

## 二、原型数据看板

| 被移除内容 | 原位置 |
|---|---|
| `ov-lab`「原型数据看板」浮层（含漏斗 / 事件统计 / 反馈列表） | `index.html` |
| `renderLab()`、`cvr()`、`#labBody` 渲染 | `assets/app.js` |
| 我的页入口「📊 原型数据看板 · 埋点漏斗 / A·B 分组」 | `assets/app.js` |
| 侧栏「实时行为漏斗」`#sideFunnel` + `renderSidebar()` | `index.html` / `assets/app.js` |
| 看板样式 `.lab-sec` / `.ev-row` / `.fbar` | `assets/app.css` |

## 三、重置 / 清空类操作

| 被移除内容 | 原位置 |
|---|---|
| 我的页「🧹 清空原型数据 · 恢复初始 Mock 数据」 | `assets/app.js` |
| 设置页底部「清空原型数据」按钮 | `assets/app.js` |
| 侧栏「重置数据」按钮 | `index.html`（随侧栏整体移除） |
| `case 'reset'` 确认弹窗 + `DB.reset()` + `A.clearAll()` | `assets/app.js` |
| `Analytics.clearAll()`（仅供 reset 调用） | `assets/analytics.js` |
| 删除确认文案「（原型可重置数据）」「（原型可重置恢复）」×3（动态 / 会话消息 / 删除会话） | `assets/app.js` |

## 四、原型标识与占位文案

| 被移除内容 | 原位置 |
|---|---|
| 我的页页脚「野遇 · 可交互原型 / 数据仅存于本地浏览器」 | `assets/app.js` `.me-foot` |
| 页面标题「可交互原型 v0.68」 | `index.html` `<title>`（现为「野遇 · 陌生人社交 App v0.76」） |
| 设置页「当前版本 v0.75 原型（非生产环境）」 | `assets/app.js` |
| 设置页「用户协议 / 隐私政策」说明「原型占位」 | `assets/app.js` |
| 动态详情「地图位置 · 原型占位」 | `assets/app.js` |
| 「已发送图片（原型占位）」、通用 `toast('原型占位功能')`、协议 `toast('原型占位：…')` | `assets/app.js` |
| 靓号商城 / VIP 收银台「原型为本地模拟支付，不产生真实交易」 | `assets/app.js` |
| 支付页「演示密码：123456（原型模拟，不产生真实扣款）」 | `assets/pay.js` |
| 支付页「原型为纯本地模拟，不会产生真实扣款…」 | `assets/pay.js` |
| 扫码页「原型模拟：点击后随机识别一位陌生人的二维码…」 | `index.html` |
| 发布页「配图（点选占位图，原型阶段不接真实上传）」 | `index.html` |
| 反馈弹窗「原型阶段最重要的一件事：哪里不好用？」 | `index.html` |
| 圈子邀请码页「演示邀请码：NS5Q0T / HC8K2P」 | `assets/app.js` |
| 入圈申请「（演示提示：进入『XX』→ 成员管理 → 入圈审核…）」 | `assets/app.js` |
| 破冰话术「不同话术的回应率不同 —— 这正是要验证的」 | `index.html` `#greetHint` |
| 侧栏「核心假设（要被验证的）」H1 / H2 / H3 | `index.html` |

## 五、调试 / 演示开关

| 被移除内容 | 原位置 |
|---|---|
| 侧栏「授权结果模拟」下拉 + `setAuthMock()` + `window.__AUTH_MOCK__` | `index.html` / `assets/app.js` / `assets/auth.js` |
| 侧栏「头像选图模拟（异常分支）」+ `setAvatarMock()` + `window.__AVATAR_MOCK__` | `index.html` / `assets/app.js` |
| 设置页「⏱️ 模拟 token 过期（演示：置为已过期…）」 | `assets/app.js` |
| 支付页「模拟支付失败（验证异常态）」复选框 | `assets/pay.js` |
| `?nice=88888` 演示参数（直接给账号挂靓号） | `assets/app.js` 启动段 |
| `config.env: 'prototype'` → `'production'`；`exposeCodeInDemo: true` → `false` | `assets/config.js` |
| 系统消息页「📨 模拟后台推送一条新消息」「📥 导入后台推送包（JSON）」 | `assets/app.js` |
| `ov-sysimport` 导入浮层 + `SYS_DEMO_PUSH` 演示语料池 + 导入/推送三个函数 | `index.html` / `assets/app.js` |

## 六、伪造的互动数据

| 被移除内容 | 原位置 |
|---|---|
| 发布动态后延迟随机给 1–3 个陌生人点赞 +「有 N 位同好点赞了你的动态」 | `assets/app.js` `doPublish()` |
| 打招呼后按开场白概率自动回复（`op.p` 决定回不回，属 H1 实验变量） | `assets/app.js` `doGreet()` |

## 七、预览壳与配套文件

| 被移除内容 | 原位置 |
|---|---|
| 整个 `.side` 侧栏（62 行）：品牌说明 / 版本说明 / 核心假设 / 实时漏斗 / 15 分钟走查路径 / localStorage 说明 / 模拟自动回复说明 / 快捷键说明 / 快捷按钮组 | `index.html` |
| 侧栏样式 `.side` / `.side-card` / `.side-btns` / `.side-tip` / `.side-row` / `.kbd` / `.funnel-row` / `.fbar` | `assets/app.css` |
| 调试面板样式注释「右侧调试面板：授权结果模拟下拉」 | `assets/app.css` |
| `用户测试工具包.html`（原型 v0.2 用户测试工具，含「这是一个原型，不是真产品」等文案） | 根目录 → 已移入 `backups/v0.76/` |

---

## 八、有意保留（请重点核对这几条）

这些**没有删**，因为它们是真实业务能力或架构基础。如果你认为也该去掉，告诉我。

| 保留项 | 理由 | Flutter 阶段的处理 |
|---|---|---|
| **埋点 `A.track()` 共 130 处调用** | 用户行为分析是真实需求；已删的只是 A/B 分组与看板 | 整体替换为 firebase_analytics / 神策 / GrowingIO。这 130 处就是埋点需求清单 |
| **`auth.js` 假后端 + `config.debugMock`** | 没有真实服务端，登录/取号跑不起来 | Flutter 阶段替换为真实 API；异常分支改用单元测试 mock 覆盖 |
| **`data.js` 种子数据**（好友 / 动态 / 圈子 / 系统消息） | 数据模型的基础，也是 Flutter UI 的填充数据 | 保留结构，接后端后由接口下发 |
| **反馈功能**（我的页「提交反馈」+ 反馈弹窗） | 真实业务功能 | 保留，接工单/反馈接口 |
| **打招呼本身 + 破冰话术选择** | 陌生人社交的核心功能，删的是"概率自动回复"这个实验变量，不是功能 | 保留；回应由真人产生 |
| **设计规范展示页**（含「点我演示 loading」按钮） | 设计资产，不是业务界面；给 UI/Flutter 对照用 | 不进 App，留在文档里 |
| **支付失败态代码路径**（`failMode`） | 真实支付也有失败分支；删的只是界面上的模拟开关 | 由真实支付结果驱动 |

---

## 九、副作用：因清理而失效的测试

以下冒烟用例依赖被删的调试入口，已改为**反向断言**（验证"确实已移除"）或删除。共 4 处：

| 原用例 | 处理 |
|---|---|
| 侧栏快捷按钮切换暗色 / 侧栏限高内滚 | 改为断言「侧栏已移除、主题入口只剩设置页开关」 |
| 取号失败兜底 / 第三方授权异常（取消、未安装、已绑其它号） | **删除**（依赖 `setAuthMock`）。⚠️ 这些异常分支代码仍在，Flutter 阶段请用单元测试 + mock 覆盖 |
| 头像无相册权限提示（依赖 `setAvatarMock`） | 删除；保留 `!FileReader` 的真实兜底 |
| 模拟后台推送 / 导入推送包（4 条） | 删除，改为断言「演示入口已移除」 |

> ⚠️ 注意：删掉调试开关后，**异常分支（无 SIM 卡、取号超时、取消授权、未安装客户端、支付失败）在界面上无法再触发**。这些分支的处理代码都还在，但只能靠单元测试验证。Flutter 阶段建议优先补这几条测试。

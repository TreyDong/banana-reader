# 手机候选 0.15.2-mobile.1（2026-11-07）

## 基线

- 本地 `main` 由 `92224a9` 快进到当时的开发镜像 `origin/main`（`obsidian-gloss-reader`）`3e4c3b6`，补齐此前未拉取的 6 个提交：连接测试按钮与地址规范化 `adf1b5e`、选区预览与笔记面板状态修复 `cc0fe4b`、微信读书书架浏览与本地交接 `9dd52e3`。无本地独有改动被覆盖。该镜像已于同日归档，仓库收敛为 `TreyDong/banana-reader`，详见 `notes/repository-consolidation-2026-11-07.md`。
- 正式版根 manifest 保持 `gloss-reader`、`0.15.1`、`isDesktopOnly: true`；`validate-metadata` 仍强制桌面元数据。
- `scripts/build-mobile-candidate.mjs` 更新：断言基线 `0.15.1`（原断言停在 `0.14.9`），候选版本改为 `0.15.2-mobile.1`（原常量 `0.15.0-mobile.9`）。

## 验证

- `npm run check` 通过：lint 0 警告，252 项测试全部通过（0.15.1 为 231 项，新增微信读书与 API 连接测试），TypeScript 与生产构建成功。
- 候选 `main.js` 与同一源码的主线构建逐字节一致；启动不导入 Node / Electron，由既有移动传输、生命周期、迁移与镜头测试及构建时的动态代码检查覆盖。
- 候选三件套 SHA-256：
  - `main.js` `72b6862a212a18baed1563cac4ef21b4381234bea75b29ad597ec93215b2a77c`
  - `manifest.json` `01c9acf82b77568f69147f5a0fd372d0e68ce2fbe5d2120616ae66660956d82f`（版本 `0.15.2-mobile.1`，`isDesktopOnly: false`）
  - `styles.css` `be57b90cc4c749d13b6913b9ab3edce9c18af980cc34a69ec9942a985c655fc6`

## 部署

- 个人库插件目录 `<vault>/.obsidian/plugins/gloss-reader/` 已替换为上述三件套并逐一核对哈希；`data.json` 与 `indices/` 未改动。
- 替换前部署的是微信读书试验分支构建（`t3/weread-integration-feasibility`，`main.js` `a1ab2072…`、`styles.css` `efa551be…`、`manifest.json` `615bf73b…`），已备份到外置硬盘归档（20261107）。
- Obsidian 桌面端需重载插件或重启后才加载新包；运行中的实例仍持旧内存。

## 剩余

- 真机验收要求不变，见 `docs/mobile-candidate.md`。本候选额外包含微信读书书架、连接测试按钮与选区/笔记面板修复，这些区域一并纳入设备检查；微信读书需使用自己的账号登录，安装包不包含账号数据。
- `publication/main`（`TreyDong/banana-reader`）仍落后 `origin/main` 4 个提交，微信读书、连接测试与选区修复尚未同步到公开仓库；发布前需先决定是否同步。

## 2026-11-09：0.15.2-mobile.2（手机真机反馈）

用户在 OnePlus 15T / 平板上反馈五处手机与平板界面问题，本次修复并重建候选：

- 顶部按钮被吞：焦点模式的阅读页是 body 级覆盖层，原样式只用 `env(safe-area-inset-top)`；Android WebView 为 0 时工具条从 0 开始，左侧返回按钮落在状态栏/刘海下。`updateMobileViewport` 现在取宿主 `.view-header` 的实际顶部位置与 `--safe-area-inset-top` 的较大值，写入 `--mobile-safe-top`（上限 96px），工具条、笔记本顶部和左右安全区都改用该变量。停靠状态为 0，不额外留白。
- 选文菜单出现过早：移动端选文防抖从 120ms 改为「最后一次 selectionchange 后 550ms 且手指已抬起」才显示，拖动原生选区手柄期间不出现。
- 颜色变成椭圆：Obsidian 1.15 的通用 `button` 规则给按钮加了 `corner-shape: superellipse(1.33)`，50% 圆角因此显示为方圆/椭圆。标记点补 `corner-shape: round`，手机颜色面板改为 24px、间距 16px 的居中圆点。
- 对话输入框过宽：手机提问镜片由固定铺满改为 `mobileAskLensWidth`，390px 屏宽下 300px（原 339px），最窄 220px。
- 发送按钮样式被重置：主提问框、镜片提问框和追问框的发送按钮统一为圆形深色按钮（`border-radius: 999px`、`corner-shape: round`），镜片按钮不再用紫色 accent。
- 顺带修正手机操作面板被横向滚动规则覆盖的优先级问题（`is-mobile-actions` 不再套用 `overflow-x:auto`）。

验证：`npm run check` 通过（lint 0 警告，254/254 测试，含新增的选文等待与提问框宽度测试）；独立 Obsidian 1.15.0 移动模拟（390×840）实测工具条顶部留白 59px、返回按钮 y=65、颜色点 24×24 且 `corner-shape: round`、提问镜片宽 300px、三个发送按钮均为圆形深色、选文 250ms 时不显示而 900ms 后显示、停靠状态留白 0、笔记本顶部 117px（58+59）。未操作日常库数据。

候选三件套 SHA-256：

- `main.js` `352bd823a20013612f57d7bb02ad7aaeefb6cc0cc81ae9a8372c86dfe8174f36`
- `manifest.json` `051423b76b2c516899b214cdb2a724cae705ee150bc75d2abc17c2291f8c8e2a`（版本 `0.15.2-mobile.2`，`isDesktopOnly: false`）
- `styles.css` `ee9b68afe8b465d75298f1cb1919f667f1e919176db87284b3deae1482211b1e`

已替换个人库 `<vault>/.obsidian/plugins/gloss-reader/` 的同名三件套并逐一核对哈希；`data.json` 与 `indices/` 未改动。替换前的 0.15.2-mobile.1 三件套备份在 `~/Desktop/90_系统/临时/gloss-reader-20261109-backup/`。运行中的 Obsidian 仍持旧代码，需重载插件或重启应用后生效。

## 2026-11-10：0.15.2-mobile.3（底部工具坞）

参考微信读书的手机布局，把手机端工具从顶部迁到悬浮底栏，顶部只留返回：

- 新增 `gloss-dock` 悬浮底栏（圆角胶囊，44px 触摸按钮），从左到右为：文档目录、记笔记、提问、笔记本（含未读角标）、外观（字号/主题）。桌面端按钮结构与顺序不变。
- 手机顶部工具条只保留「返回文档」（PDF 另有原版页面/文字重排切换）；原顶部的目录、字号、对话、记笔记、笔记本全部移入底栏。对话按钮从顶部去掉，入口移到底栏。
- 打开提问框、记笔记面板或笔记本抽屉时底栏自动隐藏，关闭后恢复；文档目录是弹窗，不影响底栏。
- 外观面板和记笔记面板在手机端改为底栏上方弹出，不再固定在顶部右侧；正文底部留白加大，避免文字压在底栏下。
- 选文悬浮菜单的位置计算扣除底栏区域：靠下选中时菜单出现在选区上方，靠上时出现在下方，不再被底栏遮挡。
- 「嵌入」（本书索引/嵌入检索）按钮按要求从手机顶部移除。经查该功能在手机端本身可用：API 请求统一走 requestUrl 传输，模型发现与嵌入向量有专门测试覆盖（tests/mobile.test.ts），真机未实测；需要时仍可从提问框「问答范围 → 管理本书索引」进入。桌面端入口不变。
- 文档头部「原文 ↗」按钮在手机端隐藏：沉浸页是全屏覆盖层，点击后在覆盖层下面打开原文，看起来没有反应；「返回文档」本来就是退出并打开原文，功能重复。

验证：`npm run check` 通过（254/254 测试，lint 0 警告）；独立 Obsidian 1.15 移动模拟实测：顶部仅返回按钮，底栏 244×56 五键齐全，提问/记笔记/笔记本打开时底栏隐藏、关闭恢复，外观面板在底栏上方弹出可滚动，选文菜单不与底栏重叠；桌面端按钮顺序按构造顺序保持不变。

候选三件套 SHA-256：

- `main.js` `ea22039c8e6c2b8eba4c4ce21ad8c04d7e4ee3b09f0af5b13d502176fda9d88e`
- `manifest.json` `b3bbcf4247fbe3fee190fb551d017862e75ff2ca89bf3bbfbd7d268bf07a536d`（版本 `0.15.2-mobile.3`，`isDesktopOnly: false`）
- `styles.css` `2d105d945b951081c5bd245e1e68206c9f24c66f21d63142a80783490fe8ef90`

已替换个人库同名三件套并核对哈希；`data.json`、`indices/` 未动。mobile.2 三件套备份在 `~/Desktop/90_系统/临时/gloss-reader-20261110-backup-mobile.2/`。重载插件或重启 Obsidian 后生效。

## 2026-11-10：0.15.2-mobile.4（底部长条 + 悬浮圆圈）

按真机反馈把手机端底部改成微信读书式布局，并修掉提问框点空白不消失的问题：

- 底部工具改为通栏长条（贴屏幕底边、满宽、上边框分隔），三个入口均分：文档目录、字号/外观、笔记本。字号回到第二个位置，笔记本留在底栏。
- 记笔记与提问改为底栏右上方的两个悬浮圆按钮（52px 圆形），与参考图一致；打开提问框、选文菜单、外观面板、记笔记面板或笔记本时自动隐藏。
- 提问框停在底栏之上（底部留出 64px + 安全区），不再压在底栏上。
- 修复：手机端提问框打开后点空白处不消失。现在点击正文、标题等空白区域即收起提问框，点底栏按钮、悬浮圆圈、选文菜单和模型选择器不会误关。
- 修复：极端情况下丢失 pointerup（例如手指滑出窗口）会让「手指仍按着」状态一直为真，选文菜单再也不出现。现在该状态超过 2 秒自动失效。
- 选文菜单：只在选中文本仍在可视区时显示；位置计算扣除底栏，选区靠下时菜单出现在选区上方，避免与底栏和悬浮圆圈重叠。
- 新增英文文案「快捷操作」。

验证：`npm run check` 通过（254/254 测试，lint 0 警告）；独立 Obsidian 移动模拟实测：底栏 390×59 满宽三键均分，悬浮圆圈 52×52 位于右下，问题框在底栏上方且点空白可关闭，底栏/圆圈按状态隐藏，选区靠下时菜单出现在上方。

候选三件套 SHA-256：

- `main.js` `d286cd52f139d3a1fec40011ded971aac189bf0e84b6caf616bd2d1cd687185e`
- `manifest.json` `8e2fe1a8ea2a3ed6ff559486b994766fe06311def381b2a07a8406f3910e5c8e`（版本 `0.15.2-mobile.4`，`isDesktopOnly: false`）
- `styles.css` `6d46ca9bbfc4ece573a9d530b7f1d46233267f556deb34e92ccf08f97b5450cd`

已替换个人库同名三件套并核对哈希；`data.json`、`indices/` 未动。mobile.3 三件套备份在 `~/Desktop/90_系统/临时/gloss-reader-20261110-backup-mobile.3/`。重载插件或重启 Obsidian 后生效。

## 2026-11-10：0.15.2-mobile.5（滚动自动隐藏 + 笔记本移到顶部）

按真机反馈补上滚动隐藏，并把笔记本按钮移到顶部工具条：

- 滚动时自动隐藏底部工具：向下滚动超过 32px 收起底栏和悬浮圆圈，向上滚动超过 24px 或点正文空白处立即恢复；回到顶部时始终显示。打开文档和切换沉浸模式后的 600ms 内不响应滚动，避免恢复滚动位置时误触发。
- 笔记本按钮移到手机顶部工具条右侧（与返回按钮相对），底栏只剩文档目录、字号/外观两项；记笔记、提问仍是右下悬浮圆圈。
- 底栏和悬浮圆圈用 transform + opacity 过渡（220ms），隐藏时不接收点击，不会挡住正文操作。
- 打开提问框、外观面板、选文菜单、记笔记面板或笔记本抽屉时强制显示底栏（先恢复再按状态隐藏），避免在面板上方留下补位动画。
- 桌面端按钮结构与顺序不变。

验证：`npm run check` 通过（254/254 测试，lint 0 警告）；独立 Obsidian 1.15 移动模拟实测：底栏顶部 y=781，向下滚动后进入隐藏态（translateY 至 840）、向上滚动恢复、点空白恢复；顶部工具条为返回 + 笔记本（56×40，位于 x=322, y=65），底栏仅目录与字号，悬浮圆圈 52×52；顶部笔记本按钮可正常打开抽屉且打开时底栏隐藏。

候选三件套 SHA-256：

- `main.js` `354fcc60fe4d5ca74b2cc9468ecb4ef6baf4698b9c4f67d1137341882c93296c`
- `manifest.json` `d0aa35fcc2c93155c346549c153aea84e5fddfeca26eb710cd93e462d72219c6`（版本 `0.15.2-mobile.5`，`isDesktopOnly: false`）
- `styles.css` `216ea17ff506e37e1d2f9a190623d39be85f815679e370d9303c6eee120217b1`

已替换个人库同名三件套并核对哈希；`data.json`、`indices/` 未动。mobile.4 三件套备份在 `~/Desktop/90_系统/临时/gloss-reader-20261110-backup-mobile.4/`。重载插件或重启 Obsidian 后生效。

## 2026-11-10：0.15.2-mobile.6（顶部工具条也随滚动隐藏）

补上上一版漏掉的一点：顶部工具条也要跟着滚动隐藏。

- 手机端顶部工具条（返回、笔记本）加入隐藏逻辑：向下滚动超过 32px 时整条上移淡出，向上滚动超过 24px 或点正文空白处滑回；和底栏、悬浮圆圈同一套状态类 `gloss-chrome-hidden`、同一段 220ms 过渡。
- 顶部工具条仍在文档流里占位，隐藏时不重排正文，文字不会跳。
- 隐藏时不接收点击，不会挡住正文操作。

验证：`npm run check` 通过（254/254 测试，lint 0 警告）；独立 Obsidian 1.15 移动模拟实测：下滚后顶部工具条 y 从 0 移到 -111（完全移出视野）、底栏 y 从 781 移到 840、悬浮圆圈同步淡出；上滚或点正文后三者一起回来（顶部 y 回到 0、底栏 781）。全隐藏时正文满屏无遮挡。

候选三件套 SHA-256：

- `main.js` `354fcc60fe4d5ca74b2cc9468ecb4ef6baf4698b9c4f67d1137341882c93296c`
- `manifest.json` `5d4535f15312b5d52e2597e2354b057714bafa96d2ef37476ec4b212e6488393`（版本 `0.15.2-mobile.6`，`isDesktopOnly: false`）
- `styles.css` `270d5e49689df01076705d8b0c4e0924944b8ffd5dd4b2d9329e2253e5c60044`

已替换个人库同名三件套并核对哈希；`data.json`、`indices/` 未动。mobile.5 三件套备份在 `~/Desktop/90_系统/临时/gloss-reader-20261110-backup-mobile.5/`。重载插件或重启 Obsidian 后生效。

## 2026-11-10：0.15.2-mobile.7（选区悬浮菜单重排）

按真机反馈重排手机端选区后的悬浮菜单：

- 划线和颜色合并成一个菜单：点调色盘按钮后，第一排是四个颜色点，第二排是三种划线类型（直线、波浪线、荧光笔）。之前划线类型藏在「更多」里，两处入口合并。
- 新增「快捷操作」入口（闪电图标）：点开后是一排选中文本指令（解释、释义、简化、反例、翻译），另带「管理选中文本指令」和「移除这条标记」。
- 原来的「…」更多按钮改成复制按钮，复制选中文本变成一按即用的顶层操作。
- 菜单条从 280px 加宽到 300px，六个按钮（使用当前标记、颜色与划线类型、写批注、提问、快捷操作、复制）各 44px 一行放下。

验证：`npm run check` 通过（254/254 测试，lint 0 警告）；独立 Obsidian 1.15 移动模拟实测：菜单条 300×52，六个按钮 44×44 齐全；颜色与划线面板展开后 300×138，颜色点 24px 一排四个、划线类型一排三个；快捷操作面板展开后 300×103，五个指令文字按钮加一个设置图标。

候选三件套 SHA-256：

- `main.js` `e50faf8b9fed1b1731306baa06f078008c36eee882b62db4ff989c9cc419a0be`
- `manifest.json` `8d68430e7da615d139eff983ec1beada3a7cdeb9cb41fb40b40c07eb6e83cb1a`（版本 `0.15.2-mobile.7`，`isDesktopOnly: false`）
- `styles.css` `9cd09fabe2fef7462f469f176a2e94868d6f06053c9e66f3fc311aa29e802b25`

已替换个人库同名三件套并核对哈希；`data.json`、`indices/` 未动。mobile.6 三件套备份在 `~/Desktop/90_系统/临时/gloss-reader-20261110-backup-mobile.6/`。重载插件或重启 Obsidian 后生效。

## 2026-11-10：0.15.2-mobile.8（划线入口合一）

上一版把颜色和划线类型并成一个面板，但保留了「使用当前标记」和「颜色与划线类型」两个顶部按钮；这一版按反馈把两个按钮真正合成一个：

- 悬浮菜单条改为五个按钮：颜色与划线类型、写批注、提问、快捷操作、复制选中文本。
- 划线不再有单独的一键按钮；点第一个按钮选颜色即可直接用当前划线类型标记，选划线类型则用当前颜色标记，两个动作都保留在面板里。

验证：`npm run check` 通过（254/254 测试，lint 0 警告）；独立 Obsidian 1.15 移动模拟实测：菜单条五个按钮 44×44 等距排开，颜色与划线面板展开后 300×138，颜色四个一行、划线类型三个一行。

候选三件套 SHA-256：

- `main.js` `ff2031d75eb20642119a8b0f3160c5f76d52333e215fe29d757170ca9037b390`
- `manifest.json` `4ced6cb638a75e2b0ebf4c6a119ef077c7e80c8a07336df2b341682ddde7d5d1`（版本 `0.15.2-mobile.8`，`isDesktopOnly: false`）
- `styles.css` `9cd09fabe2fef7462f469f176a2e94868d6f06053c9e66f3fc311aa29e802b25`

已替换个人库同名三件套并核对哈希；`data.json`、`indices/` 未动。mobile.7 三件套备份在 `~/Desktop/90_系统/临时/gloss-reader-20261110-backup-mobile.7/`。重载插件或重启 Obsidian 后生效。

## 2026-11-10：0.15.2-mobile.9（划线入口换成划线图标）

上一版把两个划线入口合成一个，但图标仍是调色盘；这一版换成划线图标：

- 划线入口的图标从调色盘改为划线（下划线）图标，右下角仍带当前标记颜色的小圆点。
- 菜单条五个按钮依次是：划线、写批注、提问、快捷操作、复制。

验证：`npm run check` 通过（254/254 测试，lint 0 警告）；独立 Obsidian 1.15 移动模拟实测：五个图标依次为 lucide-underline、lucide-pen-line、lucide-message-circle、lucide-zap、lucide-copy。

候选三件套 SHA-256：

- `main.js` `c3216756962e949bf9cc6ad71a70e06af810e709ef95afb03c37f2a94047b354`
- `manifest.json` `a4259c437fbf5c741f74d08a843279774b7b7d4c904486a8368e2c3548905c60`（版本 `0.15.2-mobile.9`，`isDesktopOnly: false`）
- `styles.css` `9cd09fabe2fef7462f469f176a2e94868d6f06053c9e66f3fc311aa29e802b25`

已替换个人库同名三件套并核对哈希；`data.json`、`indices/` 未动。mobile.8 三件套备份在 `~/Desktop/90_系统/临时/gloss-reader-20261110-backup-mobile.8/`。重载插件或重启 Obsidian 后生效。

## 2026-11-10：0.15.2-mobile.10（图标带文字，划线换成微信读书样式）

参考微信读书的选区工具条，把手机端的图标改成图标加文字：

- 选区悬浮菜单的五个按钮改为图标在上、文字在下：划线、批注、提问、快捷、复制，每个按钮 50×48，文字 11px。
- 划线图标按微信读书的做法重画：字母 A 下面一条横线（不再是下划线图标），右下角仍带当前标记颜色的小圆点。
- 划线面板里的三种划线类型也补上文字：直线、波浪线、荧光笔。
- 快捷操作面板里的两个图标按钮改成文字按钮：管理指令、移除标记。
- 底部工具条同样改为图标加文字：目录、字号；底栏高度从 59px 变成 76px，提问框、悬浮圆圈、外观面板和笔记面板的离底距离同步抬高。

验证：`npm run check` 通过（254/254 测试，lint 0 警告）；独立 Obsidian 1.15 移动模拟实测：底栏 390×76，两个项目各 46×46 圆按钮加 11px 文字；悬浮菜单 300×56，五个按钮 50×48，划线面板展开 300×144，划线类型三行各 46×40。

候选三件套 SHA-256：

- `main.js` `d849fb6623fd5a9a38047c86c9ecd6f09bc99e01b2e3173fde1a1d546a1d97a4`
- `manifest.json` `cba18eb67ae3ce1e1b5b5cc384721c431bc633a1cec4415a6d44bad29d46fac2`（版本 `0.15.2-mobile.10`，`isDesktopOnly: false`）
- `styles.css` `ef1f80806da6c3892c09fefedca719eceaa6d4e2cbfd9b9450b2b6a3af3c0e2e`

已替换个人库同名三件套并核对哈希；`data.json`、`indices/` 未动。mobile.9 三件套备份在 `~/Desktop/90_系统/临时/gloss-reader-20261110-backup-mobile.9/`。重载插件或重启 Obsidian 后生效。

## 2026-11-10：0.15.2-mobile.11（划线类型改成微信读书的 A 字图标）

按真机给的参考图重画划线类型图标：

- 三种划线类型不再用通用图标，改成参考图的做法：字母 A 加线条处理。直线是 A 下加实线，波浪线是 A 下加波浪线，荧光笔是 A 填上当前标记颜色的方块。
- 每个划线类型放在 40px 圆形按钮里，下面照旧带文字。
- 颜色一行改成参考图的样式：纯色圆点，当前选中的那个圆点里加一个对勾。
- 顶部工具条的划线入口保持 A 字加下划线，和面板里的直线图标一致。

验证：`npm run check` 通过（254/254 测试，lint 0 警告）；独立 Obsidian 1.15 移动模拟实测：划线面板展开 300×164，颜色一行四个圆点（当前颜色带对勾），划线类型一行三个 40px 圆按钮，分别是 A 加实线、A 加波浪线、A 填当前颜色方块。

候选三件套 SHA-256：

- `main.js` `7a4d410101cab50703ee4a959c251ef4abf823b74bfc126324698624d19304c5`
- `manifest.json` `03589d0353f22618fb5e7a135020692e2e1517aa988215c03a17f48fc610ac76`（版本 `0.15.2-mobile.11`，`isDesktopOnly: false`）
- `styles.css` `c8e23bc4f980efc9330970d532696df7d25150094b6494ed8ac3b6bd65069696`

已替换个人库同名三件套并核对哈希；`data.json`、`indices/` 未动。mobile.10 三件套备份在 `~/Desktop/90_系统/临时/gloss-reader-20261110-backup-mobile.10/`。重载插件或重启 Obsidian 后生效。

## 2026-11-10：0.15.2-mobile.12（划线面板一行排布）

按真机反馈把划线面板改成参考图的一行排布：

- 划线类型去掉下面的文字，只剩图标；三个类型按钮从 40px 加大到 44px 圆形。
- 颜色和划线类型放在同一行：左边三个类型圆钮，右边四个 28px 颜色圆点装进一个圆角胶囊（当前颜色带对勾）。
- 悬浮菜单整体从 300px 加宽到 340px；顶部工具条图标从 22px 加到 24px、文字 12px，比例跟参考图接近。

验证：`npm run check` 通过（254/254 测试，lint 0 警告）；独立 Obsidian 1.15 移动模拟实测：划线面板展开 340×121，类型行三个 44px 圆钮无文字，颜色胶囊四个 28px 圆点。

候选三件套 SHA-256：

- `main.js` `26e49ef484e56f3483f8c5c1550352bd42ac7c41524cc07b1afb285924f82f50`
- `manifest.json` `b32f40cee95945a4ad874efa5f2e2b51559d62e14c48c483313f0c759162a926`（版本 `0.15.2-mobile.12`，`isDesktopOnly: false`）
- `styles.css` `8497184e7f8d6f6b6d094433edac0c0018cdcb7f87369852b2cb25242345fed0`

已替换个人库同名三件套并核对哈希；`data.json`、`indices/` 未动。mobile.11 三件套备份在 `~/Desktop/90_系统/临时/gloss-reader-20261110-backup-mobile.11/`。重载插件或重启 Obsidian 后生效。

## 2026-11-10：0.15.2-mobile.13（波浪线改用原生下划线，面板加长）

- 波浪线样式之前用字符「∿」拼，渲染不对；现在三种划线类型都直接给字母 A 加下划线：直线是实线下划线，波浪线是波浪下划线（CSS `text-decoration: underline wavy`），荧光笔是 A 填当前颜色方块。顶部工具条的划线入口同样用实线下划线。
- 悬浮菜单从 340px 加宽到 360px（距屏幕边 6px），划线类型圆钮从 44px 加到 46px，类型与颜色之间的间距加大。

验证：`npm run check` 通过（254/254 测试，lint 0 警告）；独立 Obsidian 1.15 移动模拟实测：划线面板展开 360×124；三个 A 字的 text-decoration 依次为实线下划线、波浪下划线、无（当前色填充）。

候选三件套 SHA-256：

- `main.js` `95cecb597e93974f3bf46b1c2a3086627e0cf1ca44e7c4a635c25cd1d4a02d3f`
- `manifest.json` `5006fc0229b9ba7caeee162b04623bb2cbe09d1710c246ea2b811595b6442e27`（版本 `0.15.2-mobile.13`，`isDesktopOnly: false`）
- `styles.css` `27fc28703a323e2e819292192b5a1df5b7270bbf011b3aa71b99654ededbd0da`

已替换个人库同名三件套并核对哈希；`data.json`、`indices/` 未动。mobile.12 三件套备份在 `~/Desktop/90_系统/临时/gloss-reader-20261110-backup-mobile.12/`。重载插件或重启 Obsidian 后生效。

## 2026-11-10：0.15.2-mobile.14（工具条一行拉高）

悬浮菜单顶部那一行（划线、批注、提问、快捷、复制）整体拉高：按钮上下留白从 6px 加到 10px/8px，图标和文字间距 4px 加到 5px，一行高度从约 52px 变为 59px。

验证：`npm run check` 通过（254/254 测试，lint 0 警告）；独立 Obsidian 1.15 移动模拟实测：菜单整体 360×72，工具条一行 64px 高。

候选三件套 SHA-256：

- `main.js` `95cecb597e93974f3bf46b1c2a3086627e0cf1ca44e7c4a635c25cd1d4a02d3f`
- `manifest.json` `7e65e05c188f4de8f2c5f58624e65bdf1a354eb09b36e1035cb31a2e4d1476e5`（版本 `0.15.2-mobile.14`，`isDesktopOnly: false`）
- `styles.css` `81b3cf3c7e52fa1e9b4ec08e0354b03fcd0d58b4fcfc0b3f2a7d64c88ae3f708`

已替换个人库同名三件套并核对哈希；`data.json`、`indices/` 未动。mobile.13 三件套备份在 `~/Desktop/90_系统/临时/gloss-reader-20261110-backup-mobile.13/`。重载插件或重启 Obsidian 后生效。

## 2026-11-10：0.15.2-mobile.15（手机端去掉模型选择）

- 手机端正文提问框不再显示模型选择按钮，提问一律走默认模型（设置里的「手机问答模型」，没配就用第一个可用模型），输入框因此多出一大截空间。
- 手机端发送时忽略视图里临时选的模型（桌面端仍可在提问框里切换，不受影响）。
- 桌面端提问框保留模型选择。

验证：`npm run check` 通过（254/254 测试，lint 0 警告）；独立 Obsidian 1.15 移动模拟实测：提问框 354×52，输入区宽 257px，框内只剩联网开关和发送按钮，没有模型选择器。

候选三件套 SHA-256：

- `main.js` `4b2ea8b92461ec0676694c8bb962d7ad311cedb77cee292fc14e21641bd614fc`
- `manifest.json` `1b64a2497fdca5ae305ca18e4b5cf2339d29a14ee0a97ad82cf7ec72d4615b94`（版本 `0.15.2-mobile.15`，`isDesktopOnly: false`）
- `styles.css` `81b3cf3c7e52fa1e9b4ec08e0354b03fcd0d58b4fcfc0b3f2a7d64c88ae3f708`

已替换个人库同名三件套并核对哈希；`data.json`、`indices/` 未动。mobile.14 三件套备份在 `~/Desktop/90_系统/临时/gloss-reader-20261110-backup-mobile.14/`。重载插件或重启 Obsidian 后生效。

## 2026-11-10：0.15.2（合并主干并发布正式版）

本轮手机端改动全部并入主干：分支 `t3/fix-mobile-reader-ui` 提交 `a18ae75`（手机端界面重做）与 `532f59e`（0.15.2 发布、构建脚本改为同版本号），经 PR #9 合并，`origin/main` 为 `4b70064`。合并走 PR 而非本地直推，主检出目录 `/Users/Treydong/Desktop/40_项目库/banana-reader` 当时有另一会话未提交的工作区功能，未被触碰。

正式社区版 0.15.2 已发布（仅桌面，`isDesktopOnly: true`）：

- `main.js` `4b2ea8b92461ec0676694c8bb962d7ad311cedb77cee292fc14e21641bd614fc`
- `manifest.json` `d1ceca38f68675cfdca1791dc61d95476f26183d36db4a6a70f4e818e303c62c`
- `styles.css` `81b3cf3c7e52fa1e9b4ec08e0354b03fcd0d58b4fcfc0b3f2a7d64c88ae3f708`

手机版构建方式改了：`scripts/build-mobile-candidate.mjs` 现在直接取 `manifest.json` 的版本号，输出 `dist/gloss-reader-<版本>-mobile/`，只把 `isDesktopOnly` 改成 `false`，`main.js` 与正式版逐字节一致。因此手机版版本号与同一次社区发布相同（例如 0.15.2），不再有 `-mobile.N` 这类预发布号。

手机版三件套 SHA-256：

- `main.js` `4b2ea8b92461ec0676694c8bb962d7ad311cedb77cee292fc14e21641bd614fc`
- `manifest.json` `f20cf1c5fa7dc7f76289d62fb5fca91d87a45b6f5f017694797277e11fe198b6`（版本 `0.15.2`，`isDesktopOnly: false`）
- `styles.css` `81b3cf3c7e52fa1e9b4ec08e0354b03fcd0d58b4fcfc0b3f2a7d64c88ae3f708`

已替换个人库同名三件套并核对哈希；`data.json`、`indices/` 未动。mobile.15 三件套备份在 `~/Desktop/90_系统/临时/gloss-reader-20261110-backup-mobile.15/`。重载插件或重启 Obsidian 后生效。

### 插件列表里出现 `-mobile.N` 的原因

插件已收录在官方社区清单（`obsidianmd/obsidian-releases` 的 `community-plugins.json`，ID `gloss-reader`，仓库 `treydong/banana-reader`），所以能在市场里看到。Obsidian 在插件列表显示的是**本机已安装插件 manifest 里的版本号**，不是市场上的版本号；当时本机装的是手机版 `0.15.2-mobile.15`，列表就显示这个号。而且 `-mobile.15` 属于 semver 预发布，比较时低于正式版 `0.15.2`，Obsidian 会认为本机版本落后并提示更新。改成同版本号后，列表显示 0.15.2，不会再出现候选版本号或误报更新。

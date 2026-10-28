# 手机版适配验收记录

日期：2026-10-22（Asia/Shanghai）。分支：`codex/mobile-support`。版本仍为 0.14.0，开发测试包，未发布。开始时已有书籍来源、书架及 0.14.0 相关未提交改动；本次保留这些改动。原有已跟踪文件差异的前态保存在 `/private/tmp/banana-reader-before-mobile.patch`。

## 交付

- `manifest.json` 开放移动加载；启动不导入 Node / Electron。CLI 与桌面流式 API 在调用时加载桌面依赖。EPUB 明确使用 fflate 浏览器入口，避免依赖包暗中加载 Node module / worker_threads。
- 手机通过 requestUrl 调用四种 API 协议、模型发现和 Embedding；返回完整答案与真实用量。停止、超时后忽略晚到结果；原生 requestUrl 请求不具备实际取消接口。
- 索引用 Vault.adapter 的库内相对路径读写；保留 SHA-256 文件名、身份与文章解读哈希。临时文件、备份恢复和串行写入保护上一份完整索引。
- 手机通过 selectionchange 捕获选文；工具条固定底部，按钮可触摸；输入框换行。笔记本支持窄屏追问。沉浸页根据 VisualViewport 调整，兼容软键盘缩小后的可见区域。
- 手机筛掉 CLI 模型候选，保留已有 CLI 配置与分配，明确提示重新选择 API；不自动换模型。

## 环境与方法

独立 Obsidian 1.14.4 实例，临时用户配置 `/private/tmp/banana-reader-mobile-profile` 与纯合成库 `/private/tmp/banana-reader-mobile-qa`。使用[官方移动模拟模式](https://docs.obsidian.md/Plugins/Getting%20started/Mobile%20development)，通过 Playwright 连接独立实例的本地调试接口。Browser 插件未提供，采用现有 Playwright；未安装额外依赖。第一次模拟重载触发 Electron native Realm 析构断言，重启独立实例后进入移动模式并完成验收；未操作日常库。

检查流程：打开合成文稿 → 原生 Range / selectionchange 选区事件（未发送 mouseup）→ 选择荧光笔 → 笔记本 → 本地模拟 API 问答 → 同一对话追问 → 引用回跳 → 导出笔记。API 只处理本次合成文本，不使用真实账户与密钥。

| 检查 | 结果 |
| --- | --- |
| 页面身份 | `app://obsidian.md/index.html`；临时库 banana-reader-mobile-qa；移动模式与 gloss-mobile 均为 true |
| 非空与错误覆盖层 | 正文、工具栏、笔记本均渲染；无错误覆盖层 |
| 控制台 | 成功交互流程未捕获 pageerror；首次选文/标记流程无 console error |
| 交互 | 划线、问答、追问、引用回跳、导出、书架与设置均通过 |
| 数据重开 | 新 ID 迁移保留全部 3 份文档记录；后续选文新建问答与追问、导出通过 |
| EPUB | 合成 EPUB 章节及中文正文显示正常 |
| PDF | 原生 PDF 页面与文字层显示；390px 视口内页面宽 378px |
| 书籍来源 | 登录界面打开；未使用真实账号登录或下载 |
| 布局 | 320×568、390×844、768×1024，无页面横向溢出 |
| 键盘尺寸模拟 | 390×430 时根容器高 430px，提问框底部 420px，可见 |
| 自动检查 | 175 项测试通过；lint 0 errors、797 warnings；类型检查和构建通过；差异空白检查通过 |

新增 10 项移动测试覆盖四种协议、停止/超时、错误信息脱敏、模型发现/Embedding、Node 隔离、旧配置加载、SHA-256 兼容与索引替换/失败恢复。完整发行入口打包后在禁止 require 除 obsidian 外一切模块的沙箱中初始化成功。桌面 CLI 与流式 API 相关现有测试继续通过。手机模型独立分配、中断请求恢复、Z-Library 完整二进制响应与下载大小/Range 验证、桌面迁移的 14 项原有保护及手机版的 4 项只读验证均纳入完整回归。

## 截图证据

临时文件均为合成内容：

- `/private/tmp/reader-mobile-selection.png`：390px 选文与底部工具。
- `/private/tmp/reader-mobile-answer-phone.png`：390px 笔记本、两轮问答与追问框。
- `/private/tmp/reader-mobile-settings.png`：手机模型设置与 CLI 边界说明。
- `/private/tmp/reader-mobile-shelf.png`、`reader-mobile-epub.png`、`reader-mobile-pdf.png`：书架与格式预览。

## 待真机验收

iOS / Android 的系统长按手柄、软键盘、安全区、PDF 选文/缩放手势、SecretStorage、剪贴板权限、大文件内存和 Z-Library 真实登录下载尚未验证。桌面移动模拟和禁 Node 测试不能替代真机。未发布 GitHub / 社区目录；未改动用户正式插件安装。

安装方法见 README.zh-CN.md「手机版（开发测试包）」。开发包仅包含 `banana-reader/main.js`、`manifest.json`、`styles.css`，不带 data.json、索引或凭据。保持旧数据，手机另配可访问的 API 地址与密钥。


## 新安装身份与最终复测

核对现役发布仓库 `TreyDong/banana-reader-plugin` 的 0.13.3 后，候选版沿用 `banana-reader`，修正本地旧 `gloss-reader` manifest、设置入口和导出协议。新旧协议同时注册。桌面移植发布版本的守卫迁移实现，仅调整为延迟原生依赖加载；首次迁移不覆盖目标，不改源数据。手机只验证桌面凭据（兼容 Windows 路径）和原始文件哈希，拒绝首次跨 ID 复制、旧版活动/未知状态、变化的旧记录及无效凭据。

独立库实际停用旧插件后完成桌面复制，再以移动模式启用新 ID：3 份文档记录逐项一致、仅新 ID 启用、没有 pageerror。手机问答模型的原生设置与连接测试通过；历史 CLI 回答保留原始模型信息，显式指定 API 后可继续追问，桌面默认分配未被改写。

完整流程发现并修复「PDF 切回已打开文章时，显示页与 Obsidian 活动页不一致」：`revealLeaf` 后通过公开的 `setActiveLeaf` 激活阅读页。修复前 `/private/tmp/reader-active-leaf-qa.cjs` 稳定失败（显示文章、活动页 PDF），修复后两者一致。编译入口回归同时模拟 revealLeaf 不改变活动页，要求 openFile 显式激活。随后再次通过 selectionchange → API 问答 → 追问 → 引用收起笔记本并回跳 → 新笔记导出，导出正文及 banana-reader 链接均核对。合成 SecretStorage 值经插件重载可读，阅读数据不含该值，测试后清除。

最终自动检查：175/175 测试通过；本地官方 lint 0 errors、797 warnings（未隐藏警告，无 Node 模块导入警告）；类型检查、构建、差异空白检查通过。尚未推送候选审核分支、执行线上目录 Review branch 扫描或发布 Release；这些结果与本地检查分开记载。

产物：`dist/banana-reader-0.14.0-mobile-candidate.zip`。只包含 banana-reader 目录下三个安装文件，清单和逐文件 SHA-256 见同目录 `banana-reader-0.14.0-mobile-candidate.sha256`。候选版验收清单见 `docs/mobile-candidate.md`，无需预装 BRAT。两端实机项目仍待完成，正式手机版目标尚未达成。


## 后续修复：多行输入、键盘可见性与 PDF 失败恢复

上一轮为实质进展：发现并修正手机版追问框仍为单行、Enter 直接发送，以及主提问框高度固定一行的问题。手机新问题和追问改为多行、Enter 换行、按钮发送，按内容自动增高，并按可见视口限制高度。独立 Obsidian 移动模式验证 Enter 不发送、按钮提交保留换行、追问草稿重开不丢。390×430 键盘尺寸下主输入高 86px，发送按钮可见；追问表单修复前位于 y=724、被遮挡，修复后 y=325、高 98，完整处于可见区。证据脚本为 `/private/tmp/reader-mobile-multiline-qa.cjs`、`reader-mobile-input-layout-qa.cjs`，截图 `reader-mobile-multiline-keyboard.png`。Browser plugin not available，沿用现有 Playwright。

另复现原生 PDF 挂载失败只剩半套工具栏、没有重试入口。现已将正文渲染异常纳入统一失败页，提供重试与选择其他文档，并清除失效 composer 引用，避免把前一篇文档草稿写入失败文件。PDF 原生视图挂载等待结束后检查取消信号与目标 article，防止过期任务移动到新文章。新增 `tests/mobile-lifecycle.test.ts` 两项编译插件回归，覆盖真实 loader 的异常捕获、重试按钮、阅读记录和草稿不串写，以及取消/替代任务在移动原生容器前退出。

最新证据：本地定向 80/80 通过（包含上述两项、禁 Node、迁移、格式、本地化、笔记、书架和书籍来源）；lint 0 errors、796 warnings；类型检查、构建、差异空白检查通过。前一轮 175 项全量回归通过只代表当时源码，不冒称最新 177 项已全量跑过。原生 PDF 失败页和快速切换的后续独立 Obsidian 界面复测尚未执行：自动审批服务返回用量限制，明确表示审批未完成，操作未执行，并非安全性判定。未改用其他路径绕过审批。

保留上一份已完成模拟验收的 `banana-reader-0.14.0-mobile-candidate.zip`（SHA-256 `c977dd38d037c36750d28d7bce0e8fd28925944c4598c783930f337c135d2e4d`）。最新源码另打包为 `banana-reader-0.14.0-mobile-candidate.2.zip`，标记「待界面复测」；不能将旧包的验证直接归给新包。用户已明确无需继续追问同步方式。两端最新 Obsidian，均未装 BRAT；真实 iOS/Android 验收仍缺，正式版目标保持未完成。


## 恢复验证后的最新状态

目标恢复后，先读取当前用量状态，确认 ordinaryUsageAllowed 为 true，再通过正常自动审批重新执行原本未执行的界面检查；没有消耗重置卡或绕过审批。独立实例仍为合成库 `banana-reader-mobile-qa`、Obsidian 1.14.4、移动模式 true。重载最新三个安装文件后：

- `/private/tmp/reader-pdf-failure-qa.cjs`：原生 PDF 挂载异常由真实 loader 捕获，显示错误、重试和选择其他文档，保留记录。
- `/private/tmp/reader-pdf-retry-switch-qa.cjs`：点击实际「重试」按钮恢复原生 PDF、沉浸模式和完全相同的阅读数据；延迟原生 PDF 加载后切换文章，过期任务没有创建 PDF 实例或把原生容器挂进新文章；无 pageerror。
- `/private/tmp/reader-mobile-acceptance-newid.cjs`：selectionchange → 原生 requestUrl 问答 → 追问 → 引用回跳 → 新协议笔记导出再次通过；合成密钥经插件重载可读，未出现在阅读数据中，随后清除。
- `/private/tmp/reader-mobile-input-layout-qa.cjs`、`reader-mobile-multiline-qa.cjs`：390×430 键盘尺寸下主输入 86px，追问表单 y≈325、高 98px，发送按钮可见；Enter 换行、不发送，按钮提交保留换行，笔记本重开保留草稿。

最新完整回归 177/177 通过，lint 0 errors、796 warnings，无 Node 模块导入警告；差异空白检查通过。候选包 2 的三个文件与当前构建、实际安装到测试库的三个文件逐字节一致，压缩包 SHA-256 保持 `471feae85c1cc1aab0b7278f45b8eaf3fb290f51f1474a4fcc71a2427e812612`。原先「审批受限、待原生界面复测」的临时阻碍已解除，原记录保留为历史；当前剩余主要验收缺口是物理 iOS / Android 上的系统选区、键盘、WebView、PDF、密钥与下载表现。无 adb、Xcode 或可用移动测试会话，桌面移动模拟不能替代这些证据。正式版目标继续保持未完成。


## 2026-10-23：改用 BRAT 交付

用户指出手机测试应通过外部插件安装器交付，手动解压复制方案不合适。本次将手机候选包发布到现役 `TreyDong/banana-reader-plugin` 的 0.14.0 GitHub Pre-release，并将手机说明改为 BRAT 首选路径；旧的手工安装要求不再作为用户主流程。

源码快照基于现役主线 2a9c7b7749db412fb66e1ab3c7a6c4faca4133fa，提交 759fba57f3b246a8f263901f3fd489734d21f742，分支 `codex/mobile-brat-candidate`；保留原工作区、原暂存区和内部记录。源码包含此前已开发的书架与书籍来源，并补回线上已有的 3 项迁移/旧链接编译回归。完整 `npm run check` 通过，180/180 测试；运行时产物与候选包 2 完全相同。

发布地址：https://github.com/TreyDong/banana-reader-plugin/releases/tag/0.14.0 。回读确认 prerelease=true、draft=false，标签指向上述源码；稳定 Latest 仍是桌面版 0.13.3。发布附件仅三个文件；下载后 SHA-256 与本地一致：main.js dc2345f04498ea4ea76711f7fdb971780854f51e4e13e98cd21baa5b91282b5c，manifest.json 02fba09750a8262e9596cf5072154eb11662ee87250b90abf0dc4af88f7b698e，styles.css 7792852333edd3ed127ff600e5c0377bd7b9bf8dc4849a9d900dc892f75b1dff。

在同一独立合成库启用 BRAT 官方 2.2.0，保持 Obsidian 官方移动模式；通过 BRAT 原生安装界面预填仓库、选择 0.14.0（预发布），点击「添加插件」并勾选「安装后启用」。实际观察到 BRAT 写入 main.js、manifest.json、styles.css，固定版本列表记录 repo 与 0.14.0，Reader 运行版本为 0.14.0、isDesktopOnly=false。main.js 与 styles.css 对发布附件逐字节一致；BRAT 正常压缩了 manifest JSON 空白，解析后的全部字段一致。阅读 data.json 原始内容安装前后完全相同；安装后打开合成文章成功、无 pageerror。脚本 `/private/tmp/reader-brat-open-install.cjs`、`reader-brat-install-verify.cjs`，截图 `reader-brat-version-phone.png`、`reader-brat-installed-phone.png`。

用户现在只需安装 BRAT，添加 `TreyDong/banana-reader-plugin` 并明确选择 0.14.0（预发布），无需操作隐藏文件或填写 GitHub 令牌。此验证证明发布与 BRAT 安装交付链路；两端物理手机的使用验收仍待用户实测，不因此宣布正式手机版完成。
